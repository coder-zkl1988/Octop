"""Host absolute path helpers for workspace download / preview."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from octop.infra.gateway.media.backend_files import (
    HostPathDeniedError,
    check_workspace_host_path,
    file_url_to_abs_path,
    is_allowed_host_download_abs_path,
    is_host_absolute_path,
)


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("/Users/me/Desktop/a.pptx", True),
        ("/outbound/a.pptx", True),
        ("outbound/a.pptx", False),
        ("file:///tmp/x", True),
        (r"C:\Users\me\a.pptx", True),
        ("", False),
    ],
)
def test_is_host_absolute_path(path: str, expected: bool) -> None:
    assert is_host_absolute_path(path) is expected


def test_allowed_host_download_under_workspace(tmp_path: Path) -> None:
    ws = tmp_path / "workspace"
    target = ws / "outbound" / "a.pptx"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"x")
    assert is_allowed_host_download_abs_path(str(target), workspace=ws) is True


def test_allowed_host_download_desktop_style(tmp_path: Path) -> None:
    desktop = tmp_path / "Desktop" / "deck.pptx"
    desktop.parent.mkdir(parents=True)
    desktop.write_bytes(b"PK")
    # Outside workspace but not a system root — tool send_file paths.
    assert is_allowed_host_download_abs_path(str(desktop), workspace=tmp_path / "ws") is True


def test_denied_host_download_etc(tmp_path: Path) -> None:
    assert is_allowed_host_download_abs_path("/etc/passwd", workspace=tmp_path) is False


def test_denied_harness_browser(tmp_path: Path) -> None:
    path = tmp_path / ".harness-browser" / "screenshots" / "x.png"
    path.parent.mkdir(parents=True)
    path.write_bytes(b"x")
    assert is_allowed_host_download_abs_path(str(path), workspace=tmp_path) is False


def test_denied_octop_browser(tmp_path: Path) -> None:
    path = tmp_path / ".octop-browser" / "screenshots" / "x.png"
    path.parent.mkdir(parents=True)
    path.write_bytes(b"x")
    assert is_allowed_host_download_abs_path(str(path), workspace=tmp_path) is False


def test_file_url_windows_drive_decodes_unicode() -> None:
    """file:///C:/… must unquote and match native Path form (Windows CI)."""
    url = "file:///C:/Users/me/out/%E4%BF%9D%E6%8A%A4.pptx"
    assert file_url_to_abs_path(url) == str(Path("C:/Users/me/out/保护.pptx"))


posix_only = pytest.mark.skipif(os.name != "posix", reason="POSIX paths / symlinks")


def _layout(tmp_path: Path) -> tuple[Path, Path]:
    home = tmp_path / ".octop"
    workspace = home / "agents" / "A1" / "workspace"
    workspace.mkdir(parents=True)
    (home / "octop.db").write_bytes(b"db")
    (home / "config.json").write_text("{}")
    return home, workspace


def test_workspace_host_path_allows_workspace_and_user_files(tmp_path: Path) -> None:
    home, ws = _layout(tmp_path)
    inside = ws / "outbound" / "a.pptx"
    desktop = tmp_path / "Desktop" / "deck.pptx"
    desktop.parent.mkdir()
    desktop.write_bytes(b"PK")
    assert check_workspace_host_path(str(inside), workspace=ws, octop_home=home) == str(inside)
    assert check_workspace_host_path(str(desktop), workspace=ws, octop_home=home) == str(desktop)


@pytest.mark.parametrize("name", ["octop.db", "config.json", "logs/octop.log", "backups/x.tar"])
def test_workspace_host_path_denies_octop_home(tmp_path: Path, name: str) -> None:
    home, ws = _layout(tmp_path)
    with pytest.raises(HostPathDeniedError):
        check_workspace_host_path(str(home / name), workspace=ws, octop_home=home)


def test_workspace_host_path_denies_traversal_out_of_workspace(tmp_path: Path) -> None:
    home, ws = _layout(tmp_path)
    sneaky = os.path.join(str(ws), "..", "..", "..", "octop.db")
    with pytest.raises(HostPathDeniedError):
        check_workspace_host_path(sneaky, workspace=ws, octop_home=home)


def test_workspace_host_path_other_agent_needs_access(tmp_path: Path) -> None:
    home, ws = _layout(tmp_path)
    other = home / "agents" / "B2" / "workspace" / "report.md"
    other.parent.mkdir(parents=True)
    other.write_text("x")
    with pytest.raises(HostPathDeniedError):
        check_workspace_host_path(str(other), workspace=ws, octop_home=home)
    with pytest.raises(HostPathDeniedError):
        check_workspace_host_path(
            str(other), workspace=ws, octop_home=home, may_access_agent=lambda _id: False
        )
    allowed = check_workspace_host_path(
        str(other), workspace=ws, octop_home=home, may_access_agent=lambda aid: aid == "B2"
    )
    assert allowed == str(other)


def test_workspace_host_path_expands_home_relative(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    home, ws = _layout(tmp_path)
    with pytest.raises(HostPathDeniedError):
        check_workspace_host_path("~/.octop/octop.db", workspace=ws, octop_home=home)
    notes = check_workspace_host_path("~/notes.txt", workspace=ws, octop_home=home)
    assert Path(notes) == tmp_path / "notes.txt"


def test_workspace_host_path_protected_file_and_jail(tmp_path: Path) -> None:
    home, ws = _layout(tmp_path)
    external_db = tmp_path / "data" / "octop.db"
    external_db.parent.mkdir()
    external_db.write_bytes(b"db")
    with pytest.raises(HostPathDeniedError):
        check_workspace_host_path(
            str(external_db), workspace=ws, octop_home=home, protected_files=(external_db,)
        )
    jail = tmp_path / "jail"
    (jail / "ok.txt").parent.mkdir()
    (jail / "ok.txt").write_text("x")
    assert check_workspace_host_path(
        str(jail / "ok.txt"), workspace=ws, octop_home=home, jail_root=str(jail)
    ) == str(jail / "ok.txt")
    with pytest.raises(HostPathDeniedError):
        check_workspace_host_path(
            str(tmp_path / "Desktop" / "x"), workspace=ws, octop_home=home, jail_root=str(jail)
        )
    # The agent's own workspace stays reachable for a jailed owner.
    assert check_workspace_host_path(
        str(ws / "a.txt"), workspace=ws, octop_home=home, jail_root=str(jail)
    ) == str(ws / "a.txt")


@posix_only
def test_workspace_host_path_follows_symlinks_into_home(tmp_path: Path) -> None:
    home, ws = _layout(tmp_path)
    link = tmp_path / "innocent"
    link.symlink_to(home)
    with pytest.raises(HostPathDeniedError):
        check_workspace_host_path(str(link / "octop.db"), workspace=ws, octop_home=home)


@posix_only
def test_workspace_host_path_denies_system_roots(tmp_path: Path) -> None:
    home, ws = _layout(tmp_path)
    with pytest.raises(HostPathDeniedError):
        check_workspace_host_path("/etc/passwd", workspace=ws, octop_home=home)


def test_download_allowlist_no_longer_trusts_any_octop_agents_dir(tmp_path: Path) -> None:
    """The system denylist alone still allows ordinary paths; the home guard is separate."""
    target = tmp_path / ".octop" / "agents" / "X" / "f.txt"
    target.parent.mkdir(parents=True)
    target.write_text("x")
    assert is_allowed_host_download_abs_path(str(target), workspace=tmp_path / "ws") is True

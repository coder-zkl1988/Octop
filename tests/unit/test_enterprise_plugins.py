from __future__ import annotations

import asyncio
import hashlib
from pathlib import Path
from typing import Any

import pytest

from octop.infra import enterprise_plugins as ep


class Settings:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self.data.get(key)

    def set(self, key: str, value: str) -> None:
        self.data[key] = value


class Manager:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = {r["id"]: dict(r) for r in rows}
        self.archives: list[bytes] = []

    def list_installed(self) -> list[dict[str, Any]]:
        return [dict(r) for r in self.rows.values()]

    def set_enabled(self, plugin_id: str, enabled: bool) -> dict[str, Any]:
        self.rows[plugin_id]["enabled"] = enabled
        return self.rows[plugin_id]

    def install_archive(
        self, path: Path, *, force: bool = False, expect_id: str | None = None
    ) -> None:
        self.archives.append(path.read_bytes())
        self.rows[str(expect_id)] = {"id": expect_id, "version": "2.0.0", "enabled": True}


PACKAGE = b"PK-demo-package"
DIGEST = hashlib.sha256(PACKAGE).hexdigest()


def run_sync(mgr: Manager, settings: Settings, view: dict[str, Any], package: bytes = PACKAGE):
    reports: list[dict[str, Any]] = []

    async def fetch_json(method: str, path: str, body: dict[str, Any] | None) -> dict[str, Any]:
        if method == "POST":
            reports.append(body or {})
            return {"ok": True}
        return view

    async def fetch_bytes(path: str) -> tuple[bytes, dict[str, str]]:
        return package, {}

    changed = asyncio.run(
        ep.sync(
            mgr,
            settings,
            fetch_json=fetch_json,
            fetch_bytes=fetch_bytes,
            bundled={"xhs-ops"},
            device_id="dev1",
        )
    )
    return changed, reports


def item(plugin_id: str, **extra: Any) -> dict[str, Any]:
    return {
        "id": plugin_id,
        "version": "2.0.0",
        "sha256": DIGEST,
        "install_mode": "self",
        "auto_update": True,
        **extra,
    }


def test_an_empty_list_changes_nothing() -> None:
    mgr = Manager([{"id": "local-tool", "version": "1", "enabled": True}])
    settings = Settings()
    changed, reports = run_sync(mgr, settings, {"enforced": False, "items": []})
    assert changed == {
        "installed": [],
        "enabled": [],
        "stopped": [],
        "failed": [],
        "tools": [],
        "enforced": False,
    }
    assert mgr.rows["local-tool"]["enabled"] is True
    assert reports[0] == {
        "device_id": "dev1",
        "plugins": [{"id": "local-tool", "version": "1", "enabled": True}],
    }
    policy = ep.load_policy(settings)
    assert ep.install_blocked_reason(policy, None) is None
    assert ep.install_blocked_reason(policy, "anything") is None


def test_pushed_plugins_install_and_others_stop_then_come_back() -> None:
    mgr = Manager(
        [
            {"id": "xhs-ops", "version": "1", "enabled": True},
            {"id": "local-tool", "version": "1", "enabled": True},
        ]
    )
    settings = Settings()
    view = {
        "enforced": True,
        "items": [item("db-query", required=True, start="enable"), item("pdf-tools")],
    }
    changed, reports = run_sync(mgr, settings, view)
    assert changed["installed"] == ["db-query"] and changed["stopped"] == ["local-tool"]
    assert mgr.archives == [PACKAGE]
    assert mgr.rows["xhs-ops"]["enabled"] is True  # bundled plugins are left alone
    assert mgr.rows["local-tool"]["enabled"] is False
    assert [p["id"] for p in reports[0]["plugins"]] == ["xhs-ops", "db-query"]

    policy = ep.load_policy(settings)
    assert "清单" in (ep.install_blocked_reason(policy, "other") or "")
    assert ep.install_blocked_reason(policy, None) is not None
    assert ep.install_blocked_reason(policy, "pdf-tools") is None
    assert ep.removal_blocked_reason(policy, "db-query") is not None
    assert ep.removal_blocked_reason(policy, "pdf-tools") is None
    assert ep.enable_blocked_reason(policy, "local-tool", {"xhs-ops"}) is not None
    assert ep.enable_blocked_reason(policy, "xhs-ops", {"xhs-ops"}) is None

    # A second pass installs nothing again.
    changed, _ = run_sync(mgr, settings, view)
    assert changed["installed"] == [] and changed["stopped"] == [] and len(mgr.archives) == 1
    # Once the admin allows the stopped plugin, it is switched back on.
    changed, _ = run_sync(
        mgr, settings, {"enforced": True, "items": [*view["items"], item("local-tool")]}
    )
    assert changed["enabled"] == ["local-tool"] and mgr.rows["local-tool"]["enabled"] is True
    assert ep.load_policy(settings)["stopped"] == []


def test_install_only_push_stays_off_and_a_wrong_digest_is_refused() -> None:
    mgr = Manager([])
    settings = Settings()
    changed, _ = run_sync(
        mgr,
        settings,
        {"enforced": True, "items": [item("db-query", required=True, start="install")]},
    )
    assert changed["installed"] == ["db-query"] and mgr.rows["db-query"]["enabled"] is False

    mgr = Manager([])
    changed, _ = run_sync(
        mgr,
        Settings(),
        {"enforced": True, "items": [item("db-query", required=True, start="enable")]},
        package=b"tampered",
    )
    assert changed["failed"] == ["db-query"] and mgr.archives == [] and "db-query" not in mgr.rows


def test_install_package_needs_a_digest() -> None:
    async def fetch_bytes(path: str) -> tuple[bytes, dict[str, str]]:
        return PACKAGE, {}

    with pytest.raises(ValueError, match="digest"):
        asyncio.run(ep.install_package(Manager([]), fetch_bytes, {"id": "x", "sha256": ""}))


def test_admin_only_plugins_need_a_push_and_denied_tools_are_collected() -> None:
    mgr = Manager([{"id": "db-query", "version": "2.0.0", "enabled": True}])
    settings = Settings()
    view = {
        "enforced": True,
        "items": [
            item("db-query", install_mode="admin", installable=False, required=False),
            item("pdf-tools", tools=["pdf_merge", "pdf_split"], tools_denied=["pdf_split"]),
        ],
    }
    changed, _ = run_sync(mgr, settings, view)
    # Installed by hand before the admin made it admin-only: it is stopped until pushed.
    assert changed["stopped"] == ["db-query"] and changed["tools"] == ["pdf_split"]
    policy = ep.load_policy(settings)
    assert ep.install_blocked_reason(policy, "db-query") is not None
    assert ep.denied_tools(settings) == {"pdf_split"}
    changed, _ = run_sync(mgr, settings, view)
    assert changed["tools"] == []
    pushed = {
        "enforced": True,
        "items": [
            item("db-query", install_mode="admin", installable=True, required=True, start="enable")
        ],
    }
    changed, _ = run_sync(mgr, settings, pushed)
    assert changed["enabled"] == ["db-query"] and changed["tools"] == ["pdf_split"]
    assert ep.denied_tools(settings) == set()

"""stdio custom MCP servers need the terminal permission (save, probe, and spawn)."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

from octop.config import OctopConfig
from octop.infra.connectors.custom_mcp import changed_stdio_servers, is_stdio_spec
from octop.infra.connectors.service import ConnectorService
from octop.infra.users.permissions import stored_user_has_permission

_STDIO = {"transport": "stdio", "command": "npx", "args": ["-y", "pkg"], "env": {"A": "1"}}
_HTTP = {"transport": "streamable_http", "url": "https://mcp.example.com/mcp"}


def test_is_stdio_spec() -> None:
    assert is_stdio_spec(_STDIO)
    assert not is_stdio_spec(_HTTP)
    assert not is_stdio_spec(None)


def test_changed_stdio_servers_lists_new_and_edited_launches() -> None:
    existing = {"keep": dict(_STDIO), "web": dict(_HTTP)}
    new = {
        "keep": dict(_STDIO, enabled=False),  # only meta changed
        "web": dict(_HTTP),
        "added": dict(_STDIO),
        "args_changed": dict(_STDIO),
    }
    existing["args_changed"] = dict(_STDIO, args=["other"])
    assert sorted(changed_stdio_servers(new, existing)) == ["added", "args_changed"]


def test_changed_stdio_servers_catches_env_and_command_edits() -> None:
    existing = {"s": dict(_STDIO)}
    assert changed_stdio_servers({"s": dict(_STDIO, env={"NODE_OPTIONS": "-r x"})}, existing)
    assert changed_stdio_servers({"s": dict(_STDIO, command="sh")}, existing)
    assert changed_stdio_servers({"s": dict(_STDIO, transport="stdio")}, existing) == []


def test_stored_user_has_permission() -> None:
    assert stored_user_has_permission("admin", [], "terminal")
    assert stored_user_has_permission("user", ["terminal"], "terminal")
    assert not stored_user_has_permission("user", ["connector_custom"], "terminal")


def _service(users: dict[int, Any]) -> ConnectorService:
    repo = MagicMock()
    repo.connector_feature_allows.return_value = True
    repo.list_by_kind.return_value = []
    user_repo = SimpleNamespace(get=users.get)
    svc = ConnectorService(
        repo=repo,
        secret_repo=MagicMock(),
        settings_repo=MagicMock(),
        config=OctopConfig(),
        user_repo=user_repo,
    )
    svc.get_custom_servers = lambda _uid: {"local": dict(_STDIO), "web": dict(_HTTP)}  # type: ignore[method-assign]
    return svc


def _row(role: str, permissions: list[str], disabled: int = 0) -> Any:
    return SimpleNamespace(role=role, permissions=permissions, disabled=disabled)


def test_custom_harness_configs_skips_stdio_without_terminal() -> None:
    svc = _service({7: _row("user", ["connector_custom"])})
    configs = svc.custom_harness_configs(7)
    assert "web" in configs
    assert "local" not in configs


def test_custom_harness_configs_keeps_stdio_for_terminal_holder() -> None:
    svc = _service({7: _row("user", ["connector_custom", "terminal"])})
    assert "local" in svc.custom_harness_configs(7)


def test_custom_harness_configs_skips_stdio_of_disabled_owner() -> None:
    svc = _service({7: _row("admin", [], disabled=1)})
    assert "local" not in svc.custom_harness_configs(7)

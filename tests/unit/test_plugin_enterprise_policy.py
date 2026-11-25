"""The plugin context passes the authority's operating policy through and only reaches its own endpoints."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from octop.infra.plugin_apps import host as host_module
from octop.infra.plugin_apps.contracts import PluginAppError, PluginLicense
from octop.infra.plugin_apps.host import AppContext

GRANT = {
    "plugin_id": "xhs-ops",
    "tenant_id": "t1",
    "member_id": "m1",
    "status": "active",
    "version": 3,
    "features": ["xhs.content"],
    "policy": {"rules": {"paused": True}, "usage": {"tenant": {"posts": 1}}},
}


def context(backend: str = "https://cp.example") -> AppContext:
    license = PluginLicense.model_validate(GRANT)
    server = SimpleNamespace(
        services=SimpleNamespace(config=SimpleNamespace(enterprise_backend_url=backend))
    )

    async def fresh(_plugin: str, _user: int) -> PluginLicense:
        return PluginLicense.model_validate(GRANT)

    host = SimpleNamespace(server=server, license=fresh, definition=lambda *_a, **_k: {})
    return AppContext(host, "xhs-ops", 1, license)  # type: ignore[arg-type]


def test_license_keeps_the_policy() -> None:
    assert PluginLicense.model_validate(GRANT).policy["rules"]["paused"] is True
    assert PluginLicense.model_validate({**GRANT, "policy": None} | {"policy": {}}).policy == {}


@pytest.mark.asyncio
async def test_enterprise_calls_are_limited_to_the_plugin_endpoints(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, str, Any]] = []

    async def fake_request(
        _server: Any, _user: int, method: str, path: str, *, body: Any = None
    ) -> dict[str, Any]:
        calls.append((method, path, body))
        return {"usage": {"tenant": {"posts": 2}}}

    monkeypatch.setattr(host_module, "enterprise_request", fake_request)
    ctx = context()
    with pytest.raises(PluginAppError, match="enterprise_path_not_allowed"):
        await ctx.enterprise("GET", "../policy")
    with pytest.raises(PluginAppError, match="enterprise_path_not_allowed"):
        await ctx.enterprise("DELETE", "requests")
    await ctx.report_usage("posts", 1, "content:abcdefgh")
    assert calls == [
        (
            "POST",
            "/desktop/v1/plugins/xhs-ops/usage",
            {"kind": "posts", "count": 1, "idempotency_key": "content:abcdefgh"},
        )
    ]
    assert ctx.license.policy["usage"]["tenant"]["posts"] == 2


@pytest.mark.asyncio
async def test_usage_is_not_counted_without_an_enterprise_backend(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fail(*_a: Any, **_k: Any) -> dict[str, Any]:
        raise AssertionError("no enterprise call expected")

    monkeypatch.setattr(host_module, "enterprise_request", fail)
    await context(backend="").report_usage("images", 1, "image:abcdefgh")

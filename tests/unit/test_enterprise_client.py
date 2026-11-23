from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from octop.infra.enterprise_client import request
from octop.infra.errors import ErrorCode, OctopError


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "code,status",
    [("quota_exceeded", 429), ("gateway_authentication_failed", 502), ("sk-upstream-secret", 502)],
)
async def test_enterprise_transport_keeps_only_safe_failure_reasons(
    monkeypatch: Any, code: str, status: int
) -> None:
    server = SimpleNamespace(
        services=SimpleNamespace(
            config=SimpleNamespace(enterprise_backend_url="http://enterprise.test")
        ),
        _enterprise_auth_sessions={1: {"cookies": "tb_sess=session; tb_csrf=csrf"}},
    )
    original = httpx.AsyncClient

    def handler(incoming: httpx.Request) -> httpx.Response:
        assert incoming.headers["X-CSRF-Token"] == "csrf"
        assert incoming.headers["Cookie"].startswith("tb_sess=")
        return httpx.Response(
            status, json={"error": {"code": code, "message": "private upstream content"}}
        )

    monkeypatch.setattr(
        "octop.infra.enterprise_client.httpx.AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs),
    )
    with pytest.raises(OctopError) as exc:
        await request(server, 1, "POST", "/desktop/v1/models/text", body={"prompt": "p"})
    assert exc.value.status == status
    assert exc.value.details == ({} if code.startswith("sk-") else {"reason": code})
    assert "private upstream" not in str(exc.value)
    assert "sk-upstream-secret" not in str(exc.value)
    assert 1 in server._enterprise_auth_sessions


@pytest.mark.asyncio
async def test_actual_control_plane_session_expiry_clears_only_its_local_session(
    monkeypatch: Any,
) -> None:
    server = SimpleNamespace(
        services=SimpleNamespace(
            config=SimpleNamespace(enterprise_backend_url="http://enterprise.test")
        ),
        _enterprise_auth_sessions={
            1: {"cookies": "tb_sess=expired"},
            2: {"cookies": "tb_sess=other"},
        },
    )
    original = httpx.AsyncClient
    monkeypatch.setattr(
        "octop.infra.enterprise_client.httpx.AsyncClient",
        lambda **kwargs: original(
            transport=httpx.MockTransport(lambda _request: httpx.Response(401, json={})), **kwargs
        ),
    )
    with pytest.raises(OctopError) as exc:
        await request(server, 1, "GET", "/desktop/v1/me")
    assert exc.value.code == ErrorCode.TOKEN_EXPIRED
    assert 1 not in server._enterprise_auth_sessions
    assert 2 in server._enterprise_auth_sessions


@pytest.mark.parametrize("replace_entry", [True, False])
async def test_stale_expiry_response_does_not_remove_a_newly_authenticated_session(
    monkeypatch: Any, replace_entry: bool
) -> None:
    server = SimpleNamespace(
        services=SimpleNamespace(
            config=SimpleNamespace(enterprise_backend_url="http://enterprise.test")
        ),
        _enterprise_auth_sessions={1: {"cookies": "tb_sess=old"}},
    )
    original = httpx.AsyncClient

    def handler(incoming: httpx.Request) -> httpx.Response:
        if incoming.headers["Cookie"] == "tb_sess=new":
            return httpx.Response(200, json={"session": "new"})
        if replace_entry:
            server._enterprise_auth_sessions[1] = {"cookies": "tb_sess=new"}
        else:
            server._enterprise_auth_sessions[1]["cookies"] = "tb_sess=new"
        return httpx.Response(401, json={})

    monkeypatch.setattr(
        "octop.infra.enterprise_client.httpx.AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs),
    )
    with pytest.raises(OctopError) as exc:
        await request(server, 1, "GET", "/desktop/v1/me")
    assert exc.value.code == ErrorCode.FORBIDDEN
    assert exc.value.status == 409
    assert exc.value.details == {"reason": "enterprise_session_changed"}
    assert server._enterprise_auth_sessions[1]["cookies"] == "tb_sess=new"
    assert await request(server, 1, "GET", "/desktop/v1/me") == {"session": "new"}

"""Enterprise-only auth routes and invited account registration."""

import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from tests.support.app import octop_client


async def test_enterprise_login_surface_without_local_users(
    tmp_octop_home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("OCTOP_ENTERPRISE_URL", "https://enterprise.test")
    invitation = "tn_test.test-code"
    signup = {
        "invitation_token": invitation,
        "name": "New Hire",
        "password": "test-signup-password",
    }

    def upstream(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "enterprise.test"
        if request.method == "GET":
            assert request.url.path == f"/auth/v1/invite/{invitation}"
            return httpx.Response(
                200,
                json={"email": "hire@example.test", "tenant": {"name": "Example Inc"}},
            )
        assert request.method == "POST"
        assert request.url.path == "/auth/v1/register"
        if json.loads(request.content)["invitation_token"] != invitation:
            return httpx.Response(400, json={"error": {"code": "invalid_invite"}})
        assert json.loads(request.content) == signup
        return httpx.Response(201, json={"status": "active", "member_id": "member-1"})

    async_client = httpx.AsyncClient

    def upstream_client(**kwargs: Any) -> httpx.AsyncClient:
        return async_client(transport=httpx.MockTransport(upstream), **kwargs)

    async with octop_client(tmp_octop_home) as (client, server):
        monkeypatch.setattr("octop.api.routers.auth.httpx.AsyncClient", upstream_client)
        status = (await client.get("/api/setup/status")).json()
        assert status["enterprise_mode"] is True
        assert status["setup_required"] is False
        assert server.user_manager is not None
        assert server.user_manager.count() == 0

        for method, path in [
            ("POST", "/api/auth/login"),
            ("GET", "/api/auth/captcha"),
            ("POST", "/api/auth/device/token"),
            ("POST", "/api/auth/passkey/login/verify"),
            ("POST", "/api/auth/oauth/exchange"),
            ("POST", "/api/auth/invite/redeem"),
            ("POST", "/api/setup/initial-admin"),
        ]:
            response = await client.request(method, path)
            assert response.status_code == 404, path

        details = await client.post(
            "/api/auth/enterprise/register/validate", json={"invitation_token": invitation}
        )
        assert details.status_code == 200
        assert details.json() == {"email": "hire@example.test", "tenant_name": "Example Inc"}

        invalid = await client.post(
            "/api/auth/enterprise/register", json={**signup, "invitation_token": "other"}
        )
        assert invalid.status_code == 400
        assert invalid.json()["error"]["code"] == "INVITE_INVALID"

        registered = await client.post("/api/auth/enterprise/register", json=signup)
        assert registered.status_code == 201
        assert registered.json() == {"status": "active", "member_id": "member-1"}
        assert server.user_manager.count() == 0

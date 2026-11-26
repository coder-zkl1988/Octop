from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from octop.infra.users.permissions import BASELINE_PERMISSIONS
from tests.support.auth import TEST_PASSWORD, auth_header, create_user

pytestmark = pytest.mark.integration


def _enterprise_transport(*, email: str, phone_policy: dict[str, str]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "enterprise.invalid"

        if request.method == "POST" and request.url.path == "/auth/v1/login":
            assert json.loads(request.content) == {
                "email": email,
                "password": TEST_PASSWORD,
            }
            return httpx.Response(
                200,
                json={"mfa_ticket": "upstream-mfa-ticket"},
                headers={"set-cookie": "tb_login=pending; Path=/"},
            )

        if request.method == "POST" and request.url.path == "/auth/v1/mfa":
            assert json.loads(request.content) == {
                "mfa_ticket": "upstream-mfa-ticket",
                "code": "123456",
            }
            return httpx.Response(
                200,
                json={"principal_type": "member"},
                headers=[
                    ("set-cookie", "tb_sess=enterprise-session; Path=/"),
                    ("set-cookie", "tb_csrf=csrf-token; Path=/"),
                ],
            )

        if request.method == "GET" and request.url.path == "/auth/v1/session":
            return httpx.Response(
                200,
                json={
                    "principal": {
                        "email": email,
                        "principal_type": "member",
                    }
                },
            )

        if request.method == "GET" and request.url.path == "/desktop/v1/policy":
            return httpx.Response(
                200,
                json={
                    "policy": {
                        "modules": {},
                        "caps": {"cap.phone.adb": phone_policy["mode"]},
                        "resources": {},
                    }
                },
            )

        if request.method == "GET" and request.url.path == "/desktop/v1/me":
            return httpx.Response(
                200,
                json={
                    "tenant": {"id": "tenant-1", "name": "Acme"},
                    "member": {
                        "id": "member-1",
                        "name": "Enterprise User",
                        "email": email,
                    },
                },
            )

        if request.method == "GET" and request.url.path == "/org/v1/resources":
            return httpx.Response(200, json={})

        if request.method == "POST" and request.url.path == "/desktop/v1/device/register":
            device = json.loads(request.content)
            assert device["device_id"] == request.headers["X-Device-Id"]
            assert device["public_key"] == request.headers["X-Device-Public-Key"]
            assert "private_key" not in device
            return httpx.Response(200, json={"device_id": device["device_id"]})

        if request.method == "GET" and request.url.path == "/desktop/v1/device/key":
            return httpx.Response(200, json={"device_id": request.headers["X-Device-Id"]})

        if request.method == "POST" and request.url.path == "/desktop/v1/heartbeat":
            return httpx.Response(200, json={})

        if request.method == "GET" and request.url.path == "/desktop/v1/usage":
            return httpx.Response(200, json={"totals": {}})

        if request.method == "GET" and request.url.path == "/org/v1/devices":
            return httpx.Response(200, json={"items": []})

        if request.method == "GET" and request.url.path == "/desktop/v1/plugins":
            return httpx.Response(200, json={"enforced": False, "items": []})

        if request.method == "POST" and request.url.path == "/desktop/v1/plugins/report":
            return httpx.Response(200, json={"ok": True})

        if request.method == "GET" and request.url.path == "/desktop/v1/sandbox":
            return httpx.Response(200, json={"enabled": False, "reason": "平台还没有开通云端沙箱"})

        if request.method == "GET" and request.url.path == "/desktop/v1/env":
            return httpx.Response(200, json={"items": []})

        raise AssertionError(f"unexpected enterprise request: {request.method} {request.url}")

    return httpx.MockTransport(handler)


def _mock_enterprise_http(monkeypatch: pytest.MonkeyPatch, transport: httpx.MockTransport) -> None:
    real_async_client = httpx.AsyncClient

    def client(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client)


@pytest.mark.asyncio
async def test_enterprise_phone_policy_controls_mobile_http_access(
    env, monkeypatch: pytest.MonkeyPatch
) -> None:
    client, server, admin_auth = env
    email = "enterprise-mobile@example.com"
    username = "enterprise-mobile"
    phone_policy = {"mode": "allow"}

    created = await client.post(
        "/api/users",
        headers=admin_auth,
        json={
            "username": username,
            "password": TEST_PASSWORD,
            "role": "user",
            "email": email,
            "permissions": sorted(BASELINE_PERMISSIONS),
        },
    )
    assert created.status_code == 201, created.text
    local_auth = await auth_header(client, username=username, password=TEST_PASSWORD)

    local_me = await client.get("/api/auth/me", headers=local_auth)
    assert local_me.status_code == 200
    assert "mobile" not in local_me.json()["permissions"]

    denied_before_sync = await client.get("/api/mobile/companion/devices", headers=local_auth)
    assert denied_before_sync.status_code == 403
    assert denied_before_sync.json()["error"]["code"] == "FORBIDDEN"

    object.__setattr__(
        server.services.config,
        "enterprise_backend_url",
        "http://enterprise.invalid",
    )
    transport = _enterprise_transport(email=email, phone_policy=phone_policy)
    _mock_enterprise_http(monkeypatch, transport)

    login = await client.post(
        "/api/auth/enterprise/login",
        json={"email": email, "password": TEST_PASSWORD},
    )
    assert login.status_code == 200, login.text

    mfa = await client.post(
        "/api/auth/enterprise/mfa",
        json={"mfa_ticket": login.json()["mfa_ticket"], "code": "123456"},
    )
    assert mfa.status_code == 200, mfa.text
    enterprise_auth = {"Authorization": f"Bearer {mfa.json()['access_token']}"}

    enterprise_me = await client.get("/api/auth/me", headers=enterprise_auth)
    assert enterprise_me.status_code == 200
    assert "mobile" in enterprise_me.json()["permissions"]

    allowed_after_login = await client.get("/api/mobile/companion/devices", headers=enterprise_auth)
    assert allowed_after_login.status_code == 200, allowed_after_login.text
    assert allowed_after_login.json() == {"devices": []}

    phone_policy["mode"] = "deny"
    snapshot = await client.get("/api/enterprise/snapshot", headers=enterprise_auth)
    assert snapshot.status_code == 200, snapshot.text

    revoked_me = await client.get("/api/auth/me", headers=enterprise_auth)
    assert revoked_me.status_code == 200
    assert "mobile" not in revoked_me.json()["permissions"]

    denied_after_snapshot = await client.get(
        "/api/mobile/companion/devices", headers=enterprise_auth
    )
    assert denied_after_snapshot.status_code == 403
    assert denied_after_snapshot.json()["error"]["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_enterprise_session_401_is_distinct_from_mobile_permission_403(env) -> None:
    client, _, admin_auth = env
    user_auth = await create_user(client, admin_auth, username="mobile-no-enterprise")

    missing_enterprise_session = await client.get("/api/enterprise/snapshot", headers=user_auth)
    assert missing_enterprise_session.status_code == 401
    assert missing_enterprise_session.json()["error"]["code"] == "TOKEN_EXPIRED"

    missing_mobile_permission = await client.get("/api/mobile/companion/devices", headers=user_auth)
    assert missing_mobile_permission.status_code == 403
    assert missing_mobile_permission.json()["error"]["code"] == "FORBIDDEN"

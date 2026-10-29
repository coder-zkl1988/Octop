"""iTabby LAN pairing end to end: phone request, dashboard approval, phone WebSocket."""

from __future__ import annotations

import dataclasses
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from octop.infra.control.mobile.companion.lan_pairing import PER_SOURCE_LIMIT
from octop.infra.server import OctopServer
from tests.support.auth import create_user
from tests.support.companion import auth_frame
from tests.support.http import ASGIWebSocketSession

pytestmark = pytest.mark.slow

Env = tuple[httpx.AsyncClient, OctopServer, dict[str, str]]

PAIR = "/api/mobile/companion/pair/requests"
DASH = "/api/mobile/companion/pair-requests"
PHONE = {"deviceId": "24094RAD4C-8a1f", "model": "24094RAD4C", "manufacturer": "Xiaomi"}


async def _request(
    client: httpx.AsyncClient, body: dict[str, str] | None = None
) -> dict[str, object]:
    r = await client.post(PAIR, json=body or PHONE)
    assert r.status_code == 201, r.text
    return dict(r.json())


async def test_approved_phone_gets_ws_url_and_connects(env: Env) -> None:
    client, _srv, auth = env
    created = await _request(client)
    assert set(created) == {"requestId", "code", "expiresInSec", "pollIntervalMs"}
    assert created["expiresInSec"] == 120 and created["pollIntervalMs"] == 1500
    code = str(created["code"])
    assert len(code) == 6 and code.isdigit()
    request_id = str(created["requestId"])

    status = await client.get(f"{PAIR}/{request_id}")
    assert status.status_code == 200 and status.json() == {"status": "pending"}

    listed = (await client.get(DASH, headers=auth)).json()["requests"]
    assert [(r["request_id"], r["code"], r["model"], r["manufacturer"]) for r in listed] == [
        (request_id, code, "24094RAD4C", "Xiaomi")
    ]

    r = await client.post(f"{DASH}/{request_id}/approve", headers=auth)
    assert r.status_code == 204, r.text
    assert (await client.get(DASH, headers=auth)).json()["requests"] == []
    again = await client.post(f"{DASH}/{request_id}/approve", headers=auth)
    assert again.status_code == 404

    approved = (await client.get(f"{PAIR}/{request_id}")).json()
    assert set(approved) == {"status", "wsUrl"} and approved["status"] == "approved"
    url = urlsplit(approved["wsUrl"])
    # Built from the local address the phone's request arrived on.
    assert (url.scheme, url.netloc, url.path) == ("ws", "testserver", "/api/mobile/companion/ws")
    token = parse_qs(url.query)["token"][0]

    app = client._octop_app  # type: ignore[attr-defined]
    intruder = ASGIWebSocketSession(app, f"/api/mobile/companion/ws?token={token}")
    await intruder.connect()
    await intruder.send_json(auth_frame("Other-1"))
    assert (await intruder.receive_json())["code"] == "AUTH_FAILED"
    await intruder.close()

    phone = ASGIWebSocketSession(app, f"/api/mobile/companion/ws?token={token}")
    await phone.connect()
    try:
        await phone.send_json(auth_frame(PHONE["deviceId"], model="24094RAD4C"))
        connected = await phone.receive_json()
        assert connected["type"] == "connected"
        devices = (await client.get("/api/mobile/companion/devices", headers=auth)).json()
        assert [d["device_id"] for d in devices["devices"]] == [PHONE["deviceId"]]
    finally:
        await phone.close()


async def test_reject_and_phone_cancel(env: Env) -> None:
    client, _srv, auth = env
    rejected_id = (await _request(client))["requestId"]
    r = await client.post(f"{DASH}/{rejected_id}/reject", headers=auth)
    assert r.status_code == 204
    assert (await client.get(f"{PAIR}/{rejected_id}")).json() == {"status": "rejected"}

    cancelled_id = (await _request(client, {**PHONE, "deviceId": "Pixel-2"}))["requestId"]
    assert (await client.delete(f"{PAIR}/{cancelled_id}")).status_code == 204
    gone = await client.get(f"{PAIR}/{cancelled_id}")
    assert gone.status_code == 404 and gone.json()["message"]
    assert (await client.get(DASH, headers=auth)).json()["requests"] == []
    assert (await client.post(f"{DASH}/{cancelled_id}/approve", headers=auth)).status_code == 404


async def test_rate_limit_returns_429_with_message(env: Env) -> None:
    client, _srv, _auth = env
    for i in range(PER_SOURCE_LIMIT):
        await _request(client, {**PHONE, "deviceId": f"dev-{i}"})
    r = await client.post(PAIR, json={**PHONE, "deviceId": "dev-over"})
    assert r.status_code == 429
    assert r.json() == {"message": "配对请求太频繁，请稍后再试。"}


async def test_disabled_or_loopback_only_returns_403(env: Env) -> None:
    client, srv, _auth = env
    app = client._octop_app  # type: ignore[attr-defined]
    # Octop listens on 127.0.0.1 (the default) and the phone reached loopback.
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://127.0.0.1:8088"
    ) as local:
        r = await local.post(PAIR, json=PHONE, headers={"Accept-Language": "en"})
    assert r.status_code == 403 and "OCTOP_BIND_HOST" in r.json()["message"]

    services = srv.services
    assert services is not None
    original = services.config
    # SharedServices is frozen; swap the config for this one request.
    object.__setattr__(services, "config", dataclasses.replace(original, enable_lan_pairing=False))
    try:
        r = await client.post(PAIR, json=PHONE)
    finally:
        object.__setattr__(services, "config", original)
    assert r.status_code == 403 and r.json() == {
        "message": "此 Octop 已关闭局域网配对，请在网页控制台扫码连接。"
    }


async def test_approval_needs_mobile_permission_and_assigns_the_approver(env: Env) -> None:
    client, _srv, auth = env
    request_id = (await _request(client))["requestId"]
    carol = await create_user(client, auth, username="carol")  # baseline: no "mobile"
    assert (await client.get(DASH, headers=carol)).status_code == 403
    assert (await client.post(f"{DASH}/{request_id}/approve", headers=carol)).status_code == 403
    assert (await client.get(DASH)).status_code == 401

    bob = await create_user(client, auth, username="bob", permissions=["mobile"])
    assert [r["request_id"] for r in (await client.get(DASH, headers=bob)).json()["requests"]] == [
        request_id
    ]
    assert (await client.post(f"{DASH}/{request_id}/approve", headers=bob)).status_code == 204
    token = parse_qs(urlsplit((await client.get(f"{PAIR}/{request_id}")).json()["wsUrl"]).query)[
        "token"
    ][0]

    app = client._octop_app  # type: ignore[attr-defined]
    phone = ASGIWebSocketSession(app, f"/api/mobile/companion/ws?token={token}")
    await phone.connect()
    try:
        await phone.send_json(auth_frame(PHONE["deviceId"]))
        assert (await phone.receive_json())["type"] == "connected"
        bobs = (await client.get("/api/mobile/companion/devices", headers=bob)).json()
        assert [d["device_id"] for d in bobs["devices"]] == [PHONE["deviceId"]]
    finally:
        await phone.close()


async def test_malformed_request_is_rejected(env: Env) -> None:
    client, _srv, _auth = env
    r = await client.post(PAIR, json={"model": "x"})
    assert r.status_code == 422

"""Companion phones end to end: QR pairing, phone WebSocket, agent tool, VLM proxy."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from langgraph.config import var_child_runnable_config
from starlette.websockets import WebSocketDisconnect

from octop.infra.control.mobile.companion import vlm
from octop.infra.control.mobile.companion.tools import build_phone_tools
from octop.infra.server import OctopServer
from tests.support.auth import create_user, resolve_user_id, seed_openai_provider
from tests.support.companion import JPEG_B64, auth_frame, mirror_frame, progress_frame
from tests.support.http import ASGIWebSocketSession, ws_connect

pytestmark = pytest.mark.slow

Env = tuple[httpx.AsyncClient, OctopServer, dict[str, str]]


@contextmanager
def _configurable(**kwargs: object) -> Iterator[None]:
    token = var_child_runnable_config.set({"configurable": kwargs})
    try:
        yield
    finally:
        var_child_runnable_config.reset(token)


async def _pair(client: httpx.AsyncClient, auth: dict[str, str]) -> str:
    r = await client.post("/api/mobile/companion/pairings", headers=auth)
    assert r.status_code == 200, r.text
    body = r.json()
    url = urlsplit(body["url"])
    assert url.path == "/api/mobile/companion/ws"
    assert body["expires_at"] > 0
    return parse_qs(url.query)["token"][0]


async def _phone_connect(
    app: Any, token: str, device_id: str = "Pixel-1"
) -> tuple[ASGIWebSocketSession, dict[str, Any]]:
    session = ASGIWebSocketSession(app, f"/api/mobile/companion/ws?token={token}")
    await session.connect()
    await session.send_json(auth_frame(device_id))
    # The real app sends skill.hello right after auth; the server ignores it.
    await session.send_json({"channel": "skill", "type": "skill.hello", "method": "skill.hello"})
    return session, await session.receive_json()


async def test_pair_connect_and_list(env: Env) -> None:
    client, _srv, auth = env
    token = await _pair(client, auth)
    app = client._octop_app  # type: ignore[attr-defined]
    phone, connected = await _phone_connect(app, token)
    try:
        assert connected["type"] == "connected"
        assert connected["serverSessionId"] == "Pixel-1"
        assert "vlm" not in connected  # no phone model configured yet

        devices = (await client.get("/api/mobile/companion/devices", headers=auth)).json()
        [device] = devices["devices"]
        assert device["online"] and device["model"] == "Pixel 9"

        missing = await client.get("/api/mobile/companion/devices/Pixel-1/snapshot", headers=auth)
        assert missing.status_code == 404
        await phone.send_json(mirror_frame())
        await asyncio.sleep(0.05)
        snap = await client.get("/api/mobile/companion/devices/Pixel-1/snapshot", headers=auth)
        assert snap.status_code == 200 and snap.json()["jpeg_base64"] == JPEG_B64
    finally:
        await phone.close()

    devices = (await client.get("/api/mobile/companion/devices", headers=auth)).json()
    assert devices["devices"][0]["online"] is False


async def test_bad_keys_are_rejected(env: Env) -> None:
    client, _srv, auth = env
    app = client._octop_app  # type: ignore[attr-defined]
    async with ws_connect(app, "/api/mobile/companion/ws?token=bogus") as ws:
        await ws.send_json(auth_frame("Pixel-1"))
        err = await ws.receive_json()
        assert err == {
            "type": "error",
            "code": "AUTH_FAILED",
            "message": "unknown or expired pairing key",
        }
        with pytest.raises(WebSocketDisconnect) as exc:
            await ws.receive_json()
        assert exc.value.code == 4003

    token = await _pair(client, auth)
    first, _ = await _phone_connect(app, token, "Pixel-1")
    await first.close()
    async with ws_connect(app, f"/api/mobile/companion/ws?token={token}") as ws:
        await ws.send_json(auth_frame("Intruder-9"))
        assert (await ws.receive_json())["code"] == "AUTH_FAILED"


async def test_agent_tool_runs_task_on_connected_phone(env: Env) -> None:
    client, srv, auth = env
    token = await _pair(client, auth)
    app = client._octop_app  # type: ignore[attr-defined]
    phone, _connected = await _phone_connect(app, token)
    assert srv.app_runtime is not None and srv.services is not None
    hub = srv.app_runtime.companion_hub
    assert hub is not None
    tools = {t.name: t for t in build_phone_tools(hub, user_repo=srv.services.user_repo)}
    admin_id = await resolve_user_id(client, auth, "admin")

    async def phone_side() -> dict[str, Any]:
        execute = await phone.receive_json()
        assert execute["method"] == "agent.execute"
        task_id = execute["params"]["taskId"]
        await phone.send_json(progress_frame(task_id, 1))
        await phone.send_json(
            {
                "channel": "task",
                "id": f"resp_{task_id}",
                "result": {
                    "taskId": task_id,
                    "success": True,
                    "status": "completed",
                    "message": "Android 15",
                    "totalSteps": 4,
                    "duration": 31000,
                },
            }
        )
        return await phone.receive_json()

    try:
        side = asyncio.create_task(phone_side())
        with _configurable(user=str(admin_id), user_is_admin=True, locale="en"):
            listed = json.loads(await tools["phone_list_devices"].ainvoke({}))
            out = json.loads(
                await tools["phone_run_task"].ainvoke({"task": "打开设置，查看 Android 版本"})
            )
        ack = await asyncio.wait_for(side, 10)
        assert listed["devices"][0]["device_id"] == "Pixel-1"
        assert out["status"] == "completed" and out["message"] == "Android 15"
        assert out["steps"] == 4
        assert ack == {
            "channel": "task",
            "method": "agent.result_ack",
            "params": {"taskId": out["task_id"]},
        }
    finally:
        await phone.close()


async def test_model_choice_reaches_phone_and_proxy_forwards(env: Env) -> None:
    client, _srv, auth = env
    await seed_openai_provider(client, auth, api_key="sk-server")
    token = await _pair(client, auth)
    app = client._octop_app  # type: ignore[attr-defined]
    phone, _connected = await _phone_connect(app, token)
    try:
        settings = (await client.get("/api/mobile/companion/settings", headers=auth)).json()
        assert settings["ready"] is False
        assert {"provider": "openai", "model": "gpt-4o", "vision": True} in settings["candidates"]

        bad = await client.put(
            "/api/mobile/companion/settings",
            headers=auth,
            json={"provider": "openai", "model": "nope"},
        )
        assert bad.status_code == 400
        r = await client.put(
            "/api/mobile/companion/settings",
            headers=auth,
            json={"provider": "openai", "model": "gpt-4o"},
        )
        assert r.status_code == 200 and r.json()["ready"] is True

        refreshed = await phone.receive_json()
        assert refreshed["type"] == "connected"
        assert refreshed["vlm"] == {
            "apiUrl": "http://testserver/api/mobile/companion/vlm/v1",
            "apiKey": token,
            "model": "gpt-4o",
            "reasoningEffort": "none",
        }
    finally:
        await phone.close()

    seen: dict[str, Any] = {}

    def upstream(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "CLICK"}}]})

    original = vlm.forward_chat_completion

    async def forward(target: Any, body: dict[str, Any]) -> Any:
        return await original(target, body, transport=httpx.MockTransport(upstream))

    proxy_path = "/api/mobile/companion/vlm/v1/chat/completions"
    with patch("octop.api.routers.mobile.companion.vlm.forward_chat_completion", forward):
        denied = await client.post(
            proxy_path, headers={"Authorization": "Bearer wrong"}, json={"messages": []}
        )
        ok = await client.post(
            proxy_path,
            headers={"Authorization": f"Bearer {token}"},
            json={"model": "step-3.7-flash", "messages": [{"role": "user", "content": "hi"}]},
        )
    assert denied.status_code == 401
    assert ok.status_code == 200, ok.text
    assert ok.json()["choices"][0]["message"]["content"] == "CLICK"
    assert seen["auth"] == "Bearer sk-server"
    assert seen["body"]["model"] == "gpt-4o"


async def test_settings_change_is_admin_only_and_devices_are_private(env: Env) -> None:
    client, _srv, auth = env
    await seed_openai_provider(client, auth)
    token = await _pair(client, auth)
    app = client._octop_app  # type: ignore[attr-defined]
    phone, _ = await _phone_connect(app, token)
    await phone.close()

    user_auth = await create_user(client, auth, username="bob", permissions=["mobile"])
    mine = (await client.get("/api/mobile/companion/devices", headers=user_auth)).json()
    assert mine["devices"] == []
    hidden = await client.get("/api/mobile/companion/devices/Pixel-1/snapshot", headers=user_auth)
    assert hidden.status_code == 404
    forbidden = await client.put(
        "/api/mobile/companion/settings",
        headers=user_auth,
        json={"provider": "openai", "model": "gpt-4o"},
    )
    assert forbidden.status_code == 403
    no_perm = await create_user(client, auth, username="carol")  # baseline: no "mobile"
    r = await client.get("/api/mobile/companion/devices", headers=no_perm)
    assert r.status_code == 403


async def test_unpair_disconnects_and_blocks_reconnect(env: Env) -> None:
    client, _srv, auth = env
    token = await _pair(client, auth)
    app = client._octop_app  # type: ignore[attr-defined]
    phone, _ = await _phone_connect(app, token)
    try:
        r = await client.delete("/api/mobile/companion/devices/Pixel-1", headers=auth)
        assert r.status_code == 204
        with pytest.raises(WebSocketDisconnect) as exc:
            await phone.receive_json()
        assert exc.value.code == 4003
    finally:
        await phone.close()
    assert (await client.get("/api/mobile/companion/devices", headers=auth)).json() == {
        "devices": []
    }
    async with ws_connect(app, f"/api/mobile/companion/ws?token={token}") as ws:
        await ws.send_json(auth_frame("Pixel-1"))
        assert (await ws.receive_json())["code"] == "AUTH_FAILED"


async def test_capabilities_advertise_companion(env: Env) -> None:
    client, _srv, auth = env
    caps = (await client.get("/api/settings/capabilities", headers=auth)).json()
    assert caps["mobile"]["companion"] is True

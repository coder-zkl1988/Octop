"""Companion-app phones: phone WebSocket, VLM proxy and dashboard REST.

Mounted regardless of ``capabilities.mobile`` — a companion phone needs no
adb, binder or KVM on the host.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import json
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, WebSocket
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from starlette.websockets import WebSocketDisconnect, WebSocketState

from octop.api.deps import extract_raw_token, get_server, require_permission
from octop.infra.control.mobile.companion import vlm
from octop.infra.control.mobile.companion.hub import CompanionError, CompanionHub, DeviceView
from octop.infra.control.mobile.companion.pairing import PAIRING_TTL_S, PairingError
from octop.infra.control.mobile.companion.protocol import (
    TaskResult,
    auth_error_message,
    parse_auth,
)
from octop.infra.control.mobile.companion.urls import lan_ipv4, pairing_address, public_base_url
from octop.infra.errors import ErrorCode, OctopError
from octop.infra.users.identity import User

logger = logging.getLogger(__name__)

router = APIRouter()

_AUTH_TIMEOUT_S = 15.0


def _hub_or_none(server: Any) -> CompanionHub | None:
    runtime = getattr(server, "app_runtime", None)
    return getattr(runtime, "companion_hub", None) if runtime is not None else None


def _hub(server: Any) -> CompanionHub:
    hub = _hub_or_none(server)
    if hub is None:
        raise OctopError(ErrorCode.SETUP_REQUIRED, "control-plane database not configured yet")
    return hub


def _loads(raw: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


class _WsPhone:
    """:class:`PhoneConnection` over a Starlette WebSocket (sends serialized)."""

    def __init__(self, ws: WebSocket) -> None:
        self._ws = ws
        self._lock = asyncio.Lock()

    async def send_json(self, payload: dict[str, Any]) -> None:
        async with self._lock:
            if self._ws.application_state == WebSocketState.CONNECTED:
                await self._ws.send_text(json.dumps(payload, ensure_ascii=False))

    async def close(self, code: int, reason: str) -> None:
        async with self._lock:
            if self._ws.application_state == WebSocketState.CONNECTED:
                await self._ws.close(code=code, reason=reason)


async def _reject(conn: _WsPhone, code: str, message: str, close_code: int) -> None:
    with contextlib.suppress(Exception):
        await conn.send_json(auth_error_message(code, message))
        await conn.close(close_code, code)


@router.websocket("/mobile/companion/ws")
async def companion_phone_ws(
    websocket: WebSocket,
    token: str = Query(default="", description="Device key from the pairing QR code."),
) -> None:
    """Phone endpoint. The pairing key in ``token`` is the credential (no JWT)."""
    hub = _hub_or_none(websocket.app.state.octop_server)
    await websocket.accept()
    conn = _WsPhone(websocket)
    if hub is None or not token:
        await _reject(conn, "AUTH_FAILED", "pairing key required", 4003)
        return
    try:
        first = await asyncio.wait_for(websocket.receive(), timeout=_AUTH_TIMEOUT_S)
    except TimeoutError:
        await _reject(conn, "AUTH_TIMEOUT", "no auth message", 4001)
        return
    text = first.get("text") if first.get("type") == "websocket.receive" else None
    hello = parse_auth(_loads(text) or {}) if text else None
    if hello is None:
        await _reject(conn, "AUTH_FAILED", "expected an auth message with deviceId", 4003)
        return
    url = websocket.url
    try:
        await hub.attach(
            token, hello, conn, public_base_url=public_base_url(url.scheme, url.netloc)
        )
    except PairingError as exc:
        await _reject(conn, exc.code, str(exc), 4003)
        return
    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            raw = message.get("text")
            if raw is None:
                continue  # binary H.264 / clipboard frames: not requested, dropped
            msg = _loads(raw)
            if msg is None:
                continue
            try:
                await hub.handle_message(hello.device_id, conn, msg)
            except Exception:
                logger.exception("companion message from %s failed", hello.device_id)
    except WebSocketDisconnect:
        pass
    finally:
        hub.detach(hello.device_id, conn)


def _openai_error(status: int, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"message": message, "type": "invalid_request_error"}},
    )


@router.post(
    "/mobile/companion/vlm/v1/chat/completions",
    summary="OpenAI-compatible vision proxy for companion phones",
    description="Called by the phone app, authenticated with its device key as the bearer "
    "token. Forwards to the provider chosen in companion settings with the server-side key; "
    "the request's `model` is replaced by the configured one. Streams when `stream` is true.",
)
async def companion_vlm_proxy(
    request: Request,
    authorization: str | None = Header(default=None),
    server: Any = Depends(get_server),
) -> Response:
    hub = _hub(server)
    key = extract_raw_token(authorization=authorization)
    if not key or await asyncio.to_thread(hub.pairing.by_key, key) is None:
        return _openai_error(401, "invalid device key")
    services = server.services
    target = await asyncio.to_thread(
        vlm.resolve_target, services.settings_repo, services.provider_repo
    )
    if target is None:
        return _openai_error(503, "no phone model is configured in Octop")
    try:
        body = await request.json()
    except (json.JSONDecodeError, ValueError):
        return _openai_error(400, "request body must be JSON")
    if not isinstance(body, dict):
        return _openai_error(400, "request body must be a JSON object")
    try:
        upstream = await vlm.forward_chat_completion(target, body)
    except httpx.HTTPError as exc:
        logger.warning("companion vlm upstream failed: %s", exc)
        return _openai_error(502, "upstream model request failed")
    return StreamingResponse(
        upstream.body, status_code=upstream.status_code, media_type=upstream.media_type
    )


class CompanionDeviceItem(BaseModel):
    device_id: str = Field(description="Phone id reported by the app (MODEL-ANDROID_ID).")
    model: str
    manufacturer: str
    online: bool
    android_sdk: int | None = None
    screen_width: int | None = None
    screen_height: int | None = None
    battery_level: int | None = None
    is_charging: bool | None = None
    current_app: str = Field(description="Foreground app package, when known.")
    paired_at: int | None = Field(default=None, description="Unix seconds.")
    last_seen: float | None = Field(default=None, description="Unix seconds of last frame.")
    has_snapshot: bool = Field(description="Whether a recent screen frame is available.")
    running_task_id: str | None = None
    running_task: str | None = None
    running_step: int | None = None


class CompanionDevicesResponse(BaseModel):
    devices: list[CompanionDeviceItem]


class CompanionPairingResponse(BaseModel):
    url: str = Field(description="WebSocket URL to encode in the pairing QR code.")
    expires_at: int = Field(description="Unix seconds after which an unscanned code expires.")
    reachable_from_lan: bool = Field(
        description="False when Octop only listens on loopback, so phones on Wi-Fi cannot "
        "reach the URL (USB `adb reverse` still can)."
    )


class CompanionSnapshotResponse(BaseModel):
    jpeg_base64: str = Field(description="Latest screen frame pushed by the phone.")


class CompanionTaskResultResponse(BaseModel):
    task_id: str
    status: str
    message: str
    error_code: str | None = None
    steps: int
    duration_ms: int


class CompanionVlmCandidate(BaseModel):
    provider: str
    model: str
    vision: bool = Field(description="Whether the model is known to accept images.")


class CompanionSettingsResponse(BaseModel):
    provider: str = Field(description="Provider name of the phone-side vision model.")
    model: str
    max_tokens: int | None = None
    ready: bool = Field(description="Whether phones currently receive a usable model.")
    candidates: list[CompanionVlmCandidate]


class CompanionSettingsBody(BaseModel):
    provider: str = Field(min_length=1)
    model: str = Field(min_length=1)
    max_tokens: int | None = Field(default=None, ge=256, le=131072)


def _device_item(view: DeviceView) -> CompanionDeviceItem:
    return CompanionDeviceItem(**view.to_dict())


def _require_device(hub: CompanionHub, device_id: str, user: User) -> None:
    owner = hub.owner_of(device_id)
    if owner is None or (not user.is_admin and owner != user.id):
        raise OctopError(ErrorCode.NOT_FOUND, f"phone {device_id} not found")


def _result_item(result: TaskResult) -> CompanionTaskResultResponse:
    return CompanionTaskResultResponse(
        task_id=result.task_id,
        status=result.status,
        message=result.message,
        error_code=result.error_code,
        steps=result.total_steps,
        duration_ms=result.duration_ms,
    )


@router.get(
    "/mobile/companion/devices",
    summary="List paired companion phones",
    response_model=CompanionDevicesResponse,
)
async def list_companion_devices(
    server: Any = Depends(get_server),
    user: User = Depends(require_permission("mobile")),
) -> CompanionDevicesResponse:
    hub = _hub(server)
    views = hub.list_devices(None if user.is_admin else user.id)
    return CompanionDevicesResponse(devices=[_device_item(v) for v in views])


@router.post(
    "/mobile/companion/pairings",
    summary="Create a pairing QR code for a companion phone",
    description="Mints a one-time device key. The first phone that connects with it is "
    f"paired to the caller; an unscanned code expires after {PAIRING_TTL_S // 60} minutes.",
    response_model=CompanionPairingResponse,
)
async def create_companion_pairing(
    request: Request,
    server: Any = Depends(get_server),
    user: User = Depends(require_permission("mobile")),
) -> CompanionPairingResponse:
    hub = _hub(server)
    key, record = await asyncio.to_thread(hub.pairing.create, user.id)
    address = pairing_address(
        scheme=request.url.scheme,
        host=request.url.hostname or "127.0.0.1",
        port=request.url.port,
        bind_host=server.services.config.bind_host,
        key=key,
        lan_ip=lan_ipv4(),
    )
    return CompanionPairingResponse(
        url=address.ws_url,
        expires_at=record.created_at + PAIRING_TTL_S,
        reachable_from_lan=address.reachable_from_lan,
    )


@router.delete(
    "/mobile/companion/devices/{device_id}",
    summary="Unpair a companion phone",
    status_code=204,
)
async def unpair_companion_device(
    device_id: str,
    server: Any = Depends(get_server),
    user: User = Depends(require_permission("mobile")),
) -> Response:
    hub = _hub(server)
    _require_device(hub, device_id, user)
    await hub.unpair(device_id)
    return Response(status_code=204)


@router.post(
    "/mobile/companion/devices/{device_id}/cancel",
    summary="Stop the task running on a companion phone",
    response_model=CompanionTaskResultResponse,
)
async def cancel_companion_task(
    device_id: str,
    server: Any = Depends(get_server),
    user: User = Depends(require_permission("mobile")),
) -> CompanionTaskResultResponse:
    hub = _hub(server)
    _require_device(hub, device_id, user)
    try:
        result = await hub.cancel_task(device_id)
    except CompanionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _result_item(result)


@router.get(
    "/mobile/companion/devices/{device_id}/snapshot",
    summary="Latest screen frame of a companion phone",
    response_model=CompanionSnapshotResponse,
)
async def get_companion_snapshot(
    device_id: str,
    server: Any = Depends(get_server),
    user: User = Depends(require_permission("mobile")),
) -> CompanionSnapshotResponse:
    hub = _hub(server)
    _require_device(hub, device_id, user)
    frame = hub.snapshot(device_id)
    if frame is None:
        raise OctopError(ErrorCode.NOT_FOUND, f"no screen frame from {device_id} yet")
    return CompanionSnapshotResponse(jpeg_base64=base64.b64encode(frame).decode("ascii"))


def _settings_response(server: Any) -> CompanionSettingsResponse:
    services = server.services
    chosen = vlm.load_settings(services.settings_repo)
    return CompanionSettingsResponse(
        provider=chosen.provider,
        model=chosen.model,
        max_tokens=chosen.max_tokens,
        ready=vlm.resolve_target(services.settings_repo, services.provider_repo) is not None,
        candidates=[
            CompanionVlmCandidate(provider=c.provider, model=c.model, vision=c.vision)
            for c in vlm.list_candidates(services.provider_repo)
        ],
    )


@router.get(
    "/mobile/companion/settings",
    summary="Phone-side vision model settings",
    response_model=CompanionSettingsResponse,
)
async def get_companion_settings(
    server: Any = Depends(get_server),
    _user: User = Depends(require_permission("mobile")),
) -> CompanionSettingsResponse:
    _hub(server)
    return await asyncio.to_thread(_settings_response, server)


@router.put(
    "/mobile/companion/settings",
    summary="Choose the phone-side vision model (admin)",
    description="Connected phones receive the new model immediately; a task already running "
    "keeps the model it started with.",
    response_model=CompanionSettingsResponse,
)
async def put_companion_settings(
    body: CompanionSettingsBody,
    server: Any = Depends(get_server),
    user: User = Depends(require_permission("mobile")),
) -> CompanionSettingsResponse:
    hub = _hub(server)
    if not user.is_admin:
        raise OctopError(ErrorCode.FORBIDDEN, "admin required")
    services = server.services
    candidates = await asyncio.to_thread(vlm.list_candidates, services.provider_repo)
    if not any(c.provider == body.provider and c.model == body.model for c in candidates):
        raise HTTPException(
            status_code=400,
            detail="model must belong to an enabled OpenAI-compatible provider with a key",
        )
    await asyncio.to_thread(
        vlm.save_settings,
        services.settings_repo,
        vlm.VlmSettings(provider=body.provider, model=body.model, max_tokens=body.max_tokens),
    )
    await hub.refresh_credentials()
    return await asyncio.to_thread(_settings_response, server)

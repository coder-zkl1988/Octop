"""Wire protocol spoken by the TabbyApp companion (``com.tabby.agent``).

The phone is the WebSocket client. It sends ``auth`` first, the PC answers
``connected`` (optionally carrying VLM credentials), then traffic is JSON
envelopes on the ``task`` / ``mirror`` / ``control`` / ``skill`` channels.
Inbound shapes vary per channel, so parsing here is deliberately lenient:
unknown messages are ignored rather than rejected.
"""

from __future__ import annotations

import base64
import binascii
import time
from dataclasses import dataclass, field
from typing import Any

RESULT_ID_PREFIX = "resp_"
MEDIA_RESULT_ID_PREFIX = "resp_media_"

TERMINAL_STATUSES = frozenset(
    {"completed", "aborted", "stuck", "needs_takeover", "blocked", "error"}
)


@dataclass(frozen=True)
class PhoneInfo:
    """Device facts reported in ``auth.capabilities`` and refreshed by frames."""

    model: str = ""
    manufacturer: str = ""
    android_sdk: int | None = None
    screen_width: int | None = None
    screen_height: int | None = None
    battery_level: int | None = None
    is_charging: bool | None = None
    current_app: str = ""


@dataclass(frozen=True)
class AuthHello:
    device_id: str
    info: PhoneInfo


@dataclass(frozen=True)
class TaskProgress:
    task_id: str
    step: int
    action: str
    thinking: str
    screenshot: bytes | None
    interaction_message: str | None = None
    interaction_screenshot: bytes | None = None


@dataclass(frozen=True)
class TaskResult:
    task_id: str
    device_id: str
    status: str
    message: str
    total_steps: int = 0
    duration_ms: int = 0
    error_code: str | None = None
    final_screenshot: bytes | None = None
    finished_at: float = field(default_factory=time.time)

    @property
    def success(self) -> bool:
        return self.status == "completed"


@dataclass(frozen=True)
class MirrorFrame:
    jpeg: bytes
    width: int | None
    height: int | None
    current_app: str
    device_status: str


def _int_or_none(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str) and value.strip().lstrip("-").isdigit():
        return int(value.strip())
    return None


def _str(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def _app(value: object) -> str:
    """Foreground package; the app reports ``unknown`` when it cannot tell."""
    name = _str(value)
    return "" if name.lower() == "unknown" else name


def decode_image(value: object) -> bytes | None:
    """Decode a base64 screenshot field (``data:`` prefixes tolerated)."""
    if not isinstance(value, str) or not value:
        return None
    raw = value.split(",", 1)[1] if value.startswith("data:") else value
    try:
        data = base64.b64decode(raw, validate=False)
    except (binascii.Error, ValueError):
        return None
    return data or None


def parse_phone_info(raw: object) -> PhoneInfo:
    caps = raw if isinstance(raw, dict) else {}
    charging = caps.get("isCharging")
    return PhoneInfo(
        model=_str(caps.get("model")),
        manufacturer=_str(caps.get("manufacturer")),
        android_sdk=_int_or_none(caps.get("osVersion")),
        screen_width=_int_or_none(caps.get("screenWidth")),
        screen_height=_int_or_none(caps.get("screenHeight")),
        battery_level=_int_or_none(caps.get("batteryLevel")),
        is_charging=charging if isinstance(charging, bool) else None,
        current_app=_app(caps.get("currentApp")),
    )


def parse_auth(msg: dict[str, Any]) -> AuthHello | None:
    """Return the hello when *msg* is an ``auth`` frame with a device id."""
    if msg.get("type") != "auth":
        return None
    device_id = _str(msg.get("deviceId")) or _str(msg.get("device_id"))
    if not device_id:
        return None
    return AuthHello(device_id=device_id, info=parse_phone_info(msg.get("capabilities")))


def parse_progress(msg: dict[str, Any]) -> TaskProgress | None:
    if msg.get("channel") != "task" or msg.get("method") != "agent.progress":
        return None
    params = msg.get("params")
    if not isinstance(params, dict):
        return None
    task_id = _str(params.get("taskId"))
    if not task_id:
        return None
    interaction = params.get("interaction_request")
    message: str | None = None
    interaction_shot: bytes | None = None
    if isinstance(interaction, dict):
        message = _str(interaction.get("message")) or "The phone needs a decision."
        interaction_shot = decode_image(interaction.get("screenshot"))
    return TaskProgress(
        task_id=task_id,
        step=_int_or_none(params.get("step")) or 0,
        action=_str(params.get("action")),
        thinking=_str(params.get("thinking")),
        screenshot=decode_image(params.get("screenshot")),
        interaction_message=message,
        interaction_screenshot=interaction_shot,
    )


def result_task_id(msg: dict[str, Any]) -> str | None:
    """Task id of a terminal ``resp_<taskId>`` frame (``None`` for other frames)."""
    msg_id = msg.get("id")
    if not isinstance(msg_id, str) or not msg_id.startswith(RESULT_ID_PREFIX):
        return None
    if msg_id.startswith(MEDIA_RESULT_ID_PREFIX) or "result" not in msg:
        return None
    return msg_id[len(RESULT_ID_PREFIX) :] or None


def parse_result(msg: dict[str, Any], *, device_id: str) -> TaskResult | None:
    task_id = result_task_id(msg)
    result = msg.get("result")
    if task_id is None or not isinstance(result, dict):
        return None
    status = _str(result.get("status"))
    if status not in TERMINAL_STATUSES:
        status = "completed" if result.get("success") is True else "error"
    return TaskResult(
        task_id=task_id,
        device_id=device_id,
        status=status,
        message=_str(result.get("message")),
        total_steps=_int_or_none(result.get("totalSteps")) or 0,
        duration_ms=_int_or_none(result.get("duration")) or 0,
        error_code=_str(result.get("errorCode")) or None,
        final_screenshot=decode_image(result.get("finalScreenshot")),
    )


def parse_mirror_frame(msg: dict[str, Any]) -> MirrorFrame | None:
    if msg.get("channel") != "mirror" or msg.get("type") not in {"realtime", "snapshot"}:
        return None
    jpeg = decode_image(msg.get("screenshot"))
    if jpeg is None:
        return None
    return MirrorFrame(
        jpeg=jpeg,
        width=_int_or_none(msg.get("width")),
        height=_int_or_none(msg.get("height")),
        current_app=_app(msg.get("currentApp")),
        device_status=_str(msg.get("deviceStatus")),
    )


def connected_message(device_id: str, vlm: dict[str, Any] | None) -> dict[str, Any]:
    """Handshake reply; re-sent whenever the VLM credentials change."""
    payload: dict[str, Any] = {
        "type": "connected",
        "serverSessionId": device_id,
        "telemetryConsent": False,
    }
    if vlm:
        payload["vlm"] = vlm
    return payload


def auth_error_message(code: str, message: str) -> dict[str, Any]:
    return {"type": "error", "code": code, "message": message}


def execute_message(
    task_id: str,
    task: str,
    *,
    max_steps: int | None = None,
    guidance: str | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {"taskId": task_id, "task": task, "mode": "autonomous"}
    if max_steps is not None:
        params["maxSteps"] = max_steps
    if guidance:
        params["guidance"] = guidance
    if session_id:
        params["sessionId"] = session_id
    return {"channel": "task", "id": task_id, "method": "agent.execute", "params": params}


def cancel_message(task_id: str) -> dict[str, Any]:
    return {
        "channel": "task",
        "id": f"cancel_{task_id}",
        "method": "agent.cancel",
        "params": {"taskId": task_id},
    }


def result_ack_message(task_id: str) -> dict[str, Any]:
    return {"channel": "task", "method": "agent.result_ack", "params": {"taskId": task_id}}


# Live mirror. ``fps > 5`` asks the phone for an H.264 stream (it prompts for
# screen-capture consent); ``fps <= 5`` is the JPEG preview — unless capture
# was already granted, in which case the phone keeps streaming H.264.
LIVE_MIRROR_FPS = 30
H264_FRAME_TYPE = 0x01
CLIPBOARD_FRAME_TYPE = 0x00
H264_HEADER_BYTES = 14

# Viewer actions the phone understands as ``{"channel":"mirror","type":…,"params":…}``.
MIRROR_ACTIONS = frozenset(
    {
        "click",
        "swipe",
        "long_press",
        "scroll",
        "input_text",
        "press_key",
        "set_clipboard",
        "get_clipboard",
    }
)


def mirror_start_message(device_id: str, fps: int) -> dict[str, Any]:
    return {"channel": "mirror", "type": "start", "deviceId": device_id, "fps": fps}


def mirror_stop_message(device_id: str) -> dict[str, Any]:
    return {"channel": "mirror", "type": "stop", "deviceId": device_id}


def mirror_action_message(device_id: str, action: dict[str, Any]) -> dict[str, Any] | None:
    """Wrap a viewer action for the phone; ``None`` for unknown action types."""
    kind = action.get("type")
    if kind not in MIRROR_ACTIONS:
        return None
    return {"channel": "mirror", "type": kind, "deviceId": device_id, "params": action}


def is_h264_keyframe(frame: bytes) -> bool:
    return len(frame) > H264_HEADER_BYTES and frame[0] == H264_FRAME_TYPE and frame[1] == 0x01

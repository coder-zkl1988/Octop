"""Fakes for companion-phone tests: an in-memory settings KV and a scripted phone."""

from __future__ import annotations

import asyncio
import base64
from typing import Any

JPEG_BYTES = b"\xff\xd8\xff\xe0fake-jpeg"
JPEG_B64 = base64.b64encode(JPEG_BYTES).decode("ascii")


class FakeSettings:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self.data.get(key)

    def set(self, key: str, value: str) -> None:
        self.data[key] = value


class FakePhone:
    """``PhoneConnection`` that records what the hub sends."""

    def __init__(self) -> None:
        self.sent: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self.closed: tuple[int, str] | None = None

    async def send_json(self, payload: dict[str, Any]) -> None:
        await self.sent.put(payload)

    async def close(self, code: int, reason: str) -> None:
        self.closed = (code, reason)

    async def next(self, *, timeout: float = 5.0) -> dict[str, Any]:
        return await asyncio.wait_for(self.sent.get(), timeout=timeout)

    async def next_method(self, method: str, *, timeout: float = 5.0) -> dict[str, Any]:
        """Skip frames until one with ``method`` arrives."""
        while True:
            msg = await self.next(timeout=timeout)
            if msg.get("method") == method:
                return msg


def auth_frame(device_id: str, *, model: str = "Pixel 9") -> dict[str, Any]:
    return {
        "type": "auth",
        "token": "",
        "deviceId": device_id,
        "capabilities": {
            "model": model,
            "manufacturer": "Google",
            "osVersion": 35,
            "screenWidth": 1080,
            "screenHeight": 2400,
            "batteryLevel": 80,
            "isCharging": False,
            "currentApp": "com.android.launcher",
        },
    }


def progress_frame(
    task_id: str,
    step: int,
    *,
    action: str = "CLICK",
    interaction: str | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "taskId": task_id,
        "step": step,
        "action": action,
        "thinking": "",
        "screenshot": JPEG_B64,
    }
    if interaction is not None:
        params["interaction_request"] = {"message": interaction, "screenshot": JPEG_B64}
    return {"channel": "task", "method": "agent.progress", "params": params}


def result_frame(
    task_id: str,
    *,
    status: str = "completed",
    message: str = "done",
    steps: int = 3,
) -> dict[str, Any]:
    return {
        "channel": "task",
        "id": f"resp_{task_id}",
        "result": {
            "taskId": task_id,
            "success": status == "completed",
            "status": status,
            "message": message,
            "totalSteps": steps,
            "duration": 4200,
            "finalScreenshot": JPEG_B64,
        },
    }


def mirror_frame(*, current_app: str = "com.android.settings") -> dict[str, Any]:
    return {
        "channel": "mirror",
        "type": "realtime",
        "screenshot": JPEG_B64,
        "width": 1080,
        "height": 2400,
        "timestamp": 1730000000000,
        "currentApp": current_app,
        "deviceStatus": "idle",
    }

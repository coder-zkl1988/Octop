"""Live registry and task coordinator for companion phones.

The hub is transport-agnostic: the WebSocket route hands it a
:class:`PhoneConnection` plus decoded JSON frames. Rules the phone does not
enforce itself live here:

- one running task per device (the app would happily run two loops);
- every terminal result is acknowledged with ``agent.result_ack`` — the app
  replays unacknowledged results on every reconnect;
- an idle timeout (reset by each progress frame) and a first-step timeout,
  after which the task is cancelled on the phone.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import secrets
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from typing import Any, Protocol

from octop.infra.control.mobile.companion import protocol
from octop.infra.control.mobile.companion.pairing import PairedDevice, PairingStore
from octop.infra.control.mobile.companion.protocol import AuthHello, PhoneInfo, TaskResult

logger = logging.getLogger(__name__)

DEFAULT_IDLE_TIMEOUT_S = 300.0
MAX_IDLE_TIMEOUT_S = 600.0
FIRST_STEP_TIMEOUT_S = 180.0
CANCEL_CONFIRM_S = 15.0
RECENT_RESULTS_PER_DEVICE = 8
RECENT_RESULT_TTL_S = 6 * 3600


class PhoneConnection(Protocol):
    async def send_json(self, payload: dict[str, Any]) -> None: ...

    async def send_bytes(self, data: bytes) -> None: ...

    async def close(self, code: int, reason: str) -> None: ...


class MirrorViewer(Protocol):
    """A dashboard live-mirror socket: gets the phone's frames, sends actions."""

    async def send_text(self, text: str) -> None: ...

    async def send_bytes(self, data: bytes) -> None: ...

    async def close(self, code: int, reason: str) -> None: ...


VlmPayloadBuilder = Callable[[str, str], dict[str, Any] | None]
"""``(public_base_url, device_key) -> connected.vlm`` (``None`` = no model)."""


class CompanionError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class NeedsInteraction:
    """The phone paused and asks the caller for guidance (it waits ~60 s)."""

    task_id: str
    device_id: str
    message: str
    step: int
    screenshot: bytes | None


@dataclass(frozen=True)
class DeviceView:
    device_id: str
    user_id: int
    model: str
    online: bool
    name: str = ""
    manufacturer: str = ""
    android_sdk: int | None = None
    screen_width: int | None = None
    screen_height: int | None = None
    battery_level: int | None = None
    is_charging: bool | None = None
    current_app: str = ""
    paired_at: int | None = None
    last_seen: float | None = None
    has_snapshot: bool = False
    running_task_id: str | None = None
    running_task: str | None = None
    running_step: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "device_id": self.device_id,
            "name": self.name,
            "model": self.model,
            "manufacturer": self.manufacturer,
            "online": self.online,
            "android_sdk": self.android_sdk,
            "screen_width": self.screen_width,
            "screen_height": self.screen_height,
            "battery_level": self.battery_level,
            "is_charging": self.is_charging,
            "current_app": self.current_app,
            "paired_at": self.paired_at,
            "last_seen": self.last_seen,
            "has_snapshot": self.has_snapshot,
            "running_task_id": self.running_task_id,
            "running_task": self.running_task,
            "running_step": self.running_step,
        }


@dataclass
class _LiveDevice:
    device_id: str
    user_id: int
    key: str
    public_base_url: str
    conn: PhoneConnection
    info: PhoneInfo
    last_seen: float
    frame: bytes | None = None
    frame_at: float | None = None
    frame_msg: dict[str, Any] | None = None
    """Latest mirror JSON frame, replayed to a viewer that just joined."""
    keyframe: bytes | None = None
    """Latest binary H.264 keyframe, so a new viewer can start decoding at once."""


@dataclass
class _RunningTask:
    task_id: str
    device_id: str
    task: str
    started_at: float
    idle_timeout_s: float
    last_activity: float
    step: int = 0
    events: asyncio.Queue[TaskResult | NeedsInteraction] = field(default_factory=asyncio.Queue)
    done: asyncio.Event = field(default_factory=asyncio.Event)
    guidance_ids: set[str] = field(default_factory=set)
    watchdog: asyncio.Task[None] | None = None


def new_task_id() -> str:
    return f"t_{int(time.time() * 1000)}_{secrets.token_hex(3)}"


class CompanionHub:
    def __init__(
        self,
        pairing: PairingStore,
        vlm_payload: VlmPayloadBuilder,
        *,
        first_step_timeout_s: float = FIRST_STEP_TIMEOUT_S,
        cancel_confirm_s: float = CANCEL_CONFIRM_S,
    ) -> None:
        self.pairing = pairing
        self._vlm_payload = vlm_payload
        self._first_step_timeout_s = first_step_timeout_s
        self._cancel_confirm_s = cancel_confirm_s
        self._live: dict[str, _LiveDevice] = {}
        self._running: dict[str, _RunningTask] = {}
        self._recent: dict[str, deque[TaskResult]] = {}
        self._background: set[asyncio.Task[None]] = set()
        self._viewers: dict[str, set[MirrorViewer]] = {}

    # ----- connection lifecycle -----

    async def attach(
        self,
        key: str,
        hello: AuthHello,
        conn: PhoneConnection,
        *,
        public_base_url: str,
    ) -> PairedDevice:
        """Authenticate a phone, register it and send ``connected``.

        Raises :class:`~...pairing.PairingError` for a bad key.
        """
        record = await asyncio.to_thread(
            self.pairing.authenticate, key, hello.device_id, model=hello.info.model
        )
        previous = self._live.get(hello.device_id)
        self._live[hello.device_id] = _LiveDevice(
            device_id=hello.device_id,
            user_id=record.user_id,
            key=key,
            public_base_url=public_base_url,
            conn=conn,
            info=hello.info,
            last_seen=time.time(),
        )
        if previous is not None and previous.conn is not conn:
            with contextlib.suppress(Exception):
                await previous.conn.close(4000, "replaced by a newer connection")
        await conn.send_json(
            protocol.connected_message(hello.device_id, self._vlm_payload(public_base_url, key))
        )
        logger.info("companion phone connected: %s (user %s)", hello.device_id, record.user_id)
        return record

    def detach(self, device_id: str, conn: PhoneConnection) -> None:
        """Forget *conn*; a late close from a replaced socket is ignored.

        A running task survives: the phone keeps working and replays its
        result after reconnecting, and the idle watchdog bounds the wait.
        """
        live = self._live.get(device_id)
        if live is not None and live.conn is conn:
            del self._live[device_id]
            logger.info("companion phone disconnected: %s", device_id)
            if self._viewers.get(device_id):
                self._spawn(self._drop_viewers(device_id))

    async def refresh_credentials(self) -> None:
        """Re-send ``connected`` so phones pick up a changed VLM model."""
        for live in list(self._live.values()):
            with contextlib.suppress(Exception):
                await live.conn.send_json(
                    protocol.connected_message(
                        live.device_id, self._vlm_payload(live.public_base_url, live.key)
                    )
                )

    async def handle_message(
        self, device_id: str, conn: PhoneConnection, msg: dict[str, Any]
    ) -> None:
        live = self._live.get(device_id)
        if live is None or live.conn is not conn:
            return
        live.last_seen = time.time()

        task_id = protocol.result_task_id(msg)
        if task_id is not None:
            await self._on_result(live, msg, task_id)
            return
        progress = protocol.parse_progress(msg)
        if progress is not None:
            self._on_progress(live, progress)
            return
        frame = protocol.parse_mirror_frame(msg)
        if frame is not None:
            live.frame, live.frame_at = frame.jpeg, live.last_seen
            live.frame_msg = msg
            if frame.current_app:
                live.info = replace(live.info, current_app=frame.current_app)
            await self._broadcast(device_id, text=json.dumps(msg, ensure_ascii=False))
            return
        if msg.get("channel") == "control" and msg.get("event") == "device_info":
            self._on_device_info(live, msg)

    def _on_device_info(self, live: _LiveDevice, msg: dict[str, Any]) -> None:
        refreshed = protocol.parse_phone_info(
            {
                "currentApp": msg.get("currentApp"),
                "batteryLevel": msg.get("batteryLevel"),
                "isCharging": msg.get("isCharging"),
            }
        )
        live.info = replace(
            live.info,
            current_app=refreshed.current_app or live.info.current_app,
            battery_level=refreshed.battery_level
            if refreshed.battery_level is not None
            else live.info.battery_level,
            is_charging=refreshed.is_charging
            if refreshed.is_charging is not None
            else live.info.is_charging,
        )

    async def _on_result(self, live: _LiveDevice, msg: dict[str, Any], task_id: str) -> None:
        result = protocol.parse_result(msg, device_id=live.device_id)
        # Ack everything, replays included, or the phone resends on every reconnect.
        with contextlib.suppress(Exception):
            await live.conn.send_json(protocol.result_ack_message(task_id))
        if result is None:
            return
        running = self._running.get(live.device_id)
        if running is not None and task_id in running.guidance_ids:
            return  # transport receipt for delivered guidance, not the task result
        if running is not None and running.task_id == task_id:
            self._finish(running, result)
        else:
            self._remember(result)

    def _on_progress(self, live: _LiveDevice, progress: protocol.TaskProgress) -> None:
        running = self._running.get(live.device_id)
        if running is None or running.task_id != progress.task_id:
            return
        running.last_activity = time.monotonic()
        running.step = max(running.step, progress.step)
        shot = progress.screenshot or progress.interaction_screenshot
        if shot:
            live.frame, live.frame_at = shot, live.last_seen
        if progress.interaction_message is not None:
            running.events.put_nowait(
                NeedsInteraction(
                    task_id=running.task_id,
                    device_id=running.device_id,
                    message=progress.interaction_message,
                    step=progress.step,
                    screenshot=progress.interaction_screenshot or progress.screenshot,
                )
            )

    # ----- tasks -----

    async def run_task(
        self,
        device_id: str,
        task: str,
        *,
        max_steps: int | None = None,
        idle_timeout_s: float = DEFAULT_IDLE_TIMEOUT_S,
        guidance: str | None = None,
        session_id: str | None = None,
    ) -> TaskResult | NeedsInteraction:
        """Run *task* on the phone and wait for its result or a guidance request.

        With ``session_id`` naming the running task, *guidance* is delivered to
        it and the wait resumes instead of starting a new task.
        """
        live = self._live.get(device_id)
        if live is None:
            raise CompanionError("DEVICE_OFFLINE", f"phone {device_id} is not connected")
        running = self._running.get(device_id)
        if running is not None and session_id and session_id == running.task_id:
            if not guidance:
                return await self._await(running)
            guidance_id = new_task_id()
            running.guidance_ids.add(guidance_id)
            running.last_activity = time.monotonic()
            await live.conn.send_json(
                protocol.execute_message(
                    guidance_id, running.task, guidance=guidance, session_id=session_id
                )
            )
            return await self._await(running)
        if running is not None:
            raise CompanionError(
                "TASK_ALREADY_RUNNING",
                f"phone {device_id} is already running task {running.task_id}",
            )

        now = time.monotonic()
        running = _RunningTask(
            task_id=new_task_id(),
            device_id=device_id,
            task=task,
            started_at=now,
            idle_timeout_s=max(1.0, min(idle_timeout_s, MAX_IDLE_TIMEOUT_S)),
            last_activity=now,
        )
        self._running[device_id] = running
        try:
            await live.conn.send_json(
                protocol.execute_message(
                    running.task_id,
                    task,
                    max_steps=max_steps,
                    guidance=guidance,
                    session_id=session_id,
                )
            )
        except Exception as exc:
            self._finish(running, self._failed(running, "SEND_FAILED", str(exc)))
            raise CompanionError("SEND_FAILED", f"could not reach phone {device_id}") from exc
        running.watchdog = asyncio.create_task(
            self._watch(running), name=f"companion-task-{running.task_id}"
        )
        return await self._await(running)

    async def _await(self, running: _RunningTask) -> TaskResult | NeedsInteraction:
        try:
            return await running.events.get()
        except asyncio.CancelledError:
            # The caller (an agent turn) was stopped: stop the phone too.
            if not running.done.is_set():
                self._spawn(self._cancel_quietly(running))
            raise

    async def _cancel_quietly(self, running: _RunningTask) -> None:
        with contextlib.suppress(Exception):
            await self._cancel(running)

    async def _watch(self, running: _RunningTask) -> None:
        while not running.done.is_set():
            now = time.monotonic()
            first_deadline = (
                running.started_at + self._first_step_timeout_s if running.step < 1 else None
            )
            idle_deadline = running.last_activity + running.idle_timeout_s
            if first_deadline is not None and now >= first_deadline:
                reason = "NO_FIRST_STEP"
            elif now >= idle_deadline:
                reason = "TIMEOUT"
            else:
                wake = min(d for d in (first_deadline, idle_deadline) if d is not None)
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(running.done.wait(), timeout=wake - now)
                continue
            logger.info("companion task %s timed out: %s", running.task_id, reason)
            await self._cancel(running, reason=reason)
            return

    async def cancel_task(self, device_id: str, task_id: str | None = None) -> TaskResult:
        running = self._running.get(device_id)
        if running is None or (task_id not in (None, "", "current", running.task_id)):
            raise CompanionError("NO_RUNNING_TASK", f"no matching task is running on {device_id}")
        return await self._cancel(running)

    async def _cancel(self, running: _RunningTask, *, reason: str | None = None) -> TaskResult:
        live = self._live.get(running.device_id)
        if live is not None:
            with contextlib.suppress(Exception):
                await live.conn.send_json(protocol.cancel_message(running.task_id))
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(running.done.wait(), timeout=self._cancel_confirm_s)
        if not running.done.is_set():
            code = reason or "CANCEL_NOT_CONFIRMED"
            message = {
                "NO_FIRST_STEP": "the phone made no progress after accepting the task",
                "TIMEOUT": "no progress from the phone within the idle timeout",
            }.get(code, "the phone did not confirm the cancellation")
            self._finish(running, self._failed(running, code, message))
        found = self.find_result(running.task_id)
        return found or self._failed(running, reason or "CANCELLED", "cancelled")

    def _failed(self, running: _RunningTask, code: str, message: str) -> TaskResult:
        return TaskResult(
            task_id=running.task_id,
            device_id=running.device_id,
            status="aborted" if code == "CANCEL_NOT_CONFIRMED" else "error",
            message=message,
            total_steps=running.step,
            duration_ms=int((time.monotonic() - running.started_at) * 1000),
            error_code=code,
        )

    def _finish(self, running: _RunningTask, result: TaskResult) -> None:
        if running.done.is_set():
            return
        running.done.set()
        if self._running.get(running.device_id) is running:
            del self._running[running.device_id]
        self._remember(result)
        running.events.put_nowait(result)

    def _remember(self, result: TaskResult) -> None:
        bucket = self._recent.setdefault(result.device_id, deque(maxlen=RECENT_RESULTS_PER_DEVICE))
        for idx, existing in enumerate(bucket):
            if existing.task_id == result.task_id:
                # A real phone result supersedes a locally synthesized timeout.
                if existing.error_code in {"TIMEOUT", "NO_FIRST_STEP", "CANCEL_NOT_CONFIRMED"}:
                    bucket[idx] = result
                return
        bucket.append(result)

    # ----- live mirror -----

    def _spawn(self, coro: Any) -> None:
        task = asyncio.create_task(coro)
        self._background.add(task)
        task.add_done_callback(self._background.discard)

    async def handle_binary(self, device_id: str, conn: PhoneConnection, data: bytes) -> None:
        """Fan H.264 (``0x01``) and clipboard (``0x00``) frames out to viewers."""
        live = self._live.get(device_id)
        if live is None or live.conn is not conn or not data:
            return
        live.last_seen = time.time()
        if data[0] == protocol.H264_FRAME_TYPE:
            if protocol.is_h264_keyframe(data):
                live.keyframe = data
        elif data[0] != protocol.CLIPBOARD_FRAME_TYPE:
            return
        await self._broadcast(device_id, data=data)

    async def add_viewer(
        self, device_id: str, viewer: MirrorViewer, *, fps: int = protocol.LIVE_MIRROR_FPS
    ) -> None:
        """Start the phone's live stream and replay the latest frames to *viewer*."""
        live = self._live.get(device_id)
        if live is None:
            raise CompanionError("DEVICE_OFFLINE", f"phone {device_id} is not connected")
        self._viewers.setdefault(device_id, set()).add(viewer)
        await live.conn.send_json(protocol.mirror_start_message(device_id, fps))
        if live.frame_msg is not None:
            await viewer.send_text(json.dumps(live.frame_msg, ensure_ascii=False))
        if live.keyframe is not None:
            await viewer.send_bytes(live.keyframe)

    async def remove_viewer(self, device_id: str, viewer: MirrorViewer) -> None:
        viewers = self._viewers.get(device_id)
        if viewers is None:
            return
        viewers.discard(viewer)
        if viewers:
            return
        del self._viewers[device_id]
        live = self._live.get(device_id)
        if live is not None:
            # Back to the low-rate preview the device cards' thumbnails rely on.
            with contextlib.suppress(Exception):
                await live.conn.send_json(
                    protocol.mirror_start_message(device_id, protocol.IDLE_MIRROR_FPS)
                )

    async def mirror_action(self, device_id: str, action: dict[str, Any] | bytes) -> bool:
        """Forward a viewer action: JSON is wrapped, binary control frames pass as-is."""
        live = self._live.get(device_id)
        if live is None:
            return False
        if isinstance(action, bytes):
            await live.conn.send_bytes(action)
            return True
        message = protocol.mirror_action_message(device_id, action)
        if message is None:
            return False
        await live.conn.send_json(message)
        return True

    async def _broadcast(
        self, device_id: str, *, text: str | None = None, data: bytes | None = None
    ) -> None:
        for viewer in list(self._viewers.get(device_id, ())):
            try:
                if text is not None:
                    await viewer.send_text(text)
                if data is not None:
                    await viewer.send_bytes(data)
            except Exception:
                self._viewers.get(device_id, set()).discard(viewer)

    async def _drop_viewers(self, device_id: str) -> None:
        notice = json.dumps({"channel": "mirror", "type": "device_disconnected"})
        for viewer in list(self._viewers.pop(device_id, ())):
            with contextlib.suppress(Exception):
                await viewer.send_text(notice)
                await viewer.close(1000, "phone disconnected")

    # ----- queries -----

    def find_result(self, task_id: str) -> TaskResult | None:
        for bucket in self._recent.values():
            for result in bucket:
                if result.task_id == task_id:
                    return result
        return None

    def recent_results(self, device_ids: set[str] | None = None) -> list[TaskResult]:
        """Newest first; ``device_ids`` limits the scan (``None`` = all devices)."""
        cutoff = time.time() - RECENT_RESULT_TTL_S
        out = [
            r
            for device_id, bucket in self._recent.items()
            if device_ids is None or device_id in device_ids
            for r in bucket
            if r.finished_at >= cutoff
        ]
        out.sort(key=lambda r: r.finished_at, reverse=True)
        return out

    def owner_of(self, device_id: str) -> int | None:
        live = self._live.get(device_id)
        if live is not None:
            return live.user_id
        record = self.pairing.get(device_id)
        return record.user_id if record is not None else None

    def list_devices(self, user_id: int | None = None) -> list[DeviceView]:
        """Paired devices (``user_id`` = only that owner's), online ones first."""
        views: list[DeviceView] = []
        for record in self.pairing.list_claimed(user_id):
            device_id = record.device_id or ""
            live = self._live.get(device_id)
            running = self._running.get(device_id)
            info = live.info if live is not None else PhoneInfo(model=record.model)
            views.append(
                DeviceView(
                    device_id=device_id,
                    user_id=record.user_id,
                    name=record.name,
                    model=info.model or record.model,
                    online=live is not None,
                    manufacturer=info.manufacturer,
                    android_sdk=info.android_sdk,
                    screen_width=info.screen_width,
                    screen_height=info.screen_height,
                    battery_level=info.battery_level,
                    is_charging=info.is_charging,
                    current_app=info.current_app,
                    paired_at=record.claimed_at,
                    last_seen=live.last_seen if live is not None else None,
                    has_snapshot=bool(live is not None and live.frame),
                    running_task_id=running.task_id if running else None,
                    running_task=running.task if running else None,
                    running_step=running.step if running else None,
                )
            )
        views.sort(key=lambda v: (not v.online, v.model, v.device_id))
        return views

    def snapshot(self, device_id: str) -> bytes | None:
        live = self._live.get(device_id)
        return live.frame if live is not None else None

    # ----- admin -----

    async def unpair(self, device_id: str) -> bool:
        removed = await asyncio.to_thread(self.pairing.remove, device_id)
        running = self._running.get(device_id)
        live = self._live.pop(device_id, None)
        if running is not None:
            if live is not None:
                with contextlib.suppress(Exception):
                    await live.conn.send_json(protocol.cancel_message(running.task_id))
            self._finish(running, self._failed(running, "UNPAIRED", "the phone was unpaired"))
        if live is not None:
            with contextlib.suppress(Exception):
                await live.conn.close(4003, "unpaired")
        await self._drop_viewers(device_id)
        return removed is not None

    async def rename(self, device_id: str, name: str) -> bool:
        record = await asyncio.to_thread(self.pairing.rename, device_id, name)
        return record is not None

    async def shutdown(self) -> None:
        for running in list(self._running.values()):
            if running.watchdog is not None:
                running.watchdog.cancel()
        for task in list(self._background):
            task.cancel()
        for device_id in list(self._viewers):
            await self._drop_viewers(device_id)
        for live in list(self._live.values()):
            with contextlib.suppress(Exception):
                await live.conn.close(1001, "server shutting down")
        self._live.clear()
        self._running.clear()

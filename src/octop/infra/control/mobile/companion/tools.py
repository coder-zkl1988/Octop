"""Agent tools for companion phones: hand a whole task to the on-phone agent."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated, Any

from langchain_core.tools import StructuredTool
from langgraph.config import get_config
from pydantic import Field

from octop.infra.control.mobile.companion.hub import (
    DEFAULT_IDLE_TIMEOUT_S,
    MAX_IDLE_TIMEOUT_S,
    CompanionError,
    CompanionHub,
    DeviceView,
    NeedsInteraction,
)
from octop.infra.control.mobile.companion.protocol import TaskResult
from octop.infra.users.permissions import stored_user_has_permission

PHONE_LIST_DEVICES = "phone_list_devices"
PHONE_RUN_TASK = "phone_run_task"
PHONE_CANCEL_TASK = "phone_cancel_task"
PHONE_GET_TASK_RESULT = "phone_get_task_result"
PHONE_TOOL_NAMES = frozenset(
    {PHONE_LIST_DEVICES, PHONE_RUN_TASK, PHONE_CANCEL_TASK, PHONE_GET_TASK_RESULT}
)

_SCREENSHOT_DIR = "outbound/screenshots"

_RUN_TASK_DESCRIPTION = """\
Run a natural-language task on a paired Android phone (Octop companion app).
The phone runs its own agent loop (screenshot -> vision model -> tap/type/swipe/
open app -> repeat) and returns when the task is done.

Send the WHOLE task in one call; do not split it into steps yourself, e.g.
"打开设置，查看 Android 版本后回到桌面" or "open WeChat and send Zhang San: dinner tonight?".
A task usually takes 1-5 minutes (each phone step is ~10-20 s).

If the result status is "needs_interaction", the phone paused for a decision:
read the question (and the screenshot via read_file if useful), then call this
tool again within ~60 s with the same task, session_id from the result and your
decision as guidance. The final screen is saved to screenshot_path."""


def _tool_ctx() -> dict[str, Any]:
    return get_config().get("configurable") or {}


def _caller(ctx: dict[str, Any], user_repo: Any) -> int | None:
    """Return the caller's user id (``None`` = admin, sees every phone)."""
    raw = ctx.get("user")
    if raw is None:
        raise ValueError("missing configurable.user")
    if ctx.get("user_is_admin"):
        return None
    row = user_repo.get(int(raw))
    if row is None or not stored_user_has_permission(row.role, row.permissions, "mobile"):
        raise ValueError("mobile permission required")
    return int(raw)


def _visible(hub: CompanionHub, owner: int | None) -> list[DeviceView]:
    return hub.list_devices(owner)


def _resolve_device(hub: CompanionHub, owner: int | None, device_id: str | None) -> str:
    devices = _visible(hub, owner)
    if not devices:
        raise ValueError(
            "No phone is paired. Ask the user to open Remote Phone -> Companion app in the "
            "Octop dashboard, install the app on the phone and scan the pairing QR code."
        )
    picked = (device_id or "").strip()
    if picked:
        if picked not in {d.device_id for d in devices}:
            raise ValueError(f"unknown phone {picked}; call {PHONE_LIST_DEVICES} first")
        return picked
    online = [d for d in devices if d.online]
    if len(online) == 1:
        return online[0].device_id
    if not online:
        raise ValueError("no paired phone is online; ask the user to open the app on the phone")
    ids = ", ".join(d.device_id for d in online)
    raise ValueError(f"several phones are online ({ids}); pass device_id")


def _seconds(ms: int) -> float:
    return round(ms / 1000, 1)


def build_phone_tools(
    hub: CompanionHub,
    *,
    user_repo: Any,
    workspace_for: Callable[[str], Any] | None = None,
) -> list[StructuredTool]:
    """Companion-phone tools; permission and ownership are checked per call."""

    async def _save_screenshot(ctx: dict[str, Any], data: bytes | None, name: str) -> str | None:
        agent_id = str(ctx.get("agent_id") or "").strip()
        workspace = workspace_for(agent_id) if data and agent_id and workspace_for else None
        if workspace is None or data is None:
            return None
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        rel = f"{_SCREENSHOT_DIR}/phone_{stamp}_{name}.jpg"
        await asyncio.to_thread(workspace.upload_bytes, rel, data)
        return rel

    async def _result_payload(
        ctx: dict[str, Any], result: TaskResult, *, with_screenshot: bool = True
    ) -> dict[str, Any]:
        shot = result.final_screenshot if with_screenshot else None
        return {
            "device_id": result.device_id,
            "task_id": result.task_id,
            "status": result.status,
            "success": result.success,
            "message": result.message,
            "error_code": result.error_code,
            "steps": result.total_steps,
            "duration_s": _seconds(result.duration_ms),
            "screenshot_path": await _save_screenshot(ctx, shot, f"{result.task_id}_final"),
        }

    async def phone_list_devices() -> str:
        try:
            owner = _caller(_tool_ctx(), user_repo)
            devices = [d.to_dict() for d in _visible(hub, owner)]
            return json.dumps({"devices": devices}, ensure_ascii=False)
        except Exception as exc:
            return json.dumps({"error": str(exc)}, ensure_ascii=False)

    async def phone_run_task(
        task: Annotated[str, Field(description="The complete natural-language task.")],
        device_id: Annotated[
            str | None,
            Field(description="Phone id from phone_list_devices; optional with one phone online."),
        ] = None,
        guidance: Annotated[
            str | None,
            Field(description="Your decision when resuming a needs_interaction pause."),
        ] = None,
        session_id: Annotated[
            str | None,
            Field(description="session_id from a needs_interaction result, to resume it."),
        ] = None,
        max_steps: Annotated[
            int | None,
            Field(description="Usually omit (phone default 100). Only to stop earlier.", ge=1),
        ] = None,
        timeout_s: Annotated[
            float,
            Field(
                description="Seconds without any progress from the phone before giving up "
                "(not a total budget).",
                ge=30,
                le=MAX_IDLE_TIMEOUT_S,
            ),
        ] = DEFAULT_IDLE_TIMEOUT_S,
    ) -> str:
        ctx = _tool_ctx()
        try:
            owner = _caller(ctx, user_repo)
            serial = _resolve_device(hub, owner, device_id)
            outcome = await hub.run_task(
                serial,
                task.strip(),
                max_steps=max_steps,
                idle_timeout_s=timeout_s,
                guidance=(guidance or "").strip() or None,
                session_id=(session_id or "").strip() or None,
            )
            if isinstance(outcome, NeedsInteraction):
                payload: dict[str, Any] = {
                    "device_id": outcome.device_id,
                    "status": "needs_interaction",
                    "session_id": outcome.task_id,
                    "question": outcome.message,
                    "step": outcome.step,
                    "screenshot_path": await _save_screenshot(
                        ctx, outcome.screenshot, f"{outcome.task_id}_step{outcome.step}"
                    ),
                }
            else:
                payload = await _result_payload(ctx, outcome)
            return json.dumps(payload, ensure_ascii=False)
        except CompanionError as exc:
            return json.dumps({"error": str(exc), "error_code": exc.code}, ensure_ascii=False)
        except Exception as exc:
            return json.dumps({"error": str(exc)}, ensure_ascii=False)

    async def phone_cancel_task(
        device_id: Annotated[
            str | None, Field(description="Phone id; optional with one phone online.")
        ] = None,
        task_id: Annotated[
            str | None, Field(description="Task to cancel; defaults to the running one.")
        ] = None,
    ) -> str:
        ctx = _tool_ctx()
        try:
            owner = _caller(ctx, user_repo)
            serial = _resolve_device(hub, owner, device_id)
            result = await hub.cancel_task(serial, task_id)
            return json.dumps(await _result_payload(ctx, result), ensure_ascii=False)
        except CompanionError as exc:
            return json.dumps({"error": str(exc), "error_code": exc.code}, ensure_ascii=False)
        except Exception as exc:
            return json.dumps({"error": str(exc)}, ensure_ascii=False)

    async def phone_get_task_result(
        task_id: Annotated[
            str | None, Field(description="Exact task id; omit to list recent results.")
        ] = None,
        device_id: Annotated[str | None, Field(description="Only this phone's results.")] = None,
        limit: Annotated[int, Field(description="Max results when listing.", ge=1, le=20)] = 5,
    ) -> str:
        ctx = _tool_ctx()
        try:
            owner = _caller(ctx, user_repo)
            visible = {d.device_id for d in _visible(hub, owner)}
            if device_id:
                visible &= {device_id.strip()}
            results = hub.recent_results(visible)
            if task_id:
                results = [r for r in results if r.task_id == task_id.strip()]
                if not results:
                    return json.dumps(
                        {"error": f"no finished result for task {task_id}"}, ensure_ascii=False
                    )
            payloads = [
                await _result_payload(ctx, r, with_screenshot=bool(task_id))
                for r in results[:limit]
            ]
            return json.dumps({"results": payloads}, ensure_ascii=False)
        except Exception as exc:
            return json.dumps({"error": str(exc)}, ensure_ascii=False)

    return [
        StructuredTool.from_function(
            coroutine=phone_list_devices,
            name=PHONE_LIST_DEVICES,
            description="List the user's paired Android phones (companion app): online state, "
            "model, Android version, battery, foreground app and any running task.",
        ),
        StructuredTool.from_function(
            coroutine=phone_run_task,
            name=PHONE_RUN_TASK,
            description=_RUN_TASK_DESCRIPTION,
        ),
        StructuredTool.from_function(
            coroutine=phone_cancel_task,
            name=PHONE_CANCEL_TASK,
            description="Stop the task currently running on a paired phone.",
        ),
        StructuredTool.from_function(
            coroutine=phone_get_task_result,
            name=PHONE_GET_TASK_RESULT,
            description="Recover results of phone tasks that already finished (e.g. after a "
            "timeout or a lost connection). Check this before re-running a task.",
        ),
    ]

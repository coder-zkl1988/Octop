"""Agent tools for companion phones, driven against a hub with a fake phone."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Iterator
from contextlib import contextmanager
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

from langgraph.config import var_child_runnable_config
from tests.support.companion import (
    JPEG_BYTES,
    FakePhone,
    FakeSettings,
    auth_frame,
    progress_frame,
    result_frame,
)

from octop.infra.control.mobile.companion.hub import CompanionHub
from octop.infra.control.mobile.companion.pairing import PairingStore
from octop.infra.control.mobile.companion.protocol import parse_auth
from octop.infra.control.mobile.companion.tools import build_phone_tools


@contextmanager
def _configurable(**kwargs: object) -> Iterator[None]:
    token = var_child_runnable_config.set({"configurable": kwargs})
    try:
        yield
    finally:
        var_child_runnable_config.reset(token)


class _Workspace:
    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}

    def upload_bytes(self, path: str, data: bytes) -> None:
        self.files[path] = data


def _user_repo(permissions: list[str]) -> MagicMock:
    repo = MagicMock()
    # Shaped like ``UserRow``: role + stored permissions, no ``is_admin``.
    repo.get.return_value = SimpleNamespace(role="user", permissions=permissions)
    return repo


async def _setup(
    *, permissions: list[str] | None = None
) -> tuple[CompanionHub, dict[str, Any], FakePhone, _Workspace]:
    hub = CompanionHub(PairingStore(FakeSettings()), lambda _b, _k: None, cancel_confirm_s=0.1)
    key, _ = hub.pairing.create(1)
    phone = FakePhone()
    hello = parse_auth(auth_frame("Pixel-1"))
    assert hello is not None
    await hub.attach(key, hello, phone, public_base_url="http://h")
    workspace = _Workspace()
    tools = build_phone_tools(
        hub,
        user_repo=_user_repo(permissions if permissions is not None else ["mobile"]),
        workspace_for=lambda _agent_id: workspace,
    )
    return hub, {t.name: t for t in tools}, phone, workspace


def _ctx() -> Any:
    return _configurable(user="1", user_is_admin=False, agent_id="a1", locale="en")


async def test_list_devices_scoped_to_caller() -> None:
    hub, tools, _phone, _ws = await _setup()
    key, _ = hub.pairing.create(2)
    other = parse_auth(auth_frame("Other-2"))
    assert other is not None
    await hub.attach(key, other, FakePhone(), public_base_url="http://h")
    with _ctx():
        data = json.loads(await tools["phone_list_devices"].ainvoke({}))
    assert [d["device_id"] for d in data["devices"]] == ["Pixel-1"]
    with _configurable(user="9", user_is_admin=True):
        data = json.loads(await tools["phone_list_devices"].ainvoke({}))
    assert {d["device_id"] for d in data["devices"]} == {"Pixel-1", "Other-2"}


async def test_permission_is_required() -> None:
    _hub, tools, _phone, _ws = await _setup(permissions=["browser"])
    with _ctx():
        data = json.loads(await tools["phone_list_devices"].ainvoke({}))
    assert "permission" in data["error"]


async def test_run_task_picks_the_only_online_phone_and_saves_screenshot() -> None:
    _hub, tools, phone, workspace = await _setup()

    async def phone_script() -> None:
        execute = await phone.next_method("agent.execute")
        task_id = execute["params"]["taskId"]
        assert execute["params"]["task"] == "open settings"
        await _hub.handle_message("Pixel-1", phone, progress_frame(task_id, 1))
        await _hub.handle_message("Pixel-1", phone, result_frame(task_id, message="Android 15"))

    script = asyncio.create_task(phone_script())
    with _ctx():
        data = json.loads(await tools["phone_run_task"].ainvoke({"task": "open settings"}))
    await script
    assert data["status"] == "completed" and data["success"] is True
    assert data["message"] == "Android 15" and data["device_id"] == "Pixel-1"
    path = data["screenshot_path"]
    assert path.startswith("outbound/screenshots/phone_") and path.endswith("_final.jpg")
    assert workspace.files[path] == JPEG_BYTES


async def test_run_task_reports_interaction_then_resumes() -> None:
    hub, tools, phone, _ws = await _setup()

    async def ask() -> str:
        execute = await phone.next_method("agent.execute")
        task_id = str(execute["params"]["taskId"])
        await hub.handle_message("Pixel-1", phone, progress_frame(task_id, 2, interaction="OK?"))
        return task_id

    script = asyncio.create_task(ask())
    with _ctx():
        paused = json.loads(await tools["phone_run_task"].ainvoke({"task": "t"}))
    task_id = await script
    assert paused["status"] == "needs_interaction"
    assert paused["session_id"] == task_id and paused["question"] == "OK?"
    assert paused["screenshot_path"]

    async def finish() -> None:
        guidance = await phone.next_method("agent.execute")
        assert guidance["params"]["guidance"] == "yes"
        await hub.handle_message("Pixel-1", phone, result_frame(task_id))

    script2 = asyncio.create_task(finish())
    with _ctx():
        done = json.loads(
            await tools["phone_run_task"].ainvoke(
                {"task": "t", "session_id": task_id, "guidance": "yes"}
            )
        )
    await script2
    assert done["status"] == "completed" and done["task_id"] == task_id


async def test_run_task_errors_are_returned_as_json() -> None:
    hub, tools, _phone, _ws = await _setup()
    with _ctx():
        unknown = json.loads(
            await tools["phone_run_task"].ainvoke({"task": "t", "device_id": "Nope"})
        )
    assert "unknown phone" in unknown["error"]
    await hub.unpair("Pixel-1")
    with _ctx():
        none = json.loads(await tools["phone_run_task"].ainvoke({"task": "t"}))
    assert "No phone is paired" in none["error"]


async def test_cancel_and_recover_results() -> None:
    hub, tools, phone, workspace = await _setup()
    run = asyncio.create_task(hub.run_task("Pixel-1", "long task"))
    execute = await phone.next_method("agent.execute")
    task_id = execute["params"]["taskId"]
    with _ctx():
        cancelled = json.loads(await tools["phone_cancel_task"].ainvoke({}))
    assert cancelled["task_id"] == task_id and cancelled["status"] == "aborted"
    await run
    with _ctx():
        listed = json.loads(await tools["phone_get_task_result"].ainvoke({}))
        exact = json.loads(await tools["phone_get_task_result"].ainvoke({"task_id": task_id}))
        missing = json.loads(await tools["phone_get_task_result"].ainvoke({"task_id": "t_x"}))
    assert [r["task_id"] for r in listed["results"]] == [task_id]
    assert listed["results"][0]["screenshot_path"] is None
    assert exact["results"][0]["task_id"] == task_id
    assert "no finished result" in missing["error"]
    assert workspace.files == {}

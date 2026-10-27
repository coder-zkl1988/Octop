"""CompanionHub: handshake, task lifecycle, acks, timeouts and reconnects."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest
from tests.support.companion import (
    JPEG_BYTES,
    FakePhone,
    FakeSettings,
    auth_frame,
    mirror_frame,
    progress_frame,
    result_frame,
)

from octop.infra.control.mobile.companion.hub import (
    CompanionError,
    CompanionHub,
    NeedsInteraction,
)
from octop.infra.control.mobile.companion.pairing import PairingError, PairingStore
from octop.infra.control.mobile.companion.protocol import TaskResult, parse_auth

BASE = "http://octop.lan:8088"


def _vlm(base: str, key: str) -> dict[str, Any]:
    return {"apiUrl": f"{base}/api/mobile/companion/vlm/v1", "apiKey": key, "model": "m"}


def _hub(**kwargs: Any) -> CompanionHub:
    kwargs.setdefault("cancel_confirm_s", 0.3)
    return CompanionHub(PairingStore(FakeSettings()), _vlm, **kwargs)


async def _pair(
    hub: CompanionHub, device_id: str = "Pixel-1", *, user_id: int = 1
) -> tuple[FakePhone, str]:
    key, _ = hub.pairing.create(user_id)
    phone = FakePhone()
    hello = parse_auth(auth_frame(device_id))
    assert hello is not None
    await hub.attach(key, hello, phone, public_base_url=BASE)
    return phone, key


async def _start(hub: CompanionHub, phone: FakePhone, **kwargs: Any) -> tuple[asyncio.Task, str]:
    task = asyncio.create_task(hub.run_task("Pixel-1", "open settings", **kwargs))
    execute = await phone.next_method("agent.execute")
    return task, execute["params"]["taskId"]


async def test_attach_sends_connected_with_proxy_credentials() -> None:
    hub = _hub()
    phone, key = await _pair(hub)
    connected = await phone.next()
    assert connected["type"] == "connected"
    assert connected["serverSessionId"] == "Pixel-1"
    assert connected["vlm"]["apiKey"] == key
    assert connected["vlm"]["apiUrl"] == f"{BASE}/api/mobile/companion/vlm/v1"
    [view] = hub.list_devices()
    assert view.online and view.model == "Pixel 9" and view.android_sdk == 35


async def test_attach_rejects_foreign_key() -> None:
    hub = _hub()
    _phone, key = await _pair(hub)
    other = parse_auth(auth_frame("Other-2"))
    assert other is not None
    with pytest.raises(PairingError):
        await hub.attach(key, other, FakePhone(), public_base_url=BASE)


async def test_task_completes_and_result_is_acked() -> None:
    hub = _hub()
    phone, _ = await _pair(hub)
    task, task_id = await _start(hub, phone, max_steps=30)
    assert hub.list_devices()[0].running_task_id == task_id
    await hub.handle_message("Pixel-1", phone, progress_frame(task_id, 1))
    assert hub.list_devices()[0].running_step == 1
    await hub.handle_message("Pixel-1", phone, result_frame(task_id, message="Android 15"))
    result = await asyncio.wait_for(task, 5)
    assert isinstance(result, TaskResult)
    assert result.success and result.message == "Android 15"
    assert result.final_screenshot == JPEG_BYTES
    ack = await phone.next_method("agent.result_ack")
    assert ack["params"]["taskId"] == task_id
    assert hub.list_devices()[0].running_task_id is None
    assert hub.find_result(task_id) is not None


async def test_replayed_result_is_acked_and_stored_once() -> None:
    hub = _hub()
    phone, _ = await _pair(hub)
    await hub.handle_message("Pixel-1", phone, result_frame("t_old"))
    await hub.handle_message("Pixel-1", phone, result_frame("t_old"))
    assert (await phone.next_method("agent.result_ack"))["params"]["taskId"] == "t_old"
    assert (await phone.next_method("agent.result_ack"))["params"]["taskId"] == "t_old"
    assert [r.task_id for r in hub.recent_results()] == ["t_old"]


async def test_one_task_per_device() -> None:
    hub = _hub()
    phone, _ = await _pair(hub)
    task, task_id = await _start(hub, phone)
    with pytest.raises(CompanionError) as exc:
        await hub.run_task("Pixel-1", "another")
    assert exc.value.code == "TASK_ALREADY_RUNNING"
    await hub.handle_message("Pixel-1", phone, result_frame(task_id))
    await asyncio.wait_for(task, 5)


async def test_offline_device_is_rejected() -> None:
    hub = _hub()
    with pytest.raises(CompanionError) as exc:
        await hub.run_task("Ghost", "x")
    assert exc.value.code == "DEVICE_OFFLINE"


async def test_interaction_pause_and_guidance_resume() -> None:
    hub = _hub()
    phone, _ = await _pair(hub)
    task, task_id = await _start(hub, phone)
    await hub.handle_message("Pixel-1", phone, progress_frame(task_id, 4, interaction="Log in?"))
    paused = await asyncio.wait_for(task, 5)
    assert isinstance(paused, NeedsInteraction)
    assert paused.task_id == task_id and paused.message == "Log in?"
    assert paused.screenshot == JPEG_BYTES

    resume = asyncio.create_task(
        hub.run_task("Pixel-1", "open settings", guidance="skip login", session_id=task_id)
    )
    guidance = await phone.next_method("agent.execute")
    assert guidance["params"]["sessionId"] == task_id
    assert guidance["params"]["guidance"] == "skip login"
    receipt_id = guidance["params"]["taskId"]
    assert receipt_id != task_id
    # The transport receipt for the guidance must not end the wait.
    await hub.handle_message("Pixel-1", phone, result_frame(receipt_id, message="delivered"))
    await asyncio.sleep(0.05)
    assert not resume.done()
    await hub.handle_message("Pixel-1", phone, result_frame(task_id, message="finished"))
    result = await asyncio.wait_for(resume, 5)
    assert isinstance(result, TaskResult) and result.message == "finished"


async def test_cancel_waits_for_phone_confirmation() -> None:
    hub = _hub(cancel_confirm_s=5)
    phone, _ = await _pair(hub)
    task, task_id = await _start(hub, phone)
    cancel = asyncio.create_task(hub.cancel_task("Pixel-1"))
    msg = await phone.next_method("agent.cancel")
    assert msg["params"]["taskId"] == task_id
    await hub.handle_message("Pixel-1", phone, result_frame(task_id, status="aborted"))
    cancelled = await asyncio.wait_for(cancel, 5)
    assert cancelled.status == "aborted"
    assert (await asyncio.wait_for(task, 5)).status == "aborted"  # type: ignore[union-attr]


async def test_unconfirmed_cancel_is_synthesized() -> None:
    hub = _hub(cancel_confirm_s=0.05)
    phone, _ = await _pair(hub)
    task, _task_id = await _start(hub, phone)
    result = await hub.cancel_task("Pixel-1")
    assert result.status == "aborted" and result.error_code == "CANCEL_NOT_CONFIRMED"
    assert (await asyncio.wait_for(task, 5)).error_code == "CANCEL_NOT_CONFIRMED"  # type: ignore[union-attr]
    with pytest.raises(CompanionError):
        await hub.cancel_task("Pixel-1")


async def test_no_first_step_times_out_and_cancels() -> None:
    hub = _hub(first_step_timeout_s=0.05, cancel_confirm_s=0.05)
    phone, _ = await _pair(hub)
    task, task_id = await _start(hub, phone)
    assert (await phone.next_method("agent.cancel"))["params"]["taskId"] == task_id
    result = await asyncio.wait_for(task, 5)
    assert isinstance(result, TaskResult) and result.error_code == "NO_FIRST_STEP"


async def test_idle_timeout_and_late_result_supersedes() -> None:
    hub = _hub(cancel_confirm_s=0.05)
    phone, _ = await _pair(hub)
    task, task_id = await _start(hub, phone, idle_timeout_s=1.0)
    await hub.handle_message("Pixel-1", phone, progress_frame(task_id, 1))
    result = await asyncio.wait_for(task, 5)
    assert isinstance(result, TaskResult) and result.error_code == "TIMEOUT"
    await hub.handle_message("Pixel-1", phone, result_frame(task_id, message="late but done"))
    stored = hub.find_result(task_id)
    assert stored is not None and stored.message == "late but done"


async def test_caller_cancellation_stops_phone() -> None:
    hub = _hub(cancel_confirm_s=0.05)
    phone, _ = await _pair(hub)
    task, task_id = await _start(hub, phone)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert (await phone.next_method("agent.cancel"))["params"]["taskId"] == task_id


async def test_reconnect_replaces_socket_and_task_survives() -> None:
    hub = _hub()
    phone, key = await _pair(hub)
    task, task_id = await _start(hub, phone)
    hub.detach("Pixel-1", phone)
    assert not hub.list_devices()[0].online
    newer = FakePhone()
    hello = parse_auth(auth_frame("Pixel-1"))
    assert hello is not None
    await hub.attach(key, hello, newer, public_base_url=BASE)
    # A late frame or close from the old socket is ignored.
    await hub.handle_message("Pixel-1", phone, result_frame(task_id, message="stale"))
    hub.detach("Pixel-1", phone)
    assert hub.list_devices()[0].online
    await hub.handle_message("Pixel-1", newer, result_frame(task_id, message="replayed"))
    result = await asyncio.wait_for(task, 5)
    assert isinstance(result, TaskResult) and result.message == "replayed"


async def test_second_connection_closes_the_first() -> None:
    hub = _hub()
    phone, key = await _pair(hub)
    hello = parse_auth(auth_frame("Pixel-1"))
    assert hello is not None
    await hub.attach(key, hello, FakePhone(), public_base_url=BASE)
    assert phone.closed is not None and phone.closed[0] == 4000


async def test_frames_update_snapshot_and_device_info() -> None:
    hub = _hub()
    phone, _ = await _pair(hub)
    assert hub.snapshot("Pixel-1") is None
    await hub.handle_message("Pixel-1", phone, mirror_frame(current_app="com.android.settings"))
    await hub.handle_message(
        "Pixel-1",
        phone,
        {"channel": "control", "event": "device_info", "batteryLevel": 42, "isCharging": True},
    )
    assert hub.snapshot("Pixel-1") == JPEG_BYTES
    [view] = hub.list_devices()
    assert view.current_app == "com.android.settings"
    assert view.battery_level == 42 and view.is_charging is True and view.has_snapshot


async def test_unpair_closes_and_fails_running_task() -> None:
    hub = _hub()
    phone, key = await _pair(hub)
    task, _task_id = await _start(hub, phone)
    assert await hub.unpair("Pixel-1")
    assert phone.closed is not None and phone.closed[0] == 4003
    result = await asyncio.wait_for(task, 5)
    assert isinstance(result, TaskResult) and result.error_code == "UNPAIRED"
    assert hub.list_devices() == []
    hello = parse_auth(auth_frame("Pixel-1"))
    assert hello is not None
    with pytest.raises(PairingError):
        await hub.attach(key, hello, FakePhone(), public_base_url=BASE)


async def test_refresh_credentials_resends_connected() -> None:
    hub = _hub()
    phone, _ = await _pair(hub)
    await phone.next()
    await hub.refresh_credentials()
    assert (await phone.next())["type"] == "connected"


async def test_listing_is_scoped_by_owner() -> None:
    hub = _hub()
    await _pair(hub, "A", user_id=1)
    await _pair(hub, "B", user_id=2)
    assert [v.device_id for v in hub.list_devices(1)] == ["A"]
    assert {v.device_id for v in hub.list_devices()} == {"A", "B"}
    assert hub.owner_of("B") == 2
    assert hub.owner_of("nope") is None


# ----- live mirror -----


async def test_first_viewer_starts_live_stream_and_gets_replay() -> None:
    from tests.support.companion import FakeViewer, h264_frame

    hub = _hub()
    phone, _ = await _pair(hub)
    await phone.next()  # connected
    await hub.handle_message("Pixel-1", phone, mirror_frame())
    key = h264_frame(keyframe=True)
    await hub.handle_binary("Pixel-1", phone, key)
    await hub.handle_binary("Pixel-1", phone, h264_frame(keyframe=False))

    viewer = FakeViewer()
    await hub.add_viewer("Pixel-1", viewer)
    start = await phone.next()
    assert start == {"channel": "mirror", "type": "start", "deviceId": "Pixel-1", "fps": 30}
    assert viewer.texts[0]["type"] == "realtime"
    assert viewer.binary == [key]  # latest keyframe only, not the delta


async def test_frames_fan_out_and_unknown_binary_is_dropped() -> None:
    from tests.support.companion import FakeViewer, h264_frame

    hub = _hub()
    phone, _ = await _pair(hub)
    viewer = FakeViewer()
    await hub.add_viewer("Pixel-1", viewer)
    delta = h264_frame(keyframe=False)
    clipboard = bytes([0x00]) + b"\x00" * 13
    await hub.handle_binary("Pixel-1", phone, delta)
    await hub.handle_binary("Pixel-1", phone, clipboard)
    await hub.handle_binary("Pixel-1", phone, bytes([0x7F, 1, 2]))
    await hub.handle_message("Pixel-1", phone, mirror_frame(current_app="com.x"))
    assert viewer.binary == [delta, clipboard]
    assert viewer.texts[-1]["currentApp"] == "com.x"
    # A frame from a replaced socket is ignored.
    await hub.handle_binary("Pixel-1", FakePhone(), delta)
    assert len(viewer.binary) == 2


async def test_viewer_actions_are_wrapped_or_forwarded() -> None:
    hub = _hub()
    phone, _ = await _pair(hub)
    await phone.next()
    assert await hub.mirror_action("Pixel-1", {"type": "click", "x": 10, "y": 20})
    assert await phone.next() == {
        "channel": "mirror",
        "type": "click",
        "deviceId": "Pixel-1",
        "params": {"type": "click", "x": 10, "y": 20},
    }
    assert not await hub.mirror_action("Pixel-1", {"type": "rm -rf"})
    touch = bytes([0x03]) + b"\x00" * 35
    assert await hub.mirror_action("Pixel-1", touch)
    assert phone.sent_bytes == [touch]
    assert not await hub.mirror_action("Ghost", {"type": "click"})


async def test_last_viewer_leaving_returns_to_idle_preview() -> None:
    from tests.support.companion import FakeViewer

    hub = _hub()
    phone, _ = await _pair(hub)
    await phone.next()
    first, second = FakeViewer(), FakeViewer()
    await hub.add_viewer("Pixel-1", first)
    await hub.add_viewer("Pixel-1", second)
    await phone.next()
    await phone.next()
    await hub.remove_viewer("Pixel-1", first)
    assert phone.sent.empty()
    await hub.remove_viewer("Pixel-1", second)
    assert (await phone.next())["fps"] == 3


async def test_viewers_are_told_when_the_phone_goes_away() -> None:
    from tests.support.companion import FakeViewer

    hub = _hub()
    phone, _ = await _pair(hub)
    viewer = FakeViewer()
    await hub.add_viewer("Pixel-1", viewer)
    hub.detach("Pixel-1", phone)
    await asyncio.sleep(0.05)
    assert viewer.texts[-1] == {"channel": "mirror", "type": "device_disconnected"}
    assert viewer.closed is not None
    with pytest.raises(CompanionError):
        await hub.add_viewer("Pixel-1", FakeViewer())


async def test_rename_shows_in_listing() -> None:
    hub = _hub()
    await _pair(hub)
    assert await hub.rename("Pixel-1", "  测试机 A ")
    assert hub.list_devices()[0].name == "测试机 A"
    assert not await hub.rename("Ghost", "x")

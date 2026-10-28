"""TabbyApp wire protocol: lenient parsing and outbound frames."""

from __future__ import annotations

from tests.support.companion import (
    JPEG_BYTES,
    auth_frame,
    mirror_frame,
    progress_frame,
    result_frame,
)

from octop.infra.control.mobile.companion import protocol


def test_parse_auth_reads_device_and_capabilities() -> None:
    hello = protocol.parse_auth(auth_frame("Pixel-abc"))
    assert hello is not None
    assert hello.device_id == "Pixel-abc"
    assert hello.info.model == "Pixel 9"
    assert hello.info.android_sdk == 35
    assert hello.info.screen_width == 1080
    assert hello.info.battery_level == 80
    assert hello.info.is_charging is False


def test_parse_auth_accepts_snake_case_id_and_rejects_missing() -> None:
    hello = protocol.parse_auth({"type": "auth", "device_id": "X-1"})
    assert hello is not None and hello.device_id == "X-1"
    assert protocol.parse_auth({"type": "auth", "deviceId": "  "}) is None
    assert protocol.parse_auth({"channel": "skill", "method": "skill.hello"}) is None


def test_parse_progress_with_interaction_request() -> None:
    plain = protocol.parse_progress(progress_frame("t_1", 2))
    assert plain is not None
    assert (plain.task_id, plain.step, plain.action) == ("t_1", 2, "CLICK")
    assert plain.screenshot == JPEG_BYTES
    assert plain.interaction_message is None

    asking = protocol.parse_progress(progress_frame("t_1", 3, interaction="Log in?"))
    assert asking is not None
    assert asking.interaction_message == "Log in?"
    assert asking.interaction_screenshot == JPEG_BYTES


def test_parse_result_and_ids() -> None:
    msg = result_frame("t_9", status="blocked", message="POLICY_X: nope")
    assert protocol.result_task_id(msg) == "t_9"
    result = protocol.parse_result(msg, device_id="d")
    assert result is not None
    assert result.status == "blocked" and not result.success
    assert result.total_steps == 3 and result.duration_ms == 4200
    assert result.final_screenshot == JPEG_BYTES


def test_unknown_status_falls_back_on_success_flag() -> None:
    msg = {"channel": "task", "id": "resp_t", "result": {"success": True, "status": "weird"}}
    result = protocol.parse_result(msg, device_id="d")
    assert result is not None and result.status == "completed"


def test_media_and_non_result_frames_are_not_results() -> None:
    assert protocol.result_task_id({"id": "resp_media_1", "result": {}}) is None
    assert protocol.result_task_id({"id": "resp_t1"}) is None
    assert protocol.result_task_id(progress_frame("t", 1)) is None


def test_mirror_frame_decodes_jpeg() -> None:
    frame = protocol.parse_mirror_frame(mirror_frame(current_app="com.x"))
    assert frame is not None
    assert frame.jpeg == JPEG_BYTES and frame.current_app == "com.x"
    assert protocol.parse_mirror_frame({"channel": "mirror", "type": "start"}) is None


def test_decode_image_tolerates_data_urls_and_garbage() -> None:
    assert protocol.decode_image("data:image/jpeg;base64,aGk=") == b"hi"
    assert protocol.decode_image("") is None
    assert protocol.decode_image(123) is None


def test_outbound_frames() -> None:
    execute = protocol.execute_message("t_1", "open settings", max_steps=20)
    assert execute["id"] == "t_1" and execute["method"] == "agent.execute"
    assert execute["params"] == {
        "taskId": "t_1",
        "task": "open settings",
        "mode": "autonomous",
        "maxSteps": 20,
    }
    resume = protocol.execute_message("t_2", "x", guidance="yes", session_id="t_1")
    assert resume["params"]["guidance"] == "yes"
    assert resume["params"]["sessionId"] == "t_1"
    assert protocol.cancel_message("t_1")["params"] == {"taskId": "t_1"}
    assert protocol.result_ack_message("t_1")["method"] == "agent.result_ack"
    connected = protocol.connected_message("d", None)
    assert connected["type"] == "connected" and "vlm" not in connected
    assert protocol.connected_message("d", {"model": "m"})["vlm"] == {"model": "m"}


def test_unknown_foreground_app_is_treated_as_empty() -> None:
    frame = protocol.parse_mirror_frame(mirror_frame(current_app="unknown"))
    assert frame is not None and frame.current_app == ""
    assert protocol.parse_phone_info({"currentApp": "Unknown"}).current_app == ""

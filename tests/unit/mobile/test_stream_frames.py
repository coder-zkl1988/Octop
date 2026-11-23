"""Tests for the mobile JPEG fallback stream (``_stream_frames``)."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest
from starlette.websockets import WebSocketState

from octop.api.routers.mobile import stream as mobile_stream


class _FakeWS:
    """Minimal WebSocket double: records frames, can drop itself after N frames."""

    def __init__(self, *, stop_after_frames: int | None = None) -> None:
        self.application_state = WebSocketState.CONNECTED
        self.sent: list[dict[str, Any]] = []
        self._stop_after_frames = stop_after_frames

    async def send_text(self, payload: str) -> None:
        message = json.loads(payload)
        self.sent.append(message)
        if self._stop_after_frames is None or message.get("type") != "frame":
            return
        frames = sum(1 for m in self.sent if m.get("type") == "frame")
        if frames >= self._stop_after_frames:
            self.application_state = WebSocketState.DISCONNECTED

    @property
    def types(self) -> list[str]:
        return [m.get("type") for m in self.sent]


class _FakeH264WS:
    def __init__(self) -> None:
        self.application_state = WebSocketState.CONNECTED
        self.sent: list[dict[str, Any]] = []
        self.binary: list[bytes] = []

    async def send_text(self, payload: str) -> None:
        self.sent.append(json.loads(payload))

    async def send_bytes(self, payload: bytes) -> None:
        self.binary.append(payload)


def _run(
    ws: _FakeWS,
    *,
    frame_dims: list[int] | None = None,
    timeout: float = 6.0,
) -> None:
    """Drive ``_stream_frames`` to completion; a stream that never ends is a failure."""
    asyncio.run(
        asyncio.wait_for(
            mobile_stream._stream_frames(
                ws,
                device="emulator-5554",
                quality=80,
                max_fps=20.0,
                max_side=1080,
                frame_dims=frame_dims if frame_dims is not None else [0, 0],
            ),
            timeout=timeout,
        )
    )


def test_stream_frames_stops_and_reports_after_persistent_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A dead device must end the stream with one error frame, not spin forever.

    ``capture_jpeg_frame`` failing on every call is exactly what an unplugged
    phone or a dead adb bridge looks like. The desktop stream stops after a run
    of consecutive misses and tells the client; this JPEG fallback used to retry
    at the frame interval indefinitely, flooding the log while the canvas stayed
    frozen on its last frame with no explanation.
    """
    monkeypatch.setattr(mobile_stream, "find_adb", lambda: None)
    monkeypatch.setattr(mobile_stream, "capture_jpeg_frame", lambda *_a, **_k: None)

    ws = _FakeWS()
    _run(ws)

    assert ws.types == ["error"]
    assert "capture" in str(ws.sent[0]["message"])


def test_stream_frames_keeps_going_when_misses_are_not_consecutive(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An occasional dropped frame must not tear the stream down."""
    monkeypatch.setattr(mobile_stream, "find_adb", lambda: None)

    calls = {"n": 0}

    def fake_capture(*_args: object, **_kwargs: object) -> tuple[bytes, int, int, int, int] | None:
        calls["n"] += 1
        if calls["n"] % 2 == 1:
            return None
        return (b"jpeg-bytes", 10, 20, 1080, 1920)

    monkeypatch.setattr(mobile_stream, "capture_jpeg_frame", fake_capture)

    frame_dims = [0, 0]
    ws = _FakeWS(stop_after_frames=4)
    _run(ws, frame_dims=frame_dims)

    assert ws.types == ["frame"] * 4
    assert frame_dims == [1080, 1920]


def test_parse_stream_size_rejects_invalid_dimensions() -> None:
    assert mobile_stream._parse_stream_size("720x1600") == (720, 1600)
    assert mobile_stream._parse_stream_size(" 1080x2400 ") == (1080, 2400)
    assert mobile_stream._parse_stream_size("720") is None
    assert mobile_stream._parse_stream_size("0x1600") is None


def test_h264_stream_keeps_encoded_and_physical_sizes_separate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FakeStdout:
        def __init__(self) -> None:
            start = b"\x00\x00\x00\x01"
            self._chunks = [
                start + b"\x67\x64\x00\x2a" + start,
                b"\x68\xee\x3c\x80" + start + b"\x65\x88\x84" + start,
                b"",
            ]

        async def read(self, _size: int) -> bytes:
            return self._chunks.pop(0)

    class _FakeProcess:
        def __init__(self) -> None:
            self.stdout = _FakeStdout()
            self.returncode = 0

    async def fake_create_process(*_args: object, **_kwargs: object) -> _FakeProcess:
        return _FakeProcess()

    monkeypatch.setattr(mobile_stream, "find_adb", lambda: "/usr/bin/adb")
    monkeypatch.setattr(mobile_stream, "find_scrcpy_server", lambda: None)
    monkeypatch.setattr(mobile_stream, "wm_size", lambda *_args, **_kwargs: (1080, 2400))
    monkeypatch.setattr(mobile_stream.asyncio, "create_subprocess_exec", fake_create_process)

    ws = _FakeH264WS()
    frame_dims = [0, 0]
    first_frame = asyncio.Event()

    asyncio.run(
        mobile_stream._stream_h264(
            ws,
            device="device-1",
            frame_dims=frame_dims,
            first_frame=first_frame,
            max_fps=30.0,
            max_side=720,
        )
    )

    assert frame_dims == [1080, 2400]
    assert ws.sent[0]["type"] == "video_init"
    assert (ws.sent[0]["width"], ws.sent[0]["height"]) == (720, 1600)
    assert len(ws.binary) == 1
    assert first_frame.is_set()

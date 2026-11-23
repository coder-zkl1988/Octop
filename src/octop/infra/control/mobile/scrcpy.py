"""Small scrcpy-server transport used by the ADB mirror."""

from __future__ import annotations

import asyncio
import contextlib
import os
import secrets
import shutil
import socket
import struct
from dataclasses import dataclass
from pathlib import Path

SCRCPY_SERVER_VERSION = "5.0.1"
SCRCPY_SERVER_CLASS = "com.genymobile.scrcpy.Server"
SCRCPY_CODEC_H264 = b"h264"
_REMOTE_SERVER_PATH = "/data/local/tmp/octop-scrcpy-server.jar"
_SERVER_SOCKET_PREFIX = "localabstract:scrcpy_"
_FRAME_FLAG_CONFIG = 1 << 62
_FRAME_FLAG_KEY = 1 << 61
_FRAME_PTS_MASK = (1 << 61) - 1
_MAX_PACKET_BYTES = 64 * 1024 * 1024


@dataclass(frozen=True)
class ScrcpyFrame:
    payload: bytes
    pts_us: int
    config: bool
    keyframe: bool


def find_scrcpy_server() -> Path | None:
    """Find the pinned server jar bundled with Octop or a local scrcpy install."""

    candidates: list[Path] = []
    configured = os.environ.get("OCTOP_SCRCPY_SERVER", "").strip()
    if configured:
        candidates.append(Path(configured).expanduser())

    candidates.append(Path(__file__).with_name("scrcpy-server.jar"))

    client = shutil.which("scrcpy")
    if client:
        client_path = Path(client).resolve()
        candidates.extend(
            (
                client_path.with_name("scrcpy-server"),
                client_path.parent.parent / "share" / "scrcpy" / "scrcpy-server",
            )
        )

    seen: set[Path] = set()
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except OSError:
            continue
        if resolved in seen:
            continue
        seen.add(resolved)
        try:
            if resolved.is_file() and resolved.stat().st_size > 100_000:
                return resolved
        except OSError:
            continue
    return None


def build_server_command(
    adb: str,
    device: str,
    *,
    remote_path: str,
    scid: str,
    max_size: int,
    bit_rate: int,
    max_fps: float,
) -> list[str]:
    """Build the standalone scrcpy server command for one ADB device."""

    args = [
        adb,
        "-s",
        device,
        "shell",
        f"CLASSPATH={remote_path}",
        "app_process",
        "/",
        SCRCPY_SERVER_CLASS,
        SCRCPY_SERVER_VERSION,
        f"scid={scid}",
        "log_level=error",
        "tunnel_forward=true",
        "audio=false",
        "control=false",
        "cleanup=true",
        "send_device_meta=false",
        "send_dummy_byte=false",
        "send_stream_meta=true",
        "send_frame_meta=true",
        f"video_bit_rate={bit_rate}",
    ]
    if max_size > 0:
        args.append(f"max_size={max_size}")
    if max_fps > 0:
        args.append(f"max_fps={max_fps:g}")
    return args


def parse_frame_meta(meta: bytes) -> tuple[int, int, bool, bool, bool]:
    """Parse scrcpy's 12-byte frame header."""

    if len(meta) != 12:
        raise ValueError("scrcpy frame metadata must be 12 bytes")
    flags, size = struct.unpack(">QI", meta)
    if size > _MAX_PACKET_BYTES:
        raise ValueError(f"scrcpy frame is too large: {size}")
    return (
        flags & _FRAME_PTS_MASK,
        size,
        bool(flags & _FRAME_FLAG_CONFIG),
        bool(flags & _FRAME_FLAG_KEY),
        bool(flags & (1 << 63)),
    )


class ScrcpyStream:
    """One framed H.264 stream from a standalone scrcpy server."""

    def __init__(
        self,
        *,
        adb: str,
        device: str,
        port: int,
        process: asyncio.subprocess.Process,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        self.adb = adb
        self.device = device
        self.port = port
        self.process = process
        self.reader = reader
        self.writer = writer
        self.width = 0
        self.height = 0
        self._drain_task: asyncio.Task[None] | None = None

    @classmethod
    async def start(
        cls,
        *,
        adb: str,
        device: str,
        server_path: Path,
        max_size: int,
        bit_rate: int,
        max_fps: float,
    ) -> ScrcpyStream:
        scid = f"{secrets.randbits(31):08x}"
        remote_path = _REMOTE_SERVER_PATH
        await _run_adb(adb, device, "push", str(server_path), remote_path)

        process = await asyncio.create_subprocess_exec(
            *build_server_command(
                adb,
                device,
                remote_path=remote_path,
                scid=scid,
                max_size=max_size,
                bit_rate=bit_rate,
                max_fps=max_fps,
            ),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        drain_task = asyncio.create_task(_drain_process_output(process))
        port = _reserve_local_port()
        stream: ScrcpyStream | None = None
        try:
            await _wait_for_server_socket(adb, device, scid)
            await _run_adb(
                adb,
                device,
                "forward",
                f"tcp:{port}",
                f"{_SERVER_SOCKET_PREFIX}{scid}",
            )
            reader, writer = await _open_connection(port)
            stream = cls(
                adb=adb,
                device=device,
                port=port,
                process=process,
                reader=reader,
                writer=writer,
            )
            stream._drain_task = drain_task
            await stream._read_stream_header()
            return stream
        except BaseException:
            if stream is not None:
                await stream.close()
            else:
                drain_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await drain_task
                with contextlib.suppress(Exception):
                    await _run_adb(
                        adb,
                        device,
                        "forward",
                        "--remove",
                        f"tcp:{port}",
                        timeout=2.0,
                    )
                await _stop_process(process)
            raise

    async def _read_stream_header(self) -> None:
        codec = await self.reader.readexactly(4)
        if codec != SCRCPY_CODEC_H264:
            raise RuntimeError(f"scrcpy returned unsupported codec: {codec!r}")
        session = await self.reader.readexactly(12)
        flags, width, height = struct.unpack(">III", session)
        if not flags & (1 << 31) or width <= 0 or height <= 0:
            raise RuntimeError("invalid scrcpy video session metadata")
        self.width = width
        self.height = height

    async def read_frame(self) -> ScrcpyFrame:
        meta = await self.reader.readexactly(12)
        pts_us, size, config, keyframe, session = parse_frame_meta(meta)
        if session:
            raise RuntimeError("unexpected scrcpy session packet")
        payload = await self.reader.readexactly(size)
        return ScrcpyFrame(payload, pts_us, config, keyframe)

    async def close(self) -> None:
        self.writer.close()
        with contextlib.suppress(Exception):
            await self.writer.wait_closed()
        with contextlib.suppress(Exception):
            await _run_adb(
                self.adb,
                self.device,
                "forward",
                "--remove",
                f"tcp:{self.port}",
                timeout=2.0,
            )
        await _stop_process(self.process)
        if self._drain_task is not None:
            self._drain_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._drain_task


async def _run_adb(
    adb: str,
    device: str,
    *args: str,
    timeout: float = 8.0,
) -> tuple[bytes, bytes]:
    process = await asyncio.create_subprocess_exec(
        adb,
        "-s",
        device,
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
    except TimeoutError:
        process.kill()
        await process.wait()
        raise
    if process.returncode != 0:
        detail = (stderr or stdout).decode(errors="replace").strip()
        raise RuntimeError(f"adb {' '.join(args)} failed: {detail or process.returncode}")
    return stdout, stderr


async def _wait_for_server_socket(adb: str, device: str, scid: str) -> None:
    marker = f"@scrcpy_{scid}"
    for _ in range(60):
        try:
            stdout, _ = await _run_adb(adb, device, "shell", "cat", "/proc/net/unix", timeout=2.0)
        except (OSError, RuntimeError, TimeoutError):
            stdout = b""
        if marker.encode() in stdout:
            return
        await asyncio.sleep(0.05)
    raise TimeoutError("scrcpy server socket did not become ready")


async def _open_connection(port: int) -> tuple[asyncio.StreamReader, asyncio.StreamWriter]:
    last_error: OSError | None = None
    for _ in range(30):
        try:
            return await asyncio.open_connection("127.0.0.1", port)
        except OSError as exc:
            last_error = exc
            await asyncio.sleep(0.05)
    raise last_error or OSError("scrcpy tunnel connection failed")


async def _drain_process_output(process: asyncio.subprocess.Process) -> None:
    stdout = process.stdout
    if stdout is None:
        return
    while await stdout.read(4096):
        pass


async def _stop_process(process: asyncio.subprocess.Process) -> None:
    if process.returncode is not None:
        return
    try:
        await asyncio.wait_for(process.wait(), timeout=1.5)
        return
    except TimeoutError:
        process.terminate()
    with contextlib.suppress(TimeoutError):
        await asyncio.wait_for(process.wait(), timeout=1.5)


def _reserve_local_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])

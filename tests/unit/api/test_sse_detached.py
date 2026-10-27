"""``stream_detached`` keeps the work behind an SSE response alive after a disconnect."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable

from octop.api.routers.chat.sse import stream_detached


async def test_source_finishes_after_client_disconnects() -> None:
    release = asyncio.Event()
    finished = asyncio.Event()
    seen_gone: list[bool] = []

    def make_source(client_gone: Callable[[], Awaitable[bool]]) -> AsyncIterator[str]:
        async def source() -> AsyncIterator[str]:
            try:
                yield "first"
                await release.wait()
                seen_gone.append(await client_gone())
                yield "second"
            finally:
                finished.set()

        return source()

    stream = stream_detached(make_source, name="test")
    assert await stream.__anext__() == "first"
    await stream.aclose()  # what Starlette does when the client goes away
    release.set()
    await asyncio.wait_for(finished.wait(), timeout=2)
    assert seen_gone == [True]


async def test_relays_all_frames_while_listening() -> None:
    def make_source(_gone: Callable[[], Awaitable[bool]]) -> AsyncIterator[str]:
        async def source() -> AsyncIterator[str]:
            for i in range(3):
                yield f"f{i}"

        return source()

    frames = [frame async for frame in stream_detached(make_source, name="test")]
    assert frames == ["f0", "f1", "f2"]


async def test_source_error_ends_stream() -> None:
    def make_source(_gone: Callable[[], Awaitable[bool]]) -> AsyncIterator[str]:
        async def source() -> AsyncIterator[str]:
            yield "ok"
            raise RuntimeError("boom")

        return source()

    frames = [frame async for frame in stream_detached(make_source, name="test")]
    assert frames == ["ok"]

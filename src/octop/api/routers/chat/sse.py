"""SSE / WebSocket frame formatting helpers."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

logger = logging.getLogger(__name__)

# Strong references: a task only referenced by the event loop can be collected.
_DETACHED_STREAMS: set[asyncio.Task[None]] = set()


def json_chunk_default(obj: Any) -> Any:
    """Fallback serializer for types json.dumps can't handle natively."""
    if hasattr(obj, "model_dump"):
        try:
            return obj.model_dump()
        except Exception:
            pass
    if hasattr(obj, "dict"):
        try:
            return obj.dict()
        except Exception:
            pass
    return repr(obj)


def format_sse(event: str, data: Any) -> str:
    if isinstance(data, str):
        payload = data
    else:
        try:
            payload = json.dumps(data, ensure_ascii=False, default=json_chunk_default)
        except Exception:
            payload = json.dumps({"type": "error", "message": "chunk not serializable"})
    return f"event: {event}\ndata: {payload}\n\n"


async def stream_detached(
    make_source: Callable[[Callable[[], Awaitable[bool]]], AsyncIterator[str]],
    *,
    name: str,
) -> AsyncIterator[str]:
    """Forward SSE frames from a source that keeps running after the client leaves.

    Starlette cancels the response generator when the client disconnects, and
    that cancellation would reach the work behind the stream (its ``finally``
    blocks included). Here the source runs in its own task; frames are relayed
    while the client listens and dropped afterwards. *make_source* receives a
    ``client_gone()`` callable it can poll to skip work only the client needs.
    """
    queue: asyncio.Queue[str | None] = asyncio.Queue()
    listening = True

    async def client_gone() -> bool:
        return not listening

    async def pump() -> None:
        try:
            async for frame in make_source(client_gone):
                if listening:
                    queue.put_nowait(frame)
        except Exception:
            logger.exception("detached stream %s failed", name)
        finally:
            queue.put_nowait(None)

    task = asyncio.create_task(pump(), name=name)
    _DETACHED_STREAMS.add(task)
    task.add_done_callback(_DETACHED_STREAMS.discard)
    try:
        while (frame := await queue.get()) is not None:
            yield frame
    finally:
        listening = False

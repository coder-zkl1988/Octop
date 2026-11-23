from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from octop.api.routers.enterprise import events


class _StreamResponse:
    status_code = 200

    def __init__(self) -> None:
        self.closed = False

    async def aiter_bytes(self):
        yield b": connected\n\n"
        yield b'event: policy.changed\ndata: {"policy_version":2}\n\n'

    async def aclose(self) -> None:
        self.closed = True


class _StreamClient:
    response = _StreamResponse()
    request: httpx.Request | None = None
    closed = False

    def __init__(self, **_: Any) -> None:
        pass

    def build_request(self, method: str, url: str, **kwargs: Any) -> httpx.Request:
        self.request = httpx.Request(method, url, headers=kwargs.get("headers"))
        return self.request

    async def send(self, request: httpx.Request, *, stream: bool = False) -> _StreamResponse:
        assert stream is True
        self.request = request
        return self.response

    async def aclose(self) -> None:
        self.closed = True


@pytest.mark.asyncio
async def test_enterprise_events_proxies_authenticated_stream(monkeypatch: Any) -> None:
    client = _StreamClient()
    monkeypatch.setattr(
        "octop.api.routers.enterprise.httpx.AsyncClient",
        lambda **kwargs: client,
    )
    server = SimpleNamespace(
        services=SimpleNamespace(
            config=SimpleNamespace(enterprise_backend_url="http://enterprise.test")
        ),
        _enterprise_auth_sessions={1: {"cookies": "tb_sess=session; tb_csrf=csrf"}},
    )

    response = await events(SimpleNamespace(id=1), server)
    chunks = [chunk async for chunk in response.body_iterator]

    assert b"policy.changed" in b"".join(chunks)
    assert client.request is not None
    assert client.request.url == "http://enterprise.test/desktop/v1/events"
    assert client.request.headers["cookie"] == "tb_sess=session; tb_csrf=csrf"
    assert client.request.headers["x-csrf-token"] == "csrf"
    assert client.response.closed is True
    assert client.closed is True

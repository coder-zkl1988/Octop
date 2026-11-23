from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from octop.api.routers.enterprise_internal import ChannelPushBody, push_enterprise_channel
from octop.infra.errors import ErrorCode, OctopError


def test_enterprise_channel_push_delegates_to_gateway(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_run(monkeypatch))


async def _run(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OCTOP_ENTERPRISE_INTERNAL_TOKEN", "secret")
    calls: list[tuple[str, str, str, str]] = []

    class Gateway:
        def get_channel(self, channel_id: str):
            return SimpleNamespace(channel_id=channel_id, agent_id="agent-1", kind="feishu")

        async def push_text(self, kind, channel_id, subject, text):
            calls.append((kind, channel_id, subject.subject_id, text))

    server = SimpleNamespace(app_runtime=SimpleNamespace(gateway=Gateway()))
    body = ChannelPushBody(
        agent_id="agent-1", channel_id="channel-1", subject_id="user-1", text="hello"
    )
    assert await push_enterprise_channel(
        body, x_octop_enterprise_token="secret", server=server
    ) == {"delivered": True}
    assert calls == [("feishu", "channel-1", "user-1", "hello")]


def test_enterprise_channel_push_rejects_invalid_token(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reject_invalid_token(monkeypatch))


async def _reject_invalid_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OCTOP_ENTERPRISE_INTERNAL_TOKEN", "secret")
    server = SimpleNamespace(app_runtime=SimpleNamespace(gateway=SimpleNamespace()))
    body = ChannelPushBody(
        agent_id="agent-1", channel_id="channel-1", subject_id="user-1", text="hello"
    )
    with pytest.raises(OctopError) as exc_info:
        await push_enterprise_channel(body, x_octop_enterprise_token="wrong", server=server)
    assert exc_info.value.code is ErrorCode.AUTH_FAILED


def test_enterprise_channel_push_rejects_agent_mismatch(monkeypatch: pytest.MonkeyPatch) -> None:
    asyncio.run(_reject_agent_mismatch(monkeypatch))


async def _reject_agent_mismatch(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OCTOP_ENTERPRISE_INTERNAL_TOKEN", "secret")

    class Gateway:
        def get_channel(self, channel_id: str):
            return SimpleNamespace(channel_id=channel_id, agent_id="other-agent", kind="feishu")

    server = SimpleNamespace(app_runtime=SimpleNamespace(gateway=Gateway()))
    body = ChannelPushBody(
        agent_id="agent-1", channel_id="channel-1", subject_id="user-1", text="hello"
    )
    with pytest.raises(OctopError) as exc_info:
        await push_enterprise_channel(body, x_octop_enterprise_token="secret", server=server)
    assert exc_info.value.code is ErrorCode.NOT_FOUND

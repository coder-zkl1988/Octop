from __future__ import annotations

import json
from typing import Any

import pytest
from langchain_core.messages import ToolMessage

from octop.infra.agents.middleware.enterprise_command_guard import (
    EnterpriseCommandGuardMiddleware,
)


class Settings:
    def __init__(self, data: dict[str, Any]) -> None:
        self.value = json.dumps(data)

    def get(self, key: str) -> str | None:
        return self.value if key == "enterprise_security" else None


class Request:
    def __init__(self, name: str, command: str) -> None:
        self.tool_call = {"id": "call_1", "name": name, "args": {"command": command}}


@pytest.mark.asyncio
async def test_refuses_a_denied_command_and_runs_the_rest() -> None:
    guard = EnterpriseCommandGuardMiddleware(
        settings_repo=Settings({"deny_commands": ["git push --force*"]})
    )
    ran: list[str] = []

    async def handler(request: Any) -> ToolMessage:
        ran.append(request.tool_call["args"]["command"])
        return ToolMessage(content="ok", tool_call_id="call_1")

    blocked = await guard.awrap_tool_call(Request("execute", "git push --force"), handler)  # type: ignore[arg-type]
    assert isinstance(blocked, ToolMessage)
    assert blocked.status == "error"
    assert "git push --force*" in str(blocked.content)
    assert ran == []

    allowed = await guard.awrap_tool_call(Request("execute", "git status"), handler)  # type: ignore[arg-type]
    assert isinstance(allowed, ToolMessage) and allowed.content == "ok"
    other_tool = await guard.awrap_tool_call(Request("read_file", "git push --force"), handler)  # type: ignore[arg-type]
    assert isinstance(other_tool, ToolMessage) and other_tool.content == "ok"
    assert ran == ["git status", "git push --force"]

"""Refuse shell commands the enterprise role policy forbids.

The enterprise policy lists command patterns (``cap.shell.deny_commands``).
The patterns are read on every call, so a new policy applies without
restarting the expert.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import ToolMessage
from langgraph.prebuilt.tool_node import ToolCallRequest
from langgraph.types import Command

from octop.infra import enterprise_security

logger = logging.getLogger(__name__)

_SHELL_TOOLS = frozenset(enterprise_security.TOOL_NAMES["shell.run"])


def _base_name(name: str) -> str:
    return name.rsplit("__", 1)[-1].rsplit(".", 1)[-1]


class EnterpriseCommandGuardMiddleware(AgentMiddleware[Any, Any]):
    """Return an error instead of running a command the enterprise forbids."""

    def __init__(self, *, settings_repo: Any) -> None:
        super().__init__()
        self._settings = settings_repo

    def _blocked(self, request: ToolCallRequest) -> ToolMessage | None:
        tool_call = request.tool_call
        if _base_name(str(tool_call.get("name") or "")) not in _SHELL_TOOLS:
            return None
        args = tool_call.get("args") or {}
        command = args.get("command") if isinstance(args, dict) else None
        if not isinstance(command, str):
            return None
        pattern = enterprise_security.denied_command(
            command, enterprise_security.load(self._settings)
        )
        if pattern is None:
            return None
        logger.info("enterprise policy refused a shell command matching %r", pattern)
        return ToolMessage(
            content=(
                f"企业策略禁止执行这条命令（匹配规则：{pattern}）。"
                "请换一种做法，或者请企业管理员调整角色策略。"
            ),
            tool_call_id=str(tool_call.get("id") or ""),
            status="error",
        )

    def wrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], ToolMessage | Command[Any]],
    ) -> ToolMessage | Command[Any]:
        return self._blocked(request) or handler(request)

    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command[Any]]],
    ) -> ToolMessage | Command[Any]:
        blocked = self._blocked(request)
        if blocked is not None:
            return blocked
        return await handler(request)


__all__ = ["EnterpriseCommandGuardMiddleware"]

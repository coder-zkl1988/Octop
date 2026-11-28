"""Enterprise gate for 共享记忆 (shared Memory spaces and their MCP tokens).

A shared Memory token lets an outside client (Codex, another MCP host) read
and write a memory space and run reviews on Octop's models. In enterprise mode
that is only allowed when the tenant role policy publishes the
``memory_sharing`` module as ``allow``; the local admin role does not bypass it.
Outside enterprise mode nothing changes. A control plane that cannot be
reached denies.
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends

from octop.api.deps import current_user, get_server
from octop.infra.enterprise_client import request as enterprise_request
from octop.infra.enterprise_memory_sharing import enterprise_mode, record_policy, remember
from octop.infra.enterprise_policy import MEMORY_SHARING_MODULE
from octop.infra.errors import ErrorCode, OctopError
from octop.infra.users.identity import User


async def require_memory_sharing_policy(
    user: User = Depends(current_user),
    server: Any = Depends(get_server),
) -> None:
    if not enterprise_mode(server):
        return
    user_id = int(user.id)
    try:
        policy = await enterprise_request(server, user_id, "GET", "/desktop/v1/policy")
    except Exception as exc:  # noqa: BLE001 - fail closed while offline
        remember(server, user_id, False)
        raise OctopError(
            ErrorCode.FORBIDDEN,
            "enterprise policy unavailable",
            details={"policy": MEMORY_SHARING_MODULE},
        ) from exc
    if not record_policy(server, user_id, policy):
        raise OctopError(
            ErrorCode.FORBIDDEN,
            "shared memory is disabled by the enterprise policy",
            details={"policy": MEMORY_SHARING_MODULE},
        )

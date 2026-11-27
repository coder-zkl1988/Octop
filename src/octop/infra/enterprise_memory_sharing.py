"""Per-user cache of the enterprise 共享记忆 policy decision.

The token-authenticated Codex review path has no enterprise session to fetch
the policy with, so it follows the last decision recorded by the session-gated
management API (``api/common/memory_sharing_gate.py``). Unknown means denied.
"""

from __future__ import annotations

import logging
from typing import Any

from octop.infra.enterprise_policy import MEMORY_SHARING_MODULE, enterprise_module_allowed
from octop.infra.errors import ErrorCode, OctopError

logger = logging.getLogger(__name__)

_ALLOWED_KEY = "enterprise.memory_sharing.allowed.{user_id}"


def enterprise_mode(server: Any) -> bool:
    return bool(server.services.config.enterprise_backend_url)


def remember(server: Any, user_id: int, allowed: bool) -> None:
    try:
        server.services.settings_repo.set(
            _ALLOWED_KEY.format(user_id=user_id), "1" if allowed else "0"
        )
    except Exception:  # noqa: BLE001 - the cache only narrows access
        logger.warning("could not cache the memory sharing policy for user %s", user_id)


def remembered_allowed(server: Any, user_id: int) -> bool:
    """Last policy decision for ``user_id``; unknown means denied."""
    try:
        value = server.services.settings_repo.get(_ALLOWED_KEY.format(user_id=user_id))
    except Exception:  # noqa: BLE001
        return False
    return bool(value == "1")


def record_policy(server: Any, user_id: int, policy: dict[str, Any]) -> bool:
    allowed = enterprise_module_allowed(policy, MEMORY_SHARING_MODULE)
    remember(server, user_id, allowed)
    return allowed


def assert_memory_sharing_remembered(server: Any, user_id: int) -> None:
    """Sync check for paths authenticated by a Memory token instead of a session."""
    if enterprise_mode(server) and not remembered_allowed(server, user_id):
        raise OctopError(
            ErrorCode.FORBIDDEN,
            "shared memory is disabled by the enterprise policy",
            details={"policy": MEMORY_SHARING_MODULE},
        )

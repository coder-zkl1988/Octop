"""企业云端沙箱 on the desktop.

When the enterprise lets this member use the platform sandbox, a storage
backend named ``企业云端沙箱`` points experts at it. Its address is the
enterprise control plane and its key is a short-lived member token, refreshed
on every sync; the platform's own sandbox key never reaches this computer.
When access is withdrawn the backend is switched off, not deleted, so experts
that use it fail to start with a clear reason instead of losing their setting.
"""

from __future__ import annotations

import json
from typing import Any

BACKEND_NAME = "企业云端沙箱"
NOTE = "由企业管理，随企业设置同步，不能在这里修改。"


def apply(repo: Any, view: dict[str, Any]) -> str:
    """Bring the managed backend in line with the enterprise. Returns what happened."""
    row = repo.get_by_name(BACKEND_NAME)
    if not view.get("enabled"):
        if row is not None and row.enabled:
            repo.update(row.id, enabled=False)
            return "disabled"
        return "unchanged"
    fields: dict[str, Any] = {
        "kind": "opensandbox",
        "endpoint": str(view["domain"]),
        "secret_key": str(view["api_key"]),
        "region": str(view.get("protocol") or "https"),
        "bucket": str(view.get("image") or ""),
        "config_json": json.dumps(
            {
                "use_server_proxy": True,
                "timeout": int(view.get("timeout") or 1800),
                "managed_by": "enterprise",
                "spec": str(view.get("spec") or ""),
            },
            ensure_ascii=False,
        ),
        "note": NOTE,
    }
    if row is None:
        repo.create(name=BACKEND_NAME, **fields)
        return "created"
    repo.update(row.id, enabled=True, **fields)
    return "updated"

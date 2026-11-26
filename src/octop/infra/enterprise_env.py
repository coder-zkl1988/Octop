"""Environment variables the enterprise delivers to this desktop.

They are applied to the process environment so agent terminals inherit them,
and they win over a member's own variable of the same name. Values stay in
memory only; the names are remembered so a variable the enterprise withdraws
is removed, or handed back to the member's own value.
"""

from __future__ import annotations

import json
import os
import re
from collections.abc import Mapping
from typing import Any

from octop.infra.desktop import shell_owned_env_key

SETTINGS_KEY = "enterprise_env_names"
_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_BLOCKED = frozenset(
    {
        "HOME",
        "USER",
        "USERNAME",
        "LOGNAME",
        "SHELL",
        "PWD",
        "PATH",
        "LD_PRELOAD",
        "LD_LIBRARY_PATH",
        "PYTHONPATH",
        "NODE_OPTIONS",
    }
)


def _usable(name: str) -> bool:
    upper = name.upper()
    return bool(
        _NAME_RE.match(name)
        and upper not in _BLOCKED
        and not upper.startswith(("OCTOP_", "TABBY_", "DYLD_"))
        and not shell_owned_env_key(name)
    )


def managed_names(settings: Any) -> set[str]:
    try:
        data = json.loads(settings.get(SETTINGS_KEY) or "[]")
    except (TypeError, ValueError):
        return set()
    return {str(x) for x in data} if isinstance(data, list) else set()


def apply(
    settings: Any, items: list[dict[str, Any]], member_env: Mapping[str, str]
) -> dict[str, str]:
    """Apply the delivered variables and withdraw the ones no longer delivered.

    ``member_env`` is the member's own env file; a withdrawn name goes back to
    the member's value when there is one. Returns what was applied.
    """
    wanted = {
        str(i.get("name")): str(i.get("value") or "")
        for i in items
        if isinstance(i, dict) and _usable(str(i.get("name") or ""))
    }
    for name in managed_names(settings) - set(wanted):
        if name in member_env:
            os.environ[name] = member_env[name]
        else:
            os.environ.pop(name, None)
    os.environ.update(wanted)
    names = json.dumps(sorted(wanted))
    if (settings.get(SETTINGS_KEY) or "[]") != names:
        settings.set(SETTINGS_KEY, names)
    return wanted

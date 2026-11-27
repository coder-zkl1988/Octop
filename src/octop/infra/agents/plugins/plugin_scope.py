"""Plugins a member installed for one expert only.

Plugins are on for every expert unless an expert switches them off. When a
member installs a plugin "only for the current expert", every other expert of
theirs gets it switched off, and so does every expert they create later.
"""

from __future__ import annotations

import json
from typing import Any

from octop.infra.agents.plugins.plugin_tool_defaults import merge_plugins_enabled_settings


def _key(user_id: int) -> str:
    return f"plugins_single_expert.{int(user_id)}"


def single_expert_plugins(settings: Any, user_id: int) -> set[str]:
    """Plugin ids that start switched off on this member's new experts."""
    try:
        data = json.loads(settings.get(_key(user_id)) or "[]")
    except (TypeError, ValueError):
        return set()
    return {str(item) for item in data} if isinstance(data, list) else set()


def set_single_expert(settings: Any, user_id: int, plugin_id: str, single: bool) -> None:
    current = single_expert_plugins(settings, user_id)
    wanted = current | {plugin_id} if single else current - {plugin_id}
    if wanted != current:
        settings.set(_key(user_id), json.dumps(sorted(wanted)))


def apply_to_new_expert(settings: Any, user_id: int, config: dict[str, Any]) -> None:
    """Switch the member's single-expert plugins off in a new expert's config."""
    plugin_ids = single_expert_plugins(settings, user_id)
    if not plugin_ids:
        return
    existing = config.get("plugins")
    explicit = existing if isinstance(existing, dict) else {}
    off = {pid: False for pid in plugin_ids if not isinstance(explicit.get(pid), dict)}
    if off:
        config["plugins"] = merge_plugins_enabled_settings(existing, off)

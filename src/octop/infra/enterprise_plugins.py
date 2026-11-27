"""Enterprise plugin allowlist on the desktop.

The control plane says which plugins this member may install, which ones an
admin pushed, and whether the allowlist is enforced. This module caches that
answer, installs what was pushed, stops what is no longer allowed and reports
what the device has. Bundled plugins ship with the desktop and are left alone.
"""

from __future__ import annotations

import hashlib
import json
import logging
import tempfile
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

SETTINGS_KEY = "enterprise_plugin_policy"
MAX_PACKAGE_BYTES = 100 * 1024 * 1024

FetchJson = Callable[[str, str, dict[str, Any] | None], Awaitable[dict[str, Any]]]
FetchBytes = Callable[[str], Awaitable[tuple[bytes, dict[str, str]]]]


def load_policy(settings: Any) -> dict[str, Any]:
    """The last allowlist the control plane sent; empty and unenforced when there is none."""
    try:
        data = json.loads(settings.get(SETTINGS_KEY) or "{}")
    except (TypeError, ValueError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    return {
        "enforced": bool(data.get("enforced")),
        "items": [i for i in data.get("items") or [] if isinstance(i, dict) and i.get("id")],
        "stopped": [str(x) for x in data.get("stopped") or []],
    }


def _allowed(policy: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Plugins this member may run. An admin-only plugin counts once the admin pushed it."""
    return {str(i["id"]): i for i in policy["items"] if i.get("installable", True)}


def denied_tools(settings: Any) -> set[str]:
    """Plugin tools the enterprise switched off. They are hidden from every expert."""
    policy = load_policy(settings)
    if not policy["enforced"]:
        return set()
    return {str(t) for i in policy["items"] for t in i.get("tools_denied") or []}


def install_blocked_reason(policy: dict[str, Any], plugin_id: str | None) -> str | None:
    """Why this install is refused, or None. ``plugin_id`` is None for a package whose id is not known yet."""
    if not policy["enforced"]:
        return None
    if plugin_id is None:
        return "企业只允许安装清单内的插件，请从插件市场安装"
    if plugin_id not in _allowed(policy):
        return "这个插件不在企业允许安装的清单里"
    return None


def removal_blocked_reason(policy: dict[str, Any], plugin_id: str) -> str | None:
    item = _allowed(policy).get(plugin_id)
    if policy["enforced"] and item and item.get("required"):
        return "这个插件由企业管理员远程启用，不能停用或卸载"
    return None


def enable_blocked_reason(policy: dict[str, Any], plugin_id: str, bundled: set[str]) -> str | None:
    if policy["enforced"] and plugin_id not in bundled and plugin_id not in _allowed(policy):
        return "这个插件不在企业允许安装的清单里，不能启用"
    return None


async def sync(
    mgr: Any,
    settings: Any,
    *,
    fetch_json: FetchJson,
    fetch_bytes: FetchBytes,
    bundled: set[str],
    device_id: str,
) -> dict[str, Any]:
    """Bring installed plugins in line with the allowlist. Returns what changed."""
    view = await fetch_json("GET", "/desktop/v1/plugins", None)
    previous = load_policy(settings)
    policy: dict[str, Any] = {
        "enforced": bool(view.get("enforced")),
        "items": [i for i in view.get("items") or [] if isinstance(i, dict) and i.get("id")],
        "stopped": list(previous["stopped"]),
    }
    allowed = _allowed(policy)
    installed = {
        str(row["id"]): row
        for row in mgr.list_installed()
        if row.get("id") and not row.get("error")
    }
    changed: dict[str, list[str]] = {
        "installed": [],
        "enabled": [],
        "stopped": [],
        "failed": [],
        "tools": [],
    }

    if policy["enforced"]:
        for plugin_id, item in allowed.items():
            if item.get("builtin") or not item.get("required") or not item.get("installable", True):
                continue
            have = installed.get(plugin_id)
            stale = (
                have is not None
                and item.get("auto_update", True)
                and str(have.get("version")) != str(item.get("version"))
            )
            if have is None or stale:
                try:
                    await install_package(mgr, fetch_bytes, item)
                except Exception as exc:  # noqa: BLE001 - one bad package must not stop the rest
                    logger.warning(
                        "enterprise plugin %s could not be installed: %s", plugin_id, exc
                    )
                    changed["failed"].append(plugin_id)
                    continue
                changed["installed"].append(plugin_id)
                if have is None and item.get("start") != "enable":
                    mgr.set_enabled(plugin_id, False)
                    continue
            if item.get("start") == "enable" and (have is None or not have.get("enabled", True)):
                mgr.set_enabled(plugin_id, True)
                changed["enabled"].append(plugin_id)
        for plugin_id, row in installed.items():
            if plugin_id in bundled or plugin_id in allowed:
                continue
            if row.get("enabled", True):
                mgr.set_enabled(plugin_id, False)
                changed["stopped"].append(plugin_id)
                if plugin_id not in policy["stopped"]:
                    policy["stopped"].append(plugin_id)
    # A plugin this module stopped comes back once the allowlist admits it again or stops being enforced.
    for plugin_id in list(policy["stopped"]):
        if plugin_id not in installed:
            policy["stopped"].remove(plugin_id)
        elif not policy["enforced"] or plugin_id in allowed:
            if plugin_id not in changed["enabled"]:
                mgr.set_enabled(plugin_id, True)
                changed["enabled"].append(plugin_id)
            policy["stopped"].remove(plugin_id)

    before = (
        {str(t) for i in previous["items"] for t in i.get("tools_denied") or []}
        if previous["enforced"]
        else set()
    )
    after = (
        {str(t) for i in policy["items"] for t in i.get("tools_denied") or []}
        if policy["enforced"]
        else set()
    )
    changed["tools"] = sorted(before ^ after)
    settings.set(SETTINGS_KEY, json.dumps(policy, ensure_ascii=False))
    report = [
        {
            "id": str(row["id"]),
            "version": str(row.get("version") or ""),
            "enabled": bool(row.get("enabled", True)),
        }
        for row in mgr.list_installed()
        if row.get("id") and not row.get("error") and row.get("enabled", True)
    ]
    try:
        await fetch_json(
            "POST", "/desktop/v1/plugins/report", {"device_id": device_id, "plugins": report}
        )
    except Exception as exc:  # noqa: BLE001 - reporting is best effort
        logger.info("enterprise plugin report failed: %s", exc)
    return {**changed, "enforced": policy["enforced"]}


async def install_package(mgr: Any, fetch_bytes: FetchBytes, item: dict[str, Any]) -> None:
    plugin_id = str(item["id"])
    raw, headers = await fetch_bytes(f"/desktop/v1/plugins/{plugin_id}/package")
    if len(raw) > MAX_PACKAGE_BYTES:
        raise ValueError("package too large")
    digest = hashlib.sha256(raw).hexdigest()
    expected = str(item.get("sha256") or headers.get("x-content-sha256") or "")
    if not expected or digest != expected:
        raise ValueError("package digest does not match the catalog")
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        tmp.write(raw)
        path = Path(tmp.name)
    try:
        mgr.install_archive(path, force=True, expect_id=plugin_id)
    finally:
        path.unlink(missing_ok=True)

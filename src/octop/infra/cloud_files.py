"""企业云端存储 on the desktop: keep experts' workspace files in the enterprise cloud.

An expert whose ``storage_location`` is ``cloud`` has its workspace folder
mirrored to the control plane: the folder's file list (path, size, SHA-256)
goes up, and the control plane asks for the contents it lacks. Restoring on
another computer creates the expert again and downloads its files.

Hashes are cached by path, size and modification time, so an unchanged file is
not read again. The enterprise's ignore list and per-file limit apply; skipped
files are reported, never silently dropped.
"""

from __future__ import annotations

import asyncio
import fnmatch
import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from octop.infra import enterprise_client, local_data
from octop.infra.utils.paths import PathLayout

logger = logging.getLogger(__name__)

STATUS_KEY = "enterprise_cloud_files"
LOCATION_KEY = "storage_location"
CLOUD_ID_KEY = "cloud_files_id"
CLOUD = "cloud"
LOCAL = "local"
SYNC_INTERVAL_SECONDS = 300
_locks: dict[int, asyncio.Lock] = {}


def _state_key(user_id: int) -> str:
    return f"cloud_files.{int(user_id)}"


def cloud_id(row: Any, config: dict[str, Any]) -> str:
    """The id the expert's files are kept under; an expert restored elsewhere keeps the original's."""
    raw = config.get(CLOUD_ID_KEY)
    return str(raw) if isinstance(raw, str) and raw else str(row.agent_id)


def is_cloud(config: dict[str, Any]) -> bool:
    return config.get(LOCATION_KEY) == CLOUD


# ---- what the enterprise allows -------------------------------------------------


def load_status(settings: Any) -> dict[str, Any]:
    """The last ``/desktop/v1/files/status`` reply; empty outside enterprise mode."""
    try:
        data = json.loads(settings.get(STATUS_KEY) or "{}")
    except (TypeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def store_status(settings: Any, status: dict[str, Any] | None) -> None:
    settings.set(STATUS_KEY, json.dumps(status or {}, ensure_ascii=False, sort_keys=True))


def apply_to_new_expert(settings: Any, config: dict[str, Any]) -> None:
    """Pick where a new expert keeps its files, within what the enterprise allows."""
    status = load_status(settings)
    if status.get("cloud") != "on":
        config.pop(LOCATION_KEY, None)
        return
    if not status.get("expert_choice", True):
        config[LOCATION_KEY] = CLOUD
    elif config.get(LOCATION_KEY) not in (CLOUD, LOCAL):
        config[LOCATION_KEY] = LOCAL


# ---- scanning -------------------------------------------------------------------


def ignored(rel: str, patterns: list[str]) -> bool:
    """``.git`` matches any folder or file of that name; ``*.log`` matches names; ``a/b`` a path prefix."""
    parts = rel.split("/")
    for pattern in patterns:
        if "/" in pattern:
            if rel == pattern or rel.startswith(pattern.rstrip("/") + "/"):
                return True
        elif any(fnmatch.fnmatchcase(part, pattern) for part in parts):
            return True
    return False


@dataclass
class Scan:
    files: list[dict[str, Any]] = field(default_factory=list)
    skipped: list[dict[str, Any]] = field(default_factory=list)
    paths: dict[str, Path] = field(default_factory=dict)


def _cache_path(paths: PathLayout, user_id: int) -> Path:
    return paths.root / "cloud-files" / f"hashes-{int(user_id)}.json"


def _load_cache(path: Path) -> dict[str, list[Any]]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def scan(
    workspace: Path,
    *,
    ignore: list[str],
    max_file_bytes: int,
    max_files: int,
    cache: dict[str, list[Any]],
) -> Scan:
    """Every file to keep in the cloud, with its hash; and what was left out and why."""
    result = Scan()
    for current, dirs, names in os.walk(workspace, followlinks=False):
        base = Path(current)
        rel_base = base.relative_to(workspace).as_posix()
        dirs[:] = [
            d for d in dirs if not ignored(d if rel_base == "." else f"{rel_base}/{d}", ignore)
        ]
        for name in names:
            path = base / name
            rel = path.relative_to(workspace).as_posix()
            if ignored(rel, ignore) or path.is_symlink():
                continue
            try:
                stat = path.stat()
            except OSError:
                continue
            if stat.st_size > max_file_bytes:
                result.skipped.append({"path": rel, "size": stat.st_size, "reason": "too_large"})
                continue
            if len(result.files) >= max_files:
                result.skipped.append({"path": rel, "size": stat.st_size, "reason": "too_many"})
                continue
            key = str(path)
            cached = cache.get(key)
            if cached and cached[0] == stat.st_size and cached[1] == stat.st_mtime:
                sha = str(cached[2])
            else:
                try:
                    sha = _sha256(path)
                except OSError:
                    continue
                cache[key] = [stat.st_size, stat.st_mtime, sha]
            result.files.append(
                {"path": rel, "size": stat.st_size, "sha256": sha, "mtime": stat.st_mtime}
            )
            result.paths[sha] = path
    return result


# ---- sync state ------------------------------------------------------------------


def load_state(settings: Any, user_id: int) -> dict[str, Any]:
    try:
        data = json.loads(settings.get(_state_key(user_id)) or "{}")
    except (TypeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _save_state(settings: Any, user_id: int, expert_id: str, entry: dict[str, Any]) -> None:
    state = load_state(settings, user_id)
    state[expert_id] = entry
    settings.set(_state_key(user_id), json.dumps(state, ensure_ascii=False))


def summary(settings: Any, user_id: int) -> dict[str, Any]:
    """Totals across the member's cloud experts, for the sync center's 文件 row."""
    state = load_state(settings, user_id)
    status = load_status(settings)
    return {
        "cloud": status.get("cloud", "off"),
        "experts": len(state),
        "files": sum(int(e.get("files", 0)) for e in state.values()),
        "bytes": sum(int(e.get("bytes", 0)) for e in state.values()),
        "pending": sum(int(e.get("pending", 0)) for e in state.values()),
        "skipped": sum(len(e.get("skipped") or []) for e in state.values()),
        "last_synced_at": max((float(e.get("synced_at", 0)) for e in state.values()), default=0)
        or None,
        "errors": [
            {"expert_id": k, "error": e["error"]} for k, e in state.items() if e.get("error")
        ],
    }


# ---- sync and restore ------------------------------------------------------------


async def refresh_status(server: Any, user_id: int) -> dict[str, Any]:
    status = await enterprise_client.request(server, user_id, "GET", "/desktop/v1/files/status")
    store_status(server.services.settings_repo, status)
    return status


async def sync_expert(
    server: Any, user_id: int, row: Any, status: dict[str, Any]
) -> dict[str, Any]:
    """Send one expert's file list and upload the contents the cloud does not have."""
    settings = server.services.settings_repo
    paths = server.services.paths
    config = local_data.expert_config(row)
    expert_key = cloud_id(row, config)
    workspace = local_data.local_workspace(row, paths)
    if workspace is None or not workspace.is_dir():
        entry = {
            "name": row.name,
            "files": 0,
            "bytes": 0,
            "pending": 0,
            "skipped": [],
            "synced_at": time.time(),
            "error": "workspace_missing",
        }
        _save_state(settings, user_id, expert_key, entry)
        return entry
    cache_file = _cache_path(paths, user_id)
    cache = _load_cache(cache_file)
    found = await asyncio.to_thread(
        scan,
        workspace,
        ignore=[str(p) for p in status.get("ignore") or []],
        max_file_bytes=int(status.get("max_file_bytes") or 100 * 1024 * 1024),
        max_files=int(status.get("max_files") or 20_000),
        cache=cache,
    )
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(cache), encoding="utf-8")
    reply = await enterprise_client.request(
        server,
        user_id,
        "POST",
        "/desktop/v1/files/manifest",
        body={"expert_id": expert_key, "name": row.name, "files": found.files},
    )
    missing = [str(sha) for sha in reply.get("missing") or []]
    uploaded = 0
    error = ""
    for sha in missing:
        path = found.paths.get(sha)
        if path is None:
            continue
        try:
            content = await asyncio.to_thread(path.read_bytes)
            await enterprise_client.request_bytes(
                server, user_id, "PUT", f"/desktop/v1/files/blobs/{sha}", content=content
            )
            uploaded += 1
        except OSError:
            continue
        except Exception as exc:  # noqa: BLE001 - keep what was uploaded; the next run retries the rest
            error = getattr(exc, "details", {}).get("reason") or "upload_failed"
            break
    entry = {
        "name": row.name,
        "files": len(found.files),
        "bytes": sum(int(f["size"]) for f in found.files),
        "pending": len(missing) - uploaded,
        "uploaded": uploaded,
        "skipped": found.skipped[:50],
        "synced_at": time.time(),
        "error": error,
    }
    _save_state(settings, user_id, expert_key, entry)
    return entry


async def sync_all(server: Any, user_id: int) -> dict[str, Any]:
    """Sync every cloud expert of this member. One run at a time per member."""
    lock = _locks.setdefault(int(user_id), asyncio.Lock())
    if lock.locked():
        return summary(server.services.settings_repo, user_id)
    async with lock:
        status = await refresh_status(server, user_id)
        if status.get("cloud") == "on":
            assert server.app_runtime is not None
            for row in server.app_runtime.agent_registry.list_agents(user_id):
                if is_cloud(local_data.expert_config(row)):
                    try:
                        await sync_expert(server, user_id, row, status)
                    except Exception:  # noqa: BLE001 - one expert's failure must not stop the others
                        logger.exception("cloud file sync failed for %s", row.agent_id)
        return summary(server.services.settings_repo, user_id)


async def cloud_experts(server: Any, user_id: int) -> list[dict[str, Any]]:
    """The member's experts in the cloud, marked when one is already on this computer."""
    reply = await enterprise_client.request(server, user_id, "GET", "/desktop/v1/files/experts")
    assert server.app_runtime is not None
    local = {
        cloud_id(row, local_data.expert_config(row)): row.agent_id
        for row in server.app_runtime.agent_registry.list_agents(user_id)
        if is_cloud(local_data.expert_config(row))
    }
    return [
        {**item, "local_agent_id": local.get(str(item.get("expert_id")))}
        for item in reply.get("items") or []
    ]


async def download_into(
    server: Any, user_id: int, expert_key: str, workspace: Path
) -> dict[str, int]:
    """Write the expert's cloud files into ``workspace``; files already there with the same hash are kept."""
    manifest = await enterprise_client.request(
        server, user_id, "GET", f"/desktop/v1/files/experts/{expert_key}/manifest"
    )
    written = kept = 0
    root = workspace.resolve()
    for item in manifest.get("files") or []:
        target = (workspace / str(item["path"])).resolve()
        if root not in target.parents:
            continue
        if target.is_file() and await asyncio.to_thread(_sha256, target) == item["sha256"]:
            kept += 1
            continue
        content = await enterprise_client.request_bytes(
            server, user_id, "GET", f"/desktop/v1/files/blobs/{item['sha256']}"
        )
        if hashlib.sha256(content).hexdigest() != item["sha256"]:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(target.write_bytes, content)
        written += 1
    return {"written": written, "kept": kept}


async def sync_loop(server: Any) -> None:
    """Every few minutes, sync the cloud experts of members signed in to the enterprise."""
    await asyncio.sleep(60)
    while True:
        sessions = getattr(server, "_enterprise_auth_sessions", {}) or {}
        for user_id in list(sessions):
            try:
                await sync_all(server, int(user_id))
            except Exception:  # noqa: BLE001 - offline or signed out; the next round tries again
                logger.debug("cloud file sync skipped for user %s", user_id, exc_info=True)
        await asyncio.sleep(SYNC_INTERVAL_SECONDS)


__all__ = [
    "CLOUD",
    "CLOUD_ID_KEY",
    "LOCAL",
    "LOCATION_KEY",
    "apply_to_new_expert",
    "cloud_experts",
    "download_into",
    "ignored",
    "is_cloud",
    "load_state",
    "load_status",
    "scan",
    "summary",
    "sync_all",
    "sync_expert",
    "sync_loop",
]

"""This computer's data for one member: workspace folders, their size, and a data export.

Used by 本机设置. Only folders on this computer are covered: an expert whose
workspace is in a remote backend has no local folder to measure or export.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
import zipfile
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from octop.infra.agents.workspace.dir import (
    agent_auth_dir,
    workspace_dir_from_config_json,
)
from octop.infra.utils.paths import PathLayout

# Measuring stops after this many entries or seconds; the size is then a lower bound.
SIZE_ENTRY_LIMIT = 200_000
SIZE_SECONDS_LIMIT = 3.0
# Files larger than this are listed in the export but not copied into it.
EXPORT_FILE_LIMIT = 512 * 1024 * 1024
_SKIP_DIRS = frozenset({".git", "node_modules", ".venv", "__pycache__"})

_export_lock = threading.Lock()


@dataclass
class WorkspaceFolder:
    path: Path
    experts: list[dict[str, str]] = field(default_factory=list)
    size_bytes: int = 0
    truncated: bool = False
    missing: bool = False


def _config(row: Any) -> dict[str, Any]:
    try:
        data = json.loads(getattr(row, "config_json", None) or "{}")
    except (TypeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _local_workspace(row: Any, paths: PathLayout) -> Path | None:
    try:
        return workspace_dir_from_config_json(
            getattr(row, "config_json", None),
            paths=paths,
            agent_id=str(row.agent_id),
            ensure=False,
        )
    except (OSError, ValueError):
        return None


def directory_size(path: Path) -> tuple[int, bool]:
    """Total size of regular files under ``path`` (symlinks not followed). True when cut short."""
    total = 0
    seen = 0
    deadline = time.monotonic() + SIZE_SECONDS_LIMIT
    stack = [path]
    while stack:
        current = stack.pop()
        try:
            with os.scandir(current) as entries:
                for entry in entries:
                    seen += 1
                    if seen > SIZE_ENTRY_LIMIT or time.monotonic() > deadline:
                        return total, True
                    try:
                        if entry.is_dir(follow_symlinks=False):
                            stack.append(Path(entry.path))
                        elif entry.is_file(follow_symlinks=False):
                            total += entry.stat(follow_symlinks=False).st_size
                    except OSError:
                        continue
        except OSError:
            continue
    return total, False


def workspace_folders(rows: Iterable[Any], paths: PathLayout) -> list[WorkspaceFolder]:
    """The local workspace folders of ``rows`` (the member's own experts), with sizes."""
    folders: dict[Path, WorkspaceFolder] = {}
    for row in rows:
        path = _local_workspace(row, paths)
        if path is None:
            continue
        folder = folders.setdefault(path, WorkspaceFolder(path=path))
        folder.experts.append({"id": str(row.agent_id), "name": str(row.name)})
    for folder in folders.values():
        if folder.path.is_dir():
            folder.size_bytes, folder.truncated = directory_size(folder.path)
        else:
            folder.missing = True
    return sorted(folders.values(), key=lambda item: str(item.path))


def reveal(path: Path) -> None:
    """Open ``path`` in the system file manager. Raises OSError when it cannot."""
    if not path.is_dir():
        raise FileNotFoundError(str(path))
    if sys.platform == "darwin":
        command = ["open", str(path)]
    elif os.name == "nt":
        command = ["explorer", str(path)]
    else:
        command = ["xdg-open", str(path)]
    subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)  # noqa: S603


@dataclass
class ExportResult:
    path: Path
    size_bytes: int
    threads: int
    files: int
    skipped_files: int


def _downloads_dir() -> Path:
    downloads = Path.home() / "Downloads"
    downloads.mkdir(parents=True, exist_ok=True)
    return downloads


def _thread_record(services: Any, thread: Any, agent_name: str) -> dict[str, Any]:
    repo = services.thread_message_repo
    head = repo.head(thread.thread_id)
    messages = []
    for row in repo.range_rows(thread.thread_id, 0, head):
        try:
            message: Any = json.loads(row.message_json)
        except (TypeError, ValueError):
            message = row.message_json
        messages.append(
            {"seq": row.seq, "role": row.role, "created_at": row.created_at, "message": message}
        )
    return {
        "thread_id": thread.thread_id,
        "agent_id": thread.agent_id,
        "agent_name": agent_name,
        "channel_type": thread.channel_type,
        "title": thread.title,
        "created_at": thread.created_at,
        "last_active": thread.last_active,
        "messages": messages,
    }


def _skip_dirs(workspace: Path, cfg: dict[str, Any]) -> set[Path]:
    """Folders never exported: sign-in tokens and tool caches."""
    auth = agent_auth_dir(workspace, cfg)
    return {auth, workspace / ".octop-auth"}


def _add_workspace(
    archive: zipfile.ZipFile, workspace: Path, cfg: dict[str, Any], arc_root: str
) -> tuple[int, int]:
    added = skipped = 0
    excluded = {path.resolve() for path in _skip_dirs(workspace, cfg)}
    for current, dirs, files in os.walk(workspace, followlinks=False):
        base = Path(current)
        dirs[:] = [
            name
            for name in dirs
            if name not in _SKIP_DIRS and (base / name).resolve() not in excluded
        ]
        for name in files:
            file_path = base / name
            try:
                if file_path.is_symlink() or not file_path.is_file():
                    continue
                if file_path.stat().st_size > EXPORT_FILE_LIMIT:
                    skipped += 1
                    continue
                arc = f"{arc_root}/{file_path.relative_to(workspace).as_posix()}"
                archive.write(file_path, arcname=arc)
                added += 1
            except (OSError, ValueError):
                skipped += 1
    return added, skipped


def _safe_name(text: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in text).strip("._")
    return cleaned[:60] or "expert"


def export_member_data(
    services: Any, paths: PathLayout, *, user_id: int, rows: list[Any]
) -> ExportResult:
    """Zip the member's conversations, memory and workspace files into the Downloads folder."""
    if not _export_lock.acquire(blocking=False):
        raise RuntimeError("an export is already running")
    try:
        names = {str(row.agent_id): str(row.name) for row in rows}
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        target = _downloads_dir() / f"tabby-my-data-{stamp}.zip"
        partial = target.with_suffix(".zip.partial")
        threads = files = skipped = 0
        try:
            with zipfile.ZipFile(partial, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for agent_id, thread_id in services.thread_repo.list_for_user(user_id):
                    thread = services.thread_repo.get(thread_id)
                    if thread is None:
                        continue
                    record = _thread_record(services, thread, names.get(agent_id, agent_id))
                    archive.writestr(
                        f"conversations/{thread_id}.json",
                        json.dumps(record, ensure_ascii=False, indent=2),
                    )
                    threads += 1
                for row in rows:
                    workspace = _local_workspace(row, paths)
                    if workspace is None or not workspace.is_dir():
                        continue
                    arc_root = f"experts/{_safe_name(str(row.name))}-{str(row.agent_id)[-6:]}"
                    added, missed = _add_workspace(archive, workspace, _config(row), arc_root)
                    files += added
                    skipped += missed
                archive.writestr(
                    "README.txt",
                    "conversations/: 你在这台电脑上的会话 / your conversations on this computer\n"
                    "experts/: 专家工作区文件与记忆 / expert workspace files and memory\n"
                    "不含登录凭证、.git、node_modules 等目录 / "
                    "sign-in tokens, .git and node_modules are left out\n",
                )
        except BaseException:
            partial.unlink(missing_ok=True)
            raise
        partial.replace(target)
        return ExportResult(
            path=target,
            size_bytes=target.stat().st_size,
            threads=threads,
            files=files,
            skipped_files=skipped,
        )
    finally:
        _export_lock.release()


__all__ = [
    "ExportResult",
    "WorkspaceFolder",
    "directory_size",
    "export_member_data",
    "reveal",
    "workspace_folders",
]

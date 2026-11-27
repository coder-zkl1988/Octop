"""本机设置: this computer's workspace folders and the member's data export."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from octop.api.deps import current_user, get_server
from octop.infra import enterprise_client, local_data
from octop.infra.desktop import desktop_shell_enabled
from octop.infra.errors import ErrorCode, OctopError

router = APIRouter()


class WorkspaceExpert(BaseModel):
    id: str
    name: str


class WorkspaceFolderItem(BaseModel):
    path: str = Field(..., description="Folder on this computer")
    experts: list[WorkspaceExpert] = Field(..., description="The member's experts using it")
    size_bytes: int = Field(..., description="Total size of the files in it")
    truncated: bool = Field(
        ..., description="True when measuring stopped early; size_bytes is then a lower bound"
    )
    missing: bool = Field(..., description="True when the folder does not exist")


class WorkspaceFoldersResponse(BaseModel):
    items: list[WorkspaceFolderItem]
    can_reveal: bool = Field(
        ..., description="True when this server runs inside the desktop app and can open folders"
    )


class RevealBody(BaseModel):
    path: str = Field(..., description="A folder from GET /local-settings/workspaces")


class ExportResponse(BaseModel):
    path: str = Field(..., description="Where the zip file was saved")
    size_bytes: int
    threads: int = Field(..., description="Conversations in the export")
    files: int = Field(..., description="Workspace files in the export")
    skipped_files: int = Field(..., description="Files left out because they were too large")


def _own_rows(server: Any, user: Any) -> list[Any]:
    assert server.app_runtime is not None
    return list(server.app_runtime.agent_registry.list_agents(user.id))


def _folders(server: Any, user: Any) -> list[local_data.WorkspaceFolder]:
    return local_data.workspace_folders(_own_rows(server, user), server.services.paths)


@router.get(
    "/workspaces",
    summary="List this computer's workspace folders",
    response_model=WorkspaceFoldersResponse,
)
async def list_workspaces(
    user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> WorkspaceFoldersResponse:
    """The local folders the member's own experts work in, with their size on disk."""
    folders = await asyncio.to_thread(_folders, server, user)
    return WorkspaceFoldersResponse(
        items=[
            WorkspaceFolderItem(
                path=str(folder.path),
                experts=[WorkspaceExpert(**expert) for expert in folder.experts],
                size_bytes=folder.size_bytes,
                truncated=folder.truncated,
                missing=folder.missing,
            )
            for folder in folders
        ],
        can_reveal=desktop_shell_enabled(),
    )


@router.post("/workspaces/reveal", summary="Show a workspace folder in the file manager")
async def reveal_workspace(
    body: RevealBody, user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, bool]:
    """Only in the desktop app, and only for a folder one of the member's experts uses."""
    if not desktop_shell_enabled():
        raise OctopError(ErrorCode.FORBIDDEN, "only available in the desktop app")
    folders = await asyncio.to_thread(
        lambda: {
            folder.path
            for folder in local_data.workspace_folders(
                _own_rows(server, user), server.services.paths
            )
        }
    )
    target = Path(body.path)
    if target not in folders:
        raise OctopError(ErrorCode.NOT_FOUND, "not one of your workspace folders")
    try:
        local_data.reveal(target)
    except OSError as exc:
        raise OctopError(ErrorCode.NOT_FOUND, "folder cannot be opened") from exc
    return {"ok": True}


async def _record_enterprise_export(server: Any, user_id: int) -> None:
    """In enterprise mode the export is written to the enterprise log first; refuse if it cannot be."""
    if not server.services.config.enterprise_backend_url:
        return
    await enterprise_client.request(
        server,
        user_id,
        "POST",
        "/desktop/v1/audit",
        body={"action": "desktop.data_export"},
    )


@router.post("/export", summary="Export my data on this computer", response_model=ExportResponse)
async def export_my_data(
    user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> ExportResponse:
    """Zip the member's conversations, memory and workspace files into the Downloads folder.

    In enterprise mode the export is recorded in the enterprise operation log
    before anything is written; when that fails, nothing is exported.
    """
    await _record_enterprise_export(server, int(user.id))
    rows = _own_rows(server, user)
    try:
        result = await asyncio.to_thread(
            local_data.export_member_data,
            server.services,
            server.services.paths,
            user_id=int(user.id),
            rows=rows,
        )
    except RuntimeError as exc:
        raise OctopError(ErrorCode.EXPORT_BUSY, "an export is already running") from exc
    server.services.audit_repo.user_event(
        user.username,
        "local_data.export",
        target=str(result.path),
        payload=json.dumps({"threads": result.threads, "files": result.files}),
    )
    return ExportResponse(
        path=str(result.path),
        size_bytes=result.size_bytes,
        threads=result.threads,
        files=result.files,
        skipped_files=result.skipped_files,
    )

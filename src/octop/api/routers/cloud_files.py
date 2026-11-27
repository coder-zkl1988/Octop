"""企业云端存储 for this member's experts: sync status, sync now, and restore on this computer."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from octop.api.deps import current_user, get_server
from octop.infra import cloud_files, local_data
from octop.infra.errors import ErrorCode, OctopError

router = APIRouter()


class LocationBody(BaseModel):
    location: str = Field(
        ..., pattern="^(local|cloud)$", description="local: 本机文件夹; cloud: 企业云端"
    )


class RestoreBody(BaseModel):
    expert_id: str = Field(
        ..., description="The expert's id in the cloud, from GET /enterprise/files/experts"
    )


def _require_enterprise(server: Any) -> None:
    if not server.services.config.enterprise_backend_url:
        raise OctopError(ErrorCode.FORBIDDEN, "enterprise mode only")


@router.get("/status", summary="Cloud file sync status")
async def files_status(
    user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    """What the enterprise allows, and how far this member's cloud experts are synced."""
    _require_enterprise(server)
    settings = server.services.settings_repo
    return {
        "policy": cloud_files.load_status(settings),
        "summary": cloud_files.summary(settings, int(user.id)),
        "experts": cloud_files.load_state(settings, int(user.id)),
    }


@router.post("/sync", summary="Sync cloud experts now")
async def files_sync(
    user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    """Send every cloud expert's file list and upload what the cloud lacks."""
    _require_enterprise(server)
    return await cloud_files.sync_all(server, int(user.id))


@router.get("/experts", summary="Experts kept in the enterprise cloud")
async def files_experts(
    user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    """This member's experts with files in the cloud; ``local_agent_id`` is set when one is already here."""
    _require_enterprise(server)
    return {"items": await cloud_files.cloud_experts(server, int(user.id))}


@router.post("/restore", summary="Restore a cloud expert on this computer")
async def files_restore(
    body: RestoreBody, user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    """Create the expert here (or reuse the one already linked) and download its files."""
    _require_enterprise(server)
    from octop.infra.agents.manager import AgentCreateSpec  # noqa: PLC0415

    assert server.app_runtime is not None
    registry = server.app_runtime.agent_registry
    items = await cloud_files.cloud_experts(server, int(user.id))
    item = next((i for i in items if i.get("expert_id") == body.expert_id), None)
    if item is None:
        raise OctopError(ErrorCode.NOT_FOUND, "expert not found in the cloud")
    agent_id = item.get("local_agent_id")
    if agent_id:
        row = registry.get_row(str(agent_id))
    else:
        names = {r.name for r in registry.list_agents(user.id)}
        name = str(item.get("name") or body.expert_id)
        if name in names:
            name = f"{name}（云端）"
        row = await registry.create(
            AgentCreateSpec(
                name=name,
                user_id=int(user.id),
                config={
                    cloud_files.LOCATION_KEY: cloud_files.CLOUD,
                    cloud_files.CLOUD_ID_KEY: body.expert_id,
                },
            )
        )
    if row is None:
        raise OctopError(ErrorCode.AGENT_NOT_FOUND, "agent not found")
    workspace = local_data.local_workspace(row, server.services.paths)
    if workspace is None:
        raise OctopError(ErrorCode.WORKSPACE_OP_UNSUPPORTED, "expert has no local folder")
    workspace.mkdir(parents=True, exist_ok=True)
    result = await cloud_files.download_into(server, int(user.id), body.expert_id, workspace)
    return {"agent_id": row.agent_id, "name": row.name, **result}


@router.put("/experts/{agent_id}/location", summary="Choose where an expert keeps its files")
async def set_location(
    agent_id: str,
    body: LocationBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    """Switch one of your experts between 本机文件夹 and 企业云端, within what the enterprise allows."""
    _require_enterprise(server)
    assert server.app_runtime is not None
    registry = server.app_runtime.agent_registry
    row = registry.get_row(agent_id)
    if row is None or row.user_id != user.id:
        raise OctopError(ErrorCode.AGENT_NOT_FOUND, f"agent {agent_id!r} not found")
    policy = cloud_files.load_status(server.services.settings_repo)
    if body.location == cloud_files.CLOUD and policy.get("cloud") != "on":
        raise OctopError(ErrorCode.FORBIDDEN, "the enterprise has not opened cloud storage")
    if (
        body.location == cloud_files.LOCAL
        and policy.get("cloud") == "on"
        and not policy.get("expert_choice", True)
    ):
        raise OctopError(ErrorCode.FORBIDDEN, "the enterprise keeps every expert in the cloud")
    cfg = registry.get_config(agent_id)
    cfg[cloud_files.LOCATION_KEY] = body.location
    registry.persist_harness_config(agent_id, cfg)
    return {"agent_id": agent_id, "location": body.location}

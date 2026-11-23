"""Authenticated HTTP adapter for application plugins."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field

from octop.api.deps import current_user, get_server
from octop.infra.errors import ErrorCode, OctopError
from octop.infra.plugin_apps.contracts import PluginAppError, PluginLicense
from octop.infra.plugin_apps.host import PluginAppHost

router = APIRouter(prefix="/plugin-apps", tags=["plugins"])


@router.get(
    "/{plugin_id}/assets/{asset_id}",
    summary="Read a private plugin image visible in the current member's state",
    response_model=None,
    response_class=Response,
    responses={
        200: {
            "description": "Private image bytes; the media type matches the stored image.",
            "content": {
                mime: {"schema": {"type": "string", "format": "binary"}}
                for mime in ("image/png", "image/jpeg", "image/webp")
            },
        }
    },
    description="Requires authentication and a reference in a collection readable by the current license. Credentials are not accepted in the URL.",
)
async def asset(
    plugin_id: str,
    asset_id: str,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> Response:
    try:
        content, mime_type = await _host(server).asset(plugin_id, int(user.id), asset_id)
        return Response(
            content=content,
            media_type=mime_type,
            headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
        )
    except PluginAppError as exc:
        raise _error(exc) from exc


@router.get(
    "/{plugin_id}/evidence/{run_id}",
    summary="Read private plugin task evidence",
    response_model=None,
)
async def evidence(
    plugin_id: str,
    run_id: str,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> Response:
    try:
        content = await _host(server).evidence(plugin_id, int(user.id), run_id)
        return Response(
            content=content, media_type="image/jpeg", headers={"Cache-Control": "private, no-store"}
        )
    except PluginAppError as exc:
        raise _error(exc) from exc


class PluginAppItem(BaseModel):
    id: str
    name: str
    version: str
    enabled: bool
    ui: dict[str, str] | None = None
    license: PluginLicense


class PluginTextModel(BaseModel):
    id: str = Field(description="Enterprise alias or a personal provider/model reference.")
    name: str
    source: str


class PluginAppSnapshot(BaseModel):
    plugin: dict[str, str]
    license: PluginLicense
    data: dict[str, Any]
    devices: list[dict[str, Any]]
    read_only: bool


class PluginCommand(BaseModel):
    command: str = Field(
        min_length=1,
        max_length=100,
        description="Plugin command name; entitlement is checked for every command.",
    )
    payload: dict[str, Any] = Field(
        default_factory=dict,
        description="Versioned plugin command input; identity is always derived from the session.",
    )


def _host(server: Any) -> PluginAppHost:
    if server.plugin_apps is None:
        raise OctopError(ErrorCode.INTERNAL_ERROR, "plugin host unavailable", status=503)
    return server.plugin_apps  # type: ignore[no-any-return]


def _error(exc: PluginAppError) -> OctopError:
    return OctopError(
        ErrorCode.FORBIDDEN if exc.status == 403 else ErrorCode.SLASH_BAD_ARGS,
        "plugin request rejected",
        status=exc.status,
        details={"reason": exc.reason},
    )


@router.get(
    "",
    summary="List application plugins and current member licenses",
    response_model=list[PluginAppItem],
)
async def list_apps(user: Any = Depends(current_user), server: Any = Depends(get_server)) -> Any:
    try:
        return await _host(server).list_apps(int(user.id))
    except PluginAppError as exc:
        raise _error(exc) from exc


@router.get(
    "/{plugin_id}/models",
    summary="List text models available to this licensed member",
    response_model=list[PluginTextModel],
    description="Returns authorized enterprise aliases and personal models allowed by policy. Credentials are excluded.",
)
async def text_models(
    plugin_id: str, user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> Any:
    try:
        ctx = await _host(server).context(plugin_id, int(user.id))
        return await ctx.text_models()
    except PluginAppError as exc:
        raise _error(exc) from exc


@router.get(
    "/{plugin_id}/image-models",
    summary="List image models available to this licensed member",
    response_model=list[PluginTextModel],
    description="Returns permitted image-generation models without provider credentials.",
)
async def image_models(
    plugin_id: str, user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> Any:
    try:
        ctx = await _host(server).context(plugin_id, int(user.id))
        return await ctx.image_models()
    except PluginAppError as exc:
        raise _error(exc) from exc


@router.get(
    "/{plugin_id}/snapshot",
    summary="Read scoped plugin state",
    response_model=PluginAppSnapshot,
    description="Current member state only. Expired/revoked licenses allow history only within authority-provided read_features; inactive or unassigned members cannot read paid content.",
)
async def snapshot(
    plugin_id: str, user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> Any:
    try:
        return await _host(server).snapshot(plugin_id, int(user.id))
    except PluginAppError as exc:
        raise _error(exc) from exc


@router.post(
    "/{plugin_id}/commands",
    summary="Execute an entitled plugin command",
    response_model=PluginAppSnapshot,
    description="Checks the live tenant grant and member assignment. Tools and background jobs use the same host checks; plugin installation or local admin alone grants no paid feature.",
)
async def command(
    plugin_id: str,
    body: PluginCommand,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> Any:
    try:
        return await _host(server).command(plugin_id, int(user.id), body.command, body.payload)
    except PluginAppError as exc:
        raise _error(exc) from exc

"""Enterprise control-plane proxy for the desktop edition."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from http.cookies import SimpleCookie
from typing import Any, Literal, cast

import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from octop.api.deps import current_user, get_server
from octop.infra import enterprise_env, enterprise_plugins, enterprise_security
from octop.infra.agents.plugins.bundled import default_bundled_plugins_root
from octop.infra.enterprise_client import clear_persisted_session
from octop.infra.enterprise_client import session_entry as load_session_entry
from octop.infra.enterprise_device import headers as device_headers
from octop.infra.enterprise_device import is_registered, mark_registered, registration_body
from octop.infra.enterprise_policy import enterprise_policy_permissions
from octop.infra.errors import ErrorCode, OctopError
from octop.infra.users.resource_policy import POLICY_MAX_AGENTS
from octop.infra.utils.env_file import env_file_path, load_env_file

router = APIRouter()


def _object(value: Any) -> dict[str, Any]:
    return cast(dict[str, Any], value) if isinstance(value, dict) else {}


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


class DefaultModelBody(BaseModel):
    model_id: str = Field(min_length=1, max_length=200)


class LocalModelBody(DefaultModelBody):
    enabled: bool


class KnowledgePublishBody(BaseModel):
    """Member-facing knowledge publish request from the enterprise desktop."""

    base_id: str = Field(min_length=1, max_length=200)
    title: str | None = Field(default=None, max_length=200)
    document_ids: list[str] | None = None
    scope: Literal["all", "departments", "members"] = "all"
    departments: list[str] = Field(default_factory=list)
    member_ids: list[str] = Field(default_factory=list)
    sync_mode: Literal["prompt", "auto"] = "prompt"


class SyncItemBody(BaseModel):
    kind: Literal["threads", "traces", "memory", "files"]
    id: str = Field(min_length=1, max_length=256)
    operation: Literal["upsert", "delete"] = "upsert"
    payload_digest: str = Field(min_length=64, max_length=64, pattern=r"^[0-9a-fA-F]{64}$")
    payload: dict[str, Any] | None = None


class SyncRequestBody(BaseModel):
    items: list[SyncItemBody] = Field(default_factory=list, max_length=200)


def _prefs_key(user_id: int) -> str:
    return f"enterprise:model-preferences:{int(user_id)}"


async def _read_preferences(server: Any, user_id: int) -> dict[str, Any]:
    raw = await asyncio.to_thread(server.services.settings_repo.get, _prefs_key(user_id))
    if not raw:
        return {"defaultCloudModelId": None, "localEnabled": {}}
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return {"defaultCloudModelId": None, "localEnabled": {}}
    if not isinstance(value, dict):
        return {"defaultCloudModelId": None, "localEnabled": {}}
    local = value.get("localEnabled")
    return {
        "defaultCloudModelId": value.get("defaultCloudModelId"),
        "localEnabled": local if isinstance(local, dict) else {},
    }


async def _write_preferences(server: Any, user_id: int, value: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {
        "defaultCloudModelId": value.get("defaultCloudModelId"),
        "localEnabled": value.get("localEnabled")
        if isinstance(value.get("localEnabled"), dict)
        else {},
    }
    await asyncio.to_thread(
        server.services.settings_repo.set,
        _prefs_key(user_id),
        json.dumps(normalized, ensure_ascii=False),
    )
    return normalized


def _enterprise_url(server: Any) -> str:
    config = getattr(getattr(server, "services", None), "config", None) or getattr(
        server, "config", None
    )
    url = getattr(config, "enterprise_backend_url", None)
    if not url:
        raise OctopError(ErrorCode.AUTH_FAILED, "enterprise backend is not configured", status=503)
    return str(url).rstrip("/")


def _session_entry(server: Any, user_id: int) -> dict[str, str]:
    return load_session_entry(server, int(user_id))


def _cookie_value(cookie_header: str, name: str) -> str | None:
    jar = SimpleCookie()
    jar.load(cookie_header)
    morsel = jar.get(name)
    return morsel.value if morsel is not None else None


async def _upstream(
    server: Any,
    user_id: int,
    method: str,
    path: str,
    *,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    entry = _session_entry(server, user_id)
    headers = {"Cookie": entry["cookies"], **device_headers(server, user_id)}
    csrf = _cookie_value(entry["cookies"], "tb_csrf")
    if csrf:
        headers["X-CSRF-Token"] = csrf
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
            response = await client.request(
                method,
                _enterprise_url(server) + path,
                headers=headers,
                json=body if body is not None else None,
            )
    except httpx.HTTPError as exc:
        raise OctopError(
            ErrorCode.AUTH_FAILED, "enterprise backend unavailable", status=503
        ) from exc
    if response.status_code >= 400:
        if response.status_code == 401:
            sessions = getattr(server, "_enterprise_auth_sessions", {})
            sessions.pop(int(user_id), None)
            clear_persisted_session(server, user_id)
            raise OctopError(ErrorCode.TOKEN_EXPIRED, "enterprise session expired", status=401)
        try:
            detail = response.json().get("error", {}).get("message", "enterprise request failed")
        except (ValueError, TypeError):
            detail = "enterprise request failed"
        raise OctopError(ErrorCode.AUTH_FAILED, str(detail), status=response.status_code)
    if response.status_code == 204:
        return {}
    try:
        payload = response.json()
    except ValueError as exc:
        raise OctopError(ErrorCode.AUTH_FAILED, "invalid enterprise response", status=502) from exc
    if not isinstance(payload, dict):
        raise OctopError(ErrorCode.AUTH_FAILED, "invalid enterprise response", status=502)
    return cast(dict[str, Any], payload)


async def _upstream_bytes(server: Any, user_id: int, path: str) -> tuple[bytes, dict[str, str]]:
    """Download a binary enterprise resource (a plugin package) with the member's session."""
    entry = _session_entry(server, user_id)
    headers = {"Cookie": entry["cookies"], **device_headers(server, user_id)}
    try:
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=False) as client:
            response = await client.get(_enterprise_url(server) + path, headers=headers)
    except httpx.HTTPError as exc:
        raise OctopError(
            ErrorCode.AUTH_FAILED, "enterprise backend unavailable", status=503
        ) from exc
    if response.status_code >= 400:
        try:
            detail = response.json().get("error", {}).get("message", "enterprise request failed")
        except (ValueError, TypeError):
            detail = "enterprise request failed"
        raise OctopError(ErrorCode.AUTH_FAILED, str(detail), status=response.status_code)
    return response.content, {k.lower(): v for k, v in response.headers.items()}


def _bundled_plugin_ids() -> set[str]:
    root = default_bundled_plugins_root()
    return {p.name for p in root.iterdir() if (p / "plugin.yaml").is_file()}


_PLUGIN_SYNC_INTERVAL_SECONDS = 60.0


async def _sync_enterprise_plugins(
    server: Any, user_id: int, device_id: str, *, force: bool = False
) -> dict[str, Any] | None:
    """Apply the enterprise plugin allowlist. Never fails the caller: the snapshot must still load."""
    mgr = getattr(server, "plugin_manager", None)
    settings = getattr(getattr(server, "services", None), "settings_repo", None)
    if mgr is None or settings is None:
        return None
    stamps: dict[int, float] = server.__dict__.setdefault("_enterprise_plugin_sync_at", {})
    now = asyncio.get_running_loop().time()
    if (
        not force
        and now - stamps.get(int(user_id), -_PLUGIN_SYNC_INTERVAL_SECONDS)
        < _PLUGIN_SYNC_INTERVAL_SECONDS
    ):
        return None
    stamps[int(user_id)] = now

    async def fetch_json(method: str, path: str, body: dict[str, Any] | None) -> dict[str, Any]:
        return await _upstream(server, user_id, method, path, body=body)

    async def fetch_bytes(path: str) -> tuple[bytes, dict[str, str]]:
        return await _upstream_bytes(server, user_id, path)

    try:
        changed = await enterprise_plugins.sync(
            mgr,
            settings,
            fetch_json=fetch_json,
            fetch_bytes=fetch_bytes,
            bundled=_bundled_plugin_ids(),
            device_id=device_id,
        )
    except OctopError as exc:
        if exc.status == 401:
            raise
        return None
    except Exception:  # noqa: BLE001 - plugin sync is best effort
        return None
    if (changed["installed"] or changed["enabled"] or changed["stopped"]) and getattr(
        server, "app_runtime", None
    ) is not None:
        await server.refresh_plugin_channels()
        await server.app_runtime.agent_registry.reload_all()
    return changed


def _apply_expert_limit(server: Any, user_id: int, policy_raw: dict[str, Any]) -> None:
    """Set how many experts this member may create from the role policy. Absent on older control planes."""
    body = policy_raw.get("policy")
    limits = body.get("limits") if isinstance(body, dict) else None
    repo = getattr(getattr(server, "services", None), "user_policy_repo", None)
    if not isinstance(limits, dict) or "max_experts" not in limits or repo is None:
        return
    limit = limits["max_experts"]
    wanted = (
        str(limit)
        if isinstance(limit, int) and not isinstance(limit, bool) and limit >= 0
        else None
    )
    if repo.get(user_id, POLICY_MAX_AGENTS) != wanted:
        repo.merge(user_id, {POLICY_MAX_AGENTS: wanted})


async def _sync_enterprise_env(server: Any, user_id: int) -> None:
    """Apply the environment variables the enterprise delivers to this member."""
    settings = getattr(getattr(server, "services", None), "settings_repo", None)
    paths = getattr(server, "paths", None)
    if settings is None or paths is None:
        return
    try:
        view = await _upstream(server, user_id, "GET", "/desktop/v1/env")
    except OctopError as exc:
        if exc.status == 401:
            raise
        return
    items = view.get("items")
    server.__dict__["_enterprise_env"] = enterprise_env.apply(
        settings,
        items if isinstance(items, list) else [],
        load_env_file(env_file_path(paths.root)),
    )


async def _sync_enterprise_security(server: Any, user_id: int, policy_raw: dict[str, Any]) -> None:
    """Keep the enterprise security floor from the signed policy and report rule hit counts."""
    settings = getattr(getattr(server, "services", None), "settings_repo", None)
    if settings is None:
        return
    body = policy_raw.get("policy")
    security = body.get("security") if isinstance(body, dict) else None
    if enterprise_security.store(settings, security if isinstance(security, dict) else None):
        runtime = getattr(server, "app_runtime", None)
        if runtime is not None:
            runtime.agent_registry.refresh_security()
    hits = enterprise_security.take_hits(settings)
    if hits:
        try:
            await _upstream(
                server, user_id, "POST", "/desktop/v1/security/hits", body={"hits": hits}
            )
        except OctopError as exc:
            enterprise_security.add_hits(settings, hits)
            if exc.status == 401:
                raise


def _points_value(value: Any) -> float:
    if isinstance(value, dict):
        value = value.get("points", 0)
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _next_month() -> str:
    now = datetime.now(UTC)
    year, month = now.year + (1 if now.month == 12 else 0), 1 if now.month == 12 else now.month + 1
    return datetime(year, month, 1, tzinfo=UTC).isoformat()


def _policy_payload(raw: dict[str, Any], *, updated_at: str) -> dict[str, Any]:
    raw_policy = raw.get("policy")
    policy = raw_policy if isinstance(raw_policy, dict) else raw
    resources = _object(policy.get("resources"))
    modules = _object(policy.get("modules"))
    caps = _object(policy.get("caps"))
    locks = _object(policy.get("locks"))

    def allow(module_key: str, cap_key: str | None = None) -> bool:
        if modules.get(module_key) == "allow":
            return True
        if cap_key is None:
            return False
        value = caps.get(cap_key)
        if isinstance(value, dict):
            return value.get("mode") == "allow" or value.get("access") in {"read", "read_write"}
        return value == "allow"

    return {
        "version": str(raw.get("version", raw.get("policy_version", 1))),
        "updatedAt": updated_at,
        "modules": {str(key): str(value) for key, value in modules.items()},
        "toolApprovalForced": bool(locks.get("tool_approval", True)),
        "approvalMode": "every",
        "piiRedaction": bool(locks.get("pii_redaction", True)),
        "secretRedaction": bool(locks.get("secret_redaction", True)),
        "syncLocked": bool(locks.get("sync", False)),
        "localModelsAllowed": bool(
            resources.get("model.local.enabled", resources.get("local_models", False))
        ),
        "modelPurposes": {
            purpose: bool(resources.get(f"model.{purpose}.enabled"))
            for purpose in (
                "chat",
                "embedding",
                "generation",
                "voice",
                "search",
                "decision",
                "phone",
            )
            if f"model.{purpose}.enabled" in resources
        },
        "offlineGraceDays": int(resources.get("offline_grace_days", 7) or 7),
        "capabilities": [
            {"key": "shell", "allowed": allow("terminal", "cap.shell")},
            {"key": "files", "allowed": allow("terminal", "cap.fs")},
            {"key": "browser", "allowed": allow("browser", "cap.browser")},
            {"key": "adb", "allowed": allow("mobile", "cap.phone.adb")},
            {"key": "remoteDesktop", "allowed": allow("desktop", "cap.remote_desktop")},
            {"key": "localModels", "allowed": bool(resources.get("model.local.enabled", False))},
        ],
    }


def _model_row(raw: dict[str, Any], *, allowed: bool = True) -> dict[str, Any]:
    alias = str(raw.get("alias") or raw.get("id") or raw.get("name") or "")
    return {
        "id": alias,
        "description": str(raw.get("description") or raw.get("provider_label") or alias),
        "capabilities": list(raw.get("capabilities") or ["text"]),
        "context": str(raw.get("context") or "128K"),
        "inputPricePerM": float(raw.get("inputPricePerM") or 0),
        "outputPricePerM": float(raw.get("outputPricePerM") or 0),
        "isDefault": bool(raw.get("isDefault", raw.get("is_default", False))),
        "available": bool(raw.get("enabled", allowed)),
    }


async def _snapshot(server: Any, user_id: int) -> dict[str, Any]:
    me, policy_raw, resources, device_key, usage = await _load_snapshot_inputs(server, user_id)
    enterprise_permissions = enterprise_policy_permissions(policy_raw)
    local_user = server.user_manager.get_by_id(user_id) if server.user_manager is not None else None
    if local_user is not None and local_user.permissions != enterprise_permissions:
        local_user.permissions = enterprise_permissions
        server.services.user_repo.set_permissions(user_id, enterprise_permissions)
    updated_at = datetime.now(UTC).isoformat()
    tenant_raw = _object(me.get("tenant"))
    member_raw = _object(me.get("member"))
    balance = _points_value(me.get("balance"))
    month_usage = _points_value(me.get("month_usage"))
    member_quota = _object(me.get("quota"))
    quota_points = _points_value(member_quota.get("monthly_limit", member_quota.get("limit", 0)))
    if quota_points <= 0:
        # Older control-plane responses did not expose a member quota. Keep
        # those tenants usable while preferring an explicit member limit.
        quota_points = max(balance, month_usage, 1.0)
    _apply_expert_limit(server, user_id, policy_raw)
    policy = _policy_payload(policy_raw, updated_at=updated_at)
    raw_policy = policy_raw.get("policy")
    policy_body = _object(raw_policy)
    policy_resources = _object(policy_body.get("resources"))
    allowlist = policy_resources.get("model.allowlist", [])
    allowlist = allowlist if isinstance(allowlist, list) else []
    resource_models = _list(resources.get("models"))
    cloud_models = [_model_row(row) for row in resource_models if isinstance(row, dict)]
    if not cloud_models:
        cloud_models = [
            _model_row({"alias": alias, "isDefault": i == 0}) for i, alias in enumerate(allowlist)
        ]
    # An empty enterprise allowlist means the tenant has no cloud model access.
    # Do not fabricate a local/default model here.
    local_raw = _object(resources.get("local"))
    local_models = []
    if local_raw.get("enabled"):
        for row in _list(local_raw.get("models")):
            if isinstance(row, dict) and row.get("allowed", True):
                local_models.append(
                    {
                        "id": str(row.get("id") or row.get("alias") or row.get("name") or ""),
                        "runtime": str(row.get("runtime") or "Ollama"),
                        "use": str(row.get("use") or row.get("purpose") or "chat"),
                        "sizeGb": float(row.get("sizeGb") or row.get("size_gb") or 0),
                        "status": "downloaded",
                    }
                )
    devices = await _load_devices(server, user_id, str(device_key.get("device_id") or "dev_demo"))
    rows = []
    totals = _object(usage.get("totals"))
    cloud_total = _object(totals.get("cloud"))
    tokens = _object(cloud_total.get("tokens"))
    calls = int(cloud_total.get("calls") or 0)
    points = _points_value(cloud_total.get("points"))
    if (calls or points) and cloud_models:
        rows.append(
            {
                "model": cloud_models[0]["id"],
                "kind": "cloud",
                "calls": calls,
                "inputTokens": int(tokens.get("input") or 0),
                "outputTokens": int(tokens.get("output") or 0),
                "points": points,
            }
        )
    now = updated_at
    pending = 0
    return {
        "tenant": {
            "id": str(tenant_raw.get("id") or ""),
            "name": str(tenant_raw.get("name") or "企业租户"),
            "mark": str(tenant_raw.get("name") or "企")[:1],
            "balancePoints": balance,
        },
        "member": {
            "id": str(member_raw.get("id") or ""),
            "name": str(member_raw.get("name") or member_raw.get("email") or "成员"),
            "email": str(member_raw.get("email") or ""),
            "department": str(member_raw.get("department") or ""),
            "role": "admin" if "管理员" in str(member_raw.get("role_names", [])) else "member",
            "loginMethod": "password",
        },
        "quota": {
            "usedPoints": month_usage,
            "quotaPoints": quota_points,
            "resetAt": _next_month(),
        },
        "app": {"version": "1.2.0", "latestVersion": None, "channel": "stable"},
        "policy": policy,
        "devices": devices,
        "usage": {
            "month": datetime.now(UTC).strftime("%Y-%m"),
            "rows": rows,
            "local": {"tokens": 0, "primaryModel": ""},
        },
        "sync": {
            "state": "synced",
            "pending": pending,
            "syncedItems": 0,
            "syncedBytes": 0,
            "lastSyncedAt": now,
            "queue": [
                {"kind": kind, "pending": 0, "synced": 0, "lastSyncedAt": now}
                for kind in ("threads", "traces", "memory", "files", "config")
            ],
            "conflicts": [],
        },
        "cloudModels": cloud_models,
        "localModels": local_models,
    }


async def _load_snapshot_inputs(
    server: Any, user_id: int
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    if not is_registered(server, user_id):
        await _upstream(
            server,
            user_id,
            "POST",
            "/desktop/v1/device/register",
            body=registration_body(server, user_id),
        )
        mark_registered(server, user_id)
    me = await _upstream(server, user_id, "GET", "/desktop/v1/me")
    policy = await _upstream(server, user_id, "GET", "/desktop/v1/policy")
    resources = await _upstream(server, user_id, "GET", "/org/v1/resources")
    device_key = await _upstream(server, user_id, "GET", "/desktop/v1/device/key")
    await _upstream(
        server,
        user_id,
        "POST",
        "/desktop/v1/heartbeat",
        body={
            "device_id": device_key.get("device_id", "dev_demo"),
            "app_version": "1.2.0",
            "pending_sync": 0,
        },
    )
    usage = await _upstream(server, user_id, "GET", "/desktop/v1/usage")
    await _sync_enterprise_plugins(server, user_id, str(device_key.get("device_id") or ""))
    await _sync_enterprise_security(server, user_id, policy)
    await _sync_enterprise_env(server, user_id)
    return me, policy, resources, device_key, usage


async def _load_devices(server: Any, user_id: int, current_id: str) -> list[dict[str, Any]]:
    try:
        payload = await _upstream(server, user_id, "GET", "/org/v1/devices?page=1&page_size=100")
    except OctopError:
        payload = {"items": []}
    items = payload.get("items", []) if isinstance(payload, dict) else []
    return [
        {
            "id": str(row.get("id") or ""),
            "name": str(row.get("name") or row.get("os_name") or "设备"),
            "os": str(row.get("os_name") or row.get("os") or ""),
            "appVersion": str(row.get("app_version") or ""),
            "status": str(row.get("status") or "active"),
            "revokedAt": row.get("revoked_at"),
            "online": bool(row.get("online")),
            "lastSeenAt": str(row.get("last_seen_at") or datetime.now(UTC).isoformat()),
            "current": str(row.get("id") or "") == current_id,
        }
        for row in items
        if isinstance(row, dict)
    ]


def _knowledge_base_payload(row: dict[str, Any]) -> dict[str, Any]:
    maintainer = _object(row.get("maintainer"))
    grant = _object(row.get("grant"))
    dept_path = maintainer.get("dept_path")
    department = (
        str(dept_path[-1])
        if isinstance(dept_path, list) and dept_path
        else str(maintainer.get("department") or "")
    )
    return {
        "id": str(row.get("id") or ""),
        "name": str(row.get("name") or "未命名知识库"),
        "description": str(row.get("description") or ""),
        "iconName": str(row.get("icon_name") or row.get("cover") or "book"),
        "ownerDepartment": str(
            row.get("owner_department")
            or row.get("department")
            or department
            or maintainer.get("name")
            or "企业空间"
        ),
        "docCount": int(row.get("docs_count") or row.get("document_count") or 0),
        "access": str(row.get("access") or ("edit" if grant.get("type") == "all" else "read")),
    }


def _knowledge_share_targets(payload: dict[str, Any]) -> dict[str, Any]:
    groups = _list(payload.get("groups") or payload.get("departments"))
    members = _list(payload.get("members"))
    departments = [
        str(
            _object(item).get("name") or _object(item).get("label") or _object(item).get("id") or ""
        )
        for item in groups
        if isinstance(item, dict)
    ]
    return {
        "departments": [item for item in departments if item],
        "members": [
            {
                "id": str(_object(item).get("id") or ""),
                "name": str(_object(item).get("name") or ""),
                "department": str(
                    _object(item).get("department")
                    or _object(item).get("dept")
                    or _object(item).get("dept_name")
                    or ""
                ),
            }
            for item in members
            if isinstance(item, dict) and _object(item).get("id")
        ],
    }


def _knowledge_publish_payload(row: dict[str, Any]) -> dict[str, Any]:
    manifest = _object(row.get("doc_manifest"))
    grants = _list(row.get("share_to"))
    scope = str(manifest.get("scope") or "")
    departments = [str(item) for item in manifest.get("departments", []) if item]
    member_ids = [str(item) for item in manifest.get("member_ids", []) if item]
    if not scope:
        if any(isinstance(item, dict) and item.get("subject_type") == "member" for item in grants):
            scope = "members"
            member_ids = [
                str(_object(item).get("subject_id") or "")
                for item in grants
                if isinstance(item, dict) and _object(item).get("subject_type") == "member"
            ]
        elif any(isinstance(item, dict) and item.get("subject_type") == "group" for item in grants):
            scope = "departments"
            departments = [
                str(_object(item).get("subject_id") or "")
                for item in grants
                if isinstance(item, dict) and _object(item).get("subject_type") == "group"
            ]
        else:
            scope = "all"
    document_ids = manifest.get("document_ids")
    return {
        "id": str(row.get("id") or row.get("request_id") or ""),
        "baseId": str(
            row.get("source_local_kb") or row.get("kb_id") or manifest.get("kb_id") or ""
        ),
        "documentIds": [str(item) for item in document_ids]
        if isinstance(document_ids, list)
        else None,
        "scope": scope,
        "departments": departments,
        "memberIds": member_ids,
        "syncMode": "auto"
        if manifest.get("sync_mode") == "auto" or row.get("sync") == "auto"
        else "prompt",
        "status": str(row.get("state") or row.get("status") or "pending"),
        "submittedAt": str(
            row.get("created_at") or row.get("submitted_at") or datetime.now(UTC).isoformat()
        ),
    }


def _knowledge_grants(
    body: KnowledgePublishBody, *, department_ids: dict[str, str] | None = None
) -> list[str]:
    if body.scope == "members":
        return list(body.member_ids)
    if body.scope == "departments":
        lookup = department_ids or {}
        return [lookup.get(department, department) for department in body.departments]
    return ["*"]


@router.get("/knowledge/bases", summary="List enterprise knowledge bases")
async def knowledge_bases(
    user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> list[dict[str, Any]]:
    payload = await _upstream(server, int(user.id), "GET", "/org/v1/kbs?page=1&page_size=100")
    rows = payload.get("items", []) if isinstance(payload, dict) else []
    return [_knowledge_base_payload(row) for row in rows if isinstance(row, dict)]


@router.get("/knowledge/share-targets", summary="List enterprise knowledge share targets")
async def knowledge_share_targets(
    user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    payload = await _upstream(server, int(user.id), "GET", "/org/v1/kbs/grant-options")
    return _knowledge_share_targets(payload)


@router.get("/knowledge/publish-requests", summary="List enterprise knowledge publish requests")
async def knowledge_publish_requests(
    user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> list[dict[str, Any]]:
    payload = await _upstream(
        server,
        int(user.id),
        "GET",
        "/org/v1/kb-publish-requests?state=pending&page=1&page_size=100",
    )
    rows = payload.get("items", []) if isinstance(payload, dict) else []
    return [_knowledge_publish_payload(row) for row in rows if isinstance(row, dict)]


@router.post("/knowledge/publish", summary="Submit an enterprise knowledge publish request")
async def knowledge_publish(
    body: KnowledgePublishBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    grant_options = await _upstream(server, int(user.id), "GET", "/org/v1/kbs/grant-options")
    department_ids = {
        str(_object(item).get("name") or _object(item).get("label") or ""): str(
            _object(item).get("id") or ""
        )
        for item in _list(grant_options.get("groups") or grant_options.get("departments"))
        if isinstance(item, dict) and _object(item).get("id")
    }
    manifest = {
        "kb_id": body.base_id,
        "document_ids": body.document_ids,
        "scope": body.scope,
        "departments": body.departments,
        "member_ids": body.member_ids,
        "sync_mode": body.sync_mode,
    }
    payload = await _upstream(
        server,
        int(user.id),
        "POST",
        "/org/v1/kb-publish-requests",
        body={
            "source_local_kb": body.base_id,
            "title": body.title or body.base_id,
            "doc_manifest": manifest,
            "share_to": _knowledge_grants(body, department_ids=department_ids),
        },
    )
    return _knowledge_publish_payload(payload)


@router.delete(
    "/knowledge/publish-requests/{request_id}",
    status_code=204,
    summary="Withdraw an enterprise knowledge publish request",
)
async def knowledge_withdraw_publish(
    request_id: str,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> None:
    await _upstream(
        server,
        int(user.id),
        "DELETE",
        f"/org/v1/kb-publish-requests/{request_id}",
    )


@router.get("/account/revocation", summary="Read the current enterprise device status")
async def account_revocation(
    user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    device_id = device_headers(server, int(user.id)).get("X-Device-Id", "")
    payload = await _upstream(server, int(user.id), "GET", f"/org/v1/devices/{device_id}")
    return {
        "status": str(payload.get("status") or "active"),
        "revokedAt": payload.get("revoked_at") or payload.get("revokedAt"),
    }


@router.get("/snapshot", summary="Load enterprise desktop state")
async def snapshot(
    user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    return await _snapshot(server, int(user.id))


@router.get("/events", summary="Proxy enterprise server-sent events")
async def events(
    user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> StreamingResponse:
    """Keep the desktop JWT local while streaming control-plane events.

    The browser cannot attach an Authorization header to a native EventSource,
    so the route authenticates the local user first, then forwards the stored
    enterprise session cookie to the control plane. Only the event stream is
    proxied; policy contents are fetched separately through ``/snapshot``.
    """
    entry = _session_entry(server, int(user.id))
    headers = {
        "Accept": "text/event-stream",
        "Cache-Control": "no-cache",
        "Cookie": entry["cookies"],
        **device_headers(server, int(user.id)),
    }
    csrf = _cookie_value(entry["cookies"], "tb_csrf")
    if csrf:
        headers["X-CSRF-Token"] = csrf

    client = httpx.AsyncClient(timeout=None, follow_redirects=False)
    try:
        response = await client.send(
            client.build_request(
                "GET", _enterprise_url(server) + "/desktop/v1/events", headers=headers
            ),
            stream=True,
        )
    except httpx.HTTPError as exc:
        await client.aclose()
        raise OctopError(
            ErrorCode.AUTH_FAILED, "enterprise backend unavailable", status=503
        ) from exc

    if response.status_code >= 400:
        status = response.status_code
        try:
            payload = response.json()
            message = _object(payload.get("error")).get("message", "enterprise event stream failed")
        except (TypeError, ValueError):
            message = "enterprise event stream failed"
        await response.aclose()
        await client.aclose()
        if status == 401:
            sessions = getattr(server, "_enterprise_auth_sessions", {})
            sessions.pop(int(user.id), None)
            clear_persisted_session(server, int(user.id))
            raise OctopError(ErrorCode.TOKEN_EXPIRED, "enterprise session expired", status=401)
        raise OctopError(ErrorCode.AUTH_FAILED, str(message), status=status)

    async def stream() -> AsyncIterator[bytes]:
        try:
            async for chunk in response.aiter_bytes():
                yield chunk
        finally:
            await response.aclose()
            await client.aclose()

    return StreamingResponse(
        stream(),
        status_code=response.status_code,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/sync", summary="Synchronize the current enterprise device")
async def sync(
    body: SyncRequestBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    device = await _upstream(server, int(user.id), "GET", "/desktop/v1/device/key")
    result = await _upstream(
        server,
        int(user.id),
        "POST",
        "/desktop/v1/sync",
        body={"items": [item.model_dump() for item in (body.items if body else [])]},
    )
    heartbeat = await _upstream(
        server,
        int(user.id),
        "POST",
        "/desktop/v1/heartbeat",
        body={
            "device_id": device.get("device_id", "dev_demo"),
            "app_version": "1.2.0",
            "pending_sync": 0,
        },
    )
    return {**result, "heartbeat": heartbeat}


@router.post("/reconnect", summary="Reconnect the enterprise sync stream")
async def reconnect(
    user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    return await sync(user=user, server=server)


@router.post("/threads/{thread_id}/takeover", summary="Take over an enterprise thread")
async def takeover(
    thread_id: str, user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> Any:
    return await _upstream(
        server, int(user.id), "POST", f"/desktop/v1/threads/{thread_id}:takeover"
    )


@router.post("/devices/{device_id}:logout", summary="Sign out another enterprise device")
async def logout_device(
    device_id: str, user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> Any:
    return await _upstream(
        server, int(user.id), "POST", f"/org/v1/devices/{device_id}:logout", body={}
    )


@router.get("/plugins", summary="List plugins the enterprise allows on this device")
async def enterprise_plugin_list(
    user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    """The cached allowlist joined with what is installed. Unenforced when the enterprise set no list."""
    policy = enterprise_plugins.load_policy(server.services.settings_repo)
    mgr = server.plugin_manager
    installed = {str(r.get("id")): r for r in (mgr.list_installed() if mgr is not None else [])}
    items = []
    for item in policy["items"]:
        have = installed.get(str(item["id"]))
        items.append(
            {
                "id": item["id"],
                "name": item.get("name", item["id"]),
                "summary": item.get("summary", ""),
                "version": item.get("version", ""),
                "kind": item.get("kind", ""),
                "builtin": bool(item.get("builtin")),
                "required": bool(item.get("required")),
                "installMode": item.get("install_mode", "self"),
                "installed": have is not None,
                "installedVersion": str((have or {}).get("version") or ""),
                "enabled": bool((have or {}).get("enabled", False)),
            }
        )
    return {"enforced": policy["enforced"], "items": items}


@router.post("/plugins/{plugin_id}/install", summary="Install an enterprise catalog plugin")
async def enterprise_plugin_install(
    plugin_id: str, user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    policy = enterprise_plugins.load_policy(server.services.settings_repo)
    item = next((i for i in policy["items"] if i["id"] == plugin_id), None)
    if item is None or item.get("builtin"):
        raise OctopError(ErrorCode.FORBIDDEN, "这个插件不在企业允许安装的清单里", status=403)
    mgr = server.plugin_manager
    if mgr is None:
        raise OctopError(ErrorCode.INTERNAL_ERROR, "plugin manager not initialized")

    async def fetch_bytes(path: str) -> tuple[bytes, dict[str, str]]:
        return await _upstream_bytes(server, int(user.id), path)

    try:
        await enterprise_plugins.install_package(mgr, fetch_bytes, item)
    except OctopError:
        raise
    except Exception as exc:
        raise OctopError(
            ErrorCode.PLUGIN_INSTALL_FAILED,
            f"plugin install failed: {exc}",
            details={"reason": str(exc)},
        ) from exc
    mgr.set_enabled(plugin_id, True)
    if server.app_runtime is not None:
        await server.refresh_plugin_channels()
        await server.app_runtime.agent_registry.reload_all()
    device = await _upstream(server, int(user.id), "GET", "/desktop/v1/device/key")
    await _sync_enterprise_plugins(
        server, int(user.id), str(device.get("device_id") or ""), force=True
    )
    return {"status": "ok", "id": plugin_id}


@router.get("/model-preferences", summary="Read enterprise model preferences")
async def model_preferences(
    user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    _session_entry(server, int(user.id))
    return await _read_preferences(server, int(user.id))


@router.put("/model-preferences/default", summary="Set the enterprise default model")
async def set_default_model(
    body: DefaultModelBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    _session_entry(server, int(user.id))
    current = await _read_preferences(server, int(user.id))
    current["defaultCloudModelId"] = body.model_id
    return await _write_preferences(server, int(user.id), current)


@router.put("/model-preferences/local", summary="Toggle an enterprise local model")
async def set_local_model(
    body: LocalModelBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    _session_entry(server, int(user.id))
    current = await _read_preferences(server, int(user.id))
    local = dict(current.get("localEnabled") or {})
    local[body.model_id] = body.enabled
    current["localEnabled"] = local
    return await _write_preferences(server, int(user.id), current)

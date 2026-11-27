"""Authenticated control-plane transport shared by desktop domain services."""

from __future__ import annotations

import json
from http.cookies import SimpleCookie
from typing import Any, cast

import httpx

from octop.infra.enterprise_device import headers as device_headers
from octop.infra.errors import ErrorCode, OctopError

_SESSION_KEY_PREFIX = "enterprise:session:"


def _session_key(user_id: int) -> str:
    return f"{_SESSION_KEY_PREFIX}{int(user_id)}"


def persist_session(server: Any, user_id: int, entry: dict[str, str]) -> None:
    repo = getattr(getattr(server, "services", None), "secret_repo", None)
    if repo is None:
        store = getattr(server, "_enterprise_auth_sessions", None)
        if store is None:
            store = {}
            server._enterprise_auth_sessions = store
        store[int(user_id)] = entry
        return
    key = _session_key(user_id)
    blob = json.dumps(entry, separators=(",", ":")).encode("utf-8")
    if repo.get(key) is None:
        repo.get_or_create(key, lambda: blob)
    else:
        repo.rotate(key, blob)


def clear_persisted_session(server: Any, user_id: int) -> None:
    repo = getattr(getattr(server, "services", None), "secret_repo", None)
    if repo is not None:
        repo.delete(_session_key(user_id))


def _load_persisted_session(server: Any, user_id: int) -> dict[str, str] | None:
    repo = getattr(getattr(server, "services", None), "secret_repo", None)
    if repo is None:
        return None
    raw = repo.get(_session_key(user_id))
    if raw is None:
        return None
    try:
        value = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else str(raw))
    except (TypeError, ValueError, UnicodeDecodeError):
        return None
    if not isinstance(value, dict) or not isinstance(value.get("cookies"), str):
        return None
    return {str(key): str(item) for key, item in value.items()}


def session_entry(server: Any, user_id: int) -> dict[str, str]:
    sessions = cast(dict[int, dict[str, str]], getattr(server, "_enterprise_auth_sessions", {}))
    entry = sessions.get(user_id)
    if not entry:
        entry = _load_persisted_session(server, user_id)
        if entry:
            sessions[user_id] = entry
    if not entry or not entry.get("cookies"):
        raise OctopError(ErrorCode.TOKEN_EXPIRED, "enterprise session expired", status=401)
    return entry


async def request(
    server: Any,
    user_id: int,
    method: str,
    path: str,
    *,
    body: dict[str, Any] | None = None,
    timeout: float = 15.0,
) -> dict[str, Any]:
    response = await _send(server, user_id, method, path, body=body, timeout=timeout)
    try:
        value = response.json() if response.status_code != 204 else {}
    except ValueError as exc:
        raise OctopError(ErrorCode.AUTH_FAILED, "invalid enterprise response", status=502) from exc
    if not isinstance(value, dict):
        raise OctopError(ErrorCode.AUTH_FAILED, "invalid enterprise response", status=502)
    return cast(dict[str, Any], value)


async def request_bytes(
    server: Any,
    user_id: int,
    method: str,
    path: str,
    *,
    content: bytes | None = None,
    timeout: float = 120.0,
) -> bytes:
    """Like :func:`request`, for raw bodies (file contents) in either direction."""
    response = await _send(server, user_id, method, path, content=content, timeout=timeout)
    return response.content


async def _send(
    server: Any,
    user_id: int,
    method: str,
    path: str,
    *,
    body: dict[str, Any] | None = None,
    content: bytes | None = None,
    timeout: float,
) -> httpx.Response:
    entry = session_entry(server, user_id)
    url = server.services.config.enterprise_backend_url
    if not url:
        raise OctopError(ErrorCode.AUTH_FAILED, "enterprise backend unavailable", status=503)
    headers = {"Cookie": entry["cookies"], **device_headers(server, user_id)}
    cookies = SimpleCookie()
    cookies.load(entry["cookies"])
    if "tb_csrf" in cookies:
        headers["X-CSRF-Token"] = cookies["tb_csrf"].value
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            response = await client.request(
                method,
                str(url).rstrip("/") + path,
                headers=headers,
                json=body,
                content=content,
            )
    except httpx.HTTPError as exc:
        raise OctopError(
            ErrorCode.AUTH_FAILED, "enterprise backend unavailable", status=503
        ) from exc
    if response.status_code == 401:
        sessions = getattr(server, "_enterprise_auth_sessions", {})
        current = sessions.get(user_id)
        if current is entry and current.get("cookies") == headers["Cookie"]:
            sessions.pop(user_id, None)
            clear_persisted_session(server, user_id)
        elif current and current.get("cookies"):
            # An old request must not tell the dashboard to discard a newer login.
            raise OctopError(
                ErrorCode.FORBIDDEN,
                "enterprise session changed",
                status=409,
                details={"reason": "enterprise_session_changed"},
            )
        raise OctopError(ErrorCode.TOKEN_EXPIRED, "enterprise session expired", status=401)
    if response.status_code >= 400:
        reason = ""
        try:
            payload = response.json()
            raw_error = payload.get("error", {}) if isinstance(payload, dict) else {}
            candidate = raw_error.get("code") if isinstance(raw_error, dict) else None
            if isinstance(candidate, str) and candidate in {
                "quota_exceeded",
                "insufficient_balance",
                "wallet_frozen",
                "too_many_in_flight",
                "user_suspended",
                "model_not_allowed",
                "device_required",
                "gateway_unavailable",
                "gateway_authentication_failed",
                "gateway_not_configured",
                "billing_unavailable",
                "invalid_gateway_response",
                "upstream_error",
                "tenant_quota_exceeded",
                "member_quota_exceeded",
                "license_required",
                "transfer_to_self",
                "transfer_target_not_eligible",
                "transfer_package_too_large",
                "too_many_open_transfers",
                "transfer_already_open",
                "transfer_already_decided",
                "transfer_not_open",
                "transfer_package_missing",
                "cloud_storage_unavailable",
                "storage_full",
                "not_found",
            }:
                reason = candidate
        except ValueError:
            pass
        raise OctopError(
            ErrorCode.FORBIDDEN,
            "enterprise request rejected",
            status=response.status_code,
            details={"reason": reason} if reason else {},
        )
    return response

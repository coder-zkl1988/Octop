"""Login / logout / me / change-password."""

from __future__ import annotations

import asyncio
import logging
import secrets
from typing import Any, Literal

import httpx
from fastapi import APIRouter, Depends, File, Request, Response, UploadFile
from pydantic import BaseModel, Field, ValidationError

from octop.api.common.client_ip import resolve_client_ip
from octop.api.deps import ACCESS_TOKEN_RESPONSE_HEADER, current_user, get_server, sign_token
from octop.infra.auth.captcha import current_env, ensure_captcha, load_effective, public_config
from octop.infra.auth.mfa import MfaService
from octop.infra.auth.tokens import PURPOSE_ACCESS
from octop.infra.enterprise_client import persist_session
from octop.infra.enterprise_device import reset_identity
from octop.infra.enterprise_policy import enterprise_policy_permissions
from octop.infra.errors import ErrorCode, OctopError
from octop.infra.users.email import normalize_email
from octop.infra.users.permissions import effective_permissions
from octop.infra.utils.locale import normalize_locale

logger = logging.getLogger(__name__)

router = APIRouter()


def _user_json(user: Any, *, locale: str | None = None) -> dict[str, Any]:
    loc = normalize_locale(locale)
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "display_name": user.display_name,
        "locale": loc,
        "permissions": effective_permissions(user),
    }


def me_payload(user: Any, server: Any) -> dict[str, Any]:
    """Profile JSON for ``/auth/me`` and OAuth bind/unbind responses."""
    payload = _user_json(user, locale=user.locale)
    row = server.user_manager.get_row(user.id)
    if row is None:
        payload["sso_linked"] = False
        payload["sso_kind"] = None
        payload["sso_identities"] = []
        payload["has_password"] = True
        payload["allowed_backend_types"] = None
        payload["default_backend_type"] = None
        return payload
    identities = [{"kind": item.kind} for item in server.user_manager.list_sso_identities(user.id)]
    payload["sso_identities"] = identities
    payload["sso_linked"] = bool(identities)
    payload["sso_kind"] = identities[0]["kind"] if identities else None
    payload["has_password"] = row.password_hash is not None
    from octop.infra.users.profile_avatar import profile_avatar_url

    payload["avatar_icon"] = row.avatar_icon
    payload["avatar_url"] = profile_avatar_url(
        server.services.avatars("user"),
        str(user.id),
        f"/api/users/{user.id}/avatar",
    )
    from octop.infra.users.resource_policy import (  # noqa: PLC0415
        POLICY_ALLOWED_BACKEND_TYPES,
        POLICY_DEFAULT_BACKEND_TYPE,
        allowed_backend_types_of,
        default_backend_type_of,
    )

    payload["allowed_backend_types"] = allowed_backend_types_of(
        server.services.user_policy_repo.get(user.id, POLICY_ALLOWED_BACKEND_TYPES)
    )
    payload["default_backend_type"] = default_backend_type_of(
        server.services.user_policy_repo.get(user.id, POLICY_DEFAULT_BACKEND_TYPE)
    )
    return payload


class LoginBody(BaseModel):
    username: str
    password: str
    captcha_token: str | None = Field(default=None, max_length=4096)


class EnterpriseLoginBody(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)
    # The enterprise platform verifies this itself; the desktop only relays it.
    captcha_token: str | None = Field(default=None, max_length=4096)


class EnterpriseMfaBody(BaseModel):
    mfa_ticket: str = Field(min_length=1, max_length=256)
    code: str = Field(min_length=6, max_length=6)


class EnterpriseInviteBody(BaseModel):
    invitation_token: str = Field(
        min_length=1, max_length=256, pattern=r"^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$"
    )


class EnterpriseRegisterBody(EnterpriseInviteBody):
    name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=10, max_length=200)


class EnterpriseOpenRegisterCodeBody(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    captcha_token: str | None = Field(default=None, max_length=4096)


class EnterpriseOpenRegisterBody(EnterpriseOpenRegisterCodeBody):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=10, max_length=200)


class EnterpriseRegisterResponse(BaseModel):
    member_id: str
    status: Literal["active"]


class EnterpriseInviteResponse(BaseModel):
    email: str
    tenant_name: str


class CaptchaPublicResponse(BaseModel):
    provider: str
    site_key: str | None = None


class ChangePasswordBody(BaseModel):
    old_password: str
    new_password: str


@router.get(
    "/captcha",
    summary="Public login captcha config",
    response_model=CaptchaPublicResponse,
    response_model_exclude_none=True,
)
async def get_captcha(server: Any = Depends(get_server)) -> CaptchaPublicResponse:
    """Return the active login captcha provider and public site key. No secret."""
    if server.user_manager.count() == 0:
        raise OctopError(ErrorCode.SETUP_REQUIRED, "initial admin not created")
    effective = load_effective(
        server.services.settings_repo,
        server.services.secret_repo,
        current_env(),
    )
    return CaptchaPublicResponse.model_validate(public_config(effective))


def _client_ip(request: Request) -> str:
    """Trusted client address for throttling and captcha verification.

    A spoofable value here would let a caller reset the directory bind throttle
    by varying one header, so this delegates to the shared resolver.
    """
    return resolve_client_ip(request)


def _enterprise_url(server: Any) -> str:
    config = getattr(getattr(server, "services", None), "config", None) or getattr(
        server, "config", None
    )
    url = getattr(config, "enterprise_backend_url", None)
    if not url:
        raise OctopError(ErrorCode.AUTH_FAILED, "enterprise backend is not configured", status=503)
    return str(url).rstrip("/")


def _enterprise_ticket_store(server: Any) -> dict[str, dict[str, str]]:
    store = getattr(server, "_enterprise_auth_tickets", None)
    if store is None:
        store = {}
        server._enterprise_auth_tickets = store
    return store


def _enterprise_session_store(server: Any) -> dict[int, dict[str, str]]:
    store = getattr(server, "_enterprise_auth_sessions", None)
    if store is None:
        store = {}
        server._enterprise_auth_sessions = store
    return store


def _enterprise_object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _enterprise_response_object(
    response: httpx.Response,
    *,
    message: str,
) -> dict[str, Any]:
    """Decode an upstream JSON object without leaking a proxy 500."""
    try:
        payload = response.json()
    except (TypeError, ValueError) as exc:
        raise OctopError(ErrorCode.AUTH_FAILED, "invalid enterprise response", status=502) from exc
    if not isinstance(payload, dict):
        raise OctopError(ErrorCode.AUTH_FAILED, message, status=502)
    return payload


async def _enterprise_json_get(
    server: Any,
    path: str,
    *,
    headers: dict[str, str] | None,
    unavailable_message: str,
) -> dict[str, Any]:
    """Fetch a JSON object from the enterprise backend with stable API errors."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(_enterprise_url(server) + path, headers=headers)
    except httpx.HTTPError as exc:
        raise OctopError(
            ErrorCode.AUTH_FAILED, "enterprise backend unavailable", status=503
        ) from exc
    if response.status_code >= 400:
        raise OctopError(ErrorCode.AUTH_FAILED, unavailable_message, status=502)
    try:
        payload = response.json()
    except (TypeError, ValueError) as exc:
        raise OctopError(ErrorCode.AUTH_FAILED, "invalid enterprise response", status=502) from exc
    if not isinstance(payload, dict):
        raise OctopError(ErrorCode.AUTH_FAILED, "invalid enterprise response", status=502)
    return payload


async def _enterprise_authenticated_response(
    server: Any,
    *,
    session_cookies: str,
    fallback_email: str,
    principal_type: str | None,
) -> dict[str, Any]:
    session_headers = {"Cookie": session_cookies} if session_cookies else None
    session_payload = await _enterprise_json_get(
        server,
        "/auth/v1/session",
        headers=session_headers,
        unavailable_message="enterprise session unavailable",
    )
    principal = _enterprise_object(session_payload.get("principal"))
    policy_payload = await _enterprise_json_get(
        server,
        "/desktop/v1/policy",
        headers=session_headers,
        unavailable_message="enterprise policy unavailable",
    )
    enterprise_permissions = enterprise_policy_permissions(policy_payload)
    email = str(principal.get("email") or fallback_email).strip().lower()
    display_name = str(principal.get("name") or email.split("@", 1)[0])
    row = server.services.user_repo.get_by_email(email)
    if row is None:
        user = await server.user_manager.create(
            username=email,
            password=secrets.token_urlsafe(32),
            role="user",
            display_name=display_name,
            email=email,
            locale="zh",
        )
    else:
        user = server.user_manager.get_by_id(row.id)
        if user is None:
            await server.user_manager.boot()
            user = server.user_manager.get_by_id(row.id)
        if user is None:
            raise OctopError(ErrorCode.AUTH_FAILED, "enterprise local user unavailable", status=500)
    user.permissions = enterprise_permissions
    server.services.user_repo.set_permissions(user.id, enterprise_permissions)
    session_entry = {
        "cookies": session_cookies,
        "email": email,
        "principal_type": str(principal_type or principal.get("type") or "tenant_admin"),
    }
    _enterprise_session_store(server)[int(user.id)] = session_entry
    persist_session(server, int(user.id), session_entry)
    reset_identity(server, int(user.id))
    secret = server.services.secret_repo.get("jwt")
    ttl = server.services.config.access_token_ttl_seconds
    token = sign_token(
        secret,
        sub=user.id,
        uname=user.username,
        role=user.role,
        purpose=PURPOSE_ACCESS,
        ttl_seconds=ttl,
        pwv=server.user_manager.credential_version(user.id),
    )
    return {
        "status": "authenticated",
        "principal_type": str(principal_type or principal.get("type") or "tenant_admin"),
        "access_token": token,
        "token_type": "Bearer",
        "expires_in": ttl,
        "user": _user_json(user, locale=user.locale),
    }


def _enterprise_captcha_error(error: dict[str, Any]) -> OctopError | None:
    """The platform's captcha refusals keep their own codes so the login page can draw the widget."""
    code = {
        "captcha_required": ErrorCode.CAPTCHA_REQUIRED,
        "captcha_failed": ErrorCode.CAPTCHA_FAILED,
    }.get(str(error.get("code") or ""))
    if code is None:
        return None
    return OctopError(code, str(error.get("message") or code.value), status=400)


def _with_captcha(body: dict[str, Any], token: str | None) -> dict[str, Any]:
    return {**body, "captcha": token} if token else body


@router.get("/enterprise/captcha", summary="Enterprise login captcha config")
async def enterprise_captcha(server: Any = Depends(get_server)) -> dict[str, Any]:
    """Which captcha the enterprise platform wants on its login and registration. No secret."""
    off = {"provider": "off", "site_key": "", "trigger": "after_failures", "after_failures": 2}
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
            response = await client.get(_enterprise_url(server) + "/auth/v1/captcha")
    except httpx.HTTPError:
        return off
    if response.status_code >= 400:
        return off
    payload = _enterprise_response_object(response, message="invalid enterprise response")
    return {
        "provider": str(payload.get("provider") or "off"),
        "site_key": str(payload.get("site_key") or ""),
        "trigger": str(payload.get("trigger") or "after_failures"),
        "after_failures": int(payload.get("after_failures") or 2),
    }


@router.post("/enterprise/login", summary="Start enterprise login")
async def enterprise_login(
    body: EnterpriseLoginBody, server: Any = Depends(get_server)
) -> dict[str, Any]:
    """Forward desktop credentials to tabby-enterprise and retain its MFA cookie jar."""
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
        try:
            response = await client.post(
                _enterprise_url(server) + "/auth/v1/login",
                json=_with_captcha(
                    {"email": body.email, "password": body.password}, body.captcha_token
                ),
                headers={"X-Tabby-Client": "desktop"},
            )
        except httpx.HTTPError as exc:
            raise OctopError(
                ErrorCode.AUTH_FAILED, "enterprise backend unavailable", status=503
            ) from exc
    if response.status_code >= 400:
        payload = _enterprise_response_object(response, message="enterprise login failed")
        captcha_error = _enterprise_captcha_error(_enterprise_object(payload.get("error")))
        if captcha_error is not None:
            raise captcha_error
        detail = _enterprise_object(payload.get("error")).get("message", "enterprise login failed")
        status = response.status_code if response.status_code < 500 else 502
        raise OctopError(ErrorCode.AUTH_FAILED, str(detail), status=status)
    payload = _enterprise_response_object(response, message="enterprise login failed")
    if payload.get("status") == "ok":
        session_cookies = "; ".join(
            f"{cookie.name}={cookie.value}" for cookie in response.cookies.jar
        )
        return await _enterprise_authenticated_response(
            server,
            session_cookies=session_cookies,
            fallback_email=body.email,
            principal_type=payload.get("principal_type"),
        )
    ticket = str(payload.get("mfa_ticket", ""))
    if not ticket:
        raise OctopError(
            ErrorCode.AUTH_FAILED, "enterprise login did not return MFA ticket", status=502
        )
    bridge_ticket = secrets.token_urlsafe(24)
    _enterprise_ticket_store(server)[bridge_ticket] = {
        "ticket": ticket,
        "email": body.email.strip().lower(),
        "cookies": "; ".join(f"{cookie.name}={cookie.value}" for cookie in response.cookies.jar),
    }
    return {
        "status": "mfa_required",
        "mfa_ticket": bridge_ticket,
        "principal_type": payload.get("principal_type"),
    }


def _enterprise_invite_payload(response: httpx.Response, *, status: int) -> dict[str, Any]:
    if response.status_code == 429:
        raise OctopError(ErrorCode.INVITE_RATE_LIMITED, "too many invite attempts")
    payload = _enterprise_response_object(response, message="invalid enterprise response")
    if _enterprise_object(payload.get("error")).get("code") == "invalid_invite":
        raise OctopError(ErrorCode.INVITE_INVALID, "invalid enterprise invitation")
    if response.status_code != status:
        raise OctopError(ErrorCode.AUTH_FAILED, "enterprise registration failed", status=502)
    return payload


@router.post("/enterprise/register/validate", summary="Check an enterprise invitation")
async def validate_enterprise_invite(
    body: EnterpriseInviteBody, server: Any = Depends(get_server)
) -> EnterpriseInviteResponse:
    """Return the work email and tenant tied to a control plane invitation."""
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
            response = await client.get(
                _enterprise_url(server) + "/auth/v1/invite/" + body.invitation_token
            )
    except httpx.HTTPError as exc:
        raise OctopError(
            ErrorCode.NETWORK_ERROR, "enterprise backend unavailable", status=503
        ) from exc
    payload = _enterprise_invite_payload(response, status=200)
    try:
        return EnterpriseInviteResponse.model_validate(
            {
                "email": payload.get("email"),
                "tenant_name": _enterprise_object(payload.get("tenant")).get("name"),
            }
        )
    except ValidationError as exc:
        raise OctopError(ErrorCode.AUTH_FAILED, "invalid enterprise response", status=502) from exc


@router.post(
    "/enterprise/register",
    status_code=201,
    summary="Register an invited enterprise member",
)
async def enterprise_register(
    body: EnterpriseRegisterBody, server: Any = Depends(get_server)
) -> EnterpriseRegisterResponse:
    """Activate the enterprise member designated by the control plane invitation."""
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
            response = await client.post(
                _enterprise_url(server) + "/auth/v1/register",
                json=body.model_dump(),
                headers={"X-Tabby-Client": "desktop"},
            )
    except httpx.HTTPError as exc:
        raise OctopError(
            ErrorCode.NETWORK_ERROR, "enterprise backend unavailable", status=503
        ) from exc
    payload = _enterprise_invite_payload(response, status=201)
    try:
        return EnterpriseRegisterResponse.model_validate(payload)
    except ValidationError as exc:
        raise OctopError(ErrorCode.AUTH_FAILED, "invalid enterprise response", status=502) from exc


@router.post("/enterprise/register/email/code", summary="Send an open registration email code")
async def enterprise_open_register_code(
    body: EnterpriseOpenRegisterCodeBody, server: Any = Depends(get_server)
) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
            response = await client.post(
                _enterprise_url(server) + "/auth/v1/register/email/code",
                json=_with_captcha({"email": body.email}, body.captcha_token),
                headers={"X-Tabby-Client": "desktop"},
            )
    except httpx.HTTPError as exc:
        raise OctopError(
            ErrorCode.NETWORK_ERROR, "enterprise backend unavailable", status=503
        ) from exc
    if response.status_code >= 400:
        payload = _enterprise_response_object(response, message="email registration code failed")
        error = _enterprise_object(payload.get("error"))
        captcha_error = _enterprise_captcha_error(error)
        if captcha_error is not None:
            raise captcha_error
        raise OctopError(
            ErrorCode.AUTH_FAILED,
            str(error.get("message", "email registration code failed")),
            status=response.status_code,
        )
    return _enterprise_response_object(response, message="invalid enterprise response")


@router.post(
    "/enterprise/register/email",
    status_code=201,
    summary="Register an enterprise account with email verification",
)
async def enterprise_open_register(
    body: EnterpriseOpenRegisterBody, server: Any = Depends(get_server)
) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
            response = await client.post(
                _enterprise_url(server) + "/auth/v1/register/email",
                json=body.model_dump(exclude={"captcha_token"}),
                headers={"X-Tabby-Client": "desktop"},
            )
    except httpx.HTTPError as exc:
        raise OctopError(
            ErrorCode.NETWORK_ERROR, "enterprise backend unavailable", status=503
        ) from exc
    if response.status_code >= 400:
        payload = _enterprise_response_object(response, message="email registration failed")
        error = _enterprise_object(payload.get("error"))
        raise OctopError(
            ErrorCode.AUTH_FAILED,
            str(error.get("message", "email registration failed")),
            status=response.status_code,
        )
    return _enterprise_response_object(response, message="invalid enterprise response")


@router.post("/enterprise/mfa", summary="Complete enterprise MFA")
async def enterprise_mfa(
    body: EnterpriseMfaBody, server: Any = Depends(get_server)
) -> dict[str, Any]:
    store = _enterprise_ticket_store(server)
    pending = store.get(body.mfa_ticket)
    if pending is None:
        raise OctopError(ErrorCode.AUTH_FAILED, "enterprise MFA ticket expired", status=401)
    headers = {"Cookie": pending["cookies"]} if pending["cookies"] else None
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
        try:
            response = await client.post(
                _enterprise_url(server) + "/auth/v1/mfa",
                json={"mfa_ticket": pending["ticket"], "code": body.code},
                headers=headers,
            )
        except httpx.HTTPError as exc:
            raise OctopError(
                ErrorCode.AUTH_FAILED, "enterprise backend unavailable", status=503
            ) from exc
    if response.status_code >= 400:
        raise OctopError(
            ErrorCode.AUTH_FAILED, "enterprise MFA rejected", status=response.status_code
        )
    session_cookies = "; ".join(f"{cookie.name}={cookie.value}" for cookie in response.cookies.jar)
    if not session_cookies:
        session_cookies = pending["cookies"]
    session_headers = {"Cookie": session_cookies} if session_cookies else headers
    session_payload = await _enterprise_json_get(
        server,
        "/auth/v1/session",
        headers=session_headers,
        unavailable_message="enterprise session unavailable",
    )
    principal = _enterprise_object(session_payload.get("principal"))
    policy_payload = await _enterprise_json_get(
        server,
        "/desktop/v1/policy",
        headers=session_headers,
        unavailable_message="enterprise policy unavailable",
    )
    enterprise_permissions = enterprise_policy_permissions(policy_payload)
    email = str(principal.get("email") or pending["email"]).strip().lower()
    display_name = str(principal.get("name") or email.split("@", 1)[0])
    row = server.services.user_repo.get_by_email(email)
    if row is None:
        user = await server.user_manager.create(
            username=email,
            password=secrets.token_urlsafe(32),
            role="user",
            display_name=display_name,
            email=email,
            locale="zh",
        )
    else:
        user = server.user_manager.get_by_id(row.id)
        if user is None:
            await server.user_manager.boot()
            user = server.user_manager.get_by_id(row.id)
        if user is None:
            raise OctopError(ErrorCode.AUTH_FAILED, "enterprise local user unavailable", status=500)
    # Keep the local permission object in sync so FastAPI dependencies enforce
    # the same enterprise policy that the dashboard uses for navigation.
    user.permissions = enterprise_permissions
    server.services.user_repo.set_permissions(user.id, enterprise_permissions)
    session_entry = {
        "cookies": session_cookies,
        "email": email,
        "principal_type": str(principal.get("type") or "tenant_admin"),
    }
    _enterprise_session_store(server)[int(user.id)] = session_entry
    persist_session(server, int(user.id), session_entry)
    reset_identity(server, int(user.id))
    secret = server.services.secret_repo.get("jwt")
    ttl = server.services.config.access_token_ttl_seconds
    token = sign_token(
        secret,
        sub=user.id,
        uname=user.username,
        role=user.role,
        purpose=PURPOSE_ACCESS,
        ttl_seconds=ttl,
        pwv=server.user_manager.credential_version(user.id),
    )
    store.pop(body.mfa_ticket, None)
    return {
        "status": "authenticated",
        "principal_type": response.json().get("principal_type"),
        "access_token": token,
        "token_type": "Bearer",
        "expires_in": ttl,
        "user": _user_json(user, locale=user.locale),
    }


def _local_row(server: Any, identifier: str) -> Any:
    """The local account for a username-or-email identifier, when one exists."""
    text = (identifier or "").strip()
    if not text:
        return None
    repo = server.services.user_repo
    row = repo.get_by_username(text)
    if row is None:
        email = normalize_email(text)
        if email is not None:
            row = repo.get_by_email(email)
    return row


def _directory_may_own(row: Any) -> bool:
    """Whether an unresolved local login may legitimately belong to the directory.

    ``False`` as soon as the identifier has a local password of its own: the
    submitted secret then belongs to *this* system, and forwarding it would hand a
    local credential to another server and spend one attempt against the
    directory's own lockout policy. Such an account still signs in — the local
    check runs first and succeeds on the right password — it just never falls
    through on a wrong one.

    Only identifiers with no local password, or none at all, may fall through.
    """
    if row is None:
        return True
    return not row.password_hash


async def _authenticate_ldap(server: Any, username: str, password: str, client_ip: str) -> Any:
    """Bind against the directory, throttled before the attempt reaches it."""
    service = server.ldap_service
    if not service.is_enabled():
        return None
    throttle = server.ldap_bind_throttle
    _raise_if_throttled(throttle.retry_after(username, client_ip))
    # An OctopError raised here (LDAP_UNAVAILABLE, LDAP_GROUP_NOT_ALLOWED, …) is a
    # real answer and propagates unchanged. Outages are not credential failures,
    # so they never count towards the brute-force budget.
    identity = await asyncio.get_running_loop().run_in_executor(
        None, service.directory_authenticate, username, password
    )
    if identity is None:
        retry_after = throttle.record_failure(username, client_ip)
        server.services.audit_repo.write(actor=username, action="auth.ldap_failed", target=username)
        _raise_if_throttled(retry_after)
        return None
    throttle.clear(username, client_ip)
    return await service.resolve_user(identity, login_name=username)


def _raise_if_throttled(retry_after: int) -> None:
    if retry_after <= 0:
        return
    minutes = max(1, (retry_after + 59) // 60)
    raise OctopError(
        ErrorCode.LOGIN_LOCKED,
        "too many directory login attempts",
        details={"retry_after_seconds": retry_after, "minutes": minutes},
    )


@router.post("/login", summary="Sign in")
async def login(
    body: LoginBody, request: Request, server: Any = Depends(get_server)
) -> dict[str, Any]:
    """Exchange username (or email) and password for a JWT access token and user profile.

    When no local password matches, the credentials are retried against the
    configured LDAP directory — but only for identifiers the directory could
    legitimately own. Any account holding its own password stops at the local
    check, so a mistyped local password is never forwarded to the directory nor
    counted against the directory's lockout policy.
    """
    if server.user_manager.count() == 0:
        raise OctopError(ErrorCode.SETUP_REQUIRED, "initial admin not created")
    server.user_manager.raise_if_login_locked(body.username)
    effective = load_effective(
        server.services.settings_repo,
        server.services.secret_repo,
        current_env(),
    )
    client_ip = _client_ip(request)
    await ensure_captcha(effective, body.captcha_token, client_ip)
    amr: Literal["password", "ldap"] = "password"
    user = await server.user_manager.authenticate(body.username, body.password)
    if user is None:
        local_row = _local_row(server, body.username)
        if _directory_may_own(local_row):
            user = await _authenticate_ldap(server, body.username, body.password, client_ip)
            if user is not None:
                amr = "ldap"
    if user is None:
        raise OctopError(ErrorCode.AUTH_FAILED, "invalid credentials")
    mfa = MfaService(server.services)
    if mfa.has_verified_factor(user.id):
        return mfa.issue_mfa_challenge(user, amr=amr)
    token, ttl = mfa.mint_access_token(user)
    return {
        "access_token": token,
        "token_type": "Bearer",
        "expires_in": ttl,
        "user": _user_json(user, locale=user.locale),
    }


@router.post("/logout", status_code=204, summary="Sign out")
async def logout(user: Any = Depends(current_user), server: Any = Depends(get_server)) -> Response:
    """Record an audit event for the current session. JWTs are stateless and not revoked server-side."""
    server.services.audit_repo.write(actor=user.username, action="auth.logout")
    return Response(status_code=204)


@router.get("/me", summary="Current user profile")
async def me(
    user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    """Return the authenticated user's id, username, role, display name, and locale."""
    return me_payload(user, server)


@router.post("/change-password", status_code=204, summary="Change password")
async def change_password(
    body: ChangePasswordBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> Response:
    """Verify the old password and set a new one for the current user.

    Previously issued access tokens stop working. This response carries a
    replacement in ``X-Octop-Access-Token`` so the current client stays signed in.
    """
    await server.user_manager.change_password(user.username, body.old_password, body.new_password)
    token, _ttl = MfaService(server.services).mint_access_token(user)
    response = Response(status_code=204)
    response.headers[ACCESS_TOKEN_RESPONSE_HEADER] = token
    return response


class UpdateMeBody(BaseModel):
    display_name: str | None = None
    locale: str | None = None
    avatar_icon: str | None = Field(default=None, max_length=32)


@router.patch("/me", summary="Update profile")
async def update_me(
    body: UpdateMeBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    """Update the current user's display name and/or locale.

    Use ``model_dump(exclude_unset=True)`` so an explicitly-provided ``null``
    (e.g. ``{"display_name": null}``) clears the field, while an omitted field
    leaves the current value untouched.
    """
    provided = body.model_dump(exclude_unset=True)
    if "display_name" in provided:
        await server.user_manager.set_display_name(user.username, body.display_name)
    if "locale" in provided:
        await server.user_manager.set_locale(user.username, body.locale)
    if "avatar_icon" in provided:
        from octop.infra.users.profile_avatar import clean_avatar_icon, delete_profile_avatar

        server.services.user_repo.set_avatar_icon(user.id, clean_avatar_icon(body.avatar_icon))
        delete_profile_avatar(server.services.avatars("user"), str(user.id))
    updated = server.user_manager.get(user.username)
    assert updated is not None
    return me_payload(updated, server)


@router.post("/me/avatar", status_code=201, summary="Upload the current user's portrait")
async def upload_my_avatar(
    file: UploadFile = File(...),  # noqa: B008
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, str | None]:
    from octop.infra.users.profile_avatar import profile_avatar_url, write_profile_avatar

    write_profile_avatar(
        server.services.avatars("user"),
        str(user.id),
        await file.read(),
    )
    return {
        "avatar_url": profile_avatar_url(
            server.services.avatars("user"),
            str(user.id),
            f"/api/users/{user.id}/avatar",
        )
    }


@router.delete("/me/avatar", status_code=204, summary="Remove the current user's portrait")
async def delete_my_avatar(
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> Response:
    from octop.infra.users.profile_avatar import delete_profile_avatar

    delete_profile_avatar(server.services.avatars("user"), str(user.id))
    return Response(status_code=204)

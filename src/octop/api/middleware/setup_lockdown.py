"""Lock down all non-/setup endpoints while no users exist.

Returns ``503 {"setup_required": true}`` so the SPA can hard-redirect
to ``/setup``.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse

from octop.infra.errors import ErrorCode, OctopError
from octop.infra.utils.locale import resolve_request_locale

_OPEN_PREFIXES = (
    "/api/setup/",
    "/api/auth/enterprise/",
    "/api/enterprise/",
    "/api/health/",
)

_LOCAL_LOGIN_PATHS = frozenset(
    {
        "/api/auth/login",
        "/api/auth/captcha",
        "/api/auth/ldap/status",
        "/api/auth/mfa/verify",
        "/api/auth/mfa/passkey/options",
        "/api/auth/passkey/status",
        "/api/auth/passkey/login/options",
        "/api/auth/passkey/login/verify",
        "/api/auth/oidc/status",
        "/api/auth/oidc/start",
        "/api/auth/oidc/callback",
        "/api/auth/oidc/exchange",
        "/api/auth/oauth/status",
        "/api/auth/oauth/start",
        "/api/auth/oauth/callback",
        "/api/auth/oauth/exchange",
    }
)
_LOCAL_LOGIN_PREFIXES = ("/api/auth/device/", "/api/auth/invite/", "/api/setup/")


def install(app: Any, server: Any) -> None:
    @app.middleware("http")  # type: ignore[untyped-decorator]
    async def _lockdown(
        request: Request,
        call_next: Callable[[Request], Awaitable[Any]],
    ) -> Any:
        path = request.url.path
        if not path.startswith("/api/"):
            return await call_next(request)
        cfg = server.services.config if server.services else getattr(server, "config", None)
        if getattr(cfg, "enterprise_backend_url", None):
            local_path = path.rstrip("/")
            if local_path in _LOCAL_LOGIN_PATHS or (
                local_path != "/api/setup/status" and path.startswith(_LOCAL_LOGIN_PREFIXES)
            ):
                error = OctopError(ErrorCode.NOT_FOUND, "route not available in enterprise mode")
                return JSONResponse(
                    status_code=error.status,
                    content=error.to_envelope(locale=resolve_request_locale(request)),
                )
            return await call_next(request)
        open_exact = ["/api/health"]
        if cfg and cfg.enable_api_docs:
            open_exact.extend(("/api/docs", "/api/openapi.json"))
        if path in open_exact or any(path.startswith(p) for p in _OPEN_PREFIXES):
            return await call_next(request)
        if server.user_manager is None or server.user_manager.count() == 0:
            return JSONResponse(
                status_code=503,
                content={"setup_required": True},
            )
        return await call_next(request)

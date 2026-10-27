"""Access-token JWT helpers shared by HTTP auth and infra (Bridge)."""

from __future__ import annotations

import hashlib
import time
from typing import Any

import jwt


class InvalidToken(Exception): ...


class TokenExpired(InvalidToken): ...


def credential_fingerprint(password_hash: str | None) -> str:
    """Short fingerprint of a user's stored password hash (``pwv`` token claim).

    Changing or resetting the password changes the fingerprint, so tokens
    issued before that no longer validate. Accounts without a local password
    share one constant value.
    """
    digest = hashlib.sha256(f"octop-pwv:{password_hash or ''}".encode()).hexdigest()
    return digest[:16]


def sign_token(
    secret: bytes,
    *,
    sub: int,
    uname: str,
    role: str,
    ttl_seconds: int = 86400,
    pwv: str | None = None,
) -> str:
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": str(sub),
        "uname": uname,
        "role": role,
        "iat": now,
        "exp": now + ttl_seconds,
    }
    if pwv is not None:
        payload["pwv"] = pwv
    return jwt.encode(payload, secret, algorithm="HS256")


def decode_token(secret: bytes, token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        if "sub" in payload:
            payload["sub"] = int(payload["sub"])
        return payload
    except jwt.ExpiredSignatureError as exc:
        raise TokenExpired() from exc
    except jwt.InvalidTokenError as exc:
        raise InvalidToken(str(exc)) from exc

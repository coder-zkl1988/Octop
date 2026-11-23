"""Persistent device identity used by the enterprise control-plane bridge."""

from __future__ import annotations

import base64
import json
import platform
from typing import Any, cast
from uuid import uuid4

from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _key(user_id: int) -> str:
    return f"enterprise:device:{int(user_id)}"


def reset_identity(server: Any, user_id: int) -> None:
    services = getattr(server, "services", None)
    repo = getattr(services, "secret_repo", None)
    if repo is not None:
        repo.delete(_key(user_id))
    store = getattr(server, "_enterprise_device_identity", None)
    if store is not None:
        store.pop(int(user_id), None)


def is_registered(server: Any, user_id: int) -> bool:
    value = _read(server, user_id)
    return bool(value and value.get("registered") == "1")


def mark_registered(server: Any, user_id: int) -> None:
    value = _read(server, user_id)
    if value is None:
        return
    value["registered"] = "1"
    _write(server, user_id, value)


def _read(server: Any, user_id: int) -> dict[str, str] | None:
    services = getattr(server, "services", None)
    repo = getattr(services, "secret_repo", None)
    if repo is None:
        return cast(
            dict[str, str] | None,
            getattr(server, "_enterprise_device_identity", {}).get(int(user_id)),
        )
    raw = repo.get(_key(user_id))
    if raw is None:
        return None
    try:
        value = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else str(raw))
    except (TypeError, ValueError, UnicodeDecodeError):
        return None
    if not isinstance(value, dict):
        return None
    device_id = value.get("device_id")
    public_key = value.get("public_key")
    if not isinstance(device_id, str) or not device_id or not isinstance(public_key, str):
        return None
    result = {"device_id": device_id, "public_key": public_key}
    if value.get("registered") == "1":
        result["registered"] = "1"
    private_key = value.get("private_key")
    if isinstance(private_key, str) and private_key:
        result["private_key"] = private_key
    return result


def _write(server: Any, user_id: int, value: dict[str, str]) -> None:
    services = getattr(server, "services", None)
    repo = getattr(services, "secret_repo", None)
    if repo is None:
        store = getattr(server, "_enterprise_device_identity", None)
        if store is None:
            store = {}
            server._enterprise_device_identity = store
        store[int(user_id)] = value
        return
    key = _key(user_id)
    blob = json.dumps(value, separators=(",", ":")).encode("utf-8")
    if repo.get(key) is None:
        repo.get_or_create(key, lambda: blob)
    else:
        repo.rotate(key, blob)


def identity(server: Any, user_id: int) -> dict[str, str]:
    """Return a stable per-user device ID and X25519 public key."""
    current = _read(server, user_id)
    if current is not None:
        return current
    private = X25519PrivateKey.generate()
    value = {
        "device_id": f"desktop_{uuid4().hex}",
        "private_key": _encode(private.private_bytes_raw()),
        "public_key": _encode(private.public_key().public_bytes_raw()),
    }
    _write(server, user_id, value)
    return value


def headers(server: Any, user_id: int) -> dict[str, str]:
    value = identity(server, user_id)
    return {
        "X-Device-Id": value["device_id"],
        "X-Device-Public-Key": value["public_key"],
    }


def registration_body(server: Any, user_id: int) -> dict[str, str]:
    value = identity(server, user_id)
    system = platform.system() or "unknown"
    return {
        "device_id": value["device_id"],
        "name": platform.node() or "Tabby Desktop",
        "os": system.lower(),
        "os_name": f"{system} {platform.release()}".strip(),
        "model": platform.machine() or "unknown",
        "app_version": "1.2.0",
        "public_key": value["public_key"],
    }

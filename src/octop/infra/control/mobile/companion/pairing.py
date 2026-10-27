"""Pairing records for companion phones, kept in the ``settings`` KV table.

Each QR code carries a fresh random device key. The first phone that connects
with it claims the key: from then on only that ``deviceId`` may use it, and the
key doubles as the phone's bearer for the VLM proxy. Only the SHA-256 of a key
is stored; an unclaimed key expires after :data:`PAIRING_TTL_S`.
"""

from __future__ import annotations

import hashlib
import json
import secrets
import threading
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, replace
from typing import Any, Protocol

SETTINGS_KEY = "mobile.companion.devices"
PAIRING_TTL_S = 600


class SettingsStore(Protocol):
    def get(self, key: str) -> str | None: ...

    def set(self, key: str, value: str) -> None: ...


class PairingError(Exception):
    """Rejected phone credential; ``code`` is sent back in the auth error frame."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class PairedDevice:
    key_sha256: str
    user_id: int
    created_at: int
    device_id: str | None = None
    claimed_at: int | None = None
    model: str = ""

    @property
    def claimed(self) -> bool:
        return self.device_id is not None


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _from_dict(raw: dict[str, Any]) -> PairedDevice | None:
    try:
        return PairedDevice(
            key_sha256=str(raw["key_sha256"]),
            user_id=int(raw["user_id"]),
            created_at=int(raw["created_at"]),
            device_id=str(raw["device_id"]) if raw.get("device_id") else None,
            claimed_at=int(raw["claimed_at"]) if raw.get("claimed_at") else None,
            model=str(raw.get("model") or ""),
        )
    except (KeyError, TypeError, ValueError):
        return None


class PairingStore:
    def __init__(
        self,
        settings: SettingsStore,
        *,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._settings = settings
        self._clock = clock
        self._lock = threading.Lock()

    def replace_settings(self, settings: SettingsStore) -> None:
        """Retarget onto a rebound control-plane DB (setup wizard hot swap)."""
        with self._lock:
            self._settings = settings

    def _now(self) -> int:
        return int(self._clock())

    def _load(self) -> list[PairedDevice]:
        raw = self._settings.get(SETTINGS_KEY)
        if not raw:
            return []
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            return []
        if not isinstance(data, list):
            return []
        cutoff = self._now() - PAIRING_TTL_S
        out: list[PairedDevice] = []
        for item in data:
            record = _from_dict(item) if isinstance(item, dict) else None
            if record is None or (not record.claimed and record.created_at < cutoff):
                continue
            out.append(record)
        return out

    def _save(self, records: list[PairedDevice]) -> None:
        self._settings.set(SETTINGS_KEY, json.dumps([asdict(r) for r in records]))

    def create(self, user_id: int) -> tuple[str, PairedDevice]:
        """Mint a key for *user_id*; returns ``(plaintext_key, record)``."""
        key = secrets.token_urlsafe(32)
        record = PairedDevice(key_sha256=hash_key(key), user_id=user_id, created_at=self._now())
        with self._lock:
            records = self._load()
            records.append(record)
            self._save(records)
        return key, record

    def authenticate(self, key: str, device_id: str, *, model: str = "") -> PairedDevice:
        """Validate *key* for *device_id*, claiming an unused key on first use."""
        digest = hash_key(key)
        with self._lock:
            records = self._load()
            match = next((r for r in records if r.key_sha256 == digest), None)
            if match is None:
                raise PairingError("AUTH_FAILED", "unknown or expired pairing key")
            if match.claimed:
                if match.device_id != device_id:
                    raise PairingError("AUTH_FAILED", "pairing key belongs to another device")
                return match
            # A phone re-scanning a new QR replaces its previous pairing.
            claimed = replace(match, device_id=device_id, claimed_at=self._now(), model=model)
            records = [claimed if r is match else r for r in records if r.device_id != device_id]
            self._save(records)
            return claimed

    def by_key(self, key: str) -> PairedDevice | None:
        """Claimed record for *key* (used by the VLM proxy)."""
        digest = hash_key(key)
        with self._lock:
            return next(
                (r for r in self._load() if r.claimed and r.key_sha256 == digest),
                None,
            )

    def get(self, device_id: str) -> PairedDevice | None:
        with self._lock:
            return next((r for r in self._load() if r.device_id == device_id), None)

    def list_claimed(self, user_id: int | None = None) -> list[PairedDevice]:
        """Claimed devices, optionally only those owned by *user_id*."""
        with self._lock:
            return [
                r for r in self._load() if r.claimed and (user_id is None or r.user_id == user_id)
            ]

    def remove(self, device_id: str) -> PairedDevice | None:
        with self._lock:
            records = self._load()
            removed = next((r for r in records if r.device_id == device_id), None)
            if removed is not None:
                self._save([r for r in records if r is not removed])
            return removed

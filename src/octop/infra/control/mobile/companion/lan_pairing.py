"""LAN pairing requests (iTabby LAN pairing protocol v1).

A phone that found Octop over mDNS asks to pair; the request waits here until a
signed-in dashboard user compares the 6-digit code with the phone and approves
or rejects it. Approval mints an ordinary device key through
:class:`~.pairing.PairingStore` (owned by the approver, bound to the phone's
``deviceId``) and hands the phone the same ``ws://`` URL a QR code would carry.

Requests live in memory only: they last :data:`REQUEST_TTL_S` seconds and a
restart simply makes the phone ask again.
"""

from __future__ import annotations

import secrets
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, replace
from typing import Literal

from octop.infra.control.mobile.companion.pairing import PairingStore
from octop.infra.control.mobile.companion.urls import pairing_address

REQUEST_TTL_S = 120
POLL_INTERVAL_MS = 1500
RATE_WINDOW_S = 60
PER_SOURCE_LIMIT = 5
"""Requests one source IP may create per :data:`RATE_WINDOW_S`."""
MAX_PENDING = 20
"""Pending requests across all sources; more get 429 until some are decided."""
_LINGER_S = 60
"""How long a finished request keeps answering its status before it is forgotten."""

PairStatus = Literal["pending", "approved", "rejected", "expired"]


class PairRateLimited(Exception):
    """Too many requests from one source, or too many pending overall."""


@dataclass(frozen=True)
class PairOrigin:
    """How the phone reached Octop; the approved ``wsUrl`` is built from it."""

    scheme: str
    host: str
    """Local address the phone's request arrived on (not its ``Host`` header)."""
    port: int | None


@dataclass(frozen=True)
class PairRequest:
    request_id: str
    code: str
    device_id: str
    model: str
    manufacturer: str
    source_ip: str
    origin: PairOrigin
    created_at: float
    expires_at: float
    status: PairStatus = "pending"
    ws_url: str | None = None


class PairRequestStore:
    def __init__(self, *, clock: Callable[[], float] = time.time) -> None:
        self._clock = clock
        self._lock = threading.Lock()
        self._requests: dict[str, PairRequest] = {}
        self._recent: dict[str, deque[float]] = {}

    def _purge(self, now: float) -> None:
        for request_id, req in list(self._requests.items()):
            if req.status == "pending" and now >= req.expires_at:
                self._requests[request_id] = req = replace(req, status="expired")
            if now >= req.expires_at + _LINGER_S:
                del self._requests[request_id]
        for source, stamps in list(self._recent.items()):
            while stamps and stamps[0] <= now - RATE_WINDOW_S:
                stamps.popleft()
            if not stamps:
                del self._recent[source]

    def create(
        self,
        *,
        device_id: str,
        model: str,
        manufacturer: str,
        source_ip: str,
        origin: PairOrigin,
    ) -> PairRequest:
        """Open a request; a newer request from the same phone replaces its pending one."""
        with self._lock:
            now = self._clock()
            self._purge(now)
            stamps = self._recent.setdefault(source_ip, deque())
            pending = [r for r in self._requests.values() if r.status == "pending"]
            if len(stamps) >= PER_SOURCE_LIMIT or len(pending) >= MAX_PENDING:
                raise PairRateLimited
            stamps.append(now)
            for old in pending:
                if old.device_id == device_id:
                    del self._requests[old.request_id]
            req = PairRequest(
                request_id=f"pr_{secrets.token_urlsafe(16)}",
                code=f"{secrets.randbelow(1_000_000):06d}",
                device_id=device_id,
                model=model,
                manufacturer=manufacturer,
                source_ip=source_ip,
                origin=origin,
                created_at=now,
                expires_at=now + REQUEST_TTL_S,
            )
            self._requests[req.request_id] = req
            return req

    def get(self, request_id: str) -> PairRequest | None:
        with self._lock:
            self._purge(self._clock())
            return self._requests.get(request_id)

    def pending(self) -> list[PairRequest]:
        with self._lock:
            self._purge(self._clock())
            reqs = [r for r in self._requests.values() if r.status == "pending"]
        return sorted(reqs, key=lambda r: r.created_at)

    def cancel(self, request_id: str) -> bool:
        """The phone gave up; the request disappears from every dashboard."""
        with self._lock:
            return self._requests.pop(request_id, None) is not None

    def reject(self, request_id: str) -> PairRequest | None:
        """Reject a pending request; ``None`` when it is gone or already decided."""
        with self._lock:
            self._purge(self._clock())
            req = self._requests.get(request_id)
            if req is None or req.status != "pending":
                return None
            self._requests[request_id] = req = replace(req, status="rejected")
            return req

    def approve(
        self, request_id: str, mint_ws_url: Callable[[PairRequest], str]
    ) -> PairRequest | None:
        """Approve a pending request; ``None`` when it is gone or already decided.

        *mint_ws_url* runs under the store lock so two users approving at once
        mint exactly one key.
        """
        with self._lock:
            self._purge(self._clock())
            req = self._requests.get(request_id)
            if req is None or req.status != "pending":
                return None
            self._requests[request_id] = req = replace(
                req, status="approved", ws_url=mint_ws_url(req)
            )
            return req


def approve_request(
    store: PairRequestStore,
    pairing: PairingStore,
    request_id: str,
    *,
    user_id: int,
    bind_host: str,
    lan_ip: str | None,
) -> PairRequest | None:
    """Approve as *user_id*: mint a key bound to the phone and build its ``wsUrl``."""

    def mint(req: PairRequest) -> str:
        key, _record = pairing.create(user_id, device_id=req.device_id)
        return pairing_address(
            scheme=req.origin.scheme,
            host=req.origin.host,
            port=req.origin.port,
            bind_host=bind_host,
            key=key,
            lan_ip=lan_ip,
        ).ws_url

    return store.approve(request_id, mint)

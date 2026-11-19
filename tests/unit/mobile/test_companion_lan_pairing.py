"""LAN pairing requests: code, TTL, rate limits, cancel and approval minting a bound key."""

from __future__ import annotations

from urllib.parse import parse_qs, urlsplit

import pytest
from tests.support.companion import FakeSettings

from octop.infra.control.mobile.companion.lan_pairing import (
    MAX_PENDING,
    PER_SOURCE_LIMIT,
    RATE_WINDOW_S,
    REQUEST_TTL_S,
    PairOrigin,
    PairRateLimited,
    PairRequest,
    PairRequestStore,
    approve_request,
)
from octop.infra.control.mobile.companion.pairing import PairingError, PairingStore

LAN_ORIGIN = PairOrigin(scheme="http", host="192.168.1.20", port=8088)


class _Clock:
    def __init__(self) -> None:
        self.now = 1_000_000.0

    def __call__(self) -> float:
        return self.now


def _store() -> tuple[PairRequestStore, _Clock]:
    clock = _Clock()
    return PairRequestStore(clock=clock), clock


def _open(
    store: PairRequestStore, device_id: str = "Pixel-1", source_ip: str = "192.168.1.5"
) -> PairRequest:
    return store.create(
        device_id=device_id,
        model="24094RAD4C",
        manufacturer="Xiaomi",
        source_ip=source_ip,
        origin=LAN_ORIGIN,
    )


def test_request_has_six_digit_code_and_expires_after_ttl() -> None:
    store, clock = _store()
    req = _open(store)
    assert req.status == "pending"
    assert len(req.code) == 6 and req.code.isdigit()
    assert req.request_id.startswith("pr_")
    assert [r.request_id for r in store.pending()] == [req.request_id]

    clock.now += REQUEST_TTL_S
    found = store.get(req.request_id)
    assert found is not None and found.status == "expired"
    assert store.pending() == []

    clock.now += 3600  # a long-finished request is forgotten (phone sees 404)
    assert store.get(req.request_id) is None


def test_codes_are_random_and_zero_padded() -> None:
    store, _clock = _store()
    codes = {_open(store, f"dev-{i}", f"10.0.0.{i}").code for i in range(MAX_PENDING)}
    assert len(codes) > 1
    assert all(len(c) == 6 for c in codes)


def test_phone_cancel_removes_the_request() -> None:
    store, _clock = _store()
    req = _open(store)
    assert store.cancel(req.request_id) is True
    assert store.get(req.request_id) is None
    assert store.pending() == []
    assert store.cancel(req.request_id) is False


def test_new_request_from_same_phone_replaces_pending_one() -> None:
    store, _clock = _store()
    first = _open(store)
    second = _open(store)
    assert store.get(first.request_id) is None
    assert [r.request_id for r in store.pending()] == [second.request_id]


def test_per_source_rate_limit_resets_after_window() -> None:
    store, clock = _store()
    for i in range(PER_SOURCE_LIMIT):
        _open(store, f"dev-{i}")
    with pytest.raises(PairRateLimited):
        _open(store, "dev-x")
    _open(store, "dev-y", source_ip="192.168.1.6")  # other sources are unaffected
    clock.now += RATE_WINDOW_S + 1
    _open(store, "dev-z")


def test_global_pending_cap() -> None:
    store, _clock = _store()
    for i in range(MAX_PENDING):
        _open(store, f"dev-{i}", source_ip=f"10.0.{i // 250}.{i % 250}")
    with pytest.raises(PairRateLimited):
        _open(store, "dev-over", source_ip="10.9.9.9")


def test_reject_is_final() -> None:
    store, _clock = _store()
    req = _open(store)
    rejected = store.reject(req.request_id)
    assert rejected is not None and rejected.status == "rejected"
    assert store.reject(req.request_id) is None
    assert store.approve(req.request_id, lambda _r: "ws://x") is None
    found = store.get(req.request_id)
    assert found is not None and found.status == "rejected" and found.ws_url is None


def test_approval_mints_one_key_bound_to_the_phone_and_owned_by_approver() -> None:
    store, _clock = _store()
    pairing = PairingStore(FakeSettings())
    req = _open(store)
    approved = approve_request(
        store, pairing, req.request_id, user_id=7, bind_host="0.0.0.0", lan_ip="192.168.1.20"
    )
    assert approved is not None and approved.status == "approved"
    assert approved.ws_url is not None
    url = urlsplit(approved.ws_url)
    assert (url.scheme, url.netloc, url.path) == (
        "ws",
        "192.168.1.20:8088",
        "/api/mobile/companion/ws",
    )
    key = parse_qs(url.query)["token"][0]

    # A second approval (another user, a double click) does nothing.
    assert (
        approve_request(store, pairing, req.request_id, user_id=8, bind_host="0.0.0.0", lan_ip=None)
        is None
    )

    with pytest.raises(PairingError):
        pairing.authenticate(key, "Intruder-9")
    record = pairing.authenticate(key, "Pixel-1", model="24094RAD4C")
    assert record.user_id == 7 and record.claimed

    found = store.get(req.request_id)
    assert found is not None and found.ws_url == approved.ws_url


def test_loopback_origin_is_swapped_for_lan_address() -> None:
    store, _clock = _store()
    req = store.create(
        device_id="Pixel-1",
        model="m",
        manufacturer="g",
        source_ip="127.0.0.1",
        origin=PairOrigin(scheme="https", host="127.0.0.1", port=8443),
    )
    approved = approve_request(
        store,
        PairingStore(FakeSettings()),
        req.request_id,
        user_id=1,
        bind_host="0.0.0.0",
        lan_ip="10.1.2.3",
    )
    assert approved is not None and approved.ws_url is not None
    assert approved.ws_url.startswith("wss://10.1.2.3:8443/api/mobile/companion/ws?token=")


def test_expired_request_cannot_be_approved() -> None:
    store, clock = _store()
    req = _open(store)
    clock.now += REQUEST_TTL_S + 1
    assert store.approve(req.request_id, lambda _r: "ws://x") is None

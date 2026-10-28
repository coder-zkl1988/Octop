"""Pairing keys: one-time claim, expiry, ownership and storage format."""

from __future__ import annotations

import json

import pytest
from tests.support.companion import FakeSettings

from octop.infra.control.mobile.companion.pairing import (
    PAIRING_TTL_S,
    SETTINGS_KEY,
    PairingError,
    PairingStore,
)


class _Clock:
    def __init__(self) -> None:
        self.now = 1_000_000.0

    def __call__(self) -> float:
        return self.now


def _store() -> tuple[PairingStore, FakeSettings, _Clock]:
    settings, clock = FakeSettings(), _Clock()
    return PairingStore(settings, clock=clock), settings, clock


def test_key_is_claimed_by_first_device_only() -> None:
    store, _settings, _clock = _store()
    key, record = store.create(7)
    assert not record.claimed
    claimed = store.authenticate(key, "Pixel-1", model="Pixel")
    assert claimed.device_id == "Pixel-1" and claimed.user_id == 7
    assert store.authenticate(key, "Pixel-1").device_id == "Pixel-1"
    with pytest.raises(PairingError) as exc:
        store.authenticate(key, "Other-2")
    assert exc.value.code == "AUTH_FAILED"


def test_unknown_key_is_rejected() -> None:
    store, _settings, _clock = _store()
    with pytest.raises(PairingError):
        store.authenticate("nope", "Pixel-1")


def test_unclaimed_key_expires_but_claimed_one_does_not() -> None:
    store, _settings, clock = _store()
    stale, _ = store.create(1)
    kept, _ = store.create(1)
    store.authenticate(kept, "Pixel-1")
    clock.now += PAIRING_TTL_S + 1
    with pytest.raises(PairingError):
        store.authenticate(stale, "Pixel-2")
    assert store.authenticate(kept, "Pixel-1").claimed


def test_only_hashes_are_stored() -> None:
    store, settings, _clock = _store()
    key, _ = store.create(1)
    raw = settings.data[SETTINGS_KEY]
    assert key not in raw
    assert json.loads(raw)[0]["user_id"] == 1


def test_rescanning_replaces_previous_pairing_of_same_device() -> None:
    store, _settings, _clock = _store()
    old_key, _ = store.create(1)
    store.authenticate(old_key, "Pixel-1")
    new_key, _ = store.create(2)
    store.authenticate(new_key, "Pixel-1")
    assert [r.user_id for r in store.list_claimed()] == [2]
    with pytest.raises(PairingError):
        store.authenticate(old_key, "Pixel-1")


def test_lookup_listing_and_removal() -> None:
    store, _settings, _clock = _store()
    key_a, _ = store.create(1)
    key_b, _ = store.create(2)
    unclaimed, _ = store.create(1)
    store.authenticate(key_a, "A")
    store.authenticate(key_b, "B")
    assert store.by_key(key_a) is not None
    assert store.by_key(unclaimed) is None
    assert [r.device_id for r in store.list_claimed(1)] == ["A"]
    assert {r.device_id for r in store.list_claimed()} == {"A", "B"}
    assert store.get("B") is not None
    assert store.remove("A") is not None
    assert store.remove("A") is None
    assert store.by_key(key_a) is None


def test_corrupt_settings_value_is_treated_as_empty() -> None:
    store, settings, _clock = _store()
    settings.data[SETTINGS_KEY] = "{not json"
    assert store.list_claimed() == []
    key, _ = store.create(1)
    assert store.authenticate(key, "A").claimed

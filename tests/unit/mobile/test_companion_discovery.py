"""mDNS advertisement: TXT record, which binds are announced, install id, lifecycle.

No real multicast: ``AsyncZeroconf`` is replaced by a recorder.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest
from tests.support.companion import FakeSettings

from octop.infra.control.mobile.companion import discovery
from octop.infra.control.mobile.companion.discovery import (
    INSTALL_ID_KEY,
    PAIR_PATH,
    SERVICE_TYPE,
    advertise_address,
    build_service_info,
    display_name,
    install_id,
    start_lan_advertiser,
)


def _txt(info: Any) -> dict[str, str]:
    return {k.decode(): (v or b"").decode() for k, v in info.properties.items()}


def test_service_info_carries_protocol_txt_keys() -> None:
    info = build_service_info(
        name="Octop @ studio", install="abcd1234", address="192.168.1.20", port=8088, tls=False
    )
    assert info.type == SERVICE_TYPE == "_itabby._tcp.local."
    assert info.name == "Octop @ studio._itabby._tcp.local."
    assert info.port == 8088
    assert info.parsed_addresses() == ["192.168.1.20"]
    assert _txt(info) == {
        "v": "1",
        "kind": "octop",
        "name": "Octop @ studio",
        "id": "abcd1234",
        "pair": "/api/mobile/companion/pair",
    }


def test_tls_flag_only_when_served_over_https() -> None:
    info = build_service_info(name="n", install="i", address="10.0.0.2", port=443, tls=True)
    assert _txt(info)["tls"] == "1"


def test_pair_path_matches_the_phone_routes() -> None:
    assert PAIR_PATH == "/api/mobile/companion/pair"


@pytest.mark.parametrize(
    ("bind_host", "lan_ip", "expected"),
    [
        ("0.0.0.0", "192.168.1.20", "192.168.1.20"),
        ("::", "192.168.1.20", "192.168.1.20"),
        ("0.0.0.0", None, None),
        ("127.0.0.1", "192.168.1.20", None),
        ("localhost", "192.168.1.20", None),
        ("10.0.0.5", "192.168.1.20", "10.0.0.5"),
        ("fe80::1", "192.168.1.20", None),
        ("octop.example", "192.168.1.20", None),
    ],
)
def test_advertise_address(bind_host: str, lan_ip: str | None, expected: str | None) -> None:
    assert advertise_address(bind_host, lan_ip) == expected


def test_install_id_is_generated_once_and_persisted() -> None:
    settings = FakeSettings()
    first = install_id(settings)
    assert first and settings.data[INSTALL_ID_KEY] == first
    assert install_id(settings) == first


def test_display_name_fits_one_dns_label() -> None:
    assert display_name("studio.local") == "Octop @ studio"
    assert len(display_name("x" * 200).encode()) <= 63


class _FakeZeroconf:
    instances: list[_FakeZeroconf] = []

    def __init__(self, **kwargs: Any) -> None:
        self.kwargs = kwargs
        self.registered: list[Any] = []
        self.closed = False
        _FakeZeroconf.instances.append(self)

    async def async_register_service(self, info: Any, **kwargs: Any) -> None:
        self.registered.append((info, kwargs))

    async def async_unregister_all_services(self) -> None:
        self.registered.clear()

    async def async_close(self) -> None:
        self.closed = True


@pytest.fixture
def fake_zc() -> Any:
    _FakeZeroconf.instances = []
    with patch.object(discovery, "AsyncZeroconf", _FakeZeroconf):
        yield _FakeZeroconf


async def test_advertiser_registers_and_unregisters(fake_zc: Any) -> None:
    settings = FakeSettings()
    with patch.object(discovery, "lan_ipv4", return_value="192.168.1.20"):
        adv = await start_lan_advertiser(
            settings, enabled=True, bind_host="0.0.0.0", port=8088, tls=False
        )
    assert adv is not None
    [zc] = fake_zc.instances
    [(info, kwargs)] = zc.registered
    assert kwargs == {"allow_name_change": True}
    assert info.port == 8088 and _txt(info)["id"] == settings.data[INSTALL_ID_KEY]
    await adv.stop()
    assert zc.closed and zc.registered == []
    await adv.stop()  # idempotent


async def test_specific_bind_limits_interfaces(fake_zc: Any) -> None:
    adv = await start_lan_advertiser(
        FakeSettings(), enabled=True, bind_host="10.0.0.5", port=9000, tls=True
    )
    assert adv is not None
    [zc] = fake_zc.instances
    assert zc.kwargs["interfaces"] == ["10.0.0.5"]
    await adv.stop()


@pytest.mark.parametrize(
    ("enabled", "bind_host", "port"),
    [(False, "0.0.0.0", 8088), (True, "127.0.0.1", 8088), (True, "0.0.0.0", 0)],
)
async def test_nothing_advertised_when_off_or_unreachable(
    fake_zc: Any, enabled: bool, bind_host: str, port: int
) -> None:
    settings = FakeSettings()
    with patch.object(discovery, "lan_ipv4", return_value="192.168.1.20"):
        adv = await start_lan_advertiser(
            settings, enabled=enabled, bind_host=bind_host, port=port, tls=False
        )
    assert adv is None and fake_zc.instances == []
    assert INSTALL_ID_KEY not in settings.data


async def test_multicast_failure_is_not_fatal() -> None:
    class _Broken:
        def __init__(self, **_kwargs: Any) -> None:
            raise OSError("multicast not permitted")

    with (
        patch.object(discovery, "AsyncZeroconf", _Broken),
        patch.object(discovery, "lan_ipv4", return_value="192.168.1.20"),
    ):
        adv = await start_lan_advertiser(
            FakeSettings(), enabled=True, bind_host="0.0.0.0", port=8088, tls=False
        )
    assert adv is not None
    await adv.stop()

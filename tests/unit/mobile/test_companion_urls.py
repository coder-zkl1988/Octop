"""Pairing QR URL composition."""

from __future__ import annotations

from octop.infra.control.mobile.companion.urls import (
    is_loopback_host,
    pairing_address,
    public_base_url,
)


def test_loopback_dashboard_switches_to_lan_when_listening_on_all_interfaces() -> None:
    addr = pairing_address(
        scheme="http",
        host="127.0.0.1",
        port=8088,
        bind_host="0.0.0.0",
        key="k/1",
        lan_ip="192.168.1.20",
    )
    assert addr.ws_url == "ws://192.168.1.20:8088/api/mobile/companion/ws?token=k%2F1"
    assert addr.reachable_from_lan


def test_loopback_bind_is_flagged_unreachable() -> None:
    addr = pairing_address(
        scheme="http",
        host="localhost",
        port=8088,
        bind_host="127.0.0.1",
        key="k",
        lan_ip="192.168.1.20",
    )
    assert addr.ws_url == "ws://localhost:8088/api/mobile/companion/ws?token=k"
    assert not addr.reachable_from_lan


def test_https_domain_uses_wss_and_drops_default_port() -> None:
    addr = pairing_address(
        scheme="https", host="octop.example.com", port=None, bind_host="127.0.0.1", key="k"
    )
    assert addr.ws_url == "wss://octop.example.com/api/mobile/companion/ws?token=k"
    assert addr.reachable_from_lan


def test_ipv6_host_is_bracketed() -> None:
    addr = pairing_address(scheme="http", host="fd00::5", port=8088, bind_host="::", key="k")
    assert addr.ws_url.startswith("ws://[fd00::5]:8088/")


def test_helpers() -> None:
    assert is_loopback_host("[::1]") and is_loopback_host("localhost")
    assert not is_loopback_host("10.0.0.2")
    assert public_base_url("wss", "octop.example.com") == "https://octop.example.com"
    assert public_base_url("ws", "127.0.0.1:18088") == "http://127.0.0.1:18088"

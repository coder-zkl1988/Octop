"""Addresses a phone uses to reach Octop (QR pairing URL, VLM proxy base)."""

from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import quote

WS_PATH = "/api/mobile/companion/ws"
_LOOPBACK_NAMES = frozenset({"localhost", "ip6-localhost"})
_WILDCARD_BINDS = frozenset({"0.0.0.0", "::", ""})


@dataclass(frozen=True)
class PairingAddress:
    ws_url: str
    """What the QR code encodes; the app stores and reconnects to it verbatim."""
    reachable_from_lan: bool
    """False when only this machine (or ``adb reverse``) can reach the URL."""


def is_loopback_host(host: str) -> bool:
    name = host.strip("[]").lower()
    if name in _LOOPBACK_NAMES:
        return True
    try:
        return ipaddress.ip_address(name).is_loopback
    except ValueError:
        return False


def lan_ipv4() -> str | None:
    """Primary outbound IPv4 of this host (no packets are sent)."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("192.0.2.1", 9))  # TEST-NET-1: routing lookup only
        addr = str(probe.getsockname()[0])
    except OSError:
        return None
    finally:
        probe.close()
    return None if ipaddress.ip_address(addr).is_loopback else addr


def pairing_address(
    *,
    scheme: str,
    host: str,
    port: int | None,
    bind_host: str,
    key: str,
    lan_ip: str | None = None,
) -> PairingAddress:
    """Build the QR URL from how the dashboard was reached.

    A dashboard opened on ``localhost`` is swapped for the LAN address when
    Octop listens on all interfaces; otherwise the URL stays on loopback and
    is flagged unreachable from the LAN.
    """
    ws_scheme = "wss" if scheme in {"https", "wss"} else "ws"
    reachable = True
    if is_loopback_host(host):
        candidate = lan_ip if bind_host in _WILDCARD_BINDS else None
        if candidate:
            host = candidate
        else:
            reachable = False
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    default_port = 443 if ws_scheme == "wss" else 80
    netloc = host if port in (None, default_port) else f"{host}:{port}"
    return PairingAddress(
        ws_url=f"{ws_scheme}://{netloc}{WS_PATH}?token={quote(key, safe='')}",
        reachable_from_lan=reachable,
    )


def public_base_url(scheme: str, netloc: str) -> str:
    """HTTP base URL matching a phone's WebSocket origin (for the VLM proxy)."""
    http_scheme = "https" if scheme in {"https", "wss"} else "http"
    return f"{http_scheme}://{netloc}"

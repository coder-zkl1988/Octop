"""mDNS advertisement so iTabby phones on the same Wi-Fi find Octop by themselves.

Registers ``_itabby._tcp`` (LAN pairing protocol v1) while Octop listens on a
LAN-reachable address. The TXT record only names this install and the pairing
path — never a key or a user. Multicast failing (no permission, blocked
network) is logged and ignored: QR pairing keeps working without it.
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import secrets
import socket

from zeroconf import InterfaceChoice, IPVersion, ServiceInfo
from zeroconf.asyncio import AsyncZeroconf

from octop.infra.control.mobile.companion.pairing import SettingsStore
from octop.infra.control.mobile.companion.urls import is_loopback_host, lan_ipv4

logger = logging.getLogger(__name__)

SERVICE_TYPE = "_itabby._tcp.local."
PROTOCOL_VERSION = "1"
PAIR_PATH = "/api/mobile/companion/pair"
"""Phone-facing pairing prefix (``POST {PAIR_PATH}/requests`` …)."""
INSTALL_ID_KEY = "mobile.companion.install_id"
_WILDCARD_BINDS = frozenset({"0.0.0.0", "::", ""})
_MAX_LABEL_BYTES = 63


def install_id(settings: SettingsStore) -> str:
    """Stable random id of this Octop install (phones use it to dedupe and ignore)."""
    current = settings.get(INSTALL_ID_KEY)
    if current:
        return current
    new_id = secrets.token_hex(8)
    settings.set(INSTALL_ID_KEY, new_id)
    return new_id


def advertise_address(bind_host: str, lan_ip: str | None) -> str | None:
    """IPv4 address to announce, or ``None`` when phones cannot reach Octop.

    A wildcard bind announces the primary LAN address; a specific IPv4 bind
    announces itself; loopback, IPv6-only and hostname binds are not announced.
    """
    if bind_host in _WILDCARD_BINDS:
        return lan_ip
    if is_loopback_host(bind_host):
        return None
    try:
        addr = ipaddress.ip_address(bind_host)
    except ValueError:
        return None
    return str(addr) if addr.version == 4 else None


def _truncate_label(text: str) -> str:
    raw = text.encode("utf-8")[:_MAX_LABEL_BYTES]
    return raw.decode("utf-8", errors="ignore")


def display_name(hostname: str | None = None) -> str:
    host = (hostname or socket.gethostname()).split(".")[0] or "host"
    return _truncate_label(f"Octop @ {host}")


def build_service_info(
    *,
    name: str,
    install: str,
    address: str,
    port: int,
    tls: bool,
) -> ServiceInfo:
    properties = {
        "v": PROTOCOL_VERSION,
        "kind": "octop",
        "name": name,
        "id": install,
        "pair": PAIR_PATH,
    }
    if tls:
        properties["tls"] = "1"
    host_label = socket.gethostname().split(".")[0] or "octop"
    return ServiceInfo(
        SERVICE_TYPE,
        f"{name}.{SERVICE_TYPE}",
        port=port,
        properties=properties,
        server=f"{host_label}.local.",
        parsed_addresses=[address],
    )


class LanAdvertiser:
    """Owns one zeroconf registration for the lifetime of ``octop run``."""

    def __init__(self, info: ServiceInfo, *, interface: str | None) -> None:
        self._info = info
        self._interface = interface
        self._zc: AsyncZeroconf | None = None

    async def start(self) -> None:
        interfaces: InterfaceChoice | list[str] = (
            [self._interface] if self._interface else InterfaceChoice.All
        )
        try:
            self._zc = AsyncZeroconf(interfaces=interfaces, ip_version=IPVersion.V4Only)
            await self._zc.async_register_service(self._info, allow_name_change=True)
        except Exception:
            logger.warning(
                "LAN discovery (mDNS) unavailable; QR pairing still works", exc_info=True
            )
            await self.stop()
            return
        logger.info(
            "LAN discovery: advertising %s on %s:%s",
            SERVICE_TYPE,
            self._info.parsed_addresses()[0],
            self._info.port,
        )

    async def stop(self) -> None:
        zc, self._zc = self._zc, None
        if zc is None:
            return
        try:
            await zc.async_unregister_all_services()
            await zc.async_close()
        except Exception:
            logger.warning("LAN discovery shutdown failed", exc_info=True)


async def start_lan_advertiser(
    settings: SettingsStore,
    *,
    enabled: bool,
    bind_host: str,
    port: int,
    tls: bool,
) -> LanAdvertiser | None:
    """Advertise Octop when it is reachable from the LAN; ``None`` otherwise."""
    if not enabled or port <= 0:
        return None
    address = advertise_address(bind_host, lan_ipv4())
    if address is None:
        logger.info("LAN discovery off: Octop listens on %s only", bind_host or "loopback")
        return None
    info = build_service_info(
        name=display_name(),
        install=await asyncio.to_thread(install_id, settings),
        address=address,
        port=port,
        tls=tls,
    )
    specific = bind_host not in _WILDCARD_BINDS
    advertiser = LanAdvertiser(info, interface=address if specific else None)
    await advertiser.start()
    return advertiser

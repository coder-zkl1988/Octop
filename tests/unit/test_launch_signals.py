"""``octop run`` turns SIGINT / SIGTERM into a graceful uvicorn exit."""

from __future__ import annotations

import signal
from types import SimpleNamespace

from octop.launch import _shutdown_on_signals


def _server() -> SimpleNamespace:
    return SimpleNamespace(should_exit=False, force_exit=False)


def test_sigterm_asks_every_server_to_exit_and_restores_handlers() -> None:
    before = signal.getsignal(signal.SIGTERM)
    servers = [_server(), _server()]
    with _shutdown_on_signals(servers):
        handler = signal.getsignal(signal.SIGTERM)
        assert callable(handler)
        handler(signal.SIGTERM, None)
        assert all(s.should_exit for s in servers)
        assert not any(s.force_exit for s in servers)
        handler(signal.SIGTERM, None)  # second signal forces the exit
        assert all(s.force_exit for s in servers)
    assert signal.getsignal(signal.SIGTERM) == before


def test_sigint_is_graceful_too() -> None:
    servers = [_server()]
    with _shutdown_on_signals(servers):
        signal.getsignal(signal.SIGINT)(signal.SIGINT, None)  # type: ignore[operator]
    assert servers[0].should_exit

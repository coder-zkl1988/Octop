"""Composition root — wire OctopServer, FastAPI, and uvicorn for ``octop run``."""

from __future__ import annotations

import asyncio
import logging
import signal
import sys
import threading
from collections.abc import Iterator
from contextlib import contextmanager, suppress
from types import FrameType
from typing import Any

from octop.infra.server import OctopServer
from octop.infra.utils.accept_errors import coalesce_accept_errors

logger = logging.getLogger(__name__)


def _ensure_linux_bubblewrap() -> None:
    """Best-effort startup provisioning; never fail the ``octop run`` process."""
    try:
        from octop.infra.utils.bwrap import ensure_bubblewrap

        result = ensure_bubblewrap()
    except Exception:
        logger.warning("background bubblewrap provisioning failed", exc_info=True)
        return
    status = result.get("status")
    detail = result.get("detail")
    if status == "degraded":
        logger.warning("background bubblewrap provisioning degraded: %s", detail or "unknown")
    else:
        logger.info("background bubblewrap provisioning status=%s", status)


def _schedule_linux_bubblewrap_ensure() -> asyncio.Task[None] | None:
    """Run bubblewrap provisioning once in the background on Linux."""
    if not sys.platform.startswith("linux"):
        return None
    return asyncio.create_task(
        asyncio.to_thread(_ensure_linux_bubblewrap),
        name="ensure-linux-bubblewrap",
    )


async def _cancel_background_task(task: asyncio.Task[None] | None) -> None:
    """Drop a startup background task on shutdown; never raise."""
    if task is None or task.done():
        return
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task


async def _serve(server: Any) -> None:
    await server.serve()


_EXIT_SIGNALS: tuple[int, ...] = tuple(
    sig
    for sig in (
        getattr(signal, "SIGINT", None),
        getattr(signal, "SIGTERM", None),
        getattr(signal, "SIGBREAK", None),
    )
    if sig is not None
)


@contextmanager
def _shutdown_on_signals(servers: list[Any]) -> Iterator[None]:
    """Route SIGINT / SIGTERM to every uvicorn server and let ``run_foreground`` finish.

    ``uvicorn.Server.capture_signals`` re-raises the captured signal once
    ``serve()`` returns. For SIGTERM the restored handler is ``SIG_DFL``, which
    killed the process before ``OctopServer.stop()`` ran — every systemd /
    Docker stop skipped the DB close, harness drain, and cron/gateway shutdown.
    The servers here skip uvicorn's capture; this handler asks all of them to
    exit (a second signal forces it) and restores the old handlers afterwards.
    """
    if threading.current_thread() is not threading.main_thread():
        yield
        return

    def handle_exit(sig: int, frame: FrameType | None) -> None:
        del sig, frame
        for server in servers:
            if server.should_exit:
                server.force_exit = True
            server.should_exit = True

    previous: dict[int, Any] = {}
    for sig in _EXIT_SIGNALS:
        with suppress(OSError, ValueError):
            previous[sig] = signal.signal(sig, handle_exit)
    try:
        yield
    finally:
        for sig, handler in previous.items():
            with suppress(OSError, ValueError):
                signal.signal(sig, handler)


async def run_foreground(
    *,
    host: str | None,
    port: int | None,
    reload: bool,
    workers: int,
    log_level: str | None,
    ssl_certfile: str | None,
    ssl_keyfile: str | None,
) -> None:
    """Boot the domain server, serve the HTTP API, then shut down cleanly."""
    import uvicorn

    from octop.api.app import build_app
    from octop.infra.bridge.transport import BRIDGE_WS_MAX_BYTES
    from octop.infra.setup.tls.http_companion import build_http_companion_app
    from octop.infra.setup.tls.listeners import build_listen_plan
    from octop.infra.setup.tls.store import resolve_tls_paths

    srv = OctopServer()
    await srv.start()
    bwrap_task = _schedule_linux_bubblewrap_ensure()
    # Greenfield deferral leaves services unset until /setup/database binds.
    cfg = srv.services.config if srv.services is not None else srv.config
    assert cfg is not None
    bind_host = host or cfg.bind_host
    bind_port = port or cfg.port
    if ssl_certfile is None and ssl_keyfile is None:
        ssl_certfile, ssl_keyfile = resolve_tls_paths(srv.paths.root, cfg.tls)

    plan = build_listen_plan(
        cfg,
        bind_host=bind_host,
        bind_port=bind_port,
        ssl_certfile=ssl_certfile,
        ssl_keyfile=ssl_keyfile,
    )
    level = (log_level or cfg.log_level).lower()
    worker_count = 1 if plan.dual_listeners or reload else workers
    if plan.dual_listeners and (reload or workers > 1):
        logger.warning(
            "TLS dual-port mode forces workers=1 and disables reload",
        )
        reload = False

    class _Server(uvicorn.Server):
        """uvicorn server whose signals are handled by ``_shutdown_on_signals``."""

        @contextmanager
        def capture_signals(self) -> Iterator[None]:
            yield

        def install_signal_handlers(self) -> None:  # uvicorn < 0.29
            return None

    app = build_app(srv)
    servers: list[uvicorn.Server] = []

    if plan.dual_listeners:
        assert plan.https_port is not None
        assert plan.http_port is not None
        https_config = uvicorn.Config(
            app,
            host=plan.bind_host,
            port=plan.https_port,
            log_level=level,
            workers=worker_count,
            reload=False,
            ssl_certfile=plan.ssl_certfile,
            ssl_keyfile=plan.ssl_keyfile,
            ws_max_size=BRIDGE_WS_MAX_BYTES,
        )
        companion = build_http_companion_app(https_port=plan.https_port)
        http_config = uvicorn.Config(
            companion,
            host=plan.bind_host,
            port=plan.http_port,
            log_level=level,
            workers=1,
            reload=False,
        )
        servers.append(_Server(https_config))
        servers.append(_Server(http_config))
        logger.info(
            "Listening on https://%s:%s and http://%s:%s (ACME + redirect)",
            plan.bind_host,
            plan.https_port,
            plan.bind_host,
            plan.http_port,
        )
    else:
        single_config = uvicorn.Config(
            app,
            host=plan.bind_host,
            port=plan.http_port or bind_port,
            log_level=level,
            workers=worker_count,
            reload=reload,
            ssl_certfile=plan.ssl_certfile,
            ssl_keyfile=plan.ssl_keyfile,
            ws_max_size=BRIDGE_WS_MAX_BYTES,
        )
        servers.append(_Server(single_config))

    from octop.infra.agents.memory.slim_control import MemorySlimControl
    from octop.infra.control.mobile.companion.discovery import start_lan_advertiser

    # Greenfield deferral (no DB yet) skips mDNS: pairing needs a signed-in user.
    lan_advertiser = (
        await start_lan_advertiser(
            srv.services.settings_repo,
            enabled=cfg.enable_lan_pairing,
            bind_host=plan.bind_host,
            port=(plan.https_port if plan.dual_listeners else plan.http_port) or bind_port,
            tls=plan.ssl_certfile is not None,
        )
        if srv.services is not None
        else None
    )
    memory_control = MemorySlimControl(srv)
    with coalesce_accept_errors(asyncio.get_running_loop()):
        try:
            await memory_control.start()
            with _shutdown_on_signals(servers):
                await asyncio.gather(*(_serve(s) for s in servers))
        finally:
            await memory_control.close()
            if lan_advertiser is not None:
                await lan_advertiser.stop()
            await _cancel_background_task(bwrap_task)
            await srv.stop()


def run_foreground_blocking(**kwargs: Any) -> None:
    """Sync entry for Click commands and tests."""
    asyncio.run(run_foreground(**kwargs))

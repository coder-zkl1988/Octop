"""Server log redaction and isolated shutdown steps."""

from __future__ import annotations

import logging

from octop.infra.server import _RedactQueryTokenFilter, _shutdown_step


def _record(args: tuple[object, ...]) -> logging.LogRecord:
    return logging.LogRecord("uvicorn.access", logging.INFO, __file__, 1, "%s %s", args, None)


def test_access_log_masks_token_query_params() -> None:
    record = _record(
        ("GET", "/api/browser-stream/ws?token=eyJ.secret.sig&width=10&access_token=abc")
    )
    assert _RedactQueryTokenFilter().filter(record)
    line = record.getMessage()
    assert "eyJ.secret.sig" not in line
    assert "abc" not in line
    assert "token=***" in line
    assert "width=10" in line


def test_access_log_leaves_other_lines_alone() -> None:
    record = _record(("GET", "/api/agents?page=2"))
    _RedactQueryTokenFilter().filter(record)
    assert record.getMessage() == "GET /api/agents?page=2"


async def test_shutdown_step_logs_and_continues(caplog: object) -> None:
    calls: list[str] = []

    async def broken() -> None:
        raise RuntimeError("boom")

    async def ok() -> None:
        calls.append("ok")

    await _shutdown_step("broken", broken)
    await _shutdown_step("ok", ok)
    assert calls == ["ok"]

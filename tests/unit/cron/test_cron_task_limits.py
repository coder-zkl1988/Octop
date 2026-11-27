"""Role-policy limits on automation tasks: runs at once and minutes per run."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from tests.unit.cron.test_cron_manager import (
    _cron_id,
    _make_agent,
    _make_manager,
    _make_services,
)

from octop.infra.errors import ErrorCode, OctopError
from octop.infra.users.resource_policy import (
    POLICY_MAX_CONCURRENT_TASKS,
    POLICY_TASK_TIMEOUT_MINUTES,
)


@pytest.mark.asyncio
async def test_a_run_over_the_concurrent_limit_is_skipped(tmp_path: Path) -> None:
    services = _make_services(tmp_path)
    aid, uid = _make_agent(services)
    mgr = _make_manager(services)
    services.repos.user_policy_repo.merge(uid, {POLICY_MAX_CONCURRENT_TASKS: "1"})
    first, second = _cron_id(), _cron_id()
    for cid in (first, second):
        await mgr.create(
            cron_id=cid, agent_id=aid, user_id=uid, trigger="interval:3600", prompt="run"
        )
    started = asyncio.Event()
    release = asyncio.Event()

    async def _deliver(_command: object) -> None:
        started.set()
        await release.wait()

    mgr._delivery_service.deliver = _deliver  # type: ignore[method-assign]
    running = asyncio.create_task(mgr.run_now(first, wait=True))
    await started.wait()
    with pytest.raises(OctopError) as exc:
        await mgr.run_now(second, wait=True)
    assert exc.value.code is ErrorCode.CRON_TASK_LIMIT
    row = services.repos.cron_repo.get(second)
    assert row is not None and row.last_status == "skipped"
    assert row.last_error and "1" in row.last_error
    release.set()
    await running
    await mgr.run_now(second, wait=True)
    assert services.repos.cron_repo.get(second).last_status == "ok"  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_a_run_over_the_time_limit_is_stopped(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    services = _make_services(tmp_path)
    aid, uid = _make_agent(services)
    mgr = _make_manager(services)
    services.repos.user_policy_repo.merge(uid, {POLICY_TASK_TIMEOUT_MINUTES: "1"})
    cid = _cron_id()
    await mgr.create(cron_id=cid, agent_id=aid, user_id=uid, trigger="interval:3600", prompt="run")

    async def _deliver(_command: object) -> None:
        await asyncio.sleep(30)

    mgr._delivery_service.deliver = _deliver  # type: ignore[method-assign]
    original = mgr._execute_claimed

    async def _fast(row: object, **kwargs: object) -> None:
        kwargs["timeout_seconds"] = 0.05
        await original(row, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(mgr, "_execute_claimed", _fast)
    await mgr.run_now(cid)
    for _ in range(100):
        await asyncio.sleep(0.02)
        row = services.repos.cron_repo.get(cid)
        if row is not None and row.last_status:
            break
    assert row is not None and row.last_status == "error"
    assert row.last_error and "1" in row.last_error

"""A paid phone task stops on access loss; stopping one's own task stays available."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

import pytest

from octop.infra.plugin_apps.contracts import PluginAppError, PluginLicense
from octop.infra.plugin_apps.host import AppContext


def context(hub: Any) -> AppContext:
    host = SimpleNamespace(
        server=SimpleNamespace(
            services=SimpleNamespace(config=SimpleNamespace(enterprise_backend_url="")),
            app_runtime=SimpleNamespace(companion_hub=hub),
        )
    )
    ctx = AppContext(
        host,
        "xhs-ops",
        1,
        PluginLicense(
            plugin_id="xhs-ops",
            tenant_id="t1",
            member_id="m1",
            status="active",
            version=1,
            features=["xhs.ops"],
        ),
    )
    ctx.execution_feature = "xhs.ops"
    ctx.devices = lambda: [{"device_id": "d1", "online": True}]
    ctx.device = lambda _device: {"device_id": "d1", "online": True}

    async def require(_feature: str) -> None:
        return None

    ctx.require = require
    return ctx


async def test_cancel_remains_scoped_without_mobile_permission() -> None:
    calls = []

    async def cancel(device: str, task: str) -> Any:
        calls.append((device, task))
        return SimpleNamespace(error_code=None)

    ctx = context(SimpleNamespace(cancel_task=cancel))
    ctx.device = lambda _device: (_ for _ in ()).throw(
        PluginAppError("permission_required", status=403)
    )
    await ctx.cancel_phone("d1", "exact-task")
    assert calls == [("d1", "exact-task")]
    with pytest.raises(PluginAppError, match="device_not_owned"):
        await ctx.cancel_phone("different-owner", "exact-task")
    assert len(calls) == 1


async def test_cancelling_sdk_wait_stops_the_exact_phone_task() -> None:
    entered, cancelled = asyncio.Event(), []
    forwarded = []

    async def run(device: str, _task: str, **kwargs: Any) -> None:
        forwarded.append((device, kwargs))
        entered.set()
        await asyncio.Event().wait()

    async def cancel(device: str, task_id: str) -> Any:
        cancelled.append((device, task_id))
        return SimpleNamespace(error_code=None)

    ctx = context(SimpleNamespace(run_task=run, cancel_task=cancel))
    waiting = asyncio.create_task(
        ctx.run_phone("d1", "check", task_id="t1", policy={}, max_steps=100, idle_timeout_s=120)
    )
    await entered.wait()
    waiting.cancel()
    with pytest.raises(asyncio.CancelledError):
        await waiting
    assert cancelled == [("d1", "t1")]
    assert forwarded[0][1]["max_steps"] == 100


async def test_mobile_access_loss_during_wait_cancels_without_new_dispatch(
    monkeypatch: Any,
) -> None:
    calls, checks = [], []

    async def run(_device: str, _task: str, **_: Any) -> None:
        calls.append("run")
        await asyncio.Event().wait()

    async def cancel(_device: str, task: str) -> Any:
        calls.append("cancel:" + task)
        return SimpleNamespace(error_code=None)

    ctx = context(SimpleNamespace(run_task=run, cancel_task=cancel))

    def device(_device: str) -> dict[str, Any]:
        checks.append(True)
        if len(checks) > 1:
            raise PluginAppError("permission_required", status=403)
        return {"device_id": "d1", "online": True}

    ctx.device = device
    original_wait = asyncio.wait

    async def tick(tasks: Any, **_: Any) -> Any:
        return await original_wait(tasks, timeout=0)

    monkeypatch.setattr("octop.infra.plugin_apps.host.asyncio.wait", tick)
    with pytest.raises(PluginAppError, match="phone_access_revoked_during_run"):
        await ctx.run_phone("d1", "check", task_id="t1", policy={})
    assert calls == ["run", "cancel:t1"]


async def test_current_enterprise_phone_capability_is_checked_before_dispatch(
    monkeypatch: Any,
) -> None:
    ctx = context(SimpleNamespace())
    ctx.host.server.services.config.enterprise_backend_url = "http://enterprise.invalid"

    async def policy(*_args: Any, **_kwargs: Any) -> Any:
        return {"policy": {"caps": {"cap.phone.adb": "deny"}}}

    monkeypatch.setattr("octop.infra.plugin_apps.host.enterprise_request", policy)
    with pytest.raises(PluginAppError, match="permission_required"):
        await ctx.run_phone("d1", "check", task_id="not-sent", policy={})


async def test_media_stops_before_next_image_after_enterprise_phone_access_is_revoked(
    monkeypatch: Any,
) -> None:
    calls = []

    async def push(device: str, items: Any, **kwargs: Any) -> Any:
        calls.append((device, items, kwargs))
        return [{"filename": items[0]["filename"]}]

    ctx = context(SimpleNamespace(push_media=push))
    ctx.host.server.services.config.enterprise_backend_url = "http://enterprise.invalid"

    async def policy(*_args: Any, **_kwargs: Any) -> Any:
        return {"policy": {"caps": {"cap.phone.adb": "deny" if calls else "allow"}}}

    monkeypatch.setattr("octop.infra.plugin_apps.host.enterprise_request", policy)
    with pytest.raises(PluginAppError, match="permission_required"):
        await ctx.media(
            "d1", [{"filename": "first.png"}, {"filename": "second.png"}], album="Tabby/test"
        )
    assert calls == [("d1", [{"filename": "first.png"}], {"album": "Tabby/test"})]


async def test_phone_dispatch_keeps_original_feature_while_permission_check_awaits() -> None:
    checks = []

    async def run(_device: str, _task: str, **_: Any) -> Any:
        return SimpleNamespace(success=True)

    ctx = context(SimpleNamespace(run_task=run))

    async def permission(_device: str) -> None:
        ctx.execution_feature = "xhs.comment"

    async def require(feature: str) -> None:
        checks.append(feature)

    ctx._require_phone_permission, ctx.require = permission, require
    await ctx.run_phone("d1", "browse", task_id="bound-operation", policy={})
    assert checks == ["xhs.ops"]


def _xhs_policy() -> dict[str, Any]:
    return {
        "operationClass": "app.use.xhs",
        "targetPackages": ["com.xingin.xhs"],
    }


def _xhs_login_policy() -> dict[str, Any]:
    return {
        "operationClass": "account.login",
        "targetPackages": ["com.xingin.xhs"],
    }


async def test_xhs_dispatch_requires_enforced_phone_policy() -> None:
    dispatched = []

    async def run(*_args: Any, **_kwargs: Any) -> Any:
        dispatched.append(True)
        return SimpleNamespace(success=True)

    ctx = context(SimpleNamespace(run_task=run))
    ctx.device = lambda _device: {
        "device_id": "d1",
        "online": True,
        "policy_mode": "observe",
        "skill_bundle_version": 66,
        "skill_sync_status": "current",
    }
    with pytest.raises(PluginAppError, match="phone_policy_not_enforce"):
        await ctx.run_phone("d1", "xhs", task_id="xhs-1", policy=_xhs_policy())
    assert dispatched == []


async def test_xhs_account_login_also_requires_enforced_phone_policy() -> None:
    dispatched = []

    async def run(*_args: Any, **_kwargs: Any) -> Any:
        dispatched.append(True)
        return SimpleNamespace(success=True)

    ctx = context(SimpleNamespace(run_task=run))
    ctx.device = lambda _device: {
        "device_id": "d1",
        "online": True,
        "policy_mode": "observe",
        "skill_bundle_version": 66,
        "skill_sync_status": "current",
    }
    with pytest.raises(PluginAppError, match="phone_policy_not_enforce"):
        await ctx.run_phone("d1", "login", task_id="xhs-login-1", policy=_xhs_login_policy())
    assert dispatched == []


async def test_xhs_dispatch_requires_current_skill_bundle() -> None:
    dispatched = []

    async def run(*_args: Any, **_kwargs: Any) -> Any:
        dispatched.append(True)
        return SimpleNamespace(success=True)

    ctx = context(SimpleNamespace(run_task=run))
    ctx.device = lambda _device: {
        "device_id": "d1",
        "online": True,
        "policy_mode": "enforce",
        "skill_bundle_version": 65,
        "skill_sync_status": "current",
    }
    with pytest.raises(PluginAppError, match="phone_skills_not_ready"):
        await ctx.run_phone("d1", "xhs", task_id="xhs-2", policy=_xhs_policy())
    assert dispatched == []


async def test_xhs_dispatch_forwards_after_contract_is_ready() -> None:
    forwarded = []

    async def run(*args: Any, **kwargs: Any) -> Any:
        forwarded.append((args, kwargs))
        return SimpleNamespace(success=True)

    ctx = context(SimpleNamespace(run_task=run))
    ctx.device = lambda _device: {
        "device_id": "d1",
        "online": True,
        "policy_mode": "enforce",
        "skill_bundle_version": 66,
        "skill_sync_status": "current",
    }
    await ctx.run_phone("d1", "xhs", task_id="xhs-3", policy=_xhs_policy())
    assert forwarded and forwarded[0][0][:2] == ("d1", "xhs")

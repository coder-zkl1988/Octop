"""Daily operation state transitions use real task bindings and receipt facts."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import UTC, datetime
from itertools import count
from types import SimpleNamespace
from typing import Any

import pytest

from tests.unit.test_xhs_app_domain import domain
from tests.unit.test_xhs_profile_execution import PhoneContext, ready_context, reply

daily = domain.daily
operations = daily.operations


@pytest.fixture(autouse=True)
def controller_clock(monkeypatch: Any) -> None:
    moment = datetime(2026, 11, 3, 18, tzinfo=UTC)

    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz: Any = None) -> datetime:
            return moment.astimezone(tz) if tz is not None else moment.replace(tzinfo=None)

    monkeypatch.setattr(daily, "datetime", FrozenDatetime)
    monkeypatch.setattr(domain, "now", lambda: moment.isoformat())
    ticks = count(0, 200)
    monkeypatch.setattr(daily, "monotonic", lambda: next(ticks))


async def context() -> PhoneContext:
    ctx = await ready_context()
    ctx.host.server.services.config.default_timezone = "Asia/Shanghai"
    account = ctx.doc["accounts"][0]
    account["interest_pool"] = {
        "core": ["a", "b", "c", "d", "e"],
        "extended": ["f"],
        "general": ["g"],
    }
    account["profile_draft"].update(
        verified_at=domain.now(),
        verified_version=account["version"],
        verified_account_id=account["platform_account_id"],
    )
    return ctx


def plan(
    *, index: int = 1, segments: int = 1, posts: int = 2, like: bool = False
) -> dict[str, Any]:
    interaction = operations.InteractionConfig().model_dump()
    interaction["like"].update(enabled=like, ratio_percent=100)
    return {
        "keywords": [{"keyword": f"兴趣{index}", "count": posts}],
        "home_feed_count": 0,
        "dwell_sec_min": 11,
        "dwell_sec_max": 25,
        "interaction": interaction,
        "segment": {"index": index, "count": segments},
    }


async def save(
    ctx: PhoneContext, plans: list[dict[str, Any]] | None = None, *, account_id: str = "a1"
) -> dict[str, Any]:
    account = domain.find(ctx.doc, "accounts", account_id)
    await domain.command(
        ctx,
        "ops.save",
        {
            "account_id": account_id,
            "account_version": account["version"],
            "browse_defaults": {"daily_target_posts": 2, "daily_segments": 1},
            "interaction": (plans or [plan()])[0]["interaction"],
            **({"plans": plans} if plans is not None else {}),
        },
    )
    return ctx.doc["operation_days"][-1]


async def start(ctx: PhoneContext, day: dict[str, Any]) -> dict[str, Any]:
    versioned = {"id": day["id"], "version": day["version"]}
    await domain.command(ctx, "ops.precheck", versioned)
    body = {**versioned, "confirmed": True, "confirm_digest": day["precheck"]["digest"]}
    await domain.command(ctx, "ops.start", body)
    return body


def identity(ctx: PhoneContext, account_id: str = "a1") -> dict[str, Any]:
    return reply(
        "IDENTITY_JSON:",
        {
            "v": 1,
            "status": "visible",
            "accountId": domain.find(ctx.doc, "accounts", account_id)["platform_account_id"],
        },
    )


def record(*, index: int = 1, planned: int = 2, browsed: int = 2, likes: int = 0) -> dict[str, Any]:
    return {
        "mode": "search",
        "keyword": f"兴趣{index}",
        "planned": planned,
        "browsed": browsed,
        "skipped": planned - browsed,
        "refreshCount": 0,
        "interactions": {"like": likes, "collect": 0, "follow": 0},
        "anomalies": [] if browsed else ["no_results"],
        "posts": [
            {
                "title": f"训练{number}",
                "author": "公开作者",
                "action": "like" if number < likes else "none",
                "commentsRead": 0,
                "commentsComplete": True,
                "dwellSeconds": 11,
                "commentWorthy": False,
                "summary": "运动记录",
            }
            for number in range(browsed)
        ],
    }


def abandon_pending(ctx: PhoneContext) -> None:
    for pending in ctx.spawned:
        pending.close()
    ctx.spawned.clear()


async def test_exact_nonce_two_segments_and_actual_counts_survive_repeated_start() -> None:
    ctx = await context()
    day = await save(ctx, [plan(index=1, segments=2), plan(index=2, segments=2)])
    assert day["date"] == "2026-11-04"
    ctx.results = [
        identity(ctx),
        reply("RECORD_JSON:", record()),
        identity(ctx),
        reply("RECORD_JSON:", record(index=2)),
    ]
    body = await start(ctx, day)
    await domain.command(ctx, "ops.start", body)
    assert len(ctx.spawned) == 1
    await ctx.drain()
    assert day["status"] == "completed" and day["target_met"]
    assert [run["status"] for run in ctx.doc["runs"]] == ["success", "success"]
    assert sum(run["summary"]["browsed"] for run in ctx.doc["runs"]) == 4
    assert len(ctx.phone_calls) == 4
    assert "TYPE" not in ctx.phone_calls[0]["policy"]["allowedActions"]
    assert "TYPE" in ctx.phone_calls[1]["policy"]["allowedActions"]
    assert ctx.doc["runs"][0]["chunks"][0]["verification_status"] == "not_verifiable"
    assert all(
        run["summary"]["platform_verification"] == "not_verifiable" for run in ctx.doc["runs"]
    )
    assert len({run["idempotency_key"] for run in ctx.doc["runs"]}) == 2
    await domain.command(ctx, "ops.start", body)
    assert len(ctx.phone_calls) == 4


async def test_bad_receipt_preserves_unknown_hold_and_cancels_later_device_segments(
    monkeypatch: Any,
) -> None:
    ctx = await context()
    day = await save(
        ctx, [plan(index=1, segments=2, like=True), plan(index=2, segments=2, like=True)]
    )
    ctx.results = [identity(ctx), reply("RECORD_JSON:", record(likes=2))]
    monkeypatch.setattr(daily, "monotonic", lambda: 0)
    await start(ctx, day)
    await ctx.drain()
    first, second = ctx.doc["runs"]
    assert first["status"] == "unknown" and first["error"] == "operation_receipt_invalid"
    assert first["chunks"][0]["quota"]["like"]["max"] == 2
    assert second["status"] == "cancelled"
    assert domain.batches.reserved_device_ids(ctx.doc) == {"phone-1"}
    assert len(ctx.phone_calls) == 2


async def test_identity_mismatch_never_dispatches_browsing_or_interactions() -> None:
    ctx = await context()
    day = await save(ctx, [plan(like=True)])
    ctx.results = [
        reply("IDENTITY_JSON:", {"v": 1, "status": "visible", "accountId": "other-account"})
    ]
    await start(ctx, day)
    await ctx.drain()
    assert ctx.doc["runs"][0]["status"] == "unknown"
    assert ctx.doc["runs"][0]["error"] == "account_identity_mismatch"
    assert len(ctx.phone_calls) == 1
    assert "other-account" not in str(ctx.doc)


async def test_zero_actual_browsing_does_not_meet_the_plan() -> None:
    ctx = await context()
    day = await save(ctx, [plan()])
    ctx.results = [identity(ctx), reply("RECORD_JSON:", record(browsed=0))]
    await start(ctx, day)
    await ctx.drain()
    assert day["status"] == "completed" and day["target_met"] is False
    assert ctx.doc["runs"][0]["summary"]["browsed"] == 0


async def test_browse_plan_cannot_silently_carry_comments_outside_review_workflow() -> None:
    ctx = await context()
    browse = plan()
    browse["comments"] = [
        {"draft_id": "c1", "post_title": "title", "post_author": "author", "text": "comment"}
    ]
    with pytest.raises(domain.PluginAppError, match="invalid_operation_plan"):
        await save(ctx, [browse])
    assert not ctx.doc.get("operation_days") and not ctx.spawned


async def test_manual_next_round_keeps_history_idempotency_and_daily_interaction_budget() -> None:
    ctx = await context()
    first = await save(ctx, [plan(posts=4, like=True)])
    ctx.results = [identity(ctx), reply("RECORD_JSON:", record(planned=4, browsed=4, likes=4))]
    await start(ctx, first)
    await ctx.drain()
    assert first["status"] == "completed"
    original = deepcopy(ctx.doc["runs"][0])
    payload = {
        "account_id": "a1",
        "account_version": ctx.doc["accounts"][0]["version"],
        "id": first["id"],
        "version": first["version"],
        "new_round": True,
        "browse_defaults": {"daily_target_posts": 2, "daily_segments": 1},
        "interaction": plan(like=True)["interaction"],
        "plans": [plan(like=True)],
    }
    await domain.command(ctx, "ops.save", payload)
    second = ctx.doc["operation_days"][-1]
    assert second["id"] != first["id"]
    assert second["round"] == 2 and second["previous_day_id"] == first["id"]
    with pytest.raises(domain.PluginAppError, match="version_conflict"):
        await domain.command(ctx, "ops.save", payload)
    second = ctx.doc["operation_days"][-1]
    ctx.results = [identity(ctx), reply("RECORD_JSON:", record(likes=1))]
    body = await start(ctx, second)
    await ctx.drain()
    assert second["status"] == "completed"
    assert ctx.doc["runs"][0] == original
    assert ctx.doc["runs"][1]["chunks"][0]["quota"]["like"]["max"] == 1
    assert len({run["idempotency_key"] for run in ctx.doc["runs"]}) == 2
    await domain.command(ctx, "ops.start", body)
    assert len(ctx.phone_calls) == 4


async def test_next_round_cannot_replace_planned_work_or_reopen_finished_daily_segments() -> None:
    ctx = await context()
    first = await save(ctx, [plan()])
    payload = {
        "account_id": "a1",
        "account_version": ctx.doc["accounts"][0]["version"],
        "id": first["id"],
        "version": first["version"],
        "new_round": True,
        "browse_defaults": {"daily_target_posts": 4, "daily_segments": 2},
    }
    with pytest.raises(domain.PluginAppError, match="operation_plan_locked"):
        await domain.command(ctx, "ops.save", payload)
    first = ctx.doc["operation_days"][0]
    ctx.results = [identity(ctx), reply("RECORD_JSON:", record())]
    await start(ctx, first)
    await ctx.drain()
    # Both segment indexes have already completed; suggestions must remain empty.
    ctx.doc["runs"][0]["segment"] = {"index": 1, "count": 2}
    ctx.doc["runs"].append(
        {**deepcopy(ctx.doc["runs"][0]), "id": "segment-two", "segment": {"index": 2, "count": 2}}
    )
    with pytest.raises(domain.PluginAppError, match="operation_daily_segments_complete"):
        await domain.command(ctx, "ops.save", payload)
    assert len(ctx.doc["operation_days"]) == 1


async def test_shared_device_quota_keeps_unverified_reservations_for_other_accounts() -> None:
    ctx = await context()
    day = await save(ctx, [plan(like=True, posts=4)])
    run = {
        "id": "next",
        "kind": daily.KIND,
        "account_id": "a1",
        "day_id": day["id"],
        "device_id": "phone-1",
        "plan": day["plans"][0],
        "created_at": domain.now(),
    }
    ctx.doc["runs"] = [
        {
            "id": "earlier",
            "kind": daily.KIND,
            "account_id": "other-account",
            "device_id": "phone-1",
            "created_at": domain.now(),
            "chunks": [
                {
                    "index": 0,
                    "status": "completed",
                    "started_at": domain.now(),
                    "browsed": 3,
                    "interactions": {"like": 3},
                }
            ],
        },
        {
            "id": "uncertain",
            "kind": daily.KIND,
            "account_id": "other-account",
            "device_id": "phone-1",
            "created_at": domain.now(),
            "chunks": [
                {
                    "index": 0,
                    "status": "unknown",
                    "started_at": domain.now(),
                    "browsed": 0,
                    "interactions": {"like": 0},
                    "quota": {"like": {"max": 2}},
                }
            ],
        },
    ]
    assert daily.quota(ctx, domain, ctx.doc, run, {"index": 0, "planned": 4})["like"]["max"] == 0


async def test_cancel_wins_when_final_phone_result_arrives_before_stop_ack() -> None:
    ctx = await context()
    day = await save(ctx, [plan(posts=1, like=True)])
    await start(ctx, day)
    run_id = ctx.doc["runs"][0]["id"]
    entered, release_result, cancel_entered, release_cancel = (asyncio.Event() for _ in range(4))

    async def phone(_device: str, _task: str, *, task_id: str, **_: Any) -> Any:
        if "_identity_" in task_id:
            return SimpleNamespace(task_id=task_id, final_screenshot=b"proof", **identity(ctx))
        entered.set()
        await release_result.wait()
        return SimpleNamespace(
            task_id=task_id,
            final_screenshot=b"proof",
            **reply("RECORD_JSON:", record(planned=1, browsed=1, likes=1)),
        )

    async def cancel(_device: str, _task: str) -> Any:
        cancel_entered.set()
        await release_cancel.wait()
        return SimpleNamespace(error_code=None)

    ctx.run_phone, ctx.cancel_phone = phone, cancel
    execution = asyncio.create_task(ctx.spawned.pop())
    ctx.host.tasks[(ctx.key, daily.task_key(ctx.doc["runs"][0]))] = execution
    await asyncio.wait_for(entered.wait(), 1)
    cancelling = asyncio.create_task(domain.command(ctx, "run.cancel", {"run_id": run_id}))
    await asyncio.wait_for(cancel_entered.wait(), 1)
    release_result.set()
    await asyncio.wait_for(execution, 1)
    assert ctx.doc["runs"][0]["status"] == "cancelling"
    release_cancel.set()
    await asyncio.wait_for(cancelling, 1)
    assert ctx.doc["runs"][0]["status"] == "stopped_unverified"
    assert day["status"] == "interrupted" and not day.get("target_met")


async def test_reconciliation_rejects_a_queued_sdk_even_if_the_phone_is_idle() -> None:
    ctx = await context()
    day = await save(ctx, [plan()])
    await start(ctx, day)
    with pytest.raises(domain.PluginAppError, match="run_not_reconcilable"):
        await domain.command(
            ctx,
            "ops.reconcile",
            {
                "id": day["id"],
                "version": day["version"],
                "confirmed": True,
                "reference": "phone looks idle",
            },
        )
    abandon_pending(ctx)


async def test_restart_requeues_only_unsent_intents_and_holds_a_dispatched_chunk() -> None:
    ctx = await context()
    day = await save(ctx, [plan(index=1, segments=2), plan(index=2, segments=2)])
    await start(ctx, day)
    abandon_pending(ctx)
    ctx.host.instance_id = "second-runtime"
    await domain.snapshot(ctx)
    assert all(
        run["status"] == "waiting" and run["runtime_id"] == "second-runtime"
        for run in ctx.doc["runs"]
    )
    first = ctx.doc["runs"][0]
    first.update(status="running", runtime_id="lost-runtime", dispatched_at=domain.now())
    first["chunks"][0].update(status="running", started_at=domain.now(), quota={"like": {"max": 1}})
    await domain.snapshot(ctx)
    assert first["status"] == "unknown" and first["chunks"][0]["status"] == "unknown"
    assert ctx.doc["runs"][1]["status"] == "cancelled"
    assert ctx.spawned == []


async def test_scheduler_skips_one_account_and_fills_missing_intents_without_replay() -> None:
    ctx = await context()
    second = deepcopy(ctx.doc["accounts"][0])
    second.update(id="a2", device_id="phone-2", platform_account_id="second-account")
    second["profile_draft"]["verified_at"] = None
    ctx.doc["accounts"].append(second)
    await domain.command(
        ctx,
        "schedule.save",
        {"project_id": "p1", "enabled": True, "time": "00:00", "kind": "daily", "confirmed": True},
    )
    await domain.tick(ctx)
    schedule = ctx.doc["projects"][0]["schedule"]
    assert schedule["last_triggered_date"] is None
    assert schedule["last_result"]["accepted"] == 1 and schedule["last_result"]["skipped"]
    assert len(ctx.doc["runs"]) == 2
    second = domain.find(ctx.doc, "accounts", "a2")
    second["profile_draft"].update(verified_at=domain.now(), verified_account_id="second-account")
    await domain.tick(ctx)
    schedule = ctx.doc["projects"][0]["schedule"]
    assert schedule["last_triggered_date"] == "2026-11-04"
    assert len(ctx.doc["runs"]) == 4
    await domain.tick(ctx)
    assert len(ctx.doc["runs"]) == 4
    abandon_pending(ctx)


async def test_legacy_sampler_is_not_silently_upgraded_to_public_interaction() -> None:
    ctx = await context()
    ctx.doc["projects"][0]["schedule"] = {"enabled": True, "time": "00:00"}
    await domain.tick(ctx)
    assert ctx.doc["runs"] == [] and ctx.spawned == []


async def test_day_finalization_recovers_without_replaying_finished_tasks() -> None:
    ctx = await context()
    day = await save(ctx, [plan()])
    ctx.results = [identity(ctx), reply("RECORD_JSON:", record())]
    await start(ctx, day)
    await ctx.drain()
    day["status"] = "queued"
    day.pop("target_met")
    ctx.host.instance_id = "new-runtime"
    await domain.snapshot(ctx)
    assert day["status"] == "completed" and day["target_met"]
    assert len(ctx.phone_calls) == 2 and ctx.spawned == []


async def test_two_accounts_share_fifo_and_daily_interaction_budget_on_one_phone() -> None:
    ctx = await context()
    second = deepcopy(ctx.doc["accounts"][0])
    second.update(id="a2", platform_account_id="second-account")
    second["profile_draft"]["verified_account_id"] = "second-account"
    ctx.doc["accounts"].append(second)
    first_day = await save(ctx, [plan(posts=3, like=True)])
    await start(ctx, first_day)
    second_day = await save(ctx, [plan(posts=3, like=True)], account_id="a2")
    original_device = ctx.device
    ctx.device = lambda device: {**original_device(device), "running_task_id": "first-owns-phone"}
    await start(ctx, second_day)
    assert [run["status"] for run in ctx.doc["runs"]] == ["queued", "waiting"]
    assert len(ctx.spawned) == 1
    ctx.device = original_device
    ctx.results = [
        identity(ctx),
        reply("RECORD_JSON:", record(planned=3, browsed=3, likes=3)),
        identity(ctx, "a2"),
        reply("RECORD_JSON:", record(planned=3, browsed=3, likes=2)),
    ]
    await ctx.drain()
    assert [run["status"] for run in ctx.doc["runs"]] == ["success", "success"]
    assert [run["chunks"][0]["quota"]["like"]["max"] for run in ctx.doc["runs"]] == [3, 2]
    assert sum(run["summary"]["interactions"]["like"] for run in ctx.doc["runs"]) == 5
    assert all(
        call["policy"]["confirmationPolicy"]["login"] == "forbidden" for call in ctx.phone_calls
    )
    assert all(run["summary"]["platform_verification"] == "pending" for run in ctx.doc["runs"])


async def test_budget_change_invalidates_precheck_without_invalidating_public_profile() -> None:
    ctx = await context()
    day = await save(ctx, [plan(like=True)])
    await domain.command(ctx, "ops.precheck", {"id": day["id"], "version": day["version"]})
    old_digest = day["precheck"]["digest"]
    rules = operations.InteractionConfig().model_dump()
    rules["like"].update(enabled=False, daily_cap=0)
    await domain.command(
        ctx,
        "ops.configure",
        {
            "account_id": "a1",
            "account_version": 3,
            "version": 0,
            "browse_defaults": {},
            "interaction": rules,
        },
    )
    account = ctx.doc["accounts"][0]
    assert account["version"] == account["profile_draft"]["verified_version"] == 3
    with pytest.raises(domain.PluginAppError, match="operation_precheck_required"):
        await domain.command(
            ctx,
            "ops.start",
            {
                "id": day["id"],
                "version": day["version"],
                "confirmed": True,
                "confirm_digest": old_digest,
            },
        )
    assert ctx.spawned == [] and ctx.phone_calls == []


async def test_interaction_request_stops_the_bound_task_and_never_continues_browsing() -> None:
    ctx = await context()
    day = await save(ctx, [plan(like=True)])
    ctx.results = [{"session_id": "manual-verification", "message": "manual step needed"}]
    stopped = []

    async def cancel(device: str, task: str) -> Any:
        stopped.append((device, task))
        return SimpleNamespace(error_code=None)

    ctx.cancel_phone = cancel
    await start(ctx, day)
    await ctx.drain()
    run = ctx.doc["runs"][0]
    assert run["status"] == "unknown" and run["error"] == "phone_interaction_required"
    assert stopped == [("phone-1", run["task_id"])]
    assert len(ctx.phone_calls) == 1


async def test_success_flag_with_timeout_code_is_not_a_completed_identity_gate() -> None:
    ctx = await context()
    day = await save(ctx, [plan(like=True)])
    result = identity(ctx)
    result["error_code"] = "TIMEOUT"
    ctx.results = [result]
    await start(ctx, day)
    await ctx.drain()
    assert ctx.doc["runs"][0]["status"] == "unknown"
    assert len(ctx.phone_calls) == 1


async def test_unknown_chunk_keeps_budget_across_midnight_until_its_stop_day() -> None:
    ctx = await context()
    day = await save(ctx, [plan(like=True, posts=4)])
    current = {
        "id": "next",
        "kind": daily.KIND,
        "account_id": "a1",
        "device_id": "phone-1",
        "day_id": day["id"],
        "plan": day["plans"][0],
    }
    old = {
        "index": 0,
        "status": "unknown",
        "started_at": "2026-11-03T13:00:00+00:00",
        "browsed": 0,
        "interactions": {},
        "quota": {"like": {"max": 2}},
    }
    ctx.doc["runs"] = [
        {
            "id": "unresolved",
            "kind": daily.KIND,
            "account_id": "other",
            "device_id": "phone-1",
            "created_at": old["started_at"],
            "chunks": [old],
        }
    ]
    assert (
        daily.quota(ctx, domain, ctx.doc, current, {"index": 0, "planned": 4})["like"]["max"] == 2
    )
    old["stop_confirmed_at"] = "2026-11-03T13:30:00+00:00"
    assert (
        daily.quota(ctx, domain, ctx.doc, current, {"index": 0, "planned": 4})["like"]["max"] == 4
    )
    old["stop_confirmed_at"] = domain.now()
    assert (
        daily.quota(ctx, domain, ctx.doc, current, {"index": 0, "planned": 4})["like"]["max"] == 2
    )

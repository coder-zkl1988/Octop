"""Comments require current review, quota, exact intent and separate human evidence."""

from __future__ import annotations

import asyncio
import json
from copy import deepcopy
from typing import Any

import pytest

from tests.unit.test_xhs_app_domain import domain
from tests.unit.test_xhs_profile_execution import PhoneContext, ready_context, reply

comments = domain.comments
NOW = "2026-11-04T10:00:00+00:00"
TEXT = "配色好清爽"


@pytest.fixture(autouse=True)
def clock(monkeypatch: Any) -> None:
    monkeypatch.setattr(domain, "now", lambda: NOW)


async def context(browsed: int = 16) -> PhoneContext:
    ctx = await ready_context()
    account = ctx.doc["accounts"][0]
    account["profile_draft"].update(
        verified_at=NOW,
        verified_version=account["version"],
        verified_account_id=account["platform_account_id"],
    )
    account["operation_settings"] = {"interaction": {"comment": {"enabled": True, "daily_cap": 2}}}
    ctx.doc["runs"].append(
        {
            "id": "browse1",
            "kind": "nurture",
            "status": "success",
            "runtime_id": ctx.host.instance_id,
            "account_id": account["id"],
            "account_snapshot": domain.account_identity(account),
            "device_id": account["device_id"],
            "date": "2026-11-04",
            "completed_at": "2026-11-04T09:00:00+00:00",
            "chunks": [
                {
                    "index": 0,
                    "status": "completed",
                    "result_basis": "validated_phone_receipt",
                    "evidence_url": "/proof/browse",
                    "browsed": browsed,
                    "posts": [
                        {
                            "title": f"通勤穿搭{index}",
                            "author": "作者甲",
                            "summary": "口袋和配色",
                            "action": "none",
                            "comment_worthy": index == 0,
                        }
                        for index in range(browsed)
                    ],
                }
            ],
        }
    )
    return ctx


async def draft(ctx: PhoneContext, text: str = TEXT) -> dict[str, Any]:
    await domain.command(
        ctx,
        "comment.save",
        {"account_id": "a1", "post": {"title": "通勤穿搭0", "author": "作者甲"}, "text": text},
    )
    return ctx.doc["comments"][-1]


async def approve(ctx: PhoneContext, item: dict[str, Any]) -> None:
    await domain.command(
        ctx,
        "comment.review",
        {
            "id": item["id"],
            "version": item["version"],
            "decision": "approved",
            "text": item["text"] or TEXT,
        },
    )


async def send(ctx: PhoneContext, item: dict[str, Any]) -> dict[str, Any]:
    await domain.command(ctx, "comment.precheck", {"id": item["id"], "version": item["version"]})
    await domain.command(
        ctx,
        "comment.send",
        {
            "id": item["id"],
            "version": item["version"],
            "confirm_digest": item["precheck"]["digest"],
            "confirmed": True,
            "ignored": "never forward",
        },
    )
    return ctx.doc["runs"][-1]


def result(text: str = TEXT, *, actions: bool = True, matches: bool = True) -> dict[str, Any]:
    return reply(
        domain.MARKER,
        {
            "verified": True,
            "account_matches": True,
            "target_matches": matches,
            "text": text,
            "post_title": "通勤穿搭0",
            "post_author": "作者甲",
            "status": "sent",
        },
        actions=actions,
    )


def identity(ctx: PhoneContext) -> dict[str, Any]:
    return reply(
        "IDENTITY_JSON:",
        {"v": 1, "status": "visible", "accountId": ctx.doc["accounts"][0]["platform_account_id"]},
    )


async def test_generation_uses_verified_posts_and_does_not_call_model_twice() -> None:
    ctx = await context()
    calls = []

    async def model(system: str, prompt: str, **kwargs: Any) -> str:
        calls.append((system, json.loads(prompt), kwargs))
        return json.dumps({"candidates": [TEXT, "免费领取", TEXT, "口袋很实用"]})

    ctx.generate_text = model
    await domain.command(
        ctx, "comment.generate", {"run_id": "browse1", "model_ref": "enterprise:writer"}
    )
    item = ctx.doc["comments"][0]
    assert item["status"] == "pending" and item["candidates"] == [TEXT, "口袋很实用"]
    assert calls[0][2] == {"model_ref": "enterprise:writer"}
    assert calls[0][1]["post"]["title"] == "通勤穿搭0"
    await domain.command(ctx, "comment.generate", {"run_id": "browse1"})
    assert len(calls) == 1 and len(ctx.doc["comments"]) == 1 and not ctx.phone_calls
    with pytest.raises(domain.PluginAppError, match="comment_source_unverified"):
        await domain.command(
            ctx,
            "comment.generate",
            {"run_id": "browse1", "posts": [{"chunk_index": 0, "post_index": 99}]},
        )


async def test_generation_failure_preserves_manual_review_without_provider_secrets() -> None:
    ctx = await context()

    async def model(*args: Any, **kwargs: Any) -> str:
        raise RuntimeError("PRIVATE_PROVIDER_SECRET")

    ctx.generate_text = model
    await domain.command(ctx, "comment.generate", {"run_id": "browse1"})
    item = ctx.doc["comments"][0]
    assert item["status"] == "pending" and item["candidates"] == []
    assert item["generation_error"] == "comment_generation_failed"
    assert "PRIVATE_PROVIDER_SECRET" not in json.dumps(ctx.doc)
    await domain.command(
        ctx,
        "comment.review",
        {"id": item["id"], "version": item["version"], "decision": "approved", "text": TEXT},
    )
    assert ctx.doc["comments"][0]["status"] == "approved"


async def test_concurrent_approvals_cannot_reserve_the_last_slot_twice() -> None:
    ctx = await context(8)
    one = await draft(ctx)
    two = await draft(ctx, "口袋很实用")
    results = await asyncio.gather(approve(ctx, one), approve(ctx, two), return_exceptions=True)
    assert sum(isinstance(value, domain.PluginAppError) for value in results) == 1
    assert sum(item["status"] == "approved" for item in ctx.doc["comments"]) == 1
    assert comments.quota(ctx, domain, ctx.doc, ctx.doc["accounts"][0])["remaining"] == 0


async def test_review_and_precheck_bind_versions_rules_and_current_day(monkeypatch: Any) -> None:
    ctx = await context()
    item = await draft(ctx)
    await approve(ctx, item)
    await domain.command(ctx, "comment.precheck", {"id": item["id"], "version": item["version"]})
    old_digest = item["precheck"]["digest"]
    ctx.doc["projects"][0]["version"] += 1
    with pytest.raises(domain.PluginAppError, match="comment_review_required"):
        await domain.command(
            ctx,
            "comment.send",
            {
                "id": item["id"],
                "version": item["version"],
                "confirmed": True,
                "confirm_digest": old_digest,
            },
        )
    monkeypatch.setattr(domain, "now", lambda: "2026-11-05T10:00:00+00:00")
    await domain.snapshot(ctx)
    current = ctx.doc["comments"][0]
    assert current["status"] == "expired"
    await domain.command(
        ctx, "comment.reopen", {"id": current["id"], "version": current["version"]}
    )
    assert ctx.doc["comments"][0]["status"] == "pending" and not ctx.spawned


async def test_exact_send_requires_identity_receipt_and_explicit_operator_review() -> None:
    ctx = await context()
    item = await draft(ctx)
    await approve(ctx, item)
    ctx.results = [identity(ctx), result()]
    run = await send(ctx, item)
    await ctx.drain()
    assert run["status"] == "awaiting_verification"
    current = ctx.doc["comments"][0]
    assert current["status"] == "awaiting_verification"
    assert ctx.phone_calls[0]["policy"]["confirmationPolicy"]["comment"] == "forbidden"
    assert ctx.phone_calls[1]["policy"]["commentAllowlist"] == [TEXT]
    assert "never forward" not in ctx.phone_calls[1]["task"]
    with pytest.raises(domain.PluginAppError, match="comment_specific_verification_required"):
        await domain.command(
            ctx, "run.verify", {"run_id": run["id"], "confirmed": True, "reference": "checked"}
        )
    verify = {
        "id": current["id"],
        "version": current["version"],
        "confirmed": True,
        "evidence_url": run["evidence_url"],
        "reference": "已在手机核对本人、笔记及评论原文",
    }
    with pytest.raises(domain.PluginAppError, match="comment_verification_required"):
        await domain.command(ctx, "comment.verify", verify)
    await domain.command(
        ctx,
        "comment.verify",
        {**verify, "account_checked": True, "post_checked": True, "text_checked": True},
    )
    assert ctx.doc["comments"][0]["status"] == "sent" and run["status"] == "operator_verified"


@pytest.mark.parametrize(
    "response", [result(actions=False), result(text="另一条原文"), result(matches=False)]
)
async def test_unreliable_public_receipt_keeps_reservation_and_cannot_be_replayed(
    response: dict[str, Any],
) -> None:
    ctx = await context()
    item = await draft(ctx)
    await approve(ctx, item)
    ctx.results = [identity(ctx), deepcopy(response)]
    run = await send(ctx, item)
    await ctx.drain()
    assert run["status"] == "unknown" and ctx.doc["comments"][0]["status"] == "unknown"
    assert comments.quota(ctx, domain, ctx.doc, ctx.doc["accounts"][0])["approved_pending"] == 1
    with pytest.raises(domain.PluginAppError, match="comment_not_editable"):
        await domain.command(
            ctx, "comment.reopen", {"id": item["id"], "version": ctx.doc["comments"][0]["version"]}
        )


async def test_revocation_during_identity_prevents_public_task() -> None:
    ctx = await context()
    item = await draft(ctx)
    await approve(ctx, item)
    run = await send(ctx, item)
    calls = 0

    async def require(feature: str) -> None:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise domain.PluginAppError("license_required", status=403)

    ctx.require = require
    ctx.results = [identity(ctx)]
    await ctx.drain()
    assert len(ctx.phone_calls) == 1 and run["status"] == "error"
    assert "public_dispatched_at" not in run


async def test_queued_cancellation_releases_only_an_unattempted_comment() -> None:
    ctx = await context()
    item = await draft(ctx)
    await approve(ctx, item)
    run = await send(ctx, item)
    await domain.command(ctx, "run.cancel", {"run_id": run["id"]})
    await ctx.drain()
    assert run["status"] == "cancelled" and not ctx.phone_calls
    assert ctx.doc["comments"][0]["status"] == "approved"
    assert ctx.doc["comments"][0]["sent_run_id"] is None


async def test_comment_reservations_follow_the_platform_identity_across_local_aliases() -> None:
    ctx = await context(8)
    item = await draft(ctx)
    await approve(ctx, item)
    alias = {**ctx.doc["accounts"][0], "id": "a2"}
    ctx.doc["accounts"].append(alias)
    assert comments.quota(ctx, domain, ctx.doc, alias)["remaining"] == 0


async def test_send_rechecks_window_and_gap_with_server_timezone(monkeypatch: Any) -> None:
    ctx = await context()
    item = await draft(ctx)
    await approve(ctx, item)
    monkeypatch.setattr(domain, "now", lambda: "2026-11-04T23:00:00+00:00")
    with pytest.raises(domain.PluginAppError, match="comment_outside_window"):
        await domain.command(
            ctx, "comment.precheck", {"id": item["id"], "version": item["version"]}
        )
    monkeypatch.setattr(domain, "now", lambda: NOW)
    ctx.doc["runs"][0]["completed_at"] = "2026-11-04T09:51:00+00:00"
    with pytest.raises(domain.PluginAppError, match="comment_browse_gap_required"):
        await domain.command(
            ctx, "comment.precheck", {"id": item["id"], "version": item["version"]}
        )


async def test_unknown_is_reconciled_then_read_back_without_repeating_the_public_action() -> None:
    ctx = await context()
    item = await draft(ctx)
    await approve(ctx, item)
    ctx.results = [identity(ctx), result(actions=False)]
    original = await send(ctx, item)
    await ctx.drain()
    current = ctx.doc["comments"][0]
    with pytest.raises(domain.PluginAppError, match="comment_stop_reconciliation_required"):
        await domain.command(
            ctx,
            "comment.inspect",
            {"id": current["id"], "version": current["version"], "confirmed": True},
        )
    await domain.command(
        ctx,
        "comment.reconcile",
        {
            "id": current["id"],
            "version": current["version"],
            "confirmed": True,
            "reference": "手机任务已停止",
        },
    )
    original = domain.find(ctx.doc, "runs", original["id"])
    current = ctx.doc["comments"][0]
    assert original["status"] == "stopped_unverified"
    ctx.results = [
        identity(ctx),
        reply(
            "COMMENT_READBACK_JSON:",
            {
                "v": 1,
                "status": "read",
                "visible": True,
                "text": TEXT,
                "postTitle": "通勤穿搭0",
                "postAuthor": "作者甲",
            },
        ),
    ]
    await domain.command(
        ctx,
        "comment.inspect",
        {"id": current["id"], "version": current["version"], "confirmed": True},
    )
    await ctx.drain()
    assert current["status"] == "awaiting_verification" and current["inspection"]["matched"]
    assert len(ctx.phone_calls) == 4
    assert all(
        call["policy"]["confirmationPolicy"]["comment"] == "forbidden"
        for call in ctx.phone_calls[2:]
    )
    await domain.command(
        ctx,
        "comment.verify",
        {
            "id": current["id"],
            "version": current["version"],
            "confirmed": True,
            "account_checked": True,
            "post_checked": True,
            "text_checked": True,
            "reference": "在原笔记实际回读本人评论",
            "evidence_url": current["inspection"]["evidence_url"],
        },
    )
    assert current["status"] == "sent" and original["status"] == "operator_verified"


async def test_failed_inspection_cannot_be_bypassed_with_the_previous_screenshot() -> None:
    ctx = await context()
    item = await draft(ctx)
    await approve(ctx, item)
    ctx.results = [identity(ctx), result()]
    original = await send(ctx, item)
    await ctx.drain()
    current = ctx.doc["comments"][0]
    previous_evidence = original["evidence_url"]
    ctx.results = [
        identity(ctx),
        reply(
            "COMMENT_READBACK_JSON:",
            {
                "v": 1,
                "status": "read",
                "visible": True,
                "text": "另一条评论",
                "postTitle": "通勤穿搭0",
                "postAuthor": "作者甲",
            },
        ),
    ]
    await domain.command(
        ctx,
        "comment.inspect",
        {"id": current["id"], "version": current["version"], "confirmed": True},
    )
    await ctx.drain()
    assert current["status"] == "unknown" and original["status"] == "unknown"
    with pytest.raises(domain.PluginAppError, match="comment_verification_required"):
        await domain.command(
            ctx,
            "comment.verify",
            {
                "id": current["id"],
                "version": current["version"],
                "confirmed": True,
                "account_checked": True,
                "post_checked": True,
                "text_checked": True,
                "reference": "旧截图不能覆盖回读矛盾",
                "evidence_url": previous_evidence,
            },
        )


async def test_pending_inspection_prevents_early_verification_and_cancel_does_not_overwrite_sent() -> (
    None
):
    ctx = await context()
    item = await draft(ctx)
    await approve(ctx, item)
    ctx.results = [identity(ctx), result()]
    original = await send(ctx, item)
    await ctx.drain()
    current = ctx.doc["comments"][0]
    await domain.command(
        ctx,
        "comment.inspect",
        {"id": current["id"], "version": current["version"], "confirmed": True},
    )
    verify = {
        "id": current["id"],
        "version": current["version"],
        "confirmed": True,
        "account_checked": True,
        "post_checked": True,
        "text_checked": True,
        "reference": "人工核验原始截图",
        "evidence_url": original["evidence_url"],
    }
    with pytest.raises(domain.PluginAppError, match="comment_verification_required"):
        await domain.command(ctx, "comment.verify", verify)
    await domain.command(ctx, "run.cancel", {"run_id": current["inspection_run_id"]})
    await domain.command(ctx, "comment.verify", verify)
    await ctx.drain()
    assert ctx.doc["comments"][0]["status"] == "sent" and len(ctx.phone_calls) == 2


async def test_late_public_result_cannot_override_a_confirmed_stop() -> None:
    ctx = await context()
    item = await draft(ctx)
    await approve(ctx, item)
    ctx.results = [identity(ctx), result()]
    original = await send(ctx, item)
    phone = ctx.run_phone

    async def cancelling(*args: Any, **kwargs: Any) -> Any:
        response = await phone(*args, **kwargs)
        if kwargs["policy"]["confirmationPolicy"]["comment"] == "allowed":
            await domain.command(ctx, "run.cancel", {"run_id": original["id"]})
        return response

    ctx.run_phone = cancelling
    await ctx.drain()
    assert original["status"] == "stopped_unverified"
    assert ctx.doc["comments"][0]["status"] == "unknown"
    assert not any(action == "run.awaiting_verification" for action, _ in ctx.audit_events)


async def test_identity_only_unknown_can_return_to_review_only_after_confirmed_stop() -> None:
    ctx = await context()
    item = await draft(ctx)
    await approve(ctx, item)
    ctx.results = [
        reply("IDENTITY_JSON:", {"v": 1, "status": "visible", "accountId": "wrong-account"})
    ]
    original = await send(ctx, item)
    await ctx.drain()
    current = ctx.doc["comments"][0]
    assert original["status"] == "unknown" and not original.get("public_dispatched_at")
    await domain.command(
        ctx,
        "comment.reconcile",
        {
            "id": current["id"],
            "version": current["version"],
            "confirmed": True,
            "reference": "已停止只读核对任务",
        },
    )
    assert current["status"] == "pending" and current["sent_run_id"] is None
    assert original["status"] == "cancelled" and len(ctx.phone_calls) == 1


async def test_candidate_generation_serializes_same_post_before_the_paid_call() -> None:
    ctx = await context()
    started, release = asyncio.Event(), asyncio.Event()
    calls = 0

    async def model(*args: Any, **kwargs: Any) -> str:
        nonlocal calls
        calls += 1
        started.set()
        await release.wait()
        return json.dumps({"candidates": [TEXT]})

    ctx.generate_text = model
    first = asyncio.create_task(domain.command(ctx, "comment.generate", {"run_id": "browse1"}))
    await started.wait()
    await domain.command(ctx, "comment.generate", {"run_id": "browse1"})
    release.set()
    await first
    assert calls == 1 and len(ctx.doc["comments"]) == 1


async def test_generation_rejects_stale_project_output_and_restart_does_not_replay() -> None:
    ctx = await context()

    async def model(*args: Any, **kwargs: Any) -> str:
        ctx.doc["projects"][0]["version"] += 1
        return json.dumps({"candidates": [TEXT]})

    ctx.generate_text = model
    await domain.command(ctx, "comment.generate", {"run_id": "browse1"})
    item = ctx.doc["comments"][0]
    assert item["generation_error"] == "comment_source_changed" and item["candidates"] == []
    item.update(status="generating", runtime_id="old-runtime")
    await domain.snapshot(ctx)
    assert item["status"] == "pending" and not ctx.spawned and not ctx.phone_calls


async def test_revocation_before_readback_does_not_create_an_unclosable_device_hold() -> None:
    ctx = await context()
    item = await draft(ctx)
    await approve(ctx, item)
    ctx.results = [identity(ctx), result()]
    original = await send(ctx, item)
    await ctx.drain()
    current = ctx.doc["comments"][0]
    await domain.command(
        ctx,
        "comment.inspect",
        {"id": current["id"], "version": current["version"], "confirmed": True},
    )

    async def revoked(feature: str) -> None:
        raise domain.PluginAppError("license_required", status=403)

    ctx.require = revoked
    await ctx.drain()
    inspection = domain.find(ctx.doc, "runs", current["inspection_run_id"])
    assert inspection["status"] == "error" and len(ctx.phone_calls) == 2
    assert current["status"] == "awaiting_verification"
    await domain.command(
        ctx,
        "comment.verify",
        {
            "id": current["id"],
            "version": current["version"],
            "confirmed": True,
            "account_checked": True,
            "post_checked": True,
            "text_checked": True,
            "reference": "本人已核对原始发送证据",
            "evidence_url": original["evidence_url"],
        },
    )
    assert current["status"] == "sent"


async def test_readback_identity_failure_remains_reconcilable() -> None:
    ctx = await context()
    item = await draft(ctx)
    await approve(ctx, item)
    ctx.results = [identity(ctx), result()]
    original = await send(ctx, item)
    await ctx.drain()
    current = ctx.doc["comments"][0]
    ctx.results = [reply("IDENTITY_JSON:", {"v": 1, "status": "unavailable", "accountId": ""})]
    await domain.command(
        ctx,
        "comment.inspect",
        {"id": current["id"], "version": current["version"], "confirmed": True},
    )
    await ctx.drain()
    assert current["status"] == "unknown" and original["status"] == "unknown"
    await domain.command(
        ctx,
        "comment.reconcile",
        {
            "id": current["id"],
            "version": current["version"],
            "confirmed": True,
            "reference": "已停止回查任务",
        },
    )
    assert original["status"] == "stopped_unverified"
    assert domain.find(ctx.doc, "runs", current["inspection_run_id"])["status"] == "cancelled"


async def test_local_alias_cannot_repeat_an_older_identical_public_comment() -> None:
    ctx = await context()
    old = await draft(ctx)
    old.update(
        status="sent",
        reviewed_at="2026-09-01T10:00:00+00:00",
        created_at="2026-09-01T10:00:00+00:00",
        sent_at="2026-09-01T10:00:00+00:00",
    )
    ctx.doc["runs"].append(
        {
            "id": "old-public",
            "kind": "comment",
            "status": "operator_verified",
            "device_id": "phone-1",
            "account_id": "a1",
            "account_snapshot": domain.account_identity(ctx.doc["accounts"][0]),
            "payload": {
                "comment_id": old["id"],
                "text": TEXT,
                "post": dict(old["post"]),
                "post_url": "",
            },
            "created_at": "2026-09-01T10:00:00+00:00",
        }
    )
    alias = {**deepcopy(ctx.doc["accounts"][0]), "id": "a2"}
    ctx.doc["accounts"].append(alias)
    await domain.command(
        ctx, "comment.save", {"account_id": "a2", "post": old["post"], "text": TEXT}
    )
    current = ctx.doc["comments"][-1]
    await approve(ctx, current)
    await domain.command(
        ctx, "comment.precheck", {"id": current["id"], "version": current["version"]}
    )
    with pytest.raises(domain.PluginAppError, match="duplicate_operation"):
        await domain.command(
            ctx,
            "comment.send",
            {
                "id": current["id"],
                "version": current["version"],
                "confirmed": True,
                "confirm_digest": current["precheck"]["digest"],
            },
        )
    assert not ctx.phone_calls

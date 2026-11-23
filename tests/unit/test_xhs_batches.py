"""Batch publishing freezes intents and advances only after verified results."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from typing import Any

import pytest

from tests.unit.test_xhs_app_domain import FakeContext, base_doc, domain


async def prepared(*, two_devices: bool = False) -> tuple[FakeContext, dict[str, Any]]:
    doc = base_doc()
    doc["drafts"].append({**deepcopy(doc["drafts"][0]), "id": "d2", "title": "第二篇"})
    if two_devices:
        doc["accounts"].append({**doc["accounts"][0], "id": "a2", "device_id": "phone-2"})
        doc["drafts"][1]["account_id"] = "a2"
    ctx = FakeContext(doc)
    await domain.command(
        ctx,
        "batch.save",
        {
            "id": "b1",
            "project_id": "p1",
            "name": "训练批次",
            "items": [
                {"id": "i1", "draft_id": "d1", "account_id": "a1"},
                {"id": "i2", "draft_id": "d2", "account_id": "a2" if two_devices else "a1"},
            ],
        },
    )
    await domain.command(ctx, "batch.precheck", {"id": "b1", "version": 1})
    batch = ctx.doc["batches"][0]
    return ctx, {
        "id": "b1",
        "version": batch["version"],
        "confirmed": True,
        "confirm_digest": batch["precheck"]["digest"],
        "idempotency_key": "batch-start-1",
    }


def proof() -> dict[str, Any]:
    return {"verified": True, "account_matches": True, "status": "completed", "post_id": "post1"}


async def verify(ctx: FakeContext, index: int) -> None:
    run = ctx.doc["runs"][index]
    await domain.command(
        ctx,
        "run.verify",
        {
            "run_id": run["id"],
            "evidence_url": run["evidence_url"],
            "reference": "已在本人作品页逐篇核对",
            "confirmed": True,
        },
    )


async def close_pending(ctx: FakeContext) -> None:
    for coroutine in ctx.spawned:
        coroutine.close()
    ctx.spawned.clear()


async def test_same_phone_advances_only_after_operator_verifies_previous_post() -> None:
    ctx, body = await prepared()
    ctx.receipts = [proof(), proof()]
    await domain.command(ctx, "batch.start", body)
    assert [r["status"] for r in ctx.doc["runs"]] == ["queued", "waiting"]
    await domain.snapshot(ctx)
    assert ctx.doc["runs"][0]["status"] == "queued"
    ctx.doc["drafts"][1]["content"] = "后来编辑的内容"
    await ctx.drain()
    assert len(ctx.phone_calls) == 1
    assert [r["status"] for r in ctx.doc["runs"]] == ["awaiting_verification", "waiting"]
    await verify(ctx, 0)
    await ctx.drain()
    assert len(ctx.phone_calls) == 2
    assert "后来编辑的内容" not in ctx.phone_calls[1]["task"]
    await verify(ctx, 1)
    assert ctx.doc["batches"][0]["status"] == "completed"


async def test_two_phones_claim_independently_without_duplicate_start() -> None:
    ctx, body = await prepared(two_devices=True)
    await domain.command(ctx, "batch.start", body)
    assert [r["status"] for r in ctx.doc["runs"]] == ["queued", "queued"]
    assert len(ctx.spawned) == 2
    await domain.command(ctx, "batch.start", body)
    await asyncio.gather(
        domain.batches.advance(ctx, domain, "b1"), domain.batches.advance(ctx, domain, "b1")
    )
    assert len(ctx.doc["runs"]) == 2 and len(ctx.spawned) == 2
    await close_pending(ctx)


@pytest.mark.parametrize("changed", ["draft", "account", "license", "batch"])
async def test_precheck_rejects_changed_inputs_before_dispatch(changed: str) -> None:
    ctx, body = await prepared()
    if changed == "license":
        ctx.license.version += 1
    else:
        key = {"draft": "drafts", "account": "accounts", "batch": "batches"}[changed]
        ctx.doc[key][0]["version"] += 1
    with pytest.raises(domain.PluginAppError):
        await domain.command(ctx, "batch.start", body)
    assert ctx.doc["runs"] == [] and ctx.phone_calls == []


async def test_unknown_result_holds_queue_and_cancel_never_replays_it() -> None:
    ctx, body = await prepared()
    ctx.receipts = [{"verified": False, "account_matches": True, "status": "unknown"}]
    await domain.command(ctx, "batch.start", body)
    await ctx.drain()
    assert [r["status"] for r in ctx.doc["runs"]] == ["unknown", "waiting"]
    await domain.command(ctx, "batch.cancel", {"id": "b1", "confirmed": True})
    assert [r["status"] for r in ctx.doc["runs"]] == ["unknown", "cancelled"]
    await domain.command(ctx, "batch.start", body)
    assert len(ctx.phone_calls) == 1 and ctx.spawned == []


async def test_restart_marks_intents_interrupted_without_replaying() -> None:
    ctx, body = await prepared()
    await domain.command(ctx, "batch.start", body)
    await close_pending(ctx)
    ctx.host.instance_id = "restarted-runtime"
    await domain.snapshot(ctx)
    assert ctx.doc["batches"][0]["status"] == "interrupted"
    assert [r["status"] for r in ctx.doc["runs"]] == ["interrupted", "interrupted"]
    await domain.command(ctx, "batch.start", body)
    assert ctx.spawned == [] and ctx.phone_calls == []


async def test_revoke_prevents_new_dispatch_but_keeps_evidence_verification_available() -> None:
    ctx, body = await prepared()
    ctx.receipts = [proof()]
    await domain.command(ctx, "batch.start", body)
    await ctx.drain()

    async def revoked(_feature: str) -> None:
        raise domain.PluginAppError("license_required", status=403)

    ctx.require = revoked
    await verify(ctx, 0)
    assert ctx.doc["runs"][0]["status"] == "operator_verified"
    assert ctx.doc["runs"][1]["status"] == "waiting" and ctx.spawned == []


async def test_pending_batch_blocks_ordinary_publish_on_its_phone() -> None:
    ctx, body = await prepared()
    await domain.command(ctx, "batch.start", body)
    doc = ctx.doc
    doc["drafts"].append({**deepcopy(doc["drafts"][0]), "id": "outside", "content": "批次外的草稿"})
    await domain.command(
        ctx,
        "run.precheck",
        {"kind": "publish", "account_id": "a1", "draft_id": "outside", "confirmed": True},
    )
    with pytest.raises(domain.PluginAppError, match="device_reconciliation_required"):
        await domain.command(
            ctx,
            "run.start",
            {
                "kind": "publish",
                "account_id": "a1",
                "draft_id": "outside",
                "confirmed": True,
                "idempotency_key": "outside-batch",
                "confirm_digest": doc["prechecks"][-1]["digest"],
            },
        )
    await close_pending(ctx)


async def test_new_account_without_platform_identity_cannot_publish() -> None:
    ctx, _body = await prepared()
    ctx.doc["accounts"][0].update(entry_mode="new", platform_account_id="")
    with pytest.raises(domain.PluginAppError, match="account_identity_required"):
        await domain.command(ctx, "batch.precheck", {"id": "b1", "version": 1})
    assert ctx.doc["runs"] == [] and ctx.phone_calls == []


async def test_last_post_waiting_for_verification_holds_phone_after_batch_cancel(
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr(domain, "now", lambda: "2026-11-04T10:00:00+00:00")
    ctx, body = await prepared()
    await domain.command(
        ctx,
        "batch.save",
        {
            "id": "b1",
            "version": 1,
            "name": "单篇批次",
            "project_id": "p1",
            "items": [{"id": "i1", "draft_id": "d1", "account_id": "a1"}],
        },
    )
    await domain.command(ctx, "batch.precheck", {"id": "b1", "version": 2})
    body.update(version=2, confirm_digest=ctx.doc["batches"][0]["precheck"]["digest"])
    ctx.receipts = [proof()]
    await domain.command(ctx, "batch.start", body)
    await ctx.drain()
    assert [r["status"] for r in ctx.doc["runs"]] == ["awaiting_verification"]
    await domain.command(ctx, "batch.cancel", {"id": "b1", "confirmed": True})
    await domain.command(
        ctx,
        "run.precheck",
        {"kind": "publish", "account_id": "a1", "draft_id": "d2", "confirmed": True},
    )
    with pytest.raises(domain.PluginAppError, match="device_reconciliation_required"):
        await domain.command(
            ctx,
            "run.start",
            {
                "kind": "publish",
                "account_id": "a1",
                "draft_id": "d2",
                "confirmed": True,
                "idempotency_key": "after-last-post",
                "confirm_digest": ctx.doc["prechecks"][-1]["digest"],
            },
        )
    account = ctx.doc["accounts"][0]
    account.update(plan_confirmed=True, identity_confirmed_at=domain.now())
    account["operation_settings"] = {"interaction": {"comment": {"enabled": True, "daily_cap": 2}}}
    ctx.doc["audits"].append(
        {
            "id": "baseline",
            "account_id": "a1",
            "verified": True,
            "status": "confirmed",
            "confirmed_at": domain.now(),
        }
    )
    ctx.doc["runs"].append(
        {
            "id": "completed-browse",
            "kind": "nurture",
            "status": "success",
            "account_id": "a1",
            "device_id": "phone-1",
            "date": "2026-11-04",
            "chunks": [
                {
                    "status": "completed",
                    "result_basis": "validated_phone_receipt",
                    "evidence_url": "/proof",
                    "browsed": 8,
                }
            ],
        }
    )
    await domain.command(
        ctx,
        "comment.save",
        {
            "account_id": "a1",
            "text": "测试评论",
            "post_url": "https://www.xiaohongshu.com/explore/test",
        },
    )
    comment = ctx.doc["comments"][0]
    await domain.command(
        ctx, "comment.approve", {"id": comment["id"], "version": comment["version"]}
    )
    with pytest.raises(domain.PluginAppError, match="device_reconciliation_required"):
        await domain.command(
            ctx,
            "comment.precheck",
            {"id": comment["id"], "version": comment["version"]},
        )
    assert len(ctx.phone_calls) == 1
    await verify(ctx, 0)
    assert domain.batches.reserved_device_ids(ctx.doc) == set()

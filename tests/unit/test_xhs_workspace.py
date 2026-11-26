"""Workbench features: policy layering, pre-publish checks, pace, consent, cold start and note upkeep."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import pytest

from tests.unit.test_xhs_app_domain import FakeContext, base_doc, domain

workspace = domain.workspace


def ctx_with(
    policy: dict[str, Any] | None = None, features: list[str] | None = None
) -> FakeContext:
    ctx = FakeContext(base_doc())
    ctx.license = SimpleNamespace(
        active=True,
        version=1,
        limits={"accounts": 10, "devices": 10},
        features=features
        or [
            "xhs.content",
            "xhs.publish",
            "xhs.ops",
            "xhs.comment",
            "xhs.takeover",
            "xhs.analytics",
        ],
        policy=policy or {},
    )
    return ctx


FULL = {
    "caps": {"automation_cap": "full", "auto_reply_allowed": True, "monthly_posts": 120},
    "rules": {
        "automation_level": "full",
        "ai_proactive": "weekly",
        "min_interval_hours": 48,
        "weekly_max_posts": 4,
        "marketing_ratio_max": 40,
        "publish_window": "08:00-22:30",
        "banned_words": ["最低价"],
        "auto_reply_enabled": True,
        "auto_reply_daily_cap": 2,
        "paused": False,
    },
}


def test_effective_policy_takes_the_strictest_layer() -> None:
    ctx = ctx_with(
        {**FULL, "rules": {**FULL["rules"], "automation_level": "semi", "min_interval_hours": 72}}
    )
    doc = {
        "member_settings": {
            "automation_level": "full",
            "min_interval_hours": 24,
            "weekly_max_posts": 3,
            "my_words": ["清仓"],
            "small_talk": "auto",
        }
    }
    eff = workspace.effective(ctx, doc)
    assert eff["automation_level"] == "semi"
    assert eff["min_interval_hours"] == 72
    assert eff["weekly_max_posts"] == 3
    assert eff["banned_words"] == ["最低价", "清仓"]
    # Small-talk replies only go out automatically at the full level.
    assert eff["auto_reply"] is False
    full = workspace.effective(ctx_with(FULL), doc)
    assert full["auto_reply"] is True and full["auto_reply_daily"] == 2


@pytest.mark.asyncio
async def test_member_settings_cannot_loosen_enterprise_rules() -> None:
    ctx = ctx_with({**FULL, "caps": {**FULL["caps"], "auto_reply_allowed": False}})
    with pytest.raises(domain.PluginAppError, match="auto_reply_not_allowed"):
        await domain.command(
            ctx, "settings.save", {"small_talk": "auto", "automation_level": "full", "version": 0}
        )
    ctx = ctx_with({**FULL, "rules": {**FULL["rules"], "automation_level": "semi"}})
    with pytest.raises(domain.PluginAppError, match="automation_above_enterprise"):
        await domain.command(ctx, "settings.save", {"automation_level": "full", "version": 0})
    await domain.command(ctx, "settings.save", {"automation_level": "manual", "version": 0})
    assert ctx.doc["member_settings"]["version"] == 1
    with pytest.raises(domain.PluginAppError, match="version_conflict"):
        await domain.command(ctx, "settings.save", {"automation_level": "manual", "version": 0})


@pytest.mark.asyncio
async def test_pause_blocks_every_phone_dispatch() -> None:
    ctx = ctx_with({**FULL, "rules": {**FULL["rules"], "paused": True}})
    with pytest.raises(domain.PluginAppError, match="enterprise_paused"):
        domain.ready(ctx, ctx.doc["accounts"][0])
    ctx = ctx_with(FULL)
    await domain.command(ctx, "pause.set", {"paused": True})
    with pytest.raises(domain.PluginAppError, match="member_paused"):
        await domain.command(ctx, "inbox.collect", {"account_id": "a1"})
    assert all(
        row["status"] == "paused"
        for row in workspace.queue(ctx, {**ctx.doc, "drafts": []})
        if row["status"] in {"planned", "paused"}
    )


def draft(**extra: Any) -> dict[str, Any]:
    return {
        "id": "d2",
        "version": 1,
        "project_id": "p1",
        "account_id": "a1",
        "title": "大衣怎么选",
        "content": "这件大衣 899 元，可机洗。",
        "hashtags": [],
        "images": [],
        **extra,
    }


def test_precheck_finds_words_prices_labels_and_disclosure() -> None:
    ctx = ctx_with(FULL)
    doc = {
        **ctx.doc,
        "drafts": [ctx.doc["drafts"][0]],
        "biz_docs": [{"id": "b", "fields": {"价格": "899–1,299 元"}}],
    }
    clean = workspace.check_draft(ctx, doc, draft(nature="life"))
    assert (
        not clean["blocking"] and {i["key"]: i["level"] for i in clean["items"]}["business"] == "ok"
    )
    bad = workspace.check_draft(
        ctx,
        doc,
        draft(
            content="全网最低价，只要 399 元",
            nature="marketing",
            images=[{"origin": "ai", "content_digest": "x"}],
        ),
    )
    levels = {i["key"]: i["level"] for i in bad["items"]}
    assert levels == {
        "duplicate": "ok",
        "sources": "ok",
        "business": "warn",
        "sensitive": "bad",
        "ai_label": "bad",
        "disclosure": "bad",
    }
    assert workspace.check_draft(ctx, doc, draft(content="术后效果对比"))["high_risk"] is True


@pytest.mark.asyncio
async def test_approval_needs_clean_checks_and_compliance_review_for_high_risk() -> None:
    ctx = ctx_with(FULL)
    ctx.doc["drafts"].append(draft(nature="marketing"))
    with pytest.raises(domain.PluginAppError, match="precheck_blocking"):
        await domain.command(ctx, "plan.update", {"action": "approve", "ids": ["d2"]})
    await domain.command(ctx, "content.meta", {"id": "d2", "meta": {}, "fix_labels": True})
    saved = next(d for d in ctx.doc["drafts"] if d["id"] == "d2")
    assert saved["disclosed"] is True and "广告" in saved["hashtags"]
    await domain.command(ctx, "plan.update", {"action": "approve", "ids": ["d2"]})
    assert saved["review_status"] == "approved"
    ctx.doc["drafts"].append(draft(id="d3", title="一周穿搭记录", content="案例分享：效果很明显"))
    with pytest.raises(domain.PluginAppError, match="compliance_review_required"):
        await domain.command(ctx, "plan.update", {"action": "approve", "ids": ["d3"]})
    await domain.command(ctx, "content.precheck", {"id": "d3"})
    await domain.command(
        ctx,
        "compliance.record",
        {"id": "d3", "reviewer": "张法务", "reference": "OA-17", "decision": "approved"},
    )
    await domain.command(ctx, "plan.update", {"action": "approve", "ids": ["d3"]})
    # Editing an approved draft sends it back to review.
    d3 = next(d for d in ctx.doc["drafts"] if d["id"] == "d3")
    await domain.command(
        ctx,
        "draft.save",
        {k: d3[k] for k in ("id", "version", "project_id", "account_id", "title", "hashtags")}
        | {"content": "改过的正文", "images": []},
    )
    assert d3["review_status"] == "pending_review"


@pytest.mark.asyncio
async def test_schedule_respects_interval_weekly_cap_and_window() -> None:
    ctx = ctx_with(FULL)
    base = (datetime.now(UTC) + timedelta(days=7)).replace(
        hour=12, minute=0, second=0, microsecond=0
    )
    for n in range(3):
        ctx.doc["drafts"].append(
            draft(
                id=f"s{n}",
                title=f"选题{n}",
                content=f"正文 {n}",
                nature="life",
                review_status="approved",
            )
        )
    await domain.command(
        ctx, "plan.update", {"action": "schedule", "ids": ["s0"], "scheduled_at": base.isoformat()}
    )
    with pytest.raises(domain.PluginAppError, match="pace_min_interval"):
        await domain.command(
            ctx,
            "plan.update",
            {
                "action": "schedule",
                "ids": ["s1"],
                "scheduled_at": (base + timedelta(hours=20)).isoformat(),
            },
        )
    with pytest.raises(domain.PluginAppError, match="pace_outside_publish_window"):
        await domain.command(
            ctx,
            "plan.update",
            {
                "action": "schedule",
                "ids": ["s1"],
                "scheduled_at": base.replace(hour=2).isoformat()
                if base.replace(hour=2) > datetime.now(UTC)
                else (base + timedelta(days=3)).replace(hour=2).isoformat(),
            },
        )
    assert next(d for d in ctx.doc["drafts"] if d["id"] == "s0")["review_status"] == "scheduled"


@pytest.mark.asyncio
async def test_withdrawn_consent_freezes_materials_and_returns_drafts() -> None:
    ctx = ctx_with(FULL)
    await domain.command(
        ctx,
        "consent.save",
        {
            "person": "小王",
            "role": "employee",
            "covers": ["portrait", "experience"],
            "account_ids": ["a1"],
            "valid_from": "2026-01-01",
            "valid_to": "2027-01-01",
            "proof_asset": "授权书.pdf",
        },
    )
    consent = ctx.doc["authorizations"][0]
    await domain.command(
        ctx,
        "material.save",
        {
            "kind": "experience",
            "text": "周末去天坛看银杏",
            "owner": "account",
            "account_ids": ["a1"],
            "consent_id": consent["id"],
            "origin": "spoken",
        },
    )
    material = ctx.doc["materials"][0]
    ctx.doc["drafts"].append(
        draft(id="m1", material_ids=[material["id"]], review_status="approved")
    )
    ctx.doc["drafts"].append(
        draft(
            id="m2",
            title="已发",
            content="已发正文",
            material_ids=[material["id"]],
            review_status="published",
        )
    )
    await domain.command(ctx, "consent.revoke", {"id": consent["id"], "reason": "离职"})
    assert ctx.doc["materials"][0]["status"] == "frozen"
    assert next(d for d in ctx.doc["drafts"] if d["id"] == "m1")["review_status"] == "to_make"
    assert ctx.doc["authorizations"][0]["published_drafts"] == ["m2"]
    snap = await domain.snapshot(ctx)
    assert any(a["code"] == "consent_withdrawn" for a in snap["alerts"])
    with pytest.raises(domain.PluginAppError, match="authorization_not_active"):
        await domain.command(
            ctx,
            "material.save",
            {
                "kind": "experience",
                "text": "又一段",
                "owner": "account",
                "account_ids": ["a1"],
                "consent_id": consent["id"],
            },
        )


@pytest.mark.asyncio
async def test_cold_start_sets_the_stage_budget() -> None:
    ctx = ctx_with(FULL)
    ctx.doc["accounts"][0]["entry_mode"] = "new"
    await domain.command(ctx, "coldstart.apply", {"account_id": "a1"})
    settings = ctx.doc["accounts"][0]["operation_settings"]
    assert settings["cold_start_stage"] == "起步"
    assert settings["browse_defaults"]["daily_target_posts"] == 30
    assert settings["interaction"]["like"]["enabled"] is False
    with pytest.raises(domain.PluginAppError, match="stages_invalid"):
        await domain.command(
            ctx,
            "coldstart.save",
            {
                "stages": [
                    {
                        "name": "a",
                        "day_from": 1,
                        "day_to": 5,
                        "daily_target_posts": 30,
                        "segments": 1,
                        "search_ratio_percent": 70,
                    },
                    {
                        "name": "b",
                        "day_from": 4,
                        "day_to": 7,
                        "daily_target_posts": 60,
                        "segments": 2,
                        "search_ratio_percent": 80,
                    },
                ]
            },
        )


def test_classifier_is_conservative() -> None:
    assert workspace.classify("学到了，周一就这么穿") == "small_talk"
    assert workspace.classify("这件 155 穿会不会拖地？") == "question"
    assert workspace.classify("求链接，多少钱呀") == "intent"
    assert workspace.classify("买回来起球了，差评") == "negative"
    assert workspace.classify("加我微信聊") == "intent"
    assert workspace.classify("") == "unclear"


@pytest.mark.asyncio
async def test_inbox_then_small_talk_replies_go_out_automatically_within_the_cap() -> None:
    ctx = ctx_with(FULL)
    ctx.doc["member_settings"] = {
        "automation_level": "full",
        "small_talk": "auto",
        "auto_reply_daily": 20,
        "task_gap_minutes": 0,
    }
    ctx.receipts.append(
        {
            "verified": True,
            "account_matches": True,
            "status": "completed",
            "comments": [
                {"note_title": "小个子别买长大衣", "author": "Luna", "text": "学到了"},
                {"note_title": "小个子别买长大衣", "author": "momo", "text": "155 穿会拖地吗？"},
                {"note_title": "小个子别买长大衣", "author": "栗子", "text": "差评，起球"},
                {"note_title": "早餐", "author": "阿柚", "text": "好好看"},
                {"note_title": "早餐", "author": "饭团", "text": "码住了"},
            ],
        }
    )
    await domain.command(ctx, "inbox.collect", {"account_id": "a1"})
    await ctx.drain()
    items = {i["author"]: i for i in ctx.doc["reply_items"]}
    assert (
        items["Luna"]["status"] == "auto_queued"
        and items["Luna"]["draft"] in workspace.DEFAULT_PHRASES
    )
    assert items["momo"]["status"] == "new" and items["momo"]["kind"] == "question"
    assert items["栗子"]["kind"] == "negative" and items["栗子"]["draft"] == ""
    # The scheduler sends one at a time, with the exact approved text allow-listed on the phone.
    for _ in range(3):
        ctx.receipts.append(
            {"verified": True, "account_matches": True, "status": "sent", "text": "__"}
        )
    for _ in range(3):
        before = len(ctx.phone_calls)
        await domain.tick(ctx)
        if len(ctx.phone_calls) == before and not ctx.spawned:
            break
        pending = [i for i in ctx.doc["reply_items"] if i["status"] == "sending"]
        ctx.receipts[0]["text"] = pending[0]["sent_text"] if pending else "__"
        await ctx.drain()
    calls = [c for c in ctx.phone_calls if "comment_text" in c["task"]]
    assert len(calls) == 2, "daily cap is 2"
    assert all(
        c["policy"]["commentAllowlist"] == [json.loads(c["task"].split("\n")[3])["text"]]
        for c in calls
    )
    assert sum(1 for i in ctx.doc["reply_items"] if i["status"] == "sent" and i.get("auto")) == 2
    with pytest.raises(domain.PluginAppError, match="negative_needs_handwritten_reply"):
        await domain.command(ctx, "reply.approve", {"id": items["栗子"]["id"], "version": 1})


@pytest.mark.asyncio
async def test_auto_reply_never_fires_when_the_tenant_has_not_allowed_it() -> None:
    ctx = ctx_with({**FULL, "rules": {**FULL["rules"], "auto_reply_enabled": False}})
    ctx.doc["member_settings"] = {"automation_level": "full", "small_talk": "auto"}
    ctx.receipts.append(
        {
            "verified": True,
            "account_matches": True,
            "status": "completed",
            "comments": [{"note_title": "早餐", "author": "阿柚", "text": "好好看"}],
        }
    )
    await domain.command(ctx, "inbox.collect", {"account_id": "a1"})
    await ctx.drain()
    assert ctx.doc["reply_items"][0]["status"] == "new"
    await domain.tick(ctx)
    assert len(ctx.phone_calls) == 1


@pytest.mark.asyncio
async def test_plan_generate_keeps_only_known_accounts_templates_and_materials() -> None:
    ctx = ctx_with(FULL)
    ctx.doc["catalog_cache"] = {
        "templates": [
            {"id": "tpl_compare", "name": "方案对比型", "available": True},
            {"id": "tpl_case", "name": "病例档案型", "available": False},
        ]
    }

    async def plan(_system: str, _prompt: str, **_kw: Any) -> str:
        return json.dumps(
            [
                {
                    "account_id": "a1",
                    "title": "大衣 vs 羽绒服",
                    "template_id": "tpl_compare",
                    "nature": "knowledge",
                    "reason": "表现好",
                },
                {
                    "account_id": "a1",
                    "title": "病例",
                    "template_id": "tpl_case",
                    "nature": "marketing",
                },
                {"account_id": "ghost", "title": "x"},
            ]
        )

    ctx.generate_text = plan  # type: ignore[method-assign]
    await domain.command(ctx, "plan.generate", {"instruction": "下周推广大衣"})
    tasks = ctx.doc["content_tasks"]
    assert [t["title"] for t in tasks] == ["大衣 vs 羽绒服", "病例"]
    assert tasks[1]["template_id"] == "" and tasks[0]["source"] == "instruction"
    assert ctx.doc["last_plan"]["count"] == 2


def test_automatic_work_rests_the_phone_by_gap_daily_hours_and_publish_slot() -> None:
    ctx = ctx_with(FULL)
    current = datetime.now(UTC)
    doc: dict[str, Any] = {
        "member_settings": {"task_gap_minutes": 5, "device_daily_hours": 1},
        "accounts": [{"id": "a1", "device_id": "phone-1"}],
        "runs": [],
        "drafts": [],
    }
    assert workspace.device_rest_reason(ctx, doc, "phone-1", "nurture") == ""
    done = {
        "device_id": "phone-1",
        "status": "success",
        "created_at": (current - timedelta(minutes=12)).isoformat(),
        "updated_at": (current - timedelta(minutes=2)).isoformat(),
    }
    doc["runs"] = [done]
    assert workspace.device_rest_reason(ctx, doc, "phone-1", "reply") == "task_gap"
    assert workspace.device_rest_reason(ctx, doc, "other-phone", "reply") == ""
    doc["runs"] = [
        {
            **done,
            "created_at": (current - timedelta(minutes=80)).isoformat(),
            "updated_at": (current - timedelta(minutes=10)).isoformat(),
        }
    ]
    assert workspace.device_rest_reason(ctx, doc, "phone-1", "nurture") == "device_daily_hours"
    doc["runs"] = []
    doc["member_settings"]["publish_slot"] = "strict"
    doc["drafts"] = [
        {
            "account_id": "a1",
            "review_status": "scheduled",
            "scheduled_at": (current + timedelta(minutes=10)).isoformat(),
        }
    ]
    assert workspace.device_rest_reason(ctx, doc, "phone-1", "nurture") == "publish_slot"
    # A reply is short; only nurture steps aside for a publish that is about to be confirmed.
    assert workspace.device_rest_reason(ctx, doc, "phone-1", "reply") == ""


@pytest.mark.asyncio
async def test_a_photographed_authorization_letter_is_kept_as_a_private_asset() -> None:
    import base64

    ctx = ctx_with(FULL)
    today = datetime.now(UTC).date()
    image = {
        "filename": "letter.png",
        "mime_type": "image/png",
        "data_base64": base64.b64encode(b"\x89PNG\r\n\x1a\nletter").decode(),
    }
    await domain.command(
        ctx,
        "consent.save",
        {
            "person": "小王",
            "covers": ["portrait"],
            "account_ids": ["a1"],
            "valid_from": today.isoformat(),
            "valid_to": (today + timedelta(days=30)).isoformat(),
            "proof_asset": "letter.png",
            "proof_image": image,
        },
    )
    saved = ctx.doc["authorizations"][0]
    assert saved["status"] == "active" and saved["proof_image"]["asset_id"].endswith(".png")
    assert "data_base64" not in saved["proof_image"]
    # The enterprise summary says a proof exists, without the file or its name.
    report = json.dumps(domain.studio.enterprise_report(ctx, ctx.doc), ensure_ascii=False)
    assert "letter.png" not in report and saved["proof_image"]["asset_id"] not in report

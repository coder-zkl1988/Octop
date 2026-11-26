"""Workbench screens: persona files, rewriting, rescheduling, dismissals and a scoped pause."""

from __future__ import annotations

import base64
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from tests.unit.test_xhs_app_domain import domain
from tests.unit.test_xhs_workspace import FULL, ctx_with

workspace = domain.workspace
PNG = base64.b64encode(b"\x89PNG\r\n\x1a\nimage").decode()


def _image() -> dict[str, Any]:
    return {"filename": "me.png", "mime_type": "image/png", "data_base64": PNG}


@pytest.mark.asyncio
async def test_persona_file_saves_profile_and_interest_pools() -> None:
    ctx = ctx_with(FULL)
    await domain.command(
        ctx,
        "persona_file.save",
        {
            "account_id": "a1",
            "version": 1,
            "age": "29",
            "gender": "女",
            "region": "成都",
            "occupation": "HR",
            "content_style": "知识分享",
            "bio_material": "天秤 · ENFJ",
            "core": ["通勤包", "通勤包", " 职场妆容 "],
            "extended": ["面试穿搭"],
            "general": ["探店"],
        },
    )
    account = ctx.doc["accounts"][0]
    assert account["persona"]["occupation"] == "HR"
    assert account["interest_pool"]["core"] == ["通勤包", "职场妆容"]
    assert account["content_style"] == "知识分享" and account["version"] == 2
    with pytest.raises(domain.PluginAppError, match="version_conflict"):
        await domain.command(ctx, "persona_file.save", {"account_id": "a1", "version": 1})


@pytest.mark.asyncio
async def test_real_portrait_needs_an_active_authorization() -> None:
    ctx = ctx_with(FULL)
    upload = {
        "account_id": "a1",
        "action": "upload",
        "group": "portrait",
        "label": "正面",
        "image": _image(),
    }
    with pytest.raises(domain.PluginAppError, match="portrait_authorization_required"):
        await domain.command(ctx, "persona_file.image", upload)
    # A clothing or hairstyle reference is not a person's likeness.
    await domain.command(ctx, "persona_file.image", {**upload, "group": "reference"})
    today = datetime.now(UTC).date()
    await domain.command(
        ctx,
        "consent.save",
        {
            "person": "小王",
            "covers": ["portrait"],
            "account_ids": ["a1"],
            "valid_from": today.isoformat(),
            "valid_to": (today + timedelta(days=90)).isoformat(),
            "proof_asset": "授权书.pdf",
        },
    )
    await domain.command(ctx, "persona_file.image", upload)
    images = ctx.doc["accounts"][0]["character_images"]
    assert [i["group"] for i in images] == ["reference", "portrait"]
    snapshot = await domain.snapshot(ctx)
    assert snapshot["persona_sources"]["a1"]["kind"] == "authorized"
    await domain.command(
        ctx,
        "persona_file.image",
        {"account_id": "a1", "action": "delete", "image_id": images[0]["id"]},
    )
    assert len(ctx.doc["accounts"][0]["character_images"]) == 1


@pytest.mark.asyncio
async def test_rewrite_sends_an_approved_draft_back_to_review() -> None:
    ctx = ctx_with(FULL)
    ctx.doc["drafts"][0].update(review_status="approved", nature="life")
    prompts: list[str] = []

    async def generate(system: str, _prompt: str, **_kwargs: Any) -> str:
        prompts.append(system)
        return json.dumps({"title": "新标题", "content": "新的正文", "hashtags": ["#通勤"]})

    ctx.generate_text = generate
    with pytest.raises(domain.PluginAppError, match="reference_required"):
        await domain.command(ctx, "content.rewrite", {"id": "d1", "version": 1, "mode": "imitate"})
    with pytest.raises(domain.PluginAppError, match="template_required"):
        await domain.command(ctx, "content.rewrite", {"id": "d1", "version": 1, "mode": "template"})
    await domain.command(ctx, "content.rewrite", {"id": "d1", "version": 1, "mode": "polish"})
    draft = ctx.doc["drafts"][0]
    assert draft["title"] == "新标题" and draft["hashtags"] == ["通勤"]
    assert draft["review_status"] == "pending_review"
    assert draft["review_log"][-1]["event"] == "AI 润色"
    assert "不写未经证实的疗效" in prompts[0]


@pytest.mark.asyncio
async def test_rewrite_keeps_the_draft_when_the_model_returns_garbage() -> None:
    ctx = ctx_with(FULL)

    async def generate(*_args: Any, **_kwargs: Any) -> str:
        return "抱歉，我不能"

    ctx.generate_text = generate
    with pytest.raises(domain.PluginAppError, match="rewrite_invalid"):
        await domain.command(ctx, "content.rewrite", {"id": "d1", "version": 1, "mode": "angle"})
    assert ctx.doc["drafts"][0]["title"] == "old title"


@pytest.mark.asyncio
async def test_reschedule_spreads_approved_drafts_inside_the_pace_rules() -> None:
    ctx = ctx_with(FULL)
    first = ctx.doc["drafts"][0]
    first.update(review_status="approved", nature="life", approved_at="2026-01-01T00:00:00+00:00")
    ctx.doc["drafts"].append(
        {**first, "id": "d2", "title": "second", "approved_at": "2026-01-02T00:00:00+00:00"}
    )
    await domain.command(ctx, "plan.reschedule", {})
    one, two = (datetime.fromisoformat(d["scheduled_at"]) for d in ctx.doc["drafts"])
    assert abs(two - one) >= timedelta(hours=48)
    assert all(d["review_status"] == "scheduled" for d in ctx.doc["drafts"])
    assert ctx.doc["last_reschedule"]["scheduled"] == 2
    assert ctx.doc["last_reschedule"]["unplaced"] == 0


@pytest.mark.asyncio
async def test_dismissed_alerts_and_cold_start_notes_reach_the_snapshot() -> None:
    ctx = ctx_with(FULL)
    await domain.command(ctx, "alert.dismiss", {"id": "gap:d1:x"})
    await domain.command(
        ctx, "coldstart.observe", {"drift": "closer", "note": "推荐页开始出现穿搭"}
    )
    await domain.command(ctx, "coldstart.pause", {"account_id": "a1", "paused": True})
    snapshot = await domain.snapshot(ctx)
    assert "gap:d1:x" in ctx.doc["dismissed_alerts"]
    assert snapshot["coldstart_observation"]["drift"] == "closer"
    assert ctx.doc["accounts"][0]["cold_start_paused"] is True
    assert all(a["id"] != "gap:d1:x" for a in snapshot["alerts"])


def test_member_pause_can_be_limited_to_accounts_and_kinds() -> None:
    doc = {
        "member_settings": {
            "paused": True,
            "paused_scope": ["publish"],
            "paused_accounts": ["a1"],
        }
    }
    assert workspace.member_pause_applies(doc, {"id": "a1"}, "publish") is True
    assert workspace.member_pause_applies(doc, {"id": "a1"}, "nurture") is False
    assert workspace.member_pause_applies(doc, {"id": "a2"}, "publish") is False
    # No scope given means everything stops.
    everything = {"member_settings": {"paused": True}}
    assert workspace.member_pause_applies(everything, {"id": "a2"}, "reply") is True
    assert workspace.member_pause_applies({"member_settings": {}}, {"id": "a1"}, "publish") is False


@pytest.mark.asyncio
async def test_scoped_pause_records_scope_and_resolves_a_project() -> None:
    ctx = ctx_with(FULL)
    await domain.command(
        ctx, "pause.set", {"paused": True, "scope": ["publish", "bogus"], "project_id": "p1"}
    )
    settings = ctx.doc["member_settings"]
    assert settings["paused"] is True
    assert settings["paused_scope"] == ["publish"]
    assert settings["paused_accounts"] == ["a1"]
    await domain.command(ctx, "pause.set", {"paused": False})
    assert ctx.doc["member_settings"]["paused"] is False


@pytest.mark.asyncio
async def test_profile_sync_adds_general_interests_only_after_confirmation() -> None:
    ctx = ctx_with(FULL)
    ctx.doc["projects"][0]["profile"] = {"general_interests": ["健身"], "confirmed_at": None}
    ctx.doc["accounts"][0]["interest_pool"] = {"core": ["通勤"], "general": ["咖啡"]}
    call = {"project_id": "p1", "version": 1, "confirmed": True}
    with pytest.raises(domain.PluginAppError, match="confirmation_required"):
        await domain.command(ctx, "profile.sync_personas", {**call, "confirmed": False})
    with pytest.raises(domain.PluginAppError, match="profile_confirmation_required"):
        await domain.command(ctx, "profile.sync_personas", call)
    ctx.doc["projects"][0]["profile"]["confirmed_at"] = domain.now()
    await domain.command(ctx, "profile.sync_personas", call)
    account = ctx.doc["accounts"][0]
    assert account["interest_pool"] == {"core": ["通勤"], "general": ["咖啡", "健身"]}
    assert account["version"] == 2


def _persona(label: str, core: str) -> dict[str, Any]:
    return {
        "label": label,
        "positioning": "通勤穿搭记录",
        "persona": {
            "age": "27",
            "gender": "女",
            "region": "上海",
            "occupation": label,
            "life_status": "独居",
        },
        "persona_tags": {"vertical": ["通勤穿搭"], "general": ["咖啡", "探店"]},
        "interest_pool": {"core": [core], "extended": ["大衣"], "general": ["咖啡"]},
    }


@pytest.mark.asyncio
async def test_regenerating_one_candidate_leaves_the_others_untouched() -> None:
    ctx = ctx_with(FULL)
    ctx.doc["projects"][0]["profile"] = {"confirmed_at": domain.now()}
    ctx.doc["persona_candidates"] = [
        {**_persona("设计师", "胶囊衣橱"), "id": "c1", "project_id": "p1", "status": "draft"},
        {**_persona("产品经理", "小个子"), "id": "c2", "project_id": "p1", "status": "draft"},
    ]

    async def generate(_system: str, prompt: str, **_kwargs: Any) -> str:
        assert "产品经理" in prompt and "设计师" not in json.loads(prompt)["existing"][0]["label"]
        return json.dumps(_persona("HR", "通勤包"), ensure_ascii=False)

    ctx.generate_text = generate
    await domain.command(
        ctx,
        "persona.regenerate_one",
        {"project_id": "p1", "version": 1, "candidate_id": "c1"},
    )
    by_id = {c["id"]: c for c in ctx.doc["persona_candidates"]}
    assert by_id["c1"]["status"] == "stale" and by_id["c2"]["status"] == "draft"
    fresh = [c for c in ctx.doc["persona_candidates"] if c["id"] not in {"c1", "c2"}]
    assert [c["label"] for c in fresh] == ["HR"] and fresh[0]["status"] == "draft"


@pytest.mark.asyncio
async def test_enterprise_report_is_a_summary_and_is_sent_only_when_it_changes() -> None:
    ctx = ctx_with(FULL)
    sent: list[dict[str, Any]] = []

    async def enterprise(
        method: str, name: str, body: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        if (method, name) == ("POST", "report"):
            assert body is not None
            sent.append(body)
        return {}

    ctx.has_enterprise = True
    ctx.enterprise = enterprise
    ctx.doc["authorizations"] = [
        {
            "id": "c1",
            "person": "小王",
            "role": "employee",
            "covers": ["portrait"],
            "account_ids": ["a1"],
            "valid_to": "2099-01-01",
            "status": "active",
            "proof_asset": "授权书.pdf",
        }
    ]
    await domain.tick(ctx)
    await domain.tick(ctx)
    assert len(sent) == 1
    body = sent[0]
    assert body["accounts"][0]["name"] == "A" and body["accounts"][0]["status"] == "ok"
    assert body["authorizations"] == [
        {
            "person": "小王",
            "role": "employee",
            "covers": ["portrait"],
            "accounts": ["A"],
            "valid_to": "2099-01-01",
            "status": "active",
            "has_proof": True,
            "materials": 0,
        }
    ]
    # Nothing that identifies the platform account or carries content leaves the desktop.
    text = json.dumps(body, ensure_ascii=False)
    assert "secret-account" not in text and "old content" not in text and "授权书.pdf" not in text
    ctx.doc["accounts"][0]["paused"] = True
    await domain.tick(ctx)
    assert len(sent) == 2 and sent[1]["accounts"][0]["status"] == "paused"

"""Audience profile parity with Tabby's persona service and project store."""

from __future__ import annotations

import json
from copy import deepcopy
from typing import Any

import pytest

from tests.unit.test_xhs_app_domain import FakeContext, base_doc, domain


def suggestion(label: str = "通勤穿搭号", occupation: str = "设计师") -> dict[str, Any]:
    return {
        "label": label,
        "positioning": "通勤穿搭和衣橱管理",
        "persona": {
            "age": "28",
            "gender": "女",
            "region": "上海",
            "occupation": occupation,
            "life_status": "独居",
        },
        "persona_tags": {"vertical": ["穿搭"], "general": ["旅行", "咖啡"]},
        "interest_pool": {"core": ["通勤搭配"], "extended": ["衣橱整理"], "general": ["周末旅行"]},
    }


async def generate_personas(ctx: FakeContext, values: list[dict[str, Any]]) -> None:
    async def generate(_system: str, _prompt: str) -> str:
        return json.dumps({"suggestions": values}, ensure_ascii=False)

    ctx.generate_text = generate
    await domain.command(
        ctx,
        "persona.generate",
        {"project_id": "p1", "version": ctx.doc["projects"][0]["version"], "count": len(values)},
    )


def profile() -> dict[str, Any]:
    return {
        "summary": "城市通勤人群",
        "base": {"age_range": "25–34", "gender_ratio": "均衡", "regions": ["上海"]},
        "vertical_interests": ["通勤穿搭"],
        "general_interests": ["旅行"],
    }


def project_doc() -> dict[str, Any]:
    doc = base_doc()
    doc["projects"][0].update(
        business={"industry": "服装", "product": "通勤服饰"},
        audience={"age_range": "25–34", "gender_ratio": "均衡", "regions": ["上海"]},
        ops_notes={"forbidden_topics": ["促销"]},
        profile={**profile(), "confirmed_at": domain.now()},
    )
    doc["accounts"][0].update(
        persona_reviewed_at=domain.now(),
        persona_review_note="已核对",
        profile_draft={
            "nickname": "草稿",
            "reviewed_at": domain.now(),
            "verified_at": domain.now(),
        },
    )
    return doc


@pytest.mark.asyncio
async def test_rename_preserves_legacy_strings_and_all_unsubmitted_project_fields() -> None:
    doc = project_doc()
    doc["projects"][0].update(business="原客户资料", audience="原受众说明", profile="原画像说明")
    ctx = FakeContext(doc)
    await domain.command(ctx, "project.save", {"id": "p1", "version": 1, "name": "重命名"})
    saved = ctx.doc["projects"][0]
    assert (saved["business"], saved["audience"], saved["profile"]) == (
        "原客户资料",
        "原受众说明",
        "原画像说明",
    )
    assert (
        ctx.doc["accounts"][0]["persona_reviewed_at"] == doc["accounts"][0]["persona_reviewed_at"]
    )


@pytest.mark.asyncio
async def test_source_change_invalidates_personas_and_profile_application_without_losing_drafts() -> (
    None
):
    ctx = FakeContext(project_doc())
    await domain.command(
        ctx,
        "project.save",
        {
            "id": "p1",
            "version": 1,
            "name": "P",
            "audience": {"age_range": "35–44", "gender_ratio": "均衡", "regions": ["北京"]},
        },
    )
    assert ctx.doc["projects"][0]["profile"]["confirmed_at"] is None
    account = ctx.doc["accounts"][0]
    assert account["persona_reviewed_at"] is None and account["version"] == 2
    assert account["profile_draft"]["verified_at"] is None
    assert account["profile_draft"]["nickname"] == "草稿"


@pytest.mark.asyncio
async def test_structuring_legacy_project_preserves_original_source_text() -> None:
    doc = project_doc()
    doc["projects"][0].update(
        business="完整旧业务资料", audience="完整旧受众资料", profile="完整旧画像"
    )
    ctx = FakeContext(doc)
    await domain.command(
        ctx,
        "project.save",
        {
            "id": "p1",
            "version": 1,
            "name": "P",
            "business": {"industry": "服装", "product": "通勤服饰"},
            "audience": {"age_range": "25–34", "gender_ratio": "均衡", "regions": ["上海"]},
        },
    )
    saved = ctx.doc["projects"][0]
    assert saved["legacy_business"] == "完整旧业务资料"
    assert saved["legacy_audience"] == "完整旧受众资料"
    await domain.command(
        ctx, "profile.save", {"project_id": "p1", "version": 2, "profile": profile()}
    )
    assert ctx.doc["projects"][0]["legacy_profile"] == "完整旧画像"


@pytest.mark.asyncio
async def test_confirm_is_explicit_versioned_and_server_owned() -> None:
    ctx = FakeContext(project_doc())
    payload = {"project_id": "p1", "version": 1, "profile": profile()}
    with pytest.raises(domain.PluginAppError, match="confirmation_required"):
        await domain.command(ctx, "profile.confirm", payload)
    await domain.command(ctx, "profile.save", payload)
    saved = ctx.doc["projects"][0]
    assert saved["profile"]["confirmed_at"] is None
    with pytest.raises(domain.PluginAppError, match="version_conflict"):
        await domain.command(ctx, "profile.confirm", {**payload, "confirmed": True})
    await domain.command(
        ctx, "profile.confirm", {**payload, "version": saved["version"], "confirmed": True}
    )
    assert ctx.doc["projects"][0]["profile"]["confirmed_at"]
    assert ctx.doc["accounts"][0]["persona_reviewed_at"] is None
    with pytest.raises(domain.PluginAppError):
        await domain.command(
            ctx,
            "project.save",
            {
                "name": "forged",
                "profile": {**profile(), "confirmed_at": domain.now()},
            },
        )


@pytest.mark.asyncio
async def test_generated_profile_is_draft_and_rejects_concurrent_project_change() -> None:
    ctx = FakeContext(project_doc())

    async def generate(_system: str, prompt: str) -> str:
        assert "服装" in prompt and "促销" in prompt
        return json.dumps(profile())

    ctx.generate_text = generate
    await domain.command(ctx, "profile.generate", {"project_id": "p1", "version": 1})
    assert ctx.doc["projects"][0]["profile"]["confirmed_at"] is None

    async def concurrent(_system: str, _prompt: str) -> str:
        ctx.doc["projects"][0]["version"] += 1
        return json.dumps(profile())

    ctx.generate_text = concurrent
    before = deepcopy(ctx.doc["projects"][0]["profile"])
    with pytest.raises(domain.PluginAppError, match="version_conflict"):
        await domain.command(ctx, "profile.generate", {"project_id": "p1", "version": 2})
    assert ctx.doc["projects"][0]["profile"] == before


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["running", "unknown", "awaiting_verification"])
async def test_profile_task_must_be_reconciled_before_upstream_changes(status: str) -> None:
    doc = project_doc()
    doc["runs"].append({"id": "r1", "account_id": "a1", "kind": "profile", "status": status})
    ctx = FakeContext(doc)
    with pytest.raises(domain.PluginAppError, match="profile_apply_in_progress"):
        await domain.command(
            ctx, "profile.save", {"project_id": "p1", "version": 1, "profile": profile()}
        )
    assert ctx.doc == doc


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "invalid",
    [
        {**profile(), "summary": "   "},
        {**profile(), "vertical_interests": [" "]},
        {**profile(), "base": {"age_range": "25", "gender_ratio": " ", "regions": ["上海"]}},
    ],
)
async def test_invalid_profile_keeps_previous_confirmation(invalid: dict[str, Any]) -> None:
    doc = project_doc()
    ctx = FakeContext(doc)
    with pytest.raises(domain.PluginAppError):
        await domain.command(
            ctx, "profile.save", {"project_id": "p1", "version": 1, "profile": invalid}
        )
    assert ctx.doc == doc


@pytest.mark.asyncio
async def test_generated_personas_require_individual_adoption_and_distribution_review() -> None:
    ctx = FakeContext(project_doc())
    await generate_personas(ctx, [suggestion(), suggestion("周末穿搭号", "教师")])
    assert len(ctx.doc["accounts"]) == 1
    candidates = ctx.doc["persona_candidates"]
    for candidate in candidates:
        await domain.command(
            ctx,
            "persona.apply",
            {"project_id": "p1", "version": 2, "candidate_id": candidate["id"], "confirmed": True},
        )
    accounts = ctx.doc["accounts"][1:]
    assert len(accounts) == 2
    assert all(a["device_id"] == "" and a["persona_reviewed_at"] is None for a in accounts)
    payload = {
        "project_id": "p1",
        "version": 2,
        "accounts": [{"id": a["id"], "version": a["version"]} for a in accounts],
    }
    with pytest.raises(domain.PluginAppError, match="persona_distribution_review_required"):
        await domain.command(ctx, "personas.confirm", payload)
    await domain.command(
        ctx,
        "personas.confirm",
        {**payload, "distribution_reviewed": True, "review_note": "已核对地域与职业分布"},
    )
    assert all(
        a["persona_reviewed_at"] and a["persona_review_note"] for a in ctx.doc["accounts"][1:]
    )
    with pytest.raises(domain.PluginAppError, match="version_conflict"):
        await domain.command(
            ctx,
            "personas.confirm",
            {**payload, "distribution_reviewed": True, "review_note": "旧卡片"},
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "values", [[suggestion(), suggestion()], [suggestion(), suggestion("同组合不同名")]]
)
async def test_duplicate_generated_personas_do_not_change_accounts(
    values: list[dict[str, Any]],
) -> None:
    ctx = FakeContext(project_doc())
    before = deepcopy(ctx.doc)
    with pytest.raises(domain.PluginAppError, match="duplicate_persona"):
        await generate_personas(ctx, values)
    assert ctx.doc == before


@pytest.mark.asyncio
async def test_persona_candidate_cannot_overwrite_existing_account_or_changed_project() -> None:
    ctx = FakeContext(project_doc())
    await generate_personas(ctx, [suggestion()])
    candidate = ctx.doc["persona_candidates"][0]
    payload = {"project_id": "p1", "version": 2, "candidate_id": candidate["id"], "confirmed": True}
    with pytest.raises(domain.PluginAppError, match="existing_account_persona_forbidden"):
        await domain.command(
            ctx, "persona.apply", {**payload, "account_id": "a1", "account_version": 1}
        )
    await domain.command(
        ctx,
        "project.save",
        {
            "id": "p1",
            "version": 2,
            "name": "P",
            "business": {"industry": "其他", "product": "产品"},
        },
    )
    assert ctx.doc["persona_candidates"][0]["status"] == "stale"
    with pytest.raises(domain.PluginAppError, match="profile_confirmation_required"):
        await domain.command(ctx, "persona.apply", {**payload, "version": 3})
    assert len(ctx.doc["accounts"]) == 1


@pytest.mark.asyncio
async def test_unconfirmed_audience_blocks_persona_generation() -> None:
    doc = project_doc()
    doc["projects"][0]["profile"]["confirmed_at"] = None
    ctx = FakeContext(doc)
    with pytest.raises(domain.PluginAppError, match="profile_confirmation_required"):
        await generate_personas(ctx, [suggestion()])

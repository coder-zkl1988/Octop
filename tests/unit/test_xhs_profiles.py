"""G003 profile draft and review rules stay scoped to new accounts."""

from __future__ import annotations

import base64
from copy import deepcopy

import pytest

from tests.unit.test_xhs_app_domain import FakeContext, base_doc, domain


def image(name: str = "候选头像.png") -> dict[str, str]:
    return {
        "filename": name,
        "mime_type": "image/png",
        "data_base64": base64.b64encode(b"\x89PNG\r\n\x1a\n" + name.encode()).decode(),
    }


def complete_draft() -> dict[str, object]:
    return {
        "nickname": "训练日记",
        "bio": "双子座 INFP，记录双打训练和周末生活",
        "occupation": "设计师",
        "gender": "女",
        "birthday": "1997-06-11",
        "region": "上海",
        "interest_tags": ["羽毛球"],
        "avatar_candidates": [image("头像 中文.png")],
        "cover_candidates": [image("背景 中文.png")],
        "avatar_filename": "头像 中文.png",
        "cover_filename": "背景 中文.png",
    }


def new_context() -> FakeContext:
    doc = base_doc()
    doc["accounts"][0].update(
        entry_mode="new",
        persona_reviewed_at=domain.now(),
        persona={"occupation": "设计师"},
    )
    doc["projects"][0]["profile"] = {"confirmed_at": domain.now()}
    return FakeContext(doc)


@pytest.mark.asyncio
async def test_new_account_can_save_incomplete_draft_and_clears_old_review() -> None:
    ctx = new_context()
    ctx.doc["accounts"][0]["profile_draft"] = {
        "reviewed_at": "old",
        "verified_at": "old",
        "avatar_filename": "old.png",
    }
    await domain.command(
        ctx,
        "account_profile.save",
        {"account_id": "a1", "version": 1, "draft": {"nickname": "新昵称"}},
    )
    account = ctx.doc["accounts"][0]
    assert account["version"] == 2
    assert account["profile_draft"]["nickname"] == "新昵称"
    assert account["profile_draft"].get("reviewed_at") is None
    assert account["profile_draft"].get("verified_at") is None


@pytest.mark.asyncio
async def test_review_requires_all_public_fields_and_increments_version() -> None:
    ctx = new_context()
    await domain.command(
        ctx, "account_profile.save", {"account_id": "a1", "version": 1, "draft": complete_draft()}
    )
    await domain.command(
        ctx, "account_profile.review", {"account_id": "a1", "version": 2, "confirmed": True}
    )
    account = ctx.doc["accounts"][0]
    assert account["version"] == 3
    assert account["profile_draft"]["reviewed_at"]
    assert account["profile_draft"]["reviewed_version"] == 3
    assert account["profile_draft"]["avatar_filename"].startswith("xhs-")
    assert account["profile_draft"]["cover_filename"].startswith("xhs-")


@pytest.mark.asyncio
@pytest.mark.parametrize("birthday", ["1997/06/11", "1997-02-30", "2999-01-01"])
async def test_invalid_birthday_rejected_before_state_write(birthday: str) -> None:
    ctx = new_context()
    draft = complete_draft()
    draft["birthday"] = birthday
    with pytest.raises(domain.PluginAppError, match="invalid_input"):
        await domain.command(
            ctx, "account_profile.save", {"account_id": "a1", "version": 1, "draft": draft}
        )
    assert ctx.doc["accounts"][0]["version"] == 1
    assert "profile_draft" not in ctx.doc["accounts"][0]


@pytest.mark.asyncio
async def test_existing_account_must_use_takeover_and_old_version_is_immutable() -> None:
    ctx = FakeContext(base_doc())
    with pytest.raises(domain.PluginAppError, match="existing_account_requires_takeover"):
        await domain.command(
            ctx,
            "account_profile.save",
            {"account_id": "a1", "version": 1, "draft": complete_draft()},
        )
    ctx = new_context()
    await domain.command(
        ctx,
        "account_profile.save",
        {"account_id": "a1", "version": 1, "draft": {"nickname": "第一次"}},
    )
    before = deepcopy(ctx.doc)
    with pytest.raises(domain.PluginAppError, match="version_conflict"):
        await domain.command(
            ctx,
            "account_profile.save",
            {"account_id": "a1", "version": 1, "draft": {"nickname": "旧版本覆盖"}},
        )
    assert ctx.doc == before


@pytest.mark.asyncio
async def test_review_needs_confirmed_persona_and_selected_images() -> None:
    ctx = new_context()
    draft = complete_draft()
    draft["avatar_filename"] = None
    await domain.command(
        ctx, "account_profile.save", {"account_id": "a1", "version": 1, "draft": draft}
    )
    with pytest.raises(domain.PluginAppError, match="profile_draft_incomplete"):
        await domain.command(
            ctx, "account_profile.review", {"account_id": "a1", "version": 2, "confirmed": True}
        )
    assert ctx.doc["accounts"][0]["profile_draft"].get("reviewed_at") is None


@pytest.mark.asyncio
async def test_changing_selected_candidate_invalidates_review_and_selection() -> None:
    ctx = new_context()
    await domain.command(
        ctx, "account_profile.save", {"account_id": "a1", "version": 1, "draft": complete_draft()}
    )
    await domain.command(
        ctx, "account_profile.review", {"account_id": "a1", "version": 2, "confirmed": True}
    )
    account = ctx.doc["accounts"][0]
    changed = {
        key: deepcopy(value)
        for key, value in account["profile_draft"].items()
        if key in domain.profiles.PublicDraft.model_fields
    }
    changed["avatar_filename"] = changed["avatar_candidates"][0]["filename"]
    changed["cover_filename"] = None
    await domain.command(
        ctx, "account_profile.save", {"account_id": "a1", "version": 3, "draft": changed}
    )
    account = ctx.doc["accounts"][0]
    assert account["version"] == 4
    assert account["profile_draft"]["reviewed_at"] is None
    assert account["profile_draft"]["verified_at"] is None


@pytest.mark.asyncio
async def test_image_generation_tops_up_unselected_candidates_to_three() -> None:
    ctx = new_context()
    await domain.command(
        ctx,
        "account_profile.save",
        {
            "account_id": "a1",
            "version": 1,
            "draft": {"avatar_candidates": [image("paid-first.png")]},
        },
    )
    first = deepcopy(ctx.doc["accounts"][0]["profile_draft"]["avatar_candidates"][0])
    calls = []

    async def generate(_prompt, **kwargs):
        calls.append(kwargs)
        return [image(f"new-{len(calls)}.png")]

    ctx.generate_image = generate
    await domain.command(
        ctx, "account_profile.generate", {"account_id": "a1", "version": 2, "parts": ["avatar"]}
    )
    saved = ctx.doc["accounts"][0]["profile_draft"]
    assert len(calls) == 2 and len(saved["avatar_candidates"]) == 3
    assert saved["avatar_candidates"][0] == first
    assert saved["avatar_filename"] is None and saved["reviewed_at"] is None


@pytest.mark.asyncio
async def test_failed_generation_retains_each_paid_image_already_saved() -> None:
    ctx = new_context()
    calls = []

    async def generate(_prompt, **kwargs):
        calls.append(kwargs)
        if len(calls) == 2:
            raise domain.PluginAppError("image_generation_failed", status=502)
        return [image("first-paid.png")]

    ctx.generate_image = generate
    with pytest.raises(domain.PluginAppError, match="image_generation_failed"):
        await domain.command(
            ctx, "account_profile.generate", {"account_id": "a1", "version": 1, "parts": ["avatar"]}
        )
    account = ctx.doc["accounts"][0]
    assert account["version"] == 2
    assert len(account["profile_draft"]["avatar_candidates"]) == 1
    assert account["profile_generation"]["status"] == "failed"


@pytest.mark.asyncio
async def test_invalid_generation_request_is_rejected_before_model_call() -> None:
    ctx = new_context()
    calls = []

    async def generate(*_args, **_kwargs):
        calls.append(True)
        return "{}"

    ctx.generate_text = generate
    with pytest.raises(domain.PluginAppError, match="invalid_input"):
        await domain.command(
            ctx,
            "account_profile.generate",
            {
                "account_id": "a1",
                "version": 1,
                "parts": ["text", "avatar"],
                "avatar_prompt": "x" * 201,
            },
        )
    assert calls == [] and "profile_generation" not in ctx.doc["accounts"][0]


@pytest.mark.asyncio
async def test_generation_cannot_overwrite_concurrent_account_change() -> None:
    ctx = new_context()

    async def generate(_system, _prompt):
        ctx.doc["accounts"][0].update(version=2, name="operator edit")
        return '{"nickname":"model output"}'

    ctx.generate_text = generate
    with pytest.raises(domain.PluginAppError, match="version_conflict"):
        await domain.command(
            ctx, "account_profile.generate", {"account_id": "a1", "version": 1, "parts": ["text"]}
        )
    assert ctx.doc["accounts"][0]["name"] == "operator edit"
    assert "profile_draft" not in ctx.doc["accounts"][0]

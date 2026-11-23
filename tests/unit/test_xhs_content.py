"""Draft media and generation preserve operator-owned state across model calls."""

from __future__ import annotations

import asyncio
import json
from copy import deepcopy
from typing import Any

import pytest

from tests.unit.test_xhs_app_domain import FakeContext, base_doc, domain


async def test_chinese_image_names_are_preserved_for_display_and_safe_on_phone() -> None:
    ctx = FakeContext(base_doc())
    draft = deepcopy(ctx.doc["drafts"][0])
    draft["images"][0]["filename"] = "羽毛球 训练封面.png"
    await domain.command(ctx, "draft.save", draft)
    image = ctx.doc["drafts"][0]["images"][0]
    assert image["display_name"] == "羽毛球 训练封面.png"
    assert image["filename"].startswith("xhs-") and image["filename"].endswith(".png")
    assert image["filename"].isascii()
    await domain.command(
        ctx,
        "draft.save",
        {
            key: value
            for key, value in ctx.doc["drafts"][0].items()
            if key in domain.Draft.model_fields
        },
    )
    assert ctx.doc["drafts"][0]["images"][0] == image


async def test_generation_replaces_copy_but_retains_media_and_account() -> None:
    ctx = FakeContext(base_doc())
    original_images = deepcopy(ctx.doc["drafts"][0]["images"])

    async def generate(_system: str, _prompt: str, **_: Any) -> str:
        return json.dumps({"title": "训练计划", "content": "每周练习", "hashtags": ["羽毛球"]})

    ctx.generate_text = generate
    await domain.command(
        ctx,
        "content.generate",
        {
            "id": "d1",
            "version": 1,
            "project_id": "p1",
            "theme": "训练",
            "account_id": "untrusted-reassignment",
            "model_ref": "company-text",
        },
    )
    saved = ctx.doc["drafts"][0]
    assert saved["version"] == 2 and saved["title"] == "训练计划"
    assert "data_base64" not in saved["images"][0]
    assert await domain.image_data(ctx, saved["images"][0]) == original_images[0]["data_base64"]
    assert saved["images"][0]["display_name"] == original_images[0]["filename"]
    assert saved["account_id"] == "a1"


@pytest.mark.parametrize("changed", ["projects", "drafts"])
async def test_generation_does_not_overwrite_changes_made_during_request(changed: str) -> None:
    ctx = FakeContext(base_doc())

    async def generate(_system: str, _prompt: str) -> str:
        ctx.doc[changed][0]["version"] += 1
        return json.dumps({"title": "new", "content": "new", "hashtags": []})

    ctx.generate_text = generate
    with pytest.raises(domain.PluginAppError, match="version_conflict"):
        await domain.command(
            ctx,
            "content.generate",
            {
                "id": "d1",
                "version": 1,
                "project_id": "p1",
                "theme": "训练",
            },
        )
    assert ctx.doc["drafts"][0]["title"] == "old title"


async def test_generation_new_id_is_stable_and_model_cannot_set_assignment() -> None:
    ctx = FakeContext(base_doc())

    async def generate(_system: str, _prompt: str) -> str:
        return json.dumps(
            {
                "title": "new",
                "content": "new",
                "hashtags": [],
                "id": "model-id",
                "account_id": "other-member",
                "images": [],
            }
        )

    ctx.generate_text = generate
    await domain.command(
        ctx,
        "content.generate",
        {
            "id": "operator-id",
            "project_id": "p1",
            "account_id": "a1",
            "theme": "训练",
        },
    )
    assert ctx.doc["drafts"][-1]["id"] == "operator-id"
    assert ctx.doc["drafts"][-1]["account_id"] == "a1"


async def test_generated_image_is_appended_and_cannot_overwrite_concurrent_edit() -> None:
    ctx = FakeContext(base_doc())
    image = deepcopy(ctx.doc["drafts"][0]["images"][0])
    calls: list[dict[str, Any]] = []

    async def generate(prompt: str, **kwargs: Any) -> list[dict[str, Any]]:
        calls.append({"prompt": prompt, **kwargs})
        return [image]

    ctx.generate_image = generate
    body = {
        "draft_id": "d1",
        "version": 1,
        "prompt": "羽毛球封面",
        "model_ref": "personal:provider/image",
        "aspect_ratio": "3:4",
    }
    await domain.command(ctx, "image.generate", body)
    assert len(ctx.doc["drafts"][0]["images"]) == 2
    assert calls == [
        {"prompt": "羽毛球封面", "model_ref": "personal:provider/image", "aspect_ratio": "3:4"}
    ]

    async def concurrent(_prompt: str, **_: Any) -> list[dict[str, Any]]:
        ctx.doc["drafts"][0]["version"] += 1
        return [image]

    ctx.generate_image = concurrent
    with pytest.raises(domain.PluginAppError, match="version_conflict"):
        await domain.command(ctx, "image.generate", {**body, "version": 2})
    assert len(ctx.doc["drafts"][0]["images"]) == 2


async def test_concurrent_image_requests_charge_provider_only_once() -> None:
    ctx = FakeContext(base_doc())
    entered, release = asyncio.Event(), asyncio.Event()
    calls = []

    async def generate(_prompt: str, **_: Any) -> list[dict[str, Any]]:
        calls.append("charged")
        entered.set()
        await release.wait()
        return [deepcopy(ctx.doc["drafts"][0]["images"][0])]

    ctx.generate_image = generate
    body = {"draft_id": "d1", "version": 1, "prompt": "test"}
    first = asyncio.create_task(domain.command(ctx, "image.generate", body))
    await entered.wait()
    try:
        with pytest.raises(domain.PluginAppError, match="image_generation_in_progress"):
            await domain.command(ctx, "image.generate", body)
        assert calls == ["charged"]
    finally:
        release.set()
        await first
    assert ctx.doc["drafts"][0]["image_generation"]["status"] == "completed"


async def test_restart_marks_image_job_interrupted_without_resubmitting() -> None:
    ctx = FakeContext(base_doc())
    ctx.doc["drafts"][0]["image_generation"] = {
        "id": "old-job",
        "status": "running",
        "runtime_id": "previous-runtime",
    }
    result = await domain.snapshot(ctx)
    assert result["drafts"][0]["image_generation"]["status"] == "interrupted"


async def test_full_draft_refuses_generation_before_calling_provider() -> None:
    ctx = FakeContext(base_doc())
    ctx.doc["drafts"][0]["images"] *= 9
    with pytest.raises(domain.PluginAppError, match="image_limit"):
        await domain.command(
            ctx,
            "image.generate",
            {
                "draft_id": "d1",
                "version": 1,
                "prompt": "extra image",
            },
        )

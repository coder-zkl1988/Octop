"""Chat tools prepare work and hand back a card; they never confirm on the person's behalf."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from octop.infra.plugin_apps.contracts import current_context
from tests.unit.test_xhs_app_domain import domain
from tests.unit.test_xhs_workspace import FULL, ctx_with

_spec = importlib.util.spec_from_file_location(
    "xhs_ops_main", Path(domain.__file__).with_name("main.py")
)
assert _spec and _spec.loader
tools = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(tools)


def _ctx() -> Any:
    ctx = ctx_with(FULL)
    ctx.host = SimpleNamespace(**vars(ctx.host), module=lambda _id: domain)
    return ctx


async def _call(ctx: Any, fn: Any, *args: Any, **kwargs: Any) -> dict[str, Any]:
    token = current_context.set(ctx)
    try:
        return json.loads(await fn(*args, **kwargs))
    finally:
        current_context.reset(token)


@pytest.mark.asyncio
async def test_an_unclear_project_name_becomes_a_question_not_a_guess() -> None:
    ctx = _ctx()
    ctx.doc["projects"].append({"id": "p2", "version": 1, "name": "Q"})
    result = await _call(ctx, tools.xhs_generate_profile, "不存在")
    assert "octop_ui" not in result and "请向用户确认" in result["text"]


@pytest.mark.asyncio
async def test_a_refused_command_is_relayed_instead_of_retried() -> None:
    ctx = _ctx()
    # No client brief yet, so the workbench refuses to generate a profile.
    result = await _call(ctx, tools.xhs_generate_profile, "P")
    assert "octop_ui" not in result and "工作台拒绝了这次操作" in result["text"]
    assert not ctx.doc["projects"][0].get("profile")


@pytest.mark.asyncio
async def test_organizing_a_material_saves_it_unconfirmed_and_returns_a_card() -> None:
    ctx = _ctx()

    async def generate(*_args: Any, **_kwargs: Any) -> str:
        return json.dumps({"title": "周末去天坛", "formats": ["生活碎片型图文"]})

    ctx.generate_text = generate
    result = await _call(ctx, tools.xhs_organize_material, "周末去了天坛，银杏很好看")
    material = ctx.doc["materials"][0]
    assert result["octop_ui"]["renderer"] == "xhs_card"
    assert result["data"] == {
        "kind": "material",
        "url": "/apps/xhs-ops",
        "material_id": material["id"],
    }
    assert not material.get("confirmed") and "不要替用户确认" in result["text"]
    assert ctx.doc["content_tasks"] == [] and ctx.doc["drafts"][0]["id"] == "d1"


@pytest.mark.asyncio
async def test_diagnosis_needs_a_confirmed_baseline_first() -> None:
    ctx = _ctx()
    result = await _call(ctx, tools.xhs_diagnose_account, "A")
    assert "octop_ui" not in result and "审计基线" in result["text"]
    assert ctx.doc["diagnoses"] == []

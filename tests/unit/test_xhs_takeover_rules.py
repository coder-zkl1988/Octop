from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest


def _load_rules() -> ModuleType:
    path = (
        Path(__file__).parents[2]
        / "src/octop/infra/agents/plugins/bundled/xhs-ops/takeover_rules.py"
    )
    spec = importlib.util.spec_from_file_location("xhs_takeover_rules", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


rules = _load_rules()


def test_source_thresholds_are_preserved() -> None:
    assert set(rules.FIELD_BUDGET) == {
        "bio",
        "occupation",
        "nickname",
        "region",
        "avatar",
        "cover",
    }
    assert rules.FIELD_BUDGET["nickname"]["window_days"] == 30
    assert rules.FIELD_BUDGET["region"]["only_on_request"] is True
    assert rules.FIELD_BUDGET["avatar"]["image"] is True
    assert rules.OBSERVATION_HOURS == {"L1": 72, "L2": 168}


@pytest.mark.parametrize(
    ("order", "entry", "expected"),
    [
        ({}, {"outcome": "done"}, False),
        ({"apply_task_id": "t"}, {"outcome": "skipped"}, False),
        (
            {"apply_task_id": "t"},
            {"outcome": "failed", "code": "permission_required"},
            False,
        ),
        (
            {"apply_task_id": "t"},
            {"outcome": "failed", "code": "platform_limit"},
            True,
        ),
        ({"apply_task_id": "t"}, {"outcome": "uncertain"}, True),
    ],
)
def test_only_submitted_attempts_consume_budget(
    order: dict[str, object], entry: dict[str, object], expected: bool
) -> None:
    assert rules.field_counted(order, entry) is expected


def test_budget_boundary_rollback_and_platform_limit() -> None:
    order = {
        "apply_task_id": "task-1",
        "confirmed_at": "2026-01-01T00:00:00Z",
        "fields": [{"field": "bio", "outcome": "uncertain"}],
    }
    assert rules.field_budget_state("bio", [order], [], "2026-01-07T23:59:59.999Z") == {
        "used": 1,
        "blocked_until": "2026-01-08T00:00:00.000Z",
    }
    assert rules.field_budget_state("bio", [order], [], "2026-01-08T00:00:00Z") == {
        "used": 0,
        "blocked_until": None,
    }

    notice = {"field": "bio", "blocked_until": "2026-01-09T00:00:00Z"}
    assert rules.field_budget_state(
        "bio", [order], [notice], "2026-01-07T00:00:00Z", rollback=True
    ) == {"used": 1, "blocked_until": "2026-01-09T00:00:00.000Z"}
    assert (
        rules.field_budget_state(
            "bio",
            [order],
            [{"field": "bio", "blocked_until": "2026-01-07T00:00:00Z"}],
            "2026-01-07T00:00:00Z",
            rollback=True,
        )["blocked_until"]
        is None
    )


def test_nickname_waits_for_first_observation_only() -> None:
    observing = {"observation": {"status": "observing", "until": "2026-01-08T00:00:00Z"}}
    assert rules.awaits_first_observation("nickname", [observing]) is True
    assert (
        rules.field_budget_state("nickname", [observing], [], "2026-01-01T00:00:00Z")[
            "blocked_until"
        ]
        == "2026-01-08T00:00:00.000Z"
    )
    assert rules.awaits_first_observation("nickname", [observing], rollback=True) is False
    assert (
        rules.awaits_first_observation(
            "nickname", [observing, {"observation": {"status": "finished"}}]
        )
        is False
    )


def test_profile_text_and_image_support_compatibility() -> None:
    assert rules.same_profile_text("简介\\n第二行", "简介\n 第二行") is True
    assert rules.supports_images({"os_version": 28}) is False
    assert rules.supports_images({"os_version": 29}) is True
    assert rules.supports_images({"os_version": "Android 10"}) is True
    assert rules.supports_images({"os_version": "Android 28"}) is True
    assert rules.supports_images({"os_version": "unknown"}) is False


def test_extract_platform_limits_from_explicit_and_named_evidence() -> None:
    order = {
        "fields": [
            {"field": "nickname", "outcome": "failed"},
            {"field": "bio", "outcome": "done"},
        ]
    }
    receipt = {
        "extracted": True,
        "note": "名字修改频繁，请400天后再试；简介已完成",
        "fields": [
            {"field": "region", "outcome": "failed", "code": "platform_limit"},
            {"field": "nickname", "outcome": "failed"},
        ],
    }
    notices = rules.extract_platform_limit_notices(order, receipt, "task-9", "2026-01-01T00:00:00Z")
    assert [notice["field"] for notice in notices] == ["region", "nickname"]
    assert {notice["blocked_until"] for notice in notices} == {"2027-01-01T00:00:00.000Z"}
    assert (
        rules.extract_platform_limit_notices(
            order, {"extracted": False}, "task-9", "2026-01-01T00:00:00Z"
        )
        == []
    )


def test_extract_uses_field_window_when_note_has_no_day_count() -> None:
    notices = rules.extract_platform_limit_notices(
        {"fields": [{"field": "occupation", "outcome": "failed"}]},
        {
            "extracted": True,
            "note": "操作频繁，请稍后再试",
            "fields": [{"field": "occupation", "outcome": "failed"}],
        },
        "task-2",
        "2026-01-01T00:00:00Z",
    )
    assert notices[0]["blocked_until"] == "2026-01-15T00:00:00.000Z"


def test_merge_deduplicates_existing_task_pairs_and_caps_history() -> None:
    existing = [
        {"field": "bio", "source_task_id": None},
        {"field": "nickname", "source_task_id": "same"},
    ]
    added = [
        {"field": "bio", "source_task_id": None},
        {"field": "nickname", "source_task_id": "same"},
        {"field": "region", "source_task_id": "new"},
    ]
    merged = rules.merge_platform_limit_notices(existing, added)
    assert merged.count({"field": "bio", "source_task_id": None}) == 2
    assert merged.count({"field": "nickname", "source_task_id": "same"}) == 1
    assert merged[-1] == {"field": "region", "source_task_id": "new"}

    history = [{"field": "bio", "source_task_id": str(index)} for index in range(25)]
    assert len(rules.merge_platform_limit_notices(history, [])) == 20
    assert rules.merge_platform_limit_notices(history, [])[0]["source_task_id"] == "5"

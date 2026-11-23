"""Daily planning rules match the source's rotation and per-segment budgets."""

from __future__ import annotations

import importlib
import json
import math
from copy import deepcopy
from typing import Any

import pytest
from pydantic import ValidationError

from tests.unit.test_xhs_app_domain import domain

operations = importlib.import_module(domain.__name__ + ".operations")


def account(**config: Any) -> dict[str, Any]:
    return {
        "id": "a1",
        "name": "测试账号",
        "interest_pool": {"core": ["a", "b", "c", "d", "e"], "extended": ["f"], "general": ["g"]},
        "browse_defaults": config,
    }


def test_defaults_keep_source_goal_and_interaction_switches() -> None:
    browse = operations.BrowseDefaults()
    rules = operations.InteractionConfig()
    assert (browse.daily_target_posts, browse.daily_segments, browse.search_ratio_percent) == (
        90,
        2,
        80,
    )
    assert rules.like.enabled and rules.like.daily_cap == 5 and rules.like.ratio_percent == 10
    assert not rules.collect.enabled and not rules.follow.enabled and not rules.comment.enabled
    assert rules.comment.daily_cap == 2
    assert operations.BrowseDefaults.model_validate({"dwellSecMin": 5}).dwell_sec_min == 5
    with pytest.raises(ValidationError):
        operations.BrowseDefaults.model_validate({"daily_target_posts": True})


def test_json_integer_numbers_and_future_fields_keep_source_compatibility() -> None:
    current = account()
    current["browse_defaults"] = json.loads('{"dailyTargetPosts":90.0,"futureField":1}')
    config = operations.BrowseDefaults.model_validate(current["browse_defaults"])
    assert config.daily_target_posts == 90 and "futureField" not in config.model_dump()
    plans = operations.build_plans(current, "2026-11-04")
    assert (
        sum(
            sum(word["count"] for word in plan["keywords"]) + plan["home_feed_count"]
            for plan in plans
        )
        == 90
    )
    with pytest.raises(ValidationError):
        operations.BrowseDefaults.model_validate({"dailyTargetPosts": "90"})
    rule = operations.InteractionRule.model_validate(
        {"enabled": True, "dailyCap": 5.0, "ratioPercent": 10.0, "futureField": 1}
    )
    assert rule.daily_cap == 5 and "futureField" not in rule.model_dump()


def test_ninety_posts_split_into_two_exact_search_and_home_budgets() -> None:
    original = account()
    before = deepcopy(original)
    plans = operations.build_plans(original, "2026-11-04")
    assert [plan["segment"] for plan in plans] == [
        {"index": 1, "count": 2},
        {"index": 2, "count": 2},
    ]
    assert [sum(row["count"] for row in plan["keywords"]) for plan in plans] == [36, 36]
    assert [plan["home_feed_count"] for plan in plans] == [9, 9]
    assert all(1 <= word["count"] <= 8 for plan in plans for word in plan["keywords"])
    assert original == before


def test_segment_and_keyword_remainders_follow_javascript_rounding() -> None:
    assert operations._round(0.5) == 1
    assert operations._round(math.nextafter(0.5, 0)) == 0
    plans = operations.build_plans(account(daily_target_posts=91, daily_segments=3), "2026-11-04")
    assert [
        sum(word["count"] for word in plan["keywords"]) + plan["home_feed_count"] for plan in plans
    ] == [31, 30, 30]
    plan = operations.build_plans(
        account(daily_target_posts=9, daily_segments=1, search_ratio_percent=50), "2026-11-04"
    )[0]
    assert sum(word["count"] for word in plan["keywords"]) == 5 and plan["home_feed_count"] == 4


def test_target_zero_uses_per_keyword_counts_and_home_ratio() -> None:
    plan = operations.build_plans(account(daily_target_posts=0, daily_segments=1), "2026-11-04")[0]
    assert len(plan["keywords"]) == 5
    assert all(word["count"] == 5 for word in plan["keywords"])
    assert plan["home_feed_count"] == operations.home_feed_from_ratio(25, 80, 6)
    assert operations.home_feed_from_ratio(25, 0, 6) == 6
    assert operations.home_feed_from_ratio(25, 100, 6) == 0


def test_existing_segments_are_not_suggested_again_but_source_retryable_segments_are() -> None:
    previous = [
        {
            "date": "2026-11-04",
            "status": "failed",
            "segment": {"index": 2, "count": 2},
            "plan": {"keywords": []},
        },
        {
            "date": "2026-11-04",
            "status": "completed",
            "segment": {"index": 1, "count": 2},
            "plan": {"keywords": []},
        },
    ]
    plans = operations.build_plans(account(), "2026-11-04", previous_runs=previous)
    assert len(plans) == 1 and plans[0]["segment"] == {"index": 2, "count": 2}
    previous[0]["status"] = "unknown"
    assert operations.build_plans(account(), "2026-11-04", previous_runs=previous) == []


def test_keyword_rotation_avoids_the_same_core_set() -> None:
    current = account(daily_target_posts=0, daily_segments=1)
    current["interest_pool"]["core"] = ["a", "b", "c", "d"]
    plan = operations.build_plans(
        current,
        "2026-11-04",
        previous_runs=[{"plan": {"keywords": [{"keyword": word} for word in ["b", "c", "d"]]}}],
    )[0]
    assert [word["keyword"] for word in plan["keywords"][:3]] == ["c", "d", "a"]


@pytest.mark.parametrize(
    "reason,config,small",
    [
        ("operation_interest_pool_insufficient", {}, True),
        (
            "operation_home_budget_exceeded",
            {"daily_segments": 1, "search_ratio_percent": 50},
            False,
        ),
    ],
)
def test_impossible_budgets_fail_instead_of_clamping_the_goal(
    reason: str, config: dict[str, Any], small: bool
) -> None:
    current = account(**config)
    if small:
        current["interest_pool"] = {"core": ["only"], "extended": [], "general": []}
    with pytest.raises(domain.PluginAppError, match=reason):
        operations.build_plans(current, "2026-11-04")


def test_chunk_quota_obeys_both_daily_cap_and_cumulative_ratio() -> None:
    config = operations.InteractionConfig().model_dump()
    assert operations.compute_chunk_quota(config, {}, 8)["like"]["max"] == 0
    assert operations.compute_chunk_quota(config, {}, 10)["like"]["max"] == 1
    assert operations.compute_chunk_quota(config, {"like": 1}, 15)["like"]["max"] == 0
    assert operations.compute_chunk_quota(config, {"like": 4}, 90)["like"]["max"] == 1
    config["like"]["ratio_percent"] = 0
    assert operations.compute_chunk_quota(config, {}, 100)["like"]["max"] == 0
    assert operations.compute_chunk_quota(config, {})["like"]["max"] == 5
    assert operations.compute_chunk_quota(config, {}, 100)["collect"]["max"] == 0

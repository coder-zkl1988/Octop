"""Tabby daily planning rules, ported from xhs-ops-plan-suggest.ts.

Source copyright and permission notice: SOURCE_LICENSE.
"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    ValidationInfo,
    field_validator,
    model_validator,
)

from octop.infra.plugin_apps.contracts import PluginAppError


class Input(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True, strict=True)

    @field_validator("*", mode="before")
    @classmethod
    def source_integer(cls, value: Any, info: ValidationInfo) -> Any:
        # Zod number().int() accepts 90.0, but rejects booleans and numeric strings.
        if (
            info.field_name is not None
            and cls.model_fields[info.field_name].annotation is int
            and isinstance(value, float)
            and value.is_integer()
        ):
            return int(value)
        return value


class InteractionRule(Input):
    enabled: bool
    daily_cap: int = Field(ge=0, le=50, validation_alias=AliasChoices("daily_cap", "dailyCap"))
    ratio_percent: int = Field(
        ge=0, le=100, validation_alias=AliasChoices("ratio_percent", "ratioPercent")
    )
    target_types: list[str] = Field(
        default_factory=list,
        max_length=10,
        validation_alias=AliasChoices("target_types", "targetTypes"),
    )

    @field_validator("target_types")
    @classmethod
    def targets(cls, values: list[str]) -> list[str]:
        if any(not value.strip() or len(value.strip()) > 80 for value in values):
            raise ValueError("invalid follow target")
        return [value.strip() for value in values]


class CommentRule(Input):
    enabled: bool = False
    daily_cap: int = Field(
        default=2, ge=0, le=5, validation_alias=AliasChoices("daily_cap", "dailyCap")
    )


class InteractionConfig(Input):
    like: InteractionRule = Field(
        default_factory=lambda: InteractionRule(enabled=True, daily_cap=5, ratio_percent=10)
    )
    collect: InteractionRule = Field(
        default_factory=lambda: InteractionRule(enabled=False, daily_cap=2, ratio_percent=3)
    )
    follow: InteractionRule = Field(
        default_factory=lambda: InteractionRule(enabled=False, daily_cap=0, ratio_percent=0)
    )
    comment: CommentRule = Field(default_factory=CommentRule)


class BrowseDefaults(Input):
    dwell_sec_min: int = Field(
        default=11, ge=5, le=60, validation_alias=AliasChoices("dwell_sec_min", "dwellSecMin")
    )
    dwell_sec_max: int = Field(
        default=25, ge=5, le=120, validation_alias=AliasChoices("dwell_sec_max", "dwellSecMax")
    )
    search_ratio_percent: int = Field(
        default=80,
        ge=0,
        le=100,
        validation_alias=AliasChoices("search_ratio_percent", "searchRatioPercent"),
    )
    posts_per_keyword: int = Field(
        default=5, ge=1, le=8, validation_alias=AliasChoices("posts_per_keyword", "postsPerKeyword")
    )
    home_feed_count: int = Field(
        default=6, ge=0, le=12, validation_alias=AliasChoices("home_feed_count", "homeFeedCount")
    )
    daily_target_posts: int = Field(
        default=90,
        ge=0,
        le=150,
        validation_alias=AliasChoices("daily_target_posts", "dailyTargetPosts"),
    )
    daily_segments: int = Field(
        default=2, ge=1, le=3, validation_alias=AliasChoices("daily_segments", "dailySegments")
    )


class Keyword(Input):
    keyword: str = Field(min_length=1, max_length=40)
    count: int = Field(ge=1, le=8)


class Segment(Input):
    index: int = Field(ge=1, le=3)
    count: int = Field(ge=1, le=3)

    @model_validator(mode="after")
    def within_count(self) -> Segment:
        if self.index > self.count:
            raise ValueError("segment outside count")
        return self


class PlanComment(Input):
    draft_id: str = Field(validation_alias=AliasChoices("draft_id", "draftId"))
    post_title: str = Field(max_length=60, validation_alias=AliasChoices("post_title", "postTitle"))
    post_author: str = Field(
        max_length=40, validation_alias=AliasChoices("post_author", "postAuthor")
    )
    text: str = Field(min_length=1, max_length=30)


class RunPlan(Input):
    kind: Literal["browse", "comment"] | None = None
    account_id: str = Field(default="", validation_alias=AliasChoices("account_id", "accountId"))
    account_label: str = Field(
        default="", validation_alias=AliasChoices("account_label", "accountLabel")
    )
    keywords: list[Keyword] = Field(max_length=8)
    home_feed_count: int = Field(
        ge=0, le=12, validation_alias=AliasChoices("home_feed_count", "homeFeedCount")
    )
    dwell_sec_min: int = Field(ge=1, validation_alias=AliasChoices("dwell_sec_min", "dwellSecMin"))
    dwell_sec_max: int = Field(ge=1, validation_alias=AliasChoices("dwell_sec_max", "dwellSecMax"))
    interaction: InteractionConfig
    segment: Segment | None = None
    rationale: list[str] = Field(default_factory=list)
    comments: list[PlanComment] | None = Field(default=None, max_length=5)


def _uniq(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value.strip() for value in values if value.strip()))


def _rotate(values: list[str], offset: int, count: int) -> list[str]:
    return [values[(offset + index) % len(values)] for index in range(min(count, len(values)))]


def _round(value: float) -> int:
    # JavaScript Math.round rounds a positive .5 up, unlike Python's round.
    whole = math.floor(value)
    return whole + int(value - whole >= 0.5)


def home_feed_from_ratio(search_total: int, percent: int, fallback: int) -> int:
    ratio = max(0, min(100, percent)) / 100
    if ratio >= 1:
        return 0
    if ratio <= 0:
        return max(0, min(12, fallback))
    return max(0, min(12, _round(search_total * (1 - ratio) / ratio)))


def budget_issues(target: int, percent: int, word_count: int) -> list[str]:
    search = _round(target * (max(0, min(100, percent)) / 100))
    issues = []
    if math.ceil(search / 8) > word_count:
        issues.append("operation_interest_pool_insufficient")
    if target - search > 12:
        issues.append("operation_home_budget_exceeded")
    return issues


def _suggest(
    account: dict[str, Any],
    config: BrowseDefaults,
    interaction: InteractionConfig,
    round_number: int,
    last: set[str],
    segment: Segment | None,
) -> dict[str, Any]:
    pool = account.get("interest_pool", account.get("interestPool", {}))
    core, extended, general = (_uniq(pool.get(key, [])) for key in ("core", "extended", "general"))
    offset = round_number % len(core) if core else 0
    picks = _rotate(core, offset, 3)
    rationale: list[str] = []
    if len(core) > 3 and last and len(picks) == len(last) and set(picks) == last:
        offset = (offset + 1) % len(core)
        picks = _rotate(core, offset, 3)
        rationale.append("与上一轮关键词完全相同，核心词前移一位")
    extra, broad = _rotate(extended, round_number, 1), _rotate(general, round_number, 1)
    preferred = _uniq(picks + extra + broad)
    available = _uniq(
        preferred
        + _rotate(core, offset, len(core))
        + _rotate(extended, round_number, len(extended))
        + _rotate(general, round_number, len(general))
    )[:8]
    words = preferred
    counts: list[int] | None = None
    target = config.daily_target_posts
    count = segment.count if segment else 1
    if target > 0:
        segment_target = (
            target if segment is None else target // count + int(segment.index <= target % count)
        )
        issues = budget_issues(segment_target, config.search_ratio_percent, len(available))
        if issues:
            raise PluginAppError(issues[0], status=409)
        search = _round(segment_target * (config.search_ratio_percent / 100))
        home = segment_target - search
        active = min(len(available), search, max(len(preferred), math.ceil(search / 8)))
        words = available[:active]
        counts = [search // active + int(index < search % active) for index in range(active)]
        rationale.append(
            f"日目标 {target} 篇 ÷ {count} 段 → 本段目标 {segment_target} 篇：搜索 {search} + 首页 {home}"
        )
    else:
        home = home_feed_from_ratio(
            sum(config.posts_per_keyword for _ in words),
            config.search_ratio_percent,
            config.home_feed_count,
        )
    keywords = [
        {
            "keyword": word,
            "count": counts[index] if counts is not None else config.posts_per_keyword,
        }
        for index, word in enumerate(words)
    ]
    rationale.insert(
        0,
        f"第 {round_number + 1} 轮：核心兴趣从第 {offset + 1} 个起轮换取 {len(picks)} 个（{'、'.join(picks)}）"
        if core
        else "核心兴趣池为空，未能生成核心关键词",
    )
    if extra:
        rationale.append("扩展兴趣补 " + "、".join(extra))
    if broad:
        rationale.append("泛内容补 " + "、".join(broad))
    if segment:
        rationale.insert(0, f"第 {segment.index}/{segment.count} 段（当日多段串行执行）")
    return RunPlan(
        account_id=account["id"],
        account_label=str(account.get("name", account.get("label", ""))),
        keywords=[Keyword.model_validate(keyword) for keyword in keywords],
        home_feed_count=home,
        dwell_sec_min=config.dwell_sec_min,
        dwell_sec_max=config.dwell_sec_max,
        interaction=interaction,
        segment=segment,
        rationale=rationale,
    ).model_dump()


def build_plans(
    account: dict[str, Any], date: str, *, previous_runs: list[dict[str, Any]] | None = None
) -> list[dict[str, Any]]:
    config = BrowseDefaults.model_validate(
        account.get("browse_defaults", account.get("browseDefaults", {}))
    )
    interaction = InteractionConfig.model_validate(account.get("interaction", {}))
    previous = previous_runs or []
    last = {
        row["keyword"].strip()
        for row in (previous[0].get("plan", {}).get("keywords", []) if previous else [])
    }
    round_number = len(previous)
    if config.daily_segments <= 1:
        return [_suggest(account, config, interaction, round_number, last, None)]
    done = {
        (row.get("segment") or {}).get("index")
        for row in previous
        if row.get("date") == date
        and row.get("segment")
        and row.get("status") not in {"cancelled", "failed", "interrupted"}
    }
    suggestions = []
    for index in range(1, config.daily_segments + 1):
        if index in done:
            continue
        plan = _suggest(
            account,
            config,
            interaction,
            round_number,
            last,
            Segment(index=index, count=config.daily_segments),
        )
        suggestions.append(plan)
        round_number += 1
        last = {row["keyword"] for row in plan["keywords"]}
    return suggestions


def compute_chunk_quota(
    config: dict[str, Any] | InteractionConfig,
    used: dict[str, int],
    cumulative_planned_count: int | None = None,
) -> dict[str, Any]:
    rules = (
        config
        if isinstance(config, InteractionConfig)
        else InteractionConfig.model_validate(config)
    )
    result = {}
    for key in ("like", "collect", "follow"):
        rule = getattr(rules, key)
        maximum = max(0, rule.daily_cap - used.get(key, 0)) if rule.enabled else 0
        if cumulative_planned_count is not None:
            maximum = min(
                maximum,
                max(
                    0,
                    math.floor(cumulative_planned_count * rule.ratio_percent / 100)
                    - used.get(key, 0),
                ),
            )
        result[key] = {
            "enabled": maximum > 0,
            "max": maximum,
            "target_types": list(rule.target_types),
        }
    return result

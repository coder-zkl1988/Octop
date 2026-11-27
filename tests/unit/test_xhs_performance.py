"""内容表现: readings after publishing, what they store, and feeding the good ones back."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from tests.unit.test_xhs_workspace import FULL, ctx_with, domain

performance = domain.performance


def published(hours_ago: float, run_id: str = "pub1", **draft: Any) -> dict[str, Any]:
    created = (datetime.now(UTC) - timedelta(hours=hours_ago)).isoformat()
    return {
        "id": run_id,
        "kind": "publish",
        "status": "success",
        "account_id": "a1",
        "device_id": "phone-1",
        "draft_id": "d-" + run_id,
        "created_at": created,
        "updated_at": created,
        "evidence": {"post_url": "https://xhs.example/post/" + run_id},
        "draft_snapshot": {
            "id": "d-" + run_id,
            "title": "小个子别买长大衣",
            "source": "instruction",
            "template_id": "t-mistakes",
            "content": "开头…",
            **draft,
        },
    }


def test_receipts_only_accept_what_the_page_shows() -> None:
    assert performance.receipt_ok({"status": "read", "stats": {"views": 1200, "likes": None}})
    assert performance.receipt_ok({"status": "unavailable"})
    assert not performance.receipt_ok({"status": "read", "stats": {"views": "1.2万"}})
    assert not performance.receipt_ok({"status": "read", "stats": {"views": -1}})
    assert not performance.receipt_ok({"status": "read"})
    assert not performance.receipt_ok({"status": "done", "stats": {}})


def test_due_readings_follow_the_checkpoints_and_skip_old_ones() -> None:
    doc = {
        "runs": [published(25, "a"), published(80, "b"), published(24 * 12, "c")],
        "post_stats": [],
    }
    due = {(r["id"], c) for r, c in performance.due(doc, ["24h", "3d", "7d"])}
    # b's 24-hour reading and c's 7-day reading fell due more than 2 days ago: skipped, not chased.
    assert due == {("a", "24h"), ("b", "3d")}
    doc["post_stats"] = [{"publish_run_id": "b", "checkpoint": "24h"}]
    doc["runs"].append(
        {
            "id": "s1",
            "kind": "stats",
            "status": "running",
            "payload": {"publish_run_id": "b", "checkpoint": "3d"},
        }
    )
    assert {(r["id"], c) for r, c in performance.due(doc, ["24h", "3d", "7d"])} == {("a", "24h")}
    assert performance.due(doc, ["7d"]) == []


@pytest.mark.asyncio
async def test_the_scheduler_reads_a_published_note_once_and_stores_unknowns_as_unknown() -> None:
    ctx = ctx_with(FULL)
    ctx.doc["member_settings"] = {"task_gap_minutes": 0}
    ctx.doc["runs"] = [published(25)]
    ctx.receipts.append(
        {
            "verified": True,
            "account_matches": True,
            "status": "read",
            "stats": {
                "views": 1200,
                "likes": 48,
                "collects": 31,
                "comments": None,
                "new_followers": None,
            },
        }
    )
    await domain.tick(ctx)
    await ctx.drain()
    task = next(c["task"] for c in ctx.phone_calls if "creator" in c["task"])
    assert (
        "小个子别买长大衣" in task and "https://xhs.example/post/pub1" in task and "不推算" in task
    )
    [reading] = ctx.doc["post_stats"]
    assert reading["checkpoint"] == "24h" and reading["status"] == "read"
    assert reading["stats"] == {
        "views": 1200,
        "likes": 48,
        "collects": 31,
        "comments": None,
        "new_followers": None,
    }
    before = len(ctx.phone_calls)
    await domain.tick(ctx)
    await ctx.drain()
    assert len(ctx.phone_calls) == before, "the same reading is not taken twice"
    [note] = performance.notes(ctx.doc, 30)
    assert note["source"] == "instruction" and note["template_id"] == "t-mistakes"
    assert note["rate"] is None, "comments are unknown, so the rate is unknown too"


@pytest.mark.asyncio
async def test_no_readings_without_analytics_when_paused_or_switched_off() -> None:
    ctx = ctx_with(FULL, features=["xhs.content", "xhs.publish"])
    ctx.doc["runs"] = [published(25)]
    await domain.tick(ctx)
    assert not any("creator" in c["task"] for c in ctx.phone_calls)

    ctx = ctx_with(FULL)
    ctx.doc["member_settings"] = {"task_gap_minutes": 0, "stats_checkpoints": ["7d"]}
    ctx.doc["runs"] = [published(25)]
    await domain.tick(ctx)
    assert not any("creator" in c["task"] for c in ctx.phone_calls)

    ctx = ctx_with(FULL)
    ctx.doc["member_settings"] = {
        "task_gap_minutes": 0,
        "paused": True,
        "paused_scope": ["collect"],
    }
    ctx.doc["runs"] = [published(25)]
    await domain.tick(ctx)
    assert not any("creator" in c["task"] for c in ctx.phone_calls)


@pytest.mark.asyncio
async def test_an_account_without_data_is_unknown_not_bad() -> None:
    ctx = ctx_with(FULL)
    ctx.doc["member_settings"] = {"task_gap_minutes": 0}
    ctx.doc["runs"] = [published(25)]
    ctx.receipts.append({"verified": True, "account_matches": True, "status": "unavailable"})
    await domain.tick(ctx)
    await ctx.drain()
    [reading] = ctx.doc["post_stats"]
    assert reading["status"] == "unavailable" and set(reading["stats"].values()) == {None}
    [note] = performance.notes(ctx.doc, 30)
    assert note["rate"] is None


@pytest.mark.asyncio
async def test_good_notes_feed_topics_templates_and_a_note() -> None:
    ctx = ctx_with(FULL)
    ctx.doc["runs"] = [published(200, "good"), published(200, "meh", title="通勤早餐")]
    ctx.doc["post_stats"] = [
        {
            "publish_run_id": "good",
            "checkpoint": "7d",
            "status": "read",
            "stats": {
                "views": 1000,
                "likes": 40,
                "collects": 20,
                "comments": 10,
                "new_followers": 3,
            },
        },
        {
            "publish_run_id": "meh",
            "checkpoint": "7d",
            "status": "read",
            "stats": {"views": 1000, "likes": 10, "collects": 5, "comments": 2, "new_followers": 0},
        },
    ]
    sent: list[dict[str, Any]] = []

    async def enterprise(method: str, name: str, body: dict[str, Any]) -> dict[str, Any]:
        sent.append({"method": method, "name": name, **body})
        return {"items": []}

    ctx.enterprise = enterprise  # type: ignore[attr-defined]
    await domain.command(
        ctx,
        "performance.feedback",
        {"days": 30, "topics": True, "templates": True, "note": "误区类标题带数字的收藏更高。"},
    )
    tasks = [t for t in ctx.doc["content_tasks"] if t["title"].startswith("沿用角度")]
    assert [t["title"] for t in tasks] == ["沿用角度：小个子别买长大衣"] and "约 7%" in tasks[0][
        "reason"
    ]
    assert sent == [
        {
            "method": "POST",
            "name": "template-submissions",
            "title": "小个子别买长大衣",
            "structure": "开头…",
            "template_hint": "表现较好的笔记（互动率约 7%）",
        }
    ]
    assert ctx.doc["performance_note"]["text"] == "误区类标题带数字的收藏更高。"
    # Applying again does not duplicate the suggestion.
    await domain.command(ctx, "performance.feedback", {"days": 30, "topics": True})
    assert len([t for t in ctx.doc["content_tasks"] if t["title"].startswith("沿用角度")]) == 1
    ctx.doc["post_stats"] = []
    with pytest.raises(domain.PluginAppError, match="no_good_notes"):
        await domain.command(ctx, "performance.feedback", {"days": 30, "topics": True})
    await domain.command(ctx, "performance.configure", {"checkpoints": ["24h", "bogus"]})
    assert ctx.doc["member_settings"]["stats_checkpoints"] == ["24h"]

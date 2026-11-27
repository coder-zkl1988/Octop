"""内容表现: what each published note did, read back from the creator centre.

After a note is published, the phone reads its numbers at up to three points
(24 hours, 3 days, 7 days). The 7-day reading is the note's final figure. The
phone only copies what the page shows: a number the page does not show is
stored as unknown (None), never estimated, and a new account whose data is not
open yet is "unavailable", not "bad".
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from octop.infra.plugin_apps.contracts import PluginAppError

CHECKPOINTS: dict[str, timedelta] = {
    "24h": timedelta(hours=24),
    "3d": timedelta(days=3),
    "7d": timedelta(days=7),
}
# A reading that could not be taken within this window after it fell due is skipped, not chased.
CATCH_UP = timedelta(days=2)
METRICS = ("views", "likes", "collects", "comments", "new_followers")
PUBLISHED = {"awaiting_verification", "operator_verified", "success"}
GOOD_RATE = 5.0  # interaction rate (%) shown as "建议多用"; a reference, not a verdict

INSTRUCTION = (
    "加载 creator 技能。只读：进入本人作品页，打开任务数据 note_title 对应的笔记（有 post_url 时以它为准；"
    "同名或找不到时立即停止）。读取页面上显示的阅读、点赞、收藏、评论数，以及创作者中心显示的这篇带来的新增粉丝。"
    "页面没有显示的数字写 null，不推算、不估计。不点赞、不收藏、不评论、不修改任何内容。"
    '返回 stats{"views","likes","collects","comments","new_followers"} 和 status=read；'
    "账号还没有开通数据或页面不显示数据时返回 status=unavailable。"
)


def _now() -> datetime:
    return datetime.now(UTC)


def _parse(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _count(value: Any) -> int | None:
    """A non-negative whole number from the page, or None when the page did not show one."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int) and value >= 0:
        return value
    return None


def receipt_ok(proof: dict[str, Any]) -> bool:
    if proof.get("status") == "unavailable":
        return True
    stats = proof.get("stats")
    return (
        proof.get("status") == "read"
        and isinstance(stats, dict)
        and all(stats.get(k) is None or _count(stats.get(k)) is not None for k in METRICS)
    )


def on_finish(
    state: dict[str, Any], run: dict[str, Any], verified: bool, proof: dict[str, Any]
) -> None:
    if not verified:
        return
    payload = run.get("payload") or {}
    stats = proof.get("stats") if isinstance(proof.get("stats"), dict) else {}
    state.setdefault("post_stats", []).append(
        {
            "id": uuid4().hex,
            "publish_run_id": payload["publish_run_id"],
            "draft_id": payload.get("draft_id", ""),
            "account_id": run["account_id"],
            "checkpoint": payload["checkpoint"],
            "status": "read" if proof.get("status") == "read" else "unavailable",
            "stats": {k: _count(stats.get(k)) for k in METRICS},
            "read_at": _now().isoformat(),
        }
    )
    # Keep the history bounded: a long-running workspace publishes many notes.
    if len(state["post_stats"]) > 3000:
        state["post_stats"] = state["post_stats"][-3000:]


def _draft(doc: dict[str, Any], run: dict[str, Any]) -> dict[str, Any]:
    """The note as it was published. The run keeps a copy, so members who only analyse data still see it."""
    snapshot = run.get("draft_snapshot")
    if isinstance(snapshot, dict) and snapshot:
        return snapshot
    return next((d for d in doc.get("drafts", []) if d["id"] == run.get("draft_id")), {})


def published(doc: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        r
        for r in doc.get("runs", [])
        if r.get("kind") == "publish" and r.get("status") in PUBLISHED and r.get("created_at")
    ]


def due(
    doc: dict[str, Any], enabled: list[str], at: datetime | None = None
) -> list[tuple[dict[str, Any], str]]:
    """(publish run, checkpoint) pairs whose reading is due now and not taken or under way."""
    current = at or _now()
    taken = {(s["publish_run_id"], s["checkpoint"]) for s in doc.get("post_stats", [])}
    running = {
        ((r.get("payload") or {}).get("publish_run_id"), (r.get("payload") or {}).get("checkpoint"))
        for r in doc.get("runs", [])
        if r.get("kind") == "stats"
        and r.get("status") not in {"failed", "interrupted", "cancelled"}
    }
    out = []
    for run in published(doc):
        for name in enabled:
            when = _parse(run["created_at"]) + CHECKPOINTS[name]
            key = (run["id"], name)
            if when <= current <= when + CATCH_UP and key not in taken and key not in running:
                out.append((run, name))
    return sorted(out, key=lambda pair: pair[0]["created_at"])


async def tick(ctx: Any, domain: Any, workspace: Any) -> None:
    """Start at most one due reading per tick; phones are shared, so one task at a time is enough."""
    if workspace.paused_reason(ctx) or "xhs.analytics" not in getattr(ctx.license, "features", []):
        return
    doc = await ctx.read()
    enabled = workspace.settings(doc).get("stats_checkpoints") or []
    busy = {
        r["device_id"]
        for r in doc.get("runs", [])
        if r["status"] in domain.ACTIVE | domain.UNCERTAIN
    }
    for run, checkpoint in due(doc, enabled):
        account = next((a for a in doc.get("accounts", []) if a["id"] == run["account_id"]), None)
        if (
            account is None
            or not account.get("device_id")
            or account.get("paused")
            or account["device_id"] in busy
            or workspace.member_pause_applies(doc, account, "stats")
            or workspace.device_rest_reason(ctx, doc, account["device_id"], "stats")
        ):
            continue
        draft = _draft(doc, run)
        evidence = run.get("evidence") or {}
        try:
            await workspace.start_run(
                ctx,
                domain,
                doc,
                account,
                "stats",
                {
                    "publish_run_id": run["id"],
                    "draft_id": run.get("draft_id", ""),
                    "checkpoint": checkpoint,
                    "note_title": draft.get("title", ""),
                    "post_url": evidence.get("post_url", ""),
                },
                key=f"stats:{run['id']}:{checkpoint}",
            )
        except PluginAppError:
            continue
        return


def rate(stats: dict[str, Any]) -> float | None:
    """(likes + collects + comments) / views, in percent; None when any part is unknown."""
    views = stats.get("views")
    parts = [stats.get(k) for k in ("likes", "collects", "comments")]
    if not views or any(p is None for p in parts):
        return None
    return round(sum(parts) * 100 / views, 1)  # type: ignore[arg-type]


def notes(doc: dict[str, Any], days: int, at: datetime | None = None) -> list[dict[str, Any]]:
    """Published notes in the window with their latest reading (the 7-day one when it exists)."""
    since = (at or _now()) - timedelta(days=days)
    order = {name: i for i, name in enumerate(CHECKPOINTS)}
    tasks = {t.get("id"): t for t in doc.get("content_tasks", [])}
    out = []
    for run in published(doc):
        if _parse(run["created_at"]) < since:
            continue
        readings = sorted(
            (s for s in doc.get("post_stats", []) if s["publish_run_id"] == run["id"]),
            key=lambda s: order.get(s["checkpoint"], -1),
        )
        latest = readings[-1] if readings else None
        draft = _draft(doc, run)
        task = tasks.get(draft.get("task_id")) or {}
        stats = latest["stats"] if latest and latest["status"] == "read" else {}
        out.append(
            {
                "publish_run_id": run["id"],
                "draft_id": run.get("draft_id", ""),
                "title": draft.get("title", ""),
                "account_id": run["account_id"],
                "source": draft.get("source") or task.get("source") or "manual",
                "template_id": draft.get("template_id") or task.get("template_id") or "",
                "published_at": run["created_at"],
                "checkpoint": latest["checkpoint"] if latest else "",
                "final": bool(latest and latest["checkpoint"] == "7d"),
                "unavailable": bool(latest and latest["status"] == "unavailable"),
                "stats": {k: stats.get(k) for k in METRICS},
                "rate": rate(stats) if stats else None,
            }
        )
    return sorted(out, key=lambda n: n["published_at"], reverse=True)


async def feedback(ctx: Any, domain: Any, payload: dict[str, Any]) -> None:
    """Feed what worked into the next round: topic suggestions, template candidates, a note to self."""
    await ctx.require("xhs.analytics")
    doc = await ctx.read()
    days = int(payload.get("days") or 30)
    if days not in (7, 30, 90):
        domain.fail("invalid_input")
    good = [
        n
        for n in notes(doc, days)
        if n["rate"] is not None and n["rate"] >= GOOD_RATE and n["title"]
    ]
    want_topics = payload.get("topics") is True
    want_templates = payload.get("templates") is True
    memo = str(payload.get("note") or "").strip()[:500]
    if (want_topics or want_templates) and not good:
        domain.fail("no_good_notes")
    if want_templates:
        await ctx.require("xhs.content")
        for note in good[:3]:
            run = next((r for r in published(doc) if r["id"] == note["publish_run_id"]), {})
            draft = _draft(doc, run)
            await ctx.enterprise(
                "POST",
                "template-submissions",
                {
                    "title": note["title"][:40],
                    "structure": str(draft.get("content") or note["title"])[:1000],
                    "template_hint": f"表现较好的笔记（互动率约 {note['rate']:.0f}%）",
                },
            )

    def save(state: dict[str, Any]) -> None:
        if want_topics:
            known = {t.get("title") for t in state.get("content_tasks", [])}
            for note in good[:5]:
                title = f"沿用角度：{note['title']}"
                if title in known:
                    continue
                state.setdefault("content_tasks", []).append(
                    {
                        "id": uuid4().hex,
                        "version": 1,
                        "title": title,
                        "account_id": note["account_id"],
                        "template_id": note["template_id"],
                        "nature": "knowledge",
                        "reason": f"「{note['title']}」互动率约 {note['rate']:.0f}%，下周可以沿用这个角度",
                        "material_ids": [],
                        "source": "ai",
                        "status": "to_make",
                        "created_at": _now().isoformat(),
                    }
                )
        if memo or payload.get("note") == "":
            state["performance_note"] = {"text": memo, "updated_at": _now().isoformat()}

    await ctx.update(save)


async def configure(ctx: Any, domain: Any, payload: dict[str, Any]) -> None:
    """Switch the 24-hour, 3-day and 7-day readings on or off."""
    await ctx.require("xhs.analytics")
    wanted = [c for c in CHECKPOINTS if c in (payload.get("checkpoints") or [])]

    def save(state: dict[str, Any]) -> None:
        settings = dict(state.get("member_settings") or {})
        settings["stats_checkpoints"] = wanted
        settings["version"] = int(settings.get("version", 0)) + 1
        state["member_settings"] = settings

    await ctx.update(save)


HANDLERS = {"performance.feedback": feedback, "performance.configure": configure}

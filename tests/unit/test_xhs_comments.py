from __future__ import annotations

from typing import Any

import pytest

from tests.unit.test_xhs_app_domain import FakeContext, base_doc, domain

comments = domain.comments


@pytest.fixture(autouse=True)
def comment_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(domain, "now", lambda: "2026-11-04T10:00:00+00:00")


def _state_with_comment_settings(
    *, enabled: bool = True, daily_cap: int = 2
) -> tuple[dict[str, Any], dict[str, Any]]:
    state = base_doc()
    account = state["accounts"][0]
    account["operation_settings"] = {
        "interaction": {
            "comment": {"enabled": enabled, "daily_cap": daily_cap},
        }
    }
    return state, account


def _chunk(
    browsed: int,
    *,
    status: str = "completed",
    result_basis: str = "validated_phone_receipt",
    evidence_url: str = "https://example.test/evidence.png",
) -> dict[str, Any]:
    return {
        "browsed": browsed,
        "status": status,
        "result_basis": result_basis,
        "evidence_url": evidence_url,
    }


def _run(
    run_id: str,
    *,
    account_id: str = "a1",
    date: str = "2026-11-04",
    chunks: list[dict[str, Any]] | None = None,
    kind: str = "nurture",
) -> dict[str, Any]:
    return {
        "id": run_id,
        "kind": kind,
        "account_id": account_id,
        "date": date,
        "chunks": chunks or [],
    }


def _comment(
    comment_id: str,
    *,
    account_id: str = "a1",
    status: str = "approved",
    sent_at: str | None = None,
) -> dict[str, Any]:
    item: dict[str, Any] = {
        "id": comment_id,
        "account_id": account_id,
        "status": status,
    }
    if sent_at is not None:
        item["sent_at"] = sent_at
    return item


@pytest.mark.parametrize(
    ("text", "reason"),
    [
        ("你", "comment_too_short"),
        ("你好", None),
        ("𠀀好", None),
        ("你" * 10, None),
        ("你" * 11, "comment_too_long"),
        ("好\n呀", "comment_newline"),
        ("好🫠", None),
        ("好🫠🪿", "comment_emoji_limit"),
        ("？！", "comment_symbols_only"),
    ],
)
def test_validate_text_uses_unicode_codepoints_and_reason_codes(
    text: str, reason: str | None
) -> None:
    assert comments.validate_text(text) == reason


@pytest.mark.parametrize("blocked", comments.BLOCKLIST)
def test_validate_text_rejects_entire_marketing_blocklist(blocked: str) -> None:
    assert comments.validate_text(f"好{blocked.upper()}") == "comment_marketing"


def test_validate_text_forbidden_topics_are_case_sensitive() -> None:
    assert (
        comments.validate_text("聊taboo", forbidden_topics=["taboo"]) == "comment_forbidden_topic"
    )
    assert comments.validate_text("聊TaBoO", forbidden_topics=["taboo"]) is None


def test_parse_candidates_prefers_source_json_and_keeps_unfiltered_strings() -> None:
    text = """前文
```json
{"candidates":["“第一条”","第二条","第二条",3,"加微信"]}
```
9. 回退候选
"""

    assert comments.parse_candidates(text) == ["第一条", "第二条", "加微信"]


def test_parse_candidates_falls_back_to_lines_and_normalizes_duplicates() -> None:
    text = """1. “第一条”
- 第二条
候选 3：'第三条'
• 第二条
"""

    assert comments.parse_candidates(text) == ["第一条", "第二条", "第三条"]


def test_quota_counts_only_validated_nurture_chunks_for_account_and_date() -> None:
    state, account = _state_with_comment_settings(daily_cap=3)
    state["runs"] = [
        _run("valid", chunks=[_chunk(8)]),
        _run("unknown", chunks=[_chunk(99, status="unknown")]),
        _run("unvalidated", chunks=[_chunk(99, result_basis="model_report")]),
        _run("no-evidence", chunks=[_chunk(99, evidence_url="")]),
        _run("other-account", account_id="a2", chunks=[_chunk(99)]),
        _run("other-date", date="2026-11-03", chunks=[_chunk(99)]),
        _run("other-kind", kind="publish", chunks=[_chunk(99)]),
    ]
    ctx = FakeContext(state)

    assert comments.quota(ctx, domain, state, account) == {
        "account_id": "a1",
        "date": "2026-11-04",
        "enabled": True,
        "daily_cap": 3,
        "today_browsed": 8,
        "by_browse": 1,
        "cap": 1,
        "sent_today": 0,
        "approved_pending": 0,
        "remaining": 1,
    }


def test_quota_applies_hard_cap_and_disabled_defaults() -> None:
    state, account = _state_with_comment_settings(daily_cap=9)
    state["runs"] = [_run("many", chunks=[_chunk(80)])]
    ctx = FakeContext(state)

    enabled = comments.quota(ctx, domain, state, account)
    assert enabled["by_browse"] == 10
    assert enabled["cap"] == 5
    assert enabled["remaining"] == 5

    account.pop("operation_settings")
    disabled = comments.quota(ctx, domain, state, account)
    assert disabled["enabled"] is False
    assert disabled["daily_cap"] == 2
    assert disabled["cap"] == 0
    assert disabled["remaining"] == 0


def test_quota_uses_server_timezone_and_reserves_pending_statuses(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state, account = _state_with_comment_settings(daily_cap=9)
    state["runs"] = [_run("browse", date="2026-11-03", chunks=[_chunk(40)])]
    state["comments"] = [
        _comment("sent-local-day", status="sent", sent_at="2026-11-04T01:30:00+00:00"),
        _comment("sent-next-day", status="sent", sent_at="2026-11-04T08:30:00+00:00"),
        *[
            _comment(f"pending-{status}", status=status)
            for status in (
                "approved",
                "sending",
                "awaiting_verification",
                "unknown",
                "stopped_unverified",
            )
        ],
        _comment("other-account", account_id="a2", status="approved"),
    ]
    ctx = FakeContext(state)
    ctx.host.server.services.config.default_timezone = "America/Los_Angeles"
    monkeypatch.setattr(domain, "now", lambda: "2026-11-04T01:00:00+00:00")

    result = comments.quota(ctx, domain, state, account)

    assert result["date"] == "2026-11-03"
    assert result["today_browsed"] == 40
    assert result["cap"] == 5
    assert result["sent_today"] == 1
    assert result["approved_pending"] == 5
    assert result["remaining"] == 0


@pytest.mark.asyncio
async def test_quota_reads_persisted_state_and_excludes_current_item() -> None:
    state, account = _state_with_comment_settings(daily_cap=2)
    state["runs"] = [_run("browse", chunks=[_chunk(8)])]
    state["comments"] = [_comment("current", status="approved")]
    ctx = FakeContext(state)
    persisted = await ctx.read()

    occupied = comments.quota(ctx, domain, persisted, account)
    excluded = comments.quota(ctx, domain, persisted, account, exclude_id="current")

    assert occupied["approved_pending"] == 1
    assert occupied["remaining"] == 0
    assert excluded["approved_pending"] == 0
    assert excluded["remaining"] == 1

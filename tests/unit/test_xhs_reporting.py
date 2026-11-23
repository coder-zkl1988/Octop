"""Operation reports count validated receipts, not budgets or unfinished model reports."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from tests.unit.test_xhs_app_domain import domain

reporting = domain.reporting


def fixture() -> dict[str, Any]:
    return {
        "accounts": [
            {
                "id": "a1",
                "name": "private-name",
                "platform_account_id": "private-xhs-id",
                "device_id": "private-phone",
                "project_id": "p1",
                "interest_pool": {"core": ["运动"]},
            },
            {"id": "a2", "device_id": "phone-two", "project_id": "p1"},
            {"id": "unbound", "device_id": None},
        ],
        "runs": [
            {
                "id": "r1",
                "kind": "nurture",
                "account_id": "a1",
                "date": "2026-11-04",
                "status": "success",
                "created_at": "2026-11-04T01:00:00Z",
                "chunks": [
                    {
                        "index": 0,
                        "mode": "search",
                        "keyword": "运动",
                        "planned": 4,
                        "browsed": 4,
                        "status": "completed",
                        "result_basis": "validated_phone_receipt",
                        "evidence_url": "/private-proof",
                        "interactions": {"like": 1},
                        "anomalies": [],
                    },
                    {
                        "index": 1,
                        "mode": "home",
                        "planned": 3,
                        "browsed": 2,
                        "status": "completed",
                        "result_basis": "validated_phone_receipt",
                        "evidence_url": "/home-proof",
                        "interactions": {"collect": 1},
                        "observation": "private observation",
                    },
                ],
            },
            {
                "id": "r2",
                "kind": "nurture",
                "account_id": "a1",
                "date": "2026-11-04",
                "status": "unknown",
                "created_at": "2026-11-04T02:00:00Z",
                "chunks": [
                    {
                        "index": 0,
                        "mode": "search",
                        "keyword": "运动",
                        "planned": 5,
                        "browsed": 5,
                        "status": "unknown",
                        "started_at": "2026-11-04T02:00:00Z",
                        "interactions": {"like": 5},
                        "quota": {"like": {"max": 5}},
                    },
                    {
                        "index": 1,
                        "mode": "search",
                        "keyword": "未派发",
                        "planned": 5,
                        "status": "pending",
                    },
                ],
            },
        ],
    }


def test_matrix_counts_completed_chunks_preserves_gaps_and_never_claims_platform_proof() -> None:
    state = fixture()
    original = deepcopy(state)
    result = reporting.build(state, "2026-11-04", "Asia/Shanghai", days=7)
    assert result["dates"] == [f"2026-10-{day}" for day in (29, 30, 31)] + [
        f"2026-11-0{day}" for day in (1, 2, 3, 4)
    ]
    assert [row["account_id"] for row in result["accounts"]] == ["a1", "a2"]
    assert result["totals"] == {
        "runs": 2,
        "planned": 17,
        "browsed": 6,
        "home": 2,
        "receipt_chunks": 2,
        "unresolved_chunks": 1,
        "anomalies": 0,
        "like": 1,
        "collect": 1,
        "follow": 0,
        "comment": 0,
    }
    assert result["accounts"][0]["cells"][-1]["status"] == "unknown"
    assert result["accounts"][1]["totals"]["runs"] == 0
    assert result["platform_verified_interactions"] is None
    assert result["keywords"][0]["verdict"] == "unknown"
    assert state == original


def test_deleted_accounts_and_invalid_evidence_remain_visible_without_invented_usage() -> None:
    state = fixture()
    state["accounts"] = []
    state["runs"][0]["chunks"][0].pop("evidence_url")
    result = reporting.build(state, "2026-11-04", "Asia/Shanghai", days=1)
    assert result["accounts"][0]["exists"] is False
    assert result["totals"]["browsed"] == 2
    assert result["totals"]["like"] == 0
    assert result["totals"]["unresolved_chunks"] == 2


def test_keyword_anomalies_home_runs_and_core_membership_match_source_rules() -> None:
    state = fixture()
    state["runs"] = [state["runs"][0]]
    chunk = state["runs"][0]["chunks"][0]
    chunk.update(browsed=1, anomalies=[{"type": "content_mismatch", "detail": "private page text"}])
    result = reporting.build(state, "2026-11-04", "Asia/Shanghai", days=14)
    assert result["keywords"][0]["verdict"] == "adjust"
    assert result["keywords"][0]["core_of"] == ["a1"]
    assert result["anomalies"] == [
        {
            "type": "content_mismatch",
            "count": 1,
            "latest": {"date": "2026-11-04", "account_id": "a1", "run_id": "r1"},
        }
    ]
    assert result["home"] == {
        "runs": 1,
        "planned": 3,
        "browsed": 2,
        "interactions": 1,
        "observations": 1,
    }
    chunk["anomalies"] = []
    assert (
        reporting.build(state, "2026-11-04", "Asia/Shanghai")["keywords"][0]["verdict"] == "watch"
    )


def test_date_range_is_bounded_and_uses_controller_date_without_browser_clock() -> None:
    state = fixture()
    state["runs"] += [
        {**deepcopy(state["runs"][0]), "id": "future", "date": "2026-11-05"},
        {**deepcopy(state["runs"][0]), "id": "old", "date": "2026-08-01"},
    ]
    result = reporting.build(state, "2026-11-04", "Asia/Shanghai", days=999)
    assert len(result["dates"]) == 60
    assert result["totals"]["runs"] == 2
    assert result["date"] == "2026-11-04" and result["timezone"] == "Asia/Shanghai"


def test_analytics_payload_omits_phone_identity_content_evidence_and_observations() -> None:
    result = reporting.build(fixture(), "2026-11-04", "Asia/Shanghai")
    rendered = str(result)
    for value in (
        "private-name",
        "private-xhs-id",
        "private-phone",
        "/private-proof",
        "private observation",
    ):
        assert value not in rendered


def test_unknown_diagnostics_are_not_actual_anomalies_or_keyword_recommendations() -> None:
    state = fixture()
    state["runs"][1]["chunks"][0]["anomalies"] = [{"type": "content_mismatch"}]
    state["runs"][1]["chunks"].append(
        {
            "mode": "home",
            "status": "unknown",
            "started_at": "2026-11-04T02:00:00Z",
            "planned": 2,
            "browsed": 2,
            "observation": "not verified",
            "anomalies": ["no_results"],
        }
    )
    result = reporting.build(state, "2026-11-04", "Asia/Shanghai")
    assert result["totals"]["anomalies"] == 0
    assert result["totals"]["unresolved_chunks"] == 2
    assert result["anomalies"] == []
    assert result["home"]["observations"] == 1
    assert result["keywords"][0]["verdict"] == "unknown"
    assert result["keywords"][0]["mismatch"] == 0
    state["runs"][0]["chunks"][0]["anomalies"] = ["content_mismatch"]
    result = reporting.build(state, "2026-11-04", "Asia/Shanghai")
    assert result["keywords"][0]["mismatch"] == 1
    assert result["keywords"][0]["verdict"] == "unknown"


def test_project_and_date_windows_filter_every_statistic_and_keep_deleted_account_scope() -> None:
    state = fixture()
    other = deepcopy(state["runs"][0])
    other.update(
        id="other", account_id="deleted", account_snapshot={"project_id": "p2"}, date="2026-10-20"
    )
    state["runs"].append(other)
    result = reporting.snapshot(state, "2026-11-04", "Asia/Shanghai")
    assert result["projects"]["p1"]["totals"]["runs"] == 2
    assert result["projects"]["p2"]["totals"]["runs"] == 1
    assert result["projects"]["p2"]["accounts"][0]["project_id"] == "p2"
    assert result["projects"]["p2"]["windows"]["7"]["totals"]["runs"] == 0
    assert result["projects"]["p2"]["windows"]["30"]["totals"]["runs"] == 1
    assert result["projects"]["p2"]["windows"]["7"]["keywords"] == []
    assert result["projects"]["p2"]["windows"]["30"]["keywords"][0]["browsed"] == 4

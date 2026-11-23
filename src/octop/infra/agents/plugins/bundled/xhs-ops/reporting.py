"""Read-only operation aggregates adapted from Tabby's xhs-ops-dashboard-data.ts."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

COUNTERS = ("like", "collect", "follow", "comment")
STATUS_SEVERITY = {
    "verified": 0,
    "operator_verified": 0,
    "success": 0,
    "planned": 1,
    "waiting": 1,
    "queued": 1,
    "preparing": 1,
    "running": 1,
    "awaiting_verification": 2,
    "cancelled": 3,
    "cancelling": 4,
    "stopped_unverified": 4,
    "interrupted": 4,
    "error": 5,
    "unknown": 6,
}


def _number(value: Any) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def _empty() -> dict[str, int]:
    return dict.fromkeys(
        (
            "runs",
            "planned",
            "browsed",
            "home",
            "receipt_chunks",
            "unresolved_chunks",
            "anomalies",
            *COUNTERS,
        ),
        0,
    )


def _add(target: dict[str, int], value: dict[str, int]) -> None:
    for key in target:
        target[key] += value.get(key, 0)


def _anomaly_type(value: Any) -> str:
    name = value.get("type", "other") if isinstance(value, dict) else value
    return (
        str(name)
        if isinstance(name, str)
        and name
        in {
            "no_results",
            "content_mismatch",
            "login_required",
            "phone_required",
            "account_restricted",
            "rate_limited",
            "interrupted",
            "other",
        }
        else "other"
    )


def _actual(chunk: dict[str, Any]) -> bool:
    # An incomplete chunk's quota and any partial model report are not actual usage.
    return (
        chunk.get("status") == "completed"
        and chunk.get("result_basis") == "validated_phone_receipt"
        and bool(chunk.get("evidence_url"))
    )


def _counts(run: dict[str, Any]) -> dict[str, int]:
    totals = _empty()
    totals["runs"] = 1
    for chunk in run.get("chunks", []):
        if chunk.get("mode") not in {"search", "home", "comment"}:
            continue
        totals["planned"] += _number(chunk.get("planned"))
        if _actual(chunk):
            totals["anomalies"] += len(chunk.get("anomalies", []))
            totals["receipt_chunks"] += 1
            browsed = _number(chunk.get("browsed"))
            totals["browsed"] += browsed
            if chunk.get("mode") == "home":
                totals["home"] += browsed
            for key in COUNTERS:
                totals[key] += _number((chunk.get("interactions") or {}).get(key))
        elif chunk.get("started_at") or chunk.get("status") == "completed":
            totals["unresolved_chunks"] += 1
    return totals


def _project_id(run: dict[str, Any], accounts: dict[str, Any]) -> str | None:
    account_id = run.get("account_id")
    account = accounts.get(account_id, {}) if isinstance(account_id, str) else {}
    value = (
        run.get("project_id")
        or (run.get("account_snapshot") or {}).get("project_id")
        or account.get("project_id")
    )
    return value if isinstance(value, str) else None


def build(
    state: dict[str, Any],
    today: str,
    timezone: str,
    *,
    days: int = 60,
    project_id: str | None = None,
) -> dict[str, Any]:
    end = date.fromisoformat(today)
    count = min(60, max(1, days))
    dates = [(end - timedelta(days=offset)).isoformat() for offset in reversed(range(count))]
    in_range = set(dates)
    all_accounts = {account["id"]: account for account in state.get("accounts", [])}
    runs = [
        run
        for run in state.get("runs", [])
        if run.get("date") in in_range
        and run.get("kind") in {"nurture", "browse", "comment"}
        and (project_id is None or _project_id(run, all_accounts) == project_id)
    ]
    accounts = {
        key: account
        for key, account in all_accounts.items()
        if project_id is None or account.get("project_id") == project_id
    }
    grouped: dict[str, list[dict[str, Any]]] = {}
    for run in runs:
        grouped.setdefault(run["account_id"], []).append(run)
    for account in accounts.values():
        if account.get("device_id"):
            grouped.setdefault(account["id"], [])

    matrix = []
    totals = _empty()
    keywords: dict[str, dict[str, Any]] = {}
    anomalies: dict[str, dict[str, Any]] = {}
    home = {"runs": 0, "planned": 0, "browsed": 0, "interactions": 0, "observations": 0}
    for account_id, account_runs in grouped.items():
        account = accounts.get(account_id)
        row_totals = _empty()
        cells = []
        for day in dates:
            day_runs = sorted(
                (run for run in account_runs if run["date"] == day),
                key=lambda run: run.get("created_at", ""),
            )
            cell = _empty()
            for run in day_runs:
                _add(cell, _counts(run))
            _add(row_totals, cell)
            cells.append(
                {
                    "date": day,
                    **cell,
                    "status": max(
                        (run["status"] for run in day_runs),
                        key=lambda status: STATUS_SEVERITY.get(status, 6),
                        default=None,
                    ),
                    "run_ids": [run["id"] for run in day_runs],
                }
            )
        matrix.append(
            {
                "account_id": account_id,
                "project_id": (account or {}).get("project_id")
                or next(
                    (
                        _project_id(run, all_accounts)
                        for run in account_runs
                        if _project_id(run, all_accounts)
                    ),
                    None,
                ),
                "exists": account is not None,
                "bound": bool((account or {}).get("device_id")),
                "cells": cells,
                "totals": row_totals,
            }
        )
        _add(totals, row_totals)

    for run in sorted(runs, key=lambda row: row.get("created_at", "")):
        had_home = False
        for chunk in run.get("chunks", []):
            actual = _actual(chunk)
            chunk_anomalies = chunk.get("anomalies", []) if actual else []
            for anomaly in chunk_anomalies:
                name = _anomaly_type(anomaly)
                summary = anomalies.setdefault(name, {"type": name, "count": 0})
                summary.update(
                    count=summary["count"] + 1,
                    latest={
                        "date": run["date"],
                        "account_id": run["account_id"],
                        "run_id": run["id"],
                    },
                )
            if chunk.get("status") in {"pending", "cancelled"} and not chunk.get("started_at"):
                continue
            interactions = (
                sum(_number((chunk.get("interactions") or {}).get(key)) for key in COUNTERS)
                if actual
                else 0
            )
            if chunk.get("mode") == "home":
                had_home = True
                home["planned"] += _number(chunk.get("planned"))
                home["browsed"] += _number(chunk.get("browsed")) if actual else 0
                home["interactions"] += interactions
                home["observations"] += int(
                    actual and bool(str(chunk.get("observation") or "").strip())
                )
                continue
            keyword = str(chunk.get("keyword") or "").strip()
            if chunk.get("mode") != "search" or not keyword:
                continue
            stat = keywords.setdefault(
                keyword,
                {
                    "keyword": keyword,
                    "runs": 0,
                    "planned": 0,
                    "browsed": 0,
                    "interactions": 0,
                    "anomalies": 0,
                    "mismatch": 0,
                    "unresolved_chunks": 0,
                    "core_of": [
                        account["id"]
                        for account in accounts.values()
                        if keyword in (account.get("interest_pool") or {}).get("core", [])
                    ],
                },
            )
            stat["runs"] += 1
            stat["planned"] += _number(chunk.get("planned"))
            stat["browsed"] += _number(chunk.get("browsed")) if actual else 0
            stat["interactions"] += interactions
            stat["anomalies"] += len(chunk_anomalies)
            stat["mismatch"] += sum(
                _anomaly_type(value) in {"no_results", "content_mismatch"}
                for value in chunk_anomalies
            )
            stat["unresolved_chunks"] += int(not actual)
        home["runs"] += int(had_home)
    for stat in keywords.values():
        stat["verdict"] = (
            "unknown"
            if stat["unresolved_chunks"]
            else "adjust"
            if stat["mismatch"]
            else "watch"
            if stat["planned"] >= 4 and stat["browsed"] < stat["planned"] / 2
            else "good"
        )
    order = {"adjust": 0, "unknown": 1, "watch": 2, "good": 3}
    return {
        "date": today,
        "timezone": timezone,
        "dates": dates,
        "accounts": matrix,
        "totals": totals,
        "keywords": sorted(
            keywords.values(),
            key=lambda row: (order[row["verdict"]], -row["planned"], row["keyword"]),
        ),
        "home": home,
        "anomalies": sorted(anomalies.values(), key=lambda row: (-row["count"], row["type"])),
        "basis": "validated_phone_receipts",
        "platform_verified_interactions": None,
    }


def snapshot(state: dict[str, Any], today: str, timezone: str) -> dict[str, Any]:
    def scope(project_id: str | None = None) -> dict[str, Any]:
        result = build(state, today, timezone, project_id=project_id)
        result["windows"] = {
            str(days): build(state, today, timezone, days=days, project_id=project_id)
            for days in (7, 14, 30)
        }
        return result

    result = scope()
    accounts = {row["id"]: row for row in state.get("accounts", [])}
    projects = {row["id"] for row in state.get("projects", [])}
    projects.update(row.get("project_id") for row in accounts.values() if row.get("project_id"))
    projects.update(
        _project_id(run, accounts) for run in state.get("runs", []) if _project_id(run, accounts)
    )
    result["projects"] = {project_id: scope(project_id) for project_id in sorted(projects)}
    return result

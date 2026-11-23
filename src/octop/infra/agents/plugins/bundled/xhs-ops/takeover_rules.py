"""Pure rules for taking over an existing Xiaohongshu account."""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Any

FIELD_BUDGET: dict[str, dict[str, Any]] = {
    "bio": {
        "risk": "L1",
        "batch": 1,
        "window_days": 7,
        "max_changes": 1,
        "second_check": False,
        "not_in_first_observation": False,
        "only_on_request": False,
        "image": False,
    },
    "occupation": {
        "risk": "L1",
        "batch": 1,
        "window_days": 14,
        "max_changes": 1,
        "second_check": False,
        "not_in_first_observation": False,
        "only_on_request": False,
        "image": False,
    },
    "nickname": {
        "risk": "L2",
        "batch": 2,
        "window_days": 30,
        "max_changes": 1,
        "second_check": True,
        "not_in_first_observation": True,
        "only_on_request": False,
        "image": False,
    },
    "region": {
        "risk": "L2",
        "batch": 2,
        "window_days": 30,
        "max_changes": 1,
        "second_check": True,
        "not_in_first_observation": False,
        "only_on_request": True,
        "image": False,
    },
    "avatar": {
        "risk": "L2",
        "batch": 3,
        "window_days": 7,
        "max_changes": 1,
        "second_check": False,
        "not_in_first_observation": False,
        "only_on_request": False,
        "image": True,
    },
    "cover": {
        "risk": "L2",
        "batch": 3,
        "window_days": 7,
        "max_changes": 1,
        "second_check": False,
        "not_in_first_observation": False,
        "only_on_request": False,
        "image": True,
    },
}

OBSERVATION_HOURS = {"L1": 72, "L2": 168}

_UNSUBMITTED_CODES = {"album_not_found", "permission_required", "picker_unsupported"}
_PLATFORM_LIMIT_RE = re.compile(r"次数|频繁|稍后|限制|\d+\s*天")
_DAYS_RE = re.compile(r"(\d+)\s*天")
_FIELD_LABELS = {
    "nickname": "名字",
    "bio": "简介",
    "occupation": "职业",
    "avatar": "头像",
    "cover": "背景图",
    "region": "地区",
}


def _parse_iso(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _require_iso(value: object, name: str) -> datetime:
    parsed = _parse_iso(value)
    if parsed is None:
        raise ValueError(f"{name} must be a valid ISO timestamp")
    return parsed


def _to_iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def field_counted(order: dict[str, Any], field_entry: dict[str, Any]) -> bool:
    """Return whether a field attempt consumes its rolling change budget."""
    if not order.get("apply_task_id"):
        return False
    outcome = field_entry.get("outcome")
    if outcome == "skipped":
        return False
    return outcome != "failed" or field_entry.get("code") not in _UNSUBMITTED_CODES


def _observation_finished(order: dict[str, Any]) -> bool:
    observation = order.get("observation")
    return isinstance(observation, dict) and observation.get("status") != "observing"


def awaits_first_observation(
    field: str, orders: list[dict[str, Any]], rollback: bool = False
) -> bool:
    """Return whether the first-observation restriction still applies."""
    budget = FIELD_BUDGET.get(field)
    if rollback or not budget or not budget["not_in_first_observation"]:
        return False
    if not orders:
        return False
    return not any(_observation_finished(order) for order in orders)


def field_budget_state(
    field: str,
    orders: list[dict[str, Any]],
    notices: list[dict[str, Any]],
    now_iso: str,
    rollback: bool = False,
) -> dict[str, int | str | None]:
    """Calculate used budget and the latest time at which the field is blocked."""
    budget = FIELD_BUDGET[field]
    now = _require_iso(now_iso, "now_iso")
    window = timedelta(days=budget["window_days"])
    counted_at: list[datetime] = []

    for order in orders:
        changed_at = _parse_iso(order.get("confirmed_at") or order.get("updated_at"))
        if changed_at is None or changed_at + window <= now:
            continue
        fields = order.get("fields")
        if not isinstance(fields, list):
            continue
        for entry in fields:
            if (
                isinstance(entry, dict)
                and entry.get("field") == field
                and field_counted(order, entry)
            ):
                counted_at.append(changed_at)

    counted_at.sort(reverse=True)
    blocked_until: datetime | None = None
    max_changes = budget["max_changes"]
    if not rollback and len(counted_at) >= max_changes:
        blocked_until = counted_at[max_changes - 1] + window

    for notice in notices:
        if not isinstance(notice, dict) or notice.get("field") != field:
            continue
        notice_until = _parse_iso(notice.get("blocked_until"))
        if notice_until is not None and notice_until > now:
            blocked_until = max(blocked_until, notice_until) if blocked_until else notice_until

    if awaits_first_observation(field, orders, rollback=rollback):
        for order in orders:
            observation = order.get("observation")
            if not isinstance(observation, dict) or observation.get("status") != "observing":
                continue
            observation_until = _parse_iso(observation.get("until"))
            if observation_until is not None and observation_until > now:
                blocked_until = (
                    max(blocked_until, observation_until) if blocked_until else observation_until
                )

    return {
        "used": len(counted_at),
        "blocked_until": _to_iso(blocked_until) if blocked_until else None,
    }


def same_profile_text(left: object, right: object) -> bool:
    """Compare profile text after normalizing escaped newlines and whitespace."""

    def normalize(value: object) -> str:
        return re.sub(r"\s+", "", str(value or "").replace("\\n", "\n"))

    return normalize(left) == normalize(right)


def supports_images(device: dict[str, Any]) -> bool:
    """Apply the controller's Android-version compatibility rule."""
    raw = device.get("os_version")
    text = (
        str(raw)
        if isinstance(raw, (int, float)) and not isinstance(raw, bool)
        else str(raw or "").strip()
    )
    match = re.search(r"\d+", text)
    if match is None:
        return False
    value = int(match.group())
    if re.fullmatch(r"\d+", text) and value >= 21:
        return value >= 29
    return value >= 10


def extract_platform_limit_notices(
    order: dict[str, Any],
    receipt: dict[str, Any],
    task_id: str,
    observed_at: str,
) -> list[dict[str, str]]:
    """Extract bounded platform-limit notices from an execution receipt."""
    if not receipt.get("extracted"):
        return []

    observed = _require_iso(observed_at, "observed_at")
    note = str(receipt.get("note") or "").strip()
    fields: list[str] = []

    def add_field(candidate: object) -> None:
        if isinstance(candidate, str) and candidate in FIELD_BUDGET and candidate not in fields:
            fields.append(candidate)

    receipt_fields = receipt.get("fields")
    if isinstance(receipt_fields, list):
        for entry in receipt_fields:
            if isinstance(entry, dict) and entry.get("code") == "platform_limit":
                add_field(entry.get("field"))

    if _PLATFORM_LIMIT_RE.search(note):
        order_fields = order.get("fields")
        done_fields = {
            entry.get("field")
            for entry in order_fields or []
            if isinstance(entry, dict) and entry.get("outcome") == "done"
        }
        named_fields = [
            field
            for field, label in _FIELD_LABELS.items()
            if label in note
            and any(
                isinstance(entry, dict) and entry.get("field") == field
                for entry in order_fields or []
            )
        ]
        if named_fields:
            for named in named_fields:
                if named not in done_fields:
                    add_field(named)
        elif isinstance(receipt_fields, list):
            for entry in receipt_fields:
                if isinstance(entry, dict) and entry.get("outcome") == "failed":
                    add_field(entry.get("field"))

    days_match = _DAYS_RE.search(note)
    explicit_days = min(max(int(days_match.group(1)), 1), 365) if days_match else None
    notices: list[dict[str, str]] = []
    for field in fields:
        days = explicit_days or FIELD_BUDGET[field]["window_days"]
        notices.append(
            {
                "field": field,
                "text": (note or _FIELD_LABELS[field])[:120],
                "observed_at": _to_iso(observed),
                "blocked_until": _to_iso(observed + timedelta(days=days)),
                "source_task_id": task_id,
            }
        )
    return notices


def merge_platform_limit_notices(
    existing: list[dict[str, Any]], added: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Merge task-scoped notices and keep the newest bounded history."""
    fresh = [
        notice
        for notice in added
        if not any(
            old.get("field") == notice.get("field")
            and old.get("source_task_id") is not None
            and old.get("source_task_id") == notice.get("source_task_id")
            for old in existing
        )
    ]
    return (existing + fresh)[-20:]

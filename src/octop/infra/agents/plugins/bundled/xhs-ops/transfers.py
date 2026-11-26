"""Hand one account to a colleague through the enterprise control plane.

Account data lives in each member's own plugin document, so a transfer moves a package:

1. The sending member starts it here. The account is frozen at once (no phone work, no edits)
   and a package is uploaded: the account, its project, unpublished drafts, open content tasks,
   account-bound materials and authorizations, open replies and leads, the images they use, and a
   short history of what was published.
2. The tenant admin approves or rejects it in the admin console.
3. The receiving member accepts: the package is imported with the phone binding and the identity
   check cleared, so the account must be bound to one of their phones and verified again before
   anything runs. The import then confirms completion and the control plane deletes the package.
4. The sending desktop notices on its next sync: completed removes the account and the records
   that went with it; rejected, declined or cancelled unfreezes it.
"""

from __future__ import annotations

import base64
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from octop.infra.plugin_apps.contracts import PluginAppError

COMMANDS = frozenset(
    {"transfer.sync", "transfer.create", "transfer.cancel", "transfer.accept", "transfer.decline"}
)
FORMAT = 1
ASSET_LIMIT = 18 * 1024 * 1024
SYNC_EVERY = timedelta(minutes=10)
OPEN = frozenset({"pending_approval", "approved", "accepted"})
RETURNED = frozenset({"rejected", "declined", "cancelled"})
# What ties an account to the sender's phone and to checks done on it; the receiver redoes these.
BINDING_RESET: dict[str, Any] = {
    "device_id": "",
    "device_name": "",
    "device_hold": None,
    "device_hold_reference": None,
    "device_hold_released_at": None,
    "authorized_at": None,
    "identity_confirmed_at": None,
    "identity_evidence_url": None,
    "identity_source": None,
    "identity_task_id": None,
    "operator_reference": None,
    "operator_user_id": None,
    "operator_verified_at": None,
    "pending_identity": None,
    "profile_identity": None,
    "baseline_audit_id": None,
    "plan_confirmed": False,
    "plan_confirmed_at": None,
    "plan_reverted_at": None,
    "pre_plan_snapshot": None,
    "profile_precheck": None,
    "profile_generation": None,
    "last_profile_apply_run_id": None,
    "phone_task_active": False,
    "inbox_checked_at": None,
}
BUSY_RUNS = frozenset({"planned", "waiting", "awaiting_verification", "awaiting_confirmation"})
OPEN_REPLIES = frozenset({"new", "failed"})


def _fail(reason: str, status: int = 400) -> None:
    raise PluginAppError(reason, status=status)


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _rows(doc: dict[str, Any], key: str) -> list[dict[str, Any]]:
    value = doc.setdefault(key, [])
    return value if isinstance(value, list) else []


def frozen(account: dict[str, Any] | None) -> bool:
    return bool(account and (account.get("transfer") or {}).get("id"))


def _owner_of(doc: dict[str, Any], value: str) -> str | None:
    """Map an id from a command payload to the account it belongs to."""
    if any(a.get("id") == value for a in _rows(doc, "accounts")):
        return value
    for key in ("drafts", "reply_items", "content_tasks", "leads"):
        row = next((r for r in _rows(doc, key) if r.get("id") == value), None)
        if row is not None:
            return str(row.get("account_id") or "") or None
    return None


def guard(doc: dict[str, Any], name: str, payload: dict[str, Any]) -> None:
    """Refuse any other command that touches an account while it is being handed over."""
    if name in COMMANDS:
        return
    values: list[str] = []
    for key in ("id", "draft_id", "account_id", "from_account_id", "to_account_id"):
        if isinstance(payload.get(key), str):
            values.append(payload[key])
    for key in ("ids", "account_ids"):
        if isinstance(payload.get(key), list):
            values.extend(str(v) for v in payload[key])
    accounts = {a["id"]: a for a in _rows(doc, "accounts")}
    for value in values:
        owner = _owner_of(doc, value)
        if owner and frozen(accounts.get(owner)):
            _fail("account_transferring", 409)


# ------------------------------------------------------------------ packaging


def _walk_images(value: Any, out: list[dict[str, Any]]) -> None:
    if isinstance(value, dict):
        if value.get("asset_id") and value.get("mime_type"):
            out.append(value)
        for item in value.values():
            _walk_images(item, out)
    elif isinstance(value, list):
        for item in value:
            _walk_images(item, out)


async def build_package(ctx: Any, doc: dict[str, Any], account: dict[str, Any]) -> dict[str, Any]:
    account_id = account["id"]
    project = next(
        (p for p in _rows(doc, "projects") if p.get("id") == account.get("project_id")), None
    )
    drafts = [d for d in _rows(doc, "drafts") if d.get("account_id") == account_id]
    open_drafts = [d for d in drafts if d.get("review_status") != "published"]
    materials = [
        {**m, "account_ids": [account_id]}
        for m in _rows(doc, "materials")
        if m.get("owner") != "public" and account_id in (m.get("account_ids") or [])
    ]
    consent_ids = {m.get("consent_id") for m in materials if m.get("consent_id")}
    authorizations = [
        {**c, "account_ids": [account_id]}
        for c in _rows(doc, "authorizations")
        if account_id in (c.get("account_ids") or []) or c.get("id") in consent_ids
    ]
    tasks = [
        t
        for t in _rows(doc, "content_tasks")
        if t.get("account_id") == account_id and t.get("status") == "to_make"
    ]
    replies = [
        r
        for r in _rows(doc, "reply_items")
        if r.get("account_id") == account_id and r.get("status") in OPEN_REPLIES
    ]
    leads = [lead for lead in _rows(doc, "leads") if lead.get("account_id") == account_id]
    history = [
        {
            "kind": "publish",
            "title": d.get("title", ""),
            "at": d.get("published_at") or d.get("updated_at") or d.get("created_at"),
            "note_url": d.get("note_url", ""),
        }
        for d in drafts
        if d.get("review_status") == "published"
    ]
    history += [
        {
            "kind": run.get("kind", ""),
            "status": run.get("status", ""),
            "at": run.get("updated_at") or run.get("created_at"),
        }
        for run in _rows(doc, "runs")
        if run.get("account_id") == account_id and run.get("kind") in {"nurture", "browse", "audit"}
    ][-30:]
    body = {
        "account": {k: v for k, v in account.items() if k not in BINDING_RESET and k != "transfer"},
        "project": project,
        "drafts": open_drafts,
        "content_tasks": tasks,
        "materials": materials,
        "authorizations": authorizations,
        "reply_items": replies,
        "leads": leads,
        "history": [*(account.get("history_before_transfer") or []), *history][-200:],
    }
    images: list[dict[str, Any]] = []
    _walk_images(body, images)
    assets: dict[str, dict[str, str]] = {}
    total = 0
    for image in images:
        asset_id = str(image["asset_id"])
        if asset_id in assets:
            continue
        data, metadata = await ctx.read_asset(asset_id)
        total += len(data)
        if total > ASSET_LIMIT:
            _fail("transfer_package_too_large", 413)
        assets[asset_id] = {
            "mime_type": str(metadata.get("mime_type") or image["mime_type"]),
            "data_base64": base64.b64encode(data).decode(),
        }
    summary = {
        "drafts": len(open_drafts),
        "materials": len(materials),
        "authorizations": len(authorizations),
        "leads": len(leads),
        "images": len(assets),
    }
    return {"format": FORMAT, **body, "assets": assets, "summary": summary}


# ------------------------------------------------------------------ commands


async def command(ctx: Any, domain: Any, name: str, payload: dict[str, Any]) -> None:
    await ctx.require("xhs.ops")
    if not ctx.has_enterprise:
        _fail("enterprise_backend_unavailable", 503)
    handler = {
        "transfer.sync": _sync,
        "transfer.create": _create,
        "transfer.cancel": _cancel,
        "transfer.accept": _accept,
        "transfer.decline": _decline,
    }[name]
    await handler(ctx, domain, payload)


async def _create(ctx: Any, domain: Any, payload: dict[str, Any]) -> None:
    domain.confirmed(payload)
    account_id = str(payload.get("account_id") or "")
    to_member_id = str(payload.get("to_member_id") or "")
    note = str(payload.get("note") or "")[:500]
    if not to_member_id:
        _fail("transfer_target_required")
    doc = await ctx.read()
    account = domain.find(doc, "accounts", account_id)
    if frozen(account):
        _fail("transfer_already_open", 409)
    if any(
        run.get("account_id") == account_id
        and run.get("status") in domain.ACTIVE | domain.UNCERTAIN | BUSY_RUNS
        for run in _rows(doc, "runs")
    ) or any(
        r.get("account_id") == account_id and r.get("status") in {"sending", "auto_queued"}
        for r in _rows(doc, "reply_items")
    ):
        _fail("account_busy", 409)
    package = await build_package(ctx, doc, account)
    result = await ctx.enterprise(
        "POST",
        "transfers",
        {
            "account_id": account_id,
            "account_name": account.get("name", account_id),
            "platform_account_id": account.get("platform_account_id", ""),
            "to_member_id": to_member_id,
            "note": note,
            "summary": package["summary"],
            "package": package,
        },
    )
    item = next(
        (
            i
            for i in result.get("items", [])
            if i.get("account_id") == account_id and i.get("status") in OPEN
        ),
        None,
    )
    if item is None:
        _fail("enterprise_response_invalid", 502)
    assert item is not None

    def freeze(state: dict[str, Any]) -> None:
        current = domain.find(state, "accounts", account_id)
        current["transfer"] = {
            "id": item["id"],
            "status": item["status"],
            "to_member_id": item.get("to_member_id", to_member_id),
            "to_member_name": item.get("to_member_name", ""),
            "note": note,
            "created_at": item.get("created_at", _now()),
        }
        current["updated_at"] = _now()
        _store_cache(state, result)

    await ctx.update(freeze)
    await ctx.audit("transfer.create", account_id)


async def _cancel(ctx: Any, domain: Any, payload: dict[str, Any]) -> None:
    transfer_id = str(payload.get("transfer_id") or "")
    result = await ctx.enterprise(
        "POST", "transfer-actions", {"transfer_id": transfer_id, "action": "cancel"}
    )
    await ctx.update(lambda state: _apply_outgoing(ctx, domain, state, [result["transfer"]]))
    await _sync(ctx, domain, {})


async def _decline(ctx: Any, domain: Any, payload: dict[str, Any]) -> None:
    await ctx.enterprise(
        "POST",
        "transfer-actions",
        {
            "transfer_id": str(payload.get("transfer_id") or ""),
            "action": "decline",
            "note": str(payload.get("note") or "")[:500],
        },
    )
    await _sync(ctx, domain, {})


async def _accept(ctx: Any, domain: Any, payload: dict[str, Any]) -> None:
    domain.confirmed(payload)
    transfer_id = str(payload.get("transfer_id") or "")
    project_id = str(payload.get("project_id") or "")
    doc = await ctx.read()
    if project_id:
        domain.find(doc, "projects", project_id)
    already = next(
        (
            a
            for a in _rows(doc, "accounts")
            if (a.get("transferred_in") or {}).get("transfer_id") == transfer_id
        ),
        None,
    )
    if already is None:
        result = await ctx.enterprise(
            "POST", "transfer-actions", {"transfer_id": transfer_id, "action": "accept"}
        )
        package = result.get("package")
        if not isinstance(package, dict) or package.get("format") != FORMAT:
            _fail("transfer_package_invalid", 422)
        await _import(ctx, domain, result["transfer"], package, project_id)
    # Completion is confirmed only after the import is saved; a repeat finishes a lost confirmation.
    await ctx.enterprise(
        "POST", "transfer-actions", {"transfer_id": transfer_id, "action": "complete"}
    )
    await _sync(ctx, domain, {})
    await ctx.audit("transfer.accept", transfer_id)


def _fresh_id(taken: set[str], value: str) -> str:
    new = value if value and value not in taken else uuid4().hex
    taken.add(new)
    return new


async def _import(
    ctx: Any,
    domain: Any,
    transfer: dict[str, Any],
    package: dict[str, Any],
    project_id: str,
) -> None:
    saved: dict[str, dict[str, Any]] = {}
    for old_id, asset in (package.get("assets") or {}).items():
        saved[old_id] = await ctx.save_asset(str(asset["data_base64"]), str(asset["mime_type"]))

    def relink(value: Any) -> Any:
        if isinstance(value, dict):
            out = {k: relink(v) for k, v in value.items()}
            meta = saved.get(str(value.get("asset_id") or ""))
            if meta and value.get("mime_type"):
                out.update(
                    asset_id=meta["asset_id"],
                    asset_url=f"/api/plugin-apps/{ctx.plugin_id}/assets/{meta['asset_id']}",
                    **{k: meta[k] for k in ("sha256", "size") if k in meta},
                )
            return out
        if isinstance(value, list):
            return [relink(v) for v in value]
        return value

    body = relink(package)
    raw_account = dict(body["account"])
    at = _now()
    current = await ctx.read()
    taken = {str(a.get("id")) for a in _rows(current, "accounts")}
    account_id = _fresh_id(taken, str(raw_account.get("id") or ""))

    def place(state: dict[str, Any]) -> None:
        ids = {
            key: {str(r.get("id")) for r in _rows(state, key)}
            for key in (
                "accounts",
                "projects",
                "drafts",
                "content_tasks",
                "materials",
                "authorizations",
                "reply_items",
                "leads",
            )
        }
        if account_id in ids["accounts"]:
            _fail("version_conflict", 409)
        if project_id:
            target_project = domain.find(state, "projects", project_id)["id"]
        else:
            project = dict(body.get("project") or {})
            if not project:
                _fail("project_required", 409)
            project.update(
                id=_fresh_id(ids["projects"], str(project.get("id") or "")),
                version=1,
                created_at=at,
                updated_at=at,
            )
            project.pop("schedule", None)
            _rows(state, "projects").append(project)
            target_project = project["id"]
        account = {
            **raw_account,
            **BINDING_RESET,
            "id": account_id,
            "project_id": target_project,
            "version": 1,
            "created_at": at,
            "updated_at": at,
            "history_before_transfer": body.get("history") or [],
            "transferred_in": {
                "transfer_id": transfer.get("id"),
                "from_member_name": transfer.get("from_member_name", ""),
                "at": at,
            },
        }
        account.pop("transfer", None)
        _rows(state, "accounts").append(account)
        consent_map: dict[str, str] = {}
        for row in body.get("authorizations") or []:
            new_id = _fresh_id(ids["authorizations"], str(row.get("id") or ""))
            consent_map[str(row.get("id"))] = new_id
            _rows(state, "authorizations").append(
                {**row, "id": new_id, "version": 1, "account_ids": [account_id]}
            )
        material_map: dict[str, str] = {}
        for row in body.get("materials") or []:
            new_id = _fresh_id(ids["materials"], str(row.get("id") or ""))
            material_map[str(row.get("id"))] = new_id
            item = {**row, "id": new_id, "version": 1, "account_ids": [account_id]}
            if item.get("consent_id"):
                item["consent_id"] = consent_map.get(str(item["consent_id"]), "")
            _rows(state, "materials").append(item)
        for row in body.get("drafts") or []:
            draft = {
                **row,
                "id": _fresh_id(ids["drafts"], str(row.get("id") or "")),
                "version": 1,
                "project_id": target_project,
                "account_id": account_id,
                "material_ids": [
                    material_map[m] for m in row.get("material_ids") or [] if m in material_map
                ],
            }
            # A schedule belonged to the sender's calendar; the receiver plans it again.
            if draft.get("review_status") in {"scheduled", "approved", "paused", "failed"}:
                draft["review_status"] = "pending_review"
            draft.pop("scheduled_at", None)
            draft.pop("approved_digest", None)
            _rows(state, "drafts").append(draft)
        for key in ("content_tasks", "reply_items", "leads"):
            for row in body.get(key) or []:
                item = {**row, "id": _fresh_id(ids[key], str(row.get("id") or ""))}
                item["account_id"] = account_id
                if key == "content_tasks":
                    item["material_ids"] = [
                        material_map[m] for m in row.get("material_ids") or [] if m in material_map
                    ]
                _rows(state, key).append(item)

    # The capacity ledger counts the account against this member's licence like a new account.
    await ctx.update_account(account_id, place)


def _store_cache(state: dict[str, Any], result: dict[str, Any]) -> None:
    cache = dict(state.get("transfer_cache") or {})
    cache["items"] = [
        {k: v for k, v in item.items() if k != "package"} for item in result.get("items", [])
    ][:100]
    if "members" in result:
        cache["members"] = result["members"]
    cache["fetched_at"] = _now()
    state["transfer_cache"] = cache


def _apply_outgoing(
    ctx: Any, domain: Any, state: dict[str, Any], items: list[dict[str, Any]]
) -> list[str]:
    """Follow the sender's frozen accounts; return the ids to remove because the transfer completed."""
    removed: list[str] = []
    by_id = {i.get("id"): i for i in items if i.get("direction", "outgoing") == "outgoing"}
    for account in list(_rows(state, "accounts")):
        mark = account.get("transfer") or {}
        item = by_id.get(mark.get("id"))
        if not mark.get("id") or item is None:
            continue
        status = item.get("status")
        if status == "completed":
            _remove_account(state, account["id"])
            removed.append(account["id"])
        elif status in RETURNED:
            account.pop("transfer", None)
            account["transfer_returned"] = {
                "status": status,
                "note": item.get("decision_note") or item.get("decline_note") or "",
                "by": item.get("decided_by") or item.get("to_member_name") or "",
                "at": item.get("updated_at") or _now(),
            }
            account["updated_at"] = _now()
        else:
            account["transfer"] = {**mark, "status": status}
    return removed


def _remove_account(state: dict[str, Any], account_id: str) -> None:
    """Drop what was handed over; published drafts and runs stay as the sender's history."""
    state["accounts"] = [a for a in _rows(state, "accounts") if a.get("id") != account_id]
    state["drafts"] = [
        d
        for d in _rows(state, "drafts")
        if d.get("account_id") != account_id or d.get("review_status") == "published"
    ]
    for key in ("content_tasks", "reply_items", "leads"):
        state[key] = [r for r in _rows(state, key) if r.get("account_id") != account_id]
    for key in ("materials", "authorizations"):
        kept = []
        for row in _rows(state, key):
            ids = row.get("account_ids") or []
            if account_id in ids:
                rest = [i for i in ids if i != account_id]
                if not rest and row.get("owner", "account") != "public":
                    continue
                row = {**row, "account_ids": rest}
            kept.append(row)
        state[key] = kept


async def _sync(ctx: Any, domain: Any, payload: dict[str, Any]) -> None:
    result = await ctx.enterprise("GET", "transfers")
    removed: list[str] = []

    def apply(state: dict[str, Any]) -> None:
        _store_cache(state, result)
        removed.extend(_apply_outgoing(ctx, domain, state, result.get("items", [])))

    await ctx.update(apply)
    for account_id in removed:
        await ctx.release_capacity(account_id)
        await ctx.audit("transfer.completed", account_id)


async def tick(ctx: Any, domain: Any) -> None:
    """Refresh transfers every few minutes so a frozen account settles without opening the page."""
    if "xhs.ops" not in (getattr(ctx.license, "features", None) or []) or not getattr(
        ctx, "has_enterprise", False
    ):
        return
    doc = await ctx.read()
    fetched = (doc.get("transfer_cache") or {}).get("fetched_at")
    if fetched and datetime.now(UTC) - datetime.fromisoformat(fetched) < SYNC_EVERY:
        return
    try:
        await _sync(ctx, domain, {})
    except PluginAppError:
        return


def snapshot(doc: dict[str, Any]) -> dict[str, Any]:
    cache = doc.get("transfer_cache") or {}
    return {
        "items": cache.get("items", []),
        "members": cache.get("members", []),
        "fetched_at": cache.get("fetched_at"),
    }

"""Safe dry-run import and local audit outbox helpers."""

from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from octop.infra.plugin_apps.contracts import PluginAppError

MAX_SOURCE_BYTES = 20 * 1024 * 1024
# By suffix, not mimetypes: on Windows mimetypes also reads the registry, which may not know .webp.
IMAGE_SUFFIXES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}
COLLECTIONS = (
    "projects",
    "accounts",
    "drafts",
    "reports",
    "runs",
    "comments",
    "audits",
    "diagnoses",
    "changeOrders",
)
ACTIVE_STATUSES = {
    "queued",
    "preparing",
    "running",
    "unknown",
    "awaiting_verification",
}


def _canonical(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def _rows(source: dict[str, Any], name: str) -> list[dict[str, Any]]:
    value = source.get(name, [])
    if not isinstance(value, list):
        raise PluginAppError("migration_invalid_source")
    return [row for row in value if isinstance(row, dict)]


def _asset_fallbacks(roots: list[str] | None) -> dict[str, list[Path]]:
    """Index explicitly supplied source roots by basename for moved media."""
    index: dict[str, list[Path]] = {}
    for raw_root in roots or []:
        root = Path(str(raw_root)).expanduser()
        if root.is_file():
            index.setdefault(root.name, []).append(root)
            continue
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            if path.is_file() and path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
                index.setdefault(path.name, []).append(path)
    return index


def dry_run(source_json: str | None) -> dict[str, Any]:
    if not source_json:
        return {
            "status": "source_not_found",
            "source_sha256": None,
            "mappings": {},
            "conflicts": [{"code": "source_not_found", "message": "未发现 xhs-ops.json"}],
            "counts": {},
            "will_dispatch": False,
            "will_modify_platform": False,
        }
    encoded = source_json.encode()
    if len(encoded) > MAX_SOURCE_BYTES:
        raise PluginAppError("migration_source_too_large")
    try:
        source = json.loads(source_json)
    except json.JSONDecodeError as exc:
        raise PluginAppError("migration_invalid_source") from exc
    if not isinstance(source, dict):
        raise PluginAppError("migration_invalid_source")
    digest = hashlib.sha256(encoded).hexdigest()
    mappings: dict[str, dict[str, str]] = {}
    conflicts: list[dict[str, Any]] = []
    counts: dict[str, int] = {}
    for collection in COLLECTIONS:
        rows = _rows(source, collection)
        counts[collection] = len(rows)
        seen: set[str] = set()
        mapping: dict[str, str] = {}
        for row in rows:
            old_id = str(row.get("id") or "").strip()
            if not old_id:
                conflicts.append({"collection": collection, "code": "missing_id"})
                continue
            if old_id in seen:
                conflicts.append(
                    {"collection": collection, "old_id": old_id, "code": "duplicate_id"}
                )
                continue
            seen.add(old_id)
            mapping[old_id] = (
                f"import_{collection}_{hashlib.sha256((collection + ':' + old_id).encode()).hexdigest()[:16]}"
            )
            if row.get("status") in ACTIVE_STATUSES:
                conflicts.append(
                    {
                        "collection": collection,
                        "old_id": old_id,
                        "code": "active_run_becomes_unknown",
                    }
                )
            if collection == "accounts" and row.get("deviceId"):
                conflicts.append(
                    {
                        "collection": collection,
                        "old_id": old_id,
                        "code": "device_rebind_required",
                    }
                )
        mappings[collection] = mapping
    return {
        "status": "dry_run" if not conflicts else "dry_run_with_conflicts",
        "source_sha256": digest,
        "source_bytes": len(encoded),
        "mappings": mappings,
        "counts": counts,
        "conflicts": conflicts,
        "will_dispatch": False,
        "will_modify_platform": False,
    }


def _mapped_id(report: dict[str, Any], collection: str, source_id: Any) -> str:
    value = str(source_id or "").strip()
    mapping = report.get("mappings", {}).get(collection, {})
    mapped = mapping.get(value)
    if not mapped:
        raise PluginAppError("migration_reference_missing")
    return str(mapped)


def _convert_project(row: dict[str, Any], target_id: str, timestamp: str) -> dict[str, Any]:
    return {
        "id": target_id,
        "version": 1,
        "name": str(row.get("name") or "导入项目")[:80],
        "business": row.get("business") or {},
        "audience": row.get("audience") or {},
        "ops_notes": row.get("opsNotes") or row.get("ops_notes") or {},
        "profile": row.get("profile"),
        "persona_count": int(row.get("personaCount") or 10),
        "migration": {"source_id": str(row.get("id")), "source_updated_at": row.get("updatedAt")},
        "created_at": row.get("createdAt") or timestamp,
        "updated_at": row.get("updatedAt") or timestamp,
    }


def _convert_account(
    row: dict[str, Any],
    target_id: str,
    project_id: str,
    timestamp: str,
    profile_draft: dict[str, Any] | None = None,
) -> dict[str, Any]:
    device_id = str(row.get("deviceId") or "")
    return {
        "id": target_id,
        "version": 1,
        "project_id": project_id,
        "name": str(row.get("label") or row.get("name") or "导入账号")[:80],
        "device_id": "",
        "entry_mode": row.get("entryMode")
        if row.get("entryMode") in {"new", "existing"}
        else "existing",
        "platform_account_id": str(row.get("platformAccountId") or ""),
        "positioning": row.get("positioning") or "",
        "persona": row.get("persona") or {},
        "persona_tags": row.get("personaTags") or {},
        "profile_draft": profile_draft if profile_draft is not None else row.get("profileDraft"),
        "interest_pool": row.get("interestPool") or {},
        "operation_settings": {
            "browse_defaults": row.get("browseDefaults") or {},
            "interaction": row.get("interaction") or {},
        },
        "migration": {
            "source_id": str(row.get("id")),
            "source_device_id": device_id or None,
            "device_rebind_required": bool(device_id),
        },
        "created_at": row.get("createdAt") or timestamp,
        "updated_at": row.get("updatedAt") or timestamp,
    }


def _convert_run(
    row: dict[str, Any],
    target_id: str,
    account_id: str,
    timestamp: str,
    evidence: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    source_status = str(row.get("status") or "unknown")
    legacy_chunks = []
    for index, chunk in enumerate(row.get("chunks") or []):
        if not isinstance(chunk, dict):
            continue
        item = {
            "index": index,
            "status": str(chunk.get("status") or "unknown"),
            "mode": str(chunk.get("mode") or ""),
            "keyword": str(chunk.get("keyword") or ""),
            "browsed": int(chunk.get("browsed") or 0),
            "skipped": int(chunk.get("skipped") or 0),
        }
        if evidence and index < len(evidence) and evidence[index].get("evidence_url"):
            item["evidence_url"] = evidence[index]["evidence_url"]
        legacy_chunks.append(item)
    return {
        "id": target_id,
        "task_id": f"imported_{target_id}",
        "runtime_id": "migration",
        "account_id": account_id,
        "device_id": "",
        "draft_id": "",
        "kind": "browse",
        "status": "unknown",
        "idempotency_key": f"migration:{target_id}",
        "operation_key": f"migration:{target_id}",
        "operation_key_version": 2,
        "created_at": row.get("createdAt") or timestamp,
        "updated_at": row.get("updatedAt") or timestamp,
        "payload": {
            "migration_source_status": source_status,
            "legacy": row,
            "legacy_chunks": legacy_chunks,
        },
        "migration": {"source_id": str(row.get("id")), "source_status": source_status},
        "error": "imported_history_requires_reconciliation",
    }


def _convert_comment(
    row: dict[str, Any], target_id: str, account_id: str, timestamp: str
) -> dict[str, Any]:
    status = str(row.get("status") or "pending")
    if status not in {"pending", "approved", "rejected", "expired"}:
        status = "pending"
    return {
        "id": target_id,
        "version": 1,
        "project_id": "",
        "account_id": account_id,
        "post": row.get("post") if isinstance(row.get("post"), dict) else {},
        "post_url": str(row.get("postUrl") or row.get("post_url") or ""),
        "target_key": "",
        "candidates": row.get("candidates") if isinstance(row.get("candidates"), list) else [],
        "text": str(row.get("text") or ""),
        "status": status,
        "review_note": str(row.get("reviewNote") or "")[:200],
        "created_at": row.get("createdAt") or timestamp,
        "updated_at": row.get("updatedAt") or timestamp,
        "migration": {
            "source_id": str(row.get("id")),
            "source_status": str(row.get("status") or "pending"),
        },
    }


def import_source(
    state: dict[str, Any],
    source_json: str | None,
    *,
    expected_sha256: str,
    timestamp: str,
    asset_overrides: dict[str, dict[str, Any]] | None = None,
    evidence_overrides: dict[str, list[dict[str, Any]]] | None = None,
) -> dict[str, Any]:
    report = dry_run(source_json)
    if report.get("status") == "source_not_found":
        raise PluginAppError("migration_source_not_found")
    if report.get("source_sha256") != expected_sha256:
        raise PluginAppError("migration_source_changed", status=409)
    if any(
        item.get("source_sha256") == expected_sha256 and item.get("status") == "imported"
        for item in state.setdefault("migration_imports", [])
    ):
        raise PluginAppError("migration_already_imported", status=409)
    source = json.loads(source_json or "{}")
    projects = {row["id"]: row for row in _rows(source, "projects") if row.get("id")}
    accounts = {row["id"]: row for row in _rows(source, "accounts") if row.get("id")}
    project_map = report["mappings"]["projects"]
    account_map = report["mappings"]["accounts"]
    run_map = report["mappings"]["runs"]
    comment_map = report["mappings"]["comments"]
    evidence_overrides = evidence_overrides or {}
    for old_id, row in projects.items():
        state.setdefault("projects", []).append(
            _convert_project(row, project_map[old_id], timestamp)
        )
    asset_overrides = asset_overrides or {}
    for old_id, row in accounts.items():
        old_project = str(row.get("projectId") or "")
        if old_project not in project_map:
            raise PluginAppError("migration_reference_missing")
        state.setdefault("accounts", []).append(
            _convert_account(
                row,
                account_map[old_id],
                project_map[old_project],
                timestamp,
                asset_overrides.get(old_id),
            )
        )
    for row in _rows(source, "runs"):
        old_id = str(row.get("id") or "")
        old_account = str(row.get("accountId") or "")
        if old_id not in run_map or old_account not in account_map:
            continue
        state.setdefault("runs", []).append(
            _convert_run(
                row,
                run_map[old_id],
                account_map[old_account],
                timestamp,
                evidence_overrides.get(old_id),
            )
        )
    for row in _rows(source, "comments"):
        old_id = str(row.get("id") or "")
        old_account = str(row.get("accountId") or "")
        if old_id not in comment_map or old_account not in account_map:
            continue
        item = _convert_comment(row, comment_map[old_id], account_map[old_account], timestamp)
        account = next(
            (value for value in state["accounts"] if value["id"] == account_map[old_account]), None
        )
        item["project_id"] = account.get("project_id", "") if account else ""
        state.setdefault("comments", []).append(item)
    asset_report = {
        "accounts_with_profile_drafts": len(asset_overrides),
        "assets_imported": sum(
            int(
                item.get("assets_imported", (item.get("migration") or {}).get("assets_imported", 0))
            )
            for item in asset_overrides.values()
        ),
        "assets_missing": sum(
            int(item.get("assets_missing", (item.get("migration") or {}).get("assets_missing", 0)))
            for item in asset_overrides.values()
        ),
        "missing_paths": [
            path
            for item in asset_overrides.values()
            for path in item.get(
                "missing_paths", (item.get("migration") or {}).get("missing_paths", [])
            )
        ][:100],
    }
    if evidence_overrides:
        asset_report.update(
            {
                "run_evidence_imported": sum(
                    1
                    for entries in evidence_overrides.values()
                    for item in entries
                    if item.get("evidence_url")
                ),
                "run_evidence_missing": sum(
                    1
                    for entries in evidence_overrides.values()
                    for item in entries
                    if item.get("missing_path")
                ),
            }
        )
    imported = {
        "id": uuid4().hex,
        "created_at": timestamp,
        "status": "imported",
        "source_sha256": expected_sha256,
        "counts": report["counts"],
        "mappings": report["mappings"],
        "conflicts": report["conflicts"],
        "will_dispatch": False,
        "will_modify_platform": False,
        "reconciliation_required": True,
        "asset_report": asset_report,
    }
    state.setdefault("migration_imports", []).append(imported)
    return imported


async def prepare_profile_assets(
    ctx: Any, source_json: str, *, asset_roots: list[str] | None = None
) -> dict[str, dict[str, Any]]:
    """Copy source profile images into host-private assets when still available.

    The source state stores absolute paths.  Missing paths remain in a report,
    never become executable URLs, and never block importing the text fields.
    """
    source = json.loads(source_json)
    fallbacks = _asset_fallbacks(asset_roots)
    overrides: dict[str, dict[str, Any]] = {}
    for row in _rows(source, "accounts"):
        profile = row.get("profileDraft")
        if not isinstance(profile, dict):
            continue
        imported = 0
        missing = 0
        missing_paths: list[str] = []
        candidates: dict[str, list[dict[str, Any]]] = {}
        for source_key, target_key in (
            ("avatarCandidates", "avatar_candidates"),
            ("coverCandidates", "cover_candidates"),
        ):
            values: list[dict[str, Any]] = []
            for raw in profile.get(source_key, []):
                path = Path(str(raw))
                if not path.is_file():
                    matches = fallbacks.get(path.name, [])
                    if len(matches) == 1:
                        path = matches[0]
                if not path.is_file() or path.stat().st_size > 5 * 1024 * 1024:
                    missing += 1
                    missing_paths.append(str(path))
                    continue
                mime_type = IMAGE_SUFFIXES.get(path.suffix.lower())
                if mime_type is None:
                    missing += 1
                    missing_paths.append(str(path))
                    continue
                data = path.read_bytes()
                encoded = base64.b64encode(data).decode("ascii")
                metadata = await ctx.save_asset(encoded, mime_type)
                values.append(
                    {
                        "filename": path.name,
                        "display_name": path.name,
                        "mime_type": mime_type,
                        **metadata,
                        "content_digest": hashlib.sha256(encoded.encode()).hexdigest(),
                    }
                )
                imported += 1
            candidates[target_key] = values
        overrides[str(row.get("id"))] = {
            "nickname": str(profile.get("nickname") or ""),
            "bio": str(profile.get("bio") or ""),
            "occupation": str(profile.get("occupation") or ""),
            "gender": str(profile.get("gender") or ""),
            "birthday": str(profile.get("birthday") or ""),
            "region": str(profile.get("region") or ""),
            "interest_tags": list(profile.get("interestTags") or []),
            **candidates,
            "generated_at": profile.get("generatedAt"),
            "applied_at": profile.get("appliedAt"),
            "apply_status": profile.get("applyStatus"),
            "apply_result": profile.get("applyResult"),
            "migration": {
                "assets_imported": imported,
                "assets_missing": missing,
                "missing_paths": missing_paths[:20],
            },
        }
    return overrides


async def prepare_run_evidence(
    ctx: Any, source_json: str, *, asset_roots: list[str] | None = None
) -> dict[str, Any]:
    """Recover legacy run screenshots as private evidence records.

    Run screenshots live under the source's temporary state directory rather
    than inside the profile draft.  They are copied only through the host's
    evidence store; source paths are never returned as executable URLs.
    """
    source = json.loads(source_json)
    fallbacks = _asset_fallbacks(asset_roots)
    report = dry_run(source_json)
    runs: dict[str, list[dict[str, Any]]] = {}
    imported = 0
    missing = 0
    missing_paths: list[str] = []
    for row in _rows(source, "runs"):
        old_id = str(row.get("id") or "")
        target_id = report.get("mappings", {}).get("runs", {}).get(old_id)
        if not target_id:
            continue
        entries: list[dict[str, Any]] = []
        for index, chunk in enumerate(row.get("chunks") or []):
            if not isinstance(chunk, dict):
                entries.append({})
                continue
            raw = chunk.get("finalScreenshot")
            if not raw:
                entries.append({})
                continue
            path = Path(str(raw))
            if not path.is_file():
                matches = fallbacks.get(path.name, [])
                if len(matches) == 1:
                    path = matches[0]
            if not path.is_file() or path.stat().st_size > 5 * 1024 * 1024:
                missing += 1
                missing_paths.append(str(path))
                entries.append({"missing_path": str(path)})
                continue
            mime_type = IMAGE_SUFFIXES.get(path.suffix.lower())
            if mime_type is None:
                missing += 1
                missing_paths.append(str(path))
                entries.append({"missing_path": str(path)})
                continue
            evidence_id = f"{target_id}_legacy_chunk_{index}"
            evidence_url = await ctx.save_evidence(evidence_id, path.read_bytes())
            entries.append({"evidence_url": evidence_url, "filename": path.name})
            imported += 1
        runs[old_id] = entries
    return {
        "runs": runs,
        "assets_imported": imported,
        "assets_missing": missing,
        "missing_paths": missing_paths[:100],
    }


def enqueue(state: dict[str, Any], domain: Any, action: str, payload: dict[str, Any]) -> None:
    target = str(
        next(
            (
                payload.get(key)
                for key in (
                    "id",
                    "account_id",
                    "run_id",
                    "project_id",
                    "draft_id",
                    "comment_id",
                    "order_id",
                    "batch_id",
                    "diagnosis_id",
                    "audit_id",
                    "device_id",
                )
                if payload.get(key)
            ),
            action,
        )
    )
    payload_digest = domain.digest({"action": action, "target": target, "payload": payload})
    event_id = domain.digest([action, target, payload_digest, state.get("version", 0)])
    rows = state.setdefault("audit_outbox", [])
    if any(row.get("event_id") == event_id for row in rows):
        return
    rows.append(
        {
            "id": uuid4().hex,
            "plugin_id": "xhs-ops",
            "event_id": event_id,
            "action": action,
            "target": target,
            "payload_digest": payload_digest,
            "status": "pending",
            "attempts": 0,
            "last_error": None,
            "created_at": domain.now(),
            "updated_at": domain.now(),
        }
    )

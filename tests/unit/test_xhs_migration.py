from __future__ import annotations

import json
from pathlib import Path

import pytest

from tests.unit.test_xhs_app_domain import FakeContext, base_doc, domain


def test_dry_run_without_source_is_explicitly_not_found() -> None:
    report = domain.migration.dry_run(None)
    assert report["status"] == "source_not_found"
    assert report["will_dispatch"] is False
    assert report["conflicts"][0]["code"] == "source_not_found"


def test_dry_run_maps_ids_and_marks_active_runs_without_executing() -> None:
    source = {
        "projects": [{"id": "p-old", "name": "Project"}],
        "accounts": [{"id": "a-old", "platform_account_id": "PRIVATE"}],
        "drafts": [{"id": "d-old", "project_id": "p-old"}],
        "reports": [{"id": "report-old"}],
        "runs": [{"id": "run-old", "status": "running"}],
    }
    report = domain.migration.dry_run(json.dumps(source, ensure_ascii=False))
    assert report["status"] == "dry_run_with_conflicts"
    assert report["mappings"]["projects"]["p-old"].startswith("import_projects_")
    assert {item["code"] for item in report["conflicts"]} == {"active_run_becomes_unknown"}
    assert report["will_dispatch"] is False and report["will_modify_platform"] is False
    assert "PRIVATE" not in json.dumps(report)


def test_dry_run_rejects_oversized_or_invalid_source() -> None:
    with pytest.raises(domain.PluginAppError, match="migration_source_too_large"):
        domain.migration.dry_run("x" * (domain.migration.MAX_SOURCE_BYTES + 1))
    with pytest.raises(domain.PluginAppError, match="migration_invalid_source"):
        domain.migration.dry_run("[]")


@pytest.mark.asyncio
async def test_successful_commands_enqueue_deduplicated_redacted_outbox_events() -> None:
    ctx = FakeContext(base_doc())
    await domain.command(
        ctx,
        "project.save",
        {
            "id": "p1",
            "version": 1,
            "name": "Updated",
            "business": {},
            "audience": {},
            "ops_notes": {},
        },
    )
    events = ctx.doc["audit_outbox"]
    assert len(events) == 1
    event = events[0]
    assert event["action"] == "project.save"
    assert event["status"] == "pending"
    assert "Updated" not in json.dumps(event)
    await domain.command(ctx, "sync.outbox.list", {})
    assert len(ctx.doc["audit_outbox"]) == 1


@pytest.mark.asyncio
async def test_migration_dry_run_is_persisted_without_creating_jobs_or_phone_calls() -> None:
    ctx = FakeContext(base_doc())
    source = json.dumps(
        {"projects": [{"id": "p1"}], "accounts": [], "drafts": [], "reports": [], "runs": []}
    )
    await domain.command(ctx, "migration.dry_run", {"source_json": source})
    assert ctx.doc["migration_imports"][0]["status"] == "dry_run"
    assert ctx.spawned == [] and ctx.phone_calls == []
    assert ctx.doc["audit_outbox"][-1]["action"] == "migration.dry_run"


@pytest.mark.asyncio
async def test_migration_imports_comments_and_marks_legacy_runs_unknown() -> None:
    ctx = FakeContext(base_doc())
    source = json.dumps(
        {
            "schemaVersion": 1,
            "projects": [
                {"id": "p-old", "name": "旧项目", "createdAt": "2026-01-01T00:00:00+00:00"}
            ],
            "accounts": [
                {
                    "id": "a-old",
                    "projectId": "p-old",
                    "entryMode": "existing",
                    "label": "旧账号",
                    "platformAccountId": "acct-old",
                    "deviceId": "phone-old",
                }
            ],
            "runs": [{"id": "run-old", "accountId": "a-old", "status": "completed"}],
            "comments": [
                {
                    "id": "comment-old",
                    "accountId": "a-old",
                    "post": {"title": "旧笔记", "author": "作者"},
                    "candidates": ["好看"],
                    "status": "pending",
                }
            ],
            "audits": [],
            "diagnoses": [],
            "changeOrders": [],
        },
        ensure_ascii=False,
    )
    report = domain.migration.dry_run(source)
    await domain.command(
        ctx,
        "migration.import",
        {"source_json": source, "source_sha256": report["source_sha256"], "confirmed": True},
    )
    imported = ctx.doc["migration_imports"][-1]
    assert imported["status"] == "imported"
    assert any(
        item.get("migration", {}).get("source_id") == "comment-old" for item in ctx.doc["comments"]
    )
    run = next(
        item for item in ctx.doc["runs"] if item.get("migration", {}).get("source_id") == "run-old"
    )
    assert run["status"] == "unknown"
    account = next(
        item
        for item in ctx.doc["accounts"]
        if item.get("migration", {}).get("source_id") == "a-old"
    )
    assert account["device_id"] == ""
    assert account["migration"]["device_rebind_required"] is True
    assert ctx.spawned == [] and ctx.phone_calls == []


@pytest.mark.asyncio
async def test_prepare_profile_assets_reports_missing_paths_and_imports_available_files(
    tmp_path: Path,
) -> None:
    image = tmp_path / "avatar.png"
    image.write_bytes(b"\x89PNG\r\n\x1a\nasset")
    source = json.dumps(
        {
            "accounts": [
                {
                    "id": "a-old",
                    "profileDraft": {
                        "avatarCandidates": [str(image), str(tmp_path / "gone.png")],
                        "coverCandidates": [],
                    },
                }
            ]
        },
        ensure_ascii=False,
    )
    ctx = FakeContext(base_doc())
    overrides = await domain.migration.prepare_profile_assets(ctx, source)
    profile = overrides["a-old"]
    assert profile["migration"]["assets_imported"] == 1
    assert profile["migration"]["assets_missing"] == 1
    assert profile["migration"]["missing_paths"] == [str(tmp_path / "gone.png")]
    assert profile["avatar_candidates"][0]["asset_id"]
    assert not profile["avatar_candidates"][0].get("data_base64")


@pytest.mark.asyncio
async def test_prepare_profile_assets_resolves_moved_source_files_by_unique_basename(
    tmp_path: Path,
) -> None:
    moved = tmp_path / "recovered" / "avatar.png"
    moved.parent.mkdir()
    moved.write_bytes(b"\x89PNG\r\n\x1a\nrecovered")
    source = json.dumps(
        {
            "accounts": [
                {
                    "id": "a-old",
                    "profileDraft": {
                        "avatarCandidates": ["/old/tabby/media/avatar.png"],
                        "coverCandidates": [],
                    },
                }
            ]
        },
        ensure_ascii=False,
    )
    profile = (
        await domain.migration.prepare_profile_assets(
            FakeContext(base_doc()), source, asset_roots=[str(tmp_path)]
        )
    )["a-old"]
    assert profile["migration"]["assets_imported"] == 1
    assert profile["migration"]["assets_missing"] == 0
    assert profile["avatar_candidates"][0]["asset_id"]


@pytest.mark.asyncio
async def test_prepare_profile_assets_keeps_ambiguous_basename_missing(tmp_path: Path) -> None:
    for directory in (tmp_path / "one", tmp_path / "two"):
        directory.mkdir()
        (directory / "avatar.png").write_bytes(b"\x89PNG\r\n\x1a\nasset")
    source = json.dumps(
        {
            "accounts": [
                {
                    "id": "a-old",
                    "profileDraft": {
                        "avatarCandidates": ["/old/tabby/media/avatar.png"],
                        "coverCandidates": [],
                    },
                }
            ]
        },
        ensure_ascii=False,
    )
    profile = (
        await domain.migration.prepare_profile_assets(
            FakeContext(base_doc()), source, asset_roots=[str(tmp_path)]
        )
    )["a-old"]
    assert profile["migration"]["assets_imported"] == 0
    assert profile["migration"]["assets_missing"] == 1


@pytest.mark.asyncio
async def test_prepare_run_evidence_recovers_chunk_screenshots_and_imports_urls(
    tmp_path: Path,
) -> None:
    screenshot = tmp_path / "legacy.webp"
    screenshot.write_bytes(b"RIFFlegacy-webp")
    source = json.dumps(
        {
            "projects": [{"id": "p-old"}],
            "accounts": [{"id": "a-old", "projectId": "p-old"}],
            "runs": [
                {
                    "id": "run-old",
                    "accountId": "a-old",
                    "status": "completed",
                    "chunks": [{"status": "completed", "finalScreenshot": str(screenshot)}],
                }
            ],
        },
        ensure_ascii=False,
    )
    ctx = FakeContext(base_doc())
    evidence = await domain.migration.prepare_run_evidence(ctx, source)
    assert evidence["assets_imported"] == 1
    report = domain.migration.dry_run(source)
    imported = domain.migration.import_source(
        ctx.doc,
        source,
        expected_sha256=report["source_sha256"],
        timestamp="2026-11-07T00:00:00+00:00",
        evidence_overrides=evidence["runs"],
    )
    run = next(
        item for item in ctx.doc["runs"] if item["id"] == imported["mappings"]["runs"]["run-old"]
    )
    assert run["payload"]["legacy_chunks"][0]["evidence_url"].endswith("_legacy_chunk_0")
    assert imported["asset_report"]["run_evidence_imported"] == 1


@pytest.mark.asyncio
async def test_migration_import_persists_asset_report_counts(tmp_path: Path) -> None:
    image = tmp_path / "avatar.png"
    image.write_bytes(b"\x89PNG\r\n\x1a\nrecovered")
    source = json.dumps(
        {
            "projects": [{"id": "p-old", "name": "旧项目"}],
            "accounts": [
                {
                    "id": "a-old",
                    "projectId": "p-old",
                    "profileDraft": {
                        "avatarCandidates": ["/old/tabby/media/avatar.png"],
                        "coverCandidates": [],
                    },
                }
            ],
        },
        ensure_ascii=False,
    )
    ctx = FakeContext(base_doc())
    report = domain.migration.dry_run(source)
    await domain.command(
        ctx,
        "migration.import",
        {
            "source_json": source,
            "source_sha256": report["source_sha256"],
            "asset_roots": [str(tmp_path)],
            "confirmed": True,
        },
    )
    assert ctx.doc["migration_imports"][-1]["asset_report"] == {
        "accounts_with_profile_drafts": 1,
        "assets_imported": 1,
        "assets_missing": 0,
        "missing_paths": [],
    }

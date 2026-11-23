"""One isolated HTTP acceptance flow for the migrated XHS paid app."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any

from octop.infra.plugin_apps.host import AppContext
from tests.integration.test_plugin_apps import paid_app as imported_paid_app

paid_app = imported_paid_app


async def test_xhs_migration_commands_import_source_history(paid_app: Any) -> None:
    """Exercise the real HTTP dry-run/import command boundary for X6."""
    client, _server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.ops", "xhs.comment"])
    source = {
        "projects": [{"id": "source-project", "name": "来源项目"}],
        "accounts": [
            {
                "id": "source-account",
                "projectId": "source-project",
                "label": "来源账号",
                "entryMode": "existing",
                "deviceId": "old-device",
            }
        ],
        "drafts": [],
        "reports": [],
        "runs": [
            {
                "id": "source-run",
                "accountId": "source-account",
                "status": "running",
                "chunks": [{"status": "running", "mode": "search", "browsed": 1}],
            }
        ],
        "comments": [
            {
                "id": "source-comment",
                "accountId": "source-account",
                "status": "approved",
                "text": "来源评论",
            }
        ],
        "audits": [],
        "diagnoses": [],
        "changeOrders": [],
    }
    source_json = json.dumps(source, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    source_sha256 = hashlib.sha256(source_json.encode()).hexdigest()
    endpoint = "/api/plugin-apps/xhs-ops/commands"

    dry_run = await client.post(
        endpoint,
        headers=auth,
        json={"command": "migration.dry_run", "payload": {"source_json": source_json}},
    )
    assert dry_run.status_code == 200, dry_run.text
    report = dry_run.json()["data"]["migration_imports"][-1]
    assert report["status"] == "dry_run_with_conflicts"
    assert report["source_sha256"] == source_sha256
    assert report["counts"] == {
        "projects": 1,
        "accounts": 1,
        "drafts": 0,
        "reports": 0,
        "runs": 1,
        "comments": 1,
        "audits": 0,
        "diagnoses": 0,
        "changeOrders": 0,
    }
    assert any(item["code"] == "device_rebind_required" for item in report["conflicts"])
    assert report["will_dispatch"] is False
    assert report["will_modify_platform"] is False

    imported = await client.post(
        endpoint,
        headers=auth,
        json={
            "command": "migration.import",
            "payload": {
                "source_json": source_json,
                "source_sha256": source_sha256,
                "confirmed": True,
            },
        },
    )
    assert imported.status_code == 200, imported.text
    snapshot = await client.get("/api/plugin-apps/xhs-ops/snapshot", headers=auth)
    assert snapshot.status_code == 200, snapshot.text
    data = snapshot.json()["data"]
    assert len(data["projects"]) == 1
    assert len(data["accounts"]) == 1
    assert data["accounts"][0]["device_id"] == ""
    assert data["runs"][0]["status"] == "unknown"
    # Historical approvals lose the current review fingerprint and must be
    # reopened before a new send; the source decision is retained for audit.
    assert data["comments"][0]["status"] == "pending"
    assert data["comments"][0]["migration"]["source_status"] == "approved"
    assert data["migration_imports"][-1]["status"] == "imported"

    duplicate = await client.post(
        endpoint,
        headers=auth,
        json={
            "command": "migration.import",
            "payload": {
                "source_json": source_json,
                "source_sha256": source_sha256,
                "confirmed": True,
            },
        },
    )
    assert duplicate.status_code == 409, duplicate.text


async def test_xhs_migration_paid_app_flow(paid_app: Any, monkeypatch: Any) -> None:
    client, server, auth, grant = paid_app
    grant.update(
        status="active",
        features=[
            "xhs.content",
            "xhs.ops",
            "xhs.publish",
            "xhs.comment",
            "xhs.takeover",
            "xhs.analytics",
        ],
    )
    endpoint = "/api/plugin-apps/xhs-ops/commands"
    xhs_module = server.plugin_apps.module("xhs-ops")
    monkeypatch.setattr(
        xhs_module.comments,
        "local_now",
        lambda *_args, **_kwargs: datetime(2026, 11, 7, 12, tzinfo=UTC),
    )

    async def command(name: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = await client.post(
            endpoint, headers=auth, json={"command": name, "payload": payload}
        )
        assert response.status_code == 200, f"{name}: {response.text}"
        return response.json()["data"]

    project_data = await command(
        "project.save",
        {
            "id": "migration-project",
            "name": "迁移验收项目",
            "business": {"industry": "服装", "product": "通勤服"},
            "audience": {"age_range": "25–34", "gender_ratio": "均衡", "regions": ["上海"]},
        },
    )
    project = project_data["projects"][0]
    profile_data = await command(
        "profile.confirm",
        {
            "project_id": project["id"],
            "version": project["version"],
            "profile": {
                "summary": "城市通勤人群",
                "base": {"age_range": "25–34", "gender_ratio": "均衡", "regions": ["上海"]},
                "vertical_interests": ["穿搭"],
                "general_interests": ["旅行"],
            },
            "confirmed": True,
        },
    )
    assert profile_data["projects"][0]["profile"]["confirmed_at"]

    account_data = await command(
        "account.save",
        {
            "id": "migration-account",
            "project_id": project["id"],
            "name": "迁移账号",
            "positioning": "城市通勤生活",
            "persona": {
                "age": "30",
                "gender": "女",
                "region": "上海",
                "occupation": "设计师",
                "life_status": "通勤",
            },
            "entry_mode": "new",
            "device_id": "",
            "platform_account_id": "",
        },
    )
    account = account_data["accounts"][0]
    await command(
        "persona.save",
        {
            "project_id": project["id"],
            "version": profile_data["projects"][0]["version"],
            "account_id": account["id"],
            "account_version": account["version"],
            "persona": {
                "label": "迁移账号",
                "positioning": "城市通勤生活",
                "persona": account["persona"],
                "persona_tags": {"vertical": ["通勤穿搭"], "general": ["旅行", "摄影"]},
                "interest_pool": {
                    "core": ["通勤"],
                    "extended": ["生活方式"],
                    "general": ["旅行"],
                },
            },
        },
    )
    ctx = await server.plugin_apps.context("xhs-ops", 1)
    state = await ctx.read()
    saved_account = next(row for row in state["accounts"] if row["id"] == "migration-account")
    await command(
        "personas.confirm",
        {
            "project_id": project["id"],
            "version": state["projects"][0]["version"],
            "accounts": [{"id": saved_account["id"], "version": saved_account["version"]}],
            "distribution_reviewed": True,
            "review_note": "已核对迁移人设分布",
        },
    )

    draft_data = await command(
        "draft.save",
        {
            "id": "migration-draft",
            "project_id": project["id"],
            "account_id": saved_account["id"],
            "title": "迁移草稿",
            "content": "迁移后的首篇内容草稿",
            "hashtags": ["通勤穿搭"],
            "images": [],
        },
    )
    assert draft_data["drafts"][0]["id"] == "migration-draft"

    # Complete only the local prerequisites needed to exercise publish planning and takeover.
    ctx = await server.plugin_apps.context("xhs-ops", 1)

    def prepare(state: dict[str, Any]) -> None:
        current = next(row for row in state["accounts"] if row["id"] == saved_account["id"])
        current.update(
            identity_confirmed_at="2026-11-07T00:00:00+00:00",
            operation_settings={"interaction": {"comment": {"enabled": True, "daily_cap": 2}}},
            authorized_at="2026-11-07T00:00:00+00:00",
            device_id="device-migration",
            platform_account_id="xhs-migration-account",
        )
        account_snapshot = server.plugin_apps.module("xhs-ops").account_identity(current)
        state["audits"] = [
            {
                "id": "migration-audit",
                "account_id": saved_account["id"],
                "verified": True,
                "status": "pending_confirmation",
                "profile": {"nickname": "旧昵称", "bio": "旧简介"},
                "account_snapshot": account_snapshot,
                "evidence": {"profile": {"nickname": "旧昵称"}},
                "created_at": "2026-11-07T00:00:00+00:00",
            }
        ]
        state["runs"] = [
            {
                "id": "migration-browse",
                "kind": "nurture",
                "status": "success",
                "account_id": saved_account["id"],
                "device_id": "device-migration",
                "date": "2026-11-07",
                "completed_at": "2026-11-07T09:00:00+00:00",
                "chunks": [
                    {
                        "mode": "search",
                        "browsed": 8,
                        "status": "completed",
                        "result_basis": "validated_phone_receipt",
                        "evidence_url": "/proof/migration-browse",
                    }
                ],
            }
        ]

    await ctx.update(prepare)
    fake_device = {
        "device_id": "device-migration",
        "policy_mode": "enforce",
        "skill_bundle_version": 66,
        "skill_sync_status": "current",
        "supported_actions": [
            "AWAKE",
            "CLICK",
            "WAIT",
            "BACK",
            "HOME",
            "SCROLL",
            "LOAD_SKILL",
            "COMPLETE",
            "ABORT",
            "INFO",
            "TYPE",
            "SLIDE",
        ],
        "supported_apps": ["com.xingin.xhs"],
    }
    monkeypatch.setattr(AppContext, "device", lambda _self, _device_id: fake_device)
    monkeypatch.setattr(AppContext, "devices", lambda _self: [fake_device])
    batch_data = await command(
        "batch.save",
        {
            "id": "migration-batch",
            "project_id": project["id"],
            "name": "迁移批次",
            "items": [
                {
                    "id": "migration-item",
                    "draft_id": "migration-draft",
                    "account_id": saved_account["id"],
                }
            ],
        },
    )
    batch = batch_data["batches"][0]
    prechecked = await command("batch.precheck", {"id": batch["id"], "version": batch["version"]})
    assert prechecked["batches"][0]["status"] == "prechecked"

    comment_data = await command(
        "comment.save",
        {
            "account_id": saved_account["id"],
            "post": {"title": "通勤穿搭", "author": "作者甲"},
            "text": "配色好清爽",
        },
    )
    comment = comment_data["comments"][0]
    current_state = await ctx.read()
    current_account = next(
        row for row in current_state["accounts"] if row["id"] == saved_account["id"]
    )
    quota = xhs_module.comments.quota(
        ctx, xhs_module, current_state, current_account, comment["id"]
    )
    assert quota["remaining"] > 0, quota
    reviewed = await command(
        "comment.review",
        {"id": comment["id"], "version": comment["version"], "decision": "approved"},
    )
    assert reviewed["comments"][0]["status"] == "approved"

    audit = await command("audit.confirm", {"id": "migration-audit", "confirmed": True})
    assert audit["audits"][0]["status"] == "confirmed"

    async def diagnosis_text(*_args: Any, **_kwargs: Any) -> str:
        return '{"summary":"稳定","findings":[],"recommendations":[],"proposals":[{"id":"p1","field":"nickname","after":"新昵称","risk":"L1"}]}'

    monkeypatch.setattr(AppContext, "generate_text", diagnosis_text)
    diagnosis = await command(
        "diagnosis.generate",
        {"account_id": saved_account["id"], "audit_id": "migration-audit"},
    )
    diagnosis_id = diagnosis["diagnoses"][0]["id"]
    await command(
        "diagnosis.decisions",
        {"id": diagnosis_id, "confirmed": True, "decisions": {"p1": {"decision": "adopt"}}},
    )
    confirmed = await command(
        "diagnosis.confirm",
        {"id": diagnosis_id, "confirmed": True},
    )
    assert confirmed["diagnoses"][0]["status"] == "confirmed"
    orders = confirmed["change_orders"]
    assert orders and orders[0]["fields"]["nickname"] == "新昵称"

    outbox_ctx = await server.plugin_apps.context("xhs-ops", 1)
    await outbox_ctx.update(
        lambda state: state["audit_outbox"].append(
            {
                "id": "migration-outbox",
                "event_id": "migration-event",
                "action": "diagnosis.confirm",
                "target": saved_account["id"],
                "payload_digest": "a" * 64,
                "status": "pending",
                "attempts": 0,
            }
        )
    )
    pushed: list[dict[str, Any]] = []

    async def fake_sync(_self: AppContext, events: list[dict[str, Any]]) -> dict[str, Any]:
        pushed.extend(events)
        return {"acked": [{"event_id": "migration-event", "status": "acked"}], "pending": 0}

    monkeypatch.setattr(AppContext, "sync_outbox", fake_sync)
    await command("sync.outbox.push", {})
    snapshot = (await client.get("/api/plugin-apps/xhs-ops/snapshot", headers=auth)).json()
    outbox = next(
        row for row in snapshot["data"]["audit_outbox"] if row["event_id"] == "migration-event"
    )
    assert outbox["status"] == "acked" and pushed[0]["plugin_id"] == "xhs-ops"

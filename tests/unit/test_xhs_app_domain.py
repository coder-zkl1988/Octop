from __future__ import annotations

import asyncio
import base64
import hashlib
import importlib.util
import json
import sys
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from typing import Any, ClassVar

import pytest


def _load() -> Any:
    path = Path(__file__).parents[2] / "src/octop/infra/agents/plugins/bundled/xhs-ops/domain.py"
    spec = importlib.util.spec_from_file_location(
        "xhs_app_domain_test", path, submodule_search_locations=[str(path.parent)]
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


domain = _load()


class FakeContext:
    assets: ClassVar[dict[str, tuple[bytes, dict[str, Any]]]] = {}

    def __init__(self, doc: dict[str, Any]) -> None:
        self.doc = deepcopy(doc)
        self.key = "test"
        self.plugin_id = "xhs-ops"
        self.execution_feature = ""
        self.user_id = 1
        self.host = SimpleNamespace(
            tasks={},
            instance_id="test-runtime",
            server=SimpleNamespace(
                services=SimpleNamespace(config=SimpleNamespace(default_timezone="UTC"))
            ),
        )
        self.license = SimpleNamespace(
            active=True, version=1, limits={"accounts": 10, "devices": 10}
        )
        self.spawned: list[Any] = []
        self.phone_calls: list[dict[str, Any]] = []
        self.media_calls: list[list[dict[str, Any]]] = []
        self.media_albums: list[str] = []
        self.receipts: list[dict[str, Any]] = []
        self.audit_events: list[tuple[str, str]] = []
        self.sync_calls: list[list[dict[str, Any]]] = []
        self.sync_error: Exception | None = None

    async def require(self, _feature: str) -> None:
        return None

    async def require_any(self, _features: list[str]) -> None:
        return None

    async def reserve_capacity(self, _account_id: str, _device_id: str) -> None:
        return None

    async def release_capacity(self, _account_id: str) -> None:
        return None

    async def read(self) -> dict[str, Any]:
        return deepcopy(self.doc)

    async def save_asset(self, encoded: str, mime_type: str) -> dict[str, Any]:
        data = base64.b64decode(encoded)
        sha = hashlib.sha256(data).hexdigest()
        extension = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}[mime_type]
        asset_id = f"{sha}.{extension}"
        metadata = {"asset_id": asset_id, "sha256": sha, "mime_type": mime_type, "size": len(data)}
        self.assets[asset_id] = (data, metadata)
        return {**metadata, "asset_url": f"/api/plugin-apps/{self.plugin_id}/assets/{asset_id}"}

    async def read_asset(self, asset_id: str) -> tuple[bytes, dict[str, Any]]:
        if asset_id not in self.assets:
            raise domain.PluginAppError("not_found", status=404)
        data, metadata = self.assets[asset_id]
        return data, dict(metadata)

    async def update(self, fn: Any) -> dict[str, Any]:
        previous = deepcopy(self.doc)
        try:
            fn(self.doc)
        except BaseException:
            self.doc = previous
            raise
        return deepcopy(self.doc)

    async def update_account(self, _account_id: str, fn: Any) -> dict[str, Any]:
        updated = deepcopy(self.doc)
        fn(updated)
        self.doc = updated
        return deepcopy(self.doc)

    def device(self, device_id: str) -> dict[str, Any]:
        return {
            "device_id": device_id,
            "online": True,
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
            "running_task_id": None,
        }

    def devices(self) -> list[dict[str, Any]]:
        return [self.device("phone-1")]

    async def generate_text(self, _system: str, _prompt: str) -> str:
        return "{}"

    async def media(
        self, _device_id: str, items: list[dict[str, Any]], *, album: str = "Tabby"
    ) -> list[dict[str, Any]]:
        self.media_calls.append(items)
        self.media_albums.append(album)
        return [{"mediaId": f"m{index}", "success": True} for index, _ in enumerate(items)]

    async def save_evidence(
        self, run_id: str, screenshot: bytes | None, *, parent_run_id: str | None = None
    ) -> str:
        return f"/api/plugin-apps/xhs-ops/evidence/{run_id}" if screenshot else ""

    async def run_phone(
        self,
        device_id: str,
        task: str,
        *,
        task_id: str,
        policy: dict[str, Any],
        max_steps: int | None = None,
        idle_timeout_s: float | None = None,
    ) -> Any:
        self.phone_calls.append(
            {"device_id": device_id, "task": task, "task_id": task_id, "policy": policy}
        )
        proof = self.receipts.pop(0)
        return SimpleNamespace(
            task_id=task_id,
            success=True,
            error_code=None,
            message=f"{domain.MARKER}{json.dumps(proof, ensure_ascii=False)}",
            final_screenshot=b"proof",
            duration_ms=60_000,
        )

    async def cancel_phone(self, _device_id: str, _task_id: str) -> Any:
        return SimpleNamespace(error_code=None)

    async def audit(self, _action: str, _target: str) -> None:
        self.audit_events.append((_action, _target))
        return None

    async def sync_outbox(self, events: list[dict[str, Any]]) -> dict[str, Any]:
        self.sync_calls.append(deepcopy(events))
        if self.sync_error is not None:
            raise self.sync_error
        return {
            "acked": [{"event_id": str(item["event_id"]), "status": "acked"} for item in events],
            "pending": 0,
        }

    def spawn(self, _key: str, coroutine: Any) -> None:
        self.spawned.append(coroutine)

    async def drain(self) -> None:
        while self.spawned:
            await self.spawned.pop(0)


def alternate_base64(encoded: str) -> str:
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    stripped = encoded.rstrip("=")
    alias = stripped[:-1] + alphabet[alphabet.index(stripped[-1]) + 1] + encoded[len(stripped) :]
    assert base64.b64decode(alias, validate=True) == base64.b64decode(encoded, validate=True)
    return alias


def base_doc() -> dict[str, Any]:
    image = base64.b64encode(b"\x89PNG\r\n\x1a\nimage").decode()
    return {
        "version": 0,
        "projects": [{"id": "p1", "version": 1, "name": "P"}],
        "accounts": [
            {
                "id": "a1",
                "version": 1,
                "project_id": "p1",
                "device_id": "phone-1",
                "platform_account_id": "secret-account",
                "entry_mode": "existing",
                "name": "A",
                "authorized_at": domain.now(),
            }
        ],
        "drafts": [
            {
                "id": "d1",
                "version": 1,
                "project_id": "p1",
                "account_id": "a1",
                "title": "old title",
                "content": "old content",
                "hashtags": ["old"],
                "images": [{"filename": "a.png", "mime_type": "image/png", "data_base64": image}],
            }
        ],
        **{key: [] for key in domain.COLLECTIONS if key not in {"projects", "accounts", "drafts"}},
    }


@pytest.mark.asyncio
async def test_account_save_accepts_source_shape_and_timestamp_cas() -> None:
    ctx = FakeContext(base_doc())
    # A fixed past stamp: on Windows two now() calls can fall in the same clock tick.
    stamp = "2026-01-01T00:00:00+00:00"
    ctx.doc["accounts"][0]["updated_at"] = stamp
    await domain.command(
        ctx,
        "account.save",
        {
            "id": "a1",
            "projectId": "p1",
            "label": "运营账号",
            "positioning": "羽毛球周末生活",
            "persona": {"occupation": "设计师"},
            "profileDraft": {"nickname": "训练日记"},
            "entryMode": "existing",
            "deviceId": "phone-1",
            "platformAccountId": "secret-account",
            "expectedUpdatedAt": stamp,
        },
    )
    account = ctx.doc["accounts"][0]
    assert account["name"] == "运营账号"
    assert account["positioning"] == "羽毛球周末生活"
    assert account["profile_draft"]["nickname"] == "训练日记"
    assert account["version"] == 2
    assert "expected_updated_at" not in account

    before = deepcopy(ctx.doc)
    with pytest.raises(domain.PluginAppError, match="version_conflict"):
        await domain.command(
            ctx,
            "account.save",
            {
                "id": "a1",
                "projectId": "p1",
                "label": "过期覆盖",
                "entryMode": "existing",
                "deviceId": "phone-1",
                "platformAccountId": "secret-account",
                "expectedUpdatedAt": stamp,
            },
        )
    assert ctx.doc == before


@pytest.mark.asyncio
async def test_project_save_accepts_expected_updated_at_without_persisting_cas_field() -> None:
    ctx = FakeContext(base_doc())
    stamp = domain.now()
    ctx.doc["projects"][0]["updated_at"] = stamp
    await domain.command(
        ctx,
        "project.save",
        {"id": "p1", "name": "新项目", "expectedUpdatedAt": stamp},
    )
    project = ctx.doc["projects"][0]
    assert project["name"] == "新项目"
    assert project["version"] == 2
    assert "expected_updated_at" not in project


@pytest.mark.asyncio
async def test_change_order_mutation_rejects_stale_expected_updated_at() -> None:
    ctx = FakeContext(base_doc())
    account = ctx.doc["accounts"][0]
    account.update(plan_confirmed=True, identity_confirmed_at=domain.now())
    await domain.command(
        ctx,
        "change_order.create",
        {"account_id": "a1", "fields": {"nickname": "新昵称"}},
    )
    order = ctx.doc["change_orders"][0]
    stale = "2026-01-01T00:00:00+00:00"
    with pytest.raises(domain.PluginAppError, match="version_conflict"):
        await domain.command(
            ctx,
            "change_order.cancel",
            {"id": order["id"], "expected_updated_at": stale, "confirmed": True},
        )
    assert order["status"] == "draft"


@pytest.mark.asyncio
async def test_publish_uses_confirmed_snapshot_after_draft_changes() -> None:
    ctx = FakeContext(base_doc())
    ctx.receipts.append(
        {"verified": True, "account_matches": True, "status": "completed", "post_id": "post1"}
    )
    await domain.command(
        ctx,
        "run.precheck",
        {"kind": "publish", "account_id": "a1", "draft_id": "d1", "confirmed": True},
    )
    confirm_digest = ctx.doc["prechecks"][-1]["digest"]
    await domain.command(
        ctx,
        "run.start",
        {
            "kind": "publish",
            "confirm_digest": confirm_digest,
            "account_id": "a1",
            "draft_id": "d1",
            "idempotency_key": "publish-1",
            "confirmed": True,
        },
    )
    ctx.doc["drafts"][0].update(title="changed", content="changed")
    await ctx.drain()
    assert ctx.doc["runs"][0]["status"] == "awaiting_verification"
    assert ctx.media_calls[0][0]["dataBase64"]
    assert ctx.media_albums[0].startswith("Tabby/xhs-")
    assert f'"album": "{ctx.media_albums[0]}"' in ctx.phone_calls[0]["task"]
    assert '"title": "old title"' in ctx.phone_calls[0]["task"]
    assert '"title": "changed"' not in ctx.phone_calls[0]["task"]


@pytest.mark.asyncio
async def test_text_only_publish_skips_media_push_and_dispatches_note() -> None:
    ctx = FakeContext(base_doc())
    ctx.doc["drafts"][0]["images"] = []
    ctx.receipts.append(
        {"verified": True, "account_matches": True, "status": "completed", "post_id": "text-post"}
    )
    await domain.command(
        ctx,
        "run.precheck",
        {"kind": "publish", "account_id": "a1", "draft_id": "d1", "confirmed": True},
    )
    await domain.command(
        ctx,
        "run.start",
        {
            "kind": "publish",
            "confirm_digest": ctx.doc["prechecks"][-1]["digest"],
            "account_id": "a1",
            "draft_id": "d1",
            "idempotency_key": "publish-text-only",
            "confirmed": True,
        },
    )
    await ctx.drain()
    assert ctx.media_calls == []
    assert ctx.doc["runs"][0]["status"] == "awaiting_verification"
    assert '"filenames": []' in ctx.phone_calls[0]["task"]
    assert '"album": ""' in ctx.phone_calls[0]["task"]


async def test_identical_image_bytes_and_old_snapshot_keys_block_a_direct_api_resend() -> None:
    ctx = FakeContext(base_doc())
    legacy = deepcopy(ctx.doc["drafts"][0])
    image = legacy["images"][0]
    image["data_base64"] = alternate_base64(image["data_base64"])
    assert domain.image_content_digest(image) == domain.image_content_digest(
        ctx.doc["drafts"][0]["images"][0]
    )
    ctx.doc["runs"].append(
        {
            "id": "old",
            "kind": "publish",
            "status": "operator_verified",
            "operation_key": "legacy-string-key",
            "operation_key_version": 2,
            "idempotency_key": "legacy-encoding-intent",
            "account_id": "a1",
            "device_id": "phone-1",
            "account_snapshot": domain.account_identity(ctx.doc["accounts"][0]),
            "draft_snapshot": legacy,
        }
    )
    await domain.command(ctx, "draft.save", {**deepcopy(ctx.doc["drafts"][0]), "version": 1})
    await domain.command(
        ctx,
        "run.precheck",
        {"kind": "publish", "account_id": "a1", "draft_id": "d1", "confirmed": True},
    )
    with pytest.raises(domain.PluginAppError, match="duplicate_operation"):
        await domain.command(
            ctx,
            "run.start",
            {
                "kind": "publish",
                "account_id": "a1",
                "draft_id": "d1",
                "idempotency_key": "fresh-encoding-intent",
                "confirm_digest": ctx.doc["prechecks"][-1]["digest"],
                "confirmed": True,
            },
        )
    assert not ctx.spawned and not ctx.phone_calls


async def test_cancelled_publish_callback_does_not_emit_a_false_completion_audit() -> None:
    ctx = FakeContext(base_doc())
    ctx.receipts.append({"verified": True, "account_matches": True, "post_id": "post1"})
    await domain.command(
        ctx,
        "run.precheck",
        {"kind": "publish", "account_id": "a1", "draft_id": "d1", "confirmed": True},
    )
    await domain.command(
        ctx,
        "run.start",
        {
            "kind": "publish",
            "account_id": "a1",
            "draft_id": "d1",
            "idempotency_key": "audit-cancel-race",
            "confirm_digest": ctx.doc["prechecks"][-1]["digest"],
            "confirmed": True,
        },
    )
    original = ctx.update

    async def cancel_before_commit(fn: Any) -> dict[str, Any]:
        if fn.__name__ == "finish":
            ctx.doc["runs"][0]["status"] = "cancelling"
        return await original(fn)

    ctx.update = cancel_before_commit  # type: ignore[method-assign]
    await ctx.drain()
    assert ctx.doc["runs"][0]["status"] == "cancelling"
    assert not any(action == "run.awaiting_verification" for action, _target in ctx.audit_events)


@pytest.mark.parametrize("failure", ["wrong_task", "runtime_error"])
async def test_runtime_failure_cannot_promote_a_claimed_publish_receipt_to_verification(
    failure: str,
) -> None:
    ctx = FakeContext(base_doc())
    ctx.receipts.append({"verified": True, "account_matches": True, "post_id": "claimed-post"})
    original = ctx.run_phone

    async def wrong_result(*args: Any, **kwargs: Any) -> Any:
        result = await original(*args, **kwargs)
        if failure == "wrong_task":
            result.task_id = "another-task"
        else:
            result.error_code = "POLICY_BLOCKED"
        return result

    ctx.run_phone = wrong_result  # type: ignore[method-assign]
    await domain.command(
        ctx,
        "run.precheck",
        {"kind": "publish", "account_id": "a1", "draft_id": "d1", "confirmed": True},
    )
    await domain.command(
        ctx,
        "run.start",
        {
            "kind": "publish",
            "account_id": "a1",
            "draft_id": "d1",
            "confirm_digest": ctx.doc["prechecks"][-1]["digest"],
            "idempotency_key": "publish-runtime-check",
            "confirmed": True,
        },
    )
    await ctx.drain()
    run = ctx.doc["runs"][0]
    assert run["status"] == "unknown"
    assert domain.batches.reserved_device_ids(ctx.doc) == {"phone-1"}
    with pytest.raises(domain.PluginAppError, match="verification_required"):
        await domain.command(
            ctx,
            "run.verify",
            {
                "run_id": run["id"],
                "evidence_url": run["evidence_url"],
                "reference": "checked",
                "confirmed": True,
            },
        )


@pytest.mark.asyncio
async def test_single_field_change_requires_explicit_operator_verification() -> None:
    doc = base_doc()
    account = doc["accounts"][0]
    account["plan_confirmed"] = True
    audit_id = "audit1"
    doc["audits"].append(
        {
            "id": audit_id,
            "account_id": "a1",
            "verified": True,
            "status": "pending_confirmation",
            "profile": {"nickname": "old", "bio": "old bio"},
            "account_snapshot": domain.account_identity(account),
            "created_at": domain.now(),
        }
    )
    ctx = FakeContext(doc)
    await domain.command(ctx, "audit.confirm", {"id": audit_id, "confirmed": True})
    await domain.command(
        ctx,
        "change_order.create",
        {"account_id": "a1", "fields": {"nickname": "new"}},
    )
    order_id = ctx.doc["change_orders"][0]["id"]
    await domain.command(ctx, "change_order.precheck", {"id": order_id})
    order = ctx.doc["change_orders"][0]
    ctx.receipts.extend(
        [
            {
                "verified": True,
                "account_matches": True,
                "status": "completed",
                "fields": {"nickname": "new"},
            },
            {
                "verified": True,
                "account_matches": True,
                "status": "completed",
                "fields": {"bio": "new bio"},
            },
        ]
    )
    await domain.command(
        ctx,
        "change_order.confirm",
        {"id": order_id, "confirm_digest": order["confirm_digest"], "confirmed": True},
    )
    await ctx.drain()
    assert len(ctx.phone_calls) == 1
    assert '"fields": {"nickname": "new"}' in ctx.phone_calls[0]["task"]
    assert ctx.doc["change_orders"][0]["status"] == "awaiting_verification"
    run = ctx.doc["runs"][0]
    await domain.command(
        ctx,
        "run.verify",
        {
            "run_id": run["id"],
            "evidence_url": run["evidence_url"],
            "confirmed": True,
            "reference": "I checked the nickname on the phone",
        },
    )
    assert ctx.doc["change_orders"][0]["status"] == "observing"
    assert [entry["field"] for entry in ctx.doc["change_orders"][0]["observations"]] == [
        "nickname",
    ]


@pytest.mark.asyncio
async def test_change_order_image_upload_is_versioned_and_resets_precheck() -> None:
    doc = base_doc()
    account = doc["accounts"][0]
    account.update(plan_confirmed=True, identity_confirmed_at=domain.now())
    ctx = FakeContext(doc)
    image = base64.b64encode(b"\x89PNG\r\n\x1a\nfirst").decode()
    await domain.command(
        ctx,
        "change_order.create",
        {
            "account_id": "a1",
            "fields": {
                "avatar": {
                    "filename": "avatar.png",
                    "mime_type": "image/png",
                    "data_base64": image,
                }
            },
        },
    )
    order = ctx.doc["change_orders"][0]
    # A fixed past stamp: on Windows two now() calls can fall in the same clock tick.
    stamp = order["updated_at"] = "2026-01-01T00:00:00+00:00"
    old_asset_id = order["fields"]["avatar"]["asset_id"]
    replacement = base64.b64encode(b"\x89PNG\r\n\x1a\nsecond").decode()
    await domain.command(
        ctx,
        "change_order.image_upload",
        {
            "id": order["id"],
            "field": "avatar",
            "expected_updated_at": stamp,
            "image": {
                "filename": "avatar.png",
                "mime_type": "image/png",
                "data_base64": replacement,
            },
            "confirmed": True,
        },
    )
    updated = ctx.doc["change_orders"][0]
    assert updated["status"] == "draft"
    assert updated["precheck"] is None
    assert updated["fields"]["avatar"]["asset_id"] != old_asset_id
    with pytest.raises(domain.PluginAppError, match="version_conflict"):
        await domain.command(
            ctx,
            "change_order.image_upload",
            {
                "id": order["id"],
                "field": "avatar",
                "expected_updated_at": stamp,
                "image": {
                    "filename": "avatar.png",
                    "mime_type": "image/png",
                    "data_base64": replacement,
                },
                "confirmed": True,
            },
        )


@pytest.mark.asyncio
async def test_change_order_image_upload_uses_source_ten_megabyte_limit() -> None:
    doc = base_doc()
    account = doc["accounts"][0]
    account.update(plan_confirmed=True, identity_confirmed_at=domain.now())
    ctx = FakeContext(doc)
    await domain.command(
        ctx,
        "change_order.create",
        {
            "account_id": "a1",
            "fields": {
                "avatar": {
                    "filename": "avatar.png",
                    "mime_type": "image/png",
                    "data_base64": base64.b64encode(b"\x89PNG\r\n\x1a\nsmall").decode(),
                }
            },
        },
    )
    order = ctx.doc["change_orders"][0]
    large = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"x" * (6 * 1024 * 1024)).decode()
    await domain.command(
        ctx,
        "change_order.image_upload",
        {
            "id": order["id"],
            "field": "avatar",
            "expected_updated_at": order["updated_at"],
            "image": {"filename": "large.png", "mime_type": "image/png", "data_base64": large},
            "confirmed": True,
        },
    )
    assert ctx.doc["change_orders"][0]["fields"]["avatar"]["size"] > 5 * 1024 * 1024


@pytest.mark.asyncio
async def test_project_delete_cascades_owned_work_but_preserves_change_orders() -> None:
    ctx = FakeContext(base_doc())
    ctx.doc["change_orders"] = [{"id": "order-1", "project_id": "p1", "account_id": "a1"}]
    await domain.command(ctx, "project.delete", {"id": "p1", "confirmed": True})
    assert ctx.doc["projects"] == []
    assert ctx.doc["accounts"] == []
    assert ctx.doc["change_orders"] == [{"id": "order-1", "project_id": "p1", "account_id": "a1"}]


@pytest.mark.asyncio
async def test_account_delete_retains_run_history_and_rejects_active_runs() -> None:
    ctx = FakeContext(base_doc())
    ctx.doc["runs"] = [
        {"id": "run-1", "account_id": "a1", "status": "completed", "kind": "publish"}
    ]
    await domain.command(ctx, "account.delete", {"id": "a1", "confirmed": True})
    assert ctx.doc["accounts"] == []
    assert ctx.doc["runs"][0]["id"] == "run-1"

    blocked = FakeContext(base_doc())
    blocked.doc["runs"] = [
        {"id": "run-2", "account_id": "a1", "status": "running", "kind": "publish"}
    ]
    with pytest.raises(domain.PluginAppError, match="account_delete_blocked"):
        await domain.command(blocked, "account.delete", {"id": "a1", "confirmed": True})


@pytest.mark.asyncio
async def test_run_create_persists_a_planned_record_without_phone_dispatch() -> None:
    ctx = FakeContext(base_doc())
    await domain.command(
        ctx,
        "run.create",
        {
            "project_id": "p1",
            "account_id": "a1",
            "date": "2026-11-07",
            "plan": {"keywords": [], "home_feed_count": 0},
        },
    )
    planned = ctx.doc["runs"][0]
    assert planned["status"] == "planned"
    assert planned["project_id"] == "p1"
    assert ctx.spawned == [] and ctx.phone_calls == []


@pytest.mark.asyncio
async def test_planned_run_start_reuses_the_planned_record() -> None:
    ctx = FakeContext(base_doc())
    ctx.doc["accounts"][0]["authorized_at"] = domain.now()
    await domain.command(
        ctx,
        "run.create",
        {
            "project_id": "p1",
            "account_id": "a1",
            "kind": "audit",
            "plan": {"observations": []},
        },
    )
    planned_id = ctx.doc["runs"][0]["id"]
    await domain.command(ctx, "run.start", {"run_id": planned_id})
    assert ctx.doc["runs"][0]["id"] == planned_id
    assert ctx.doc["runs"][0]["status"] == "queued"
    assert len(ctx.spawned) == 1


@pytest.mark.asyncio
async def test_queued_cancel_does_not_call_phone_and_failed_receipt_is_unknown() -> None:
    ctx = FakeContext(base_doc())
    ctx.receipts.append({"verified": False, "account_matches": True, "status": "unknown"})
    await domain.command(
        ctx,
        "run.precheck",
        {"kind": "publish", "account_id": "a1", "draft_id": "d1", "confirmed": True},
    )
    confirm_digest = ctx.doc["prechecks"][-1]["digest"]
    await domain.command(
        ctx,
        "run.start",
        {
            "kind": "publish",
            "confirm_digest": confirm_digest,
            "account_id": "a1",
            "draft_id": "d1",
            "idempotency_key": "cancel-1",
            "confirmed": True,
        },
    )
    run_id = ctx.doc["runs"][0]["id"]
    await domain.command(ctx, "run.cancel", {"run_id": run_id})
    assert ctx.phone_calls == []
    assert ctx.doc["runs"][0]["status"] == "cancelled"
    await ctx.drain()
    assert ctx.doc["runs"][0]["status"] == "cancelled"
    assert ctx.media_calls == [] and ctx.phone_calls == []

    await domain.command(
        ctx,
        "run.precheck",
        {"kind": "publish", "account_id": "a1", "draft_id": "d1", "confirmed": True},
    )
    confirm_digest = ctx.doc["prechecks"][-1]["digest"]
    await domain.command(
        ctx,
        "run.start",
        {
            "kind": "publish",
            "confirm_digest": confirm_digest,
            "account_id": "a1",
            "draft_id": "d1",
            "idempotency_key": "unknown-1",
            "confirmed": True,
        },
    )
    await ctx.drain()
    assert ctx.doc["runs"][1]["status"] == "unknown"


@pytest.mark.asyncio
async def test_old_consent_and_unknown_operation_cannot_be_replayed() -> None:
    ctx = FakeContext(base_doc())
    await domain.command(
        ctx,
        "run.precheck",
        {"kind": "publish", "account_id": "a1", "draft_id": "d1", "confirmed": True},
    )
    precheck = ctx.doc["prechecks"][-1]["digest"]
    ctx.doc["drafts"][0]["version"] += 1
    params = {
        "kind": "publish",
        "account_id": "a1",
        "draft_id": "d1",
        "confirmed": True,
        "idempotency_key": "old-consent",
        "confirm_digest": precheck,
    }
    with pytest.raises(domain.PluginAppError, match="run_precheck_required"):
        await domain.command(ctx, "run.start", params)
    assert ctx.phone_calls == []
    await domain.command(
        ctx,
        "run.precheck",
        {"kind": "publish", "account_id": "a1", "draft_id": "d1", "confirmed": True},
    )
    params["confirm_digest"] = ctx.doc["prechecks"][-1]["digest"]
    ctx.receipts.append({"verified": False})
    await domain.command(ctx, "run.start", params)
    await ctx.drain()
    params["idempotency_key"] = "new-key-same-operation"
    with pytest.raises(domain.PluginAppError, match="duplicate_operation"):
        await domain.command(ctx, "run.start", params)


@pytest.mark.asyncio
async def test_old_precheck_and_changed_identity_cannot_confirm() -> None:
    doc = base_doc()
    doc["accounts"][0].update(plan_confirmed=True, identity_confirmed_at=domain.now())
    audit = {
        "id": "audit-old",
        "account_id": "a1",
        "verified": True,
        "status": "confirmed",
        "confirmed_at": "2020-01-01T00:00:00+00:00",
        "profile": {"nickname": "old"},
        "account_snapshot": domain.account_identity(doc["accounts"][0]),
    }
    doc["accounts"][0]["baseline_audit_id"] = audit["id"]
    doc["audits"].append(audit)
    doc["change_orders"].append(
        {
            "id": "order-old",
            "account_id": "a1",
            "fields": {"nickname": "new"},
            "status": "draft",
        }
    )
    ctx = FakeContext(doc)
    with pytest.raises(domain.PluginAppError) as exc:
        await domain.command(ctx, "change_order.precheck", {"id": "order-old"})
    assert exc.value.reason == "audit_stale"


def test_ready_rejects_unknown_or_incomplete_phone_capabilities() -> None:
    ctx = FakeContext(base_doc())
    ctx.device = lambda _device_id: {
        "device_id": "phone-1",
        "online": True,
        "policy_mode": "enforce",
        "skill_bundle_version": 66,
        "skill_sync_status": "current",
        "supported_actions": ["CLICK"],
    }
    with pytest.raises(domain.PluginAppError) as exc:
        domain.ready(ctx, ctx.doc["accounts"][0], kind="publish")
    assert exc.value.reason == "phone_actions_unsupported"


def test_operation_key_v2_uses_account_identity_and_public_content_only() -> None:
    doc = base_doc()
    account = deepcopy(doc["accounts"][0])
    draft = deepcopy(doc["drafts"][0])
    original = domain.operation_key("publish", account, draft, {})

    account.update(name="Renamed account", version=2, device_id="phone-2")
    draft.update(id="d2", version=2, updated_at=domain.now())
    draft["images"][0]["filename"] = "resaved.png"

    assert domain.operation_key("publish", account, draft, {}) == original

    changed = deepcopy(draft)
    changed["content"] = f"{changed['content']} changed"
    assert domain.operation_key("publish", account, changed, {}) != original


@pytest.mark.asyncio
async def test_takeover_identity_read_stores_pending_result_and_requires_matching_confirm() -> None:
    ctx = FakeContext(base_doc())
    ctx.doc["accounts"][0]["authorized_at"] = domain.now()

    async def identity_phone(*_args: Any, **kwargs: Any) -> Any:
        task_id = kwargs["task_id"]
        return SimpleNamespace(
            task_id=task_id,
            success=True,
            error_code=None,
            message='IDENTITY_JSON:{"v":1,"status":"visible","accountId":"secret-account"}',
            final_screenshot=b"identity-proof",
            duration_ms=100,
        )

    ctx.run_phone = identity_phone  # type: ignore[method-assign]
    await domain.command(ctx, "takeover.identity.read", {"account_id": "a1", "confirmed": True})
    await ctx.drain()
    pending = ctx.doc["accounts"][0]["pending_identity"]
    assert pending["account_id"] == "secret-account"
    assert pending["task_id"]

    with pytest.raises(domain.PluginAppError, match="identity_mismatch"):
        await domain.command(
            ctx,
            "takeover.identity.confirm",
            {
                "account_id": "a1",
                "identity_task_id": pending["task_id"],
                "platform_account_id": "different-account",
                "account_version": ctx.doc["accounts"][0]["version"],
                "confirmed": True,
            },
        )
    await domain.command(
        ctx,
        "takeover.identity.confirm",
        {
            "account_id": "a1",
            "identity_task_id": pending["task_id"],
            "platform_account_id": "secret-account",
            "account_version": ctx.doc["accounts"][0]["version"],
            "confirmed": True,
        },
    )
    account = ctx.doc["accounts"][0]
    assert account["pending_identity"] is None
    assert account["identity_source"] == "takeover"
    assert account["identity_confirmed_at"]
    assert ctx.doc["takeover_events"][-1]["name"] == "xhs_ops_takeover_identity_locked"


@pytest.mark.asyncio
async def test_diagnosis_confirm_creates_adopted_change_order_drafts() -> None:
    ctx = FakeContext(base_doc())
    account = ctx.doc["accounts"][0]
    account.update(
        identity_confirmed_at=domain.now(),
        plan_confirmed=False,
        baseline_audit_id="audit-1",
    )
    ctx.doc["audits"] = [
        {
            "id": "audit-1",
            "account_id": "a1",
            "status": "confirmed",
            "verified": True,
            "account_snapshot": domain.account_identity(account),
        }
    ]
    ctx.doc["diagnoses"] = [
        {
            "id": "diagnosis-1",
            "account_id": "a1",
            "audit_id": "audit-1",
            "status": "reviewing",
            "proposals": [{"id": "proposal-1", "field": "bio", "after": "新的简介", "risk": "L1"}],
            "decisions": {"proposal-1": {"decision": "adopt"}},
        }
    ]
    await domain.command(ctx, "diagnosis.confirm", {"id": "diagnosis-1", "confirmed": True})
    assert ctx.doc["diagnoses"][0]["status"] == "confirmed"
    assert len(ctx.doc["change_orders"]) == 1
    order = ctx.doc["change_orders"][0]
    assert order["fields"] == {"bio": "新的简介"}
    assert order["status"] == "draft"
    assert ctx.doc["takeover_events"][-1]["name"] == "xhs_ops_takeover_plan_confirmed"


@pytest.mark.asyncio
async def test_takeover_plan_revert_cancels_drafts_and_restores_snapshot() -> None:
    doc = base_doc()
    account = doc["accounts"][0]
    account.update(
        plan_confirmed=True,
        plan_confirmed_at=domain.now(),
        pre_plan_snapshot={
            "baseline_audit_id": None,
            "maturity": None,
            "skipped_fields": [],
            "plan_confirmed": False,
            "plan_confirmed_at": None,
        },
    )
    doc["change_orders"].append({"id": "order-draft", "account_id": "a1", "status": "draft"})
    ctx = FakeContext(doc)
    await domain.command(
        ctx,
        "takeover.plan.revert",
        {
            "account_id": "a1",
            "account_version": account["version"],
            "confirmed": True,
        },
    )
    assert ctx.doc["accounts"][0]["plan_confirmed"] is False
    assert ctx.doc["accounts"][0]["plan_reverted_at"]
    assert ctx.doc["change_orders"][0]["status"] == "cancelled"


@pytest.mark.asyncio
async def test_account_transfer_device_releases_source_and_binds_target() -> None:
    doc = base_doc()
    doc["accounts"].append(
        {
            "id": "a2",
            "version": 1,
            "project_id": "p1",
            "device_id": "",
            "platform_account_id": "",
            "entry_mode": "new",
            "name": "Target",
        }
    )
    ctx = FakeContext(doc)
    await domain.command(
        ctx,
        "account.transfer_device",
        {
            "from_account_id": "a1",
            "to_account_id": "a2",
            "project_id": "p1",
            "confirmed": True,
            "account": {
                "project_id": "p1",
                "name": "Target",
                "device_id": "phone-1",
                "entry_mode": "new",
                "platform_account_id": "",
            },
        },
    )
    source, target = ctx.doc["accounts"]
    assert source["device_id"] == ""
    assert target["device_id"] == "phone-1"
    assert source["platform_account_id"] == ""


@pytest.mark.asyncio
async def test_snapshot_upgrades_legacy_publish_key_and_blocks_resaved_duplicate() -> None:
    doc = base_doc()
    doc["runs"].append(
        {
            "id": "legacy-run",
            "kind": "publish",
            "status": "stopped_unverified",
            "idempotency_key": "legacy-publish",
            "operation_key": "legacy-v1-key",
            "operation_key_version": 1,
            "account_snapshot": deepcopy(doc["accounts"][0]),
            "draft_snapshot": deepcopy(doc["drafts"][0]),
            "payload": {},
        }
    )
    doc["accounts"][0].update(name="Renamed account", version=2)
    doc["drafts"][0].update(id="d2", version=2, updated_at=domain.now())
    doc["drafts"][0]["images"][0]["filename"] = "resaved.png"
    ctx = FakeContext(doc)

    await domain.snapshot(ctx)

    upgraded = ctx.doc["runs"][0]
    assert upgraded["legacy_operation_key"] == "legacy-v1-key"
    assert upgraded["operation_key_version"] == 2
    assert upgraded["operation_key"] == domain.operation_key(
        "publish", ctx.doc["accounts"][0], ctx.doc["drafts"][0], {}
    )

    await domain.command(
        ctx,
        "run.precheck",
        {"kind": "publish", "account_id": "a1", "draft_id": "d2", "confirmed": True},
    )
    with pytest.raises(domain.PluginAppError) as exc:
        await domain.command(
            ctx,
            "run.start",
            {
                "kind": "publish",
                "confirm_digest": ctx.doc["prechecks"][-1]["digest"],
                "account_id": "a1",
                "draft_id": "d2",
                "idempotency_key": "resaved-duplicate",
                "confirmed": True,
            },
        )
    assert exc.value.reason == "duplicate_operation"


@pytest.mark.asyncio
async def test_confirmed_cancel_of_public_run_becomes_stopped_unverified() -> None:
    doc = base_doc()
    doc["runs"].append(
        {
            "id": "public-run",
            "kind": "publish",
            "status": "running",
            "device_id": "phone-1",
            "task_id": "phone-task",
        }
    )
    ctx = FakeContext(doc)

    await domain.command(ctx, "run.cancel", {"run_id": "public-run"})

    assert ctx.doc["runs"][0]["status"] == "stopped_unverified"


async def test_reconcile_owned_idle_task_remains_available_after_permissions_and_license_loss() -> (
    None
):
    doc = base_doc()
    doc["runs"] = [
        {"id": "uncertain", "kind": "publish", "status": "unknown", "device_id": "phone-1"}
    ]
    ctx = FakeContext(doc)

    async def denied(_feature: str) -> None:
        raise domain.PluginAppError("license_required", status=403)

    ctx.require = denied
    ctx.device = lambda _device: (_ for _ in ()).throw(
        domain.PluginAppError("permission_required", status=403)
    )
    ctx.devices = lambda: [{"device_id": "phone-1", "running_task_id": None}]
    await domain.command(ctx, "run.reconcile", {"run_id": "uncertain", "confirmed": True})
    assert ctx.doc["runs"][0]["status"] == "stopped_unverified"
    with pytest.raises(domain.PluginAppError, match="run_not_reconcilable"):
        await domain.command(ctx, "run.reconcile", {"run_id": "uncertain", "confirmed": True})
    ctx.doc["runs"][0]["status"] = "operator_verified"
    with pytest.raises(domain.PluginAppError, match="run_not_reconcilable"):
        await domain.command(ctx, "run.reconcile", {"run_id": "uncertain", "confirmed": True})


async def test_reconcile_refuses_another_owners_device_or_a_current_phone_task() -> None:
    doc = base_doc()
    doc["runs"] = [
        {"id": "uncertain", "kind": "publish", "status": "unknown", "device_id": "phone-1"}
    ]
    ctx = FakeContext(doc)
    ctx.devices = lambda: []
    with pytest.raises(domain.PluginAppError, match="device_not_owned"):
        await domain.command(ctx, "run.reconcile", {"run_id": "uncertain", "confirmed": True})
    ctx.devices = lambda: [{"device_id": "phone-1", "running_task_id": "a-running-task"}]
    with pytest.raises(domain.PluginAppError, match="device_busy"):
        await domain.command(ctx, "run.reconcile", {"run_id": "uncertain", "confirmed": True})
    assert ctx.doc["runs"][0]["status"] == "unknown"


async def test_cancel_claim_uses_current_sdk_state_after_a_queued_snapshot() -> None:
    ctx = FakeContext(base_doc())
    ctx.doc["runs"] = [
        {
            "id": "race",
            "kind": "publish",
            "status": "queued",
            "device_id": "phone-1",
            "task_id": "queued-id",
        }
    ]
    original_read = ctx.read
    stopped = []

    async def raced_read() -> dict[str, Any]:
        snapshot = await original_read()
        ctx.doc["runs"][0].update(status="running", task_id="actual-sdk-id")
        return snapshot

    async def cancel(device: str, task: str) -> Any:
        stopped.append((device, task))
        return SimpleNamespace(error_code="CANCEL_NOT_CONFIRMED")

    ctx.read, ctx.cancel_phone = raced_read, cancel
    await domain.command(ctx, "run.cancel", {"run_id": "race"})
    assert stopped == [("phone-1", "actual-sdk-id")]
    assert ctx.doc["runs"][0]["status"] == "unknown"


async def test_cancel_cannot_overwrite_an_already_verified_terminal_state() -> None:
    ctx = FakeContext(base_doc())
    ctx.doc["runs"] = [
        {
            "id": "race",
            "kind": "publish",
            "status": "running",
            "device_id": "phone-1",
            "task_id": "sdk-id",
        }
    ]
    original_read = ctx.read

    async def raced_read() -> dict[str, Any]:
        snapshot = await original_read()
        ctx.doc["runs"][0]["status"] = "operator_verified"
        return snapshot

    ctx.read = raced_read
    with pytest.raises(domain.PluginAppError, match="run_not_cancellable"):
        await domain.command(ctx, "run.cancel", {"run_id": "race"})
    assert ctx.doc["runs"][0]["status"] == "operator_verified"


@pytest.mark.asyncio
async def test_takeover_change_order_accepts_six_fields_and_requires_region_request() -> None:
    doc = base_doc()
    account = doc["accounts"][0]
    account.update(plan_confirmed=True, identity_confirmed_at=domain.now())
    audit = {
        "id": "audit-fields",
        "account_id": "a1",
        "verified": True,
        "status": "confirmed",
        "confirmed_at": domain.now(),
        "profile": {"occupation": "设计师", "region": "上海", "avatar": "old-avatar"},
        "account_snapshot": domain.account_identity(account),
    }
    doc["audits"].append(audit)
    ctx = FakeContext(doc)
    with pytest.raises(domain.PluginAppError, match="field_request_required"):
        await domain.command(
            ctx, "change_order.create", {"account_id": "a1", "fields": {"region": "北京"}}
        )
    await domain.command(
        ctx,
        "change_order.create",
        {"account_id": "a1", "requested": True, "fields": {"region": "北京"}},
    )
    assert ctx.doc["change_orders"][0]["fields"] == {"region": "北京"}
    with pytest.raises(domain.PluginAppError, match="unsupported_profile_fields"):
        await domain.command(
            ctx, "change_order.create", {"account_id": "a1", "fields": {"gender": "女"}}
        )


@pytest.mark.asyncio
async def test_takeover_change_order_stores_avatar_as_private_asset() -> None:
    doc = base_doc()
    account = doc["accounts"][0]
    account.update(plan_confirmed=True, identity_confirmed_at=domain.now())
    doc["audits"].append(
        {
            "id": "audit-image",
            "account_id": "a1",
            "verified": True,
            "status": "confirmed",
            "confirmed_at": domain.now(),
            "profile": {"avatar": "old-avatar"},
            "account_snapshot": domain.account_identity(account),
        }
    )
    ctx = FakeContext(doc)
    raw = base64.b64encode(b"\x89PNG\r\n\x1a\navatar").decode()
    await domain.command(
        ctx,
        "change_order.create",
        {
            "account_id": "a1",
            "fields": {
                "avatar": {
                    "filename": "avatar.png",
                    "mime_type": "image/png",
                    "data_base64": raw,
                }
            },
        },
    )
    stored = ctx.doc["change_orders"][0]["fields"]["avatar"]
    assert stored["asset_id"] and not stored.get("data_base64")
    assert stored["mime_type"] == "image/png"


@pytest.mark.asyncio
async def test_takeover_pause_resume_and_device_hold_release_are_explicit() -> None:
    ctx = FakeContext(base_doc())
    await domain.command(
        ctx,
        "takeover.pause",
        {"account_id": "a1", "reason": "人工复核", "confirmed": True},
    )
    assert ctx.doc["accounts"][0]["paused"] is True
    with pytest.raises(domain.PluginAppError, match="account_paused"):
        await domain.command(
            ctx,
            "run.precheck",
            {"kind": "publish", "account_id": "a1", "draft_id": "d1", "confirmed": True},
        )
    await domain.command(ctx, "takeover.resume", {"account_id": "a1", "confirmed": True})
    assert ctx.doc["accounts"][0]["paused"] is False
    ctx.doc["accounts"][0]["device_hold"] = {"task_id": "held"}
    with pytest.raises(domain.PluginAppError, match="device_hold_reference_required"):
        await domain.command(
            ctx,
            "takeover.device_hold_release",
            {"account_id": "a1", "confirmed": True},
        )
    await domain.command(
        ctx,
        "takeover.device_hold_release",
        {"account_id": "a1", "reference": "手机已停止并核对", "confirmed": True},
    )
    assert ctx.doc["accounts"][0]["device_hold"] is None


@pytest.mark.asyncio
async def test_pending_audit_can_be_cancelled_without_setting_baseline() -> None:
    doc = base_doc()
    doc["audits"].append(
        {
            "id": "audit-cancel",
            "account_id": "a1",
            "status": "pending_confirmation",
            "verified": True,
        }
    )
    ctx = FakeContext(doc)
    await domain.command(
        ctx,
        "audit.cancel",
        {"id": "audit-cancel", "reference": "人工取消", "confirmed": True},
    )
    assert ctx.doc["audits"][0]["status"] == "cancelled"
    assert not ctx.doc["accounts"][0].get("baseline_audit_id")


@pytest.mark.asyncio
async def test_draft_change_order_can_be_cancelled_before_phone_execution() -> None:
    doc = base_doc()
    account = doc["accounts"][0]
    account.update(plan_confirmed=True, identity_confirmed_at=domain.now())
    ctx = FakeContext(doc)
    await domain.command(
        ctx,
        "change_order.create",
        {"account_id": "a1", "fields": {"bio": "new bio"}},
    )
    order_id = ctx.doc["change_orders"][0]["id"]
    await domain.command(
        ctx,
        "change_order.cancel",
        {"id": order_id, "reference": "人工取消", "confirmed": True},
    )
    assert ctx.doc["change_orders"][0]["status"] == "cancelled"


@pytest.mark.asyncio
async def test_diagnosis_decisions_and_regeneration_keep_version_history() -> None:
    doc = base_doc()
    account = doc["accounts"][0]
    account.update(
        plan_confirmed=True, identity_confirmed_at=domain.now(), baseline_audit_id="audit-d"
    )
    doc["audits"].append(
        {
            "id": "audit-d",
            "account_id": "a1",
            "verified": True,
            "status": "confirmed",
            "confirmed_at": domain.now(),
            "profile": {"bio": "old"},
            "evidence": {"profile": {"bio": "old"}},
            "account_snapshot": domain.account_identity(account),
        }
    )
    ctx = FakeContext(doc)
    ctx.generate_text = lambda *_args, **_kwargs: asyncio.sleep(
        0, result='{"summary":"s","findings":["f"],"recommendations":["r"]}'
    )
    await domain.command(ctx, "diagnosis.generate", {"account_id": "a1", "audit_id": "audit-d"})
    first = ctx.doc["diagnoses"][0]["id"]
    await domain.command(
        ctx,
        "diagnosis.decisions",
        {"id": first, "decisions": {"finding_0": "keep"}, "confirmed": True},
    )
    await domain.command(ctx, "diagnosis.regenerate", {"id": first, "confirmed": True})
    assert ctx.doc["diagnoses"][0]["status"] == "superseded"
    assert ctx.doc["diagnoses"][0]["superseded_by"] == ctx.doc["diagnoses"][1]["id"]
    assert ctx.doc["diagnoses"][1]["decisions"] == {"finding_0": "keep"}


@pytest.mark.asyncio
async def test_takeover_budget_blocks_second_change_and_rollback_uses_old_values() -> None:
    doc = base_doc()
    account = doc["accounts"][0]
    account.update(plan_confirmed=True, identity_confirmed_at=domain.now())
    audit = {
        "id": "audit-budget",
        "account_id": "a1",
        "verified": True,
        "status": "confirmed",
        "confirmed_at": domain.now(),
        "profile": {"bio": "old bio", "nickname": "old name"},
        "account_snapshot": domain.account_identity(account),
    }
    doc["audits"].append(audit)
    doc["change_orders"].append(
        {
            "id": "prior",
            "account_id": "a1",
            "fields": {"bio": "first"},
            "status": "reviewed",
            "apply_task_id": "task-prior",
            "confirmed_at": domain.now(),
            "observation": {"status": "finished"},
        }
    )
    ctx = FakeContext(doc)
    await domain.command(
        ctx, "change_order.create", {"account_id": "a1", "fields": {"bio": "second"}}
    )
    current = ctx.doc["change_orders"][-1]
    with pytest.raises(domain.PluginAppError, match="field_budget_blocked"):
        await domain.command(ctx, "change_order.precheck", {"id": current["id"]})
    rollback = {
        "id": "rollback-order",
        "account_id": "a1",
        "fields": {"bio": "new bio"},
        "old_values": {"bio": "old bio"},
        "status": "observing",
        "observation_until": domain.now(),
    }
    ctx.doc["change_orders"].append(rollback)
    ctx.receipts.append(
        {
            "verified": True,
            "account_matches": True,
            "status": "completed",
            "fields": {"bio": "old bio"},
        }
    )
    await domain.command(ctx, "change_order.rollback", {"id": rollback["id"], "confirmed": True})
    assert ctx.doc["change_orders"][-1]["status"] == "rollback_applying"
    await ctx.drain()
    assert ctx.doc["change_orders"][-1]["status"] == "rollback_awaiting_verification"
    run = ctx.doc["runs"][-1]
    await domain.command(
        ctx,
        "run.verify",
        {
            "run_id": run["id"],
            "evidence_url": run["evidence_url"],
            "confirmed": True,
            "reference": "已核验回滚结果",
        },
    )
    assert ctx.doc["change_orders"][-1]["status"] == "rollback_observing"
    assert run["payload"]["rollback"] is True


@pytest.mark.asyncio
async def test_sync_outbox_push_acks_pending_rows_and_adds_plugin_id() -> None:
    doc = base_doc()
    doc["audit_outbox"].append(
        {
            "id": "outbox-1",
            "event_id": "event-1",
            "action": "takeover.identity.confirm",
            "target": "a1",
            "payload_digest": "a" * 64,
            "status": "pending",
            "attempts": 0,
            "last_error": None,
        }
    )
    ctx = FakeContext(doc)
    await domain.command(ctx, "sync.outbox.push", {})
    row = ctx.doc["audit_outbox"][0]
    assert row["status"] == "acked"
    assert row["attempts"] == 1
    assert ctx.sync_calls[0][0]["plugin_id"] == "xhs-ops"


@pytest.mark.asyncio
async def test_sync_outbox_push_keeps_pending_row_after_sync_failure() -> None:
    doc = base_doc()
    doc["audit_outbox"].append(
        {
            "id": "outbox-2",
            "event_id": "event-2",
            "action": "takeover.identity.confirm",
            "target": "a1",
            "payload_digest": "b" * 64,
            "status": "pending",
            "attempts": 0,
            "last_error": None,
        }
    )
    ctx = FakeContext(doc)
    ctx.sync_error = RuntimeError("control plane unavailable")
    with pytest.raises(RuntimeError, match="control plane unavailable"):
        await domain.command(ctx, "sync.outbox.push", {})
    row = ctx.doc["audit_outbox"][0]
    assert row["status"] == "pending"
    assert row["attempts"] == 1
    assert row["last_error"] == "control plane unavailable"

"""Source phone receipts do not bypass separate readback and operator verification."""

from __future__ import annotations

import asyncio
import base64
import json
from copy import deepcopy
from types import SimpleNamespace
from typing import Any

import pytest

from tests.unit.test_xhs_app_domain import FakeContext, alternate_base64, base_doc, domain


def reply(
    marker: str,
    proof: dict[str, Any],
    *,
    actions: bool = False,
    success: bool = True,
    error: str | None = None,
) -> dict[str, Any]:
    return {
        "message": marker
        + json.dumps(proof, ensure_ascii=False)
        + ("\n[回执] 各应用生效点击: com.xingin.xhs=3" if actions else ""),
        "success": success,
        "error_code": error,
    }


class PhoneContext(FakeContext):
    def __init__(self, doc: dict[str, Any]) -> None:
        super().__init__(doc)
        self.results: list[dict[str, Any] | Exception] = []

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
            {
                "device_id": device_id,
                "task": task,
                "task_id": task_id,
                "policy": policy,
                "max_steps": max_steps,
            }
        )
        response = self.results.pop(0)
        if isinstance(response, Exception):
            raise response
        screenshot = response.pop("final_screenshot", b"proof")
        return SimpleNamespace(task_id=task_id, final_screenshot=screenshot, **response)


def public_draft() -> dict[str, Any]:
    def image(label: str) -> dict[str, str]:
        return {
            "filename": label + ".png",
            "mime_type": "image/png",
            "data_base64": base64.b64encode(b"\x89PNG\r\n\x1a\n" + label.encode()).decode(),
        }

    return {
        "nickname": "训练日记",
        "bio": "双子座 INFP\n记录双打训练\n喜欢运动",
        "occupation": "设计师",
        "gender": "女",
        "birthday": "1997-06-11",
        "region": "上海",
        "interest_tags": ["羽毛球"],
        "avatar_candidates": [image("avatar")],
        "cover_candidates": [image("cover")],
        "avatar_filename": "avatar.png",
        "cover_filename": "cover.png",
    }


async def ready_context() -> PhoneContext:
    doc = base_doc()
    doc["accounts"][0].update(
        entry_mode="new",
        persona_reviewed_at=domain.now(),
        persona={
            "age": "29",
            "gender": "女",
            "region": "上海",
            "occupation": "设计师",
            "life_status": "独居",
        },
    )
    doc["projects"][0]["profile"] = {"confirmed_at": domain.now(), "summary": "城市运动人群"}
    ctx = PhoneContext(doc)
    await domain.command(
        ctx, "account_profile.save", {"account_id": "a1", "version": 1, "draft": public_draft()}
    )
    await domain.command(
        ctx, "account_profile.review", {"account_id": "a1", "version": 2, "confirmed": True}
    )
    return ctx


async def prepare_and_read(ctx: PhoneContext) -> None:
    ctx.results += [
        reply(
            "PREPARATION_JSON:",
            {"v": 1, "status": "ready", "code": "ready", "profileVerified": True},
            actions=True,
        )
    ]
    await domain.command(
        ctx, "account.prepare", {"account_id": "a1", "version": 3, "confirmed": True}
    )
    await ctx.drain()
    ctx.results += [
        reply(
            "PROFILE_READBACK_JSON:",
            {
                "v": 1,
                "status": "read",
                "nickname": "旧昵称",
                "bio": "旧简介",
                "occupation": "",
                "gender": "女",
                "birthday": "1997-06-11",
                "region": "上海",
            },
        )
    ]
    await domain.command(
        ctx, "account_profile.read", {"account_id": "a1", "version": 3, "confirmed": True}
    )
    await ctx.drain()


async def apply(ctx: PhoneContext, *, partial: bool = False) -> None:
    await domain.command(
        ctx,
        "account_profile.precheck",
        {"account_id": "a1", "version": 3, "fields": ["cover", "nickname", "avatar"]},
    )
    check = ctx.doc["accounts"][0]["profile_precheck"]
    assert check["fields"] == ["nickname", "avatar", "cover"]
    assert all(
        not row["comparable"] for row in check["diffs"] if row["field"] in {"avatar", "cover"}
    )
    statuses = dict.fromkeys(domain.profiles.FIELDS, "skipped")
    statuses.update(nickname="done", avatar="failed" if partial else "done", cover="done")
    ctx.results += [
        reply("PROFILE_JSON:", statuses),
        reply(
            "PROFILE_VERIFICATION_JSON:",
            {
                "v": 1,
                "status": "verified",
                "accountMatched": True,
                "fields": dict.fromkeys(domain.profiles.FIELDS, True),
            },
        ),
    ]
    body = {"account_id": "a1", "version": 3, "confirmed": True, "confirm_digest": check["digest"]}
    await domain.command(ctx, "account_profile.apply", body)
    await domain.command(ctx, "account_profile.apply", body)
    assert len(ctx.spawned) == 1
    await ctx.drain()


async def test_apply_uses_separate_readonly_verification_and_still_needs_human() -> None:
    ctx = await ready_context()
    await prepare_and_read(ctx)
    await apply(ctx)
    account = ctx.doc["accounts"][0]
    assert len(ctx.phone_calls) == 4
    assert "PROFILE_JSON:" in ctx.phone_calls[2]["task"]
    assert "PROFILE_VERIFICATION_JSON:" in ctx.phone_calls[3]["task"]
    assert "interest_tags" not in ctx.phone_calls[2]["task"]
    assert "TYPE" in ctx.phone_calls[2]["policy"]["allowedActions"]
    assert "TYPE" not in ctx.phone_calls[3]["policy"]["allowedActions"]
    assert ctx.phone_calls[2]["max_steps"] == 100
    assert len(ctx.media_calls[0]) == 2 and ctx.media_albums[0].startswith("Tabby/xhs-")
    assert account["profile_draft"]["verified_at"] is None
    assert account["profile_verification"]["status"] == "verified"
    assert ctx.doc["runs"][-1]["status"] == "awaiting_verification"
    proof = account["profile_verification"]
    with pytest.raises(domain.PluginAppError, match="profile_specific_verification_required"):
        await domain.command(
            ctx,
            "run.verify",
            {
                "run_id": proof["run_id"],
                "confirmed": True,
                "evidence_url": proof["evidence_url"],
                "reference": "cannot bypass",
            },
        )
    body = {
        "account_id": "a1",
        "version": 3,
        "run_id": proof["run_id"],
        "evidence_url": proof["evidence_url"],
        "reference": "已对照手机和候选图核对八项资料",
        "confirmed": True,
    }
    with pytest.raises(domain.PluginAppError, match="profile_image_review_required"):
        await domain.command(ctx, "account_profile.verify", body)
    await domain.command(ctx, "account_profile.verify", {**body, "images_confirmed": True})
    assert account["profile_draft"]["verified_at"]
    assert account["profile_draft"]["verified_account_id"] == account["platform_account_id"]
    assert domain.batches.reserved_device_ids(ctx.doc) == set()
    domain.profiles.require_operating(domain, ctx.doc, account)


async def test_new_account_cannot_operate_before_independent_profile_verification() -> None:
    ctx = await ready_context()
    with pytest.raises(domain.PluginAppError, match="profile_verification_required"):
        await domain.start(
            ctx,
            domain.Run(kind="browse", account_id="a1", idempotency_key="not-ready", confirmed=True),
        )
    assert ctx.doc["runs"] == [] and ctx.phone_calls == []


async def test_unavailable_readback_never_becomes_empty_values_or_precheck() -> None:
    ctx = await ready_context()
    ctx.results = [reply("PROFILE_READBACK_JSON:", {"v": 1, "status": "unavailable"})]
    await domain.command(
        ctx, "account_profile.read", {"account_id": "a1", "version": 3, "confirmed": True}
    )
    await ctx.drain()
    read = ctx.doc["accounts"][0]["profile_readback"]
    assert read["status"] == "unavailable" and read["values"] == {}
    with pytest.raises(domain.PluginAppError, match="account_preparation_required"):
        await domain.command(ctx, "account_profile.precheck", {"account_id": "a1", "version": 3})


async def test_missing_preparation_receipt_retries_only_readonly_checks() -> None:
    ctx = await ready_context()
    ctx.results = [
        {"message": "no receipt", "success": True, "error_code": None},
        {"message": "still no receipt", "success": True, "error_code": None},
        reply(
            "PREPARATION_JSON:",
            {
                "v": 1,
                "status": "blocked",
                "code": "verification_required",
                "profileVerified": False,
            },
            actions=True,
        ),
    ]
    await domain.command(
        ctx, "account.prepare", {"account_id": "a1", "version": 3, "confirmed": True}
    )
    await ctx.drain()
    assert len(ctx.phone_calls) == 3
    assert all(
        "禁止重复安装、登录" in call["task"] and "AWAKE store:" not in call["task"]
        for call in ctx.phone_calls[1:]
    )
    assert all(
        call["policy"]["confirmationPolicy"]["login"] == "forbidden" for call in ctx.phone_calls[1:]
    )
    assert ctx.doc["accounts"][0]["preparation"]["code"] == "verification_required"
    assert ctx.doc["runs"][0]["status"] == "blocked"


async def test_identity_returns_only_scoped_number_and_blocks_missing_screenshot() -> None:
    ctx = await ready_context()
    ctx.results = [
        reply("IDENTITY_JSON:", {"v": 1, "status": "visible", "accountId": "test_account-1"})
    ]
    await domain.command(
        ctx, "account.identity", {"account_id": "a1", "version": 3, "confirmed": True}
    )
    await ctx.drain()
    assert ctx.doc["accounts"][0]["profile_identity"]["account_id"] == "test_account-1"
    assert ctx.doc["accounts"][0]["platform_account_id"] != "test_account-1"
    ctx.results = [
        {
            **reply("IDENTITY_JSON:", {"v": 1, "status": "visible", "accountId": "test_account-1"}),
            "final_screenshot": None,
        }
    ]
    await domain.command(
        ctx, "account.identity", {"account_id": "a1", "version": 3, "confirmed": True}
    )
    await ctx.drain()
    assert ctx.doc["accounts"][0]["profile_identity"]["status"] == "unavailable"
    assert ctx.doc["accounts"][0]["profile_identity"]["account_id"] == ""


async def test_readback_missing_required_fields_cannot_be_accepted() -> None:
    ctx = await ready_context()
    ctx.results = [reply("PROFILE_READBACK_JSON:", {"v": 1, "status": "read", "nickname": "名字"})]
    await domain.command(
        ctx, "account_profile.read", {"account_id": "a1", "version": 3, "confirmed": True}
    )
    await ctx.drain()
    assert ctx.doc["accounts"][0]["profile_readback"]["status"] == "unavailable"
    assert ctx.doc["accounts"][0]["profile_readback"]["values"] == {}


async def test_apply_reporting_an_unapproved_field_keeps_the_device_held() -> None:
    ctx = await ready_context()
    await prepare_and_read(ctx)
    await domain.command(
        ctx, "account_profile.precheck", {"account_id": "a1", "version": 3, "fields": ["nickname"]}
    )
    receipt = dict.fromkeys(domain.profiles.FIELDS, "skipped")
    receipt.update(nickname="done", birthday="done")
    ctx.results = [reply("PROFILE_JSON:", receipt)]
    await domain.command(
        ctx,
        "account_profile.apply",
        {
            "account_id": "a1",
            "version": 3,
            "confirmed": True,
            "confirm_digest": ctx.doc["accounts"][0]["profile_precheck"]["digest"],
        },
    )
    await ctx.drain()
    run = ctx.doc["runs"][-1]
    assert run["status"] == "unknown" and run["error"] == "profile_receipt_invalid"
    assert run["evidence"]["fields"]["birthday"] == "done"
    assert domain.batches.reserved_device_ids(ctx.doc) == {"phone-1"}
    assert len(ctx.phone_calls) == 3


async def test_unchanged_profile_can_be_reverified_without_replaying_the_public_write() -> None:
    ctx = await ready_context()
    await prepare_and_read(ctx)
    await apply(ctx)
    account = ctx.doc["accounts"][0]

    async def confirm() -> None:
        proof = account["profile_verification"]
        await domain.command(
            ctx,
            "account_profile.verify",
            {
                "account_id": "a1",
                "version": account["version"],
                "run_id": proof["run_id"],
                "evidence_url": proof["evidence_url"],
                "reference": "已对照当前设备截图和候选图核对八项资料",
                "confirmed": True,
                "images_confirmed": True,
            },
        )

    await confirm()
    applied = next(run for run in ctx.doc["runs"] if run["kind"] == "account_profile_apply")
    for part in ("avatar", "cover"):
        for image in applied["draft_snapshot"][f"{part}_candidates"]:
            encoded = await domain.image_data(ctx, image)
            for key in ("asset_id", "asset_url", "sha256", "size", "content_digest"):
                image.pop(key, None)
            image["data_base64"] = encoded
    original = deepcopy(applied)
    await domain.command(
        ctx,
        "account_profile.save",
        {"account_id": "a1", "version": 3, "draft": domain.profiles._editable(account)},
    )
    account = ctx.doc["accounts"][0]
    assert account["profile_draft"]["apply_operation"] is None
    assert account["last_profile_apply_run_id"] == applied["id"]
    await domain.command(
        ctx, "account_profile.review", {"account_id": "a1", "version": 4, "confirmed": True}
    )
    account = ctx.doc["accounts"][0]
    ctx.results = [
        reply(
            "PROFILE_VERIFICATION_JSON:",
            {
                "v": 1,
                "status": "verified",
                "accountMatched": True,
                "fields": dict.fromkeys(domain.profiles.FIELDS, True),
            },
        )
    ]
    await domain.command(
        ctx, "account_profile.check", {"account_id": "a1", "version": 5, "confirmed": True}
    )
    assert account["profile_draft"]["verified_at"] is None
    await ctx.drain()
    await confirm()
    assert account["profile_draft"]["verified_version"] == 5
    assert applied == original
    assert sum(run["kind"] == "account_profile_apply" for run in ctx.doc["runs"]) == 1
    assert len(ctx.phone_calls) == 5
    assert "TYPE" not in ctx.phone_calls[-1]["policy"]["allowedActions"]
    changed = domain.profiles._editable(account)
    changed["nickname"] = "不同昵称"
    await domain.command(
        ctx, "account_profile.save", {"account_id": "a1", "version": 5, "draft": changed}
    )
    with pytest.raises(domain.PluginAppError, match="profile_verification_required"):
        await domain.command(
            ctx, "account_profile.check", {"account_id": "a1", "version": 6, "confirmed": True}
        )
    assert len(ctx.phone_calls) == 5


async def test_legacy_profile_encoding_and_old_key_cannot_bypass_same_content_guard() -> None:
    ctx = await ready_context()
    await prepare_and_read(ctx)
    await apply(ctx)
    account = ctx.doc["accounts"][0]
    proof = account["profile_verification"]
    await domain.command(
        ctx,
        "account_profile.verify",
        {
            "account_id": "a1",
            "version": account["version"],
            "run_id": proof["run_id"],
            "evidence_url": proof["evidence_url"],
            "reference": "checked actual phone and candidate images",
            "confirmed": True,
            "images_confirmed": True,
        },
    )
    applied = next(run for run in ctx.doc["runs"] if run["kind"] == "account_profile_apply")
    applied["operation_key"] = "legacy-string-key"
    for part in ("avatar", "cover"):
        for image in applied["draft_snapshot"][f"{part}_candidates"]:
            encoded = alternate_base64(await domain.image_data(ctx, image))
            for key in ("asset_id", "asset_url", "sha256", "size", "content_digest"):
                image.pop(key, None)
            image["data_base64"] = encoded
    await domain.command(
        ctx,
        "account_profile.precheck",
        {
            "account_id": "a1",
            "version": account["version"],
            "fields": ["nickname", "avatar", "cover"],
        },
    )
    check = account["profile_precheck"]
    with pytest.raises(domain.PluginAppError, match="duplicate_operation"):
        await domain.command(
            ctx,
            "account_profile.apply",
            {
                "account_id": "a1",
                "version": account["version"],
                "confirm_digest": check["digest"],
                "confirmed": True,
            },
        )
    assert len(ctx.phone_calls) == 4
    assert sum(run["kind"] == "account_profile_apply" for run in ctx.doc["runs"]) == 1


async def test_risk_control_preparation_pauses_for_48_hours() -> None:
    ctx = await ready_context()
    ctx.results = [
        reply(
            "PREPARATION_JSON:",
            {"v": 1, "status": "blocked", "code": "rate_limited", "profileVerified": False},
            actions=True,
        )
    ]
    await domain.command(
        ctx, "account.prepare", {"account_id": "a1", "version": 3, "confirmed": True}
    )
    await ctx.drain()
    assert ctx.doc["accounts"][0]["paused"] is True
    with pytest.raises(domain.PluginAppError, match="account_safety_paused"):
        await domain.command(
            ctx, "account.resume", {"account_id": "a1", "version": 3, "confirmed": True}
        )


async def test_restart_keeps_profile_apply_unknown_without_replay() -> None:
    ctx = await ready_context()
    await prepare_and_read(ctx)
    await domain.command(ctx, "account_profile.precheck", {"account_id": "a1", "version": 3})
    check = ctx.doc["accounts"][0]["profile_precheck"]
    await domain.command(
        ctx,
        "account_profile.apply",
        {"account_id": "a1", "version": 3, "confirmed": True, "confirm_digest": check["digest"]},
    )
    for pending in ctx.spawned:
        pending.close()
    ctx.spawned.clear()
    run = ctx.doc["runs"][-1]
    run.update(status="running", dispatched_at=domain.now())
    ctx.host.instance_id = "new-runtime"
    await domain.snapshot(ctx)
    assert run["status"] == "unknown"
    assert ctx.doc["accounts"][0]["profile_draft"]["apply_operation"]["status"] == "interrupted"
    assert ctx.spawned == []


async def test_account_metadata_change_invalidates_profile_confirmations_but_keeps_history() -> (
    None
):
    ctx = await ready_context()
    await prepare_and_read(ctx)
    account = ctx.doc["accounts"][0]
    account["last_profile_apply_run_id"] = "historical-only"
    await domain.command(
        ctx,
        "account.save",
        {
            key: account[key]
            for key in (
                "id",
                "version",
                "project_id",
                "device_id",
                "entry_mode",
                "platform_account_id",
            )
        }
        | {"name": "新的内部账号标签"},
    )
    account = ctx.doc["accounts"][0]
    assert account["version"] == 4
    assert account["preparation"] is None and account["profile_readback"] is None
    assert account["profile_draft"]["reviewed_at"] is None
    assert account["last_profile_apply_run_id"] == "historical-only"
    assert len(ctx.doc["runs"]) == 2


@pytest.mark.parametrize(
    "command,key",
    [
        ("account.prepare", "preparation"),
        ("account.identity", "profile_identity"),
        ("account_profile.read", "profile_readback"),
    ],
)
async def test_phone_exception_does_not_leave_profile_metadata_running(
    command: str, key: str
) -> None:
    ctx = await ready_context()
    ctx.results = [RuntimeError("disconnected")]
    await domain.command(ctx, command, {"account_id": "a1", "version": 3, "confirmed": True})
    await ctx.drain()
    assert ctx.doc["accounts"][0][key]["status"] != "running"
    assert ctx.doc["accounts"][0][key]["code"] == "execution_failed"
    assert ctx.doc["runs"][0]["status"] == "unknown"


async def test_idle_phone_does_not_allow_reconciliation_of_a_queued_profile_task() -> None:
    ctx = await ready_context()
    await domain.command(
        ctx, "account.prepare", {"account_id": "a1", "version": 3, "confirmed": True}
    )
    with pytest.raises(domain.PluginAppError, match="run_not_reconcilable"):
        await domain.command(
            ctx,
            "account_profile.reconcile",
            {
                "account_id": "a1",
                "version": 3,
                "run_id": ctx.doc["runs"][0]["id"],
                "confirmed": True,
                "reference": "phone looks idle",
            },
        )
    for pending in ctx.spawned:
        pending.close()
    ctx.spawned.clear()
    assert ctx.doc["runs"][0]["status"] == "queued"


async def test_cancelling_profile_apply_prevents_automatic_followup_verification() -> None:
    ctx = await ready_context()
    await prepare_and_read(ctx)
    await domain.command(
        ctx, "account_profile.precheck", {"account_id": "a1", "version": 3, "fields": ["nickname"]}
    )
    await domain.command(
        ctx,
        "account_profile.apply",
        {
            "account_id": "a1",
            "version": 3,
            "confirmed": True,
            "confirm_digest": ctx.doc["accounts"][0]["profile_precheck"]["digest"],
        },
    )
    run_id = ctx.doc["runs"][-1]["id"]
    entered, release_result, cancel_entered, release_cancel = (asyncio.Event() for _ in range(4))
    statuses = dict.fromkeys(domain.profiles.FIELDS, "skipped")
    statuses["nickname"] = "done"

    async def phone(_device: str, _task: str, *, task_id: str, **_: Any) -> Any:
        entered.set()
        await release_result.wait()
        return SimpleNamespace(
            task_id=task_id, final_screenshot=b"proof", **reply("PROFILE_JSON:", statuses)
        )

    async def cancel(_device: str, _task: str) -> Any:
        cancel_entered.set()
        await release_cancel.wait()
        return SimpleNamespace(error_code=None)

    ctx.run_phone, ctx.cancel_phone = phone, cancel
    execution = asyncio.create_task(ctx.spawned.pop(0))
    ctx.host.tasks[(ctx.key, run_id)] = execution
    await asyncio.wait_for(entered.wait(), 1)
    cancelling = asyncio.create_task(domain.command(ctx, "run.cancel", {"run_id": run_id}))
    await asyncio.wait_for(cancel_entered.wait(), 1)
    release_result.set()
    await asyncio.wait_for(execution, 1)
    assert ctx.doc["runs"][-1]["status"] == "cancelling" and ctx.spawned == []
    release_cancel.set()
    await asyncio.wait_for(cancelling, 1)
    assert ctx.doc["runs"][-1]["status"] == "stopped_unverified"


async def test_existing_account_resume_uses_fresh_readonly_identity_without_new_account_preparation() -> (
    None
):
    ctx = await ready_context()
    ctx.doc["accounts"][0].update(
        entry_mode="existing",
        paused=True,
        safety_pause={"code": "login_required", "cooldown_until": None},
    )
    with pytest.raises(domain.PluginAppError, match="account_preparation_required"):
        await domain.command(
            ctx, "account.resume", {"account_id": "a1", "version": 3, "confirmed": True}
        )
    account = ctx.doc["accounts"][0]
    ctx.results = [
        reply(
            "IDENTITY_JSON:",
            {"v": 1, "status": "visible", "accountId": account["platform_account_id"]},
        )
    ]
    await domain.command(
        ctx, "account.identity", {"account_id": "a1", "version": 3, "confirmed": True}
    )
    await ctx.drain()
    await domain.command(
        ctx, "account.resume", {"account_id": "a1", "version": 3, "confirmed": True}
    )
    assert account["paused"] is False and account["version"] == 3
    assert "TYPE" not in ctx.phone_calls[0]["policy"]["allowedActions"]

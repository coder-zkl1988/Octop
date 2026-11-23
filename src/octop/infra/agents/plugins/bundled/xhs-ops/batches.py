"""Persisted batch intents reuse the single-post executor and evidence rules."""

from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

from octop.infra.plugin_apps.contracts import PluginAppError

HOLD = {
    "queued",
    "preparing",
    "running",
    "cancelling",
    "unknown",
    "interrupted",
    "awaiting_verification",
}


class BatchItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(default="", max_length=150)
    draft_id: str = Field(min_length=1, max_length=150)
    account_id: str = Field(min_length=1, max_length=150)


class Batch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(default="", max_length=150)
    version: int | None = None
    project_id: str
    name: str = Field(min_length=1, max_length=100)
    items: list[BatchItem] = Field(min_length=1, max_length=30)


def reserved_device_ids(doc: dict[str, Any]) -> set[str]:
    return {
        run["device_id"] for run in doc.get("runs", []) if run.get("status") in HOLD | {"waiting"}
    }


def _batch(domain: Any, doc: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    batch: dict[str, Any] = domain.find(doc, "batches", str(payload["id"]))
    if batch.get("version") != payload.get("version"):
        raise PluginAppError("version_conflict", status=409)
    return batch


def _preview(
    ctx: Any, domain: Any, doc: dict[str, Any], batch: dict[str, Any]
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    domain.find(doc, "projects", batch["project_id"])
    for item in batch["items"]:
        draft = domain.find(doc, "drafts", item["draft_id"])
        account = domain.find(doc, "accounts", item["account_id"])
        if (
            draft["project_id"] != batch["project_id"]
            or account["project_id"] != batch["project_id"]
        ):
            raise PluginAppError("draft_account_mismatch", status=409)
        if draft.get("account_id") not in {None, "", account["id"]}:
            raise PluginAppError("draft_account_mismatch", status=409)
        if account.get("paused"):
            raise PluginAppError("account_paused", status=409)
        domain.ready(ctx, account, kind="publish")
        if any(
            run["device_id"] == account["device_id"] and run["status"] in HOLD | {"waiting"}
            for run in domain.rows(doc, "runs")
        ):
            raise PluginAppError("device_reconciliation_required", status=409)
        operation_key = domain.operation_key("publish", account, draft, {})
        if any(
            domain.matches_operation(run, operation_key)
            and run["status"] in HOLD | {"waiting", "operator_verified", "stopped_unverified"}
            for run in domain.rows(doc, "runs")
        ):
            raise PluginAppError("duplicate_operation", status=409)
        result.append(
            {
                "id": item["id"],
                "draft_id": draft["id"],
                "account_id": account["id"],
                "account_snapshot": domain.account_identity(account),
                "draft_version": draft.get("version"),
                "draft_digest": domain.digest(draft),
                "operation_key": operation_key,
            }
        )
    return result


async def command(ctx: Any, domain: Any, name: str, payload: dict[str, Any]) -> None:
    if name == "batch.cancel":
        domain.confirmed(payload)
        doc = await ctx.read()
        batch = domain.find(doc, "batches", str(payload["id"]))

        def cancel(state: dict[str, Any]) -> None:
            current = domain.find(state, "batches", batch["id"])
            current.update(status="cancelled", updated_at=domain.now())
            for run in domain.rows(state, "runs"):
                if run.get("batch_id") == batch["id"] and run["status"] == "waiting":
                    run.update(status="cancelled", updated_at=domain.now())

        await ctx.update(cancel)
        for run in doc.get("runs", []):
            if run.get("batch_id") == batch["id"] and run["status"] in domain.ACTIVE:
                try:
                    await domain.command(ctx, "run.cancel", {"run_id": run["id"]})
                except Exception:

                    def uncertain(state: dict[str, Any], run_id: str = run["id"]) -> None:
                        current = domain.find(state, "runs", run_id)
                        if current["status"] in domain.ACTIVE:
                            current.update(
                                status="unknown",
                                error="cancel_not_confirmed",
                                updated_at=domain.now(),
                            )

                    await ctx.update(uncertain)
        await ctx.audit(name, batch["id"])
        return
    await ctx.require("xhs.publish")
    if name == "batch.save":
        body = Batch.model_validate(payload).model_dump()
        if not body["name"].strip():
            raise PluginAppError("invalid_input")
        for item in body["items"]:
            item["id"] = item["id"] or uuid4().hex
        if len({item["id"] for item in body["items"]}) != len(body["items"]) or len(
            {(item["draft_id"], item["account_id"]) for item in body["items"]}
        ) != len(body["items"]):
            raise PluginAppError("duplicate_batch_item")

        def save(state: dict[str, Any]) -> None:
            old = next((b for b in domain.rows(state, "batches") if b["id"] == body["id"]), None)
            if old and old.get("status") not in {"draft", "prechecked"}:
                raise PluginAppError("batch_already_started", status=409)
            domain.find(state, "projects", body["project_id"])
            for item in body["items"]:
                draft = domain.find(state, "drafts", item["draft_id"])
                account = domain.find(state, "accounts", item["account_id"])
                if (
                    draft["project_id"] != body["project_id"]
                    or account["project_id"] != body["project_id"]
                    or draft.get("account_id") not in {None, "", account["id"]}
                ):
                    raise PluginAppError("draft_account_mismatch", status=409)
            domain.upsert(state, "batches", {**body, "status": "draft", "precheck": None})

        await ctx.update(save)
    elif name == "batch.precheck":

        def precheck(state: dict[str, Any]) -> None:
            current = _batch(domain, state, payload)
            if current.get("status") not in {"draft", "prechecked"}:
                raise PluginAppError("batch_already_started", status=409)
            items = _preview(ctx, domain, state, current)
            check = {
                "items": items,
                "license_version": ctx.license.version,
                "batch_version": current["version"],
                "nonce": uuid4().hex,
                "expires_at": (datetime.now(UTC) + timedelta(minutes=5)).isoformat(),
            }
            current.update(status="prechecked", precheck={**check, "digest": domain.digest(check)})

        await ctx.update(precheck)
    elif name == "batch.start":
        domain.confirmed(payload)
        if (
            not isinstance(payload.get("idempotency_key"), str)
            or not 8 <= len(payload["idempotency_key"]) <= 200
        ):
            raise PluginAppError("invalid_input")
        batch_id = str(payload["id"])
        started = False

        def enqueue(state: dict[str, Any]) -> None:
            nonlocal started
            current = _batch(domain, state, payload)
            if current.get("idempotency_key") == payload["idempotency_key"]:
                return
            check = current.get("precheck") or {}
            if (
                current.get("status") != "prechecked"
                or check.get("digest") != payload.get("confirm_digest")
                or check.get("license_version") != ctx.license.version
                or datetime.fromisoformat(check["expires_at"]) < datetime.now(UTC)
            ):
                raise PluginAppError("batch_precheck_required", status=409)
            expected = {key: value for key, value in check.items() if key != "digest"}
            if domain.digest(expected) != check["digest"] or check.get("items") != _preview(
                ctx, domain, state, current
            ):
                raise PluginAppError("batch_precheck_required", status=409)
            runs = []
            for item, frozen in zip(current["items"], check["items"], strict=True):
                run_id = uuid4().hex
                item["run_id"] = run_id
                runs.append(
                    {
                        "id": run_id,
                        "task_id": f"xhs_{run_id}",
                        "kind": "publish",
                        "runtime_id": ctx.host.instance_id,
                        "batch_id": batch_id,
                        "batch_item_id": item["id"],
                        "account_id": item["account_id"],
                        "device_id": frozen["account_snapshot"]["device_id"],
                        "draft_id": item["draft_id"],
                        "draft_snapshot": deepcopy(domain.find(state, "drafts", item["draft_id"])),
                        "account_snapshot": deepcopy(frozen["account_snapshot"]),
                        "payload": {},
                        "operation_key": frozen["operation_key"],
                        "operation_key_version": 2,
                        "idempotency_key": f"batch:{batch_id}:{item['id']}",
                        "status": "waiting",
                        "created_at": domain.now(),
                        "updated_at": domain.now(),
                    }
                )
            domain.rows(state, "runs").extend(runs)
            current.update(
                status="running",
                runtime_id=ctx.host.instance_id,
                idempotency_key=payload["idempotency_key"],
                updated_at=domain.now(),
            )
            started = True

        await ctx.update(enqueue)
        if started:
            await advance(ctx, domain, batch_id)
    else:
        raise PluginAppError("unknown_command")
    await ctx.audit(name, str(payload.get("id") or ""))


async def advance(ctx: Any, domain: Any, batch_id: str) -> None:
    await ctx.require("xhs.publish")
    claimed: list[str] = []

    def claim(state: dict[str, Any]) -> None:
        batch = domain.find(state, "batches", batch_id)
        if batch.get("status") in {"cancelled", "interrupted", "completed", "error"}:
            return
        if batch.get("runtime_id") != ctx.host.instance_id:
            raise PluginAppError("batch_reconciliation_required", status=409)
        runs = [r for r in domain.rows(state, "runs") if r.get("batch_id") == batch_id]
        busy = {r["device_id"] for r in domain.rows(state, "runs") if r["status"] in HOLD}
        for run in runs:
            if run["status"] == "waiting" and run["device_id"] not in busy:
                run.update(status="queued", updated_at=domain.now())
                busy.add(run["device_id"])
                claimed.append(run["id"])
        if any(r["status"] in domain.ACTIVE for r in runs):
            batch["status"] = "running"
        elif any(r["status"] == "awaiting_verification" for r in runs):
            batch["status"] = "awaiting_verification"
        elif any(r["status"] in HOLD | {"waiting"} for r in runs):
            batch["status"] = "paused"
        else:
            batch["status"] = "error" if any(r["status"] == "error" for r in runs) else "completed"

    await ctx.update(claim)
    for run_id in claimed:
        ctx.spawn(run_id, _execute(ctx, domain, batch_id, run_id))


async def _execute(ctx: Any, domain: Any, batch_id: str, run_id: str) -> None:
    await domain.execute(ctx, run_id)
    try:
        await advance(ctx, domain, batch_id)
    except PluginAppError:
        # No new work after revocation; the existing evidence and waiting intents remain.
        return


def recover(ctx: Any, domain: Any, state: dict[str, Any]) -> None:
    for batch in domain.rows(state, "batches"):
        if (
            batch.get("runtime_id")
            and batch["runtime_id"] != ctx.host.instance_id
            and batch.get("status") not in {"completed", "cancelled", "error", "interrupted"}
        ):
            batch.update(status="interrupted", updated_at=domain.now())
            for run in domain.rows(state, "runs"):
                if run.get("batch_id") == batch["id"] and run["status"] == "waiting":
                    run.update(
                        status="interrupted",
                        error="restart_reconciliation_required",
                        updated_at=domain.now(),
                    )

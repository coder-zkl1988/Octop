"""Account transfer between members: package, freeze, import, and settling on the sending desktop."""

from __future__ import annotations

import base64
from copy import deepcopy
from types import SimpleNamespace
from typing import Any

import pytest

from tests.unit.test_xhs_app_domain import FakeContext, base_doc, domain

transfers = domain.transfers
PNG = b"\x89PNG\r\n\x1a\ntransfer-image"


class Enterprise:
    """In-memory stand-in for the control plane's transfer endpoints, shared by two desktops."""

    def __init__(self) -> None:
        self.items: list[dict[str, Any]] = []
        self.packages: dict[str, dict[str, Any]] = {}
        self.calls: list[tuple[str, str, dict[str, Any]]] = []

    def view(self, member: str) -> dict[str, Any]:
        out = []
        for item in self.items:
            if item["from_member_id"] == member:
                out.append({**item, "direction": "outgoing"})
            elif item["to_member_id"] == member:
                out.append({**item, "direction": "incoming"})
        return {
            "items": out,
            "members": [{"id": "mb_b", "name": "阿北"}] if member == "mb_a" else [],
        }

    def call(
        self, member: str, method: str, name: str, body: dict[str, Any] | None
    ) -> dict[str, Any]:
        self.calls.append((member, name, deepcopy(body or {})))
        if method == "GET":
            return self.view(member)
        assert body is not None
        if name == "transfers":
            item = {
                "id": f"tr_{len(self.items) + 1}",
                "account_id": body["account_id"],
                "account_name": body["account_name"],
                "from_member_id": member,
                "from_member_name": "林清",
                "to_member_id": body["to_member_id"],
                "to_member_name": "阿北",
                "summary": body["summary"],
                "status": "pending_approval",
                "created_at": domain.now(),
            }
            self.items.append(item)
            self.packages[item["id"]] = deepcopy(body["package"])
            return self.view(member)
        item = next(i for i in self.items if i["id"] == body["transfer_id"])
        action = body["action"]
        item["status"] = {
            "cancel": "cancelled",
            "accept": "accepted",
            "decline": "declined",
            "complete": "completed",
        }[action]
        out: dict[str, Any] = {"transfer": dict(item)}
        if action == "accept":
            out["package"] = deepcopy(self.packages[item["id"]])
        return out

    def decide(self, transfer_id: str, decision: str, note: str = "") -> None:
        item = next(i for i in self.items if i["id"] == transfer_id)
        item.update(status=decision, decision_note=note, decided_by="管理员")


class Desktop(FakeContext):
    def __init__(self, doc: dict[str, Any], enterprise: Enterprise, member: str) -> None:
        super().__init__(doc)
        self.enterprise_server = enterprise
        self.member = member
        self.has_enterprise = True
        self.released: list[str] = []
        self.license = SimpleNamespace(
            active=True,
            version=1,
            limits={"accounts": 10, "devices": 10},
            features=["xhs.content", "xhs.publish", "xhs.ops", "xhs.comment"],
            policy={},
        )

    async def enterprise(
        self, method: str, name: str, body: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        return self.enterprise_server.call(self.member, method, name, body)

    async def release_capacity(self, account_id: str) -> None:
        self.released.append(account_id)

    async def audit(self, action: str, target: str) -> None:
        self.audit_events.append((action, target))


async def sender_doc(ctx_assets: FakeContext) -> dict[str, Any]:
    doc = base_doc()
    image = await ctx_assets.save_asset(base64.b64encode(PNG).decode(), "image/png")
    image = {"filename": "a.png", "mime_type": "image/png", **image}
    doc["drafts"] = [
        {**doc["drafts"][0], "images": [image], "review_status": "scheduled", "scheduled_at": "x"},
        {
            **doc["drafts"][0],
            "id": "d_pub",
            "title": "已发布",
            "images": [],
            "review_status": "published",
            "note_url": "https://example.com/n",
        },
    ]
    doc["authorizations"] = [
        {"id": "c1", "person": "小王", "account_ids": ["a1", "a9"], "status": "active"},
        {"id": "c_other", "person": "小李", "account_ids": ["a9"], "status": "active"},
    ]
    doc["materials"] = [
        {
            "id": "m1",
            "owner": "account",
            "account_ids": ["a1"],
            "consent_id": "c1",
            "images": [image],
        },
        {"id": "m_shared", "owner": "shared", "account_ids": ["a1", "a9"]},
        {"id": "m_public", "owner": "public", "account_ids": []},
    ]
    doc["leads"] = [{"id": "l1", "account_id": "a1", "comment": "多少钱", "status": "new"}]
    doc["reply_items"] = [
        {"id": "r1", "account_id": "a1", "status": "new", "text": "好看"},
        {"id": "r_sent", "account_id": "a1", "status": "sent", "text": "谢谢"},
    ]
    doc["content_tasks"] = [{"id": "t1", "account_id": "a1", "status": "to_make", "title": "咖啡"}]
    return doc


@pytest.mark.asyncio
async def test_account_moves_to_a_colleague_and_leaves_the_sender() -> None:
    enterprise = Enterprise()
    sender = Desktop({}, enterprise, "mb_a")
    sender.doc = await sender_doc(sender)
    receiver = Desktop({"version": 0, "projects": [], "accounts": []}, enterprise, "mb_b")

    await domain.command(sender, "transfer.sync", {})
    snap = transfers.snapshot(sender.doc)
    assert snap["members"] == [{"id": "mb_b", "name": "阿北"}]

    await domain.command(
        sender,
        "transfer.create",
        {"account_id": "a1", "to_member_id": "mb_b", "note": "交接", "confirmed": True},
    )
    account = sender.doc["accounts"][0]
    assert account["transfer"]["status"] == "pending_approval"
    package = next(iter(enterprise.packages.values()))
    assert package["summary"] == {
        "drafts": 1,
        "materials": 2,
        "authorizations": 1,
        "leads": 1,
        "images": 1,
    }
    # The phone binding never leaves the sender's desktop.
    assert "device_id" not in package["account"] and "authorized_at" not in package["account"]
    assert [h["title"] for h in package["history"] if h["kind"] == "publish"] == ["已发布"]

    # Frozen: no edits, no phone work, not twice.
    with pytest.raises(domain.PluginAppError, match="account_transferring"):
        await domain.command(sender, "plan.update", {"action": "approve", "ids": ["d1"]})
    with pytest.raises(domain.PluginAppError, match="account_transferring"):
        domain.ready(sender, account)
    with pytest.raises(domain.PluginAppError, match="transfer_already_open"):
        await domain.command(
            sender,
            "transfer.create",
            {"account_id": "a1", "to_member_id": "mb_b", "confirmed": True},
        )

    enterprise.decide("tr_1", "approved")
    await domain.command(receiver, "transfer.sync", {})
    alerts = domain.workspace.alerts(receiver, receiver.doc)
    assert any(a["code"] == "transfer_incoming" for a in alerts)

    await domain.command(receiver, "transfer.accept", {"transfer_id": "tr_1", "confirmed": True})
    assert [c[2].get("action") for c in enterprise.calls if c[1] == "transfer-actions"] == [
        "accept",
        "complete",
    ]
    imported = receiver.doc["accounts"][0]
    assert imported["id"] == "a1" and imported["device_id"] == ""
    assert imported["authorized_at"] is None and imported["platform_account_id"] == "secret-account"
    assert imported["transferred_in"]["from_member_name"] == "林清"
    assert receiver.doc["projects"][0]["id"] == imported["project_id"]
    draft = receiver.doc["drafts"][0]
    assert draft["review_status"] == "pending_review" and "scheduled_at" not in draft
    assert draft["images"][0]["asset_url"].startswith("/api/plugin-apps/xhs-ops/assets/")
    assert {m["id"]: m["account_ids"] for m in receiver.doc["materials"]} == {
        "m1": ["a1"],
        "m_shared": ["a1"],
    }
    assert receiver.doc["authorizations"][0]["account_ids"] == ["a1"]
    assert [r["id"] for r in receiver.doc["reply_items"]] == ["r1"]
    assert receiver.doc["leads"][0]["account_id"] == "a1"
    # Nothing runs until the receiver binds a phone and confirms the identity again.
    assert imported["identity_confirmed_at"] is None and imported["plan_confirmed"] is False

    await domain.command(sender, "transfer.sync", {})
    assert sender.doc["accounts"] == []
    assert [d["id"] for d in sender.doc["drafts"]] == ["d_pub"]
    assert {m["id"]: m["account_ids"] for m in sender.doc["materials"]} == {
        "m_shared": ["a9"],
        "m_public": [],
    }
    assert {c["id"] for c in sender.doc["authorizations"]} == {"c1", "c_other"}
    assert [r["id"] for r in sender.doc["reply_items"]] == []
    assert sender.released == ["a1"]


@pytest.mark.asyncio
async def test_rejected_transfer_unfreezes_the_account() -> None:
    enterprise = Enterprise()
    sender = Desktop(base_doc(), enterprise, "mb_a")
    await domain.command(
        sender, "transfer.create", {"account_id": "a1", "to_member_id": "mb_b", "confirmed": True}
    )
    enterprise.decide("tr_1", "rejected", "先别交接")
    await domain.command(sender, "transfer.sync", {})
    account = sender.doc["accounts"][0]
    assert "transfer" not in account
    assert account["transfer_returned"]["note"] == "先别交接"
    assert any(
        a["code"] == "transfer_rejected" for a in domain.workspace.alerts(sender, sender.doc)
    )
    domain.ready(sender, account)


@pytest.mark.asyncio
async def test_transfer_waits_for_running_work_and_needs_enterprise() -> None:
    enterprise = Enterprise()
    sender = Desktop(base_doc(), enterprise, "mb_a")
    sender.doc["runs"] = [{"id": "r", "account_id": "a1", "status": "running", "kind": "publish"}]
    with pytest.raises(domain.PluginAppError, match="account_busy"):
        await domain.command(
            sender,
            "transfer.create",
            {"account_id": "a1", "to_member_id": "mb_b", "confirmed": True},
        )
    sender.has_enterprise = False
    with pytest.raises(domain.PluginAppError, match="enterprise_backend_unavailable"):
        await domain.command(sender, "transfer.sync", {})


@pytest.mark.asyncio
async def test_a_lost_completion_is_finished_without_importing_twice() -> None:
    enterprise = Enterprise()
    sender = Desktop(base_doc(), enterprise, "mb_a")
    receiver = Desktop({"version": 0, "projects": [], "accounts": []}, enterprise, "mb_b")
    receiver.doc["projects"] = [{"id": "p_mine", "version": 3, "name": "我的项目"}]
    await domain.command(
        sender, "transfer.create", {"account_id": "a1", "to_member_id": "mb_b", "confirmed": True}
    )
    enterprise.decide("tr_1", "approved")
    await domain.command(
        receiver,
        "transfer.accept",
        {"transfer_id": "tr_1", "project_id": "p_mine", "confirmed": True},
    )
    assert receiver.doc["accounts"][0]["project_id"] == "p_mine"
    assert len(receiver.doc["projects"]) == 1
    enterprise.items[0]["status"] = "accepted"  # the completion never arrived
    await domain.command(receiver, "transfer.accept", {"transfer_id": "tr_1", "confirmed": True})
    assert len(receiver.doc["accounts"]) == 1
    assert enterprise.items[0]["status"] == "completed"


@pytest.mark.asyncio
async def test_package_size_is_limited(monkeypatch: pytest.MonkeyPatch) -> None:
    enterprise = Enterprise()
    sender = Desktop({}, enterprise, "mb_a")
    sender.doc = await sender_doc(sender)
    monkeypatch.setattr(transfers, "ASSET_LIMIT", 4)
    with pytest.raises(domain.PluginAppError, match="transfer_package_too_large"):
        await domain.command(
            sender,
            "transfer.create",
            {"account_id": "a1", "to_member_id": "mb_b", "confirmed": True},
        )
    assert "transfer" not in sender.doc["accounts"][0]

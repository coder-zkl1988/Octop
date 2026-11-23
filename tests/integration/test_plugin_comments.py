"""Real authenticated HTTP gates for the paid comment workflow."""

from __future__ import annotations

import asyncio
from typing import Any

from octop.infra.plugin_apps.host import AppContext
from tests.integration.test_plugin_apps import paid_app as imported_paid_app

paid_app = imported_paid_app


async def seed(server: Any) -> AppContext:
    ctx = await server.plugin_apps.context("xhs-ops", 1)
    module = server.plugin_apps.module("xhs-ops")
    date = module.comments.local_now(ctx, module).date().isoformat()
    await ctx.update(
        lambda s: s.update(
            projects=[
                {
                    "id": "p1",
                    "version": 1,
                    "name": "Project",
                    "ops_notes": {"forbidden_topics": ["品牌"]},
                }
            ],
            accounts=[
                {
                    "id": "a1",
                    "name": "Account",
                    "version": 1,
                    "project_id": "p1",
                    "device_id": "d1",
                    "platform_account_id": "PRIVATE_BINDING",
                    "operation_settings": {
                        "interaction": {"comment": {"enabled": True, "daily_cap": 2}}
                    },
                }
            ],
            runs=[
                {
                    "id": "browse",
                    "kind": "nurture",
                    "status": "success",
                    "runtime_id": ctx.host.instance_id,
                    "account_id": "a1",
                    "device_id": "d1",
                    "date": date,
                    "payload": {"secret": "PRIVATE_PLAN"},
                    "chunks": [
                        {
                            "index": 0,
                            "status": "completed",
                            "result_basis": "validated_phone_receipt",
                            "evidence_url": "/proof",
                            "browsed": 8,
                            "observation": "PRIVATE_OBSERVATION",
                            "posts": [
                                {
                                    "title": "通勤穿搭",
                                    "author": "作者甲",
                                    "summary": "清爽配色",
                                    "comment_worthy": True,
                                    "action": "none",
                                }
                            ],
                        }
                    ],
                }
            ],
        )
    )
    return ctx


async def test_comment_only_member_gets_eligible_source_snippets_without_ops_payloads(
    paid_app: Any, monkeypatch: Any
) -> None:
    client, server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.comment"])
    await seed(server)
    response = await client.get("/api/plugin-apps/xhs-ops/snapshot", headers=auth)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["comment_sources"][0]["post"] == {
        "title": "通勤穿搭",
        "author": "作者甲",
        "summary": "清爽配色",
    }
    assert data["comment_quotas"][0]["cap"] == 1
    assert "PRIVATE" not in str(data)
    assert "operation_days" not in data and "projects" not in data
    calls = []

    async def model(self: Any, system: str, prompt: str, **kwargs: Any) -> str:
        calls.append((system, prompt, kwargs))
        return '{"candidates":["配色好清爽","免费领取"]}'

    monkeypatch.setattr(AppContext, "generate_text", model)
    generated = await client.post(
        "/api/plugin-apps/xhs-ops/commands",
        headers=auth,
        json={
            "command": "comment.generate",
            "payload": {"run_id": "browse", "model_ref": "writer"},
        },
    )
    assert generated.status_code == 200, generated.text
    assert generated.json()["data"]["comments"][0]["candidates"] == ["配色好清爽"]
    assert len(calls) == 1 and calls[0][2] == {"model_ref": "writer"}
    other = await server.plugin_apps.snapshot("xhs-ops", 2)
    assert other["data"]["comments"] == [] and other["data"]["comment_sources"] == []
    grant.update(features=["xhs.analytics"])
    assert (
        "comment_sources"
        not in (await client.get("/api/plugin-apps/xhs-ops/snapshot", headers=auth)).json()["data"]
    )


async def test_http_approval_reserves_one_slot_atomically_and_rechecks_changed_rules(
    paid_app: Any,
) -> None:
    client, server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.comment"])
    ctx = await seed(server)
    endpoint = "/api/plugin-apps/xhs-ops/commands"
    ids = []
    for text in ["配色好清爽", "口袋很实用"]:
        response = await client.post(
            endpoint,
            headers=auth,
            json={
                "command": "comment.save",
                "payload": {
                    "account_id": "a1",
                    "post": {"title": text, "author": "作者甲"},
                    "text": text,
                },
            },
        )
        assert response.status_code == 200
        ids.append(response.json()["data"]["comments"][-1]["id"])
    results = await asyncio.gather(
        *(
            client.post(
                endpoint,
                headers=auth,
                json={
                    "command": "comment.review",
                    "payload": {"id": item_id, "version": 1, "decision": "approved"},
                },
            )
            for item_id in ids
        )
    )
    assert sorted(r.status_code for r in results) == [200, 409]
    state = await ctx.read()
    approved = next(c for c in state["comments"] if c["status"] == "approved")
    await ctx.update(lambda s: s["projects"][0].update(version=2))
    denied = await client.post(
        endpoint,
        headers=auth,
        json={
            "command": "comment.precheck",
            "payload": {"id": approved["id"], "version": approved["version"]},
        },
    )
    assert denied.status_code == 409
    assert denied.json()["error"]["details"]["reason"] == "comment_review_required"
    grant.update(features=["xhs.analytics"])
    assert (
        await client.post(
            endpoint,
            headers=auth,
            json={"command": "comment.generate", "payload": {"run_id": "browse"}},
        )
    ).status_code == 403


async def test_revoked_member_can_close_owned_comment_evidence_but_cannot_send_again(
    paid_app: Any,
) -> None:
    client, server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.comment"])
    ctx = await seed(server)
    evidence = await ctx.save_evidence("comment-run", b"evidence")
    await ctx.update(
        lambda s: (
            s["runs"].append(
                {
                    "id": "comment-run",
                    "kind": "comment",
                    "status": "awaiting_verification",
                    "device_id": "d1",
                    "account_id": "a1",
                    "payload": {
                        "comment_id": "c1",
                        "text": "配色好清爽",
                        "post": {"title": "通勤穿搭", "author": "作者甲", "summary": ""},
                    },
                    "evidence_url": evidence,
                    "updated_at": "2026-11-04T10:00:00+00:00",
                    "created_at": "2026-11-04T10:00:00+00:00",
                }
            ),
            s.update(
                comments=[
                    {
                        "id": "c1",
                        "version": 1,
                        "status": "awaiting_verification",
                        "account_id": "a1",
                        "sent_run_id": "comment-run",
                        "text": "配色好清爽",
                        "created_at": "2026-11-04T10:00:00+00:00",
                    }
                ]
            ),
        )
    )
    grant.update(status="revoked", features=[], read_features=["xhs.comment"])
    payload = {
        "id": "c1",
        "version": 1,
        "confirmed": True,
        "account_checked": True,
        "post_checked": True,
        "text_checked": True,
        "evidence_url": evidence,
        "reference": "已核对手机中的本人评论",
    }
    closed = await client.post(
        "/api/plugin-apps/xhs-ops/commands",
        headers=auth,
        json={"command": "comment.verify", "payload": payload},
    )
    assert closed.status_code == 200, closed.text
    assert closed.json()["read_only"] and closed.json()["data"]["comments"][0]["status"] == "sent"
    denied = await client.post(
        "/api/plugin-apps/xhs-ops/commands",
        headers=auth,
        json={"command": "comment.send", "payload": payload},
    )
    assert denied.status_code == 403

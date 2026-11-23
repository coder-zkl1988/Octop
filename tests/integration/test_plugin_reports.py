"""Licensed reports expose scoped aggregates without private phone content."""

from typing import Any

import pytest

from octop.infra.plugin_apps.contracts import PluginAppError
from tests.integration.test_plugin_apps import paid_app as imported_paid_app

paid_app = imported_paid_app


async def test_analytics_http_response_is_aggregated_and_member_scoped(paid_app: Any) -> None:
    client, server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.analytics"])
    ctx = await server.plugin_apps.context("xhs-ops", 1)
    module = server.plugin_apps.module("xhs-ops")
    await ctx.update(
        lambda state: state.update(
            accounts=[
                {
                    "id": "a1",
                    "project_id": "p1",
                    "name": "private-name",
                    "platform_account_id": "private-xhs-id",
                    "device_id": "private-phone",
                }
            ],
            runs=[
                {
                    "id": "r1",
                    "kind": "nurture",
                    "date": module.daily.today(ctx),
                    "account_id": "a1",
                    "status": "success",
                    "created_at": module.now(),
                    "chunks": [
                        {
                            "mode": "search",
                            "keyword": "运动",
                            "planned": 2,
                            "browsed": 2,
                            "status": "completed",
                            "result_basis": "validated_phone_receipt",
                            "evidence_url": "/private-proof",
                            "interactions": {"like": 1},
                            "posts": [{"title": "private-content"}],
                            "observation": "private-observation",
                        }
                    ],
                }
            ],
        )
    )
    response = await client.get("/api/plugin-apps/xhs-ops/snapshot", headers=auth)
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["reports"]["totals"]["browsed"] == 2
    assert data["reports"]["totals"]["like"] == 1
    assert "accounts" not in data
    for value in (
        "private-name",
        "private-xhs-id",
        "private-phone",
        "/private-proof",
        "private-content",
        "private-observation",
    ):
        assert value not in response.text
    other = await server.plugin_apps.snapshot("xhs-ops", 2)
    assert other["data"]["reports"]["totals"]["browsed"] == 0
    assert other["data"]["reports"]["accounts"] == []


async def test_operations_assignment_does_not_implicitly_grant_analytics(paid_app: Any) -> None:
    client, _server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.ops"])
    response = await client.get("/api/plugin-apps/xhs-ops/snapshot", headers=auth)
    assert response.status_code == 200
    assert "reports" not in response.json()["data"]


async def test_operator_notes_are_versioned_scoped_and_never_dispatch_work(paid_app: Any) -> None:
    client, server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.analytics"])
    host = server.plugin_apps
    ctx = await host.context("xhs-ops", 1)
    await ctx.update(
        lambda state: state.update(
            runs=[
                {
                    "id": "r1",
                    "kind": "nurture",
                    "account_id": "a1",
                    "status": "success",
                    "date": "2026-11-04",
                    "chunks": [],
                }
            ]
        )
    )
    endpoint = "/api/plugin-apps/xhs-ops/commands"
    payload = {
        "command": "run.note",
        "payload": {"run_id": "r1", "version": 0, "notes": "已人工复核推荐流，继续观察"},
    }
    response = await client.post(endpoint, headers=auth, json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["data"]["run_notes"] == [
        {"run_id": "r1", "version": 1, "notes": payload["payload"]["notes"]}
    ]
    assert not host.tasks
    assert (await ctx.read())["runs"][0]["status"] == "success"
    conflict = await client.post(endpoint, headers=auth, json=payload)
    assert conflict.status_code == 409
    assert conflict.json()["error"]["details"]["reason"] == "version_conflict"
    with pytest.raises(PluginAppError, match="not_found"):
        await host.command("xhs-ops", 2, "run.note", payload["payload"])
    grant.update(status="revoked", features=[])
    assert (await client.post(endpoint, headers=auth, json=payload)).status_code == 403
    assert (await ctx.read())["runs"][0]["note_version"] == 1

"""Paid app gates apply to HTTP, runtime tools, scope and persisted state."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from langchain_core.tools import StructuredTool

from octop.infra.agents.plugins.bundled import default_bundled_plugins_root
from octop.infra.plugin_apps.contracts import PluginAppError, PluginLicense
from octop.infra.plugin_apps.host import AppContext, digest_scope


@pytest.fixture
async def paid_app(env: Any, monkeypatch: Any) -> Any:
    client, server, auth = env
    assert server.plugin_manager is not None
    # xhs-ops is shipped as a paid bundled plugin.  The integration suite
    # disables remote marketplace access, so install the exact bundled source
    # tree instead of making the fixture depend on the public portal.
    server.plugin_manager.install_path(
        default_bundled_plugins_root() / "xhs-ops",
        force=True,
        expect_id="xhs-ops",
    )
    # Live authority stub; the production code must re-read this before dispatch.
    entitlement: dict[str, Any] = {
        "plugin_id": "xhs-ops",
        "tenant_id": "t1",
        "member_id": "m1",
        "status": "inactive",
        "version": 0,
        "features": [],
        "limits": {"accounts": 2, "devices": 2},
        "expires_at": None,
    }
    object.__setattr__(
        server.services.config, "enterprise_backend_url", "http://enterprise.invalid"
    )

    async def authority(_server: Any, user_id: int, method: str, path: str, **_: Any) -> Any:
        assert method == "GET"
        if path == "/desktop/v1/me":
            return {"tenant": {"id": "t1"}, "member": {"id": f"m{user_id}"}}
        return {
            **entitlement,
            "member_id": f"m{user_id}",
            "read_features": entitlement.get(
                "read_features",
                entitlement["features"] if entitlement["status"] in {"active", "trial"} else [],
            ),
        }

    monkeypatch.setattr("octop.infra.plugin_apps.host.enterprise_request", authority)
    yield client, server, auth, entitlement


async def test_admin_and_install_do_not_grant_paid_access(paid_app: Any) -> None:
    client, _server, auth, grant = paid_app
    listing = await client.get("/api/plugin-apps", headers=auth)
    assert listing.status_code == 200
    assert listing.json()[0]["license"]["status"] == "inactive"
    denied = await client.post(
        "/api/plugin-apps/xhs-ops/commands",
        headers=auth,
        json={"command": "project.save", "payload": {"name": "not purchased"}},
    )
    assert denied.status_code == 403
    assert denied.json()["error"]["details"]["reason"] == "license_required"
    grant.update(status="active", features=["xhs.content"])
    allowed = await client.post(
        "/api/plugin-apps/xhs-ops/commands",
        headers=auth,
        json={"command": "project.save", "payload": {"name": "paid project"}},
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["data"]["projects"][0]["name"] == "paid project"


async def test_typed_xhs_facade_reuses_the_plugin_license_boundary(paid_app: Any) -> None:
    client, _server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.content"])
    project = await client.post(
        "/api/plugin-apps/xhs-ops/commands",
        headers=auth,
        json={"command": "project.save", "payload": {"name": "typed facade"}},
    )
    assert project.status_code == 200, project.text
    listed = await client.get("/api/xhs-ops/projects", headers=auth)
    assert listed.status_code == 200
    assert listed.json()["projects"][0]["name"] == "typed facade"
    project_id = listed.json()["projects"][0]["id"]
    suggestions = await client.get(f"/api/xhs-ops/projects/{project_id}/plan-suggest", headers=auth)
    assert suggestions.status_code == 200
    playbook = await client.get("/api/xhs-ops/playbook", headers=auth)
    assert playbook.status_code == 200
    assert playbook.json()["bundleVersion"] == 66


async def test_revoke_and_expiry_stop_writes_keep_history(paid_app: Any) -> None:
    client, _server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.content"])
    endpoint = "/api/plugin-apps/xhs-ops/commands"
    assert (
        await client.post(
            endpoint, headers=auth, json={"command": "project.save", "payload": {"name": "history"}}
        )
    ).status_code == 200
    grant.update(status="revoked", features=[], read_features=["xhs.content"])
    read = await client.get("/api/plugin-apps/xhs-ops/snapshot", headers=auth)
    assert read.status_code == 200 and read.json()["read_only"]
    assert read.json()["data"]["projects"][0]["name"] == "history"
    assert (
        await client.post(
            endpoint, headers=auth, json={"command": "project.save", "payload": {"name": "blocked"}}
        )
    ).status_code == 403
    grant.update(
        status="active",
        features=["xhs.content"],
        expires_at=(datetime.now(UTC) - timedelta(seconds=1)).isoformat(),
    )
    assert (
        await client.post(
            endpoint, headers=auth, json={"command": "project.save", "payload": {"name": "expired"}}
        )
    ).status_code == 403


async def test_scope_and_compare_and_set_prevent_data_leaks(paid_app: Any) -> None:
    _client, server, _auth, grant = paid_app
    grant.update(status="active", features=["xhs.content"])
    host = server.plugin_apps
    one = AppContext(host, "xhs-ops", 1, PluginLicense.model_validate(grant))
    two = AppContext(host, "xhs-ops", 2, PluginLicense.model_validate({**grant, "member_id": "m2"}))
    other_tenant = AppContext(
        host, "xhs-ops", 1, PluginLicense.model_validate({**grant, "tenant_id": "t2"})
    )
    await one.update(lambda d: d.update(secret="scoped"))
    assert "secret" not in await two.read()
    assert "secret" not in await other_tenant.read()
    repo = server.services.plugin_state_repo
    old = repo.get(one.key)
    assert old is not None
    assert repo.compare_and_set(one.key, old, json.dumps({"version": 2}))
    assert not repo.compare_and_set(one.key, old, json.dumps({"version": 3}))


async def test_runtime_tools_recheck_authority_and_have_no_sync_bypass(
    paid_app: Any, monkeypatch: Any
) -> None:
    _client, server, _auth, grant = paid_app

    async def xhs_workbench() -> str:
        return "ok"

    tool = StructuredTool.from_function(
        coroutine=xhs_workbench, name="xhs_workbench", description="test"
    )
    server.plugin_apps.guard_tools([tool])
    assert tool.func is None
    monkeypatch.setattr("langgraph.config.get_config", lambda: {"configurable": {"user": 1}})
    with pytest.raises(PluginAppError, match="license_required"):
        await tool.coroutine()  # type: ignore[misc]
    grant.update(status="active", features=["xhs.content"])
    assert await tool.coroutine() == "ok"  # type: ignore[misc]
    grant.update(features=["xhs.ops"])
    assert await tool.coroutine() == "ok"  # type: ignore[misc]
    grant.update(status="revoked", features=[])
    with pytest.raises(PluginAppError):
        await tool.coroutine()  # type: ignore[misc]


async def test_disabled_plugin_rejects_existing_tool_and_direct_command(paid_app: Any) -> None:
    client, server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.content"])
    server.plugin_manager.set_enabled("xhs-ops", False)
    reply = await client.post(
        "/api/plugin-apps/xhs-ops/commands",
        headers=auth,
        json={"command": "project.save", "payload": {"name": "disabled"}},
    )
    assert reply.status_code == 409


async def test_tenant_capacity_shared_between_members(paid_app: Any) -> None:
    _client, server, _auth, grant = paid_app
    grant.update(status="active", features=["xhs.ops"], limits={"accounts": 1, "devices": 1})
    one = AppContext(server.plugin_apps, "xhs-ops", 1, PluginLicense.model_validate(grant))
    two = AppContext(
        server.plugin_apps, "xhs-ops", 2, PluginLicense.model_validate({**grant, "member_id": "m2"})
    )
    await one.reserve_capacity("a1", "d1")
    with pytest.raises(PluginAppError):
        await two.reserve_capacity("a2", "d2")
    await one.release_capacity("a1")
    await two.reserve_capacity("a2", "d2")


async def test_unbound_persona_accounts_consume_account_capacity_without_device_capacity(
    paid_app: Any,
) -> None:
    _client, server, _auth, grant = paid_app
    grant.update(status="active", features=["xhs.ops"], limits={"accounts": 2, "devices": 0})
    context = await server.plugin_apps.context("xhs-ops", 1)
    await context.reserve_capacity("new-1", "")
    await context.reserve_capacity("new-2", "")
    with pytest.raises(PluginAppError, match="account_limit"):
        await context.reserve_capacity("new-3", "")
    with pytest.raises(PluginAppError, match="device_limit"):
        await context.reserve_capacity("new-1", "phone-1")
    await context.release_capacity("new-1")
    await context.reserve_capacity("new-3", "")


async def test_related_plugin_documents_roll_back_together_on_cas_conflict(paid_app: Any) -> None:
    _client, server, _auth, _grant = paid_app
    repo = server.services.plugin_state_repo
    assert repo.compare_and_set("pair1", None, "first")
    assert repo.compare_and_set("pair2", None, "second")
    assert not repo.compare_and_set_many(
        [("pair1", "first", "updated"), ("pair2", "stale", "changed")]
    )
    assert repo.get("pair1") == "first" and repo.get("pair2") == "second"
    assert not repo.compare_and_set_many(
        [("new-pair", None, "created"), ("pair2", "stale", "changed")]
    )
    assert repo.get("new-pair") is None


async def test_account_capacity_is_unchanged_when_account_update_fails(paid_app: Any) -> None:
    _client, server, _auth, grant = paid_app
    grant.update(status="active", features=["xhs.ops"])
    ctx = await server.plugin_apps.context("xhs-ops", 1)
    await ctx.update_account(
        "a", lambda state: state.update(accounts=[{"id": "a", "device_id": "old"}])
    )
    repo = server.services.plugin_state_repo
    capacity_key = "plugin-capacity:" + digest_scope(["xhs-ops", "t1"])
    previous = repo.get(ctx.key), repo.get(capacity_key)

    def broken(state: dict[str, Any]) -> None:
        state["accounts"][0]["device_id"] = "new"
        raise PluginAppError("version_conflict", status=409)

    with pytest.raises(PluginAppError, match="version_conflict"):
        await ctx.update_account("a", broken)
    assert (repo.get(ctx.key), repo.get(capacity_key)) == previous


async def test_concurrent_account_saves_reject_a_shared_old_version(
    paid_app: Any, monkeypatch: Any
) -> None:
    client, server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.ops"])
    ctx = await server.plugin_apps.context("xhs-ops", 1)
    await ctx.update(lambda state: state.update(projects=[{"id": "p", "version": 1, "name": "P"}]))
    await ctx.update_account(
        "a",
        lambda state: state.update(
            accounts=[
                {
                    "id": "a",
                    "version": 1,
                    "project_id": "p",
                    "name": "A",
                    "entry_mode": "new",
                    "device_id": "",
                    "platform_account_id": "",
                }
            ]
        ),
    )
    barrier = asyncio.Barrier(2)
    original = AppContext.read
    initial_reads = 0

    async def read(self: AppContext) -> dict[str, Any]:
        nonlocal initial_reads
        value = await original(self)
        initial_reads += 1
        if initial_reads <= 2:
            await barrier.wait()
        return value

    monkeypatch.setattr(AppContext, "read", read)

    async def save(name: str) -> Any:
        return await client.post(
            "/api/plugin-apps/xhs-ops/commands",
            headers=auth,
            json={
                "command": "account.save",
                "payload": {
                    "id": "a",
                    "version": 1,
                    "project_id": "p",
                    "name": name,
                    "entry_mode": "new",
                    "device_id": "",
                    "platform_account_id": "",
                },
            },
        )

    responses = await asyncio.gather(save("first"), save("second"))
    assert sorted(response.status_code for response in responses) == [200, 409]
    saved = await original(ctx)
    assert saved["accounts"][0]["version"] == 2


async def test_model_catalog_requires_active_license(paid_app: Any) -> None:
    client, _server, auth, grant = paid_app
    endpoint = "/api/plugin-apps/xhs-ops/models"
    assert (await client.get(endpoint, headers=auth)).status_code == 403
    grant.update(status="active", features=["xhs.ops"])
    response = await client.get(endpoint, headers=auth)
    assert response.status_code == 200 and response.json() == []


async def test_image_model_catalog_requires_active_license(paid_app: Any) -> None:
    client, _server, auth, grant = paid_app
    endpoint = "/api/plugin-apps/xhs-ops/image-models"
    assert (await client.get(endpoint, headers=auth)).status_code == 403
    grant.update(status="active", features=["xhs.content"])
    response = await client.get(endpoint, headers=auth)
    assert response.status_code == 200 and response.json() == []


async def test_batch_commands_require_publish_entitlement_even_for_admin(paid_app: Any) -> None:
    client, _server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.content"])
    response = await client.post(
        "/api/plugin-apps/xhs-ops/commands",
        headers=auth,
        json={
            "command": "batch.start",
            "payload": {"id": "not-authorized", "confirmed": True},
        },
    )
    assert response.status_code == 403
    assert response.json()["error"]["details"]["reason"] == "license_required"


async def test_license_scope_mismatch_fails_closed(paid_app: Any, monkeypatch: Any) -> None:
    _client, server, _auth, grant = paid_app
    grant.update(status="active", features=["xhs.content"])

    async def wrong(_server: Any, _user_id: int, _method: str, path: str, **_: Any) -> Any:
        return (
            grant
            if path.endswith("license")
            else {"tenant": {"id": "different"}, "member": {"id": "m1"}}
        )

    monkeypatch.setattr("octop.infra.plugin_apps.host.enterprise_request", wrong)
    with pytest.raises(PluginAppError, match="license_invalid"):
        await server.plugin_apps.context("xhs-ops", 1)


async def test_snapshot_filters_paid_collections_and_phone_evidence(paid_app: Any) -> None:
    client, server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.analytics"])
    ctx = await server.plugin_apps.context("xhs-ops", 1)
    await ctx.update(
        lambda d: d.update(
            projects=[{"id": "p", "business": "private"}],
            accounts=[{"id": "a", "platform_account_id": "secret"}],
            drafts=[{"id": "d", "content": "private"}],
            comments=[{"id": "c", "text": "private"}],
            runs=[
                {
                    "id": "r",
                    "kind": "publish",
                    "status": "unknown",
                    "evidence": {"private": "hidden"},
                }
            ],
        )
    )
    data = (await client.get("/api/plugin-apps/xhs-ops/snapshot", headers=auth)).json()["data"]
    assert set(data) == {"version", "runs", "reports", "run_notes"}
    assert data["run_notes"] == []
    assert data["runs"] == [{"id": "r", "kind": "publish", "status": "unknown"}]
    assert data["reports"]["totals"]["runs"] == 0
    assert "private" not in json.dumps(data["reports"])
    grant.update(features=["xhs.publish"])
    data = (await client.get("/api/plugin-apps/xhs-ops/snapshot", headers=auth)).json()["data"]
    assert "platform_account_id" not in data["accounts"][0]
    assert "comments" not in data
    url = await ctx.save_evidence("r", b"jpeg")
    assert (await client.get(url, headers=auth)).content == b"jpeg"
    grant.update(features=["xhs.analytics"])
    assert (await client.get(url, headers=auth)).status_code == 403
    grant.update(features=["xhs.publish"])
    assert (await client.get(url)).status_code == 401


async def test_audience_profile_http_requires_ops_and_explicit_versioned_confirmation(
    paid_app: Any,
) -> None:
    client, _server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.content", "xhs.ops"])
    endpoint = "/api/plugin-apps/xhs-ops/commands"
    created = await client.post(
        endpoint,
        headers=auth,
        json={
            "command": "project.save",
            "payload": {
                "name": "通勤服饰",
                "business": {"industry": "服装", "product": "通勤服"},
                "audience": {"age_range": "25–34", "gender_ratio": "均衡", "regions": ["上海"]},
            },
        },
    )
    assert created.status_code == 200, created.text
    project = created.json()["data"]["projects"][0]
    payload = {
        "project_id": project["id"],
        "version": project["version"],
        "profile": {
            "summary": "城市通勤人群",
            "base": {"age_range": "25–34", "gender_ratio": "均衡", "regions": ["上海"]},
            "vertical_interests": ["穿搭"],
            "general_interests": ["旅行"],
        },
        "confirmed": True,
    }
    grant.update(features=["xhs.content"])
    denied = await client.post(
        endpoint, headers=auth, json={"command": "profile.confirm", "payload": payload}
    )
    assert denied.status_code == 403
    grant.update(features=["xhs.ops"])
    confirmed = await client.post(
        endpoint, headers=auth, json={"command": "profile.confirm", "payload": payload}
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["data"]["projects"][0]["profile"]["confirmed_at"]
    stale = await client.post(
        endpoint, headers=auth, json={"command": "profile.confirm", "payload": payload}
    )
    assert stale.status_code == 409

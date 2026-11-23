from __future__ import annotations

import base64
from typing import Any

import pytest

from octop.infra.plugin_apps.contracts import PluginAppError, PluginLicense
from octop.infra.plugin_apps.host import AppContext
from tests.integration.test_plugin_apps import paid_app as imported_paid_app

paid_app = imported_paid_app
PNG = b"\x89PNG\r\n\x1a\nprivate-image"


async def seed_asset(ctx: AppContext) -> dict[str, Any]:
    await ctx.require("xhs.content")
    asset = await ctx.save_asset(base64.b64encode(PNG).decode(), "image/png")
    await ctx.update(lambda state: state.update(drafts=[{"id": "draft", "images": [asset]}]))
    return asset


async def test_asset_http_read_requires_authentication_and_visible_collection(
    paid_app: Any,
) -> None:
    client, server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.content"])
    ctx = await server.plugin_apps.context("xhs-ops", 1)
    asset = await seed_asset(ctx)
    assert ".app-assets" not in {item["id"] for item in server.plugin_manager.list_installed()}
    response = await client.get(asset["asset_url"], headers=auth)
    assert response.status_code == 200
    assert response.content == PNG and response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert (await client.get(asset["asset_url"])).status_code == 401
    grant.update(features=["xhs.publish"])
    assert (await client.get(asset["asset_url"], headers=auth)).status_code == 200
    grant.update(features=["xhs.analytics"])
    assert (await client.get(asset["asset_url"], headers=auth)).status_code == 404


async def test_asset_scope_isolated_by_member_tenant_and_plugin(paid_app: Any) -> None:
    _client, server, _auth, grant = paid_app
    grant.update(status="active", features=["xhs.content"])
    host = server.plugin_apps
    owner = await host.context("xhs-ops", 1)
    asset = await seed_asset(owner)
    foreign = AppContext(host, "another-plugin", 1, owner.license)
    tenant = AppContext(
        host, "xhs-ops", 1, PluginLicense.model_validate({**grant, "tenant_id": "other"})
    )
    member = await host.context("xhs-ops", 2)
    for ctx in (foreign, tenant, member):
        with pytest.raises(PluginAppError, match="not_found"):
            await ctx.read_asset(asset["asset_id"])


async def test_revocation_keeps_referenced_history_but_disallows_new_assets(paid_app: Any) -> None:
    client, server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.content"])
    ctx = await server.plugin_apps.context("xhs-ops", 1)
    asset = await seed_asset(ctx)
    grant.update(status="revoked", features=[], read_features=["xhs.content"])
    assert (await client.get(asset["asset_url"], headers=auth)).content == PNG
    with pytest.raises(PluginAppError, match="license_required"):
        await ctx.save_asset(base64.b64encode(PNG).decode(), "image/png")


async def test_unreferenced_asset_is_not_available_over_http(paid_app: Any) -> None:
    client, server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.content"])
    ctx = await server.plugin_apps.context("xhs-ops", 1)
    await ctx.require("xhs.content")
    asset = await ctx.save_asset(base64.b64encode(PNG).decode(), "image/png")
    assert (await client.get(asset["asset_url"], headers=auth)).status_code == 404


async def test_legacy_inline_media_compacts_without_replaying_or_changing_operation_keys(
    paid_app: Any,
) -> None:
    client, server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.content"])
    ctx = await server.plugin_apps.context("xhs-ops", 1)
    module = server.plugin_apps.module("xhs-ops")
    account = {
        "id": "a1",
        "version": 1,
        "project_id": "p1",
        "device_id": "phone",
        "platform_account_id": "target",
    }
    draft = {
        "id": "d1",
        "version": 2,
        "title": "title",
        "content": "copy",
        "hashtags": [],
        "images": [
            {
                "filename": "原图.png",
                "mime_type": "image/png",
                "data_base64": base64.b64encode(PNG).decode(),
            }
        ],
    }
    key = module.operation_key("publish", account, draft, {})
    await ctx.update(
        lambda state: state.update(
            drafts=[draft],
            runs=[
                {
                    "id": "published",
                    "kind": "publish",
                    "status": "operator_verified",
                    "operation_key": key,
                    "operation_key_version": 2,
                    "account_snapshot": module.account_identity(account),
                    "draft_snapshot": draft,
                }
            ],
        )
    )
    ctx.execution_feature = ""
    await module.snapshot(ctx)
    assert ctx.execution_feature == ""
    stored = await ctx.read()
    assert "data_base64" not in str(stored)
    assert stored["drafts"][0]["version"] == 2
    assert stored["runs"][0]["status"] == "operator_verified"
    assert stored["runs"][0]["operation_key"] == key
    assert module.operation_key("publish", account, stored["drafts"][0], {}) == key
    assert len(list(ctx.asset_store().root.iterdir())) == 1
    response = await client.get(stored["drafts"][0]["images"][0]["asset_url"], headers=auth)
    assert response.status_code == 200 and response.content == PNG


async def test_valid_multi_image_draft_is_not_limited_by_inline_document_size(
    paid_app: Any,
) -> None:
    _client, server, _auth, grant = paid_app
    grant.update(status="active", features=["xhs.content"])
    host = server.plugin_apps
    ctx = await host.context("xhs-ops", 1)
    await ctx.update(lambda state: state.update(projects=[{"id": "p1", "name": "Project"}]))
    images = [
        {
            "filename": f"原图{index}.png",
            "mime_type": "image/png",
            "data_base64": base64.b64encode(
                b"\x89PNG\r\n\x1a\n" + bytes([index]) * (4 * 1024 * 1024 - 8)
            ).decode(),
        }
        for index in range(6)
    ]
    assert sum(len(image["data_base64"]) for image in images) > 30 * 1024 * 1024
    response = await host.command(
        "xhs-ops",
        1,
        "draft.save",
        {"project_id": "p1", "title": "Six images", "content": "Draft copy", "images": images},
    )
    saved = response["data"]["drafts"][0]["images"]
    assert len(saved) == 6 and all(image["size"] == 4 * 1024 * 1024 for image in saved)
    stored = server.services.plugin_state_repo.get(ctx.key)
    assert stored is not None and len(stored.encode()) < 20_000 and "data_base64" not in stored
    assert (await ctx.read_asset(saved[-1]["asset_id"]))[0] == base64.b64decode(
        images[-1]["data_base64"]
    )


async def test_draft_cannot_adopt_an_asset_from_another_member(paid_app: Any) -> None:
    _client, server, _auth, grant = paid_app
    grant.update(status="active", features=["xhs.content"])
    host = server.plugin_apps
    owner = await host.context("xhs-ops", 1)
    asset = await seed_asset(owner)
    member = await host.context("xhs-ops", 2)
    await member.update(lambda state: state.update(projects=[{"id": "p2", "name": "Other"}]))
    with pytest.raises(PluginAppError, match="not_found"):
        await host.command(
            "xhs-ops",
            2,
            "draft.save",
            {
                "project_id": "p2",
                "title": "copy",
                "content": "copy",
                "images": [{**asset, "filename": "a.png", "content_digest": "a" * 64}],
            },
        )
    assert not (await member.read()).get("drafts")


async def test_combined_entitlements_do_not_expose_other_workflow_payloads_or_evidence(
    paid_app: Any,
) -> None:
    client, server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.publish", "xhs.analytics"])
    host = server.plugin_apps
    ctx = await host.context("xhs-ops", 1)
    await ctx.require("xhs.publish")
    image = await ctx.save_asset(base64.b64encode(PNG).decode(), "image/png")
    await ctx.update(
        lambda state: state.update(
            runs=[
                {
                    "id": "public",
                    "kind": "publish",
                    "status": "unknown",
                    "runtime_id": host.instance_id,
                    "device_id": "phone",
                    "payload": {"title": "authorized-publish-content"},
                },
                {
                    "id": "private",
                    "kind": "nurture",
                    "status": "unknown",
                    "runtime_id": host.instance_id,
                    "device_id": "phone",
                    "payload": {"secret": "private-operation", "image": image},
                },
            ]
        )
    )
    await ctx.save_evidence("public", b"publication")
    await ctx.save_evidence("private", b"operation")
    snapshot = await client.get("/api/plugin-apps/xhs-ops/snapshot", headers=auth)
    data = snapshot.json()["data"]
    assert "authorized-publish-content" in str(data["runs"])
    assert "private-operation" not in str(data)
    assert "payload" not in next(run for run in data["runs"] if run["id"] == "private")
    assert (
        await client.get("/api/plugin-apps/xhs-ops/evidence/public", headers=auth)
    ).status_code == 200
    assert (
        await client.get("/api/plugin-apps/xhs-ops/evidence/private", headers=auth)
    ).status_code == 403
    assert (await client.get(image["asset_url"], headers=auth)).status_code == 404
    grant.update(features=["xhs.ops"])
    assert (await client.get(image["asset_url"], headers=auth)).status_code == 200


@pytest.mark.parametrize("status", ["revoked", "expired"])
async def test_history_scope_cannot_expand_after_active_downgrade(
    paid_app: Any, status: str
) -> None:
    client, server, auth, grant = paid_app
    grant.update(
        status="active", features=["xhs.content", "xhs.publish", "xhs.ops", "xhs.analytics"]
    )
    ctx = await server.plugin_apps.context("xhs-ops", 1)
    image = await seed_asset(ctx)
    await ctx.update(
        lambda state: state.update(
            projects=[{"id": "p", "name": "hidden project"}],
            runs=[
                {
                    "id": "private-ops",
                    "account_id": "a1",
                    "project_id": "p",
                    "device_id": "phone",
                    "kind": "nurture",
                    "status": "unknown",
                    "runtime_id": server.plugin_apps.instance_id,
                    "date": server.plugin_apps.module("xhs-ops").daily.today(ctx),
                    "chunks": [],
                    "payload": {"secret": "hidden operation", "image": image},
                    "observation": {"home": "hidden diagnostic"},
                }
            ],
        )
    )
    await ctx.save_evidence("private-ops", b"operation")
    grant.update(features=["xhs.analytics"])
    before = await client.get("/api/plugin-apps/xhs-ops/snapshot", headers=auth)
    assert before.status_code == 200
    assert "hidden" not in str(before.json()["data"])
    grant.update(status=status, features=[], read_features=["xhs.analytics"])
    after = await client.get("/api/plugin-apps/xhs-ops/snapshot", headers=auth)
    assert after.status_code == 200 and after.json()["read_only"]
    assert after.json()["data"] == before.json()["data"]
    assert after.json()["license"]["features"] == []
    assert after.json()["license"]["read_features"] == ["xhs.analytics"]
    assert (
        await client.get("/api/plugin-apps/xhs-ops/evidence/private-ops", headers=auth)
    ).status_code == 403
    assert (await client.get(image["asset_url"], headers=auth)).status_code == 404
    grant.update(read_features=[])
    assert (await client.get("/api/plugin-apps/xhs-ops/snapshot", headers=auth)).status_code == 403
    assert (await client.get(image["asset_url"], headers=auth)).status_code == 403


async def test_old_authority_without_history_scope_fails_closed(
    paid_app: Any, monkeypatch: Any
) -> None:
    client, server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.content"])
    await seed_asset(await server.plugin_apps.context("xhs-ops", 1))
    grant.update(status="revoked", features=[])

    async def authority(_server: Any, _user_id: int, _method: str, path: str, **_: Any) -> Any:
        return (
            grant if path.endswith("license") else {"tenant": {"id": "t1"}, "member": {"id": "m1"}}
        )

    monkeypatch.setattr("octop.infra.plugin_apps.host.enterprise_request", authority)
    response = await client.get("/api/plugin-apps/xhs-ops/snapshot", headers=auth)
    assert response.status_code == 403

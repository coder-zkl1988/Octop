"""Shared-phone capacity rules for paid plugin applications."""

from __future__ import annotations

from typing import Any

import pytest

from octop.infra.plugin_apps.contracts import PluginAppError, PluginLicense
from octop.infra.plugin_apps.host import AppContext
from tests.integration.test_plugin_apps import paid_app as paid_app


async def test_same_owner_can_share_one_phone_until_account_limit(
    paid_app: Any,
) -> None:
    _client, server, _auth, grant = paid_app
    grant.update(
        status="active",
        features=["xhs.ops"],
        limits={"accounts": 2, "devices": 1},
    )
    context = await server.plugin_apps.context("xhs-ops", 1)

    await context.reserve_capacity("account-1", "phone-1")
    await context.reserve_capacity("account-2", "phone-1")

    with pytest.raises(PluginAppError, match="account_limit"):
        await context.reserve_capacity("account-3", "phone-1")


async def test_distinct_phone_still_consumes_device_capacity(paid_app: Any) -> None:
    _client, server, _auth, grant = paid_app
    grant.update(
        status="active",
        features=["xhs.ops"],
        limits={"accounts": 2, "devices": 1},
    )
    context = await server.plugin_apps.context("xhs-ops", 1)

    await context.reserve_capacity("account-1", "phone-1")

    with pytest.raises(PluginAppError, match="device_limit"):
        await context.reserve_capacity("account-2", "phone-2")


async def test_phone_cannot_be_shared_across_local_owners(paid_app: Any) -> None:
    _client, server, _auth, grant = paid_app
    grant.update(
        status="active",
        features=["xhs.ops"],
        limits={"accounts": 2, "devices": 1},
    )
    first_owner = AppContext(
        server.plugin_apps,
        "xhs-ops",
        1,
        PluginLicense.model_validate(grant),
    )
    second_owner = AppContext(
        server.plugin_apps,
        "xhs-ops",
        2,
        PluginLicense.model_validate({**grant, "member_id": "m2"}),
    )

    await first_owner.reserve_capacity("account-1", "phone-1")

    with pytest.raises(PluginAppError, match="device_already_bound"):
        await second_owner.reserve_capacity("account-2", "phone-1")


async def test_http_account_binding_keeps_both_accounts_on_the_owned_phone(
    paid_app: Any, monkeypatch: Any
) -> None:
    client, _server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.ops"], limits={"accounts": 2, "devices": 1})
    monkeypatch.setattr(
        AppContext, "device", lambda _self, device: {"device_id": device, "online": True}
    )
    endpoint = "/api/plugin-apps/xhs-ops/commands"
    created = await client.post(
        endpoint,
        headers=auth,
        json={"command": "project.save", "payload": {"name": "同成员多账号"}},
    )
    assert created.status_code == 200
    project_id = created.json()["data"]["projects"][0]["id"]
    for account_id in ("first", "second"):
        reply = await client.post(
            endpoint,
            headers=auth,
            json={
                "command": "account.save",
                "payload": {
                    "id": account_id,
                    "name": account_id,
                    "project_id": project_id,
                    "device_id": "phone-1",
                    "platform_account_id": account_id,
                },
            },
        )
        assert reply.status_code == 200, reply.text
    accounts = reply.json()["data"]["accounts"]
    assert len(accounts) == 2 and {row["device_id"] for row in accounts} == {"phone-1"}

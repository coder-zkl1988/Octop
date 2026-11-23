"""Generic plugin evidence ownership and scope regressions."""

from typing import Any

import pytest

from octop.infra.plugin_apps.contracts import PluginAppError, PluginLicense
from octop.infra.plugin_apps.host import AppContext
from tests.integration.test_plugin_apps import paid_app as imported_paid_app

paid_app = imported_paid_app


def _run(run_id: str) -> dict[str, str]:
    return {"id": run_id, "kind": "publish", "status": "unknown"}


async def _seed_run(ctx: AppContext, run_id: str) -> None:
    await ctx.update(lambda doc: doc.update(runs=[_run(run_id)]))


async def test_parent_run_evidence_chunk_is_served(paid_app: Any) -> None:
    client, server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.publish"])
    ctx = await server.plugin_apps.context("xhs-ops", 1)
    await _seed_run(ctx, "parent-run")

    image = b"day-chunk-image"
    url = await ctx.save_evidence("parent-run_0", image, parent_run_id="parent-run")

    response = await client.get(url, headers=auth)
    assert response.status_code == 200
    assert response.content == image


async def test_save_evidence_rejects_unknown_parent_run(paid_app: Any) -> None:
    _, server, _, grant = paid_app
    grant.update(status="active", features=["xhs.publish"])
    ctx = await server.plugin_apps.context("xhs-ops", 1)

    with pytest.raises(PluginAppError, match="not_found") as exc_info:
        await ctx.save_evidence("missing-parent_0", b"image", parent_run_id="missing-parent")

    assert exc_info.value.status == 404
    assert server.services.settings_repo.get(f"plugin-evidence:{ctx.key}:missing-parent_0") is None


async def test_evidence_suffix_is_isolated_by_local_user_and_tenant(
    paid_app: Any,
) -> None:
    _, server, _, grant = paid_app
    grant.update(status="active", features=["xhs.publish"])
    host = server.plugin_apps
    run_id = "shared-parent"
    evidence_id = f"{run_id}_0"

    owner = await host.context("xhs-ops", 1)
    other_user = await host.context("xhs-ops", 2)
    other_tenant = AppContext(
        host,
        "xhs-ops",
        1,
        PluginLicense.model_validate({**grant, "tenant_id": "t2"}),
    )
    for ctx in (owner, other_user, other_tenant):
        await _seed_run(ctx, run_id)

    await other_tenant.save_evidence(evidence_id, b"tenant-two", parent_run_id=run_id)
    with pytest.raises(PluginAppError, match="not_found"):
        await host.evidence("xhs-ops", 1, evidence_id)

    await owner.save_evidence(evidence_id, b"tenant-one", parent_run_id=run_id)
    assert await host.evidence("xhs-ops", 1, evidence_id) == b"tenant-one"
    with pytest.raises(PluginAppError, match="not_found"):
        await host.evidence("xhs-ops", 2, evidence_id)


async def test_legacy_run_id_evidence_path_remains_compatible(
    paid_app: Any,
) -> None:
    client, server, auth, grant = paid_app
    grant.update(status="active", features=["xhs.publish"])
    ctx = await server.plugin_apps.context("xhs-ops", 1)
    await _seed_run(ctx, "legacy-run")

    image = b"legacy-image"
    url = await ctx.save_evidence("legacy-run", image)

    assert url == "/api/plugin-apps/xhs-ops/evidence/legacy-run"
    assert server.services.settings_repo.get(f"plugin-evidence-owner:{ctx.key}:legacy-run") is None
    response = await client.get(url, headers=auth)
    assert response.status_code == 200
    assert response.content == image

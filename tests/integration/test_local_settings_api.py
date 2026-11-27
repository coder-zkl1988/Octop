"""Integration tests for /api/local-settings (本机设置) and the enterprise folder limits."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path
from typing import Any

import httpx
import pytest


@pytest.mark.asyncio
async def test_workspaces_list_the_members_folders_with_size(
    env_with_agent: tuple[httpx.AsyncClient, Any, dict[str, str], str],
) -> None:
    client, _srv, auth, agent_id = env_with_agent
    r = await client.get("/api/local-settings/workspaces", headers=auth)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["can_reveal"] is False
    mine = [item for item in body["items"] if any(e["id"] == agent_id for e in item["experts"])]
    assert len(mine) == 1
    assert mine[0]["size_bytes"] >= 0


@pytest.mark.asyncio
async def test_reveal_is_only_for_the_desktop_app(
    env_with_agent: tuple[httpx.AsyncClient, Any, dict[str, str], str],
) -> None:
    client, _srv, auth, _agent_id = env_with_agent
    r = await client.post(
        "/api/local-settings/workspaces/reveal", headers=auth, json={"path": "/tmp"}
    )
    assert r.status_code == 403, r.text


@pytest.mark.asyncio
async def test_export_writes_a_zip_to_downloads(
    env_with_agent: tuple[httpx.AsyncClient, Any, dict[str, str], str],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _srv, auth, _agent_id = env_with_agent
    home = tmp_path / "home"
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: home))
    r = await client.post("/api/local-settings/export", headers=auth)
    assert r.status_code == 200, r.text
    body = r.json()
    target = Path(body["path"])
    assert target.parent == home / "Downloads"
    with zipfile.ZipFile(target) as archive:
        names = archive.namelist()
    assert "README.txt" in names
    assert not any("/auth/" in name or ".octop-auth" in name for name in names)


@pytest.mark.asyncio
async def test_enterprise_roots_refuse_a_workspace_outside_them(
    env_with_provider: tuple[httpx.AsyncClient, Any, dict[str, str]],
    tmp_path: Path,
) -> None:
    client, srv, auth = env_with_provider
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    srv.services.settings_repo.set("enterprise_security", json.dumps({"fs_roots": [str(allowed)]}))
    outside = tmp_path / "outside"
    outside.mkdir()
    r = await client.post(
        "/api/agents",
        headers=auth,
        json={"name": "outside", "config": {"workspace_dir": str(outside)}},
    )
    assert r.status_code == 400, r.text
    assert r.json()["error"]["code"] == "WORKSPACE_ROOT_RESTRICTED"


@pytest.mark.asyncio
async def test_new_expert_starts_with_single_expert_plugins_off(
    env_with_provider: tuple[httpx.AsyncClient, Any, dict[str, str]],
) -> None:
    from octop.infra.agents.plugins import plugin_scope

    client, srv, auth = env_with_provider
    me = await client.get("/api/auth/me", headers=auth)
    user_id = int(me.json()["id"])
    plugin_scope.set_single_expert(srv.services.settings_repo, user_id, "chart", True)
    r = await client.post("/api/agents", headers=auth, json={"name": "later"})
    assert r.status_code == 201, r.text
    config = srv.app_runtime.agent_registry.get_config(r.json()["agent_id"])
    assert config["plugins"]["chart"] == {"enabled": False}

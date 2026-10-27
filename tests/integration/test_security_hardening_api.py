"""HTTP-level regression tests for the security review hardening."""

from __future__ import annotations

from pathlib import Path

import httpx

from octop.infra.server import OctopServer
from tests.support.auth import TEST_PASSWORD, create_user, resolve_user_id, wizard_token

AdminAlice = tuple[httpx.AsyncClient, OctopServer, dict[str, str], dict[str, str]]


def _error_code(response: httpx.Response) -> str:
    return str(response.json()["error"]["code"])


# --- administrator accounts -------------------------------------------------


async def test_user_manager_cannot_take_over_an_admin(env_admin_alice: AdminAlice) -> None:
    client, _srv, admin_auth, _alice = env_admin_alice
    mgr = await create_user(client, admin_auth, username="mgr", permissions=["users"])
    admin_id = await resolve_user_id(client, admin_auth, "admin")
    alice_id = await resolve_user_id(client, admin_auth, "alice")

    r = await client.post(
        f"/api/users/{admin_id}/reset-password",
        headers=mgr,
        json={"new_password": "Takeover123"},
    )
    assert r.status_code == 403
    assert (await client.delete(f"/api/users/{admin_id}", headers=mgr)).status_code == 403
    r = await client.patch(f"/api/users/{admin_id}", headers=mgr, json={"disabled": True})
    assert r.status_code == 403
    r = await client.post(
        "/api/users/batch", headers=mgr, json={"action": "disable", "user_ids": [admin_id]}
    )
    assert r.json()["failed"] == 1

    # Regular accounts stay manageable.
    r = await client.post(
        f"/api/users/{alice_id}/reset-password",
        headers=mgr,
        json={"new_password": "AliceNew123"},
    )
    assert r.status_code == 204


# --- provider secrets --------------------------------------------------------


async def test_provider_api_keys_hidden_from_regular_users(env_admin_alice: AdminAlice) -> None:
    client, _srv, admin_auth, alice_auth = env_admin_alice
    alice_view = (await client.get("/api/providers", headers=alice_auth)).json()
    assert alice_view
    assert all(row["api_key"] is None for row in alice_view)
    assert any(row["has_api_key"] for row in alice_view)

    admin_view = (await client.get("/api/providers", headers=admin_auth)).json()
    assert any(row["api_key"] for row in admin_view)


async def test_voice_provider_keys_hidden_from_regular_users(env_admin_alice: AdminAlice) -> None:
    client, _srv, _admin, alice_auth = env_admin_alice
    for row in (await client.get("/api/voice/providers", headers=alice_auth)).json():
        assert row["api_key"] is None


# --- custom MCP stdio ----------------------------------------------------------


_STDIO_DOC = {"servers": {"local": {"transport": "stdio", "command": "echo", "args": ["hi"]}}}


async def test_stdio_custom_mcp_requires_terminal(env_admin_alice: AdminAlice) -> None:
    client, _srv, admin_auth, alice_auth = env_admin_alice

    r = await client.put("/api/connectors/custom-mcp", headers=alice_auth, json=_STDIO_DOC)
    assert r.status_code == 403
    assert r.json()["error"]["details"]["permission"] == "terminal"

    r = await client.post(
        "/api/connectors/custom-mcp/test",
        headers=alice_auth,
        json={"server": {"transport": "stdio", "command": "sh", "args": ["-c", "id"]}},
    )
    assert r.status_code == 403

    r = await client.put("/api/connectors/custom-mcp", headers=admin_auth, json=_STDIO_DOC)
    assert r.status_code == 200
    assert "local" in r.json()["servers"]


async def test_custom_mcp_requires_connector_custom(env_admin_alice: AdminAlice) -> None:
    client, _srv, admin_auth, _alice = env_admin_alice
    bare = await create_user(client, admin_auth, username="bare", permissions=[])
    assert (await client.get("/api/connectors/custom-mcp", headers=bare)).status_code == 403
    r = await client.put("/api/connectors/custom-mcp", headers=bare, json={"servers": {}})
    assert r.status_code == 403


# --- workspace host paths ------------------------------------------------------


async def test_workspace_api_cannot_read_octop_home(
    env_with_agent: tuple[httpx.AsyncClient, OctopServer, dict[str, str], str],
) -> None:
    client, srv, auth, agent_id = env_with_agent
    root = Path(srv.paths.root)
    for name in ("octop.db", "config.json"):
        target = str(root / name)
        r = await client.get(
            f"/api/agents/{agent_id}/workspace/file", headers=auth, params={"path": target}
        )
        assert r.status_code == 403, (name, r.text)
        r = await client.get(
            f"/api/agents/{agent_id}/workspace/download", headers=auth, params={"path": target}
        )
        assert r.status_code == 403, (name, r.text)


# --- setup wizard database step ------------------------------------------------


async def test_setup_database_routes_need_wizard_token(
    app_client: tuple[httpx.AsyncClient, OctopServer, Path],
) -> None:
    client, _srv, home = app_client
    body = {"driver": "sqlite", "sqlite_path": "octop.db"}
    r = await client.post("/api/setup/test-database", json=body)
    assert r.status_code == 401
    assert _error_code(r) == "SETUP_TOKEN_INVALID"
    r = await client.post("/api/setup/database", json=body)
    assert r.status_code == 401

    token = await wizard_token(client, home)
    r = await client.post(
        "/api/setup/test-database", json=body, headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 200, r.text


# --- token revocation ----------------------------------------------------------


async def test_password_change_revokes_earlier_tokens(env_admin_alice: AdminAlice) -> None:
    client, _srv, admin_auth, alice_auth = env_admin_alice
    assert (await client.get("/api/auth/me", headers=alice_auth)).status_code == 200

    r = await client.post(
        "/api/auth/change-password",
        headers=alice_auth,
        json={"old_password": TEST_PASSWORD, "new_password": "BrandNew123"},
    )
    assert r.status_code == 204
    fresh = r.headers.get("X-Octop-Access-Token")
    assert fresh
    fresh_auth = {"Authorization": f"Bearer {fresh}"}

    assert (await client.get("/api/auth/me", headers=alice_auth)).status_code == 401
    assert (await client.get("/api/auth/me", headers=fresh_auth)).status_code == 200

    alice_id = await resolve_user_id(client, admin_auth, "alice")
    r = await client.post(
        f"/api/users/{alice_id}/reset-password",
        headers=admin_auth,
        json={"new_password": "ResetByAdmin1"},
    )
    assert r.status_code == 204
    assert (await client.get("/api/auth/me", headers=fresh_auth)).status_code == 401

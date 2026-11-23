"""Unit tests for OpenAPI schema customization."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from tests.support.app import ensure_control_plane_bound, write_octop_config

from octop.api.app import build_app
from octop.infra.server import OctopServer


async def test_openapi_has_bearer_security_and_descriptions(tmp_octop_home: Path) -> None:
    write_octop_config(tmp_octop_home, enable_api_docs=True)
    srv = OctopServer(home=tmp_octop_home)
    await srv.start()
    await ensure_control_plane_bound(srv)
    try:
        app = build_app(srv)
        with TestClient(app) as c:
            spec = c.get("/api/openapi.json").json()
            assert c.get("/api/docs").status_code == 200
        assert spec["info"]["description"]
        assert "BearerAuth" in spec["components"]["securitySchemes"]
        login = spec["paths"]["/api/auth/login"]["post"]
        assert login["summary"] == "Sign in"
        me = spec["paths"]["/api/auth/me"]["get"]
        assert "BearerAuth" in me["security"][0]
        assert "security" not in spec["paths"]["/api/setup/status"]["get"]
        models = spec["paths"]["/api/plugin-apps/{plugin_id}/models"]["get"]
        assert models["responses"]["200"]["content"]["application/json"]["schema"]["items"][
            "$ref"
        ].endswith("PluginTextModel")
        assert set(spec["components"]["schemas"]["PluginTextModel"]["properties"]) == {
            "id",
            "name",
            "source",
        }
        images = spec["paths"]["/api/plugin-apps/{plugin_id}/assets/{asset_id}"]["get"]
        content = images["responses"]["200"]["content"]
        assert set(content) == {"image/png", "image/jpeg", "image/webp"}
        assert all(
            item["schema"] == {"type": "string", "format": "binary"} for item in content.values()
        )
        assert spec["components"]["schemas"]["PluginLicense"]["properties"]["read_features"][
            "description"
        ]
    finally:
        await srv.stop()

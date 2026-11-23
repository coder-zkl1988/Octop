from __future__ import annotations

from octop.infra.agents.plugins.bundled import default_bundled_plugins_root
from octop.infra.plugin_apps.phone_skills import build_bundle


def test_bundled_xhs_phone_skill_bundle_has_verified_v66_payload() -> None:
    path = default_bundled_plugins_root() / "xhs-ops" / "phone-skills"
    payload = build_bundle(path)
    assert payload["schemaVersion"] == 2
    assert payload["bundleVersion"] == payload["syncVersion"] == 66
    assert len(payload["digest"]) == 64
    assert any(skill["id"] == "xhs-v1" for skill in payload["skills"])
    assert payload["bundleBase64"]

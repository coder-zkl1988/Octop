"""Validated phone-skill bundle loading for licensed plugin applications."""

from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
from typing import Any

from octop.infra.plugin_apps.contracts import PluginAppError


def build_bundle(path: Path) -> dict[str, Any]:
    """Load generated bundle + manifest files and verify their integrity."""
    bundle_path = path / "phone-skills.bundle.json"
    manifest_path = path / "phone-skills.manifest.json"
    try:
        bundle_bytes = bundle_path.read_bytes()
        bundle = json.loads(bundle_bytes)
        manifest = json.loads(manifest_path.read_text())
    except (OSError, ValueError) as exc:
        raise PluginAppError("phone_skill_bundle_invalid") from exc
    if not isinstance(bundle, dict) or not isinstance(manifest, dict):
        raise PluginAppError("phone_skill_bundle_invalid")
    digest = hashlib.sha256(bundle_bytes).hexdigest()
    keys = ("schemaVersion", "bundleVersion", "minAppVersion")
    if digest != manifest.get("digest") or any(
        bundle.get(key) != manifest.get(key) for key in keys
    ):
        raise PluginAppError("phone_skill_bundle_invalid")
    skills = bundle.get("skills")
    if not isinstance(skills, list) or not skills:
        raise PluginAppError("phone_skill_bundle_invalid")
    return {
        "schemaVersion": bundle["schemaVersion"],
        "syncVersion": bundle["bundleVersion"],
        "bundleVersion": bundle["bundleVersion"],
        "minAppVersion": bundle["minAppVersion"],
        "digestAlgorithm": "SHA-256",
        "digest": digest,
        "bundleBase64": base64.b64encode(bundle_bytes).decode("ascii"),
        "skills": skills,
    }

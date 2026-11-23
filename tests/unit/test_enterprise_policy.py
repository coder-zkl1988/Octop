from __future__ import annotations

from octop.infra.enterprise_policy import enterprise_policy_permissions


def test_enterprise_policy_maps_real_capability_keys() -> None:
    payload = {
        "policy": {
            "modules": {"experts": "allow"},
            "caps": {
                "cap.shell": {"mode": "allow", "deny_commands": []},
                "cap.browser": "allow",
                "cap.remote_desktop": "allow",
                "cap.phone.adb": "deny",
            },
            "resources": {"model.allowlist": ["tabby-pro"]},
        }
    }
    assert enterprise_policy_permissions(payload) == [
        "browser",
        "desktop",
        "experts",
        "providers",
        "terminal",
        "workbench",
    ]


def test_enterprise_policy_fails_closed_for_missing_caps_and_models() -> None:
    assert enterprise_policy_permissions({"policy": {"modules": {"experts": "allow"}}}) == [
        "experts"
    ]


def test_enterprise_local_model_permission_exposes_original_model_settings() -> None:
    assert enterprise_policy_permissions(
        {"policy": {"resources": {"model.local.enabled": True}}}
    ) == ["ollama_models", "onnx_models", "providers"]

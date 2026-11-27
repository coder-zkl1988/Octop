"""Shared mapping between Tabby enterprise policy documents and Octop permissions."""

from __future__ import annotations

from typing import Any

# Tenant role-policy module that allows 共享记忆 (shared Memory spaces and tokens).
MEMORY_SHARING_MODULE = "memory_sharing"


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def enterprise_policy_body(payload: dict[str, Any]) -> dict[str, Any]:
    body = payload.get("policy")
    return _object(body) or payload


def enterprise_policy_permissions(payload: dict[str, Any]) -> list[str]:
    body = enterprise_policy_body(payload)
    modules = _object(body.get("modules"))
    caps = _object(body.get("caps"))
    resources = _object(body.get("resources"))
    permissions: set[str] = set()

    def module_allowed(*keys: str) -> bool:
        return any(modules.get(key) == "allow" for key in keys)

    def cap_allowed(key: str) -> bool:
        value = caps.get(key)
        if isinstance(value, dict):
            return value.get("mode") == "allow" or value.get("access") in {"read", "read_write"}
        return value == "allow"

    if module_allowed("experts"):
        permissions.add("experts")
    if module_allowed("tasks", "automation"):
        permissions.add("tasks")
    if module_allowed("terminal") or cap_allowed("cap.shell"):
        permissions.update(("terminal", "workbench"))
    if module_allowed("browser") or cap_allowed("cap.browser"):
        permissions.update(("browser", "workbench"))
    if module_allowed("workbench"):
        permissions.add("workbench")
    if module_allowed("knowledge", "knowledge_bases"):
        permissions.update(("knowledge_bases", "knowledge_settings"))
    if module_allowed("connectors", "connector"):
        permissions.update(("connector_enabled", "connector_builtin"))
    if module_allowed("channels", "im"):
        permissions.add("channels")
    if module_allowed("skills", "skill_packages"):
        permissions.add("skill_packages")
    if module_allowed("desktop", "remote_desktop") or cap_allowed("cap.remote_desktop"):
        permissions.add("desktop")
    if module_allowed("mobile") or cap_allowed("cap.phone.adb"):
        permissions.add("mobile")
    if module_allowed("bridge", "cloud"):
        permissions.add("bridge")
    if module_allowed("acp") or cap_allowed("cap.acp"):
        permissions.add("acp")
    if cap_allowed("cap.remote_desktop"):
        permissions.add("desktop")
    if cap_allowed("cap.phone.adb"):
        permissions.add("mobile")
    if resources.get("model.allowlist") or resources.get("model.local.enabled"):
        permissions.add("providers")
    if resources.get("model.local.enabled"):
        permissions.update(("ollama_models", "onnx_models"))
    # Model-purpose gates are separate from the shared provider/local-model
    # allowlists. The control plane fills these keys for legacy role records.
    purpose_permissions = {
        "chat": "model_chat",
        "embedding": "model_embedding",
        "generation": "model_generation",
        "voice": "voice",
        "search": "search",
        "decision": "model_decision",
        "phone": "model_phone",
    }
    for purpose, permission in purpose_permissions.items():
        key = f"model.{purpose}.enabled"
        value = resources.get(key)
        if value is True and (
            purpose != "phone" or module_allowed("mobile") or cap_allowed("cap.phone.adb")
        ):
            permissions.add(permission)
    return sorted(permissions)


def enterprise_module_allowed(payload: dict[str, Any], module: str) -> bool:
    modules = _object(enterprise_policy_body(payload).get("modules"))
    return modules.get(module) == "allow"


def enterprise_model_allowlist(payload: dict[str, Any]) -> list[str]:
    resources = _object(enterprise_policy_body(payload).get("resources"))
    values = resources.get("model.allowlist")
    return (
        [str(value) for value in values if str(value).strip()] if isinstance(values, list) else []
    )

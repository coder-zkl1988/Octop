from __future__ import annotations

import base64
from types import SimpleNamespace
from typing import Any

import pytest

from octop.infra.errors import ErrorCode, OctopError
from octop.infra.plugin_apps import host as host_module
from octop.infra.plugin_apps.contracts import PluginAppError, PluginLicense
from octop.infra.plugin_apps.host import AppContext


def context(
    monkeypatch: Any, resources: dict[str, Any], response: Any = None
) -> tuple[AppContext, list[dict[str, Any]]]:
    license = PluginLicense(
        plugin_id="xhs-ops",
        tenant_id="tenant1",
        member_id="member1",
        status="active",
        version=1,
        features=["xhs.ops"],
    )
    host = SimpleNamespace(
        server=SimpleNamespace(
            services=SimpleNamespace(
                config=SimpleNamespace(enterprise_backend_url="http://enterprise.invalid")
            )
        )
    )
    ctx = AppContext(host, "xhs-ops", 7, license)
    checks: list[str] = []

    async def require(feature: str) -> None:
        checks.append(feature)

    ctx.require = require
    ctx.execution_feature = "xhs.ops"
    calls: list[dict[str, Any]] = []

    async def authority(_server: Any, user: int, method: str, path: str, **kwargs: Any) -> Any:
        assert user == 7
        calls.append({"method": method, "path": path, **kwargs})
        if method == "GET":
            return {"policy": {"resources": resources}}
        assert len(checks) >= 1
        if isinstance(response, Exception):
            raise response
        return response or {"model": "company-text", "text": "generated draft"}

    monkeypatch.setattr("octop.infra.plugin_apps.host.enterprise_request", authority)
    return ctx, calls


@pytest.mark.asyncio
async def test_enterprise_generation_works_with_personal_models_disabled(monkeypatch: Any) -> None:
    ctx, calls = context(
        monkeypatch, {"model.local.enabled": False, "model.allowlist": ["company-text"]}
    )
    assert await ctx.generate_text("system", "prompt") == "generated draft"
    assert calls[-1] == {
        "method": "POST",
        "path": "/desktop/v1/models/text",
        "timeout": 100.0,
        "body": {"system": "system", "prompt": "prompt", "model": "company-text"},
    }


@pytest.mark.parametrize("method", ["text_models", "image_models"])
@pytest.mark.parametrize("declared", ["", "xhs.comment"])
async def test_model_catalog_does_not_change_the_declared_execution_feature(
    monkeypatch: Any, method: str, declared: str
) -> None:
    ctx, calls = context(
        monkeypatch, {"model.local.enabled": False, "model.allowlist": ["company-text"]}
    )
    ctx.license.features = ["xhs.ops", "xhs.comment"]
    ctx.execution_feature = declared

    async def entitled(_features: list[str]) -> None:
        ctx.execution_feature = "xhs.ops"

    ctx.require_any = entitled
    await getattr(ctx, method)()
    assert ctx.execution_feature == declared
    assert all(call["method"] == "GET" for call in calls)


async def test_generation_rechecks_its_original_feature_after_context_changes(
    monkeypatch: Any,
) -> None:
    ctx, _calls = context(
        monkeypatch, {"model.local.enabled": False, "model.allowlist": ["company-text"]}
    )
    ctx.execution_feature = "xhs.comment"
    original_require, authority = ctx.require, host_module.enterprise_request
    revoked = False

    async def require(feature: str) -> None:
        await original_require(feature)
        if revoked and feature == "xhs.comment":
            raise PluginAppError("license_required", status=403)

    async def changed_context(*args: Any, **kwargs: Any) -> Any:
        nonlocal revoked
        result = await authority(*args, **kwargs)
        if args[2] == "POST":
            ctx.execution_feature = "xhs.ops"
            revoked = True
        return result

    ctx.require = require
    monkeypatch.setattr(host_module, "enterprise_request", changed_context)
    with pytest.raises(PluginAppError, match="license_required"):
        await ctx.generate_text("system", "comment candidate")


@pytest.mark.asyncio
async def test_gateway_quota_failure_does_not_fall_back_to_personal_credentials(
    monkeypatch: Any,
) -> None:
    failure = OctopError(ErrorCode.FORBIDDEN, "quota", status=402)
    ctx, calls = context(
        monkeypatch, {"model.local.enabled": True, "model.allowlist": ["company-text"]}, failure
    )
    with pytest.raises(OctopError) as exc:
        await ctx.generate_text("system", "prompt")
    assert exc.value.status == 402
    assert [call["method"] for call in calls] == ["GET", "POST"]


@pytest.mark.asyncio
async def test_enterprise_image_catalog_and_generation_are_metered(monkeypatch: Any) -> None:
    ctx, calls = context(
        monkeypatch,
        {"model.local.enabled": False, "model.allowlist": ["company-text"]},
    )

    async def require_any(_features: list[str]) -> None:
        return None

    ctx.require_any = require_any
    png = b"\x89PNG\r\n\x1a\nimage"

    async def authority(_server: Any, user: int, method: str, path: str, **kwargs: Any) -> Any:
        assert user == 7
        calls.append({"method": method, "path": path, **kwargs})
        if method == "GET" and path == "/desktop/v1/models/image":
            return {
                "models": [{"id": "company-image", "name": "Company Image", "source": "enterprise"}]
            }
        if method == "GET":
            return {"policy": {"resources": {"model.local.enabled": False}}}
        return {
            "model": "company-image",
            "images": [{"data_base64": base64.b64encode(png).decode(), "mime_type": "image/png"}],
        }

    monkeypatch.setattr("octop.infra.plugin_apps.host.enterprise_request", authority)
    assert await ctx.image_models() == [
        {"id": "enterprise-image:company-image", "name": "Company Image", "source": "enterprise"}
    ]
    images = await ctx.generate_image("a red cat", model_ref="enterprise-image:company-image")
    assert images[0]["mime_type"] == "image/png"
    assert any(
        call["path"] == "/desktop/v1/models/image" and call["method"] == "POST" for call in calls
    )


@pytest.mark.asyncio
async def test_explicit_unallowed_model_does_not_use_default_company_model(
    monkeypatch: Any,
) -> None:
    ctx, calls = context(
        monkeypatch, {"model.local.enabled": False, "model.allowlist": ["company-text"]}
    )
    with pytest.raises(PluginAppError, match="model_unavailable"):
        await ctx.generate_text("system", "prompt", model_ref="not-granted")
    assert len(calls) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "response", [{"model": "different", "text": "draft"}, {"model": "company-text", "text": ""}]
)
async def test_invalid_gateway_result_is_not_saved_as_a_draft(
    monkeypatch: Any, response: dict[str, Any]
) -> None:
    ctx, _calls = context(monkeypatch, {"model.allowlist": ["company-text"]}, response)
    with pytest.raises(PluginAppError, match="enterprise_model_response_invalid"):
        await ctx.generate_text("system", "prompt")


@pytest.mark.asyncio
async def test_generation_requires_an_authorized_plugin_operation(monkeypatch: Any) -> None:
    ctx, calls = context(monkeypatch, {"model.allowlist": ["company-text"]})
    ctx.execution_feature = ""
    with pytest.raises(PluginAppError, match="license_required"):
        await ctx.generate_text("system", "prompt")
    assert not calls


@pytest.mark.asyncio
async def test_personal_model_is_explicitly_selected_and_stays_out_of_company_gateway(
    monkeypatch: Any,
) -> None:
    ctx, calls = context(
        monkeypatch, {"model.local.enabled": True, "model.allowlist": ["company-text"]}
    )
    used = []

    async def invoke(prompt: str, **kwargs: Any) -> str:
        used.append((prompt, kwargs))
        return "personal draft"

    model = SimpleNamespace(ainvoke_text=invoke)
    ctx.host.server.app_runtime = SimpleNamespace(
        agent_registry=SimpleNamespace(host_models=SimpleNamespace(get=lambda ref: model))
    )
    monkeypatch.setattr(
        AppContext,
        "_personal_text_models",
        lambda _self: [{"provider_name": "provider", "model": "model"}],
    )
    assert (
        await ctx.generate_text("system", "prompt", model_ref="personal:provider/model")
        == "personal draft"
    )
    assert used[0][1]["system"] == "system"
    assert [call["method"] for call in calls] == ["GET"]


@pytest.mark.asyncio
async def test_personal_model_selection_is_rejected_when_enterprise_disallows_it(
    monkeypatch: Any,
) -> None:
    ctx, calls = context(
        monkeypatch, {"model.local.enabled": False, "model.allowlist": ["company-text"]}
    )
    with pytest.raises(PluginAppError, match="model_unavailable"):
        await ctx.generate_text("system", "prompt", model_ref="personal:provider/model")
    assert [call["method"] for call in calls] == ["GET"]


@pytest.mark.asyncio
async def test_model_catalog_exposes_names_and_references_without_credentials(
    monkeypatch: Any,
) -> None:
    ctx, _calls = context(
        monkeypatch, {"model.local.enabled": True, "model.allowlist": ["company-text"]}
    )

    async def require_any(_features: list[str]) -> None:
        pass

    ctx.require_any = require_any
    monkeypatch.setattr(
        AppContext,
        "_personal_text_models",
        lambda _self: [{"provider_name": "provider", "model": "model", "api_key": "hidden"}],
    )
    assert await ctx.text_models() == [
        {"id": "company-text", "name": "company-text", "source": "enterprise"},
        {"id": "personal:provider/model", "name": "provider/model", "source": "personal"},
    ]

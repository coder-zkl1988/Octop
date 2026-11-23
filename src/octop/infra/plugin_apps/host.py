"""Host-controlled execution of paid application plugins.

Plugins supply business state machines. Authentication, licensing, scoped CAS,
device ownership and model access stay in Octop and apply to every entry path.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import importlib.util
import ipaddress
import json
import logging
import socket
import sys
from collections.abc import AsyncIterator, Callable
from contextlib import suppress
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

import httpx
import yaml
from octop_harness.plugins import PluginRegistry
from pydantic import ValidationError

from octop.infra.enterprise_client import request as enterprise_request
from octop.infra.errors import OctopError
from octop.infra.plugin_apps.assets import AssetStore, references_asset
from octop.infra.plugin_apps.contracts import PluginAppError, PluginLicense, current_context
from octop.infra.users.permissions import stored_user_has_permission

logger = logging.getLogger(__name__)

_XHS_PACKAGE = "com.xingin.xhs"
_XHS_OPERATION_CLASSES = frozenset({"account.login", "app.use.xhs", "content.publish"})
_XHS_MIN_SKILL_BUNDLE_VERSION = 66


class _BoundedResponseStream(httpx.AsyncByteStream):
    def __init__(self, source: httpx.AsyncByteStream, limit: int) -> None:
        self.source, self.limit = source, limit

    async def __aiter__(self) -> AsyncIterator[bytes]:
        size = 0
        async for chunk in self.source:
            size += len(chunk)
            if size > self.limit:
                raise PluginAppError("image_response_too_large", status=502)
            yield chunk

    async def aclose(self) -> None:
        await self.source.aclose()


def digest_scope(parts: list[Any]) -> str:
    return hashlib.sha256(json.dumps(parts).encode()).hexdigest()


class AppContext:
    def __init__(
        self, host: PluginAppHost, plugin_id: str, user_id: int, license: PluginLicense
    ) -> None:
        self.host, self.plugin_id, self.user_id, self.license = host, plugin_id, user_id, license
        self.execution_feature = ""
        self.key = (
            "plugin-app:"
            + hashlib.sha256(
                json.dumps([plugin_id, license.tenant_id, license.member_id, user_id]).encode()
            ).hexdigest()
        )

    async def require(self, feature: str) -> None:
        # Never trust UI state, local admin, or a cached model tool configuration.
        fresh = await self.host.license(self.plugin_id, self.user_id)
        if (fresh.tenant_id, fresh.member_id) != (self.license.tenant_id, self.license.member_id):
            raise PluginAppError("license_identity_changed", status=403)
        self.license = fresh
        if not self.license.active or feature not in self.license.features:
            raise PluginAppError("license_required", status=403)
        self.host.definition(self.plugin_id, require_enabled=True)
        self.execution_feature = feature

    async def require_any(self, features: list[str]) -> None:
        fresh = await self.host.license(self.plugin_id, self.user_id)
        allowed = next((f for f in features if f in fresh.features), None)
        if allowed is None:
            raise PluginAppError("license_required", status=403)
        await self.require(allowed)

    async def reserve_capacity(self, account_id: str, device_id: str) -> None:
        """Tenant-wide quotas, not one full quota independently for every member."""
        key = "plugin-capacity:" + digest_scope([self.plugin_id, self.license.tenant_id])
        repo = self.host.server.services.plugin_state_repo
        async with self.host.locks.setdefault(key, asyncio.Lock()):
            raw = await asyncio.to_thread(repo.get, key)
            doc = json.loads(raw) if raw else {"accounts": {}}
            self._reserve_in_document(doc, account_id, device_id)
            if not await asyncio.to_thread(repo.compare_and_set, key, raw, json.dumps(doc)):
                raise PluginAppError("version_conflict", status=409)

    def _reserve_in_document(self, doc: dict[str, Any], account_id: str, device_id: str) -> None:
        owner = f"{self.user_id}:{account_id}"
        owners = doc["accounts"]
        if device_id and any(
            key.split(":", 1)[0] != str(self.user_id) and device == device_id
            for key, device in owners.items()
        ):
            raise PluginAppError("device_already_bound", status=409)
        if owner not in owners and len(owners) >= self.license.limits.get("accounts", 0):
            raise PluginAppError("account_limit", status=409)
        owners[owner] = device_id
        if len({device for device in owners.values() if device}) > self.license.limits.get(
            "devices", 0
        ):
            raise PluginAppError("device_limit", status=409)

    async def update_account(
        self, account_id: str, fn: Callable[[dict[str, Any]], None]
    ) -> dict[str, Any]:
        """Save account state and its tenant capacity ledger in one database transaction."""
        key = "plugin-capacity:" + digest_scope([self.plugin_id, self.license.tenant_id])
        repo = self.host.server.services.plugin_state_repo
        async with (
            self.host.locks.setdefault(key, asyncio.Lock()),
            self.host.locks.setdefault(self.key, asyncio.Lock()),
        ):
            raw = await asyncio.to_thread(repo.get, self.key)
            capacity_raw = await asyncio.to_thread(repo.get, key)
            doc: dict[str, Any] = json.loads(raw) if raw else {"version": 0}
            capacity: dict[str, Any] = (
                json.loads(capacity_raw) if capacity_raw else {"accounts": {}}
            )
            fn(doc)
            account = next(
                (item for item in doc.get("accounts", []) if item["id"] == account_id), None
            )
            if account is None:
                raise PluginAppError("not_found", status=404)
            self._reserve_in_document(capacity, account_id, str(account.get("device_id") or ""))
            doc["version"] = int(doc.get("version", 0)) + 1
            encoded = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
            if len(encoded.encode()) > 30 * 1024 * 1024:
                raise PluginAppError("storage_limit")
            changes = [(self.key, raw, encoded), (key, capacity_raw, json.dumps(capacity))]
            if not await asyncio.to_thread(repo.compare_and_set_many, changes):
                raise PluginAppError("version_conflict", status=409)
            return doc

    async def release_capacity(self, account_id: str) -> None:
        key = "plugin-capacity:" + digest_scope([self.plugin_id, self.license.tenant_id])
        repo = self.host.server.services.plugin_state_repo
        async with self.host.locks.setdefault(key, asyncio.Lock()):
            raw = await asyncio.to_thread(repo.get, key)
            if raw is None:
                return
            doc = json.loads(raw)
            doc["accounts"].pop(f"{self.user_id}:{account_id}", None)
            if not await asyncio.to_thread(repo.compare_and_set, key, raw, json.dumps(doc)):
                raise PluginAppError("version_conflict", status=409)

    def require_permission(self, permission: str) -> None:
        row = self.host.server.services.user_repo.get(self.user_id)
        if row is None or not stored_user_has_permission(row.role, row.permissions, permission):
            raise PluginAppError("permission_required", status=403)

    async def read(self) -> dict[str, Any]:
        raw = await asyncio.to_thread(self.host.server.services.plugin_state_repo.get, self.key)
        return cast(dict[str, Any], json.loads(raw)) if raw else {"version": 0}

    def asset_store(self) -> AssetStore:
        # Included in plugin backups, separate from any removable plugin installation.
        root = self.host.server.plugin_manager.plugins_dir / ".app-assets"
        return AssetStore(root, self.key)

    async def save_asset(self, encoded: str, mime_type: str) -> dict[str, Any]:
        feature = self.execution_feature
        if not feature:
            raise PluginAppError("license_required", status=403)
        await self.require(feature)
        item = await asyncio.to_thread(self.asset_store().save, encoded, mime_type)
        await self.require(feature)
        return {
            **item,
            "asset_url": f"/api/plugin-apps/{self.plugin_id}/assets/{item['asset_id']}",
        }

    async def read_asset(self, asset_id: str) -> tuple[bytes, dict[str, Any]]:
        return await asyncio.to_thread(self.asset_store().load, asset_id)

    async def update(self, fn: Callable[[dict[str, Any]], None]) -> dict[str, Any]:
        repo = self.host.server.services.plugin_state_repo
        async with self.host.locks.setdefault(self.key, asyncio.Lock()):
            raw = await asyncio.to_thread(repo.get, self.key)
            doc = json.loads(raw) if raw else {"version": 0}
            fn(doc)
            doc["version"] = int(doc.get("version", 0)) + 1
            new = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
            if len(new.encode()) > 30 * 1024 * 1024:
                raise PluginAppError("storage_limit")
            if not await asyncio.to_thread(repo.compare_and_set, self.key, raw, new):
                raise PluginAppError("version_conflict", status=409)
            return cast(dict[str, Any], doc)

    def devices(self) -> list[dict[str, Any]]:
        hub = getattr(self.host.server.app_runtime, "companion_hub", None)
        return [item.to_dict() for item in hub.list_devices(self.user_id)] if hub else []

    def device(self, device_id: str) -> dict[str, Any]:
        self.require_permission("mobile")
        found = next((item for item in self.devices() if item["device_id"] == device_id), None)
        if found is None:
            raise PluginAppError("device_not_owned", status=403)
        if not found["online"]:
            raise PluginAppError("device_offline", status=409)
        return found

    def _personal_text_models(self) -> list[dict[str, Any]]:
        from octop.infra.agents.providers.resolved import list_resolved_models
        from octop.infra.users.groups import RESOURCE_MODEL, GroupAccess, model_resource_key

        services = self.host.server.services
        owner = services.user_repo.get(self.user_id)
        if owner is None:
            raise PluginAppError("authentication_required", status=403)
        candidates = list_resolved_models(services.provider_repo.list_all())
        return GroupAccess(services.repos).filter_rows(
            candidates,
            user_id=self.user_id,
            is_admin=owner.role == "admin",
            resource_type=RESOURCE_MODEL,
            key_of=lambda item: model_resource_key(str(item["provider_name"]), str(item["model"])),
            is_owner=lambda _item: False,
        )

    async def text_models(self) -> list[dict[str, str]]:
        feature = self.execution_feature
        await self.require_any(self.license.features)
        self.execution_feature = feature
        models: list[dict[str, str]] = []
        allow_personal = True
        if self.host.server.services.config.enterprise_backend_url:
            policy = await enterprise_request(
                self.host.server, self.user_id, "GET", "/desktop/v1/policy"
            )
            resources = policy.get("policy", policy).get("resources", {})
            aliases = resources.get("model.allowlist", [])
            if not isinstance(aliases, list):
                raise PluginAppError("enterprise_policy_invalid", status=503)
            models.extend(
                {"id": alias, "name": alias, "source": "enterprise"}
                for alias in aliases
                if isinstance(alias, str) and alias
            )
            allow_personal = resources.get("model.local.enabled") is True
        if allow_personal:
            allowed = await asyncio.to_thread(self._personal_text_models)
            models.extend(
                {
                    "id": f"personal:{item['provider_name']}/{item['model']}",
                    "name": f"{item['provider_name']}/{item['model']}",
                    "source": "personal",
                }
                for item in allowed
            )
        return models

    async def generate_text(self, system: str, prompt: str, *, model_ref: str | None = None) -> str:
        services = self.host.server.services
        if model_ref is not None and not isinstance(model_ref, str):
            raise PluginAppError("invalid_model_reference")
        feature = self.execution_feature
        if not feature:
            raise PluginAppError("license_required", status=403)
        await self.require(feature)
        if services.config.enterprise_backend_url:
            policy = await enterprise_request(
                self.host.server, self.user_id, "GET", "/desktop/v1/policy"
            )
            resources = policy.get("policy", policy).get("resources", {})
            allowed_cloud = resources.get("model.allowlist", [])
            if not isinstance(allowed_cloud, list):
                raise PluginAppError("enterprise_policy_invalid", status=503)
            allowed_cloud = [item for item in allowed_cloud if isinstance(item, str) and item]
            selected_cloud = (
                model_ref
                if model_ref is not None
                and model_ref in allowed_cloud
                and not model_ref.startswith("personal:")
                else None
            )
            if model_ref is None and allowed_cloud:
                selected_cloud = allowed_cloud[0]
            if selected_cloud:
                result = await enterprise_request(
                    self.host.server,
                    self.user_id,
                    "POST",
                    "/desktop/v1/models/text",
                    body={"system": system, "prompt": prompt, "model": selected_cloud},
                    timeout=100.0,
                )
                await self.require(feature)
                text = result.get("text")
                if (
                    not isinstance(text, str)
                    or not text.strip()
                    or result.get("model") != selected_cloud
                ):
                    raise PluginAppError("enterprise_model_response_invalid", status=502)
                return text
            if resources.get("model.local.enabled") is not True:
                raise PluginAppError("model_unavailable", status=403)
        allowed = await asyncio.to_thread(self._personal_text_models)
        if model_ref:
            model_ref = model_ref.removeprefix("personal:")
            allowed = [
                item for item in allowed if f"{item['provider_name']}/{item['model']}" == model_ref
            ]
        if not allowed:
            raise PluginAppError("model_unavailable", status=409)
        model_ref = f"{allowed[0]['provider_name']}/{allowed[0]['model']}"
        # Pure text access through an explicitly permitted BYOK model; no tools.
        models = self.host.server.app_runtime.agent_registry.host_models
        generated_text = cast(
            str, await models.get(model_ref).ainvoke_text(prompt, system=system, timeout_s=60)
        )
        await self.require(feature)
        return generated_text

    def _personal_image_models(self) -> tuple[list[Any], str | None]:
        from octop.infra.users.groups import RESOURCE_MODEL, GroupAccess, model_resource_key

        services = self.host.server.services
        owner = services.user_repo.get(self.user_id)
        if owner is None:
            raise PluginAppError("authentication_required", status=403)
        config = self.host.server.app_runtime.agent_registry.media_generation.harness_config()
        if config is None:
            return [], None
        candidates = [
            item
            for item in config.configured_providers()
            if item.enabled and item.image_enabled and item.image_model and item.has_api_key()
        ]
        return GroupAccess(services.repos).filter_rows(
            candidates,
            user_id=self.user_id,
            is_admin=owner.role == "admin",
            resource_type=RESOURCE_MODEL,
            key_of=lambda item: model_resource_key(item.id, item.image_model),
            is_owner=lambda _item: False,
        ), config.default_image_provider

    async def _allow_personal_images(self) -> bool:
        if not self.host.server.services.config.enterprise_backend_url:
            return True
        policy = await enterprise_request(
            self.host.server, self.user_id, "GET", "/desktop/v1/policy"
        )
        return policy.get("policy", policy).get("resources", {}).get("model.local.enabled") is True

    async def _enterprise_image_models(self) -> list[dict[str, str]]:
        if not self.host.server.services.config.enterprise_backend_url:
            return []
        payload = await enterprise_request(
            self.host.server, self.user_id, "GET", "/desktop/v1/models/image"
        )
        rows = payload.get("models")
        if rows is None:
            # Older enterprise control planes do not expose image catalogs yet.
            return []
        if not isinstance(rows, list):
            raise PluginAppError("enterprise_policy_invalid", status=503)
        result: list[dict[str, str]] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            alias = row.get("id")
            if isinstance(alias, str) and alias:
                result.append(
                    {
                        "id": f"enterprise-image:{alias}",
                        "name": str(row.get("name") or alias),
                        "source": "enterprise",
                    }
                )
        return result

    async def image_models(self) -> list[dict[str, str]]:
        feature = self.execution_feature
        await self.require_any(self.license.features)
        self.execution_feature = feature
        result = await self._enterprise_image_models()
        if await self._allow_personal_images():
            models, _default = await asyncio.to_thread(self._personal_image_models)
            result.extend(
                {
                    "id": f"personal-image:{item.id}/{item.image_model}",
                    "name": f"{item.id}/{item.image_model}",
                    "source": "personal",
                }
                for item in models
            )
        return result

    async def generate_image(
        self, prompt: str, *, model_ref: str | None = None, aspect_ratio: str = "3:4"
    ) -> list[dict[str, str]]:
        from octop_harness.media import (
            ImageGenerationRequest,
            MediaGenerationError,
            create_media_provider,
        )

        from octop.infra.gateway.media.attachment_hints import sniff_image_media_type

        sizes = {
            "3:4": "1536x2048",
            "1:1": "2048x2048",
            "4:3": "2048x1536",
            "16:9": "2048x1152",
            "9:16": "1152x2048",
        }
        if (
            not isinstance(prompt, str)
            or not prompt.strip()
            or len(prompt) > 5000
            or aspect_ratio not in sizes
        ):
            raise PluginAppError("invalid_input")
        if model_ref is not None and not isinstance(model_ref, str):
            raise PluginAppError("invalid_model_reference")
        feature = self.execution_feature
        if not feature:
            raise PluginAppError("license_required", status=403)
        await self.require(feature)
        enterprise_models = await self._enterprise_image_models()
        selected_enterprise = next(
            (item for item in enterprise_models if item["id"] == model_ref),
            None,
        )
        if model_ref is None and enterprise_models:
            selected_enterprise = enterprise_models[0]
        if selected_enterprise is not None:
            alias = selected_enterprise["id"].removeprefix("enterprise-image:")
            result = await enterprise_request(
                self.host.server,
                self.user_id,
                "POST",
                "/desktop/v1/models/image",
                body={
                    "prompt": prompt.strip(),
                    "model": alias,
                    "size": sizes[aspect_ratio],
                    "count": 1,
                },
                timeout=130.0,
            )
            await self.require(feature)
            current_models = await self._enterprise_image_models()
            if not any(item["id"] == selected_enterprise["id"] for item in current_models):
                raise PluginAppError("model_unavailable", status=403)
            raw_images = result.get("images")
            if not isinstance(raw_images, list) or not raw_images or len(raw_images) > 4:
                raise PluginAppError("invalid_image", status=502)
            images: list[dict[str, str]] = []
            for item in raw_images:
                if not isinstance(item, dict) or not isinstance(item.get("data_base64"), str):
                    raise PluginAppError("invalid_image", status=502)
                try:
                    data = base64.b64decode(item["data_base64"], validate=True)
                except (ValueError, binascii.Error) as exc:
                    raise PluginAppError("invalid_image", status=502) from exc
                mime = sniff_image_media_type(data[:16])
                if (
                    not data
                    or len(data) > 5 * 1024 * 1024
                    or mime not in {"image/png", "image/jpeg", "image/webp"}
                ):
                    raise PluginAppError("invalid_image", status=502)
                extension = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}[mime]
                images.append(
                    {
                        "filename": f"generated-{hashlib.sha256(data).hexdigest()[:24]}.{extension}",
                        "mime_type": mime,
                        "data_base64": base64.b64encode(data).decode("ascii"),
                    }
                )
            return images
        if model_ref and model_ref.startswith("enterprise-image:"):
            raise PluginAppError("model_unavailable", status=409)
        if not await self._allow_personal_images():
            raise PluginAppError("model_unavailable", status=403)
        models, default = await asyncio.to_thread(self._personal_image_models)
        selected = next(
            (
                item
                for item in models
                if (
                    f"personal-image:{item.id}/{item.image_model}" == model_ref
                    if model_ref
                    else item.id == default
                )
            ),
            None,
        )
        if selected is None:
            raise PluginAppError("model_unavailable", status=409)
        origin = httpx.URL(selected.base_url)

        async def guard(request: httpx.Request) -> None:
            url = request.url
            if url.username or url.password:
                raise PluginAppError("image_download_not_allowed", status=502)
            if (url.scheme, url.host, url.port) == (origin.scheme, origin.host, origin.port):
                return
            if request.method != "GET" or url.scheme != "https" or url.username or url.password:
                raise PluginAppError("image_download_not_allowed", status=502)
            try:
                addresses = await asyncio.to_thread(
                    socket.getaddrinfo, url.host, url.port or 443, type=socket.SOCK_STREAM
                )
            except OSError as exc:
                raise PluginAppError("image_download_unavailable", status=502) from exc
            if not addresses or any(
                not ipaddress.ip_address(address[4][0]).is_global for address in addresses
            ):
                raise PluginAppError("image_download_not_allowed", status=502)

        async def bound_response(response: httpx.Response) -> None:
            # Identity encoding lets the stream limit also bound decoded memory use.
            if response.headers.get("Content-Encoding", "identity").lower() != "identity":
                raise PluginAppError("image_response_encoding_invalid", status=502)
            limit = (8 if response.request.method == "POST" else 5) * 1024 * 1024
            if response.is_stream_consumed:
                if len(response.content) > limit:
                    raise PluginAppError("image_response_too_large", status=502)
                return
            response.stream = _BoundedResponseStream(
                cast(httpx.AsyncByteStream, response.stream), limit
            )

        try:
            async with httpx.AsyncClient(
                timeout=120,
                headers={"Accept-Encoding": "identity"},
                event_hooks={"request": [guard], "response": [bound_response]},
            ) as client:
                provider = create_media_provider(selected, client=client)
                artifacts = await provider.generate_image(
                    ImageGenerationRequest(
                        prompt=prompt.strip(),
                        size=aspect_ratio
                        if selected.provider == "minimax"
                        else sizes[aspect_ratio],
                        count=1,
                        watermark=False,
                    )
                )
        except MediaGenerationError as exc:
            raise PluginAppError("image_generation_failed", status=502) from exc
        await self.require(feature)
        if not await self._allow_personal_images():
            raise PluginAppError("model_unavailable", status=403)
        current_models_any: list[Any]
        current_models_any, _ = await asyncio.to_thread(self._personal_image_models)
        if not any(
            item.id == selected.id and item.image_model == selected.image_model
            for item in current_models_any
        ):
            raise PluginAppError("model_unavailable", status=403)
        if not artifacts or len(artifacts) > 4:
            raise PluginAppError("invalid_image", status=502)
        images = []
        for artifact in artifacts:
            data = artifact.data
            mime = sniff_image_media_type(data[:16])
            if (
                not data
                or len(data) > 5 * 1024 * 1024
                or mime not in {"image/png", "image/jpeg", "image/webp"}
                or mime != artifact.media_type
            ):
                raise PluginAppError("invalid_image", status=502)
            extension = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}[mime]
            images.append(
                {
                    "filename": f"generated-{hashlib.sha256(data).hexdigest()[:24]}.{extension}",
                    "mime_type": mime,
                    "data_base64": base64.b64encode(data).decode("ascii"),
                }
            )
        return images

    async def run_phone(
        self,
        device_id: str,
        task: str,
        *,
        task_id: str,
        policy: dict[str, Any],
        max_steps: int | None = None,
        idle_timeout_s: float | None = None,
    ) -> Any:
        feature = self.execution_feature
        await self._require_phone_permission(device_id)
        self._require_xhs_task_contract(device_id, policy)
        await self.require(feature)
        hub = self.host.server.app_runtime.companion_hub
        options: dict[str, Any] = {}
        if max_steps is not None:
            options["max_steps"] = max_steps
        if idle_timeout_s is not None:
            options["idle_timeout_s"] = idle_timeout_s
        pending = asyncio.create_task(
            hub.run_task(device_id, task, task_id=task_id, task_policy=policy, **options)
        )
        cancel_requested = False
        try:
            while not pending.done():
                await asyncio.wait({pending}, timeout=10)
                if not pending.done():
                    try:
                        await self._require_phone_permission(device_id)
                        self._require_xhs_task_contract(device_id, policy)
                        await self.require(feature)
                    except (PluginAppError, OctopError) as exc:
                        cancel_requested = True
                        await hub.cancel_task(device_id, task_id)
                        reason = (
                            "phone_access_revoked_during_run"
                            if isinstance(exc, PluginAppError)
                            and exc.reason
                            in {"permission_required", "device_offline", "device_not_owned"}
                            else "phone_contract_changed_during_run"
                            if isinstance(exc, PluginAppError)
                            and exc.reason in {"phone_policy_not_enforce", "phone_skills_not_ready"}
                            else "license_revoked_during_run"
                        )
                        status = 409 if reason == "phone_contract_changed_during_run" else 403
                        raise PluginAppError(reason, status=status) from None
            return await pending
        except BaseException:
            try:
                if not pending.done() and not cancel_requested:
                    with suppress(Exception):
                        await asyncio.shield(hub.cancel_task(device_id, task_id))
            finally:
                pending.cancel()
                await asyncio.gather(pending, return_exceptions=True)
            raise

    async def _require_phone_permission(self, device_id: str) -> None:
        self.device(device_id)
        if self.host.server.services.config.enterprise_backend_url:
            from octop.infra.enterprise_policy import enterprise_policy_permissions

            policy = await enterprise_request(
                self.host.server, self.user_id, "GET", "/desktop/v1/policy"
            )
            if "mobile" not in enterprise_policy_permissions(policy):
                raise PluginAppError("permission_required", status=403)

    def _require_xhs_task_contract(self, device_id: str, policy: dict[str, Any]) -> None:
        """Recheck the phone contract immediately before an XHS dispatch.

        The plugin state machine performs the same checks while preparing a
        run.  This second gate closes the race where a phone loses enforced
        policy or skill readiness between preparation and the actual send.
        Generic companion tasks deliberately bypass this XHS-specific gate.
        """
        if not isinstance(policy, dict):
            return
        operation_class = policy.get("operationClass")
        targets = policy.get("targetPackages")
        if operation_class not in _XHS_OPERATION_CLASSES or not isinstance(targets, list):
            return
        if _XHS_PACKAGE not in targets:
            return
        device = self.device(device_id)
        if device.get("policy_mode") != "enforce":
            raise PluginAppError("phone_policy_not_enforce", status=409)
        if (
            int(device.get("skill_bundle_version") or 0) < _XHS_MIN_SKILL_BUNDLE_VERSION
            or device.get("skill_sync_status") != "current"
        ):
            raise PluginAppError("phone_skills_not_ready", status=409)

    async def media(
        self, device_id: str, items: list[dict[str, Any]], *, album: str = "Tabby"
    ) -> list[dict[str, Any]]:
        feature = self.execution_feature
        receipts: list[dict[str, Any]] = []
        for item in items:
            await self.require(feature)
            await self._require_phone_permission(device_id)
            receipts.extend(
                await self.host.server.app_runtime.companion_hub.push_media(
                    device_id, [item], album=album
                )
            )
        return receipts

    async def cancel_phone(self, device_id: str, task_id: str) -> Any:
        if not any(device["device_id"] == device_id for device in self.devices()):
            raise PluginAppError("device_not_owned", status=403)
        return await self.host.server.app_runtime.companion_hub.cancel_task(device_id, task_id)

    async def audit(self, action: str, target: str) -> None:
        # Content, account identity and credentials never enter the host audit.
        await asyncio.to_thread(
            self.host.server.services.audit_repo.write,
            actor=str(self.user_id),
            action=f"plugin.{self.plugin_id}.{action}",
            target=target,
        )

    async def sync_outbox(self, events: list[dict[str, Any]]) -> dict[str, Any]:
        """Push redacted plugin audit events to the enterprise control plane."""
        await self.require("xhs.analytics")
        if not self.host.server.services.config.enterprise_backend_url:
            raise PluginAppError("enterprise_backend_unavailable", status=503)
        return await enterprise_request(
            self.host.server,
            self.user_id,
            "POST",
            "/desktop/v1/sync",
            body={"events": events},
        )

    async def save_evidence(
        self, run_id: str, screenshot: bytes | None, *, parent_run_id: str | None = None
    ) -> str:
        if not screenshot:
            return ""
        if parent_run_id is not None and not any(
            row.get("id") == parent_run_id for row in (await self.read()).get("runs", [])
        ):
            raise PluginAppError("not_found", status=404)
        key = f"plugin-evidence:{self.key}:{run_id}"
        import base64

        await asyncio.to_thread(
            self.host.server.services.settings_repo.set,
            key,
            base64.b64encode(screenshot).decode("ascii"),
        )
        if parent_run_id is not None:
            await asyncio.to_thread(
                self.host.server.services.settings_repo.set,
                f"plugin-evidence-owner:{self.key}:{run_id}",
                parent_run_id,
            )
        return f"/api/plugin-apps/{self.plugin_id}/evidence/{run_id}"

    def spawn(self, key: str, coroutine: Any) -> None:
        token = (self.key, key)
        current = self.host.tasks.get(token)
        if current and not current.done():
            coroutine.close()
            return
        task = asyncio.create_task(coroutine, name=f"plugin-{self.plugin_id}-{key}")
        self.host.tasks[token] = task
        task.add_done_callback(lambda _task: self.host.tasks.pop(token, None))


class PluginAppHost:
    def __init__(self, server: Any) -> None:
        self.server = server
        self.instance_id = uuid4().hex
        self.locks: dict[str, asyncio.Lock] = {}
        self.tasks: dict[tuple[str, str], asyncio.Task[None]] = {}
        self.modules: dict[str, tuple[str, Any]] = {}
        self.scheduler: asyncio.Task[None] | None = None

    def start(self) -> None:
        self.scheduler = asyncio.create_task(self._tick_loop(), name="plugin-app-scheduler")

    async def phone_skill_bundle(self, user_id: int, device_id: str) -> dict[str, Any] | None:
        from octop.infra.plugin_apps.phone_skills import build_bundle

        try:
            ctx = await self.context("xhs-ops", user_id)
            await ctx.require_any(["xhs.publish", "xhs.ops", "xhs.comment", "xhs.takeover"])
            ctx.device(device_id)
            path = self.definition("xhs-ops", require_enabled=True)["path"]
            return await asyncio.to_thread(build_bundle, path / "phone-skills")
        except (PluginAppError, OctopError):
            return None

    async def _tick_loop(self) -> None:
        while True:
            try:
                for user in self.server.user_manager.list():
                    for item in self.server.plugin_manager.list_installed():
                        try:
                            definition = self.definition(item["id"], require_enabled=True)
                            if not definition["app"].get("scheduler"):
                                continue
                            ctx = await self.context(item["id"], user.id)
                            if not ctx.license.active:
                                continue
                            required = definition["app"].get("scheduler_features", [])
                            await ctx.require_any(required)
                            module = self.module(item["id"])
                            if hasattr(module, "tick"):
                                await module.tick(ctx)
                        except (PluginAppError, OctopError):
                            continue
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("plugin scheduler tick failed")
            await asyncio.sleep(30)

    def definition(self, plugin_id: str, *, require_enabled: bool = False) -> dict[str, Any]:
        manager = self.server.plugin_manager
        path = manager.plugin_dir(plugin_id) if manager else None
        if path is None:
            raise PluginAppError("plugin_not_installed", status=404)
        manifest = yaml.safe_load((path / "plugin.yaml").read_text())
        app = manifest.get("app") if isinstance(manifest, dict) else None
        if not isinstance(app, dict) or app.get("sdk") != 1:
            raise PluginAppError("plugin_app_unsupported", status=404)
        enabled = (
            manager.global_enabled_map().get(plugin_id, True)
            and PluginRegistry().get(plugin_id) is not None
        )
        if require_enabled and not enabled:
            raise PluginAppError("plugin_disabled", status=409)
        return {
            "id": plugin_id,
            "name": manifest["name"],
            "version": manifest["version"],
            "enabled": bool(enabled),
            "ui": manifest.get("ui"),
            "app": app,
            "path": path,
        }

    def module(self, plugin_id: str) -> Any:
        definition = self.definition(plugin_id, require_enabled=True)
        path: Path = definition["path"]
        entry = (path / str(definition["app"]["entry"])).resolve()
        if not entry.is_relative_to(path.resolve()) or entry.suffix != ".py":
            raise PluginAppError("plugin_app_invalid", status=500)
        fingerprint_data = hashlib.sha256()
        for source in sorted(path.rglob("*.py")):
            fingerprint_data.update(str(source.relative_to(path)).encode())
            fingerprint_data.update(source.read_bytes())
        fingerprint = fingerprint_data.hexdigest()
        cached = self.modules.get(plugin_id)
        if cached and cached[0] == fingerprint:
            return cached[1]
        module_name = f"octop_app_{plugin_id.replace('-', '_')}"
        for name in list(sys.modules):
            if name == module_name or name.startswith(module_name + "."):
                del sys.modules[name]
        spec = importlib.util.spec_from_file_location(
            module_name, entry, submodule_search_locations=[str(path)]
        )
        if spec is None or spec.loader is None:
            raise PluginAppError("plugin_app_invalid", status=500)
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        self.modules[plugin_id] = (fingerprint, module)
        return module

    async def license(self, plugin_id: str, user_id: int) -> PluginLicense:
        if not self.server.services.config.enterprise_backend_url:
            # Paid apps require their authority even on self-hosted desktops.
            return PluginLicense(
                plugin_id=plugin_id,
                tenant_id="",
                member_id=str(user_id),
                status="inactive",
                version=0,
            )
        raw = await enterprise_request(
            self.server, user_id, "GET", f"/desktop/v1/plugins/{plugin_id}/license"
        )
        identity = await enterprise_request(self.server, user_id, "GET", "/desktop/v1/me")
        try:
            license = PluginLicense.model_validate(raw)
        except ValidationError as exc:
            raise PluginAppError("license_invalid", status=503) from exc
        if (
            license.plugin_id != plugin_id
            or license.tenant_id != str(identity.get("tenant", {}).get("id", ""))
            or license.member_id != str(identity.get("member", {}).get("id", ""))
        ):
            raise PluginAppError("license_invalid", status=403)
        if not license.active:
            if license.status in {"active", "trial"}:
                license.status = "expired"
            license.features = []
        return license

    async def context(self, plugin_id: str, user_id: int) -> AppContext:
        return AppContext(self, plugin_id, user_id, await self.license(plugin_id, user_id))

    async def list_apps(self, user_id: int) -> list[dict[str, Any]]:
        out = []
        for item in self.server.plugin_manager.list_installed():
            try:
                definition = self.definition(item["id"])
            except PluginAppError:
                continue
            license = await self.license(item["id"], user_id)
            out.append(
                {k: definition[k] for k in ("id", "name", "version", "enabled", "ui")}
                | {"license": license.model_dump(mode="json")}
            )
        return out

    async def snapshot(self, plugin_id: str, user_id: int) -> dict[str, Any]:
        definition = self.definition(plugin_id, require_enabled=True)
        ctx = await self.context(plugin_id, user_id)
        if not ctx.license.readable_features:
            raise PluginAppError("license_required", status=403)
        data = await self.module(plugin_id).snapshot(ctx)
        features = ctx.license.readable_features
        if not features:
            raise PluginAppError("license_required", status=403)
        scopes = definition["app"].get("read_scopes", {})
        data = {
            key: value
            for key, value in data.items()
            if key == "version" or set(scopes.get(key, [])).intersection(features)
        }
        if "accounts" in data and "xhs.ops" not in features and "xhs.takeover" not in features:
            data["accounts"] = [
                {key: row[key] for key in ("id", "name", "project_id", "device_id") if key in row}
                for row in data.get("accounts", [])
            ]
        record_scopes = definition["app"].get("record_scopes", {})
        if set(features) == {"xhs.analytics"} and not record_scopes:
            data["runs"] = [
                {
                    key: row[key]
                    for key in ("id", "kind", "status", "created_at", "updated_at")
                    if key in row
                }
                for row in data.get("runs", [])
            ]
        for collection, policy in record_scopes.items():
            if collection in data:
                data[collection] = [
                    row
                    if set(policy.get("kinds", {}).get(row.get("kind"), [])).intersection(features)
                    else {key: row[key] for key in policy.get("summary_fields", []) if key in row}
                    for row in data[collection]
                ]
        return {
            "plugin": {k: definition[k] for k in ("id", "name", "version")},
            "license": ctx.license.model_dump(mode="json"),
            "data": data,
            "devices": ctx.devices(),
            "read_only": not ctx.license.active,
        }

    async def command(
        self, plugin_id: str, user_id: int, command: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        ctx = await self.context(plugin_id, user_id)
        definition = self.definition(plugin_id, require_enabled=True)
        features = definition["app"].get("commands", {}).get(command)
        if features is None:
            raise PluginAppError("unknown_command")
        if features:
            await ctx.require_any(features)
        await self.module(plugin_id).command(ctx, command, payload)
        return await self.snapshot(plugin_id, user_id)

    async def evidence(self, plugin_id: str, user_id: int, run_id: str) -> bytes:
        import base64

        ctx = await self.context(plugin_id, user_id)
        if not ctx.license.readable_features:
            raise PluginAppError("license_required", status=403)
        allowed = (
            self.definition(plugin_id, require_enabled=True)["app"]
            .get("read_scopes", {})
            .get("evidence", [])
        )
        if not set(allowed).intersection(ctx.license.readable_features):
            raise PluginAppError("license_required", status=403)
        doc = await self.snapshot(plugin_id, user_id)
        fresh = PluginLicense.model_validate(doc["license"])
        if (ctx.license.tenant_id, ctx.license.member_id) != (fresh.tenant_id, fresh.member_id):
            raise PluginAppError("license_identity_changed", status=403)
        if not set(allowed).intersection(fresh.readable_features):
            raise PluginAppError("license_required", status=403)
        parent = await asyncio.to_thread(
            self.server.services.settings_repo.get, f"plugin-evidence-owner:{ctx.key}:{run_id}"
        )
        run = next(
            (r for r in doc["data"].get("runs", []) if r.get("id") == (parent or run_id)), None
        )
        if run is None:
            raise PluginAppError("not_found", status=404)
        record_policy = self.definition(plugin_id)["app"].get("record_scopes", {}).get("runs")
        if record_policy is not None and not set(
            record_policy.get("kinds", {}).get(run.get("kind"), [])
        ).intersection(fresh.readable_features):
            raise PluginAppError("license_required", status=403)
        raw = await asyncio.to_thread(
            self.server.services.settings_repo.get, f"plugin-evidence:{ctx.key}:{run_id}"
        )
        if raw is None:
            raise PluginAppError("not_found", status=404)
        return base64.b64decode(raw)

    async def asset(self, plugin_id: str, user_id: int, asset_id: str) -> tuple[bytes, str]:
        ctx = await self.context(plugin_id, user_id)
        visible = await self.snapshot(plugin_id, user_id)
        identity = visible["license"]
        if (ctx.license.tenant_id, ctx.license.member_id) != (
            identity["tenant_id"],
            identity["member_id"],
        ):
            raise PluginAppError("license_identity_changed", status=403)
        if not references_asset(visible["data"], asset_id):
            raise PluginAppError("not_found", status=404)
        data, metadata = await ctx.read_asset(asset_id)
        return data, str(metadata["mime_type"])

    def guard_tools(self, tools: list[Any]) -> None:
        for tool in tools:
            original = tool.coroutine
            if original is None:
                continue
            owner = next(
                (r.plugin_id for r in PluginRegistry().all_tools() if r.name == tool.name), None
            )
            owners = {r.plugin_id for r in PluginRegistry().all_tools() if r.name == tool.name}
            if len(owners) > 1 and any(self.is_app(id) for id in owners):
                raise PluginAppError("ambiguous_plugin_tool", status=409)
            try:
                definition = self.definition(str(owner))
            except PluginAppError:
                continue

            required = definition["app"].get("tool_feature", "")
            features = tuple(required if isinstance(required, list) else [required])

            async def guarded(
                *args: Any,
                _fn: Any = original,
                _id: str = str(owner),
                _features: tuple[str, ...] = features,
                **kwargs: Any,
            ) -> Any:
                from langgraph.config import get_config

                config = get_config().get("configurable", {})
                user_id = config.get("user")
                if user_id is None:
                    raise PluginAppError("authentication_required", status=403)
                ctx = await self.context(_id, int(user_id))
                await ctx.require_any(list(_features))
                token = current_context.set(ctx)
                try:
                    return await _fn(*args, **kwargs)
                finally:
                    current_context.reset(token)

            tool.coroutine = guarded
            # No synchronous invocation can skip the asynchronous license check.
            tool.func = None

    def is_app(self, plugin_id: str) -> bool:
        try:
            self.definition(plugin_id)
            return True
        except PluginAppError:
            return False

    async def shutdown(self) -> None:
        if self.scheduler is not None:
            self.scheduler.cancel()
            await asyncio.gather(self.scheduler, return_exceptions=True)
        pending = list(self.tasks.values())
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)

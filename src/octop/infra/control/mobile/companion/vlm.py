"""Vision model the phone-side agent uses, served through an Octop proxy.

The phone needs an OpenAI-compatible ``/chat/completions`` endpoint that takes
images. Instead of handing it a provider key, Octop gives it
``apiUrl = <octop>/api/mobile/companion/vlm/v1`` with the device key as the
bearer, and forwards each request with the server-side provider credentials.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from octop.infra.agents.providers import KIND_TO_PROTOCOL
from octop.infra.agents.providers.model_flags import is_vision_model

SETTINGS_KEY = "mobile.companion.vlm"
PROXY_PATH = "/api/mobile/companion/vlm/v1"
_UPSTREAM_TIMEOUT = httpx.Timeout(connect=30.0, read=180.0, write=60.0, pool=30.0)


class SettingsStore(Protocol):
    def get(self, key: str) -> str | None: ...

    def set(self, key: str, value: str) -> None: ...


class ProviderLookup(Protocol):
    def get_by_name(self, name: str) -> Any: ...

    def list_all(self) -> list[Any]: ...


@dataclass(frozen=True)
class VlmSettings:
    provider: str = ""
    model: str = ""
    max_tokens: int | None = None

    @property
    def configured(self) -> bool:
        return bool(self.provider and self.model)


@dataclass(frozen=True)
class VlmTarget:
    base_url: str
    api_key: str
    model: str
    max_tokens: int | None = None


@dataclass(frozen=True)
class VlmCandidate:
    provider: str
    model: str
    vision: bool


def load_settings(settings: SettingsStore) -> VlmSettings:
    raw = settings.get(SETTINGS_KEY)
    if not raw:
        return VlmSettings()
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return VlmSettings()
    if not isinstance(data, dict):
        return VlmSettings()
    max_tokens = data.get("max_tokens")
    return VlmSettings(
        provider=str(data.get("provider") or "").strip(),
        model=str(data.get("model") or "").strip(),
        max_tokens=max_tokens if isinstance(max_tokens, int) and max_tokens > 0 else None,
    )


def save_settings(settings: SettingsStore, value: VlmSettings) -> None:
    settings.set(
        SETTINGS_KEY,
        json.dumps(
            {"provider": value.provider, "model": value.model, "max_tokens": value.max_tokens}
        ),
    )


def _openai_compatible(row: Any) -> bool:
    return bool(
        row is not None
        and row.enabled
        and row.base_url
        and row.api_key
        and KIND_TO_PROTOCOL.get(str(row.kind), "openai") == "openai"
    )


def list_candidates(providers: ProviderLookup) -> list[VlmCandidate]:
    """Models the phone can use: enabled OpenAI-protocol providers, vision first."""
    out: list[VlmCandidate] = []
    for row in providers.list_all():
        if not _openai_compatible(row):
            continue
        for model in row.get_models():
            model_id = str(model.get("id") or "").strip()
            if model_id:
                out.append(VlmCandidate(row.name, model_id, is_vision_model(model)))
    out.sort(key=lambda c: (not c.vision, c.provider, c.model))
    return out


def resolve_target(settings: SettingsStore, providers: ProviderLookup) -> VlmTarget | None:
    chosen = load_settings(settings)
    if not chosen.configured:
        return None
    row = providers.get_by_name(chosen.provider)
    if not _openai_compatible(row):
        return None
    return VlmTarget(
        base_url=str(row.base_url).rstrip("/"),
        api_key=str(row.api_key),
        model=chosen.model,
        max_tokens=chosen.max_tokens,
    )


def phone_vlm_payload(
    public_base_url: str, device_key: str, target: VlmTarget | None
) -> dict[str, Any] | None:
    """``connected.vlm`` for a phone; ``None`` leaves the phone without a model."""
    if target is None:
        return None
    payload: dict[str, Any] = {
        "apiUrl": f"{public_base_url.rstrip('/')}{PROXY_PATH}",
        "apiKey": device_key,
        "model": target.model,
        # "none" keeps the StepFun-specific reasoning_effort out of requests.
        "reasoningEffort": "none",
    }
    if target.max_tokens:
        payload["maxTokens"] = target.max_tokens
    return payload


@dataclass
class UpstreamResponse:
    status_code: int
    media_type: str
    body: AsyncIterator[bytes]


async def forward_chat_completion(
    target: VlmTarget,
    body: dict[str, Any],
    *,
    transport: httpx.AsyncBaseTransport | None = None,
) -> UpstreamResponse:
    """POST *body* to the provider; the model (and token cap) are pinned server-side."""
    payload = {**body, "model": target.model}
    if target.max_tokens:
        payload["max_tokens"] = target.max_tokens
    client = httpx.AsyncClient(timeout=_UPSTREAM_TIMEOUT, transport=transport)
    request = client.build_request(
        "POST",
        f"{target.base_url}/chat/completions",
        headers={"Authorization": f"Bearer {target.api_key}"},
        json=payload,
    )
    try:
        resp = await client.send(request, stream=True)
    except BaseException:
        await client.aclose()
        raise

    async def _body() -> AsyncIterator[bytes]:
        try:
            async for chunk in resp.aiter_bytes():
                yield chunk
        finally:
            await resp.aclose()
            await client.aclose()

    media_type = resp.headers.get("content-type", "application/json").split(";", 1)[0]
    return UpstreamResponse(resp.status_code, media_type, _body())

"""Phone-side VLM: model choice, candidates, payload and the proxy forwarder."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import httpx
from tests.support.companion import FakeSettings

from octop.infra.control.mobile.companion import vlm


def _provider(
    name: str,
    *,
    kind: str = "openai",
    enabled: int = 1,
    api_key: str | None = "sk-up",
    models: list[dict[str, Any]] | None = None,
) -> SimpleNamespace:
    entries = models if models is not None else [{"id": "gpt-4o"}, {"id": "text-only"}]
    return SimpleNamespace(
        name=name,
        kind=kind,
        enabled=enabled,
        base_url="https://up.example/v1/",
        api_key=api_key,
        get_models=lambda: entries,
    )


class _Providers:
    def __init__(self, *rows: SimpleNamespace) -> None:
        self.rows = list(rows)

    def get_by_name(self, name: str) -> SimpleNamespace | None:
        return next((r for r in self.rows if r.name == name), None)

    def list_all(self) -> list[SimpleNamespace]:
        return self.rows


def test_settings_round_trip_and_defaults() -> None:
    settings = FakeSettings()
    assert not vlm.load_settings(settings).configured
    vlm.save_settings(settings, vlm.VlmSettings("step", "step-3.7-flash", 8192))
    loaded = vlm.load_settings(settings)
    assert (loaded.provider, loaded.model, loaded.max_tokens) == ("step", "step-3.7-flash", 8192)
    settings.data[vlm.SETTINGS_KEY] = "[]"
    assert not vlm.load_settings(settings).configured


def test_candidates_only_usable_openai_providers_vision_first() -> None:
    providers = _Providers(
        _provider("b-openai"),
        _provider("claude", kind="anthropic"),
        _provider("off", enabled=0),
        _provider("keyless", api_key=None),
    )
    candidates = vlm.list_candidates(providers)
    assert [(c.provider, c.model, c.vision) for c in candidates] == [
        ("b-openai", "gpt-4o", True),
        ("b-openai", "text-only", False),
    ]


def test_resolve_target_requires_configured_usable_provider() -> None:
    settings = FakeSettings()
    providers = _Providers(_provider("p"))
    assert vlm.resolve_target(settings, providers) is None
    vlm.save_settings(settings, vlm.VlmSettings("p", "gpt-4o"))
    target = vlm.resolve_target(settings, providers)
    assert target is not None
    assert target.base_url == "https://up.example/v1" and target.model == "gpt-4o"
    providers.rows[0].enabled = 0
    assert vlm.resolve_target(settings, providers) is None


def test_phone_payload_points_at_proxy_with_device_key() -> None:
    assert vlm.phone_vlm_payload("http://h:8088", "dev-key", None) is None
    target = vlm.VlmTarget("https://up/v1", "sk-up", "gpt-4o", max_tokens=4096)
    payload = vlm.phone_vlm_payload("http://h:8088/", "dev-key", target)
    assert payload == {
        "apiUrl": "http://h:8088/api/mobile/companion/vlm/v1",
        "apiKey": "dev-key",
        "model": "gpt-4o",
        "reasoningEffort": "none",
        "maxTokens": 4096,
    }
    assert "sk-up" not in json.dumps(payload)


async def test_forward_pins_model_and_uses_server_key() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            headers={"content-type": "text/event-stream; charset=utf-8"},
            content=b'data: {"choices":[]}\n\ndata: [DONE]\n\n',
        )

    target = vlm.VlmTarget("https://up/v1", "sk-up", "gpt-4o", max_tokens=2048)
    upstream = await vlm.forward_chat_completion(
        target,
        {"model": "step-3.7-flash", "stream": True, "max_tokens": 32768, "messages": []},
        transport=httpx.MockTransport(handler),
    )
    body = b"".join([chunk async for chunk in upstream.body])
    assert upstream.status_code == 200 and upstream.media_type == "text/event-stream"
    assert body.endswith(b"[DONE]\n\n")
    assert seen["url"] == "https://up/v1/chat/completions"
    assert seen["auth"] == "Bearer sk-up"
    assert seen["body"]["model"] == "gpt-4o"
    assert seen["body"]["max_tokens"] == 2048
    assert seen["body"]["stream"] is True


async def test_forward_passes_upstream_errors_through() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"error": {"message": "slow down"}})

    target = vlm.VlmTarget("https://up/v1", "sk-up", "gpt-4o")
    upstream = await vlm.forward_chat_completion(
        target, {"messages": []}, transport=httpx.MockTransport(handler)
    )
    body = b"".join([chunk async for chunk in upstream.body])
    assert upstream.status_code == 429
    assert json.loads(body)["error"]["message"] == "slow down"

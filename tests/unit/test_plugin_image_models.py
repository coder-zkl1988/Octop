"""Paid image access reuses media adapters without exposing provider credentials."""

from __future__ import annotations

import base64
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from octop_harness import MediaProviderConfig
from octop_harness.media import GeneratedMedia

from octop.infra.plugin_apps.contracts import PluginAppError
from octop.infra.plugin_apps.host import AppContext
from tests.unit.test_plugin_enterprise_models import context

PNG = b"\x89PNG\r\n\x1a\nimage"


def setup(monkeypatch: Any, policy: Any = True) -> tuple[AppContext, list[dict[str, Any]]]:
    ctx, calls = context(monkeypatch, {"model.local.enabled": policy})
    config = MediaProviderConfig(
        id="images",
        provider="volcengine",
        api_key="test-key",
        base_url="https://provider.example/v1",
        image_model="image-model",
    )
    monkeypatch.setattr(AppContext, "_personal_image_models", lambda _self: ([config], "images"))

    async def require_any(_features: list[str]) -> None:
        pass

    ctx.require_any = require_any
    return ctx, calls


async def test_oversized_download_is_stopped_while_streaming(monkeypatch: Any) -> None:
    ctx, _ = setup(monkeypatch)
    consumed, closed = [], []

    class LargeStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            for index in range(100):
                consumed.append(index)
                yield b"x" * (1024 * 1024)

        async def aclose(self):
            closed.append(True)

    def respond(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            return httpx.Response(
                200, json={"data": [{"url": "https://provider.example/large.png"}]}
            )
        return httpx.Response(200, stream=LargeStream())

    client_type = httpx.AsyncClient
    monkeypatch.setattr(
        "octop.infra.plugin_apps.host.httpx.AsyncClient",
        lambda **kwargs: client_type(transport=httpx.MockTransport(respond), **kwargs),
    )
    with pytest.raises(PluginAppError, match="image_response_too_large"):
        await ctx.generate_image("test")
    assert len(consumed) == 6 and closed


async def test_compressed_unbounded_response_is_rejected_before_decoding(monkeypatch: Any) -> None:
    ctx, _ = setup(monkeypatch)

    class EncodedStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            raise AssertionError("compressed content must not be consumed")
            yield b""

    client_type = httpx.AsyncClient
    monkeypatch.setattr(
        "octop.infra.plugin_apps.host.httpx.AsyncClient",
        lambda **kwargs: client_type(
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(
                    200, stream=EncodedStream(), headers={"Content-Encoding": "gzip"}
                )
            ),
            **kwargs,
        ),
    )
    with pytest.raises(PluginAppError, match="image_response_encoding_invalid"):
        await ctx.generate_image("test")


async def test_catalog_contains_only_authorized_image_names(monkeypatch: Any) -> None:
    ctx, _ = setup(monkeypatch)
    assert await ctx.image_models() == [
        {
            "id": "personal-image:images/image-model",
            "name": "images/image-model",
            "source": "personal",
        }
    ]


@pytest.mark.parametrize("policy", [False, None, "true"])
async def test_enterprise_must_explicitly_enable_personal_images(
    monkeypatch: Any, policy: Any
) -> None:
    ctx, calls = setup(monkeypatch, policy)
    assert await ctx.image_models() == []
    with pytest.raises(PluginAppError, match="model_unavailable"):
        await ctx.generate_image("test")
    assert all(call["method"] == "GET" for call in calls)


async def test_real_media_adapter_request_returns_normalized_image(monkeypatch: Any) -> None:
    ctx, _ = setup(monkeypatch)
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"data": [{"b64_json": base64.b64encode(PNG).decode()}]})

    client_type = httpx.AsyncClient
    monkeypatch.setattr(
        "octop.infra.plugin_apps.host.httpx.AsyncClient",
        lambda **kwargs: client_type(transport=httpx.MockTransport(respond), **kwargs),
    )
    result = await ctx.generate_image("羽毛球封面", model_ref="personal-image:images/image-model")
    assert len(result) == 1 and result[0]["mime_type"] == "image/png"
    assert base64.b64decode(result[0]["data_base64"]) == PNG
    assert len(requests) == 1 and requests[0].url.path == "/v1/images/generations"
    assert requests[0].headers["Authorization"] == "Bearer test-key"
    assert b'"response_format":"b64_json"' in requests[0].content
    assert "test-key" not in str(result)


async def test_wrong_model_and_missing_default_do_not_fall_back(monkeypatch: Any) -> None:
    ctx, _ = setup(monkeypatch)
    with pytest.raises(PluginAppError, match="model_unavailable"):
        await ctx.generate_image("test", model_ref="company-image")
    models, _default = ctx._personal_image_models()
    monkeypatch.setattr(
        AppContext, "_personal_image_models", lambda _self: (models, "hidden-default")
    )
    with pytest.raises(PluginAppError, match="model_unavailable"):
        await ctx.generate_image("test")


async def test_generation_discards_result_if_license_is_revoked(monkeypatch: Any) -> None:
    ctx, _ = setup(monkeypatch)
    checks = []

    async def require(feature: str) -> None:
        checks.append(feature)
        if len(checks) == 2:
            raise PluginAppError("license_required", status=403)

    async def generate(_request: Any) -> list[GeneratedMedia]:
        return [GeneratedMedia(PNG, "image/png", "png")]

    ctx.require = require
    monkeypatch.setattr(
        "octop_harness.media.create_media_provider",
        lambda *_args, **_kwargs: SimpleNamespace(generate_image=generate),
    )
    with pytest.raises(PluginAppError, match="license_required"):
        await ctx.generate_image("test")
    assert len(checks) == 2


@pytest.mark.parametrize("url", ["http://127.0.0.1/private", "https://127.0.0.1/private"])
async def test_provider_cannot_download_private_urls(monkeypatch: Any, url: str) -> None:
    ctx, _ = setup(monkeypatch)

    def factory(_config: Any, *, client: httpx.AsyncClient) -> Any:
        async def generate(_request: Any) -> list[GeneratedMedia]:
            await client.get(url)
            raise AssertionError("private download reached transport")

        return SimpleNamespace(generate_image=generate)

    monkeypatch.setattr("octop_harness.media.create_media_provider", factory)
    with pytest.raises(PluginAppError, match="image_download_not_allowed"):
        await ctx.generate_image("test")


async def test_provider_cannot_redirect_public_download_to_private_address(
    monkeypatch: Any,
) -> None:
    ctx, _ = setup(monkeypatch)
    monkeypatch.setattr(
        "octop.infra.plugin_apps.host.socket.getaddrinfo",
        lambda host, *_args, **_kwargs: [
            (2, 1, 6, "", ("127.0.0.1" if host == "127.0.0.1" else "8.8.8.8", 443))
        ],
    )
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(str(request.url))
        return httpx.Response(302, headers={"Location": "https://127.0.0.1/private"})

    client_type = httpx.AsyncClient
    monkeypatch.setattr(
        "octop.infra.plugin_apps.host.httpx.AsyncClient",
        lambda **kwargs: client_type(transport=httpx.MockTransport(respond), **kwargs),
    )

    def factory(_config: Any, *, client: httpx.AsyncClient) -> Any:
        async def generate(_request: Any) -> list[GeneratedMedia]:
            await client.get("https://cdn.example/image.png", follow_redirects=True)
            return []

        return SimpleNamespace(generate_image=generate)

    monkeypatch.setattr("octop_harness.media.create_media_provider", factory)
    with pytest.raises(PluginAppError, match="image_download_not_allowed"):
        await ctx.generate_image("test")
    assert requests == ["https://cdn.example/image.png"]


@pytest.mark.parametrize(
    "artifact",
    [GeneratedMedia(b"not an image", "image/png", "png"), GeneratedMedia(PNG, "image/jpeg", "jpg")],
)
async def test_malformed_or_mismatched_media_is_not_saved(
    monkeypatch: Any, artifact: GeneratedMedia
) -> None:
    ctx, _ = setup(monkeypatch)

    async def generate(_request: Any) -> list[GeneratedMedia]:
        return [artifact]

    monkeypatch.setattr(
        "octop_harness.media.create_media_provider",
        lambda *_args, **_kwargs: SimpleNamespace(generate_image=generate),
    )
    with pytest.raises(PluginAppError, match="invalid_image"):
        await ctx.generate_image("test")

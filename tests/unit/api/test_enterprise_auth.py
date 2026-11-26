from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from octop.api.routers.auth import EnterpriseLoginBody, _enterprise_json_get, enterprise_login
from octop.infra.errors import ErrorCode, OctopError


def _server() -> SimpleNamespace:
    return SimpleNamespace(
        services=SimpleNamespace(
            config=SimpleNamespace(enterprise_backend_url="http://enterprise.test")
        )
    )


@pytest.mark.asyncio
async def test_enterprise_json_get_maps_upstream_connect_error(monkeypatch: Any) -> None:
    class FailingClient:
        async def __aenter__(self) -> "FailingClient":
            return self

        async def __aexit__(self, *_args: object) -> None:
            return None

        async def get(self, *_args: object, **_kwargs: object) -> httpx.Response:
            raise httpx.ConnectError("upstream unavailable")

    monkeypatch.setattr(
        "octop.api.routers.auth.httpx.AsyncClient", lambda **_kwargs: FailingClient()
    )

    with pytest.raises(OctopError) as exc:
        await _enterprise_json_get(
            _server(),
            "/auth/v1/session",
            headers=None,
            unavailable_message="enterprise session unavailable",
        )

    assert exc.value.code == ErrorCode.AUTH_FAILED
    assert exc.value.status == 503


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [ValueError("not json"), ["not", "an", "object"]])
async def test_enterprise_json_get_rejects_invalid_json(monkeypatch: Any, payload: object) -> None:
    class Response:
        status_code = 200

        def json(self) -> object:
            if isinstance(payload, BaseException):
                raise payload
            return payload

    class Client:
        async def __aenter__(self) -> "Client":
            return self

        async def __aexit__(self, *_args: object) -> None:
            return None

        async def get(self, *_args: object, **_kwargs: object) -> Response:
            return Response()

    monkeypatch.setattr("octop.api.routers.auth.httpx.AsyncClient", lambda **_kwargs: Client())

    with pytest.raises(OctopError) as exc:
        await _enterprise_json_get(
            _server(),
            "/desktop/v1/policy",
            headers=None,
            unavailable_message="enterprise policy unavailable",
        )

    assert exc.value.code == ErrorCode.AUTH_FAILED
    assert exc.value.status == 502


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [ValueError("not json"), ["not", "an", "object"]])
async def test_enterprise_login_rejects_invalid_upstream_payload(
    monkeypatch: Any, payload: object
) -> None:
    class Response:
        status_code = 200

        def json(self) -> object:
            if isinstance(payload, BaseException):
                raise payload
            return payload

    class Client:
        async def __aenter__(self) -> "Client":
            return self

        async def __aexit__(self, *_args: object) -> None:
            return None

        async def post(self, *_args: object, **_kwargs: object) -> Response:
            return Response()

    monkeypatch.setattr("octop.api.routers.auth.httpx.AsyncClient", lambda **_kwargs: Client())

    with pytest.raises(OctopError) as exc:
        await enterprise_login(
            EnterpriseLoginBody(email="user@example.com", password="pw"), _server()
        )

    assert exc.value.code == ErrorCode.AUTH_FAILED
    assert exc.value.status == 502


@pytest.mark.asyncio
async def test_enterprise_login_relays_the_captcha_and_its_refusal(monkeypatch: Any) -> None:
    sent: list[dict[str, Any]] = []

    class Response:
        status_code = 400

        def json(self) -> object:
            return {"error": {"code": "captcha_required", "message": "请先完成人机验证"}}

    class Client:
        async def __aenter__(self) -> "Client":
            return self

        async def __aexit__(self, *_args: object) -> None:
            return None

        async def post(self, *_args: object, **kwargs: Any) -> Response:
            sent.append(kwargs["json"])
            return Response()

    monkeypatch.setattr("octop.api.routers.auth.httpx.AsyncClient", lambda **_kwargs: Client())

    with pytest.raises(OctopError) as exc:
        await enterprise_login(
            EnterpriseLoginBody(email="user@example.com", password="pw", captcha_token="tk:rs"),
            _server(),
        )

    assert exc.value.code == ErrorCode.CAPTCHA_REQUIRED and exc.value.status == 400
    assert sent == [{"email": "user@example.com", "password": "pw", "captcha": "tk:rs"}]

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any, cast

import pytest

from octop.api.common import memory_sharing_gate
from octop.api.routers import memory_mcp, memory_sharing
from octop.infra import enterprise_memory_sharing
from octop.infra.errors import ErrorCode, OctopError
from octop.infra.users.identity import User

_USER = cast(User, SimpleNamespace(id=7, is_admin=True, permissions=[]))


class _Settings:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self.values.get(key)

    def set(self, key: str, value: str) -> None:
        self.values[key] = value


def _server(*, enterprise: bool) -> Any:
    return SimpleNamespace(
        services=SimpleNamespace(
            config=SimpleNamespace(
                enterprise_backend_url="http://enterprise.test" if enterprise else ""
            ),
            settings_repo=_Settings(),
        )
    )


def _policy(module: str | None) -> dict[str, Any]:
    modules = {"memory_sharing": module} if module else {}
    return {"policy": {"modules": modules}}


def _patch_policy(monkeypatch: pytest.MonkeyPatch, result: Any) -> list[str]:
    calls: list[str] = []

    async def fake(_server: Any, _uid: int, method: str, path: str, **_: Any) -> Any:
        calls.append(f"{method} {path}")
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(memory_sharing_gate, "enterprise_request", fake)
    return calls


def _run(server: Any) -> None:
    asyncio.run(memory_sharing_gate.require_memory_sharing_policy(_USER, server))


def test_outside_enterprise_mode_the_gate_does_not_ask_the_control_plane(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = _patch_policy(monkeypatch, _policy(None))
    _run(_server(enterprise=False))
    assert calls == []


@pytest.mark.parametrize("module", [None, "deny"])
def test_enterprise_admin_is_denied_unless_the_policy_allows_it(
    monkeypatch: pytest.MonkeyPatch, module: str | None
) -> None:
    server = _server(enterprise=True)
    _patch_policy(monkeypatch, _policy(module))
    with pytest.raises(OctopError) as exc:
        _run(server)
    assert exc.value.code == ErrorCode.FORBIDDEN
    assert not enterprise_memory_sharing.remembered_allowed(server, 7)


def test_enterprise_policy_allow_passes_and_is_remembered(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    server = _server(enterprise=True)
    calls = _patch_policy(monkeypatch, _policy("allow"))
    _run(server)
    assert calls == ["GET /desktop/v1/policy"]
    assert enterprise_memory_sharing.remembered_allowed(server, 7)


def test_unreachable_control_plane_denies_and_forgets_an_earlier_allow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    server = _server(enterprise=True)
    enterprise_memory_sharing.remember(server, 7, True)
    _patch_policy(monkeypatch, RuntimeError("offline"))
    with pytest.raises(OctopError):
        _run(server)
    assert not enterprise_memory_sharing.remembered_allowed(server, 7)


def test_token_review_path_follows_the_remembered_decision() -> None:
    server = _server(enterprise=True)
    with pytest.raises(OctopError):
        enterprise_memory_sharing.assert_memory_sharing_remembered(server, 7)
    enterprise_memory_sharing.record_policy(server, 7, _policy("allow"))
    enterprise_memory_sharing.assert_memory_sharing_remembered(server, 7)
    enterprise_memory_sharing.assert_memory_sharing_remembered(_server(enterprise=False), 7)


@pytest.mark.parametrize("router", [memory_sharing.router, memory_mcp.router])
def test_both_management_routers_carry_the_gate(router: Any) -> None:
    deps = [dep.dependency for dep in router.dependencies]
    assert memory_sharing_gate.require_memory_sharing_policy in deps

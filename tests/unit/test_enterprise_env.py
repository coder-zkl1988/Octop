from __future__ import annotations

import os

import pytest

from octop.infra import enterprise_env as ee


class Settings:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self.data.get(key)

    def set(self, key: str, value: str) -> None:
        self.data[key] = value


def test_delivered_variables_apply_and_withdraw(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("ENT_PROXY", "ENT_TOKEN", "ENT_MINE"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("ENT_MINE", "member")
    settings = Settings()
    applied = ee.apply(
        settings,
        [
            {"name": "ENT_PROXY", "value": "http://proxy:3128"},
            {"name": "ENT_TOKEN", "value": "s3cret", "secret": True},
            {"name": "ENT_MINE", "value": "enterprise"},
            {"name": "PATH", "value": "/evil"},
            {"name": "OCTOP_PORT", "value": "1"},
            {"name": "1BAD", "value": "x"},
        ],
        {"ENT_MINE": "member"},
    )
    assert set(applied) == {"ENT_PROXY", "ENT_TOKEN", "ENT_MINE"}
    assert os.environ["ENT_MINE"] == "enterprise" and os.environ["PATH"] != "/evil"
    assert "s3cret" not in str(settings.data)  # only names are remembered
    assert ee.managed_names(settings) == {"ENT_PROXY", "ENT_TOKEN", "ENT_MINE"}

    ee.apply(
        settings, [{"name": "ENT_PROXY", "value": "http://proxy:3128"}], {"ENT_MINE": "member"}
    )
    assert "ENT_TOKEN" not in os.environ
    assert os.environ["ENT_MINE"] == "member"  # handed back to the member's own value
    assert ee.managed_names(settings) == {"ENT_PROXY"}
    ee.apply(settings, [], {})
    assert "ENT_PROXY" not in os.environ

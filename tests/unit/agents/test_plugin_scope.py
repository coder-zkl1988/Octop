from __future__ import annotations

from typing import Any

from octop.infra.agents.plugins import plugin_scope


class Settings:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self.data.get(key)

    def set(self, key: str, value: str) -> None:
        self.data[key] = value


def test_single_expert_plugins_start_off_on_new_experts() -> None:
    settings = Settings()
    plugin_scope.set_single_expert(settings, 7, "chart", True)
    assert plugin_scope.single_expert_plugins(settings, 7) == {"chart"}
    assert plugin_scope.single_expert_plugins(settings, 8) == set()

    config: dict[str, Any] = {"plugins": {"other": {"enabled": True}}}
    plugin_scope.apply_to_new_expert(settings, 7, config)
    assert config["plugins"]["chart"] == {"enabled": False}
    assert config["plugins"]["other"] == {"enabled": True}

    explicit: dict[str, Any] = {"plugins": {"chart": {"enabled": True}}}
    plugin_scope.apply_to_new_expert(settings, 7, explicit)
    assert explicit["plugins"]["chart"] == {"enabled": True}

    plugin_scope.set_single_expert(settings, 7, "chart", False)
    fresh: dict[str, Any] = {}
    plugin_scope.apply_to_new_expert(settings, 7, fresh)
    assert "plugins" not in fresh

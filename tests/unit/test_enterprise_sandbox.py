from __future__ import annotations

import json
from dataclasses import dataclass, replace
from typing import Any

from octop.infra import enterprise_sandbox as es


@dataclass
class Row:
    id: int
    name: str
    kind: str
    enabled: bool = True
    endpoint: str | None = None
    secret_key: str | None = None
    region: str | None = None
    bucket: str | None = None
    config_json: str | None = None
    note: str | None = None


class Repo:
    def __init__(self) -> None:
        self.rows: dict[int, Row] = {}

    def get_by_name(self, name: str) -> Row | None:
        return next((r for r in self.rows.values() if r.name == name), None)

    def create(self, *, name: str, **fields: Any) -> int:
        new_id = len(self.rows) + 1
        self.rows[new_id] = Row(id=new_id, name=name, **fields)
        return new_id

    def update(self, backend_id: int, **fields: Any) -> None:
        self.rows[backend_id] = replace(self.rows[backend_id], **fields)


VIEW = {
    "enabled": True,
    "domain": "https://cp.example/desktop/v1/sandbox/api",
    "protocol": "https",
    "api_key": "tsb1.token-1",
    "image": "tabby/sandbox:1",
    "timeout": 1200,
    "spec": "2 核 4 GB",
}


def test_backend_follows_the_enterprise() -> None:
    repo = Repo()
    assert es.apply(repo, {"enabled": False}) == "unchanged"
    assert es.apply(repo, VIEW) == "created"
    row = repo.get_by_name(es.BACKEND_NAME)
    assert row is not None and row.kind == "opensandbox" and row.secret_key == "tsb1.token-1"
    assert (
        row.endpoint == VIEW["domain"] and row.region == "https" and row.bucket == "tabby/sandbox:1"
    )
    assert json.loads(row.config_json or "{}") == {
        "use_server_proxy": True,
        "timeout": 1200,
        "managed_by": "enterprise",
        "spec": "2 核 4 GB",
    }
    assert es.apply(repo, {**VIEW, "api_key": "tsb1.token-2"}) == "updated"
    assert repo.get_by_name(es.BACKEND_NAME).secret_key == "tsb1.token-2"  # type: ignore[union-attr]
    assert es.apply(repo, {"enabled": False}) == "disabled"
    assert repo.get_by_name(es.BACKEND_NAME).enabled is False  # type: ignore[union-attr]
    assert es.apply(repo, {"enabled": False}) == "unchanged"
    assert es.apply(repo, VIEW) == "updated" and repo.get_by_name(es.BACKEND_NAME).enabled  # type: ignore[union-attr]


def test_the_backend_spec_reaches_the_control_plane_not_the_sandbox_server() -> None:
    from octop.infra.backend.adapter import row_to_backend_spec

    repo = Repo()
    es.apply(repo, VIEW)
    spec = row_to_backend_spec(repo.get_by_name(es.BACKEND_NAME))
    assert spec == {
        "type": "opensandbox",
        "image": "tabby/sandbox:1",
        "api_key": "tsb1.token-1",
        "domain": "https://cp.example/desktop/v1/sandbox/api",
        "protocol": "https",
        "timeout": 1200,
        "use_server_proxy": True,
    }

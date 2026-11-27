from __future__ import annotations

import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from octop.infra import cloud_files


class Settings:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self.data.get(key)

    def set(self, key: str, value: str) -> None:
        self.data[key] = value


def test_ignore_patterns() -> None:
    patterns = [".git", "node_modules", "*.log", ".octop/auth"]
    assert cloud_files.ignored(".git", patterns)
    assert cloud_files.ignored("src/node_modules/x.js", patterns)
    assert cloud_files.ignored("logs/run.log", patterns)
    assert cloud_files.ignored(".octop/auth/token.json", patterns)
    assert not cloud_files.ignored(".octop/memory.db", patterns)
    assert not cloud_files.ignored("notes/a.md", patterns)


def test_scan_hashes_files_and_reports_skipped(tmp_path: Path) -> None:
    (tmp_path / "a.md").write_bytes(b"hello")
    (tmp_path / "big.bin").write_bytes(b"x" * 20)
    (tmp_path / ".git").mkdir()
    (tmp_path / ".git" / "HEAD").write_text("ref", encoding="utf-8")
    cache: dict[str, list[Any]] = {}
    found = cloud_files.scan(
        tmp_path, ignore=[".git"], max_file_bytes=10, max_files=100, cache=cache
    )
    assert [f["path"] for f in found.files] == ["a.md"]
    assert found.files[0]["sha256"] == hashlib.sha256(b"hello").hexdigest()
    assert found.skipped == [{"path": "big.bin", "size": 20, "reason": "too_large"}]
    assert str(tmp_path / "a.md") in cache


def test_new_experts_follow_the_enterprise_choice() -> None:
    settings = Settings()
    config: dict[str, Any] = {"storage_location": "cloud"}
    cloud_files.apply_to_new_expert(settings, config)
    assert "storage_location" not in config
    cloud_files.store_status(settings, {"cloud": "on", "expert_choice": True})
    config = {}
    cloud_files.apply_to_new_expert(settings, config)
    assert config["storage_location"] == "local"
    config = {"storage_location": "cloud"}
    cloud_files.apply_to_new_expert(settings, config)
    assert config["storage_location"] == "cloud"
    cloud_files.store_status(settings, {"cloud": "on", "expert_choice": False})
    config = {"storage_location": "local"}
    cloud_files.apply_to_new_expert(settings, config)
    assert config["storage_location"] == "cloud"


@pytest.mark.asyncio
async def test_sync_uploads_missing_contents_and_restore_writes_them_back(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = tmp_path / "ws"
    workspace.mkdir()
    (workspace / "a.md").write_bytes(b"hello")
    settings = Settings()
    server = SimpleNamespace(
        services=SimpleNamespace(settings_repo=settings, paths=SimpleNamespace(root=tmp_path))
    )
    row = SimpleNamespace(
        agent_id="ag1", name="小通", config_json=json.dumps({"storage_location": "cloud"})
    )
    monkeypatch.setattr(cloud_files.local_data, "local_workspace", lambda _row, _paths: workspace)
    cloud: dict[str, bytes] = {}
    manifests: dict[str, list[dict[str, Any]]] = {}

    async def request(
        _server: Any, _uid: int, method: str, path: str, *, body: Any = None, **_: Any
    ) -> dict[str, Any]:
        if path == "/desktop/v1/files/manifest":
            manifests[body["expert_id"]] = body["files"]
            return {"missing": [f["sha256"] for f in body["files"] if f["sha256"] not in cloud]}
        if path.endswith("/manifest"):
            return {"files": manifests[path.split("/")[-2]]}
        raise AssertionError(path)

    async def request_bytes(
        _server: Any, _uid: int, method: str, path: str, *, content: bytes | None = None, **_: Any
    ) -> bytes:
        sha = path.rsplit("/", 1)[-1]
        if method == "PUT":
            assert content is not None
            cloud[sha] = content
            return b""
        return cloud[sha]

    monkeypatch.setattr(cloud_files.enterprise_client, "request", request)
    monkeypatch.setattr(cloud_files.enterprise_client, "request_bytes", request_bytes)
    entry = await cloud_files.sync_expert(server, 1, row, {"ignore": [], "max_file_bytes": 100})
    assert entry["files"] == 1 and entry["uploaded"] == 1 and entry["pending"] == 0
    assert cloud_files.summary(settings, 1)["files"] == 1

    elsewhere = tmp_path / "restored"
    result = await cloud_files.download_into(server, 1, "ag1", elsewhere)
    assert result == {"written": 1, "kept": 0}
    assert (elsewhere / "a.md").read_bytes() == b"hello"
    again = await cloud_files.download_into(server, 1, "ag1", elsewhere)
    assert again == {"written": 0, "kept": 1}

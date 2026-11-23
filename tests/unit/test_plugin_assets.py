from __future__ import annotations

import base64
from pathlib import Path

import pytest

from octop.infra.plugin_apps.assets import MAX_ASSET_BYTES, AssetStore
from octop.infra.plugin_apps.contracts import PluginAppError

PNG = b"\x89PNG\r\n\x1a\nprivate-image"


def test_images_are_deduplicated_and_scoped_without_changing_their_bytes(tmp_path: Path) -> None:
    owner = AssetStore(tmp_path, "plugin/tenant/member/one")
    other = AssetStore(tmp_path, "plugin/tenant/member/two")
    encoded = base64.b64encode(PNG).decode()
    metadata = owner.save(encoded, "image/png")
    assert owner.save(encoded, "image/png") == metadata
    assert len(list(owner.root.iterdir())) == 1
    assert owner.load(metadata["asset_id"]) == (PNG, metadata)
    with pytest.raises(PluginAppError, match="not_found"):
        other.load(metadata["asset_id"])


@pytest.mark.parametrize("asset_id", ["../private", "f" * 64 + ".svg", "a/b.png", "/private.png"])
def test_asset_ids_cannot_address_paths_or_active_document_types(
    tmp_path: Path, asset_id: str
) -> None:
    with pytest.raises(PluginAppError, match="not_found"):
        AssetStore(tmp_path, "owner").load(asset_id)


@pytest.mark.parametrize(
    "encoded,mime",
    [
        ("!", "image/png"),
        (base64.b64encode(PNG).decode(), "image/jpeg"),
        (base64.b64encode(b"<svg/>").decode(), "image/svg+xml"),
    ],
)
def test_invalid_image_content_is_not_written(tmp_path: Path, encoded: str, mime: str) -> None:
    store = AssetStore(tmp_path, "owner")
    with pytest.raises(PluginAppError, match="invalid_image"):
        store.save(encoded, mime)
    assert not store.root.exists()


def test_encoded_size_is_limited_before_decoding(tmp_path: Path) -> None:
    with pytest.raises(PluginAppError, match="image_response_too_large"):
        AssetStore(tmp_path, "owner").save(
            "A" * (4 * ((MAX_ASSET_BYTES + 2) // 3) + 4), "image/png"
        )


def test_corrupted_or_mislabeled_stored_image_is_not_returned(tmp_path: Path) -> None:
    store = AssetStore(tmp_path, "owner")
    metadata = store.save(base64.b64encode(PNG).decode(), "image/png")
    (store.root / metadata["asset_id"]).write_bytes(PNG + b"changed")
    with pytest.raises(PluginAppError, match="asset_invalid"):
        store.load(metadata["asset_id"])
    store.save(base64.b64encode(PNG).decode(), "image/png")
    assert store.load(metadata["asset_id"])[0] == PNG

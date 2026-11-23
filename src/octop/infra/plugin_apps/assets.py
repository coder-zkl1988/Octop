"""Private, content-addressed plugin images outside the scoped business document."""

from __future__ import annotations

import base64
import binascii
import hashlib
import os
import re
import tempfile
from pathlib import Path
from typing import Any

from octop.infra.gateway.media.attachment_hints import sniff_image_media_type
from octop.infra.plugin_apps.contracts import PluginAppError

MAX_ASSET_BYTES = 10 * 1024 * 1024
IMAGE_EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}


class AssetStore:
    def __init__(self, root: Path, scope: str) -> None:
        self.root = root / hashlib.sha256(scope.encode()).hexdigest()

    def save(self, encoded: str, mime_type: str) -> dict[str, Any]:
        if mime_type not in IMAGE_EXTENSIONS or not isinstance(encoded, str):
            raise PluginAppError("invalid_image")
        if len(encoded) > 4 * ((MAX_ASSET_BYTES + 2) // 3):
            raise PluginAppError("image_response_too_large")
        try:
            data = base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error) as exc:
            raise PluginAppError("invalid_image") from exc
        if not data or len(data) > MAX_ASSET_BYTES or sniff_image_media_type(data) != mime_type:
            raise PluginAppError("invalid_image")
        sha = hashlib.sha256(data).hexdigest()
        asset_id = f"{sha}.{IMAGE_EXTENSIONS[mime_type]}"
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        target = self.root / asset_id
        temporary: str | None = None
        try:
            with tempfile.NamedTemporaryFile(dir=self.root, delete=False) as stream:
                temporary = stream.name
                stream.write(data)
            os.replace(temporary, target)
        finally:
            if temporary is not None:
                Path(temporary).unlink(missing_ok=True)
        return {"asset_id": asset_id, "sha256": sha, "mime_type": mime_type, "size": len(data)}

    def load(self, asset_id: str) -> tuple[bytes, dict[str, Any]]:
        match = re.fullmatch(r"([a-f0-9]{64})\.(png|jpg|webp)", asset_id)
        if not match:
            raise PluginAppError("not_found", status=404)
        try:
            with (self.root / asset_id).open("rb") as stream:
                data = stream.read(MAX_ASSET_BYTES + 1)
        except FileNotFoundError as exc:
            raise PluginAppError("not_found", status=404) from exc
        mime_type = next(mime for mime, suffix in IMAGE_EXTENSIONS.items() if suffix == match[2])
        if (
            len(data) > MAX_ASSET_BYTES
            or hashlib.sha256(data).hexdigest() != match[1]
            or sniff_image_media_type(data) != mime_type
        ):
            raise PluginAppError("asset_invalid", status=409)
        return data, {
            "asset_id": asset_id,
            "sha256": match[1],
            "mime_type": mime_type,
            "size": len(data),
        }


def references_asset(value: Any, asset_id: str) -> bool:
    if isinstance(value, dict):
        return value.get("asset_id") == asset_id or any(
            references_asset(item, asset_id) for item in value.values()
        )
    return isinstance(value, list) and any(references_asset(item, asset_id) for item in value)

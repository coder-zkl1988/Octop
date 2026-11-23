"""Internal transport used by Tabby Enterprise to reuse Octop channels."""

from __future__ import annotations

import hmac
import os
from typing import Any

from fastapi import APIRouter, Depends, Header
from octop_gateway.models import ChannelSubject
from pydantic import BaseModel, Field

from octop.api.deps import get_server
from octop.infra.errors import ErrorCode, OctopError

router = APIRouter()


class ChannelPushBody(BaseModel):
    agent_id: str = Field(min_length=1)
    channel_id: str = Field(min_length=1)
    subject_id: str = Field(min_length=1)
    text: str = Field(min_length=1, max_length=32_000)
    chat_type: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


@router.post("/internal/enterprise/channel-push", include_in_schema=False)
async def push_enterprise_channel(
    body: ChannelPushBody,
    x_octop_enterprise_token: str | None = Header(default=None),
    server: Any = Depends(get_server),
) -> dict[str, bool]:
    expected = os.environ.get("OCTOP_ENTERPRISE_INTERNAL_TOKEN", "").strip()
    if (
        not expected
        or not x_octop_enterprise_token
        or not hmac.compare_digest(x_octop_enterprise_token, expected)
    ):
        raise OctopError(ErrorCode.AUTH_FAILED, "invalid enterprise internal token")
    gateway = server.app_runtime.gateway
    row = gateway.get_channel(body.channel_id)
    if row is None or str(row.agent_id) != body.agent_id:
        raise OctopError(ErrorCode.NOT_FOUND, "channel not found")
    subject = ChannelSubject(
        subject_id=body.subject_id,
        chat_type=body.chat_type or "private",
        metadata=body.metadata,
    )
    await gateway.push_text(row.kind, body.channel_id, subject, body.text)
    return {"delivered": True}

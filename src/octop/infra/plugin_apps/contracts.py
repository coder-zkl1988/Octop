"""Host SDK contracts; plugin manifests remain compatible with harness tools."""

from __future__ import annotations

from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PluginLicense(BaseModel):
    model_config = ConfigDict(extra="ignore")
    plugin_id: str
    tenant_id: str
    member_id: str
    status: Literal["inactive", "trial", "active", "expired", "revoked"]
    version: int = Field(ge=0)
    features: list[str] = Field(default_factory=list)
    read_features: list[str] = Field(
        default_factory=list,
        description="Authority-provided history scope after revocation or expiry; never grants execution.",
    )
    limits: dict[str, int] = Field(default_factory=dict)
    expires_at: datetime | None = None

    @field_validator("expires_at")
    @classmethod
    def aware_expiry(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("license expiry requires a timezone")
        return value

    @property
    def active(self) -> bool:
        return self.status in {"active", "trial"} and (
            self.expires_at is None or self.expires_at > datetime.now(UTC)
        )

    @property
    def readable_features(self) -> list[str]:
        if self.status == "inactive":
            return []
        return self.features if self.active else self.read_features


class PluginAppError(Exception):
    def __init__(self, reason: str, *, status: int = 400) -> None:
        super().__init__(reason)
        self.reason = reason
        self.status = status


current_context: ContextVar[Any] = ContextVar("octop_plugin_app_context")

"""Typed HTTP facade for the migrated XHS paid application.

The plugin command endpoint remains the single mutation implementation.  These
resource-shaped routes preserve the Tabby workflow contract for the desktop
workbench without creating a second business state machine.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime, tzinfo
from typing import Any, cast
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator

from octop.api.deps import current_user, get_server
from octop.infra.errors import ErrorCode, OctopError
from octop.infra.plugin_apps.contracts import PluginAppError

router = APIRouter(prefix="/xhs-ops", tags=["xhs-ops"])
PLUGIN_ID = "xhs-ops"
_VALID_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class ProjectMutation(BaseModel):
    version: int | None = None
    expected_updated_at: str | None = Field(
        default=None,
        validation_alias=AliasChoices("expected_updated_at", "expectedUpdatedAt"),
    )
    name: str | None = Field(default=None, min_length=1, max_length=80)
    business: dict[str, Any] | str | None = None
    audience: dict[str, Any] | str | None = None
    ops_notes: dict[str, Any] | None = Field(
        default=None,
        validation_alias=AliasChoices("ops_notes", "opsNotes"),
    )
    profile: dict[str, Any] | str | None = None
    persona_count: int | None = Field(
        default=None,
        ge=1,
        le=30,
        validation_alias=AliasChoices("persona_count", "personaCount"),
    )


class ProjectCreate(ProjectMutation):
    name: str = Field(min_length=1, max_length=80)


class TransferBody(BaseModel):
    from_account_id: str = Field(
        min_length=1,
        validation_alias=AliasChoices("from_account_id", "fromAccountId"),
    )
    to_account_id: str | None = Field(
        default=None,
        min_length=1,
        validation_alias=AliasChoices("to_account_id", "toAccountId"),
    )
    account: dict[str, Any]
    override_reason: str | None = Field(
        default=None,
        max_length=200,
        validation_alias=AliasChoices("override_reason", "overrideReason"),
    )


class IdentityConfirmBody(BaseModel):
    identity_task_id: str = Field(
        min_length=1,
        validation_alias=AliasChoices("identity_task_id", "identityTaskId"),
    )
    platform_account_id: str = Field(
        min_length=1,
        max_length=100,
        validation_alias=AliasChoices("platform_account_id", "platformAccountId"),
    )
    override_read: bool = Field(
        default=False,
        validation_alias=AliasChoices("override_read", "overrideRead"),
    )


class PlanRevertBody(BaseModel):
    version: int | None = None


class XhsResourceModel(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    id: str = ""
    version: int | None = None


class XhsProjectBusiness(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    industry: str = ""
    product: str = ""
    regions: list[str] = Field(default_factory=list)
    sellingPoints: list[str] = Field(default_factory=list)
    priceBand: str = ""
    scene: str = ""


class XhsProjectAudience(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    ageRange: str = ""
    genderRatio: str = ""
    regions: list[str] = Field(default_factory=list)
    occupations: list[str] = Field(default_factory=list)
    spendingPower: str = ""
    knownInterests: list[str] = Field(default_factory=list)
    painPoints: list[str] = Field(default_factory=list)


class XhsProjectOpsNotes(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    forbiddenTopics: list[str] = Field(default_factory=list)
    boostKeywords: list[str] = Field(default_factory=list)
    avoidContentTypes: list[str] = Field(default_factory=list)


class XhsProjectProfileBase(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    ageRange: str = ""
    genderRatio: str = ""
    regions: list[str] = Field(default_factory=list)


class XhsProjectProfile(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    summary: str = ""
    base: XhsProjectProfileBase = Field(default_factory=XhsProjectProfileBase)
    verticalInterests: list[str] = Field(default_factory=list)
    generalInterests: list[str] = Field(default_factory=list)
    confirmedAt: str | None = None
    updatedAt: str = ""


class XhsProjectSchedule(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    enabled: bool = False
    time: str = "10:00"
    lastTriggeredDate: str | None = None
    lastResult: str | None = None


class XhsProjectResource(XhsResourceModel):
    name: str = ""
    business: XhsProjectBusiness | str = Field(default_factory=XhsProjectBusiness)
    audience: XhsProjectAudience | str = Field(default_factory=XhsProjectAudience)
    opsNotes: XhsProjectOpsNotes = Field(default_factory=XhsProjectOpsNotes)
    profile: XhsProjectProfile | str | None = None
    schedule: XhsProjectSchedule = Field(default_factory=XhsProjectSchedule)
    personaCount: int = 10
    createdAt: str = ""
    updatedAt: str = ""


class XhsAccountResource(XhsResourceModel):
    projectId: str = ""
    name: str = ""
    label: str = ""
    entryMode: str = "new"
    positioning: str = ""
    persona: dict[str, Any] = Field(default_factory=dict)
    personaTags: dict[str, Any] = Field(default_factory=dict)
    profileDraft: dict[str, Any] = Field(default_factory=dict)
    deviceId: str | None = None
    deviceName: str | None = None
    platformAccountId: str = ""
    interestPool: dict[str, Any] = Field(default_factory=dict)
    interaction: dict[str, Any] = Field(default_factory=dict)
    browseDefaults: dict[str, Any] = Field(default_factory=dict)
    takeover: dict[str, Any] | None = None
    createdAt: str | None = None
    updatedAt: str | None = None


class XhsRunChunk(XhsResourceModel):
    index: int | None = None
    mode: str = ""
    keyword: str = ""
    plannedCount: int | None = None
    status: str = ""
    taskId: str | None = None
    startedAt: str | None = None
    completedAt: str | None = None
    browsed: int = 0
    skipped: int = 0
    refreshCount: int = 0
    interactions: dict[str, Any] = Field(default_factory=dict)
    anomalies: list[dict[str, Any]] = Field(default_factory=list)
    observation: Any = None
    posts: list[dict[str, Any]] = Field(default_factory=list)
    commentDraftId: str | None = None
    message: str | None = None
    totalSteps: int | None = None
    finalScreenshot: str | None = None
    error: str | None = None


class XhsRunResource(XhsResourceModel):
    taskId: str | None = None
    runtimeId: str | None = None
    projectId: str = ""
    accountId: str = ""
    accountLabel: str = ""
    deviceId: str = ""
    date: str = ""
    status: str = "planned"
    plan: dict[str, Any] = Field(default_factory=dict)
    segment: dict[str, Any] | None = None
    queuedBehindRunId: str | None = None
    preparation: dict[str, Any] | None = None
    chunks: list[XhsRunChunk] = Field(default_factory=list)
    summary: dict[str, Any] = Field(default_factory=dict)
    notes: str = ""
    error: str | None = None
    startedAt: str | None = None
    completedAt: str | None = None
    createdAt: str | None = None
    updatedAt: str | None = None


class XhsChangeOrderResource(XhsResourceModel):
    projectId: str = ""
    accountId: str = ""
    deviceId: str = ""
    platformAccountId: str = ""
    diagnosisId: str | None = None
    proposalIds: list[str] = Field(default_factory=list)
    batchIndex: int = 1
    risk: str = "L1"
    fields: list[dict[str, Any]] = Field(default_factory=list)
    status: str = "draft"
    acks: dict[str, Any] = Field(default_factory=dict)
    precheck: dict[str, Any] | None = None
    observationUntil: str | None = None
    observationHours: int = 24
    flags: list[str] = Field(default_factory=list)
    error: str | None = None
    createdAt: str | None = None
    updatedAt: str | None = None


class XhsCount(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    text: str | None = None
    max12: bool | None = None
    value: int | float | None = None
    approx: bool | None = None


class XhsAuditEvidence(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    taskId: str | None = None
    finishedAt: str | None = None
    screenshotUrl: str | None = None
    receiptClicks: dict[str, Any] = Field(default_factory=dict)
    trusted: bool | None = None
    warnings: list[str] = Field(default_factory=list)


class XhsAuditProfile(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    status: str = "unknown"
    code: str | None = None
    evidence: XhsAuditEvidence | None = None
    accountMatched: bool | None = None
    values: dict[str, Any] | None = None


class XhsAuditHome(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    status: str = "unknown"
    code: str | None = None
    evidence: XhsAuditEvidence | None = None
    nickname: str | None = None
    header: dict[str, Any] | None = None
    headerEnd: bool | None = None
    notesEnd: bool | None = None
    notes: list[dict[str, Any]] = Field(default_factory=list)


class XhsAuditCreator(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    status: str = "unknown"
    code: str | None = None
    evidence: XhsAuditEvidence | None = None
    nickname: str | None = None
    header: dict[str, Any] | None = None
    periodLabel: str | None = None
    views: XhsCount | None = None
    interactions: XhsCount | None = None
    newFollowers: XhsCount | None = None
    profileVisitors: XhsCount | None = None
    accountStatus: str | None = None


class XhsAuditResource(XhsResourceModel):
    projectId: str = ""
    accountId: str = ""
    deviceId: str = ""
    platformAccountId: str = ""
    trigger: str = "manual"
    changeOrderId: str | None = None
    status: str = "failed"
    reason: str = ""
    activeTaskId: str | None = None
    profile: XhsAuditProfile | None = None
    home: XhsAuditHome | None = None
    creator: XhsAuditCreator | None = None
    noteDetails: dict[str, Any] | None = None
    flags: list[str] = Field(default_factory=list)
    manualCheckAt: str | None = None
    startedAt: str | None = None
    completedAt: str | None = None
    createdAt: str | None = None
    updatedAt: str | None = None


class XhsDiagnosisFinding(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    id: str = ""
    dimension: str | None = None
    severity: str | None = None
    summary: str = ""
    detail: str | None = None
    ruleIds: list[str] = Field(default_factory=list)
    evidence: list[dict[str, Any]] = Field(default_factory=list)


class XhsDiagnosisResource(XhsResourceModel):
    projectId: str = ""
    accountId: str = ""
    auditId: str = ""
    parentId: str | None = None
    status: str = "failed"
    playbookVersion: str = ""
    citedRules: list[dict[str, Any]] = Field(default_factory=list)
    facts: dict[str, Any] = Field(default_factory=dict)
    cadence: dict[str, Any] = Field(default_factory=dict)
    summary: str = ""
    inferredPersona: dict[str, Any] | None = None
    dimensions: list[dict[str, Any]] = Field(default_factory=list)
    findings: list[XhsDiagnosisFinding] = Field(default_factory=list)
    questions: list[dict[str, Any]] = Field(default_factory=list)
    proposals: list[dict[str, Any]] = Field(default_factory=list)
    dropped: list[dict[str, Any]] = Field(default_factory=list)
    decisions: dict[str, Any] = Field(default_factory=dict)
    feedback: list[dict[str, Any]] = Field(default_factory=list)
    generator: dict[str, Any] = Field(default_factory=dict)
    confirmedAt: str | None = None
    error: str | None = None
    createdAt: str | None = None
    updatedAt: str | None = None


class XhsProjectListResponse(BaseModel):
    projects: list[XhsProjectResource]


class XhsProjectResponse(BaseModel):
    project: XhsProjectResource


class XhsAccountListResponse(BaseModel):
    accounts: list[XhsAccountResource]


class XhsAccountResponse(BaseModel):
    account: XhsAccountResource


class XhsRunListResponse(BaseModel):
    runs: list[XhsRunResource]


class XhsRunResponse(BaseModel):
    run: XhsRunResource


class XhsCommentListResponse(BaseModel):
    drafts: list[dict[str, Any]]
    quotas: list[dict[str, Any]]


class XhsCommentGenerateResponse(BaseModel):
    drafts: list[dict[str, Any]]
    skipped: list[str]


class XhsCommentResponse(BaseModel):
    draft: dict[str, Any]


class XhsCommentQuotaResponse(BaseModel):
    quota: dict[str, Any]


class XhsPersonaGenerateResponse(BaseModel):
    suggestions: list[dict[str, Any]]
    distribution: str
    project: XhsProjectResource


class XhsProfileReadbackResponse(BaseModel):
    status: str
    taskId: str
    reason: str
    screenshotUrl: str | None
    fields: list[dict[str, Any]]


class XhsIdentityTaskResponse(BaseModel):
    status: str
    screenshotUrl: str | None
    accountId: str
    taskId: str
    reason: str


class XhsScheduleRunNowResult(BaseModel):
    date: str
    planned: int
    created: int
    started: int
    queued: int
    skipped: list[str]
    summary: str


class XhsScheduleRunNowResponse(BaseModel):
    project: XhsProjectResource
    result: XhsScheduleRunNowResult


class XhsDeviceBindingListResponse(BaseModel):
    bindings: list[dict[str, Any]]


class XhsIdentityReadResponse(BaseModel):
    identity: dict[str, Any]
    account: XhsAccountResource | None


class XhsIdentityConfirmResponse(BaseModel):
    account: XhsAccountResource | None
    event: dict[str, Any] | None


class XhsAuditResponse(BaseModel):
    audit: XhsAuditResource | None


class XhsAuditListResponse(BaseModel):
    audits: list[XhsAuditResource]


class XhsAuditBaselineResponse(BaseModel):
    account: XhsAccountResource | None
    audit: XhsAuditResource | None
    event: dict[str, Any] | None


class XhsDiagnosisResponse(BaseModel):
    diagnosis: XhsDiagnosisResource | None


class XhsDiagnosisListResponse(BaseModel):
    diagnoses: list[XhsDiagnosisResource]


class XhsDiagnosisViewResponse(BaseModel):
    diagnosis: XhsDiagnosisResource
    event: dict[str, Any] | None


class XhsTakeoverPlanResponse(BaseModel):
    account: XhsAccountResource | None
    diagnosis: XhsDiagnosisResource | None
    change_orders: list[XhsChangeOrderResource] = Field(alias="changeOrders", default_factory=list)
    skipped_fields: list[dict[str, Any]] = Field(alias="skippedFields", default_factory=list)
    event: dict[str, Any] | None = None

    model_config = ConfigDict(populate_by_name=True)


class XhsChangeOrderListResponse(BaseModel):
    orders: list[XhsChangeOrderResource]


class XhsChangeOrderResponse(BaseModel):
    order: XhsChangeOrderResource
    event: dict[str, Any] | None


class XhsChangeOrderActionResponse(BaseModel):
    order: XhsChangeOrderResource | None
    account: XhsAccountResource | None
    event: dict[str, Any] | None


class XhsPlanSuggestResponse(BaseModel):
    plans: list[dict[str, Any]]
    skipped: list[dict[str, Any]]


class XhsPlaybookResponse(BaseModel):
    version: str
    bundleVersion: int
    rules: list[dict[str, Any]]


class CommandBody(BaseModel):
    """Forward-compatible body for source-shaped XHS mutations.

    Domain validation remains in the plugin command implementation; the HTTP
    facade only injects path identifiers and the explicit confirmation bit.
    """

    model_config = ConfigDict(extra="allow")

    @model_validator(mode="before")
    @classmethod
    def normalize_source_keys(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        aliases = {
            "expectedUpdatedAt": "expected_updated_at",
            "accountId": "account_id",
            "projectId": "project_id",
            "runId": "run_id",
            "draftId": "draft_id",
            "accountVersion": "account_version",
            "projectVersion": "project_version",
            "confirmDigest": "confirm_digest",
            "identityTaskId": "identity_task_id",
            "platformAccountId": "platform_account_id",
            "overrideReason": "override_reason",
            "overrideRead": "override_read",
            "fromAccountId": "from_account_id",
            "toAccountId": "to_account_id",
        }
        normalized = dict(value)
        for source, target in aliases.items():
            if source in normalized and target not in normalized:
                normalized[target] = normalized.pop(source)
        return normalized


def _host(server: Any) -> Any:
    host = getattr(server, "plugin_apps", None)
    if host is None:
        raise OctopError(ErrorCode.INTERNAL_ERROR, "plugin host unavailable", status=503)
    return host


def _error(exc: PluginAppError) -> OctopError:
    return OctopError(
        ErrorCode.FORBIDDEN if exc.status == 403 else ErrorCode.SLASH_BAD_ARGS,
        "xhs-ops request rejected",
        status=exc.status,
        details={"reason": exc.reason},
    )


async def _snapshot(server: Any, user: Any) -> dict[str, Any]:
    try:
        return cast(dict[str, Any], await _host(server).snapshot(PLUGIN_ID, int(user.id)))
    except PluginAppError as exc:
        raise _error(exc) from exc


async def _command(server: Any, user: Any, name: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return cast(
            dict[str, Any], await _host(server).command(PLUGIN_ID, int(user.id), name, payload)
        )
    except PluginAppError as exc:
        raise _error(exc) from exc


def _snapshot_item(
    snapshot: dict[str, Any], collection: str, item_id: str | None = None
) -> dict[str, Any] | None:
    rows = _rows(snapshot, collection)
    if item_id is not None:
        return next((row for row in rows if row.get("id") == item_id), None)
    return rows[-1] if rows else None


def _latest_event(
    snapshot: dict[str, Any], name: str, *, target_id: str | None = None
) -> dict[str, Any] | None:
    events = _rows(snapshot, "takeover_events")
    matching = [row for row in events if row.get("name") == name]
    if target_id:
        matching = [
            row
            for row in matching
            if str((row.get("payload") or {}).get("accountId") or "") == target_id
            or str((row.get("payload") or {}).get("orderId") or "") == target_id
            or str((row.get("payload") or {}).get("diagnosisId") or "") == target_id
        ]
    return matching[-1] if matching else None


def _camel_key(key: str) -> str:
    parts = key.split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


def _camelize_any(value: Any) -> Any:
    """Expose source-compatible camelCase resources from snake_case state."""
    if isinstance(value, dict):
        return {_camel_key(str(key)): _camelize_any(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_camelize_any(item) for item in value]
    return value


def _camelize[T](value: T) -> T:
    return cast(T, _camelize_any(value))


def _source_account(value: dict[str, Any] | None) -> dict[str, Any] | None:
    if value is None:
        return None
    item = dict(value)
    item.setdefault("label", item.get("name", ""))
    item.setdefault("project_id", "")
    item.setdefault("entry_mode", "new")
    item.setdefault("positioning", "")
    item.setdefault("persona", {})
    item.setdefault("persona_tags", {})
    item.setdefault("persona_reviewed_at", None)
    item.setdefault("persona_review_note", None)
    item.setdefault("platform_account_id", "")
    item.setdefault("profile_draft", {})
    item.setdefault("device_id", None)
    item.setdefault("device_name", None)
    item.setdefault("interest_pool", {})
    item.setdefault("interaction", {})
    item.setdefault("browse_defaults", {})
    item.setdefault("takeover", None)
    item.setdefault("tone_guide", {})
    item.setdefault("created_at", now_iso())
    item.setdefault("updated_at", item["created_at"])
    return _camelize(item)


def _source_project(value: dict[str, Any] | None) -> dict[str, Any] | None:
    """Expose the complete source project envelope with stable nested defaults.

    Older local ledgers contain only ``name``/``business`` while the Tabby
    contract always returns business, audience, operations notes, profile and
    schedule objects.  Normalising at the HTTP boundary keeps old snapshots
    readable and makes the typed facade equivalent to the source route.
    """
    if value is None:
        return None
    item = dict(value)
    created = str(item.get("created_at") or item.get("updated_at") or now_iso())
    item["business"] = _source_project_business(item.get("business"))
    item["audience"] = _source_project_audience(item.get("audience"))
    item["ops_notes"] = _source_project_ops_notes(item.get("ops_notes"))
    item["profile"] = _source_project_profile(item.get("profile"), updated_at=created)
    item["schedule"] = _source_project_schedule(item.get("schedule"))
    persona_count = item.get("persona_count")
    item["persona_count"] = (
        persona_count if isinstance(persona_count, int) and 1 <= persona_count <= 30 else 10
    )
    item["created_at"] = str(item.get("created_at") or created)
    item["updated_at"] = str(item.get("updated_at") or created)
    return _camelize(item)


def _source_project_business(value: Any) -> dict[str, Any] | str:
    if isinstance(value, str):
        return value
    item = dict(value) if isinstance(value, dict) else {}
    item.setdefault("industry", "")
    item.setdefault("product", "")
    item.setdefault("regions", [])
    item.setdefault("selling_points", [])
    item.setdefault("price_band", "")
    item.setdefault("scene", "")
    return item


def _source_project_audience(value: Any) -> dict[str, Any] | str:
    if isinstance(value, str):
        return value
    item = dict(value) if isinstance(value, dict) else {}
    item.setdefault("age_range", "")
    item.setdefault("gender_ratio", "")
    item.setdefault("regions", [])
    item.setdefault("occupations", [])
    item.setdefault("spending_power", "")
    item.setdefault("known_interests", [])
    item.setdefault("pain_points", [])
    return item


def _source_project_ops_notes(value: Any) -> dict[str, Any]:
    item = dict(value) if isinstance(value, dict) else {}
    item.setdefault("forbidden_topics", [])
    item.setdefault("boost_keywords", [])
    item.setdefault("avoid_content_types", [])
    return item


def _source_project_profile(value: Any, *, updated_at: str) -> dict[str, Any] | str | None:
    if value is None or isinstance(value, str):
        return value
    item = dict(value) if isinstance(value, dict) else {}
    item.setdefault("summary", "")
    base = item.get("base")
    base = dict(base) if isinstance(base, dict) else {}
    base.setdefault("age_range", "")
    base.setdefault("gender_ratio", "")
    base.setdefault("regions", [])
    item["base"] = base
    item.setdefault("vertical_interests", [])
    item.setdefault("general_interests", [])
    item.setdefault("confirmed_at", None)
    item["updated_at"] = str(item.get("updated_at") or updated_at)
    return item


def _source_project_schedule(value: Any) -> dict[str, Any]:
    item = dict(value) if isinstance(value, dict) else {}
    item["enabled"] = item.get("enabled") if isinstance(item.get("enabled"), bool) else False
    time = item.get("time")
    item["time"] = time if isinstance(time, str) and _VALID_TIME.fullmatch(time) else "10:00"
    last_date = item.get("last_triggered_date")
    item["last_triggered_date"] = last_date if isinstance(last_date, str) else None
    item["last_result"] = _source_schedule_result(item.get("last_result"))
    return item


def _source_schedule_result(value: Any) -> str | None:
    if value is None or isinstance(value, str):
        return value
    if not isinstance(value, dict):
        return None
    date = str(value.get("date") or "")
    accepted = value.get("accepted")
    accepted_count = accepted if isinstance(accepted, int) else 0
    skipped = value.get("skipped")
    if isinstance(skipped, dict):
        skipped_count = sum(item for item in skipped.values() if isinstance(item, int))
    elif isinstance(skipped, list):
        skipped_count = len(skipped)
    else:
        skipped_count = 0
    summary = f"{accepted_count} 个已受理"
    if skipped_count:
        summary += f"、{skipped_count} 个未派发"
    return f"{date}：{summary}" if date else summary


def _source_projects(values: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [project for value in values if (project := _source_project(value)) is not None]


def _project_response(value: dict[str, Any] | None) -> dict[str, Any]:
    return {"project": _source_project(value)}


def _source_accounts(values: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [account for value in values if (account := _source_account(value)) is not None]


def _source_profile_fields(
    readback: dict[str, Any], account: dict[str, Any]
) -> list[dict[str, Any]]:
    values = readback.get("values")
    if not isinstance(values, dict) or readback.get("status") != "read":
        return []
    draft = account.get("profile_draft")
    draft = draft if isinstance(draft, dict) else {}
    fields = (
        "nickname",
        "bio",
        "occupation",
        "avatar",
        "cover",
        "gender",
        "birthday",
        "region",
    )
    image_fields = {"avatar", "cover"}
    result: list[dict[str, Any]] = []
    for field in fields:
        phone = str(values.get(field, "") or "")
        proposed = str(draft.get(field, "") or "")
        result.append(
            {
                "field": field,
                "comparable": field not in image_fields,
                "phone": phone,
                "draft": proposed,
                "differs": field in image_fields or phone != proposed,
            }
        )
    return result


def _source_run_status(value: Any) -> str:
    return {
        "queued": "planned",
        "preparing": "running",
        "awaiting_verification": "completed",
        "operator_verified": "completed",
        "success": "completed",
        "unknown": "failed",
        "stopped_unverified": "failed",
        "error": "failed",
    }.get(str(value), str(value) if value else "planned")


def _source_run(value: dict[str, Any]) -> dict[str, Any]:
    """Fill the source run contract from the plugin's execution ledger."""
    item = dict(value)
    created = str(item.get("created_at") or item.get("updated_at") or now_iso())
    account_id = str(item.get("account_id") or "")
    item.setdefault("project_id", str(item.get("project_id") or ""))
    item.setdefault(
        "account_label", str(item.get("account_label") or item.get("account_name") or "")
    )
    item.setdefault("device_id", str(item.get("device_id") or ""))
    item.setdefault("date", str(item.get("day_id") or created[:10]))
    item["status"] = _source_run_status(item.get("status"))
    item.setdefault("plan", {})
    item.setdefault("segment", None)
    item.setdefault("queued_behind_run_id", None)
    item.setdefault("preparation", None)
    item.setdefault("chunks", [])
    item.setdefault("summary", {})
    item.setdefault("notes", "")
    item.setdefault("error", None)
    item.setdefault("started_at", None)
    item.setdefault("completed_at", None)
    item.setdefault("created_at", created)
    item.setdefault("updated_at", created)
    item.setdefault("account_id", account_id)
    return _camelize(item)


def _source_audit(value: dict[str, Any]) -> dict[str, Any]:
    """Expose the complete source audit envelope with safe empty defaults."""
    item = dict(value)
    created = str(item.get("created_at") or item.get("updated_at") or now_iso())
    item.setdefault("project_id", str(item.get("project_id") or ""))
    item.setdefault("account_id", str(item.get("account_id") or ""))
    item.setdefault("device_id", str(item.get("device_id") or ""))
    item.setdefault("platform_account_id", str(item.get("platform_account_id") or ""))
    item.setdefault("trigger", "manual")
    item.setdefault("change_order_id", None)
    item["status"] = {
        "pending_confirmation": "completed",
        "unknown": "failed",
        "error": "failed",
    }.get(str(item.get("status")), str(item.get("status") or "failed"))
    item.setdefault("reason", "")
    item.setdefault("active_task_id", None)
    item.setdefault("profile", None)
    item.setdefault("home", None)
    item.setdefault("creator", None)
    item.setdefault("note_details", None)
    item.setdefault("flags", [])
    item.setdefault("manual_check_at", None)
    item.setdefault("started_at", created)
    item.setdefault("completed_at", None)
    item.setdefault("created_at", created)
    item.setdefault("updated_at", created)
    return _camelize(item)


def _source_diagnosis(value: dict[str, Any]) -> dict[str, Any]:
    """Normalize a stored diagnosis to the source's structured response shape."""
    item = dict(value)
    created = str(item.get("created_at") or item.get("updated_at") or now_iso())
    item.setdefault("project_id", str(item.get("project_id") or ""))
    item.setdefault("account_id", str(item.get("account_id") or ""))
    item.setdefault("audit_id", str(item.get("audit_id") or ""))
    item.setdefault("version", 1)
    item.setdefault("parent_id", None)
    item.setdefault("status", "failed")
    item.setdefault("playbook_version", "")
    item.setdefault("cited_rules", [])
    item.setdefault("facts", {})
    item.setdefault("cadence", {"browse_defaults": {}, "interaction": {}, "rationale": []})
    item.setdefault("summary", "")
    item.setdefault("inferred_persona", None)
    item.setdefault("dimensions", [])
    item.setdefault("findings", [])
    item.setdefault("questions", [])
    item.setdefault("proposals", [])
    item.setdefault("dropped", [])
    item.setdefault("decisions", {})
    item.setdefault("feedback", [])
    item.setdefault("generator", {"bot_id": "octop", "model": None})
    item.setdefault("confirmed_at", None)
    item.setdefault("error", None)
    item.setdefault("created_at", created)
    item.setdefault("updated_at", created)
    return _camelize(item)


def _source_change_order(value: dict[str, Any]) -> dict[str, Any]:
    """Normalize a stored change order to the source's field-level contract."""
    item = dict(value)
    created = str(item.get("created_at") or item.get("updated_at") or now_iso())
    item.setdefault("project_id", str(item.get("project_id") or ""))
    item.setdefault("account_id", str(item.get("account_id") or ""))
    item.setdefault("device_id", str(item.get("device_id") or ""))
    item.setdefault("platform_account_id", str(item.get("platform_account_id") or ""))
    item.setdefault("diagnosis_id", None)
    item.setdefault("proposal_ids", [])
    item.setdefault("batch_index", 1)
    item.setdefault("risk", "L1")
    item.setdefault("fields", [])
    item.setdefault("status", "draft")
    item.setdefault("acks", {})
    item.setdefault("precheck", None)
    item.setdefault("observation_until", None)
    item.setdefault("observation_hours", 24)
    item.setdefault("flags", [])
    item.setdefault("error", None)
    item.setdefault("created_at", created)
    item.setdefault("updated_at", created)
    return _camelize(item)


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


async def _command_resource(
    server: Any,
    user: Any,
    name: str,
    payload: dict[str, Any],
    *,
    collection: str,
    response_key: str,
    item_id: str | None = None,
) -> dict[str, Any]:
    snapshot = await _command(server, user, name, payload)
    selected_id = item_id or (str(payload["id"]) if payload.get("id") else None)
    item = _snapshot_item(snapshot, collection, selected_id)
    if item is None:
        return _camelize(snapshot)
    if response_key == "account":
        return {response_key: _source_account(item)}
    if response_key == "project":
        return _project_response(item)
    if response_key == "run":
        return {response_key: _source_run(item)}
    if response_key == "diagnosis":
        return {response_key: _source_diagnosis(item)}
    return _camelize({response_key: item})


def _identity_response(snapshot: dict[str, Any], account_id: str) -> dict[str, Any]:
    account = next(
        (row for row in _rows(snapshot, "accounts") if row.get("id") == account_id),
        None,
    )
    if account is None:
        raise OctopError(ErrorCode.SLASH_BAD_ARGS, "account not found", status=404)
    profile = account.get("profile_identity")
    runs = sorted(
        [
            row
            for row in _rows(snapshot, "runs")
            if row.get("account_id") == account_id and row.get("kind") == "account_identity"
        ],
        key=lambda row: str(row.get("created_at") or ""),
    )
    latest = runs[-1] if runs else {}
    task_id = str((profile or {}).get("run_id") or latest.get("task_id") or "")
    status = str((profile or {}).get("status") or "")
    if status in {"visible", "unavailable"}:
        return {
            "status": status,
            "screenshotUrl": (profile or {}).get("evidence_url"),
            "accountId": str((profile or {}).get("account_id") or ""),
            "taskId": task_id,
            "reason": (
                "已读到手机上的小红薯号，请对照截图确认"
                if status == "visible"
                else "没有取到手机上的小红薯号，请确认手机状态后重试"
            ),
        }
    if latest.get("status") in {"queued", "preparing", "running", "cancelling"}:
        return {
            "status": "unavailable",
            "screenshotUrl": None,
            "accountId": "",
            "taskId": task_id,
            "reason": "身份读取任务已排队，等待手机回执",
        }
    if latest.get("status") in {"unknown", "error", "interrupted"}:
        return {
            "status": "unavailable",
            "screenshotUrl": None,
            "accountId": "",
            "taskId": task_id,
            "reason": str(latest.get("error") or "身份读取未完成，请确认手机状态后重试"),
        }
    return {
        "status": "unavailable",
        "screenshotUrl": None,
        "accountId": "",
        "taskId": task_id,
        "reason": "身份读取任务已创建，等待手机回执",
    }


def _rows(snapshot: dict[str, Any], collection: str) -> list[dict[str, Any]]:
    value = snapshot.get("data", {}).get(collection, [])
    return [row for row in value if isinstance(row, dict)]


def _body(body: CommandBody | None) -> dict[str, Any]:
    return body.model_dump(exclude_none=True) if body is not None else {}


def _server_date(server: Any) -> str:
    timezone_name = getattr(
        getattr(getattr(server, "services", None), "config", None),
        "default_timezone",
        "UTC",
    )
    timezone: tzinfo
    try:
        timezone = ZoneInfo(str(timezone_name))
    except Exception:
        timezone = UTC
    return datetime.now(timezone).date().isoformat()


@router.get("/projects", summary="List XHS projects", response_model=XhsProjectListResponse)
async def projects(
    user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    snapshot = await _snapshot(server, user)
    return {"projects": _source_projects(_rows(snapshot, "projects"))}


@router.post("/projects", summary="Create an XHS project", response_model=XhsProjectResponse)
async def create_project(
    body: ProjectCreate,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _command_resource(
        server,
        user,
        "project.save",
        body.model_dump(exclude_none=True),
        collection="projects",
        response_key="project",
    )


@router.get(
    "/projects/{project_id}", summary="Read one XHS project", response_model=XhsProjectResponse
)
async def project(
    project_id: str, user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    snapshot = await _snapshot(server, user)
    item = next(
        (
            row
            for row in snapshot.get("data", {}).get("projects", [])
            if row.get("id") == project_id
        ),
        None,
    )
    if item is None:
        raise OctopError(ErrorCode.SLASH_BAD_ARGS, "project not found", status=404)
    return _project_response(item)


@router.patch(
    "/projects/{project_id}", summary="Update an XHS project", response_model=XhsProjectResponse
)
async def update_project(
    project_id: str,
    body: ProjectMutation,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    payload = body.model_dump(exclude_none=True)
    payload["id"] = project_id
    return await _command_resource(
        server,
        user,
        "project.save",
        payload,
        collection="projects",
        response_key="project",
        item_id=project_id,
    )


@router.delete(
    "/projects/{project_id}", summary="Delete an XHS project", response_model=XhsProjectResponse
)
async def delete_project(
    project_id: str,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    before = await _snapshot(server, user)
    project = _snapshot_item(before, "projects", project_id)
    if project is None:
        raise OctopError(ErrorCode.SLASH_BAD_ARGS, "project not found", status=404)
    await _command(server, user, "project.delete", {"id": project_id, "confirmed": True})
    return _project_response(project)


@router.post(
    "/projects/{project_id}/profile/generate",
    summary="Generate an XHS project profile",
    response_model=XhsProjectResponse,
)
async def generate_project_profile(
    project_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _command(
        server, user, "profile.generate", {"project_id": project_id, **_body(body)}
    )
    return _project_response(_snapshot_item(snapshot, "projects", project_id))


@router.post(
    "/projects/{project_id}/profile/confirm",
    summary="Confirm an XHS project profile",
    response_model=XhsProjectResponse,
)
async def confirm_project_profile(
    project_id: str,
    body: CommandBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _command(
        server,
        user,
        "profile.confirm",
        {"project_id": project_id, **body.model_dump(exclude_none=True), "confirmed": True},
    )
    return _project_response(_snapshot_item(snapshot, "projects", project_id))


@router.post(
    "/projects/{project_id}/personas/generate",
    summary="Generate XHS personas",
    response_model=XhsPersonaGenerateResponse,
)
async def generate_project_personas(
    project_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _command(
        server, user, "persona.generate", {"project_id": project_id, **_body(body)}
    )
    project = _snapshot_item(snapshot, "projects", project_id) or {}
    candidates = [
        {
            key: row[key]
            for key in ("label", "positioning", "persona", "persona_tags", "interest_pool")
            if key in row
        }
        for row in _rows(snapshot, "persona_candidates")
        if row.get("project_id") == project_id and row.get("status") == "draft"
    ]
    distribution = json.dumps(project.get("audience") or {}, ensure_ascii=False)
    return _camelize({"suggestions": candidates, "distribution": distribution, "project": project})


@router.post(
    "/projects/{project_id}/personas/confirm",
    summary="Confirm XHS personas",
    response_model=XhsAccountListResponse,
)
async def confirm_project_personas(
    project_id: str,
    body: CommandBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _command(
        server,
        user,
        "personas.confirm",
        {"project_id": project_id, **body.model_dump(exclude_none=True), "confirmed": True},
    )
    accounts = [row for row in _rows(snapshot, "accounts") if row.get("project_id") == project_id]
    return {"accounts": _source_accounts(accounts)}


@router.get(
    "/projects/{project_id}/accounts",
    summary="List accounts in an XHS project",
    response_model=XhsAccountListResponse,
)
async def project_accounts(
    project_id: str, user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    snapshot = await _snapshot(server, user)
    accounts = [
        row
        for row in snapshot.get("data", {}).get("accounts", [])
        if row.get("project_id") == project_id
    ]
    return {"accounts": _source_accounts(accounts)}


@router.post(
    "/projects/{project_id}/accounts",
    summary="Create an XHS project account",
    response_model=XhsAccountResponse,
)
async def create_account(
    project_id: str,
    body: CommandBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    values = body.model_dump(exclude_none=True)
    source_project_id = values.get("project_id") or values.get("projectId")
    if source_project_id is not None and source_project_id != project_id:
        raise OctopError(ErrorCode.SLASH_BAD_ARGS, "project id does not match path", status=400)
    return await _command_resource(
        server,
        user,
        "account.save",
        {"project_id": project_id, **values},
        collection="accounts",
        response_key="account",
    )


@router.get(
    "/accounts/{account_id}",
    summary="Read one XHS project account",
    response_model=XhsAccountResponse,
)
async def get_account(
    account_id: str,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _snapshot(server, user)
    account = next(
        (row for row in _rows(snapshot, "accounts") if row.get("id") == account_id),
        None,
    )
    if account is None:
        raise OctopError(ErrorCode.SLASH_BAD_ARGS, "account not found", status=404)
    return {"account": _source_account(account)}


@router.patch(
    "/accounts/{account_id}",
    summary="Update an XHS project account",
    response_model=XhsAccountResponse,
)
async def update_account(
    account_id: str,
    body: CommandBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    values = body.model_dump(exclude_none=True)
    source_account_id = values.get("id")
    if source_account_id is not None and source_account_id != account_id:
        raise OctopError(ErrorCode.SLASH_BAD_ARGS, "account id does not match path", status=400)
    return await _command_resource(
        server,
        user,
        "account.save",
        {"id": account_id, **values},
        collection="accounts",
        response_key="account",
        item_id=account_id,
    )


@router.delete(
    "/accounts/{account_id}",
    summary="Delete an XHS project account",
    response_model=XhsAccountResponse,
)
async def delete_account(
    account_id: str,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    before = await _snapshot(server, user)
    account = _snapshot_item(before, "accounts", account_id)
    if account is None:
        raise OctopError(ErrorCode.SLASH_BAD_ARGS, "account not found", status=404)
    await _command(server, user, "account.delete", {"id": account_id, "confirmed": True})
    return {"account": _source_account(account)}


@router.post(
    "/accounts/{account_id}/identity/read",
    summary="Read a bound XHS account identity",
    response_model=XhsIdentityTaskResponse,
)
async def read_account_identity(
    account_id: str,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _snapshot(server, user)
    account = next(
        (row for row in _rows(snapshot, "accounts") if row.get("id") == account_id),
        None,
    )
    if account is None:
        raise OctopError(ErrorCode.SLASH_BAD_ARGS, "account not found", status=404)
    result = await _command(
        server,
        user,
        "account.identity",
        {
            "account_id": account_id,
            "version": account.get("version"),
            "confirmed": True,
        },
    )
    return _identity_response(result, account_id)


@router.post(
    "/accounts/{account_id}/profile-draft/generate",
    summary="Generate an XHS account profile draft",
    response_model=XhsAccountResponse,
)
async def generate_account_profile(
    account_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _command_resource(
        server,
        user,
        "account_profile.generate",
        {"account_id": account_id, **_body(body)},
        collection="accounts",
        response_key="account",
        item_id=account_id,
    )


@router.post(
    "/accounts/{account_id}/profile-draft/confirm",
    summary="Confirm an XHS account profile draft",
    response_model=XhsAccountResponse,
)
async def confirm_account_profile(
    account_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _command_resource(
        server,
        user,
        "account_profile.review",
        {"account_id": account_id, **_body(body), "confirmed": True},
        collection="accounts",
        response_key="account",
        item_id=account_id,
    )


@router.post(
    "/accounts/{account_id}/profile-draft/readback",
    summary="Read back an XHS account profile",
    response_model=XhsProfileReadbackResponse,
)
async def readback_account_profile(
    account_id: str,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _command(server, user, "account_profile.read", {"account_id": account_id})
    account = _snapshot_item(snapshot, "accounts", account_id) or {}
    readback = account.get("profile_readback") or {}
    runs = [
        row
        for row in _rows(snapshot, "runs")
        if row.get("account_id") == account_id and row.get("kind") == "account_profile_read"
    ]
    latest = runs[-1] if runs else {}
    status = "read" if readback.get("status") == "read" else "unavailable"
    return _camelize(
        {
            "status": status,
            "taskId": readback.get("task_id")
            or readback.get("run_id")
            or latest.get("task_id", ""),
            "reason": readback.get("reason")
            or readback.get("error")
            or ("资料回读完成" if status == "read" else "资料回读任务尚未完成"),
            "screenshotUrl": readback.get("screenshot_url") or readback.get("evidence_url"),
            "fields": readback.get("fields")
            or readback.get("diffs")
            or _source_profile_fields(readback, account),
        }
    )


@router.post(
    "/accounts/{account_id}/profile-draft/apply",
    summary="Apply an XHS account profile draft",
    response_model=XhsAccountResponse,
)
async def apply_account_profile(
    account_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _command_resource(
        server,
        user,
        "account_profile.apply",
        {"account_id": account_id, **_body(body), "confirmed": True},
        collection="accounts",
        response_key="account",
        item_id=account_id,
    )


@router.post(
    "/accounts/{account_id}/profile-draft/reconcile",
    summary="Reconcile an XHS account profile operation",
    response_model=XhsAccountResponse,
)
async def reconcile_account_profile(
    account_id: str,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _command_resource(
        server,
        user,
        "account_profile.reconcile",
        {"account_id": account_id},
        collection="accounts",
        response_key="account",
        item_id=account_id,
    )


@router.get(
    "/projects/{project_id}/comments",
    summary="List XHS comment drafts",
    response_model=XhsCommentListResponse,
)
async def project_comments(
    project_id: str,
    status: str | None = None,
    account_id: str | None = None,
    accountId: str | None = Query(default=None, alias="accountId"),
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    account_id = account_id or accountId
    snapshot = await _snapshot(server, user)
    comments = [row for row in _rows(snapshot, "comments") if row.get("project_id") == project_id]
    if status:
        comments = [row for row in comments if row.get("status") == status]
    if account_id:
        comments = [row for row in comments if row.get("account_id") == account_id]
    project_account_ids = {
        row.get("id") for row in _rows(snapshot, "accounts") if row.get("project_id") == project_id
    }
    quotas = [
        row
        for row in _rows(snapshot, "comment_quotas")
        if row.get("account_id") in project_account_ids
        and (not account_id or row.get("account_id") == account_id)
    ]
    return _camelize({"drafts": comments, "quotas": quotas})


@router.post(
    "/runs/{run_id}/comments/generate",
    summary="Generate XHS comment drafts",
    response_model=XhsCommentGenerateResponse,
)
async def generate_run_comments(
    run_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _command(server, user, "comment.generate", {"run_id": run_id, **_body(body)})
    drafts = [row for row in _rows(snapshot, "comments") if row.get("source_run_id") == run_id]
    return _camelize({"drafts": drafts, "skipped": []})


@router.post(
    "/comments/{comment_id}/review",
    summary="Review an XHS comment draft",
    response_model=XhsCommentResponse,
)
async def review_comment(
    comment_id: str,
    body: CommandBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _command(
        server,
        user,
        "comment.review",
        {"id": comment_id, **body.model_dump(exclude_none=True)},
    )
    draft = _snapshot_item(snapshot, "comments", comment_id)
    return _camelize({"draft": draft or {}})


@router.get(
    "/accounts/{account_id}/comment-quota",
    summary="Read an XHS comment quota",
    response_model=XhsCommentQuotaResponse,
)
async def comment_quota(
    account_id: str,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _snapshot(server, user)
    quota = next(
        (row for row in _rows(snapshot, "comment_quotas") if row.get("account_id") == account_id),
        None,
    )
    if quota is None:
        raise OctopError(ErrorCode.SLASH_BAD_ARGS, "comment quota not found", status=404)
    return _camelize({"quota": quota})


@router.post(
    "/projects/{project_id}/comment-runs",
    summary="Start an XHS comment run",
    response_model=XhsRunResponse,
)
async def start_comment_run(
    project_id: str,
    body: CommandBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    payload = body.model_dump(exclude_none=True)
    snapshot = await _command(
        server,
        user,
        "comment.send",
        {"project_id": project_id, **payload, "confirmed": True},
    )
    account_id = str(payload.get("account_id") or payload.get("accountId") or "")
    candidates = [
        row
        for row in _rows(snapshot, "runs")
        if row.get("kind") == "comment" and (not account_id or row.get("account_id") == account_id)
    ]
    latest = max(
        candidates,
        key=lambda row: str(row.get("updated_at") or row.get("created_at") or ""),
        default=None,
    )
    if latest is None:
        raise OctopError(ErrorCode.INTERNAL_ERROR, "comment run not found", status=500)
    return {"run": _source_run(latest)}


@router.get("/runs", summary="List XHS runs", response_model=XhsRunListResponse)
async def runs(
    project_id: str | None = None,
    account_id: str | None = None,
    status: str | None = None,
    date: str | None = None,
    projectId: str | None = Query(default=None, alias="projectId"),
    accountId: str | None = Query(default=None, alias="accountId"),
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    project_id = project_id or projectId
    account_id = account_id or accountId
    snapshot = await _snapshot(server, user)
    items = _rows(snapshot, "runs")
    if project_id:
        account_ids = {
            row.get("id")
            for row in _rows(snapshot, "accounts")
            if row.get("project_id") == project_id
        }
        items = [row for row in items if row.get("account_id") in account_ids]
    if account_id:
        items = [row for row in items if row.get("account_id") == account_id]
    if date:
        items = [row for row in items if row.get("date") == date or row.get("day_id") == date]
    if status:
        items = [row for row in items if row.get("status") == status]
    items.sort(
        key=lambda row: str(row.get("updated_at") or row.get("created_at") or ""), reverse=True
    )
    return {"runs": [_source_run(item) for item in items]}


@router.post("/runs", summary="Create a planned XHS run", response_model=XhsRunResponse)
async def create_planned_run(
    body: CommandBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _command_resource(
        server,
        user,
        "run.create",
        body.model_dump(exclude_none=True),
        collection="runs",
        response_key="run",
    )


@router.get("/runs/{run_id}", summary="Read one XHS run", response_model=XhsRunResponse)
async def run(
    run_id: str, user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    snapshot = await _snapshot(server, user)
    item = next((row for row in _rows(snapshot, "runs") if row.get("id") == run_id), None)
    if item is None:
        raise OctopError(ErrorCode.SLASH_BAD_ARGS, "run not found", status=404)
    return {"run": _source_run(item)}


@router.patch("/runs/{run_id}", summary="Update an XHS run note", response_model=XhsRunResponse)
async def update_run(
    run_id: str,
    body: CommandBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _command_resource(
        server,
        user,
        "run.note",
        {"run_id": run_id, **body.model_dump(exclude_none=True)},
        collection="runs",
        response_key="run",
        item_id=run_id,
    )


@router.post("/runs/{run_id}/start", summary="Start an XHS run", response_model=XhsRunResponse)
async def start_run(
    run_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _command_resource(
        server,
        user,
        "run.start",
        {"run_id": run_id, **_body(body)},
        collection="runs",
        response_key="run",
        item_id=run_id,
    )


@router.post("/runs/{run_id}/cancel", summary="Cancel an XHS run", response_model=XhsRunResponse)
async def cancel_run(
    run_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _command_resource(
        server,
        user,
        "run.cancel",
        {"run_id": run_id, **_body(body)},
        collection="runs",
        response_key="run",
        item_id=run_id,
    )


@router.post(
    "/projects/{project_id}/schedule/run-now",
    summary="Run an XHS daily plan now",
    response_model=XhsScheduleRunNowResponse,
)
async def run_daily_now(
    project_id: str,
    body: CommandBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _command(
        server,
        user,
        "ops.start",
        {"project_id": project_id, **body.model_dump(exclude_none=True), "confirmed": True},
    )
    project = _snapshot_item(snapshot, "projects", project_id) or {"id": project_id}
    today = _server_date(server)
    day_value = next(
        (
            row
            for row in _rows(snapshot, "operation_days")
            if row.get("project_id") == project_id
            and str(row.get("date") or row.get("day_id") or "") == today
        ),
        None,
    )
    day: dict[str, Any] = day_value if isinstance(day_value, dict) else {}
    runs = [
        row
        for row in _rows(snapshot, "runs")
        if row.get("account_id")
        and str(row.get("created_at") or "").startswith(today)
        and row.get("kind") in {"browse", "nurture"}
    ]
    summary_value = day.get("summary")
    summary: dict[str, Any] = summary_value if isinstance(summary_value, dict) else {}
    planned = int(summary.get("planned") or day.get("planned") or 0)
    started = sum(1 for row in runs if row.get("status") not in {"queued", "planned"})
    queued = sum(1 for row in runs if row.get("status") in {"queued", "planned"})
    return _camelize(
        {
            "project": project,
            "result": {
                "date": today,
                "planned": planned,
                "created": len(runs),
                "started": started,
                "queued": queued,
                "skipped": [],
                "summary": str(summary.get("summary") or ""),
            },
        }
    )


@router.get(
    "/projects/{project_id}/plan-suggest",
    summary="Read XHS daily plan suggestions",
    response_model=XhsPlanSuggestResponse,
)
async def plan_suggest(
    project_id: str,
    date: str | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _snapshot(server, user)
    target_date = date or _server_date(server)
    accounts = [row for row in _rows(snapshot, "accounts") if row.get("project_id") == project_id]
    module = _host(server).module(PLUGIN_ID)
    plans: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for account in accounts:
        account_id = str(account.get("id") or "")
        account_label = str(account.get("label") or account.get("name") or "")
        if not account.get("device_id"):
            skipped.append(
                {
                    "account_id": account_id,
                    "account_label": account_label,
                    "reason": "account_device_required",
                }
            )
            continue
        previous = [
            row
            for row in _rows(snapshot, "runs")
            if row.get("account_id") == account_id and row.get("kind") == "browse"
        ]
        try:
            plans.extend(
                module.daily.operations.build_plans(account, target_date, previous_runs=previous)
            )
        except PluginAppError as exc:
            if exc.status != 409:
                raise
            skipped.append(
                {
                    "account_id": account_id,
                    "account_label": account_label,
                    "reason": exc.reason,
                }
            )
    return _camelize({"plans": plans, "skipped": skipped})


@router.get(
    "/device-bindings",
    summary="List XHS device bindings",
    response_model=XhsDeviceBindingListResponse,
)
async def device_bindings(
    user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    snapshot = await _snapshot(server, user)
    projects = {row.get("id"): row for row in snapshot.get("data", {}).get("projects", [])}
    devices = {row.get("device_id"): row for row in snapshot.get("devices", [])}
    bindings: list[dict[str, Any]] = []
    for account in snapshot.get("data", {}).get("accounts", []):
        device_id = str(account.get("device_id") or "")
        if not device_id:
            continue
        device = devices.get(device_id) or {}
        blocking_reason = None
        if not device.get("online"):
            blocking_reason = "device_offline"
        elif device.get("running_task_id"):
            blocking_reason = "device_busy"
        bindings.append(
            {
                "device_id": device_id,
                "account_id": account.get("id"),
                "account_label": account.get("name", ""),
                "project_id": account.get("project_id", ""),
                "project_name": (projects.get(account.get("project_id")) or {}).get("name", ""),
                "can_transfer": blocking_reason is None,
                "blocking_reason": blocking_reason,
            }
        )
    return _camelize({"bindings": bindings})


@router.post(
    "/projects/{project_id}/accounts/transfer-device",
    summary="Transfer a phone binding between XHS accounts",
    response_model=XhsAccountResponse,
)
async def transfer_device(
    project_id: str,
    body: TransferBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    payload = body.model_dump(exclude_none=True)
    payload["project_id"] = project_id
    snapshot = await _command(server, user, "account.transfer_device", payload)
    target_id = str(
        payload.get("to_account_id")
        or payload.get("toAccountId")
        or (payload.get("account") or {}).get("id")
        or ""
    )
    target = _snapshot_item(snapshot, "accounts", target_id)
    if target is None:
        device = payload.get("account") or {}
        device_id = str(device.get("device_id") or device.get("deviceId") or "")
        target = next(
            (
                row
                for row in _rows(snapshot, "accounts")
                if device_id and row.get("device_id") == device_id
            ),
            None,
        )
    return {"account": _source_account(target) or {"id": target_id}}


@router.post(
    "/accounts/{account_id}/takeover/identity/read",
    summary="Read a takeover account identity",
    response_model=XhsIdentityReadResponse,
)
async def takeover_identity_read(
    account_id: str, user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    snapshot = await _command(
        server, user, "takeover.identity.read", {"account_id": account_id, "confirmed": True}
    )
    account = _snapshot_item(snapshot, "accounts", account_id)
    return {
        "identity": _identity_response(snapshot, account_id),
        "account": _source_account(account),
    }


@router.post(
    "/accounts/{account_id}/takeover/identity/confirm",
    summary="Confirm and lock a takeover account identity",
    response_model=XhsIdentityConfirmResponse,
)
async def takeover_identity_confirm(
    account_id: str,
    body: IdentityConfirmBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _command(
        server,
        user,
        "takeover.identity.confirm",
        {"account_id": account_id, **body.model_dump(), "confirmed": True},
    )
    account = _snapshot_item(snapshot, "accounts", account_id)
    event = _latest_event(snapshot, "xhs_ops_takeover_identity_locked", target_id=account_id)
    return _camelize(
        {
            "account": _source_account(account),
            "event": event
            or {
                "name": "xhs_ops_takeover_identity_locked",
                "payload": {"accountId": account_id},
            },
        }
    )


@router.post(
    "/accounts/{account_id}/takeover/plan/revert",
    summary="Revert a takeover plan",
    response_model=XhsTakeoverPlanResponse,
)
async def takeover_plan_revert(
    account_id: str,
    body: PlanRevertBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _command(
        server,
        user,
        "takeover.plan.revert",
        {
            "account_id": account_id,
            "account_version": body.version,
            "confirmed": True,
        },
    )
    account = _snapshot_item(snapshot, "accounts", account_id)
    diagnosis = next(
        (
            row
            for row in _rows(snapshot, "diagnoses")
            if row.get("account_id") == account_id and row.get("status") != "superseded"
        ),
        None,
    )
    orders = [
        row for row in _rows(snapshot, "change_orders") if row.get("account_id") == account_id
    ]
    return _camelize({"account": account, "diagnosis": diagnosis, "changeOrders": orders})


@router.post(
    "/accounts/{account_id}/takeover/authorize",
    summary="Authorize XHS takeover",
    response_model=XhsAccountResponse,
)
async def takeover_authorize(
    account_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _command(
        server,
        user,
        "takeover.authorize",
        {"account_id": account_id, **_body(body), "confirmed": True},
    )
    return {"account": _source_account(_snapshot_item(snapshot, "accounts", account_id))}


@router.post(
    "/accounts/{account_id}/takeover/pause",
    summary="Pause XHS takeover",
    response_model=XhsAccountResponse,
)
async def takeover_pause(
    account_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _command(
        server, user, "takeover.pause", {"account_id": account_id, **_body(body), "confirmed": True}
    )
    return {"account": _source_account(_snapshot_item(snapshot, "accounts", account_id))}


@router.post(
    "/accounts/{account_id}/takeover/resume",
    summary="Resume XHS takeover",
    response_model=XhsTakeoverPlanResponse,
)
async def takeover_resume(
    account_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _command(
        server,
        user,
        "takeover.resume",
        {"account_id": account_id, **_body(body), "confirmed": True},
    )
    account = _snapshot_item(snapshot, "accounts", account_id)
    return _camelize(
        {"account": account, "resumed": not bool(account and account.get("paused")), "gate": None}
    )


@router.post(
    "/accounts/{account_id}/takeover/device-hold/release",
    summary="Release an XHS device hold",
    response_model=XhsAccountResponse,
)
async def takeover_device_hold_release(
    account_id: str,
    body: CommandBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _command(
        server,
        user,
        "takeover.device_hold_release",
        {"account_id": account_id, **body.model_dump(exclude_none=True), "confirmed": True},
    )
    return {"account": _source_account(_snapshot_item(snapshot, "accounts", account_id))}


@router.get(
    "/accounts/{account_id}/audits",
    summary="List XHS account audits",
    response_model=XhsAuditListResponse,
)
async def account_audits(
    account_id: str, user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    snapshot = await _snapshot(server, user)
    return {
        "audits": [
            _source_audit(row)
            for row in _rows(snapshot, "audits")
            if row.get("account_id") == account_id
        ]
    }


@router.post(
    "/accounts/{account_id}/audits",
    summary="Start an XHS account audit",
    response_model=XhsAuditResponse,
)
async def start_account_audit(
    account_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _command(
        server,
        user,
        "run.start",
        {"kind": "audit", "account_id": account_id, **_body(body), "confirmed": True},
    )
    audit = _snapshot_item(snapshot, "audits")
    return {"audit": _source_audit(audit) if audit else None}


@router.get("/audits/{audit_id}", summary="Read an XHS audit", response_model=XhsAuditResponse)
async def audit(
    audit_id: str, user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    snapshot = await _snapshot(server, user)
    item = next((row for row in _rows(snapshot, "audits") if row.get("id") == audit_id), None)
    if item is None:
        raise OctopError(ErrorCode.SLASH_BAD_ARGS, "audit not found", status=404)
    return _camelize({"audit": item})


@router.post(
    "/audits/{audit_id}/cancel", summary="Cancel an XHS audit", response_model=XhsAuditResponse
)
async def cancel_audit(
    audit_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _command(
        server, user, "audit.cancel", {"id": audit_id, **_body(body), "confirmed": True}
    )
    item = _snapshot_item(snapshot, "audits", audit_id)
    return {"audit": _source_audit(item) if item else None}


@router.post(
    "/audits/{audit_id}/baseline",
    summary="Confirm an XHS audit baseline",
    response_model=XhsAuditBaselineResponse,
)
async def confirm_audit_baseline(
    audit_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _command(
        server, user, "audit.baseline", {"id": audit_id, **_body(body), "confirmed": True}
    )
    audit = _snapshot_item(snapshot, "audits", audit_id)
    account_id = str((audit or {}).get("account_id") or "")
    event = _latest_event(snapshot, "xhs_ops_account_audited", target_id=account_id)
    return _camelize(
        {
            "account": _snapshot_item(snapshot, "accounts", account_id),
            "audit": audit,
            "event": event
            or {
                "name": "xhs_ops_account_audited",
                "payload": {"accountId": account_id, "baseline": True},
            },
        }
    )


@router.get(
    "/accounts/{account_id}/diagnoses",
    summary="List XHS account diagnoses",
    response_model=XhsDiagnosisListResponse,
)
async def account_diagnoses(
    account_id: str, user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    snapshot = await _snapshot(server, user)
    return {
        "diagnoses": [
            _source_diagnosis(row)
            for row in _rows(snapshot, "diagnoses")
            if row.get("account_id") == account_id
        ]
    }


@router.post(
    "/accounts/{account_id}/diagnoses",
    summary="Generate an XHS diagnosis",
    response_model=XhsDiagnosisResponse,
)
async def generate_diagnosis(
    account_id: str,
    body: CommandBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _command_resource(
        server,
        user,
        "diagnosis.generate",
        {"account_id": account_id, **body.model_dump(exclude_none=True)},
        collection="diagnoses",
        response_key="diagnosis",
    )


@router.get(
    "/diagnoses/{diagnosis_id}",
    summary="Read an XHS diagnosis",
    response_model=XhsDiagnosisViewResponse,
)
async def diagnosis(
    diagnosis_id: str, user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    snapshot = await _snapshot(server, user)
    item = next(
        (row for row in _rows(snapshot, "diagnoses") if row.get("id") == diagnosis_id), None
    )
    if item is None:
        raise OctopError(ErrorCode.SLASH_BAD_ARGS, "diagnosis not found", status=404)
    return {
        "diagnosis": _source_diagnosis(item),
        "event": _camelize(
            _latest_event(snapshot, "xhs_ops_account_diagnosed", target_id=diagnosis_id)
        ),
    }


@router.post(
    "/diagnoses/{diagnosis_id}/regenerate",
    summary="Regenerate an XHS diagnosis",
    response_model=XhsDiagnosisResponse,
)
async def regenerate_diagnosis(
    diagnosis_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _command_resource(
        server,
        user,
        "diagnosis.regenerate",
        {"id": diagnosis_id, **_body(body), "confirmed": True},
        collection="diagnoses",
        response_key="diagnosis",
        item_id=diagnosis_id,
    )


@router.post(
    "/diagnoses/{diagnosis_id}/decisions",
    summary="Save XHS diagnosis decisions",
    response_model=XhsDiagnosisResponse,
)
async def diagnosis_decisions(
    diagnosis_id: str,
    body: CommandBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _command_resource(
        server,
        user,
        "diagnosis.decisions",
        {"id": diagnosis_id, **body.model_dump(exclude_none=True), "confirmed": True},
        collection="diagnoses",
        response_key="diagnosis",
        item_id=diagnosis_id,
    )


@router.post(
    "/diagnoses/{diagnosis_id}/confirm",
    summary="Confirm an XHS diagnosis",
    response_model=XhsTakeoverPlanResponse,
)
async def confirm_diagnosis(
    diagnosis_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _command(
        server,
        user,
        "diagnosis.confirm",
        {"id": diagnosis_id, **_body(body), "confirmed": True},
    )
    diagnosis = _snapshot_item(snapshot, "diagnoses", diagnosis_id)
    account_id = str((diagnosis or {}).get("account_id") or "")
    orders = [
        row for row in _rows(snapshot, "change_orders") if row.get("account_id") == account_id
    ]
    event = _latest_event(snapshot, "xhs_ops_takeover_plan_confirmed", target_id=diagnosis_id)
    return _camelize(
        {
            "account": _snapshot_item(snapshot, "accounts", account_id),
            "diagnosis": diagnosis,
            "changeOrders": orders,
            "skippedFields": (diagnosis or {}).get("skipped_fields", []),
            "event": event
            or {
                "name": "xhs_ops_takeover_plan_confirmed",
                "payload": {"accountId": account_id, "diagnosisId": diagnosis_id},
            },
        }
    )


@router.get(
    "/accounts/{account_id}/change-orders",
    summary="List XHS change orders",
    response_model=XhsChangeOrderListResponse,
)
async def account_change_orders(
    account_id: str, user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    snapshot = await _snapshot(server, user)
    return {
        "orders": [
            _source_change_order(row)
            for row in _rows(snapshot, "change_orders")
            if row.get("account_id") == account_id
        ]
    }


@router.post(
    "/accounts/{account_id}/change-orders",
    summary="Create an XHS change order",
    response_model=XhsChangeOrderActionResponse,
)
async def create_change_order(
    account_id: str,
    body: CommandBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    snapshot = await _command(
        server,
        user,
        "change_order.create",
        {"account_id": account_id, **body.model_dump(exclude_none=True)},
    )
    order = _snapshot_item(snapshot, "change_orders")
    account = _snapshot_item(snapshot, "accounts", account_id)
    return _camelize(
        {
            "order": order,
            "account": account,
            "event": _latest_event(
                snapshot,
                "xhs_ops_change_order_finished",
                target_id=str((order or {}).get("id") or ""),
            ),
        }
    )


@router.get(
    "/change-orders/{order_id}",
    summary="Read an XHS change order",
    response_model=XhsChangeOrderResponse,
)
async def change_order(
    order_id: str, user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    snapshot = await _snapshot(server, user)
    item = next(
        (row for row in _rows(snapshot, "change_orders") if row.get("id") == order_id), None
    )
    if item is None:
        raise OctopError(ErrorCode.SLASH_BAD_ARGS, "change order not found", status=404)
    return {
        "order": _source_change_order(item),
        "event": _camelize(
            _latest_event(snapshot, "xhs_ops_change_order_finished", target_id=order_id)
        ),
    }


async def _change_order_action(
    order_id: str,
    command: str,
    body: CommandBody | None,
    user: Any,
    server: Any,
) -> dict[str, Any]:
    snapshot = await _command(
        server,
        user,
        command,
        {"id": order_id, **_body(body), "confirmed": True},
    )
    order = _snapshot_item(snapshot, "change_orders", order_id)
    if order is None:
        return _camelize(snapshot)
    account = _snapshot_item(snapshot, "accounts", str(order.get("account_id") or ""))
    return {
        "order": _source_change_order(order),
        "account": _source_account(account),
        "event": _camelize(
            _latest_event(snapshot, "xhs_ops_change_order_finished", target_id=order_id)
        ),
    }


@router.post(
    "/change-orders/{order_id}/precheck",
    summary="Precheck an XHS change order",
    response_model=XhsChangeOrderActionResponse,
)
async def precheck_change_order(
    order_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _change_order_action(order_id, "change_order.precheck", body, user, server)


@router.post(
    "/change-orders/{order_id}/confirm",
    summary="Confirm an XHS change order",
    response_model=XhsChangeOrderActionResponse,
)
async def confirm_change_order(
    order_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _change_order_action(order_id, "change_order.confirm", body, user, server)


@router.post(
    "/change-orders/{order_id}/cancel",
    summary="Cancel an XHS change order",
    response_model=XhsChangeOrderActionResponse,
)
async def cancel_change_order(
    order_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _change_order_action(order_id, "change_order.cancel", body, user, server)


@router.post(
    "/change-orders/{order_id}/verify",
    summary="Verify an XHS change order",
    response_model=XhsChangeOrderActionResponse,
)
async def verify_change_order(
    order_id: str,
    body: CommandBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _change_order_action(order_id, "change_order.verify", body, user, server)


@router.post(
    "/change-orders/{order_id}/visual-check",
    summary="Record an XHS visual check",
    response_model=XhsChangeOrderActionResponse,
)
async def visual_check_change_order(
    order_id: str,
    body: CommandBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _change_order_action(order_id, "change_order.visual_check", body, user, server)


@router.post(
    "/change-orders/{order_id}/manual-check",
    summary="Record an XHS manual check",
    response_model=XhsChangeOrderActionResponse,
)
async def manual_check_change_order(
    order_id: str,
    body: CommandBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _change_order_action(order_id, "change_order.manual_check", body, user, server)


@router.post(
    "/change-orders/{order_id}/observation/review",
    summary="Review an XHS change order observation",
    response_model=XhsChangeOrderActionResponse,
)
async def review_change_order_observation(
    order_id: str,
    body: CommandBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _change_order_action(
        order_id, "change_order.observation_review", body, user, server
    )


@router.put(
    "/change-orders/{order_id}/fields/{field}/image",
    summary="Replace an XHS change-order image",
    response_model=XhsChangeOrderActionResponse,
)
async def upload_change_order_image(
    order_id: str,
    field: str,
    body: CommandBody,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    values = body.model_dump(exclude_none=True)
    data_url = str(values.pop("dataUrl", values.pop("data_url", "")))
    expected = str(values.pop("expectedUpdatedAt", values.pop("expected_updated_at", "")))
    header, separator, encoded = data_url.partition(",")
    if not separator or not header.startswith("data:image/") or ";base64" not in header:
        raise OctopError(ErrorCode.SLASH_BAD_ARGS, "invalid image data", status=400)
    mime_type = header.removeprefix("data:").split(";", 1)[0]
    if mime_type not in {"image/png", "image/jpeg", "image/webp"} or not expected:
        raise OctopError(ErrorCode.SLASH_BAD_ARGS, "invalid image data", status=400)
    extension = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}[mime_type]
    snapshot = await _command(
        server,
        user,
        "change_order.image_upload",
        {
            "id": order_id,
            "field": field,
            "expected_updated_at": expected,
            "image": {
                "filename": f"{field}.{extension}",
                "display_name": f"{field}.{extension}",
                "mime_type": mime_type,
                "data_base64": encoded,
            },
            "confirmed": True,
        },
    )
    order = _snapshot_item(snapshot, "change_orders", order_id)
    account = _snapshot_item(snapshot, "accounts", str((order or {}).get("account_id") or ""))
    return _camelize({"order": order, "account": account, "event": None})


@router.post(
    "/change-orders/{order_id}/rollback",
    summary="Rollback an XHS change order",
    response_model=XhsChangeOrderActionResponse,
)
async def rollback_change_order(
    order_id: str,
    body: CommandBody | None = None,
    user: Any = Depends(current_user),
    server: Any = Depends(get_server),
) -> dict[str, Any]:
    return await _change_order_action(order_id, "change_order.rollback", body, user, server)


@router.get(
    "/playbook",
    summary="Read the versioned XHS takeover playbook",
    response_model=XhsPlaybookResponse,
)
async def playbook(
    user: Any = Depends(current_user), server: Any = Depends(get_server)
) -> dict[str, Any]:
    # Reading the playbook still goes through the plugin license boundary.
    snapshot = await _snapshot(server, user)
    license_payload = snapshot.get("license", {})
    if not (license_payload.get("features") or license_payload.get("read_features")):
        raise OctopError(ErrorCode.FORBIDDEN, "xhs-ops license required", status=403)
    try:
        module = _host(server).module(PLUGIN_ID)
        return cast(dict[str, Any], module.playbook_snapshot())
    except PluginAppError as exc:
        raise _error(exc) from exc

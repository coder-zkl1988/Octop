from __future__ import annotations

from octop.api.routers.xhs_ops import (
    CommandBody,
    IdentityConfirmBody,
    ProjectMutation,
    TransferBody,
    XhsAccountResponse,
    XhsAuditResource,
    XhsChangeOrderResource,
    XhsDiagnosisResource,
    XhsIdentityTaskResponse,
    XhsProjectResource,
    XhsRunResource,
    XhsRunResponse,
    XhsScheduleRunNowResponse,
    _camelize,
    _identity_response,
    _source_account,
    _source_audit,
    _source_change_order,
    _source_diagnosis,
    _source_profile_fields,
    _source_project,
    _source_projects,
    _source_run,
    router,
)


def test_xhs_resource_responses_use_source_camel_case_fields() -> None:
    assert _camelize(
        {
            "project_id": "p1",
            "device_id": "d1",
            "nested_value": {"updated_at": "t1"},
        }
    ) == {
        "projectId": "p1",
        "deviceId": "d1",
        "nestedValue": {"updatedAt": "t1"},
    }


def test_xhs_resource_facade_exposes_migrated_resource_routes() -> None:
    paths = {route.path for route in router.routes}
    assert "/xhs-ops/projects" in paths
    assert "/xhs-ops/projects/{project_id}/accounts" in paths
    assert "/xhs-ops/accounts/{account_id}" in paths
    assert "/xhs-ops/change-orders/{order_id}/fields/{field}/image" in paths
    assert "/xhs-ops/runs/{run_id}" in paths
    assert "/xhs-ops/projects/{project_id}/accounts/transfer-device" in paths
    assert "/xhs-ops/device-bindings" in paths
    assert "/xhs-ops/accounts/{account_id}/takeover/identity/read" in paths
    assert "/xhs-ops/accounts/{account_id}/takeover/plan/revert" in paths
    assert "/xhs-ops/playbook" in paths
    assert "/xhs-ops/projects/{project_id}/profile/generate" in paths
    assert "/xhs-ops/accounts/{account_id}/profile-draft/apply" in paths
    assert "/xhs-ops/projects/{project_id}/comments" in paths
    assert "/xhs-ops/projects/{project_id}/comment-runs" in paths
    assert "/xhs-ops/runs/{run_id}/start" in paths
    assert "/xhs-ops/runs/{run_id}/cancel" in paths
    assert "/xhs-ops/projects/{project_id}/plan-suggest" in paths
    assert "/xhs-ops/accounts/{account_id}/takeover/pause" in paths
    assert "/xhs-ops/accounts/{account_id}/takeover/device-hold/release" in paths
    assert "/xhs-ops/accounts/{account_id}/audits" in paths
    assert "/xhs-ops/audits/{audit_id}/baseline" in paths
    assert "/xhs-ops/accounts/{account_id}/diagnoses" in paths
    assert "/xhs-ops/diagnoses/{diagnosis_id}/decisions" in paths
    assert "/xhs-ops/accounts/{account_id}/change-orders" in paths
    assert "/xhs-ops/change-orders/{order_id}/observation/review" in paths


def test_xhs_resource_facade_keeps_source_account_route_methods() -> None:
    methods = {(route.path, method) for route in router.routes for method in route.methods or ()}
    assert ("/xhs-ops/accounts/{account_id}", "GET") in methods
    assert ("/xhs-ops/accounts/{account_id}/identity/read", "POST") in methods


def test_xhs_mutation_routes_expose_source_envelopes() -> None:
    expected = {
        "/xhs-ops/projects/{project_id}/comment-runs": XhsRunResponse,
        "/xhs-ops/runs/{run_id}/start": XhsRunResponse,
        "/xhs-ops/runs/{run_id}/cancel": XhsRunResponse,
        "/xhs-ops/accounts/{account_id}/identity/read": XhsIdentityTaskResponse,
        "/xhs-ops/accounts/{account_id}/profile-draft/generate": XhsAccountResponse,
        "/xhs-ops/accounts/{account_id}/profile-draft/confirm": XhsAccountResponse,
        "/xhs-ops/accounts/{account_id}/profile-draft/apply": XhsAccountResponse,
        "/xhs-ops/accounts/{account_id}/profile-draft/reconcile": XhsAccountResponse,
        "/xhs-ops/projects/{project_id}/accounts/transfer-device": XhsAccountResponse,
        "/xhs-ops/accounts/{account_id}/takeover/authorize": XhsAccountResponse,
        "/xhs-ops/accounts/{account_id}/takeover/pause": XhsAccountResponse,
        "/xhs-ops/accounts/{account_id}/takeover/device-hold/release": XhsAccountResponse,
        "/xhs-ops/projects/{project_id}/schedule/run-now": XhsScheduleRunNowResponse,
    }
    for path, model in expected.items():
        route = next(route for route in router.routes if route.path == path)
        assert route.response_model is model, path


def test_xhs_source_payload_aliases_are_accepted_by_facade_models() -> None:
    project = ProjectMutation.model_validate(
        {"expectedUpdatedAt": "t1", "opsNotes": {}, "personaCount": 3}
    )
    transfer = TransferBody.model_validate(
        {
            "fromAccountId": "a1",
            "toAccountId": "a2",
            "account": {"id": "a2"},
            "overrideReason": "manual review",
        }
    )
    identity = IdentityConfirmBody.model_validate(
        {
            "identityTaskId": "task-1",
            "platformAccountId": "xhs-1",
            "overrideRead": True,
        }
    )
    assert project.expected_updated_at == "t1"
    assert project.ops_notes == {}
    assert project.persona_count == 3
    assert transfer.from_account_id == "a1"
    assert transfer.to_account_id == "a2"
    assert transfer.override_reason == "manual review"
    assert identity.identity_task_id == "task-1"
    assert identity.platform_account_id == "xhs-1"
    assert identity.override_read is True

    command = CommandBody.model_validate(
        {"accountId": "a1", "expectedUpdatedAt": "t1", "confirmDigest": "d1"}
    )
    assert command.model_dump() == {
        "account_id": "a1",
        "expected_updated_at": "t1",
        "confirm_digest": "d1",
    }


def test_xhs_identity_facade_exposes_pending_and_completed_contract() -> None:
    pending = _identity_response(
        {
            "data": {
                "accounts": [{"id": "a1"}],
                "runs": [
                    {
                        "id": "r1",
                        "task_id": "xhs_r1",
                        "account_id": "a1",
                        "kind": "account_identity",
                        "status": "queued",
                        "created_at": "2026-11-07T00:00:00Z",
                    }
                ],
            }
        },
        "a1",
    )
    assert pending["status"] == "unavailable"
    assert pending["taskId"] == "xhs_r1"

    complete = _identity_response(
        {
            "data": {
                "accounts": [
                    {
                        "id": "a1",
                        "profile_identity": {
                            "status": "visible",
                            "account_id": "xhs-1",
                            "run_id": "r1",
                            "evidence_url": "/api/evidence/r1",
                        },
                    }
                ],
                "runs": [],
            }
        },
        "a1",
    )
    assert complete == {
        "status": "visible",
        "screenshotUrl": "/api/evidence/r1",
        "accountId": "xhs-1",
        "taskId": "r1",
        "reason": "已读到手机上的小红薯号，请对照截图确认",
    }


def test_xhs_account_response_exposes_source_label_alias() -> None:
    account = _source_account({"id": "a1", "name": "生活方式号"})
    assert account is not None
    assert account["id"] == "a1"
    assert account["name"] == "生活方式号"
    assert account["label"] == "生活方式号"
    assert account["entryMode"] == "new"
    assert account["platformAccountId"] == ""


def test_xhs_project_response_exposes_nested_source_defaults() -> None:
    project = _source_project({"id": "p1", "name": "通勤项目"})
    assert project is not None
    assert project["id"] == "p1"
    assert project["business"] == {
        "industry": "",
        "product": "",
        "regions": [],
        "sellingPoints": [],
        "priceBand": "",
        "scene": "",
    }
    assert project["audience"] == {
        "ageRange": "",
        "genderRatio": "",
        "regions": [],
        "occupations": [],
        "spendingPower": "",
        "knownInterests": [],
        "painPoints": [],
    }
    assert project["opsNotes"] == {
        "forbiddenTopics": [],
        "boostKeywords": [],
        "avoidContentTypes": [],
    }
    assert project["profile"] is None
    assert project["schedule"] == {
        "enabled": False,
        "time": "10:00",
        "lastTriggeredDate": None,
        "lastResult": None,
    }
    assert project["personaCount"] == 10
    assert len(_source_projects([{"id": "p1", "name": "通勤项目"}])) == 1


def test_xhs_project_response_normalizes_nested_state_and_schedule_result() -> None:
    project = _source_project(
        {
            "id": "p1",
            "name": "通勤项目",
            "business": {"industry": "服装"},
            "profile": {"summary": "城市通勤", "base": {"regions": ["上海"]}},
            "schedule": {
                "enabled": True,
                "time": "invalid",
                "last_result": {"date": "2026-11-17", "accepted": 2, "skipped": {"hold": 1}},
            },
        }
    )
    assert project is not None
    assert project["business"]["industry"] == "服装"
    assert project["business"]["sellingPoints"] == []
    assert project["profile"] == {
        "summary": "城市通勤",
        "base": {"ageRange": "", "genderRatio": "", "regions": ["上海"]},
        "verticalInterests": [],
        "generalInterests": [],
        "confirmedAt": None,
        "updatedAt": project["updatedAt"],
    }
    assert project["schedule"] == {
        "enabled": True,
        "time": "10:00",
        "lastTriggeredDate": None,
        "lastResult": "2026-11-17：2 个已受理、1 个未派发",
    }


def test_xhs_nested_resources_fill_source_contract_defaults() -> None:
    run = _source_run({"id": "r1", "account_id": "a1", "created_at": "2026-11-07"})
    assert run["accountId"] == "a1"
    assert run["date"] == "2026-11-07"
    assert run["chunks"] == [] and run["summary"] == {}

    audit = _source_audit({"id": "audit-1", "account_id": "a1"})
    assert audit["accountId"] == "a1"
    assert audit["flags"] == [] and audit["profile"] is None

    diagnosis = _source_diagnosis({"id": "diag-1", "account_id": "a1"})
    assert diagnosis["accountId"] == "a1"
    assert diagnosis["proposals"] == [] and diagnosis["generator"]["botId"] == "octop"

    order = _source_change_order({"id": "order-1", "account_id": "a1"})
    assert order["accountId"] == "a1"
    assert order["proposalIds"] == [] and order["fields"] == []


def test_xhs_run_and_change_order_nested_contracts_accept_source_camel_case() -> None:
    run = XhsRunResource.model_validate(
        {
            "id": "r1",
            "accountId": "a1",
            "plan": {"keywords": [{"keyword": "通勤", "count": 2}]},
            "chunks": [
                {
                    "index": 0,
                    "plannedCount": 2,
                    "posts": [{"title": "笔记", "commentsRead": 3}],
                }
            ],
            "summary": {"plannedTotal": 2, "browsedTotal": 1},
        }
    )
    assert run.accountId == "a1"
    assert run.chunks[0].plannedCount == 2
    assert run.chunks[0].posts[0]["commentsRead"] == 3
    assert run.summary["plannedTotal"] == 2

    order = XhsChangeOrderResource.model_validate(
        {
            "id": "co1",
            "accountId": "a1",
            "fields": [{"field": "nickname", "before": "旧", "after": "新"}],
            "precheck": {"confirmDigest": "digest", "drift": []},
        }
    )
    assert order.accountId == "a1"
    assert order.fields[0]["after"] == "新"
    assert order.precheck is not None
    assert order.precheck["confirmDigest"] == "digest"


def test_xhs_audit_and_diagnosis_nested_contracts_preserve_evidence_shapes() -> None:
    audit = XhsAuditResource.model_validate(
        {
            "id": "audit-1",
            "accountId": "a1",
            "profile": {
                "status": "visible",
                "accountMatched": True,
                "evidence": {"taskId": "task-1", "trusted": True},
            },
            "creator": {"views": {"value": 1200, "approx": True}},
        }
    )
    assert audit.profile is not None
    assert audit.profile.accountMatched is True
    assert audit.profile.evidence is not None
    assert audit.profile.evidence.taskId == "task-1"
    assert audit.creator is not None and audit.creator.views is not None
    assert audit.creator.views.value == 1200

    diagnosis = XhsDiagnosisResource.model_validate(
        {
            "id": "diag-1",
            "accountId": "a1",
            "findings": [
                {
                    "id": "F1",
                    "severity": "L1",
                    "summary": "资料待核验",
                    "ruleIds": ["r1"],
                }
            ],
            "generator": {"botId": "octop", "model": "tabby-pro"},
        }
    )
    assert diagnosis.findings[0].id == "F1"
    assert diagnosis.findings[0].ruleIds == ["r1"]
    assert diagnosis.generator["botId"] == "octop"


def test_xhs_project_nested_contract_preserves_strategy_fields() -> None:
    project = XhsProjectResource.model_validate(
        {
            "id": "p1",
            "name": "通勤项目",
            "business": {
                "industry": "服装",
                "regions": ["上海"],
                "sellingPoints": ["轻便"],
            },
            "audience": {
                "ageRange": "25-34",
                "knownInterests": ["通勤"],
                "painPoints": ["搭配困难"],
            },
            "profile": {
                "summary": "城市通勤",
                "base": {"ageRange": "25-34", "regions": ["上海"]},
                "verticalInterests": ["穿搭"],
            },
            "schedule": {"enabled": True, "time": "09:30"},
        }
    )
    assert project.business is not None and not isinstance(project.business, str)
    assert project.business.sellingPoints == ["轻便"]
    assert project.audience is not None and not isinstance(project.audience, str)
    assert project.audience.painPoints == ["搭配困难"]
    assert project.profile is not None and not isinstance(project.profile, str)
    assert project.profile.base is not None
    assert project.schedule is not None and project.schedule.enabled is True


def test_xhs_profile_readback_exposes_field_level_diffs() -> None:
    fields = _source_profile_fields(
        {"status": "read", "values": {"nickname": "现名", "bio": "旧简介"}},
        {"profile_draft": {"nickname": "目标名", "bio": "旧简介"}},
    )
    assert fields[0] == {
        "field": "nickname",
        "comparable": True,
        "phone": "现名",
        "draft": "目标名",
        "differs": True,
    }
    assert fields[1]["differs"] is False
    assert fields[3]["comparable"] is False

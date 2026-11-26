from __future__ import annotations

from octop_harness.security.models import SecurityPolicy

from octop.infra import enterprise_security as es


class Settings:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self.data.get(key)

    def set(self, key: str, value: str) -> None:
        self.data[key] = value


SECURITY = {
    "tool_floors": {"shell.run": "every", "fs.write": "first", "fs.read": "none", "phone": "every"},
    "dlp_rules": [
        {
            "id": "builtin_secrets",
            "name": "密钥与口令",
            "detect": "builtin",
            "pattern": "secrets",
            "action": "redact",
            "scopes": ["cloud"],
        },
        {
            "id": "r_phone",
            "name": "手机号",
            "detect": "builtin",
            "pattern": "phone_cn",
            "action": "redact",
            "scopes": ["cloud"],
        },
        {
            "id": "r_card",
            "name": "银行卡号",
            "detect": "builtin",
            "pattern": "bank_card",
            "action": "block",
            "scopes": ["cloud"],
        },
        {
            "id": "r_contract",
            "name": "合同编号",
            "detect": "regex",
            "pattern": r"XH-\d{8}",
            "action": "log",
            "scopes": ["cloud"],
        },
        {
            "id": "r_audit",
            "name": "项目代号",
            "detect": "keyword",
            "pattern": "北极星，天狼",
            "action": "block",
            "scopes": ["audit"],
        },
    ],
    "skill_scan": {"high_risk": "block", "personal": "warn"},
}


def test_no_rules_leave_the_member_policy_alone() -> None:
    policy = SecurityPolicy.defaults()
    assert es.apply_floor(policy, {}) is policy


def test_floor_adds_approval_and_never_loosens() -> None:
    relaxed = SecurityPolicy.from_dict(
        {"hitl": {"enabled": False}, "pii": {"enabled": False}, "skill_scan": {"mode": "off"}}
    )
    floored = es.apply_floor(relaxed, SECURITY).to_dict()
    assert floored["hitl"]["enabled"] is True
    assert floored["hitl"]["tools"] == ["bash", "execute", "write_file", "edit_file", "delete"]
    assert (
        "read_file" not in floored["hitl"]["tools"]
    )  # the enterprise does not require approval for reads
    assert floored["pii"]["enabled"] is True and floored["skill_scan"]["mode"] == "block"

    strict = SecurityPolicy.from_dict(
        {
            "hitl": {"enabled": True, "tools": ["read_file", "bash"]},
            "pii": {"enabled": True, "strategy": "block"},
        }
    )
    kept = es.apply_floor(
        strict, {**SECURITY, "skill_scan": {"high_risk": "warn", "personal": "off"}}
    ).to_dict()
    assert (
        kept["hitl"]["tools"][:2] == ["read_file", "bash"] and "write_file" in kept["hitl"]["tools"]
    )
    assert kept["pii"]["strategy"] == "block" and kept["skill_scan"]["mode"] == "warn"


def test_scan_redacts_blocks_and_counts_without_keeping_the_match() -> None:
    text, blocked, hits = es.scan_text(
        "联系 13812345678 或 13900001111，合同 XH-20261126，代号北极星", SECURITY
    )
    assert blocked is None
    assert "13812345678" not in text and text.count("[已脱敏·手机号]") == 2
    assert "XH-20261126" in text  # log only
    assert "北极星" in text and "r_audit" not in hits  # that rule does not cover model input
    assert hits == {"r_phone": 2, "r_contract": 1}

    _, blocked, hits = es.scan_text("卡号 6222021234567890123", SECURITY)
    assert blocked == "银行卡号" and hits == {"r_card": 1}
    assert es.scan_text("", SECURITY) == ("", None, {})
    assert es.scan_text(
        "x",
        {
            "dlp_rules": [
                {
                    "id": "bad",
                    "detect": "regex",
                    "pattern": "(",
                    "action": "block",
                    "scopes": ["cloud"],
                }
            ]
        },
    ) == ("x", None, {})


def test_store_reports_changes_and_hits_accumulate_until_taken() -> None:
    settings = Settings()
    assert es.store(settings, SECURITY) is True
    assert es.store(settings, SECURITY) is False
    assert es.load(settings)["tool_floors"]["shell.run"] == "every"
    es.add_hits(settings, {"r_phone": 2})
    es.add_hits(settings, {"r_phone": 1, "r_card": 1})
    assert es.take_hits(settings) == {"r_phone": 3, "r_card": 1}
    assert es.take_hits(settings) == {}
    assert es.store(settings, None) is True and es.load(settings) == {}


def test_processor_rewrites_or_refuses_the_member_message() -> None:
    from types import SimpleNamespace

    from octop_gateway.models import InboundMessage, TextContent

    from octop.infra.gateway.process.processor import GlobalProcessor

    settings = Settings()
    es.store(settings, SECURITY)
    this = SimpleNamespace(_settings_repo=settings)
    msg = InboundMessage(channel_id="c", content=[TextContent(text="我的手机 13812345678")])
    out, blocked = GlobalProcessor._enterprise_dlp(this, msg)  # type: ignore[arg-type]
    assert blocked is None and out.text == "我的手机 [已脱敏·手机号]" and msg.text.endswith("5678")
    _, blocked = GlobalProcessor._enterprise_dlp(  # type: ignore[arg-type]
        this, InboundMessage(channel_id="c", content=[TextContent(text="卡 6222021234567890123")])
    )
    assert blocked == "银行卡号"
    assert es.take_hits(settings) == {"r_phone": 1, "r_card": 1}
    plain = InboundMessage(channel_id="c", content=[TextContent(text="你好")])
    assert GlobalProcessor._enterprise_dlp(SimpleNamespace(_settings_repo=None), plain) == (
        plain,
        None,
    )  # type: ignore[arg-type]

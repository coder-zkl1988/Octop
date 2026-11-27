"""Enterprise security floors on the desktop.

The signed enterprise policy carries tenant-wide rules: which tools need
approval at least, which sensitive information must be handled before a
message leaves this computer, and how strictly skills are scanned. The member
may be stricter than these rules, never looser.
"""

from __future__ import annotations

import fnmatch
import json
import os
import re
from pathlib import Path
from typing import Any

from octop_harness.security.models import DEFAULT_HITL_TOOLS, SecurityPolicy

SETTINGS_KEY = "enterprise_security"
HITS_KEY = "enterprise_security_hits"

# Enterprise tool categories → harness tool names. Categories without a harness
# tool that can pause for approval (connector writes, phone) are not listed.
TOOL_NAMES: dict[str, tuple[str, ...]] = {
    "shell.run": ("bash", "execute"),
    "fs.write": ("write_file", "edit_file", "delete"),
    "fs.read": ("read_file", "ls", "glob", "grep"),
    "browser": ("browser_use", "browser_tool"),
}

_BUILTIN: dict[str, re.Pattern[str]] = {
    "id_card": re.compile(
        r"(?<!\d)[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)"
    ),
    "phone_cn": re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)"),
    "bank_card": re.compile(r"(?<!\d)(?:62|4\d|5[1-5])\d{14,17}(?!\d)"),
    "email": re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"),
    "secrets": re.compile(
        r"(AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{36}|-----BEGIN [A-Z ]*PRIVATE KEY-----)"
    ),
}


def with_caps(security: dict[str, Any] | None, caps: dict[str, Any]) -> dict[str, Any]:
    """Add the directory and command limits of the role policy to the security rules.

    ``cap.fs.roots`` are the folders a workspace may live in (empty means any),
    ``cap.fs.deny_roots`` are always refused, and ``cap.shell.deny_commands``
    are command patterns the shell tools refuse.
    """
    fs_raw, shell_raw = caps.get("cap.fs"), caps.get("cap.shell")
    fs: dict[str, Any] = fs_raw if isinstance(fs_raw, dict) else {}
    shell: dict[str, Any] = shell_raw if isinstance(shell_raw, dict) else {}

    def strings(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    out = dict(security or {})
    for key, value in (
        ("fs_roots", strings(fs.get("roots"))),
        ("fs_deny_roots", strings(fs.get("deny_roots"))),
        ("deny_commands", strings(shell.get("deny_commands"))),
    ):
        if value:
            out[key] = value
        else:
            out.pop(key, None)
    return out


def _expand_root(raw: str) -> str:
    """``~/workspace`` → absolute path, keeping any glob characters."""
    text = raw.strip().replace("\\", "/")
    if text.startswith("~"):
        text = os.path.expanduser(text)
    return text.rstrip("/") or "/"


def _deny_globs(raw: str) -> list[str]:
    root = _expand_root(raw)
    if any(char in root for char in "*?["):
        return [root]
    return [root, f"{root}/**"]


def workspace_dir_allowed(security: dict[str, Any], workspace_dir: str) -> bool:
    """True when ``workspace_dir`` is inside an enterprise root and not under a denied one."""
    try:
        target = Path(os.path.expanduser(workspace_dir.strip())).resolve()
    except (OSError, ValueError):
        return False
    text = target.as_posix()

    def under(raw: str) -> bool:
        base = _expand_root(raw).removesuffix("/**").removesuffix("/*").rstrip("/") or "/"
        if any(char in base for char in "*?["):
            candidates = [text, *(parent.as_posix() for parent in target.parents)]
            return any(fnmatch.fnmatchcase(candidate, base) for candidate in candidates)
        try:
            resolved = Path(base).resolve().as_posix()
        except (OSError, ValueError):
            return False
        return text == resolved or text.startswith(resolved.rstrip("/") + "/")

    if any(under(raw) for raw in security.get("fs_deny_roots") or []):
        return False
    roots = security.get("fs_roots") or []
    return not roots or any(under(raw) for raw in roots)


_COMMAND_SPLIT = re.compile(r"\s*(?:&&|\|\||;|\n)\s*")


def denied_command(command: str, security: dict[str, Any]) -> str | None:
    """Return the enterprise pattern that ``command`` matches, if any.

    Each pattern is a shell-style wildcard (``git push --force*``). The whole
    command and each part joined by ``&&``, ``||``, ``;`` or a newline are checked.
    """
    patterns = [str(p) for p in security.get("deny_commands") or [] if str(p).strip()]
    if not patterns or not command.strip():
        return None
    normalized = " ".join(command.split())
    parts = [normalized, *(" ".join(part.split()) for part in _COMMAND_SPLIT.split(command))]
    for pattern in patterns:
        wanted = " ".join(pattern.split())
        if any(part and fnmatch.fnmatchcase(part, wanted) for part in parts):
            return pattern
    return None


def store(settings: Any, security: dict[str, Any] | None) -> bool:
    """Keep the rules from the latest signed policy. Returns True when they changed."""
    value = json.dumps(security or {}, ensure_ascii=False, sort_keys=True)
    if (settings.get(SETTINGS_KEY) or "{}") == value:
        return False
    settings.set(SETTINGS_KEY, value)
    return True


def load(settings: Any) -> dict[str, Any]:
    try:
        data = json.loads(settings.get(SETTINGS_KEY) or "{}")
    except (TypeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def apply_floor(policy: SecurityPolicy, security: dict[str, Any]) -> SecurityPolicy:
    """Return ``policy`` tightened to the enterprise floor. Never loosens anything."""
    if not security:
        return policy
    data = policy.to_dict()
    floors = security.get("tool_floors") or {}
    needed = [
        name
        for key, names in TOOL_NAMES.items()
        if floors.get(key) in ("every", "first")
        for name in names
    ]
    if needed:
        hitl = data["hitl"]
        current = list(DEFAULT_HITL_TOOLS) if hitl["tools"] == "default" else list(hitl["tools"])
        # A switched-off member setting approves nothing, so only the enterprise tools apply then.
        base = current if hitl["enabled"] else []
        hitl["tools"] = list(dict.fromkeys([*base, *needed]))
        hitl["enabled"] = True
    secrets = next(
        (r for r in security.get("dlp_rules") or [] if r.get("pattern") == "secrets"), None
    )
    if secrets is not None:
        data["pii"]["enabled"] = True
        if secrets.get("action") == "block":
            data["pii"]["strategy"] = "block"
    scan = security.get("skill_scan") or {}
    order = {"off": 0, "warn": 1, "block": 2}
    wanted = (
        "block"
        if scan.get("high_risk") == "block"
        else "warn"
        if scan.get("personal") == "warn"
        else "off"
    )
    if order[wanted] > order.get(data["skill_scan"]["mode"], 1):
        data["skill_scan"]["mode"] = wanted
    deny_paths = [
        glob for raw in security.get("fs_deny_roots") or [] for glob in _deny_globs(str(raw))
    ]
    if deny_paths:
        # Rules are first-match: the enterprise denials go before the member's own rules.
        filesystem = data["filesystem"]
        filesystem["enabled"] = True
        filesystem["rules"] = [
            {"operations": ["read", "write"], "paths": deny_paths, "mode": "deny"},
            *(filesystem.get("rules") or []),
        ]
    return SecurityPolicy.from_dict(data)


def _matcher(rule: dict[str, Any]) -> re.Pattern[str] | None:
    detect, pattern = rule.get("detect"), str(rule.get("pattern") or "")
    if detect == "builtin":
        return _BUILTIN.get(pattern)
    if detect == "keyword":
        words = [re.escape(w.strip()) for w in re.split(r"[,，\n]", pattern) if w.strip()]
        return re.compile("|".join(words)) if words else None
    if detect == "regex":
        try:
            return re.compile(pattern)
        except re.error:
            return None
    return None


def scan_text(text: str, security: dict[str, Any]) -> tuple[str, str | None, dict[str, int]]:
    """Apply the rules that cover content sent to models.

    Returns the text to send, the name of the rule that blocks it (if any) and
    how many times each rule matched. Matched text is never part of the result.
    """
    hits: dict[str, int] = {}
    blocked: str | None = None
    if not text:
        return text, None, hits
    for rule in security.get("dlp_rules") or []:
        if "cloud" not in (rule.get("scopes") or []):
            continue
        matcher = _matcher(rule)
        if matcher is None:
            continue
        count = len(matcher.findall(text))
        if not count:
            continue
        hits[str(rule.get("id"))] = count
        action = rule.get("action")
        if action == "block":
            blocked = blocked or str(rule.get("name") or "敏感信息")
        elif action == "redact":
            text = matcher.sub(f"[已脱敏·{rule.get('name') or '敏感信息'}]", text)
    return text, blocked, hits


def add_hits(settings: Any, hits: dict[str, int]) -> None:
    """Remember hit counts until the next report to the enterprise."""
    if not hits:
        return
    pending = take_hits(settings, clear=False)
    for rule_id, count in hits.items():
        pending[rule_id] = pending.get(rule_id, 0) + count
    settings.set(HITS_KEY, json.dumps(pending))


def take_hits(settings: Any, *, clear: bool = True) -> dict[str, int]:
    try:
        data = json.loads(settings.get(HITS_KEY) or "{}")
    except (TypeError, ValueError):
        data = {}
    pending = (
        {str(k): int(v) for k, v in data.items() if isinstance(v, int)}
        if isinstance(data, dict)
        else {}
    )
    if clear and pending:
        settings.set(HITS_KEY, "{}")
    return pending

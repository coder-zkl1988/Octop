"""Chat tools for 小红薯运营. Each one prepares something through the same commands as the
workbench and returns a card; anything that publishes, sends, or changes an account stays behind
a button the person presses on that card or in the workbench.
"""

import contextlib
import json
from typing import Any
from uuid import uuid4

from octop_harness.plugins import PluginContext

from octop.infra.plugin_apps.contracts import PluginAppError, current_context

ALL = ["xhs.content", "xhs.ops", "xhs.publish", "xhs.comment", "xhs.takeover", "xhs.analytics"]
HUMAN = (
    "发布、评论、回复咨询和资料变更都要用户在卡片或工作台里确认，不要替用户确认，也不要重复调用。"
)


def _card(kind: str, text: str, **data: Any) -> str:
    return json.dumps(
        {
            "octop_ui": {"renderer": "xhs_card", "version": 1},
            "data": {"kind": kind, "url": "/apps/xhs-ops", **data},
            "text": f"{text} {HUMAN}",
        },
        ensure_ascii=False,
    )


def _say(text: str) -> str:
    return json.dumps({"text": text}, ensure_ascii=False)


def _pick(rows: list[dict[str, Any]], name: str, what: str) -> dict[str, Any] | str:
    """Find one row by name. An unclear name comes back as a question for the person, never a guess."""
    wanted = name.strip()
    exact = [r for r in rows if str(r.get("name") or "") == wanted]
    close = exact or [r for r in rows if wanted and wanted in str(r.get("name") or "")]
    if not wanted and len(rows) == 1:
        close = rows
    if len(close) == 1:
        return close[0]
    names = "、".join(str(r.get("name") or r["id"]) for r in rows) or "（还没有）"
    return f"没有找到唯一的{what}“{wanted}”。现有{what}：{names}。请向用户确认是哪一个。"


async def _run(name: str, payload: dict[str, Any]) -> tuple[Any, Any, str]:
    """Run one workbench command; a refusal comes back as text the agent can relay."""
    ctx = current_context.get()
    domain = ctx.host.module(ctx.plugin_id)
    try:
        await domain.command(ctx, name, payload)
    except PluginAppError as exc:
        return ctx, domain, str(exc.args[0] if exc.args else "failed")
    return ctx, domain, ""


def _refused(reason: str) -> str:
    return _say(f"工作台拒绝了这次操作（{reason}）。请把原因告诉用户，不要换一种方式重试。")


async def xhs_workbench() -> str:
    ctx = current_context.get()
    await ctx.require_any(ALL)
    return json.dumps(
        {
            "octop_ui": {"renderer": "xhs_workbench", "version": 1},
            "data": {"url": "/apps/xhs-ops"},
            "text": "小红薯运营工作台：/apps/xhs-ops。发布、养号评论和资料变更需由用户在工作台确认；闲聊类回复仅在企业和成员都开启时自动发送，并在事后通知。",
        },
        ensure_ascii=False,
    )


async def xhs_generate_profile(project: str = "") -> str:
    ctx = current_context.get()
    doc = await ctx.read()
    found = _pick(doc.get("projects", []), project, "项目")
    if isinstance(found, str):
        return _say(found)
    _, _, refused = await _run(
        "profile.generate", {"project_id": found["id"], "version": found["version"]}
    )
    if refused:
        return _refused(refused)
    return _card(
        "profile",
        f"已为「{found['name']}」生成目标画像草稿，等待用户确认。",
        project_id=found["id"],
    )


async def xhs_generate_personas(project: str = "", count: int = 4) -> str:
    ctx = current_context.get()
    doc = await ctx.read()
    found = _pick(doc.get("projects", []), project, "项目")
    if isinstance(found, str):
        return _say(found)
    _, _, refused = await _run(
        "persona.generate",
        {"project_id": found["id"], "version": found["version"], "count": int(count)},
    )
    if refused:
        return _refused(refused)
    return _card(
        "personas",
        f"已为「{found['name']}」生成 {count} 个候选人设，等待用户逐个采用。",
        project_id=found["id"],
    )


async def xhs_prepare_content(instruction: str = "", count: int = 0) -> str:
    ctx, domain, refused = await _run(
        "plan.generate", {"instruction": instruction, **({"count": int(count)} if count else {})}
    )
    if refused:
        return _refused(refused)
    doc = await ctx.read()
    batch = (doc.get("last_plan") or {}).get("id")
    tasks = [t for t in doc.get("content_tasks", []) if t.get("batch_id") == batch]
    drafted = 0
    # Draft the first few so there is something to review; the rest wait in 内容计划.
    for task in tasks[:3]:
        try:
            await domain.command(ctx, "task.generate", {"id": task["id"]})
            drafted += 1
        except PluginAppError:
            break
    return _card(
        "content" if instruction.strip() else "week",
        f"已准备 {len(tasks)} 个内容任务，其中 {drafted} 篇已出草稿，等待用户逐篇审核。",
        batch_id=batch,
    )


async def xhs_organize_material(text: str) -> str:
    ctx = current_context.get()
    domain = ctx.host.module(ctx.plugin_id)
    before = {m["id"] for m in (await ctx.read()).get("materials", [])}
    _, _, refused = await _run(
        "material.save",
        {"kind": "experience", "text": text, "owner": "public", "origin": "spoken"},
    )
    if refused:
        return _refused(refused)
    created = [m for m in (await ctx.read()).get("materials", []) if m["id"] not in before]
    if not created:
        return _refused("material_not_saved")
    # Organizing is a convenience; the saved material stands without it.
    with contextlib.suppress(PluginAppError):
        await domain.command(ctx, "material.organize", {"id": created[0]["id"]})
    return _card(
        "material",
        "素材已保存并整理，归属和使用边界等待用户确认。",
        material_id=created[0]["id"],
    )


async def xhs_check_comments() -> str:
    ctx = current_context.get()
    domain = ctx.host.module(ctx.plugin_id)
    doc = await ctx.read()
    started = 0
    for account in doc.get("accounts", []):
        if not account.get("device_id"):
            continue
        try:
            await domain.command(ctx, "inbox.collect", {"account_id": account["id"]})
            started += 1
        except PluginAppError:
            continue
    return _card(
        "replies",
        f"已安排 {started} 个账号只读读取新评论。闲聊类按规则处理，咨询和意向的回复等待用户审核，负面评价不起草。",
    )


async def xhs_account_alerts(account: str = "") -> str:
    ctx = current_context.get()
    await ctx.require_any(ALL)
    doc = await ctx.read()
    paused = [a for a in doc.get("accounts", []) if a.get("paused")]
    if account.strip() or len(paused) == 1:
        found = _pick(paused, account, "已暂停账号")
        if isinstance(found, str):
            return _say(found)
        return _card(
            "alerts",
            f"「{found['name']}」已暂停，养号和发布都停下了。需要用户本人在手机上处理（例如重新登录），"
            "再在卡片上只读核对小红薯号、确认后才恢复。不要替用户重试登录，也不要换手机或换账号继续。",
            account_id=found["id"],
        )
    return _card(
        "alerts", "这是当前需要用户处理的账号异常。异常账号的自动任务已停下，恢复由用户决定。"
    )


async def xhs_audit_account(account: str = "") -> str:
    ctx = current_context.get()
    await ctx.require("xhs.takeover")
    doc = await ctx.read()
    found = _pick(
        [a for a in doc.get("accounts", []) if a.get("entry_mode") == "existing"],
        account,
        "已有账号",
    )
    if isinstance(found, str):
        return _say(found)
    if not found.get("authorized_at"):
        return _say(
            f"「{found['name']}」还没有授权接管。授权要用户本人在工作台“老号接管”里完成，授权后再来盘点。"
        )
    audits = [a for a in doc.get("audits", []) if a.get("account_id") == found["id"]]
    open_runs = [
        r
        for r in doc.get("runs", [])
        if r.get("account_id") == found["id"]
        and r.get("kind") == "audit"
        and r.get("status") in {"queued", "preparing", "running", "waiting"}
    ]
    pending = [a for a in audits if a.get("status") == "pending_confirmation"]
    if not open_runs and not pending:
        _, _, refused = await _run(
            "run.start",
            {
                "kind": "audit",
                "account_id": found["id"],
                "idempotency_key": f"chat-audit-{uuid4().hex}",
                "confirmed": True,
            },
        )
        if refused:
            return _refused(refused)
    return _card(
        "audit",
        f"已安排手机只读盘点「{found['name']}」的公开资料、可见作品和页面指标，不改动账号。"
        "盘点完成后由用户核对并确认基线，之后才能生成诊断。",
        account_id=found["id"],
    )


async def xhs_diagnose_account(account: str = "") -> str:
    ctx = current_context.get()
    doc = await ctx.read()
    found = _pick(
        [a for a in doc.get("accounts", []) if a.get("entry_mode") == "existing"],
        account,
        "已有账号",
    )
    if isinstance(found, str):
        return _say(found)
    audits = [
        a
        for a in doc.get("audits", [])
        if a.get("account_id") == found["id"] and a.get("status") == "confirmed"
    ]
    if not audits:
        return _card(
            "audit",
            f"「{found['name']}」还没有确认过的审计基线。先完成只读盘点并由用户确认基线，再生成诊断。",
            account_id=found["id"],
        )
    _, _, refused = await _run(
        "diagnosis.generate", {"account_id": found["id"], "audit_id": audits[-1]["id"]}
    )
    if refused:
        return _refused(refused)
    return _card(
        "diagnosis",
        f"已为「{found['name']}」生成诊断，提案等待用户逐项决定。",
        account_id=found["id"],
    )


async def xhs_daily_plan(account: str = "") -> str:
    ctx = current_context.get()
    domain = ctx.host.module(ctx.plugin_id)
    doc = await ctx.read()
    found = _pick(
        [a for a in doc.get("accounts", []) if a.get("device_id")], account, "已绑定手机的账号"
    )
    if isinstance(found, str):
        return _say(found)
    today = domain.daily.today(ctx)
    day = next(
        (
            d
            for d in reversed(doc.get("operation_days", []))
            if d["account_id"] == found["id"] and d["date"] == today
        ),
        None,
    )
    if day is None or day["status"] == "planned":
        saved = found.get("operation_settings") or {}
        _, _, refused = await _run(
            "ops.save",
            {
                "account_id": found["id"],
                "account_version": found["version"],
                "date": today,
                "browse_defaults": saved.get("browse_defaults") or {},
                "interaction": saved.get("interaction") or {},
                **({"id": day["id"], "version": day["version"]} if day else {}),
            },
        )
        if refused:
            return _refused(refused)
        day = next(
            d
            for d in reversed((await ctx.read()).get("operation_days", []))
            if d["account_id"] == found["id"] and d["date"] == today
        )
        _, _, refused = await _run("ops.precheck", {"id": day["id"], "version": day["version"]})
        if refused:
            return _refused(refused)
    return _card(
        "daily",
        f"「{found['name']}」今天的养号计划已生成并预检，等待用户在卡片上确认启动；确认五分钟内有效。",
        day_id=day["id"],
    )


async def xhs_precheck_batch(batch: str = "") -> str:
    ctx = current_context.get()
    doc = await ctx.read()
    found = _pick(
        [b for b in doc.get("batches", []) if b.get("status") in {"draft", "prechecked"}],
        batch,
        "待发布批次",
    )
    if isinstance(found, str):
        return _say(found)
    _, _, refused = await _run("batch.precheck", {"id": found["id"], "version": found["version"]})
    if refused:
        return _refused(refused)
    return _card(
        "batch",
        f"批次「{found['name']}」已预检，等待用户在卡片上确认启动；确认五分钟内有效。",
        batch_id=found["id"],
    )


async def xhs_comment_candidates() -> str:
    ctx = current_context.get()
    domain = ctx.host.module(ctx.plugin_id)
    doc = await ctx.read()
    sources = domain.comments.sources(domain, doc)
    if not sources:
        return _say("最近完成的浏览里没有值得评论的笔记。评论只从已完成浏览的回执里生成。")
    run_id = sources[-1]["run_id"]
    posts = [
        {"chunk_index": s["chunk_index"], "post_index": s["post_index"]}
        for s in sources
        if s["run_id"] == run_id
    ][:3]
    _, _, refused = await _run("comment.generate", {"run_id": run_id, "posts": posts})
    if refused:
        return _refused(refused)
    return _card("comments", "已生成候选评论，等待用户审核；发送前还要在工作台预检并确认。")


def setup(ctx: PluginContext) -> None:
    ctx.tool(
        "xhs_workbench",
        xhs_workbench,
        description="打开小红薯运营工作台，并在对话里显示待审核内容、已自动回复和账号异常。不要直接派发或重复发布；由工作台记录审核和真实手机回执。",
    )
    ctx.tool(
        "xhs_generate_profile",
        xhs_generate_profile,
        description="小红薯 · 生成目标画像。按项目的客户资料生成目标受众画像草稿，并显示确认卡片。project 为项目名称。画像由用户确认，不要替用户确认。",
    )
    ctx.tool(
        "xhs_generate_personas",
        xhs_generate_personas,
        description="小红薯 · 生成候选人设。按已确认的目标画像生成 count 个候选账号人设，并显示卡片。是否采用由用户逐个决定。",
    )
    ctx.tool(
        "xhs_prepare_content",
        xhs_prepare_content,
        description="小红薯 · 生成内容任务 / 准备本周内容。instruction 为用户的推广要求（留空表示按人设、近期发布和素材主动准备本周内容），count 为篇数。只准备任务和草稿，审核、排期和发布由用户确认。",
    )
    ctx.tool(
        "xhs_organize_material",
        xhs_organize_material,
        description="小红薯 · 整理素材。把用户说的一段经历或资料保存为素材并整理出类型、建议账号和使用边界。真实经历只能用于本人账号。",
    )
    ctx.tool(
        "xhs_check_comments",
        xhs_check_comments,
        description="小红薯 · 检查新评论。安排已绑定手机的账号只读读取新评论，并显示已自动回复和待审核回复的卡片。不要代替用户通过回复。",
    )
    ctx.tool(
        "xhs_account_alerts",
        xhs_account_alerts,
        description="小红薯 · 账号异常。显示需要用户处理的账号异常（登录失效、受限等）。account 为已暂停账号名称时显示该账号的异常与重新核对身份卡片。不要尝试恢复或绕过，恢复由用户在卡片上核对后确认。",
    )
    ctx.tool(
        "xhs_audit_account",
        xhs_audit_account,
        description="小红薯 · 只读盘点账号。为已授权接管的已有账号安排一次只读盘点（公开资料、可见作品、页面指标），并显示盘点卡片。确认基线和生成后的方案由用户决定。",
    )
    ctx.tool(
        "xhs_diagnose_account",
        xhs_diagnose_account,
        description="小红薯 · 生成诊断。基于已确认的审计基线为已有账号生成诊断和资料变更提案，并显示卡片。提案由用户逐项决定。",
    )
    ctx.tool(
        "xhs_daily_plan",
        xhs_daily_plan,
        description="小红薯 · 生成今日计划并预检。为一个已绑定手机的账号生成今天的养号计划并预检，显示确认卡片。是否启动由用户在卡片上确认。",
    )
    ctx.tool(
        "xhs_precheck_batch",
        xhs_precheck_batch,
        description="小红薯 · 预检发布批次。预检一个待发布批次并显示确认卡片。是否发布由用户在卡片上确认，不要替用户确认。",
    )
    ctx.tool(
        "xhs_comment_candidates",
        xhs_comment_candidates,
        description="小红薯 · 从已完成浏览生成候选评论。只为已完成浏览里值得评论的笔记生成候选，显示审核卡片；审核和发送由用户决定。",
    )

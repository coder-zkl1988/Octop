"""The tool opens the paid workbench through the same host as HTTP and jobs."""

import json

from octop_harness.plugins import PluginContext

from octop.infra.plugin_apps.contracts import current_context


async def xhs_workbench() -> str:
    ctx = current_context.get()
    await ctx.require_any(
        ["xhs.content", "xhs.ops", "xhs.publish", "xhs.comment", "xhs.takeover", "xhs.analytics"]
    )
    return json.dumps(
        {
            "octop_ui": {"renderer": "xhs_workbench", "version": 1},
            "data": {"url": "/apps/xhs-ops"},
            "text": "小红薯运营工作台：/apps/xhs-ops。发布、养号评论和资料变更需由用户在工作台确认；闲聊类回复仅在企业和成员都开启时自动发送，并在事后通知。",
        },
        ensure_ascii=False,
    )


def setup(ctx: PluginContext) -> None:
    ctx.tool(
        "xhs_workbench",
        xhs_workbench,
        description="打开小红薯运营工作台，并在对话里显示待审核内容、已自动回复和账号异常。不要直接派发或重复发布；由工作台记录审核和真实手机回执。",
    )

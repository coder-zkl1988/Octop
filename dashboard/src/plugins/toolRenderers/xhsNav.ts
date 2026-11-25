import { fireEvent, screen } from "@testing-library/react";

/** Workbench group that holds each tab of the 小红薯运营 page. */
const GROUP_OF: Record<string, string> = {
  总览: "工作台",
  执行队列: "工作台",
  异常与告警: "工作台",
  项目与画像: "建号",
  人设规划: "建号",
  账号与设备: "建号",
  新号资料: "建号",
  老号接管: "建号",
  日常运营: "养号",
  冷启动方案: "养号",
  评论审核: "养号",
  内容计划: "内容",
  创作编辑器: "内容",
  素材库: "内容",
  内容母版: "内容",
  业务资料: "内容",
  排期日历: "发布",
  批量发布: "发布",
  发布与历史: "发布",
  笔记维护: "发布",
  复盘报表: "复盘",
  自动化与风控: "设置",
  授权台账: "设置",
  能力与配额: "设置",
};

/** Open a tab of the grouped workbench navigation: group first, then the tab. */
export async function openXhsTab(name: string): Promise<void> {
  const group = GROUP_OF[name];
  if (!group) throw new Error(`Unknown workbench tab ${name}`);
  fireEvent.click(await screen.findByRole("button", { name: group }));
  fireEvent.click(await screen.findByRole("button", { name }));
}

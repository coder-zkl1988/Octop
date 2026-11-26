import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React, { type ComponentType } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { openXhsTab } from "./xhsNav";
import type {
  OctopPluginUIHost,
  PluginPageProps,
  ToolRenderProps,
} from "./types";

const source = readFileSync(
  resolve(
    process.cwd(),
    "../src/octop/infra/agents/plugins/bundled/xhs-ops/ui/index.js",
  ),
  "utf8",
);
type Row = Record<string, any>;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const ALL = [
  "xhs.content",
  "xhs.publish",
  "xhs.ops",
  "xhs.comment",
  "xhs.takeover",
  "xhs.analytics",
];

function snapshotFor(features: string[], rules: Row = {}): Row {
  const soon = new Date(Date.now() + 3 * 86400_000).toISOString();
  const today = new Date().toISOString();
  return {
    license: {
      status: "active",
      version: 3,
      features,
      limits: { accounts: 10, devices: 5 },
      policy: {
        caps: {
          automation_cap: "semi",
          monthly_posts: 120,
          monthly_images: 600,
          template_scope: ["通用"],
        },
        rules: {
          automation_level: "semi",
          min_interval_hours: 48,
          weekly_max_posts: 4,
          marketing_ratio_max: 40,
          banned_words: ["最"],
          reviewer_name: "王审核",
          auto_reply_enabled: true,
          auto_reply_daily_cap: 20,
          paused: false,
          ...rules,
        },
        usage: {
          month: "2026-11",
          tenant: { posts: 40, images: 100 },
          member: { posts: 12, images: 30 },
        },
        member_quota: { monthly_posts: 30, monthly_images: 100 },
      },
    },
    read_only: false,
    devices: [{ device_id: "phone", name: "测试手机", online: true }],
    data: {
      version: 1,
      projects: [{ id: "p1", name: "通勤穿搭", version: 1 }],
      accounts: [
        {
          id: "a1",
          name: "小鹿",
          project_id: "p1",
          device_id: "phone",
          entry_mode: "new",
        },
        { id: "a2", name: "阿北", project_id: "p1", entry_mode: "existing" },
      ],
      drafts: [
        {
          id: "d1",
          version: 1,
          project_id: "p1",
          account_id: "a1",
          title: "秋天的天坛",
          content: "下午阳光很好",
          hashtags: [],
          images: [],
          source: "ai",
          nature: "life",
          review_status: "pending_review",
          checks: {
            digest: "x",
            blocking: false,
            high_risk: false,
            items: [
              { key: "words", label: "敏感词", level: "ok", detail: "未命中" },
            ],
          },
        },
        {
          id: "d2",
          version: 1,
          project_id: "p1",
          account_id: "a1",
          title: "通勤大衣怎么选",
          content: "三个要点",
          hashtags: [],
          images: [],
          source: "instruction",
          nature: "marketing",
          review_status: "scheduled",
          scheduled_at: soon,
        },
      ],
      content_tasks: [
        {
          id: "t1",
          title: "周末咖啡店",
          source: "ai",
          account_id: "a1",
          nature: "life",
          reason: "生活内容偏少",
          status: "to_make",
        },
      ],
      materials: [
        {
          id: "m1",
          kind: "experience",
          title: "天坛",
          text: "周末去了天坛",
          owner: "account",
          account_ids: ["a1"],
          origin: "spoken",
          status: "active",
          used: 0,
        },
      ],
      biz_docs: [
        {
          id: "b1",
          kind: "project",
          name: "秋冬大衣",
          fields: { 价格: "899" },
          source: "产品部",
        },
      ],
      authorizations: [
        {
          id: "c1",
          version: 1,
          person: "小王",
          role: "employee",
          covers: ["portrait"],
          account_ids: ["a1"],
          usage: "own_account_no_rewrite",
          valid_from: "2026-01-01",
          valid_to: "2027-12-31",
          proof_asset: "授权书.pdf",
          status: "active",
        },
      ],
      reply_items: [
        {
          id: "r1",
          version: 2,
          account_id: "a1",
          note_title: "秋天的天坛",
          author: "路人甲",
          text: "好好看",
          kind: "small_talk",
          draft: "谢谢喜欢",
          status: "sent",
          auto: true,
          sent_text: "谢谢喜欢",
          sent_at: today,
        },
        {
          id: "r2",
          version: 1,
          account_id: "a1",
          note_title: "通勤大衣怎么选",
          author: "路人乙",
          text: "多少钱",
          kind: "question",
          draft: "价格在笔记里",
          status: "new",
        },
      ],
      leads: [],
      member_settings: {
        automation_level: "semi",
        ai_proactive: "weekly",
        max_per_run: 12,
        min_interval_hours: 48,
        weekly_max_posts: 4,
        marketing_ratio_max: 40,
        publish_window: "08:00-22:30",
        profile_change_day: "hold",
        on_publish_failure: "stop",
        my_words: [],
        small_talk: "review",
        reply_wording: "phrases",
        reply_phrases: ["谢谢喜欢"],
        auto_reply_hourly: 5,
        auto_reply_daily: 20,
        notify: "card",
        reply_tone: "persona",
        inbox_cadence: "after_publish",
        daily_minutes_cap: 60,
        resume_mode: "start_stage",
        version: 4,
        paused: false,
        cold_start: [
          {
            name: "起步",
            day_from: 1,
            day_to: 3,
            daily_target_posts: 12,
            segments: 2,
            search_ratio_percent: 60,
            like: [false, 0, 0],
            collect: [false, 0, 0],
          },
        ],
      },
      effective_policy: {
        automation_level: "semi",
        automation_cap: "semi",
        min_interval_hours: 48,
        weekly_max_posts: 4,
        marketing_ratio_max: 40,
        publish_window: "08:00-22:30",
        banned_words: ["最"],
        reviewer_name: "王审核",
        auto_reply: false,
        auto_reply_enterprise: true,
        auto_reply_daily: 20,
        enterprise_paused: false,
        member_paused: false,
        chat_cards: true,
        libraries: ["医疗美容"],
      },
      queue: [
        {
          id: "d2",
          source: "schedule",
          device_id: "phone",
          account_id: "a1",
          kind: "publish",
          at: today,
          status: "awaiting_confirmation",
          title: "通勤大衣怎么选",
        },
      ],
      alerts: [
        {
          id: "paused:a2",
          level: "action",
          account_id: "a2",
          kind: "account",
          code: "account_paused",
          label: "账号已暂停",
          at: today,
        },
      ],
      account_health: [
        {
          account_id: "a1",
          login: "ok",
          nurture_rate: 90,
          publish_ok: 1,
          publish_total: 1,
          publish_unknown: 0,
          notices: [],
          state: "healthy",
        },
      ],
      cold_start_status: { a1: { name: "起步", day: 2 } },
      catalog_cache: {
        fetched_at: today,
        templates: [
          {
            id: "tpl_life",
            name: "生活碎片型",
            kind: "人设类",
            scope: "通用",
            structure: "一段经历 → 一个细节 → 一句感受",
            compliance: "通用",
            available: true,
          },
        ],
      },
      template_submissions: [],
      member_requests: [],
      last_plan: {
        instruction: "多一些生活内容",
        at: today,
        count: 3,
        templates: ["tpl_life"],
      },
      runs: [],
      transfers: {
        items: [
          {
            id: "tr_in",
            direction: "incoming",
            account_id: "x9",
            account_name: "北北的衣橱",
            platform_account_id: "889",
            from_member_name: "林清",
            note: "排期已做完",
            summary: { drafts: 3, materials: 2 },
            status: "approved",
            created_at: today,
          },
        ],
        members: [{ id: "mb_b", name: "阿北" }],
        fetched_at: today,
      },
      operation_clock: { date: "2026-11-25", timezone: "Asia/Shanghai" },
    },
  };
}

function fixture(features = ALL, rules: Row = {}) {
  Object.assign(window, { __OCTOP_REACT__: React });
  let Page: ComponentType<PluginPageProps> | undefined;
  let Renderer: ComponentType<ToolRenderProps> | undefined;
  let Card: ComponentType<ToolRenderProps> | undefined;
  const snapshot = snapshotFor(features, rules);
  const posts: Row[] = [];
  const request = vi.fn(async (path: string, init?: RequestInit) => {
    await Promise.resolve();
    if (path.endsWith("/models")) return [];
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      posts.push(clone(body));
      if (body.command === "reply.save") {
        const item = snapshot.data.reply_items.find(
          (row: Row) => row.id === body.payload.id,
        );
        item.draft = body.payload.draft;
        item.version++;
      }
      if (body.command === "pause.set")
        snapshot.data.member_settings.paused = body.payload.paused;
    }
    return clone(snapshot);
  });
  const host: OctopPluginUIHost = {
    registerPage: (registration) => {
      Page = registration.component;
    },
    registerRenderer: (registration) => {
      if (registration.id === "xhs_card") Card = registration.component;
      else Renderer = registration.component;
    },
    getToolContext: () => ({
      agentId: null,
      threadId: null,
      locale: "zh",
      theme: "light",
    }),
    request: request as OctopPluginUIHost["request"],
    requestBlob: vi.fn(async () => new Blob(["x"])),
    patchResult: vi.fn(),
    openSidePanel: vi.fn(),
    closeSidePanel: vi.fn(),
  };
  const setup = new Function(
    source.replace("export function setup", "function setup") +
      ";return setup;",
  )() as (host: OctopPluginUIHost) => void;
  setup(host);
  if (!Page || !Renderer) throw new Error("Plugin did not register");
  return { snapshot, posts, request, host, Page, Renderer, Card: Card! };
}

function renderPage(features = ALL, rules: Row = {}) {
  const value = fixture(features, rules);
  const { Page, host, snapshot } = value;
  render(<Page host={host} license={snapshot.license} />);
  return value;
}

describe("小红薯运营 workbench", () => {
  it("opens on the overview and renders every workbench tab", async () => {
    renderPage();
    expect(await screen.findByText("系统已为你准备好")).toBeInTheDocument();
    for (const tab of [
      "执行队列",
      "账号档案",
      "异常与告警",
      "冷启动方案",
      "内容计划",
      "素材库",
      "内容母版",
      "业务资料",
      "排期日历",
      "笔记维护",
      "自动化与风控",
      "授权台账",
      "能力与配额",
    ])
      await openXhsTab(tab);
    expect(screen.getAllByText("向管理员申请").length).toBeGreaterThan(0);
  });

  it("approves a prepared draft from the overview", async () => {
    const { posts } = renderPage();
    await screen.findByText("秋天的天坛");
    fireEvent.click(screen.getAllByRole("button", { name: "通过" })[0]);
    await waitFor(() =>
      expect(posts).toContainEqual({
        command: "plan.update",
        payload: { action: "approve", ids: ["d1"] },
      }),
    );
  });

  it("keeps automation levels above the enterprise cap unselectable", async () => {
    const { posts } = renderPage();
    await openXhsTab("自动化与风控");
    expect(screen.getByRole("radio", { name: /全自动/ })).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: "保存" })[0]);
    await waitFor(() =>
      expect(posts.some((p) => p.command === "settings.save")).toBe(true),
    );
    const saved = posts.find((p) => p.command === "settings.save")!.payload;
    expect(saved).toMatchObject({ automation_level: "semi", version: 4 });
    expect(saved).not.toHaveProperty("paused");
    expect(saved).not.toHaveProperty("cold_start");
  });

  it("lists automatic replies afterwards and saves an edited reply before approving", async () => {
    const { posts } = renderPage();
    await openXhsTab("笔记维护");
    expect(
      screen.getByRole("heading", { name: /已自动回复 · 今天/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除回复" }));
    await waitFor(() =>
      expect(posts).toContainEqual({
        command: "reply.delete",
        payload: { id: "r1" },
      }),
    );
    fireEvent.change(screen.getByDisplayValue("价格在笔记里"), {
      target: { value: "价格写在第二张图" },
    });
    fireEvent.click(screen.getByRole("button", { name: "通过并发送" }));
    await waitFor(() =>
      expect(posts).toContainEqual({
        command: "reply.approve",
        payload: { id: "r2", version: 2, handwritten: false },
      }),
    );
    expect(posts).toContainEqual({
      command: "reply.save",
      payload: { id: "r2", version: 1, draft: "价格写在第二张图" },
    });
  });

  it("pauses every automatic task after an explicit confirmation", async () => {
    const { posts } = renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "暂停全部自动任务" }),
    );
    expect(posts.some((p) => p.command === "pause.set")).toBe(false);
    fireEvent.click(screen.getByLabelText("数据回收"));
    fireEvent.click(screen.getByRole("button", { name: "暂停" }));
    await waitFor(() =>
      expect(posts).toContainEqual({
        command: "pause.set",
        payload: { paused: true, scope: ["nurture", "publish", "reply"] },
      }),
    );
    expect(
      await screen.findByRole("button", { name: "恢复自动任务" }),
    ).toBeInTheDocument();
  });

  it("locks tabs that are not assigned to the member", async () => {
    renderPage(["xhs.comment"]);
    await openXhsTab("内容计划");
    expect(screen.getByText(/当前授权未包含此功能/)).toBeInTheDocument();
  });

  it("reports automatic replies in the chat card with a delete action", async () => {
    const { Renderer, host, posts } = fixture();
    render(
      <Renderer
        pluginId="xhs-ops"
        toolName="xhs_workbench"
        status="done"
        args={{}}
        data={{}}
        host={host}
        isStreaming={false}
      />,
    );
    expect(
      await screen.findByText("已自动回复 · 1 条闲聊评论"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除回复" }));
    await waitFor(() =>
      expect(posts).toContainEqual({
        command: "reply.delete",
        payload: { id: "r1" },
      }),
    );
    expect(
      screen.getByRole("button", { name: "打开小红薯运营工作台" }),
    ).toBeInTheDocument();
  });

  it("falls back to the workbench link when the enterprise turns chat cards off", async () => {
    const { Renderer, host, snapshot } = fixture();
    snapshot.data.effective_policy.chat_cards = false;
    render(
      <Renderer
        pluginId="xhs-ops"
        toolName="xhs_workbench"
        status="done"
        args={{}}
        data={{}}
        host={host}
        isStreaming={false}
      />,
    );
    expect(
      await screen.findByRole("button", { name: "打开小红薯运营工作台" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/已自动回复/)).not.toBeInTheDocument();
  });

  it("opens an account's profile from the overview and hands it to a colleague", async () => {
    const { posts } = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "小鹿" }));
    expect(
      await screen.findByRole("heading", { name: /小鹿 · 人设与兴趣池/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /号设档案库/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "转交给同事" }));
    const send = screen.getByRole("button", { name: "发起转交" });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByLabelText("我已确认上面的说明"));
    fireEvent.click(send);
    await waitFor(() =>
      expect(posts).toContainEqual({
        command: "transfer.create",
        payload: {
          account_id: "a1",
          to_member_id: "mb_b",
          note: "",
          confirmed: true,
        },
      }),
    );
    expect(posts).toContainEqual({ command: "transfer.sync", payload: {} });
  });

  it("accepts an incoming account into a new project", async () => {
    const { posts } = renderPage();
    await openXhsTab("账号档案");
    expect(screen.getByText("北北的衣橱")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "接收" }));
    await waitFor(() =>
      expect(posts).toContainEqual({
        command: "transfer.accept",
        payload: { transfer_id: "tr_in", project_id: "", confirmed: true },
      }),
    );
  });

  it("shows a frozen account and lets the sender withdraw the transfer", async () => {
    const value = fixture();
    value.snapshot.data.accounts[0].transfer = {
      id: "tr_out",
      status: "pending_approval",
      to_member_name: "阿北",
    };
    render(<value.Page host={value.host} license={value.snapshot.license} />);
    await openXhsTab("账号档案");
    expect(screen.getByText("正在转交给 阿北")).toBeInTheDocument();
    expect(screen.getByText("待管理员审批")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "转交给同事" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "撤回转交" }));
    await waitFor(() =>
      expect(value.posts).toContainEqual({
        command: "transfer.cancel",
        payload: { transfer_id: "tr_out" },
      }),
    );
  });

  it("decides takeover proposals one by one before confirming the plan", async () => {
    const value = fixture();
    value.snapshot.data.diagnoses = [
      {
        id: "dg1",
        account_id: "a1",
        status: "draft",
        summary: "简介偏官方",
        proposals: [
          { id: "p1", field: "bio", after: "每周一套通勤穿搭", risk: "L1" },
          { id: "p2", field: "nickname", after: "新昵称", risk: "L2" },
        ],
        recommendations: ["通勤包怎么选"],
      },
    ];
    render(<value.Page host={value.host} license={value.snapshot.license} />);
    await openXhsTab("老号接管");
    const confirm = await screen.findByRole("button", { name: "确认方案" });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: "采纳" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "不采纳" })[1]);
    expect(confirm).toBeDisabled();
    fireEvent.click(
      screen.getByLabelText("我已逐项核对提案，理解每项的观察期"),
    );
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(value.posts).toContainEqual({
        command: "diagnosis.confirm",
        payload: { id: "dg1", confirmed: true },
      }),
    );
    expect(value.posts).toContainEqual({
      command: "diagnosis.decisions",
      payload: {
        id: "dg1",
        decisions: { p1: { decision: "adopt" }, p2: { decision: "skip" } },
        confirmed: true,
      },
    });
  });

  it("shows a generated audience profile in chat and confirms it only on a click", async () => {
    const { Card, host, posts, snapshot } = fixture();
    snapshot.data.projects[0].profile = {
      summary: "通勤时间长的职场女性",
      base: {
        age_range: "25–34 岁",
        gender_ratio: "女 90%",
        regions: ["上海"],
      },
      vertical_interests: ["通勤穿搭"],
      general_interests: ["咖啡"],
      confirmed_at: null,
    };
    const project = snapshot.data.projects[0];
    render(
      <Card
        pluginId="xhs-ops"
        toolName="xhs_generate_profile"
        status="done"
        args={{}}
        data={{ kind: "profile", project_id: project.id }}
        host={host}
        isStreaming={false}
      />,
    );
    expect(
      await screen.findByText(`目标画像确认 · ${project.name}`),
    ).toBeInTheDocument();
    expect(screen.getByText("需要你确认")).toBeInTheDocument();
    expect(posts).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "确认画像" }));
    await waitFor(() =>
      expect(posts).toContainEqual({
        command: "profile.confirm",
        payload: expect.objectContaining({
          project_id: project.id,
          version: project.version,
          confirmed: true,
        }),
      }),
    );
  });

  it("falls back to the workbench link for a card it cannot show", async () => {
    const { Card, host } = fixture();
    render(
      <Card
        pluginId="xhs-ops"
        toolName="xhs_generate_personas"
        status="done"
        args={{}}
        data={{ kind: "personas", project_id: "missing" }}
        host={host}
        isStreaming={false}
      />,
    );
    expect(
      await screen.findByRole("button", { name: "打开小红薯运营工作台" }),
    ).toBeInTheDocument();
  });
});

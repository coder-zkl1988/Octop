import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React, { type ComponentType } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { openXhsTab } from "./xhsNav";
import type { OctopPluginUIHost, PluginPageProps } from "./types";

const source = readFileSync(
  resolve(
    process.cwd(),
    "../src/octop/infra/agents/plugins/bundled/xhs-ops/ui/index.js",
  ),
  "utf8",
);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const interaction = {
  like: { enabled: true, daily_cap: 5, ratio_percent: 10, target_types: [] },
  collect: { enabled: false, daily_cap: 2, ratio_percent: 3, target_types: [] },
  follow: { enabled: false, daily_cap: 0, ratio_percent: 0, target_types: [] },
  comment: { enabled: false, daily_cap: 2 },
};
const plan = {
  kind: "browse",
  keywords: [{ keyword: "运动", count: 2 }],
  home_feed_count: 0,
  dwell_sec_min: 11,
  dwell_sec_max: 25,
  interaction,
  segment: null,
};
type State = Record<string, any>;

function fixture(features = ["xhs.ops"], readOnly = false) {
  Object.assign(window, { __OCTOP_REACT__: React });
  let Page: ComponentType<PluginPageProps> | undefined;
  const snapshot: State = {
    license: { status: readOnly ? "revoked" : "active", version: 7, features },
    read_only: readOnly,
    devices: [{ device_id: "phone1", online: true, running_task_id: null }],
    data: {
      version: 1,
      operation_clock: { date: "2026-11-04", timezone: "Asia/Shanghai" },
      projects: [
        {
          id: "p1",
          version: 1,
          name: "项目一",
          schedule: { enabled: true, time: "10:00" },
        },
      ],
      accounts: [
        {
          id: "a1",
          version: 3,
          project_id: "p1",
          name: "训练账号",
          device_id: "phone1",
          platform_account_id: "xhs-target",
          operation_settings: {
            version: 2,
            browse_defaults: { daily_target_posts: 2, daily_segments: 1 },
            interaction: clone(interaction),
          },
        },
      ],
      operation_days: [
        {
          id: "day1",
          version: 4,
          account_id: "a1",
          project_id: "p1",
          date: "2026-11-04",
          round: 1,
          status: "planned",
          account_snapshot: {
            platform_account_id: "xhs-target",
            device_id: "phone1",
            version: 3,
          },
          browse_defaults: { daily_target_posts: 2, daily_segments: 1 },
          interaction: clone(interaction),
          plans: [clone(plan)],
        },
      ],
      runs: [],
      run_notes: [],
      drafts: [],
      batches: [],
      persona_candidates: [],
    },
  };
  const posts: State[] = [];
  const request = vi.fn(async (path?: string, init?: RequestInit) => {
    await Promise.resolve();
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      posts.push(clone(body));
      const payload = body.payload;
      const day = snapshot.data.operation_days.find(
        (row: State) => row.id === payload.id,
      );
      if (body.command === "ops.configure") {
        snapshot.data.accounts[0].operation_settings = {
          version: payload.version + 1,
          browse_defaults: clone(payload.browse_defaults),
          interaction: clone(payload.interaction),
        };
      } else if (body.command === "ops.save") {
        if (payload.new_round) {
          snapshot.data.operation_days.push({
            ...clone(snapshot.data.operation_days.at(-1)),
            id: "day2",
            version: 1,
            round: 2,
            status: "planned",
            plans: clone([plan]),
            precheck: null,
          });
        } else {
          day.plans = clone(payload.plans || [plan]);
          day.version++;
          day.precheck = null;
        }
      } else if (body.command === "ops.precheck") {
        if (
          snapshot.data.runs.some(
            (run: State) => run.day_id === day.id && run.status === "unknown",
          )
        ) {
          throw new Error(
            JSON.stringify({
              error: {
                details: { reason: "operation_reconciliation_required" },
              },
            }),
          );
        }
        day.precheck = {
          digest: "frozen-" + day.version,
          expires_at: "2099-01-01T00:00:00Z",
          license_version: 7,
          resume_run_ids: day.status === "stopped_unverified" ? ["unsent"] : [],
        };
      } else if (body.command === "ops.start") {
        day.status = "queued";
      } else if (body.command === "ops.reconcile") {
        day.status = "stopped_unverified";
        snapshot.data.runs.forEach((run: State) => {
          run.status = "stopped_unverified";
        });
      } else if (body.command === "run.cancel") {
        snapshot.data.runs.find(
          (run: State) => run.id === payload.run_id,
        ).status = "stopped_unverified";
      } else if (body.command === "schedule.save") {
        snapshot.data.projects[0].schedule = clone(payload);
      } else if (body.command === "run.note") {
        snapshot.data.run_notes = [
          {
            run_id: payload.run_id,
            version: payload.version + 1,
            notes: payload.notes,
          },
        ];
      }
      snapshot.data.version++;
      return clone(snapshot);
    }
    if (path?.endsWith("/models")) return [];
    return clone(snapshot);
  });
  const host: OctopPluginUIHost = {
    registerPage: (registration) => {
      Page = registration.component;
    },
    registerRenderer: vi.fn(),
    getToolContext: () => ({
      agentId: null,
      threadId: null,
      locale: "zh",
      theme: "light",
    }),
    request: request as OctopPluginUIHost["request"],
    requestBlob: vi.fn(async () => new Blob(["proof"])),
    patchResult: vi.fn(),
    openSidePanel: vi.fn(),
    closeSidePanel: vi.fn(),
  };
  const setup = new Function(
    source.replace("export function setup", "function setup") +
      ";return setup;",
  )() as (host: OctopPluginUIHost) => void;
  setup(host);
  if (!Page) throw new Error("No registered page");
  const view = render(<Page host={host} license={snapshot.license} />);
  return { snapshot, posts, request, host, unmount: view.unmount };
}
async function openOperations() {
  await openXhsTab("日常运营");
  fireEvent.change(screen.getByLabelText("运营账号"), {
    target: { value: "a1" },
  });
  await screen.findByLabelText("第1段关键词1");
}

describe("XHS daily operations through the registered workbench", () => {
  it("saves edits before precheck and requires an acknowledgement of the exact frozen plan", async () => {
    const { snapshot, posts } = fixture();
    await openOperations();
    fireEvent.change(screen.getByLabelText("第1段关键词1"), {
      target: { value: "训练" },
    });
    expect(screen.getByRole("button", { name: "预检当前计划" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "保存编辑后的计划" }));
    await waitFor(() =>
      expect(posts.some((post) => post.command === "ops.save")).toBe(true),
    );
    expect(posts[0]).toMatchObject({
      command: "ops.save",
      payload: {
        id: "day1",
        version: 4,
        plans: [{ keywords: [{ keyword: "训练", count: 2 }] }],
      },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "预检当前计划" }),
      ).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "预检当前计划" }));
    const start = await screen.findByRole("button", {
      name: "确认启动日常运营",
    });
    expect(start).toBeDisabled();
    expect(screen.getByText("确认摘要：frozen-5")).toBeInTheDocument();
    snapshot.data.operation_days[0].version = 99;
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "我已核对目标小红薯号、手机、每段计划与互动预算",
      }),
    );
    fireEvent.click(start);
    await waitFor(() =>
      expect(posts.some((post) => post.command === "ops.start")).toBe(true),
    );
    expect(posts.find((post) => post.command === "ops.start")).toEqual({
      command: "ops.start",
      payload: {
        id: "day1",
        version: 5,
        confirm_digest: "frozen-5",
        confirmed: true,
      },
    });
  });

  it("clears confirmation when the displayed plan is edited", async () => {
    const { posts } = fixture();
    await openOperations();
    fireEvent.click(screen.getByRole("button", { name: "预检当前计划" }));
    await screen.findByRole("button", { name: "确认启动日常运营" });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "我已核对目标小红薯号、手机、每段计划与互动预算",
      }),
    );
    fireEvent.change(screen.getByLabelText("第1段关键词1篇数"), {
      target: { value: "3" },
    });
    expect(
      screen.queryByRole("button", { name: "确认启动日常运营" }),
    ).not.toBeInTheDocument();
    expect(posts.some((post) => post.command === "ops.start")).toBe(false);
  });

  it("saves account settings with its independent version and keeps zero budgets visible", async () => {
    const { posts } = fixture();
    await openOperations();
    expect(screen.getByLabelText("账号关注每日上限")).toHaveValue(0);
    fireEvent.change(screen.getByLabelText("账号点赞每日上限"), {
      target: { value: "3" },
    });
    expect(screen.getByRole("button", { name: "生成今日计划" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "保存运营预算" }));
    await waitFor(() =>
      expect(posts.some((post) => post.command === "ops.configure")).toBe(true),
    );
    expect(posts[0]).toMatchObject({
      command: "ops.configure",
      payload: {
        account_id: "a1",
        account_version: 3,
        version: 2,
        interaction: { like: { daily_cap: 3 } },
      },
    });
  });

  it("reconciles unknown work before recovering only the unstarted portion", async () => {
    const { snapshot, posts } = fixture();
    snapshot.data.operation_days[0].status = "interrupted";
    snapshot.data.runs = [
      {
        id: "old",
        kind: "nurture",
        day_id: "day1",
        account_id: "a1",
        status: "unknown",
        chunks: [],
      },
    ];
    const prompt = vi
      .spyOn(window, "prompt")
      .mockReturnValue("已在当前手机核对任务停止");
    try {
      await openOperations();
      fireEvent.click(screen.getByRole("button", { name: "预检未执行部分" }));
      await screen.findByText(
        "存在结果不明或未结束任务，请先确认手机状态并对账。",
      );
      fireEvent.click(
        screen.getByRole("button", { name: "确认本日手机任务已停止" }),
      );
      await waitFor(() =>
        expect(posts.some((post) => post.command === "ops.reconcile")).toBe(
          true,
        ),
      );
      expect(posts.find((post) => post.command === "ops.reconcile")).toEqual({
        command: "ops.reconcile",
        payload: {
          id: "day1",
          version: 4,
          reference: "已在当前手机核对任务停止",
          confirmed: true,
        },
      });
      await waitFor(() =>
        expect(snapshot.data.operation_days[0].status).toBe(
          "stopped_unverified",
        ),
      );
      fireEvent.click(screen.getByRole("button", { name: "预检未执行部分" }));
      expect(
        await screen.findByText("本次恢复 1 个含未派发块的分段。"),
      ).toBeInTheDocument();
      expect(posts.some((post) => post.command === "run.start")).toBe(false);
    } finally {
      prompt.mockRestore();
    }
  });

  it("keeps stopping available while a revoked license disables new execution", async () => {
    const { snapshot, posts } = fixture([], true);
    snapshot.data.operation_days[0].status = "queued";
    snapshot.data.runs = [
      {
        id: "active",
        kind: "nurture",
        day_id: "day1",
        status: "running",
        chunks: [],
      },
    ];
    await openOperations();
    expect(screen.getByRole("button", { name: "生成今日计划" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "停止此分段" }));
    await waitFor(() =>
      expect(posts).toContainEqual({
        command: "run.cancel",
        payload: { run_id: "active" },
      }),
    );
    expect(posts.some((post) => post.command === "ops.start")).toBe(false);
  });

  it("creates an explicit next round while leaving the completed plan in history", async () => {
    const { snapshot, posts } = fixture();
    snapshot.data.operation_days[0].status = "completed";
    snapshot.data.operation_days[0].target_met = true;
    await openOperations();
    fireEvent.click(screen.getByRole("button", { name: "新建下一轮" }));
    await waitFor(() =>
      expect(posts.some((post) => post.command === "ops.save")).toBe(true),
    );
    expect(posts[0].payload).toMatchObject({
      id: "day1",
      version: 4,
      new_round: true,
      date: "2026-11-04",
    });
    expect(snapshot.data.operation_days[0].status).toBe("completed");
    expect(snapshot.data.operation_days[1].round).toBe(2);
  });

  it("does not silently upgrade the old sampler when enabling a daily schedule", async () => {
    const { posts, snapshot } = fixture();
    snapshot.data.projects[0].schedule.last_result = {
      date: "2026-11-04",
      accepted: 1,
      skipped: { device_busy: 2 },
    };
    await openXhsTab("项目与画像");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      const checkbox = await screen.findByRole("checkbox", {
        name: "启用定时运营",
      });
      expect(checkbox).not.toBeChecked();
      expect(screen.getByText(/旧采样计划已停止自动执行/)).toBeInTheDocument();
      expect(
        screen.getByText(/已受理 1 个账号，实际完成情况/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/2 个账号暂未受理：手机仍被任务占用/),
      ).toBeInTheDocument();
      fireEvent.click(checkbox);
      await waitFor(() =>
        expect(posts.some((post) => post.command === "schedule.save")).toBe(
          true,
        ),
      );
      expect(posts[0].payload).toMatchObject({
        project_id: "p1",
        kind: "daily",
        confirmed: true,
        enabled: true,
      });
    } finally {
      confirm.mockRestore();
    }
  });
});

function reportWindow(keyword: string, browsed: number): State {
  return {
    date: "2026-11-04",
    timezone: "Asia/Shanghai",
    dates: ["2026-11-04"],
    accounts: [
      {
        account_id: "a1",
        project_id: "p1",
        exists: true,
        cells: [
          {
            date: "2026-11-04",
            runs: 1,
            browsed,
            planned: 8,
            unresolved_chunks: 1,
            receipt_chunks: 1,
            run_ids: ["r1"],
          },
        ],
      },
    ],
    totals: {
      runs: 1,
      planned: 8,
      browsed,
      like: 1,
      collect: 0,
      follow: 0,
      unresolved_chunks: 1,
    },
    keywords: [
      {
        keyword,
        browsed,
        planned: 8,
        interactions: 1,
        unresolved_chunks: 1,
        verdict: "unknown",
      },
    ],
    home: { browsed: 0, interactions: 0, observations: 0 },
    anomalies: [],
  };
}
describe("XHS evidence reports", () => {
  it("uses the matching server date/project window and saves a versioned note without starting a task", async () => {
    const { snapshot, posts } = fixture(["xhs.analytics"]);
    snapshot.data.accounts = [];
    const week = reportWindow("近七日词", 2);
    const fortnight = reportWindow("近十四日词", 4);
    const project = reportWindow("项目二词", 1);
    snapshot.data.reports = {
      ...week,
      windows: { 7: week, 14: fortnight, 30: fortnight },
      projects: {
        p1: { ...week, windows: { 7: week, 14: fortnight } },
        p2: { ...project, windows: { 7: project, 14: project } },
      },
    };
    snapshot.data.runs = [{ id: "r1", kind: "nurture", status: "unknown" }];
    await openXhsTab("复盘报表");
    expect(await screen.findByText("近七日词")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "最近14天" }));
    expect(screen.getByText("近十四日词")).toBeInTheDocument();
    expect(screen.queryByText("近七日词")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("复盘项目"), {
      target: { value: "p2" },
    });
    expect(screen.getByText("项目二词")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "账号1 2026-11-04 运行明细" }),
    );
    fireEvent.change(screen.getByLabelText("运营备注 · r1"), {
      target: { value: "继续只读观察推荐流" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存运营备注" }));
    await waitFor(() =>
      expect(posts).toContainEqual({
        command: "run.note",
        payload: { run_id: "r1", version: 0, notes: "继续只读观察推荐流" },
      }),
    );
    expect(
      posts.some((post) =>
        ["ops.start", "run.start", "comment.send"].includes(post.command),
      ),
    ).toBe(false);
  });
});

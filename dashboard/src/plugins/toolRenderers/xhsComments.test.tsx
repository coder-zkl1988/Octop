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
type Row = Record<string, any>;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function fixture(status = "pending", readOnly = false) {
  Object.assign(window, { __OCTOP_REACT__: React });
  Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:comment-evidence"),
    revokeObjectURL: vi.fn(),
  });
  let Page: ComponentType<PluginPageProps> | undefined;
  const item: Row = {
    id: "c1",
    version: 1,
    account_id: "a1",
    post: { title: "通勤穿搭", author: "作者甲", summary: "清爽配色" },
    post_url: "",
    candidates: ["配色好清爽", "口袋很实用"],
    text: status === "pending" ? "" : "配色好清爽",
    status,
    review_note: "",
    ...(status === "sending" ||
    status === "awaiting_verification" ||
    status === "unknown"
      ? { sent_run_id: "r1" }
      : {}),
  };
  const snapshot: Row = {
    license: {
      status: readOnly ? "revoked" : "active",
      version: 7,
      features: readOnly ? [] : ["xhs.comment"],
      read_features: ["xhs.comment"],
    },
    read_only: readOnly,
    devices: [],
    data: {
      version: 1,
      projects: [],
      accounts: [
        { id: "a1", name: "训练账号", project_id: "p1", device_id: "phone" },
      ],
      comments: [item],
      comment_clock: { date: "2026-11-04", timezone: "Asia/Shanghai" },
      comment_sources: [
        {
          id: "s1",
          run_id: "b1",
          account_id: "a1",
          chunk_index: 2,
          post_index: 3,
          post: { title: "另一篇穿搭", author: "作者乙", summary: "口袋细节" },
        },
      ],
      comment_quotas: [
        {
          account_id: "a1",
          enabled: true,
          today_browsed: 16,
          cap: 2,
          sent_today: 0,
          approved_pending: status === "approved" ? 1 : 0,
          remaining: status === "approved" ? 1 : 2,
        },
      ],
      runs: item.sent_run_id
        ? [
            {
              id: "r1",
              kind: "comment",
              status: status === "sending" ? "running" : status,
              account_id: "a1",
              device_id: "phone",
              evidence_url: "/api/plugin-apps/xhs-ops/evidence/r1",
            },
          ]
        : [],
    },
  };
  const posts: Row[] = [];
  let previewCounter = 0;
  const request = vi.fn(async (path: string, init?: RequestInit) => {
    await Promise.resolve();
    if (path.endsWith("/models"))
      return [
        { id: "enterprise:writer", name: "Writer", source: "enterprise" },
      ];
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      posts.push(clone(body));
      const payload = body.payload;
      const current = snapshot.data.comments.find(
        (row: Row) => row.id === payload.id,
      );
      if (body.command === "comment.review") {
        current.text = payload.text || current.text;
        current.status = payload.decision;
        current.version++;
      }
      if (body.command === "comment.precheck")
        current.precheck = {
          digest: `exact-comment-preview-${++previewCounter}`,
          license_version: snapshot.license.version,
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        };
      if (body.command === "comment.send") {
        current.status = "sending";
        current.version++;
        current.sent_run_id = "r1";
        snapshot.data.runs = [
          {
            id: "r1",
            kind: "comment",
            status: "queued",
            account_id: "a1",
            device_id: "phone",
          },
        ];
      }
      if (body.command === "comment.reopen") {
        current.status = "pending";
        current.version++;
        current.precheck = null;
      }
      if (body.command === "comment.reconcile") {
        current.version++;
        snapshot.data.runs[0].status = "stopped_unverified";
      }
      if (body.command === "comment.verify") {
        current.status = "sent";
        current.version++;
      }
    }
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
    requestBlob: vi.fn(async () => new Blob(["screenshot"])),
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
  render(<Page host={host} license={snapshot.license} />);
  return { snapshot, posts, request, host };
}
async function openComments() {
  await openXhsTab("评论审核");
}

describe("paid comment review through the actual plugin page", () => {
  it("passes selected verified post coordinates and the authorized text model", async () => {
    const { posts } = fixture();
    await openComments();
    fireEvent.change(screen.getByLabelText("生成模型"), {
      target: { value: "enterprise:writer" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "另一篇穿搭 · 作者乙" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "生成所选候选" }));
    await waitFor(() =>
      expect(posts).toContainEqual({
        command: "comment.generate",
        payload: {
          run_id: "b1",
          posts: [{ chunk_index: 2, post_index: 3 }],
          model_ref: "enterprise:writer",
        },
      }),
    );
    expect(posts.some((p) => p.command === "comment.send")).toBe(false);
  });

  it("keeps candidate selection and manual rewrites separate from approval and send", async () => {
    const { posts } = fixture();
    await openComments();
    fireEvent.click(screen.getByRole("button", { name: "口袋很实用" }));
    expect(screen.getByLabelText("最终评论")).toHaveValue("口袋很实用");
    expect(posts).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("审核备注"), {
      target: { value: "已核对笔记具体内容" },
    });
    fireEvent.click(screen.getByRole("button", { name: "审核通过" }));
    await waitFor(() =>
      expect(posts[0]).toEqual({
        command: "comment.review",
        payload: {
          id: "c1",
          version: 1,
          decision: "approved",
          text: "口袋很实用",
          note: "已核对笔记具体内容",
        },
      }),
    );
    expect(posts.some((p) => p.command === "comment.send")).toBe(false);
  });

  it("requires an acknowledgement of the exact preview and clears it on recheck", async () => {
    const { posts } = fixture("approved");
    await openComments();
    fireEvent.click(screen.getByRole("button", { name: "预检发送" }));
    const send = await screen.findByRole("button", { name: "确认发送一次" });
    expect(send).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "我已核对账号、目标笔记和评论原文",
      }),
    );
    expect(send).not.toBeDisabled();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "预检发送" }),
      ).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "预检发送" }));
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", {
          name: "我已核对账号、目标笔记和评论原文",
        }),
      ).not.toBeChecked(),
    );
    expect(send).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "我已核对账号、目标笔记和评论原文",
      }),
    );
    fireEvent.click(send);
    await waitFor(() =>
      expect(posts).toContainEqual({
        command: "comment.send",
        payload: {
          id: "c1",
          version: 1,
          confirmed: true,
          confirm_digest: "exact-comment-preview-2",
        },
      }),
    );
  });

  it("saves a manual target as a draft without approval or dispatch", async () => {
    const { posts } = fixture();
    await openComments();
    fireEvent.change(screen.getByLabelText("评论账号"), {
      target: { value: "a1" },
    });
    fireEvent.change(screen.getByLabelText("笔记标题"), {
      target: { value: "另一个唯一标题" },
    });
    fireEvent.change(screen.getByLabelText("笔记作者"), {
      target: { value: "作者丙" },
    });
    fireEvent.change(screen.getByLabelText("手写评论（2–10字）"), {
      target: { value: "构图很舒服" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存评论草稿" }));
    await waitFor(() =>
      expect(posts[0]).toMatchObject({
        command: "comment.save",
        payload: {
          account_id: "a1",
          post: { title: "另一个唯一标题", author: "作者丙" },
          text: "构图很舒服",
        },
      }),
    );
    expect(posts).toHaveLength(1);
  });

  it("requires viewed evidence and three explicit checks even in revoked history", async () => {
    const { posts, host } = fixture("awaiting_verification", true);
    await openComments();
    const verify = screen.getByRole("button", { name: "确认实际评论" });
    expect(verify).toBeDisabled();
    expect(screen.getByRole("button", { name: "只读回查评论" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "查看评论核验截图" }));
    await waitFor(() =>
      expect(host.requestBlob).toHaveBeenCalledWith(
        "/plugin-apps/xhs-ops/evidence/r1",
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: "本人账号一致" }),
      ).not.toBeDisabled(),
    );
    for (const name of [
      "本人账号一致",
      "目标笔记一致",
      "本人评论原文已实际可见",
    ])
      fireEvent.click(screen.getByRole("checkbox", { name }));
    fireEvent.change(screen.getByLabelText("核验记录"), {
      target: { value: "已在本人手机原笔记下确认" },
    });
    fireEvent.click(verify);
    await waitFor(() =>
      expect(posts[0]).toMatchObject({
        command: "comment.verify",
        payload: {
          id: "c1",
          version: 1,
          confirmed: true,
          account_checked: true,
          post_checked: true,
          text_checked: true,
          evidence_url: "/api/plugin-apps/xhs-ops/evidence/r1",
        },
      }),
    );
  });

  it("keeps stopping available after revocation and routes unknown recovery through comments", async () => {
    const { posts } = fixture("sending", true);
    await openComments();
    fireEvent.click(screen.getByRole("button", { name: "停止评论任务" }));
    await waitFor(() =>
      expect(posts[0]).toEqual({
        command: "run.cancel",
        payload: { run_id: "r1" },
      }),
    );
    expect(
      posts.some(
        (p) => p.command === "run.verify" || p.command === "comment.send",
      ),
    ).toBe(false);
  });

  it("keeps takeover authorization under its own entitlement without comment access", async () => {
    const { snapshot, posts } = fixture();
    snapshot.license.features = ["xhs.takeover"];
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      await openXhsTab("老号接管");
      fireEvent.change(screen.getByRole("combobox", { name: "" }), {
        target: { value: "a1" },
      });
      fireEvent.click(screen.getByRole("button", { name: "授权人工接管" }));
      await waitFor(() =>
        expect(posts[0]).toEqual({
          command: "takeover.authorize",
          payload: { account_id: "a1", confirmed: true },
        }),
      );
      expect(posts.some((post) => post.command.startsWith("comment."))).toBe(
        false,
      );
    } finally {
      confirm.mockRestore();
    }
  });

  it("reconciles unknown work before initiating a read-only check", async () => {
    const { posts } = fixture("unknown");
    const prompt = vi
      .spyOn(window, "prompt")
      .mockReturnValue("手机任务已经停止");
    try {
      await openComments();
      expect(
        screen.getByRole("button", { name: "只读回查评论" }),
      ).toBeDisabled();
      fireEvent.click(
        screen.getByRole("button", { name: "记录手机任务已停止" }),
      );
      await waitFor(() =>
        expect(posts[0]).toMatchObject({
          command: "comment.reconcile",
          payload: {
            id: "c1",
            version: 1,
            confirmed: true,
            reference: "手机任务已经停止",
          },
        }),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "只读回查评论" }),
        ).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole("button", { name: "只读回查评论" }));
      await waitFor(() =>
        expect(posts[1]).toEqual({
          command: "comment.inspect",
          payload: { id: "c1", version: 2, confirmed: true },
        }),
      );
    } finally {
      prompt.mockRestore();
    }
  });
});

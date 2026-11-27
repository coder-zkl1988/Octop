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

function fixture(features = ["xhs.content", "xhs.ops"]) {
  Object.assign(window, { __OCTOP_REACT__: React });
  let Page: ComponentType<PluginPageProps> | undefined;
  const snapshot = {
    data: {
      version: 1,
      projects: [
        {
          id: "p1",
          version: 3,
          name: "通勤项目",
          business: "原客户业务",
          audience: "原受众说明",
          ops_notes: { forbidden_topics: ["折扣"] },
          profile: {
            summary: "城市通勤人群",
            base: {
              age_range: "25–34",
              gender_ratio: "均衡",
              regions: ["上海"],
            },
            vertical_interests: ["通勤服饰"],
            general_interests: ["旅行"],
          },
        },
      ],
      runs: [] as Array<Record<string, unknown>>,
      accounts: [] as Array<Record<string, unknown>>,
      persona_candidates: [] as Array<Record<string, unknown>>,
      drafts: [] as Array<Record<string, unknown>>,
      batches: [] as Array<Record<string, unknown>>,
    },
    read_only: false,
    devices: [{ device_id: "phone1", name: "测试手机", online: true }],
  };
  const request = vi.fn(async (path?: string, _init?: RequestInit) =>
    path?.endsWith("/image-models")
      ? [
          {
            id: "personal-image:images/model",
            name: "images/model",
            source: "personal",
          },
        ]
      : path?.endsWith("/models")
      ? [
          { id: "company-text", name: "company-text", source: "enterprise" },
          {
            id: "personal:provider/model",
            name: "provider/model",
            source: "personal",
          },
        ]
      : snapshot,
  );
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
    requestBlob: vi.fn(
      async () => new Blob(["private-evidence"], { type: "image/jpeg" }),
    ),
    patchResult: vi.fn(),
    openSidePanel: vi.fn(),
    closeSidePanel: vi.fn(),
  };
  const setup = new Function(
    source.replace("export function setup", "function setup") +
      "; return setup;",
  )() as (host: OctopPluginUIHost) => void;
  setup(host);
  if (!Page) throw new Error("Plugin did not register its page");
  const view = render(
    <Page host={host} license={{ status: "active", features }} />,
  );
  return { snapshot, request, host, unmount: view.unmount };
}

describe("XHS audience profile through the registered plugin page", () => {
  it("requires a human review and sends the frozen project version", async () => {
    const { snapshot, request } = fixture();
    await openXhsTab("项目");
    fireEvent.click(
      await screen.findByRole("button", { name: "编辑目标画像" }),
    );
    const confirm = screen.getByRole("button", { name: "确认画像" });
    expect(confirm).toBeDisabled();
    snapshot.data.projects[0].version = 9;
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "我已核对画像与客户业务、受众范围一致",
      }),
    );
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/plugin-apps/xhs-ops/commands",
        expect.objectContaining({
          body: expect.stringContaining('"command":"profile.confirm"'),
        }),
      ),
    );
    const call = request.mock.calls.find(
      (args) => args.length > 1,
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(String(call[1].body))).toMatchObject({
      command: "profile.confirm",
      payload: { project_id: "p1", version: 3, confirmed: true },
    });
  });

  it("preserves legacy source fields during a project rename", async () => {
    const { request } = fixture();
    await openXhsTab("项目");
    fireEvent.click(
      await screen.findByRole("button", { name: "编辑客户资料" }),
    );
    fireEvent.change(screen.getByLabelText("项目名称"), {
      target: { value: "改名" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存客户资料" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/plugin-apps/xhs-ops/commands",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = request.mock.calls.find(
      (args) => args.length > 1,
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(String(call[1].body)).payload).toMatchObject({
      name: "改名",
      version: 3,
      business: "原客户业务",
      audience: "原受众说明",
      ops_notes: { forbidden_topics: ["折扣"] },
    });
  });

  it("disables profile commands when only content access is granted", async () => {
    const { request } = fixture(["xhs.content"]);
    await openXhsTab("项目");
    expect(
      await screen.findByRole("button", { name: "编辑目标画像" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "生成目标画像" })).toBeDisabled();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("preserves list separators while typing structured source fields", async () => {
    const { request } = fixture();
    await openXhsTab("项目");
    fireEvent.click(
      await screen.findByRole("button", { name: "编辑客户资料" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "填写结构化客户业务" }));
    const regions = screen.getByLabelText("业务地区");
    fireEvent.change(regions, { target: { value: "上海，" } });
    expect(regions).toHaveValue("上海，");
    fireEvent.change(regions, { target: { value: "上海，北京" } });
    fireEvent.click(screen.getByRole("button", { name: "保存客户资料" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/plugin-apps/xhs-ops/commands",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = request.mock.calls.find(
      (args) => args.length > 1,
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(String(call[1].body)).payload.business.regions).toEqual([
      "上海",
      "北京",
    ]);
  });

  it("requires reviewing again after the operator changes profile content", async () => {
    fixture();
    await openXhsTab("项目");
    fireEvent.click(
      await screen.findByRole("button", { name: "编辑目标画像" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "我已核对画像与客户业务、受众范围一致",
      }),
    );
    expect(screen.getByRole("button", { name: "确认画像" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("画像概述"), {
      target: { value: "新的受众说明" },
    });
    expect(screen.getByRole("button", { name: "确认画像" })).toBeDisabled();
  });

  it("adopts a candidate as a new account only on an explicit user action", async () => {
    const { snapshot, request } = fixture();
    Object.assign(snapshot.data.projects[0].profile, {
      confirmed_at: "2026-11-03T00:00:00Z",
    });
    snapshot.data.persona_candidates = [
      {
        id: "candidate1",
        project_id: "p1",
        project_version: 3,
        status: "draft",
        label: "新号人设A",
        positioning: "通勤穿搭",
        persona: { age: "28", gender: "女", region: "上海" },
        interest_pool: { core: ["穿搭"] },
      },
    ];
    await openXhsTab("人设规划");
    fireEvent.change(screen.getByLabelText("人设所属项目"), {
      target: { value: "p1" },
    });
    expect(request).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "采用为新号" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/plugin-apps/xhs-ops/commands",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = request.mock.calls.find(
      (args) => args.length > 1,
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(String(call[1].body))).toMatchObject({
      command: "persona.apply",
      payload: {
        project_id: "p1",
        version: 3,
        candidate_id: "candidate1",
        confirmed: true,
      },
    });
  });

  it("binds the distribution review to selected account and project versions", async () => {
    const { snapshot, request } = fixture();
    Object.assign(snapshot.data.projects[0].profile, {
      confirmed_at: "2026-11-03T00:00:00Z",
    });
    snapshot.data.accounts = [
      {
        id: "a1",
        version: 1,
        project_id: "p1",
        name: "新号A",
        entry_mode: "new",
      },
    ];
    await openXhsTab("人设规划");
    fireEvent.change(screen.getByLabelText("人设所属项目"), {
      target: { value: "p1" },
    });
    const confirm = screen.getByRole("button", { name: "确认人设分布" });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "新号A" }));
    fireEvent.change(screen.getByLabelText("分布审核说明"), {
      target: { value: "已核对地区与职业分布" },
    });
    expect(confirm).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "已核对选中账号的年龄、性别、地区分布和人设差异",
      }),
    );
    snapshot.data.accounts[0].version = 9;
    snapshot.data.projects[0].version = 7;
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/plugin-apps/xhs-ops/commands",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = request.mock.calls.find(
      (args) => args.length > 1,
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(String(call[1].body))).toMatchObject({
      command: "personas.confirm",
      payload: {
        version: 3,
        accounts: [{ id: "a1", version: 1 }],
        distribution_reviewed: true,
      },
    });
  });

  it("uses the latest snapshot license after member permissions change", async () => {
    const { snapshot } = fixture();
    Object.assign(snapshot, {
      license: { status: "active", version: 2, features: ["xhs.content"] },
    });
    await openXhsTab("项目");
    expect(
      await screen.findByRole("button", { name: "生成目标画像" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "编辑目标画像" })).toBeDisabled();
  });

  it("shows a quota explanation without exposing raw backend details", async () => {
    const { request } = fixture();
    await openXhsTab("项目");
    const generate = await screen.findByRole("button", {
      name: "生成目标画像",
    });
    request.mockRejectedValueOnce(
      new Error(
        'Request failed: 402 - {"error":{"code":"FORBIDDEN","message":"private upstream detail","details":{"reason":"insufficient_balance"}}}',
      ),
    );
    fireEvent.click(generate);
    expect(
      await screen.findByText("企业点数余额不足，请联系企业管理员。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/private upstream detail/),
    ).not.toBeInTheDocument();
  });

  it("passes the selected personal model to audience generation", async () => {
    const { request } = fixture();
    await openXhsTab("项目");
    fireEvent.change(await screen.findByLabelText("生成模型"), {
      target: { value: "personal:provider/model" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成目标画像" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/plugin-apps/xhs-ops/commands",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = request.mock.calls.find(
      (args) => args.length > 1,
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(String(call[1].body))).toMatchObject({
      command: "profile.generate",
      payload: {
        project_id: "p1",
        version: 3,
        model_ref: "personal:provider/model",
      },
    });
  });

  it("binds an adopted account to an existing phone with the captured version", async () => {
    const { snapshot, request } = fixture();
    snapshot.data.accounts = [
      {
        id: "a1",
        version: 2,
        project_id: "p1",
        name: "已采用新号",
        entry_mode: "new",
        device_id: "",
        platform_account_id: "",
      },
    ];
    await openXhsTab("账号与设备");
    fireEvent.click(screen.getByRole("button", { name: "绑定手机" }));
    fireEvent.change(screen.getByLabelText("平台账号 ID"), {
      target: { value: "xhs123" },
    });
    fireEvent.change(screen.getByLabelText("设备"), {
      target: { value: "phone1" },
    });
    snapshot.data.accounts[0].version = 9;
    fireEvent.click(screen.getByRole("button", { name: "保存账号" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/plugin-apps/xhs-ops/commands",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = request.mock.calls.find(
      (args) => args.length > 1,
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(String(call[1].body))).toMatchObject({
      command: "account.save",
      payload: {
        id: "a1",
        version: 2,
        project_id: "p1",
        entry_mode: "new",
        device_id: "phone1",
        platform_account_id: "xhs123",
      },
    });
  });
});

describe("XHS content editor through the registered plugin page", () => {
  it("loads private assets through authenticated blobs and releases their object URLs", async () => {
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:private-asset");
    URL.revokeObjectURL = vi.fn();
    const { snapshot, host, unmount } = fixture(["xhs.content"]);
    const assetId = "a".repeat(64) + ".png";
    snapshot.data.drafts = [
      {
        id: "d1",
        version: 1,
        project_id: "p1",
        title: "私有图片",
        content: "草稿",
        hashtags: [],
        images: [
          {
            filename: "私有图.png",
            mime_type: "image/png",
            asset_id: assetId,
            asset_url: "https://untrusted.example/image?token=wrong",
          },
        ],
      },
    ];
    try {
      await openXhsTab("创作编辑器");
      fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
      await waitFor(() =>
        expect(screen.getByRole("img", { name: "预览第1张" })).toHaveAttribute(
          "src",
          "blob:private-asset",
        ),
      );
      expect(host.requestBlob).toHaveBeenCalledWith(
        "/plugin-apps/xhs-ops/assets/" + assetId,
      );
      expect(
        JSON.stringify(vi.mocked(host.requestBlob).mock.calls),
      ).not.toContain("untrusted.example");
      unmount();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:private-asset");
    } finally {
      unmount();
      URL.createObjectURL = create;
      URL.revokeObjectURL = revoke;
    }
  });

  it("shows private asset failures instead of a false preview", async () => {
    const { snapshot, host } = fixture(["xhs.content"]);
    vi.mocked(host.requestBlob).mockRejectedValue(
      new Error("asset unavailable"),
    );
    snapshot.data.drafts = [
      {
        id: "d1",
        version: 1,
        project_id: "p1",
        title: "私有图片",
        content: "草稿",
        hashtags: [],
        images: [
          {
            filename: "私有图.png",
            mime_type: "image/png",
            asset_id: "a".repeat(64) + ".png",
          },
        ],
      },
    ];
    await openXhsTab("创作编辑器");
    fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
    expect(
      await screen.findByText("预览第1张 · 图片读取失败"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "预览第1张" }),
    ).not.toBeInTheDocument();
  });

  const image = (name: string) => ({
    filename: name,
    display_name: name,
    mime_type: "image/png",
    data_base64: "iVBORw0KGgppbWFnZQ==",
  });

  it("previews unsaved text and image order, and saves the frozen draft version", async () => {
    const { snapshot, request } = fixture();
    snapshot.data.drafts = [
      {
        id: "d1",
        version: 4,
        project_id: "p1",
        account_id: "",
        title: "训练笔记",
        content: "周末双打",
        hashtags: ["羽毛球"],
        images: [image("封面.png"), image("第二张.png")],
      },
    ];
    await openXhsTab("创作编辑器");
    fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("标题（4/20）"), {
      target: { value: "双打训练" },
    });
    expect(screen.getByRole("article", { name: "图文预览" })).toHaveTextContent(
      "双打训练",
    );
    fireEvent.click(screen.getByRole("button", { name: "上移第2张" }));
    expect(screen.getByRole("img", { name: "预览第1张" })).toHaveAttribute(
      "src",
      expect.stringContaining("base64,"),
    );
    snapshot.data.drafts[0].version = 9;
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/plugin-apps/xhs-ops/commands",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = request.mock.calls.find(
      ([, init]) => init?.method === "POST",
    )!;
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({
      command: "draft.save",
      payload: {
        id: "d1",
        version: 4,
        title: "双打训练",
        images: [{ filename: "第二张.png" }, { filename: "封面.png" }],
      },
    });
  });

  it("retains local uploaded media while generated text opens in the same editor", async () => {
    const { snapshot, request } = fixture();
    snapshot.data.drafts = [
      {
        id: "d1",
        version: 4,
        project_id: "p1",
        account_id: "",
        title: "训练笔记",
        content: "周末双打",
        hashtags: [],
        images: [image("原图.png")],
      },
    ];
    await openXhsTab("创作编辑器");
    fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("内容主题与文案要求"), {
      target: { value: "双打步法" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成内容" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/plugin-apps/xhs-ops/commands",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = request.mock.calls.find(
      ([, init]) => init?.method === "POST",
    )!;
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({
      command: "content.generate",
      payload: { id: "d1", version: 4, project_id: "p1", theme: "双打步法" },
    });
    expect(screen.getByRole("img", { name: "原图.png" })).toBeInTheDocument();
  });

  it("removes only the selected image before saving", async () => {
    const { snapshot, request } = fixture();
    snapshot.data.drafts = [
      {
        id: "d1",
        version: 1,
        project_id: "p1",
        account_id: "",
        title: "训练笔记",
        content: "周末双打",
        hashtags: [],
        images: [image("第一张.png"), image("第二张.png")],
      },
    ];
    await openXhsTab("创作编辑器");
    fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
    fireEvent.click(screen.getByRole("button", { name: "移除第1张" }));
    expect(
      screen.queryByRole("img", { name: "第一张.png" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() =>
      expect(
        request.mock.calls.some(([, init]) => init?.method === "POST"),
      ).toBe(true),
    );
    const call = request.mock.calls.find(
      ([, init]) => init?.method === "POST",
    )!;
    expect(JSON.parse(String(call[1]?.body)).payload.images).toHaveLength(1);
    expect(JSON.parse(String(call[1]?.body)).payload.images[0].filename).toBe(
      "第二张.png",
    );
  });
});

describe("XHS batch publish confirmation", () => {
  it("requires review and sends the exact prechecked version and digest", async () => {
    const { snapshot, request } = fixture(["xhs.publish"]);
    snapshot.data.drafts = [
      {
        id: "d1",
        project_id: "p1",
        title: "双打训练",
        content: "原文案",
        images: [],
      },
    ];
    snapshot.data.accounts = [
      { id: "a1", project_id: "p1", name: "账号A", device_id: "phone1" },
    ];
    snapshot.data.batches = [
      {
        id: "b1",
        version: 2,
        status: "draft",
        name: "训练批次",
        project_id: "p1",
        items: [{ id: "item1", draft_id: "d1", account_id: "a1" }],
        precheck: { digest: "frozen-digest" },
      },
    ];
    await openXhsTab("批量发布");
    fireEvent.click(
      await screen.findByRole("button", { name: "预检发布批次" }),
    );
    const start = await screen.findByRole("button", { name: "确认启动批次" });
    expect(start).toBeDisabled();
    expect(
      screen.getByRole("region", { name: "批次发布确认" }),
    ).toHaveTextContent("原文案");
    Object.assign(snapshot.data.batches[0], {
      version: 9,
      precheck: { digest: "changed-digest" },
    });
    snapshot.data.drafts[0].content = "预检后的新文案";
    expect(
      screen.getByRole("region", { name: "批次发布确认" }),
    ).toHaveTextContent("原文案");
    expect(
      screen.getByRole("region", { name: "批次发布确认" }),
    ).not.toHaveTextContent("预检后的新文案");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "我已逐篇核对内容、图片顺序、目标账号与手机",
      }),
    );
    fireEvent.click(start);
    await waitFor(() =>
      expect(
        request.mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toHaveLength(2),
    );
    const call = request.mock.calls.filter(
      ([, init]) => init?.method === "POST",
    )[1];
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({
      command: "batch.start",
      payload: {
        id: "b1",
        version: 2,
        confirm_digest: "frozen-digest",
        confirmed: true,
      },
    });
  });

  it("keeps batch publishing locked without the publish entitlement", async () => {
    const { request } = fixture(["xhs.content"]);
    await openXhsTab("批量发布");
    expect(
      screen.queryByRole("button", { name: "新建发布批次" }),
    ).not.toBeInTheDocument();
    expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
      false,
    );
  });
});

function newPublicAccount() {
  const image = (name: string) => ({
    filename: name,
    display_name: name,
    mime_type: "image/png",
    data_base64: "iVBORw0KGgppbWFnZQ==",
  });
  return {
    id: "a1",
    version: 1,
    project_id: "p1",
    name: "测试新号",
    entry_mode: "new",
    device_id: "phone1",
    platform_account_id: "test_account",
    persona_reviewed_at: "reviewed",
    profile_draft: {
      nickname: "训练日记",
      bio: "周末双打",
      occupation: "设计师",
      gender: "女",
      birthday: "1997-06-11",
      region: "上海",
      interest_tags: ["羽毛球"],
      avatar_candidates: [image("avatar.png")],
      cover_candidates: [image("cover.png")],
      avatar_filename: "avatar.png",
      cover_filename: "cover.png",
    },
  };
}

describe("XHS new-account public profile through the registered page", () => {
  it("requires an explicit human review and sends the frozen account version", async () => {
    const { snapshot, request } = fixture(["xhs.ops"]);
    snapshot.data.accounts = [newPublicAccount()];
    await openXhsTab("新号资料");
    const review = await screen.findByRole("button", {
      name: "确认公开资料审核",
    });
    expect(review).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "我已逐项核对文字、生日、性别、地区与选中的头像和背景图",
      }),
    );
    snapshot.data.accounts[0].version = 9;
    fireEvent.click(review);
    await waitFor(() =>
      expect(
        request.mock.calls.some(([, init]) => init?.method === "POST"),
      ).toBe(true),
    );
    const call = request.mock.calls.find(
      ([, init]) => init?.method === "POST",
    )!;
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({
      command: "account_profile.review",
      payload: { account_id: "a1", version: 1, confirmed: true },
    });
  });

  it("preserves separators in internal interests and saves only editable fields", async () => {
    const { snapshot, request } = fixture(["xhs.ops"]);
    snapshot.data.accounts = [newPublicAccount()];
    await openXhsTab("新号资料");
    const interests = await screen.findByLabelText(
      "内部兴趣标签（不发送到手机）",
    );
    fireEvent.change(interests, { target: { value: "羽毛球，" } });
    expect(interests).toHaveValue("羽毛球，");
    fireEvent.change(interests, { target: { value: "羽毛球，旅行" } });
    fireEvent.click(screen.getByRole("button", { name: "保存公开资料草稿" }));
    await waitFor(() =>
      expect(
        request.mock.calls.some(([, init]) => init?.method === "POST"),
      ).toBe(true),
    );
    const call = request.mock.calls.find(
      ([, init]) => init?.method === "POST",
    )!;
    const body = JSON.parse(String(call[1]?.body));
    expect(body).toMatchObject({
      command: "account_profile.save",
      payload: {
        account_id: "a1",
        version: 1,
        draft: {
          interest_tags: ["羽毛球", "旅行"],
          avatar_filename: "avatar.png",
        },
      },
    });
    expect(body.payload.draft).not.toHaveProperty("reviewed_at");
    expect(body.payload.draft).not.toHaveProperty("verified_at");
  });

  it("does not expose the new-account profile writer for an existing account", async () => {
    const { snapshot, request } = fixture(["xhs.ops"]);
    snapshot.data.accounts = [
      { ...newPublicAccount(), entry_mode: "existing" },
    ];
    await openXhsTab("新号资料");
    expect(
      await screen.findByText(/已有账号的资料修改请使用诊断与变更/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "确认应用到新号" }),
    ).not.toBeInTheDocument();
    expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
      false,
    );
  });
});

describe("XHS independent profile evidence", () => {
  it("routes uncertain preparation history through versioned profile reconciliation", async () => {
    const prompt = vi
      .spyOn(window, "prompt")
      .mockReturnValue("已在手机确认任务停止");
    const { snapshot, request } = fixture();
    const account = newPublicAccount();
    snapshot.data.accounts.push(account);
    snapshot.data.runs.push({
      id: "preparation1",
      kind: "account_prepare",
      status: "unknown",
      account_id: account.id,
    });
    try {
      await openXhsTab("发布与历史");
      fireEvent.click(
        await screen.findByRole("button", { name: "确认手机任务已停止" }),
      );
      await waitFor(() =>
        expect(request).toHaveBeenCalledWith(
          "/plugin-apps/xhs-ops/commands",
          expect.objectContaining({
            body: expect.stringContaining(
              '"command":"account_profile.reconcile"',
            ),
          }),
        ),
      );
      const call = request.mock.calls.find(
        ([, init]) =>
          init?.body?.toString().includes("account_profile.reconcile"),
      );
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        command: "account_profile.reconcile",
        payload: {
          run_id: "preparation1",
          account_id: account.id,
          version: account.version,
          reference: "已在手机确认任务停止",
          confirmed: true,
        },
      });
    } finally {
      prompt.mockRestore();
    }
  });

  it("requires viewing private evidence and explicit image review before accepting", async () => {
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:private-profile");
    URL.revokeObjectURL = vi.fn();
    const { snapshot, request, unmount } = fixture(["xhs.ops"]);
    const account = {
      ...newPublicAccount(),
      profile_verification: {
        status: "verified",
        run_id: "verify1",
        evidence_url: "/api/plugin-apps/xhs-ops/evidence/verify1",
        account_matched: true,
        fields: Object.fromEntries(
          [
            "nickname",
            "bio",
            "occupation",
            "avatar",
            "cover",
            "gender",
            "birthday",
            "region",
          ].map((key) => [key, true]),
        ),
      },
    };
    Object.assign(account.profile_draft, {
      apply_operation: { run_id: "apply1" },
    });
    snapshot.data.accounts = [account];
    try {
      await openXhsTab("新号资料");
      const accept = await screen.findByRole("button", {
        name: "记录人工核验完成",
      });
      const images = screen.getByRole("checkbox", {
        name: "我已对照手机、选中候选图和截图核对全部八项资料",
      });
      expect(accept).toBeDisabled();
      expect(images).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "查看独立核验截图" }));
      await waitFor(() => expect(images).toBeEnabled());
      fireEvent.change(screen.getByLabelText("人工核验记录"), {
        target: { value: "已核对手机及两张候选图" },
      });
      fireEvent.click(images);
      fireEvent.click(accept);
      await waitFor(() =>
        expect(
          request.mock.calls.some(([, init]) => init?.method === "POST"),
        ).toBe(true),
      );
      const call = request.mock.calls.find(
        ([, init]) => init?.method === "POST",
      )!;
      expect(JSON.parse(String(call[1]?.body))).toMatchObject({
        command: "account_profile.verify",
        payload: {
          account_id: "a1",
          version: 1,
          run_id: "verify1",
          evidence_url: "/api/plugin-apps/xhs-ops/evidence/verify1",
          reference: "已核对手机及两张候选图",
          images_confirmed: true,
          confirmed: true,
        },
      });
    } finally {
      unmount();
      URL.createObjectURL = create;
      URL.revokeObjectURL = revoke;
    }
  });
});

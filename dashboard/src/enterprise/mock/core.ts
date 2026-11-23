import type { EnterpriseSnapshot } from "../types";

/**
 * Sample tenant used until the enterprise cloud API is wired up.
 * Every page reads it through `enterprise/api`, never directly.
 */

const MINUTE = 60_000;

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * MINUTE).toISOString();
}

function nextMonthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function buildMockSnapshot(): EnterpriseSnapshot {
  return {
    tenant: {
      id: "tn_xinghe",
      name: "星河科技",
      mark: "星",
      balancePoints: 128_450,
    },
    member: {
      id: "mb_linqing",
      name: "林清",
      email: "linqing@xinghe.tech",
      department: "研发部",
      role: "developer",
      loginMethod: "feishu",
    },
    quota: {
      usedPoints: 1_236.8,
      quotaPoints: 3_000,
      resetAt: nextMonthStart(),
    },
    app: { version: "1.2.0", latestVersion: "1.2.1", channel: "stable" },
    policy: {
      version: "v12",
      updatedAt: ago(10),
      modules: {
        experts: "allow",
        terminal: "allow",
        browser: "allow",
      },
      toolApprovalForced: true,
      approvalMode: "every",
      piiRedaction: true,
      secretRedaction: true,
      syncLocked: true,
      localModelsAllowed: true,
      offlineGraceDays: 6,
      capabilities: [
        { key: "shell", allowed: false },
        { key: "files", allowed: true },
        { key: "browser", allowed: true },
        { key: "adb", allowed: true },
        { key: "remoteDesktop", allowed: false },
        { key: "localModels", allowed: true },
      ],
    },
    devices: [
      {
        id: "dv_mbp",
        name: "MacBook Pro",
        os: "macOS 15",
        appVersion: "1.2.0",
        online: true,
        lastSeenAt: ago(0),
        current: true,
      },
      {
        id: "dv_x1",
        name: "ThinkPad X1",
        os: "Windows 11",
        appVersion: "1.2.0",
        online: true,
        lastSeenAt: ago(1),
        current: false,
      },
    ],
    usage: {
      month: currentMonth(),
      rows: [
        {
          model: "tabby-pro",
          kind: "cloud",
          calls: 412,
          inputTokens: 2_150_000,
          outputTokens: 150_000,
          points: 869.15,
        },
        {
          model: "tabby-max",
          kind: "cloud",
          calls: 46,
          inputTokens: 980_000,
          outputTokens: 110_000,
          points: 232.5,
        },
        {
          model: "tabby-fast",
          kind: "cloud",
          calls: 905,
          inputTokens: 2_310_000,
          outputTokens: 188_600,
          points: 83.12,
        },
        {
          model: "tabby-long",
          kind: "cloud",
          calls: 12,
          inputTokens: 688_000,
          outputTokens: 9_200,
          points: 43.58,
        },
        {
          model: "tabby-cn",
          kind: "cloud",
          calls: 38,
          inputTokens: 96_400,
          outputTokens: 12_100,
          points: 8.45,
        },
        {
          model: "qwen2.5:7b",
          kind: "local",
          calls: 57,
          inputTokens: 158_000,
          outputTokens: 24_400,
          points: 0,
        },
      ],
      local: { tokens: 182_400, primaryModel: "Ollama · qwen2.5:7b" },
    },
    sync: {
      state: "synced",
      pending: 0,
      syncedItems: 2_486,
      syncedBytes: 1.28 * 1024 ** 3,
      lastSyncedAt: ago(10),
      queue: [
        { kind: "threads", pending: 0, synced: 812, lastSyncedAt: ago(10) },
        { kind: "traces", pending: 0, synced: 1_420, lastSyncedAt: ago(10) },
        { kind: "memory", pending: 0, synced: 96, lastSyncedAt: ago(12) },
        { kind: "files", pending: 0, synced: 148, lastSyncedAt: ago(18) },
        { kind: "config", pending: 0, synced: 10, lastSyncedAt: ago(88) },
      ],
      conflicts: [
        {
          id: "cf_thread",
          kind: "thread-fork",
          title: "竞品定价调研",
          resolution: "竞品定价调研（MacBook Pro 离线分叉）",
          otherDevice: "ThinkPad X1",
          at: ago(42),
        },
        {
          id: "cf_file",
          kind: "file-copy",
          title: "reports/competitor_pricing.md",
          resolution: "competitor_pricing (MacBook Pro).md",
          otherDevice: "ThinkPad X1",
          at: ago(2 * 24 * 60 + 6 * 60),
        },
      ],
    },
    cloudModels: [
      {
        id: "tabby-pro",
        description: "通用旗舰，质量与速度均衡",
        capabilities: ["text", "image", "reasoning"],
        context: "200K",
        inputPricePerM: 300,
        outputPricePerM: 1_500,
        isDefault: true,
        available: true,
      },
      {
        id: "tabby-max",
        description: "复杂推理、长任务与代码",
        capabilities: ["text", "image", "reasoning"],
        context: "200K",
        inputPricePerM: 125,
        outputPricePerM: 1_000,
        isDefault: false,
        available: true,
      },
      {
        id: "tabby-fast",
        description: "快速响应，日常问答",
        capabilities: ["text"],
        context: "128K",
        inputPricePerM: 27,
        outputPricePerM: 110,
        isDefault: false,
        available: true,
      },
      {
        id: "tabby-cn",
        description: "中文写作与本地化",
        capabilities: ["text", "reasoning"],
        context: "128K",
        inputPricePerM: 60,
        outputPricePerM: 220,
        isDefault: false,
        available: true,
      },
      {
        id: "tabby-long",
        description: "超长上下文，长文档与资料库",
        capabilities: ["text"],
        context: "1M",
        inputPricePerM: 60,
        outputPricePerM: 250,
        isDefault: false,
        available: true,
      },
    ],
    localModels: [
      {
        id: "qwen2.5:7b",
        runtime: "Ollama",
        use: "chat",
        sizeGb: 4.7,
        status: "enabled",
      },
      {
        id: "phi-3-mini",
        runtime: "ONNX",
        use: "chat",
        sizeGb: 2.3,
        status: "enabled",
      },
      {
        id: "bge-m3",
        runtime: "ONNX",
        use: "embedding",
        sizeGb: 1.2,
        status: "downloaded",
      },
      {
        id: "llama3.1:8b",
        runtime: "Ollama",
        use: "chat",
        sizeGb: 4.9,
        status: "not-downloaded",
      },
    ],
  };
}

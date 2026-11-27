/**
 * Tabby enterprise edition — client-side data contracts.
 *
 * These shapes are what the enterprise cloud is expected to serve. Until the
 * cloud API exists, `enterprise/api/*` resolves them from `enterprise/mock/*`;
 * pages only ever import from `enterprise/api` or `useEnterprise()`.
 *
 * Money is in "points" (点数): 1 USD of upstream model cost = 100 points.
 * Timestamps are ISO-8601 strings.
 */

export type SyncState = "synced" | "pending" | "offline";

export interface EnterpriseTenant {
  id: string;
  name: string;
  /** One-character mark shown in the sidebar tenant chip. */
  mark: string;
  /** Tenant-wide points balance; ≤ 0 blocks every member's cloud calls. */
  balancePoints: number;
}

export type MemberRole = "admin" | "developer" | "member";
export type LoginMethod = "password" | "feishu" | "wecom" | "dingtalk" | "oidc";

export interface EnterpriseMember {
  id: string;
  name: string;
  email: string;
  department: string;
  role: MemberRole;
  loginMethod: LoginMethod;
}

export interface MemberQuota {
  usedPoints: number;
  quotaPoints: number;
  /** Next monthly reset. */
  resetAt: string;
}

export interface AppInfo {
  version: string;
  latestVersion: string | null;
  channel: "stable" | "beta";
}

export interface EnterpriseDevice {
  id: string;
  name: string;
  os: string;
  appVersion: string;
  status?: "active" | "logged_out" | "revoked" | "wiping" | "wiped";
  revokedAt?: string | null;
  online: boolean;
  lastSeenAt: string;
  current: boolean;
}

export type ModelKind = "cloud" | "local";

/** One row of "按模型用量" for the current month. */
export interface ModelUsageRow {
  model: string;
  kind: ModelKind;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  points: number;
}

export interface LocalUsageSummary {
  tokens: number;
  /** e.g. "Ollama · qwen2.5:7b" */
  primaryModel: string;
}

export type SyncKind = "threads" | "traces" | "memory" | "files" | "config";

export interface SyncQueueRow {
  kind: SyncKind;
  pending: number;
  synced: number;
  lastSyncedAt: string;
  /** Present while a file upload is in flight. */
  upload?: { pct: number; doneMb: number; totalMb: number };
}

export type SyncConflictKind = "thread-fork" | "file-copy";

export interface SyncConflict {
  id: string;
  kind: SyncConflictKind;
  title: string;
  /** Fork title or the renamed local copy. */
  resolution: string;
  otherDevice: string;
  at: string;
}

export interface SyncStatus {
  state: SyncState;
  pending: number;
  syncedItems: number;
  syncedBytes: number;
  lastSyncedAt: string;
  queue: SyncQueueRow[];
  conflicts: SyncConflict[];
}

export type CapabilityKey =
  | "shell"
  | "files"
  | "browser"
  | "adb"
  | "remoteDesktop"
  | "localModels";

export interface CapabilityPolicy {
  key: CapabilityKey;
  allowed: boolean;
}

export interface EnterprisePolicy {
  version: string;
  updatedAt: string;
  /** L1 modules published by the tenant role policy. */
  modules: Record<string, "allow" | "deny" | string>;
  toolApprovalForced: boolean;
  approvalMode: "every" | "first" | "auto";
  piiRedaction: boolean;
  secretRedaction: boolean;
  syncLocked: boolean;
  localModelsAllowed: boolean;
  /** Per-purpose model gates published by the enterprise role policy. */
  modelPurposes?: Partial<
    Record<
      | "chat"
      | "embedding"
      | "generation"
      | "voice"
      | "search"
      | "decision"
      | "phone",
      boolean
    >
  >;
  /** Days the desktop keeps working without refreshing policy. */
  offlineGraceDays: number;
  capabilities: CapabilityPolicy[];
  /** Folders a workspace may be in; empty means any. */
  fsRoots?: string[];
  /** Folders experts may never read or write. */
  fsDenyRoots?: string[];
  /** Shell command patterns the experts may not run. */
  denyCommands?: string[];
}

export type ModelCapability = "text" | "image" | "reasoning";

export interface CloudModel {
  id: string;
  description: string;
  capabilities: ModelCapability[];
  /** Context window, e.g. "200K". */
  context: string;
  /** Points per million tokens. */
  inputPricePerM: number;
  outputPricePerM: number;
  isDefault: boolean;
  available: boolean;
}

export type LocalModelStatus = "enabled" | "downloaded" | "not-downloaded";

export interface LocalModel {
  id: string;
  runtime: "Ollama" | "ONNX";
  use: "chat" | "embedding";
  sizeGb: number;
  status: LocalModelStatus;
}

export interface SessionLock {
  /** Device currently holding the conversation. */
  deviceName: string;
  deviceOnline: boolean;
}

export interface EnterpriseSnapshot {
  tenant: EnterpriseTenant;
  member: EnterpriseMember;
  quota: MemberQuota;
  app: AppInfo;
  policy: EnterprisePolicy;
  devices: EnterpriseDevice[];
  usage: { month: string; rows: ModelUsageRow[]; local: LocalUsageSummary };
  sync: SyncStatus;
  cloudModels: CloudModel[];
  localModels: LocalModel[];
}

/** Why a cloud model call is blocked, or `null` when it is allowed. */
export type CloudBlockReason =
  | "offline"
  | "tenant-balance"
  | "member-quota"
  | null;

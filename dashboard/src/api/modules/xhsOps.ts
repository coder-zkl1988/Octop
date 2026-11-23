import { request } from "../request";

export interface XhsProject {
  id: string;
  name?: string;
  version?: number;
  [key: string]: unknown;
}

export interface XhsAccount {
  id: string;
  projectId?: string;
  deviceId?: string | null;
  name?: string;
  [key: string]: unknown;
}

export interface XhsDeviceBinding {
  deviceId: string;
  accountId?: string;
  accountLabel?: string;
  projectId?: string;
  projectName?: string;
  canTransfer: boolean;
  blockingReason?: string | null;
}

export interface XhsProjectMutation {
  version?: number;
  name?: string;
  business?: Record<string, unknown> | string;
  audience?: Record<string, unknown> | string;
  ops_notes?: Record<string, unknown>;
  profile?: Record<string, unknown> | string;
  persona_count?: number;
}

export interface XhsTransferDeviceBody {
  from_account_id: string;
  to_account_id?: string;
  account: Record<string, unknown>;
  override_reason?: string;
}

export interface XhsIdentityConfirmation {
  identity_task_id: string;
  platform_account_id: string;
  override_read?: boolean;
}

export interface XhsPlaybook {
  version?: string;
  bundleVersion?: number;
  rules?: unknown[];
  [key: string]: unknown;
}

export interface XhsRun {
  id: string;
  status?: string;
  [key: string]: unknown;
}

export interface XhsCommentDraft {
  id: string;
  status?: string;
  [key: string]: unknown;
}

export interface XhsAudit {
  id: string;
  status?: string;
  [key: string]: unknown;
}

export interface XhsDiagnosis {
  id: string;
  status?: string;
  [key: string]: unknown;
}

export interface XhsChangeOrder {
  id: string;
  status?: string;
  [key: string]: unknown;
}

export interface XhsProfileReadback {
  status: "read" | "unavailable";
  taskId: string;
  reason: string;
  screenshotUrl: string | null;
  fields: Array<Record<string, unknown>>;
}

export interface XhsIdentityTask {
  status: "visible" | "unavailable";
  screenshotUrl: string | null;
  accountId: string;
  taskId: string;
  reason: string;
}

export interface XhsScheduleRunNowResult {
  date: string;
  planned: number;
  created: number;
  started: number;
  queued: number;
  skipped: string[];
  summary: string;
}

export interface XhsScheduleRunNowResponse {
  project: XhsProject;
  result: XhsScheduleRunNowResult;
}

export const xhsOpsApi = {
  listProjects(): Promise<{ projects: XhsProject[] }> {
    return request("/xhs-ops/projects");
  },

  getProject(projectId: string): Promise<{ project: XhsProject }> {
    return request(`/xhs-ops/projects/${encodeURIComponent(projectId)}`);
  },

  createProject(body: XhsProjectMutation): Promise<{ project: XhsProject }> {
    return request("/xhs-ops/projects", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  generateProjectProfile(
    projectId: string,
    body: Record<string, unknown> = {},
  ) {
    return request<{ project: XhsProject }>(
      `/xhs-ops/projects/${encodeURIComponent(projectId)}/profile/generate`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  confirmProjectProfile(projectId: string, body: Record<string, unknown>) {
    return request<{ project: XhsProject }>(
      `/xhs-ops/projects/${encodeURIComponent(projectId)}/profile/confirm`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  generatePersonas(projectId: string, body: Record<string, unknown> = {}) {
    return request<{
      suggestions: Array<Record<string, unknown>>;
      distribution: string;
      project: XhsProject;
    }>(`/xhs-ops/projects/${encodeURIComponent(projectId)}/personas/generate`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  confirmPersonas(projectId: string, body: Record<string, unknown>) {
    return request<{ accounts: XhsAccount[] }>(
      `/xhs-ops/projects/${encodeURIComponent(projectId)}/personas/confirm`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  getAccount(accountId: string): Promise<{ account: XhsAccount }> {
    return request(`/xhs-ops/accounts/${encodeURIComponent(accountId)}`);
  },

  createAccount(projectId: string, body: Record<string, unknown>) {
    return request<{ account: XhsAccount }>(
      `/xhs-ops/projects/${encodeURIComponent(projectId)}/accounts`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  updateAccount(accountId: string, body: Record<string, unknown>) {
    return request<{ account: XhsAccount }>(
      `/xhs-ops/accounts/${encodeURIComponent(accountId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
  },

  deleteAccount(accountId: string) {
    return request<{ account: XhsAccount }>(
      `/xhs-ops/accounts/${encodeURIComponent(accountId)}`,
      { method: "DELETE" },
    );
  },

  generateProfileDraft(accountId: string, body: Record<string, unknown> = {}) {
    return request<{ account: XhsAccount }>(
      `/xhs-ops/accounts/${encodeURIComponent(
        accountId,
      )}/profile-draft/generate`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  confirmProfileDraft(accountId: string, body: Record<string, unknown> = {}) {
    return request<{ account: XhsAccount }>(
      `/xhs-ops/accounts/${encodeURIComponent(
        accountId,
      )}/profile-draft/confirm`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  readProfileDraft(accountId: string) {
    return request<XhsProfileReadback>(
      `/xhs-ops/accounts/${encodeURIComponent(
        accountId,
      )}/profile-draft/readback`,
      { method: "POST" },
    );
  },

  applyProfileDraft(accountId: string, body: Record<string, unknown> = {}) {
    return request<{ account: XhsAccount }>(
      `/xhs-ops/accounts/${encodeURIComponent(accountId)}/profile-draft/apply`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  reconcileProfileDraft(accountId: string) {
    return request<{ account: XhsAccount }>(
      `/xhs-ops/accounts/${encodeURIComponent(
        accountId,
      )}/profile-draft/reconcile`,
      { method: "POST" },
    );
  },

  updateProject(
    projectId: string,
    body: XhsProjectMutation,
  ): Promise<Record<string, unknown>> {
    return request(`/xhs-ops/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  listProjectAccounts(projectId: string): Promise<{ accounts: XhsAccount[] }> {
    return request(
      `/xhs-ops/projects/${encodeURIComponent(projectId)}/accounts`,
    );
  },

  listDeviceBindings(): Promise<{ bindings: XhsDeviceBinding[] }> {
    return request("/xhs-ops/device-bindings");
  },

  listComments(
    projectId: string,
    params?: { status?: string; accountId?: string },
  ) {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.accountId) query.set("accountId", params.accountId);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<{
      drafts: XhsCommentDraft[];
      quotas: Array<Record<string, unknown>>;
    }>(`/xhs-ops/projects/${encodeURIComponent(projectId)}/comments${suffix}`);
  },

  generateComments(runId: string, body: Record<string, unknown> = {}) {
    return request<{ drafts: XhsCommentDraft[]; skipped: string[] }>(
      `/xhs-ops/runs/${encodeURIComponent(runId)}/comments/generate`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  reviewComment(commentId: string, body: Record<string, unknown>) {
    return request<{ draft: XhsCommentDraft }>(
      `/xhs-ops/comments/${encodeURIComponent(commentId)}/review`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  getCommentQuota(accountId: string) {
    return request<{ quota: Record<string, unknown> }>(
      `/xhs-ops/accounts/${encodeURIComponent(accountId)}/comment-quota`,
    );
  },

  startCommentRun(projectId: string, body: Record<string, unknown>) {
    return request<{ run: XhsRun }>(
      `/xhs-ops/projects/${encodeURIComponent(projectId)}/comment-runs`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  listRuns(params?: {
    projectId?: string;
    accountId?: string;
    status?: string;
    date?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.projectId) query.set("projectId", params.projectId);
    if (params?.accountId) query.set("accountId", params.accountId);
    if (params?.status) query.set("status", params.status);
    if (params?.date) query.set("date", params.date);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<{ runs: XhsRun[] }>(`/xhs-ops/runs${suffix}`);
  },

  createRun(body: Record<string, unknown>) {
    return request<{ run: XhsRun }>("/xhs-ops/runs", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  getRun(runId: string) {
    return request<{ run: XhsRun }>(
      `/xhs-ops/runs/${encodeURIComponent(runId)}`,
    );
  },

  updateRun(runId: string, body: Record<string, unknown>) {
    return request<{ run: XhsRun }>(
      `/xhs-ops/runs/${encodeURIComponent(runId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    );
  },

  startRun(runId: string, body: Record<string, unknown> = {}) {
    return request<{ run: XhsRun }>(
      `/xhs-ops/runs/${encodeURIComponent(runId)}/start`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  cancelRun(runId: string, body: Record<string, unknown> = {}) {
    return request<{ run: XhsRun }>(
      `/xhs-ops/runs/${encodeURIComponent(runId)}/cancel`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  suggestPlans(projectId: string, date?: string) {
    const suffix = date ? `?date=${encodeURIComponent(date)}` : "";
    return request<{
      plans: Array<Record<string, unknown>>;
      skipped: Array<Record<string, unknown>>;
    }>(
      `/xhs-ops/projects/${encodeURIComponent(
        projectId,
      )}/plan-suggest${suffix}`,
    );
  },

  runDailyNow(projectId: string, body: Record<string, unknown>) {
    return request<XhsScheduleRunNowResponse>(
      `/xhs-ops/projects/${encodeURIComponent(projectId)}/schedule/run-now`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  transferDevice(
    projectId: string,
    body: XhsTransferDeviceBody,
  ): Promise<{ account: XhsAccount }> {
    return request(
      `/xhs-ops/projects/${encodeURIComponent(
        projectId,
      )}/accounts/transfer-device`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },

  readTakeoverIdentity(accountId: string): Promise<Record<string, unknown>> {
    return request(
      `/xhs-ops/accounts/${encodeURIComponent(
        accountId,
      )}/takeover/identity/read`,
      { method: "POST" },
    );
  },

  readAccountIdentity(accountId: string): Promise<XhsIdentityTask> {
    return request(
      `/xhs-ops/accounts/${encodeURIComponent(accountId)}/identity/read`,
      { method: "POST" },
    );
  },

  confirmTakeoverIdentity(
    accountId: string,
    body: XhsIdentityConfirmation,
  ): Promise<Record<string, unknown>> {
    return request(
      `/xhs-ops/accounts/${encodeURIComponent(
        accountId,
      )}/takeover/identity/confirm`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },

  revertTakeoverPlan(
    accountId: string,
    version?: number,
  ): Promise<Record<string, unknown>> {
    return request(
      `/xhs-ops/accounts/${encodeURIComponent(accountId)}/takeover/plan/revert`,
      {
        method: "POST",
        body: JSON.stringify(version === undefined ? {} : { version }),
      },
    );
  },

  authorizeTakeover(accountId: string, body: Record<string, unknown> = {}) {
    return request<{ account: XhsAccount }>(
      `/xhs-ops/accounts/${encodeURIComponent(accountId)}/takeover/authorize`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  pauseTakeover(accountId: string, body: Record<string, unknown> = {}) {
    return request<{ account: XhsAccount }>(
      `/xhs-ops/accounts/${encodeURIComponent(accountId)}/takeover/pause`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  resumeTakeover(accountId: string, body: Record<string, unknown> = {}) {
    return request<Record<string, unknown>>(
      `/xhs-ops/accounts/${encodeURIComponent(accountId)}/takeover/resume`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  releaseDeviceHold(accountId: string, body: Record<string, unknown>) {
    return request<{ account: XhsAccount }>(
      `/xhs-ops/accounts/${encodeURIComponent(
        accountId,
      )}/takeover/device-hold/release`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  listAudits(accountId: string) {
    return request<{ audits: XhsAudit[] }>(
      `/xhs-ops/accounts/${encodeURIComponent(accountId)}/audits`,
    );
  },

  startAudit(accountId: string, body: Record<string, unknown> = {}) {
    return request<{ audit: XhsAudit }>(
      `/xhs-ops/accounts/${encodeURIComponent(accountId)}/audits`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  getAudit(auditId: string) {
    return request<{ audit: XhsAudit }>(
      `/xhs-ops/audits/${encodeURIComponent(auditId)}`,
    );
  },

  cancelAudit(auditId: string, body: Record<string, unknown> = {}) {
    return request<{ audit: XhsAudit }>(
      `/xhs-ops/audits/${encodeURIComponent(auditId)}/cancel`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  confirmAuditBaseline(auditId: string, body: Record<string, unknown> = {}) {
    return request<Record<string, unknown>>(
      `/xhs-ops/audits/${encodeURIComponent(auditId)}/baseline`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  listDiagnoses(accountId: string) {
    return request<{ diagnoses: XhsDiagnosis[] }>(
      `/xhs-ops/accounts/${encodeURIComponent(accountId)}/diagnoses`,
    );
  },

  generateDiagnosis(accountId: string, body: Record<string, unknown>) {
    return request<{ diagnosis: XhsDiagnosis }>(
      `/xhs-ops/accounts/${encodeURIComponent(accountId)}/diagnoses`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  getDiagnosis(diagnosisId: string) {
    return request<{
      diagnosis: XhsDiagnosis;
      event: Record<string, unknown> | null;
    }>(`/xhs-ops/diagnoses/${encodeURIComponent(diagnosisId)}`);
  },

  regenerateDiagnosis(diagnosisId: string, body: Record<string, unknown> = {}) {
    return request<{ diagnosis: XhsDiagnosis }>(
      `/xhs-ops/diagnoses/${encodeURIComponent(diagnosisId)}/regenerate`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  saveDiagnosisDecisions(diagnosisId: string, body: Record<string, unknown>) {
    return request<{ diagnosis: XhsDiagnosis }>(
      `/xhs-ops/diagnoses/${encodeURIComponent(diagnosisId)}/decisions`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  confirmDiagnosis(diagnosisId: string, body: Record<string, unknown> = {}) {
    return request<Record<string, unknown>>(
      `/xhs-ops/diagnoses/${encodeURIComponent(diagnosisId)}/confirm`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  listChangeOrders(accountId: string) {
    return request<{ orders: XhsChangeOrder[] }>(
      `/xhs-ops/accounts/${encodeURIComponent(accountId)}/change-orders`,
    );
  },

  createChangeOrder(accountId: string, body: Record<string, unknown>) {
    return request<Record<string, unknown>>(
      `/xhs-ops/accounts/${encodeURIComponent(accountId)}/change-orders`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  getChangeOrder(orderId: string) {
    return request<Record<string, unknown>>(
      `/xhs-ops/change-orders/${encodeURIComponent(orderId)}`,
    );
  },

  changeOrderAction(
    orderId: string,
    action:
      | "precheck"
      | "confirm"
      | "cancel"
      | "verify"
      | "visual-check"
      | "manual-check"
      | "observation/review",
    body: Record<string, unknown> = {},
  ) {
    return request<Record<string, unknown>>(
      `/xhs-ops/change-orders/${encodeURIComponent(orderId)}/${action}`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  rollbackChangeOrder(orderId: string, body: Record<string, unknown> = {}) {
    return request<Record<string, unknown>>(
      `/xhs-ops/change-orders/${encodeURIComponent(orderId)}/rollback`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },

  getPlaybook(): Promise<XhsPlaybook> {
    return request("/xhs-ops/playbook");
  },

  uploadChangeOrderImage(
    orderId: string,
    field: "avatar" | "cover",
    dataUrl: string,
    expectedUpdatedAt: string,
  ): Promise<Record<string, unknown>> {
    return request(
      `/xhs-ops/change-orders/${encodeURIComponent(
        orderId,
      )}/fields/${field}/image`,
      {
        method: "PUT",
        body: JSON.stringify({ dataUrl, expectedUpdatedAt }),
      },
    );
  },
};

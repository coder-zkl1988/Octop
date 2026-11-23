import { beforeEach, describe, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../request", () => ({ request }));

import { xhsOpsApi } from "./xhsOps";

beforeEach(() => request.mockClear());

describe("xhsOpsApi", () => {
  it("uses typed project and device-binding routes", () => {
    xhsOpsApi.listProjects();
    xhsOpsApi.getProject("project/1");
    xhsOpsApi.getAccount("account/1");
    xhsOpsApi.listProjectAccounts("project/1");
    xhsOpsApi.listDeviceBindings();

    expect(request).toHaveBeenNthCalledWith(1, "/xhs-ops/projects");
    expect(request).toHaveBeenNthCalledWith(2, "/xhs-ops/projects/project%2F1");
    expect(request).toHaveBeenNthCalledWith(3, "/xhs-ops/accounts/account%2F1");
    expect(request).toHaveBeenNthCalledWith(
      4,
      "/xhs-ops/projects/project%2F1/accounts",
    );
    expect(request).toHaveBeenNthCalledWith(5, "/xhs-ops/device-bindings");
  });

  it("keeps mutations explicit and version-aware", () => {
    xhsOpsApi.updateProject("p1", { version: 4, name: "星河" });
    xhsOpsApi.transferDevice("p1", {
      from_account_id: "a1",
      account: { id: "a1", device_id: "phone-1" },
    });
    xhsOpsApi.readTakeoverIdentity("a1");
    xhsOpsApi.readAccountIdentity("a1");
    xhsOpsApi.confirmTakeoverIdentity("a1", {
      identity_task_id: "task-1",
      platform_account_id: "xhs-1",
    });
    xhsOpsApi.revertTakeoverPlan("a1", 7);
    xhsOpsApi.uploadChangeOrderImage(
      "order/1",
      "avatar",
      "data:image/png;base64,AQ==",
      "t1",
    );
    xhsOpsApi.getPlaybook();

    expect(request).toHaveBeenNthCalledWith(1, "/xhs-ops/projects/p1", {
      method: "PATCH",
      body: JSON.stringify({ version: 4, name: "星河" }),
    });
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/xhs-ops/projects/p1/accounts/transfer-device",
      {
        method: "POST",
        body: JSON.stringify({
          from_account_id: "a1",
          account: { id: "a1", device_id: "phone-1" },
        }),
      },
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      "/xhs-ops/accounts/a1/takeover/identity/read",
      { method: "POST" },
    );
    expect(request).toHaveBeenNthCalledWith(
      4,
      "/xhs-ops/accounts/a1/identity/read",
      { method: "POST" },
    );
    expect(request).toHaveBeenNthCalledWith(
      5,
      "/xhs-ops/accounts/a1/takeover/identity/confirm",
      {
        method: "POST",
        body: JSON.stringify({
          identity_task_id: "task-1",
          platform_account_id: "xhs-1",
        }),
      },
    );
    expect(request).toHaveBeenNthCalledWith(
      6,
      "/xhs-ops/accounts/a1/takeover/plan/revert",
      { method: "POST", body: JSON.stringify({ version: 7 }) },
    );
    expect(request).toHaveBeenNthCalledWith(
      7,
      "/xhs-ops/change-orders/order%2F1/fields/avatar/image",
      {
        method: "PUT",
        body: JSON.stringify({
          dataUrl: "data:image/png;base64,AQ==",
          expectedUpdatedAt: "t1",
        }),
      },
    );
    expect(request).toHaveBeenNthCalledWith(8, "/xhs-ops/playbook");
  });

  it("covers the migrated operations, review, diagnosis, and change-order routes", () => {
    xhsOpsApi.listComments("p1", { status: "pending", accountId: "a1" });
    xhsOpsApi.listRuns({ projectId: "p1", date: "2026-11-07" });
    xhsOpsApi.suggestPlans("p1", "2026-11-07");
    xhsOpsApi.listAudits("a1");
    xhsOpsApi.listDiagnoses("a1");
    xhsOpsApi.listChangeOrders("a1");
    xhsOpsApi.changeOrderAction("o1", "precheck", { expectedUpdatedAt: "t1" });

    expect(request).toHaveBeenNthCalledWith(
      1,
      "/xhs-ops/projects/p1/comments?status=pending&accountId=a1",
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/xhs-ops/runs?projectId=p1&date=2026-11-07",
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      "/xhs-ops/projects/p1/plan-suggest?date=2026-11-07",
    );
    expect(request).toHaveBeenNthCalledWith(4, "/xhs-ops/accounts/a1/audits");
    expect(request).toHaveBeenNthCalledWith(
      5,
      "/xhs-ops/accounts/a1/diagnoses",
    );
    expect(request).toHaveBeenNthCalledWith(
      6,
      "/xhs-ops/accounts/a1/change-orders",
    );
    expect(request).toHaveBeenNthCalledWith(
      7,
      "/xhs-ops/change-orders/o1/precheck",
      {
        method: "POST",
        body: JSON.stringify({ expectedUpdatedAt: "t1" }),
      },
    );
  });
});

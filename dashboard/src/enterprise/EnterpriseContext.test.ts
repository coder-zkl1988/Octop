import { describe, expect, it } from "vitest";
import { cloudBlockFor, enterprisePermissionKeys } from "./EnterpriseContext";
import type { EnterpriseSnapshot } from "./types";

const snapshot = {
  tenant: { balancePoints: 100 },
  quota: { usedPoints: 10, quotaPoints: 100 },
} as EnterpriseSnapshot;

describe("enterprise cloud blocking", () => {
  it("prioritizes offline state", () => {
    expect(cloudBlockFor(snapshot, "offline")).toBe("offline");
  });

  it("blocks an exhausted tenant before member quota", () => {
    expect(
      cloudBlockFor({ ...snapshot, tenant: { balancePoints: 0 } }, "synced"),
    ).toBe("tenant-balance");
  });

  it("blocks a member at the monthly quota", () => {
    expect(
      cloudBlockFor(
        { ...snapshot, quota: { usedPoints: 100, quotaPoints: 100 } },
        "synced",
      ),
    ).toBe("member-quota");
  });
});

describe("enterprise model permissions", () => {
  it("opens the original provider settings when local models are allowed", () => {
    const permissions = enterprisePermissionKeys({
      cloudModels: [],
      policy: {
        modules: {},
        capabilities: [],
        localModelsAllowed: true,
      },
    } as EnterpriseSnapshot);
    expect(permissions).toEqual(
      expect.arrayContaining(["providers", "ollama_models", "onnx_models"]),
    );
  });
});

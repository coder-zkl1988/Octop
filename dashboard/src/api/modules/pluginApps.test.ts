import { describe, expect, it } from "vitest";
import { pluginAppAccess, type PluginApp } from "./pluginApps";

const app = (status: string, features = ["xhs.ops"]): PluginApp => ({
  id: "xhs-ops",
  name: "XHS",
  ui: null,
  enabled: true,
  license: {
    plugin_id: "xhs-ops",
    tenant_id: "t",
    member_id: "m",
    status,
    features,
  },
});

describe("pluginAppAccess", () => {
  it("does not expose paid content to inactive or unassigned members", () => {
    expect(pluginAppAccess(app("inactive"))).toBe("locked");
    expect(pluginAppAccess({ ...app("active"), license: null })).toBe("locked");
    expect(pluginAppAccess(app("active", []))).toBe("locked");
  });

  it("keeps historical data readable for expired and revoked scoped licenses", () => {
    expect(pluginAppAccess(app("expired"))).toBe("read");
    expect(pluginAppAccess(app("revoked"))).toBe("read");
    expect(pluginAppAccess(app("expired", []))).toBe("read");
    expect(pluginAppAccess(app("revoked", []))).toBe("read");
    expect(pluginAppAccess(app("trial"))).toBe("write");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const enterprise: {
  snapshot: { policy: { modules: Record<string, string> } } | null;
  loading: boolean;
} = { snapshot: null, loading: false };

vi.mock("./EnterpriseContext", () => ({ useEnterprise: () => enterprise }));

async function access(build: "0" | "1") {
  vi.resetModules();
  vi.stubEnv("VITE_ENTERPRISE_MODE", build);
  const { useMemorySharingAccess } = await import("./memorySharing");
  return useMemorySharingAccess();
}

describe("useMemorySharingAccess", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    enterprise.snapshot = null;
    enterprise.loading = false;
  });

  it("keeps 共享记忆 outside the enterprise build", async () => {
    expect(await access("0")).toEqual({ allowed: true, pending: false });
  });

  it("hides it in the enterprise build unless the role policy allows it", async () => {
    enterprise.snapshot = { policy: { modules: { experts: "allow" } } };
    expect((await access("1")).allowed).toBe(false);
    enterprise.snapshot = { policy: { modules: { memory_sharing: "deny" } } };
    expect((await access("1")).allowed).toBe(false);
    enterprise.snapshot = { policy: { modules: { memory_sharing: "allow" } } };
    expect(await access("1")).toEqual({ allowed: true, pending: false });
  });

  it("reports pending until the first policy load resolves", async () => {
    enterprise.loading = true;
    expect(await access("1")).toEqual({ allowed: false, pending: true });
  });
});

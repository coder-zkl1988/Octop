import { describe, expect, it, vi } from "vitest";

const { initialize } = vi.hoisted(() => ({ initialize: vi.fn() }));
vi.mock("mermaid", () => ({ default: { initialize } }));

describe("loadMermaid", () => {
  it("renders model-supplied diagrams in strict security mode", async () => {
    const { loadMermaid } = await import("./mermaidLoader");
    await loadMermaid();
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: "strict" }),
    );
  });
});

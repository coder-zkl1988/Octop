import { beforeEach, describe, expect, it } from "vitest";
import { enterpriseKnowledgeApi } from "./knowledge";

describe("enterprise knowledge publishing", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates and withdraws a publish request", async () => {
    const created = await enterpriseKnowledgeApi.submitPublish({
      baseId: "kb-personal",
      documentIds: ["doc-1"],
      scope: "members",
      departments: [],
      memberIds: ["member-1"],
      syncMode: "prompt",
    });
    expect(
      (await enterpriseKnowledgeApi.listPublishRequests()).map((r) => r.id),
    ).toContain(created.id);
    await enterpriseKnowledgeApi.withdrawPublish(created.id);
    expect(
      (await enterpriseKnowledgeApi.listPublishRequests()).find(
        (r) => r.id === created.id,
      ),
    ).toBeUndefined();
  });
});

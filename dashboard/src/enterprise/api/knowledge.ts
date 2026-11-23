import {
  MOCK_PUBLIC_KNOWLEDGE_BASES,
  MOCK_SHARE_TARGETS,
  readPublishRequests,
  writePublishRequests,
} from "../mock/knowledge";
import { request } from "../../api/request";

/**
 * Enterprise knowledge client: public (cloud) knowledge bases and requests to
 * publish a personal, on-device knowledge base to the enterprise space.
 *
 * Uses the local enterprise proxy in the real desktop build. The proxy keeps
 * the control-plane session and normalizes the admin/member response shape.
 */

/** A tenant-wide knowledge base hosted by the enterprise cloud. */
export interface EnterpriseKnowledgeBase {
  id: string;
  name: string;
  description: string;
  /** Lucide preset name, as for personal knowledge bases ("scale"). */
  iconName: string;
  /** Department that maintains it, e.g. "法务部". */
  ownerDepartment: string;
  docCount: number;
  /** What the current member may do with it. */
  access: "read" | "edit";
}

export type KnowledgeShareScope = "all" | "departments" | "members";

/** After the local source changes: ask to republish, or sync automatically. */
export type KnowledgeSyncMode = "prompt" | "auto";

export interface KnowledgeShareMember {
  id: string;
  name: string;
  department: string;
}

export interface KnowledgeShareTargets {
  departments: string[];
  members: KnowledgeShareMember[];
}

export interface KnowledgePublishInput {
  /** Id of the personal knowledge base being published. */
  baseId: string;
  /** `null` publishes every document. */
  documentIds: string[] | null;
  scope: KnowledgeShareScope;
  /** Department names when `scope` is "departments". */
  departments: string[];
  /** Member ids when `scope` is "members". */
  memberIds: string[];
  syncMode: KnowledgeSyncMode;
  /** Display title sent to the enterprise publish request. */
  title?: string;
}

export interface KnowledgePublishRequest extends KnowledgePublishInput {
  id: string;
  /** Waiting for an enterprise admin to approve. */
  status: "pending";
  submittedAt: string;
}

const MOCK_LATENCY_MS = 120;
const REAL_ENTERPRISE = import.meta.env.VITE_ENTERPRISE_MODE === "1";

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(value), MOCK_LATENCY_MS),
  );
}

let publishRequests: KnowledgePublishRequest[] | null = null;

function requests(): KnowledgePublishRequest[] {
  if (!publishRequests) publishRequests = readPublishRequests();
  return publishRequests;
}

function saveRequests(rows: KnowledgePublishRequest[]) {
  publishRequests = rows;
  writePublishRequests(rows);
}

export const enterpriseKnowledgeApi = {
  /** Public knowledge bases the member can retrieve from. */
  async listPublicBases(): Promise<EnterpriseKnowledgeBase[]> {
    if (REAL_ENTERPRISE) {
      return request<EnterpriseKnowledgeBase[]>("/enterprise/knowledge/bases");
    }
    return delay(MOCK_PUBLIC_KNOWLEDGE_BASES);
  },

  /** Departments and members a knowledge base can be shared with. */
  async getShareTargets(): Promise<KnowledgeShareTargets> {
    if (REAL_ENTERPRISE) {
      return request<KnowledgeShareTargets>(
        "/enterprise/knowledge/share-targets",
      );
    }
    return delay(MOCK_SHARE_TARGETS);
  },

  /** The member's open publish requests (one per personal knowledge base). */
  async listPublishRequests(): Promise<KnowledgePublishRequest[]> {
    if (REAL_ENTERPRISE) {
      return request<KnowledgePublishRequest[]>(
        "/enterprise/knowledge/publish-requests",
      );
    }
    return delay(requests());
  },

  /** Ask an admin to publish a personal knowledge base to the enterprise space. */
  async submitPublish(
    input: KnowledgePublishInput,
  ): Promise<KnowledgePublishRequest> {
    if (REAL_ENTERPRISE) {
      return request<KnowledgePublishRequest>("/enterprise/knowledge/publish", {
        method: "POST",
        body: JSON.stringify({
          base_id: input.baseId,
          title: input.title,
          document_ids: input.documentIds,
          scope: input.scope,
          departments: input.departments,
          member_ids: input.memberIds,
          sync_mode: input.syncMode,
        }),
      });
    }
    const created: KnowledgePublishRequest = {
      ...input,
      id: `pr_${Date.now().toString(36)}`,
      status: "pending",
      submittedAt: new Date().toISOString(),
    };
    saveRequests([
      ...requests().filter((row) => row.baseId !== input.baseId),
      created,
    ]);
    return delay(created);
  },

  /** Withdraw a pending publish request. */
  async withdrawPublish(requestId: string): Promise<void> {
    if (REAL_ENTERPRISE) {
      await request<void>(
        `/enterprise/knowledge/publish-requests/${encodeURIComponent(
          requestId,
        )}`,
        { method: "DELETE" },
      );
      return;
    }
    saveRequests(requests().filter((row) => row.id !== requestId));
    return delay(undefined);
  },
};

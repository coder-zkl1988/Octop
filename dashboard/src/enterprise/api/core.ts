import { buildMockSnapshot } from "../mock/core";
import { getApiUrl } from "../../api/config";
import { getAuthToken, request } from "../../api/request";
import {
  getSimulation,
  setSimulation,
  type EnterpriseSimulation,
} from "../simulation";
import type { EnterpriseSnapshot, SyncStatus } from "../types";

export interface EnterpriseSyncItem {
  kind: "threads" | "traces" | "memory" | "files";
  id: string;
  operation?: "upsert" | "delete";
  payload_digest: string;
  payload?: Record<string, unknown>;
}

/**
 * Enterprise cloud client — the single swap point for the real API.
 *
 * Today every call resolves from `enterprise/mock`; the simulation switches
 * (see `enterprise/simulation.ts`) bend the sample tenant into the states the
 * design covers. Replace the bodies here with `request()` calls once the
 * enterprise cloud ships; callers and types stay the same. Planned control-
 * plane endpoints (tabby-enterprise 05 §8.3) are noted on each call.
 */

const MOCK_LATENCY_MS = 120;
const REAL_ENTERPRISE = import.meta.env.VITE_ENTERPRISE_MODE === "1";

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(value), MOCK_LATENCY_MS),
  );
}

const PENDING_BY_KIND: Record<string, number> = {
  threads: 4,
  traces: 6,
  memory: 1,
  files: 1,
  config: 0,
};

function applySync(
  sync: SyncStatus,
  state: EnterpriseSimulation["sync"],
): SyncStatus {
  if (state === "synced") return sync;
  return {
    ...sync,
    state,
    pending: 12,
    queue: sync.queue.map((row) => ({
      ...row,
      pending: PENDING_BY_KIND[row.kind] ?? 0,
      upload:
        row.kind === "files" && state === "pending"
          ? { pct: 38, doneMb: 4.7, totalMb: 12.4 }
          : undefined,
    })),
  };
}

function applySimulation(
  snap: EnterpriseSnapshot,
  sim: EnterpriseSimulation,
): EnterpriseSnapshot {
  return {
    ...snap,
    tenant:
      sim.billing === "tenant-exhausted"
        ? { ...snap.tenant, balancePoints: -3.42 }
        : snap.tenant,
    quota:
      sim.billing === "quota-exceeded"
        ? { ...snap.quota, usedPoints: 3_012.4 }
        : snap.quota,
    sync: applySync(snap.sync, sim.sync),
  };
}

export const enterpriseApi = {
  /**
   * Everything the shell needs: tenant, member, quota, policy, sync, models.
   * → `GET /desktop/v1/me` + `GET /desktop/v1/policy`; sync state is local.
   */
  async getSnapshot(): Promise<EnterpriseSnapshot> {
    if (REAL_ENTERPRISE)
      return request<EnterpriseSnapshot>("/enterprise/snapshot");
    return delay(applySimulation(buildMockSnapshot(), getSimulation()));
  },

  /**
   * URL for the one-way enterprise event stream. Native EventSource cannot
   * attach an Authorization header, so the short-lived desktop JWT travels
   * as an access_token query parameter and is validated by the local proxy.
   */
  eventsUrl(): string | null {
    if (!REAL_ENTERPRISE) return null;
    const token = getAuthToken();
    if (!token) return null;
    const url = getApiUrl("/enterprise/events");
    return `${url}?access_token=${encodeURIComponent(token)}`;
  },

  /** Upload the outbox now (local sync service). */
  async syncNow(items: EnterpriseSyncItem[] = []): Promise<void> {
    if (REAL_ENTERPRISE) {
      await request("/enterprise/sync", {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      return;
    }
    if (getSimulation().sync === "pending") setSimulation({ sync: "synced" });
    return delay(undefined);
  },

  /** Retry the cloud connection after going offline (`GET /desktop/v1/events`). */
  async reconnect(): Promise<void> {
    if (REAL_ENTERPRISE) {
      await request("/enterprise/reconnect", { method: "POST" });
      return;
    }
    if (getSimulation().sync === "offline") setSimulation({ sync: "pending" });
    return delay(undefined);
  },

  /** Sign another device out of this account. */
  async signOutDevice(deviceId: string): Promise<void> {
    if (REAL_ENTERPRISE) {
      await request(
        `/enterprise/devices/${encodeURIComponent(deviceId)}:logout`,
        {
          method: "POST",
        },
      );
      return;
    }
    void deviceId;
    return delay(undefined);
  },

  /** Take over a conversation open on another device → `POST /desktop/v1/threads/{id}/lease:takeover`. */
  async takeOverSession(threadId: string): Promise<void> {
    if (REAL_ENTERPRISE) {
      await request(
        `/enterprise/threads/${encodeURIComponent(threadId)}/takeover`,
        {
          method: "POST",
        },
      );
      return;
    }
    void threadId;
    setSimulation({ sessionLock: false });
    return delay(undefined);
  },
};

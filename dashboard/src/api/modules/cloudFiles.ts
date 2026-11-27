import { request } from "../request";

/** An expert of yours kept in 企业云端存储. */
export interface CloudExpert {
  expert_id: string;
  name: string;
  device_id: string;
  updated_at: string | null;
  files: number;
  bytes: number;
  /** Set when this expert is already on this computer. */
  local_agent_id: string | null;
}

export type StorageLocation = "local" | "cloud";

const DEFAULT_KEY = "octop.defaultStorageLocation";

export const cloudFilesApi = {
  syncNow: () => request("/enterprise/files/sync", { method: "POST" }),
  experts: () => request<{ items: CloudExpert[] }>("/enterprise/files/experts"),
  restore: (expertId: string) =>
    request<{ agent_id: string; name: string; written: number; kept: number }>(
      "/enterprise/files/restore",
      { method: "POST", body: JSON.stringify({ expert_id: expertId }) },
    ),
  setLocation: (agentId: string, location: StorageLocation) =>
    request(
      `/enterprise/files/experts/${encodeURIComponent(agentId)}/location`,
      {
        method: "PUT",
        body: JSON.stringify({ location }),
      },
    ),
};

/** 本机设置 → 新专家的默认存储位置: kept on this computer only. */
export function defaultStorageLocation(): StorageLocation {
  try {
    return localStorage.getItem(DEFAULT_KEY) === "cloud" ? "cloud" : "local";
  } catch {
    return "local";
  }
}

export function setDefaultStorageLocation(location: StorageLocation): void {
  try {
    localStorage.setItem(DEFAULT_KEY, location);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
}

import { request } from "../request";
import type { PluginLicense } from "../../plugins/toolRenderers/types";

export interface PluginApp {
  id: string;
  name: string;
  version?: number | string;
  ui: { entry: string; manifest?: string } | null;
  enabled?: boolean;
  license: PluginLicense | null;
}

export interface PluginAppSnapshot {
  plugin: { id: string; name: string; version?: number | string };
  license: PluginLicense | null;
  data: {
    version: number;
    projects: unknown[];
    accounts: unknown[];
    drafts: unknown[];
    runs: unknown[];
    comments: unknown[];
    audits: unknown[];
    diagnoses: unknown[];
    change_orders: unknown[];
    consents: unknown[];
    prechecks?: unknown[];
    [key: string]: unknown;
  };
  devices: Array<Record<string, unknown>>;
  read_only: boolean;
}

export function pluginAppAccess(app: PluginApp): "locked" | "write" | "read" {
  const license = app.license;
  if (!license) return "locked";
  const scoped = Boolean(
    license.plugin_id && license.tenant_id && license.member_id,
  );
  if (!scoped) return "locked";
  const status = license.status?.toLowerCase();
  if (status === "active" || status === "trial")
    return license.features?.length ? "write" : "locked";
  if (status === "expired" || status === "revoked") return "read";
  return "locked";
}

export const pluginAppsApi = {
  list: () => request<PluginApp[]>("/plugin-apps"),
  snapshot: (id: string) =>
    request<PluginAppSnapshot>(
      `/plugin-apps/${encodeURIComponent(id)}/snapshot`,
    ),
  command: (
    id: string,
    command: string,
    payload: Record<string, unknown> = {},
  ) =>
    request<PluginAppSnapshot>(
      `/plugin-apps/${encodeURIComponent(id)}/commands`,
      {
        method: "POST",
        body: JSON.stringify({ command, payload }),
      },
    ),
};

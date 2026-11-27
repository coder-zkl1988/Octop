import { request } from "../request";

export interface LocalWorkspaceFolder {
  path: string;
  experts: { id: string; name: string }[];
  size_bytes: number;
  /** Measuring stopped early: ``size_bytes`` is a lower bound. */
  truncated: boolean;
  missing: boolean;
}

export interface LocalWorkspaceFolders {
  items: LocalWorkspaceFolder[];
  /** Only the desktop app can open a folder in the file manager. */
  can_reveal: boolean;
}

export interface LocalDataExport {
  path: string;
  size_bytes: number;
  threads: number;
  files: number;
  skipped_files: number;
}

export const localSettingsApi = {
  workspaces: () =>
    request<LocalWorkspaceFolders>("/local-settings/workspaces"),
  reveal: (path: string) =>
    request<{ ok: boolean }>("/local-settings/workspaces/reveal", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  exportMyData: () =>
    request<LocalDataExport>("/local-settings/export", { method: "POST" }),
};

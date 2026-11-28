import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ClientSettings } from "../../shared/ipc-contract";

/**
 * Applies the client settings that act on the operating system: open at login
 * and keeping the system awake while the shell runs. Electron's login items
 * only cover macOS and Windows, so Linux gets an XDG autostart entry.
 */

export interface SystemSettingsDeps {
  platform: NodeJS.Platform;
  /** Electron ``app.setLoginItemSettings`` (macOS / Windows). */
  setLoginItemSettings(settings: { openAtLogin: boolean }): void;
  /** Electron ``powerSaveBlocker``. */
  powerSaveBlocker: {
    start(type: "prevent-app-suspension"): number;
    stop(id: number): void;
  };
  /** ``$XDG_CONFIG_HOME`` or ``~/.config`` (Linux only). */
  xdgConfigHome: string;
  /** Command the Linux autostart entry runs (the AppImage or the executable). */
  linuxExec: string;
  log?: (message: string) => void;
}

export const LINUX_AUTOSTART_FILE = "tabby.desktop";

export function linuxAutostartEntry(exec: string): string {
  const quoted = `"${exec.replace(/(["`$\\])/g, "\\$1")}"`;
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Tabby",
    `Exec=${quoted}`,
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n");
}

export type SystemSettingsApplier = (
  settings: Pick<ClientSettings, "launchAtLogin" | "preventSleep">,
) => void;

export function createSystemSettingsApplier(deps: SystemSettingsDeps): SystemSettingsApplier {
  let blockerId: number | null = null;
  let launchAtLogin: boolean | null = null;

  const applyLaunchAtLogin = (enabled: boolean) => {
    if (launchAtLogin === enabled) return;
    launchAtLogin = enabled;
    if (deps.platform !== "linux") {
      deps.setLoginItemSettings({ openAtLogin: enabled });
      return;
    }
    const dir = join(deps.xdgConfigHome, "autostart");
    const file = join(dir, LINUX_AUTOSTART_FILE);
    if (enabled) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, linuxAutostartEntry(deps.linuxExec), "utf8");
    } else {
      rmSync(file, { force: true });
    }
  };

  const applyPreventSleep = (enabled: boolean) => {
    if (enabled && blockerId === null) {
      blockerId = deps.powerSaveBlocker.start("prevent-app-suspension");
    } else if (!enabled && blockerId !== null) {
      deps.powerSaveBlocker.stop(blockerId);
      blockerId = null;
    }
  };

  return (settings) => {
    try {
      applyLaunchAtLogin(settings.launchAtLogin);
    } catch (err) {
      // Forget the state so the next save retries instead of assuming it took.
      launchAtLogin = null;
      deps.log?.(`launch at login: ${err instanceof Error ? err.message : String(err)}`);
    }
    applyPreventSleep(settings.preventSleep);
  };
}

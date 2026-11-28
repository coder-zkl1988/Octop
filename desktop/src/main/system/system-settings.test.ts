import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  createSystemSettingsApplier,
  LINUX_AUTOSTART_FILE,
  linuxAutostartEntry,
} from "./system-settings";

function fakes(platform: NodeJS.Platform, linuxExec = "/opt/Tabby/tabby") {
  const calls = {
    login: [] as Array<{ openAtLogin: boolean }>,
    start: [] as string[],
    stop: [] as number[],
    log: [] as string[],
  };
  let nextId = 41;
  let failLogin = false;
  const deps = {
    platform,
    setLoginItemSettings: (settings: { openAtLogin: boolean }) => {
      calls.login.push(settings);
      if (failLogin) {
        failLogin = false;
        throw new Error("denied");
      }
    },
    powerSaveBlocker: {
      start: (type: "prevent-app-suspension") => {
        calls.start.push(type);
        return ++nextId;
      },
      stop: (id: number) => {
        calls.stop.push(id);
      },
    },
    xdgConfigHome: mkdtempSync(join(tmpdir(), "tabby-xdg-")),
    linuxExec,
    log: (message: string) => {
      calls.log.push(message);
    },
  };
  return { deps, calls, failNextLogin: () => (failLogin = true) };
}

test("keeps one power save blocker while prevent sleep is on", () => {
  const { deps, calls } = fakes("darwin");
  const apply = createSystemSettingsApplier(deps);

  apply({ launchAtLogin: false, preventSleep: true });
  apply({ launchAtLogin: false, preventSleep: true });
  assert.deepEqual(calls.start, ["prevent-app-suspension"]);

  apply({ launchAtLogin: false, preventSleep: false });
  apply({ launchAtLogin: false, preventSleep: false });
  assert.deepEqual(calls.stop, [42]);
});

test("uses Electron login items on macOS and Windows", () => {
  for (const platform of ["darwin", "win32"] as const) {
    const { deps, calls } = fakes(platform);
    const apply = createSystemSettingsApplier(deps);
    apply({ launchAtLogin: true, preventSleep: false });
    apply({ launchAtLogin: true, preventSleep: false });
    apply({ launchAtLogin: false, preventSleep: false });
    assert.deepEqual(calls.login, [{ openAtLogin: true }, { openAtLogin: false }]);
  }
});

test("writes and removes an XDG autostart entry on Linux", () => {
  const { deps, calls } = fakes("linux", "/home/me/Tabby.AppImage");
  const apply = createSystemSettingsApplier(deps);
  const file = join(deps.xdgConfigHome, "autostart", LINUX_AUTOSTART_FILE);

  apply({ launchAtLogin: true, preventSleep: false });
  assert.match(readFileSync(file, "utf8"), /Exec="\/home\/me\/Tabby\.AppImage"/);
  assert.deepEqual(calls.login, []);

  apply({ launchAtLogin: false, preventSleep: false });
  assert.equal(existsSync(file), false);
});

test("retries login items after a failure instead of assuming it took", () => {
  const { deps, calls, failNextLogin } = fakes("win32");
  failNextLogin();
  const apply = createSystemSettingsApplier(deps);

  apply({ launchAtLogin: true, preventSleep: true });
  assert.deepEqual(calls.log, ["launch at login: denied"]);
  assert.equal(calls.start.length, 1);

  apply({ launchAtLogin: true, preventSleep: true });
  assert.equal(calls.login.length, 2);
});

test("quotes the command for the autostart Exec key", () => {
  assert.match(linuxAutostartEntry('/opt/My "Apps"/tabby'), /Exec="\/opt\/My \\"Apps\\"\/tabby"/);
});

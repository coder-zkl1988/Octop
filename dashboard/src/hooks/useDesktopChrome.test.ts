import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useDesktopChrome } from "./useDesktopChrome";

describe("useDesktopChrome", () => {
  afterEach(() => {
    delete (window as Window & { _wails?: unknown })._wails;
    delete window.octopDesktop;
    delete document.documentElement.dataset.octopDesktopChrome;
    document.documentElement.style.removeProperty(
      "--window-controls-inset-end",
    );
    document.documentElement.style.removeProperty(
      "--window-controls-inset-start",
    );
  });

  it("activates the page chrome for the Wails desktop bridge", () => {
    Object.defineProperty(window, "_wails", {
      configurable: true,
      value: { invoke: () => undefined },
    });

    const { result } = renderHook(() => useDesktopChrome());

    expect(result.current).toBe("windows");
    expect(document.documentElement.dataset.octopDesktopChrome).toBe("windows");
  });
});

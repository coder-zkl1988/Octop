import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDesktopChrome } from "./useDesktopChrome";

describe("useDesktopChrome", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete window.octopDesktop;
    delete document.documentElement.dataset.octopDesktopChrome;
    document.documentElement.style.removeProperty(
      "--window-controls-inset-end",
    );
    document.documentElement.style.removeProperty(
      "--window-controls-inset-start",
    );
  });

  it("activates the page chrome inside the Electron shell", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/45.0.0",
    );
    Object.defineProperty(window, "octopDesktop", {
      configurable: true,
      value: {},
    });

    const { result } = renderHook(() => useDesktopChrome());

    expect(result.current).toBe("windows");
    expect(document.documentElement.dataset.octopDesktopChrome).toBe("windows");
  });
});

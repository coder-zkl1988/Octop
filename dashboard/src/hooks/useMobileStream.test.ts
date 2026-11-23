import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveMobileStreamCodec } from "./useMobileStream";

describe("resolveMobileStreamCodec", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps an explicit JPEG request for compatibility", () => {
    vi.stubGlobal("VideoDecoder", class {});
    expect(resolveMobileStreamCodec("jpeg")).toBe("jpeg");
  });

  it("prefers H.264 when WebCodecs is available", () => {
    vi.stubGlobal("VideoDecoder", class {});
    expect(resolveMobileStreamCodec()).toBe("h264");
    expect(resolveMobileStreamCodec("h264")).toBe("h264");
  });

  it("falls back to JPEG when WebCodecs is unavailable", () => {
    vi.stubGlobal("VideoDecoder", undefined);
    expect(resolveMobileStreamCodec()).toBe("jpeg");
    expect(resolveMobileStreamCodec("h264")).toBe("jpeg");
  });
});

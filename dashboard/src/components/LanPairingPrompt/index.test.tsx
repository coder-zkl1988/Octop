/**
 * LanPairingPrompt — app-wide approval prompt for iTabby LAN pairing.
 *
 * Covers: shows device + code for a pending request, approve / reject call
 * the API, disappears when the request leaves the pending list (phone
 * cancelled / expired), and stays silent without the ``mobile`` permission.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

vi.mock("../../api/modules/mobile", () => ({
  companionApi: {
    pairRequests: vi.fn(),
    approvePairRequest: vi.fn(),
    rejectPairRequest: vi.fn(),
  },
}));

const currentUser = vi.hoisted(() => ({
  value: { role: "user", permissions: ["mobile"] } as {
    role: string;
    permissions?: string[];
  } | null,
}));
vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => currentUser.value,
}));

import { companionApi } from "../../api/modules/mobile";
import LanPairingPrompt, { PAIR_REQUESTS_POLL_MS } from "./index";

const api = vi.mocked(companionApi, true);

const REQUEST = {
  request_id: "pr_abc",
  code: "482913",
  device_id: "24094RAD4C-8a1f",
  model: "24094RAD4C",
  manufacturer: "Xiaomi",
  expires_at: 1_800_000_120,
};

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("LanPairingPrompt", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    currentUser.value = { role: "user", permissions: ["mobile"] };
    api.pairRequests.mockResolvedValue({ requests: [REQUEST] });
    api.approvePairRequest.mockResolvedValue(undefined);
    api.rejectPairRequest.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows the device and code of a pending request", async () => {
    render(<LanPairingPrompt />);
    await flush();
    expect(await screen.findByText("iTabby 请求配对")).toBeTruthy();
    expect(screen.getByText("Xiaomi 24094RAD4C")).toBeTruthy();
    expect(screen.getByTestId("lan-pair-code").textContent).toBe("482913");
  });

  it("approves and rejects through the API", async () => {
    render(<LanPairingPrompt />);
    await flush();
    api.pairRequests.mockResolvedValue({ requests: [] });
    fireEvent.click(await screen.findByRole("button", { name: /允\s*许/ }));
    await flush();
    expect(api.approvePairRequest).toHaveBeenCalledWith("pr_abc");

    api.pairRequests.mockResolvedValue({ requests: [REQUEST] });
    await act(async () => {
      vi.advanceTimersByTime(PAIR_REQUESTS_POLL_MS);
    });
    await flush();
    fireEvent.click(await screen.findByRole("button", { name: /拒\s*绝/ }));
    await flush();
    expect(api.rejectPairRequest).toHaveBeenCalledWith("pr_abc");
  });

  it("closes when the phone cancels or the request expires", async () => {
    render(<LanPairingPrompt />);
    await flush();
    expect(await screen.findByTestId("lan-pair-code")).toBeTruthy();
    api.pairRequests.mockResolvedValue({ requests: [] });
    await act(async () => {
      vi.advanceTimersByTime(PAIR_REQUESTS_POLL_MS);
    });
    await flush();
    expect(api.pairRequests).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(screen.queryByTestId("lan-pair-code")).toBeNull(),
    );
  });

  it("does not poll without the mobile permission", async () => {
    currentUser.value = { role: "user", permissions: [] };
    render(<LanPairingPrompt />);
    await flush();
    expect(api.pairRequests).not.toHaveBeenCalled();
    expect(screen.queryByText("iTabby 请求配对")).toBeNull();
  });
});

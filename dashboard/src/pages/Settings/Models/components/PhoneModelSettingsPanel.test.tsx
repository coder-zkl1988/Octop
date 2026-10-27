/** Phone vision model tab on the models page (companion-app phones). */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../../../api/modules/mobile", () => ({
  companionApi: {
    settings: vi.fn(),
    saveSettings: vi.fn(),
  },
}));

const currentUser = vi.hoisted(() => ({
  value: { role: "admin" } as { role: string },
}));
vi.mock("../../../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => currentUser.value,
}));

import { companionApi } from "../../../../api/modules/mobile";
import { PhoneModelSettingsPanel } from "./PhoneModelSettingsPanel";

const api = vi.mocked(companionApi, true);

const SETTINGS = {
  provider: "step",
  model: "step-3.7-flash",
  max_tokens: null,
  ready: true,
  candidates: [
    { provider: "step", model: "step-3.7-flash", vision: true },
    { provider: "zhipu", model: "glm-5v-turbo", vision: true },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  currentUser.value = { role: "admin" };
  api.settings.mockResolvedValue(SETTINGS);
  api.saveSettings.mockResolvedValue(SETTINGS);
});

describe("<PhoneModelSettingsPanel />", () => {
  it("lets admins see and save the phone model", async () => {
    render(<PhoneModelSettingsPanel />);

    expect(await screen.findByText("已就绪")).toBeInTheDocument();
    expect(screen.getByText("step / step-3.7-flash")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
    await waitFor(() =>
      expect(api.saveSettings).toHaveBeenCalledWith({
        provider: "step",
        model: "step-3.7-flash",
      }),
    );
  });

  it("shows the current choice read-only to other users", async () => {
    currentUser.value = { role: "user" };
    render(<PhoneModelSettingsPanel />);

    expect(
      await screen.findByText("step / step-3.7-flash"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("flags a missing model", async () => {
    api.settings.mockResolvedValue({
      ...SETTINGS,
      provider: "",
      model: "",
      ready: false,
    });
    render(<PhoneModelSettingsPanel />);

    expect(await screen.findByText("未配置")).toBeInTheDocument();
  });
});

/**
 * CompanionPhones panel — phones paired through the companion app.
 *
 * Covers: device cards (status, battery, running task + stop), the pairing
 * QR dialog (URL, loopback warning) and the admin-only model picker.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../../api/modules/mobile", () => ({
  companionApi: {
    devices: vi.fn(),
    createPairing: vi.fn(),
    unpair: vi.fn(),
    cancelTask: vi.fn(),
    snapshot: vi.fn(),
    settings: vi.fn(),
    saveSettings: vi.fn(),
  },
}));

const currentUser = vi.hoisted(() => ({
  value: { role: "admin" } as { role: string },
}));
vi.mock("../../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => currentUser.value,
}));

import { companionApi } from "../../../api/modules/mobile";
import CompanionPhonesPanel from "./index";

const api = vi.mocked(companionApi, true);

const DEVICE = {
  device_id: "24094RAD4C-abc",
  model: "Redmi Note 14 5G",
  manufacturer: "Xiaomi",
  online: true,
  android_sdk: 36,
  screen_width: 1080,
  screen_height: 2400,
  battery_level: 76,
  is_charging: false,
  current_app: "com.android.settings",
  paired_at: 1_800_000_000,
  last_seen: 1_800_000_100,
  has_snapshot: true,
  running_task_id: "t_1",
  running_task: "打开设置，查看 Android 版本",
  running_step: 3,
};

const SETTINGS = {
  provider: "",
  model: "",
  max_tokens: null,
  ready: false,
  candidates: [{ provider: "step", model: "step-3.7-flash", vision: true }],
};

beforeEach(() => {
  vi.clearAllMocks();
  currentUser.value = { role: "admin" };
  api.settings.mockResolvedValue(SETTINGS);
  api.snapshot.mockResolvedValue({ jpeg_base64: "aGk=" });
  api.cancelTask.mockResolvedValue({});
});

describe("<CompanionPhonesPanel />", () => {
  it("renders a paired phone with its running task and stops it", async () => {
    api.devices.mockResolvedValue({ devices: [DEVICE] });

    render(<CompanionPhonesPanel />);

    expect(await screen.findByText("Redmi Note 14 5G")).toBeInTheDocument();
    expect(screen.getByText("在线")).toBeInTheDocument();
    expect(screen.getByText("Android 16")).toBeInTheDocument();
    expect(screen.getByText("76%")).toBeInTheDocument();
    expect(screen.getByText("打开设置，查看 Android 版本")).toBeInTheDocument();
    expect(screen.getByText("第 3 步")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByAltText("手机屏幕")).toHaveAttribute(
        "src",
        "data:image/jpeg;base64,aGk=",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /停止/ }));
    await waitFor(() =>
      expect(api.cancelTask).toHaveBeenCalledWith("24094RAD4C-abc"),
    );
  });

  it("opens the pairing QR dialog and warns about loopback-only URLs", async () => {
    api.devices.mockResolvedValue({ devices: [] });
    api.createPairing.mockResolvedValue({
      url: "ws://127.0.0.1:18088/api/mobile/companion/ws?token=abc",
      expires_at: Math.floor(Date.now() / 1000) + 600,
      reachable_from_lan: false,
    });

    render(<CompanionPhonesPanel />);
    expect(await screen.findByText("还没有配对的手机")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /添加手机/ })[0]);

    expect(await screen.findByText("扫码添加手机")).toBeInTheDocument();
    expect(
      screen.getByText(
        "ws://127.0.0.1:18088/api/mobile/companion/ws?token=abc",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Octop 只监听本机，手机无法通过 Wi-Fi 连接"),
    ).toBeInTheDocument();
  });

  it("shows the model picker to admins and a hint to other users", async () => {
    api.devices.mockResolvedValue({ devices: [] });

    const { unmount } = render(<CompanionPhonesPanel />);
    expect(await screen.findByText("未配置")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    unmount();

    currentUser.value = { role: "user" };
    render(<CompanionPhonesPanel />);
    expect(
      await screen.findByText("请联系管理员配置手机端模型"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

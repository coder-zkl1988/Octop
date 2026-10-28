/**
 * CompanionPhones panel — phones paired through the companion app.
 *
 * Covers: tabby-style device cards (status, battery, stop / view screen,
 * rename), the pairing QR dialog and the admin-only model picker.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../api/modules/mobile", () => ({
  companionApi: {
    devices: vi.fn(),
    createPairing: vi.fn(),
    rename: vi.fn(),
    unpair: vi.fn(),
    cancelTask: vi.fn(),
    snapshot: vi.fn(),
    settings: vi.fn(),
    saveSettings: vi.fn(),
  },
}));

// Live thumbnails stream over WebSocket + WebCodecs; return a fixed image here.
vi.mock("./useDeviceThumbnail", () => ({
  useDeviceThumbnail: (_id: string, enabled: boolean) =>
    enabled ? "data:image/jpeg;base64,aGk=" : null,
}));

// The live mirror needs WebSocket + WebCodecs; the panel itself is not under test here.
vi.mock("./MirrorPanel", () => ({
  default: ({ device }: { device: { device_id: string } }) => (
    <div data-testid="mirror-panel">{device.device_id}</div>
  ),
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

const render = (ui: ReactElement) =>
  rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

const DEVICE = {
  device_id: "24094RAD4C-abc",
  name: "",
  model: "24094RAD4C",
  manufacturer: "Xiaomi",
  online: true,
  android_sdk: 36,
  screen_width: 1080,
  screen_height: 2400,
  battery_level: 76,
  is_charging: true,
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
  api.rename.mockResolvedValue({ ...DEVICE, name: "测试机" });
});

describe("<CompanionPhonesPanel />", () => {
  it("renders a busy phone card and stops its task", async () => {
    api.devices.mockResolvedValue({ devices: [DEVICE] });

    render(<CompanionPhonesPanel />);

    expect(await screen.findByText("24094RAD4C")).toBeInTheDocument();
    expect(screen.getByText("执行中")).toBeInTheDocument();
    expect(screen.getByText("com.android.settings")).toBeInTheDocument();
    expect(screen.getByText("76%")).toBeInTheDocument();
    expect(screen.getByText("⚡")).toBeInTheDocument();
    expect(
      document.querySelector("img[src^='data:image/jpeg']"),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /紧急停止/ }));
    await waitFor(() =>
      expect(api.cancelTask).toHaveBeenCalledWith("24094RAD4C-abc"),
    );
  });

  it("disables the stop button when idle and opens the live mirror", async () => {
    api.devices.mockResolvedValue({
      devices: [{ ...DEVICE, running_task_id: null, running_task: null }],
    });

    render(<CompanionPhonesPanel />);

    expect(await screen.findByText("空闲")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /紧急停止/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /查看屏幕/ }));
    expect(await screen.findByTestId("mirror-panel")).toHaveTextContent(
      "24094RAD4C-abc",
    );
  });

  it("renames a phone inline", async () => {
    api.devices.mockResolvedValue({ devices: [DEVICE] });

    render(<CompanionPhonesPanel />);
    await screen.findByText("24094RAD4C");

    fireEvent.click(screen.getByTitle("重命名"));
    const input = screen.getByDisplayValue("24094RAD4C");
    fireEvent.change(input, { target: { value: "测试机" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(api.rename).toHaveBeenCalledWith("24094RAD4C-abc", "测试机"),
    );
  });

  it("shows offline phones without a live view", async () => {
    api.devices.mockResolvedValue({
      devices: [{ ...DEVICE, online: false, running_task_id: null }],
    });

    render(<CompanionPhonesPanel />);

    expect(await screen.findByText("离线")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /查看屏幕/ })).toBeDisabled();
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

    fireEvent.click(screen.getByRole("button", { name: /扫码连接手机/ }));

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

  it("points admins to the models page when no phone model is set", async () => {
    api.devices.mockResolvedValue({ devices: [] });

    const { unmount } = render(<CompanionPhonesPanel />);
    expect(
      await screen.findByText(
        "还没有配置手机端视觉模型，手机暂时无法执行任务。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "前往配置" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    unmount();

    currentUser.value = { role: "user" };
    render(<CompanionPhonesPanel />);
    expect(
      await screen.findByText("请联系管理员配置手机端模型"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "前往配置" })).toBeNull();
  });

  it("hides the model hint once a phone model is ready", async () => {
    api.devices.mockResolvedValue({ devices: [] });
    api.settings.mockResolvedValue({
      ...SETTINGS,
      provider: "step",
      model: "step-3.7-flash",
      ready: true,
    });

    render(<CompanionPhonesPanel />);
    await screen.findByText("还没有配对的手机");
    await waitFor(() => expect(api.settings).toHaveBeenCalled());
    expect(
      screen.queryByText("还没有配置手机端视觉模型，手机暂时无法执行任务。"),
    ).toBeNull();
  });
});

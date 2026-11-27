import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Sidebar's import graph reaches pdfjs, which reads DOMMatrix at load time.
vi.hoisted(() => {
  if (typeof globalThis.DOMMatrix === "undefined") {
    globalThis.DOMMatrix = class DOMMatrix {} as unknown as typeof DOMMatrix;
  }
});
import { LayoutModeProvider } from "../context/LayoutModeContext";
import { LAYOUT_MODE_KEY } from "./layoutModeStorage";
import Sidebar from "./Sidebar";

vi.mock("../components/AvatarDropdown", () => ({
  default: () => null,
}));
vi.mock("../components/AppVersionBadge", () => ({
  default: () => null,
}));
vi.mock("../components/CurrentVersionBadge", () => ({
  default: () => null,
}));
vi.mock("../hooks/useUpdateStatus", () => ({
  useUpdateStatus: () => ({ hasUpdate: false }),
}));
vi.mock("../hooks/useServerCapabilities", () => ({
  useServerCapabilities: () => ({ mobileEnabled: false, loading: false }),
}));

function renderSidebar(opts: {
  collapsed: boolean;
  onToggle?: () => void;
  isMobile?: boolean;
}) {
  return render(
    <LayoutModeProvider>
      <MemoryRouter initialEntries={["/chat"]}>
        <Sidebar
          selectedKey="chat"
          collapsed={opts.collapsed}
          onToggle={opts.onToggle ?? (() => undefined)}
          isMobile={opts.isMobile ?? false}
        />
      </MemoryRouter>
    </LayoutModeProvider>,
  );
}

/**
 * The design's nav rail has no desktop fold button (Sidebar ignores
 * ``onNavFold``); only the mobile drawer close control and the mark remain.
 */
describe("nav rail fold control", () => {
  beforeEach(() => {
    localStorage.removeItem(LAYOUT_MODE_KEY);
  });

  it("does not cover the mark when the rail is collapsed", () => {
    renderSidebar({ collapsed: true });
    expect(
      screen.queryByRole("button", { name: /收起导航栏|展开导航栏/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps the mobile close control in its drawer header", async () => {
    const onToggle = vi.fn();
    renderSidebar({ collapsed: false, isMobile: true, onToggle });
    expect(
      screen.queryByRole("button", { name: /收起导航栏|展开导航栏/ }),
    ).not.toBeInTheDocument();

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "nav.collapseSidebar" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe("对话行上的会话开关", () => {
  beforeEach(() => {
    localStorage.removeItem(LAYOUT_MODE_KEY);
    localStorage.setItem("octop:chat-sidebar:open", "false");
  });

  it("用左右箭头按钮展开或收起对话历史", async () => {
    renderSidebar({ collapsed: false });
    const toggle = screen.getByRole("button", {
      name: /展开对话历史|收起对话历史/,
    });
    const wasOpen = toggle.getAttribute("aria-expanded") === "true";
    await userEvent.setup().click(toggle);
    expect(
      screen.getByRole("button", {
        name: wasOpen ? "展开对话历史" : "收起对话历史",
      }),
    ).toHaveAttribute("aria-expanded", wasOpen ? "false" : "true");
  });
});

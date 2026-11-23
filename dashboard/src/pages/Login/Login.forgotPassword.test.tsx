import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

vi.mock("../../api/modules/auth", () => ({
  authApi: {
    getAuthStatus: () => Promise.resolve({ setup_required: false }),
    getOauthStatus: () => Promise.resolve({ providers: [] }),
    getCaptcha: () => Promise.resolve({ provider: "none" }),
    getLdapStatus: () => Promise.resolve({ enabled: false, display_name: "" }),
    getPasskeyLoginStatus: () => Promise.resolve({ passwordless_login: false }),
  },
}));

vi.mock("../../utils/locale", () => ({
  applyGuestLocale: () => Promise.resolve(),
  applyUserLocale: () => Promise.resolve(),
}));

vi.mock("./CaptchaField", () => ({
  default: () => null,
}));

import LoginPage from "./index";

describe("Login forgot-password hint", () => {
  it("opens the enterprise password-management guidance when asked", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("login-forgot-password")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(await screen.findByTestId("login-forgot-password-toggle"));

    const dialog = await screen.findByRole("dialog");
    const hint = screen.getByTestId("login-forgot-password");
    expect(dialog).toContainElement(hint);
    expect(hint.textContent).toMatch(/enterprise\.auth\.forgot\.intro/);
    expect(hint.textContent).toMatch(/enterprise\.auth\.forgot\.step1/);
    expect(hint.textContent).toMatch(/enterprise\.auth\.forgot\.step2/);
    expect(hint.textContent).toMatch(/enterprise\.auth\.forgot\.step3/);
  });
});

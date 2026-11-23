import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { authApi } from "../../api/modules/auth";
import LoginPage from "./index";

vi.mock("../../context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

vi.mock("../../api/modules/auth", () => ({
  authApi: {
    getAuthStatus: async () => ({
      setup_required: false,
      enterprise_mode: true,
    }),
    getCaptcha: vi.fn(),
    getOauthStatus: vi.fn(),
    getLdapStatus: vi.fn(),
    getPasskeyLoginStatus: vi.fn(),
    validateEnterpriseInvitation: vi.fn(async () => ({
      email: "new-hire@example.test",
      tenant_name: "Test tenant",
    })),
    enterpriseRegister: vi.fn(async () => ({
      member_id: "test-member",
      status: "active",
    })),
  },
}));

vi.mock("../../utils/locale", () => ({
  applyGuestLocale: async () => {},
}));

it("uses enterprise login when the server advertises it and activates an invited account", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
  expect(await screen.findByPlaceholderText("login.workEmail")).toBeVisible();
  expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  expect(authApi.getCaptcha).not.toHaveBeenCalled();
  expect(authApi.getOauthStatus).not.toHaveBeenCalled();

  await user.click(
    screen.getByRole("link", { name: "login.enterpriseRegister.title" }),
  );
  await user.type(
    screen.getByLabelText("login.enterpriseRegister.invitation"),
    "https://enterprise.example.test/invite/tn_test.example-code",
  );
  await user.click(
    screen.getByRole("button", { name: "login.enterpriseRegister.check" }),
  );
  expect(authApi.validateEnterpriseInvitation).toHaveBeenCalledWith(
    "tn_test.example-code",
  );

  await user.type(
    await screen.findByLabelText("login.enterpriseRegister.name"),
    "New Hire",
  );
  await user.type(screen.getByLabelText("login.password"), "example-password");
  await user.type(
    screen.getByLabelText("login.enterpriseRegister.confirmPassword"),
    "example-password",
  );
  await user.click(
    screen.getByRole("button", { name: "login.enterpriseRegister.submit" }),
  );
  expect(authApi.enterpriseRegister).toHaveBeenCalledWith(
    "tn_test.example-code",
    "New Hire",
    "example-password",
  );
  expect(await screen.findByPlaceholderText("login.workEmail")).toHaveValue(
    "new-hire@example.test",
  );
});

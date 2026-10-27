import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import zh from "../../../locales/zh.json";
import type { AuthStatus } from "../../../api/modules/auth";
import DatabaseStep from "./DatabaseStep";

const { getAuthStatus, applyDatabase } = vi.hoisted(() => ({
  getAuthStatus: vi.fn(),
  applyDatabase: vi.fn(),
}));

vi.mock("../../../api/modules/auth", () => ({
  authApi: { getAuthStatus },
}));

vi.mock("../wizardClient", () => ({
  wizardApi: { applyDatabase, testDatabase: vi.fn() },
}));

// Resolve keys against the real zh bundle so assertions read like the UI.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const text = key
        .split(".")
        .reduce<unknown>(
          (node, part) => (node as Record<string, unknown> | undefined)?.[part],
          zh,
        );
      if (typeof text !== "string") return key;
      return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(options?.[name] ?? ""),
      );
    },
  }),
}));

function boundStatus(overrides: Partial<AuthStatus>): AuthStatus {
  return {
    setup_required: true,
    setup_done: false,
    enabled: true,
    has_password: true,
    wizard_password_exists: true,
    wizard_password_required: true,
    database_bound: true,
    database_driver: "postgresql",
    database_from_env: false,
    ...overrides,
  };
}

function renderStep() {
  const onContinue = vi.fn();
  render(
    <DatabaseStep
      onContinue={onContinue}
      ensureWizardToken={() => Promise.resolve("wizard-token")}
    />,
  );
  return { onContinue };
}

describe("DatabaseStep with a bound database", () => {
  beforeEach(() => {
    getAuthStatus.mockReset();
    applyDatabase.mockReset();
  });

  it("shows bound PostgreSQL as the current database instead of a SQLite path", async () => {
    getAuthStatus.mockResolvedValue(boundStatus({}));
    const user = userEvent.setup();
    const { onContinue } = renderStep();

    expect(
      await screen.findByText("当前数据库：PostgreSQL"),
    ).toBeInTheDocument();
    expect(screen.queryByText("SQLite（本地文件）")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("octop.db")).not.toBeInTheDocument();

    // Switching stays available before the admin exists.
    await user.click(screen.getByRole("button", { name: /更换数据库/ }));
    expect(
      screen.getByText(/使用下方的 PostgreSQL 连接替换当前数据库/),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "使用当前数据库继续" }),
    );
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(applyDatabase).not.toHaveBeenCalled();
  });

  it("hides the switch when OCTOP_DATABASE_* env vars pick the database", async () => {
    getAuthStatus.mockResolvedValue(boundStatus({ database_from_env: true }));
    renderStep();

    expect(
      await screen.findByText("当前数据库：PostgreSQL"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/由 OCTOP_DATABASE_\* 环境变量指定/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /更换数据库/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("PostgreSQL")).not.toBeInTheDocument();
  });

  it("does not claim SQLite when the bound driver is unknown", async () => {
    getAuthStatus.mockResolvedValue(boundStatus({ database_driver: null }));
    renderStep();

    expect(await screen.findByText("控制面数据库已就绪")).toBeInTheDocument();
    expect(screen.getByRole("alert")).not.toHaveTextContent(/SQLite/);
    expect(screen.queryByPlaceholderText("octop.db")).not.toBeInTheDocument();
  });

  it("keeps SQLite as the default choice when nothing is bound yet", async () => {
    getAuthStatus.mockResolvedValue(
      boundStatus({ database_bound: false, database_driver: null }),
    );
    renderStep();

    expect(await screen.findByText("SQLite（本地文件）")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("octop.db")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "保存并继续" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/当前数据库/)).not.toBeInTheDocument();
  });
});

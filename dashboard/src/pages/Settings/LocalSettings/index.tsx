import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button, Card, Empty, Table, Tag } from "antd";
import {
  FolderOpen,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Variable,
} from "lucide-react";
import { request } from "../../../api/request";
import TabBar, { type TabBarItem } from "../../../components/TabLabel/TabBar";
import AccountSecurityDrawer from "../../../components/AccountSecurityDrawer";
import PageShell from "../../../layouts/PageShell";
import { useEnterprise } from "../../../enterprise/EnterpriseContext";
import { useGatedSearchTabs } from "../../../hooks/useGatedSearchTabs";
import { PERM } from "../../../utils/permissions";
import EnvironmentsPage from "../Environments";
import UpdateConfig from "../AdvancedSettings/UpdateConfig";
import tabStyles from "../AdvancedSettings/tabContent.module.less";
import styles from "./index.module.less";

// 本机设置: what only concerns this computer. Enterprise-managed parts are read-only.

type TabKey = "workspace" | "env-vars" | "approval" | "passkeys" | "updates";

const TABS: TabBarItem<TabKey>[] = [
  {
    key: "workspace",
    labelKey: "localSettings.tabs.workspace",
    icon: FolderOpen,
  },
  { key: "env-vars", labelKey: "nav.environments", icon: Variable },
  {
    key: "approval",
    labelKey: "localSettings.tabs.approval",
    icon: ShieldCheck,
  },
  { key: "passkeys", labelKey: "nav.passkeys", icon: KeyRound },
  { key: "updates", labelKey: "nav.checkUpdates", icon: RefreshCw },
];

// The page is reached through the advanced-settings gate; each tab keeps its own key.
const TAB_PERMISSIONS: Record<TabKey, readonly string[]> = {
  workspace: PERM.advancedPage,
  "env-vars": ["envs"],
  approval: PERM.advancedPage,
  passkeys: PERM.advancedPage,
  updates: ["update"],
};

function parseTab(raw: string | null): TabKey {
  return TABS.some((tab) => tab.key === raw) ? (raw as TabKey) : "workspace";
}

export default function LocalSettingsPage() {
  const { t } = useTranslation();
  const { allowedTabs, activeTab, selectTab } = useGatedSearchTabs({
    tabs: TABS,
    tabPermissions: TAB_PERMISSIONS,
    parseTab,
    querylessKey: "workspace",
  });

  const renderTab = () => {
    switch (activeTab) {
      case "env-vars":
        return <EnvironmentsPage />;
      case "approval":
        return <ApprovalPanel />;
      case "passkeys":
        return <PasskeysPanel />;
      case "updates":
        return <UpdateConfig />;
      default:
        return <WorkspacePanel />;
    }
  };

  return (
    <PageShell.Tabbed
      title={t("localSettings.title")}
      subtitle={t("localSettings.subtitle")}
      tabBar={
        <TabBar tabs={allowedTabs} activeKey={activeTab} onChange={selectTab} />
      }
    >
      <div className={tabStyles.tabContent}>{renderTab()}</div>
    </PageShell.Tabbed>
  );
}

interface AgentRow {
  agent_id: string;
  name: string;
  config?: { workspace_dir?: string };
}

function WorkspacePanel() {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<AgentRow[] | null>(null);
  useEffect(() => {
    request<AgentRow[]>("/agents")
      .then(setAgents)
      .catch(() => setAgents([]));
  }, []);
  const dirs = new Map<string, string[]>();
  for (const agent of agents ?? []) {
    const dir = agent.config?.workspace_dir;
    if (dir) dirs.set(dir, [...(dirs.get(dir) ?? []), agent.name]);
  }
  const rows = [...dirs.entries()].map(([dir, names]) => ({ dir, names }));
  return (
    <div className={styles.stack}>
      <Card
        title={t("localSettings.workspace.title")}
        extra={<Link to="/experts">{t("localSettings.workspace.manage")}</Link>}
      >
        <p className={styles.desc}>{t("localSettings.workspace.desc")}</p>
        <Table
          size="middle"
          rowKey="dir"
          loading={agents === null}
          pagination={false}
          dataSource={rows}
          locale={{
            emptyText: (
              <Empty description={t("localSettings.workspace.empty")} />
            ),
          }}
          columns={[
            {
              title: t("localSettings.workspace.colDir"),
              dataIndex: "dir",
              render: (dir: string) => (
                <span className={styles.mono}>{dir}</span>
              ),
            },
            {
              title: t("localSettings.workspace.colAccess"),
              render: () => <Tag>{t("localSettings.workspace.readWrite")}</Tag>,
            },
            {
              title: t("localSettings.workspace.colExperts"),
              dataIndex: "names",
              render: (names: string[]) => names.join("、"),
            },
          ]}
        />
      </Card>
    </div>
  );
}

const APPROVAL_LABEL = {
  every: "localSettings.approval.every",
  first: "localSettings.approval.first",
  auto: "localSettings.approval.auto",
} as const;

function ApprovalPanel() {
  const { t } = useTranslation();
  const { snapshot } = useEnterprise();
  const policy = snapshot?.policy;
  return (
    <div className={styles.stack}>
      <Card title={t("localSettings.approval.title")}>
        <p className={styles.desc}>{t("localSettings.approval.desc")}</p>
        {policy ? (
          <div className={styles.row}>
            <span>{t("localSettings.approval.enterprise")}</span>
            <Tag color={policy.toolApprovalForced ? "orange" : undefined}>
              {t(APPROVAL_LABEL[policy.approvalMode] ?? APPROVAL_LABEL.every)}
              {policy.toolApprovalForced
                ? ` · ${t("localSettings.approval.forced")}`
                : ""}
            </Tag>
          </div>
        ) : null}
        <p className={styles.desc}>{t("localSettings.approval.perChat")}</p>
      </Card>
    </div>
  );
}

function PasskeysPanel() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.stack}>
      <Card title={t("nav.passkeys")}>
        <p className={styles.desc}>{t("localSettings.passkeys.desc")}</p>
        <Button type="primary" onClick={() => setOpen(true)}>
          {t("localSettings.passkeys.manage")}
        </Button>
      </Card>
      <AccountSecurityDrawer open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

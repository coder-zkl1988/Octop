import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button, Card, Empty, Modal, Table, Tag } from "antd";
import {
  FolderOpen,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Variable,
} from "lucide-react";
import {
  localSettingsApi,
  type LocalWorkspaceFolder,
  type LocalWorkspaceFolders,
} from "../../../api/modules/localSettings";
import TabBar, { type TabBarItem } from "../../../components/TabLabel/TabBar";
import AccountSecurityDrawer from "../../../components/AccountSecurityDrawer";
import PageShell from "../../../layouts/PageShell";
import { useEnterprise } from "../../../enterprise/EnterpriseContext";
import { useGatedSearchTabs } from "../../../hooks/useGatedSearchTabs";
import { PERM } from "../../../utils/permissions";
import { apiErrorMessage } from "../../../utils/apiError";
import { formatBytes } from "../../../utils/embeddingDownload";
import { message } from "@/utils/antdMessage";
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

function WorkspacePanel() {
  const { t } = useTranslation();
  const { snapshot } = useEnterprise();
  const [data, setData] = useState<LocalWorkspaceFolders | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    localSettingsApi
      .workspaces()
      .then(setData)
      .catch(() => setData({ items: [], can_reveal: false }));
  }, []);

  const reveal = async (path: string) => {
    try {
      await localSettingsApi.reveal(path);
    } catch (err) {
      message.error(
        apiErrorMessage(err, t("localSettings.workspace.revealFailed"), t),
      );
    }
  };

  const runExport = async () => {
    setExporting(true);
    try {
      const result = await localSettingsApi.exportMyData();
      setExportOpen(false);
      message.success(
        t("localSettings.export.done", {
          path: result.path,
          size: formatBytes(result.size_bytes),
        }),
      );
    } catch (err) {
      message.error(apiErrorMessage(err, t("localSettings.export.failed"), t));
    } finally {
      setExporting(false);
    }
  };

  const policy = snapshot?.policy;
  const roots = policy?.fsRoots ?? [];
  const denyRoots = policy?.fsDenyRoots ?? [];
  const denyCommands = policy?.denyCommands ?? [];
  const hasLimits =
    roots.length > 0 || denyRoots.length > 0 || denyCommands.length > 0;

  return (
    <div className={styles.stack}>
      <Card
        title={t("localSettings.workspace.title")}
        extra={<Link to="/experts">{t("localSettings.workspace.manage")}</Link>}
      >
        <p className={styles.desc}>{t("localSettings.workspace.desc")}</p>
        <Table<LocalWorkspaceFolder>
          size="middle"
          rowKey="path"
          loading={data === null}
          pagination={false}
          dataSource={data?.items ?? []}
          locale={{
            emptyText: (
              <Empty description={t("localSettings.workspace.empty")} />
            ),
          }}
          columns={[
            {
              title: t("localSettings.workspace.colDir"),
              dataIndex: "path",
              render: (path: string, row) => (
                <span className={styles.mono}>
                  {path}
                  {row.missing ? (
                    <Tag className={styles.inlineTag}>
                      {t("localSettings.workspace.missing")}
                    </Tag>
                  ) : null}
                </span>
              ),
            },
            {
              title: t("localSettings.workspace.colAccess"),
              render: () => <Tag>{t("localSettings.workspace.readWrite")}</Tag>,
            },
            {
              title: t("localSettings.workspace.colExperts"),
              dataIndex: "experts",
              render: (experts: LocalWorkspaceFolder["experts"]) =>
                experts.map((expert) => expert.name).join("、"),
            },
            {
              title: t("localSettings.workspace.colSize"),
              dataIndex: "size_bytes",
              align: "right",
              render: (size: number, row) =>
                row.missing
                  ? "—"
                  : `${row.truncated ? "≥ " : ""}${formatBytes(size)}`,
            },
            ...(data?.can_reveal
              ? [
                  {
                    key: "actions",
                    align: "right" as const,
                    render: (_: unknown, row: LocalWorkspaceFolder) =>
                      row.missing ? null : (
                        <Button
                          size="small"
                          type="link"
                          onClick={() => void reveal(row.path)}
                        >
                          {t("localSettings.workspace.reveal")}
                        </Button>
                      ),
                  },
                ]
              : []),
          ]}
        />
      </Card>
      {hasLimits ? (
        <Card title={t("localSettings.limits.title")}>
          <p className={styles.desc}>{t("localSettings.limits.desc")}</p>
          {roots.length > 0 ? (
            <LimitRow
              label={t("localSettings.limits.roots")}
              items={roots}
              hint={t("localSettings.limits.rootsHint")}
            />
          ) : null}
          {denyRoots.length > 0 ? (
            <LimitRow
              label={t("localSettings.limits.denyRoots")}
              items={denyRoots}
            />
          ) : null}
          {denyCommands.length > 0 ? (
            <LimitRow
              label={t("localSettings.limits.denyCommands")}
              items={denyCommands}
            />
          ) : null}
        </Card>
      ) : null}
      <Card title={t("localSettings.export.title")}>
        <p className={styles.desc}>{t("localSettings.export.desc")}</p>
        <Button onClick={() => setExportOpen(true)}>
          {t("localSettings.export.action")}
        </Button>
      </Card>
      <Modal
        open={exportOpen}
        title={t("localSettings.export.title")}
        okText={t("localSettings.export.start")}
        cancelText={t("common.cancel")}
        confirmLoading={exporting}
        onOk={() => void runExport()}
        onCancel={() => setExportOpen(false)}
      >
        <p>
          {snapshot
            ? t("localSettings.export.confirmEnterprise")
            : t("localSettings.export.confirm")}
        </p>
      </Modal>
    </div>
  );
}

function LimitRow({
  label,
  items,
  hint,
}: {
  label: string;
  items: string[];
  hint?: string;
}) {
  return (
    <div className={styles.limitRow}>
      <span className={styles.limitLabel}>{label}</span>
      <span>
        {items.map((item) => (
          <Tag key={item} className={styles.mono}>
            {item}
          </Tag>
        ))}
        {hint ? <span className={styles.desc}>{hint}</span> : null}
      </span>
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

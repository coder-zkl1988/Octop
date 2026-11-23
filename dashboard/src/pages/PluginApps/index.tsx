import { useEffect, useState } from "react";
import { Alert, Card, Empty, List, Spin, Tag, Typography } from "antd";
import { LockKeyhole, RefreshCw } from "lucide-react";
import { useParams } from "react-router-dom";
import PageShell from "../../layouts/PageShell";
import {
  pluginAppsApi,
  pluginAppAccess,
  type PluginApp,
  type PluginAppSnapshot,
} from "../../api/modules/pluginApps";
import { pluginsApi } from "../../api/modules/plugins";
import { createPluginUiHost } from "../../plugins/toolRenderers/host";
import {
  getPluginPage,
  subscribeToolRenderers,
} from "../../plugins/toolRenderers/registry";
import { loadInstalledPluginUis } from "../../plugins/toolRenderers/loader";
import type { PluginPageProps } from "../../plugins/toolRenderers/types";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";

const { Text, Title } = Typography;

function isReadOnlyLicense(app: PluginApp): boolean {
  return pluginAppAccess(app) === "read";
}

export default function PluginAppPage() {
  const { t } = useTranslation();
  const { pluginId = "" } = useParams<{ pluginId: string }>();
  const [app, setApp] = useState<PluginApp | null>(null);
  const [snapshot, setSnapshot] = useState<PluginAppSnapshot | null>(null);
  const [page, setPage] = useState<ReturnType<typeof getPluginPage>>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setApp(null);
    setSnapshot(null);
    setPage(null);
    void (async () => {
      try {
        const apps = await pluginAppsApi.list();
        const next = apps.find((item) => item.id === pluginId) ?? null;
        if (!next) throw new Error(t("pluginApps.notFound"));
        if (cancelled) return;
        setApp(next);
        if (pluginAppAccess(next) !== "locked") {
          setSnapshot(await pluginAppsApi.snapshot(pluginId));
        }
        if (next.ui?.entry) {
          const installed = await pluginsApi.list();
          await loadInstalledPluginUis(
            installed.some((item) => item.id === pluginId)
              ? installed
              : [
                  {
                    id: next.id,
                    name: next.name,
                    version:
                      next.version == null ? undefined : String(next.version),
                    ui: {
                      entry: next.ui.entry,
                      manifest: next.ui.manifest ?? "",
                    },
                  },
                ],
          );
        }
        if (!cancelled) setPage(getPluginPage(pluginId));
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : t("pluginApps.loadFailed"),
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pluginId]);

  useEffect(
    () => subscribeToolRenderers(() => setPage(getPluginPage(pluginId))),
    [pluginId],
  );

  if (error)
    return (
      <PageShell title={t("pluginApps.title")}>
        <Alert type="error" message={error} />
      </PageShell>
    );
  if (!app)
    return (
      <PageShell title={t("pluginApps.title")}>
        <Spin />
      </PageShell>
    );
  if (pluginAppAccess(app) === "locked") {
    return (
      <PageShell
        title={app.name}
        subtitle={app.version == null ? undefined : String(app.version)}
      >
        <Card>
          <Empty
            image={<LockKeyhole size={42} />}
            description={t("pluginApps.licenseRequired")}
          />
          <Typography.Paragraph
            type="secondary"
            style={{ textAlign: "center" }}
          >
            {t("pluginApps.contactAdmin")}
          </Typography.Paragraph>
          {app.ui && (
            <List
              size="small"
              header={t("pluginApps.features")}
              dataSource={[
                t("pluginApps.projectAccount"),
                t("pluginApps.runsAudit"),
                t("pluginApps.devicesDiagnosis"),
              ]}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          )}
        </Card>
      </PageShell>
    );
  }

  const Component = page?.component as
    | ComponentType<PluginPageProps>
    | undefined;
  return (
    <PageShell
      title={app.name}
      subtitle={app.version == null ? undefined : String(app.version)}
      actions={
        isReadOnlyLicense(app) ? (
          <Tag icon={<RefreshCw size={12} />}>{t("pluginApps.readOnly")}</Tag>
        ) : undefined
      }
      fill
    >
      {Component ? (
        <Component host={createPluginUiHost(pluginId)} license={app.license} />
      ) : snapshot ? (
        <Card>
          <Title level={4}>{t("pluginApps.appData")}</Title>
          <Text type="secondary">{t("pluginApps.uiLoading")}</Text>
        </Card>
      ) : (
        <Spin />
      )}
    </PageShell>
  );
}

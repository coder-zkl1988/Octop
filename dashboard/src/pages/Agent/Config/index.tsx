import { useEffect, useState } from "react";
import { Form, Button, Card, Collapse, Switch } from "antd";
import { message } from "@/utils/antdMessage";

import { useTranslation } from "react-i18next";
import { request } from "../../../api/request";
import { agentApi } from "../../../api/modules/agent";
import type { HeartbeatConfig } from "../../../api/types";
import { AgentAdvancedConfigFields } from "../../../components/AgentAdvancedConfigFields";
import { useAgent } from "../../../context/AgentContext";
import {
  buildAgentRuntimeRequest,
  omitAgentRuntimeConfig,
  readAgentRuntimeFormValues,
} from "../../../utils/agentRuntimeConfig";
import styles from "./index.module.less";

// Config keys that live in their own columns; the drawer strips them the same way.
const COLUMN_KEYS = [
  "color",
  "icon_name",
  "icon_url",
  "expert_id",
  "skill_package_ids",
  "published_expert_id",
  "welcome_message",
  "knowledge_base_ids",
  "mcp_servers",
];

function AgentConfigPage() {
  const { t } = useTranslation();
  const { activeAgent, activeAgentId, refresh } = useAgent();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [heartbeat, setHeartbeat] = useState<HeartbeatConfig | null>(null);

  const load = async () => {
    if (!activeAgentId) return;
    const detail = await request<{ config?: Record<string, unknown> }>(
      `/agents/${activeAgentId}`,
    );
    const cfg = detail.config ?? {};
    setConfig(cfg);
    form.setFieldsValue({
      ...readAgentRuntimeFormValues(activeAgent ?? {}),
      enable_trajectory: cfg.enable_trajectory !== false,
    });
    const hb = await agentApi.getHeartbeatConfig().catch(() => null);
    setHeartbeat(hb && typeof hb.enabled === "boolean" ? hb : null);
    form.setFieldValue("heartbeat_enabled", hb?.enabled === true);
  };

  useEffect(() => {
    if (!activeAgentId) {
      setLoading(false);
      setError(t("agentConfig.noActiveAgent"));
      return;
    }
    setLoading(true);
    setError(null);
    load()
      .catch(() => setError(t("agentConfig.loadFailed")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAgent, activeAgentId]);

  const handleSave = async () => {
    if (!activeAgentId) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      const nextConfig = omitAgentRuntimeConfig({
        ...config,
        enable_trajectory: values.enable_trajectory === true,
      });
      for (const key of COLUMN_KEYS) delete nextConfig[key];
      await request(`/agents/${activeAgentId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...buildAgentRuntimeRequest(values, { clearMissing: true }),
          config: nextConfig,
        }),
      });
      if (
        heartbeat &&
        heartbeat.enabled !== (values.heartbeat_enabled === true)
      ) {
        setHeartbeat(
          await agentApi.updateHeartbeatConfig({
            ...heartbeat,
            enabled: values.heartbeat_enabled === true,
          }),
        );
      }
      await refresh({ silent: true, force: true });
      message.success(t("agentConfig.saveSuccess"));
    } catch (err) {
      if (err instanceof Error && "errorFields" in err) {
        return;
      }
      const errMsg =
        err instanceof Error ? err.message : t("agentConfig.saveFailed");
      message.error(errMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    form.setFieldsValue({
      ...readAgentRuntimeFormValues(activeAgent ?? {}),
      enable_trajectory: config.enable_trajectory !== false,
      heartbeat_enabled: heartbeat?.enabled === true,
    });
  };

  const agentLabel = [activeAgent?.name, activeAgent?.description]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={styles.page}>
      {loading && (
        <div className={styles.centerState}>
          <span className={styles.stateText}>{t("common.loading")}</span>
        </div>
      )}

      {error && !loading && (
        <div className={styles.centerState}>
          <span className={styles.stateTextError}>{error}</span>
        </div>
      )}

      <div style={{ display: loading || error ? "none" : "block" }}>
        <div className={styles.header}>
          <div>
            <h1 className="is-page-title">{t("agentConfig.title")}</h1>
            <p className={styles.description}>{t("agentConfig.description")}</p>
          </div>
          <div className={styles.headerActions}>
            {agentLabel && (
              <span className={styles.currentAgent}>
                {t("agentConfig.currentAgent", { name: agentLabel })}
              </span>
            )}
            <Button onClick={handleReset} disabled={saving}>
              {t("common.reset")}
            </Button>
            <Button type="primary" onClick={handleSave} loading={saving}>
              {t("common.save")}
            </Button>
          </div>
        </div>

        <Form form={form} layout="vertical" className={styles.form}>
          <Card
            className={styles.formCard}
            title={t("agentConfig.sectionModel")}
          >
            <div className={styles.grid}>
              <AgentAdvancedConfigFields requireLimits only="basic" />
            </div>
          </Card>

          <Card
            className={styles.formCard}
            title={t("agentConfig.sectionBehavior")}
          >
            <BehaviorRow
              name="enable_trajectory"
              title={t("agentConfig.enableTrajectory")}
              desc={t("agentConfig.enableTrajectoryDesc")}
            />
            <BehaviorRow
              name={["compaction", "enabled"]}
              title={t("agentConfig.compaction.enabled")}
              desc={t("agentConfig.compaction.enabledDesc")}
              initialValue
            />
            {heartbeat && (
              <BehaviorRow
                name="heartbeat_enabled"
                title={t("agentConfig.heartbeat")}
                desc={t("agentConfig.heartbeatDesc")}
              />
            )}
          </Card>

          <Collapse
            className={styles.advanced}
            ghost
            items={[
              {
                key: "advanced",
                label: t("agentConfig.sectionAdvanced"),
                forceRender: true,
                children: (
                  <div className={styles.grid}>
                    <AgentAdvancedConfigFields only="advanced" />
                  </div>
                ),
              },
            ]}
          />
        </Form>
      </div>
    </div>
  );
}

function BehaviorRow({
  name,
  title,
  desc,
  initialValue,
}: {
  name: string | string[];
  title: string;
  desc: string;
  initialValue?: boolean;
}) {
  return (
    <div className={styles.behaviorRow}>
      <div>
        <div className={styles.behaviorTitle}>{title}</div>
        <div className={styles.behaviorDesc}>{desc}</div>
      </div>
      <Form.Item
        name={name}
        valuePropName="checked"
        initialValue={initialValue}
        noStyle
      >
        <Switch aria-label={title} />
      </Form.Item>
    </div>
  );
}

export default AgentConfigPage;

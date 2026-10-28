import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Select, Spin, Tag, Typography } from "antd";
import { message } from "@/utils/antdMessage";
import {
  companionApi,
  type CompanionSettings,
} from "../../../../api/modules/mobile";
import { useCurrentUser } from "../../../../hooks/useCurrentUser";
import styles from "./PhoneModelSettingsPanel.module.less";

function candidateValue(provider: string, model: string): string {
  return `${provider}\u0000${model}`;
}

/**
 * Vision model the on-phone agent uses (companion app phones).
 *
 * The phone calls it through Octop's proxy, so the provider key stays on the
 * server. Admins choose it; other users see the current choice.
 */
export function PhoneModelSettingsPanel() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const isAdmin = user?.role === "admin";
  const [settings, setSettings] = useState<CompanionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [choice, setChoice] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await companionApi.settings();
      setSettings(data);
      setChoice(
        data.provider && data.model
          ? candidateValue(data.provider, data.model)
          : undefined,
      );
    } catch {
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!choice) return;
    const [provider, model] = choice.split("\u0000");
    setSaving(true);
    try {
      setSettings(await companionApi.saveSettings({ provider, model }));
      message.success(t("companionPhone.modelSaved", "手机端模型已更新"));
    } catch {
      message.error(t("companionPhone.modelSaveFailed", "保存失败"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spin />
      </div>
    );
  }

  const options = (settings?.candidates ?? []).map((c) => ({
    value: candidateValue(c.provider, c.model),
    label: (
      <span className={styles.option}>
        <span>
          {c.provider} / {c.model}
        </span>
        {c.vision ? (
          <Tag color="blue" bordered={false}>
            {t("companionPhone.vision", "视觉")}
          </Tag>
        ) : null}
      </span>
    ),
  }));

  return (
    <section className={styles.card}>
      <div className={styles.title}>
        <span>{t("companionPhone.modelTitle", "手机端视觉模型")}</span>
        {settings?.ready ? (
          <Tag color="success" bordered={false}>
            {t("companionPhone.modelReady", "已就绪")}
          </Tag>
        ) : (
          <Tag color="warning" bordered={false}>
            {t("companionPhone.modelMissing", "未配置")}
          </Tag>
        )}
      </div>
      <Typography.Text type="secondary" className={styles.hint}>
        {t(
          "companionPhone.modelHint",
          "手机上的 Agent 用这个支持看图的模型操作屏幕。请求经 Octop 转发，模型密钥不会下发到手机。",
        )}
      </Typography.Text>
      {isAdmin ? (
        <div className={styles.row}>
          <Select
            className={styles.select}
            placeholder={t(
              "companionPhone.modelPlaceholder",
              "选择 OpenAI 兼容的视觉模型",
            )}
            value={choice}
            onChange={setChoice}
            options={options}
            showSearch
            optionFilterProp="value"
            notFoundContent={t(
              "companionPhone.noCandidates",
              "没有可用的 OpenAI 兼容模型，请先在模型设置中添加",
            )}
          />
          <Button
            type="primary"
            loading={saving}
            disabled={!choice}
            onClick={() => void save()}
          >
            {t("companionPhone.saveModel", "保存")}
          </Button>
        </div>
      ) : (
        <Typography.Text>
          {settings?.provider && settings.model
            ? `${settings.provider} / ${settings.model}`
            : t("companionPhone.askAdmin", "请联系管理员配置手机端模型")}
        </Typography.Text>
      )}
    </section>
  );
}

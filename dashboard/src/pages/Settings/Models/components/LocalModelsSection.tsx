/**
 * LocalModelsSection — the tenant's local-model whitelist with live Ollama /
 * ONNX download state. Members can download whitelisted models and switch
 * downloaded ones on; whether local models are allowed at all is policy.
 */
import { Button, Switch } from "antd";
import { Cpu, Download, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LocalModel } from "../../../../enterprise/types";
import type { LocalRuntimes } from "../useLocalRuntimes";
import styles from "../enterpriseModels.module.less";

/** Default Ollama endpoint the desktop runtime listens on. */
const OLLAMA_ADDRESS = "localhost:11434";

type RowStatus = "enabled" | "downloaded" | "notDownloaded" | "downloading";

const STATUS_BADGE: Record<RowStatus, string> = {
  enabled: "is-badge is-badge--dot is-badge--success",
  downloaded: "is-badge is-badge--dot",
  notDownloaded: "is-badge",
  downloading: "is-badge is-badge--dot is-badge--warning",
};

interface LocalModelsSectionProps {
  models: LocalModel[];
  /** Tenant policy: local models allowed (locked by the admin). */
  allowed: boolean;
  /** Member's on/off choice for a downloaded model. */
  isEnabled: (model: LocalModel) => boolean;
  togglingId: string | null;
  onToggle: (model: LocalModel, enabled: boolean) => void;
  runtimes: LocalRuntimes;
}

export function LocalModelsSection({
  models,
  allowed,
  isEnabled,
  togglingId,
  onToggle,
  runtimes,
}: LocalModelsSectionProps) {
  const { t } = useTranslation();

  return (
    <section className={styles.section} aria-labelledby="ent-local-models">
      <div className={styles.sectionHead}>
        <div className={styles.sectionTitleRow}>
          <h3 id="ent-local-models" className={styles.sectionTitle}>
            {t("enterprise.settings.models.local.title")}
          </h3>
          <span className="is-badge">
            {t("enterprise.settings.models.local.free")}
          </span>
          <span className={styles.sectionMeta}>
            {t("enterprise.settings.models.local.meta")}
          </span>
        </div>
        {runtimes.ollamaRunning === true && (
          <span className="is-dot is-dot--running">
            {t("enterprise.settings.models.local.ollamaRunning")} ·{" "}
            <span className="num">{OLLAMA_ADDRESS}</span>
          </span>
        )}
        {runtimes.ollamaRunning === false && (
          <span className="is-dot">
            {t("enterprise.settings.models.local.ollamaStopped")}
          </span>
        )}
      </div>
      <p className={styles.sectionDesc}>
        {t("enterprise.settings.models.local.desc")}
      </p>

      <div className={styles.policy}>
        <div className={styles.policyText}>
          <span className={styles.policyTitle}>
            {t("enterprise.settings.models.local.policyTitle")}
          </span>
          <span className={styles.lock}>
            <Lock size={13} aria-hidden />
            {t("enterprise.core.lockedByAdmin")}
          </span>
        </div>
        <Switch
          checked={allowed}
          disabled
          className={styles.lockedSwitch}
          aria-label={t("enterprise.settings.models.local.policyTitle")}
        />
      </div>

      <div
        className={`${styles.table} ${styles.tableLocal}`}
        role="table"
        aria-labelledby="ent-local-models"
      >
        <div className={`${styles.tr} ${styles.th}`} role="row">
          <span role="columnheader">
            {t("enterprise.settings.models.local.colModel")}
          </span>
          <span role="columnheader">
            {t("enterprise.settings.models.local.colRuntime")}
          </span>
          <span role="columnheader">
            {t("enterprise.settings.models.local.colUse")}
          </span>
          <span role="columnheader" className={styles.r}>
            {t("enterprise.settings.models.local.colSize")}
          </span>
          <span role="columnheader">
            {t("enterprise.settings.models.local.colStatus")}
          </span>
          <span role="columnheader" className={styles.r}>
            {t("enterprise.settings.models.local.colActions")}
          </span>
        </div>
        {models.map((m) => {
          const downloading = runtimes.downloading.has(m.id);
          const downloaded =
            runtimes.isDownloaded(m) ?? m.status !== "not-downloaded";
          const on = downloaded && isEnabled(m);
          const status: RowStatus = downloading
            ? "downloading"
            : !downloaded
            ? "notDownloaded"
            : on
            ? "enabled"
            : "downloaded";
          return (
            <div key={m.id} role="row" className={styles.tr}>
              <span role="cell" className={styles.name}>
                <span className={styles.ic}>
                  <Cpu size={16} aria-hidden />
                </span>
                <span className="mono">{m.id}</span>
              </span>
              <span role="cell" className={styles.desc}>
                {m.runtime}
              </span>
              <span role="cell" className={styles.desc}>
                {t(`enterprise.settings.models.local.use.${m.use}`)}
              </span>
              <span role="cell" className={`${styles.r} num`}>
                {m.sizeGb.toFixed(1)} GB
              </span>
              <span role="cell">
                <span className={STATUS_BADGE[status]}>
                  {t(`enterprise.settings.models.local.status.${status}`)}
                </span>
              </span>
              <span role="cell" className={styles.r}>
                {downloaded && !downloading ? (
                  <Switch
                    checked={on}
                    disabled={!allowed}
                    loading={togglingId === m.id}
                    aria-label={t(
                      "enterprise.settings.models.local.enableModel",
                      {
                        model: m.id,
                      },
                    )}
                    onChange={(next) => onToggle(m, next)}
                  />
                ) : (
                  <Button
                    size="small"
                    icon={<Download size={14} />}
                    loading={downloading}
                    disabled={!allowed}
                    onClick={() => void runtimes.download(m)}
                  >
                    {t("enterprise.settings.models.local.download")}
                  </Button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <p className={styles.foot}>
        {t("enterprise.settings.models.local.footnote")}
      </p>
    </section>
  );
}

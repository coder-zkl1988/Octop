/**
 * CloudModelsSection — the tenant's cloud models, read-only. The star picks
 * the member's default chat model; everything else is set by the admin.
 */
import { Cloud, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatPoints } from "../../../../enterprise/format";
import type { CloudModel } from "../../../../enterprise/types";
import styles from "../enterpriseModels.module.less";

interface CloudModelsSectionProps {
  tenantName: string;
  models: CloudModel[];
  defaultModelId: string | null;
  onSetDefault: (modelId: string) => void;
}

export function CloudModelsSection({
  tenantName,
  models,
  defaultModelId,
  onSetDefault,
}: CloudModelsSectionProps) {
  const { t } = useTranslation();
  const availableCount = models.filter((m) => m.available).length;

  return (
    <section className={styles.section} aria-labelledby="ent-cloud-models">
      <div className={styles.sectionHead}>
        <div className={styles.sectionTitleRow}>
          <h3 id="ent-cloud-models" className={styles.sectionTitle}>
            {t("enterprise.settings.models.cloud.title")}
          </h3>
          <span className="is-badge is-badge--brand">
            {t("enterprise.settings.models.cloud.billed")}
          </span>
          <span className={styles.sectionMeta}>
            {t("enterprise.settings.models.cloud.meta", { tenant: tenantName })}
          </span>
        </div>
        <span className="is-badge is-badge--dot is-badge--success">
          {t("enterprise.settings.models.cloud.availableCount", {
            count: availableCount,
          })}
        </span>
      </div>
      <p className={styles.sectionDesc}>
        {t("enterprise.settings.models.cloud.desc")}
      </p>

      <div
        className={styles.table}
        role="table"
        aria-labelledby="ent-cloud-models"
      >
        <div className={`${styles.tr} ${styles.th}`} role="row">
          <span
            role="columnheader"
            aria-label={t("enterprise.settings.models.cloud.default")}
          />
          <span role="columnheader">
            {t("enterprise.settings.models.cloud.colAlias")}
          </span>
          <span role="columnheader">
            {t("enterprise.settings.models.cloud.colDesc")}
          </span>
          <span role="columnheader">
            {t("enterprise.settings.models.cloud.colCaps")}
          </span>
          <span role="columnheader" className={styles.r}>
            {t("enterprise.settings.models.cloud.colContext")}
          </span>
          <span role="columnheader" className={styles.r}>
            {t("enterprise.settings.models.cloud.colPrice")}
          </span>
          <span role="columnheader">
            {t("enterprise.settings.models.cloud.colStatus")}
          </span>
        </div>
        {models.map((m) => {
          const isDefault = m.id === defaultModelId;
          const starLabel = isDefault
            ? t("enterprise.settings.models.cloud.starOn")
            : t("enterprise.settings.models.cloud.starOff");
          return (
            <div
              key={m.id}
              role="row"
              className={`${styles.tr}${isDefault ? ` ${styles.trOn}` : ""}`}
            >
              <span role="cell">
                <button
                  type="button"
                  className={`${styles.star}${
                    isDefault ? ` ${styles.starOn}` : ""
                  }`}
                  aria-label={starLabel}
                  aria-pressed={isDefault}
                  title={starLabel}
                  disabled={!m.available}
                  onClick={() => {
                    if (!isDefault) onSetDefault(m.id);
                  }}
                >
                  <Star size={14} aria-hidden />
                </button>
              </span>
              <span role="cell" className={styles.name}>
                <span className={styles.ic}>
                  <Cloud size={16} aria-hidden />
                </span>
                <span className="mono">{m.id}</span>
                {isDefault && (
                  <span className={`is-badge ${styles.defaultBadge}`}>
                    {t("enterprise.settings.models.cloud.default")}
                  </span>
                )}
              </span>
              <span role="cell" className={styles.desc} title={m.description}>
                {m.description}
              </span>
              <span role="cell" className={styles.caps}>
                {m.capabilities.map((cap) => (
                  <span key={cap} className="is-badge">
                    {t(`enterprise.settings.models.cloud.capability.${cap}`)}
                  </span>
                ))}
              </span>
              <span role="cell" className={`${styles.r} num`}>
                {m.context}
              </span>
              <span role="cell" className={`${styles.r} ${styles.price} num`}>
                {formatPoints(m.inputPricePerM)} /{" "}
                {formatPoints(m.outputPricePerM)}
              </span>
              <span role="cell">
                {m.available ? (
                  <span className="is-badge is-badge--dot is-badge--success">
                    {t("enterprise.settings.models.cloud.available")}
                  </span>
                ) : (
                  <span className="is-badge is-badge--dot">
                    {t("enterprise.settings.models.cloud.unavailable")}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

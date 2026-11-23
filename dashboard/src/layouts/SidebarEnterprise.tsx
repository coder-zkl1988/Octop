import { useTranslation } from "react-i18next";
import { useEnterprise } from "../enterprise/EnterpriseContext";
import { formatPercent, formatPoints } from "../enterprise/format";
import styles from "./SidebarEnterprise.module.less";

/** Tenant chip under the wordmark: mark + tenant name + edition tag. */
export function SidebarTenantChip() {
  const { t } = useTranslation();
  const { snapshot } = useEnterprise();
  if (!snapshot) return null;
  return (
    <div className={styles.tenant} title={t("enterprise.core.tenantTitle")}>
      <span className={styles.tenantMark} aria-hidden>
        {snapshot.tenant.mark}
      </span>
      <span className={styles.tenantName}>{snapshot.tenant.name}</span>
      <span className={styles.tenantTag}>{t("enterprise.core.edition")}</span>
    </div>
  );
}

/** Sync dot + label; shared by the sidebar and the chat header chip. */
export function useSyncLabel(): {
  text: string;
  tone: "ok" | "pending" | "offline";
} {
  const { t } = useTranslation();
  const { snapshot, syncState } = useEnterprise();
  if (syncState === "offline") {
    return { text: t("enterprise.core.sync.offline"), tone: "offline" };
  }
  if (syncState === "pending") {
    return {
      text: t("enterprise.core.sync.pending", {
        count: snapshot?.sync.pending ?? 0,
      }),
      tone: "pending",
    };
  }
  return { text: t("enterprise.core.sync.synced"), tone: "ok" };
}

/** Footer block: tenant balance + monthly quota meter, then sync status. */
export function SidebarEnterpriseStatus({
  onNavigate,
}: {
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation();
  const { snapshot } = useEnterprise();
  const sync = useSyncLabel();
  if (!snapshot) return null;
  const { tenant, quota } = snapshot;
  const pct = Math.min(
    100,
    Number(formatPercent(quota.usedPoints, quota.quotaPoints)),
  );

  return (
    <div className={styles.ent}>
      <button
        type="button"
        className={styles.bal}
        title={t("enterprise.core.accountAndUsage")}
        onClick={() => onNavigate("/account")}
      >
        <span className={styles.balRow}>
          <span className={styles.balLabel}>
            {t("enterprise.core.tenantRemaining")}
          </span>
          <span className={styles.balVal}>
            <span className={`num ${styles.balNum}`}>
              {formatPoints(tenant.balancePoints)}
            </span>{" "}
            {t("enterprise.core.points")}
          </span>
        </span>
        <span className={`${styles.balRow} ${styles.balRowMeta}`}>
          <span>{t("enterprise.core.monthUsage")}</span>
          <span className={`num ${styles.balMetaNum}`}>
            {formatPoints(quota.usedPoints)} / {formatPoints(quota.quotaPoints)}
          </span>
        </span>
        <span className={styles.balTrack} aria-hidden>
          <span className={styles.balFill} style={{ width: `${pct}%` }} />
        </span>
      </button>
      <button
        type="button"
        className={styles.sync}
        onClick={() => onNavigate("/sync")}
      >
        <span
          className={`${styles.syncDot} ${
            sync.tone === "pending"
              ? styles.syncDotPending
              : sync.tone === "offline"
              ? styles.syncDotOffline
              : ""
          }`}
          aria-hidden
        />
        <span>{sync.text}</span>
      </button>
    </div>
  );
}

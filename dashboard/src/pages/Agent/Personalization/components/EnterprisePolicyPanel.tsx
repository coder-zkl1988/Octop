import { Lock, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEnterprise } from "../../../../enterprise/EnterpriseContext";

export default function EnterprisePolicyPanel() {
  const { t } = useTranslation();
  const { snapshot } = useEnterprise();
  if (!snapshot) return null;
  const rows = [
    [
      t("enterprise.settings.policy.toolApproval"),
      snapshot.policy.toolApprovalForced
        ? t("enterprise.settings.policy.required")
        : t("enterprise.settings.policy.optional"),
    ],
    [
      t("enterprise.settings.policy.pii"),
      snapshot.policy.piiRedaction
        ? t("enterprise.settings.policy.enabled")
        : t("enterprise.settings.policy.disabled"),
    ],
    [
      t("enterprise.settings.policy.secrets"),
      snapshot.policy.secretRedaction
        ? t("enterprise.settings.policy.enabled")
        : t("enterprise.settings.policy.disabled"),
    ],
    [
      t("enterprise.settings.policy.sync"),
      snapshot.policy.syncLocked
        ? t("enterprise.settings.policy.locked")
        : t("enterprise.settings.policy.optional"),
    ],
  ];
  return (
    <div className="is-card" style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <ShieldCheck size={18} />
        <h3 style={{ margin: 0 }}>{t("enterprise.settings.policy.title")}</h3>
      </div>
      <p className="is-subtitle" style={{ marginBottom: 16 }}>
        {t("enterprise.settings.policy.subtitle", {
          tenant: snapshot.tenant.name,
          version: snapshot.policy.version,
        })}
      </p>
      {rows.map(([label, value]) => (
        <div
          key={label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "14px 0",
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          <span>
            {label}
            <span className="is-subtitle" style={{ display: "block" }}>
              {t("enterprise.core.lockedByAdmin")}
            </span>
          </span>
          <span>
            <Lock size={12} style={{ marginRight: 5, verticalAlign: "-2px" }} />
            {value}
          </span>
        </div>
      ))}
      <div className="ent-tip" style={{ marginTop: 12 }}>
        {t("enterprise.settings.policy.contact")}
      </div>
    </div>
  );
}

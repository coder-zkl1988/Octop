import { useEffect, useState } from "react";
import { Button } from "antd";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { clearAuthToken } from "../../../api";
import { authApi } from "../../../api/modules/auth";
import { accountApi } from "../../../enterprise/api/account";
import { useEnterprise } from "../../../enterprise/EnterpriseContext";
import { applyGuestLocale } from "../../../utils/locale";
import { publicUrl } from "../../../utils/publicUrl";
import styles from "./index.module.less";

/** Full-screen notice shown once an admin removes this device. */
export default function DeviceRevokedPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { snapshot, setSimulation } = useEnterprise();
  const [revokedAt, setRevokedAt] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const device = snapshot?.devices.find((d) => d.current);

  useEffect(() => {
    let cancelled = false;
    accountApi
      .getRevocation()
      .then((notice) => {
        if (!cancelled) setRevokedAt(notice.revokedAt);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const signInAgain = async () => {
    setLeaving(true);
    await authApi.logout();
    clearAuthToken();
    // Signing in again re-registers the device, so the removal no longer applies.
    setSimulation({ revoked: false });
    await applyGuestLocale();
    navigate("/login", { replace: true });
  };

  return (
    <div className={styles.shell}>
      <main className={styles.card}>
        <img
          className={styles.mascot}
          src={publicUrl("octop-mascot-peek.webp")}
          alt=""
          draggable={false}
        />
        <span
          className={`is-badge is-badge--danger is-badge--dot ${styles.badge}`}
        >
          {t("enterprise.auth.revoked.badge")}
        </span>
        <h1 className={styles.title}>{t("enterprise.auth.revoked.title")}</h1>
        <p className={styles.desc}>
          {t("enterprise.auth.revoked.cleared")}
          <br />
          {t("enterprise.auth.revoked.backfilled")}
        </p>
        <dl className={styles.kv}>
          <div>
            <dt>{t("enterprise.auth.revoked.device")}</dt>
            <dd>{device ? `${device.name} · ${device.os}` : "—"}</dd>
          </div>
          <div>
            <dt>{t("enterprise.auth.revoked.tenant")}</dt>
            <dd>{snapshot?.tenant.name ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("enterprise.auth.revoked.revokedAt")}</dt>
            <dd className="ent-num">
              {revokedAt ? dayjs(revokedAt).format("YYYY-MM-DD HH:mm") : "—"}
            </dd>
          </div>
        </dl>
        <Button
          type="primary"
          className={styles.action}
          loading={leaving}
          onClick={() => void signInAgain()}
        >
          {t("enterprise.auth.revoked.signInAgain")}
        </Button>
        <p className={styles.help}>{t("enterprise.auth.revoked.help")}</p>
      </main>
      {snapshot && (
        <div className={styles.ver}>
          {t("enterprise.core.productName")}{" "}
          <span className="ent-num">{snapshot.app.version}</span>
        </div>
      )}
    </div>
  );
}

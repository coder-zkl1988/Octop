import { useTranslation } from "react-i18next";
import PageShell from "../../../layouts/PageShell";
import DesktopPanel from "./DesktopPanel";
import styles from "./index.module.less";

/** Server desktop. Phones (companion app and adb) live under ``/phone``. */
export default function RemoteDesktopPage() {
  const { t } = useTranslation();

  return (
    <PageShell
      title={t("remoteDesktopHub.title")}
      subtitle={t("remoteDesktopHub.description")}
      fill
    >
      <div className={styles.panels}>
        <div className={styles.panel}>
          <DesktopPanel embedded isVisible />
        </div>
      </div>
    </PageShell>
  );
}

import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { QrCode, Usb } from "lucide-react";
import PageShell from "../../../layouts/PageShell";
import { usePathTabs } from "../../../hooks/usePathTabs";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { useServerCapabilities } from "../../../hooks/useServerCapabilities";
import { userCan } from "../../../utils/permissions";
import CompanionPhonesPanel from "../CompanionPhones";
import RemoteAndroidPage from "../RemoteAndroid";
import styles from "./index.module.less";

/** ``app``: phones paired through the companion app; ``adb``: host adb stream. */
export type PhoneTab = "app" | "adb";

const PHONE_TABS = ["app", "adb"] as const satisfies readonly PhoneTab[];

const TAB_ICONS = {
  app: QrCode,
  adb: Usb,
} as const;

export default function PhonePage() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { mobileEnabled, companionEnabled } = useServerCapabilities();

  const isAllowed = useCallback(
    (tab: PhoneTab) => {
      if (!userCan(user, "mobile")) return false;
      return tab === "app" ? companionEnabled : mobileEnabled;
    },
    [user, mobileEnabled, companionEnabled],
  );

  const { activeTab, handleTabChange, isMounted } = usePathTabs({
    basePath: "/phone",
    tabs: PHONE_TABS,
    storageKey: "octop:phone:tab",
    defaultTab: companionEnabled || !mobileEnabled ? "app" : "adb",
    isAllowed,
  });

  const pathTabs = useMemo(
    () => ({
      value: activeTab,
      onChange: handleTabChange,
      options: PHONE_TABS.filter((value) => isAllowed(value)).map((value) => {
        const Icon = TAB_ICONS[value];
        return {
          value,
          label: t(`phoneHub.tabs.${value}`),
          icon: <Icon size={14} strokeWidth={2} />,
        };
      }),
    }),
    [activeTab, handleTabChange, isAllowed, t],
  );

  const appVisible = activeTab === "app";
  const adbVisible = activeTab === "adb";

  return (
    <PageShell
      title={`${t("phoneHub.title")} / ${t(`phoneHub.tabs.${activeTab}`)}`}
      subtitle={t("phoneHub.description")}
      fill
      pathTabs={pathTabs}
    >
      <div className={styles.panels}>
        {isMounted("app") && (
          <div
            className={styles.panel}
            style={{ display: appVisible ? "flex" : "none" }}
            aria-hidden={!appVisible}
          >
            <CompanionPhonesPanel isVisible={appVisible} />
          </div>
        )}
        {isMounted("adb") && (
          <div
            className={styles.panel}
            style={{ display: adbVisible ? "flex" : "none" }}
            aria-hidden={!adbVisible}
          >
            <RemoteAndroidPage embedded isVisible={adbVisible} />
          </div>
        )}
      </div>
    </PageShell>
  );
}

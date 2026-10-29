import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal, Typography } from "antd";
import { Smartphone } from "lucide-react";
import { message } from "@/utils/antdMessage";
import { isNotFoundApiError } from "@/utils/apiError";
import {
  companionApi,
  type CompanionPairRequest,
} from "../../api/modules/mobile";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { userCan } from "../../utils/permissions";
import styles from "./index.module.less";

/** The phone polls every 1.5 s; this only has to notice requests and their end. */
export const PAIR_REQUESTS_POLL_MS = 2000;

/**
 * App-wide approval prompt for iTabby phones that found Octop on the LAN.
 *
 * Polls while the tab is visible and the user holds the ``mobile`` permission
 * (the same gate as QR pairing). The prompt disappears as soon as the request
 * leaves the pending list — approved elsewhere, cancelled on the phone, or
 * expired. Closing it only hides that request in this tab.
 */
export default function LanPairingPrompt() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const enabled = userCan(user, "mobile");
  const [requests, setRequests] = useState<CompanionPairRequest[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await companionApi.pairRequests();
      setRequests(data.requests);
    } catch {
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setRequests([]);
      return;
    }
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    tick();
    const timer = window.setInterval(tick, PAIR_REQUESTS_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled, load]);

  const visible = requests.filter((r) => !dismissed.has(r.request_id));
  const current = visible[0] ?? null;

  const decide = async (approve: boolean) => {
    if (!current) return;
    setBusy(approve ? "approve" : "reject");
    try {
      if (approve) {
        await companionApi.approvePairRequest(current.request_id);
        message.success(
          t("companionPhone.lanPair.approved", "已允许 {{device}} 配对", {
            device: current.model || current.device_id,
          }),
        );
      } else {
        await companionApi.rejectPairRequest(current.request_id);
      }
    } catch (error) {
      if (isNotFoundApiError(error)) {
        message.warning(
          t("companionPhone.lanPair.gone", "该配对请求已过期或已被处理"),
        );
      } else {
        message.error(t("companionPhone.lanPair.failed", "操作失败，请重试"));
      }
    } finally {
      setBusy(null);
      await load();
    }
  };

  const device =
    [current?.manufacturer, current?.model].filter(Boolean).join(" ") ||
    current?.device_id;

  return (
    <Modal
      open={current !== null}
      title={
        <span className={styles.title}>
          <Smartphone size={16} />
          {t("companionPhone.lanPair.title", "iTabby 请求配对")}
        </span>
      }
      maskClosable={false}
      destroyOnHidden
      onCancel={() =>
        current && setDismissed((prev) => new Set(prev).add(current.request_id))
      }
      footer={[
        <Button
          key="reject"
          loading={busy === "reject"}
          disabled={busy !== null}
          onClick={() => void decide(false)}
        >
          {t("companionPhone.lanPair.reject", "拒绝")}
        </Button>,
        <Button
          key="approve"
          type="primary"
          loading={busy === "approve"}
          disabled={busy !== null}
          onClick={() => void decide(true)}
        >
          {t("companionPhone.lanPair.approve", "允许")}
        </Button>,
      ]}
    >
      {current ? (
        <div className={styles.body}>
          <div className={styles.row}>
            <Typography.Text type="secondary">
              {t("companionPhone.lanPair.device", "设备")}
            </Typography.Text>
            <span>{device}</span>
          </div>
          <div className={styles.row}>
            <Typography.Text type="secondary">
              {t("companionPhone.lanPair.code", "核对码")}
            </Typography.Text>
            <span className={styles.code} data-testid="lan-pair-code">
              {current.code}
            </span>
          </div>
          <Typography.Text type="secondary" className={styles.hint}>
            {t(
              "companionPhone.lanPair.codeHint",
              "请确认与手机上显示的核对码一致后再允许。允许后这台手机将以你的账号连接 Octop。",
            )}
          </Typography.Text>
          {visible.length > 1 ? (
            <Typography.Text type="secondary" className={styles.hint}>
              {t(
                "companionPhone.lanPair.more",
                "还有 {{count}} 个请求等待处理",
                {
                  count: visible.length - 1,
                },
              )}
            </Typography.Text>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Popconfirm, Tooltip } from "antd";
import { Pencil, Smartphone, Unlink } from "lucide-react";
import type { CompanionDevice } from "../../../api/modules/mobile";
import { useDeviceThumbnail } from "./useDeviceThumbnail";
import styles from "./DeviceCard.module.less";

type CardStatus = "idle" | "busy" | "offline";

function cardStatus(device: CompanionDevice): CardStatus {
  if (!device.online) return "offline";
  return device.running_task_id ? "busy" : "idle";
}

interface Props {
  device: CompanionDevice;
  /** Stream a live thumbnail (only while the page is visible). */
  liveThumbnail: boolean;
  onStop: (deviceId: string) => Promise<void>;
  onViewScreen: (device: CompanionDevice) => void;
  onRename: (deviceId: string, name: string) => Promise<void>;
  onUnpair: (deviceId: string) => Promise<void>;
}

/** Companion phone card, laid out like tabby's device card. */
export default function DeviceCard({
  device,
  liveThumbnail,
  onStop,
  onViewScreen,
  onRename,
  onUnpair,
}: Props) {
  const { t } = useTranslation();
  const [stopping, setStopping] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const status = cardStatus(device);
  const snapshot = useDeviceThumbnail(
    device.device_id,
    liveThumbnail && device.online,
  );
  const displayName = device.name || device.model || device.device_id;
  const statusLabel = {
    idle: t("companionPhone.status.idle", "空闲"),
    busy: t("companionPhone.status.busy", "执行中"),
    offline: t("companionPhone.status.offline", "离线"),
  }[status];

  const commitRename = async () => {
    setEditing(false);
    const name = draft.trim();
    if (name !== device.name) await onRename(device.device_id, name);
  };

  const stop = async () => {
    setStopping(true);
    try {
      await onStop(device.device_id);
    } finally {
      setStopping(false);
    }
  };

  return (
    <article className={styles.card}>
      <div className={styles.thumb}>
        {snapshot ? (
          <img src={snapshot} alt="" />
        ) : (
          <Smartphone size={32} strokeWidth={1.25} />
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.titleRow}>
          <div className={styles.nameWrap}>
            {editing ? (
              <input
                autoFocus
                className={styles.nameInput}
                value={draft}
                maxLength={64}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={() => void commitRename()}
                onKeyDown={(e) => {
                  // Device names are often Chinese: Enter mid-IME-composition
                  // confirms the candidate and must not commit the rename.
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.currentTarget.blur();
                  }
                  if (e.key === "Escape") setEditing(false);
                }}
              />
            ) : (
              <>
                <span className={styles.name} title={displayName}>
                  {displayName}
                </span>
                <button
                  type="button"
                  className={styles.iconButton}
                  title={t("companionPhone.rename", "重命名")}
                  onClick={() => {
                    setDraft(device.name || device.model);
                    setEditing(true);
                  }}
                >
                  <Pencil size={12} />
                </button>
              </>
            )}
          </div>
          <Tooltip
            title={
              device.running_task
                ? t("companionPhone.runningTask", "第 {{step}} 步：{{task}}", {
                    step: device.running_step ?? 0,
                    task: device.running_task,
                  })
                : undefined
            }
          >
            <span className={`${styles.status} ${styles[status]}`}>
              <span className={styles.statusDot} />
              {statusLabel}
            </span>
          </Tooltip>
          <Popconfirm
            title={t("companionPhone.unpairConfirm", "解绑这台手机？")}
            description={t(
              "companionPhone.unpairConfirmDesc",
              "解绑后手机需要重新扫码才能连接。",
            )}
            onConfirm={() => onUnpair(device.device_id)}
          >
            <button
              type="button"
              className={styles.iconButton}
              title={t("companionPhone.unpair", "解绑")}
            >
              <Unlink size={12} />
            </button>
          </Popconfirm>
        </div>

        <div className={styles.model}>
          {device.name ? device.model : device.device_id}
        </div>

        <dl className={styles.meta}>
          {device.current_app ? (
            <div>
              <dt>{t("companionPhone.currentApp", "当前应用")}</dt>
              <dd title={device.current_app}>{device.current_app}</dd>
            </div>
          ) : null}
          {device.battery_level !== null ? (
            <div>
              <dt>{t("companionPhone.battery", "电量")}</dt>
              <dd>
                {device.battery_level}%
                {device.is_charging ? (
                  <span className={styles.charging}>⚡</span>
                ) : null}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className={styles.actions}>
          {/* Always rendered, disabled when idle, so the control has a fixed spot. */}
          <Button
            size="small"
            danger={status === "busy"}
            type={status === "busy" ? "primary" : "default"}
            disabled={status !== "busy" || stopping}
            onClick={() => void stop()}
          >
            {stopping
              ? t("companionPhone.stopping", "停止中…")
              : t("companionPhone.emergencyStop", "紧急停止")}
          </Button>
          <Button
            size="small"
            disabled={!device.online}
            onClick={() => onViewScreen(device)}
          >
            {t("companionPhone.viewScreen", "查看屏幕")}
          </Button>
        </div>
      </div>
    </article>
  );
}

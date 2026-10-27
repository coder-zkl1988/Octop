import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Empty,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import { QRCodeSVG } from "qrcode.react";
import {
  BatteryCharging,
  BatteryMedium,
  QrCode,
  RefreshCw,
  Smartphone,
  Square,
  Unlink,
} from "lucide-react";
import { message } from "@/utils/antdMessage";
import {
  companionApi,
  type CompanionDevice,
  type CompanionPairing,
  type CompanionSettings,
} from "../../../api/modules/mobile";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import styles from "./index.module.less";

const DEVICES_POLL_MS = 3000;
const SNAPSHOT_POLL_MS = 5000;

const ANDROID_RELEASE: Record<number, string> = {
  26: "8.0",
  27: "8.1",
  28: "9",
  29: "10",
  30: "11",
  31: "12",
  32: "12L",
  33: "13",
  34: "14",
  35: "15",
  36: "16",
};

function androidLabel(sdk: number | null): string | null {
  if (!sdk) return null;
  return `Android ${ANDROID_RELEASE[sdk] ?? `SDK ${sdk}`}`;
}

function candidateValue(provider: string, model: string): string {
  return `${provider}\u0000${model}`;
}

interface CompanionPhonesPanelProps {
  isVisible?: boolean;
}

export default function CompanionPhonesPanel({
  isVisible = true,
}: CompanionPhonesPanelProps) {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const isAdmin = user?.role === "admin";
  const [devices, setDevices] = useState<CompanionDevice[] | null>(null);
  const [settings, setSettings] = useState<CompanionSettings | null>(null);
  const [modelChoice, setModelChoice] = useState<string | undefined>();
  const [savingModel, setSavingModel] = useState(false);
  const [snapshots, setSnapshots] = useState<Record<string, string>>({});
  const [pairing, setPairing] = useState<CompanionPairing | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const pairedBeforeRef = useRef<Set<string>>(new Set());

  const loadDevices = useCallback(async () => {
    try {
      const data = await companionApi.devices();
      setDevices(data.devices);
    } catch {
      setDevices((prev) => prev ?? []);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const data = await companionApi.settings();
      setSettings(data);
      setModelChoice(
        data.provider && data.model
          ? candidateValue(data.provider, data.model)
          : undefined,
      );
    } catch {
      setSettings(null);
    }
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    void loadSettings();
  }, [isVisible, loadSettings]);

  useEffect(() => {
    if (!isVisible) return;
    void loadDevices();
    const timer = window.setInterval(() => void loadDevices(), DEVICES_POLL_MS);
    return () => window.clearInterval(timer);
  }, [isVisible, loadDevices]);

  const snapshotIds = useMemo(
    () =>
      (devices ?? [])
        .filter((d) => d.online && d.has_snapshot)
        .map((d) => d.device_id)
        .join("\n"),
    [devices],
  );

  useEffect(() => {
    if (!isVisible || !snapshotIds) return;
    const ids = snapshotIds.split("\n");
    let cancelled = false;
    const refresh = async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const snap = await companionApi.snapshot(id);
            return [id, `data:image/jpeg;base64,${snap.jpeg_base64}`] as const;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      setSnapshots((prev) => {
        const next = { ...prev };
        for (const entry of entries) {
          if (entry) next[entry[0]] = entry[1];
        }
        return next;
      });
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), SNAPSHOT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isVisible, snapshotIds]);

  // Close the QR dialog once a phone that was not paired before shows up.
  useEffect(() => {
    if (!pairing || !devices) return;
    const fresh = devices.find(
      (d) => !pairedBeforeRef.current.has(d.device_id),
    );
    if (fresh) {
      setPairing(null);
      message.success(
        t("companionPhone.pairedToast", "{{model}} 已配对", {
          model: fresh.model || fresh.device_id,
        }),
      );
    }
  }, [devices, pairing, t]);

  useEffect(() => {
    if (!pairing) return;
    const timer = window.setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [pairing]);

  const startPairing = async () => {
    setPairingBusy(true);
    try {
      pairedBeforeRef.current = new Set(
        (devices ?? []).map((d) => d.device_id),
      );
      const data = await companionApi.createPairing();
      setNow(Math.floor(Date.now() / 1000));
      setPairing(data);
    } catch {
      message.error(t("companionPhone.pairFailed", "生成配对二维码失败"));
    } finally {
      setPairingBusy(false);
    }
  };

  const saveModel = async () => {
    if (!modelChoice) return;
    const [provider, model] = modelChoice.split("\u0000");
    setSavingModel(true);
    try {
      const data = await companionApi.saveSettings({ provider, model });
      setSettings(data);
      message.success(t("companionPhone.modelSaved", "手机端模型已更新"));
    } catch {
      message.error(t("companionPhone.modelSaveFailed", "保存失败"));
    } finally {
      setSavingModel(false);
    }
  };

  const stopTask = async (deviceId: string) => {
    try {
      await companionApi.cancelTask(deviceId);
      message.success(t("companionPhone.stopped", "已停止任务"));
    } catch {
      message.error(t("companionPhone.stopFailed", "停止失败"));
    } finally {
      void loadDevices();
    }
  };

  const unpair = async (deviceId: string) => {
    try {
      await companionApi.unpair(deviceId);
      setSnapshots((prev) => {
        const next = { ...prev };
        delete next[deviceId];
        return next;
      });
      message.success(t("companionPhone.unpaired", "已解绑"));
    } catch {
      message.error(t("companionPhone.unpairFailed", "解绑失败"));
    } finally {
      void loadDevices();
    }
  };

  const modelOptions = (settings?.candidates ?? []).map((c) => ({
    value: candidateValue(c.provider, c.model),
    label: (
      <span className={styles.modelOption}>
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

  const secondsLeft = pairing ? Math.max(0, pairing.expires_at - now) : 0;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Typography.Text type="secondary" className={styles.intro}>
          {t(
            "companionPhone.intro",
            "在手机上安装 Tabby App 并扫码配对后，Agent 可以把整段任务交给手机自主完成，无需 USB 或 ADB。",
          )}
        </Typography.Text>
        <Space>
          <Button
            icon={<RefreshCw size={14} />}
            onClick={() => void loadDevices()}
          >
            {t("companionPhone.refresh", "刷新")}
          </Button>
          <Button
            type="primary"
            icon={<QrCode size={14} />}
            loading={pairingBusy}
            onClick={() => void startPairing()}
          >
            {t("companionPhone.addPhone", "添加手机")}
          </Button>
        </Space>
      </div>

      <section className={styles.modelCard}>
        <div className={styles.modelTitle}>
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
        <Typography.Text type="secondary" className={styles.modelHint}>
          {t(
            "companionPhone.modelHint",
            "手机上的 Agent 用这个支持看图的模型操作屏幕。请求经 Octop 转发，模型密钥不会下发到手机。",
          )}
        </Typography.Text>
        {isAdmin ? (
          <div className={styles.modelRow}>
            <Select
              className={styles.modelSelect}
              placeholder={t(
                "companionPhone.modelPlaceholder",
                "选择 OpenAI 兼容的视觉模型",
              )}
              value={modelChoice}
              onChange={setModelChoice}
              options={modelOptions}
              showSearch
              optionFilterProp="value"
              notFoundContent={t(
                "companionPhone.noCandidates",
                "没有可用的 OpenAI 兼容模型，请先在模型设置中添加",
              )}
            />
            <Button
              type="primary"
              loading={savingModel}
              disabled={!modelChoice}
              onClick={() => void saveModel()}
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

      {devices === null ? (
        <div className={styles.loading}>
          <Spin />
        </div>
      ) : devices.length === 0 ? (
        <Empty
          className={styles.empty}
          image={<Smartphone size={48} strokeWidth={1.25} />}
          description={t("companionPhone.empty", "还没有配对的手机")}
        >
          <Button
            type="primary"
            icon={<QrCode size={14} />}
            loading={pairingBusy}
            onClick={() => void startPairing()}
          >
            {t("companionPhone.addPhone", "添加手机")}
          </Button>
        </Empty>
      ) : (
        <div className={styles.grid}>
          {devices.map((device) => {
            const snapshot = snapshots[device.device_id];
            const android = androidLabel(device.android_sdk);
            return (
              <article key={device.device_id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <span
                    className={`${styles.dot} ${
                      device.online ? styles.dotOnline : ""
                    }`}
                    aria-hidden
                  />
                  <span className={styles.cardTitle}>
                    {device.model || device.device_id}
                  </span>
                  <span className={styles.cardStatus}>
                    {device.online
                      ? t("companionPhone.online", "在线")
                      : t("companionPhone.offline", "离线")}
                  </span>
                </div>
                <div className={styles.screen}>
                  {device.online && snapshot ? (
                    <img
                      src={snapshot}
                      alt={t("companionPhone.screenAlt", "手机屏幕")}
                    />
                  ) : (
                    <Smartphone size={40} strokeWidth={1.25} />
                  )}
                </div>
                <dl className={styles.meta}>
                  {android ? (
                    <>
                      <dt>{t("companionPhone.system", "系统")}</dt>
                      <dd>{android}</dd>
                    </>
                  ) : null}
                  {device.battery_level !== null ? (
                    <>
                      <dt>{t("companionPhone.battery", "电量")}</dt>
                      <dd className={styles.battery}>
                        {device.is_charging ? (
                          <BatteryCharging size={14} />
                        ) : (
                          <BatteryMedium size={14} />
                        )}
                        {device.battery_level}%
                      </dd>
                    </>
                  ) : null}
                  {device.current_app ? (
                    <>
                      <dt>{t("companionPhone.currentApp", "当前应用")}</dt>
                      <dd title={device.current_app}>{device.current_app}</dd>
                    </>
                  ) : null}
                  <dt>{t("companionPhone.deviceId", "设备 ID")}</dt>
                  <dd title={device.device_id}>{device.device_id}</dd>
                </dl>
                {device.running_task_id ? (
                  <div className={styles.task}>
                    <div className={styles.taskText}>
                      <Spin size="small" />
                      <span title={device.running_task ?? ""}>
                        {device.running_task}
                      </span>
                    </div>
                    <div className={styles.taskFooter}>
                      <span>
                        {t("companionPhone.step", "第 {{step}} 步", {
                          step: device.running_step ?? 0,
                        })}
                      </span>
                      <Button
                        size="small"
                        danger
                        icon={<Square size={12} />}
                        onClick={() => void stopTask(device.device_id)}
                      >
                        {t("companionPhone.stop", "停止")}
                      </Button>
                    </div>
                  </div>
                ) : null}
                <div className={styles.cardFooter}>
                  <Popconfirm
                    title={t("companionPhone.unpairConfirm", "解绑这台手机？")}
                    description={t(
                      "companionPhone.unpairConfirmDesc",
                      "解绑后手机需要重新扫码才能连接。",
                    )}
                    onConfirm={() => void unpair(device.device_id)}
                  >
                    <Button
                      size="small"
                      type="text"
                      icon={<Unlink size={14} />}
                    >
                      {t("companionPhone.unpair", "解绑")}
                    </Button>
                  </Popconfirm>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={pairing !== null}
        title={t("companionPhone.pairTitle", "扫码添加手机")}
        footer={null}
        onCancel={() => setPairing(null)}
        destroyOnHidden
      >
        {pairing ? (
          <div className={styles.pairBody}>
            {!pairing.reachable_from_lan ? (
              <Alert
                type="warning"
                showIcon
                message={t(
                  "companionPhone.loopbackTitle",
                  "Octop 只监听本机，手机无法通过 Wi-Fi 连接",
                )}
                description={t(
                  "companionPhone.loopbackDesc",
                  "请用 OCTOP_BIND_HOST=0.0.0.0 启动 Octop 后重新生成二维码，或在 USB 连接下执行 adb reverse 把端口转发到手机。",
                )}
              />
            ) : null}
            <div className={styles.qr}>
              {secondsLeft > 0 ? (
                <QRCodeSVG value={pairing.url} size={220} />
              ) : (
                <div className={styles.qrExpired}>
                  <span>{t("companionPhone.expired", "二维码已过期")}</span>
                  <Button
                    size="small"
                    loading={pairingBusy}
                    onClick={() => void startPairing()}
                  >
                    {t("companionPhone.regenerate", "重新生成")}
                  </Button>
                </div>
              )}
            </div>
            {secondsLeft > 0 ? (
              <Typography.Text type="secondary" className={styles.expiry}>
                {t(
                  "companionPhone.expiresIn",
                  "{{minutes}}:{{seconds}} 后过期",
                  {
                    minutes: Math.floor(secondsLeft / 60),
                    seconds: String(secondsLeft % 60).padStart(2, "0"),
                  },
                )}
              </Typography.Text>
            ) : null}
            <Typography.Paragraph
              copyable={{ text: pairing.url }}
              className={styles.pairUrl}
            >
              {pairing.url}
            </Typography.Paragraph>
            <ol className={styles.steps}>
              <li>
                {t("companionPhone.step1", "在手机上安装并打开 Tabby App")}
              </li>
              <li>
                {t(
                  "companionPhone.step2",
                  "按 App 提示开启无障碍服务，并保持手机解锁",
                )}
              </li>
              <li>
                {t(
                  "companionPhone.step3",
                  "在 App 中扫描此二维码，连接成功后这里会自动关闭",
                )}
              </li>
            </ol>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

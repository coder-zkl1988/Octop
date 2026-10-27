import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Modal,
  Popover,
  Select,
  Spin,
  Tag,
  Typography,
} from "antd";
import { QRCodeSVG } from "qrcode.react";
import { Download, QrCode, RefreshCw, Smartphone } from "lucide-react";
import { message } from "@/utils/antdMessage";
import {
  companionApi,
  type CompanionDevice,
  type CompanionPairing,
  type CompanionSettings,
} from "../../../api/modules/mobile";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import DeviceCard from "./DeviceCard";
import MirrorPanel from "./MirrorPanel";
import styles from "./index.module.less";

const DEVICES_POLL_MS = 3000;
/** Where tabby publishes the companion app (same link as its devices page). */
const APP_DOWNLOAD_URL =
  "https://downloads.happywork.today/releases/app-release.apk";

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
  const [pairing, setPairing] = useState<CompanionPairing | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mirrorDevice, setMirrorDevice] = useState<CompanionDevice | null>(
    null,
  );
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

  // Keep the open mirror's header in sync, and drop it if the phone is unpaired.
  useEffect(() => {
    if (!mirrorDevice || !devices) return;
    const current = devices.find((d) => d.device_id === mirrorDevice.device_id);
    if (!current) setMirrorDevice(null);
    else if (current.name !== mirrorDevice.name) setMirrorDevice(current);
  }, [devices, mirrorDevice]);

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

  const refresh = () => {
    setRefreshing(true);
    void loadDevices().finally(() =>
      window.setTimeout(() => setRefreshing(false), 300),
    );
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

  const renameDevice = async (deviceId: string, name: string) => {
    try {
      await companionApi.rename(deviceId, name);
    } catch {
      message.error(t("companionPhone.renameFailed", "重命名失败"));
    } finally {
      void loadDevices();
    }
  };

  const unpair = async (deviceId: string) => {
    try {
      await companionApi.unpair(deviceId);
      message.success(t("companionPhone.unpaired", "已解绑"));
    } catch {
      message.error(t("companionPhone.unpairFailed", "解绑失败"));
    } finally {
      void loadDevices();
    }
  };

  const viewScreen = (device: CompanionDevice) => {
    if (mirrorDevice?.device_id === device.device_id) {
      // Same phone again: remount to reconnect the stream.
      setMirrorDevice(null);
      requestAnimationFrame(() => setMirrorDevice(device));
    } else {
      setMirrorDevice(device);
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

  const downloadButton = (
    <Popover
      trigger="click"
      placement="bottomRight"
      content={
        <div className={styles.downloadPopover}>
          <div className={styles.qrBox}>
            <QRCodeSVG value={APP_DOWNLOAD_URL} size={160} level="M" />
          </div>
          <span>{t("companionPhone.downloadHint", "扫描下载 Tabby App")}</span>
        </div>
      }
    >
      <Button size="small" icon={<Download size={12} />}>
        {t("companionPhone.download", "下载 Tabby")}
      </Button>
    </Popover>
  );

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <div className={styles.toolbar}>
          <Typography.Text type="secondary" className={styles.intro}>
            {t(
              "companionPhone.intro",
              "在手机上安装 Tabby App 并扫码配对后，Agent 可以把整段任务交给手机自主完成，无需 USB 或 ADB。",
            )}
          </Typography.Text>
          <div className={styles.toolbarActions}>
            {downloadButton}
            <Button
              size="small"
              className={styles.accentButton}
              icon={<QrCode size={12} />}
              loading={pairingBusy}
              onClick={() => void startPairing()}
            >
              {t("companionPhone.addPhone", "扫码连接")}
            </Button>
            <Button
              size="small"
              icon={
                <RefreshCw
                  size={12}
                  className={refreshing ? styles.spinning : undefined}
                />
              }
              onClick={refresh}
              disabled={refreshing}
            >
              {t("companionPhone.refresh", "刷新")}
            </Button>
          </div>
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
            <Typography.Text type="secondary" className={styles.modelHint}>
              {t(
                "companionPhone.modelHint",
                "手机上的 Agent 用这个支持看图的模型操作屏幕。请求经 Octop 转发，模型密钥不会下发到手机。",
              )}
            </Typography.Text>
          </div>
          {isAdmin ? (
            <div className={styles.modelRow}>
              <Select
                className={styles.modelSelect}
                size="small"
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
                size="small"
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
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <Smartphone size={24} strokeWidth={1.5} />
            </div>
            <div className={styles.emptyTitle}>
              {t("companionPhone.empty", "还没有配对的手机")}
            </div>
            <div className={styles.emptyHint}>
              {t(
                "companionPhone.emptyHint",
                "在手机上打开 Tabby App，点击「扫码连接」扫描配对二维码即可连接。",
              )}
            </div>
            <Button
              className={styles.accentButton}
              icon={<QrCode size={14} />}
              loading={pairingBusy}
              onClick={() => void startPairing()}
            >
              {t("companionPhone.addPhoneLong", "扫码连接手机")}
            </Button>
          </div>
        ) : (
          <div className={styles.grid}>
            {devices.map((device) => (
              <DeviceCard
                key={device.device_id}
                device={device}
                liveThumbnail={isVisible}
                onStop={stopTask}
                onViewScreen={viewScreen}
                onRename={renameDevice}
                onUnpair={unpair}
              />
            ))}
          </div>
        )}
      </div>

      {mirrorDevice && (
        <div className={styles.mirrorColumn}>
          <MirrorPanel
            device={mirrorDevice}
            onClose={() => setMirrorDevice(null)}
          />
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

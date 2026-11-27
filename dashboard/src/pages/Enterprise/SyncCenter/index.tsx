import { Button, message } from "antd";
import {
  Activity,
  Cloud,
  Clock3,
  FileCog,
  FileWarning,
  HardDrive,
  MessageSquareText,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  cloudFilesApi,
  type CloudExpert,
} from "../../../api/modules/cloudFiles";
import { apiErrorMessage } from "../../../utils/apiError";
import { useTranslation } from "react-i18next";
import { enterpriseApi } from "../../../enterprise/api/core";
import { useEnterprise } from "../../../enterprise/EnterpriseContext";
import { formatBytes, formatInt } from "../../../enterprise/format";
import { relativeTimeLabel } from "../../../enterprise/relativeTime";
import { useServerTimezone } from "../../../hooks/useServerTimezone";
import { formatServerHourMinute } from "../../../utils/formatMessageTime";
import type { SyncKind } from "../../../enterprise/types";

const queueIcons: Record<SyncKind, LucideIcon> = {
  threads: MessageSquareText,
  traces: Activity,
  memory: HardDrive,
  files: FileWarning,
  config: FileCog,
};

export default function SyncCenterPage() {
  const { t } = useTranslation();
  const { snapshot, refresh, syncState } = useEnterprise();
  const timeZone = useServerTimezone();
  useEffect(() => {
    if (!snapshot) void refresh();
  }, [refresh, snapshot]);
  if (!snapshot)
    return (
      <div className="page-container">
        <div className="page-content">{t("common.loading")}</div>
      </div>
    );
  const { sync, tenant } = snapshot;
  const cloudOn = snapshot.cloudFiles?.state === "on";
  const syncNow = async () => {
    await enterpriseApi.syncNow();
    if (cloudOn) await cloudFilesApi.syncNow();
    await refresh();
    void message.success(t("enterprise.account.sync.allSynced"));
  };
  return (
    <div className="page-container">
      <div className="page-content">
        <div className="ps-root">
          <header className="ps-header">
            <div>
              <div className="ps-title-row">
                <h4 className="ps-title">
                  {t("enterprise.account.sync.title")}
                </h4>
                <span className="ps-context">
                  <span className="ps-context-mark">{tenant.mark}</span>
                  {tenant.name}
                </span>
              </div>
              <span className="ps-subtitle">
                {t("enterprise.account.sync.subtitle")}
              </span>
            </div>
            <Button
              type="primary"
              icon={<RefreshCw size={14} aria-hidden />}
              onClick={() => void syncNow()}
              disabled={syncState === "offline"}
            >
              {t("enterprise.account.sync.syncNow")}
            </Button>
          </header>
          <div className="ps-content ps-content--fill">
            <div className="sy-grid">
              <div className={`sy-hero sy-hero--${syncState}`}>
                <div className="sy-hero-top">
                  <span className="sy-hero-icon">
                    <Cloud size={18} aria-hidden />
                  </span>
                  <div>
                    <span className="is-section-label">
                      {t("enterprise.account.sync.statusLabel")}
                    </span>
                    <strong>
                      {syncState === "offline"
                        ? t("enterprise.account.sync.offline")
                        : syncState === "pending"
                        ? t("enterprise.account.sync.uploading")
                        : t("enterprise.account.sync.allSynced")}
                    </strong>
                  </div>
                  <span className="is-badge is-badge--dot">
                    {sync.pending
                      ? `${sync.pending} ${t(
                          "enterprise.account.sync.pendingUnit",
                        )}`
                      : t("enterprise.account.sync.done")}
                  </span>
                </div>
                <p>
                  {syncState === "offline"
                    ? t("enterprise.account.sync.offlineHint")
                    : sync.pending
                    ? t("enterprise.account.sync.eta")
                    : t("enterprise.account.sync.allSyncedHint")}
                </p>
                <div className="sy-hero-foot">
                  <span>
                    {t("enterprise.account.sync.cloud", {
                      tenant: tenant.name,
                    })}
                  </span>
                  <span className="ent-num">
                    {sync.pending} {t("enterprise.account.sync.pendingUnit")}
                  </span>
                </div>
              </div>
              <div className="is-card sy-stat">
                <div className="acc-stat-head">
                  <span className="acc-stat-icon acc-stat-icon--synced">
                    <HardDrive size={16} aria-hidden />
                  </span>
                  <span className="is-section-label">
                    {t("enterprise.account.sync.syncedLabel")}
                  </span>
                </div>
                <span className="is-stat">
                  {formatInt(sync.syncedItems)}
                  <small> {t("enterprise.account.sync.itemsUnit")}</small>
                </span>
                <div className="sy-foot">
                  <span>
                    {t("enterprise.account.sync.files")}{" "}
                    {formatBytes(sync.syncedBytes)}
                  </span>
                  <span>
                    {t("enterprise.account.sync.cloud", {
                      tenant: tenant.name,
                    })}
                  </span>
                </div>
              </div>
              <div className="is-card sy-stat">
                <div className="acc-stat-head">
                  <span className="acc-stat-icon acc-stat-icon--last">
                    <Clock3 size={16} aria-hidden />
                  </span>
                  <span className="is-section-label">
                    {t("enterprise.account.sync.lastLabel")}
                  </span>
                </div>
                <span className="is-stat">
                  {formatServerHourMinute(sync.lastSyncedAt, timeZone)}
                </span>
                <div className="sy-foot">
                  <span>{relativeTimeLabel(t, sync.lastSyncedAt)}</span>
                  <span>
                    {syncState === "offline"
                      ? t("enterprise.account.sync.offline")
                      : t("enterprise.account.sync.online")}
                  </span>
                </div>
              </div>
            </div>
            <div className="ent-tcard sy-sec">
              <div className="ent-tcard-hd">
                <div className="is-card-title">
                  {t("enterprise.account.sync.queueTitle")}
                  <div className="is-subtitle">
                    {t("enterprise.account.sync.queueSubtitle")}
                  </div>
                </div>
              </div>
              <table className="ent-table">
                <thead>
                  <tr>
                    {["kind", "pending", "synced", "lastSynced", "status"].map(
                      (k) => (
                        <th key={k}>{t(`enterprise.account.sync.${k}`)}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sync.queue.map((row) => (
                    <tr key={row.kind}>
                      <td>
                        <div className="sy-kind">
                          {(() => {
                            const QueueIcon = queueIcons[row.kind];
                            return (
                              <span className="sy-kind-icon">
                                <QueueIcon size={15} aria-hidden />
                              </span>
                            );
                          })()}
                          <div>
                            <strong>
                              {t(
                                `enterprise.account.sync.queueKind.${row.kind}.name`,
                              )}
                            </strong>
                            <div className="is-subtitle">
                              {t(
                                `enterprise.account.sync.queueKind.${row.kind}.desc`,
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="r ent-num">{row.pending}</td>
                      <td className="r ent-num">{formatInt(row.synced)}</td>
                      <td className="ent-num">
                        {row.lastSyncedAt
                          ? formatServerHourMinute(row.lastSyncedAt, timeZone)
                          : "—"}
                      </td>
                      <td>
                        {row.kind === "files" &&
                        row.cloud &&
                        row.cloud !== "on" ? (
                          <span className="is-badge">
                            {t(
                              `enterprise.account.sync.cloudFiles.${row.cloud}`,
                            )}
                          </span>
                        ) : row.upload ? (
                          <div className="sy-progress-cell">
                            <span>
                              {t(
                                "enterprise.account.sync.progress",
                                row.upload,
                              )}
                            </span>
                            <span className="sy-progress" aria-hidden>
                              <span style={{ width: `${row.upload.pct}%` }} />
                            </span>
                          </div>
                        ) : row.pending ? (
                          <span className="is-badge is-badge--dot is-badge--warning">
                            {t("enterprise.account.sync.waiting")}
                          </span>
                        ) : (
                          <span className="is-badge is-badge--dot is-badge--success">
                            {t("enterprise.account.sync.done")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {snapshot.cloudFiles &&
            (snapshot.cloudFiles.state === "on" ||
              snapshot.cloudFiles.state === "read_only") ? (
              <CloudExperts onRestored={() => void refresh()} />
            ) : null}
            <div className="ent-tcard sy-sec">
              <div className="ent-tcard-hd">
                <div className="is-card-title">
                  {t("enterprise.account.sync.conflictsTitle")}
                  <div className="is-subtitle">
                    {t("enterprise.account.sync.conflictsSubtitle")}
                  </div>
                </div>
                <span className="is-badge">
                  {t("enterprise.account.sync.conflictsRecent", {
                    count: sync.conflicts.length,
                  })}
                </span>
              </div>
              {sync.conflicts.length ? (
                <div className="sy-conflicts">
                  {sync.conflicts.map((c) => (
                    <div className="sy-conflict" key={c.id}>
                      <span className="sy-conflict-icon">
                        <FileWarning size={15} aria-hidden />
                      </span>
                      <div className="sy-conflict-main">
                        <div className="sy-conflict-title">
                          <strong>{c.title}</strong>
                          <span className="is-badge">
                            {c.kind === "thread-fork"
                              ? t("enterprise.account.sync.forked")
                              : t("enterprise.account.sync.keptBoth")}
                          </span>
                        </div>
                        <div className="is-subtitle">
                          {c.resolution}
                          {t("enterprise.account.sync.otherDevice", {
                            device: c.otherDevice,
                          })}
                        </div>
                      </div>
                      <span className="sy-conflict-time">
                        {formatServerHourMinute(c.at, timeZone)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="sy-empty">
                  <span className="sy-empty-icon">
                    <Cloud size={16} aria-hidden />
                  </span>
                  <span>{t("enterprise.account.sync.conflictsEmpty")}</span>
                </div>
              )}
            </div>
            <div className="ent-tip sy-sec">
              {t("enterprise.account.sync.lockedTip")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Your experts kept in 企业云端存储; one that is not on this computer can be restored here. */
function CloudExperts({ onRestored }: { onRestored: () => void }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<CloudExpert[] | null>(null);
  const [busy, setBusy] = useState("");
  const load = () =>
    cloudFilesApi
      .experts()
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  useEffect(() => {
    void load();
  }, []);
  const restore = async (item: CloudExpert) => {
    setBusy(item.expert_id);
    try {
      const result = await cloudFilesApi.restore(item.expert_id);
      void message.success(
        t("enterprise.account.sync.cloudExperts.restored", {
          name: result.name,
          count: result.written,
        }),
      );
      await load();
      onRestored();
    } catch (err) {
      void message.error(
        apiErrorMessage(
          err,
          t("enterprise.account.sync.cloudExperts.failed"),
          t,
        ),
      );
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="ent-tcard sy-sec">
      <div className="ent-tcard-hd">
        <div className="is-card-title">
          {t("enterprise.account.sync.cloudExperts.title")}
          <div className="is-subtitle">
            {t("enterprise.account.sync.cloudExperts.subtitle")}
          </div>
        </div>
      </div>
      {items && items.length ? (
        <table className="ent-table">
          <thead>
            <tr>
              <th>{t("enterprise.account.sync.cloudExperts.name")}</th>
              <th className="r">
                {t("enterprise.account.sync.cloudExperts.files")}
              </th>
              <th className="r">
                {t("enterprise.account.sync.cloudExperts.size")}
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.expert_id}>
                <td>
                  <strong>{item.name}</strong>
                </td>
                <td className="r ent-num">{formatInt(item.files)}</td>
                <td className="r ent-num">{formatBytes(item.bytes)}</td>
                <td className="r">
                  {item.local_agent_id ? (
                    <span className="is-badge">
                      {t("enterprise.account.sync.cloudExperts.here")}
                    </span>
                  ) : (
                    <Button
                      size="small"
                      loading={busy === item.expert_id}
                      onClick={() => void restore(item)}
                    >
                      {t("enterprise.account.sync.cloudExperts.restore")}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="sy-empty">
          <span className="sy-empty-icon">
            <Cloud size={16} aria-hidden />
          </span>
          <span>
            {items === null
              ? t("common.loading")
              : t("enterprise.account.sync.cloudExperts.empty")}
          </span>
        </div>
      )}
    </div>
  );
}

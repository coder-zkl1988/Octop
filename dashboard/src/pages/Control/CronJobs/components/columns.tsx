import { Button, Dropdown, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { MenuProps } from "antd";
import type { CronJobSpecOutput } from "../../../../api/types";
import { MoreHorizontal } from "lucide-react";
import { TFunction } from "i18next";
import {
  CHANNEL_ICONS,
  CHANNEL_LABEL_KEYS,
} from "../../../Agent/Channels/components/constants";
import {
  channelFromSessionKey,
  extractPromptFromJob,
  formatCronTimestamp,
  pinnedThreadId,
  truncatePromptPreview,
} from "../cronDisplay";
import {
  formatTriggerText,
  lastRunStatusTag,
  oneShotPhase,
  oneShotPhaseLabelKey,
} from "../onceSchedule";
import styles from "../index.module.less";

type CronJob = CronJobSpecOutput;

interface ColumnHandlers {
  onDetail: (job: CronJob) => void;
  onToggleEnabled: (job: CronJob) => void;
  onExecuteNow: (job: CronJob) => void;
  onEdit: (job: CronJob) => void;
  onDelete: (jobId: string) => void;
  t: TFunction;
  timeZone: string;
  /** Pin leading/trailing columns (disable on narrow screens). */
  stickyColumns?: boolean;
}

/** Last-run status → `is-badge` modifier. */
const STATUS_BADGE: Record<"success" | "error" | "warning", string> = {
  success: "is-badge--success",
  error: "is-badge--danger",
  warning: "is-badge--warning",
};

function channelLabel(channel: string, t: TFunction): string {
  const key = CHANNEL_LABEL_KEYS[channel as keyof typeof CHANNEL_LABEL_KEYS];
  return key ? t(key) : channel;
}

export const createColumns = (
  handlers: ColumnHandlers,
): ColumnsType<CronJob> => {
  const sticky = handlers.stickyColumns !== false;
  return [
    {
      title: handlers.t("cronJobs.col.id"),
      dataIndex: "id",
      key: "id",
      width: 118,
      fixed: sticky ? "left" : undefined,
      ellipsis: true,
      onHeaderCell: () => ({ style: { paddingLeft: 28 } }),
      render: (id: string, record: CronJob) => {
        const meta = (record.meta as Record<string, unknown> | undefined) ?? {};
        const sessionKey =
          typeof meta.octop_session_key === "string"
            ? meta.octop_session_key
            : "";
        const pinned = pinnedThreadId(sessionKey);
        const channel = pinned
          ? ""
          : sessionKey
          ? channelFromSessionKey(sessionKey)
          : Array.isArray(record.dispatch?.channel)
          ? record.dispatch.channel[0]
          : record.dispatch?.channel || "dashboard";
        const icon = CHANNEL_ICONS[channel as keyof typeof CHANNEL_ICONS];
        const label = pinned
          ? handlers.t("cronJobs.form.sessionKeyHistory")
          : channelLabel(channel, handlers.t);
        return (
          <Tooltip title={id}>
            <div
              className={styles.idCell}
              onClick={() => handlers.onDetail(record)}
            >
              <Tooltip title={label}>
                {icon ? (
                  <img src={icon} alt={label} className={styles.idCellIcon} />
                ) : (
                  <span className={styles.idCellChannel}>{label}</span>
                )}
              </Tooltip>
              <span className={styles.idText}>{id}</span>
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: handlers.t("cronJobs.col.name"),
      dataIndex: "name",
      key: "name",
      width: 180,
      fixed: sticky ? "left" : undefined,
      ellipsis: true,
      render: (name: string, record: CronJob) => {
        const text = name?.trim() || record.id;
        return (
          <Tooltip title={text}>
            <button
              type="button"
              className={styles.nameCellButton}
              onClick={() => handlers.onDetail(record)}
            >
              {text}
            </button>
          </Tooltip>
        );
      },
    },
    {
      title: handlers.t("common.enabled"),
      dataIndex: "enabled",
      key: "enabled",
      width: 120,
      render: (enabled: boolean, record: CronJob) => {
        const meta = (record.meta as Record<string, unknown> | undefined) ?? {};
        const lastStatus =
          typeof meta.octop_last_status === "string"
            ? meta.octop_last_status
            : null;
        const phase = oneShotPhase(record.schedule?.cron, enabled, lastStatus);
        const label = phase
          ? handlers.t(oneShotPhaseLabelKey(phase))
          : enabled
          ? handlers.t("common.enabled")
          : handlers.t("common.disabled");
        const dot =
          phase === "failed"
            ? "is-dot--blocked"
            : phase === "missed"
            ? "is-dot--building"
            : phase === "pending" || (!phase && enabled)
            ? "is-dot--running"
            : "";
        return (
          <span className={`${styles.enabledCell} is-dot ${dot}`}>{label}</span>
        );
      },
    },
    {
      title: handlers.t("cronJobs.col.trigger"),
      dataIndex: ["schedule", "cron"],
      key: "trigger",
      width: 160,
      render: (trigger: string) => (
        <code className={styles.triggerCode}>
          {formatTriggerText(trigger, {
            mail: handlers.t("cronJobs.form.agentlyNewMail"),
            once: handlers.t("cronJobs.form.scheduleModeOnce"),
          })}
        </code>
      ),
    },
    {
      title: handlers.t("cronJobs.col.taskType"),
      key: "task_type",
      width: 180,
      render: (_: unknown, record: CronJob) => {
        const taskType =
          record.task_type === "text" || record.task_type === "script"
            ? record.task_type
            : "agent";
        const label =
          taskType === "text"
            ? handlers.t("cronJobs.form.taskTypeText")
            : taskType === "script"
            ? handlers.t("cronJobs.form.taskTypeScriptShort")
            : handlers.t("cronJobs.form.taskTypeAgent");
        return (
          <Tag style={{ fontSize: 11, whiteSpace: "nowrap" }}>{label}</Tag>
        );
      },
    },
    {
      title: handlers.t("cronJobs.col.prompt"),
      key: "prompt",
      width: 240,
      ellipsis: true,
      render: (_: unknown, record: CronJob) => {
        const content = extractPromptFromJob(record);
        if (!content) {
          return <span className={styles.mutedCell}>—</span>;
        }
        const preview = truncatePromptPreview(content);
        const truncated = preview !== content.trim();
        return (
          <Tooltip title={truncated ? content : undefined}>
            <span className={styles.promptCell}>{preview}</span>
          </Tooltip>
        );
      },
    },
    {
      title: handlers.t("cronJobs.col.lastRunAt"),
      key: "last_run_at",
      width: 168,
      render: (_: unknown, record: CronJob) => {
        const meta = (record.meta as Record<string, unknown> | undefined) ?? {};
        const ts = meta.octop_last_run_at;
        return (
          <span className={styles.timeCell}>
            {formatCronTimestamp(
              typeof ts === "number" ? ts : null,
              handlers.timeZone,
            )}
          </span>
        );
      },
    },
    {
      title: handlers.t("cronJobs.col.lastStatus"),
      key: "last_status",
      width: 100,
      render: (_: unknown, record: CronJob) => {
        const meta = (record.meta as Record<string, unknown> | undefined) ?? {};
        const status = meta.octop_last_status;
        const lastError =
          typeof meta.octop_last_error === "string"
            ? meta.octop_last_error
            : null;
        if (typeof status !== "string" || !status) {
          return <span className={styles.mutedCell}>—</span>;
        }
        const known = lastRunStatusTag(status);
        const tag = (
          <span
            className={`is-badge is-badge--dot ${
              known ? STATUS_BADGE[known.color] : ""
            }`}
          >
            {known ? handlers.t(known.labelKey) : status}
          </span>
        );
        if (status === "error" && lastError) {
          return <Tooltip title={lastError}>{tag}</Tooltip>;
        }
        return tag;
      },
    },
    {
      title: handlers.t("cronJobs.col.freshThread"),
      key: "fresh_thread",
      width: 96,
      render: (_: unknown, record: CronJob) => {
        const meta = (record.meta as Record<string, unknown> | undefined) ?? {};
        const fresh = Boolean(meta.octop_fresh_thread);
        return (
          <span className="is-badge">
            {fresh
              ? handlers.t("cronJobs.col.freshThreadOn")
              : handlers.t("cronJobs.col.freshThreadOff")}
          </span>
        );
      },
    },
    {
      title: handlers.t("cronJobs.action"),
      key: "action",
      width: 220,
      fixed: sticky ? "right" : undefined,
      className: styles.actionCell,
      render: (_: unknown, record: CronJob) => {
        const menuItems: MenuProps["items"] = [
          {
            key: "edit",
            label: handlers.t("common.edit"),
            disabled: record.enabled,
            onClick: () => handlers.onEdit(record),
          },
          {
            key: "delete",
            label: handlers.t("common.delete"),
            disabled: record.enabled,
            danger: true,
            onClick: () => handlers.onDelete(record.id),
          },
        ];

        return (
          <div className={styles.tableActionGroup}>
            <Button
              type="link"
              size="small"
              onClick={() => handlers.onToggleEnabled(record)}
            >
              {record.enabled
                ? handlers.t("common.disable")
                : handlers.t("common.enable")}
            </Button>
            <Button
              type="link"
              size="small"
              onClick={() => handlers.onExecuteNow(record)}
            >
              {handlers.t("cronJobs.executeNow")}
            </Button>
            <Dropdown menu={{ items: menuItems }} placement="bottomRight">
              <Button
                type="text"
                size="small"
                icon={<MoreHorizontal size={14} />}
              />
            </Dropdown>
          </div>
        );
      },
    },
  ];
};

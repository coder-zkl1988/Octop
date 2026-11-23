import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { App, Button, List, Tag, Tooltip } from "antd";
import { ChevronLeft, Cloud, CloudUpload, Laptop, Lock } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { CopyableResourceId } from "../../components/CopyableResourceId";
import {
  enterpriseKnowledgeApi,
  type EnterpriseKnowledgeBase,
  type KnowledgePublishRequest,
  type KnowledgeShareTargets,
} from "../../enterprise/api/knowledge";
import { KnowledgeBaseAvatar } from "./knowledgeIcons";
import styles from "./index.module.less";
import ekb from "./EnterpriseKnowledge.module.less";

const EMPTY_TARGETS: KnowledgeShareTargets = { departments: [], members: [] };

/** Enterprise-cloud side of the knowledge page: public bases + publish requests. */
export function useEnterpriseKnowledge() {
  const [publicBases, setPublicBases] = useState<EnterpriseKnowledgeBase[]>([]);
  const [requests, setRequests] = useState<KnowledgePublishRequest[]>([]);
  const [shareTargets, setShareTargets] =
    useState<KnowledgeShareTargets>(EMPTY_TARGETS);

  const reload = useCallback(async () => {
    const [nextBases, nextRequests, nextTargets] = await Promise.all([
      enterpriseKnowledgeApi.listPublicBases(),
      enterpriseKnowledgeApi.listPublishRequests(),
      enterpriseKnowledgeApi.getShareTargets(),
    ]);
    setPublicBases(nextBases);
    setRequests(nextRequests);
    setShareTargets(nextTargets);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const requestFor = useCallback(
    (baseId: string | undefined) =>
      requests.find((request) => request.baseId === baseId) ?? null,
    [requests],
  );

  return { publicBases, shareTargets, requestFor, reload };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** "10/28" */
function formatMonthDay(iso: string): string {
  const date = new Date(iso);
  return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`;
}

/** "10/28 16:20" */
function formatMonthDayTime(iso: string): string {
  const date = new Date(iso);
  return `${formatMonthDay(iso)} ${pad2(date.getHours())}:${pad2(
    date.getMinutes(),
  )}`;
}

/** "全员" / "客服部、售前支持部" / "王磊、陈思". */
function shareScopeLabel(
  t: TFunction,
  request: KnowledgePublishRequest,
  targets: KnowledgeShareTargets,
): string {
  const separator = t("enterprise.knowledge.listSeparator");
  if (request.scope === "departments")
    return request.departments.join(separator);
  if (request.scope === "members") {
    return request.memberIds
      .map(
        (id) => targets.members.find((member) => member.id === id)?.name ?? id,
      )
      .join(separator);
  }
  return t("enterprise.knowledge.publishModal.scopeAll");
}

export function KnowledgeGroupLabel({
  group,
  tenantName,
}: {
  group: "local" | "cloud";
  tenantName?: string;
}) {
  const { t } = useTranslation();
  const cloud = group === "cloud";
  return (
    <li
      className={`${ekb.groupLabel}${cloud ? ` ${ekb.groupLabelCloud}` : ""}`}
    >
      <span className="is-section-label">
        {t(
          cloud
            ? "enterprise.knowledge.groupCloud"
            : "enterprise.knowledge.groupLocal",
        )}
      </span>
      {cloud && !tenantName ? null : (
        <span className={ekb.groupNote}>
          {cloud ? (
            <Cloud size={12} aria-hidden />
          ) : (
            <Laptop size={12} aria-hidden />
          )}
          {cloud ? tenantName : t("enterprise.knowledge.groupLocalNote")}
        </span>
      )}
    </li>
  );
}

/** Bottom row of a personal list card: publish action or its pending state. */
export function KnowledgePublishRow({
  request,
  canPublish,
  onPublish,
}: {
  request: KnowledgePublishRequest | null;
  canPublish: boolean;
  onPublish: () => void;
}) {
  const { t } = useTranslation();
  if (!request && !canPublish) return null;
  return (
    <div className={ekb.publishRow}>
      {request ? (
        <>
          <span className="is-badge is-badge--dot is-badge--warning">
            {t("enterprise.knowledge.pending")}
          </span>
          <span className={ekb.publishMeta}>
            {t("enterprise.knowledge.pendingMeta", {
              date: formatMonthDay(request.submittedAt),
            })}
          </span>
        </>
      ) : (
        <button
          type="button"
          className={ekb.publishBtn}
          onClick={(event: MouseEvent) => {
            event.stopPropagation();
            onPublish();
          }}
        >
          <CloudUpload size={13} aria-hidden />
          {t("enterprise.knowledge.publish")}
        </button>
      )}
    </div>
  );
}

/** "审批中 … 撤回申请" above the document list of a base awaiting approval. */
export function PublishApprovalStrip({
  request,
  shareTargets,
  onWithdrawn,
}: {
  request: KnowledgePublishRequest;
  shareTargets: KnowledgeShareTargets;
  onWithdrawn: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [withdrawing, setWithdrawing] = useState(false);

  const withdraw = async () => {
    setWithdrawing(true);
    try {
      await enterpriseKnowledgeApi.withdrawPublish(request.id);
      message.success(t("enterprise.knowledge.withdrawSuccess"));
      await onWithdrawn();
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className={ekb.strip} role="status">
      <span className="is-badge is-badge--dot is-badge--warning">
        {t("enterprise.knowledge.pending")}
      </span>
      <span className={ekb.stripText}>
        <Trans
          i18nKey="enterprise.knowledge.strip"
          values={{ scope: shareScopeLabel(t, request, shareTargets) }}
          components={{ b: <b /> }}
        />
      </span>
      <span className={`${ekb.stripMeta} num`}>
        {t("enterprise.knowledge.submittedAt", {
          time: formatMonthDayTime(request.submittedAt),
        })}
      </span>
      <Button
        size="small"
        loading={withdrawing}
        onClick={() => void withdraw()}
      >
        {t("enterprise.knowledge.withdraw")}
      </Button>
    </div>
  );
}

function AccessBadge({
  access,
}: {
  access: EnterpriseKnowledgeBase["access"];
}) {
  const { t } = useTranslation();
  return access === "edit" ? (
    <span className="is-badge is-badge--success">
      {t("enterprise.knowledge.accessEdit")}
    </span>
  ) : (
    <span className={`is-badge ${ekb.accessBadge}`}>
      <Lock size={12} aria-hidden />
      {t("enterprise.knowledge.accessRead")}
    </span>
  );
}

/** Read-only list card for an enterprise (cloud) knowledge base. */
export function CloudKnowledgeBaseItem({
  base,
  active,
  onSelect,
}: {
  base: EnterpriseKnowledgeBase;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <List.Item className={styles.listRow} onClick={onSelect}>
      <div className={`${styles.listItem} ${active ? styles.active : ""}`}>
        <div className={styles.listName}>
          <span className={styles.listIcon}>
            <KnowledgeBaseAvatar iconName={base.iconName} size={18} />
          </span>
          <Tooltip title={base.name} placement="topLeft">
            <span className={styles.listNameText}>{base.name}</span>
          </Tooltip>
          <div
            className={styles.listId}
            onClick={(event) => event.stopPropagation()}
          >
            <CopyableResourceId
              inline
              valueOnly
              className={styles.listIdButton}
              label={t("knowledgeBases.baseId")}
              value={base.id}
              copyTitle={t("knowledgeBases.copyBaseId")}
            />
          </div>
        </div>
        <Tooltip title={base.description} placement="topLeft">
          <div className={styles.listDescription}>{base.description}</div>
        </Tooltip>
        <div className={styles.listMeta}>
          <span className={styles.listCreator} title={base.ownerDepartment}>
            {base.ownerDepartment}
          </span>
          <div className={styles.listMetaEnd}>
            <Tag className={styles.listCountTag}>
              {t("knowledgeBases.documentCount", { count: base.docCount })}
            </Tag>
            <AccessBadge access={base.access} />
          </div>
        </div>
      </div>
    </List.Item>
  );
}

/** Detail pane for a cloud knowledge base: metadata only, documents live in the cloud. */
export function CloudKnowledgeBaseDetail({
  base,
  onBack,
}: {
  base: EnterpriseKnowledgeBase;
  /** Mobile: return to the list. */
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={ekb.cloudDetail}>
      <div className={ekb.cloudHead}>
        {onBack ? (
          <button
            type="button"
            className={styles.mobileBack}
            onClick={onBack}
            aria-label={t("knowledgeBases.backToList")}
          >
            <ChevronLeft size={18} />
          </button>
        ) : null}
        <span className={ekb.cloudIcon}>
          <KnowledgeBaseAvatar iconName={base.iconName} size={20} />
        </span>
        <div className={ekb.cloudHeadMain}>
          <div className={ekb.cloudName}>{base.name}</div>
          <div className={ekb.cloudMeta}>
            <span>{base.ownerDepartment}</span>
            <span aria-hidden>·</span>
            <span className="num">
              {t("knowledgeBases.documentCount", { count: base.docCount })}
            </span>
          </div>
        </div>
        <AccessBadge access={base.access} />
      </div>
      <p className={ekb.cloudDesc}>{base.description}</p>
      <div className="ent-tip">
        <Cloud size={14} aria-hidden />
        <span>{t("enterprise.knowledge.cloudNote")}</span>
      </div>
    </div>
  );
}

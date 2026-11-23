import { useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  Checkbox,
  Modal,
  Radio,
  Segmented,
  Select,
  Spin,
} from "antd";
import {
  Building2,
  CloudUpload,
  FileText,
  Globe,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

import {
  knowledgeBasesApi,
  type KnowledgeBase,
  type KnowledgeDocument,
} from "../../api/modules/knowledgeBases";
import {
  enterpriseKnowledgeApi,
  type KnowledgeShareScope,
  type KnowledgeShareTargets,
  type KnowledgeSyncMode,
} from "../../enterprise/api/knowledge";
import { formatBytes } from "../../utils/embeddingDownload";
import { apiErrorMessage } from "../../utils/apiError";
import { KnowledgeBaseAvatar } from "./knowledgeIcons";
import styles from "./index.module.less";
import ekb from "./EnterpriseKnowledge.module.less";

type DocsMode = "all" | "pick";

interface PublishToEnterpriseModalProps {
  /** Base to preselect; `null` keeps the modal closed. */
  baseId: string | null;
  /** Personal bases the member may publish (owned, no open request). */
  bases: KnowledgeBase[];
  shareTargets: KnowledgeShareTargets;
  onClose: () => void;
  onSubmitted: () => void | Promise<void>;
}

/** "发布到企业空间": choose documents, audience and sync policy, then request approval. */
export function PublishToEnterpriseModal({
  baseId,
  bases,
  shareTargets,
  onClose,
  onSubmitted,
}: PublishToEnterpriseModalProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [currentBaseId, setCurrentBaseId] = useState<string | null>(baseId);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsMode, setDocsMode] = useState<DocsMode>("all");
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [scope, setScope] = useState<KnowledgeShareScope>("all");
  const [departments, setDepartments] = useState<string[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [syncMode, setSyncMode] = useState<KnowledgeSyncMode>("prompt");
  const [submitting, setSubmitting] = useState(false);

  // Reset the form each time the modal opens for a base.
  useEffect(() => {
    if (!baseId) return;
    setCurrentBaseId(baseId);
    setDocsMode("all");
    setScope("all");
    setDepartments([]);
    setMemberIds([]);
    setSyncMode("prompt");
  }, [baseId]);

  useEffect(() => {
    if (!baseId || !currentBaseId) return;
    let cancelled = false;
    setDocsLoading(true);
    setDocuments([]);
    knowledgeBasesApi
      .listDocuments(currentBaseId)
      .then((rows) => {
        if (cancelled) return;
        const files = rows.filter((row) => !row.is_dir);
        setDocuments(files);
        setPickedIds(files.map((file) => file.id));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          message.error(
            apiErrorMessage(error, t("knowledgeBases.loadFailed"), t),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDocsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [baseId, currentBaseId, message, t]);

  const base = bases.find((row) => row.id === currentBaseId) ?? null;
  const selectedCount =
    docsMode === "all" ? documents.length : pickedIds.length;
  const canSubmit =
    Boolean(base) &&
    !docsLoading &&
    selectedCount > 0 &&
    (scope !== "departments" || departments.length > 0) &&
    (scope !== "members" || memberIds.length > 0);

  const baseOptions = useMemo(
    () =>
      bases.map((row) => ({
        value: row.id,
        label: (
          <span className={ekb.baseOption}>
            <span className={`${styles.listIcon} ${ekb.baseOptionIcon}`}>
              <KnowledgeBaseAvatar
                iconUrl={row.icon_url}
                iconName={row.icon_name}
                size={14}
              />
            </span>
            <span className={ekb.baseOptionName}>{row.name}</span>
            <span className={`${ekb.baseOptionCount} ent-num`}>
              {t("knowledgeBases.documentCount", { count: row.doc_count })}
            </span>
          </span>
        ),
      })),
    [bases, t],
  );

  const togglePicked = (id: string, checked: boolean) => {
    setPickedIds((prev) =>
      checked ? [...prev, id] : prev.filter((value) => value !== id),
    );
  };

  const submit = async () => {
    if (!base) return;
    setSubmitting(true);
    try {
      await enterpriseKnowledgeApi.submitPublish({
        baseId: base.id,
        title: base.name,
        documentIds: docsMode === "all" ? null : pickedIds,
        scope,
        departments: scope === "departments" ? departments : [],
        memberIds: scope === "members" ? memberIds : [],
        syncMode,
      });
      message.success(t("enterprise.knowledge.publishModal.submitSuccess"));
      await onSubmitted();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const scopeOption = (
    value: KnowledgeShareScope,
    icon: React.ReactNode,
    labelKey: string,
  ) => ({
    value,
    label: (
      <span className={ekb.scopeLabel}>
        {icon}
        {t(labelKey)}
      </span>
    ),
  });

  return (
    <Modal
      open={baseId !== null}
      width={600}
      centered
      destroyOnHidden
      className={ekb.publishModal}
      onCancel={onClose}
      title={
        <div className={ekb.publishHead}>
          <span className="ent-ico">
            <CloudUpload size={16} aria-hidden />
          </span>
          <div className={ekb.publishHeadMain}>
            <div className={ekb.publishTitle}>
              {t("enterprise.knowledge.publishModal.title")}
            </div>
            <div className={ekb.publishSub}>
              {t("enterprise.knowledge.publishModal.subtitle")}
            </div>
          </div>
        </div>
      }
      footer={
        <div className={ekb.publishFooter}>
          <div className="ent-tip">
            <ShieldCheck size={14} aria-hidden />
            <span>{t("enterprise.knowledge.publishModal.approvalNote")}</span>
          </div>
          <Button onClick={onClose}>
            {t("enterprise.knowledge.publishModal.cancel")}
          </Button>
          <Button
            type="primary"
            className="is-cta"
            icon={<CloudUpload size={14} />}
            loading={submitting}
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {t("enterprise.knowledge.publishModal.submit")}
          </Button>
        </div>
      }
    >
      <div className={ekb.publishBody}>
        <div className={ekb.field}>
          <div className={ekb.fieldLabel} id="kb-publish-base">
            {t("enterprise.knowledge.publishModal.base")}
          </div>
          <Select
            aria-labelledby="kb-publish-base"
            className={ekb.baseSelect}
            value={currentBaseId ?? undefined}
            options={baseOptions}
            onChange={(value: string) => {
              setCurrentBaseId(value);
              setDocsMode("all");
            }}
          />
        </div>

        <div className={ekb.field}>
          <div className={ekb.fieldLabel}>
            <span id="kb-publish-docs">
              {t("enterprise.knowledge.publishModal.docs")}
            </span>
            <span className={ekb.fieldLabelMuted}>
              <Trans
                i18nKey="enterprise.knowledge.publishModal.selectedCount"
                values={{ selected: selectedCount, total: documents.length }}
                components={{ n: <span className="ent-num" /> }}
              />
            </span>
          </div>
          <Radio.Group
            aria-labelledby="kb-publish-docs"
            className={ekb.radioRow}
            value={docsMode}
            onChange={(event) => setDocsMode(event.target.value as DocsMode)}
          >
            <Radio value="all">
              {t("enterprise.knowledge.publishModal.allDocs")}
            </Radio>
            <Radio value="pick" disabled={documents.length === 0}>
              {t("enterprise.knowledge.publishModal.pickDocs")}
            </Radio>
          </Radio.Group>
          {docsLoading ? (
            <div className={ekb.docsLoading}>
              <Spin size="small" />
            </div>
          ) : documents.length === 0 ? (
            <div className={ekb.docsEmpty}>
              {t("enterprise.knowledge.publishModal.noDocs")}
            </div>
          ) : docsMode === "pick" ? (
            <div className={ekb.docs}>
              {documents.map((document) => (
                <label key={document.id} className={ekb.doc}>
                  <Checkbox
                    checked={pickedIds.includes(document.id)}
                    onChange={(event) =>
                      togglePicked(document.id, event.target.checked)
                    }
                  />
                  <FileText size={14} className={ekb.docIcon} aria-hidden />
                  <span
                    className={ekb.docName}
                    title={document.path || document.filename}
                  >
                    {document.path || document.filename}
                  </span>
                  <span className={`${ekb.docSize} ent-num`}>
                    {formatBytes(document.byte_size)}
                  </span>
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <div className={ekb.field}>
          <div className={ekb.fieldLabel} id="kb-publish-scope">
            {t("enterprise.knowledge.publishModal.scope")}
          </div>
          <Segmented
            aria-labelledby="kb-publish-scope"
            className={ekb.scopeSeg}
            value={scope}
            onChange={(value) => setScope(value as KnowledgeShareScope)}
            options={[
              scopeOption(
                "all",
                <Globe size={14} aria-hidden />,
                "enterprise.knowledge.publishModal.scopeAll",
              ),
              scopeOption(
                "departments",
                <Building2 size={14} aria-hidden />,
                "enterprise.knowledge.publishModal.scopeDepartments",
              ),
              scopeOption(
                "members",
                <Users size={14} aria-hidden />,
                "enterprise.knowledge.publishModal.scopeMembers",
              ),
            ]}
          />
          {scope === "departments" ? (
            <Select
              mode="multiple"
              aria-labelledby="kb-publish-scope"
              className={ekb.tagSelect}
              value={departments}
              onChange={setDepartments}
              placeholder={t("enterprise.knowledge.publishModal.addDepartment")}
              options={shareTargets.departments.map((name) => ({
                value: name,
                label: name,
              }))}
            />
          ) : scope === "members" ? (
            <Select
              mode="multiple"
              aria-labelledby="kb-publish-scope"
              className={ekb.tagSelect}
              value={memberIds}
              onChange={setMemberIds}
              placeholder={t("enterprise.knowledge.publishModal.addMember")}
              optionFilterProp="label"
              options={shareTargets.members.map((member) => ({
                value: member.id,
                label: member.name,
              }))}
            />
          ) : null}
        </div>

        <div className={ekb.field}>
          <div className={ekb.fieldLabel} id="kb-publish-sync">
            {t("enterprise.knowledge.publishModal.afterUpdate")}
          </div>
          <Radio.Group
            aria-labelledby="kb-publish-sync"
            className={ekb.radioColumn}
            value={syncMode}
            onChange={(event) =>
              setSyncMode(event.target.value as KnowledgeSyncMode)
            }
          >
            <Radio value="prompt">
              {t("enterprise.knowledge.publishModal.syncPrompt")}
            </Radio>
            <Radio value="auto">
              {t("enterprise.knowledge.publishModal.syncAuto")}
              <span className={ekb.radioHint}>
                {t("enterprise.knowledge.publishModal.syncAutoHint")}
              </span>
            </Radio>
          </Radio.Group>
        </div>
      </div>
    </Modal>
  );
}

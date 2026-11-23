import { Alert, Button, Modal } from "antd";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { enterpriseApi } from "./api/core";
import { useEnterprise } from "./EnterpriseContext";

/** Keeps enterprise billing/session policy visible at the point a cloud action is blocked. */
export default function EnterpriseStateGate() {
  const { t } = useTranslation();
  const location = useLocation();
  const { cloudBlock, sessionLocked, snapshot, refresh } = useEnterprise();
  if (
    ["/login", "/setup", "/invite", "/device-revoked"].includes(
      location.pathname,
    )
  )
    return null;
  if (cloudBlock === "offline") {
    return (
      <Alert
        banner
        type="warning"
        message={t("enterprise.core.block.offline.title")}
        description={t("enterprise.core.block.offline.desc")}
      />
    );
  }
  if (!cloudBlock && !sessionLocked) return null;
  const session = sessionLocked;
  return (
    <Modal
      open
      centered
      footer={null}
      closable={false}
      title={t(
        session
          ? "enterprise.core.block.session.title"
          : "enterprise.core.block.billing.title",
      )}
    >
      <p>
        {t(
          session
            ? "enterprise.core.block.session.desc"
            : `enterprise.core.block.${cloudBlock}.desc`,
          {
            used: snapshot?.quota.usedPoints,
            quota: snapshot?.quota.quotaPoints,
          },
        )}
      </p>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 20,
        }}
      >
        {session ? (
          <Button
            onClick={() =>
              void enterpriseApi.takeOverSession("current").then(refresh)
            }
            type="primary"
          >
            {t("enterprise.core.block.session.takeOver")}
          </Button>
        ) : (
          <Button href="/account">
            {t("enterprise.core.block.billing.account")}
          </Button>
        )}
      </div>
    </Modal>
  );
}

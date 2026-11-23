import { Button, Modal } from "antd";
import { useTranslation } from "react-i18next";

import styles from "./ForgotPasswordModal.module.less";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Tenant shown in the "contact your admin" step, when known. */
  tenantName?: string;
  /** Work email the temporary password goes to, when typed on the form. */
  email?: string;
}

/** Enterprise passwords are admin-managed: explain how to get back in. */
export default function ForgotPasswordModal({
  open,
  onClose,
  tenantName,
  email,
}: Props) {
  const { t } = useTranslation();
  const tenant = tenantName || t("enterprise.auth.forgot.yourCompany");
  const steps = [
    {
      title: t("enterprise.auth.forgot.step1Title"),
      hint: email
        ? t("enterprise.auth.forgot.step1Hint", { tenant, email })
        : t("enterprise.auth.forgot.step1HintNoEmail", { tenant }),
    },
    {
      title: t("enterprise.auth.forgot.step2Title"),
      hint: t("enterprise.auth.forgot.step2Hint"),
    },
    {
      title: t("enterprise.auth.forgot.step3Title"),
      hint: t("enterprise.auth.forgot.step3Hint"),
    },
  ];

  return (
    <Modal
      open={open}
      title={t("enterprise.auth.forgot.title")}
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose}>
          {t("enterprise.auth.forgot.back")}
        </Button>
      }
      width={520}
      centered
      destroyOnHidden
      styles={{ footer: { marginTop: 20 } }}
    >
      <div className={styles.body} data-testid="login-forgot-password">
        <p className={styles.note}>{t("enterprise.auth.forgot.intro")}</p>
        <ol className={styles.steps}>
          {steps.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepN} aria-hidden>
                {index + 1}
              </span>
              <div>
                <div className={styles.stepTitle}>{step.title}</div>
                <div className={styles.hint}>{step.hint}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Modal>
  );
}

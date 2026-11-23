import { useState, type FormEvent, type ReactNode } from "react";
import { Alert, Button, Input } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { authApi, type EnterpriseInvitation } from "../../api/modules/auth";
import { parseApiError } from "../../utils/apiError";
import { message } from "../../utils/antdMessage";
import styles from "./index.module.less";

function invitationCode(input: string): string {
  const value = input.trim();
  return value.match(/(?:^|\/)invite\/([\w.-]+)(?:[/?#]|$)/)?.[1] ?? value;
}

export default function EnterpriseRegistration({
  logo,
  onRegistered,
}: {
  logo: ReactNode;
  onRegistered: (email: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState("");
  const [mode, setMode] = useState<"invite" | "email">("invite");
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [details, setDetails] = useState<EnterpriseInvitation | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const code = invitationCode(invitation);
  const validCode = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,255}$/.test(code);
  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading || (mode === "invite" ? !validCode : !validEmail)) return;
    if (mode === "email") {
      if (!emailCodeSent) return;
      if (!/^\d{6}$/.test(emailCode)) {
        setError(t("login.enterpriseRegister.emailCodeInvalid"));
        return;
      }
      if (password.length < 10) {
        setError(t("login.enterpriseRegister.passwordHint"));
        return;
      }
      if (password !== confirmation) {
        setError(t("login.enterpriseRegister.passwordMismatch"));
        return;
      }
    }
    if (details && password.length < 10) {
      setError(t("login.enterpriseRegister.passwordHint"));
      return;
    }
    if (details && password !== confirmation) {
      setError(t("login.enterpriseRegister.passwordMismatch"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (mode === "email") {
        await authApi.enterpriseOpenRegister(
          email.trim(),
          emailCode,
          name.trim(),
          password,
        );
        onRegistered(email.trim());
        message.success(t("login.enterpriseRegister.success"));
        navigate("/login", { replace: true });
        return;
      }
      if (!details) {
        setDetails(await authApi.validateEnterpriseInvitation(code));
        return;
      }
      await authApi.enterpriseRegister(code, name.trim(), password);
      onRegistered(details.email);
      message.success(t("login.enterpriseRegister.success"));
      navigate("/login", { replace: true });
    } catch (err) {
      const apiCode = parseApiError(err)?.code;
      if (apiCode === "INVITE_INVALID") setDetails(null);
      setError(
        apiCode === "INVITE_INVALID" || apiCode === "INVITE_RATE_LIMITED"
          ? t(`apiErrors.${apiCode}`)
          : t("login.enterpriseRegister.failed"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.shell}>
      <form className={styles.card} onSubmit={(event) => void submit(event)}>
        {logo}
        <div className={styles.head}>
          <h2 className={styles.title}>
            {t("login.enterpriseRegister.title")}
          </h2>
          <p className={styles.sub}>{t("login.enterpriseRegister.hint")}</p>
        </div>
        <div className={styles.registrationModes}>
          <Button
            type={mode === "invite" ? "primary" : "default"}
            onClick={() => setMode("invite")}
          >
            {t("login.enterpriseRegister.inviteMode")}
          </Button>
          <Button
            type={mode === "email" ? "primary" : "default"}
            onClick={() => setMode("email")}
          >
            {t("login.enterpriseRegister.emailMode")}
          </Button>
        </div>
        {mode === "email" ? (
          <>
            <label className={styles.registrationField}>
              {t("login.enterpriseRegister.email")}
              <Input
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setEmailCodeSent(false);
                  setError("");
                }}
                autoComplete="email"
                type="email"
                required
                disabled={loading}
              />
            </label>
            <div className={styles.registrationCodeRow}>
              <Input
                aria-label={t("login.enterpriseRegister.emailCode")}
                value={emailCode}
                onChange={(event) => setEmailCode(event.target.value)}
                inputMode="numeric"
                maxLength={6}
                disabled={!emailCodeSent || loading}
              />
              <Button
                type="default"
                disabled={!validEmail || loading}
                onClick={() => {
                  setLoading(true);
                  setError("");
                  void authApi
                    .enterpriseOpenRegisterCode(email.trim())
                    .then(() => setEmailCodeSent(true))
                    .catch(() =>
                      setError(t("login.enterpriseRegister.emailCodeFailed")),
                    )
                    .finally(() => setLoading(false));
                }}
              >
                {t("login.enterpriseRegister.sendEmailCode")}
              </Button>
            </div>
            <label className={styles.registrationField}>
              {t("login.enterpriseRegister.name")}
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                maxLength={100}
                required
              />
            </label>
            <label className={styles.registrationField}>
              {t("login.password")}
              <Input.Password
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("login.enterpriseRegister.passwordHint")}
                autoComplete="new-password"
                maxLength={200}
                required
              />
            </label>
            <label className={styles.registrationField}>
              {t("login.enterpriseRegister.confirmPassword")}
              <Input.Password
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                maxLength={200}
                required
              />
            </label>
          </>
        ) : (
          <>
            <label className={styles.registrationField}>
              {t("login.enterpriseRegister.invitation")}
              <Input
                value={invitation}
                onChange={(event) => {
                  setInvitation(event.target.value);
                  setDetails(null);
                  setPassword("");
                  setConfirmation("");
                  setError("");
                }}
                autoComplete="off"
                maxLength={512}
                required
                disabled={loading}
              />
            </label>
            {details && (
              <>
                <p className={styles.sub}>
                  {t("login.enterpriseRegister.invitedAs", {
                    company: details.tenant_name,
                    email: details.email,
                  })}
                </p>
                <label className={styles.registrationField}>
                  {t("login.enterpriseRegister.name")}
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    maxLength={100}
                    required
                  />
                </label>
                <label className={styles.registrationField}>
                  {t("login.password")}
                  <Input.Password
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={t("login.enterpriseRegister.passwordHint")}
                    autoComplete="new-password"
                    maxLength={200}
                    required
                  />
                </label>
                <label className={styles.registrationField}>
                  {t("login.enterpriseRegister.confirmPassword")}
                  <Input.Password
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="new-password"
                    maxLength={200}
                    required
                  />
                </label>
              </>
            )}
          </>
        )}
        {error && <Alert type="error" message={error} showIcon />}
        <Button
          type="primary"
          htmlType="submit"
          block
          loading={loading}
          disabled={
            (mode === "invite" ? !validCode : !validEmail) ||
            Boolean(
              mode === "invite"
                ? details && (!name.trim() || !password || !confirmation)
                : !emailCodeSent || !name.trim() || !password || !confirmation,
            )
          }
        >
          {t(
            mode === "email"
              ? "login.enterpriseRegister.submit"
              : details
              ? "login.enterpriseRegister.submit"
              : "login.enterpriseRegister.check",
          )}
        </Button>
        <Link to="/login">{t("login.enterpriseRegister.back")}</Link>
      </form>
    </div>
  );
}

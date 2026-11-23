import { Button, message, Popconfirm } from "antd";
import {
  BarChart3,
  BadgeCheck,
  HardDrive,
  Laptop2,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { authApi } from "../../../api/modules/auth";
import { enterpriseApi } from "../../../enterprise/api/core";
import { useEnterprise } from "../../../enterprise/EnterpriseContext";
import {
  formatInt,
  formatPercent,
  formatPoints,
  formatTokens,
} from "../../../enterprise/format";
import { relativeTimeLabel } from "../../../enterprise/relativeTime";
import { useServerTimezone } from "../../../hooks/useServerTimezone";
import { formatServerYmd } from "../../../utils/formatMessageTime";

export default function AccountPage() {
  const { t } = useTranslation();
  const { snapshot, refresh } = useEnterprise();
  const timeZone = useServerTimezone();
  useEffect(() => {
    if (!snapshot) void refresh();
  }, [refresh, snapshot]);
  if (!snapshot)
    return (
      <div className="page-container">
        <div className="page-content account-page-content">
          {t("common.loading")}
        </div>
      </div>
    );
  const { tenant, member, quota, usage, devices, policy, app } = snapshot;
  const isTenantAdmin = member.role === "admin";
  const pct = Math.min(
    100,
    Number(formatPercent(quota.usedPoints, quota.quotaPoints)),
  );
  const signOut = async (id: string, name: string) => {
    await enterpriseApi.signOutDevice(id);
    await refresh();
    void message.success(t("enterprise.account.devices.signedOut", { name }));
  };
  return (
    <div className="page-container">
      <div className="page-content account-page-content">
        <div className="ps-root">
          <header className="ps-header">
            <div>
              <div className="ps-title-row">
                <h4 className="ps-title">{t("enterprise.account.title")}</h4>
                <span className="ps-context">
                  <span className="ps-context-mark">{tenant.mark}</span>
                  {tenant.name}
                </span>
              </div>
              <span className="ps-subtitle">
                {t(
                  isTenantAdmin
                    ? "enterprise.account.subtitleAdmin"
                    : "enterprise.account.subtitleMember",
                )}
              </span>
            </div>
          </header>
          <div className="ps-content ps-content--fill">
            <div className="is-card acc-profile">
              <div className="acc-profile-main">
                <span className="is-avatar">{member.name.slice(0, 1)}</span>
                <div className="acc-profile-copy">
                  <div className="acc-profile-name">
                    {member.name}{" "}
                    <span className="is-badge">
                      {t(`enterprise.core.role.${member.role}`)}
                    </span>
                  </div>
                  <div className="is-subtitle">
                    {member.email} ·{" "}
                    {t("enterprise.account.tenantDepartment", {
                      tenant: tenant.name,
                      department: member.department,
                    })}
                  </div>
                </div>
                <span className="acc-profile-status is-badge is-badge--dot is-badge--success">
                  <BadgeCheck size={13} aria-hidden />
                  {t("enterprise.core.sync.synced")}
                </span>
                <Button
                  className="acc-signout"
                  danger
                  onClick={() => void authApi.logout()}
                >
                  {t("enterprise.core.signOut")}
                </Button>
              </div>
            </div>
            <dl className="acc-kv">
              <div>
                <dt>{t("enterprise.account.loginMethod")}</dt>
                <dd>
                  {t(`enterprise.core.loginMethod.${member.loginMethod}`)}
                </dd>
              </div>
              <div>
                <dt>{t("enterprise.account.role")}</dt>
                <dd>
                  {t("enterprise.account.roleAssigned", {
                    role: t(`enterprise.core.role.${member.role}`),
                  })}
                </dd>
              </div>
              <div>
                <dt>{t("enterprise.account.policyVersion")}</dt>
                <dd>
                  v{policy.version} · {relativeTimeLabel(t, policy.updatedAt)}
                  {t("enterprise.account.policyUpdated", { time: "" })}
                </dd>
              </div>
              <div>
                <dt>{t("enterprise.account.appVersion")}</dt>
                <dd>
                  {app.version} · {t(`enterprise.core.channel.${app.channel}`)}
                </dd>
              </div>
            </dl>
            <div
              className={`acc-grid acc-grid--${
                isTenantAdmin ? "admin" : "member"
              } acc-sec`}
            >
              {isTenantAdmin && (
                <div className="is-card acc-stat">
                  <div className="acc-stat-head">
                    <span className="acc-stat-icon acc-stat-icon--balance">
                      <WalletCards size={16} aria-hidden />
                    </span>
                    <span className="is-section-label">
                      {t("enterprise.account.balance.label")}
                    </span>
                  </div>
                  <span className="is-stat">
                    {formatPoints(tenant.balancePoints)}
                    <small> {t("enterprise.core.points")}</small>
                  </span>
                  <div className="acc-stat-foot">
                    <span>
                      {t("enterprise.account.balance.account", {
                        tenant: tenant.name,
                      })}
                    </span>
                    <span className="is-badge is-badge--dot is-badge--success">
                      {t("enterprise.account.balance.ok")}
                    </span>
                  </div>
                </div>
              )}
              <div className="is-card acc-stat">
                <div className="acc-stat-head">
                  <span className="acc-stat-icon acc-stat-icon--quota">
                    <ShieldCheck size={16} aria-hidden />
                  </span>
                  <span className="is-section-label">
                    {t("enterprise.account.quota.label")}
                  </span>
                </div>
                <span className="is-stat">
                  {formatPoints(quota.usedPoints)}
                  <small>
                    {" "}
                    / {formatPoints(quota.quotaPoints)}{" "}
                    {t("enterprise.core.points")}
                  </small>
                </span>
                <div className="ent-meter">
                  <span style={{ width: `${pct}%` }} />
                </div>
                <div className="acc-stat-foot">
                  <span>
                    {t("enterprise.account.quota.used")} {pct}%
                  </span>
                  <span>{formatServerYmd(quota.resetAt, timeZone)}</span>
                </div>
              </div>
              <div className="is-card acc-stat">
                <div className="acc-stat-head">
                  <span className="acc-stat-icon acc-stat-icon--local">
                    <HardDrive size={16} aria-hidden />
                  </span>
                  <span className="is-section-label">
                    {t("enterprise.account.local.label")}
                  </span>
                </div>
                <span className="is-stat">
                  {formatTokens(usage.local.tokens)}
                  <small> {t("enterprise.account.local.tokens")}</small>
                </span>
                <div className="acc-stat-foot">
                  <span>{usage.local.primaryModel}</span>
                  <span className="is-badge">
                    {t("enterprise.account.local.badge")}
                  </span>
                </div>
              </div>
            </div>
            <div className="ent-tcard acc-sec">
              <div className="ent-tcard-hd">
                <span className="ent-ico ent-ico--brand">
                  <BarChart3 size={16} aria-hidden />
                </span>
                <div className="is-card-title">
                  {t("enterprise.account.usage.title")}
                  <div className="is-subtitle">
                    {t("enterprise.account.usage.month", {
                      year: new Date().getFullYear(),
                      month: new Date().getMonth() + 1,
                    })}
                  </div>
                </div>
              </div>
              <table className="ent-table">
                <thead>
                  <tr>
                    {[
                      "model",
                      "kind",
                      "calls",
                      "inputTokens",
                      "outputTokens",
                      "points",
                    ].map((k) => (
                      <th
                        key={k}
                        className={k !== "model" && k !== "kind" ? "r" : ""}
                      >
                        {t(`enterprise.account.usage.${k}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usage.rows.map((r) => (
                    <tr key={r.model}>
                      <td className="ent-num">{r.model}</td>
                      <td>
                        <span className="is-badge">
                          {r.kind === "cloud"
                            ? t("enterprise.account.usage.cloud")
                            : t("enterprise.account.usage.localFree")}
                        </span>
                      </td>
                      <td className="r ent-num">{formatInt(r.calls)}</td>
                      <td className="r ent-num">
                        {formatTokens(r.inputTokens)}
                      </td>
                      <td className="r ent-num">
                        {formatTokens(r.outputTokens)}
                      </td>
                      <td className="r ent-num">{formatPoints(r.points)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ent-tcard acc-sec">
              <div className="ent-tcard-hd">
                <span className="ent-ico ent-ico--success">
                  <Laptop2 size={16} aria-hidden />
                </span>
                <div className="is-card-title">
                  {t("enterprise.account.devices.title")}
                  <div className="is-subtitle">
                    {t("enterprise.account.devices.subtitle")}
                  </div>
                </div>
              </div>
              <table className="ent-table">
                <thead>
                  <tr>
                    {[
                      "device",
                      "os",
                      "version",
                      "status",
                      "lastSeen",
                      "actions",
                    ].map((k) => (
                      <th key={k}>{t(`enterprise.account.devices.${k}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => (
                    <tr key={d.id}>
                      <td>
                        {d.name}{" "}
                        {d.current && (
                          <span className="is-badge is-badge--brand">
                            {t("enterprise.account.devices.current")}
                          </span>
                        )}
                      </td>
                      <td>{d.os}</td>
                      <td className="ent-num">{d.appVersion}</td>
                      <td>
                        {d.online
                          ? t("enterprise.account.devices.online")
                          : t("enterprise.account.devices.offline")}
                      </td>
                      <td>{relativeTimeLabel(t, d.lastSeenAt)}</td>
                      <td>
                        {d.current ? (
                          "—"
                        ) : (
                          <Popconfirm
                            title={t(
                              "enterprise.account.devices.signOutConfirm",
                              { name: d.name },
                            )}
                            onConfirm={() => void signOut(d.id, d.name)}
                          >
                            <Button type="text" danger size="small">
                              {t("enterprise.account.devices.signOut")}
                            </Button>
                          </Popconfirm>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ent-tip acc-sec">
              {t("enterprise.account.footnote")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

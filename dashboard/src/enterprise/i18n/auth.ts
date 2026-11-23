/** Enterprise strings for the "auth" area → `enterprise.auth.*`. */
export const zh = {
  title: "企业账号登录",
  subtitle: "使用公司分配的账号登录 Tabby 企业版",
  email: "企业邮箱",
  ssoDivider: "企业单点登录",
  ssoWith: "使用{{name}}登录",
  ssoName: {
    feishu: "飞书",
    wecom: "企业微信",
    dingtalk: "钉钉",
    oidc: "OIDC",
  },
  ssoShort: {
    feishu: "飞书",
    wecom: "企微",
    dingtalk: "钉钉",
    oidc: "OIDC",
  },
  device: {
    title: "首次登录将注册本设备",
    meta: "{{name}} · {{os}} · 桌面端",
    period: "。",
    sync: "登录后对话与操作记录会同步到企业云端，",
    dataNotice: "数据收集说明",
    dataNoticeBody:
      "对话、轨迹、记忆、文件与配置会同步到企业云端，换电脑也能继续。上传前自动脱敏密码、token 与私钥。同步由企业管理员统一管理，不能关闭。",
  },
  noAccount: "没有账号？请联系你所在企业的管理员开通",
  forgot: {
    title: "重置密码",
    intro: "企业账号的密码由企业统一管理，桌面端不能自行重置。",
    yourCompany: "你所在企业",
    step1Title: "联系企业管理员",
    step1Hint:
      "请{{tenant}}的管理员在管理后台「成员」页为你重置密码，新的临时密码会发到你的企业邮箱 {{email}}。",
    step1HintNoEmail:
      "请{{tenant}}的管理员在管理后台「成员」页为你重置密码，新的临时密码会发到你的企业邮箱。",
    step2Title: "使用单点登录",
    step2Hint:
      "如果贵公司开通了飞书、企业微信、钉钉或 OIDC 登录，可以直接用单点登录进入，无需密码。",
    step3Title: "首次登录后修改",
    step3Hint:
      "用临时密码登录后，到「账户与用量」页修改密码。新密码至少 8 位，需同时包含字母和数字。",
    back: "返回登录",
  },
  revoked: {
    badge: "设备已移除",
    title: "此设备已被企业管理员移除",
    cleared:
      "本地缓存数据已清除，包括会话缓存、工作区文件缓存、记忆和个人知识库。",
    backfilled: "离线期间未上传的数据已在清除前补传到企业云端。",
    device: "设备",
    tenant: "企业",
    revokedAt: "移除时间",
    signInAgain: "重新登录",
    help: "重新登录后，此设备需要重新注册。如果你不清楚为什么被移除，请联系企业管理员或 IT 服务台。",
  },
};

export const en: typeof zh = {
  title: "Sign in to your work account",
  subtitle:
    "Use the account your company gave you to sign in to Tabby Enterprise",
  email: "Work email",
  ssoDivider: "Enterprise single sign-on",
  ssoWith: "Sign in with {{name}}",
  ssoName: {
    feishu: "Feishu",
    wecom: "WeCom",
    dingtalk: "DingTalk",
    oidc: "OIDC",
  },
  ssoShort: {
    feishu: "Feishu",
    wecom: "WeCom",
    dingtalk: "DingTalk",
    oidc: "OIDC",
  },
  device: {
    title: "Signing in for the first time registers this device",
    meta: "{{name}} · {{os}} · Desktop",
    period: ". ",
    sync: "After you sign in, conversations and activity sync to your company cloud. ",
    dataNotice: "Data collection notice",
    dataNoticeBody:
      "Conversations, traces, memory, files and settings sync to your company cloud, so you can pick up on another computer. Passwords, tokens and private keys are redacted before upload. Sync is managed by your enterprise admin and can't be turned off.",
  },
  noAccount: "No account? Ask your company's admin to set one up for you.",
  forgot: {
    title: "Reset password",
    intro:
      "Your company manages work-account passwords, so they can't be reset from the desktop app.",
    yourCompany: "your company",
    step1Title: "Contact your enterprise admin",
    step1Hint:
      "Ask an admin at {{tenant}} to reset your password on the Members page of the admin console. A temporary password will be sent to your work email {{email}}.",
    step1HintNoEmail:
      "Ask an admin at {{tenant}} to reset your password on the Members page of the admin console. A temporary password will be sent to your work email.",
    step2Title: "Use single sign-on",
    step2Hint:
      "If your company has Feishu, WeCom, DingTalk or OIDC sign-in, use single sign-on instead — no password needed.",
    step3Title: "Change it after signing in",
    step3Hint:
      "After signing in with the temporary password, change it on the Account & usage page. New passwords need at least 8 characters with both letters and digits.",
    back: "Back to sign in",
  },
  revoked: {
    badge: "Device removed",
    title: "Your enterprise admin removed this device",
    cleared:
      "Local cached data has been cleared, including conversation cache, workspace file cache, memory and personal knowledge bases.",
    backfilled:
      "Anything not yet uploaded while offline was sent to the enterprise cloud before clearing.",
    device: "Device",
    tenant: "Company",
    revokedAt: "Removed at",
    signInAgain: "Sign in again",
    help: "Signing in again registers this device anew. If you're not sure why it was removed, contact your enterprise admin or IT help desk.",
  },
};

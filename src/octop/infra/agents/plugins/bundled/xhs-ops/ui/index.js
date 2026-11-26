const React = window.__OCTOP_REACT__;
// Card headings follow the design: an icon chip in front of the title. Plain h3 calls get it here
// so every screen shares one heading style.
function headingIcon(title) {
  const exact = ICON_OF["h:" + title];
  if (exact != null) return exact;
  let best = null;
  let score = 1;
  for (const key of Object.keys(ICON_OF)) {
    if (!key.startsWith("h:")) continue;
    const name = key.slice(2);
    let prefix = 0;
    while (prefix < name.length && name[prefix] === title[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < name.length &&
      name[name.length - 1 - suffix] === title[title.length - 1 - suffix]
    )
      suffix += 1;
    if (Math.max(prefix, suffix) > score) {
      score = Math.max(prefix, suffix);
      best = ICON_OF[key];
    }
  }
  return best ?? ICON_OF["h:内容任务池"];
}
function h(type, props, ...children) {
  if (type !== "h3" || props?.className)
    return React.createElement(type, props, ...children);
  const title = children
    .flat(Infinity)
    .filter((c) => typeof c === "string" || typeof c === "number")
    .join("");
  return React.createElement(
    "h3",
    { ...props, className: "xhs-h" },
    React.createElement(
      "span",
      { className: "xhs-hic" },
      React.createElement(Icon, { id: headingIcon(title), size: 15 }),
    ),
    React.createElement("span", null, ...children),
  );
}
const { useEffect, useMemo, useState } = React;

const C = {
  ink: "var(--fn-text-primary, #182230)",
  muted: "var(--fn-text-secondary, #6b7280)",
  line: "var(--fn-border, #e5e7eb)",
  surface: "var(--fn-bg-elevated, #fff)",
  soft: "var(--fn-bg-secondary, #f7f8fa)",
  red: "#ff2442",
  green: "#149447",
  amber: "#b7791f",
};

const css = `
  .xhs-app { color: ${C.ink}; font-size: 13px; min-height: 100%; overflow-wrap:anywhere; }
  .xhs-tabs { display:flex; gap:6px; overflow:auto; border-bottom:1px solid ${C.line}; margin-bottom:16px; }
  .xhs-tab { border:0; background:transparent; color:${C.muted}; padding:9px 12px; cursor:pointer; white-space:nowrap; border-bottom:2px solid transparent; }
  .xhs-tab.active { color:${C.red}; border-bottom-color:${C.red}; font-weight:700; }
  .xhs-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
  .xhs-card { background:${C.surface}; border:1px solid ${C.line}; border-radius:10px; padding:14px; min-width:0; box-sizing:border-box; }
  .xhs-card h3 { margin:0 0 9px; font-size:15px; }
  .xhs-meta { color:${C.muted}; font-size:12px; }
  .xhs-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:9px 0; border-bottom:1px solid ${C.line}; }
  .xhs-row:last-child { border-bottom:0; }
  .xhs-btn { border:1px solid ${C.line}; border-radius:7px; background:${C.surface}; color:${C.ink}; padding:7px 11px; cursor:pointer; }
  .xhs-btn.primary { background:${C.red}; border-color:${C.red}; color:#fff; }
  .xhs-btn:disabled { opacity:.45; cursor:not-allowed; }
  .xhs-input, .xhs-textarea, .xhs-select { width:100%; box-sizing:border-box; border:1px solid ${C.line}; border-radius:7px; padding:8px; background:${C.surface}; color:${C.ink}; margin-top:5px; }
  .xhs-textarea { min-height:130px; resize:vertical; }
  .xhs-field { margin:9px 0; }
  .xhs-label { color:${C.muted}; font-size:12px; }
  .xhs-actions { display:flex; flex-wrap:wrap; gap:7px; margin-top:12px; }
  .xhs-pill { display:inline-flex; border-radius:999px; padding:3px 8px; background:${C.soft}; color:${C.muted}; font-size:11px; }
  .xhs-danger { color:${C.red}; }
  .xhs-empty { color:${C.muted}; text-align:center; padding:28px 10px; }
  .xhs-preview { max-width:92px; max-height:92px; object-fit:cover; border-radius:6px; border:1px solid ${C.line}; margin:4px; }
  @media (max-width:640px) { .xhs-grid { grid-template-columns:1fr; } .xhs-card { padding:12px; } }
`;

function useStyle() {
  useEffect(() => {
    const node = document.createElement("style");
    node.dataset.octopXhsOps = "1";
    node.textContent = css + css2;
    document.head.appendChild(node);
    return () => node.remove();
  }, []);
}

function rows(value) {
  return Array.isArray(value) ? value : [];
}
function text(value, fallback = "—") {
  return value === undefined || value === null || value === ""
    ? fallback
    : String(value);
}
function readImageFiles(files) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          if (
            !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
            file.size > 5 * 1024 * 1024
          ) {
            reject(new Error("请选择 5MB 以内的 PNG、JPEG 或 WebP 图片。"));
            return;
          }
          const reader = new FileReader();
          reader.onerror = () =>
            reject(new Error("图片读取失败，请重新选择。"));
          reader.onload = () =>
            resolve({
              filename: file.name,
              display_name: file.name,
              mime_type: file.type,
              data_base64: String(reader.result).split(",")[1] || "",
            });
          reader.readAsDataURL(file);
        }),
    ),
  );
}

function statusLabel(value) {
  return text(value).replaceAll("_", " ");
}

function operationError(error, locale) {
  const raw = error instanceof Error ? error.message : String(error || "");
  const messages = {
    quota_exceeded: "企业模型额度已用尽，请联系管理员调整配额。",
    insufficient_balance: "企业点数余额不足，请联系企业管理员。",
    wallet_frozen: "企业账户已冻结，请联系企业管理员。",
    too_many_in_flight: "企业模型请求较多，请稍后重试。",
    gateway_unavailable: "企业模型网关暂不可用，请联系管理员检查服务。",
    gateway_not_configured: "企业模型网关尚未配置，请联系企业管理员。",
    gateway_authentication_failed:
      "企业模型网关身份校验失败，请联系管理员检查配置。",
    billing_unavailable: "企业计费服务暂不可用，请稍后重试。",
    device_required: "请选择或登记当前成员的桌面设备后重试。",
    model_not_allowed: "当前账号未获准使用所选模型。",
    model_unavailable: "当前没有可用模型，请检查企业授权或个人模型配置。",
    upstream_error: "模型服务未能完成生成，请稍后重试。",
    invalid_gateway_response: "企业模型返回不完整，请重试或联系管理员。",
    user_suspended: "当前企业成员已停用，请联系企业管理员。",
    version_conflict: "资料已更新，请重新打开并核对后保存。",
    keyword_not_in_pool: "这个关键词已经不在核心兴趣池里了，请刷新后再看。",
    tier_would_raise:
      "建议的档位比现在的预算高。档位只降不升，要加量请自己在日常运营里调整。",
    plan_part_missing: "这次诊断没有给出这一项。",
    project_default_missing:
      "这个项目还没有默认预算。请先在一个账号上点“另存为项目默认”。",
    portrait_authorization_required:
      "上传本人照片前，请先在授权台账登记覆盖“肖像”的有效授权。",
    reference_required: "请先提供参考内容。",
    template_required: "请先选择内容母版。",
    rewrite_invalid: "AI 返回的内容不完整，原稿没有改动，请重试。",
    submission_already_reviewed: "平台已经审核了这条提交，不能撤回。",
    submission_not_found: "没有找到这条提交，请刷新后重试。",
    license_required: "此功能尚未开通，请联系企业管理员。",
    permission_required:
      "当前成员没有手机控制权限，请联系企业管理员并同步权限。",
    image_limit: "每篇最多保留 9 张图片，请移除部分图片后重试。",
    invalid_image: "图片内容或格式无效，请使用 PNG、JPEG 或 WebP 图片。",
    image_prompt_required: "请填写配图描述。",
    image_generation_in_progress: "此草稿正在生成配图，请等待当前请求完成。",
    image_response_too_large:
      "生图响应超过大小上限，已停止读取。请检查模型生成结果。",
    image_response_encoding_invalid:
      "生图服务返回了不支持的响应编码，请检查服务配置。",
    account_identity_required: "请先在账号与设备中填写并核对目标小红薯号。",
    invalid_input: "输入格式有误，请检查字段、日期和版本后重试。",
    existing_account_requires_takeover:
      "已有账号的资料修改请使用诊断与变更流程。",
    profile_draft_incomplete: "请补齐公开资料并选择头像和背景图后再审核。",
    profile_review_required: "请重新审核当前版本的公开资料。",
    profile_generation_in_progress: "该账号正在生成资料，请等待当前请求结束。",
    profile_precheck_required: "资料或授权已变化，请重新读取并预检。",
    profile_readback_required: "请先读取手机当前资料。",
    account_preparation_required: "请先运行当前版本的手机准备与身份检查。",
    persona_review_required: "请先审核账号人设。",
    confirmed_profile_required: "请先确认项目目标画像。",
    profile_verification_required: "独立核验尚未完成或已过期，请重新检查手机。",
    profile_image_review_required:
      "请对照手机和候选图核对八项资料，并填写核验记录。",
    account_safety_paused: "账号仍在安全冷却期，暂不能恢复或应用资料。",
    profile_specific_verification_required: "请到新号资料页面完成独立核验。",
    profile_specific_reconciliation_required:
      "请通过新号资料的停止对账入口处理该任务。",
    image_generation_failed: "生图服务未完成请求，请检查模型配置后查看结果。",
    image_download_not_allowed: "生图返回了不允许下载的地址，请检查模型服务。",
    image_download_unavailable:
      "生成图片暂时无法下载，请检查网络后查看生成结果。",
    batch_precheck_required: "发布内容或目标账号已变化，请重新预检批次。",
    invalid_operation_plan:
      "计划无效，请检查关键词、篇数和分段。评论需另走审核流程。",
    operation_plan_locked: "计划已启动，请先处理已有任务或恢复未派发部分。",
    operation_plan_stale: "账号或日期已变化，请重新生成并核对计划。",
    operation_precheck_required: "计划、预算或许可已变化，请重新预检。",
    operation_dwell_invalid:
      "执行时每篇最少停留11秒，最多停留不能少于最少停留。",
    operation_follow_targets_required: "启用关注前需填写允许关注的对象类型。",
    operation_reconciliation_required:
      "存在结果不明或未结束任务，请先确认手机状态并对账。",
    operation_no_unstarted_work:
      "没有可安全恢复的未派发工作；已派发但结果不明的块不会重发。",
    operation_daily_segments_complete:
      "今日多段计划均已完成，没有新的分段建议。",
    operation_schedule_review_required:
      "请重新核对日常预算并明确启用定时运营。",
    phone_interaction_required: "请在手机上处理登录或验证码，再重新核对账号。",
    account_identity_mismatch:
      "手机当前账号与绑定的小红薯号不符，请本人处理后重新核对。",
    account_paused: "账号已暂停，请先处理暂停原因并重新核对后恢复。",
    device_busy: "手机仍被任务占用，请等任务结束或完成停止对账。",
    asset_invalid: "素材文件校验失败，请重新上传原图。",
    operation_interest_pool_insufficient:
      "兴趣词不足以覆盖当前浏览目标，请补充兴趣池或降低目标。",
    operation_home_budget_exceeded:
      "计划首页篇数超过每段12篇，请提高搜索占比或增加分段。",
    comment_too_short: "评论至少需要2个字。",
    comment_too_long: "评论最多10个字。",
    comment_newline: "评论不能换行。",
    comment_marketing: "评论包含营销、引流或交易内容，请改写。",
    comment_forbidden_topic: "评论涉及项目禁忌方向，请改写。",
    comment_emoji_limit: "评论最多包含一个表情。",
    comment_symbols_only: "评论不能只有符号或表情。",
    comment_disabled: "此账号未开启评论，请在日常运营的账号预算中启用。",
    comment_quota_exhausted:
      "当前账号评论额度不足，已审核和结果不明的评论会保留占用。",
    comment_duplicate_text: "该账号近30天已审核或发送过相同文案，请改写。",
    comment_review_required: "审核已变化或过期，请重新审核当前文案。",
    comment_not_editable: "此评论不能直接改写；已派发的未知结果不会重发。",
    comment_precheck_required: "预检已变化或过期，请重新预检。",
    comment_outside_window: "评论仅在服务器时区08:00–23:00之间派发。",
    comment_browse_gap_required: "请等待浏览结束至少10分钟后再发评论。",
    comment_target_required:
      "请记录有效笔记标题和作者，或正确的小红薯笔记链接。",
    comment_source_unverified: "该帖子缺少完整浏览回执，无法生成候选。",
    comment_source_changed: "来源或账号已变化，请重新核对。",
    comment_generation_failed: "候选生成失败，已保留草稿，可手写后审核。",
    comment_generation_interrupted:
      "上次候选生成被中断，已保留草稿，不自动重复调用。",
    comment_candidates_invalid: "候选均未通过校验，请手写最终评论。",
    comment_verification_required:
      "请先查看截图，并核对本人账号、目标笔记和评论原文。",
    comment_stop_reconciliation_required:
      "请先确认手机任务已停止并记录对账，再只读回查。",
    comment_specific_verification_required: "请在评论审核页完成实际评论核验。",
    comment_specific_reconciliation_required: "请在评论审核页完成停止对账。",
    field_request_required: "地区资料必须由运营明确请求后才能提交。",
    field_budget_blocked:
      "该资料字段仍在滚动变更预算冷却期，请先查看预算状态。",
    observation_required: "请先完成上一项资料变更的观察与复核。",
    rollback_not_available: "当前资料变更还没有可用的独立回滚单。",
    enterprise_paused:
      "企业管理员已暂停全部自动任务，恢复前不会执行养号、发布和回复。",
    member_paused: "你已暂停全部自动任务，请先在页面右上角恢复。",
    precheck_blocking: "发布前检查有未通过项，请先修改或一键补上标识与披露。",
    compliance_review_required: "高风险内容需要合规复核通过后才能发布。",
    compliance_record_incomplete: "请填写复核人、审批单号和结论。",
    pace_outside_publish_window: "排期不在允许发布的时段内。",
    pace_min_interval: "同一账号两篇之间的间隔不足，请调整时间。",
    pace_weekly_max: "该账号这一周的发布篇数已到上限。",
    pace_marketing_ratio: "营销内容占比将超过上限，请换成生活或知识内容。",
    pace_profile_change_day: "该账号当天有资料变更，按规则不安排发布。",
    pace_device_required: "该账号还没有绑定手机，排期的发布无法执行。",
    schedule_in_past: "排期时间已过，请选择之后的时间。",
    draft_already_published: "已发布的内容不能再修改排期或状态。",
    auto_reply_not_allowed: "企业未开启闲聊类自动回复，只能起草后等你通过。",
    automation_above_enterprise: "自动化程度不能高于企业设定的上限。",
    automation_manual: "当前为手动档，AI 不会主动准备内容。",
    tenant_quota_exceeded: "企业本月额度已用完，可以向管理员申请增加。",
    member_quota_exceeded:
      "你本月的额度已用完，可以在能力与配额里向管理员申请。",
    enterprise_backend_unavailable: "暂时连不上企业后台，请稍后重试。",
    enterprise_request_rejected: "企业后台拒绝了这次请求，请联系管理员。",
    enterprise_response_invalid: "企业后台返回的数据不完整，请稍后重试。",
    authorization_not_active: "所选授权已撤回、过期或缺少授权书。",
    authorization_scope_exceeded: "素材绑定的账号超出了授权范围。",
    authorization_withdrawn: "素材关联的授权已撤回，不能再使用。",
    experience_must_stay_with_its_owner:
      "真实个人经历不能放进公共素材库，请绑定到授权人的账号。",
    material_empty: "请填写素材内容或上传图片。",
    material_analysis_invalid: "AI 整理结果不完整，素材已原样保留。",
    stages_invalid: "冷启动阶段的天数需要连续且不重叠。",
    cold_start_new_accounts_only: "冷启动方案只用于新账号。",
    task_not_open: "这个内容任务已在制作或已忽略。",
    plan_empty: "AI 没有拆出可用的内容任务，请把要求写得更具体一些。",
    plan_invalid: "AI 返回的计划不完整，请重试。",
    project_required: "请先建立项目并绑定账号。",
    structure_required: "请填写这篇内容的结构。",
    negative_not_drafted: "负面与投诉不自动起草，请手写回复或忽略。",
    negative_needs_handwritten_reply: "负面与投诉需要你手写回复。",
    reply_text_invalid: "回复需在 30 字以内，不留联系方式，不承诺效果。",
    reply_draft_rejected: "AI 起草的回复未通过检查，请手写。",
    reply_not_editable: "这条回复已发送或正在发送，不能修改。",
    reply_not_sent: "只有已发送的回复才能删除。",
    notice_required: "请填写平台通知内容。",
    duplicate_operation: "相同的任务已在执行。",
  };
  try {
    const envelope = JSON.parse(raw.slice(raw.indexOf("{")));
    const reason = envelope.error?.details?.reason;
    if (locale.startsWith("zh") && typeof messages[reason] === "string")
      return messages[reason];
    if (envelope.error?.message) return String(envelope.error.message);
  } catch {
    /* Non-API errors use their original message. */
  }
  if (locale.startsWith("zh") && messages[raw]) return messages[raw];
  return (
    raw ||
    (locale.startsWith("zh")
      ? "操作失败，请稍后重试。"
      : "Operation failed. Please try again.")
  );
}

function Button({ children, onClick, disabled, primary, danger }) {
  const [pending, setPending] = useState(false);
  const run = async () => {
    if (!onClick || pending) return;
    setPending(true);
    try {
      await onClick();
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent("octop:xhs-error", {
          detail: error,
        }),
      );
    } finally {
      setPending(false);
    }
  };
  return h(
    "button",
    {
      className: `xhs-btn${primary ? " primary" : ""}${
        danger ? " xhs-danger" : ""
      }`,
      onClick: run,
      disabled: disabled || pending,
    },
    !pending && typeof children === "string" && ic(children),
    pending ? "处理中…" : children,
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  placeholder,
  type = "text",
  disabled,
}) {
  return h(
    "label",
    { className: "xhs-field" },
    h("div", { className: "xhs-label" }, label),
    multiline
      ? h("textarea", {
          className: "xhs-textarea",
          value: value || "",
          onChange: (e) => onChange(e.target.value),
          placeholder,
          disabled,
        })
      : h("input", {
          className: "xhs-input",
          type,
          value: value || "",
          onChange: (e) => onChange(e.target.value),
          placeholder,
          disabled,
        }),
  );
}

function Badge({ value }) {
  return h("span", { className: "xhs-pill" }, statusLabel(value));
}
function hasFeature(license, feature) {
  return Boolean(
    license &&
      Array.isArray(license.features) &&
      license.features.includes(feature),
  );
}
function FeatureLocked({ locale }) {
  return h(
    "div",
    { className: "xhs-card xhs-empty" },
    locale.startsWith("zh")
      ? "当前授权未包含此功能，请联系企业管理员开通。"
      : "This feature is not included. Contact your enterprise administrator.",
  );
}

const projectSections = [
  {
    key: "business",
    title: "客户业务",
    fields: [
      ["industry", "所属行业"],
      ["product", "产品或服务"],
      ["regions", "业务地区", true],
      ["selling_points", "核心卖点", true],
      ["price_band", "价格带"],
      ["scene", "使用场景"],
    ],
  },
  {
    key: "audience",
    title: "目标受众",
    fields: [
      ["age_range", "目标年龄范围"],
      ["gender_ratio", "目标性别比例"],
      ["regions", "目标地区", true],
      ["occupations", "受众职业", true],
      ["spending_power", "消费能力"],
      ["known_interests", "已知兴趣", true],
      ["pain_points", "受众痛点", true],
    ],
  },
  {
    key: "ops_notes",
    title: "运营要求",
    fields: [
      ["forbidden_topics", "禁忌方向", true],
      ["boost_keywords", "优先关键词", true],
      ["avoid_content_types", "避免的内容类型", true],
    ],
  },
];

function listInput(value) {
  return String(value || "")
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function AudienceEditor({
  project,
  host,
  readOnly,
  canOperate,
  refresh,
  onClose,
}) {
  const source =
    project.profile && typeof project.profile === "object"
      ? project.profile
      : {};
  const [version, setVersion] = useState(project.version);
  const [summary, setSummary] = useState(source.summary || "");
  const [ageRange, setAgeRange] = useState(source.base?.age_range || "");
  const [genderRatio, setGenderRatio] = useState(
    source.base?.gender_ratio || "",
  );
  const [regions, setRegions] = useState(rows(source.base?.regions).join("，"));
  const [vertical, setVertical] = useState(
    rows(source.vertical_interests).join("，"),
  );
  const [general, setGeneral] = useState(
    rows(source.general_interests).join("，"),
  );
  const [reviewed, setReviewed] = useState(false);
  const edit = (setter, value) => {
    setter(value);
    setReviewed(false);
  };
  const profile = {
    summary,
    base: {
      age_range: ageRange,
      gender_ratio: genderRatio,
      regions: listInput(regions),
    },
    vertical_interests: listInput(vertical),
    general_interests: listInput(general),
  };
  const complete = [
    summary,
    ageRange,
    genderRatio,
    regions,
    vertical,
    general,
  ].every((v) => v.trim());
  const save = async (confirm) => {
    const next = await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({
        command: confirm ? "profile.confirm" : "profile.save",
        payload: {
          project_id: project.id,
          version,
          profile,
          ...(confirm ? { confirmed: true } : {}),
        },
      }),
    });
    const saved = rows(next.data?.projects).find(
      (item) => item.id === project.id,
    );
    if (saved) setVersion(saved.version);
    setReviewed(false);
    await refresh();
    if (confirm) onClose();
  };
  return h(
    "div",
    { className: "xhs-card" },
    h("h3", null, "目标受众画像"),
    typeof project.profile === "string" &&
      project.profile &&
      h("p", { className: "xhs-meta" }, project.profile),
    h(Field, {
      label: "画像概述",
      value: summary,
      onChange: (value) => edit(setSummary, value),
      multiline: true,
      disabled: readOnly,
    }),
    h(Field, {
      label: "画像年龄范围",
      value: ageRange,
      onChange: (value) => edit(setAgeRange, value),
      disabled: readOnly,
    }),
    h(Field, {
      label: "画像性别比例",
      value: genderRatio,
      onChange: (value) => edit(setGenderRatio, value),
      disabled: readOnly,
    }),
    h(Field, {
      label: "画像地区",
      value: regions,
      onChange: (value) => edit(setRegions, value),
      disabled: readOnly,
    }),
    h(Field, {
      label: "垂直兴趣",
      value: vertical,
      onChange: (value) => edit(setVertical, value),
      disabled: readOnly,
    }),
    h(Field, {
      label: "泛兴趣",
      value: general,
      onChange: (value) => edit(setGeneral, value),
      disabled: readOnly,
    }),
    h(
      "p",
      { className: "xhs-meta" },
      "地区和兴趣可用逗号或换行分隔。编辑期间客户资料发生变化时，需要重新打开并核对。",
    ),
    h(
      "label",
      null,
      h("input", {
        type: "checkbox",
        checked: reviewed,
        disabled: readOnly || !canOperate,
        onChange: (event) => setReviewed(event.target.checked),
      }),
      " 我已核对画像与客户业务、受众范围一致",
    ),
    h(
      "div",
      { className: "xhs-actions" },
      h(
        Button,
        {
          onClick: () => save(false),
          disabled: readOnly || !canOperate || !complete,
        },
        "保存画像草稿",
      ),
      h(
        Button,
        {
          primary: true,
          onClick: () => save(true),
          disabled: readOnly || !canOperate || !complete || !reviewed,
        },
        "确认画像",
      ),
      h(Button, { onClick: onClose }, "关闭画像编辑"),
    ),
  );
}

// The ten steps a project goes through, read from what is already recorded; nothing here starts work.
function ProjectFlow({ snapshot, host, project, readOnly, refresh }) {
  const data = snapshot.data;
  const accounts = rows(data.accounts).filter(
    (a) => a.project_id === project.id,
  );
  const ids = new Set(accounts.map((a) => a.id));
  const candidates = rows(data.persona_candidates).filter(
    (c) => c.project_id === project.id && c.status !== "stale",
  );
  const today = data.operation_clock?.date;
  const days = rows(data.operation_days).filter(
    (d) => ids.has(d.account_id) && d.date === today,
  );
  const running = rows(data.runs).filter(
    (r) =>
      ids.has(r.account_id) &&
      ["nurture", "browse"].includes(r.kind) &&
      ["queued", "preparing", "running"].includes(r.status),
  );
  const recorded = new Set(
    rows(data.runs)
      .filter(
        (r) =>
          ids.has(r.account_id) &&
          r.completed_at &&
          Date.now() - new Date(r.completed_at).getTime() < 7 * 86400000,
      )
      .map((r) => String(r.completed_at).slice(0, 10)),
  );
  const verified = accounts.filter(
    (a) => a.profile_draft?.verified_at || a.entry_mode === "existing",
  );
  const pooled = accounts.filter((a) => rows(a.interest_pool?.core).length);
  const rules = accounts.map((a) => operationSettings(a).interaction);
  const names = {
    like: "点赞",
    collect: "收藏",
    follow: "关注",
    comment: "评论",
  };
  const on = Object.keys(names).filter((k) => rules.some((r) => r[k]?.enabled));
  const filled =
    typeof project.business === "string"
      ? Boolean(project.business)
      : Boolean(project.business?.product);
  const profile = project.profile;
  const missing = rows(profile?.general_interests).filter(
    (word) =>
      accounts.length &&
      accounts.some((a) => !rows(a.interest_pool?.general).includes(word)),
  );
  const noteId = `profile-sync:${project.id}:${missing.join("|")}`;
  const pendingSync =
    profile?.confirmed_at &&
    missing.length > 0 &&
    !rows(data.dismissed_alerts).includes(noteId);
  const adjust = rows(data.plan_suggestions).length + (pendingSync ? 1 : 0);
  const steps = [
    ["客户信息", filled, filled ? "业务与受众已填" : "待填写"],
    [
      "目标画像",
      Boolean(profile?.confirmed_at),
      profile?.confirmed_at ? "已确认" : profile ? "待确认" : "未生成",
    ],
    [
      "账号人设",
      accounts.length > 0,
      `${candidates.length} 候选 · ${accounts.length} 采用`,
    ],
    [
      "基础资料",
      accounts.length > 0 && verified.length === accounts.length,
      `${verified.length} / ${accounts.length} 已核验`,
    ],
    [
      "兴趣池",
      accounts.length > 0 && pooled.length === accounts.length,
      `${pooled.length} 个账号已保存`,
    ],
    ["当日任务", days.length > 0, `今天 ${days.length} 份计划`],
    [
      "浏览执行",
      days.length > 0 && !running.length,
      running.length ? `${running.length} 个执行中` : "没有执行中的任务",
    ],
    [
      "少量互动",
      accounts.length > 0,
      on.length
        ? `${on.map((k) => names[k]).join("、")}开 · 其余关`
        : "全部关闭",
    ],
    [
      "结果记录",
      recorded.size > 0,
      recorded.size ? `近 7 天有 ${recorded.size} 天记录` : "还没有记录",
    ],
    [
      "下一轮调整",
      adjust === 0,
      adjust ? `${adjust} 条建议待处理` : "没有待处理的建议",
    ],
  ];
  return h(
    Card,
    {
      title: `项目流程 · ${project.name}`,
      icon: "项目流程 · 星河 · 秋冬通勤",
      tip: "从客户信息到下一轮调整的十步；每一步的状态来自已有记录。",
      style: { gridColumn: "1 / -1" },
    },
    h(
      "div",
      {
        className: "xhs-steps",
        style: { gridTemplateColumns: "repeat(5, minmax(0, 1fr))" },
      },
      steps.map(([label, done, sub], index) =>
        h(
          "div",
          { key: label, className: "xhs-step" },
          h(
            "span",
            { className: `xhs-step-n${done ? " done" : ""}` },
            done ? "✓" : index + 1,
          ),
          h(
            "div",
            null,
            h("div", null, label),
            h("div", { className: "xhs-meta" }, sub),
          ),
        ),
      ),
    ),
    pendingSync &&
      h(
        Row,
        {
          title: "画像有一处修改还没同步",
          sub: `已确认的画像里，泛兴趣“${missing.join(
            "、",
          )}”还不在所有账号的兴趣池里。同步会影响 ${
            accounts.length
          } 个账号的泛兴趣池和之后生成的养号关键词`,
        },
        h(
          Button,
          {
            primary: true,
            disabled: readOnly,
            onClick: async () => {
              await send(host, "profile.sync_personas", {
                project_id: project.id,
                version: project.version,
                confirmed: true,
              });
              toast("已同步到人设");
              await refresh();
            },
          },
          "确认并同步到人设",
        ),
        h(
          Button,
          {
            disabled: readOnly,
            onClick: async () => {
              await send(host, "alert.dismiss", { id: noteId });
              await refresh();
            },
          },
          "只用于新生成的人设",
        ),
      ),
  );
}

function ProjectPanel({
  snapshot,
  host,
  readOnly,
  refresh,
  license,
  modelRef,
}) {
  const projects = rows(snapshot.data?.projects);
  const canOperate = hasFeature(license, "xhs.ops");
  const canEditProject =
    !readOnly && (canOperate || hasFeature(license, "xhs.content"));
  const [editing, setEditing] = useState(null);
  const [profileProject, setProfileProject] = useState(null);
  const open = (project) => setEditing(JSON.parse(JSON.stringify(project)));
  const updateField = (section, key, value) =>
    setEditing((current) => ({
      ...current,
      [section]: {
        ...(typeof current[section] === "object" ? current[section] : {}),
        [key]: value,
      },
    }));
  const save = async () => {
    const { id, version, name } = editing;
    const sourceFields = {};
    for (const section of projectSections) {
      const raw = editing[section.key];
      if (raw === undefined) continue;
      if (typeof raw === "string") {
        sourceFields[section.key] = raw;
        continue;
      }
      sourceFields[section.key] = { ...raw };
      for (const [key, , multiple] of section.fields) {
        if (multiple && typeof raw[key] === "string")
          sourceFields[section.key][key] = listInput(raw[key]);
      }
    }
    await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({
        command: "project.save",
        payload: {
          ...(id ? { id, version } : {}),
          name,
          ...sourceFields,
        },
      }),
    });
    setEditing(null);
    await refresh();
  };
  const generate = async (project) => {
    const next = await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({
        command: "profile.generate",
        payload: {
          project_id: project.id,
          version: project.version,
          ...(modelRef ? { model_ref: modelRef } : {}),
        },
      }),
    });
    const saved = rows(next.data?.projects).find(
      (item) => item.id === project.id,
    );
    if (saved) setProfileProject(JSON.parse(JSON.stringify(saved)));
    await refresh();
  };
  const schedule = async (project, patch) => {
    const enabled =
      patch.enabled ??
      Boolean(project.schedule?.enabled && project.schedule?.kind === "daily");
    if (
      enabled &&
      !window.confirm(
        "请先在日常运营中保存各账号预算并完成准备或接管。确认每天按已保存预算运行？每段先核对账号，不自动发布内容或发送评论。",
      )
    )
      return;
    await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({
        command: "schedule.save",
        payload: {
          project_id: project.id,
          time: project.schedule?.time || "10:00",
          enabled,
          ...patch,
          kind: "daily",
          confirmed: enabled,
        },
      }),
    });
    await refresh();
  };
  return h(
    "div",
    { className: "xhs-grid" },
    projects.map((project) =>
      h(ProjectFlow, {
        key: "flow-" + project.id,
        snapshot,
        host,
        project,
        readOnly: readOnly || !canOperate,
        refresh,
      }),
    ),
    h(
      "div",
      { className: "xhs-card" },
      h("h3", null, "项目与目标画像"),
      projects.length
        ? projects.map((project) =>
            h(
              "div",
              { className: "xhs-card", key: project.id },
              h("strong", null, project.name),
              h(
                "p",
                { className: "xhs-meta" },
                typeof project.business === "string"
                  ? project.business
                  : project.business?.product || "待填写客户业务",
              ),
              h(Badge, {
                value: project.profile?.confirmed_at
                  ? "画像已确认"
                  : "画像待确认",
              }),
              h(
                "div",
                { className: "xhs-actions" },
                h(
                  Button,
                  { onClick: () => open(project), disabled: !canEditProject },
                  "编辑客户资料",
                ),
                h(
                  Button,
                  {
                    onClick: () =>
                      setProfileProject(JSON.parse(JSON.stringify(project))),
                    disabled: readOnly || !canOperate,
                  },
                  "编辑目标画像",
                ),
                h(
                  Button,
                  {
                    onClick: () => generate(project),
                    disabled: readOnly || !canOperate,
                  },
                  "生成目标画像",
                ),
              ),
              h(
                "div",
                { className: "xhs-actions" },
                h(
                  "label",
                  null,
                  h("input", {
                    type: "checkbox",
                    checked: Boolean(
                      project.schedule?.enabled &&
                        project.schedule?.kind === "daily",
                    ),
                    disabled: readOnly || !canOperate,
                    onChange: (event) =>
                      schedule(project, { enabled: event.target.checked }),
                  }),
                  " 启用定时运营",
                ),
                h(
                  "label",
                  null,
                  "运营时间",
                  h("input", {
                    type: "time",
                    defaultValue: project.schedule?.time || "10:00",
                    disabled: readOnly || !canOperate,
                    onBlur: (event) => {
                      if (
                        event.target.value &&
                        event.target.value !==
                          (project.schedule?.time || "10:00")
                      )
                        schedule(project, { time: event.target.value });
                    },
                  }),
                ),
              ),
              project.schedule?.enabled && project.schedule?.kind !== "daily"
                ? h(
                    "p",
                    { className: "xhs-warning" },
                    "旧采样计划已停止自动执行。请先保存账号预算，再明确启用定时运营。",
                  )
                : null,
              project.schedule?.last_result
                ? h(
                    "div",
                    { className: "xhs-meta" },
                    h(
                      "p",
                      null,
                      `${project.schedule.last_result.date} · 已受理 ${project.schedule.last_result.accepted} 个账号，实际完成情况请查看日常运营。`,
                    ),
                    ...Object.entries(
                      project.schedule.last_result.skipped || {},
                    ).map(([reason, count]) =>
                      h(
                        "p",
                        { key: reason },
                        `${count} 个账号暂未受理：${operationError(
                          new Error(reason),
                          host.getToolContext().locale,
                        )}；后续调度会重新检查。`,
                      ),
                    ),
                  )
                : null,
            ),
          )
        : h("div", { className: "xhs-empty" }, "还没有项目"),
      h(
        "div",
        { className: "xhs-actions" },
        h(
          Button,
          {
            primary: true,
            onClick: () =>
              open({ name: "", business: {}, audience: {}, ops_notes: {} }),
            disabled: !canEditProject,
          },
          "新建项目",
        ),
      ),
    ),
    editing &&
      h(
        "div",
        { className: "xhs-card" },
        h("h3", null, editing.id ? "编辑客户资料" : "新建项目"),
        h(Field, {
          label: "项目名称",
          value: editing.name,
          onChange: (name) => setEditing((current) => ({ ...current, name })),
          disabled: readOnly,
        }),
        projectSections.map((section) =>
          h(
            "fieldset",
            {
              key: section.key,
              disabled: readOnly,
              style: {
                border: "1px solid var(--fn-border, #e5e7eb)",
                marginTop: 12,
              },
            },
            h("legend", null, section.title),
            typeof editing[section.key] === "string"
              ? h(
                  React.Fragment,
                  null,
                  h(Field, {
                    label: "原" + section.title,
                    value: editing[section.key],
                    onChange: (value) =>
                      setEditing((current) => ({
                        ...current,
                        [section.key]: value,
                      })),
                    multiline: true,
                    disabled: readOnly,
                  }),
                  h(
                    Button,
                    {
                      onClick: () =>
                        setEditing((current) => ({
                          ...current,
                          [section.key]: {},
                        })),
                      disabled: readOnly,
                    },
                    "填写结构化" + section.title,
                  ),
                )
              : section.fields.map(([key, label, multiple]) =>
                  h(Field, {
                    key,
                    label,
                    value:
                      multiple && Array.isArray(editing[section.key]?.[key])
                        ? editing[section.key][key].join("，")
                        : editing[section.key]?.[key] || "",
                    onChange: (value) => updateField(section.key, key, value),
                    disabled: readOnly,
                  }),
                ),
            editing["legacy_" + section.key] &&
              h(
                "p",
                { className: "xhs-meta" },
                "原始资料 " + editing["legacy_" + section.key],
              ),
          ),
        ),
        h(
          "div",
          { className: "xhs-actions" },
          h(
            Button,
            {
              primary: true,
              onClick: save,
              disabled: !canEditProject || !editing.name?.trim(),
            },
            "保存客户资料",
          ),
          h(Button, { onClick: () => setEditing(null) }, "取消"),
        ),
      ),
    profileProject &&
      h(AudienceEditor, {
        key: profileProject.id + ":" + profileProject.version,
        project: profileProject,
        host,
        readOnly,
        canOperate,
        refresh,
        onClose: () => setProfileProject(null),
      }),
  );
}

const personaFields = [
  ["age", "年龄"],
  ["gender", "性别"],
  ["region", "地区"],
  ["occupation", "职业或身份"],
  ["life_status", "生活状态"],
];
const personaLists = [
  ["persona_tags", "vertical", "垂直标签"],
  ["persona_tags", "general", "泛兴趣标签"],
  ["interest_pool", "core", "核心兴趣池"],
  ["interest_pool", "extended", "扩展兴趣池"],
  ["interest_pool", "general", "泛内容兴趣池"],
];

function PersonaEditor({
  account,
  projectVersion,
  host,
  refresh,
  onClose,
  readOnly,
}) {
  const [label, setLabel] = useState(account.label || account.name);
  const [positioning, setPositioning] = useState(account.positioning || "");
  const [identity, setIdentity] = useState({ ...account.persona });
  const [lists, setLists] = useState(() =>
    Object.fromEntries(
      personaLists.map(([group, key]) => [
        group + "." + key,
        rows(account[group]?.[key]).join("，"),
      ]),
    ),
  );
  const save = async () => {
    const persona = {
      label,
      positioning,
      persona: identity,
      persona_tags: {},
      interest_pool: {},
    };
    for (const [group, key] of personaLists)
      persona[group][key] = listInput(lists[group + "." + key]);
    await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({
        command: "persona.save",
        payload: {
          project_id: account.project_id,
          version: projectVersion,
          account_id: account.id,
          account_version: account.version,
          persona,
        },
      }),
    });
    await refresh();
    onClose();
  };
  return h(
    "div",
    { className: "xhs-card" },
    h("h3", null, "编辑新号人设"),
    h(Field, {
      label: "定位名",
      value: label,
      onChange: setLabel,
      disabled: readOnly,
    }),
    h(Field, {
      label: "内容方向与风格",
      value: positioning,
      onChange: setPositioning,
      disabled: readOnly,
    }),
    personaFields.map(([key, title]) =>
      h(Field, {
        key,
        label: title,
        value: identity[key],
        disabled: readOnly,
        onChange: (value) =>
          setIdentity((current) => ({ ...current, [key]: value })),
      }),
    ),
    personaLists.map(([group, key, title]) =>
      h(Field, {
        key: group + key,
        label: title,
        value: lists[group + "." + key],
        disabled: readOnly,
        onChange: (value) =>
          setLists((current) => ({ ...current, [group + "." + key]: value })),
      }),
    ),
    h(
      "p",
      { className: "xhs-meta" },
      "垂直标签1–2个，泛兴趣标签2–3个。三个兴趣池均须填写，多个词用逗号分隔。",
    ),
    h(
      "div",
      { className: "xhs-actions" },
      h(
        Button,
        { primary: true, onClick: save, disabled: readOnly },
        "保存人设草稿",
      ),
      h(Button, { onClick: onClose }, "关闭人设编辑"),
    ),
  );
}

// How the candidates sit against the confirmed audience profile, and how alike they are to each other.
function PersonaChecks({
  project,
  candidates,
  accounts,
  host,
  readOnly,
  refresh,
  modelRef,
}) {
  const profile = project.profile || {};
  const people = [
    ...candidates.map((c) => ({ ...c, candidate: true })),
    ...accounts.map((a) => ({ ...a, label: a.label || a.name })),
  ];
  if (!candidates.length) return null;
  const tally = (key) => {
    const counts = new Map();
    for (const p of candidates) {
      const value = String(p.persona?.[key] || "").trim() || "未填";
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return counts;
  };
  const text = (counts, unit = " 人") =>
    Array.from(counts, ([v, n]) => `${v} ${n}${unit}`).join(" · ");
  const range = String(profile.base?.age_range || "").match(/(\d+)\D+(\d+)/);
  const outside = range
    ? candidates.filter((p) => {
        const age = Number(String(p.persona?.age || "").match(/\d+/)?.[0]);
        return age && (age < Number(range[1]) || age > Number(range[2]));
      }).length
    : 0;
  const regions = rows(profile.base?.regions);
  const elsewhere = candidates.filter(
    (p) =>
      regions.length &&
      !regions.some((r) => String(p.persona?.region || "").includes(r)),
  ).length;
  const vertical = rows(profile.vertical_interests);
  const covered = candidates.filter((p) =>
    [...rows(p.persona_tags?.vertical), ...rows(p.interest_pool?.core)].some(
      (word) => vertical.some((v) => word.includes(v) || v.includes(word)),
    ),
  ).length;
  const verdict = (ok, warn) =>
    pill(ok ? "✓ 一致" : "! " + warn, ok ? "ok" : "warn");
  const pool = (p) => [
    ...rows(p.interest_pool?.core),
    ...rows(p.interest_pool?.general),
  ];
  const pairs = [];
  for (let i = 0; i < people.length; i += 1)
    for (let j = i + 1; j < people.length; j += 1) {
      const a = people[i];
      const b = people[j];
      if (!a.candidate && !b.candidate) continue;
      const mine = pool(a);
      const same = mine.filter((word) => pool(b).includes(word)).length;
      const total = Math.max(1, Math.min(mine.length, pool(b).length));
      const sameName =
        a.label && b.label && similarity(a.label, b.label) >= 0.4;
      pairs.push({
        a,
        b,
        same,
        total,
        sameName,
        score: same / total + (sameName ? 1 : 0),
      });
    }
  pairs.sort((x, y) => y.score - x.score);
  const shown = pairs.slice(0, 3);
  const worst = shown.find((p) => p.sameName || p.same / p.total >= 0.6);
  const duplicate = worst && (worst.a.candidate ? worst.a : worst.b);
  return h(
    Card,
    {
      title: "分布与差异度检查",
      tip: "只做提示，不替你决定；是否采用仍由你确认。",
      style: { gridColumn: "1 / -1" },
    },
    h(
      "div",
      { className: "xhs-2" },
      h(
        "div",
        null,
        h("h4", null, "与目标画像对比"),
        h(Table, {
          head: ["维度", "目标画像", `候选 ${candidates.length} 人`, "结论"],
          body: [
            [
              "年龄",
              profile.base?.age_range || "—",
              text(tally("age")),
              verdict(!outside, `${outside} 人不在范围内`),
            ],
            [
              "性别",
              profile.base?.gender_ratio || "—",
              text(tally("gender")),
              pill("请对照比例核对"),
            ],
            [
              "地区",
              regions.join("、") || "—",
              text(tally("region"), ""),
              verdict(!elsewhere, `${elsewhere} 人在其他地区`),
            ],
            [
              "垂直兴趣",
              vertical.join("、") || "—",
              `${covered} 人覆盖其中一项`,
              verdict(
                covered === candidates.length,
                `${candidates.length - covered} 人没有覆盖`,
              ),
            ],
          ],
        }),
      ),
      h(
        "div",
        null,
        h("h4", null, "人设之间的相似度"),
        h(Table, {
          head: ["人设", "对比", "重合", "结论"],
          body: shown.map((p) => [
            p.a.label,
            p.b.label,
            `${p.sameName ? "昵称相近 · " : ""}兴趣 ${p.same} / ${
              p.total
            } 相同`,
            p.sameName || p.same / p.total >= 0.6
              ? pill("✕ 重复度过高", "bad")
              : p.same / p.total >= 0.4
              ? pill("! 建议换一个泛兴趣", "warn")
              : pill("✓ 差异足够", "ok"),
          ]),
          empty: "只有一个人设，无需比较",
        }),
        h(
          "div",
          { className: "xhs-actions" },
          h(
            Button,
            {
              disabled: readOnly || !duplicate,
              onClick: async () => {
                await send(host, "persona.regenerate_one", {
                  project_id: project.id,
                  version: project.version,
                  candidate_id: duplicate.id,
                  ...(modelRef ? { model_ref: modelRef } : {}),
                });
                await refresh();
              },
            },
            "重新生成重复的这一个",
          ),
        ),
      ),
    ),
  );
}

function PersonaPanel({ snapshot, host, readOnly, refresh, modelRef }) {
  const projects = rows(snapshot.data.projects);
  const [projectId, setProjectId] = useState("");
  const [count, setCount] = useState("10");
  const [selected, setSelected] = useState([]);
  const [reviewVersion, setReviewVersion] = useState(null);
  const [reviewed, setReviewed] = useState(false);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(null);
  const project = projects.find((item) => item.id === projectId);
  const accounts = rows(snapshot.data.accounts).filter(
    (item) => item.project_id === projectId,
  );
  const candidates = rows(snapshot.data.persona_candidates).filter(
    (item) => item.project_id === projectId,
  );
  const generate = async () => {
    await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({
        command: "persona.generate",
        payload: {
          project_id: projectId,
          version: project.version,
          count: Number(count),
          ...(modelRef ? { model_ref: modelRef } : {}),
        },
      }),
    });
    await refresh();
  };
  const adopt = async (candidate) => {
    await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({
        command: "persona.apply",
        payload: {
          project_id: projectId,
          version: candidate.project_version,
          candidate_id: candidate.id,
          confirmed: true,
        },
      }),
    });
    await refresh();
  };
  const choose = (account, checked) => {
    if (!selected.length) setReviewVersion(project.version);
    setSelected((current) =>
      checked
        ? [...current, { id: account.id, version: account.version }]
        : current.filter((item) => item.id !== account.id),
    );
    setReviewed(false);
  };
  const confirm = async () => {
    await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({
        command: "personas.confirm",
        payload: {
          project_id: projectId,
          version: reviewVersion,
          accounts: selected,
          distribution_reviewed: reviewed,
          review_note: note,
        },
      }),
    });
    setSelected([]);
    setReviewed(false);
    setNote("");
    await refresh();
  };
  const distribution = ["gender", "age", "region"]
    .map((key) => {
      const counts = new Map();
      for (const item of candidates.filter(
        (entry) => entry.status === "draft" || entry.status === "applied",
      )) {
        const value = item.persona?.[key] || "待补充";
        counts.set(value, (counts.get(value) || 0) + 1);
      }
      return Array.from(counts, ([value, n]) => `${value} ${n}人`).join("、");
    })
    .filter(Boolean)
    .join("；");
  return h(
    "div",
    { className: "xhs-grid" },
    h(
      "div",
      { className: "xhs-card" },
      h("h3", null, "人设规划与分布审核"),
      h(
        "label",
        { className: "xhs-field" },
        h("div", { className: "xhs-label" }, "人设所属项目"),
        h(
          "select",
          {
            className: "xhs-select",
            value: projectId,
            disabled: readOnly,
            onChange: (event) => {
              setProjectId(event.target.value);
              setSelected([]);
              setReviewed(false);
              setNote("");
              setEditing(null);
            },
          },
          h("option", { value: "" }, "选择项目"),
          projects.map((item) =>
            h("option", { key: item.id, value: item.id }, item.name),
          ),
        ),
      ),
      project &&
        h(
          React.Fragment,
          null,
          h(
            "p",
            { className: "xhs-meta" },
            project.profile?.confirmed_at
              ? "目标受众画像已确认"
              : "请先在项目页确认目标受众画像",
          ),
          h(Field, {
            label: "候选人设数量",
            type: "number",
            value: count,
            onChange: setCount,
            disabled: readOnly,
          }),
          h(
            Button,
            {
              primary: true,
              onClick: generate,
              disabled:
                readOnly ||
                !project.profile?.confirmed_at ||
                !Number.isInteger(Number(count)) ||
                Number(count) < 1 ||
                Number(count) > 30,
            },
            "生成候选人设",
          ),
          distribution && h("p", null, "候选分布 " + distribution),
          candidates.map((candidate) =>
            h(
              "div",
              { className: "xhs-card", key: candidate.id },
              h("strong", null, candidate.label),
              h(Badge, { value: candidate.status }),
              h("p", null, candidate.positioning),
              h(
                "p",
                { className: "xhs-meta" },
                personaFields
                  .map(([key]) => candidate.persona?.[key])
                  .filter(Boolean)
                  .join(" · "),
              ),
              h(
                "p",
                { className: "xhs-meta" },
                "核心兴趣 " + rows(candidate.interest_pool?.core).join("、"),
              ),
              h(
                Button,
                {
                  onClick: () => adopt(candidate),
                  disabled:
                    readOnly ||
                    candidate.status !== "draft" ||
                    candidate.project_version !== project.version,
                },
                "采用为新号",
              ),
            ),
          ),
        ),
    ),
    project &&
      h(PersonaChecks, {
        project,
        candidates: candidates.filter((c) => c.status !== "stale"),
        accounts,
        host,
        readOnly,
        refresh,
        modelRef,
      }),
    project &&
      h(
        "div",
        { className: "xhs-card" },
        h("h3", null, "账号人设"),
        accounts.map((account) =>
          h(
            "div",
            { className: "xhs-row", key: account.id },
            h(
              "label",
              null,
              h("input", {
                type: "checkbox",
                checked: selected.some((item) => item.id === account.id),
                disabled: readOnly || !project.profile?.confirmed_at,
                onChange: (event) => choose(account, event.target.checked),
              }),
              " " + account.name,
            ),
            h(Badge, {
              value: account.persona_reviewed_at ? "人设已审核" : "人设待审核",
            }),
            h(
              Button,
              {
                onClick: () =>
                  setEditing({
                    account: JSON.parse(JSON.stringify(account)),
                    version: project.version,
                  }),
                disabled:
                  readOnly ||
                  account.entry_mode !== "new" ||
                  !project.profile?.confirmed_at,
              },
              "编辑人设",
            ),
          ),
        ),
        h(Field, {
          label: "分布审核说明",
          value: note,
          onChange: setNote,
          multiline: true,
          disabled: readOnly,
        }),
        h(
          "label",
          null,
          h("input", {
            type: "checkbox",
            checked: reviewed,
            disabled: readOnly || !selected.length,
            onChange: (event) => setReviewed(event.target.checked),
          }),
          " 已核对选中账号的年龄、性别、地区分布和人设差异",
        ),
        h(
          "div",
          { className: "xhs-actions" },
          h(
            Button,
            {
              primary: true,
              onClick: confirm,
              disabled:
                readOnly || !selected.length || !reviewed || !note.trim(),
            },
            "确认人设分布",
          ),
        ),
      ),
    editing &&
      h(PersonaEditor, {
        key: editing.account.id + ":" + editing.account.version,
        account: editing.account,
        projectVersion: editing.version,
        host,
        refresh,
        readOnly,
        onClose: () => setEditing(null),
      }),
  );
}

function AccountPanel({ snapshot, host, readOnly, refresh }) {
  const [editing, setEditing] = useState(null);
  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [entryMode, setEntryMode] = useState("existing");
  const [platformId, setPlatformId] = useState("");
  const accounts = rows(snapshot.data.accounts);
  const projects = rows(snapshot.data.projects);
  const devices = rows(snapshot.devices);
  const open = (account) => {
    setEditing(account ? JSON.parse(JSON.stringify(account)) : null);
    setProjectId(account?.project_id || "");
    setName(account?.name || "");
    setDeviceId(account?.device_id || "");
    setEntryMode(account?.entry_mode || "existing");
    setPlatformId(account?.platform_account_id || "");
  };
  const save = async () => {
    await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({
        command: "account.save",
        payload: {
          ...(editing ? { id: editing.id, version: editing.version } : {}),
          project_id: projectId,
          name,
          device_id: deviceId,
          entry_mode: entryMode,
          platform_account_id: platformId,
        },
      }),
    });
    open(null);
    await refresh();
  };
  const transferDevice = async (target) => {
    const sourceId = window.prompt("请输入要迁出的源账号 ID") || "";
    const source = accounts.find((item) => item.id === sourceId.trim());
    if (!source?.device_id) {
      window.dispatchEvent(
        new CustomEvent("octop:xhs-error", {
          detail: new Error("源账号没有可迁移设备"),
        }),
      );
      return;
    }
    await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({
        command: "account.transfer_device",
        payload: {
          from_account_id: source.id,
          to_account_id: target.id,
          project_id: target.project_id,
          confirmed: true,
          account: {
            project_id: target.project_id,
            name: target.name,
            device_id: source.device_id,
            entry_mode: target.entry_mode,
            platform_account_id: target.platform_account_id || "",
          },
        },
      }),
    });
    await refresh();
  };
  return h(
    "div",
    { className: "xhs-grid" },
    h(
      "div",
      { className: "xhs-card" },
      h("h3", null, "账号与设备"),
      accounts.length
        ? accounts.map((account) =>
            h(
              "div",
              { className: "xhs-row", key: account.id },
              h(
                "div",
                null,
                h("strong", null, account.name),
                h(
                  "div",
                  { className: "xhs-meta" },
                  text(account.platform_account_id, "待绑定平台账号"),
                ),
              ),
              h(Badge, { value: account.device_id ? "已配置设备" : "待配置" }),
              h(
                Button,
                { onClick: () => open(account), disabled: readOnly },
                "绑定手机",
              ),
              !account.device_id &&
                h(
                  Button,
                  {
                    onClick: () => transferDevice(account),
                    disabled:
                      readOnly || !accounts.some((item) => item.device_id),
                  },
                  "迁移已有设备",
                ),
            ),
          )
        : h("div", { className: "xhs-empty" }, "还没有账号"),
      h(
        "div",
        { className: "xhs-meta", style: { marginTop: 12 } },
        "设备就绪状态",
      ),
      devices.map((device) =>
        h(
          "div",
          { className: "xhs-row", key: device.device_id },
          h("span", null, device.name),
          h(Badge, { value: device.online ? "online" : "offline" }),
        ),
      ),
    ),
    h(
      "div",
      { className: "xhs-card" },
      h("h3", null, editing ? "绑定现有账号的手机" : "添加账号"),
      h(
        "label",
        { className: "xhs-field" },
        h("div", { className: "xhs-label" }, "所属项目"),
        h(
          "select",
          {
            className: "xhs-select",
            value: projectId,
            onChange: (event) => setProjectId(event.target.value),
            disabled: readOnly || Boolean(editing),
          },
          h("option", { value: "" }, "选择项目"),
          projects.map((project) =>
            h("option", { key: project.id, value: project.id }, project.name),
          ),
        ),
      ),
      h(Field, {
        label: "账号名称",
        value: name,
        onChange: setName,
        disabled: readOnly,
      }),
      h(Field, {
        label: "平台账号 ID",
        value: platformId,
        onChange: setPlatformId,
        disabled: readOnly,
      }),
      h(
        "label",
        { className: "xhs-field" },
        h("div", { className: "xhs-label" }, "接入方式"),
        h(
          "select",
          {
            className: "xhs-select",
            value: entryMode,
            onChange: (event) => setEntryMode(event.target.value),
            disabled: readOnly || Boolean(editing),
          },
          h("option", { value: "existing" }, "已有账号"),
          h("option", { value: "new" }, "新账号"),
        ),
      ),
      h(
        "label",
        { className: "xhs-field" },
        h("div", { className: "xhs-label" }, "设备"),
        h(
          "select",
          {
            className: "xhs-select",
            value: deviceId,
            onChange: (event) => setDeviceId(event.target.value),
            disabled: readOnly,
          },
          h("option", { value: "" }, "选择设备"),
          devices.map((device) =>
            h(
              "option",
              { key: device.device_id, value: device.device_id },
              device.name,
            ),
          ),
        ),
      ),
      h(
        "div",
        { className: "xhs-actions" },
        h(
          Button,
          {
            primary: true,
            onClick: save,
            disabled:
              readOnly ||
              !projectId ||
              !name.trim() ||
              (entryMode === "existing" && (!deviceId || !platformId.trim())),
          },
          "保存账号",
        ),
        editing && h(Button, { onClick: () => open(null) }, "取消绑定编辑"),
      ),
    ),
  );
}

const PUBLIC_PROFILE_FIELDS = [
  ["nickname", "昵称"],
  ["bio", "简介"],
  ["occupation", "职业"],
  ["avatar", "头像"],
  ["cover", "背景图"],
  ["gender", "性别"],
  ["birthday", "生日"],
  ["region", "地区"],
];

function PrivateEvidence({ host, url, label, onViewed }) {
  const [image, setImage] = useState("");
  useEffect(() => {
    setImage("");
    return undefined;
  }, [url]);
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image);
    },
    [image],
  );
  if (!url) return h("p", { className: "xhs-meta" }, "尚无可核对的截图");
  return h(
    "div",
    null,
    h(
      Button,
      {
        onClick: async () => {
          const blob = await host.requestBlob(url.replace(/^\/api/, ""));
          setImage(URL.createObjectURL(blob));
          if (onViewed) onViewed(url);
        },
      },
      label || "查看截图",
    ),
    image &&
      h("img", {
        src: image,
        alt: label || "手机回读截图",
        style: {
          display: "block",
          width: "100%",
          maxWidth: 360,
          maxHeight: 560,
          objectFit: "contain",
          marginTop: 10,
        },
      }),
  );
}

function PrivateImage({ host, image, alt, className, style }) {
  const inline =
    image.data_base64 &&
    ["image/png", "image/jpeg", "image/webp"].includes(image.mime_type)
      ? `data:${image.mime_type};base64,${image.data_base64}`
      : "";
  const [source, setSource] = useState(inline);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false;
    let objectUrl = "";
    setSource(inline);
    setFailed(false);
    if (image.asset_id) {
      host
        .requestBlob(
          `/plugin-apps/xhs-ops/assets/${encodeURIComponent(image.asset_id)}`,
        )
        .then((blob) => {
          if (disposed) return;
          objectUrl = URL.createObjectURL(blob);
          setSource(objectUrl);
        })
        .catch(() => {
          if (!disposed) setFailed(true);
        });
    }
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [host, image.asset_id, inline]);
  if (failed)
    return h("span", { className: "xhs-danger" }, `${alt} · 图片读取失败`);
  return source
    ? h("img", { src: source, alt, className, style })
    : h("span", { className: "xhs-meta" }, "正在读取图片…");
}

// The seven steps of setting up a new account, read from what is already recorded.
function OnboardingFlow({ account, host, readOnly, refresh }) {
  const draft = account.profile_draft || {};
  const identity = Boolean(
    account.profile_identity || account.platform_account_id,
  );
  const texts = ["nickname", "bio", "gender", "birthday"].filter(
    (k) => draft[k],
  );
  const images = [draft.avatar_filename, draft.cover_filename].filter(Boolean);
  const tags = [
    ...rows(draft.interest_tags),
    ...rows(account.interest_pool?.core),
    ...rows(account.interest_pool?.general),
  ].filter((v, i, list) => v && list.indexOf(v) === i);
  const steps = [
    [
      "注册与登录",
      Boolean(account.device_id),
      account.device_id ? "本人在手机完成" : "还没有绑定手机",
    ],
    ["身份核对", identity, identity ? "小红薯号已锁定" : "待只读核对"],
    [
      "兴趣标签选择",
      Boolean(account.interest_tags_selected_at),
      account.interest_tags_selected_at ? "已在手机勾选" : "按建议在手机勾选",
    ],
    ["文字资料", texts.length === 4, "昵称 · 简介 · 性别 · 年龄"],
    [
      "头像与背景图",
      images.length === 2 && Boolean(draft.applied_at),
      images.length === 2 ? "已选候选，待应用" : `已选 ${images.length} / 2`,
    ],
    ["逐项应用", Boolean(draft.applied_at), "一次只改一项"],
    ["人工核验", Boolean(draft.verified_at), "对照手机确认"],
  ];
  return h(
    Card,
    {
      title: `建号流程 · ${account.name || account.id}`,
      icon: "建号流程 · 小个子通勤党",
      tip: "注册、登录和首次勾选兴趣标签由本人在手机上完成；这里只记录进度。",
      style: { marginTop: 12 },
    },
    h(
      "div",
      {
        className: "xhs-steps",
        style: { gridTemplateColumns: "repeat(7, minmax(0, 1fr))" },
      },
      steps.map(([label, done, sub], index) =>
        h(
          "div",
          { key: label, className: "xhs-step" },
          h(
            "span",
            { className: `xhs-step-n${done ? " done" : ""}` },
            done ? "✓" : index + 1,
          ),
          h(
            "div",
            null,
            h("div", null, label),
            h("div", { className: "xhs-meta" }, sub),
          ),
        ),
      ),
    ),
    !account.interest_tags_selected_at &&
      h(
        Row,
        {
          title: "兴趣标签选择",
          sub: "首次打开小红薯时勾选，建议按兴趣池选这几个",
        },
        tags
          .slice(0, 6)
          .map((t) => h("span", { key: t, className: "xhs-pill" }, t)),
        h(
          Button,
          {
            disabled: readOnly,
            onClick: async () => {
              await send(host, "onboarding.tags_done", {
                account_id: account.id,
              });
              await refresh();
            },
          },
          "我已在手机上选好",
        ),
      ),
  );
}

const IMAGE_PRESETS = {
  avatar: ["人物半身照 + 自然环境背景", "只拍环境，不出现人物", "自定义"],
  cover: ["当地知名风景 + 人物背影", "生活场景一角", "自定义"],
};
function ProfilePanel({ snapshot, host, readOnly, refresh, modelRef }) {
  const accounts = rows(snapshot.data?.accounts).filter(
    (account) => account.entry_mode === "new",
  );
  const [accountId, setAccountId] = useState("");
  const [formVersion, setFormVersion] = useState(null);
  const [draft, setDraft] = useState({});
  const [interestText, setInterestText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [selectedFields, setSelectedFields] = useState([]);
  const [preview, setPreview] = useState(null);
  const [applyConfirmed, setApplyConfirmed] = useState(false);
  const [imageModels, setImageModels] = useState([]);
  const [imageModel, setImageModel] = useState("");
  const [avatarPrompt, setAvatarPrompt] = useState("");
  const [coverPrompt, setCoverPrompt] = useState("");
  const [avatarPreset, setAvatarPreset] = useState(IMAGE_PRESETS.avatar[0]);
  const [coverPreset, setCoverPreset] = useState(IMAGE_PRESETS.cover[0]);
  const withPreset = (preset, extra) =>
    [preset === "自定义" ? "" : preset, extra.trim()]
      .filter(Boolean)
      .join("；");
  const rewriteBio = async (part) => {
    const result = await request("profile.rewrite_bio", {
      account_id: accountId,
      part,
      bio: draft.bio || "",
      ...(modelRef ? { model_ref: modelRef } : {}),
    });
    const text = result.data?.bio_suggestion?.text;
    if (!text) throw new Error("没有拿到重写结果，请重试。");
    const parts = String(draft.bio || "").split("｜");
    while (parts.length < 3) parts.push("");
    parts[part] = text;
    change("bio", parts.join("｜").slice(0, 100));
  };
  const [evidenceViewed, setEvidenceViewed] = useState("");
  const [imagesConfirmed, setImagesConfirmed] = useState(false);
  const [reference, setReference] = useState("");
  const account = accounts.find((item) => item.id === accountId);
  const stale = Boolean(account && formVersion !== account.version);
  const editable = (value) => {
    const original = value.profile_draft || {};
    const keys = [
      "nickname",
      "bio",
      "occupation",
      "gender",
      "birthday",
      "region",
      "interest_tags",
      "avatar_candidates",
      "cover_candidates",
      "avatar_filename",
      "cover_filename",
    ];
    return JSON.parse(
      JSON.stringify(
        Object.fromEntries(
          keys.map((key) => [
            key,
            original[key] ??
              (key.endsWith("_candidates") || key === "interest_tags"
                ? []
                : key.endsWith("_filename")
                ? null
                : ""),
          ]),
        ),
      ),
    );
  };
  const open = (value) => {
    setAccountId(value.id);
    setFormVersion(value.version);
    setDraft(editable(value));
    setInterestText(rows(value.profile_draft?.interest_tags).join("，"));
    setDirty(false);
    setReviewed(false);
    setPreview(null);
    setApplyConfirmed(false);
    setImagesConfirmed(false);
    setEvidenceViewed("");
    setReference("");
    setSelectedFields(
      PUBLIC_PROFILE_FIELDS.filter(([field]) =>
        Boolean(
          value.profile_draft?.[
            field === "avatar" || field === "cover"
              ? `${field}_filename`
              : field
          ],
        ),
      ).map(([field]) => field),
    );
  };
  useEffect(() => {
    if (!accountId && accounts.length) open(accounts[0]);
  }, [accounts.length]);
  useEffect(() => {
    if (readOnly) return;
    let active = true;
    host
      .request("/plugin-apps/xhs-ops/image-models")
      .then((models) => {
        if (active) setImageModels(rows(models));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [readOnly]);
  const change = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setReviewed(false);
    setPreview(null);
    setApplyConfirmed(false);
  };
  const request = (command, payload) =>
    host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({ command, payload }),
    });
  const act = async (command, extra = {}) => {
    const result = await request(command, {
      account_id: accountId,
      version: formVersion,
      ...extra,
    });
    const updated = rows(result.data?.accounts).find(
      (item) => item.id === accountId,
    );
    if (updated) open(updated);
    await refresh();
    return result;
  };
  const save = () => act("account_profile.save", { draft });
  const generate = async (part) => {
    let version = formVersion;
    if (dirty) {
      const saved = await request("account_profile.save", {
        account_id: accountId,
        version,
        draft,
      });
      const updated = rows(saved.data?.accounts).find(
        (item) => item.id === accountId,
      );
      if (!updated) throw new Error("资料保存结果不完整");
      version = updated.version;
      open(updated);
    }
    try {
      const result = await request("account_profile.generate", {
        account_id: accountId,
        version,
        parts: [part],
        ...(modelRef ? { model_ref: modelRef } : {}),
        ...(imageModel ? { image_model_ref: imageModel } : {}),
        avatar_prompt: withPreset(avatarPreset, avatarPrompt),
        cover_prompt: withPreset(coverPreset, coverPrompt),
      });
      const updated = rows(result.data?.accounts).find(
        (item) => item.id === accountId,
      );
      if (updated) open(updated);
    } finally {
      await refresh();
    }
  };
  const upload = async (part, event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    try {
      if (files.length + rows(draft[`${part}_candidates`]).length > 3)
        throw new Error("每组最多保留 3 张候选图。");
      const images = await readImageFiles(files);
      change(`${part}_candidates`, [
        ...rows(draft[`${part}_candidates`]),
        ...images,
      ]);
      change(`${part}_filename`, null);
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent("octop:xhs-error", { detail: error }),
      );
    }
  };
  if (!accounts.length)
    return h(
      "div",
      { className: "xhs-card" },
      h("h3", null, "新号公开资料"),
      h(
        "p",
        null,
        "请先在人设规划中采用新号并审核人设，或在账号与设备中添加新号。已有账号的资料修改请使用诊断与变更。",
      ),
    );
  const disabled = readOnly || stale;
  const phoneDisabled = disabled || dirty || !account?.device_id;
  const proof = account?.profile_verification;
  const applying =
    ((account?.profile_draft || {}).apply_operation || {}).run_id ||
    account?.last_profile_apply_run_id;
  const activeRuns = rows(snapshot.data?.runs).filter(
    (run) =>
      run.account_id === accountId &&
      ["queued", "preparing", "running", "cancelling"].includes(run.status),
  );
  const ready = Boolean(
    draft.nickname?.trim() &&
      draft.bio?.trim() &&
      draft.gender &&
      draft.birthday &&
      draft.region?.trim() &&
      rows(draft.interest_tags).length &&
      draft.avatar_filename &&
      draft.cover_filename,
  );
  return h(
    "div",
    { className: "xhs-grid" },
    h(
      "div",
      { className: "xhs-card" },
      h("h3", null, "新号公开资料"),
      h(
        "label",
        { className: "xhs-field" },
        "选择新号",
        h(
          "select",
          {
            className: "xhs-select",
            value: accountId,
            onChange: (event) =>
              open(accounts.find((item) => item.id === event.target.value)),
          },
          h("option", { value: "", disabled: true }, "选择账号"),
          accounts.map((item) =>
            h("option", { key: item.id, value: item.id }, item.name),
          ),
        ),
      ),
      account &&
        h(
          "div",
          null,
          h(
            "p",
            null,
            `目标小红薯号：${account.platform_account_id || "待核对"}`,
          ),
          h(
            "p",
            { className: "xhs-meta" },
            `手机：${account.device_id || "未绑定"} · 资料版本 v${formVersion}`,
          ),
          stale &&
            h(
              "p",
              { className: "xhs-danger" },
              "账号已有更新，请重新载入后核对。",
            ),
          dirty &&
            h(
              "p",
              { className: "xhs-meta" },
              "有未保存的资料，请先保存再检查或审核。",
            ),
          h(Button, { onClick: () => open(account) }, "重新载入资料"),
          h(OnboardingFlow, { account, host, readOnly, refresh }),
          h("h3", { style: { marginTop: 18 } }, "手机准备与身份"),
          h(
            "div",
            { className: "xhs-actions" },
            h(
              Button,
              {
                onClick: () =>
                  act(
                    account.authorized_at
                      ? "takeover.identity.read"
                      : "account.identity",
                    {
                      account_id: account.id,
                      account_version: account.version,
                      confirmed: true,
                    },
                  ),
                disabled: phoneDisabled,
              },
              account.authorized_at ? "读取接管身份" : "只读核对小红薯号",
            ),
            h(
              Button,
              {
                onClick: () => act("account.prepare", { confirmed: true }),
                disabled: phoneDisabled,
              },
              "运行准备检查",
            ),
            h(
              Button,
              {
                onClick: () => act("account_profile.read", { confirmed: true }),
                disabled: phoneDisabled,
              },
              "读取手机当前资料",
            ),
          ),
          h(
            "p",
            { className: "xhs-meta" },
            "检查不会切换账号；需要登录或验证码时停下，由你在手机上处理。",
          ),
          account.preparation &&
            h(
              "p",
              null,
              `准备状态：${account.preparation.status} · ${
                account.preparation.code || ""
              }`,
            ),
          account.profile_identity?.account_id &&
            h(
              "p",
              null,
              `手机回读的小红薯号：${account.profile_identity.account_id}。请与目标账号核对后，在账号与设备中确认绑定。`,
            ),
          account.pending_identity &&
            h(
              "div",
              { className: "xhs-card" },
              h(
                "p",
                null,
                `接管待确认身份：${
                  account.pending_identity.account_id || "未读到"
                }`,
              ),
              h(
                Button,
                {
                  primary: true,
                  disabled: readOnly,
                  onClick: async () => {
                    const value =
                      account.pending_identity.account_id ||
                      window.prompt("请输入截图中核对后的小红薯号") ||
                      "";
                    if (!value.trim()) return;
                    await act("takeover.identity.confirm", {
                      account_id: account.id,
                      identity_task_id: account.pending_identity.task_id,
                      platform_account_id: value.trim(),
                      account_version: account.version,
                      confirmed: true,
                    });
                  },
                },
                "确认并锁定身份",
              ),
            ),
          h(PrivateEvidence, {
            host,
            url: account.profile_identity?.evidence_url,
            label: "查看身份核对截图",
          }),
          account.paused &&
            h(
              "div",
              null,
              h(
                "p",
                { className: "xhs-danger" },
                "账号处于安全暂停，冷却结束并重新检查后才能恢复。",
              ),
              h(
                Button,
                {
                  onClick: () => act("account.resume", { confirmed: true }),
                  disabled: phoneDisabled,
                },
                "确认恢复账号",
              ),
            ),
          activeRuns.map((run) =>
            h(
              "div",
              { className: "xhs-row", key: run.id },
              h(Badge, { value: run.status }),
              h(
                Button,
                {
                  danger: true,
                  onClick: async () => {
                    await request("run.cancel", { run_id: run.id });
                    await refresh();
                  },
                },
                "停止当前检查或应用",
              ),
            ),
          ),
        ),
    ),
    account &&
      h(
        "div",
        { className: "xhs-card" },
        h("h3", null, "填写与审核资料"),
        !account.persona_reviewed_at &&
          h(
            "p",
            { className: "xhs-meta" },
            "请先审核账号人设，再生成或审核公开资料。",
          ),
        h(
          Button,
          {
            onClick: () => generate("text"),
            disabled: disabled || !account.persona_reviewed_at,
          },
          "生成文字资料",
        ),
        ["nickname", "bio", "occupation", "birthday", "region"].map((key) =>
          h(Field, {
            key,
            label: PUBLIC_PROFILE_FIELDS.find(([field]) => field === key)[1],
            value: draft[key],
            onChange: (value) => change(key, value),
            multiline: key === "bio",
            type: key === "birthday" ? "date" : "text",
            disabled,
          }),
        ),
        h(
          "div",
          { className: "xhs-actions", style: { marginTop: 0 } },
          h(
            "span",
            { className: "xhs-meta", style: { alignSelf: "center" } },
            "简介三段：星座 + MBTI｜自我介绍｜兴趣，可分别重写",
          ),
          ["重写星座与 MBTI", "重写自我介绍", "重写兴趣"].map((label, part) =>
            h(
              Button,
              {
                key: label,
                disabled: disabled || !account.persona_reviewed_at,
                onClick: () => rewriteBio(part),
              },
              label,
            ),
          ),
        ),
        h(
          "label",
          { className: "xhs-field" },
          "性别",
          h(
            "select",
            {
              className: "xhs-select",
              value: draft.gender || "",
              disabled,
              onChange: (event) => change("gender", event.target.value),
            },
            ["", "男", "女", "不展示"].map((value) =>
              h("option", { key: value, value }, value || "请选择"),
            ),
          ),
        ),
        h(Field, {
          label: "内部兴趣标签（不发送到手机）",
          value: interestText,
          onChange: (value) => {
            setInterestText(value);
            change(
              "interest_tags",
              value
                .split(/[，,、\n]+/)
                .map((tag) => tag.trim())
                .filter(Boolean),
            );
          },
          disabled,
        }),
        h(
          "p",
          { className: "xhs-meta" },
          "昵称最多 20 字，简介最多 100 字。生日、性别与地区须由你核对，职业可留空。",
        ),
        h(
          "label",
          { className: "xhs-field" },
          "候选图生成模型",
          h(
            "select",
            {
              className: "xhs-select",
              value: imageModel,
              disabled,
              onChange: (event) => setImageModel(event.target.value),
            },
            h("option", { value: "" }, "默认个人生图模型"),
            imageModels.map((model) =>
              h("option", { key: model.id, value: model.id }, model.name),
            ),
          ),
        ),
        !imageModels.length &&
          h(
            "p",
            { className: "xhs-meta" },
            "当前没有获授权的个人生图模型，可上传候选图。企业生图计费尚待接入。",
          ),
        ["avatar", "cover"].map((part) =>
          h(
            "section",
            { className: "xhs-card", key: part, style: { marginTop: 12 } },
            h("h3", null, part === "avatar" ? "头像候选" : "背景图候选"),
            h(Select, {
              label: part === "avatar" ? "头像预设" : "背景图预设",
              value: part === "avatar" ? avatarPreset : coverPreset,
              onChange: part === "avatar" ? setAvatarPreset : setCoverPreset,
              disabled,
              options: IMAGE_PRESETS[part].map((x) => [x, x]),
            }),
            h(Field, {
              label: part === "avatar" ? "头像生成要求" : "背景图生成要求",
              value: part === "avatar" ? avatarPrompt : coverPrompt,
              onChange: part === "avatar" ? setAvatarPrompt : setCoverPrompt,
              disabled,
            }),
            h(
              Button,
              {
                onClick: () => generate(part),
                disabled:
                  disabled ||
                  !account.persona_reviewed_at ||
                  !imageModels.length,
              },
              `生成${part === "avatar" ? "头像" : "背景图"}候选（每组 3 张）`,
            ),
            h(
              "label",
              { className: "xhs-field" },
              `上传${part === "avatar" ? "头像" : "背景图"}候选`,
              h("input", {
                type: "file",
                accept: "image/png,image/jpeg,image/webp",
                multiple: true,
                disabled:
                  disabled || rows(draft[`${part}_candidates`]).length >= 3,
                onChange: (event) => upload(part, event),
              }),
            ),
            rows(draft[`${part}_candidates`]).map((image, index) =>
              h(
                "div",
                { key: `${index}-${image.filename}`, className: "xhs-row" },
                h(
                  "label",
                  null,
                  h("input", {
                    type: "radio",
                    name: `${part}-${accountId}`,
                    checked: draft[`${part}_filename`] === image.filename,
                    disabled,
                    onChange: () => change(`${part}_filename`, image.filename),
                  }),
                  h(PrivateImage, {
                    host,
                    image,
                    className: "xhs-preview",
                    alt: `${part === "avatar" ? "头像" : "背景图"}候选${
                      index + 1
                    }`,
                  }),
                ),
                h(
                  Button,
                  {
                    disabled,
                    onClick: () => {
                      change(
                        `${part}_candidates`,
                        rows(draft[`${part}_candidates`]).filter(
                          (_, at) => at !== index,
                        ),
                      );
                      if (draft[`${part}_filename`] === image.filename)
                        change(`${part}_filename`, null);
                    },
                  },
                  `移除${part === "avatar" ? "头像" : "背景图"}候选${
                    index + 1
                  }`,
                ),
              ),
            ),
          ),
        ),
        h(
          "div",
          { className: "xhs-actions" },
          h(
            Button,
            { primary: true, onClick: save, disabled },
            "保存公开资料草稿",
          ),
        ),
        h(
          "label",
          null,
          h("input", {
            type: "checkbox",
            checked: reviewed,
            disabled: disabled || dirty || !ready,
            onChange: (event) => setReviewed(event.target.checked),
          }),
          "我已逐项核对文字、生日、性别、地区与选中的头像和背景图",
        ),
        h(
          Button,
          {
            onClick: () => act("account_profile.review", { confirmed: true }),
            disabled: disabled || dirty || !ready || !reviewed,
          },
          "确认公开资料审核",
        ),
      ),
    account &&
      h(
        "div",
        { className: "xhs-card" },
        h("h3", null, "逐项比较与应用"),
        h(PrivateEvidence, {
          host,
          url: account.profile_readback?.evidence_url,
          label: "查看应用前资料截图",
        }),
        PUBLIC_PROFILE_FIELDS.map(([field, label]) =>
          h(
            "label",
            { className: "xhs-row", key: field },
            h(
              "span",
              null,
              h("input", {
                type: "checkbox",
                checked: selectedFields.includes(field),
                disabled: phoneDisabled,
                onChange: (event) => {
                  setSelectedFields((current) =>
                    event.target.checked
                      ? [...current, field]
                      : current.filter((item) => item !== field),
                  );
                  setPreview(null);
                  setApplyConfirmed(false);
                },
              }),
              label,
            ),
            h(
              "span",
              { className: "xhs-meta" },
              field === "avatar" || field === "cover"
                ? "图片不自动比对，选中后覆盖"
                : `${
                    account.profile_readback?.values?.[field] ?? "尚未回读"
                  } → ${draft[field] || "留空"}`,
            ),
          ),
        ),
        h(
          Button,
          {
            onClick: async () => {
              const result = await act("account_profile.precheck", {
                fields: selectedFields,
              });
              const current = rows(result.data?.accounts).find(
                (item) => item.id === accountId,
              );
              setPreview(JSON.parse(JSON.stringify(current.profile_precheck)));
            },
            disabled:
              phoneDisabled ||
              !selectedFields.length ||
              !account.profile_draft?.reviewed_at,
          },
          "预检所选资料变更",
        ),
        preview &&
          h(
            "section",
            { "aria-label": "新号资料应用确认", className: "xhs-card" },
            h("h3", null, "核对本次应用"),
            h(
              "p",
              null,
              `目标小红薯号：${account.platform_account_id} · 手机：${preview.device_id}`,
            ),
            rows(preview.diffs).map((diff) =>
              h(
                "p",
                { key: diff.field },
                `${
                  PUBLIC_PROFILE_FIELDS.find(([key]) => key === diff.field)[1]
                }：${
                  diff.comparable
                    ? `${diff.phone || "空"} → ${diff.draft}`
                    : "覆盖为选中的候选图"
                }`,
              ),
            ),
            h(
              "label",
              null,
              h("input", {
                type: "checkbox",
                checked: applyConfirmed,
                onChange: (event) => setApplyConfirmed(event.target.checked),
              }),
              "我确认仅应用以上所选字段",
            ),
            h(
              Button,
              {
                primary: true,
                onClick: () =>
                  act("account_profile.apply", {
                    confirmed: true,
                    confirm_digest: preview.digest,
                  }),
                disabled: phoneDisabled || !applyConfirmed,
              },
              "确认应用到新号",
            ),
          ),
        account.profile_draft?.apply_status &&
          h(
            "p",
            null,
            `应用回报：${account.profile_draft.apply_status}，仍需独立核验。`,
          ),
        h(
          Button,
          {
            onClick: () => act("account_profile.check", { confirmed: true }),
            disabled: phoneDisabled || !applying,
          },
          "重新独立核验",
        ),
        proof &&
          h(
            "div",
            null,
            h("p", null, `独立核验：${proof.status}`),
            h(PrivateEvidence, {
              host,
              url: proof.evidence_url,
              label: "查看独立核验截图",
              onViewed: setEvidenceViewed,
            }),
            PUBLIC_PROFILE_FIELDS.map(([field, label]) =>
              h(
                "p",
                { key: field },
                `${label}：${
                  proof.fields?.[field] === true
                    ? "手机回报一致"
                    : "尚未确认一致"
                }`,
              ),
            ),
            h(Field, {
              label: "人工核验记录",
              value: reference,
              onChange: setReference,
              multiline: true,
            }),
            h(
              "label",
              null,
              h("input", {
                type: "checkbox",
                checked: imagesConfirmed,
                disabled:
                  proof.status !== "verified" ||
                  evidenceViewed !== proof.evidence_url,
                onChange: (event) => setImagesConfirmed(event.target.checked),
              }),
              "我已对照手机、选中候选图和截图核对全部八项资料",
            ),
            h(
              Button,
              {
                onClick: () =>
                  act("account_profile.verify", {
                    run_id: proof.run_id,
                    evidence_url: proof.evidence_url,
                    reference,
                    images_confirmed: true,
                    confirmed: true,
                  }),
                disabled:
                  stale ||
                  dirty ||
                  proof.status !== "verified" ||
                  !imagesConfirmed ||
                  !reference.trim() ||
                  evidenceViewed !== proof.evidence_url,
              },
              "记录人工核验完成",
            ),
          ),
        applying &&
          h(
            Button,
            {
              danger: true,
              onClick: async () => {
                const note = window.prompt(
                  "请先确认手机任务已经停止，并记录本次对账情况；这不会把结果标为成功。",
                );
                if (note)
                  await act("account_profile.reconcile", {
                    run_id: applying,
                    version: account.version,
                    confirmed: true,
                    reference: note,
                  });
              },
            },
            "确认手机已停止，返回编辑",
          ),
        account.profile_draft?.verified_at &&
          account.profile_draft?.verified_version === account.version &&
          h("p", { className: "xhs-meta" }, "该版本公开资料已完成人工核验。"),
      ),
  );
}

function BatchPanel({ snapshot, host, readOnly, refresh, license }) {
  const data = snapshot.data || {};
  const [editing, setEditing] = useState(null);
  const [prechecked, setPrechecked] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [items, setItems] = useState([]);
  const canPublish = !readOnly && hasFeature(license, "xhs.publish");
  const command = async (command, payload) => {
    const result = await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({ command, payload }),
    });
    await refresh();
    return result;
  };
  const open = (batch) => {
    setEditing({ ...batch });
    setName(batch.name || "");
    setProjectId(batch.project_id || "");
    setItems(
      rows(batch.items).map((item) => ({
        id: item.id,
        draft_id: item.draft_id,
        account_id: item.account_id,
      })),
    );
    setPrechecked(null);
    setAcknowledged(false);
  };
  const update = (id, patch) =>
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  const prepare = async (batch) => {
    const result = await command("batch.precheck", {
      id: batch.id,
      version: batch.version,
    });
    const current = rows(result.data?.batches).find(
      (item) => item.id === batch.id,
    );
    if (!current?.precheck?.digest)
      throw new Error("批次预检结果不完整，请重新预检。");
    const frozen = JSON.parse(JSON.stringify(current));
    frozen.precheck.items = rows(current.precheck.items || current.items).map(
      (item) => {
        const draft = rows(result.data?.drafts).find(
          (entry) => entry.id === item.draft_id,
        );
        const account = rows(result.data?.accounts).find(
          (entry) => entry.id === item.account_id,
        );
        if (
          !draft ||
          (item.draft_version !== undefined &&
            draft.version !== item.draft_version)
        )
          throw new Error("草稿在预检后发生变化，请重新预检批次。");
        return JSON.parse(
          JSON.stringify({
            ...item,
            draft_snapshot: draft,
            account_snapshot: {
              ...item.account_snapshot,
              name: account?.name,
              device_id: item.account_snapshot?.device_id || account?.device_id,
            },
          }),
        );
      },
    );
    setPrechecked(frozen);
    setAcknowledged(false);
  };
  const start = async () => {
    await command("batch.start", {
      id: prechecked.id,
      version: prechecked.version,
      confirm_digest: prechecked.precheck.digest,
      confirmed: true,
      idempotency_key: `batch-${prechecked.id}-${prechecked.precheck.digest}`,
    });
    setPrechecked(null);
    setAcknowledged(false);
  };
  return h(
    "div",
    { className: "xhs-grid" },
    h(
      "div",
      { className: "xhs-card" },
      h("h3", null, "批量发布"),
      h(
        "p",
        { className: "xhs-meta" },
        "每篇指定草稿与账号，同一手机按顺序执行。结果待核验或不明确时，先核对手机再继续。",
      ),
      h(
        Button,
        { onClick: () => open({}), disabled: !canPublish },
        "新建发布批次",
      ),
      !rows(data.batches).length &&
        h("div", { className: "xhs-empty" }, "还没有发布批次"),
      rows(data.batches).map((batch) =>
        h(
          "section",
          { key: batch.id, className: "xhs-card", style: { marginTop: 12 } },
          h("h3", null, batch.name),
          h(Badge, { value: batch.status || "draft" }),
          rows(batch.items).map((item, index) => {
            const draft = rows(data.drafts).find(
              (entry) => entry.id === item.draft_id,
            );
            const account = rows(data.accounts).find(
              (entry) => entry.id === item.account_id,
            );
            const run = rows(data.runs).find(
              (entry) =>
                entry.id === item.run_id ||
                (entry.batch_id === batch.id &&
                  entry.batch_item_id === item.id),
            );
            return h(
              "div",
              { key: item.id, className: "xhs-row" },
              h(
                "div",
                null,
                h(
                  "strong",
                  null,
                  `${index + 1}. ${draft?.title || item.draft_id}`,
                ),
                h(
                  "div",
                  { className: "xhs-meta" },
                  `${account?.name || item.account_id} · ${
                    account?.device_id || "未绑定手机"
                  }`,
                ),
              ),
              h(Badge, { value: run?.status || item.status || "draft" }),
            );
          }),
          h(
            "div",
            { className: "xhs-actions" },
            h(
              Button,
              {
                onClick: () => open(batch),
                disabled:
                  !canPublish ||
                  !["draft", "prechecked", "ready"].includes(
                    batch.status || "draft",
                  ),
              },
              "编辑批次",
            ),
            h(
              Button,
              {
                onClick: () => prepare(batch),
                disabled:
                  !canPublish ||
                  !["draft", "prechecked", "ready"].includes(
                    batch.status || "draft",
                  ),
              },
              "预检发布批次",
            ),
            [
              "queued",
              "running",
              "preparing",
              "paused",
              "awaiting_verification",
            ].includes(batch.status) &&
              h(
                Button,
                {
                  danger: true,
                  onClick: () =>
                    command("batch.cancel", { id: batch.id, confirmed: true }),
                },
                "停止批次",
              ),
          ),
        ),
      ),
    ),
    editing &&
      h(
        "div",
        { className: "xhs-card" },
        h("h3", null, "编辑发布批次"),
        h(Field, {
          label: "批次名称",
          value: name,
          onChange: setName,
          disabled: !canPublish,
        }),
        h(
          "label",
          { className: "xhs-field" },
          "批次所属项目",
          h(
            "select",
            {
              className: "xhs-select",
              value: projectId,
              disabled: !canPublish,
              onChange: (event) => {
                setProjectId(event.target.value);
                setItems([]);
              },
            },
            h("option", { value: "" }, "选择项目"),
            rows(data.projects).map((project) =>
              h("option", { key: project.id, value: project.id }, project.name),
            ),
          ),
        ),
        items.map((item, index) =>
          h(
            "div",
            { className: "xhs-card", key: item.id },
            h("h3", null, `第 ${index + 1} 篇`),
            h(
              "label",
              { className: "xhs-field" },
              `第${index + 1}篇草稿`,
              h(
                "select",
                {
                  className: "xhs-select",
                  value: item.draft_id,
                  disabled: !canPublish,
                  onChange: (event) =>
                    update(item.id, { draft_id: event.target.value }),
                },
                h("option", { value: "" }, "选择草稿"),
                rows(data.drafts)
                  .filter((draft) => draft.project_id === projectId)
                  .map((draft) =>
                    h(
                      "option",
                      { key: draft.id, value: draft.id },
                      `${draft.title} · v${draft.version}`,
                    ),
                  ),
              ),
            ),
            h(
              "label",
              { className: "xhs-field" },
              `第${index + 1}篇账号`,
              h(
                "select",
                {
                  className: "xhs-select",
                  value: item.account_id,
                  disabled: !canPublish,
                  onChange: (event) =>
                    update(item.id, { account_id: event.target.value }),
                },
                h("option", { value: "" }, "选择账号与手机"),
                rows(data.accounts)
                  .filter((account) => account.project_id === projectId)
                  .map((account) =>
                    h(
                      "option",
                      { key: account.id, value: account.id },
                      `${account.name} · ${account.device_id || "未绑定手机"}`,
                    ),
                  ),
              ),
            ),
            h(
              Button,
              {
                onClick: () =>
                  setItems((current) =>
                    current.filter((entry) => entry.id !== item.id),
                  ),
                disabled: !canPublish,
              },
              `移除第${index + 1}篇`,
            ),
          ),
        ),
        h(
          "div",
          { className: "xhs-actions" },
          h(
            Button,
            {
              onClick: () =>
                setItems((current) => [
                  ...current,
                  { id: crypto.randomUUID(), draft_id: "", account_id: "" },
                ]),
              disabled: !canPublish || !projectId || items.length >= 30,
            },
            "添加一篇",
          ),
          h(
            Button,
            {
              primary: true,
              disabled:
                !canPublish ||
                !projectId ||
                !name.trim() ||
                !items.length ||
                items.some((item) => !item.draft_id || !item.account_id),
              onClick: async () => {
                await command("batch.save", {
                  id: editing.id || "",
                  version: editing.version,
                  project_id: projectId,
                  name,
                  items,
                });
                setEditing(null);
              },
            },
            "保存发布批次",
          ),
          h(Button, { onClick: () => setEditing(null) }, "取消编辑"),
        ),
      ),
    prechecked &&
      h(
        "section",
        { className: "xhs-card", "aria-label": "批次发布确认" },
        h("h3", null, "核对本次发布"),
        h(
          "p",
          null,
          `${prechecked.name} · ${rows(prechecked.items).length} 篇`,
        ),
        h(
          "p",
          { className: "xhs-meta" },
          "确认只适用于本次预检的草稿、账号、手机和版本，五分钟内有效。",
        ),
        rows(prechecked.precheck.items || prechecked.items).map((item) => {
          const draft =
            item.draft_snapshot ||
            rows(data.drafts).find((entry) => entry.id === item.draft_id);
          const account =
            item.account_snapshot ||
            rows(data.accounts).find((entry) => entry.id === item.account_id);
          return h(
            "div",
            { className: "xhs-card", key: item.id },
            h("strong", null, draft?.title || item.draft_id),
            h("p", { style: { whiteSpace: "pre-wrap" } }, draft?.content),
            h(
              "p",
              { className: "xhs-meta" },
              `账号 ${account?.name || item.account_id} · 手机 ${
                account?.device_id || ""
              }`,
            ),
            rows(draft?.images).map((image, index) =>
              h(PrivateImage, {
                host,
                image,
                key: index,
                className: "xhs-preview",
                alt: `批次预览${index + 1}`,
              }),
            ),
          );
        }),
        h(
          "label",
          null,
          h("input", {
            type: "checkbox",
            checked: acknowledged,
            onChange: (event) => setAcknowledged(event.target.checked),
          }),
          "我已逐篇核对内容、图片顺序、目标账号与手机",
        ),
        h(
          "div",
          { className: "xhs-actions" },
          h(
            Button,
            {
              primary: true,
              onClick: start,
              disabled: !canPublish || !acknowledged,
            },
            "确认启动批次",
          ),
          h(Button, { onClick: () => setPrechecked(null) }, "返回修改"),
        ),
      ),
  );
}

const operationBrowseDefaults = {
  dwell_sec_min: 11,
  dwell_sec_max: 25,
  search_ratio_percent: 80,
  posts_per_keyword: 5,
  home_feed_count: 6,
  daily_target_posts: 90,
  daily_segments: 2,
  home_open_percent: 35,
  open_gap_sec_min: 6,
  open_gap_sec_max: 20,
  shortfall: "record",
  anomaly_stop_after: 2,
};
const operationRuleDefaults = {
  like: { enabled: true, daily_cap: 5, ratio_percent: 10, target_types: [] },
  collect: { enabled: false, daily_cap: 2, ratio_percent: 3, target_types: [] },
  follow: { enabled: false, daily_cap: 0, ratio_percent: 0, target_types: [] },
  comment: { enabled: false, daily_cap: 2 },
};
function operationSettings(account) {
  const saved = account?.operation_settings || {};
  return {
    browse: { ...operationBrowseDefaults, ...saved.browse_defaults },
    interaction: Object.fromEntries(
      Object.entries(operationRuleDefaults).map(([key, value]) => [
        key,
        { ...value, ...saved.interaction?.[key] },
      ]),
    ),
  };
}
function operationLabel(status) {
  return (
    {
      planned: "待确认",
      waiting: "排队中",
      queued: "准备启动",
      preparing: "核对账号",
      running: "执行中",
      cancelling: "停止中",
      cancelled: "已取消",
      completed: "手机回执完成",
      success: "手机回执完成",
      pending: "未派发",
      unknown: "结果不明，待对账",
      interrupted: "已中断",
      error: "执行失败",
      stopped_unverified: "已停止，待核验",
      operator_verified: "人工核验完成",
    }[status] || statusLabel(status)
  );
}

function operationTime(value, timezone) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone || "UTC",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}
function OperationNumber({ label, value, onChange, disabled, min = 0, max }) {
  return h(
    "label",
    { className: "xhs-field" },
    h("div", { className: "xhs-label" }, label),
    h("input", {
      className: "xhs-input",
      type: "number",
      step: 1,
      min,
      max,
      value: value ?? "",
      disabled,
      onChange: (event) =>
        onChange(event.target.value === "" ? "" : Number(event.target.value)),
    }),
  );
}
function OperationRules({
  value,
  onChange,
  disabled,
  prefix,
  includeComment = false,
}) {
  return h(
    "div",
    { className: "xhs-grid" },
    ["like", "collect", "follow", ...(includeComment ? ["comment"] : [])].map(
      (kind) => {
        const label = {
          like: "点赞",
          collect: "收藏",
          follow: "关注",
          comment: "评论",
        }[kind];
        const rule = value[kind] || operationRuleDefaults[kind];
        const change = (key, item) =>
          onChange({ ...value, [kind]: { ...rule, [key]: item } });
        return h(
          "fieldset",
          { key: kind, className: "xhs-card" },
          h("legend", null, prefix + label),
          h(
            "label",
            null,
            h("input", {
              type: "checkbox",
              checked: Boolean(rule.enabled),
              disabled,
              onChange: (event) => change("enabled", event.target.checked),
            }),
            " 启用" + label,
          ),
          h(OperationNumber, {
            label: prefix + label + "每日上限",
            value: rule.daily_cap,
            max: kind === "comment" ? 5 : 50,
            disabled,
            onChange: (item) => change("daily_cap", item),
          }),
          kind !== "comment" &&
            h(OperationNumber, {
              label: prefix + label + "比例（%）",
              value: rule.ratio_percent,
              max: 100,
              disabled,
              onChange: (item) => change("ratio_percent", item),
            }),
          ["like", "collect"].includes(kind) &&
            h(Select, {
              label: prefix + label + "限定",
              value: rows(rule.target_types).join(","),
              disabled,
              onChange: (item) =>
                change("target_types", item ? item.split(",") : []),
              options: [
                ["", "不限"],
                ["core,extended", "仅核心与扩展兴趣内容"],
                ["core", "仅核心兴趣内容"],
              ],
            }),
          kind === "follow" &&
            h(Field, {
              label: prefix + "允许关注的对象类型",
              value: rows(rule.target_types).join("，"),
              disabled,
              onChange: (item) => change("target_types", listInput(item)),
            }),
        );
      },
    ),
  );
}
function OperationPlanEditor({ plan, index, onChange, disabled }) {
  const title = "第" + (plan.segment?.index || index + 1) + "段";
  const keywords = rows(plan.keywords);
  const changeKeyword = (position, key, value) =>
    onChange({
      ...plan,
      keywords: keywords.map((row, current) =>
        current === position ? { ...row, [key]: value } : row,
      ),
    });
  return h(
    "fieldset",
    { className: "xhs-card" },
    h("legend", null, title + "计划"),
    rows(plan.rationale).map((line, position) =>
      h("p", { className: "xhs-meta", key: position }, line),
    ),
    keywords.map((row, position) =>
      h(
        "div",
        { className: "xhs-card", key: position },
        h(Field, {
          label: title + "关键词" + (position + 1),
          value: row.keyword,
          disabled,
          onChange: (item) => changeKeyword(position, "keyword", item),
        }),
        h(OperationNumber, {
          label: title + "关键词" + (position + 1) + "篇数",
          value: row.count,
          min: 1,
          max: 8,
          disabled,
          onChange: (item) => changeKeyword(position, "count", item),
        }),
        h(
          Button,
          {
            disabled,
            onClick: () =>
              onChange({
                ...plan,
                keywords: keywords.filter((_, current) => current !== position),
              }),
          },
          "移除关键词",
        ),
      ),
    ),
    h(
      Button,
      {
        disabled: disabled || keywords.length >= 8,
        onClick: () =>
          onChange({
            ...plan,
            keywords: [...keywords, { keyword: "", count: 1 }],
          }),
      },
      "添加关键词",
    ),
    h(
      "div",
      { className: "xhs-grid" },
      h(OperationNumber, {
        label: title + "首页篇数",
        value: plan.home_feed_count,
        max: 12,
        disabled,
        onChange: (item) => onChange({ ...plan, home_feed_count: item }),
      }),
      h(OperationNumber, {
        label: title + "最少停留秒数",
        value: plan.dwell_sec_min,
        min: 5,
        max: 60,
        disabled,
        onChange: (item) => onChange({ ...plan, dwell_sec_min: item }),
      }),
      h(OperationNumber, {
        label: title + "最多停留秒数",
        value: plan.dwell_sec_max,
        min: 5,
        max: 120,
        disabled,
        onChange: (item) => onChange({ ...plan, dwell_sec_max: item }),
      }),
    ),
    h(OperationRules, {
      prefix: title,
      value: plan.interaction,
      disabled,
      onChange: (interaction) => onChange({ ...plan, interaction }),
    }),
  );
}
function OperationsPanel({ snapshot, host, readOnly, refresh }) {
  const accounts = rows(snapshot.data?.accounts);
  const allDays = rows(snapshot.data?.operation_days);
  const clock = snapshot.data?.operation_clock || {};
  const [accountId, setAccountId] = useState("");
  const account = accounts.find((item) => item.id === accountId);
  const days = allDays.filter((item) => item.account_id === accountId);
  const todayPlan = [...days]
    .reverse()
    .find((item) => item.date === clock.date);
  const [selectedId, setSelectedId] = useState("");
  const day = days.find((item) => item.id === selectedId);
  const [settings, setSettings] = useState(() => operationSettings(null));
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [plans, setPlans] = useState([]);
  const [planDirty, setPlanDirty] = useState(false);
  const [prechecked, setPrechecked] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const clearCheck = () => {
    setPrechecked(null);
    setAcknowledged(false);
  };
  useEffect(() => {
    setSettings(operationSettings(account));
    setSettingsDirty(false);
  }, [accountId, account?.operation_settings?.version]);
  useEffect(() => {
    setSelectedId(
      [...days].reverse().find((item) => item.date === clock.date)?.id || "",
    );
  }, [accountId]);
  useEffect(() => {
    setPlans(JSON.parse(JSON.stringify(day?.plans || [])));
    setPlanDirty(false);
  }, [day?.id, day?.version]);
  useEffect(clearCheck, [
    accountId,
    account?.version,
    account?.operation_settings?.version,
    day?.id,
    day?.version,
    day?.status,
    snapshot.license?.version,
  ]);
  const call = async (command, payload) => {
    const result = await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({ command, payload }),
    });
    await refresh();
    return result;
  };
  const editSettings = (patch) => {
    setSettings({ ...settings, ...patch });
    setSettingsDirty(true);
    clearCheck();
  };
  const saveSettings = async () => {
    await call("ops.configure", {
      account_id: account.id,
      account_version: account.version,
      version: account.operation_settings?.version || 0,
      browse_defaults: settings.browse,
      interaction: settings.interaction,
    });
    setSettingsDirty(false);
  };
  const suggest = async () => {
    const result = await call("ops.save", {
      account_id: account.id,
      account_version: account.version,
      date: clock.date,
      browse_defaults: settings.browse,
      interaction: settings.interaction,
      ...(todayPlan ? { id: todayPlan.id, version: todayPlan.version } : {}),
      ...(todayPlan?.status === "completed" ? { new_round: true } : {}),
    });
    const saved = [...rows(result.data?.operation_days)]
      .reverse()
      .find(
        (item) => item.account_id === accountId && item.date === clock.date,
      );
    if (saved) setSelectedId(saved.id);
    clearCheck();
  };
  const savePlans = async () => {
    await call("ops.save", {
      account_id: account.id,
      account_version: account.version,
      date: day.date,
      id: day.id,
      version: day.version,
      plans,
      browse_defaults: day.browse_defaults,
      interaction: day.interaction,
    });
    setPlanDirty(false);
    clearCheck();
  };
  const precheck = async () => {
    const result = await call("ops.precheck", {
      id: day.id,
      version: day.version,
    });
    const checked = rows(result.data?.operation_days).find(
      (item) => item.id === day.id,
    );
    setPrechecked(checked || null);
    setAcknowledged(false);
  };
  const start = async () => {
    await call("ops.start", {
      id: prechecked.id,
      version: prechecked.version,
      confirm_digest: prechecked.precheck.digest,
      confirmed: true,
    });
    clearCheck();
  };
  const reconcile = async () => {
    const reference = window.prompt(
      "请记录如何确认手机任务已停止。此操作不会把结果不明的互动记为成功。",
    );
    if (!reference?.trim()) return;
    await call("ops.reconcile", {
      id: day.id,
      version: day.version,
      reference: reference.trim(),
      confirmed: true,
    });
    clearCheck();
  };
  const dayRuns = rows(snapshot.data?.runs).filter(
    (run) => run.kind === "nurture" && run.day_id === day?.id,
  );
  const active = dayRuns.some((run) =>
    ["queued", "preparing", "running", "cancelling"].includes(run.status),
  );
  const editable = day?.status === "planned" && !readOnly;
  const checkable =
    day &&
    ["planned", "interrupted", "stopped_unverified"].includes(day.status) &&
    day.date === clock.date &&
    !readOnly &&
    !settingsDirty &&
    !planDirty;
  const canSuggest =
    !readOnly &&
    account &&
    clock.date &&
    !settingsDirty &&
    (!todayPlan || ["planned", "completed"].includes(todayPlan.status));
  return h(
    "div",
    null,
    h(
      "p",
      { className: "xhs-meta" },
      "服务器日期 " +
        text(clock.date) +
        " · 时区 " +
        text(clock.timezone) +
        "。每段先只读核对小红薯号；同一手机串行，登录或账号不符时停止，不自动切换账号。",
    ),
    h(
      "label",
      { className: "xhs-field" },
      "运营账号",
      h(
        "select",
        {
          className: "xhs-select",
          value: accountId,
          onChange: (event) => setAccountId(event.target.value),
        },
        h("option", { value: "" }, "选择运营账号"),
        accounts.map((item) =>
          h("option", { key: item.id, value: item.id }, item.name || item.id),
        ),
      ),
    ),
    !account
      ? h(
          "p",
          { className: "xhs-empty" },
          "选择已绑定手机并完成准备或接管的账号。",
        )
      : h(
          React.Fragment,
          null,
          h(
            "div",
            { className: "xhs-card" },
            h("h3", null, "账号日常预算"),
            h(
              "p",
              { className: "xhs-meta" },
              "先保存预算，再生成计划。每段互动上限同时受账号日预算和已用量约束；评论仅在评论页审核后发送。",
            ),
            h(
              "div",
              { className: "xhs-grid" },
              [
                ["daily_target_posts", "每日浏览目标", 0, 150],
                ["daily_segments", "每日分段数", 1, 3],
                ["search_ratio_percent", "搜索占比（%）", 0, 100],
                ["posts_per_keyword", "按词模式每词篇数", 1, 8],
                ["home_feed_count", "按词模式首页篇数", 0, 12],
                ["dwell_sec_min", "默认最少停留秒数", 5, 60],
                ["dwell_sec_max", "默认最多停留秒数", 5, 120],
                ["home_open_percent", "首页点开比例（%）", 5, 100],
                ["open_gap_sec_min", "两次点开最少间隔秒数", 2, 60],
                ["open_gap_sec_max", "两次点开最多间隔秒数", 2, 120],
              ].map(([key, label, min, max]) =>
                h(OperationNumber, {
                  key,
                  label,
                  min,
                  max,
                  value: settings.browse[key],
                  disabled: readOnly,
                  onChange: (item) =>
                    editSettings({
                      browse: { ...settings.browse, [key]: item },
                    }),
                }),
              ),
            ),
            h(Select, {
              label: "预算来源",
              value: account.operation_settings?.source || "account",
              disabled: readOnly,
              onChange: async (source) => {
                await call("ops.configure", {
                  account_id: account.id,
                  account_version: account.version,
                  version: account.operation_settings?.version || 0,
                  browse_defaults: settings.browse,
                  interaction: settings.interaction,
                  source,
                });
                setSettingsDirty(false);
              },
              options: [
                ["account", "本账号单独设置"],
                ["project", "沿用项目默认"],
              ],
            }),
            h(OperationRules, {
              prefix: "账号",
              value: settings.interaction,
              includeComment: true,
              disabled: readOnly,
              onChange: (interaction) => editSettings({ interaction }),
            }),
            h(
              "div",
              { className: "xhs-actions" },
              h(
                Button,
                { disabled: readOnly || !settingsDirty, onClick: saveSettings },
                "保存运营预算",
              ),
              h(
                Button,
                {
                  disabled:
                    readOnly ||
                    account.operation_settings?.source === "project",
                  onClick: async () => {
                    await call("ops.configure", {
                      account_id: account.id,
                      account_version: account.version,
                      version: account.operation_settings?.version || 0,
                      browse_defaults: settings.browse,
                      interaction: settings.interaction,
                      save_as_project_default: true,
                    });
                    setSettingsDirty(false);
                    toast("已另存为项目默认，沿用项目默认的账号同时更新");
                  },
                },
                "另存为项目默认",
              ),
              h(
                Button,
                { primary: true, disabled: !canSuggest, onClick: suggest },
                todayPlan?.status === "completed"
                  ? "新建下一轮"
                  : "生成今日计划",
              ),
            ),
            settingsDirty &&
              h("p", { className: "xhs-meta" }, "预算有未保存的修改。"),
          ),
          h(
            Card,
            {
              title: "目标完成量与异常处理",
              tip: "这些是停止规则。遇到异常就停下并记录，不换设备、不绕过平台提示。这里的两项和上面的预算一起保存。",
            },
            h(
              "div",
              { className: "xhs-3" },
              h(Field, {
                label: "本次目标完成量",
                disabled: true,
                onChange: () => undefined,
                value: (() => {
                  const total = Math.round(
                    settings.browse.daily_target_posts /
                      Math.max(1, settings.browse.daily_segments),
                  );
                  const search = Math.round(
                    (total * settings.browse.search_ratio_percent) / 100,
                  );
                  return `每段约 ${total} 篇（搜索 ${search} + 首页 ${
                    total - search
                  }）`;
                })(),
              }),
              h(Select, {
                label: "完成不足时",
                value: settings.browse.shortfall,
                disabled: readOnly,
                onChange: (shortfall) =>
                  editSettings({ browse: { ...settings.browse, shortfall } }),
                options: [
                  ["record", "记为未完成，不补刷"],
                  ["topup", "下一段补到目标的 80%"],
                ],
              }),
              h(Select, {
                label: "同一分段连续异常",
                value: String(settings.browse.anomaly_stop_after),
                disabled: readOnly,
                onChange: (value) =>
                  editSettings({
                    browse: {
                      ...settings.browse,
                      anomaly_stop_after: Number(value),
                    },
                  }),
                options: [
                  ["2", "2 次即停止这一段"],
                  ["3", "3 次即停止这一段"],
                ],
              }),
            ),
            h(Table, {
              head: ["异常", "系统怎么处理", "之后"],
              body: [
                [
                  "账号受限或平台提示",
                  h(
                    "span",
                    null,
                    h(Lock),
                    " 立即停止，暂停该账号全部自动任务至少 72 小时",
                  ),
                  "本人查看平台通知，人工确认后恢复；不重试、不换设备",
                ],
                [
                  "需要登录或验证码",
                  h("span", null, h(Lock), " 立即停止，暂停这台手机的队列"),
                  "本人在手机处理后重新核对身份",
                ],
                [
                  "搜索无结果",
                  "跳过这个关键词，继续下一个",
                  "复盘里提示替换关键词",
                ],
                ["内容不匹配", "跳过这一篇，不互动", "复盘里提示调整兴趣池"],
                [
                  "执行中断",
                  "不重放已完成的块，结果不明先对账",
                  "对账后继续未派发的部分",
                ],
              ],
            }),
          ),
          h(
            "label",
            { className: "xhs-field" },
            "日常计划",
            h(
              "select",
              {
                className: "xhs-select",
                value: selectedId,
                onChange: (event) => {
                  setSelectedId(event.target.value);
                  clearCheck();
                },
              },
              h("option", { value: "" }, "选择计划"),
              [...days]
                .reverse()
                .map((item) =>
                  h(
                    "option",
                    { key: item.id, value: item.id },
                    item.date +
                      " · 第" +
                      (item.round || 1) +
                      "轮 · " +
                      operationLabel(item.status),
                  ),
                ),
            ),
          ),
          day &&
            h(
              "div",
              { className: "xhs-card" },
              h("h3", null, day.date + " · 第" + (day.round || 1) + "轮"),
              h(
                "p",
                null,
                "目标小红薯号：" +
                  text(day.account_snapshot?.platform_account_id) +
                  " · 手机：" +
                  text(day.account_snapshot?.device_id),
              ),
              h(
                "p",
                null,
                operationLabel(day.status) +
                  (day.status === "completed"
                    ? day.target_met
                      ? " · 达到计划"
                      : " · 未达到计划"
                    : ""),
              ),
              plans.map((plan, index) =>
                h(OperationPlanEditor, {
                  key: index,
                  plan,
                  index,
                  disabled: !editable,
                  onChange: (item) => {
                    setPlans(
                      plans.map((row, position) =>
                        position === index ? item : row,
                      ),
                    );
                    setPlanDirty(true);
                    clearCheck();
                  },
                }),
              ),
              h(
                "div",
                { className: "xhs-actions" },
                h(
                  Button,
                  { disabled: !editable || !planDirty, onClick: savePlans },
                  "保存编辑后的计划",
                ),
                h(
                  Button,
                  { disabled: !checkable, onClick: precheck },
                  day.status === "planned" ? "预检当前计划" : "预检未执行部分",
                ),
                ["queued", "interrupted"].includes(day.status) &&
                  !active &&
                  h(Button, { onClick: reconcile }, "确认本日手机任务已停止"),
              ),
              planDirty &&
                h(
                  "p",
                  { className: "xhs-meta" },
                  "计划有未保存修改，先保存再预检。",
                ),
              h(
                "p",
                { className: "xhs-meta" },
                "恢复只继续未派发的分段或块；已完成块不重放，结果不明先对账。",
              ),
            ),
          prechecked?.precheck &&
            h(
              "div",
              { className: "xhs-card", style: { borderColor: C.red } },
              h("h3", null, "确认日常运营"),
              h(
                "p",
                { className: "xhs-meta" },
                "确认摘要：" + prechecked.precheck.digest,
              ),
              h(
                "p",
                { className: "xhs-meta" },
                "有效至 " +
                  operationTime(
                    prechecked.precheck.expires_at,
                    clock.timezone,
                  ) +
                  " · 许可版本 " +
                  prechecked.precheck.license_version,
              ),
              rows(prechecked.precheck.resume_run_ids).length > 0 &&
                h(
                  "p",
                  null,
                  "本次恢复 " +
                    prechecked.precheck.resume_run_ids.length +
                    " 个含未派发块的分段。",
                ),
              h(
                "label",
                null,
                h("input", {
                  type: "checkbox",
                  checked: acknowledged,
                  onChange: (event) => setAcknowledged(event.target.checked),
                }),
                "我已核对目标小红薯号、手机、每段计划与互动预算",
              ),
              h(
                "div",
                { className: "xhs-actions" },
                h(
                  Button,
                  {
                    primary: true,
                    disabled: readOnly || !acknowledged,
                    onClick: start,
                  },
                  "确认启动日常运营",
                ),
                h(Button, { onClick: clearCheck }, "返回检查"),
              ),
            ),
          dayRuns.map((run) =>
            h(
              "div",
              { className: "xhs-card", key: run.id },
              h(
                "h3",
                null,
                "分段 " +
                  (run.segment?.index || 1) +
                  " · " +
                  operationLabel(run.status),
              ),
              run.error &&
                h("p", { className: "xhs-danger" }, statusLabel(run.error)),
              run.identity_evidence_url &&
                h(PrivateEvidence, {
                  host,
                  url: run.identity_evidence_url,
                  label: "查看账号核对截图",
                }),
              rows(run.chunks).map((chunk) =>
                h(
                  "div",
                  { className: "xhs-card", key: chunk.index },
                  h(
                    "strong",
                    null,
                    (chunk.mode === "home"
                      ? "首页推荐流"
                      : "搜索「" + text(chunk.keyword) + "」") +
                      " · " +
                      operationLabel(chunk.status),
                  ),
                  h(
                    "p",
                    null,
                    "计划 " +
                      chunk.planned +
                      " 篇 · " +
                      (chunk.status === "completed"
                        ? "手机回执浏览 " + chunk.browsed + " 篇"
                        : "尚无有效完成回执"),
                  ),
                  chunk.status === "completed" &&
                    h(
                      "p",
                      { className: "xhs-meta" },
                      "手机回执：点赞 " +
                        (chunk.interactions?.like || 0) +
                        " / 收藏 " +
                        (chunk.interactions?.collect || 0) +
                        " / 关注 " +
                        (chunk.interactions?.follow || 0) +
                        (chunk.verification_status === "pending"
                          ? " · 平台互动核验待进行"
                          : " · 浏览与停留未独立核验"),
                    ),
                  chunk.status !== "completed" &&
                    chunk.quota &&
                    h(
                      "p",
                      { className: "xhs-meta" },
                      "已派发上限仍保留预算，不计作实际互动。",
                    ),
                  chunk.evidence_url &&
                    h(PrivateEvidence, {
                      host,
                      url: chunk.evidence_url,
                      label: "查看分块截图",
                    }),
                ),
              ),
              [
                "queued",
                "waiting",
                "preparing",
                "running",
                "cancelling",
              ].includes(run.status) &&
                h(
                  Button,
                  {
                    danger: true,
                    disabled: run.status === "cancelling",
                    onClick: () => call("run.cancel", { run_id: run.id }),
                  },
                  "停止此分段",
                ),
            ),
          ),
        ),
  );
}

function ReportNote({ runId, note, host, readOnly, refresh }) {
  const [value, setValue] = useState(note?.notes || "");
  const [version, setVersion] = useState(note?.version || 0);
  useEffect(() => {
    setValue(note?.notes || "");
    setVersion(note?.version || 0);
  }, [runId]);
  const save = async () => {
    const result = await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({
        command: "run.note",
        payload: { run_id: runId, notes: value, version },
      }),
    });
    const saved = rows(result.data?.run_notes).find(
      (item) => item.run_id === runId,
    );
    setVersion(saved?.version ?? version + 1);
    setValue(saved?.notes ?? value);
    await refresh();
  };
  return h(
    "div",
    null,
    h(Field, {
      label: "运营备注 · " + runId,
      value,
      multiline: true,
      disabled: readOnly,
      onChange: setValue,
    }),
    value.length > 4000 &&
      h("p", { className: "xhs-danger" }, "运营备注最多4000字。"),
    h(
      "div",
      { className: "xhs-actions" },
      h(
        Button,
        {
          disabled:
            readOnly ||
            value.length > 4000 ||
            (value === (note?.notes || "") && version === (note?.version || 0)),
          onClick: save,
        },
        "保存运营备注",
      ),
      version !== (note?.version || 0) &&
        h(
          Button,
          {
            onClick: () => {
              setValue(note?.notes || "");
              setVersion(note?.version || 0);
            },
          },
          "载入最新备注",
        ),
    ),
  );
}
const ANOMALY_LABELS = {
  no_results: "搜索无结果",
  phone_required: "需要在手机上处理",
  load_failed: "页面加载失败",
  content_mismatch: "内容不匹配",
  interrupted: "执行中断",
  login_required: "需要登录",
  account_restricted: "账号受限",
  rate_limited: "频率限制",
};
const ANOMALY_HANDLING = {
  no_results: "已跳过这个关键词",
  load_failed: "重试一次，仍失败则跳过",
  content_mismatch: "已跳过，不互动",
  interrupted: "停止分段，对账后未补跑",
  rate_limited: "停下，等下一个时段",
};
function ReportPanel({ snapshot, host, readOnly, refresh, go }) {
  const source = snapshot.data?.reports;
  const [days, setDays] = useState(7);
  const [projectId, setProjectId] = useState("");
  const [selected, setSelected] = useState(null);
  const [migrationSource, setMigrationSource] = useState("");
  const [migrationAssetRoot, setMigrationAssetRoot] = useState("");
  const [migrationReport, setMigrationReport] = useState(null);
  useEffect(() => setSelected(null), [projectId, days]);
  const runMigrationDryRun = async () => {
    const response = await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({
        command: "migration.dry_run",
        payload: { source_json: migrationSource || undefined },
      }),
    });
    setMigrationReport(rows(response.data?.migration_imports).at(-1) || null);
    await refresh();
  };
  const runMigrationImport = async () => {
    if (!migrationReport?.source_sha256 || !migrationSource) return;
    if (
      !window.confirm(
        "导入只写入本地历史记录；活动运行会转为结果不明，设备需要重新绑定，不会派发手机任务。确认继续？",
      )
    )
      return;
    await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({
        command: "migration.import",
        payload: {
          source_json: migrationSource,
          source_sha256: migrationReport.source_sha256,
          asset_roots: migrationAssetRoot.trim()
            ? [migrationAssetRoot.trim()]
            : undefined,
          confirmed: true,
        },
      }),
    });
    await refresh();
  };
  const pushOutbox = async () => {
    await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({ command: "sync.outbox.push", payload: {} }),
    });
    await refresh();
  };
  const scoped = projectId ? source?.projects?.[projectId] : source;
  const report = scoped?.windows?.[String(days)] || scoped;
  if (!report)
    return h("div", { className: "xhs-empty" }, "暂无可用复盘数据。");
  const accounts = rows(report.accounts);
  const knownAccounts = rows(snapshot.data?.accounts);
  const accountName = (id) =>
    knownAccounts.find((item) => item.id === id)?.name ||
    "账号" +
      (rows(source.accounts).findIndex((item) => item.account_id === id) + 1);
  const projects = Object.keys(source.projects || {});
  const projectName = (id) =>
    rows(snapshot.data?.projects).find((item) => item.id === id)?.name ||
    "项目" + (projects.indexOf(id) + 1);
  const selectedCell =
    selected &&
    accounts
      .find((item) => item.account_id === selected.accountId)
      ?.cells.find((cell) => cell.date === selected.date);
  const runIndex = new Map(
    rows(snapshot.data?.runs).map((run) => [run.id, run]),
  );
  const noteIndex = new Map(
    rows(snapshot.data?.run_notes).map((note) => [note.run_id, note]),
  );
  return h(
    "div",
    null,
    h("h3", null, "运营复盘"),
    h(
      "div",
      { className: "xhs-card", style: { marginBottom: 12 } },
      h("h3", null, "同步与历史导入演练"),
      h(
        "p",
        { className: "xhs-meta" },
        `本地审计 outbox：${
          rows(snapshot.data?.audit_outbox).length
        } 条待同步；dry-run 不派发手机任务、不修改平台。`,
      ),
      hasFeature(snapshot.license, "xhs.ops") &&
        h(
          "div",
          null,
          h("textarea", {
            className: "xhs-textarea",
            style: { minHeight: 70 },
            value: migrationSource,
            onChange: (event) => setMigrationSource(event.target.value),
            placeholder:
              "粘贴 xhs-ops.json（可选；留空会明确报告未发现源文件）",
            disabled: readOnly,
          }),
          h("input", {
            className: "xhs-input",
            value: migrationAssetRoot,
            onChange: (event) => setMigrationAssetRoot(event.target.value),
            placeholder:
              "可选素材根目录；源文件移动后按唯一文件名恢复，例如 /Volumes/CloneData/workspace/tabby/.tmp",
            disabled: readOnly,
          }),
          h(
            "div",
            { className: "xhs-actions" },
            h(
              Button,
              {
                onClick: pushOutbox,
                disabled:
                  readOnly || !hasFeature(snapshot.license, "xhs.analytics"),
              },
              "同步审计 outbox",
            ),
            h(
              Button,
              { onClick: runMigrationDryRun, disabled: readOnly },
              "生成导入 dry-run 报告",
            ),
          ),
        ),
      migrationReport &&
        h(
          "pre",
          {
            className: "xhs-meta",
            style: { whiteSpace: "pre-wrap", marginTop: 8 },
          },
          JSON.stringify(
            {
              status: migrationReport.status,
              source_sha256: migrationReport.source_sha256,
              counts: migrationReport.counts,
              conflicts: migrationReport.conflicts,
              will_dispatch: migrationReport.will_dispatch,
            },
            null,
            2,
          ),
        ),
      migrationReport?.source_sha256 &&
        migrationReport.status !== "source_not_found" &&
        h(
          Button,
          { onClick: runMigrationImport, disabled: readOnly },
          "确认导入本地历史",
        ),
    ),
    h(
      "p",
      { className: "xhs-meta" },
      report.dates[0] +
        " — " +
        report.date +
        " · " +
        report.timezone +
        "。统计来自有效手机回执；独立平台互动核验：未知。未决块不计作实际互动或确定诊断。",
    ),
    h(
      "div",
      { className: "xhs-actions" },
      [7, 14, 30].map((value) =>
        h(
          Button,
          {
            key: value,
            primary: days === value,
            onClick: () => setDays(value),
          },
          "最近" + value + "天",
        ),
      ),
    ),
    h(
      "label",
      { className: "xhs-field" },
      "复盘项目",
      h(
        "select",
        {
          className: "xhs-select",
          value: projectId,
          onChange: (event) => setProjectId(event.target.value),
        },
        h("option", { value: "" }, "全部项目"),
        projects.map((id) =>
          h("option", { key: id, value: id }, projectName(id)),
        ),
      ),
    ),
    h(
      "div",
      { className: "xhs-grid" },
      [
        ["runs", "计划任务数"],
        ["planned", "计划篇数"],
        ["browsed", "手机回执浏览"],
        ["like", "手机回执点赞"],
        ["collect", "手机回执收藏"],
        ["follow", "手机回执关注"],
        ["unresolved_chunks", "未决块"],
      ].map(([key, label]) =>
        h(
          "div",
          { className: "xhs-card", key },
          h("div", { className: "xhs-meta" }, label),
          h("strong", null, report.totals[key] ?? 0),
        ),
      ),
    ),
    h(
      "div",
      { className: "xhs-card", style: { minWidth: 0, marginTop: 12 } },
      h("h3", null, "账号 × 日期"),
      h(
        "div",
        { style: { overflowX: "auto" } },
        h(
          "table",
          {
            style: { minWidth: 680, width: "100%", borderCollapse: "collapse" },
          },
          h(
            "caption",
            { className: "xhs-meta" },
            "每格为手机回执浏览 / 计划篇数；点击查看该日记录",
          ),
          h(
            "thead",
            null,
            h(
              "tr",
              null,
              h("th", { scope: "col" }, "账号"),
              rows(report.dates).map((date) =>
                h("th", { scope: "col", key: date }, date.slice(5)),
              ),
            ),
          ),
          h(
            "tbody",
            null,
            accounts.map((account) =>
              h(
                "tr",
                { key: account.account_id },
                h(
                  "th",
                  { scope: "row" },
                  accountName(account.account_id) +
                    (account.exists ? "" : "（历史账号）"),
                ),
                rows(account.cells).map((cell) =>
                  h(
                    "td",
                    {
                      key: cell.date,
                      style: { padding: 5, textAlign: "center" },
                    },
                    cell.runs
                      ? h(
                          "button",
                          {
                            className: "xhs-btn",
                            "aria-label":
                              accountName(account.account_id) +
                              " " +
                              cell.date +
                              " 运行明细",
                            onClick: () =>
                              setSelected({
                                accountId: account.account_id,
                                date: cell.date,
                              }),
                          },
                          cell.browsed + " / " + cell.planned,
                          cell.unresolved_chunks ? " · 有未决块" : "",
                        )
                      : "—",
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    selectedCell &&
      h(
        "div",
        { className: "xhs-card" },
        h("h3", null, accountName(selected.accountId) + " · " + selected.date),
        h(
          "p",
          { className: "xhs-meta" },
          "未决块 " +
            selectedCell.unresolved_chunks +
            " · 已验证手机回执块 " +
            selectedCell.receipt_chunks,
        ),
        rows(selectedCell.run_ids).map((runId) => {
          const run = runIndex.get(runId) || { id: runId };
          const chunks = rows(run.chunks).filter(
            (chunk) =>
              chunk.status === "completed" &&
              chunk.result_basis === "validated_phone_receipt" &&
              chunk.evidence_url,
          );
          return h(
            "div",
            { className: "xhs-card", key: runId },
            h("strong", null, runId + " · " + operationLabel(run.status)),
            chunks.map((chunk, index) =>
              h(
                "div",
                { key: index },
                chunk.observation &&
                  h(
                    "p",
                    { style: { whiteSpace: "pre-wrap" } },
                    chunk.observation,
                  ),
              ),
            ),
            h(ReportNote, {
              runId,
              note: noteIndex.get(runId),
              host,
              readOnly,
              refresh,
            }),
          );
        }),
        h(Button, { onClick: () => setSelected(null) }, "关闭明细"),
      ),
    h(
      "div",
      { className: "xhs-card", style: { marginTop: 12 } },
      h("h3", null, "关键词表现"),
      rows(report.keywords).length
        ? rows(report.keywords).map((keyword) =>
            h(
              "div",
              { className: "xhs-row", key: keyword.keyword },
              h(
                "div",
                null,
                h("strong", null, keyword.keyword),
                h(
                  "p",
                  { className: "xhs-meta" },
                  "回执浏览 " +
                    keyword.browsed +
                    " / 计划 " +
                    keyword.planned +
                    " · 回执互动 " +
                    keyword.interactions +
                    " · 未决块 " +
                    keyword.unresolved_chunks,
                ),
              ),
              h(
                "span",
                { className: "xhs-pill" },
                {
                  good: "正常",
                  watch: "观察",
                  adjust: "建议调整",
                  unknown: "证据未齐",
                }[keyword.verdict],
              ),
            ),
          )
        : h("p", { className: "xhs-meta" }, "此范围暂无搜索回执。"),
      h("h3", { style: { marginTop: 14 } }, "首页与异常"),
      h(
        Row,
        { title: "首页回执浏览" },
        h(
          "span",
          { className: "xhs-meta" },
          `${report.home.browsed} 篇 · 回执互动 ${report.home.interactions} · 有效观察 ${report.home.observations} 次`,
        ),
      ),
      ["login_required", "rate_limited"].map((type) => {
        const item = rows(report.anomalies).find((a) => a.type === type);
        return h(
          Row,
          {
            key: type,
            title: type === "login_required" ? "登录失效" : "频率限制",
          },
          h(
            "span",
            { className: "xhs-meta" },
            item
              ? `${item.count} 次 · ${String(item.latest?.date || "").slice(
                  5,
                )} ${accountName(item.latest?.account_id)}`
              : "0 次",
          ),
        );
      }),
    ),
    h(
      Card,
      {
        title: `异常记录 · 近 ${days} 天`,
        icon: "异常记录 · 近 7 天",
        style: { marginTop: 12 },
      },
      h(Table, {
        head: ["异常", "次数", "账号", "处理结果"],
        body: rows(report.anomalies).map((item) => [
          ANOMALY_LABELS[item.type] || statusLabel(item.type),
          item.count,
          item.latest?.account_id ? accountName(item.latest.account_id) : "—",
          ["login_required", "account_restricted"].includes(item.type)
            ? pill("已暂停，待本人处理", "bad", true)
            : ANOMALY_HANDLING[item.type] || "已记录，未自动处理",
        ]),
        empty: "这段时间没有异常记录",
      }),
    ),
    h(
      Card,
      {
        title: "根据记录调整下一轮",
        tip: "这里只给出依据和入口；改兴趣池、改画像和新建下一轮都由你确认。",
        style: { marginTop: 12 },
      },
      rows(report.keywords)
        .filter(
          (k) =>
            k.verdict === "adjust" &&
            !rows(snapshot.data.dismissed_alerts).includes("kw:" + k.keyword),
        )
        .map((k) =>
          h(
            Row,
            {
              key: k.keyword,
              title: `关键词“${k.keyword}”回执偏少`,
              sub: `计划 ${k.planned} 篇 · 回执 ${k.browsed} 篇 · 互动 ${k.interactions} 次`,
            },
            (() => {
              const owner = rows(snapshot.data.accounts).find((a) =>
                rows(a.interest_pool?.core).includes(k.keyword),
              );
              const next =
                owner &&
                rows(owner.interest_pool?.extended).find(
                  (word) =>
                    !rows(report.keywords).some((x) => x.keyword === word),
                );
              return next
                ? h(
                    Button,
                    {
                      primary: true,
                      disabled: readOnly,
                      onClick: async () => {
                        await send(host, "pool.replace_keyword", {
                          account_id: owner.id,
                          from: k.keyword,
                          to: next,
                        });
                        toast(`已把“${k.keyword}”换成“${next}”`);
                        await refresh();
                      },
                    },
                    `替换为“${next}”`,
                  )
                : h(
                    Button,
                    { primary: true, onClick: () => go("build", "profile") },
                    "换一个关键词",
                  );
            })(),
            h(
              Button,
              {
                disabled: readOnly,
                onClick: async () => {
                  await send(host, "alert.dismiss", { id: "kw:" + k.keyword });
                  await refresh();
                },
              },
              "保留",
            ),
          ),
        ),
      snapshot.data.coldstart_observation &&
        h(
          Row,
          {
            title: snapshot.data.coldstart_observation.note || "运营观察",
            sub: `${
              {
                closer: "推荐更接近目标",
                slightly: "略有接近",
                same: "没有变化",
                away: "偏离目标",
              }[snapshot.data.coldstart_observation.drift] || ""
            } · 运营观察`,
          },
          h(Button, { onClick: () => go("build", "profile") }, "调整兴趣池"),
        ),
      h(
        Row,
        {
          title: "目标画像",
          sub: rows(report.keywords).some((k) => k.verdict === "adjust")
            ? "有关键词回执偏少，可以检查画像里的垂直兴趣"
            : `近 ${days} 天没有需要修改的信号`,
        },
        h(Button, { onClick: () => go("build", "projects") }, "编辑画像"),
      ),
      h(
        "div",
        { className: "xhs-actions" },
        h(
          Button,
          { primary: true, onClick: () => go("nurture", "operations") },
          "应用调整并新建下一轮",
        ),
      ),
    ),
  );
}

function RunPanel({ snapshot, host, readOnly, refresh, license }) {
  const runs = rows(snapshot.data && snapshot.data.runs);
  const accounts = rows(snapshot.data && snapshot.data.accounts);
  const drafts = rows(snapshot.data && snapshot.data.drafts);
  const [accountId, setAccountId] = useState("");
  const [draftId, setDraftId] = useState("");
  const kinds = [
    { id: "publish", label: "发布", feature: "xhs.publish" },
    { id: "browse", label: "浏览采样", feature: "xhs.ops" },
    { id: "audit", label: "账号审计", feature: "xhs.takeover" },
  ].filter((item) => hasFeature(license, item.feature));
  const [kind, setKind] = useState(kinds[0] ? kinds[0].id : "publish");
  const [confirm, setConfirm] = useState(false);
  const [consent, setConsent] = useState(null);
  const [operationKey, setOperationKey] = useState("");
  const [prechecking, setPrechecking] = useState(false);
  useEffect(() => {
    setOperationKey("");
    setConsent(null);
    setConfirm(false);
  }, [kind, accountId, draftId]);
  const prepare = async () => {
    setPrechecking(true);
    try {
      const key =
        operationKey ||
        (window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID()
          : `xhs-${Math.random().toString(36).slice(2)}`);
      setOperationKey(key);
      const result = await host.request("/plugin-apps/xhs-ops/commands", {
        method: "POST",
        body: JSON.stringify({
          command: "run.precheck",
          payload: {
            kind,
            account_id: accountId,
            draft_id: kind === "publish" ? draftId || undefined : undefined,
            idempotency_key: key,
            confirmed: true,
          },
        }),
      });
      const consentRows =
        result &&
        result.data &&
        (result.data.consents || result.data.prechecks);
      const latest = Array.isArray(consentRows)
        ? consentRows[consentRows.length - 1]
        : null;
      setConsent(
        latest || {
          confirm_digest: result && result.confirm_digest,
          expires_at: result && result.expires_at,
        },
      );
      setConfirm(true);
      await refresh();
    } finally {
      setPrechecking(false);
    }
  };
  const start = async () => {
    await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({
        command: "run.start",
        payload: {
          kind,
          account_id: accountId,
          draft_id: kind === "publish" ? draftId || undefined : undefined,
          idempotency_key: operationKey,
          confirm_digest: consent && (consent.confirm_digest || consent.digest),
          confirmed: true,
        },
      }),
    });
    setConfirm(false);
    await refresh();
  };
  const accountOptions = accounts.map((a) =>
    h("option", { key: a.id, value: a.id }, a.name),
  );
  const draftOptions = drafts.map((d) =>
    h("option", { key: d.id, value: d.id }, d.title),
  );
  return h(
    "div",
    { className: "xhs-grid" },
    h(
      "div",
      { className: "xhs-card" },
      h("h3", null, "发布确认"),
      h(
        "div",
        { className: "xhs-meta" },
        "发布前请确认账号、草稿和设备均已就绪。",
      ),
      h(
        "label",
        { className: "xhs-field" },
        h("div", { className: "xhs-label" }, "任务类型"),
        h(
          "select",
          {
            className: "xhs-select",
            value: kind,
            onChange: (e) => setKind(e.target.value),
            disabled: readOnly,
          },
          kinds.map((item) =>
            h("option", { key: item.id, value: item.id }, item.label),
          ),
        ),
      ),
      h(
        "label",
        { className: "xhs-field" },
        h("div", { className: "xhs-label" }, "账号"),
        h(
          "select",
          {
            className: "xhs-select",
            value: accountId,
            onChange: (e) => setAccountId(e.target.value),
            disabled: readOnly,
          },
          h("option", { value: "" }, "选择账号"),
          accountOptions,
        ),
      ),
      h(
        "label",
        { className: "xhs-field" },
        h("div", { className: "xhs-label" }, "草稿"),
        h(
          "select",
          {
            className: "xhs-select",
            value: draftId,
            onChange: (e) => setDraftId(e.target.value),
            disabled: readOnly,
          },
          h("option", { value: "" }, "选择草稿"),
          draftOptions,
        ),
      ),
      h(
        "div",
        { className: "xhs-actions" },
        h(
          Button,
          {
            primary: true,
            onClick: prepare,
            disabled:
              readOnly ||
              prechecking ||
              !accountId ||
              (kind === "publish" && !draftId),
          },
          prechecking ? "生成预览…" : "生成操作预览",
        ),
      ),
      confirm &&
        consent &&
        h(
          "div",
          {
            className: "xhs-card",
            style: { marginTop: 12, borderColor: C.red },
          },
          h(
            "strong",
            null,
            kind === "publish" ? "确认发布此草稿？" : "确认开始此任务？",
          ),
          h(
            "div",
            { className: "xhs-meta" },
            "确认摘要：",
            text(consent.confirm_digest || consent.digest),
            " · 有效至 ",
            text(consent.expires_at),
          ),
          h(
            "div",
            { className: "xhs-actions" },
            h(Button, { primary: true, onClick: start }, "确认并开始"),
            h(
              Button,
              {
                onClick: () => {
                  setConfirm(false);
                  setConsent(null);
                },
              },
              "返回检查",
            ),
          ),
        ),
    ),
    h(
      "div",
      { className: "xhs-card" },
      h("h3", null, "运行记录"),
      runs.length
        ? runs.map((r) =>
            h(
              "div",
              { className: "xhs-row", key: r.id },
              h(
                "div",
                null,
                h("strong", null, text(r.kind)),
                h(
                  "div",
                  { className: "xhs-meta" },
                  text(r.created_at),
                  r.error ? ` · ${r.error}` : "",
                ),
                r.evidence_url &&
                  h(
                    "div",
                    { className: "xhs-meta" },
                    h(
                      Button,
                      {
                        onClick: async () => {
                          const blob = await host.requestBlob(
                            r.evidence_url.replace(/^\/api/, ""),
                          );
                          const url = URL.createObjectURL(blob);
                          window.open(url, "_blank", "noopener");
                          setTimeout(() => URL.revokeObjectURL(url), 60000);
                        },
                      },
                      "查看截图证据",
                    ),
                  ),
              ),
              h(
                "div",
                { className: "xhs-actions" },
                h(Badge, { value: r.status }),
                ["queued", "preparing", "running", "cancelling"].includes(
                  r.status,
                ) &&
                  h(
                    Button,
                    {
                      danger: true,
                      onClick: async () => {
                        await host.request("/plugin-apps/xhs-ops/commands", {
                          method: "POST",
                          body: JSON.stringify({
                            command: "run.cancel",
                            payload: { run_id: r.id },
                          }),
                        });
                        await refresh();
                      },
                    },
                    "停止",
                  ),
                r.status === "awaiting_verification" &&
                  !String(r.kind).startsWith("account_") &&
                  !["comment", "comment_check"].includes(r.kind) &&
                  h(
                    Button,
                    {
                      onClick: async () => {
                        const reference =
                          window.prompt("请输入回读链接或人工核验记录");
                        if (!reference) return;
                        await host.request("/plugin-apps/xhs-ops/commands", {
                          method: "POST",
                          body: JSON.stringify({
                            command: "run.verify",
                            payload: {
                              run_id: r.id,
                              confirmed: true,
                              evidence_url: r.evidence_url,
                              reference,
                            },
                          }),
                        });
                        await refresh();
                      },
                    },
                    "我已核验",
                  ),
                ["comment", "comment_check"].includes(r.kind) &&
                  h(
                    "p",
                    { className: "xhs-meta" },
                    "请在评论审核页完成停止对账和实际结果核验。",
                  ),
                ["unknown", "interrupted"].includes(r.status) &&
                  !["comment", "comment_check"].includes(r.kind) &&
                  h(
                    Button,
                    {
                      onClick: async () => {
                        const profile = String(r.kind).startsWith("account_");
                        const account = {
                          id: r.account_id,
                          version: r.account_version,
                          ...(accounts.find(
                            (item) => item.id === r.account_id,
                          ) || {}),
                        };
                        const daily = r.kind === "nurture";
                        const day = rows(snapshot.data?.operation_days).find(
                          (item) => item.id === r.day_id,
                        ) || { id: r.day_id, version: r.day_version };
                        const reference =
                          profile || daily
                            ? window.prompt(
                                "请记录如何确认手机任务已停止（不会记为资料验收通过）",
                              )
                            : null;
                        if ((profile || daily) && !reference?.trim()) return;
                        if (profile && (account.version == null || !account.id))
                          return;
                        if (daily && (day.version == null || !day.id)) return;
                        await host.request("/plugin-apps/xhs-ops/commands", {
                          method: "POST",
                          body: JSON.stringify({
                            command: profile
                              ? "account_profile.reconcile"
                              : daily
                              ? "ops.reconcile"
                              : "run.reconcile",
                            payload: daily
                              ? {
                                  id: day.id,
                                  version: day.version,
                                  reference,
                                  confirmed: true,
                                }
                              : {
                                  run_id: r.id,
                                  confirmed: true,
                                  ...(profile
                                    ? {
                                        account_id: account.id,
                                        version: account.version,
                                        reference,
                                      }
                                    : {}),
                                },
                          }),
                        });
                        await refresh();
                      },
                    },
                    "确认手机任务已停止",
                  ),
              ),
            ),
          )
        : h("div", { className: "xhs-empty" }, "暂无运行记录"),
    ),
  );
}

const commentStatuses = {
  pending: "待审核",
  generating: "生成候选中",
  approved: "已审核，待发送",
  rejected: "已拒绝",
  expired: "审核已过期",
  sending: "正在执行",
  awaiting_verification: "待人工核验",
  unknown: "结果不明",
  sent: "已人工核验",
};

function CommentCard({ item, account, snapshot, host, readOnly, refresh }) {
  const [value, setValue] = useState(
    item.text || rows(item.candidates)[0] || "",
  );
  const [note, setNote] = useState(item.review_note || "");
  const [confirmed, setConfirmed] = useState(false);
  const [viewed, setViewed] = useState("");
  const [checks, setChecks] = useState({
    account_checked: false,
    post_checked: false,
    text_checked: false,
  });
  const [reference, setReference] = useState("");
  const runs = rows(snapshot.data.runs);
  const run = runs.find((row) => row.id === item.sent_run_id);
  const inspection = runs.find((row) => row.id === item.inspection_run_id);
  const inFlight = [run, inspection].find(
    (row) =>
      row &&
      ["queued", "preparing", "running", "cancelling"].includes(row.status),
  );
  const check = item.precheck;
  const validCheck =
    check &&
    check.license_version === snapshot.license.version &&
    new Date(check.expires_at).getTime() > Date.now();
  const evidence = item.inspection?.matched
    ? item.inspection.evidence_url
    : run?.evidence_url;
  const timezone = snapshot.data.comment_clock?.timezone;
  const locale = host.getToolContext().locale || "zh";
  useEffect(() => {
    setValue(item.text || rows(item.candidates)[0] || "");
    setNote(item.review_note || "");
    setConfirmed(false);
    setViewed("");
    setChecks({
      account_checked: false,
      post_checked: false,
      text_checked: false,
    });
    setReference("");
  }, [item.version, check?.digest, snapshot.license.version, readOnly]);
  const command = async (name, extra = {}) => {
    await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({
        command: name,
        payload: { id: item.id, version: item.version, ...extra },
      }),
    });
    await refresh();
  };
  const stop = async () => {
    await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({
        command: "run.cancel",
        payload: { run_id: inFlight.id },
      }),
    });
    await refresh();
  };
  const reconcile = async () => {
    const record = window.prompt(
      "请记录如何确认手机任务已经停止；此操作不表示评论已经发送或未发送。",
    );
    if (record?.trim())
      await command("comment.reconcile", {
        confirmed: true,
        reference: record,
      });
  };
  const characters = [...value.trim()].length;
  return h(
    "article",
    {
      className: "xhs-card",
      "aria-label": `评论 ${item.post?.title || item.id}`,
    },
    h("h3", null, item.post?.title || "已记录链接的笔记"),
    h(
      "p",
      { className: "xhs-meta" },
      `${account?.name || item.account_id} · ${
        item.post?.author || "作者待核对"
      } · ${commentStatuses[item.status] || item.status}`,
    ),
    item.post?.summary && h("p", null, item.post.summary),
    item.post_url && h("p", { className: "xhs-meta" }, item.post_url),
    item.generation_error &&
      h(
        "p",
        { className: "xhs-danger" },
        operationError(new Error(item.generation_error), locale),
      ),
    item.status === "pending" &&
      h(
        "div",
        null,
        rows(item.candidates).length > 0 &&
          h(
            "div",
            { className: "xhs-actions", "aria-label": "候选评论" },
            ...item.candidates.map((candidate) =>
              h(
                Button,
                {
                  key: candidate,
                  disabled: readOnly,
                  onClick: () => setValue(candidate),
                },
                candidate,
              ),
            ),
          ),
        h(
          "label",
          { className: "xhs-field" },
          h("div", { className: "xhs-label" }, "最终评论"),
          h("textarea", {
            className: "xhs-textarea",
            style: { minHeight: 58 },
            value,
            maxLength: 30,
            disabled: readOnly,
            onChange: (event) => setValue(event.target.value),
          }),
        ),
        h(
          "p",
          { className: "xhs-meta" },
          `${characters}/10 字；仅正向、具体的内容，不含营销、链接或联系方式。`,
        ),
        h(Field, {
          label: "审核备注",
          value: note,
          onChange: setNote,
          disabled: readOnly,
        }),
        h(
          "div",
          { className: "xhs-actions" },
          h(
            Button,
            {
              disabled: readOnly || !value.trim(),
              onClick: () =>
                command("comment.save", {
                  account_id: item.account_id,
                  post: item.post,
                  post_url: item.post_url || "",
                  text: value,
                  note,
                }),
            },
            "保存改写",
          ),
          h(
            Button,
            {
              primary: true,
              disabled: readOnly || characters < 2 || characters > 10,
              onClick: () =>
                command("comment.review", {
                  decision: "approved",
                  text: value,
                  note,
                }),
            },
            "审核通过",
          ),
          h(
            Button,
            {
              disabled: readOnly,
              onClick: () =>
                command("comment.review", { decision: "rejected", note }),
            },
            "拒绝",
          ),
        ),
      ),
    item.status !== "pending" &&
      h(
        "blockquote",
        { style: { margin: "10px 0", padding: 10, background: C.soft } },
        item.text || "尚无最终原文",
      ),
    ["approved", "expired", "rejected"].includes(item.status) &&
      !item.sent_run_id &&
      h(
        "div",
        { className: "xhs-actions" },
        h(
          Button,
          { disabled: readOnly, onClick: () => command("comment.reopen") },
          "重新审核",
        ),
        item.status === "approved" &&
          h(
            Button,
            {
              disabled: readOnly || !timezone,
              onClick: () => command("comment.precheck"),
            },
            "预检发送",
          ),
      ),
    item.status === "approved" &&
      check &&
      h(
        "section",
        { className: "xhs-card", style: { marginTop: 12 } },
        h("strong", null, "确认发送预览"),
        h(
          "p",
          null,
          `${account?.name || item.account_id} → ${
            item.post?.title || item.post_url
          } · ${item.post?.author || ""}`,
        ),
        h("p", null, `评论原文：${item.text}`),
        h(
          "p",
          { className: "xhs-meta" },
          `有效至 ${operationTime(
            check.expires_at,
            timezone,
          )}；账号、规则或授权变化需重新预检。`,
        ),
        h(
          "label",
          null,
          h("input", {
            type: "checkbox",
            checked: confirmed,
            disabled: readOnly || !validCheck,
            onChange: (event) => setConfirmed(event.target.checked),
          }),
          " 我已核对账号、目标笔记和评论原文",
        ),
        h(
          "div",
          { className: "xhs-actions" },
          h(
            Button,
            {
              primary: true,
              disabled: readOnly || !validCheck || !confirmed,
              onClick: () =>
                command("comment.send", {
                  confirmed: true,
                  confirm_digest: check.digest,
                }),
            },
            "确认发送一次",
          ),
        ),
      ),
    inFlight &&
      h(
        "div",
        { className: "xhs-actions" },
        h(
          Button,
          {
            danger: true,
            disabled: inFlight.status === "cancelling",
            onClick: stop,
          },
          "停止评论任务",
        ),
      ),
    item.status === "unknown" &&
      !inFlight &&
      h(
        "div",
        null,
        h(
          "p",
          { className: "xhs-danger" },
          "结果不明会保留配额，不会自动重发。请先确认手机任务停止，再只读回查实际评论。",
        ),
        h(Button, { onClick: reconcile }, "记录手机任务已停止"),
      ),
    ["unknown", "awaiting_verification"].includes(item.status) &&
      !inFlight &&
      h(
        "div",
        { className: "xhs-actions" },
        h(
          Button,
          {
            disabled:
              readOnly ||
              !["stopped_unverified", "awaiting_verification"].includes(
                run?.status,
              ),
            onClick: () => command("comment.inspect", { confirmed: true }),
          },
          "只读回查评论",
        ),
      ),
    item.status === "awaiting_verification" &&
      h(
        "section",
        { style: { marginTop: 14 } },
        h("p", null, "截图与手机报告仍需本人核验，不能据此当作平台已确认。"),
        h(PrivateEvidence, {
          host,
          url: evidence,
          label: "查看评论核验截图",
          onViewed: setViewed,
        }),
        ...[
          ["account_checked", "本人账号一致"],
          ["post_checked", "目标笔记一致"],
          ["text_checked", "本人评论原文已实际可见"],
        ].map(([key, label]) =>
          h(
            "label",
            { key, style: { display: "block", marginTop: 8 } },
            h("input", {
              type: "checkbox",
              checked: checks[key],
              disabled: !viewed || Boolean(inFlight),
              onChange: (event) =>
                setChecks({ ...checks, [key]: event.target.checked }),
            }),
            " ",
            label,
          ),
        ),
        h(Field, {
          label: "核验记录",
          value: reference,
          onChange: setReference,
          disabled: Boolean(inFlight),
        }),
        h(
          Button,
          {
            disabled:
              !evidence ||
              viewed !== evidence ||
              Boolean(inFlight) ||
              !Object.values(checks).every(Boolean) ||
              !reference.trim(),
            onClick: () =>
              command("comment.verify", {
                confirmed: true,
                evidence_url: evidence,
                reference,
                ...checks,
              }),
          },
          "确认实际评论",
        ),
      ),
    item.status === "sent" &&
      h(
        "p",
        { className: "xhs-meta" },
        `已人工核验 · ${operationTime(
          item.verified_at || item.sent_at,
          timezone,
        )}`,
      ),
  );
}

function CommentsPanel({ snapshot, host, readOnly, refresh, modelRef }) {
  const accounts = rows(snapshot.data.accounts);
  const comments = rows(snapshot.data.comments);
  const sources = rows(snapshot.data.comment_sources);
  const [accountId, setAccountId] = useState("");
  const [manualAccountId, setManualAccountId] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState([]);
  const [postTitle, setPostTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [value, setValue] = useState("");
  const clock = snapshot.data.comment_clock;
  const filtered = comments.filter(
    (item) =>
      (!accountId || item.account_id === accountId) &&
      (!status || item.status === status),
  );
  const command = async (name, payload) => {
    await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({ command: name, payload }),
    });
    await refresh();
  };
  const generate = async () => {
    const grouped = new Map();
    for (const source of sources.filter((source) =>
      selected.includes(source.id),
    )) {
      if (!grouped.has(source.run_id)) grouped.set(source.run_id, []);
      grouped.get(source.run_id).push({
        chunk_index: source.chunk_index,
        post_index: source.post_index,
      });
    }
    for (const [run_id, posts] of grouped)
      await command("comment.generate", {
        run_id,
        posts,
        ...(modelRef ? { model_ref: modelRef } : {}),
      });
    setSelected([]);
  };
  return h(
    "div",
    null,
    h(
      "section",
      { className: "xhs-card" },
      h("h3", null, "评论审核"),
      h(
        "p",
        { className: "xhs-meta" },
        `${clock?.date || "服务器日期未读取"} · ${
          clock?.timezone || "服务器时区未读取"
        }；发送时段 08:00–23:00，浏览结束后至少间隔10分钟。`,
      ),
      h(
        "div",
        { className: "xhs-grid" },
        h(
          "label",
          { className: "xhs-field" },
          "筛选账号",
          h(
            "select",
            {
              className: "xhs-select",
              value: accountId,
              onChange: (event) => {
                setAccountId(event.target.value);
                setSelected([]);
              },
            },
            h("option", { value: "" }, "全部账号"),
            ...accounts.map((a) =>
              h("option", { key: a.id, value: a.id }, a.name),
            ),
          ),
        ),
        h(
          "label",
          { className: "xhs-field" },
          "筛选状态",
          h(
            "select",
            {
              className: "xhs-select",
              value: status,
              onChange: (event) => setStatus(event.target.value),
            },
            h("option", { value: "" }, "全部状态"),
            ...Object.entries(commentStatuses).map(([key, label]) =>
              h("option", { key, value: key }, label),
            ),
          ),
        ),
      ),
      ...rows(snapshot.data.comment_quotas)
        .filter((q) => !accountId || q.account_id === accountId)
        .map((q) =>
          h(
            "p",
            { key: q.account_id, className: "xhs-meta" },
            `${
              accounts.find((a) => a.id === q.account_id)?.name || q.account_id
            }：今日有效浏览 ${q.today_browsed} 篇；评论额度 ${q.cap}，已核验 ${
              q.sent_today
            }，审核/待核验占用 ${q.approved_pending}，可再审核 ${
              q.remaining
            }。${q.enabled ? "" : "评论开关未开启。"}`,
          ),
        ),
    ),
    h(
      "div",
      { className: "xhs-grid", style: { marginTop: 12 } },
      h(
        "section",
        { className: "xhs-card" },
        h("h3", null, "从已完成浏览生成候选"),
        h(
          "p",
          { className: "xhs-meta" },
          "只使用有完整回执且适合评论的帖子；一次最多选择10篇，生成后仍需人工审核。",
        ),
        ...sources
          .filter((source) => !accountId || source.account_id === accountId)
          .map((source) =>
            h(
              "label",
              { key: source.id, style: { display: "block", marginTop: 8 } },
              h("input", {
                type: "checkbox",
                checked: selected.includes(source.id),
                disabled:
                  readOnly ||
                  (!selected.includes(source.id) && selected.length >= 10),
                onChange: (event) =>
                  setSelected(
                    event.target.checked
                      ? [...selected, source.id]
                      : selected.filter((id) => id !== source.id),
                  ),
              }),
              ` ${source.post.title} · ${source.post.author}`,
            ),
          ),
        !sources.length &&
          h(
            "p",
            { className: "xhs-meta" },
            "暂无符合条件的帖子，请先完成日常浏览并核对回执。",
          ),
        h(
          "div",
          { className: "xhs-actions" },
          h(
            Button,
            { disabled: readOnly || !selected.length, onClick: generate },
            "生成所选候选",
          ),
        ),
      ),
      h(
        "section",
        { className: "xhs-card" },
        h("h3", null, "手写评论草稿"),
        h(
          "p",
          { className: "xhs-meta" },
          "先选择账号，并记录唯一目标笔记的标题和作者；保存不会发送。",
        ),
        h(
          "label",
          { className: "xhs-field" },
          "评论账号",
          h(
            "select",
            {
              className: "xhs-select",
              value: manualAccountId,
              disabled: readOnly,
              onChange: (event) => setManualAccountId(event.target.value),
            },
            h("option", { value: "" }, "选择评论账号"),
            ...accounts.map((account) =>
              h("option", { key: account.id, value: account.id }, account.name),
            ),
          ),
        ),
        h(Field, {
          label: "笔记标题",
          value: postTitle,
          onChange: setPostTitle,
          disabled: readOnly,
        }),
        h(Field, {
          label: "笔记作者",
          value: author,
          onChange: setAuthor,
          disabled: readOnly,
        }),
        h(Field, {
          label: "笔记链接（可选）",
          value: postUrl,
          onChange: setPostUrl,
          disabled: readOnly,
        }),
        h(Field, {
          label: "手写评论（2–10字）",
          value,
          onChange: setValue,
          disabled: readOnly,
        }),
        h(
          Button,
          {
            disabled:
              readOnly ||
              !manualAccountId ||
              !postTitle.trim() ||
              !author.trim(),
            onClick: async () => {
              await command("comment.save", {
                account_id: manualAccountId,
                post: { title: postTitle, author },
                post_url: postUrl,
                text: value,
              });
              setValue("");
            },
          },
          "保存评论草稿",
        ),
      ),
    ),
    h(
      "div",
      { className: "xhs-grid", style: { marginTop: 12 } },
      ...filtered.map((item) =>
        h(CommentCard, {
          key: item.id,
          item,
          account: accounts.find((a) => a.id === item.account_id),
          snapshot,
          host,
          readOnly,
          refresh,
        }),
      ),
    ),
    !filtered.length &&
      h("p", { className: "xhs-empty" }, "当前筛选下暂无评论"),
  );
}

const PLAN_ACTIONS = {
  pool: "写入兴趣池",
  pace: "写入排期规则",
  tier: "设为该账号档位",
  topics: "加入内容计划",
};
const TAKEOVER_FIELD_LABELS = {
  nickname: "昵称",
  bio: "简介",
  avatar: "头像",
  background: "背景图",
  gender: "性别",
  birthday: "生日",
  region: "地区",
  occupation: "职业",
  school: "学校",
};
// One diagnosis: the profile changes it proposes, decided item by item, and its content advice.
function DiagnosisCard({ d, account, cmd, host, readOnly, refresh, modelRef }) {
  const editable = ["draft", "reviewing"].includes(d.status);
  const saved =
    d.decisions && typeof d.decisions === "object" ? d.decisions : {};
  const proposals = rows(d.proposals).filter((p) => p && typeof p === "object");
  const keyOf = (p) => String(p.id || p.field || "");
  const [choice, setChoice] = useState(() =>
    Object.fromEntries(
      proposals.map((p) => {
        const value = saved[keyOf(p)] ?? saved[p.field];
        return [
          keyOf(p),
          typeof value === "object" && value
            ? { decision: value.decision || "", edited: value.edited ?? "" }
            : { decision: String(value || ""), edited: "" },
        ];
      }),
    ),
  );
  const [checked, setChecked] = useState(false);
  const set = (p, patch) =>
    setChoice({ ...choice, [keyOf(p)]: { ...choice[keyOf(p)], ...patch } });
  const decided = proposals.every((p) => choice[keyOf(p)]?.decision);
  const payload = () => ({
    ...(saved.note ? { note: saved.note } : {}),
    ...Object.fromEntries(
      proposals.map((p) => {
        const c = choice[keyOf(p)] || {};
        return [
          keyOf(p),
          c.decision === "edit"
            ? { decision: "edit", edited: c.edited }
            : { decision: c.decision || "skip" },
        ];
      }),
    ),
  });
  return h(
    "div",
    { style: { marginTop: 12 } },
    h(
      Row,
      { title: text(d.summary), sub: rows(d.findings).join("；") },
      h(Badge, { value: d.status }),
      h(
        Button,
        {
          onClick: () =>
            cmd("diagnosis.regenerate", {
              id: d.id,
              confirmed: true,
              ...(modelRef ? { model_ref: modelRef } : {}),
            }),
          disabled: readOnly || d.status === "superseded",
        },
        "重新生成",
      ),
    ),
    h(
      Card,
      {
        title: "资料变更提案",
        tip: "逐项决定。确认方案后，采纳和修改的项目会生成变更单，仍要逐张预检和确认才会在手机上执行。",
      },
      h(Table, {
        head: ["字段", "建议改为", "风险与节奏", "你的决定"],
        body: proposals.map((p) => {
          const c = choice[keyOf(p)] || {};
          return [
            TAKEOVER_FIELD_LABELS[p.field] || p.field,
            c.decision === "edit"
              ? h("input", {
                  className: "xhs-input",
                  style: { marginTop: 0 },
                  "aria-label": `修改${
                    TAKEOVER_FIELD_LABELS[p.field] || p.field
                  }`,
                  value: c.edited,
                  disabled: readOnly || !editable,
                  onChange: (e) => set(p, { edited: e.target.value }),
                })
              : text(p.after),
            text(p.risk),
            h(
              "div",
              { style: { display: "flex", gap: 6 } },
              [
                ["adopt", "采纳"],
                ["edit", "修改"],
                ["skip", "不采纳"],
              ].map(([k, l]) =>
                h(
                  "button",
                  {
                    key: k,
                    type: "button",
                    className: `xhs-btn${c.decision === k ? " is-active" : ""}`,
                    "aria-pressed": c.decision === k,
                    disabled: readOnly || !editable,
                    onClick: () =>
                      set(p, {
                        decision: k,
                        edited:
                          k === "edit"
                            ? c.edited || String(p.after ?? "")
                            : c.edited,
                      }),
                  },
                  l,
                ),
              ),
            ),
          ];
        }),
        empty: "这次诊断没有提出资料变更",
      }),
      editable &&
        h(Check, {
          label: "我已逐项核对提案，理解每项的观察期",
          checked,
          onChange: setChecked,
          disabled: readOnly,
        }),
      h(
        "div",
        { className: "xhs-actions" },
        h(
          Button,
          {
            disabled: readOnly || !editable || !proposals.length,
            onClick: () =>
              cmd("diagnosis.decisions", {
                id: d.id,
                decisions: payload(),
                confirmed: true,
              }),
          },
          "记录采纳意见",
        ),
        h(
          Button,
          {
            primary: true,
            onClick: async () => {
              if (editable && proposals.length)
                await cmd("diagnosis.decisions", {
                  id: d.id,
                  decisions: payload(),
                  confirmed: true,
                });
              await cmd("diagnosis.confirm", { id: d.id, confirmed: true });
            },
            disabled:
              readOnly ||
              d.status === "confirmed" ||
              d.status === "superseded" ||
              (proposals.length > 0 && (!decided || !checked)),
          },
          "确认方案",
        ),
        account?.plan_confirmed &&
          h(
            Button,
            {
              danger: true,
              onClick: async () => {
                if (!window.confirm("撤销接管方案并作废尚未开始的变更单？"))
                  return;
                await cmd("takeover.plan.revert", {
                  account_id: account.id,
                  account_version: account.version,
                  confirmed: true,
                });
              },
              disabled: readOnly,
            },
            "撤销方案",
          ),
      ),
    ),
    (() => {
      const plan = d.ops_plan || {};
      const pool = plan.interest_pool || {};
      const apply = (part, done) =>
        h(
          Button,
          {
            primary: !d.applied?.[part],
            disabled: readOnly || d.status === "superseded",
            onClick: async () => {
              await cmd("takeover.apply_plan", {
                id: d.id,
                part,
                confirmed: true,
              });
              toast(done);
            },
          },
          d.applied?.[part] ? "已写入，再写一次" : PLAN_ACTIONS[part],
        );
      const parts = [
        rows(pool.core).length +
          rows(pool.extended).length +
          rows(pool.general).length >
          0 &&
          h(
            Row,
            {
              key: "pool",
              title: "兴趣池",
              sub: `核心 ${rows(pool.core).join("、") || "—"} · 扩展 ${
                rows(pool.extended).join("、") || "—"
              } · 泛 ${rows(pool.general).join("、") || "—"}`,
            },
            apply("pool", "已写入兴趣池"),
          ),
        (plan.weekly_posts != null || plan.min_interval_hours != null) &&
          h(
            Row,
            {
              key: "pace",
              title: "发布节奏",
              sub: `${
                plan.weekly_posts != null ? `每周 ${plan.weekly_posts} 篇` : ""
              }${
                plan.weekly_posts != null && plan.min_interval_hours != null
                  ? "，"
                  : ""
              }${
                plan.min_interval_hours != null
                  ? `同一账号间隔 ≥ ${plan.min_interval_hours} 小时`
                  : ""
              }；只对这个账号生效，不会比企业和你的设置更宽`,
            },
            apply("pace", "已写入排期规则"),
          ),
        plan.tier &&
          h(
            Row,
            {
              key: "tier",
              title: "养号档位",
              sub: `建议“${
                { low: "低", mid: "中", high: "高" }[plan.tier]
              }”档；档位只降不升，调整由你确认`,
            },
            apply("tier", "已设为该账号档位"),
          ),
        rows(plan.topics).length > 0 &&
          h(
            Row,
            {
              key: "topics",
              title: "首批选题",
              sub: rows(plan.topics).join("、"),
            },
            apply("topics", "已加入内容计划"),
          ),
      ].filter(Boolean);
      return (
        parts.length > 0 &&
        h(
          Card,
          {
            title: "运营方案",
            icon: "内容与运营建议",
            tip: "每一项都要你点了才写入，写入的是这个账号自己的设置。",
            style: { marginTop: 12 },
          },
          parts,
        )
      );
    })(),
    rows(d.recommendations).length > 0 &&
      h(
        Card,
        {
          title: "内容与运营建议",
          tip: "建议只进内容计划的待制作，不会自动生成或发布。",
          style: { marginTop: 12 },
        },
        rows(d.recommendations).map((item, index) =>
          h(
            Row,
            { key: index, title: text(item) },
            h(
              Button,
              {
                disabled: readOnly,
                onClick: async () => {
                  await send(host, "task.add", {
                    title: String(item).slice(0, 40),
                    account_id: d.account_id,
                    nature: "knowledge",
                    source: "ai",
                    reason: "老号接管诊断建议",
                  });
                  toast("已加入内容计划");
                  await refresh();
                },
              },
              "采纳到内容计划",
            ),
          ),
        ),
      ),
  );
}

function AuditPanel({ snapshot, host, readOnly, refresh, modelRef }) {
  const accounts = rows(snapshot.data.accounts);
  const audits = rows(snapshot.data.audits);
  const diagnoses = rows(snapshot.data.diagnoses);
  const orders = rows(snapshot.data.change_orders);
  const [accountId, setAccountId] = useState("");
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [occupation, setOccupation] = useState("");
  const [region, setRegion] = useState("");
  const [avatarImage, setAvatarImage] = useState(null);
  const [coverImage, setCoverImage] = useState(null);
  const [readingProfileImage, setReadingProfileImage] = useState(false);
  const cmd = async (command, payload) => {
    await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({ command, payload }),
    });
    await refresh();
  };
  return h(
    "div",
    { className: "xhs-grid" },
    h(
      "div",
      { className: "xhs-card" },
      h("h3", null, "诊断"),
      h(
        "select",
        {
          className: "xhs-select",
          value: accountId,
          onChange: (e) => setAccountId(e.target.value),
          disabled: readOnly,
        },
        h("option", { value: "" }, "选择账号"),
        accounts.map((a) => h("option", { key: a.id, value: a.id }, a.name)),
      ),
      h(
        Button,
        {
          disabled: readOnly || !accountId,
          onClick: async () => {
            if (
              window.confirm("授权此账号进入接管流程？实际资料变更将另行确认。")
            )
              await cmd("takeover.authorize", {
                account_id: accountId,
                confirmed: true,
              });
          },
        },
        "授权人工接管",
      ),
      accountId &&
        (() => {
          const account = accounts.find((item) => item.id === accountId);
          const paused = Boolean(account?.paused || account?.safety_pause);
          return h(
            "div",
            { className: "xhs-actions" },
            h(
              Button,
              {
                disabled: readOnly,
                onClick: async () => {
                  if (paused) {
                    await cmd("takeover.resume", {
                      account_id: accountId,
                      confirmed: true,
                    });
                  } else {
                    const reason = window.prompt("请输入暂停接管原因") || "";
                    if (reason.trim())
                      await cmd("takeover.pause", {
                        account_id: accountId,
                        reason: reason.trim(),
                        confirmed: true,
                      });
                  }
                },
              },
              paused ? "恢复接管" : "暂停接管",
            ),
            account?.device_hold &&
              h(
                Button,
                {
                  disabled: readOnly,
                  onClick: async () => {
                    const reference =
                      window.prompt("请确认手机任务已停止，并记录核对依据") ||
                      "";
                    if (reference.trim())
                      await cmd("takeover.device_hold_release", {
                        account_id: accountId,
                        reference: reference.trim(),
                        confirmed: true,
                      });
                  },
                },
                "释放设备占用",
              ),
            h(
              Button,
              {
                disabled:
                  readOnly || !account?.authorized_at || !account?.device_id,
                onClick: () =>
                  cmd("takeover.identity.read", {
                    account_id: accountId,
                    account_version: account.version,
                    confirmed: true,
                  }),
              },
              "读取接管身份",
            ),
            account?.pending_identity &&
              h(
                "div",
                { className: "xhs-card" },
                h(
                  "p",
                  null,
                  `待确认小红薯号：${
                    account.pending_identity.account_id || "未读到"
                  }`,
                ),
                h(
                  Button,
                  {
                    primary: true,
                    disabled: readOnly,
                    onClick: async () => {
                      const value =
                        account.pending_identity.account_id ||
                        window.prompt("请输入截图中核对后的小红薯号") ||
                        "";
                      if (!value.trim()) return;
                      await cmd("takeover.identity.confirm", {
                        account_id: accountId,
                        identity_task_id: account.pending_identity.task_id,
                        platform_account_id: value.trim(),
                        account_version: account.version,
                        confirmed: true,
                      });
                    },
                  },
                  "确认并锁定身份",
                ),
              ),
          );
        })(),
      audits
        .filter((a) => !accountId || a.account_id === accountId)
        .map((a) =>
          h(
            "div",
            { className: "xhs-row", key: a.id },
            h(
              "div",
              null,
              text(a.summary, "账号审计"),
              h(
                "div",
                { className: "xhs-meta" },
                a.verified ? "已验证" : "待验证",
              ),
            ),
            a.status === "pending_confirmation" &&
              h(
                Button,
                {
                  primary: true,
                  onClick: () =>
                    cmd("audit.confirm", { id: a.id, confirmed: true }),
                  disabled: readOnly || !a.verified,
                },
                "确认审计基线",
              ),
            a.status === "pending_confirmation" &&
              h(
                Button,
                {
                  onClick: () =>
                    cmd("audit.cancel", {
                      id: a.id,
                      reference: "人工取消盘点",
                      confirmed: true,
                    }),
                  disabled: readOnly,
                },
                "取消盘点",
              ),
            h(
              Button,
              {
                onClick: () =>
                  cmd("diagnosis.generate", {
                    account_id: a.account_id,
                    audit_id: a.id,
                    ...(modelRef ? { model_ref: modelRef } : {}),
                  }),
                disabled: readOnly || !a.verified || a.status !== "confirmed",
              },
              "生成诊断",
            ),
          ),
        ),
      diagnoses.map((d) =>
        h(DiagnosisCard, {
          key: d.id,
          d,
          account: accounts.find((item) => item.id === d.account_id),
          cmd,
          host,
          readOnly,
          refresh,
          modelRef,
        }),
      ),
    ),
    h(
      "div",
      { className: "xhs-card" },
      h("h3", null, "资料变更"),
      h(
        "p",
        { className: "xhs-meta" },
        "每次提交一个字段，核验完成后再继续下一项。",
      ),
      h(
        "p",
        { className: "xhs-meta" },
        "每次只提交一个字段；地区必须明确请求，头像和背景图需先上传到私有素材。",
      ),
      h(Field, {
        label: "昵称（可选）",
        value: nickname,
        onChange: setNickname,
        disabled: readOnly,
      }),
      h(Field, {
        label: "简介（可选）",
        value: bio,
        onChange: setBio,
        multiline: true,
        disabled: readOnly,
      }),
      h(Field, {
        label: "职业（可选）",
        value: occupation,
        onChange: setOccupation,
        disabled: readOnly,
      }),
      h(Field, {
        label: "地区（可选，明确请求）",
        value: region,
        onChange: setRegion,
        disabled: readOnly,
      }),
      h(
        "label",
        { className: "xhs-field" },
        h("div", { className: "xhs-label" }, "头像（可选）"),
        h("input", {
          className: "xhs-input",
          type: "file",
          accept: "image/png,image/jpeg,image/webp",
          disabled: readOnly || readingProfileImage,
          onChange: async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setReadingProfileImage(true);
            try {
              setAvatarImage((await readImageFiles([file]))[0]);
            } finally {
              setReadingProfileImage(false);
            }
          },
        }),
      ),
      h(
        "label",
        { className: "xhs-field" },
        h("div", { className: "xhs-label" }, "背景图（可选）"),
        h("input", {
          className: "xhs-input",
          type: "file",
          accept: "image/png,image/jpeg,image/webp",
          disabled: readOnly || readingProfileImage,
          onChange: async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setReadingProfileImage(true);
            try {
              setCoverImage((await readImageFiles([file]))[0]);
            } finally {
              setReadingProfileImage(false);
            }
          },
        }),
      ),
      h(
        Button,
        {
          primary: true,
          disabled:
            readOnly ||
            !accountId ||
            [nickname, bio, occupation, region, avatarImage, coverImage].filter(
              (value) => (typeof value === "string" ? value.trim() : value),
            ).length !== 1,
          onClick: () => {
            const fields = avatarImage
              ? { avatar: avatarImage }
              : coverImage
              ? { cover: coverImage }
              : nickname.trim()
              ? { nickname }
              : bio.trim()
              ? { bio }
              : occupation.trim()
              ? { occupation }
              : { region };
            cmd("change_order.create", {
              account_id: accountId,
              requested: Boolean(region.trim()),
              fields,
            });
          },
        },
        "创建变更单",
      ),
      orders.map((o) =>
        h(
          "div",
          { className: "xhs-row", key: o.id },
          h(
            "div",
            null,
            h(Badge, { value: o.status }),
            h(
              "div",
              { className: "xhs-meta" },
              Object.keys(o.fields || {}).join("、"),
            ),
          ),
          h(
            "div",
            { className: "xhs-actions" },
            o.status === "draft" &&
              h(
                Button,
                {
                  onClick: () => cmd("change_order.precheck", { id: o.id }),
                  disabled: readOnly,
                },
                "预检查",
              ),
            ["draft", "prechecked"].includes(o.status) &&
              h(
                Button,
                {
                  onClick: () =>
                    cmd("change_order.cancel", {
                      id: o.id,
                      reference: "人工取消变更单",
                      confirmed: true,
                    }),
                  disabled: readOnly,
                },
                "取消变更单",
              ),
            o.status === "prechecked" &&
              h(
                Button,
                {
                  primary: true,
                  onClick: () =>
                    cmd("change_order.confirm", {
                      id: o.id,
                      confirm_digest: o.confirm_digest,
                      confirmed: true,
                    }),
                  disabled: readOnly,
                },
                "确认执行",
              ),
            o.status === "awaiting_verification" &&
              h(
                Button,
                {
                  onClick: () =>
                    cmd("change_order.verify", {
                      id: o.id,
                      evidence_url:
                        o.result?.evidence_url || o.evidence_url || "",
                      reference: window.prompt("请输入手机回读核验记录") || "",
                      confirmed: true,
                    }),
                  disabled: readOnly,
                },
                "补跑核验",
              ),
            [
              "awaiting_verification",
              "observing",
              "rollback_observing",
            ].includes(o.status) &&
              h(
                Button,
                {
                  onClick: () =>
                    cmd("change_order.manual_check", {
                      id: o.id,
                      reference: window.prompt("请输入人工检查记录") || "",
                      confirmed: true,
                    }),
                  disabled: readOnly,
                },
                "人工检查",
              ),
            [
              "awaiting_verification",
              "observing",
              "rollback_observing",
            ].includes(o.status) &&
              Object.keys(o.fields || {}).some((field) =>
                ["avatar", "cover"].includes(field),
              ) &&
              h(
                Button,
                {
                  onClick: async () => {
                    const field = Object.keys(o.fields || {}).find((key) =>
                      ["avatar", "cover"].includes(key),
                    );
                    if (!field) return;
                    const matched = window.confirm(
                      `${
                        field === "avatar" ? "头像" : "背景图"
                      }与手机回读一致吗？`,
                    );
                    await cmd("change_order.visual_check", {
                      id: o.id,
                      field,
                      matched,
                      reference: "人工图片对照",
                      confirmed: true,
                    });
                  },
                  disabled: readOnly,
                },
                "图片对照",
              ),
            ["observing", "rollback_observing"].includes(o.status) &&
              h(
                Button,
                {
                  onClick: () =>
                    cmd("change_order.observation_review", {
                      id: o.id,
                      confirmed: true,
                    }),
                  disabled: readOnly,
                },
                "观察期复查",
              ),
            ["reviewed", "rollback_reviewed"].includes(o.status) &&
              h(
                Button,
                {
                  onClick: () =>
                    cmd("change_order.rollback", { id: o.id, confirmed: true }),
                  disabled: readOnly,
                },
                "创建回滚单",
              ),
            ["observing", "rollback_observing", "unknown"].includes(o.status) &&
              h(
                Button,
                {
                  onClick: () =>
                    cmd("change_order.review", { id: o.id, confirmed: true }),
                  disabled: readOnly,
                },
                "确认复核",
              ),
          ),
        ),
      ),
    ),
  );
}

const XHS_LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHAAAAA4CAYAAAAl63xKAAAiT0lEQVR42r2debxlRXXvv6tq73PuvT13A9KMtqKgCJjQqAgEo+ThLD5oSCBqIAlPNLxoQviYYGLQj74M6jOfp8E45hlilA5OEYMT0kEE0gwCEmQUuqHpebp9h3P2rlrvj9pD1T6nUTO8/oPue++5e6iqtdZv/dZvLYT/wB9FBV5mhXVl873jXrOs3LfvRCndixFO8KpHK3Kwql+KSE+9goCIoIAggIIqIgIqqPrwGQRVBZH2pqKgUH0g/Lz+EdWlABETvggfDv9VEBSMQVWR8ACohKcg+n2obhsuVt1Hw/MaaT6LNH+1j+fcUIzsFiObjZcHEO5W4bYM7pAN39/V3ur0DNY5aW/5c/+Rf//GnWuEtQ5AX3rRIrY+9kpfuLO9d6cYr4eZegFVcerxCir1LXXM3+FnWi9y+t30/vo0b9GsZnQwkitKdOvq+Eh90eqTEm1QdYA0vld1GqT6XH2H+rkEsCJYERBTHQCH9/qEiNxsbHYtk0uulwe+Nh1+f42Ftf7fs5E/9wbqmjVW1lYb9/q3H8LDj1ziZmbebFWOQAHvGHiPoq56Qal2RiS2JO08gXaOSHSiE/OovqgtL2yACX+rjzYBVIXRNZHWzEz1dWzlzb8j/9Dddzq/Uv1QtNpEUTT8R42g1QdtT0zYUCN47zcY4XMwcZVs/M6meiNro/hP30BVFUSMgNPv3bXU/+H7f89v3X5JVrgD8I6BqgsHU03wkOM3q9kC1Y7rSq0uMbP6c7Ul1G64cZfd7Q1LrarjX1k08sTS2SENG1K7y9q6pPnXyIFr31XDzzV+5trEwYdT7EHoG2MRi1O33Yq5CiMflsfX7f55rfFn2kB9z3uMXHmlxwrFRX94trnjvj8z23cd5cqCEkoFa6oj115YGkuq30E6txuJX82+6ejei7SLHfxsY9zSeEuNYmu8gel9RdqYqK0NjbjzxDvUz18bbL2VCmKk9RvauVJ1WJKbAx5UVF1mbGZNhsc/7IV35RtuujZc6z1GuNL/hzdQr7nGyrnnOlWd8Oe/44Pmzvvfzu69DKyUClYUEdHIYEbdlnSsI8IgzYltAAUCOua5R8xM61PRsVjpxEQdf53IUtivpUp7WOqPGFN9Xlv3W7vb2GwilyzxPeLTEw6bour6xmYYi8d/zBh7mTy+bv5ncanys2ze7OzOI/oXXPEFc/t9Jw+KgcNaEVWj0ctJc461i3g6a1qd3eRttXGL7aJLd+cbq6ujU3Pu48DUuE8atIt2g25qwc2B6X42PjS0ix4/k0S/ryLBA8SAaFwUFmliqNbIVdQLaM/0rMffMuhN/OrUo9/Z8NM20fxUy3tkw3H9NZffYG754cmDYlCItVa8N80K1SFB4kfV6MSl7lDjk6saLR7pKa2uocnrV4ujvoo22ljzOCAk2r1mZAmR+1SlWfT2pMko0IpjtWqLUuuDkCyBVj/2kZVGcRxFfTi4AfKIUcQO3LAwnpP7w8ENg6NfdZyw1oW4+HNYYLN5O6aP9b/9rhvMun89aL5nSoPJ4rg2Gsuk9WoxnK+PW40cdIxpRie/PsVNztgc9y5SbHM0iRO4DpKtN0+ihU08cg1cjFRpx5gY2FktVW1z2HHuvmO1cU4rEqPo9j4qgniPQtk3NvM221ouW/zy/t3/dN/+LFFGAYsauVK8qh5evvGSf8m+f8czB7ktBTKS0FM/EBGwkBTVkSbhccxLEKam8CdcwyfIVIjASQ1cIjerzcKnqYY0iXrkWutDUsffbmYqjFpjfGxVG8CUeA+R/eynoKZCzzq66g04qmNmeMuyLzYrjTxWHLzil6Zu/+rGccBGxqQKgmpevun3b8q+c8tJA9FSkKzZLNIkeTRNliTZTV9U2oVuECUJW9JFm2nkkgRXNK5b44Rf6Fyx3Ys2MEYHr2Z+pAEbMbYJxpt80bo/KgQqEjaHNFaPIFrvxyNcotxTJcpotOybPCt7dn12zORpXH99Ub2yjo+B5641Yo0f/sGffyS76Y6T5rQsRSTTOL/pLo+0/kiS+Fed7sbny7jDR518aJPv08YkbTMxxqUZsQVE94ihgzQpQrS40rJsddbX+P0oVErExmgT70L+Sr1xGm9MHFx9+3vSjZU64palAWaRLxKTzWtRZoU/afjA/EdE8LDGjAUxes01Vtae64ovfuOs3vdue+tgero0WZapanpS2hV+Wgg7Ci58WO/MgrVgDZpZMJaWkNL0gDSbqwkMalJmqWF9CjLUh8UTjR9bR55Pm3jacUgabWZsIPU3vHZ/3Oy2NtYlzaar863lJ2Cu/WWtYqBKGu8Fkw3LYdkr/Vvnj33VWV1QIx3Xuah44yX3yL+sP7yc6Kmomvi0JotbJbNSEcP1w8uY3KtmPGRYwuxsi9xFwBpk4QJ8hRpFOuC7jpFjGTGF+QH0euHuxoDzwQvZLIpbNb2mICah6TQmMCPUKsaEw1ZZKWKgLKD0kAV+ExcsT/q9cGjqIGIMMhii9doIUJRIr4dak3qr0ncAmu+kL4oiPkNE82xjfvTzjuc7n5iuXWnWuE5wxRUfuiy/56Ej5nNTimrWdeOth4hijY+TA23jS8xZisD8EDlmFeYtZ4eF8YpmFv/gT/CfvgYxNqKi0mRcO+AECIs3NUH2ifcjzzocLcoQw3o5xR9/BP3295HFC4N78x5feQwVN0rLjcQuwvX27K04UwOzM8ipJ5Ff9b42j/Ued9EfonfcCxMTqHOINejcDOaKS7EXnAWDIUz00Icep/i1dyBlUd1bkDyDhVMtFhDCQUl5OgyYUn054fSI8pEHL8vhjyvKzYm+5z2GK69UfvKTZxTnvvN+Ht242PV7IhrXDnTUTTUMfHpzkbQmowQrY+du7IXnYP/6vcl58I9tpHjR2SnQayoZnfywNl1rw/UufTPZB/8o2Vq/ay/FS86B7Tsgz8IGTk6Acy2MjwGVKjSHR6AsYVBgDz4Q8+tvgH4vvMrcHHL8MZjXn5F6l3/6Lv7eB4J1qYIRZDBEznk18txntkfPOdxfXw2z8+F7eQ73/Bj9+g3Q60X5sEkIjVC+Au9VM0XVmr35IUufx/pvbAEk48YbjUDp/urq38m37Fo6n9lgfTFrMpIkx5BcEGkBfvAYMhq3BPxwiC0dOiyCkeU57NlX0U0mQO3EVyr4eBOrk+8cLFmEvXBNcF1FGTZjoo//1DXwkw3wjBWwcw/Ze9+JOedMGBYhvoiMBGsRAe9Qm1H+5SfwH/+/yEXnYP7oktHgPiwSLCKvewXmda8YjweKooFSiGAvfUvqrZ/YTPHt70PpwsY3LtREqU7wEqIqDlxf7NJy2/Tv5PBu5XSbybp1paouKk497yKdnVXyzDRgRVIGP6GQVNBuOaCxVx3lRLVyV5kNyWoFaNSYUSYmZnLooDdjYfcezJpXwbHPgaIMLtkIumcaf/VXYNFUxXAAxz8XjjxsPAIeE1bl8EOAsn2uTibYxLAkfdkPkDMmWkIZvZ41FY4sR8mKhmbVOB823pWqKhdte+nr/1x+8LXpDMBd/pevzLfsXDkvOAHb8Jqq6H544LbEoGhcf0j4wBbICyDWjKRBIm1inELsUSIAApGseY79rV9t3bnziO3hrv0m/sFHkRVL29g2Nx/c6HCIWttmlCJJVUGcR3o5DAao6aN3/Qi94RZ0MES9Q4YleshB2BedULljCfHuth/iN29Dsgz1ilgLwyHyi89HDlsZPIQxyPwA/y/rg4v2CsuXoD+4KzzfRN4xmBRQRfStKVRdn2zlsq17XgmszbCC/9H9a+zsrGKNNlSxaLOJaJ2ga1LPS4hnU22e861loo38IFBVJvoVSYCf1JXvOi7VLtqY5riLFdg7g/nlFyOnnQhliRoJVjk/wH1mLTLRD9ZXG20vDwtoQ/pSHxSlrX40hLcxAb1KD3/PAxSvuhCOWgUvOAq270LOOAX7ohMShsdddyP6wx9B3kedw/Qy/O59ZJdfjBxxaPAQ1sLsfPAO8wN0dh5/533I7mlYtgi8D2un+6HmNAGRivfq5t0aYG2mpV9arH79KepKwRirHWGIRO4tkackzJGGmw+GsGAifN9VmzcsKv+uEeLTFBDVwdq78PdEXsW+ClSUJVrni96T/dZ5IR3wlevJDO7L30JvuRNZvgQG88E7OI/u2RcstFokpFOVrFkW7/GlQ/dMQ27Be8wLjyX/zufQRQuaAr53LhwGAOfI3vuOsSIRDwGV5lm4/vKl5Fd/uMnI/Ne/h7vwDyIpR7QuDWMUeaPGjar16kWdnqInvGFpVl76p6vN7pmVg5r66PpMbXdM6PKO1WeMQadnyd7/+5jX/XJYcKeYfs7wY1fjP/759qWTCnZliVbQQYEceSi9v/8wOjURFtxamJlj+GvvgE1bYOAxq49FXnV6ADI2FEXEe+xLXojc+PlgcaqYfp/hZX9G+bvvRz7+D+ievciJx9H75AfCoQDIMti5m+EFvwe79oTD9MRmZMki2D0NJzw3bN5ggBiLF0Gy6D2cA+fwlfvVatPU+5AfV/XDZkOLElGP5Dn2lF/ELV0MO/ci/XxMTXKU+arx8xDVHFk5v2vL6kzve+Ql2dxAhiLOKHa0KDta4hGpqg51buUcOtlDXn0arDo8PY3Ll4bFzrKUyU+AjwkvNtmH444ePdGHHgwbn4JiiPmNcwK0Hw4Ra0M2q4qsOhxb3RtAp2fQrdtg3wx69/2waw+ybMko0VI69J4fw45d0MuRPA8QH9Bh2VpDniFbt1Oc9z/RJzeTXf4/ML91HloUiHrK838Xd+td2MsuJnvbryNFAcbiLngn/l/vgbPOIPuLd0FR58WDjt6nw4vGRWDVBplWG+utWEvJSzJ27XohzkUllKTAF9dcOgIUbXQtOI8sXYhOTCBekbIMp7CXoxs2tWRvxRlKzItW7gtr0el96I7dYaFdSA3IMmTpYpidQ456Juas/xZgdYQSw0aUVX3NIf0Jyo9ejf7bI8jBK8ApTE2GfLCLGoXws/lBxbxUTq6yIrwi3ofrT/Sxbzsf3TsLq18QDmYVo835r8ec+Utw/DFoEYCKqsO++SzkZS9Gn30kUlknziGZrVBoHfMZRe2kyDw5eAre8sKMufnnqPpIhSSj0qsGykqLGEUaAhrnYfGSYG2GACzEhpfbsauirxQdV3eNi7WzAxgOQ8z0FUo0BjlgKb4cwKEHwoqlAe1VXqAtDwpqgovTmRn0mq8jC6ZgWAEd71HnE3lgw1+rDwvrTQTxLbptJ8YafLXxZvEiZM1r29S0Qq9qBPPaV4xT1WDOPD2V1mQVwTUo0H2zwYuojiW90mJ0i2YUlYqLfE6mzh/sVFFpSZRu5TouzI4ovQINgBy4FJmaCIABAvviHGzZgeQWBsMmVMdlM4m1mXNzMD0DK4mEtMCSRZD34b6HcNd+k+y/nxmQp2pwgbXQ1nvIctyXv43/t0dg2SJ0WFY0XVusHaVVpXUuSiCfF0yht99D8XsfQJ/3bLBVTbGsUOVgiHnxC5FfPDbEwqIEa3A33Q4PPApTE+hgSKlgDlyObt+NZAExa1GgV38toNAlCxAXeSaR/WlRkrJLiUe9HJz5+eGyCp0JY3RJIm1OmKil4410LsQpwklvgM3OPfhtFaU1P0gqCd0SkViDzg/Q3XuJ1RkKcMCyYPGlUrz1Ctz//kyIqSuWkH/qfwUXW6PDQYH7xBegF/hWiXKVpP7aVRRopOnRoN5mZh698z5kKtBk6jQcTBGYmUWf9+y6bhfqgtbC1h34Bx6FRZNhrXbupfjUNdjzXgsnHx+8lVfkLW9E9uxFH3sC7feqZ43Vce2J6oZKUcShKGZZJt7lKoytJsQpRYw8JZZRVKSuHL6yKbVoTedt2wm79oYX85H1alRaqXQvIia4z+07R9TYcsDysKaZQQofQMf0LszFb0KWLUGHRfh8L0O/dRN+/b2YJQsqoZTpCixGWEEdJ/vOLDhP9jfvwxz9rARUJf8uywZhq/fY816DOe81Ta3OA3r6izBrXp24SHf3j9Gde8LhrkFdV9RFKv/oUvugedbkZiIVfknlsegYJk0ixXJNaB95aComAvTJLTAzF6gtSZ+kLqQ2xl+VgvyWHZhEFw1y0PIQK7wPLneij0w8g+x3f6O9ng15YvnJLyK9LFBh3kVXkk7heYSkS2grduzGD+coPnAV9pTVeHWIsaF6by0MBpgTj8O86ATUuXAPa3DfuxV/30OYyT5+2TLkzFMxa16NL8rKSxj0pvWUr7kYLYbIActDvmq6Xi86xJFEQDtMVqYihUBey9ADIIg2URqyKQT7pPJSIdBejqw6bJTze3wTDApkqanYHRnfy9BUB4Cntoy6/AOWQ78X3I+1ISU46wzk+RUXKiDW4m64Ff+17yILJtC9MzDRCwsWUXyjEaWVFoZCcJBJ2Lecjaxaid++G3//g9DP8a5S0WUWpmdh1RGR9rO66KYt6IOP4PMce+bLYKKPVmQGvRxm59F7foy9/CL08afwX/0u9LK6QNo5ZJJsona0OQpFZsTsMuoPKpvSoyTC5zTeRUBA2rqcLFuErDq8KYTWQMY/+ngq0tX9UshtEfXxTa17qixdDloBixbCzExVzbcJFyqVmsysOpTe1z6ONwbJLMUf/xX+Rw9iFk5WYVDHsFPaUmom8JgcspLsqivDfTryhREX6lx45yqU2AvegLngDUn1IpRkQ98IvQx5x0VkgNv4FP6bNwUQaCTZwJGUIkkaVa2KeNVdmcBmixxUBg2fEGtIVBreL/W/0vKcgwJWHYasPLBJO6RiH/ShxwK096O0vUSrIlXeRWbRxza1Cuj6bgcsR5YvRfftQ6dnMKtfgLz85JaNIbAxsupwWHU4GeA3b0c3bUXyQDJ3mY6knayO75U8QytAopHmJJZg6DCUicSERpXYK/nO70gvH1uxUEJMx5pQTqpbAlRH5Ix1fTsu7llEnMjmTI0+JJ7jUdVWgTWqpEt4w6DsD18PC+T5z4V+Hy2KABqyALP1kY3NC8TNJiMMRP1FnsMTm9G9+2BRBa9LB1MTsOpQ9JHHEPWYC9eERR4WTYVDRaAowvemJnH/52+RjZuQg1YE1/g0Mk+pRUrq0V5gXAYXXo457GCkLBGv6EQfli/Bnng85sUnhCQ8qhbUZLw8uQX3+a/ht+0IxDqxgAoQDzaHBRPoPQ/CzDzS77WCqUT22KY5kvZkaDASfSgT+CFwdqJgF0blfOPEPxKYCvPSExoEKrZK8jdsgo1Phg10PqDI/aifahcjWYZu3oY+/iRy3NGJctu84DnoN25EpvqYY58dTn+1QMkZy3Pczj2UX7gOs2RBABgiI8nD2DDcqOwM8uBjsHcvHHQA+qwjMMc8Gzl6FXLIwfjaq3iXykKN4HfsQo9YiRx5SCAkjAkpldPgDTY+iX/vxwLBMTEBCybb+EfKctVCqrZtwbcg1YB4fpg5Y281lCqxQq2bStToJ6lP1QE9w990B+bi8wNg8B5Rxd/1byGFWLooTTm6/Ut1pcOHF2TnHvTeB6oNDNdnMERvvB2ZnAAjlH/+N2Tv/h1k0cKkRwXnUGvxf/eVYMkrlgbXXAuUbDaGSpPws8yieQZFgSxcQH79Z2HRgvEnznnUGkxFbMfHwx5/DBx/TFoE7iBfv3QxxVv/BFmyMDBFRFIikyrx03Qu7JwIxuHVGW7N5sXeLlo81RNzyABVoxpj0KY3ru3OiZTXzsGCSdx1N2LrRZ8fBAu84dYQW6wN7sAatK4CSIfbq+Xm9VusvxfOf31AnT2D/+4P8OvvgqVLYG4O/fL1DL/ynVCtqOUYmUFLh4hBFk0iyxaj23aDusqlT6PTM2PkUYru3A3bd0GeoyKYbdtxf/sl7NvOh7n5kKJktu1ntBbZuw//91/FD4ZNetPqWCr128wcnLYae+pqvHPhXfMMViwP/KzznY6mcYXsuAfFoIL2RaRQ3TTRm7g9W/b4ut2DlSffbJBzxBUOyGTEUrQVwCaMRaDMZGYG97f/SPahKxor8t+9BZmahN1B2SXz08iBK1rmw4xRLHqFiT7u++sx8wM0zxFVyk9fg+YZMjuH+ZVTMaedhM7NRgyLCVXzXo5ueAr/D9fBsMS+5Y3osw4LZPRgiDx3VdJXoZXgKb/8YnRuvupNAP3ndbhPfxF76ZuQhQuC86oJ/1qKX5b4nXvww0H4ncqbGBG8EQyCzsxhhkXY8Fr8ZW3IB6WTb3fKRhq3pqUVISeSWcHfLI+v251VtOVavKzRug1axlQj6DBtdXLvSmTBFP5L34R3XgSHrQzF1Q1PIMuXkP3ppbDyoABaf+XUSmJgGwZefNSa5V2Q593/MH7dbdgzfwl3293od2/FTE4imSH/yBVwxKH77T90a79BedVnsa97JfmnPtDpbaJKutumFqYmsZf9dvIZ97yjGJx7CeVVn4eli9EnN5G/8zcrIwieR1YsI3v32/eLMBuVXEU1BqLCtdihYVqk0ZPXpHzb0SVJ6A6iMRWMijGshaphxS6U64d73VM9Yw8u1HvxmISQHBMGAkqqiOteDzY8hfvSNzFv+3X8Rz6DLJhEZ+eRU05CTjquBQo1qPCBE9QntsDsfIgHpWse2H/ks2EDP/clGAxgHuTXXhs2b34+SjMiADEoKD/wSURMsD6v6Px8cKGRxDGJTarocNhqTfMcHQww+QTu3R/C79yBOfkkuOxiKMtwaI2B3XspPvmFoEKI3F6N9cRYdH4ec+pqzK+c0m5ebGmSlMpH2CEaEqUp7vpcjBm68qneMLs+MDGcnskD66bdoad8xqBXDJ1zIvXUAGnZ0xFtRtTW4hUWLsB/7svoD+5CH3sSlixENu/A//ONZL/wfHQYFNQ0PXMeYwT/5W+HOFVvsXOwcAp/850UF16Orlsf0OawwP7mmpbfjFVjrgJT37oZ/dE9mGOfjznjtACC8izhniQejlDftb6WdoRXU5OYwaIg04gbccTgnUO37Qx5cIJxpbFUnZ1HZ+faInbdR+F81eNYI8s2TUBrfUwjHY84FPWZsVmp/jOy4wfTyulZButCF95w+NHCmLfnYheXqIpqVGNJ2nDHWKSHiR785An8Az8JBdKihIke/ls3wZ9cimRTbaJfu6prrsNdcx2yeFFAkHWO6Bz0e/gvXBeQ4GCAOeMU5NTV4fb9Xuq2sgrd/d2XUDcI6u/FC8MhqxLy/c2rSP7YavDC1GTTTSQIsmtPeO5KKCyArFiG/Yt3/WwDIryvRFUh+fc/uBN1HhPzyTGBplHreYVyvKrmYkzhy9256kfDbqzzWaiVr7Gybe3mYuVLPpph3l26ogzLMtpWlcosojCsBNlBnlXNHMCCSfwP76f89Frs+a8LLlI9uuGpsHkf+/vQZ1CH7riLR4HFCwOT4zxy4gtg264g2atLOrX15xZ3853oN2/GLD0QeeHzgnUUZWVd7USMqhs2CfGNhLkio/z6e8KCew9Tk+h9D+M+9UXsm97YquSiJpo0PdK0582Y5hmYH+K+8i38Z/8x6G6cT0BKw3pJp28uPJ/LJMuGuI/K1vWb64bPtKnqWWcsKmb23iNqDi/UqRGMdmZLaNRuGXpiNEW6tZvSGpgoqlW5qWZLtuxA9+5DliyK2gN1TAU6kkvmFpmcrGbBkMZAkUBwiwncQr8XrFTHDOWJ1AVxVb/i0IJL2z0dKK7IRasrkaOeiUyEZ9B0gkjU85hyYGKiGLd3Gn10Q6imZKYFLXGbG6NsmKr3uVjx6Ma8cMez646muSV6/LCj8we96Ky+sV8e+LJUrVMK7YxtkdH6WdOfqDVh0L4UBBFS/d08Cwl63a/QGUJQP3+7n5UkcUStHYGAzLTlMF8PTZCu/jECBDpWMQ0SaWM6/nZuSIBu6fs1FGFnqIV0+Ds1VSmsrrGOE00jrehLmthZ9m2WDcS9ceKpf/1K3G7dKRVWm/iM1Vf1pffWOTcoRUwkJ5MOgpLGIhplY7cCrlG3kowZ6qOR0q3LuicqnjF9DfHi+rjNOy7ExD3pkvQhjnQ41qvvtdtv3W6WyNjBT2P6p6rnMCmSTCZipBXJuO07YAXFq5aTtpcN3PDjE9tuv6TbK9+t9Qq8Rzjqtrzcu/OmTMxJc74sDWTjF68SC9WtxppC6bFFye6YLNL6jNIOvWtMWav8a2yHg3ZFNm2PXywH6cxd024fdTLHZXTmTHe+Ql0/HRkzM6JOiiTV2jYCxedDGZUWihg8Wk6aPCt9uT7buvM0uKCAK/ffYl3/QB6+flBk/bNL9Y9Nis08WjYhymvL1WkkYdd4WF3KAySjNzSWaTS6+ubvtslD0xZq1dFRHnGrpHZnzEjUFp16T03Ud+kO6eiMw0jQPH6a1Gg36/hvpD382g7Ii6SCUg1k8Gg5KSYrfflYkfmzhYcHcOWIAsSM2tSVXlljpzbdtNGLvtar3zopWdjEmMesJfEj2YU2LeJJ37q2TaCNvCHqRNUxU5a0O/oxOWk6qitTHTsOJHGPGgMNjaZhaOKH9tuO3Z3bqKPbnjgHTV9EInc6Mtay+iWPlpPYzKlu9TJ47dSm2zcG14n/mQb91H3Y/S3r7yvFn+HRRyYly1R9ocnQAU0ZtwSQaCJDlKhW1bLrfjR2RAekGVAgnVEFWvVixMLg7i7HffwjXbgkI7K0PpDV4ZI47CabI2M3S5Dxlle/f2RmqS5VxrWKFJM2z7zoIw53Rn/L3fc93bQms/9euWoTt95x78C6l3v1t0zaXi7gVGoObWQKVtQ8oonf0e74He2W6OPGE0knAEYzY7o98toMPJCqqiHjM/Y4iHVcZizt0BH2dPygn8R9J6O7xtQZjYybiJCkDhpe0k2YLPfO3zIw5cv7W++496eN2vrpw+6qC+iRR074wcEfNCpvV++YV1+KYCXUlyAa0Ji6Fhlt2JAxE1pTIc7+WR/pjOkYO8iu24ATyUo61+iOQUsGE0krZtZu+jT2nUaHDI1d4holSw0j1PUwmREJw+4mt14mjz/+Hx92Fz2iqf1vceDqs0X5M2uzo0p1FN6XINYIkSy13cA2gY7LXDE+1TTQyH7mQo4RBHfga+qikwaa/eHXFr43OyxBtS5dC2mmQ42Dm5rA6TQkyP6mHiuIy0SyXCwO97Cqvivfdvu13TV/uj+Gn22oqA/xeI3Nt91+rS2Kk7z378OzfdJkWV9EVNWpeqeoxqMnY8Qat1/XQ+vQTjfq0yC6tjIZSThHcEVoFpHOVMFut3HD4Wob/7R606T+GUMxjeOaj26ZKspGUkVpwIn6ap16YmTS2EzQ7V7L99nB8KR82+3XKmtsPQPjv2bkcmTWuuIXDsHklzj0zVbMEXjFizIIL+faZAuRjiZN0aSRUXQ/rrBKrKWTQ7adVF2XKsmExHTggiSTeZ/OpY8ztqbLK85X2+ltyanzYfiOSq2X92p7gJFQ2nL4Ddaaz1EWV8mOu/7rRy6PJvxr2qHnK166CC1fWVKercIpYsxhGaZhHkoU11hAdLa127w4Zini4QdJfiLtAKH9iU86KvDR5JrRljkhmUKl3aF13YmHNZ/Z+Q0rhsyYZvab8x6Pf0LU3JwZuRa/53rZ8cD//6Hnoxt5evq/HVhy3LKy3z9Rvb4YlRM8/mjxerAzstRY09PIkuoUwVfxRWKyuWL9FR9ShmiaX6097V6nJrilsYr6d3wzf0WaJD9qKRBBvU+vFdF3yUD1WrsTJarG2nBN58K1inIog+Fu0M0GHjDK3WrktmxicIdsuPc/9X878P8ANYy2lncPuXgAAAAASUVORK5CYII=";

// ---------------------------------------------------------------------------
// Workbench screens, built to the design canvas (desk-app-xhs): 工作台, 账号档案, 冷启动方案,
// 内容, 发布, 设置. Every action goes through the plugin command endpoint; the backend owns the rules.
// ---------------------------------------------------------------------------

const css2 = `
body{margin:0}
a{color:#b93b07}a:hover{color:#8f2d05}

.xhs-app{color:var(--fn-text-primary,#182230);font-size:13px;min-height:100%;overflow-wrap:anywhere}
.xhs-tabs{display:flex;gap:6px;overflow:auto;border-bottom:1px solid var(--fn-border,#e5e7eb);margin-bottom:16px}
.xhs-tab{border:0;background:transparent;color:var(--fn-text-secondary,#6b7280);padding:9px 12px;cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent;font:inherit}
.xhs-tab.is-active{color:#ff2442;border-bottom-color:#ff2442;font-weight:700}
.xhs-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.xhs-card{background:var(--fn-bg-elevated,#fff);border:1px solid var(--fn-border,#e5e7eb);border-radius:10px;padding:14px;min-width:0;box-sizing:border-box}
.xhs-card h3{margin:0 0 9px;font-size:15px}
.xhs-card h4{margin:12px 0 6px;font-size:13px}
.xhs-meta{color:var(--fn-text-secondary,#6b7280);font-size:12px}
.xhs-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 0;border-bottom:1px solid var(--fn-border,#e5e7eb)}
.xhs-row:last-child{border-bottom:0}
.xhs-btn{border:1px solid var(--fn-border,#e5e7eb);border-radius:7px;background:var(--fn-bg-elevated,#fff);color:var(--fn-text-primary,#182230);padding:7px 11px;cursor:pointer;font:inherit;white-space:nowrap}
.xhs-btn.primary{background:#ff2442;border-color:#ff2442;color:#fff}
.xhs-btn.danger{color:#ff2442}
.xhs-btn:disabled{opacity:.45;cursor:not-allowed}
.xhs-input,.xhs-textarea,.xhs-select{width:100%;box-sizing:border-box;border:1px solid var(--fn-border,#e5e7eb);border-radius:7px;padding:8px;background:var(--fn-bg-elevated,#fff);color:var(--fn-text-primary,#182230);margin-top:5px;font:inherit}
.xhs-textarea{min-height:88px;resize:vertical}
.xhs-field{margin:9px 0;display:block}
.xhs-label{color:var(--fn-text-secondary,#6b7280);font-size:12px}
.xhs-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}
.xhs-pill{display:inline-flex;border-radius:999px;padding:3px 8px;background:var(--fn-bg-secondary,#f7f8fa);color:var(--fn-text-secondary,#6b7280);font-size:11px;white-space:nowrap}
.xhs-pill.ok{color:#149447}.xhs-pill.warn{color:#b7791f}.xhs-pill.bad{color:#ff2442}
.xhs-danger{color:#ff2442}
.xhs-empty{color:var(--fn-text-secondary,#6b7280);text-align:center;padding:28px 10px}
.xhs-preview{width:92px;height:92px;object-fit:cover;border-radius:6px;border:1px solid var(--fn-border,#e5e7eb);margin:4px;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:11px}
.xhs-stack{display:flex;flex-direction:column;gap:12px}
.xhs-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 12px}
.xhs-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 12px}
.xhs-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0 12px}
.xhs-check{display:flex;align-items:flex-start;gap:6px;margin:9px 0}
.xhs-tbl{width:100%;border-collapse:collapse}.xhs-tbl th,.xhs-tbl td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--fn-border,#e5e7eb);font-size:12px}.xhs-tbl th{color:var(--fn-text-secondary,#6b7280);font-weight:500}
.xhs-btn{display:inline-flex;align-items:center;gap:5px}.xhs-tab{display:inline-flex;align-items:center;gap:5px}.xhs-h{display:flex;align-items:center;gap:7px}.xhs-hic{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:7px;background:#fff0f2;color:#ff2442;flex:none}.xhs-tip{display:inline-flex;color:var(--fn-text-tertiary,#9aa1ad);cursor:help}.xhs-dot{width:6px;height:6px;border-radius:50%;background:currentColor;margin-right:5px;align-self:center;flex:none}.xhs-group.is-active{background:#182230;border-color:#182230;color:#fff}.xhs-btn.is-active{background:#182230;border-color:#182230;color:#fff}.xhs-steps{display:grid;gap:10px 8px;margin:4px 0 10px}.xhs-step{display:flex;gap:7px;align-items:flex-start;min-width:0}.xhs-step-n{width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex:none}.xhs-bar{height:6px;border-radius:3px;background:var(--fn-bg-secondary,#f1f1f1);overflow:hidden;margin-top:5px}.xhs-bar>span{display:block;height:100%;background:#ff2442;border-radius:3px}.xhs-bar.ent>span{background:#5b4fc7}.xhs-lane{position:relative;height:26px;border-radius:6px;background:var(--fn-bg-secondary,#f7f8fa);margin:2px 0 8px;overflow:hidden}.xhs-blk{position:absolute;top:3px;bottom:3px;border-radius:4px;font-size:10px;line-height:20px;padding:0 5px;white-space:nowrap;overflow:hidden;box-sizing:border-box}.xhs-now{position:absolute;top:0;bottom:0;width:2px;background:#182230}.xhs-axis{display:flex;justify-content:space-between;font-size:10px;color:var(--fn-text-secondary,#6b7280)}.xhs-tdot{width:5px;height:5px;border-radius:50%;background:#2f5bd7;display:inline-block;margin-left:2px;vertical-align:super;flex:none}.xhs-btn.danger{border-color:#ffc2cb}
  .xhs-tab.active{color:#ff2442;border-bottom-color:#ff2442;font-weight:700}
  .xhs-group.active{background:#182230;border-color:#182230;color:#fff}
  .xhs-thumb .xhs-x{position:absolute;right:2px;top:2px;border:0;border-radius:50%;width:18px;height:18px;line-height:16px;padding:0;background:rgba(0,0,0,.55);color:#fff;cursor:pointer}
  .xhs-pill.nat-marketing,.xhs-chip.nat-marketing{background:#ffe3e7;color:#d81b3c}
  .xhs-pill.nat-life,.xhs-chip.nat-life{background:#eaf7ee;color:#149447}
  .xhs-pill.nat-knowledge,.xhs-chip.nat-knowledge{background:#eef4ff;color:#2f5bd7}

  .xhs-two { display:grid; grid-template-columns:minmax(0,3fr) minmax(0,2fr); gap:12px; align-items:start; }
  .xhs-even { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; align-items:start; }
  .xhs-tbl .xhs-btn { white-space:nowrap; }
  .xhs-tbl td { vertical-align:top; }
  .xhs-app textarea { font:inherit; }
  .xhs-link { border:0; background:none; padding:0; color:#2f5bd7; cursor:pointer; font:inherit; text-align:left; }
  .xhs-link:hover { text-decoration:underline; }
  .xhs-level { border:1px solid ${C.line}; border-radius:10px; padding:12px; cursor:pointer; background:${C.surface}; display:block; }
  .xhs-level.is-active { border-color:${C.red}; }
  .xhs-level.is-off { opacity:.5; cursor:not-allowed; }
  .xhs-chip { display:block; border-radius:6px; padding:4px 6px; margin-bottom:4px; font-size:11px; background:${C.soft}; cursor:grab; }
  .xhs-cell.is-over { background:#fff0f2; }
  .xhs-thumb { position:relative; display:inline-block; margin:4px; border-radius:6px; cursor:pointer; outline:2px solid transparent; }
  .xhs-thumb.is-active { outline-color:${C.red}; }
  .xhs-thumb .xhs-preview { margin:0; display:block; }
  .xhs-thumb .xhs-mark { position:absolute; left:3px; bottom:3px; font-size:10px; background:rgba(0,0,0,.55); color:#fff; border-radius:4px; padding:0 4px; }
  .xhs-ov { position:fixed; inset:0; background:rgba(15,23,42,.38); display:flex; align-items:center; justify-content:center; z-index:60; }
  .xhs-dlg { background:${C.surface}; border-radius:12px; width:min(520px,92vw); max-height:86vh; overflow:auto; padding:18px; box-shadow:0 18px 50px rgba(0,0,0,.2); }
  .xhs-dlg h2 { margin:0 0 4px; font-size:16px; }
  .xhs-toast { position:fixed; left:50%; bottom:28px; transform:translateX(-50%); background:#182230; color:#fff; border-radius:8px; padding:8px 14px; z-index:70; font-size:13px; }
  .xhs-banner { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .xhs-banner.paused { background:#fff0f2; }
  .xhs-pill.src-ai { background:#eef4ff; color:#2f5bd7; } .xhs-pill.src-instruction { background:#fff4e5; color:${C.amber}; } .xhs-pill.src-material { background:#eaf7ee; color:${C.green}; }
  .xhs-blk.publish { background:#ffe3e7; color:#d81b3c; } .xhs-blk.nurture, .xhs-blk.browse { background:#eef4ff; color:#2f5bd7; } .xhs-blk.reply, .xhs-blk.inbox { background:#eaf7ee; color:${C.green}; } .xhs-blk.paused { background:repeating-linear-gradient(45deg,#ececec,#ececec 5px,#f7f7f7 5px,#f7f7f7 10px); color:${C.muted}; }
  .xhs-step-n { background:${C.soft}; color:${C.muted}; } .xhs-step-n.done { background:#eaf7ee; color:${C.green}; }
  @media (max-width:900px) { .xhs-two, .xhs-even, .xhs-2, .xhs-3, .xhs-4 { grid-template-columns:1fr; } }
`;

// Icons taken from the design; looked up by the label they sit next to.
const ICON_PATHS = [
  '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 3v4M17 5h4"/>',
  '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  '<path d="M20 6 9 17l-5-5"/>',
  '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  '<path d="M12 3 4 6v6c0 5 3.4 8.5 8 9 4.6-.5 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9L9.6 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/>',
  '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/>',
  '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
  '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
  '<path d="M12 5v14M5 12h14"/>',
  '<path d="m7.5 4.3 9 5.1"/><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
  '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>',
  '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 21v-4h6v4"/><path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01"/>',
  '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  '<path d="m12 3 2.700 5.600 6.100.900-4.400 4.300 1 6.100L12 17l-5.400 2.900 1-6.100L3.200 9.500l6.100-.900Z"/>',
  '<path d="M3 3v18h18"/><path d="M8 17V11M13 17V7M18 17v-4"/>',
  '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  '<path d="M12 22a10 10 0 1 1 10-10"/><path d="M12 12 18 6"/>',
  '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 2h6"/>',
  '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>',
  '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/>',
  '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  '<path d="m15 18-6-6 6-6"/>',
  '<path d="m9 18 6-6-6-6"/>',
  '<path d="m6 3 14 9-14 9z"/>',
  '<path d="M18 6 6 18M6 6l12 12"/>',
  '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  '<path d="M19 14c1.5-1.5 3-3.200 3-5.500A5.500 5.500 0 0 0 16.500 3c-1.800 0-3 .500-4.500 2-1.500-1.500-2.700-2-4.500-2A5.500 5.500 0 0 0 2 8.500c0 2.300 1.500 4 3 5.500l7 7Z"/>',
  '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
];
const ICON_OF = {
  "h:AI 运营助手": 0,
  "h:系统已为你准备好": 0,
  "h:上一条指令的结果": 1,
  "h:今天": 2,
  "h:账号概览": 3,
  "h:Pixel 8 · 小个子通勤党": 4,
  "h:Redmi K70 · 星河科技官方号": 4,
  "h:Mate 60 · 周末探店的 HR": 4,
  "h:不在队列里": 5,
  "h:排队规则": 6,
  "h:待处理": 5,
  "h:已自动处理 · 近 7 天": 7,
  "h:提醒方式": 8,
  "h:账号健康": 9,
  "h:项目流程 · 星河 · 秋冬通勤": 10,
  "h:项目与目标画像": 11,
  "h:编辑客户资料": 12,
  "h:目标受众画像": 3,
  "h:人设规划与分布审核": 3,
  "h:分布与差异度检查": 9,
  "h:账号人设": 3,
  "h:编辑新号人设": 12,
  "h:账号与设备": 4,
  "h:绑定现有账号的手机": 13,
  "h:号设档案库": 14,
  "h:周末探店的 HR · 人设与兴趣池": 3,
  "h:人物形象素材": 15,
  "h:来源与授权": 16,
  "h:建号流程 · 小个子通勤党": 6,
  "h:手机准备与身份": 4,
  "h:填写与审核资料": 12,
  "h:逐项比较与应用": 17,
  "h:核对本次应用": 9,
  "h:身份与盘点": 18,
  "h:诊断": 9,
  "h:资料变更提案": 12,
  "h:内容与运营建议": 0,
  "h:变更单": 6,
  "h:账号日常预算": 19,
  "h:目标完成量与异常处理": 5,
  "h:2026-10-29 · 第 1 轮": 2,
  "h:确认日常运营": 9,
  "h:分段 1": 10,
  "h:冷启动方案": 20,
  "h:新号进度": 10,
  "h:运营观察": 21,
  "h:浏览规则": 6,
  "h:从已完成浏览生成候选": 0,
  "h:手写评论草稿": 12,
  "h:评论 155 小个子的秋冬通勤外套合集": 1,
  "h:评论 通勤穿搭别再买这三样": 1,
  "h:AI 本周建议": 0,
  "h:内容任务池": 6,
  "h:同一推广任务的 10 篇": 22,
  "h:审核流": 9,
  "h:内容草稿": 23,
  "h:编辑内容": 12,
  "h:笔记预览": 4,
  "h:发布前检查": 9,
  "h:审核记录": 6,
  "h:添加素材": 24,
  "h:生活场景 AI 补图": 0,
  "h:系统整理结果": 0,
  "h:素材资产库": 25,
  "h:内容母版库": 22,
  "h:智能匹配示例": 0,
  "h:配图指令预设": 15,
  "h:我提交的母版候选": 26,
  "h:业务资料": 27,
  "h:排期日历": 2,
  "h:排期提醒": 5,
  "h:批量发布": 28,
  "h:编辑发布批次": 12,
  "h:核对本次发布": 9,
  "h:发布确认": 9,
  "h:运行记录": 10,
  "h:待你审核": 21,
  "h:已自动回复 · 今天": 28,
  "h:意向线索": 29,
  "h:回复规则": 9,
  "h:运营复盘": 30,
  "h:账号 × 日期": 2,
  "h:关键词表现": 31,
  "h:首页与异常": 5,
  "h:异常记录 · 近 7 天": 5,
  "h:根据记录调整下一轮": 32,
  "h:运营备注 · 10-26": 12,
  "h:同步与历史导入演练": 32,
  "h:内容表现": 33,
  "h:已发布笔记": 23,
  "h:按母版": 22,
  "h:反馈到下一轮": 32,
  "h:数据回收": 32,
  "h:从内容到线索": 29,
  "h:自动化程度": 20,
  "h:发布节奏": 34,
  "h:敏感词": 5,
  "h:账号保护": 9,
  "h:授权台账": 16,
  "h:登记新授权": 24,
  "h:撤回或到期后": 5,
  "h:使用边界": 9,
  "h:我的用量与企业额度": 33,
  "h:企业规则": 18,
  "h:没有分配到的能力会这样显示": 18,
  "h:我的申请": 28,
  暂停全部自动任务: 35,
  工作台: 36,
  建号: 3,
  养号: 10,
  内容: 12,
  发布: 28,
  复盘: 30,
  设置: 37,
  总览: 36,
  执行队列: 34,
  异常与告警: 5,
  "发送给 AI": 28,
  手动创作: 12,
  添加素材: 24,
  查看内容计划: 21,
  预览: 21,
  通过: 7,
  退回: 38,
  批量通过所选: 7,
  全部内容计划: 6,
  去审核: 39,
  查看: 21,
  去处理: 39,
  停止此分段: 35,
  查看截图证据: 21,
  提前: 40,
  改时间: 2,
  改期: 2,
  去绑定: 13,
  "我已重新登录，重新核对身份": 7,
  查看受影响任务: 21,
  保持暂停: 35,
  "替换为“托特包通勤”": 17,
  忽略: 41,
  查看处理规则: 21,
  登记平台通知: 24,
  导出健康记录: 42,
  项目: 11,
  人设规划: 3,
  账号与设备: 4,
  账号档案: 14,
  号资料: 23,
  老号接管: 9,
  确认并同步到人设: 7,
  只用于新生成的人设: 7,
  编辑客户资料: 12,
  编辑目标画像: 12,
  生成目标画像: 0,
  新建项目: 24,
  填写结构化: 6,
  原始资料: 23,
  保存客户资料: 7,
  取消: 41,
  保存画像草稿: 7,
  确认画像: 7,
  关闭画像编辑: 41,
  生成候选人设: 0,
  采用为新号: 7,
  重新生成重复的这一个: 32,
  编辑人设: 12,
  确认人设分布: 7,
  保存人设草稿: 7,
  关闭人设编辑: 41,
  绑定手机: 13,
  迁移已有设备: 17,
  保存账号: 7,
  取消绑定编辑: 41,
  查看档案: 21,
  添加自定义角色: 24,
  保存档案: 7,
  上传授权照片: 26,
  生成虚拟人物素材: 0,
  上传授权书: 26,
  调整使用范围: 19,
  重新载入资料: 32,
  我已在手机上选好: 7,
  只读核对小红薯号: 21,
  运行准备检查: 9,
  读取手机当前资料: 21,
  停止当前检查或应用: 35,
  确认并锁定身份: 7,
  查看身份核对截图: 21,
  生成文字资料: 0,
  "生成头像候选（每组 3 张）": 0,
  上传头像候选: 26,
  "生成背景图候选（每组 3 张）": 0,
  上传背景图候选: 26,
  保存公开资料草稿: 7,
  确认公开资料审核: 7,
  查看应用前资料截图: 21,
  预检所选资料变更: 9,
  确认应用到新号: 7,
  重新独立核验: 32,
  查看独立核验截图: 21,
  记录人工核验完成: 7,
  暂停接管: 35,
  释放设备占用: 18,
  撤销方案: 43,
  确认审计基线: 7,
  重新盘点: 32,
  生成诊断: 0,
  重新生成: 32,
  记录采纳意见: 7,
  确认方案: 7,
  采纳到内容计划: 7,
  预检查: 9,
  确认执行: 7,
  取消变更单: 41,
  图片对照: 21,
  观察期复查: 21,
  创建回滚单: 24,
  创建变更单: 24,
  补跑核验: 32,
  人工检查: 21,
  确认复核: 7,
  日常运营: 34,
  冷启动方案: 20,
  评论审核: 1,
  另存为项目默认: 7,
  保存运营预算: 7,
  生成今日计划: 0,
  新建下一轮: 24,
  移除关键词: 43,
  添加关键词: 24,
  保存编辑后的计划: 7,
  预检当前计划: 9,
  预检未执行部分: 9,
  确认本日手机任务已停止: 7,
  确认启动日常运营: 7,
  返回检查: 38,
  查看账号核对截图: 21,
  查看分块截图: 21,
  保存为项目默认方案: 7,
  应用到所选新号: 7,
  暂停: 35,
  提前转日常: 40,
  记录并用于下一轮: 7,
  生成所选候选: 0,
  保存评论草稿: 7,
  保存改写: 7,
  审核通过: 7,
  拒绝: 41,
  预检发送: 9,
  查看评论核验截图: 21,
  只读回查评论: 21,
  确认实际评论: 7,
  内容计划: 6,
  创作编辑器: 12,
  素材库: 25,
  内容母版: 22,
  业务资料: 27,
  采纳: 7,
  生成选题: 0,
  批量通过: 7,
  批量排期: 2,
  批量换账号: 3,
  退回修改: 38,
  新建内容任务: 24,
  重新安排失败任务: 32,
  编辑: 12,
  新建草稿: 24,
  提交为内容母版: 28,
  "AI 润色": 0,
  按母版重写: 0,
  换一个角度: 32,
  上传参考并仿写: 26,
  裁切: 12,
  替换: 17,
  移除: 43,
  生成并插入: 0,
  保存草稿: 7,
  设置发布时间: 2,
  提交审核: 28,
  提交发布: 28,
  一键补上标识与披露: 7,
  重新检查: 32,
  上传图片: 26,
  上传语音: 26,
  上传文件: 26,
  保存素材: 7,
  立即用它生成内容: 20,
  "生成 3 张": 0,
  带人物参考生成: 3,
  确认归属与边界: 7,
  改为公共素材: 12,
  "AI 补图": 0,
  生成内容: 0,
  提交提炼母版: 28,
  用它创作: 12,
  查看示例: 21,
  提交优质内容为母版: 28,
  建议新母版: 1,
  撤回提交: 38,
  保存: 7,
  添加项目: 24,
  添加人员: 24,
  排期日历: 2,
  批量发布: 28,
  发布与历史: 10,
  笔记维护: 1,
  上一周: 38,
  下一周: 39,
  "AI 重新排期": 0,
  "改到 11-04": 12,
  保持: 35,
  编辑批次: 12,
  预检发布批次: 9,
  停止批次: 35,
  新建发布批次: 24,
  移除第1篇: 43,
  移除第2篇: 43,
  添加一篇: 24,
  保存发布批次: 7,
  取消编辑: 41,
  确认启动批次: 7,
  返回修改: 38,
  生成操作预览: 0,
  确认并开始: 7,
  我已核验: 7,
  停止: 35,
  确认手机任务已停止: 7,
  通过并发送: 28,
  记为线索: 29,
  "通过，登录后发送": 7,
  转给同事: 28,
  手写回复: 12,
  删除回复: 43,
  暂停自动回复: 35,
  改回等我通过: 12,
  转交同事: 28,
  导出线索表: 42,
  管理短句: 6,
  复盘报表: 30,
  内容表现: 33,
  保留: 7,
  调整兴趣池: 19,
  编辑画像: 12,
  应用调整并新建下一轮: 7,
  保存运营备注: 7,
  载入最新备注: 32,
  "同步审计 outbox": 32,
  "生成导入 dry-run 报告": 0,
  确认导入本地历史: 7,
  应用到内容计划: 7,
  自动化与风控: 19,
  授权台账: 16,
  能力与配额: 33,
  查看能力与配额: 21,
  测试一段文案: 40,
  撤回: 38,
  续期: 32,
  查看已发布内容: 21,
  我已处理: 7,
  向管理员申请: 28,
  已采用: 7,
  调整计划: 19,
  今天不跑: 41,
  补上标识并通过: 7,
  退回重写: 38,
  "批量通过剩余 7 篇": 7,
  "确认启动 2 篇": 7,
  去绑定手机: 13,
  确认发送一次: 28,
  重新审核: 38,
  已采纳: 7,
  查看盘点截图: 21,
  加入内容计划: 7,
  调整: 19,
  保存素材并生成草稿: 7,
  重新生成图片: 32,
  知道了: 7,
  查看全部: 21,
  删除某条回复: 43,
  "通过并发送 1 条": 28,
  查看执行队列: 21,
  确认并恢复: 7,
  返回: 38,
  "s:待审核内容": 21,
  "s:本周已排期": 2,
  "s:今日养号": 10,
  "s:待处理异常": 5,
  "s:今日任务": 6,
  "s:执行中": 10,
  "s:排队": 34,
  "s:已暂停": 35,
  "s:待处理": 5,
  "s:今日自动暂停": 35,
  "s:7 天内异常": 5,
  "s:健康账号": 9,
  "s:新评论": 1,
  "s:已自动回复": 28,
  "s:待你审核": 21,
  "s:需要注意": 5,
  "s:计划任务数": 6,
  "s:计划篇数": 23,
  "s:手机回执浏览": 21,
  "s:手机回执点赞": 44,
  "s:手机回执收藏": 29,
  "s:手机回执关注": 3,
  "s:未决块": 5,
  "s:有效授权": 7,
  "s:30 天内到期": 34,
  "s:已撤回": 38,
  "s:待补授权书": 5,
  "p:固定": 18,
  "p:待合规复核 · 张法务": 18,
  "p:合规复核人 · 张法务": 18,
  "p:企业母版范围：通用 + 服饰": 18,
  "p:企业规则生效中": 18,
  "p:只读": 18,
  "p:企业规则": 18,
};
const ICON_TIP =
  '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>';

function Icon({ id, size = 14 }) {
  return React.createElement("svg", {
    className: "ic",
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    dangerouslySetInnerHTML: { __html: ICON_PATHS[id] || "" },
  });
}
function ic(key, size) {
  return ICON_OF[key] == null
    ? null
    : React.createElement(Icon, { id: ICON_OF[key], size });
}

async function send(host, command, payload) {
  return host.request("/plugin-apps/xhs-ops/commands", {
    method: "POST",
    body: JSON.stringify({ command, payload }),
  });
}
function toast(text) {
  window.dispatchEvent(new CustomEvent("octop:xhs-toast", { detail: text }));
}
function pill(label, tone, dot) {
  return h(
    "span",
    { className: `xhs-pill${tone ? " " + tone : ""}` },
    dot && h("i", { className: "xhs-dot" }),
    label,
  );
}
function Lock({ children = "固定" }) {
  return h("span", { className: "xhs-pill" }, ic("p:固定", 12), " ", children);
}
function Tip({ text }) {
  return h(
    "span",
    { className: "xhs-tip", title: text, "aria-label": text },
    React.createElement("svg", {
      className: "ic",
      width: 14,
      height: 14,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.75,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
      dangerouslySetInnerHTML: { __html: ICON_TIP },
    }),
  );
}
function Card({ title, icon, tip, right, children, style, className }) {
  return h(
    "section",
    { className: `xhs-card${className ? " " + className : ""}`, style },
    (title || right) &&
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 9,
          },
        },
        h(
          "h3",
          { className: "xhs-h", style: { margin: 0, flex: 1 } },
          h(
            "span",
            { className: "xhs-hic" },
            ic("h:" + (icon || title), 15) || ic("h:内容任务池", 15),
          ),
          h("span", null, title),
          tip && h(Tip, { text: tip }),
        ),
        right,
      ),
    children,
  );
}
function Stat({ label, value, sub }) {
  return h(
    "div",
    { className: "xhs-card" },
    h(
      "div",
      {
        className: "xhs-meta",
        style: { display: "flex", alignItems: "center", gap: 5 },
      },
      ic("s:" + label, 13),
      label,
    ),
    h("div", { style: { fontSize: 20, fontWeight: 700, marginTop: 4 } }, value),
    h("div", { className: "xhs-meta" }, sub || " "),
  );
}
function Stats({ items }) {
  return h(
    "div",
    {
      className: "xhs-grid",
      style: { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" },
    },
    items.map((s) => h(Stat, { key: s.label, ...s })),
  );
}
function Row({ title, sub, extra, children, lead }) {
  return h(
    "div",
    { className: "xhs-row" },
    h(
      "div",
      { style: { minWidth: 0 } },
      lead,
      lead && " ",
      title && h("b", null, title),
      sub && h("div", { className: "xhs-meta" }, sub),
      extra,
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "flex-end",
          flex: "none",
        },
      },
      children,
    ),
  );
}
function Table({ head, body, empty = "暂无数据" }) {
  return body.length
    ? h(
        "table",
        { className: "xhs-tbl" },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            head.map((cell, i) => h("th", { key: i }, cell)),
          ),
        ),
        h(
          "tbody",
          null,
          body.map((row, i) =>
            h(
              "tr",
              { key: i },
              row.map((cell, j) => h("td", { key: j }, cell)),
            ),
          ),
        ),
      )
    : h("div", { className: "xhs-empty" }, empty);
}
function Select({ label, value, onChange, options, disabled, style }) {
  const control = h(
    "select",
    {
      className: "xhs-select",
      value: value ?? "",
      disabled,
      style,
      "aria-label": label,
      onChange: (e) => onChange(e.target.value),
    },
    options.map(([v, l]) => h("option", { key: v, value: v }, l)),
  );
  return label
    ? h(
        "label",
        { className: "xhs-field" },
        h("span", { className: "xhs-label" }, label),
        control,
      )
    : control;
}
function Check({
  label,
  checked,
  onChange,
  disabled,
  type = "checkbox",
  name,
}) {
  return h(
    "label",
    { className: "xhs-check" },
    h("input", {
      type,
      name,
      checked: !!checked,
      disabled,
      onChange: (e) => onChange(e.target.checked),
    }),
    h("span", null, label),
  );
}
// A text or number field that reports its value when the member leaves it, so settings save once.
function Blur({
  label,
  value,
  onCommit,
  type = "text",
  disabled,
  suffix,
  placeholder,
  multiline,
}) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  const props = {
    className: multiline ? "xhs-textarea" : "xhs-input",
    type,
    value: draft,
    disabled,
    placeholder,
    "aria-label": label,
    onChange: (e) => setDraft(e.target.value),
    onBlur: () =>
      String(draft) !== String(value ?? "") &&
      onCommit(type === "number" ? Number(draft) : draft),
  };
  const control = h(multiline ? "textarea" : "input", props);
  return label
    ? h(
        "label",
        { className: "xhs-field" },
        h(
          "span",
          { className: "xhs-label" },
          label,
          suffix ? `（${suffix}）` : "",
        ),
        control,
      )
    : control;
}
function Bar({ ratio, ent }) {
  return h(
    "div",
    { className: `xhs-bar${ent ? " ent" : ""}` },
    h("span", {
      style: { width: `${Math.min(100, Math.round((ratio || 0) * 100))}%` },
    }),
  );
}
function Dialog({ title, desc, onClose, footer, children }) {
  return h(
    "div",
    {
      className: "xhs-ov",
      onClick: (e) => e.target === e.currentTarget && onClose(),
    },
    h(
      "section",
      { className: "xhs-dlg", role: "dialog", "aria-label": title },
      h("h2", null, title),
      desc && h("div", { className: "xhs-meta" }, desc),
      h("div", { style: { margin: "12px 0" } }, children),
      h(
        "div",
        { className: "xhs-actions", style: { justifyContent: "flex-end" } },
        footer,
      ),
    ),
  );
}
function tz(snapshot) {
  return (
    snapshot.data?.operation_clock?.timezone ||
    snapshot.data?.comment_clock?.timezone ||
    "Asia/Shanghai"
  );
}
function fmt(
  value,
  zone,
  opts = {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  },
) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: zone,
      hourCycle: "h23",
      ...opts,
    })
      .format(new Date(value))
      .replace(/\//g, "-");
  } catch {
    return String(value);
  }
}
const dayKey = (iso, zone) =>
  fmt(iso, zone, { year: "numeric", month: "2-digit", day: "2-digit" });
const hm = (iso, zone) =>
  fmt(iso, zone, { hour: "2-digit", minute: "2-digit" });
function localInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function accountName(snapshot, id) {
  const account = rows(snapshot.data.accounts).find((a) => a.id === id);
  return account
    ? account.name || account.label || id
    : id
    ? "已删除的账号"
    : "暂不指定";
}
function deviceName(snapshot, id) {
  const device = rows(snapshot.devices).find((d) => d.device_id === id);
  return device ? device.name || device.device_id : id || "未绑定";
}
function templateName(snapshot, id) {
  return (
    rows(snapshot.data.catalog_cache?.templates).find((t) => t.id === id)
      ?.name || "—"
  );
}
function download(name, text) {
  const url = URL.createObjectURL(
    new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
const csv = (table) =>
  table
    .map((r) =>
      r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
function settingsPayload(snapshot, patch) {
  const saved = snapshot.data.member_settings || {};
  const skip = [
    "paused",
    "paused_at",
    "paused_scope",
    "paused_accounts",
    "cold_start",
    "updated_at",
  ];
  return {
    ...Object.fromEntries(
      Object.entries(saved).filter(([k]) => !skip.includes(k)),
    ),
    ...patch,
  };
}
async function saveSettings(host, snapshot, refresh, patch) {
  await send(host, "settings.save", settingsPayload(snapshot, patch));
  toast("已保存");
  await refresh();
}
const SOURCE_LABELS = {
  ai: "AI 主动",
  instruction: "运营指令",
  manual: "手动创作",
  material: "素材",
};
const NATURE_LABELS = { marketing: "营销", life: "生活", knowledge: "知识" };
const NATURE_MARK = { marketing: "营", life: "生", knowledge: "知" };
const LEVEL_LABELS = { manual: "手动", semi: "半自动", full: "全自动" };
const REVIEW_LABELS = {
  to_make: "待制作",
  pending_review: "待审核",
  returned: "退回修改",
  approved: "待发布",
  scheduled: "待发布",
  published: "已发布",
  failed: "发布失败",
  paused: "已暂停",
};
const KIND_LABELS = {
  small_talk: "闲聊",
  question: "咨询",
  intent: "意向",
  negative: "负面",
  unclear: "待判断",
};
const RUN_LABELS = {
  publish: "发布",
  nurture: "养号",
  browse: "养号",
  reply: "回复",
  inbox: "读取新评论",
  reply_delete: "删除回复",
  audit: "账号审计",
  comment: "评论",
  profile: "资料变更",
};
const MATERIAL_KINDS = {
  experience: "生活经历",
  image: "图片",
  business: "产品与项目资料",
  reference: "内容参考",
  topic: "内容选题",
  file: "语音与文件",
};
const ORIGINS = {
  real: "真实拍摄",
  ai: "AI 生成",
  ai_reconstruct: "AI 重现",
  upload: "运营上传",
  spoken: "本人口述",
};
function srcPill(source) {
  return pill(SOURCE_LABELS[source] || "手动创作", `src-${source || "manual"}`);
}
function checkPills(checks, short) {
  if (!checks) return pill("未检查");
  if (checks.stale) return pill("! 内容已改，需重新检查", "warn");
  const bad = rows(checks.items).filter((i) => i.level === "bad");
  const warn = rows(checks.items).filter((i) => i.level === "warn");
  return h(
    "span",
    { style: { display: "inline-flex", gap: 4, flexWrap: "wrap" } },
    !bad.length &&
      !warn.length &&
      pill(short ? "✓ 通过" : "✓ 发布前检查通过", "ok"),
    bad.map((i) =>
      h(
        "span",
        { key: i.key, className: "xhs-pill bad", title: i.detail },
        "✕ " + i.label,
      ),
    ),
    warn.map((i) =>
      h(
        "span",
        { key: i.key, className: "xhs-pill warn", title: i.detail },
        "! " + i.detail,
      ),
    ),
  );
}
function draftStatus(snapshot, d) {
  const failed =
    rows(snapshot.data.runs).some(
      (r) =>
        r.kind === "publish" &&
        r.draft_id === d.id &&
        ["error", "failed"].includes(r.status),
    ) && d.review_status !== "published";
  return failed ? "failed" : d.review_status || "pending_review";
}
function stageText(snapshot, a) {
  const stage = (snapshot.data.cold_start_status || {})[a.id];
  if (stage)
    return stage.graduated
      ? `日常运营 · 第 ${stage.day} 天`
      : `冷启动 · 第 ${stage.day} 天`;
  if (a.entry_mode === "existing")
    return a.plan_confirmed ? "接管 · 观察期" : "接管";
  return a.device_id ? "建号 · 资料待核验" : "建号";
}
function natureMix(snapshot, id, days = 7) {
  const since = Date.now() - days * 86400000;
  const mine = rows(snapshot.data.drafts).filter(
    (d) =>
      d.account_id === id &&
      d.review_status === "published" &&
      new Date(d.published_at || d.updated_at || 0).getTime() >= since,
  );
  return {
    total: mine.length,
    marketing: mine.filter((d) => d.nature === "marketing").length,
    life: mine.filter((d) => d.nature !== "marketing").length,
  };
}

// ---- 暂停全部自动任务 ----
function PauseDialog({ snapshot, host, refresh, onClose }) {
  const [range, setRange] = useState("all");
  const [projectId, setProjectId] = useState(
    rows(snapshot.data.projects)[0]?.id || "",
  );
  const [accountIds, setAccountIds] = useState([]);
  const [scope, setScope] = useState({
    nurture: true,
    publish: true,
    reply: true,
    collect: true,
  });
  return h(
    Dialog,
    {
      title: "暂停全部自动任务",
      desc: "用于平台提示异常、舆情或需要全部停下来核对的时候。",
      onClose,
      footer: [
        h(Button, { key: "c", onClick: onClose }, "取消"),
        h(
          Button,
          {
            key: "ok",
            danger: true,
            disabled:
              !Object.values(scope).some(Boolean) ||
              (range === "accounts" && !accountIds.length),
            onClick: async () => {
              await send(host, "pause.set", {
                paused: true,
                scope: Object.keys(scope).filter((k) => scope[k]),
                ...(range === "project" ? { project_id: projectId } : {}),
                ...(range === "accounts" ? { account_ids: accountIds } : {}),
              });
              onClose();
              toast("已暂停");
              await refresh();
            },
          },
          "暂停",
        ),
      ],
    },
    h("div", { className: "xhs-label" }, "范围"),
    h(
      "div",
      { style: { display: "flex", gap: 14, flexWrap: "wrap" } },
      [
        ["all", "我的全部账号"],
        ["project", "只暂停这个项目"],
        ["accounts", "只暂停选中的账号"],
      ].map(([k, l]) =>
        h(Check, {
          key: k,
          type: "radio",
          name: "xhs-pause-range",
          label: l,
          checked: range === k,
          onChange: () => setRange(k),
        }),
      ),
    ),
    range === "project" &&
      h(Select, {
        label: "项目",
        value: projectId,
        onChange: setProjectId,
        options: rows(snapshot.data.projects).map((p) => [p.id, p.name]),
      }),
    range === "accounts" &&
      h(
        "div",
        { style: { display: "flex", gap: 14, flexWrap: "wrap" } },
        rows(snapshot.data.accounts).map((a) =>
          h(Check, {
            key: a.id,
            label: a.name || a.id,
            checked: accountIds.includes(a.id),
            onChange: (on) =>
              setAccountIds(
                on
                  ? [...accountIds, a.id]
                  : accountIds.filter((x) => x !== a.id),
              ),
          }),
        ),
      ),
    h("div", { className: "xhs-label", style: { marginTop: 8 } }, "包括"),
    h(
      "div",
      { style: { display: "flex", gap: 14, flexWrap: "wrap" } },
      [
        ["nurture", "养号"],
        ["publish", "发布"],
        ["reply", "评论与回复发送"],
        ["collect", "数据回收"],
      ].map(([k, l]) =>
        h(Check, {
          key: k,
          label: l,
          checked: scope[k],
          onChange: (on) => setScope({ ...scope, [k]: on }),
        }),
      ),
    ),
    h(
      "div",
      { className: "xhs-card", style: { background: C.soft, marginTop: 8 } },
      "正在执行的分段会在当前这一篇结束后停下。已排期的内容保留，恢复后按原时间继续，过期的需要重新排期。",
    ),
  );
}
function PauseButton({ snapshot, host, readOnly, refresh }) {
  const settings = snapshot.data.member_settings || {};
  const eff = snapshot.data.effective_policy || {};
  const [open, setOpen] = useState(false);
  return h(
    "span",
    { style: { display: "inline-flex", gap: 6, alignItems: "center" } },
    eff.enterprise_paused && pill("企业已暂停", "bad", true),
    h(
      "span",
      { className: "xhs-pill ok" },
      `${LEVEL_LABELS[eff.automation_level] || "半自动"} · 关键动作需你确认`,
    ),
    settings.paused
      ? h(
          Button,
          {
            disabled: readOnly,
            onClick: async () => {
              await send(host, "pause.set", { paused: false });
              toast("已恢复");
              await refresh();
            },
          },
          "恢复自动任务",
        )
      : h(
          Button,
          { disabled: readOnly, onClick: () => setOpen(true) },
          "暂停全部自动任务",
        ),
    open &&
      h(PauseDialog, {
        snapshot,
        host,
        refresh,
        onClose: () => setOpen(false),
      }),
  );
}

// ---- 向管理员申请 ----
function RequestDialog({ host, refresh, onClose }) {
  const [kinds, setKinds] = useState(["posts"]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  return h(
    Dialog,
    {
      title: "向管理员申请",
      onClose,
      footer: [
        h(Button, { key: "c", onClick: onClose }, "取消"),
        h(
          Button,
          {
            key: "ok",
            primary: true,
            disabled: !kinds.length,
            onClick: async () => {
              await send(host, "request.create", { kinds, amount, note });
              onClose();
              toast("已提交申请");
              await refresh();
            },
          },
          "提交申请",
        ),
      ],
    },
    h("div", { className: "xhs-label" }, "申请内容"),
    h(
      "div",
      { style: { display: "flex", gap: 14, flexWrap: "wrap" } },
      [
        ["posts", "更多内容额度"],
        ["images", "更多生图额度"],
        ["accounts", "更多账号"],
        ["feature", "未分配的能力"],
        ["templates", "医疗美容母版"],
      ].map(([k, l]) =>
        h(Check, {
          key: k,
          label: l,
          checked: kinds.includes(k),
          onChange: (on) =>
            setKinds(on ? [...kinds, k] : kinds.filter((x) => x !== k)),
        }),
      ),
    ),
    h(Field, {
      label: "期望数量",
      value: amount,
      onChange: setAmount,
      placeholder: "例如：每月内容 80 篇",
    }),
    h(Field, {
      label: "说明",
      multiline: true,
      value: note,
      onChange: setNote,
      placeholder: "管理员会在企业后台「插件 → 小红薯运营」里看到这条申请",
    }),
  );
}

// ---- 总览 ----
function OverviewPanel({ snapshot, host, readOnly, refresh, modelRef, go }) {
  const data = snapshot.data;
  const zone = tz(snapshot);
  const drafts = rows(data.drafts);
  const pending = drafts.filter(
    (d) => (d.review_status || "pending_review") === "pending_review",
  );
  const weekEnd = Date.now() + 7 * 86400000;
  const scheduled = drafts.filter(
    (d) =>
      d.review_status === "scheduled" &&
      d.scheduled_at &&
      new Date(d.scheduled_at).getTime() <= weekEnd,
  );
  const queue = rows(data.queue);
  const nurture = queue.filter((q) => ["nurture", "browse"].includes(q.kind));
  const publish = queue.filter((q) => q.kind === "publish");
  const alerts = rows(data.alerts).filter((a) => a.level === "action");
  const health = rows(data.account_health);
  const eff = data.effective_policy || {};
  const plan = data.last_plan;
  const tasks = rows(data.content_tasks);
  const [instruction, setInstruction] = useState("");
  const manual = eff.automation_level === "manual";
  const approvable = pending
    .filter((d) => d.checks && !d.checks.blocking && !d.checks.stale)
    .slice(0, 4);
  const replyItems = rows(data.reply_items);
  return h(
    "div",
    { className: "xhs-stack" },
    h(Stats, {
      items: [
        {
          label: "待审核内容",
          value: pending.length,
          sub: `其中 ${
            pending.filter((d) => d.source === "ai").length
          } 篇来自 AI 主动`,
        },
        {
          label: "本周已排期",
          value: scheduled.length,
          sub: `覆盖 ${
            new Set(scheduled.map((d) => d.account_id)).size
          } 个账号`,
        },
        {
          label: "今日养号",
          value: `${
            nurture.filter((q) => ["running", "preparing"].includes(q.status))
              .length
          } / ${rows(data.accounts).length}`,
          sub: "执行中 / 账号数",
        },
        {
          label: "待处理异常",
          value: alerts.length,
          sub: `${
            health.filter((x) => x.state === "paused").length
          } 个已自动暂停`,
        },
      ],
    }),
    h(
      "div",
      { className: "xhs-2", style: { gap: 12, alignItems: "start" } },
      h(
        "div",
        { className: "xhs-stack" },
        h(
          Card,
          {
            title: "AI 运营助手",
            tip: "像聊天一样下发运营要求，系统会拆成内容任务，放进「内容计划」等你审核。",
          },
          manual &&
            h(
              "div",
              { className: "xhs-meta" },
              "当前为手动档，AI 不会准备内容。可在 设置 › 自动化与风控 调整。",
            ),
          h("textarea", {
            className: "xhs-textarea",
            style: { minHeight: 64 },
            value: instruction,
            disabled: readOnly || manual,
            "aria-label": "运营要求",
            placeholder:
              "例如：下周重点推广秋冬通勤大衣，准备 10 篇不同角度的内容",
            onChange: (e) => setInstruction(e.target.value),
          }),
          h(
            "div",
            {
              style: {
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                marginTop: 8,
              },
            },
            [
              "最近几个账号生活内容偏少，加一些咖啡和探店",
              "这个月小个子穿搭效果不错，继续准备下一批选题",
              "给新号各准备 2 篇人设类内容",
            ].map((s) =>
              h(
                "button",
                {
                  key: s,
                  className: "xhs-pill",
                  style: { border: 0, cursor: "pointer" },
                  onClick: () => setInstruction(s),
                },
                s,
              ),
            ),
          ),
          h(
            "div",
            { className: "xhs-actions" },
            h(
              Button,
              {
                primary: true,
                disabled: readOnly || !instruction.trim() || manual,
                onClick: async () => {
                  await send(host, "plan.generate", {
                    instruction,
                    model_ref: modelRef || undefined,
                  });
                  setInstruction("");
                  await refresh();
                },
              },
              "发送给 AI",
            ),
            h(
              Button,
              { onClick: () => go("content", "editor", "new") },
              "手动创作",
            ),
            h(
              Button,
              { onClick: () => go("content", "materials") },
              "添加素材",
            ),
            h(Button, { onClick: () => go("content", "plan") }, "查看内容计划"),
          ),
        ),
        h(
          Card,
          {
            title: "系统已为你准备好",
            tip: "按账号人设、近期发布和素材准备的草稿。通过前会再做一次发布前检查。",
          },
          pending.slice(0, 4).map((d) =>
            h(
              Row,
              {
                key: d.id,
                title: d.title,
                sub: `${accountName(
                  snapshot,
                  d.account_id,
                )} · 母版 ${templateName(snapshot, d.template_id)}`,
                extra: h(
                  "div",
                  {
                    style: {
                      marginTop: 5,
                      display: "flex",
                      gap: 5,
                      flexWrap: "wrap",
                    },
                  },
                  srcPill(d.source),
                  checkPills(d.checks),
                ),
              },
              h(
                Button,
                { onClick: () => go("content", "editor", d.id) },
                "预览",
              ),
              h(
                Button,
                {
                  primary: true,
                  disabled: readOnly,
                  onClick: async () => {
                    await send(host, "plan.update", {
                      action: "approve",
                      ids: [d.id],
                    });
                    await refresh();
                  },
                },
                "通过",
              ),
              h(
                Button,
                {
                  disabled: readOnly,
                  onClick: async () => {
                    await send(host, "plan.update", {
                      action: "return",
                      ids: [d.id],
                    });
                    await refresh();
                  },
                },
                "退回",
              ),
            ),
          ),
          !pending.length &&
            h("div", { className: "xhs-empty" }, "没有待审核的内容"),
          h(
            "div",
            { className: "xhs-actions" },
            h(
              Button,
              {
                primary: true,
                disabled: readOnly || !approvable.length,
                onClick: async () => {
                  await send(host, "plan.update", {
                    action: "approve",
                    ids: approvable.map((d) => d.id),
                  });
                  await refresh();
                },
              },
              "批量通过所选",
            ),
            h(Button, { onClick: () => go("content", "plan") }, "全部内容计划"),
          ),
        ),
      ),
      h(
        "div",
        { className: "xhs-stack" },
        h(
          Card,
          {
            title: "上一条指令的结果",
            tip: "指令会被拆成多个内容任务，各自匹配母版和账号。",
          },
          plan
            ? [
                h(
                  Row,
                  {
                    key: "a",
                    title: `已拆成 ${plan.count} 个内容任务`,
                    sub: `匹配母版：${
                      rows(plan.templates)
                        .map((id) => templateName(snapshot, id))
                        .filter((n) => n !== "—")
                        .join(" · ") || "未使用母版"
                    }`,
                  },
                  pill(`${pending.length} 篇待审核`, "warn", true),
                  pill(
                    `${
                      tasks.filter((t) => t.status === "making").length
                    } 篇制作中`,
                  ),
                ),
                h(
                  Row,
                  {
                    key: "b",
                    title: "已推荐发布账号与时间",
                    sub: `${
                      new Set(tasks.map((t) => t.account_id).filter(Boolean))
                        .size
                    } 个账号 · 同一账号间隔 ≥ ${
                      eff.min_interval_hours ?? 48
                    } 小时`,
                  },
                  h(
                    Button,
                    { primary: true, onClick: () => go("content", "plan") },
                    "去审核",
                  ),
                ),
                tasks.some((t) => t.status === "to_make") &&
                  h(
                    Row,
                    {
                      key: "c",
                      title: "需要你补充",
                      sub: `${
                        tasks.filter((t) => t.status === "to_make").length
                      } 个任务还没有制作，缺素材时可以先添加`,
                    },
                    h(
                      Button,
                      { onClick: () => go("content", "materials") },
                      "添加素材",
                    ),
                  ),
              ]
            : h("div", { className: "xhs-empty" }, "还没有下发过指令"),
        ),
        h(
          Card,
          { title: "今天" },
          h(
            Row,
            {
              title: "养号",
              sub: `${rows(data.accounts).length} 个账号 · ${
                nurture.filter((q) => q.status === "running").length
              } 个执行中 · ${
                nurture.filter((q) =>
                  ["completed", "success"].includes(q.status),
                ).length
              } 个已完成 · ${
                nurture.filter((q) => q.status === "paused").length
              } 个已暂停`,
            },
            h(Button, { onClick: () => go("nurture", "operations") }, "查看"),
          ),
          h(
            Row,
            {
              title: "发布",
              sub: `${publish.length} 篇已排期 · ${
                publish.filter((q) => q.status === "awaiting_confirmation")
                  .length
              } 篇到点待你确认 · ${
                publish.filter((q) => q.status === "paused").length
              } 篇已暂停`,
            },
            h(Button, { onClick: () => go("publish", "runs") }, "查看"),
          ),
          h(
            Row,
            {
              title: "评论审核",
              sub: `${
                rows(data.comments).filter((c) =>
                  ["draft", "pending", "candidate"].includes(c.status),
                ).length
              } 条候选评论待审核`,
            },
            h(Button, { onClick: () => go("nurture", "comments") }, "查看"),
          ),
          h(
            Row,
            {
              title: "笔记维护",
              sub: `${
                replyItems.filter((i) => i.status === "new").length
              } 条待你审核 · 已自动回复 ${
                replyItems.filter((i) => i.auto && i.status === "sent").length
              } 条闲聊`,
            },
            h(Button, { onClick: () => go("publish", "upkeep") }, "查看"),
          ),
          h(
            Row,
            {
              title: "需要处理",
              sub: alerts[0]
                ? `${
                    alerts[0].account_id
                      ? accountName(snapshot, alerts[0].account_id)
                      : ""
                  }${alerts[0].label}`
                : "没有需要你处理的异常",
            },
            alerts.length > 0 &&
              h(
                Button,
                { danger: true, onClick: () => go("home", "alerts") },
                "去处理",
              ),
          ),
        ),
      ),
    ),
    h(
      Card,
      { title: "账号概览" },
      h(Table, {
        head: [
          "账号",
          "接入",
          "手机",
          "阶段",
          "近 7 天发布",
          "内容结构",
          "状态",
        ],
        body: rows(data.accounts).map((a) => {
          const hl = health.find((x) => x.account_id === a.id) || {};
          const mix = natureMix(snapshot, a.id);
          return [
            h(
              "button",
              {
                className: "xhs-link",
                onClick: () => go("build", "profile", a.id),
              },
              a.name || a.id,
            ),
            a.entry_mode === "existing" ? "已有账号" : "新账号",
            deviceName(snapshot, a.device_id),
            stageText(snapshot, a),
            mix.total ? `${mix.total} 篇` : "—",
            mix.total ? `营销 ${mix.marketing} · 生活 ${mix.life}` : "—",
            pill(
              hl.login === "lost"
                ? "需重新登录"
                : hl.state === "healthy"
                ? "正常"
                : hl.state === "paused"
                ? "已暂停"
                : hl.state === "transferring"
                ? "转交中"
                : "待配置",
              hl.state === "healthy"
                ? "ok"
                : hl.state === "paused" || hl.login === "lost"
                ? "bad"
                : "warn",
              true,
            ),
          ];
        }),
        empty: "还没有账号",
      }),
      h(
        "div",
        { className: "xhs-meta", style: { marginTop: 8 } },
        "“内容结构”偏营销的账号，系统会在下一批建议里优先安排生活和兴趣内容。",
      ),
    ),
  );
}

// ---- 执行队列 ----
function QueuePanel({ snapshot, host, readOnly, refresh, go }) {
  const zone = tz(snapshot);
  const queue = rows(snapshot.data.queue);
  const settings = snapshot.data.member_settings || {};
  const devices = [...new Set(queue.map((q) => q.device_id).filter(Boolean))];
  const unbound = rows(snapshot.data.accounts).filter((a) => !a.device_id);
  const [moving, setMoving] = useState(null);
  const hour = (iso) => {
    const [a, b] = hm(iso, zone).split(":");
    return Number(a) + Number(b) / 60;
  };
  const pos = (v) => `${Math.max(0, Math.min(93, ((v - 8) / 15) * 100))}%`;
  const done = queue.filter((q) =>
    ["completed", "success", "operator_verified"].includes(q.status),
  ).length;
  const waiting = queue.filter((q) =>
    ["queued", "planned", "awaiting_confirmation"].includes(q.status),
  );
  const paused = queue.filter((q) => q.status === "paused");
  const deviceCard = (deviceId) => {
    const items = queue.filter((q) => q.device_id === deviceId);
    const state = items.some((i) => i.status === "running")
      ? ["执行中", "ok"]
      : items.some((i) => i.status === "paused")
      ? ["队列已暂停", "bad"]
      : items.every((i) => ["completed", "success"].includes(i.status))
      ? ["今日已完成", "ok"]
      : ["排队", ""];
    return h(
      Card,
      {
        key: deviceId,
        title: `${deviceName(snapshot, deviceId)} · ${accountName(
          snapshot,
          items[0]?.account_id,
        )}`,
        right: pill(state[0], state[1], true),
      },
      h(
        "div",
        { className: "xhs-axis" },
        [8, 11, 14, 17, 20, 23].map((x) =>
          h("span", { key: x }, `${String(x).padStart(2, "0")}:00`),
        ),
      ),
      h(
        "div",
        { className: "xhs-lane" },
        items.map((i) =>
          h(
            "span",
            {
              key: i.id,
              className: `xhs-blk ${i.status === "paused" ? "paused" : i.kind}`,
              style: { left: pos(hour(i.at)), width: "7%" },
            },
            RUN_LABELS[i.kind] || i.kind,
          ),
        ),
        h("span", {
          className: "xhs-now",
          style: { left: pos(hour(new Date().toISOString())) },
        }),
      ),
      items.map((i) =>
        h(
          Row,
          {
            key: i.id,
            title: `${hm(i.at, zone)} ${RUN_LABELS[i.kind] || i.kind}${
              i.title ? `「${i.title}」` : ""
            }`,
            sub:
              i.error ||
              (i.status === "awaiting_confirmation"
                ? "已审核 · 到点后需要你确认才执行"
                : ""),
          },
          pill(
            i.status === "awaiting_confirmation"
              ? "到点待你确认"
              : i.status === "awaiting_verification"
              ? "已发 · 待人工核验"
              : i.status === "planned" || i.status === "queued"
              ? "排队"
              : statusLabel(i.status),
            i.status === "running"
              ? "ok"
              : ["paused", "awaiting_verification", "unknown"].includes(
                  i.status,
                )
              ? "warn"
              : "",
            i.status !== "planned",
          ),
          i.source === "run" &&
            i.status === "running" &&
            h(
              Button,
              {
                disabled: readOnly,
                onClick: async () => {
                  await send(host, "run.cancel", {
                    run_id: i.id,
                    confirmed: true,
                  });
                  await refresh();
                },
              },
              "停止此分段",
            ),
          i.status === "awaiting_verification" &&
            h(Button, { onClick: () => go("publish", "runs") }, "查看截图证据"),
          i.source === "schedule" &&
            i.kind === "publish" &&
            h(
              Button,
              {
                disabled: readOnly,
                onClick: () => setMoving({ id: i.id, at: localInput(i.at) }),
              },
              i.status === "paused" ? "改期" : "改时间",
            ),
          ["login_required", "phone_interaction_required"].includes(i.error) &&
            h(
              Button,
              { danger: true, onClick: () => go("home", "alerts") },
              "去处理",
            ),
        ),
      ),
    );
  };
  const half = Math.ceil(devices.length / 2);
  return h(
    "div",
    { className: "xhs-stack" },
    h(Stats, {
      items: [
        {
          label: "今日任务",
          value: queue.length,
          sub: `${devices.length} 台手机 · 已完成 ${done}`,
        },
        {
          label: "执行中",
          value: queue.filter((q) =>
            ["running", "preparing"].includes(q.status),
          ).length,
          sub: deviceName(
            snapshot,
            queue.find((q) => q.status === "running")?.device_id,
          ),
        },
        {
          label: "排队",
          value: waiting.length,
          sub: waiting[0] ? `下一项 ${hm(waiting[0].at, zone)}` : "",
        },
        {
          label: "已暂停",
          value: paused.length,
          sub: paused[0] ? `${deviceName(snapshot, paused[0].device_id)}` : "",
        },
      ],
    }),
    moving &&
      h(
        Dialog,
        {
          title: "改时间",
          onClose: () => setMoving(null),
          footer: [
            h(Button, { key: "c", onClick: () => setMoving(null) }, "取消"),
            h(
              Button,
              {
                key: "ok",
                primary: true,
                disabled: !moving.at,
                onClick: async () => {
                  await send(host, "plan.update", {
                    action: "schedule",
                    ids: [moving.id],
                    scheduled_at: new Date(moving.at).toISOString(),
                  });
                  setMoving(null);
                  await refresh();
                },
              },
              "保存",
            ),
          ],
        },
        h("input", {
          className: "xhs-input",
          type: "datetime-local",
          "aria-label": "新的发布时间",
          value: moving.at,
          onChange: (e) => setMoving({ ...moving, at: e.target.value }),
        }),
      ),
    h(
      "div",
      { className: "xhs-2", style: { gap: 12, alignItems: "start" } },
      h(
        "div",
        { className: "xhs-stack" },
        devices.length
          ? devices.slice(0, half).map(deviceCard)
          : h(
              Card,
              { title: "今天还没有任务" },
              h(
                "div",
                { className: "xhs-empty" },
                "到点的发布、养号和回复会出现在这里。",
              ),
            ),
      ),
      h(
        "div",
        { className: "xhs-stack" },
        devices.slice(half).map(deviceCard),
        unbound.length > 0 &&
          h(
            Card,
            { title: "不在队列里" },
            unbound.map((a) =>
              h(
                Row,
                {
                  key: a.id,
                  title: a.name,
                  sub: "未绑定手机，排期的发布无法执行",
                },
                h(Button, { onClick: () => go("build", "accounts") }, "去绑定"),
              ),
            ),
          ),
        h(
          Card,
          { title: "排队规则" },
          h(
            "div",
            { className: "xhs-meta" },
            "这里只排队和提示冲突，不改你定好的发布时间。",
          ),
          h(
            Row,
            { title: "同一台手机一次只执行一个任务", sub: "不自动切换账号" },
            h(Lock),
          ),
          h(
            Row,
            {
              title: "手机离线或登录失效",
              sub: "暂停这台手机的队列，不换手机执行",
            },
            h(Lock),
          ),
          h(
            Row,
            { title: "到点的发布" },
            h(Select, {
              label: "",
              value: settings.publish_slot || "between_blocks",
              disabled: readOnly,
              onChange: (v) =>
                saveSettings(host, snapshot, refresh, { publish_slot: v }),
              options: [
                ["between_blocks", "插在两个浏览块之间"],
                ["strict", "严格按时间先后"],
              ],
            }),
          ),
          h(
            Row,
            { title: "资料变更当天", sub: "沿用「自动化与风控」的设置" },
            pill(
              settings.profile_change_day === "publish_only"
                ? "只发布"
                : "不发布、不养号",
            ),
          ),
          h(
            Row,
            { title: "闲聊类自动回复", sub: "排在其他任务之间，手机忙时顺延" },
            pill("低优先级"),
          ),
          h(
            "div",
            { className: "xhs-2" },
            h(Blur, {
              label: "每台手机每天最多自动执行",
              suffix: "小时",
              type: "number",
              value: settings.device_daily_hours ?? 4,
              disabled: readOnly,
              onCommit: (v) =>
                saveSettings(host, snapshot, refresh, {
                  device_daily_hours: v,
                }),
            }),
            h(Blur, {
              label: "两个任务之间至少间隔",
              suffix: "分钟",
              type: "number",
              value: settings.task_gap_minutes ?? 5,
              disabled: readOnly,
              onCommit: (v) =>
                saveSettings(host, snapshot, refresh, { task_gap_minutes: v }),
            }),
          ),
        ),
      ),
    ),
  );
}

// ---- 异常与告警 ----
const HANDLED = {
  unknown: "停下，等人工对账",
  interrupted: "停止分段，对账后未补跑",
  run_failed: "停下，记录原因",
};
function AlertsPanel({ snapshot, host, readOnly, refresh, go }) {
  const zone = tz(snapshot);
  const list = rows(snapshot.data.alerts);
  const settings = snapshot.data.member_settings || {};
  const action = list.filter((a) => a.level === "action");
  const suggest = list.filter((a) => a.level === "suggest");
  const handled = list.filter(
    (a) => a.level !== "action" && a.level !== "suggest",
  );
  const health = rows(snapshot.data.account_health);
  const [notice, setNotice] = useState(null);
  const set = (patch) => saveSettings(host, snapshot, refresh, patch);
  const name = (a) =>
    a.account_id
      ? `${accountName(snapshot, a.account_id)} · ${a.label}`
      : a.label;
  return h(
    "div",
    { className: "xhs-stack" },
    h(Stats, {
      items: [
        {
          label: "待处理",
          value: action.length,
          sub: `${
            action.filter((a) =>
              ["login_required", "phone_interaction_required"].includes(a.code),
            ).length
          } 个需要你在手机上操作`,
        },
        {
          label: "今日自动暂停",
          value: health.filter((x) => x.state === "paused").length,
          sub: accountName(
            snapshot,
            health.find((x) => x.state === "paused")?.account_id,
          ),
        },
        {
          label: "7 天内异常",
          value: list.length,
          sub: `${handled.length} 次已自动处理`,
        },
        {
          label: "健康账号",
          value: `${health.filter((x) => x.state === "healthy").length} / ${
            health.length
          }`,
          sub: `${
            health.filter((x) => x.state === "unconfigured").length
          } 个待配置 · ${
            health.filter((x) => x.state === "paused").length
          } 个已暂停`,
        },
      ],
    }),
    h(
      "div",
      { className: "xhs-2", style: { gap: 12, alignItems: "start" } },
      h(
        "div",
        { className: "xhs-stack" },
        h(
          Card,
          { title: "待处理" },
          action.map((a) =>
            h(
              Row,
              {
                key: a.id,
                lead: pill("需要你处理", "bad", true),
                title: name(a),
                sub: `${fmt(a.at, zone)} · ${
                  RUN_LABELS[a.kind] || "账号"
                } · 已停下，没有重试，也没有换手机`,
              },
              [
                "login_required",
                "phone_interaction_required",
                "account_paused",
              ].includes(a.code) &&
                h(
                  Button,
                  { primary: true, onClick: () => go("build", "accounts") },
                  "我已重新登录，重新核对身份",
                ),
              ["unknown", "interrupted"].includes(a.code) &&
                h(Button, { onClick: () => go("publish", "runs") }, "去对账"),
              a.kind === "authorization" &&
                h(
                  Button,
                  { onClick: () => go("settings", "consent") },
                  "去处理",
                ),
              a.code === "transfer_incoming" &&
                h(
                  Button,
                  { primary: true, onClick: () => go("build", "profile") },
                  "去接收",
                ),
              a.account_id &&
                h(
                  Button,
                  { onClick: () => go("home", "queue") },
                  "查看受影响任务",
                ),
              h(
                Button,
                {
                  disabled: readOnly,
                  onClick: async () => {
                    await send(host, "alert.dismiss", { id: a.id });
                    await refresh();
                  },
                },
                "保持暂停",
              ),
            ),
          ),
          suggest.map((a) =>
            h(
              Row,
              {
                key: a.id,
                lead: pill("建议", "warn", true),
                title: name(a),
                sub: fmt(a.at, zone),
              },
              a.kind === "quota" &&
                h(
                  Button,
                  { onClick: () => go("settings", "entitlement") },
                  "查看额度",
                ),
              h(
                Button,
                {
                  disabled: readOnly,
                  onClick: async () => {
                    await send(host, "alert.dismiss", { id: a.id });
                    await refresh();
                  },
                },
                "忽略",
              ),
            ),
          ),
          !action.length &&
            !suggest.length &&
            h("div", { className: "xhs-empty" }, "没有需要你处理的异常"),
        ),
        h(
          Card,
          { title: "已自动处理 · 近 7 天" },
          h(Table, {
            head: ["时间", "账号", "异常", "系统做了什么"],
            body: handled
              .slice(0, 12)
              .map((a) => [
                fmt(a.at, zone),
                a.account_id ? accountName(snapshot, a.account_id) : "—",
                a.label,
                HANDLED[a.code] || "已记录",
              ]),
            empty: "近 7 天没有自动处理的异常",
          }),
          h(
            "div",
            { className: "xhs-actions" },
            h(
              Button,
              { onClick: () => go("settings", "settings") },
              "查看处理规则",
            ),
          ),
        ),
      ),
      h(
        Card,
        { title: "提醒方式" },
        h(Check, {
          label: "桌面通知",
          checked: settings.notify_desktop !== false,
          disabled: readOnly,
          onChange: (v) => set({ notify_desktop: v }),
        }),
        h(Check, {
          label: "在对话里用卡片提醒",
          checked: settings.notify_card !== false,
          disabled: readOnly,
          onChange: (v) => set({ notify_card: v }),
        }),
        h(Check, {
          label: "同时发到管理员配置的告警渠道",
          checked: !!settings.notify_channel,
          disabled: readOnly,
          onChange: (v) => set({ notify_channel: v }),
        }),
        h(Select, {
          label: "超过这个时间没处理",
          value: settings.remind_after || "2h",
          disabled: readOnly,
          onChange: (v) => set({ remind_after: v }),
          options: [
            ["2h", "2 小时后再提醒一次"],
            ["none", "不重复提醒"],
          ],
        }),
      ),
    ),
    h(
      Card,
      {
        title: "账号健康",
        tip: "平台通知由你在手机上查看后登记；系统只读取页面上显示的内容，不推断是否被限流。",
      },
      h(Table, {
        head: [
          "账号",
          "登录",
          "手机",
          "7 天养号完成率",
          "7 天发布成功",
          "平台通知",
          "状态",
        ],
        body: health.map((x) => {
          const device = rows(snapshot.devices).find(
            (d) => d.device_id === x.device_id,
          );
          return [
            accountName(snapshot, x.account_id),
            x.login === "unbound"
              ? "—"
              : pill(
                  x.login === "ok" ? "正常" : "登录失效",
                  x.login === "ok" ? "ok" : "bad",
                  true,
                ),
            device
              ? `${device.name || device.device_id} · ${
                  device.online ? "在线" : "离线"
                }`
              : "未绑定",
            x.nurture_rate == null ? "—" : `${x.nurture_rate}%`,
            x.publish_total
              ? `${x.publish_ok} / ${x.publish_total}${
                  x.publish_unknown ? ` · ${x.publish_unknown} 篇结果不明` : ""
                }`
              : "—",
            rows(x.notices).length
              ? rows(x.notices).slice(-1)[0].text
              : x.login === "unbound"
              ? "—"
              : "无",
            pill(
              x.state === "healthy"
                ? "健康"
                : x.state === "paused"
                ? "已暂停"
                : x.state === "transferring"
                ? "转交中"
                : "待配置",
              x.state === "healthy"
                ? "ok"
                : x.state === "paused"
                ? "bad"
                : "warn",
              true,
            ),
          ];
        }),
        empty: "还没有账号",
      }),
      h(
        "div",
        { className: "xhs-actions" },
        h(
          Button,
          {
            disabled: readOnly,
            onClick: () =>
              setNotice({
                account_id: rows(snapshot.data.accounts)[0]?.id || "",
                text: "",
                restricted: false,
              }),
          },
          "登记平台通知",
        ),
        h(
          Button,
          {
            onClick: () =>
              download(
                "账号健康记录.csv",
                csv([
                  [
                    "账号",
                    "登录",
                    "7 天养号完成率",
                    "7 天发布",
                    "平台通知",
                    "状态",
                  ],
                  ...health.map((x) => [
                    accountName(snapshot, x.account_id),
                    x.login,
                    x.nurture_rate ?? "",
                    `${x.publish_ok}/${x.publish_total}`,
                    rows(x.notices)
                      .map((n) => n.text)
                      .join("；"),
                    x.state,
                  ]),
                ]),
              ),
          },
          "导出健康记录",
        ),
      ),
    ),
    notice &&
      h(
        Dialog,
        {
          title: "登记平台通知",
          desc: "照手机上显示的抄写。",
          onClose: () => setNotice(null),
          footer: [
            h(Button, { key: "c", onClick: () => setNotice(null) }, "取消"),
            h(
              Button,
              {
                key: "ok",
                primary: true,
                disabled: !notice.account_id || !notice.text.trim(),
                onClick: async () => {
                  await send(host, "notice.record", notice);
                  setNotice(null);
                  await refresh();
                },
              },
              "登记",
            ),
          ],
        },
        h(Select, {
          label: "账号",
          value: notice.account_id,
          onChange: (v) => setNotice({ ...notice, account_id: v }),
          options: rows(snapshot.data.accounts).map((a) => [
            a.id,
            a.name || a.id,
          ]),
        }),
        h(Field, {
          label: "通知内容",
          value: notice.text,
          onChange: (v) => setNotice({ ...notice, text: v }),
        }),
        h(Check, {
          label:
            "这是限制或违规提示（会暂停该账号的养号、发布和回复至少 72 小时）",
          checked: notice.restricted,
          onChange: (v) => setNotice({ ...notice, restricted: v }),
        }),
      ),
  );
}

// ---- 冷启动方案 ----
function ColdStartPanel({ snapshot, host, readOnly, refresh }) {
  const settings = snapshot.data.member_settings || {};
  const [stages, setStages] = useState(rows(settings.cold_start));
  useEffect(
    () => setStages(rows((snapshot.data.member_settings || {}).cold_start)),
    [JSON.stringify((snapshot.data.member_settings || {}).cold_start)],
  );
  const status = snapshot.data.cold_start_status || {};
  const last = snapshot.data.coldstart_observation || {};
  const [obs, setObs] = useState({ drift: last.drift || "closer", note: "" });
  const set = (i, key, value) =>
    setStages(stages.map((s, j) => (j === i ? { ...s, [key]: value } : s)));
  const fresh = rows(snapshot.data.accounts).filter(
    (a) => a.entry_mode === "new",
  );
  const rate = (t) => (t && t[0] ? `${t[2]}% · 上限 ${t[1]}` : "关闭");
  const num = (i, key) =>
    h("input", {
      className: "xhs-input",
      type: "number",
      style: { width: 70, marginTop: 0 },
      value: stages[i][key],
      disabled: readOnly,
      "aria-label": `${stages[i].name} ${key}`,
      onChange: (e) => set(i, key, Number(e.target.value)),
    });
  const rules =
    rows(settings.browse_rules).length === 4
      ? settings.browse_rules
      : [true, true, true, true];
  const next = (s) => {
    const i = stages.findIndex((x) => x.name === s.name);
    const left = (stages[i]?.day_to ?? s.day) - s.day + 1;
    const to = stages[i + 1]?.name;
    return to
      ? left <= 1
        ? `明天进入“${to}”`
        : `${left} 天后进入“${to}”`
      : `${Math.max(1, left)} 天后转日常`;
  };
  return h(
    "div",
    { className: "xhs-stack" },
    h(
      Card,
      {
        title: "冷启动方案",
        tip: "新号完成资料核验后，先按较低的强度养号，再过渡到账号日常预算。每一档仍要先生成计划、预检、由你确认后才执行。",
      },
      h(Table, {
        head: [
          "阶段",
          "天数",
          "每日浏览",
          "分段",
          "搜索占比",
          "点赞",
          "收藏",
          "评论",
          "关注",
        ],
        body: [
          ...stages.map((s, i) => [
            s.name,
            `第 ${s.day_from}–${s.day_to} 天`,
            num(i, "daily_target_posts"),
            num(i, "segments"),
            num(i, "search_ratio_percent"),
            rate(s.like),
            rate(s.collect),
            s.collect && s.collect[0] ? "3% · 审核后发送 · 上限 2" : "关闭",
            "关闭",
          ]),
          [
            "日常",
            `第 ${(stages[stages.length - 1]?.day_to ?? 14) + 1} 天起`,
            "按账号日常预算",
            "",
            "",
            "",
            "",
            "",
            "",
          ],
        ],
      }),
      h(
        "div",
        { className: "xhs-meta", style: { marginTop: 8 } },
        "数值来自运营建议（浏览 80–100 篇、点赞 10%、收藏 3%、搜索 70%–90%），分阶段递增，避免新号一开始就高强度互动。",
      ),
      h(
        "div",
        { className: "xhs-actions" },
        h(
          Button,
          {
            primary: true,
            disabled: readOnly,
            onClick: async () => {
              await send(host, "coldstart.save", { stages });
              toast("已保存");
              await refresh();
            },
          },
          "保存为项目默认方案",
        ),
        h(
          Button,
          {
            disabled:
              readOnly || !fresh.some((a) => !status[a.id] && a.device_id),
            onClick: async () => {
              for (const a of fresh.filter((x) => !status[x.id] && x.device_id))
                await send(host, "coldstart.apply", { account_id: a.id });
              await refresh();
            },
          },
          "应用到所选新号",
        ),
      ),
    ),
    h(
      "div",
      { className: "xhs-2", style: { gap: 12, alignItems: "start" } },
      h(
        "div",
        { className: "xhs-stack" },
        h(
          Card,
          { title: "新号进度" },
          fresh.map((a) => {
            const s = status[a.id];
            return h(
              Row,
              {
                key: a.id,
                title: a.name,
                sub: s
                  ? s.graduated
                    ? `第 ${s.day} 天 · 已转日常`
                    : `第 ${s.day} 天 · ${s.name}${
                        a.cold_start_paused ? " · 已暂停" : ""
                      }`
                  : a.device_id
                  ? "未开始"
                  : "未开始 · 新号资料待核验",
              },
              !s && pill("未受理", "warn", true),
              s && !s.graduated && pill(next(s)),
              s &&
                !s.graduated &&
                h(
                  Button,
                  {
                    disabled: readOnly,
                    onClick: async () => {
                      await send(host, "coldstart.pause", {
                        account_id: a.id,
                        paused: !a.cold_start_paused,
                      });
                      await refresh();
                    },
                  },
                  a.cold_start_paused ? "继续" : "暂停",
                ),
              s &&
                !s.graduated &&
                h(
                  Button,
                  {
                    disabled: readOnly,
                    onClick: async () => {
                      await send(host, "coldstart.apply", {
                        account_id: a.id,
                        graduate: true,
                      });
                      await refresh();
                    },
                  },
                  "提前转日常",
                ),
            );
          }),
          !fresh.length && h("div", { className: "xhs-empty" }, "还没有新账号"),
        ),
        h(
          Card,
          { title: "运营观察" },
          h(Select, {
            label: "推荐流是否更接近目标兴趣",
            value: obs.drift,
            onChange: (v) => setObs({ ...obs, drift: v }),
            options: [
              ["closer", "明显更接近"],
              ["slightly", "略有变化"],
              ["same", "没有变化"],
              ["away", "偏离了"],
            ],
          }),
          h(Field, {
            label: "需要调整的兴趣池或关键词",
            value: obs.note,
            onChange: (v) => setObs({ ...obs, note: v }),
            placeholder:
              last.note || "例如：“通勤包”回执偏少，换成“托特包通勤”",
          }),
          h(
            "div",
            { className: "xhs-actions" },
            h(
              Button,
              {
                primary: true,
                disabled: readOnly,
                onClick: async () => {
                  await send(host, "coldstart.observe", obs);
                  setObs({ ...obs, note: "" });
                  toast("已记录");
                  await refresh();
                },
              },
              "记录并用于下一轮",
            ),
          ),
        ),
      ),
      h(
        Card,
        { title: "浏览规则" },
        [
          "每篇要看完正文并进入评论区，停留不少于 11 秒",
          "不是每篇都点进去；前 1–2 篇只浏览不互动",
          "首页浏览时定期回到首页刷新，换一批内容",
          "点赞、收藏、评论可以落在同一篇，也可以分散",
        ].map((label, i) =>
          h(Check, {
            key: i,
            label,
            checked: rules[i],
            disabled: readOnly,
            onChange: (v) =>
              saveSettings(host, snapshot, refresh, {
                browse_rules: rules.map((r, j) => (j === i ? v : r)),
              }),
          }),
        ),
        h(
          "div",
          { className: "xhs-meta" },
          "评论只发送「评论审核」里逐条批准过的原文，10 字以内，不含营销内容。",
        ),
      ),
    ),
  );
}

// ---- 内容计划 ----
function similarity(a, b) {
  const grams = (s) =>
    new Set([...String(s)].map((c, i, arr) => c + (arr[i + 1] || "")));
  const x = grams(a);
  const y = grams(b);
  const both = [...x].filter((g) => y.has(g)).length;
  return both / Math.max(1, x.size + y.size - both);
}
function PlanPanel({ snapshot, host, readOnly, refresh, modelRef, go }) {
  const zone = tz(snapshot);
  const data = snapshot.data;
  const accounts = rows(data.accounts);
  const eff = data.effective_policy || {};
  const tasks = rows(data.content_tasks).filter((t) =>
    ["to_make", "making"].includes(t.status),
  );
  const items = [
    ...rows(data.drafts).map((d) => ({
      ...d,
      type: "draft",
      state: draftStatus(snapshot, d),
    })),
    ...tasks.map((t) => ({ ...t, type: "task", state: "to_make" })),
  ];
  const bucket = (i) =>
    ["pending_review", "returned"].includes(i.state)
      ? "pending_review"
      : ["approved", "scheduled", "paused"].includes(i.state)
      ? "approved"
      : i.state;
  const [filter, setFilter] = useState("pending_review");
  const [selected, setSelected] = useState([]);
  const [mine, setMine] = useState(false);
  const [when, setWhen] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [review, setReview] = useState(null);
  const [creating, setCreating] = useState(null);
  const count = (k) => items.filter((i) => bucket(i) === k).length;
  const needsMe = (i) =>
    i.state === "to_make" ||
    i.state === "pending_review" ||
    i.state === "returned" ||
    i.state === "failed" ||
    i.checks?.blocking;
  const shown = items.filter(
    (i) => (filter === "all" || bucket(i) === filter) && (!mine || needsMe(i)),
  );
  const draftsSelected = selected.filter(
    (id) => items.find((i) => i.id === id)?.type === "draft",
  );
  const batch = async (action, extra = {}) => {
    await send(host, "plan.update", { action, ids: draftsSelected, ...extra });
    setSelected([]);
    await refresh();
  };
  const toggle = (id, on) =>
    setSelected(
      on ? [...new Set([...selected, id])] : selected.filter((x) => x !== id),
    );
  const failed = items.filter((i) => i.state === "failed");
  const planTasks = data.last_plan
    ? rows(data.content_tasks)
        .filter((t) => t.source === "instruction" || t.source === "ai")
        .slice(-10)
    : [];
  const titles = planTasks.map((t) => t.title);
  const maxSim = titles.reduce(
    (m, a, i) =>
      Math.max(m, ...titles.slice(i + 1).map((b) => similarity(a, b)), 0),
    0,
  );
  const bodies = rows(data.drafts)
    .filter((d) => planTasks.some((t) => t.draft_id === d.id))
    .flatMap((d) =>
      String(d.content || "")
        .split(/\n+/)
        .filter((p) => p.length > 30),
    );
  const dupBody = new Set(bodies).size !== bodies.length;
  const statusPill = (i) =>
    pill(
      i.type === "task"
        ? i.status === "making"
          ? "制作中"
          : "待制作"
        : REVIEW_LABELS[i.state],
      i.state === "failed"
        ? "bad"
        : ["pending_review", "returned"].includes(i.state)
        ? "warn"
        : "",
      ["pending_review", "failed"].includes(i.state),
    );
  return h(
    "div",
    { className: "xhs-stack" },
    rows(data.plan_suggestions).length > 0 &&
      h(
        Card,
        { title: "AI 本周建议" },
        rows(data.plan_suggestions).map((s) =>
          h(
            Row,
            { key: s.id, title: s.title, sub: s.detail },
            h(
              Button,
              {
                primary: true,
                disabled: readOnly,
                onClick: async () => {
                  await send(host, "task.add", {
                    ...s.task,
                    source: "ai",
                    reason: s.title,
                  });
                  await send(host, "alert.dismiss", { id: s.id });
                  await refresh();
                },
              },
              "采纳",
            ),
            h(
              Button,
              {
                disabled: readOnly,
                onClick: async () => {
                  await send(host, "alert.dismiss", { id: s.id });
                  await refresh();
                },
              },
              "忽略",
            ),
          ),
        ),
      ),
    h(
      Card,
      {
        title: "内容任务池",
        tip: "AI 主动生成、运营指令、素材和手动创作的内容都在这里，使用同一套审核、排期和发布。",
      },
      h(
        "div",
        { className: "xhs-tabs", role: "tablist" },
        [
          ["all", "全部", items.length],
          ["to_make", "待制作", count("to_make")],
          ["pending_review", "待审核", count("pending_review")],
          ["approved", "待发布", count("approved")],
          ["published", "已发布", count("published")],
          ["failed", "发布失败", count("failed")],
        ].map(([k, l, n]) =>
          h(
            "button",
            {
              key: k,
              role: "tab",
              className: `xhs-tab${filter === k ? " is-active" : ""}`,
              onClick: () => {
                setFilter(k);
                setSelected([]);
              },
            },
            `${l} ${n}`,
          ),
        ),
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            gap: 7,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 8,
          },
        },
        h("b", null, `已选 ${selected.length} 篇`),
        h(
          Button,
          {
            primary: true,
            disabled: readOnly || !draftsSelected.length,
            onClick: () => batch("approve"),
          },
          "批量通过",
        ),
        h("input", {
          className: "xhs-input",
          style: { width: 190, marginTop: 0 },
          type: "datetime-local",
          "aria-label": "排期时间",
          value: when,
          onChange: (e) => setWhen(e.target.value),
        }),
        h(
          Button,
          {
            disabled: readOnly || !when || !draftsSelected.length,
            onClick: () =>
              batch("schedule", { scheduled_at: new Date(when).toISOString() }),
          },
          "批量排期",
        ),
        h(Select, {
          label: "",
          style: { width: 150, marginTop: 0 },
          value: assignTo,
          onChange: setAssignTo,
          options: [
            ["", "换到账号…"],
            ...accounts.map((a) => [a.id, a.name || a.id]),
          ],
        }),
        h(
          Button,
          {
            disabled: readOnly || !assignTo || !draftsSelected.length,
            onClick: () => batch("assign", { account_id: assignTo }),
          },
          "批量换账号",
        ),
        h(
          Button,
          {
            disabled: readOnly || !draftsSelected.length,
            onClick: () => batch("pause"),
          },
          "暂停",
        ),
        h(
          Button,
          {
            disabled: readOnly || !draftsSelected.length,
            onClick: () => batch("return"),
          },
          "退回修改",
        ),
        h("span", { style: { flex: 1 } }),
        h(Check, {
          label: "只看我需要处理的",
          checked: mine,
          onChange: setMine,
        }),
      ),
      h(Table, {
        head: [
          "",
          "选题",
          "来源",
          "母版",
          "发布账号（AI 推荐，可改）",
          "排期",
          "发布前检查",
          "状态",
        ],
        body: shown.map((i) => [
          h("input", {
            type: "checkbox",
            "aria-label": `选择 ${i.title}`,
            checked: selected.includes(i.id),
            onChange: (e) => toggle(i.id, e.target.checked),
          }),
          i.type === "draft"
            ? h(
                "button",
                {
                  className: "xhs-link",
                  style: { fontWeight: 700 },
                  onClick: () => go("content", "editor", i.id),
                },
                i.title,
              )
            : h("b", null, i.title),
          srcPill(i.source),
          templateName(snapshot, i.template_id),
          i.type === "draft" && i.state !== "published"
            ? h(Select, {
                label: "",
                style: { marginTop: 0, minWidth: 130 },
                value: i.account_id || "",
                disabled: readOnly,
                onChange: async (v) => {
                  if (!v) return;
                  await send(host, "plan.update", {
                    action: "assign",
                    ids: [i.id],
                    account_id: v,
                  });
                  await refresh();
                },
                options: [
                  ["", "暂不指定"],
                  ...accounts
                    .filter((a) => a.project_id === i.project_id)
                    .map((a) => [a.id, a.name || a.id]),
                ],
              })
            : accountName(snapshot, i.account_id),
          i.type === "draft" && i.state !== "published"
            ? h("input", {
                className: "xhs-input",
                type: "datetime-local",
                style: { marginTop: 0, width: 180 },
                "aria-label": `${i.title} 排期`,
                value: localInput(i.scheduled_at),
                disabled: readOnly || !i.account_id,
                onChange: async (e) => {
                  if (!e.target.value) return;
                  await send(host, "plan.update", {
                    action: "schedule",
                    ids: [i.id],
                    scheduled_at: new Date(e.target.value).toISOString(),
                  }).catch((error) =>
                    window.dispatchEvent(
                      new CustomEvent("octop:xhs-error", { detail: error }),
                    ),
                  );
                  await refresh();
                },
              })
            : i.scheduled_at
            ? fmt(i.scheduled_at, zone)
            : "—",
          i.type === "task"
            ? i.status === "making"
              ? h("span", { className: "xhs-meta" }, "制作中")
              : h(
                  Button,
                  {
                    primary: true,
                    disabled: readOnly,
                    onClick: async () => {
                      await send(host, "task.generate", {
                        id: i.id,
                        model_ref: modelRef || undefined,
                      });
                      await refresh();
                    },
                  },
                  "生成草稿",
                )
            : h(
                "div",
                null,
                checkPills(i.checks, true),
                i.checks?.high_risk &&
                  h(
                    "div",
                    { style: { marginTop: 4 } },
                    h(
                      "button",
                      {
                        className: "xhs-pill",
                        style: { border: 0, cursor: "pointer" },
                        onClick: () =>
                          setReview({
                            id: i.id,
                            reviewer: eff.reviewer_name || "",
                            reference: "",
                            decision: "approved",
                          }),
                      },
                      ic("p:固定", 12),
                      ` ${
                        i.compliance_review?.decision === "approved"
                          ? "已复核"
                          : "待合规复核"
                      }${eff.reviewer_name ? " · " + eff.reviewer_name : ""}`,
                    ),
                  ),
                !i.checks &&
                  h(
                    Button,
                    {
                      disabled: readOnly,
                      onClick: async () => {
                        await send(host, "content.precheck", { id: i.id });
                        await refresh();
                      },
                    },
                    "检查",
                  ),
              ),
          statusPill(i),
        ]),
        empty: "这里没有内容",
      }),
      h(
        "div",
        { className: "xhs-actions" },
        h(
          Button,
          {
            primary: true,
            disabled: readOnly,
            onClick: () =>
              setCreating({
                title: "",
                account_id: accounts[0]?.id || "",
                nature: "life",
              }),
          },
          "新建内容任务",
        ),
        h(
          Button,
          {
            disabled: readOnly || !failed.length,
            onClick: async () => {
              await send(host, "plan.reschedule", { failed: true });
              toast("已重新安排");
              await refresh();
            },
          },
          "重新安排失败任务",
        ),
      ),
    ),
    creating &&
      h(
        Dialog,
        {
          title: "新建内容任务",
          onClose: () => setCreating(null),
          footer: [
            h(Button, { key: "c", onClick: () => setCreating(null) }, "取消"),
            h(
              Button,
              {
                key: "ok",
                primary: true,
                disabled: !creating.title.trim(),
                onClick: async () => {
                  await send(host, "task.add", {
                    ...creating,
                    source: "manual",
                  });
                  setCreating(null);
                  setFilter("to_make");
                  await refresh();
                },
              },
              "保存",
            ),
          ],
        },
        h(Field, {
          label: "选题",
          value: creating.title,
          onChange: (v) => setCreating({ ...creating, title: v.slice(0, 40) }),
        }),
        h(Select, {
          label: "发布账号",
          value: creating.account_id,
          onChange: (v) => setCreating({ ...creating, account_id: v }),
          options: [
            ["", "暂不指定"],
            ...accounts.map((a) => [a.id, a.name || a.id]),
          ],
        }),
        h(Select, {
          label: "内容性质",
          value: creating.nature,
          onChange: (v) => setCreating({ ...creating, nature: v }),
          options: [
            ["marketing", "营销内容 · 需披露"],
            ["life", "生活内容"],
            ["knowledge", "知识内容"],
          ],
        }),
      ),
    review &&
      h(
        Dialog,
        {
          title: "记录合规复核",
          desc: "高风险内容由企业指定的复核人在审批流程里签字，这里记录结论和单号。内容再改动需要重新复核。",
          onClose: () => setReview(null),
          footer: [
            h(Button, { key: "c", onClick: () => setReview(null) }, "取消"),
            h(
              Button,
              {
                key: "ok",
                primary: true,
                disabled: !review.reviewer.trim() || !review.reference.trim(),
                onClick: async () => {
                  await send(host, "compliance.record", review);
                  setReview(null);
                  await refresh();
                },
              },
              "保存",
            ),
          ],
        },
        h(Field, {
          label: "复核人",
          value: review.reviewer,
          onChange: (v) => setReview({ ...review, reviewer: v }),
        }),
        h(Field, {
          label: "审批单号或链接",
          value: review.reference,
          onChange: (v) => setReview({ ...review, reference: v }),
        }),
        h(Select, {
          label: "结论",
          value: review.decision,
          onChange: (v) => setReview({ ...review, decision: v }),
          options: [
            ["approved", "通过"],
            ["rejected", "退回"],
          ],
        }),
      ),
    h(
      "div",
      { className: "xhs-2", style: { gap: 12, alignItems: "start" } },
      h(
        Card,
        {
          title: `同一推广任务的 ${planTasks.length} 篇`,
          icon: "同一推广任务的 10 篇",
          tip: "同一条指令拆出的内容会错开角度和母版，避免几个账号发相似的内容。",
        },
        planTasks.length
          ? h(
              "div",
              { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
              planTasks.map((t) =>
                h(
                  "span",
                  { key: t.id, className: "xhs-pill" },
                  `${t.title} · ${templateName(snapshot, t.template_id).replace(
                    /型$/,
                    "",
                  )}`,
                ),
              ),
            )
          : h("div", { className: "xhs-empty" }, "还没有下发过指令"),
        planTasks.length > 1 &&
          h(
            Row,
            { title: "重复度检查" },
            pill(
              `${maxSim < 0.3 ? "✓" : "!"} 标题两两相似度 ${
                maxSim < 0.3 ? "<" : "≥"
              } 30%`,
              maxSim < 0.3 ? "ok" : "warn",
            ),
            pill(
              dupBody ? "! 正文有整段重复" : "✓ 正文无整段重复",
              dupBody ? "warn" : "ok",
            ),
          ),
      ),
      h(
        Card,
        {
          title: "审核流",
          tip: "谁来审由内容性质决定；高风险内容的复核人由企业管理员指定。",
        },
        h(Row, { title: "普通内容", sub: "生活、知识类" }, pill("运营本人")),
        h(
          Row,
          { title: "营销内容", sub: "补全商业推广披露后才能通过" },
          pill("运营本人"),
        ),
        h(
          Row,
          {
            title: "高风险内容",
            sub: "效果描述、案例、对比类；医疗美容内容一律走这一档",
          },
          h(Lock, {
            children: `合规复核人${
              eff.reviewer_name ? " · " + eff.reviewer_name : ""
            }`,
          }),
        ),
      ),
    ),
  );
}

// ---- 创作编辑器 ----
const IMAGE_STYLES = ["生活摄影", "插画", "信息卡片", "日记拼贴"];
async function cropToPortrait(blob) {
  const bitmap = await createImageBitmap(blob);
  const ratio = 3 / 4;
  let w = bitmap.width;
  let hgt = bitmap.height;
  if (w / hgt > ratio) w = Math.round(hgt * ratio);
  else hgt = Math.round(w / ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = hgt;
  canvas
    .getContext("2d")
    .drawImage(
      bitmap,
      (bitmap.width - w) / 2,
      (bitmap.height - hgt) / 2,
      w,
      hgt,
      0,
      0,
      w,
      hgt,
    );
  const out = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  const data = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(out);
  });
  return { mime_type: "image/jpeg", data_base64: data, size: out.size };
}
function EditorPanel({
  snapshot,
  host,
  readOnly,
  refresh,
  modelRef,
  go,
  focus,
}) {
  const data = snapshot.data;
  const zone = tz(snapshot);
  const drafts = rows(data.drafts);
  const projects = rows(data.projects);
  const accounts = rows(data.accounts);
  const templates = rows(data.catalog_cache?.templates).filter(
    (t) => t.available !== false,
  );
  const [draft, setDraft] = useState(null);
  const [form, setForm] = useState({});
  const [images, setImages] = useState([]);
  const [picked, setPicked] = useState(0);
  const [source, setSource] = useState("upload");
  const [ai, setAi] = useState({
    prompt: "",
    persona: "none",
    style: IMAGE_STYLES[0],
    preset: "",
    ref: "none",
  });
  const [imitate, setImitate] = useState(null);
  const [imageModels, setImageModels] = useState([]);
  const [drag, setDrag] = useState(null);
  const [theme, setTheme] = useState("");
  const open = (d) => {
    setDraft({ ...d });
    setForm({
      project_id: d.project_id || projects[0]?.id || "",
      account_id: d.account_id || "",
      title: d.title || "",
      content: d.content || "",
      hashtags: rows(d.hashtags).join(" "),
      nature: d.nature || "",
      template_id: d.template_id || "",
      scheduled_at: localInput(d.scheduled_at),
    });
    setImages(rows(d.images));
    setPicked(0);
  };
  useEffect(() => {
    if (focus === "new") open({});
    else if (focus) {
      const found = drafts.find((d) => d.id === focus);
      if (found) open(found);
    }
  }, [focus]);
  useEffect(() => {
    if (!draft || readOnly || typeof host.request !== "function") return;
    host
      .request("/plugin-apps/xhs-ops/image-models")
      .then((v) => setImageModels(rows(v)))
      .catch(() => setImageModels([]));
  }, [Boolean(draft), readOnly]);
  const current = draft?.id
    ? drafts.find((d) => d.id === draft.id) || draft
    : draft;
  const account = accounts.find((a) => a.id === form.account_id);
  const set = (patch) => setForm({ ...form, ...patch });
  const save = async (meta = true) => {
    const id = draft.id || crypto.randomUUID();
    const projectId = account?.project_id || form.project_id;
    let result = await send(host, "draft.save", {
      id,
      version: draft.version,
      project_id: projectId,
      account_id: form.account_id,
      title: form.title,
      content: form.content,
      hashtags: form.hashtags.split(/[\s,，#]+/).filter(Boolean),
      images,
    });
    let saved = rows(result.data?.drafts).find((d) => d.id === id);
    if (!saved) throw new Error("草稿保存结果不完整，请刷新后检查。");
    if (
      meta &&
      (form.nature !== (saved.nature || "") ||
        form.template_id !== (saved.template_id || ""))
    ) {
      result = await send(host, "content.meta", {
        id,
        meta: { nature: form.nature, template_id: form.template_id },
      });
      saved = rows(result.data?.drafts).find((d) => d.id === id) || saved;
    }
    open(saved);
    await refresh();
    return saved;
  };
  const generate = async () => {
    const id = draft.id || crypto.randomUUID();
    const result = await send(host, "content.generate", {
      id,
      ...(draft.version ? { version: draft.version } : {}),
      project_id: account?.project_id || form.project_id,
      account_id: form.account_id,
      theme: theme.trim() || form.title.trim(),
      ...(modelRef ? { model_ref: modelRef } : {}),
    });
    const generated = rows(result.data?.drafts).find((d) => d.id === id);
    if (!generated) throw new Error("文案生成结果不完整，请刷新后检查。");
    const kept = images;
    open(generated);
    setImages(kept);
    await refresh();
  };
  const rewrite = async (mode, reference = "") => {
    const saved = await save();
    const result = await send(host, "content.rewrite", {
      id: saved.id,
      version: saved.version,
      mode,
      reference,
      ...(modelRef ? { model_ref: modelRef } : {}),
    });
    const next = rows(result.data?.drafts).find((d) => d.id === saved.id);
    if (next) open(next);
    await refresh();
  };
  const addFiles = async (files, replaceAt) => {
    if (replaceAt == null && images.length + files.length > 9)
      throw new Error("每篇最多上传 9 张图片。");
    const added = (await readImageFiles(files)).map((image) => ({
      ...image,
      origin: "upload",
    }));
    setImages((list) =>
      replaceAt == null
        ? [...list, ...added]
        : list.map((x, i) => (i === replaceAt ? added[0] : x)),
    );
  };
  const crop = async () => {
    const image = images[picked];
    const blob = image.data_base64
      ? await (
          await fetch(`data:${image.mime_type};base64,${image.data_base64}`)
        ).blob()
      : await host.requestBlob(String(image.asset_url).replace(/^\/api/, ""));
    const cropped = await cropToPortrait(blob);
    setImages((list) =>
      list.map((x, i) =>
        i === picked
          ? {
              filename:
                (image.filename || "image").replace(/\.\w+$/, "") + ".jpg",
              display_name: image.display_name || "",
              ...cropped,
              origin: image.origin || "upload",
            }
          : x,
      ),
    );
  };
  const generateImage = async () => {
    const saved = await save();
    const template = templates.find((t) => t.id === form.template_id);
    const persona =
      ai.persona === "account" && account
        ? `人物：${["age", "gender", "region", "occupation"]
            .map((k) => account.persona?.[k])
            .filter(Boolean)
            .join("、")}的虚拟形象。`
        : "";
    const prompt = [
      ai.prompt.trim(),
      `风格：${ai.style}。`,
      ai.preset ? `版式：${ai.preset}。` : "",
      persona,
      "不出现品牌标识；不生成虚构的前后对比。",
    ]
      .filter(Boolean)
      .join(" ");
    const result = await send(host, "image.generate", {
      draft_id: saved.id,
      version: saved.version,
      prompt,
      aspect_ratio: "3:4",
      ...(imageModels[0] && ai.model ? { model_ref: ai.model } : {}),
    });
    const next = rows(result.data?.drafts).find((d) => d.id === saved.id);
    if (next) open(next);
    await refresh();
  };
  const usable = rows(data.materials).filter(
    (m) =>
      m.status !== "frozen" &&
      rows(m.images).length &&
      (m.owner === "public" ||
        !form.account_id ||
        rows(m.account_ids).includes(form.account_id)),
  );
  const checks = current?.checks;
  const presets = [
    ...new Set(templates.map((t) => t.image_preset).filter(Boolean)),
  ];
  const hashtags = (form.hashtags || "").split(/[\s,，#]+/).filter(Boolean);
  return h(
    "div",
    { className: "xhs-stack" },
    h(
      Card,
      { title: "内容草稿" },
      drafts.map((d) =>
        h(
          Row,
          {
            key: d.id,
            title: text(d.title, "未命名草稿"),
            sub: `${
              projects.find((p) => p.id === d.project_id)?.name || "—"
            } · ${accountName(snapshot, d.account_id)} · ${
              rows(d.images).length
            } 张图`,
          },
          pill(
            REVIEW_LABELS[draftStatus(snapshot, d)] === "待审核"
              ? "草稿"
              : REVIEW_LABELS[draftStatus(snapshot, d)],
          ),
          h(Button, { onClick: () => open(d), disabled: readOnly }, "编辑"),
        ),
      ),
      !drafts.length && h("div", { className: "xhs-empty" }, "还没有草稿"),
      h(
        "div",
        { className: "xhs-actions" },
        h(
          Button,
          { primary: true, disabled: readOnly, onClick: () => open({}) },
          "新建草稿",
        ),
        h(
          Button,
          { disabled: readOnly, onClick: () => go("content", "templates") },
          "提交为内容母版",
        ),
      ),
    ),
    draft &&
      h(
        "div",
        { className: "xhs-2", style: { gap: 12, alignItems: "start" } },
        h(
          Card,
          { title: "编辑内容" },
          h(
            "div",
            { className: "xhs-2" },
            h(Select, {
              label: "发布账号",
              value: form.account_id,
              disabled: readOnly,
              onChange: (v) => set({ account_id: v }),
              options: [
                ...accounts.map((a) => [a.id, a.name || a.id]),
                ["", "暂不指定"],
              ],
            }),
            h(Select, {
              label: "内容母版（自动匹配，可切换）",
              value: form.template_id,
              disabled: readOnly,
              onChange: (v) => set({ template_id: v }),
              options: [
                ...templates.map((t) => [t.id, t.name]),
                ["", "不使用母版"],
              ],
            }),
          ),
          !form.account_id &&
            projects.length > 1 &&
            h(Select, {
              label: "项目",
              value: form.project_id,
              disabled: readOnly,
              onChange: (v) => set({ project_id: v }),
              options: projects.map((p) => [p.id, p.name]),
            }),
          h(Field, {
            label: "内容主题与文案要求",
            value: theme,
            disabled: readOnly,
            onChange: setTheme,
            placeholder:
              "写下主题和要求，AI 按人设、母版和业务资料起草；也可以直接在下面写",
          }),
          h(Field, {
            label: `标题（${form.title.length}/20）`,
            value: form.title,
            disabled: readOnly,
            onChange: (v) => set({ title: v.slice(0, 20) }),
          }),
          h(Field, {
            label: `正文（${form.content.length}/1800）`,
            multiline: true,
            value: form.content,
            disabled: readOnly,
            onChange: (v) => set({ content: v.slice(0, 1800) }),
          }),
          h(
            "div",
            { className: "xhs-actions", style: { marginTop: 4 } },
            h(
              Button,
              {
                disabled:
                  readOnly ||
                  !(account?.project_id || form.project_id) ||
                  !(theme.trim() || form.title.trim()),
                onClick: generate,
              },
              "生成内容",
            ),
            h(
              Button,
              {
                disabled: readOnly || !form.title || !form.content,
                onClick: () => rewrite("polish"),
              },
              "AI 润色",
            ),
            h(
              Button,
              {
                disabled:
                  readOnly || !form.title || !form.content || !form.template_id,
                onClick: () => rewrite("template"),
              },
              "按母版重写",
            ),
            h(
              Button,
              {
                disabled: readOnly || !form.title || !form.content,
                onClick: () => rewrite("angle"),
              },
              "换一个角度",
            ),
            h(
              Button,
              {
                disabled: readOnly || !form.title || !form.content,
                onClick: () => setImitate(""),
              },
              "上传参考并仿写",
            ),
          ),
          h(Field, {
            label: "话题标签",
            value: form.hashtags,
            disabled: readOnly,
            onChange: (v) => set({ hashtags: v }),
          }),
          h(
            "div",
            { className: "xhs-label" },
            `图片（${images.length}/9，拖动调整顺序）`,
          ),
          h(
            "div",
            null,
            images.map((image, i) =>
              h(
                "span",
                {
                  key: image.asset_id || image.filename + i,
                  className: `xhs-thumb${picked === i ? " is-active" : ""}`,
                  draggable: !readOnly,
                  onClick: () => setPicked(i),
                  onDragStart: () => setDrag(i),
                  onDragOver: (e) => e.preventDefault(),
                  onDrop: () => {
                    if (drag == null || drag === i) return;
                    setImages((list) => {
                      const next = [...list];
                      const [moved] = next.splice(drag, 1);
                      next.splice(i, 0, moved);
                      return next;
                    });
                    setDrag(null);
                  },
                },
                h(PrivateImage, {
                  host,
                  image,
                  alt: image.display_name || image.filename || `图片 ${i + 1}`,
                  className: "xhs-preview",
                }),
                ["ai", "ai_reconstruct"].includes(image.origin) &&
                  h(
                    "span",
                    { className: "xhs-mark" },
                    image.origin === "ai" ? "AI 生成" : "AI 重现",
                  ),
                !readOnly &&
                  i > 0 &&
                  h(
                    "button",
                    {
                      type: "button",
                      className: "xhs-x",
                      style: { right: 22 },
                      "aria-label": `上移第${i + 1}张`,
                      onClick: (e) => {
                        e.stopPropagation();
                        setImages((list) => {
                          const next = [...list];
                          [next[i - 1], next[i]] = [next[i], next[i - 1]];
                          return next;
                        });
                      },
                    },
                    "←",
                  ),
                !readOnly &&
                  h(
                    "button",
                    {
                      type: "button",
                      className: "xhs-x",
                      "aria-label": `移除第${i + 1}张`,
                      onClick: (e) => {
                        e.stopPropagation();
                        setImages((list) => list.filter((_, n) => n !== i));
                        setPicked(0);
                      },
                    },
                    "×",
                  ),
              ),
            ),
          ),
          images.length > 0 &&
            h(
              "div",
              { className: "xhs-actions", style: { marginTop: 4 } },
              h(Button, { disabled: readOnly, onClick: crop }, "裁切"),
              h(
                "label",
                { className: "xhs-btn" },
                ic("替换"),
                "替换",
                h("input", {
                  type: "file",
                  accept: "image/png,image/jpeg,image/webp",
                  style: { display: "none" },
                  disabled: readOnly,
                  onChange: (e) => {
                    const files = [...e.target.files];
                    e.target.value = "";
                    if (files.length)
                      addFiles(files.slice(0, 1), picked).catch((error) =>
                        window.dispatchEvent(
                          new CustomEvent("octop:xhs-error", { detail: error }),
                        ),
                      );
                  },
                }),
              ),
              h(
                Button,
                {
                  disabled: readOnly,
                  onClick: () => {
                    setImages(images.filter((_, i) => i !== picked));
                    setPicked(0);
                  },
                },
                "移除",
              ),
            ),
          h(
            "div",
            { style: { marginTop: 10 } },
            h(
              "div",
              { style: { display: "flex", gap: 6, marginBottom: 8 } },
              [
                ["upload", "上传图片"],
                ["ai", "AI 生图"],
                ["library", "素材库"],
              ].map(([k, l]) =>
                h(
                  "button",
                  {
                    key: k,
                    type: "button",
                    className: `xhs-btn${source === k ? " is-active" : ""}`,
                    onClick: () => setSource(k),
                  },
                  l,
                ),
              ),
            ),
            source === "upload" &&
              h(
                "label",
                {
                  className: "xhs-empty",
                  style: {
                    display: "block",
                    border: `1px dashed ${C.line}`,
                    borderRadius: 8,
                    cursor: "pointer",
                  },
                  onDragOver: (e) => e.preventDefault(),
                  onDrop: (e) => {
                    e.preventDefault();
                    addFiles([...e.dataTransfer.files]).catch((error) =>
                      window.dispatchEvent(
                        new CustomEvent("octop:xhs-error", { detail: error }),
                      ),
                    );
                  },
                },
                "拖入图片，或点击选择 · 每篇最多 9 张",
                h("input", {
                  type: "file",
                  accept: "image/png,image/jpeg,image/webp",
                  multiple: true,
                  style: { display: "none" },
                  disabled: readOnly || images.length >= 9,
                  "aria-label": "上传图片",
                  onChange: (e) => {
                    const files = [...e.target.files];
                    e.target.value = "";
                    addFiles(files).catch((error) =>
                      window.dispatchEvent(
                        new CustomEvent("octop:xhs-error", { detail: error }),
                      ),
                    );
                  },
                }),
              ),
            source === "ai" &&
              h(
                "div",
                null,
                h(
                  "div",
                  { className: "xhs-2" },
                  h(Field, {
                    label: "图片描述",
                    multiline: true,
                    value: ai.prompt,
                    onChange: (v) => setAi({ ...ai, prompt: v }),
                  }),
                  h(
                    "div",
                    null,
                    h(Select, {
                      label: "人物参考",
                      value: ai.persona,
                      onChange: (v) => setAi({ ...ai, persona: v }),
                      options: [
                        ...(account
                          ? [["account", `${account.name} · 虚拟形象`]]
                          : []),
                        ["none", "不使用人物参考"],
                      ],
                    }),
                    h(Select, {
                      label: "风格",
                      value: ai.style,
                      onChange: (v) => setAi({ ...ai, style: v }),
                      options: IMAGE_STYLES.map((s) => [s, s]),
                    }),
                  ),
                ),
                h(
                  "div",
                  { className: "xhs-2" },
                  h(Select, {
                    label: "配图预设（来自内容母版）",
                    value: ai.preset,
                    onChange: (v) => setAi({ ...ai, preset: v }),
                    options: [
                      ...presets.map((p) => [p, p]),
                      ["", "不使用预设"],
                    ],
                  }),
                  imageModels.length > 0
                    ? h(Select, {
                        label: "生图模型",
                        value: ai.model || "",
                        onChange: (v) => setAi({ ...ai, model: v }),
                        options: [
                          ["", "默认模型"],
                          ...imageModels.map((m) => [m.id, m.name]),
                        ],
                      })
                    : h(Select, {
                        label: "参考图",
                        value: ai.ref,
                        onChange: (v) => setAi({ ...ai, ref: v }),
                        options: [["none", "不使用参考图"]],
                      }),
                ),
                h(
                  "div",
                  { className: "xhs-actions" },
                  h(
                    Button,
                    {
                      disabled: !form.title,
                      onClick: () =>
                        setAi({
                          ...ai,
                          prompt: `${form.title}。${
                            form.content.split(/[。\n]/)[0] || ""
                          }`.slice(0, 200),
                        }),
                    },
                    "参考正文自动写描述",
                  ),
                  h(
                    Button,
                    {
                      primary: true,
                      disabled:
                        readOnly ||
                        !ai.prompt.trim() ||
                        images.length >= 9 ||
                        !form.title ||
                        !form.content,
                      onClick: generateImage,
                    },
                    "生成并插入",
                  ),
                ),
                h(
                  "div",
                  { className: "xhs-meta", style: { marginTop: 6 } },
                  "AI 生成的图片带“AI 生成”标记。效果类图片只能用已授权的本人照片，不生成虚构的前后对比。",
                ),
              ),
            source === "library" &&
              h(
                "div",
                null,
                usable.flatMap((m) =>
                  rows(m.images).map((image, i) =>
                    h(
                      "span",
                      {
                        key: m.id + i,
                        className: "xhs-thumb",
                        title: m.title || m.text,
                        onClick: () =>
                          images.length < 9 &&
                          setImages([
                            ...images,
                            { ...image, origin: image.origin || "material" },
                          ]),
                      },
                      h(PrivateImage, {
                        host,
                        image,
                        alt: m.title || "素材",
                        className: "xhs-preview",
                      }),
                    ),
                  ),
                ),
                !usable.length &&
                  h("div", { className: "xhs-empty" }, "没有可用的图片素材"),
                h(
                  "div",
                  { className: "xhs-meta" },
                  "只显示这个账号可用的素材：绑定本账号、多账号共用或公共素材。",
                ),
              ),
          ),
          h(
            "div",
            { className: "xhs-2", style: { marginTop: 6 } },
            h(Field, {
              label: "发布时间",
              type: "datetime-local",
              value: form.scheduled_at,
              disabled: readOnly,
              onChange: (v) => set({ scheduled_at: v }),
            }),
            h(Select, {
              label: "内容性质",
              value: form.nature,
              disabled: readOnly,
              onChange: (v) => set({ nature: v }),
              options: [
                ["", "请选择"],
                ["marketing", "营销内容 · 需披露"],
                ["life", "生活内容"],
                ["knowledge", "知识内容"],
              ],
            }),
          ),
          h(
            "div",
            { className: "xhs-actions" },
            h(
              Button,
              {
                disabled: readOnly || !form.title || !form.content,
                onClick: async () => {
                  await save();
                  toast("已保存");
                },
              },
              "保存草稿",
            ),
            h(
              Button,
              {
                disabled:
                  readOnly ||
                  !form.scheduled_at ||
                  !form.account_id ||
                  !form.title ||
                  !form.content,
                onClick: async () => {
                  const saved = await save();
                  await send(host, "plan.update", {
                    action: "schedule",
                    ids: [saved.id],
                    scheduled_at: new Date(form.scheduled_at).toISOString(),
                  });
                  toast("已设置发布时间");
                  await refresh();
                },
              },
              "设置发布时间",
            ),
            h(
              Button,
              {
                primary: true,
                disabled: readOnly || !form.title || !form.content,
                onClick: async () => {
                  const saved = await save();
                  await send(host, "content.precheck", { id: saved.id });
                  toast("已提交审核");
                  await refresh();
                },
              },
              "提交审核",
            ),
            h(
              Button,
              {
                disabled:
                  readOnly || !form.title || !form.content || !form.account_id,
                onClick: async () => {
                  const saved = await save();
                  await send(host, "plan.update", {
                    action: "approve",
                    ids: [saved.id],
                  });
                  await refresh();
                  go("publish", "batches");
                },
              },
              "提交发布",
            ),
          ),
        ),
        h(
          "div",
          { className: "xhs-stack" },
          h(
            Card,
            { title: "笔记预览" },
            h(
              "div",
              {
                role: "article",
                "aria-label": "图文预览",
                style: {
                  border: `1px solid ${C.line}`,
                  borderRadius: 10,
                  overflow: "hidden",
                  maxWidth: 260,
                },
              },
              h(
                "div",
                {
                  style: {
                    aspectRatio: "3 / 4",
                    background: C.soft,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: C.muted,
                    position: "relative",
                  },
                },
                images[picked]
                  ? h(PrivateImage, {
                      host,
                      image: images[picked],
                      alt: `预览第${picked + 1}张`,
                      style: {
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      },
                    })
                  : "还没有图片",
                h(
                  "span",
                  {
                    className: "xhs-mark",
                    style: {
                      position: "absolute",
                      right: 6,
                      top: 6,
                      background: "rgba(0,0,0,.55)",
                      color: "#fff",
                      borderRadius: 8,
                      padding: "0 6px",
                      fontSize: 11,
                    },
                  },
                  `${images.length ? picked + 1 : 0} / ${images.length}`,
                ),
              ),
              h(
                "div",
                { style: { padding: 10 } },
                h("b", null, form.title || "标题"),
                h(
                  "div",
                  {
                    className: "xhs-meta",
                    style: { margin: "5px 0", whiteSpace: "pre-wrap" },
                  },
                  (form.content || "正文").slice(0, 120),
                ),
                h(
                  "div",
                  { style: { color: "#2f5bd7", fontSize: 12 } },
                  hashtags.map((t) => "#" + t).join(" "),
                ),
              ),
            ),
          ),
          h(
            Card,
            { title: "发布前检查" },
            rows(checks?.items).map((i) =>
              h(
                Row,
                { key: i.key, sub: i.label },
                pill(
                  (i.level === "ok" ? "✓ " : i.level === "bad" ? "✕ " : "! ") +
                    i.detail,
                  i.level === "ok" ? "ok" : i.level === "bad" ? "bad" : "warn",
                ),
              ),
            ),
            !checks &&
              h(
                "div",
                { className: "xhs-empty" },
                "保存后提交审核，系统会检查重复度、素材来源、业务信息、敏感词、AI 标识和商业披露。",
              ),
            checks?.stale &&
              h("div", { className: "xhs-meta" }, "内容已修改，需要重新检查。"),
            draft.id &&
              h(
                "div",
                { className: "xhs-actions" },
                h(
                  Button,
                  {
                    primary: true,
                    disabled: readOnly,
                    onClick: async () => {
                      await send(host, "content.meta", {
                        id: draft.id,
                        meta: {},
                        fix_labels: true,
                      });
                      await refresh();
                    },
                  },
                  "一键补上标识与披露",
                ),
                h(
                  Button,
                  {
                    disabled: readOnly,
                    onClick: async () => {
                      await send(host, "content.precheck", { id: draft.id });
                      await refresh();
                    },
                  },
                  "重新检查",
                ),
              ),
          ),
          h(
            Card,
            { title: "审核记录" },
            rows(current?.review_log).map((x, i) =>
              h(
                Row,
                { key: i, title: x.event, sub: fmt(x.at, zone) },
                pill(`v${i + 1}`),
              ),
            ),
            !rows(current?.review_log).length &&
              h("div", { className: "xhs-empty" }, "还没有记录"),
          ),
        ),
      ),
    imitate !== null &&
      h(
        Dialog,
        {
          title: "上传参考并仿写",
          desc: "粘贴参考内容。只学习结构和节奏，不复制它的句子、数据和图片。",
          onClose: () => setImitate(null),
          footer: [
            h(Button, { key: "c", onClick: () => setImitate(null) }, "取消"),
            h(
              Button,
              {
                key: "ok",
                primary: true,
                disabled: !imitate.trim(),
                onClick: async () => {
                  const reference = imitate;
                  setImitate(null);
                  await rewrite("imitate", reference);
                },
              },
              "仿写",
            ),
          ],
        },
        h(Field, {
          label: "参考内容",
          multiline: true,
          value: imitate,
          onChange: setImitate,
        }),
        h(
          "label",
          { className: "xhs-btn" },
          "上传文本文件",
          h("input", {
            type: "file",
            accept: ".txt,.md,text/plain",
            style: { display: "none" },
            onChange: async (e) => {
              const file = e.target.files[0];
              if (file) setImitate((await file.text()).slice(0, 4000));
            },
          }),
        ),
      ),
  );
}

// ---- 素材库 ----
function MaterialsPanel({ snapshot, host, readOnly, refresh, go }) {
  const data = snapshot.data;
  const materials = rows(data.materials);
  const accounts = rows(data.accounts);
  const consents = rows(data.authorizations).filter(
    (c) => c.status === "active",
  );
  const [textValue, setTextValue] = useState("");
  const [images, setImages] = useState([]);
  const [file, setFile] = useState(null);
  const [currentId, setCurrentId] = useState("");
  const [scene, setScene] = useState("");
  const [filters, setFilters] = useState({ kind: "", owner: "", origin: "" });
  const [consentId, setConsentId] = useState("");
  const current = materials.find((m) => m.id === currentId);
  const saveNew = async (thenGenerate) => {
    const id = crypto.randomUUID();
    await send(host, "material.save", {
      id,
      version: null,
      kind:
        images.length && !textValue.trim()
          ? "image"
          : file
          ? "file"
          : "experience",
      title: file?.name?.slice(0, 60) || "",
      text: textValue,
      owner: "public",
      account_ids: [],
      origin: file || images.length ? "upload" : "spoken",
      consent_id: "",
      images,
      file_name: file?.name || "",
      file_size: file?.size || 0,
    });
    setTextValue("");
    setImages([]);
    setFile(null);
    setCurrentId(id);
    if (textValue.trim())
      await send(host, "material.organize", { id }).catch(() => undefined);
    if (thenGenerate) {
      await send(host, "task.add", {
        title: (textValue || file?.name || "素材选题").slice(0, 40),
        account_id: "",
        nature: "life",
        material_ids: [id],
        source: "material",
      });
      await refresh();
      go("content", "plan");
      return;
    }
    toast("已保存");
    await refresh();
  };
  const pickFile = (accept, onFile) =>
    h("input", {
      type: "file",
      accept,
      style: { display: "none" },
      disabled: readOnly,
      onChange: async (e) => {
        const f = e.target.files[0];
        e.target.value = "";
        if (f) await onFile(f);
      },
    });
  const update = async (m, patch) => {
    await send(host, "material.save", {
      id: m.id,
      version: m.version,
      kind: m.kind,
      title: m.title || "",
      text: m.text || "",
      owner: m.owner,
      account_ids: rows(m.account_ids),
      origin: m.origin,
      consent_id: m.consent_id || "",
      images: rows(m.images),
      file_name: m.file_name || "",
      file_size: m.file_size || 0,
      confirmed: !!m.confirmed,
      ...patch,
    });
    await refresh();
  };
  const ownerText = (m) =>
    m.owner === "public"
      ? "公共素材库"
      : m.owner === "shared"
      ? `多账号共用（${rows(m.account_ids).length}）`
      : rows(m.account_ids)
          .map((id) => accountName(snapshot, id))
          .join("、") || "—";
  const boundary = (m) => {
    if (m.status === "frozen") return pill("已冻结（授权撤回）", "bad", true);
    if (["ai", "ai_reconstruct"].includes(m.origin))
      return pill("需加标识", "warn", true);
    if (m.kind === "reference") return pill("只作参考，不复制", "warn", true);
    if (m.kind === "experience") return pill("仅本人账号", "ok", true);
    return pill(m.owner === "public" ? "品牌自有" : "内部资料", "ok", true);
  };
  const shown = materials.filter(
    (m) =>
      (!filters.kind || m.kind === filters.kind) &&
      (!filters.owner || m.owner === filters.owner) &&
      (!filters.origin || m.origin === filters.origin),
  );
  const a = current?.analysis;
  const suggested = rows(a?.suggested_account_ids);
  return h(
    "div",
    { className: "xhs-stack" },
    h(
      "div",
      { className: "xhs-2", style: { gap: 12, alignItems: "start" } },
      h(
        "div",
        { className: "xhs-stack" },
        h(
          Card,
          {
            title: "添加素材",
            tip: "文字、图片、语音、文件都可以。不用马上做成笔记，系统会先整理保存，之后做内容计划时自动匹配。",
          },
          h("textarea", {
            className: "xhs-textarea",
            value: textValue,
            disabled: readOnly,
            "aria-label": "素材内容",
            placeholder:
              "例如：小王周末去了天坛，下午阳光很好，想分享一下秋天的景色，但是没有拍照。",
            onChange: (e) => setTextValue(e.target.value),
          }),
          (images.length > 0 || file) &&
            h(
              "div",
              { className: "xhs-meta" },
              [
                images.length ? `图片 ${images.length} 张` : "",
                file ? `文件 ${file.name}` : "",
              ]
                .filter(Boolean)
                .join(" · "),
            ),
          h(
            "div",
            { className: "xhs-actions" },
            h(
              "label",
              { className: "xhs-btn" },
              ic("上传图片"),
              "上传图片",
              h("input", {
                type: "file",
                accept: "image/png,image/jpeg,image/webp",
                multiple: true,
                style: { display: "none" },
                disabled: readOnly,
                onChange: async (e) => {
                  const added = await readImageFiles([...e.target.files]);
                  e.target.value = "";
                  setImages([...images, ...added].slice(0, 9));
                },
              }),
            ),
            h(
              "label",
              { className: "xhs-btn" },
              ic("上传语音"),
              "上传语音",
              pickFile("audio/*", async (f) =>
                setFile({ name: f.name, size: f.size }),
              ),
            ),
            h(
              "label",
              { className: "xhs-btn" },
              ic("上传文件"),
              "上传文件",
              pickFile(".txt,.md,.csv,.xlsx,.docx,.pdf", async (f) => {
                setFile({ name: f.name, size: f.size });
                if (/\.(txt|md|csv)$/i.test(f.name))
                  setTextValue((await f.text()).slice(0, 4000));
              }),
            ),
            h(
              Button,
              {
                primary: true,
                disabled:
                  readOnly || (!textValue.trim() && !images.length && !file),
                onClick: () => saveNew(false),
              },
              "保存素材",
            ),
            h(
              Button,
              {
                disabled:
                  readOnly || (!textValue.trim() && !images.length && !file),
                onClick: () => saveNew(true),
              },
              "立即用它生成内容",
            ),
          ),
        ),
        h(
          Card,
          { title: "生活场景 AI 补图" },
          h(Field, {
            label: "场景描述",
            multiline: true,
            value: scene,
            onChange: setScene,
            disabled: readOnly,
            placeholder:
              "今天吃了一碗牛肉面，汤很浓，面是宽面，店里是老式木桌，可惜忘了拍照。",
          }),
          h(
            "div",
            { className: "xhs-meta" },
            "生成的图片保留“AI 重现”来源标记，不会当作现场实拍使用。",
          ),
          h(
            "div",
            { className: "xhs-actions" },
            h(
              Button,
              {
                primary: true,
                disabled: readOnly || !scene.trim(),
                onClick: async () => {
                  await send(host, "material.reconstruct", {
                    text: scene,
                    count: 3,
                    account_id: suggested[0] || "",
                  });
                  setScene("");
                  await refresh();
                },
              },
              "生成 3 张",
            ),
            h(
              Button,
              {
                disabled: readOnly || !scene.trim() || !accounts.length,
                onClick: async () => {
                  await send(host, "material.reconstruct", {
                    text: scene,
                    count: 3,
                    account_id: suggested[0] || accounts[0].id,
                    with_persona: true,
                  });
                  setScene("");
                  await refresh();
                },
              },
              "带人物参考生成",
            ),
          ),
        ),
      ),
      h(
        Card,
        { title: "系统整理结果" },
        current
          ? [
              h(Table, {
                key: "t",
                head: ["项目", "内容"],
                body: [
                  [
                    "素材类型",
                    `${MATERIAL_KINDS[current.kind]} · ${
                      rows(current.images).length
                        ? "图片"
                        : current.file_name
                        ? "文件"
                        : "文字"
                    }`,
                  ],
                  ["归属", a?.owner_hint || ownerText(current)],
                  [
                    "建议关联账号",
                    suggested
                      .map((id) => accountName(snapshot, id))
                      .join("、") || "—",
                  ],
                  ["可以做成", rows(a?.formats).join(" · ") || "—"],
                  ["缺少", rows(a?.missing).join("；") || "—"],
                  [
                    "使用边界",
                    a?.boundary ||
                      (current.kind === "experience"
                        ? "只能用于本人账号，不能改写成其他账号的亲身经历"
                        : "—"),
                  ],
                ],
              }),
              current.kind === "experience" &&
                h(Select, {
                  key: "c",
                  label: "授权（真实人物或经历时必选）",
                  value: consentId || current.consent_id || "",
                  onChange: setConsentId,
                  options: [
                    ["", "不涉及个人授权"],
                    ...consents.map((c) => [
                      c.id,
                      `${c.person} · 至 ${c.valid_to}`,
                    ]),
                  ],
                }),
              h(
                "div",
                { key: "a", className: "xhs-actions" },
                h(
                  Button,
                  {
                    primary: true,
                    disabled: readOnly,
                    onClick: async () => {
                      await update(current, {
                        owner: suggested.length
                          ? suggested.length > 1
                            ? "shared"
                            : "account"
                          : current.owner,
                        account_ids: suggested.length
                          ? suggested
                          : rows(current.account_ids),
                        consent_id: consentId || current.consent_id || "",
                        confirmed: true,
                      });
                      toast("已确认");
                    },
                  },
                  "确认归属与边界",
                ),
                h(
                  Button,
                  {
                    disabled: readOnly || current.kind === "experience",
                    onClick: () =>
                      update(current, {
                        owner: "public",
                        account_ids: [],
                        consent_id: "",
                      }),
                  },
                  "改为公共素材",
                ),
                h(
                  Button,
                  {
                    disabled: readOnly || !current.text,
                    onClick: () => setScene(current.text.slice(0, 500)),
                  },
                  "AI 补图",
                ),
                !a &&
                  h(
                    Button,
                    {
                      disabled: readOnly,
                      onClick: async () => {
                        await send(host, "material.organize", {
                          id: current.id,
                        });
                        await refresh();
                      },
                    },
                    "重新整理",
                  ),
              ),
            ]
          : h(
              "div",
              { className: "xhs-empty" },
              "保存素材后，这里显示系统整理出的类型、归属、可以做成什么和使用边界。也可以在下面的资产库里点一条素材查看。",
            ),
      ),
    ),
    h(
      Card,
      { title: "素材资产库" },
      h(
        "div",
        { style: { display: "flex", gap: 8, marginBottom: 8 } },
        h(Select, {
          label: "",
          style: { width: 170, marginTop: 0 },
          value: filters.kind,
          onChange: (v) => setFilters({ ...filters, kind: v }),
          options: [["", "全部类型"], ...Object.entries(MATERIAL_KINDS)],
        }),
        h(Select, {
          label: "",
          style: { width: 150, marginTop: 0 },
          value: filters.owner,
          onChange: (v) => setFilters({ ...filters, owner: v }),
          options: [
            ["", "全部归属"],
            ["account", "绑定账号"],
            ["shared", "多账号共用"],
            ["public", "公共素材库"],
          ],
        }),
        h(Select, {
          label: "",
          style: { width: 150, marginTop: 0 },
          value: filters.origin,
          onChange: (v) => setFilters({ ...filters, origin: v }),
          options: [
            ["", "全部来源"],
            ["real", "真实拍摄"],
            ["ai", "AI 生成"],
            ["ai_reconstruct", "AI 重现"],
          ],
        }),
      ),
      h(Table, {
        head: ["素材", "类型", "归属", "来源", "授权与边界", "已使用", ""],
        body: shown.map((m) => [
          h(
            "button",
            { className: "xhs-link", onClick: () => setCurrentId(m.id) },
            m.title || (m.text || "").slice(0, 20) || m.file_name || "图片素材",
          ),
          MATERIAL_KINDS[m.kind],
          ownerText(m),
          ["ai", "ai_reconstruct"].includes(m.origin)
            ? pill(ORIGINS[m.origin], "warn", true)
            : ORIGINS[m.origin] || m.origin,
          boundary(m),
          m.kind === "reference" ? "—" : `${m.used || 0} 次`,
          h(
            "span",
            { style: { display: "flex", gap: 6 } },
            m.kind === "reference"
              ? h(
                  Button,
                  {
                    disabled: readOnly,
                    onClick: () => go("content", "templates"),
                  },
                  "提交提炼母版",
                )
              : h(
                  Button,
                  {
                    disabled: readOnly || m.status === "frozen",
                    onClick: async () => {
                      await send(host, "task.add", {
                        title: (m.title || m.text || "素材选题").slice(0, 40),
                        account_id:
                          rows(m.account_ids)[0] ||
                          rows(m.analysis?.suggested_account_ids)[0] ||
                          "",
                        nature: "life",
                        material_ids: [m.id],
                        source: "material",
                      });
                      await refresh();
                      go("content", "plan");
                    },
                  },
                  "生成内容",
                ),
            h(
              Button,
              {
                danger: true,
                disabled: readOnly,
                onClick: async () => {
                  await send(host, "material.delete", { id: m.id });
                  await refresh();
                },
              },
              "删除",
            ),
          ),
        ]),
        empty: "还没有素材",
      }),
    ),
  );
}

// ---- 内容母版 ----
const TEMPLATE_KINDS = ["人设类", "功课类", "体验类", "效果展示类"];
const VISUALS = [
  "双栏对比",
  "清单",
  "信息图",
  "时间轴",
  "生活摄影",
  "日记拼贴",
];
function TemplatesPanel({ snapshot, host, readOnly, refresh, go }) {
  const data = snapshot.data;
  const zone = tz(snapshot);
  const cache = data.catalog_cache || {};
  const templates = rows(cache.templates);
  const subs = rows(data.template_submissions);
  const drafts = rows(data.drafts);
  const caps = snapshot.license?.policy?.caps || {};
  const [filters, setFilters] = useState({ kind: "", scope: "", visual: "" });
  const [goal, setGoal] = useState("");
  const [example, setExample] = useState(null);
  const [submit, setSubmit] = useState(null);
  const [suggest, setSuggest] = useState(null);
  const scopes = [...new Set(templates.map((t) => t.scope).filter(Boolean))];
  const shown = templates.filter(
    (t) =>
      (!filters.kind || t.kind === filters.kind) &&
      (!filters.scope || t.scope === filters.scope) &&
      (!filters.visual || String(t.visual || "").includes(filters.visual)),
  );
  const usage = (t) => {
    const used = drafts.filter((d) => d.template_id === t.id);
    const passed = used.filter((d) =>
      ["approved", "scheduled", "published"].includes(d.review_status),
    ).length;
    return used.length
      ? `已使用 ${used.length} 次 · 过审 ${Math.round(
          (passed * 100) / used.length,
        )}%`
      : "已使用 0 次";
  };
  const hasCase = rows(data.authorizations).some(
    (c) => c.status === "active" && rows(c.covers).includes("case"),
  );
  const words = goal.trim();
  const recommended = words
    ? templates
        .filter((t) => t.available !== false && t.kind === "功课类")
        .slice(0, 3)
    : [];
  const caseTemplate = templates.find((t) => t.kind === "效果展示类");
  const presets = templates.filter((t) => t.image_preset);
  const published = drafts.filter((d) =>
    ["approved", "scheduled", "published"].includes(d.review_status),
  );
  return h(
    "div",
    { className: "xhs-stack" },
    h(
      Card,
      {
        title: "内容母版库",
        tip: "母版 = 运营经验 + 文案结构 + 图片形式 + 适用条件。系统按运营目标、账号人设和现有素材自动匹配，你也可以手动切换。",
        right: h(
          Button,
          {
            disabled: readOnly,
            onClick: async () => {
              await send(host, "catalog.refresh", {});
              toast("已同步");
              await refresh();
            },
          },
          "从企业同步",
        ),
      },
      h(
        "div",
        { className: "xhs-3" },
        h(Select, {
          label: "类型",
          value: filters.kind,
          onChange: (v) => setFilters({ ...filters, kind: v }),
          options: [["", "全部类型"], ...TEMPLATE_KINDS.map((k) => [k, k])],
        }),
        h(Select, {
          label: "行业与适用场景",
          value: filters.scope,
          onChange: (v) => setFilters({ ...filters, scope: v }),
          options: [["", "全部"], ...scopes.map((s) => [s, s])],
        }),
        h(Select, {
          label: "配图形式",
          value: filters.visual,
          onChange: (v) => setFilters({ ...filters, visual: v }),
          options: [["", "全部"], ...VISUALS.map((v) => [v, v])],
        }),
      ),
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        },
      },
      h(Lock, {
        children: `企业母版范围：${
          rows(caps.template_scope).join(" + ") || "通用"
        }`,
      }),
      pill(`平台母版 ${templates.length} 个`),
      pill(`我提交的候选 ${subs.length} 个`),
      templates.some((t) => t.available === false) &&
        h(
          "span",
          { className: "xhs-meta" },
          "未开通的母版类别需要平台为企业开通",
        ),
      cache.fetched_at &&
        h(
          "span",
          { className: "xhs-meta" },
          `同步于 ${fmt(cache.fetched_at, zone)}`,
        ),
    ),
    !templates.length &&
      h(
        "div",
        { className: "xhs-card xhs-empty" },
        "还没有同步母版。点“从企业同步”获取平台为企业开通的母版和词库。",
      ),
    h(
      "div",
      { className: "xhs-grid" },
      shown.map((t) =>
        h(
          "section",
          {
            key: t.id,
            className: "xhs-card",
            style: t.available === false ? { opacity: 0.6 } : undefined,
          },
          h("h3", null, t.name),
          h(
            "div",
            {
              style: {
                display: "flex",
                gap: 5,
                flexWrap: "wrap",
                marginBottom: 6,
              },
            },
            pill(t.kind),
            t.compliance &&
              t.compliance !== "通用" &&
              pill(t.compliance, "warn", true),
          ),
          h("div", { className: "xhs-meta" }, "结构：", t.structure),
          h("div", { className: "xhs-meta" }, "配图：", t.visual || "—"),
          h(
            "div",
            { className: "xhs-meta" },
            "需要素材：",
            t.required_material || "—",
          ),
          h("div", { className: "xhs-meta" }, usage(t)),
          h(
            "div",
            { className: "xhs-actions" },
            t.available === false
              ? h(Button, { disabled: true }, "企业未开通此类母版")
              : h(
                  Button,
                  {
                    primary: true,
                    disabled: readOnly,
                    onClick: () => go("content", "editor", "new"),
                  },
                  "用它创作",
                ),
            h(Button, { onClick: () => setExample(t) }, "查看示例"),
          ),
        ),
      ),
    ),
    h(
      "div",
      { className: "xhs-2", style: { gap: 12, alignItems: "start" } },
      h(
        Card,
        { title: "智能匹配示例" },
        h(Field, {
          label: "运营目标",
          value: goal,
          onChange: setGoal,
          placeholder: "例如：疤痕修复，手术与非手术怎么选",
        }),
        h(
          Row,
          { title: "推荐母版" },
          recommended.length
            ? recommended.map((t) =>
                h(
                  "span",
                  { key: t.id, className: "xhs-pill ok" },
                  h("i", { className: "xhs-dot" }),
                  t.name,
                ),
              )
            : h("span", { className: "xhs-meta" }, "输入运营目标后显示"),
        ),
        caseTemplate &&
          h(
            Row,
            {
              title: caseTemplate.name,
              sub: "只有在已有真实、授权的病例资料时才会推荐",
            },
            pill(
              hasCase && caseTemplate.available !== false
                ? "可推荐"
                : "暂不推荐",
              hasCase && caseTemplate.available !== false ? "ok" : "warn",
              true,
            ),
          ),
        h(
          "div",
          { className: "xhs-meta" },
          "医疗、医美内容不会生成未经证实的疗效、患者评价或虚构的治疗前后对比；高风险内容保留人工审核。",
        ),
      ),
      h(
        Card,
        { title: "配图指令预设" },
        h(Table, {
          head: ["预设", "用于母版", "指令摘要"],
          body: presets.map((t) => [
            String(t.visual || "").split(/[、，]/)[0] || "预设",
            t.name,
            t.image_preset,
          ]),
          empty: "母版里还没有配图预设",
        }),
        h(
          "div",
          { className: "xhs-actions" },
          h(
            Button,
            {
              disabled: readOnly || !published.length,
              onClick: () =>
                setSubmit({
                  id: published[0]?.id || "",
                  structure: "",
                  metrics: "",
                }),
            },
            "提交优质内容为母版",
          ),
          h(
            Button,
            {
              disabled: readOnly,
              onClick: () => setSuggest({ name: "", structure: "" }),
            },
            "建议新母版",
          ),
        ),
      ),
    ),
    h(
      Card,
      {
        title: "我提交的母版候选",
        tip: "提交的是结构和做法，平台审核时会去掉账号信息；被采纳后，范围内的企业都能用。",
      },
      h(Table, {
        head: ["内容", "提交时间", "表现", "平台审核", ""],
        body: subs.map((s) => [
          s.title,
          fmt(s.created_at, zone, { month: "2-digit", day: "2-digit" }),
          s.metrics || "—",
          pill(
            s.status === "adopted"
              ? "已采纳"
              : s.status === "rejected"
              ? "未采纳"
              : "平台审核中",
            s.status === "adopted"
              ? "ok"
              : s.status === "pending"
              ? "warn"
              : "",
            true,
          ),
          s.status === "pending"
            ? h(
                Button,
                {
                  disabled: readOnly,
                  onClick: async () => {
                    await send(host, "template.candidate", {
                      action: "withdraw",
                      id: s.id,
                    });
                    await refresh();
                  },
                },
                "撤回提交",
              )
            : h(
                Button,
                {
                  onClick: () =>
                    setExample({
                      name: s.title,
                      structure: s.structure,
                      visual: "",
                      required_material: "",
                      review_note: s.review_note,
                    }),
                },
                "查看",
              ),
        ]),
        empty: "还没有提交",
      }),
    ),
    example &&
      h(
        Dialog,
        {
          title: example.name,
          onClose: () => setExample(null),
          footer: [
            h(Button, { key: "c", onClick: () => setExample(null) }, "关闭"),
          ],
        },
        String(example.structure || "")
          .split(/\s*→\s*/)
          .map((step, i) => h(Row, { key: i, title: `${i + 1}. ${step}` })),
        example.visual &&
          h("div", { className: "xhs-meta" }, `配图：${example.visual}`),
        example.image_preset &&
          h(
            "div",
            { className: "xhs-meta" },
            `配图指令：${example.image_preset}`,
          ),
        example.review_note &&
          h(
            "div",
            { className: "xhs-meta" },
            `平台意见：${example.review_note}`,
          ),
      ),
    submit &&
      h(
        Dialog,
        {
          title: "提交优质内容为母版",
          desc: "提交的是结构和做法，不包含账号信息。",
          onClose: () => setSubmit(null),
          footer: [
            h(Button, { key: "c", onClick: () => setSubmit(null) }, "取消"),
            h(
              Button,
              {
                key: "ok",
                primary: true,
                disabled: !submit.id,
                onClick: async () => {
                  await send(host, "template.submit", submit);
                  setSubmit(null);
                  toast("已提交");
                  await refresh();
                },
              },
              "提交",
            ),
          ],
        },
        h(Select, {
          label: "内容",
          value: submit.id,
          onChange: (v) => setSubmit({ ...submit, id: v }),
          options: published.map((d) => [d.id, d.title]),
        }),
        h(Field, {
          label: "结构",
          value: submit.structure,
          onChange: (v) => setSubmit({ ...submit, structure: v }),
          placeholder: "例如：误区 → 为什么不对 → 正确做法",
        }),
        h(Field, {
          label: "表现数据（可选）",
          value: submit.metrics,
          onChange: (v) => setSubmit({ ...submit, metrics: v }),
          placeholder: "例如：阅读 1.2 万 · 互动率约 7%",
        }),
      ),
    suggest &&
      h(
        Dialog,
        {
          title: "建议新母版",
          onClose: () => setSuggest(null),
          footer: [
            h(Button, { key: "c", onClick: () => setSuggest(null) }, "取消"),
            h(
              Button,
              {
                key: "ok",
                primary: true,
                disabled: !suggest.name.trim() || !suggest.structure.trim(),
                onClick: async () => {
                  await send(host, "template.candidate", suggest);
                  setSuggest(null);
                  toast("已提交");
                  await refresh();
                },
              },
              "提交",
            ),
          ],
        },
        h(Field, {
          label: "母版名称",
          value: suggest.name,
          onChange: (v) => setSuggest({ ...suggest, name: v }),
        }),
        h(Field, {
          label: "结构",
          multiline: true,
          value: suggest.structure,
          onChange: (v) => setSuggest({ ...suggest, structure: v }),
          placeholder: "例如：场景 → 3–5 条要点 → 收尾提醒",
        }),
      ),
  );
}

// ---- 业务资料 ----
const BIZ_FIELDS = {
  org: ["主营业务", "机构介绍", "门店与服务地区", "资质文件"],
  project: ["核心卖点", "价格", "适用条件", "注意事项"],
  person: ["身份", "可公开信息", "资质", "授权"],
};
function BizDocsPanel({ snapshot, host, readOnly, refresh }) {
  const docs = rows(snapshot.data.biz_docs);
  const [kind, setKind] = useState("org");
  const blank = (k, from) => ({
    id: from?.id || "",
    version: from?.version ?? null,
    kind: k,
    name: from?.name || "",
    fields: {
      ...Object.fromEntries(BIZ_FIELDS[k].map((f) => [f, ""])),
      ...(from?.fields || {}),
    },
    source: from?.source || "",
  });
  const org = docs.find((d) => d.kind === "org");
  const [orgForm, setOrgForm] = useState(blank("org", org));
  useEffect(() => setOrgForm(blank("org", org)), [org?.version]);
  const [form, setForm] = useState(null);
  const save = async (f) => {
    await send(host, "bizdoc.save", {
      id: f.id || "",
      version: f.version ?? null,
      kind: f.kind,
      name: f.name,
      fields: f.fields,
      source: f.source || "",
    });
    toast("已保存");
    await refresh();
  };
  const importFile = async (file) => {
    const lines = (await file.text()).split(/\r?\n/).filter((l) => l.trim());
    const head = lines[0]
      .split(/[,\t]/)
      .map((c) => c.trim().replace(/^"|"$/g, ""));
    for (const line of lines.slice(1, 51)) {
      const cells = line
        .split(/[,\t]/)
        .map((c) => c.trim().replace(/^"|"$/g, ""));
      const record = Object.fromEntries(
        head.map((k, i) => [k, cells[i] || ""]),
      );
      if (!record["项目"]) continue;
      await send(host, "bizdoc.save", {
        id: "",
        version: null,
        kind: "project",
        name: record["项目"],
        fields: Object.fromEntries(
          BIZ_FIELDS.project.map((f) => [f, record[f] || ""]),
        ),
        source: record["资料来源"] || file.name,
      });
    }
    await refresh();
  };
  const orgField = (f, multiline) =>
    h(Field, {
      key: f,
      label: f,
      multiline,
      value: orgForm.fields[f],
      disabled: readOnly,
      onChange: (v) =>
        setOrgForm({ ...orgForm, fields: { ...orgForm.fields, [f]: v } }),
    });
  const list = docs.filter((d) => d.kind === kind);
  return h(
    Card,
    {
      title: "业务资料",
      tip: "生成内容时，价格、功效、适用条件等信息只从这里取，取不到就不写。发布前检查也会用它核对价格。",
    },
    h(
      "div",
      { className: "xhs-tabs", role: "tablist" },
      [
        ["org", "机构资料"],
        ["project", "项目资料"],
        ["person", "医生与人员资料"],
      ].map(([k, l]) =>
        h(
          "button",
          {
            key: k,
            role: "tab",
            className: `xhs-tab${kind === k ? " is-active" : ""}`,
            onClick: () => {
              setKind(k);
              setForm(null);
            },
          },
          l,
        ),
      ),
    ),
    kind === "org" && [
      h(
        "div",
        { key: "a", className: "xhs-2" },
        h(Field, {
          label: "机构名称",
          value: orgForm.name,
          disabled: readOnly,
          onChange: (v) => setOrgForm({ ...orgForm, name: v }),
        }),
        orgField("主营业务"),
      ),
      orgField("机构介绍", true),
      h(
        "div",
        { key: "b", className: "xhs-2" },
        orgField("门店与服务地区"),
        h(
          "label",
          { className: "xhs-field" },
          h("span", { className: "xhs-label" }, "资质文件"),
          h(
            "div",
            {
              style: {
                display: "flex",
                gap: 6,
                alignItems: "center",
                marginTop: 5,
              },
            },
            h(
              "span",
              { className: "xhs-input", style: { marginTop: 0, flex: 1 } },
              orgForm.fields["资质文件"]
                ? `${orgForm.fields["资质文件"]} · 已登记`
                : "未登记",
            ),
            h(
              "label",
              { className: "xhs-btn" },
              "上传…",
              h("input", {
                type: "file",
                style: { display: "none" },
                disabled: readOnly,
                onChange: (e) => {
                  const f = e.target.files[0];
                  if (f)
                    setOrgForm({
                      ...orgForm,
                      fields: { ...orgForm.fields, 资质文件: f.name },
                    });
                },
              }),
            ),
          ),
        ),
      ),
      h(
        "div",
        { key: "c", className: "xhs-actions" },
        h(
          Button,
          {
            primary: true,
            disabled: readOnly || !orgForm.name.trim(),
            onClick: () => save(orgForm),
          },
          "保存",
        ),
      ),
    ],
    kind === "project" && [
      h(Table, {
        key: "t",
        head: ["项目", ...BIZ_FIELDS.project, "资料来源", ""],
        body: list.map((d) => [
          d.name,
          ...BIZ_FIELDS.project.map((f) => (d.fields || {})[f] || "—"),
          d.source || "—",
          h(
            "span",
            { style: { display: "flex", gap: 6 } },
            h(
              Button,
              {
                disabled: readOnly,
                onClick: () => setForm(blank("project", d)),
              },
              "编辑",
            ),
            h(
              Button,
              {
                danger: true,
                disabled: readOnly,
                onClick: async () => {
                  await send(host, "bizdoc.delete", { id: d.id });
                  await refresh();
                },
              },
              "删除",
            ),
          ),
        ]),
        empty: "还没有项目资料",
      }),
      h(
        "div",
        { key: "a", className: "xhs-actions" },
        h(
          Button,
          {
            primary: true,
            disabled: readOnly,
            onClick: () => setForm(blank("project")),
          },
          "添加项目",
        ),
        h(
          "label",
          { className: "xhs-btn" },
          "从文件导入",
          h("input", {
            type: "file",
            accept: ".csv,.tsv,.txt",
            style: { display: "none" },
            disabled: readOnly,
            onChange: (e) => {
              const f = e.target.files[0];
              e.target.value = "";
              if (f)
                importFile(f).catch((error) =>
                  window.dispatchEvent(
                    new CustomEvent("octop:xhs-error", { detail: error }),
                  ),
                );
            },
          }),
        ),
      ),
    ],
    kind === "person" && [
      h(Table, {
        key: "t",
        head: ["姓名", "身份", "可公开信息", "资质", "授权", ""],
        body: list.map((d) => [
          d.name,
          (d.fields || {})["身份"] || "—",
          (d.fields || {})["可公开信息"] || "—",
          (d.fields || {})["资质"] || "—",
          (d.fields || {})["授权"] ? pill(d.fields["授权"], "ok", true) : "—",
          h(
            "span",
            { style: { display: "flex", gap: 6 } },
            h(
              Button,
              {
                disabled: readOnly,
                onClick: () => setForm(blank("person", d)),
              },
              "编辑",
            ),
            h(
              Button,
              {
                danger: true,
                disabled: readOnly,
                onClick: async () => {
                  await send(host, "bizdoc.delete", { id: d.id });
                  await refresh();
                },
              },
              "删除",
            ),
          ),
        ]),
        empty: "还没有人员资料",
      }),
      h(
        "div",
        { key: "m", className: "xhs-meta", style: { marginTop: 8 } },
        "医疗、医美机构在这里录入医生资料与执业资质；内容里出现的专业信息必须能在这里找到来源。",
      ),
      h(
        "div",
        { key: "a", className: "xhs-actions" },
        h(
          Button,
          {
            primary: true,
            disabled: readOnly,
            onClick: () => setForm(blank("person")),
          },
          "添加人员",
        ),
      ),
    ],
    form &&
      h(
        Dialog,
        {
          title: form.id
            ? `编辑 · ${form.name}`
            : form.kind === "project"
            ? "添加项目"
            : "添加人员",
          onClose: () => setForm(null),
          footer: [
            h(Button, { key: "c", onClick: () => setForm(null) }, "取消"),
            h(
              Button,
              {
                key: "ok",
                primary: true,
                disabled: !form.name.trim(),
                onClick: async () => {
                  await save(form);
                  setForm(null);
                },
              },
              "保存",
            ),
          ],
        },
        h(Field, {
          label: form.kind === "project" ? "项目" : "姓名",
          value: form.name,
          onChange: (v) => setForm({ ...form, name: v }),
        }),
        BIZ_FIELDS[form.kind].map((f) =>
          h(Field, {
            key: f,
            label: f,
            value: form.fields[f],
            onChange: (v) =>
              setForm({ ...form, fields: { ...form.fields, [f]: v } }),
          }),
        ),
        h(Field, {
          label: "资料来源",
          value: form.source,
          onChange: (v) => setForm({ ...form, source: v }),
          placeholder: "例如：产品部 · 10-20",
        }),
      ),
  );
}

// ---- 排期日历 ----
const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
function CalendarPanel({ snapshot, host, readOnly, refresh, go }) {
  const data = snapshot.data;
  const zone = tz(snapshot);
  const eff = data.effective_policy || {};
  const accounts = rows(data.accounts);
  const [offset, setOffset] = useState(0);
  const [drag, setDrag] = useState(null);
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7);
  const days = WEEKDAYS.map(
    (_, i) => new Date(monday.getTime() + i * 86400000),
  );
  const md = (d) =>
    `${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  const sameDay = (iso, d) => {
    const x = new Date(iso);
    return (
      x.getFullYear() === d.getFullYear() &&
      x.getMonth() === d.getMonth() &&
      x.getDate() === d.getDate()
    );
  };
  const scheduled = rows(data.drafts).filter(
    (d) =>
      d.scheduled_at &&
      d.account_id &&
      ["approved", "scheduled", "published", "pending_review"].includes(
        d.review_status,
      ),
  );
  const inWeek = scheduled.filter((d) =>
    days.some((day) => sameDay(d.scheduled_at, day)),
  );
  const move = async (draft, day) => {
    const at = new Date(draft.scheduled_at);
    const next = new Date(day);
    next.setHours(at.getHours(), at.getMinutes(), 0, 0);
    await send(host, "plan.update", {
      action: "schedule",
      ids: [draft.id],
      scheduled_at: next.toISOString(),
    });
    await refresh();
  };
  const dismissed = new Set(rows(data.dismissed_alerts));
  const notes = [];
  for (const a of accounts) {
    const mine = inWeek
      .filter((d) => d.account_id === a.id && d.review_status !== "published")
      .sort((x, y) => new Date(x.scheduled_at) - new Date(y.scheduled_at));
    const all = scheduled
      .filter((d) => d.account_id === a.id)
      .sort((x, y) => new Date(x.scheduled_at) - new Date(y.scheduled_at));
    for (const d of mine) {
      const prev = all[all.findIndex((x) => x.id === d.id) - 1];
      const gap = prev
        ? Math.round(
            (new Date(d.scheduled_at) - new Date(prev.scheduled_at)) / 3600000,
          )
        : null;
      const id = `gap:${d.id}:${d.scheduled_at}`;
      if (
        gap != null &&
        gap < (eff.min_interval_hours || 0) &&
        !dismissed.has(id)
      ) {
        const target = new Date(
          new Date(prev.scheduled_at).getTime() +
            (eff.min_interval_hours || 0) * 3600000,
        );
        const at = new Date(d.scheduled_at);
        if (
          target.getHours() * 60 + target.getMinutes() >
          at.getHours() * 60 + at.getMinutes()
        )
          target.setDate(target.getDate() + 1);
        target.setHours(at.getHours(), at.getMinutes(), 0, 0);
        notes.push({
          key: id,
          account: a,
          text: `${md(at)} 与上一篇间隔 ${gap} 小时，低于设置的最小间隔 ${
            eff.min_interval_hours
          } 小时`,
          fix: { draft: d, target, id },
        });
      }
    }
    if (mine.length && !a.device_id)
      notes.push({
        key: "dev:" + a.id,
        account: a,
        text: `未绑定手机，${md(
          new Date(mine[0].scheduled_at),
        )} 的发布无法执行`,
        bind: true,
      });
    const week = inWeek.filter((d) => d.account_id === a.id);
    if (week.length && !notes.some((n) => n.account.id === a.id)) {
      const n = (k) => week.filter((d) => d.nature === k).length;
      const ratio = (n("marketing") * 100) / week.length;
      const over = week.length >= 3 && ratio > (eff.marketing_ratio_max ?? 100);
      notes.push({
        key: "mix:" + a.id,
        account: a,
        text: `本周营销 ${n("marketing")} · 生活 ${n("life")} · 知识 ${n(
          "knowledge",
        )}，${over ? "营销占比偏高" : "结构均衡"}`,
        ok: !over,
      });
    }
  }
  return h(
    "div",
    { className: "xhs-stack" },
    h(
      Card,
      { title: "排期日历" },
      h(
        "div",
        {
          style: {
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 10,
            flexWrap: "wrap",
          },
        },
        h(Button, { onClick: () => setOffset(offset - 1) }, "上一周"),
        h("b", null, `${md(days[0])} 至 ${md(days[6])}`),
        h(Button, { onClick: () => setOffset(offset + 1) }, "下一周"),
        h("span", { style: { flex: 1 } }),
        ["marketing", "life", "knowledge"].map((k) =>
          h(
            "span",
            { key: k, className: `xhs-pill nat-${k}` },
            `${NATURE_MARK[k]} ${NATURE_LABELS[k]}`,
          ),
        ),
        h(
          Button,
          {
            disabled: readOnly,
            onClick: async () => {
              const result = await send(host, "plan.reschedule", {});
              const last = result.data?.last_reschedule;
              toast(
                last
                  ? `已排好 ${last.scheduled} 篇${
                      last.unplaced
                        ? `，${last.unplaced} 篇在 14 天内排不进`
                        : ""
                    }`
                  : "已重新排期",
              );
              await refresh();
            },
          },
          "AI 重新排期",
        ),
      ),
      h(Table, {
        head: ["账号", ...days.map((d, i) => `${WEEKDAYS[i]} ${md(d)}`)],
        body: accounts.map((a) => [
          h("b", null, a.name || a.id),
          ...days.map((day) =>
            h(
              "div",
              {
                style: { minHeight: 34, minWidth: 90 },
                onDragOver: (e) => e.preventDefault(),
                onDrop: () => {
                  if (
                    drag &&
                    drag.account_id === a.id &&
                    !sameDay(drag.scheduled_at, day)
                  )
                    move(drag, day).catch((error) =>
                      window.dispatchEvent(
                        new CustomEvent("octop:xhs-error", { detail: error }),
                      ),
                    );
                  setDrag(null);
                },
              },
              inWeek
                .filter(
                  (d) => d.account_id === a.id && sameDay(d.scheduled_at, day),
                )
                .map((d) =>
                  h(
                    "div",
                    {
                      key: d.id,
                      className: `xhs-chip nat-${d.nature || "none"}`,
                      draggable: !readOnly && d.review_status !== "published",
                      onDragStart: () => setDrag(d),
                      onClick: () => go("content", "editor", d.id),
                      title: d.title,
                    },
                    h("b", null, NATURE_MARK[d.nature] || "·"),
                    ` ${hm(d.scheduled_at, zone)} ${String(d.title || "").slice(
                      0,
                      10,
                    )}`,
                  ),
                ),
            ),
          ),
        ]),
        empty: "还没有账号",
      }),
      h(
        "div",
        { className: "xhs-meta", style: { marginTop: 8 } },
        "不要求每个账号每天发帖。拖动卡片可以改时间；同一手机上的发布按顺序执行。",
      ),
    ),
    h(
      Card,
      { title: "排期提醒" },
      notes.map((n) =>
        h(
          Row,
          { key: n.key, title: n.account.name || n.account.id, sub: n.text },
          n.fix &&
            h(
              Button,
              {
                primary: true,
                disabled: readOnly,
                onClick: async () => {
                  await send(host, "plan.update", {
                    action: "schedule",
                    ids: [n.fix.draft.id],
                    scheduled_at: n.fix.target.toISOString(),
                  });
                  await refresh();
                },
              },
              `改到 ${md(n.fix.target)}`,
            ),
          n.fix &&
            h(
              Button,
              {
                disabled: readOnly,
                onClick: async () => {
                  await send(host, "alert.dismiss", { id: n.fix.id });
                  await refresh();
                },
              },
              "保持",
            ),
          n.bind &&
            h(Button, { onClick: () => go("build", "accounts") }, "去绑定"),
          n.ok != null &&
            pill(n.ok ? "正常" : "注意", n.ok ? "ok" : "warn", true),
        ),
      ),
      !notes.length &&
        h("div", { className: "xhs-empty" }, "这一周没有需要注意的排期"),
    ),
  );
}

// ---- 笔记维护 ----
const CONTACT_RE = /(微信|vx|v信|加我|私信|电话|手机号|\d{7,})/i;
const PROMISE_RE = /(\d+\s*元|¥|保证|包邮|最低价|一定)/;
function UpkeepPanel({ snapshot, host, readOnly, refresh, go }) {
  const data = snapshot.data;
  const zone = tz(snapshot);
  const items = rows(data.reply_items);
  const leads = rows(data.leads);
  const eff = data.effective_policy || {};
  const mine = data.member_settings || {};
  const accounts = rows(data.accounts);
  const [filters, setFilters] = useState({
    account: "",
    kind: "ask",
    status: "pending",
  });
  const [selected, setSelected] = useState([]);
  const [edits, setEdits] = useState({});
  const [lead, setLead] = useState(null);
  const [phrases, setPhrases] = useState(null);
  const dayAgo = Date.now() - 86400000;
  const recent = items.filter(
    (i) => new Date(i.created_at).getTime() >= dayAgo,
  );
  const isPending = (i) => i.status === "new" || i.status === "failed";
  const autoToday = items.filter(
    (i) =>
      i.auto &&
      ["sent", "sending", "auto_queued", "unknown", "held"].includes(i.status),
  );
  const pendingAll = items.filter(isPending);
  const statusOf = (i) =>
    isPending(i)
      ? "pending"
      : i.status === "ignored"
      ? "ignored"
      : i.auto
      ? "auto"
      : "replied";
  const shown = items.filter(
    (i) =>
      (!filters.account || i.account_id === filters.account) &&
      (filters.kind === "all" ||
        (filters.kind === "ask"
          ? ["question", "intent", "unclear"].includes(i.kind)
          : i.kind === filters.kind)) &&
      (filters.status === "all" || statusOf(i) === filters.status),
  );
  const blocked = (i) => {
    const a = accounts.find((x) => x.id === i.account_id);
    if (!a) return "";
    if (
      a.health === "login_required" ||
      rows(data.alerts).some(
        (x) => x.account_id === a.id && x.code === "login_required",
      )
    )
      return "账号登录失效，暂时发不出去";
    if (a.health === "restricted" || a.paused)
      return "账号已暂停，暂时发不出去";
    return "";
  };
  const approve = async (i) => {
    let current = i;
    if (edits[i.id] !== undefined && edits[i.id] !== (i.draft || "")) {
      const result = await send(host, "reply.save", {
        id: i.id,
        version: i.version,
        draft: edits[i.id],
      });
      current = rows(result.data?.reply_items).find((x) => x.id === i.id) || i;
    }
    await send(host, "reply.approve", {
      id: i.id,
      version: current.version,
      handwritten: i.kind === "negative",
    });
  };
  const checkAll = async () => {
    for (const a of accounts.filter((x) => x.device_id))
      await send(host, "inbox.collect", { account_id: a.id });
    toast("已安排读取新评论");
    await refresh();
  };
  const set = (patch) => saveSettings(host, snapshot, refresh, patch);
  const kinds = (list, ks) =>
    ks
      .map(([k, l]) => `${l} ${list.filter((i) => i.kind === k).length}`)
      .join(" · ");
  const leadStatus = (l) =>
    pill(
      {
        new: "新",
        transferred: `已转交${l.assignee ? " · " + l.assignee : ""}`,
        contacted: "已联系",
        closed: "已关闭",
      }[l.status],
      l.status === "new" ? "warn" : "ok",
      true,
    );
  const when = (iso) => {
    const d = new Date(iso);
    const today = new Date();
    const y = new Date(Date.now() - 86400000);
    const same = (a, b) => a.toDateString() === b.toDateString();
    return same(d, today)
      ? `今天 ${hm(iso, zone)}`
      : same(d, y)
      ? `昨天 ${hm(iso, zone)}`
      : fmt(iso, zone, { month: "2-digit", day: "2-digit" });
  };
  return h(
    "div",
    { className: "xhs-stack" },
    h(Stats, {
      items: [
        {
          label: "新评论",
          value: recent.length,
          sub: `近 24 小时 · ${
            new Set(recent.map((i) => i.note_title)).size
          } 篇笔记`,
        },
        {
          label: "已自动回复",
          value: autoToday.filter((i) => i.status === "sent").length,
          sub: eff.auto_reply
            ? `闲聊类${
                autoToday.some((i) => i.status !== "sent")
                  ? ` · 另 ${
                      autoToday.filter((i) => i.status !== "sent").length
                    } 条等账号恢复`
                  : ""
              }`
            : "未开启",
        },
        {
          label: "待你审核",
          value: pendingAll.filter((i) => i.kind !== "negative").length,
          sub: kinds(pendingAll, [
            ["question", "咨询"],
            ["intent", "意向"],
          ]),
        },
        {
          label: "需要注意",
          value: pendingAll.filter((i) => i.kind === "negative").length,
          sub: "负面评价，不自动起草",
        },
      ],
    }),
    h(
      Card,
      {
        title: "待你审核",
        tip: eff.auto_reply
          ? "闲聊类已按规则自动回复，不在这里。咨询和意向起草后等你通过；负面评价不起草。"
          : "所有回复都要你通过后才发送。",
        right: h(
          Button,
          {
            disabled: readOnly || !accounts.some((a) => a.device_id),
            onClick: checkAll,
          },
          "检查新评论",
        ),
      },
      h(
        "div",
        { className: "xhs-4", style: { alignItems: "end", marginBottom: 6 } },
        h(Select, {
          label: "账号",
          value: filters.account,
          onChange: (v) => setFilters({ ...filters, account: v }),
          options: [
            ["", "全部账号"],
            ...accounts.map((a) => [a.id, a.name || a.id]),
          ],
        }),
        h(Select, {
          label: "类型",
          value: filters.kind,
          onChange: (v) => setFilters({ ...filters, kind: v }),
          options: [
            ["ask", "咨询与意向"],
            ["question", "咨询"],
            ["intent", "意向"],
            ["negative", "负面"],
            ["all", "全部类型"],
          ],
        }),
        h(Select, {
          label: "状态",
          value: filters.status,
          onChange: (v) => setFilters({ ...filters, status: v }),
          options: [
            ["pending", "待你审核"],
            ["replied", "已回复"],
            ["auto", "已自动回复"],
            ["ignored", "已忽略"],
            ["all", "全部"],
          ],
        }),
        h(
          "div",
          null,
          h(
            Button,
            {
              primary: true,
              disabled: readOnly || !selected.length,
              onClick: async () => {
                for (const id of selected) {
                  const i = items.find((x) => x.id === id);
                  if (
                    i &&
                    isPending(i) &&
                    i.kind !== "negative" &&
                    (edits[id] ?? i.draft)
                  )
                    await approve(i);
                }
                setSelected([]);
                await refresh();
              },
            },
            "批量通过所选",
          ),
        ),
      ),
      shown.map((i) => {
        const draft = edits[i.id] ?? i.draft ?? "";
        const pending = isPending(i);
        const block = blocked(i);
        const writing = i.kind !== "negative" || edits[i.id] !== undefined;
        return h(
          "div",
          {
            key: i.id,
            className: "xhs-row",
            style: { alignItems: "flex-start" },
          },
          h(
            "div",
            { style: { flex: 1, minWidth: 0 } },
            h(
              "label",
              { className: "xhs-check" },
              h("input", {
                type: "checkbox",
                disabled: !pending || i.kind === "negative",
                checked: selected.includes(i.id),
                onChange: (e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, i.id]
                      : selected.filter((x) => x !== i.id),
                  ),
              }),
              h("span", null, h("b", null, `“${i.text}”`)),
            ),
            h(
              "div",
              { className: "xhs-meta" },
              `${i.author} · 笔记「${i.note_title}」· ${accountName(
                snapshot,
                i.account_id,
              )}`,
            ),
            h(
              "div",
              {
                style: {
                  display: "flex",
                  gap: 6,
                  margin: "5px 0",
                  flexWrap: "wrap",
                  alignItems: "center",
                },
              },
              pill(
                KIND_LABELS[i.kind] || i.kind,
                i.kind === "negative" ? "bad" : i.kind === "intent" ? "ok" : "",
                i.kind !== "question",
              ),
              i.kind === "negative" &&
                !writing &&
                h("span", { className: "xhs-meta" }, "负面与投诉不自动起草"),
              writing &&
                draft &&
                pill(
                  rows(eff.banned_words).some((w) => draft.includes(w))
                    ? "! 命中敏感词"
                    : "✓ 未命中敏感词",
                  rows(eff.banned_words).some((w) => draft.includes(w))
                    ? "warn"
                    : "ok",
                ),
              writing &&
                draft &&
                pill(
                  CONTACT_RE.test(draft) ? "! 含联系方式" : "✓ 无联系方式",
                  CONTACT_RE.test(draft) ? "warn" : "ok",
                ),
              writing &&
                draft &&
                i.kind === "intent" &&
                pill(
                  PROMISE_RE.test(draft) ? "! 可能承诺了价格" : "✓ 未承诺价格",
                  PROMISE_RE.test(draft) ? "warn" : "ok",
                ),
              pending && block && pill("! " + block, "warn"),
              i.error && pill(i.error, "bad"),
              !pending &&
                pill(
                  {
                    pending: "",
                    replied:
                      i.status === "sent" ? "已回复" : statusLabel(i.status),
                    auto: "已自动回复",
                    ignored: "已忽略",
                  }[statusOf(i)],
                ),
            ),
            writing &&
              h(
                "label",
                { className: "xhs-field" },
                h("span", { className: "xhs-label" }, "回复草稿"),
                h("input", {
                  className: "xhs-input",
                  value: pending ? draft : i.sent_text || draft,
                  maxLength: 30,
                  disabled: readOnly || !pending,
                  placeholder: "30 字以内，不留联系方式，不承诺效果",
                  onChange: (e) =>
                    setEdits({ ...edits, [i.id]: e.target.value }),
                }),
              ),
          ),
          pending &&
            h(
              "div",
              {
                style: {
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                },
              },
              i.kind !== "negative" &&
                !draft &&
                h(
                  Button,
                  {
                    disabled: readOnly,
                    onClick: async () => {
                      await send(host, "reply.draft", { id: i.id });
                      await refresh();
                    },
                  },
                  "AI 起草",
                ),
              i.kind === "intent" &&
                !i.lead &&
                h(
                  Button,
                  {
                    primary: true,
                    disabled: readOnly,
                    onClick: async () => {
                      await send(host, "reply.lead", { id: i.id });
                      toast("已记为线索");
                      await refresh();
                    },
                  },
                  "记为线索",
                ),
              i.kind === "negative" &&
                !i.lead &&
                h(
                  Button,
                  {
                    disabled: readOnly,
                    onClick: async () => {
                      await send(host, "reply.lead", { id: i.id });
                      toast("已放入线索，可转交同事");
                      await refresh();
                    },
                  },
                  "转给同事",
                ),
              i.kind === "negative" &&
                edits[i.id] === undefined &&
                h(
                  Button,
                  {
                    disabled: readOnly,
                    onClick: () => setEdits({ ...edits, [i.id]: "" }),
                  },
                  "手写回复",
                ),
              writing &&
                h(
                  Button,
                  {
                    primary: !(i.kind === "intent" && !i.lead),
                    disabled: readOnly || !draft.trim(),
                    onClick: async () => {
                      await approve(i);
                      setEdits({ ...edits, [i.id]: undefined });
                      await refresh();
                    },
                  },
                  block ? "通过，登录后发送" : "通过并发送",
                ),
              i.kind !== "negative" &&
                h(
                  Button,
                  {
                    disabled: readOnly,
                    onClick: async () => {
                      await send(host, "reply.ignore", { id: i.id });
                      await refresh();
                    },
                  },
                  "忽略",
                ),
            ),
        );
      }),
      !shown.length &&
        h("div", { className: "xhs-empty" }, "没有符合条件的评论"),
    ),
    h(
      "div",
      { className: "xhs-2", style: { gap: 12, alignItems: "start" } },
      h(
        "div",
        { className: "xhs-stack" },
        h(
          Card,
          {
            title: "已自动回复 · 今天",
            tip: "闲聊类按规则直接发送，这里是事后清单。发得不合适可以删除回复，或改回“等我通过”。",
          },
          h(Table, {
            head: ["评论", "自动回复", "账号", "时间", "状态", ""],
            body: autoToday.map((i) => [
              `“${i.text}”`,
              i.sent_text || i.draft,
              accountName(snapshot, i.account_id),
              i.sent_at ? hm(i.sent_at, zone) : "—",
              pill(
                i.status === "sent"
                  ? "已发送"
                  : i.status === "auto_queued" || i.status === "sending"
                  ? "排队中"
                  : i.status === "unknown"
                  ? "结果待确认"
                  : "未发送 · 账号已暂停",
                i.status === "sent" ? "ok" : "warn",
                true,
              ),
              i.status === "sent"
                ? h(
                    Button,
                    {
                      disabled: readOnly,
                      onClick: async () => {
                        await send(host, "reply.delete", { id: i.id });
                        await refresh();
                      },
                    },
                    "删除回复",
                  )
                : h(
                    Button,
                    {
                      disabled: readOnly,
                      onClick: async () => {
                        await send(host, "reply.ignore", { id: i.id });
                        await refresh();
                      },
                    },
                    "忽略",
                  ),
            ]),
            empty: eff.auto_reply
              ? "今天还没有自动回复"
              : "闲聊类自动回复未开启",
          }),
          h(
            "div",
            { className: "xhs-actions" },
            h(
              Button,
              {
                disabled: readOnly || mine.small_talk !== "auto",
                onClick: () =>
                  set({ auto_reply_paused: !mine.auto_reply_paused }),
              },
              mine.auto_reply_paused ? "恢复自动回复" : "暂停自动回复",
            ),
            h(
              Button,
              {
                disabled: readOnly || mine.small_talk !== "auto",
                onClick: () =>
                  set({ small_talk: "review", auto_reply_paused: false }),
              },
              "改回等我通过",
            ),
          ),
        ),
        h(
          Card,
          {
            title: "意向线索",
            tip: "只记录公开评论内容和昵称，不采集个人信息；跟进由同事在平台内完成。",
          },
          h(Table, {
            head: ["评论", "来源笔记", "账号", "时间", "状态", ""],
            body: leads.map((l) => [
              `“${l.comment}”`,
              l.note_title,
              accountName(snapshot, l.account_id),
              when(l.created_at),
              leadStatus(l),
              l.status === "new"
                ? h(
                    Button,
                    {
                      disabled: readOnly,
                      onClick: () =>
                        setLead({ ...l, status: "transferred", assignee: "" }),
                    },
                    "转交同事",
                  )
                : h(Button, { onClick: () => setLead({ ...l }) }, "查看"),
            ]),
            empty: "还没有线索",
          }),
          h(
            "div",
            { className: "xhs-actions" },
            h(
              Button,
              {
                disabled: !leads.length,
                onClick: () =>
                  download(
                    "意向线索.csv",
                    csv([
                      [
                        "评论",
                        "昵称",
                        "来源笔记",
                        "账号",
                        "时间",
                        "状态",
                        "跟进人",
                      ],
                      ...leads.map((l) => [
                        l.comment,
                        l.author,
                        l.note_title,
                        accountName(snapshot, l.account_id),
                        fmt(l.created_at, zone),
                        {
                          new: "新",
                          transferred: "已转交",
                          contacted: "已联系",
                          closed: "已关闭",
                        }[l.status],
                        l.assignee || "",
                      ]),
                    ]),
                  ),
              },
              "导出线索表",
            ),
          ),
        ),
      ),
      h(
        Card,
        {
          title: "回复规则",
          tip: "只有闲聊类可以自动发送，并且需要平台许可、企业规则和你的设置都允许。",
        },
        h(
          "div",
          { className: "xhs-2" },
          h(Select, {
            label: "闲聊类回复",
            value: mine.small_talk || "review",
            disabled: readOnly,
            onChange: (v) => set({ small_talk: v }),
            options: [
              ...(eff.auto_reply_enterprise
                ? [["auto", "自动发送，事后通知我"]]
                : []),
              ["review", "起草后等我通过"],
            ],
          }),
          h(Select, {
            label: "自动回复用语",
            value: mine.reply_wording || "phrases",
            disabled: readOnly,
            onChange: (v) => set({ reply_wording: v }),
            options: [
              [
                "phrases",
                `只用我审核过的短句（${rows(mine.reply_phrases).length} 条）`,
              ],
              ["ai", "AI 自拟，15 字以内"],
            ],
          }),
        ),
        h(
          "div",
          { className: "xhs-2" },
          h(Blur, {
            label: "每个账号每小时最多自动回复",
            type: "number",
            suffix: "条",
            value: mine.auto_reply_hourly ?? 5,
            disabled: readOnly,
            onCommit: (v) => set({ auto_reply_hourly: Number(v) }),
          }),
          h(Blur, {
            label: `每个账号每天最多自动回复${
              eff.caps &&
              snapshot.license?.policy?.rules?.auto_reply_daily_cap != null
                ? `（企业上限 ${snapshot.license.policy.rules.auto_reply_daily_cap} 条）`
                : ""
            }`,
            type: "number",
            suffix: "条",
            value: mine.auto_reply_daily ?? 20,
            disabled: readOnly,
            onCommit: (v) => set({ auto_reply_daily: Number(v) }),
          }),
        ),
        h(
          "div",
          { className: "xhs-2" },
          h(Select, {
            label: "事后通知",
            value: mine.notify || "card",
            disabled: readOnly,
            onChange: (v) => set({ notify: v }),
            options: [
              ["card", "每次检查后在对话里发一张卡片"],
              ["daily", "每天汇总一次"],
            ],
          }),
          h(Select, {
            label: "回复口吻",
            value: mine.reply_tone || "persona",
            disabled: readOnly,
            onChange: (v) => set({ reply_tone: v }),
            options: [
              ["persona", "跟随账号人设"],
              ["service", "统一客服口吻"],
            ],
          }),
        ),
        h(Select, {
          label: "检查新评论（维护计划）",
          value: mine.inbox_cadence || "after_publish",
          disabled: readOnly,
          onChange: (v) => set({ inbox_cadence: v }),
          options: [
            ["after_publish", "发布后 24 小时内每 2 小时一次，之后每天一次"],
            ["daily", "每天一次"],
            ["manual", "只在我打开时"],
          ],
        }),
        h(
          Row,
          {
            title: "什么算闲聊",
            sub: "没有提问，不涉及价格、购买、效果和联系方式，也不是负面情绪",
          },
          h(
            Button,
            {
              disabled: readOnly,
              onClick: () => setPhrases(rows(mine.reply_phrases).join("\n")),
            },
            "管理短句",
          ),
        ),
        h(Row, { title: "咨询、意向", sub: "起草后等你通过" }, h(Lock)),
        h(Row, { title: "负面与投诉", sub: "不起草，转人工" }, h(Lock)),
        h(
          Row,
          { title: "分类拿不准或命中敏感词", sub: "不自动发，转为待你审核" },
          h(Lock),
        ),
        h(Row, { title: "账号有异常或已暂停", sub: "停止自动回复" }, h(Lock)),
        h(
          Row,
          {
            title: "不留联系方式，不承诺效果",
            sub: "AI 人设账号不以亲身体验的口吻回答效果类问题",
          },
          h(Lock),
        ),
      ),
    ),
    lead &&
      h(
        Dialog,
        {
          title:
            lead.status === "transferred" &&
            !leads.find((l) => l.id === lead.id)?.assignee
              ? "转交同事"
              : "线索",
          desc: `“${lead.comment}” · ${lead.author} · 笔记「${lead.note_title}」`,
          onClose: () => setLead(null),
          footer: [
            h(Button, { key: "c", onClick: () => setLead(null) }, "取消"),
            h(
              Button,
              {
                key: "ok",
                primary: true,
                disabled:
                  readOnly ||
                  (lead.status === "transferred" &&
                    !String(lead.assignee || "").trim()),
                onClick: async () => {
                  await send(host, "lead.update", {
                    id: lead.id,
                    status: lead.status,
                    assignee: lead.assignee || "",
                  });
                  setLead(null);
                  await refresh();
                },
              },
              "保存",
            ),
          ],
        },
        h(Select, {
          label: "状态",
          value: lead.status,
          onChange: (v) => setLead({ ...lead, status: v }),
          options: [
            ["new", "新"],
            ["transferred", "已转交"],
            ["contacted", "已联系"],
            ["closed", "已关闭"],
          ],
        }),
        h(Field, {
          label: "跟进同事",
          value: lead.assignee || "",
          onChange: (v) => setLead({ ...lead, assignee: v }),
        }),
      ),
    phrases !== null &&
      h(
        Dialog,
        {
          title: "管理短句",
          desc: "自动回复只从这些短句里选。每行一条，30 字以内，最多 40 条。",
          onClose: () => setPhrases(null),
          footer: [
            h(Button, { key: "c", onClick: () => setPhrases(null) }, "取消"),
            h(
              Button,
              {
                key: "ok",
                primary: true,
                onClick: async () => {
                  const list = phrases
                    .split(/\n+/)
                    .map((x) => x.trim())
                    .filter(Boolean)
                    .slice(0, 40);
                  setPhrases(null);
                  await set({ reply_phrases: list });
                },
              },
              "保存",
            ),
          ],
        },
        h(Field, {
          label: "短句",
          multiline: true,
          value: phrases,
          onChange: setPhrases,
        }),
      ),
  );
}

// ---- 自动化与风控 ----
const LEVEL_INFO = [
  [
    "manual",
    "手动",
    "你来写、你来排",
    [
      "任务：手动指定账号和时间",
      "文案：自己写",
      "配图：自己上传",
      "维护：自己处理",
    ],
  ],
  [
    "semi",
    "半自动",
    "AI 帮你写和配图，你来安排",
    [
      "任务：手动指定账号和时间",
      "文案：套母版或仿写参考",
      "配图：平台 AI 生图，可带参考图",
      "维护：自己处理",
    ],
  ],
  [
    "full",
    "全自动",
    "AI 主动准备，你只审核",
    [
      "任务：自动匹配账号、类型、时间",
      "文案与配图：自动生成",
      "素材和任务生成后需你审核",
      "维护：闲聊回复自动发，其余等你通过",
    ],
  ],
];
const PRECHECKS = [
  "重复度：与本账号和同项目其他账号的内容比较",
  "素材来源：每张图片都有来源记录",
  "业务信息准确性：价格、适用条件与业务资料一致",
  "行业敏感内容：命中敏感词时拦截",
  "AI 生成标识：AI 生成或 AI 重现的图片必须加标识",
  "商业推广披露：营销内容必须披露",
];
function SettingsPanel({ snapshot, host, readOnly, refresh, go }) {
  const data = snapshot.data;
  const mine = data.member_settings || {};
  const eff = data.effective_policy || {};
  const rules = snapshot.license?.policy?.rules || {};
  const caps = eff.caps || {};
  const usage = eff.usage || {};
  const quota = eff.member_quota || {};
  const order = ["manual", "semi", "full"];
  const cap = order.indexOf(eff.automation_cap || "full");
  const [pace, setPace] = useState(null);
  const [words, setWords] = useState(null);
  const [test, setTest] = useState(null);
  const p = pace || {
    min_interval_hours: mine.min_interval_hours ?? 48,
    weekly_max_posts: mine.weekly_max_posts ?? 4,
    marketing_ratio_max: mine.marketing_ratio_max ?? 40,
    publish_window: mine.publish_window || "08:00-22:30",
    profile_change_day: mine.profile_change_day || "hold",
    on_publish_failure: mine.on_publish_failure || "stop",
  };
  const w = words ?? rows(mine.my_words).join("\n");
  const set = (patch) => saveSettings(host, snapshot, refresh, patch);
  const num = (label, key, suffix) =>
    h(Field, {
      label,
      type: "number",
      value: String(p[key]),
      disabled: readOnly,
      onChange: (v) => setPace({ ...p, [key]: v }),
    });
  const libraries = rows(eff.libraries);
  const hits =
    test != null
      ? [
          ...new Set([
            ...rows(eff.banned_words),
            ...libraries.flatMap((l) => rows(l.words)),
          ]),
        ].filter((x) => x && test.includes(x))
      : [];
  const completion = rows(data.accounts).filter(
    (a) => a.low_completion_days >= 2,
  );
  return h(
    "div",
    { className: "xhs-stack" },
    h(
      "section",
      {
        className: "xhs-card",
        style: {
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        },
      },
      h(Lock, {
        children: eff.enterprise_paused
          ? "企业已暂停全部任务"
          : "企业规则生效中",
      }),
      h(
        "span",
        { style: { flex: 1 } },
        "自动化上限、发布节奏、禁用词和高风险复核人由管理员在后台设定，这里只能设得更严。",
      ),
      h(
        Button,
        { onClick: () => go("settings", "entitlement") },
        "查看能力与配额",
      ),
    ),
    h(
      Card,
      { title: "自动化程度", tip: "企业设了上限时，高于上限的档位不可选。" },
      h(
        "div",
        { className: "xhs-grid" },
        LEVEL_INFO.map(([key, label, sub, lines], i) =>
          h(
            "label",
            {
              key,
              className: "xhs-card",
              style: i > cap ? { opacity: 0.55 } : { cursor: "pointer" },
            },
            h(
              "div",
              { style: { display: "flex", gap: 6, alignItems: "center" } },
              h("input", {
                type: "radio",
                name: "xhs-auto",
                checked: (mine.automation_level || "semi") === key,
                disabled: readOnly || i > cap,
                onChange: () =>
                  set({
                    automation_level: key,
                    ...(key !== "full" ? { small_talk: "review" } : {}),
                  }),
              }),
              h("b", null, label),
              i > cap && h(Lock, { children: "企业未允许" }),
            ),
            h("div", { className: "xhs-meta" }, sub),
            lines.map((line) =>
              h(
                "div",
                { key: line, style: { fontSize: 12, marginTop: 3 } },
                line,
              ),
            ),
          ),
        ),
      ),
      h(
        "div",
        { className: "xhs-3" },
        h(Select, {
          label: "AI 主动准备内容",
          value: mine.ai_proactive || "weekly",
          disabled: readOnly,
          onChange: (v) => set({ ai_proactive: v }),
          options: [
            ["weekly", "每周一次"],
            ["daily", "每天一次"],
            ["off", "关闭"],
          ],
        }),
        h(Blur, {
          label: "每次最多准备",
          type: "number",
          suffix: "篇",
          value: mine.max_per_run ?? 12,
          disabled: readOnly,
          onCommit: (v) => set({ max_per_run: Number(v) }),
        }),
        h(Field, {
          label: "本月内容（我 · 企业）",
          value: `${usage.member?.posts ?? 0} 篇 · 企业 ${
            usage.tenant?.posts ?? 0
          } / ${caps.monthly_posts ?? "—"}`,
          disabled: true,
          onChange: () => undefined,
        }),
      ),
    ),
    h(
      "div",
      { className: "xhs-2", style: { gap: 12, alignItems: "start" } },
      h(
        "div",
        { className: "xhs-stack" },
        h(
          Card,
          { title: "发布节奏" },
          h(
            "div",
            { className: "xhs-3" },
            num(
              `同一账号发布最小间隔（小时${
                rules.min_interval_hours != null
                  ? `，企业下限 ${rules.min_interval_hours}`
                  : ""
              }）`,
              "min_interval_hours",
            ),
            num(
              `每账号每周最多发布（篇${
                rules.weekly_max_posts != null
                  ? `，企业上限 ${rules.weekly_max_posts}`
                  : ""
              }）`,
              "weekly_max_posts",
            ),
            num(
              `营销内容占比上限（%${
                rules.marketing_ratio_max != null
                  ? `，企业上限 ${rules.marketing_ratio_max}`
                  : ""
              }）`,
              "marketing_ratio_max",
            ),
          ),
          h(
            "div",
            { className: "xhs-3" },
            h(Field, {
              label: "允许发布的时段",
              value: p.publish_window.replace("-", "–"),
              disabled: readOnly,
              onChange: (v) =>
                setPace({
                  ...p,
                  publish_window: v.replace(/[–—~]/, "-").replace(/\s/g, ""),
                }),
            }),
            h(Select, {
              label: "资料变更当天",
              value: p.profile_change_day,
              disabled: readOnly,
              onChange: (v) => setPace({ ...p, profile_change_day: v }),
              options: [
                ["hold", "不发布、不养号"],
                ["publish_only", "只发布"],
              ],
            }),
            h(Select, {
              label: "发布失败后",
              value: p.on_publish_failure,
              disabled: readOnly,
              onChange: (v) => setPace({ ...p, on_publish_failure: v }),
              options: [
                ["stop", "停下，等人工处理"],
                ["retry_once", "下个时段重试一次"],
              ],
            }),
          ),
          (eff.min_interval_hours !== Number(p.min_interval_hours) ||
            eff.weekly_max_posts !== Number(p.weekly_max_posts)) &&
            h(
              "div",
              { className: "xhs-meta" },
              `实际生效：间隔 ≥ ${eff.min_interval_hours} 小时 · 每周 ≤ ${eff.weekly_max_posts} 篇 · 营销 ≤ ${eff.marketing_ratio_max}% · ${eff.publish_window}`,
            ),
          h(
            "div",
            { className: "xhs-actions" },
            h(
              Button,
              {
                primary: true,
                disabled: readOnly,
                onClick: async () => {
                  await set({
                    ...p,
                    min_interval_hours: Number(p.min_interval_hours),
                    weekly_max_posts: Number(p.weekly_max_posts),
                    marketing_ratio_max: Number(p.marketing_ratio_max),
                  });
                  setPace(null);
                },
              },
              "保存",
            ),
          ),
        ),
        h(
          Card,
          { title: "敏感词" },
          h(
            Row,
            {
              title: "企业禁用词",
              sub: `${rows(rules.banned_words).length} 个 · 由管理员在后台维护`,
            },
            h(Lock, { children: "只读" }),
          ),
          h(Field, {
            label: "我补充的敏感词（每行一个）",
            multiline: true,
            value: w,
            disabled: readOnly,
            onChange: setWords,
          }),
          libraries.map((l) =>
            h(
              Row,
              {
                key: l.id || l.name,
                title: l.name,
                sub:
                  l.description ||
                  `${rows(l.words).length} 个词 · 平台内置，由平台运营维护`,
              },
              pill(
                l.enabled === false ? "企业未开通" : "已启用",
                l.enabled === false ? "" : "ok",
                l.enabled !== false,
              ),
            ),
          ),
          !libraries.length &&
            h(
              Row,
              { title: "行业词库", sub: "平台内置，由平台运营维护" },
              pill("未同步"),
            ),
          h(
            "div",
            { className: "xhs-actions" },
            h(
              Button,
              {
                primary: true,
                disabled: readOnly,
                onClick: async () => {
                  await set({
                    my_words: w
                      .split(/\n+/)
                      .map((x) => x.trim())
                      .filter(Boolean),
                  });
                  setWords(null);
                },
              },
              "保存",
            ),
            h(Button, { onClick: () => setTest("") }, "测试一段文案"),
          ),
        ),
      ),
      h(
        "div",
        { className: "xhs-stack" },
        h(
          Card,
          { title: "发布前检查" },
          PRECHECKS.map((line) =>
            h(Check, {
              key: line,
              label: line,
              checked: true,
              disabled: true,
              onChange: () => undefined,
            }),
          ),
          h(
            Row,
            {
              title: "高风险内容",
              sub: `一律人工审核${
                eff.reviewer_name
                  ? `，并由合规复核人${eff.reviewer_name}复核`
                  : ""
              }`,
            },
            h(Lock, { children: "企业规则" }),
          ),
          h(
            "div",
            { className: "xhs-meta" },
            "不生成未经证实的疗效、虚假的用户评价或虚构的前后对比。",
          ),
        ),
        h(
          Card,
          {
            title: "账号保护",
            tip: "这些是停止规则：遇到异常就停下，不做任何规避平台检测的动作。",
          },
          h(
            Row,
            {
              title: "账号受限或平台提示违规",
              sub: "暂停该账号的养号、发布和评论至少 72 小时",
            },
            h(Lock),
          ),
          h(
            Row,
            {
              title: "登录失效或要求验证码",
              sub: "暂停这台手机的队列，处理后重新核对身份",
            },
            h(Lock),
          ),
          h(
            Row,
            {
              title: "连续 2 天养号完成率低于 60%",
              sub: "提醒检查手机和关键词，不自动加量补刷",
            },
            pill(
              completion.length ? `提醒 · ${completion.length} 个账号` : "提醒",
              "warn",
              true,
            ),
          ),
          h(
            "div",
            { className: "xhs-2" },
            h(Blur, {
              label: "每个账号每天自动操作时长上限",
              type: "number",
              suffix: "分钟",
              value: mine.daily_minutes_cap ?? 60,
              disabled: readOnly,
              onCommit: (v) => set({ daily_minutes_cap: Number(v) }),
            }),
            h(Select, {
              label: "恢复后的前 3 天",
              value: mine.resume_mode || "start_stage",
              disabled: readOnly,
              onChange: (v) => set({ resume_mode: v }),
              options: [
                ["start_stage", "按“起步”档执行"],
                ["keep", "按原预算执行"],
              ],
            }),
          ),
        ),
      ),
    ),
    test !== null &&
      h(
        Dialog,
        {
          title: "测试一段文案",
          desc: "只在本机比对企业禁用词、我补充的词和已启用的行业词库，不保存。",
          onClose: () => setTest(null),
          footer: [
            h(Button, { key: "c", onClick: () => setTest(null) }, "关闭"),
          ],
        },
        h(Field, {
          label: "文案",
          multiline: true,
          value: test,
          onChange: setTest,
        }),
        test.trim() &&
          h(
            "div",
            { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
            hits.length
              ? hits.map((x) =>
                  h("span", { key: x, className: "xhs-pill bad" }, "✕ " + x),
                )
              : pill("✓ 未命中敏感词", "ok"),
          ),
      ),
  );
}

// ---- 授权台账 ----
const COVERS = {
  portrait: "肖像",
  experience: "真实经历",
  account: "账号使用",
  case: "案例或病例资料",
};
const ROLES = {
  employee: "员工",
  customer: "顾客",
  partner: "合作方",
  organization: "机构",
};
const USAGES = {
  own_account_no_rewrite: "图文，不可改写成他人经历",
  image_and_reference: "图文与生图参考",
};
function ConsentPanel({ snapshot, host, readOnly, refresh, go }) {
  const data = snapshot.data;
  const zone = tz(snapshot);
  const list = rows(data.authorizations);
  const accounts = rows(data.accounts);
  const caps = snapshot.license?.policy?.caps || {};
  const today = new Date().toISOString().slice(0, 10);
  const blank = {
    person: "",
    role: "employee",
    covers: ["portrait", "experience"],
    account_ids: [],
    scope: "own",
    usage: "own_account_no_rewrite",
    valid_from: today,
    valid_to: "",
    proof_asset: "",
  };
  const [form, setForm] = useState(blank);
  const [view, setView] = useState(null);
  const days = (d) => Math.round((new Date(d) - new Date()) / 86400000);
  const active = list.filter((c) => c.status === "active");
  const expiring = active
    .filter((c) => days(c.valid_to) <= 30)
    .sort((a, b) => days(a.valid_to) - days(b.valid_to));
  const withdrawn = list.filter((c) => c.status === "withdrawn");
  const missing = list.filter((c) => c.status === "proof_missing");
  const linked = (c) =>
    rows(data.materials).filter((m) => m.consent_id === c.id);
  const edit = (c) =>
    setForm({
      ...blank,
      ...c,
      scope: rows(c.account_ids).length
        ? rows(c.account_ids).length === 1
          ? "own"
          : "pick"
        : "all",
    });
  const save = async (f) => {
    const body = Object.fromEntries(
      [
        "person",
        "role",
        "covers",
        "usage",
        "valid_from",
        "valid_to",
        "proof_asset",
      ].map((k) => [k, f[k]]),
    );
    await send(host, "consent.save", {
      ...body,
      account_ids: f.scope === "all" ? [] : f.account_ids,
      id: f.id || "",
      version: f.version ?? null,
    });
    toast("已保存");
    await refresh();
  };
  const proofInput = (onName) =>
    h("input", {
      type: "file",
      accept: ".pdf,.png,.jpg,.jpeg",
      style: { display: "none" },
      disabled: readOnly,
      onChange: (e) => {
        const f = e.target.files[0];
        e.target.value = "";
        if (f) onName(f.name.slice(0, 200));
      },
    });
  const publishedOf = (c) =>
    rows(c.published_drafts)
      .map((id) => rows(data.drafts).find((d) => d.id === id))
      .filter(Boolean);
  const pending = withdrawn.filter((c) => !c.published_handled);
  return h(
    "div",
    { className: "xhs-stack" },
    h(Stats, {
      items: [
        { label: "有效授权", value: active.length, sub: "我登记的" },
        {
          label: "30 天内到期",
          value: expiring.length,
          sub: expiring[0]
            ? `${expiring[0].person} · ${Math.max(
                0,
                days(expiring[0].valid_to),
              )} 天后`
            : "—",
        },
        {
          label: "已撤回",
          value: withdrawn.length,
          sub: `${withdrawn.reduce(
            (n, c) => n + linked(c).length,
            0,
          )} 个素材已冻结`,
        },
        {
          label: "待补授权书",
          value: missing.length,
          sub: missing.length ? "关联素材暂不可用" : "—",
        },
      ],
    }),
    h(
      Card,
      {
        title: "授权台账",
        tip: "人物形象、真实经历、托管账号和案例资料的授权都登记在这里。撤回后，关联的素材冻结，未发布的草稿退回待制作，已发布的列出来由你处理。",
      },
      h(Table, {
        head: [
          "授权人",
          "授权内容",
          "可用范围",
          "有效期",
          "证明文件",
          "关联",
          "状态",
          "",
        ],
        body: list.map((c) => [
          h(
            "div",
            null,
            h("b", null, c.person),
            h("div", { className: "xhs-meta" }, ROLES[c.role]),
          ),
          rows(c.covers)
            .map((x) => COVERS[x])
            .join(" · "),
          c.status === "withdrawn"
            ? "—"
            : rows(c.account_ids).length
            ? `仅「${rows(c.account_ids)
                .map((id) => accountName(snapshot, id))
                .join("、")}」`
            : "全部账号",
          c.status === "withdrawn"
            ? `${String(c.withdrawn_at || c.updated_at || "").slice(
                0,
                10,
              )} 撤回`
            : `${c.valid_from} 至 ${c.valid_to}`,
          c.status === "withdrawn"
            ? "撤回记录"
            : c.proof_asset || pill("待上传", "warn", true),
          c.status === "withdrawn"
            ? `素材 ${linked(c).length} 已冻结 · 已发布 ${
                rows(c.published_drafts).length
              } 篇`
            : `素材 ${linked(c).length}${
                c.status === "proof_missing" ? " · 暂不可用" : ""
              }`,
          pill(
            c.status === "withdrawn"
              ? "已撤回"
              : c.status === "proof_missing"
              ? "待补授权书"
              : days(c.valid_to) <= 30
              ? `${Math.max(0, days(c.valid_to))} 天后到期`
              : "有效",
            c.status === "withdrawn"
              ? "bad"
              : c.status === "active" && days(c.valid_to) > 30
              ? "ok"
              : "warn",
            true,
          ),
          h(
            "span",
            { style: { display: "flex", gap: 6 } },
            c.status === "withdrawn"
              ? h(Button, { onClick: () => setView(c) }, "查看已发布内容")
              : c.status === "proof_missing"
              ? h(
                  "label",
                  { className: "xhs-btn" },
                  ic("上传授权书"),
                  "上传授权书",
                  proofInput((name) =>
                    save({
                      ...blank,
                      ...c,
                      scope: rows(c.account_ids).length ? "pick" : "all",
                      proof_asset: name,
                    }),
                  ),
                )
              : [
                  days(c.valid_to) <= 30
                    ? h(
                        Button,
                        {
                          key: "r",
                          disabled: readOnly,
                          onClick: () => edit(c),
                        },
                        "续期",
                      )
                    : h(
                        Button,
                        {
                          key: "v",
                          disabled: readOnly,
                          onClick: () => edit(c),
                        },
                        "查看",
                      ),
                  h(
                    Button,
                    {
                      key: "x",
                      disabled: readOnly,
                      onClick: async () => {
                        await send(host, "consent.revoke", {
                          id: c.id,
                          reason: "授权人撤回",
                        });
                        await refresh();
                      },
                    },
                    "撤回",
                  ),
                ],
          ),
        ]),
        empty: "还没有登记授权",
      }),
    ),
    h(
      "div",
      { className: "xhs-2", style: { gap: 12, alignItems: "start" } },
      h(
        Card,
        {
          title: form.id ? `修改授权 · ${form.person}` : "登记新授权",
          icon: "登记新授权",
        },
        h(
          "div",
          { className: "xhs-3" },
          h(Field, {
            label: "授权人",
            value: form.person,
            disabled: readOnly,
            onChange: (v) => setForm({ ...form, person: v }),
          }),
          h(Select, {
            label: "身份",
            value: form.role,
            disabled: readOnly,
            onChange: (v) => setForm({ ...form, role: v }),
            options: Object.entries(ROLES),
          }),
          h(
            "label",
            { className: "xhs-field" },
            h("span", { className: "xhs-label" }, "有效期"),
            h(
              "span",
              {
                style: {
                  display: "flex",
                  gap: 4,
                  alignItems: "center",
                  marginTop: 5,
                },
              },
              h("input", {
                className: "xhs-input",
                style: { marginTop: 0 },
                type: "date",
                "aria-label": "生效日期",
                value: form.valid_from,
                disabled: readOnly,
                onChange: (e) =>
                  setForm({ ...form, valid_from: e.target.value }),
              }),
              "至",
              h("input", {
                className: "xhs-input",
                style: { marginTop: 0 },
                type: "date",
                "aria-label": "到期日期",
                value: form.valid_to,
                disabled: readOnly,
                onChange: (e) => setForm({ ...form, valid_to: e.target.value }),
              }),
            ),
          ),
        ),
        h("div", { className: "xhs-label" }, "授权内容"),
        h(
          "div",
          { style: { display: "flex", gap: 14, flexWrap: "wrap" } },
          Object.entries(COVERS).map(([k, l]) =>
            h(Check, {
              key: k,
              label: l,
              checked: form.covers.includes(k),
              disabled: readOnly,
              onChange: (on) =>
                setForm({
                  ...form,
                  covers: on
                    ? [...form.covers, k]
                    : form.covers.filter((x) => x !== k),
                }),
            }),
          ),
        ),
        h(
          "div",
          { className: "xhs-2" },
          h(Select, {
            label: "可用账号",
            value: form.scope,
            disabled: readOnly,
            onChange: (v) =>
              setForm({
                ...form,
                scope: v,
                account_ids:
                  v === "all"
                    ? []
                    : form.account_ids.slice(0, v === "own" ? 1 : 40),
              }),
            options: [
              ["own", "仅本人对应的账号"],
              ["pick", "指定账号"],
              ["all", "全部账号"],
            ],
          }),
          h(Select, {
            label: "可用内容",
            value: form.usage,
            disabled: readOnly,
            onChange: (v) => setForm({ ...form, usage: v }),
            options: Object.entries(USAGES),
          }),
        ),
        form.scope === "own" &&
          h(Select, {
            label: "本人对应的账号",
            value: form.account_ids[0] || "",
            disabled: readOnly,
            onChange: (v) => setForm({ ...form, account_ids: v ? [v] : [] }),
            options: [
              ["", "请选择"],
              ...accounts.map((a) => [a.id, a.name || a.id]),
            ],
          }),
        form.scope === "pick" &&
          h(
            "div",
            {
              style: {
                display: "flex",
                gap: 14,
                flexWrap: "wrap",
                marginTop: 6,
              },
            },
            accounts.map((a) =>
              h(Check, {
                key: a.id,
                label: a.name || a.id,
                checked: form.account_ids.includes(a.id),
                onChange: (on) =>
                  setForm({
                    ...form,
                    account_ids: on
                      ? [...form.account_ids, a.id]
                      : form.account_ids.filter((x) => x !== a.id),
                  }),
              }),
            ),
          ),
        form.proof_asset
          ? h(
              "div",
              { className: "xhs-meta", style: { marginTop: 6 } },
              `授权书：${form.proof_asset}`,
            )
          : h(
              "div",
              { className: "xhs-meta", style: { marginTop: 6 } },
              "没有授权书时状态为“待补授权书”，关联素材暂不可用。这里登记文件名，原件由你存档。",
            ),
        h(
          "div",
          { className: "xhs-actions" },
          h(
            "label",
            { className: "xhs-btn" },
            ic("上传授权书"),
            "上传授权书",
            proofInput((name) => setForm({ ...form, proof_asset: name })),
          ),
          h(
            Button,
            {
              primary: true,
              disabled:
                readOnly ||
                !form.person.trim() ||
                !form.valid_to ||
                !form.covers.length ||
                (form.scope !== "all" && !form.account_ids.length),
              onClick: async () => {
                await save(form);
                setForm(blank);
              },
            },
            "保存",
          ),
          form.id && h(Button, { onClick: () => setForm(blank) }, "取消"),
        ),
      ),
      h(
        "div",
        { className: "xhs-stack" },
        h(
          Card,
          { title: "撤回或到期后" },
          h(
            "div",
            { className: "xhs-steps" },
            [
              ["✓", "冻结素材", "关联素材不可再用"],
              ["✓", "退回草稿", "未发布的退回待制作"],
              ["3", "列出已发布", "由你决定是否删除"],
              ["4", "写入审计", "同步到企业后台"],
            ].map(([n, t, s]) =>
              h(
                "div",
                { key: t, className: "xhs-step" },
                h("span", { className: "xhs-step-n" }, n),
                h(
                  "div",
                  null,
                  h("div", null, t),
                  h("div", { className: "xhs-meta" }, s),
                ),
              ),
            ),
          ),
          pending.map((c) =>
            h(
              Row,
              {
                key: c.id,
                title: `${c.person} ${fmt(
                  c.withdrawn_at || c.updated_at,
                  zone,
                  { month: "2-digit", day: "2-digit" },
                )} 撤回授权`,
                sub: `${linked(c).length} 个素材已冻结 · ${
                  rows(c.published_drafts).length
                } 篇已发布笔记待你处理`,
              },
              h(Button, { onClick: () => setView(c) }, "查看已发布内容"),
              h(
                Button,
                {
                  disabled: readOnly,
                  onClick: async () => {
                    await send(host, "consent.handled", { id: c.id });
                    await refresh();
                  },
                },
                "我已处理",
              ),
            ),
          ),
        ),
        h(
          Card,
          { title: "使用边界" },
          h(Row, {
            title: "AI 虚拟角色",
            sub: "不需要个人授权；图片带“虚拟人物”标记，不能写成真实消费体验或效果证明",
          }),
          h(Row, {
            title: "真实经历",
            sub: "只能用于授权人对应的账号，不能改写成其他账号的亲身经历",
          }),
          h(
            Row,
            {
              title: "案例与病例资料",
              sub: "需要当事人书面授权；医疗美容内容还需医疗广告审查",
            },
            !rows(caps.template_scope).some((s) => /医/.test(s)) &&
              pill("企业未开通"),
          ),
        ),
      ),
    ),
    view &&
      h(
        Dialog,
        {
          title: `${view.person} · 已发布内容`,
          desc: "授权撤回后，是否删除已发布的笔记由你决定；删除需要你在手机上确认。",
          onClose: () => setView(null),
          footer: [
            h(Button, { key: "c", onClick: () => setView(null) }, "关闭"),
          ],
        },
        publishedOf(view).map((d) =>
          h(
            Row,
            {
              key: d.id,
              title: d.title,
              sub: `${accountName(snapshot, d.account_id)} · ${fmt(
                d.published_at || d.scheduled_at,
                zone,
              )}`,
            },
            h(
              Button,
              {
                onClick: () => {
                  setView(null);
                  go("publish", "runs");
                },
              },
              "去发布与历史",
            ),
          ),
        ),
        !publishedOf(view).length &&
          h("div", { className: "xhs-empty" }, "没有已发布的内容"),
      ),
  );
}

// ---- 能力与配额 ----
const FEATURE_INFO = [
  [
    "xhs.content",
    "内容创作",
    ["内容计划", "创作编辑器", "素材库", "内容母版", "业务资料", "AI 生图"],
  ],
  [
    "xhs.publish",
    "内容发布",
    ["排期日历", "批量发布", "发布与历史", "执行队列"],
  ],
  [
    "xhs.ops",
    "运营管理",
    [
      "项目与画像",
      "人设规划",
      "账号与设备",
      "账号档案",
      "新号资料",
      "日常运营（养号）· 冷启动方案",
      "异常与告警",
    ],
  ],
  ["xhs.comment", "评论互动", ["评论审核", "笔记维护（回复评论）· 意向线索"]],
  ["xhs.takeover", "账号托管", ["老号接管", "账号审计", "诊断", "资料变更单"]],
  ["xhs.analytics", "数据分析", ["复盘报表", "内容表现", "数据回收"]],
];
const REQUEST_KINDS = {
  posts: "更多内容额度",
  images: "更多生图额度",
  accounts: "更多账号",
  feature: "未分配的能力",
  templates: "更多母版范围",
};
function EntitlementPanel({ snapshot, host, readOnly, refresh }) {
  const license = snapshot.license || {};
  const policy = license.policy || {};
  const caps = policy.caps || {};
  const rules = policy.rules || {};
  const usage = policy.usage || {};
  const quota = policy.member_quota || {};
  const requests = rows(snapshot.data.member_requests);
  const [asking, setAsking] = useState(false);
  const accounts = rows(snapshot.data.accounts);
  const devices = new Set(accounts.map((a) => a.device_id).filter(Boolean))
    .size;
  const ask = h(
    Button,
    { disabled: readOnly, onClick: () => setAsking(true) },
    "向管理员申请",
  );
  const q = (label, mine, mineCap, ent, entCap, unit) =>
    h(
      "div",
      { key: label, style: { padding: "9px 0" } },
      h(
        "div",
        { style: { display: "flex", justifyContent: "space-between", gap: 8 } },
        h("b", null, label),
        h(
          "span",
          { className: "xhs-meta" },
          `我 ${mine ?? 0}${
            mineCap != null ? " / " + mineCap : ""
          } ${unit} · 企业 ${ent ?? 0} / ${entCap ?? "—"} ${unit}`,
        ),
      ),
      mineCap != null && h(Bar, { ratio: (mine || 0) / (mineCap || 1) }),
      h(Bar, { ratio: (ent || 0) / (entCap || 1), ent: true }),
    );
  const statusText =
    {
      active: "",
      expired: " · 已过期",
      revoked: " · 已撤销",
      read_only: " · 只读",
    }[license.status] ?? "";
  return h(
    "div",
    { className: "xhs-stack" },
    h(
      "section",
      {
        className: "xhs-card",
        style: {
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        },
      },
      h("img", {
        src: XHS_LOGO,
        alt: "小红薯",
        style: { width: 36, height: 36, borderRadius: 9 },
      }),
      h(
        "div",
        null,
        h(
          "b",
          null,
          `${
            license.tenant_name ? license.tenant_name + " · " : ""
          }小红薯运营许可`,
        ),
        h(
          "div",
          { className: "xhs-meta" },
          `${
            license.plugin_version ? `插件 ${license.plugin_version} · ` : ""
          }${
            license.expires_at
              ? "许可至 " + String(license.expires_at).slice(0, 10)
              : "不限期"
          }${statusText} · 平台授予，企业管理员分配`,
        ),
      ),
      h("span", { style: { flex: 1 } }),
      pill(
        `自动化上限 ${LEVEL_LABELS[caps.automation_cap] || "—"}`,
        "ok",
        true,
      ),
      pill(`母版范围 ${rows(caps.template_scope).join(" + ") || "—"}`),
      ask,
    ),
    h(
      "div",
      { className: "xhs-grid" },
      FEATURE_INFO.map(([key, label, unlocks]) =>
        h(
          "section",
          {
            key,
            className: "xhs-card",
            style: hasFeature(license, key) ? undefined : { opacity: 0.6 },
          },
          h(
            "div",
            {
              style: {
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 8,
              },
            },
            ic("h:" + label),
            h("b", { style: { flex: 1 } }, label),
            hasFeature(license, key)
              ? pill("已分配给我", "ok", true)
              : h(Lock, { children: "未分配" }),
          ),
          h(
            "div",
            { style: { display: "flex", gap: 5, flexWrap: "wrap" } },
            unlocks.map((u) => h("span", { key: u, className: "xhs-pill" }, u)),
          ),
        ),
      ),
    ),
    h(
      "div",
      { className: "xhs-meta" },
      "不需要单独分配：工作台、授权台账、自动化与风控、能力与配额。连接企业后，账号名称与阶段、授权摘要和未处理的异常会同步给企业管理员；笔记内容、素材、图片和小红薯号不会同步。",
    ),
    h(
      "div",
      { className: "xhs-2", style: { gap: 12, alignItems: "start" } },
      h(
        Card,
        {
          title: "我的用量与企业额度",
          tip: "红色是我的用量，紫色是企业合计。",
        },
        q(
          "本月内容",
          usage.member?.posts,
          quota.monthly_posts,
          usage.tenant?.posts,
          caps.monthly_posts,
          "篇",
        ),
        q(
          "本月生图",
          usage.member?.images,
          quota.monthly_images,
          usage.tenant?.images,
          caps.monthly_images,
          "张",
        ),
        q(
          "账号",
          accounts.length,
          quota.accounts,
          usage.tenant?.accounts ?? accounts.length,
          license.limits?.accounts,
          "个",
        ),
        q(
          "手机",
          devices,
          null,
          usage.tenant?.devices ?? devices,
          license.limits?.devices,
          "台",
        ),
        h("div", { className: "xhs-actions" }, ask),
      ),
      h(
        Card,
        { title: "企业规则", right: h(Lock, { children: "只读" }) },
        h(Table, {
          head: ["规则", "企业设定", "我可以"],
          body: [
            [
              "自动化程度",
              LEVEL_LABELS[rules.automation_level] || "—",
              "选更保守的一档",
            ],
            [
              "发布最小间隔",
              `≥ ${rules.min_interval_hours ?? "—"} 小时`,
              "设得更长",
            ],
            [
              "每账号每周发布",
              `≤ ${rules.weekly_max_posts ?? "—"} 篇`,
              "设得更少",
            ],
            [
              "营销内容占比",
              `≤ ${rules.marketing_ratio_max ?? "—"}%`,
              "设得更低",
            ],
            [
              "企业禁用词",
              `${rows(rules.banned_words).length} 个`,
              "补充自己的词",
            ],
            [
              "高风险内容",
              `人工审核${
                rules.reviewer_name ? " + 复核人" + rules.reviewer_name : ""
              }`,
              "—",
            ],
            [
              "闲聊类回复自动发送",
              rules.auto_reply_enabled && caps.auto_reply_allowed
                ? `允许 · 每账号每天 ≤ ${rules.auto_reply_daily_cap} 条`
                : "不允许",
              rules.auto_reply_enabled && caps.auto_reply_allowed
                ? "关闭，或设得更少"
                : "—",
            ],
            ["AI 标识与商业披露", "强制检查", "—"],
            [
              "紧急暂停",
              rules.paused
                ? "管理员已暂停全企业任务"
                : "管理员可远程暂停全企业任务",
              "暂停自己的任务",
            ],
          ],
        }),
      ),
    ),
    h(
      "div",
      { className: "xhs-2", style: { gap: 12, alignItems: "start" } },
      h(
        Card,
        { title: "没有分配到的能力会这样显示" },
        h(
          "div",
          { className: "xhs-empty" },
          ic("p:固定", 22),
          h(
            "div",
            { style: { fontWeight: 700, margin: "6px 0" } },
            "需要企业授权",
          ),
          "企业已购买这项能力，但还没有分配给你。",
          h("div", { style: { marginTop: 10 } }, ask),
        ),
      ),
      h(
        Card,
        {
          title: "我的申请",
          right: h(
            Button,
            {
              onClick: async () => {
                await send(host, "catalog.refresh", {});
                await refresh();
              },
            },
            "刷新",
          ),
        },
        h(Table, {
          head: ["申请", "时间", "状态"],
          body: requests.map((r) => [
            `${rows(r.kinds)
              .map((k) => REQUEST_KINDS[k] || k)
              .join("、")}${r.amount ? " · " + r.amount : ""}`,
            fmt(r.created_at, tz(snapshot), {
              month: "2-digit",
              day: "2-digit",
            }),
            pill(
              r.status === "pending"
                ? "管理员处理中"
                : r.status === "approved"
                ? "已通过"
                : "未通过",
              r.status === "approved"
                ? "ok"
                : r.status === "pending"
                ? "warn"
                : "",
              true,
            ),
          ]),
          empty: "还没有申请",
        }),
      ),
    ),
    asking &&
      h(RequestDialog, { host, refresh, onClose: () => setAsking(false) }),
  );
}

// ---- 账号档案：号设档案库、人设与兴趣池、形象素材、来源与授权；以及转交给同事 ----
const SOURCE_KIND = {
  authorized: ["本人授权", "ok"],
  existing: ["已有账号", ""],
  ai: ["AI 生成", ""],
};
const IMAGE_GROUPS = {
  portrait: "本人授权的形象照",
  reference: "服装、发型等形象参考",
  virtual: "虚拟人物素材",
  scene: "场景图",
};
function AccountProfilePanel({ snapshot, host, readOnly, refresh, go, focus }) {
  const data = snapshot.data;
  const accounts = rows(data.accounts);
  const sources = data.persona_sources || {};
  const [id, setId] = useState(
    focus && accounts.some((a) => a.id === focus)
      ? focus
      : accounts[0]?.id || "",
  );
  const [form, setForm] = useState(null);
  const [transferring, setTransferring] = useState(false);
  const [scene, setScene] = useState(null);
  const [upload, setUpload] = useState(null);
  useEffect(() => {
    if (focus && accounts.some((a) => a.id === focus)) setId(focus);
  }, [focus]);
  useEffect(() => {
    // Pick up transfers decided while the page was closed; a desktop without an enterprise has none.
    send(host, "transfer.sync", {})
      .then(refresh)
      .catch(() => undefined);
  }, []);
  const account = accounts.find((a) => a.id === id) || accounts[0];
  useEffect(() => setForm(null), [account?.id, account?.version]);
  const incoming = h(IncomingTransfers, {
    snapshot,
    host,
    readOnly,
    refresh,
    onImported: (accountId) => setId(accountId),
  });
  const orders = rows(data.transfers?.orders).filter((o) =>
    accounts.some((a) => a.id === o.account_id && !a.transfer),
  );
  const ordered =
    orders.length > 0 &&
    h(
      Card,
      {
        title: `管理员要求转交 · ${orders.length}`,
        icon: "账号概览",
        tip: "管理员已经同意这次转交，你发起后不用再等审批。账号资料在你的电脑上，所以需要你来点。",
      },
      orders.map((o) =>
        h(
          Row,
          {
            key: o.id,
            title: `${accountName(snapshot, o.account_id)} → ${
              o.to_member_name || "同事"
            }`,
            sub: `${o.by || "管理员"}${o.note ? " · " + o.note : ""}`,
          },
          h(
            Button,
            {
              primary: true,
              disabled: readOnly,
              onClick: () => {
                setId(o.account_id);
                setTransferring(true);
              },
            },
            "按转交单转交",
          ),
        ),
      ),
    );
  const tags = (list) => rows(list).join("、") || "—";
  const imagesOf = (a) => rows(a.character_images);
  const imageText = (a) => {
    const kind = (sources[a.id] || {}).kind;
    const n = imagesOf(a).length;
    return n
      ? `${
          kind === "authorized"
            ? "授权照片"
            : kind === "existing"
            ? "品牌素材"
            : "虚拟形象"
        } ${n} 张`
      : "—";
  };
  const persona = account?.persona || {};
  const pool = account?.interest_pool || {};
  const f =
    form ||
    (account
      ? {
          age: persona.age || "",
          gender: persona.gender || "",
          region: persona.region || "",
          occupation: persona.occupation || "",
          content_style: account.content_style || "生活记录",
          bio_material: account.bio_material || "",
          core: rows(pool.core).join(", "),
          extended: rows(pool.extended).join(", "),
          general: rows(pool.general).join(", "),
        }
      : null);
  const set = (patch) => setForm({ ...f, ...patch });
  const split = (s) =>
    String(s)
      .split(/[,，、\n]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  const source = account ? sources[account.id] || { kind: "ai" } : null;
  const consent = source?.consent_id
    ? rows(data.authorizations).find((c) => c.id === source.consent_id)
    : null;
  const image = async (payload) => {
    await send(host, "persona_file.image", {
      account_id: account.id,
      ...payload,
    });
    await refresh();
  };
  const transfer = account?.transfer;
  const outgoingDone = account?.transfer_returned;
  return h(
    "div",
    { className: "xhs-stack" },
    incoming,
    ordered,
    h(
      Card,
      { title: "号设档案库" },
      h(Table, {
        head: [
          "账号",
          "年龄 / 性别 / 地区",
          "职业",
          "垂直标签",
          "泛兴趣标签",
          "角色来源",
          "形象素材",
          "",
        ],
        body: accounts.map((a) => {
          const p = a.persona || {};
          const [label, tone] =
            SOURCE_KIND[(sources[a.id] || {}).kind] || SOURCE_KIND.ai;
          return [
            h("b", null, a.name || a.id),
            [p.age, p.gender, p.region].filter(Boolean).join(" / ") || "—",
            p.occupation || "—",
            tags(a.interest_pool?.core),
            tags(a.interest_pool?.general),
            pill(label, tone, tone === "ok"),
            imageText(a),
            h(Button, { onClick: () => setId(a.id) }, "查看档案"),
          ];
        }),
        empty: "还没有账号",
      }),
      h(
        "div",
        { className: "xhs-actions" },
        h(
          Button,
          {
            primary: true,
            disabled: readOnly,
            onClick: () => go("build", "personas"),
          },
          "批量生成账号人设",
        ),
        h(
          Button,
          { disabled: readOnly, onClick: () => go("build", "accounts") },
          "添加自定义角色",
        ),
      ),
    ),
    account &&
      h(
        "div",
        { className: "xhs-2", style: { gap: 12, alignItems: "start" } },
        h(
          "div",
          { className: "xhs-stack" },
          h(
            Card,
            {
              title: `${account.name || account.id} · 人设与兴趣池`,
              icon: "周末探店的 HR · 人设与兴趣池",
            },
            h(
              "div",
              { className: "xhs-4" },
              h(Field, {
                label: "年龄",
                value: f.age,
                disabled: readOnly,
                onChange: (v) => set({ age: v }),
              }),
              h(Field, {
                label: "性别",
                value: f.gender,
                disabled: readOnly,
                onChange: (v) => set({ gender: v }),
              }),
              h(Field, {
                label: "地区",
                value: f.region,
                disabled: readOnly,
                onChange: (v) => set({ region: v }),
              }),
              h(Field, {
                label: "职业或身份",
                value: f.occupation,
                disabled: readOnly,
                onChange: (v) => set({ occupation: v }),
              }),
            ),
            h(
              "div",
              { className: "xhs-2" },
              h(Select, {
                label: "内容风格",
                value: f.content_style,
                disabled: readOnly,
                onChange: (v) => set({ content_style: v }),
                options: ["生活记录", "知识分享", "清单整理"].map((s) => [
                  s,
                  s,
                ]),
              }),
              h(Field, {
                label: "简介素材（星座 + MBTI + 自我介绍 + 兴趣）",
                value: f.bio_material,
                disabled: readOnly,
                onChange: (v) => set({ bio_material: v }),
              }),
            ),
            h(
              "div",
              { className: "xhs-3" },
              h(Field, {
                label: "核心兴趣池",
                multiline: true,
                value: f.core,
                disabled: readOnly,
                onChange: (v) => set({ core: v }),
              }),
              h(Field, {
                label: "扩展兴趣池",
                multiline: true,
                value: f.extended,
                disabled: readOnly,
                onChange: (v) => set({ extended: v }),
              }),
              h(Field, {
                label: "泛内容兴趣池",
                multiline: true,
                value: f.general,
                disabled: readOnly,
                onChange: (v) => set({ general: v }),
              }),
            ),
            h(
              "div",
              { className: "xhs-meta" },
              "兴趣池长期保存，每天的养号任务和内容建议都从这里取词。",
            ),
            h(
              "div",
              { className: "xhs-actions" },
              h(
                Button,
                {
                  primary: true,
                  disabled: readOnly,
                  onClick: async () => {
                    await send(host, "persona_file.save", {
                      account_id: account.id,
                      version: account.version,
                      age: f.age,
                      gender: f.gender,
                      region: f.region,
                      occupation: f.occupation,
                      content_style: f.content_style,
                      bio_material: f.bio_material,
                      core: split(f.core),
                      extended: split(f.extended),
                      general: split(f.general),
                    });
                    toast("已保存");
                    await refresh();
                  },
                },
                "保存档案",
              ),
              snapshot.data.transfers?.enabled !== false &&
                !transfer &&
                h(
                  Button,
                  {
                    disabled: readOnly || !rows(data.transfers?.members).length,
                    onClick: () => setTransferring(true),
                  },
                  "转交给同事",
                ),
            ),
            account.transferred_in &&
              h(
                "div",
                { className: "xhs-meta", style: { marginTop: 6 } },
                `${account.transferred_in.from_member_name || "同事"} 于 ${fmt(
                  account.transferred_in.at,
                  tz(snapshot),
                )} 转交给你`,
              ),
            transfer &&
              h(
                Row,
                {
                  title: `正在转交给 ${transfer.to_member_name || "同事"}`,
                  sub: (TRANSFER_STATUS[transfer.status] || [
                    transfer.status,
                  ])[0],
                },
                ["pending_approval", "approved"].includes(transfer.status) &&
                  h(
                    Button,
                    {
                      disabled: readOnly,
                      onClick: async () => {
                        await send(host, "transfer.cancel", {
                          transfer_id: transfer.id,
                        });
                        await refresh();
                      },
                    },
                    "撤回转交",
                  ),
                h(
                  Button,
                  {
                    onClick: async () => {
                      await send(host, "transfer.sync", {});
                      await refresh();
                    },
                  },
                  "刷新状态",
                ),
              ),
            outgoingDone &&
              !transfer &&
              h(
                "div",
                { className: "xhs-meta", style: { marginTop: 6 } },
                `上次转交${
                  (TRANSFER_STATUS[outgoingDone.status] || ["已结束"])[0]
                }${outgoingDone.note ? "：" + outgoingDone.note : ""}`,
              ),
          ),
        ),
        h(
          "div",
          { className: "xhs-stack" },
          h(
            Card,
            {
              title: "人物形象素材",
              tip: "本人照片需要先在授权台账登记覆盖“肖像”的有效授权。AI 生成的形象带“虚拟人物”标记。",
            },
            Object.entries(IMAGE_GROUPS).map(([group, label]) => {
              const list = imagesOf(account).filter(
                (i) => (i.group || "portrait") === group,
              );
              if (!list.length && !["portrait", "reference"].includes(group))
                return null;
              return h(
                "div",
                { key: group },
                h("div", { className: "xhs-label" }, label),
                list.map((i) =>
                  h(
                    "span",
                    { key: i.id, className: "xhs-thumb", title: i.label },
                    h(PrivateImage, {
                      host,
                      image: i,
                      alt: i.label || label,
                      className: "xhs-preview",
                    }),
                    i.origin === "ai" &&
                      h("span", { className: "xhs-mark" }, "虚拟人物"),
                    !readOnly &&
                      h(
                        "button",
                        {
                          type: "button",
                          className: "xhs-x",
                          "aria-label": `删除 ${i.label || label}`,
                          onClick: () =>
                            image({ action: "delete", image_id: i.id }),
                        },
                        "×",
                      ),
                  ),
                ),
                !list.length &&
                  h(
                    "div",
                    { className: "xhs-meta", style: { margin: "4px 0 8px" } },
                    "还没有",
                  ),
              );
            }),
            h(
              "div",
              { className: "xhs-actions" },
              h(
                Button,
                {
                  disabled: readOnly,
                  onClick: () => setUpload({ group: "portrait", label: "" }),
                },
                "上传授权照片",
              ),
              h(
                Button,
                {
                  disabled: readOnly,
                  onClick: () => image({ action: "generate", scene: "" }),
                },
                "生成虚拟人物素材",
              ),
              h(
                Button,
                {
                  disabled: readOnly || !imagesOf(account).length,
                  onClick: () => setScene(""),
                },
                "用参考图生成场景图",
              ),
            ),
          ),
          h(
            Card,
            { title: "来源与授权" },
            h(Table, {
              head: ["项目", "内容"],
              body: [
                [
                  "角色来源",
                  source.kind === "authorized"
                    ? `本人授权（${ROLES[consent?.role] || "授权人"}：${
                        consent?.person || "—"
                      }）`
                    : source.kind === "existing"
                    ? "已有账号 · 接管时读取的公开资料"
                    : "AI 生成 · 虚拟角色",
                ],
                [
                  "授权范围",
                  consent
                    ? `${rows(consent.covers)
                        .map((c) => COVERS[c])
                        .join("、")}可用于本账号；${
                        USAGES[consent.usage] || ""
                      }`
                    : "不涉及个人授权",
                ],
                [
                  "授权有效期",
                  consent
                    ? h(
                        "span",
                        null,
                        `${consent.valid_from} 至 ${consent.valid_to} · `,
                        pill(
                          consent.status === "active"
                            ? "有效"
                            : consent.status === "withdrawn"
                            ? "已撤回"
                            : "待补授权书",
                          consent.status === "active" ? "ok" : "warn",
                          true,
                        ),
                      )
                    : "—",
                ],
                [
                  "真实经历素材",
                  "只能用于本账号，不能改写成其他账号的亲身经历",
                ],
                [
                  "AI 人设的边界",
                  "AI 人设只指导内容风格，不作为真实消费体验或效果的证明",
                ],
              ],
            }),
            h(
              "div",
              { className: "xhs-actions" },
              h(
                Button,
                { onClick: () => go("settings", "consent") },
                "上传授权书",
              ),
              h(
                Button,
                { onClick: () => go("settings", "consent") },
                "调整使用范围",
              ),
            ),
          ),
        ),
      ),
    transferring &&
      account &&
      h(TransferDialog, {
        snapshot,
        host,
        account,
        refresh,
        presetTo: orders.find((o) => o.account_id === account.id)?.to_member_id,
        onClose: () => setTransferring(false),
      }),
    scene !== null &&
      h(
        Dialog,
        {
          title: "用参考图生成场景图",
          desc: "按这个账号的人设生成一张场景图，带“虚拟人物”标记。",
          onClose: () => setScene(null),
          footer: [
            h(Button, { key: "c", onClick: () => setScene(null) }, "取消"),
            h(
              Button,
              {
                key: "ok",
                primary: true,
                disabled: !scene.trim(),
                onClick: async () => {
                  const s = scene;
                  setScene(null);
                  await image({ action: "generate", scene: s });
                },
              },
              "生成",
            ),
          ],
        },
        h(Field, {
          label: "场景",
          value: scene,
          onChange: setScene,
          placeholder: "例如：周末在咖啡店看书",
        }),
      ),
    upload &&
      h(
        Dialog,
        {
          title: "上传形象照片",
          desc: "本人照片需要有效的肖像授权；服装、发型等参考图不需要。",
          onClose: () => setUpload(null),
          footer: [
            h(Button, { key: "c", onClick: () => setUpload(null) }, "取消"),
          ],
        },
        h(Select, {
          label: "类型",
          value: upload.group,
          onChange: (v) => setUpload({ ...upload, group: v }),
          options: [
            ["portrait", "本人授权的形象照"],
            ["reference", "服装、发型等形象参考"],
          ],
        }),
        h(Field, {
          label: "标注",
          value: upload.label,
          onChange: (v) => setUpload({ ...upload, label: v }),
          placeholder: "例如：正面、侧面、风衣",
        }),
        h(
          "label",
          { className: "xhs-btn primary", style: { marginTop: 10 } },
          "选择图片",
          h("input", {
            type: "file",
            accept: "image/png,image/jpeg,image/webp",
            style: { display: "none" },
            onChange: async (e) => {
              const files = [...e.target.files];
              e.target.value = "";
              if (!files.length) return;
              const [img] = await readImageFiles(files.slice(0, 1));
              const u = upload;
              setUpload(null);
              await image({
                action: "upload",
                group: u.group,
                label: u.label,
                image: img,
              }).catch((error) =>
                window.dispatchEvent(
                  new CustomEvent("octop:xhs-error", { detail: error }),
                ),
              );
            },
          }),
        ),
      ),
  );
}

// ---- 对话卡片：在对话里看待审核内容、自动回复和异常 ----
function WorkbenchCards({ host }) {
  useStyle();
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const locale = String(host.getToolContext().locale || "zh");
  const load = async () => {
    if (typeof host.request !== "function") {
      setError("unavailable");
      return;
    }
    try {
      setSnapshot(await host.request("/plugin-apps/xhs-ops/snapshot"));
      setError("");
    } catch (e) {
      setError(operationError(e, locale));
    }
  };
  useEffect(() => {
    load();
  }, []);
  if (
    error ||
    (snapshot && snapshot.data?.effective_policy?.chat_cards === false)
  )
    return h(WorkbenchLink, { host });
  if (!snapshot)
    return h("div", { className: "xhs-meta" }, "正在读取小红薯运营…");
  const data = snapshot.data;
  const readOnly = Boolean(snapshot.read_only);
  const pending = rows(data.drafts)
    .filter((d) => (d.review_status || "pending_review") === "pending_review")
    .slice(0, 3);
  const auto = rows(data.reply_items)
    .filter((i) => i.auto && i.status === "sent")
    .slice(-3);
  const replies = rows(data.reply_items)
    .filter((i) => i.status === "new" && i.draft)
    .slice(0, 2);
  const alerts = rows(data.alerts)
    .filter((a) => a.level === "action")
    .slice(0, 2);
  const card = (title, state, body) =>
    h(
      "section",
      { className: "xhs-card", style: { maxWidth: 760, marginBottom: 10 } },
      h(
        "div",
        {
          style: {
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 8,
          },
        },
        h("b", { style: { flex: 1 } }, title),
        state,
      ),
      body,
    );
  return h(
    "div",
    { className: "xhs-app" },
    pending.length > 0 &&
      card(
        `内容草稿审核 · ${pending.length} 篇`,
        pill("需要你确认", "warn"),
        pending.map((d) =>
          h(
            "div",
            { key: d.id, className: "xhs-row" },
            h(
              "div",
              null,
              h("b", null, d.title),
              h(
                "div",
                { className: "xhs-meta" },
                accountName(snapshot, d.account_id),
              ),
              checkPills(d.checks),
            ),
            h(
              Button,
              {
                primary: true,
                disabled: readOnly,
                onClick: async () => {
                  await send(host, "plan.update", {
                    action: "approve",
                    ids: [d.id],
                  });
                  await load();
                },
              },
              "通过",
            ),
          ),
        ),
      ),
    auto.length > 0 &&
      card(
        `已自动回复 · ${auto.length} 条闲聊评论`,
        pill("已发送 · 事后通知", "ok"),
        auto.map((i) =>
          h(
            "div",
            { key: i.id, className: "xhs-row" },
            h(
              "div",
              null,
              `“${i.text}” → ${i.sent_text}`,
              h(
                "div",
                { className: "xhs-meta" },
                accountName(snapshot, i.account_id),
              ),
            ),
            h(
              Button,
              {
                danger: true,
                disabled: readOnly,
                onClick: async () => {
                  await send(host, "reply.delete", { id: i.id });
                  await load();
                },
              },
              "删除回复",
            ),
          ),
        ),
      ),
    replies.length > 0 &&
      card(
        `回复审核 · ${replies.length} 条`,
        pill("需要你确认", "warn"),
        replies.map((i) =>
          h(
            "div",
            { key: i.id, className: "xhs-row" },
            h(
              "div",
              null,
              `“${i.text}”`,
              h("div", { className: "xhs-meta" }, `回复：${i.draft}`),
            ),
            h(
              Button,
              {
                primary: true,
                disabled: readOnly,
                onClick: async () => {
                  await send(host, "reply.approve", {
                    id: i.id,
                    version: i.version,
                  });
                  await load();
                },
              },
              "通过并发送",
            ),
          ),
        ),
      ),
    alerts.length > 0 &&
      card(
        "账号异常",
        pill("需要你处理", "bad"),
        alerts.map((a) =>
          h(
            "div",
            { key: a.id, className: "xhs-row" },
            a.account_id
              ? `${accountName(snapshot, a.account_id)} · ${a.label}`
              : a.label,
          ),
        ),
      ),
    h("div", { className: "xhs-actions" }, h(WorkbenchLink, { host })),
  );
}

const TRANSFER_STATUS = {
  pending_approval: ["待管理员审批", "warn"],
  approved: ["待对方接收", "warn"],
  accepted: ["对方导入中", "warn"],
  completed: ["已转交", "ok"],
  rejected: ["管理员未通过", ""],
  declined: ["对方已拒收", ""],
  cancelled: ["已撤回", ""],
};
const SUMMARY_LABELS = {
  drafts: "未发布草稿",
  materials: "素材",
  authorizations: "授权",
  leads: "线索",
  images: "图片",
};
function TransferDialog({
  snapshot,
  host,
  account,
  onClose,
  refresh,
  presetTo,
}) {
  const transfer = snapshot.data.transfers || {};
  const members = rows(transfer.members);
  const [to, setTo] = useState(
    members.some((m) => m.id === presetTo) ? presetTo : members[0]?.id || "",
  );
  const [note, setNote] = useState("");
  const [sure, setSure] = useState(false);
  const id = account.id;
  const counts = {
    drafts: rows(snapshot.data.drafts).filter(
      (d) => d.account_id === id && d.review_status !== "published",
    ).length,
    materials: rows(snapshot.data.materials).filter(
      (m) => m.owner !== "public" && rows(m.account_ids).includes(id),
    ).length,
    authorizations: rows(snapshot.data.authorizations).filter((c) =>
      rows(c.account_ids).includes(id),
    ).length,
    leads: rows(snapshot.data.leads).filter((l) => l.account_id === id).length,
  };
  return h(
    "section",
    {
      className: "xhs-card",
      style: { borderColor: C.red },
      role: "dialog",
      "aria-label": "转交给同事",
    },
    h("h3", null, `把「${account.name}」转交给同事`),
    members.length === 0
      ? h(
          "div",
          { className: "xhs-empty" },
          "企业里还没有其他分配了“运营管理”能力的同事。请先让管理员在后台分配。",
        )
      : h(
          "div",
          null,
          h(Select, {
            label: "转交给",
            value: to,
            onChange: setTo,
            options: members.map((m) => [m.id, m.name]),
          }),
          h(Field, {
            label: "交接说明（对方和管理员可以看到）",
            value: note,
            onChange: setNote,
            placeholder: "例如：本月排期已做完，素材都在素材库里",
          }),
          h(
            "div",
            { className: "xhs-meta", style: { margin: "8px 0" } },
            "一起转交：",
            Object.entries(counts)
              .map(([k, n]) => `${SUMMARY_LABELS[k]} ${n}`)
              .join(" · "),
            " · 已发布笔记的记录",
          ),
          h(
            "div",
            {
              className: "xhs-card",
              style: { background: C.soft, borderColor: C.line },
            },
            h(
              "div",
              null,
              "· 发起后这个账号暂停全部自动任务，不能再修改，直到转交结束。",
            ),
            h(
              "div",
              null,
              "· 企业管理员通过、对方接收后，账号和上面这些内容会从你这里移走。",
            ),
            h(
              "div",
              null,
              "· 手机绑定和身份核对不会带过去，对方要重新绑定手机并核对小红薯号后才能继续运营。",
            ),
            h("div", null, "· 管理员拒绝、对方拒收或你撤回后，账号恢复原样。"),
          ),
          h(Check, {
            label: "我已确认上面的说明",
            checked: sure,
            onChange: setSure,
          }),
        ),
    h(
      "div",
      { className: "xhs-actions" },
      members.length > 0 &&
        h(
          Button,
          {
            primary: true,
            disabled: !to || !sure,
            onClick: async () => {
              await send(host, "transfer.create", {
                account_id: id,
                to_member_id: to,
                note,
                confirmed: true,
              });
              onClose();
              await refresh();
            },
          },
          "发起转交",
        ),
      h(Button, { onClick: onClose }, "取消"),
    ),
  );
}

function IncomingTransfers({ snapshot, host, readOnly, refresh, onImported }) {
  const items = rows(snapshot.data.transfers?.items).filter(
    (t) =>
      t.direction === "incoming" && ["approved", "accepted"].includes(t.status),
  );
  const projects = rows(snapshot.data.projects);
  const [target, setTarget] = useState({});
  if (!items.length) return null;
  return h(
    Card,
    {
      title: `转交给你的账号 · ${items.length}`,
      hint: "接收后账号会放进你选的项目。需要先绑定你的手机并核对小红薯号，之后才能养号、发布和回复。",
    },
    items.map((t) =>
      h(
        "div",
        {
          key: t.id,
          className: "xhs-row",
          style: { alignItems: "flex-end", flexWrap: "wrap" },
        },
        h(
          "div",
          { style: { minWidth: 220, flex: 1 } },
          h("b", null, `${t.account_name}`),
          h(
            "div",
            { className: "xhs-meta" },
            `${t.from_member_name} 转交 · ${
              t.platform_account_id
                ? "小红薯号 " + t.platform_account_id
                : "未核对小红薯号"
            }`,
          ),
          t.note && h("div", { className: "xhs-meta" }, `交接说明：${t.note}`),
          h(
            "div",
            { className: "xhs-meta" },
            Object.entries(t.summary || {})
              .filter(([, n]) => n > 0)
              .map(([k, n]) => `${SUMMARY_LABELS[k] || k} ${n}`)
              .join(" · ") || "只有账号资料",
          ),
        ),
        h(Select, {
          label: "放进项目",
          value: target[t.id] ?? "",
          onChange: (v) => setTarget({ ...target, [t.id]: v }),
          options: [
            ["", "新建项目（沿用原项目设置）"],
            ...projects.map((p) => [p.id, p.name]),
          ],
        }),
        h(
          "span",
          { style: { display: "flex", gap: 6 } },
          h(
            Button,
            {
              primary: true,
              disabled: readOnly,
              onClick: async () => {
                await send(host, "transfer.accept", {
                  transfer_id: t.id,
                  project_id: target[t.id] || "",
                  confirmed: true,
                });
                await refresh();
                onImported(t.account_id);
              },
            },
            "接收",
          ),
          t.status === "approved" &&
            h(
              Button,
              {
                disabled: readOnly,
                onClick: async () => {
                  const note =
                    window.prompt("拒收原因（对方可以看到）", "") ?? null;
                  if (note === null) return;
                  await send(host, "transfer.decline", {
                    transfer_id: t.id,
                    note,
                  });
                  await refresh();
                },
              },
              "拒收",
            ),
        ),
      ),
    ),
  );
}

function XhsOpsPage({ host, license }) {
  useStyle();
  const [textModels, setTextModels] = useState([]);
  const [modelRef, setModelRef] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const effectiveLicense = snapshot?.license || license;
  const [tab, setTab] = useState(
    () => /#tab=([a-z]+)/.exec(window.location.hash || "")?.[1] || "overview",
  );
  const [focus, setFocus] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    let timer;
    const receive = (event) => {
      setNote(String(event.detail || ""));
      clearTimeout(timer);
      timer = setTimeout(() => setNote(""), 2400);
    };
    window.addEventListener("octop:xhs-toast", receive);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("octop:xhs-toast", receive);
    };
  }, []);
  const locale = String(host.getToolContext().locale || "zh");
  const readOnly =
    !effectiveLicense ||
    Boolean(snapshot && snapshot.read_only) ||
    ["expired", "revoked", "read_only"].includes(
      String(effectiveLicense.status || "").toLowerCase(),
    );
  const refresh = async () => {
    try {
      const value = await host.request("/plugin-apps/xhs-ops/snapshot");
      setSnapshot(value);
      setError("");
      const currentLicense = value.license || license;
      if (
        ["xhs.content", "xhs.ops", "xhs.takeover", "xhs.comment"].some(
          (feature) => hasFeature(currentLicense, feature),
        ) &&
        !value.read_only
      ) {
        const choices = rows(
          await host.request("/plugin-apps/xhs-ops/models").catch(() => []),
        );
        setTextModels(choices);
        setModelRef((current) =>
          choices.some((model) => model.id === current) ? current : "",
        );
      } else {
        setTextModels([]);
        setModelRef("");
      }
    } catch (e) {
      setError(operationError(e, locale));
    }
  };
  useEffect(() => {
    refresh();
    return undefined;
  }, []);
  useEffect(() => {
    const receive = (event) => setError(operationError(event.detail, locale));
    window.addEventListener("octop:xhs-error", receive);
    return () => window.removeEventListener("octop:xhs-error", receive);
  }, []);
  useEffect(() => {
    const active =
      snapshot &&
      rows(snapshot.data.runs).some((r) =>
        ["queued", "preparing", "running", "cancelling"].includes(r.status),
      );
    if (!effectiveLicense) return undefined;
    const timer = setInterval(refresh, active ? 5000 : 15000);
    return () => clearInterval(timer);
  }, [snapshot && snapshot.data.version]);
  const groups = useMemo(
    () => [
      {
        id: "home",
        label: "工作台",
        tabs: [
          { id: "overview", label: "总览" },
          { id: "queue", label: "执行队列" },
          { id: "alerts", label: "异常与告警" },
        ],
      },
      {
        id: "build",
        label: "建号",
        tabs: [
          { id: "projects", label: "项目" },
          { id: "personas", label: "人设规划", feature: "xhs.ops" },
          { id: "accounts", label: "账号与设备", feature: "xhs.ops" },
          { id: "profile", label: "账号档案", feature: "xhs.ops" },
          { id: "profiles", label: "新号资料", feature: "xhs.ops" },
          { id: "audits", label: "老号接管", feature: "xhs.takeover" },
        ],
      },
      {
        id: "nurture",
        label: "养号",
        tabs: [
          { id: "operations", label: "日常运营", feature: "xhs.ops" },
          { id: "coldstart", label: "冷启动方案", feature: "xhs.ops" },
          { id: "comments", label: "评论审核", feature: "xhs.comment" },
        ],
      },
      {
        id: "content",
        label: "内容",
        tabs: [
          { id: "plan", label: "内容计划", feature: "xhs.content" },
          { id: "editor", label: "创作编辑器", feature: "xhs.content" },
          { id: "materials", label: "素材库", feature: "xhs.content" },
          { id: "templates", label: "内容母版", feature: "xhs.content" },
          { id: "bizdocs", label: "业务资料", feature: "xhs.content" },
        ],
      },
      {
        id: "publish",
        label: "发布",
        tabs: [
          { id: "calendar", label: "排期日历", feature: "xhs.publish" },
          { id: "batches", label: "批量发布", feature: "xhs.publish" },
          { id: "runs", label: "发布与历史", feature: "runs" },
          { id: "upkeep", label: "笔记维护", feature: "xhs.comment" },
        ],
      },
      {
        id: "review",
        label: "复盘",
        tabs: [{ id: "reports", label: "复盘报表", feature: "xhs.analytics" }],
      },
      {
        id: "settings",
        label: "设置",
        tabs: [
          { id: "settings", label: "自动化与风控" },
          { id: "consent", label: "授权台账" },
          { id: "entitlement", label: "能力与配额" },
        ],
      },
    ],
    [],
  );
  if (!effectiveLicense)
    return h(
      "div",
      { className: "xhs-app" },
      h("style", null, css),
      h(
        "div",
        { className: "xhs-card" },
        h("h3", null, "小红薯运营"),
        h(
          "div",
          { className: "xhs-empty" },
          "该应用需要企业授权。",
          h("br"),
          "联系企业管理员开通。",
        ),
        h(
          "div",
          { className: "xhs-meta" },
          "建号、养号、内容计划与创作、排期发布、笔记维护、老号接管和复盘",
        ),
      ),
    );
  if (error && !snapshot)
    return h(
      "div",
      { className: "xhs-app" },
      h("div", { className: "xhs-card xhs-danger" }, error),
    );
  if (!snapshot)
    return h(
      "div",
      { className: "xhs-app" },
      h("div", { className: "xhs-empty" }, "正在加载应用数据…"),
    );
  const runAvailable = [
    "xhs.publish",
    "xhs.ops",
    "xhs.takeover",
    "xhs.analytics",
    "xhs.comment",
  ].some((item) => hasFeature(effectiveLicense, item));
  const allowed = (item) =>
    !item.feature ||
    (item.feature === "runs"
      ? runAvailable
      : hasFeature(effectiveLicense, item.feature));
  const group =
    groups.find((g) => g.tabs.some((item) => item.id === tab)) || groups[0];
  const current = group.tabs.find((item) => item.id === tab) || group.tabs[0];
  const go = (_group, id, target) => {
    setFocus(target || "");
    setTab(id);
  };
  const common = { snapshot, host, readOnly, refresh, modelRef, go, focus };
  const panels = {
    overview: () => h(OverviewPanel, common),
    queue: () => h(QueuePanel, common),
    alerts: () => h(AlertsPanel, common),
    projects: () => h(ProjectPanel, { ...common, license: effectiveLicense }),
    personas: () => h(PersonaPanel, common),
    accounts: () => h(AccountPanel, common),
    profile: () => h(AccountProfilePanel, common),
    profiles: () => h(ProfilePanel, common),
    audits: () => h(AuditPanel, common),
    operations: () => h(OperationsPanel, common),
    coldstart: () => h(ColdStartPanel, common),
    comments: () => h(CommentsPanel, common),
    plan: () => h(PlanPanel, common),
    editor: () => h(EditorPanel, common),
    materials: () => h(MaterialsPanel, common),
    templates: () => h(TemplatesPanel, common),
    bizdocs: () => h(BizDocsPanel, common),
    calendar: () => h(CalendarPanel, common),
    batches: () => h(BatchPanel, { ...common, license: effectiveLicense }),
    runs: () => h(RunPanel, { ...common, license: effectiveLicense }),
    upkeep: () => h(UpkeepPanel, common),
    reports: () => h(ReportPanel, common),
    settings: () => h(SettingsPanel, common),
    consent: () => h(ConsentPanel, common),
    entitlement: () => h(EntitlementPanel, common),
  };
  const panel =
    !readOnly && !allowed(current)
      ? h(FeatureLocked, { locale })
      : panels[current.id]();
  return h(
    "div",
    { className: "xhs-app" },
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 12,
        },
      },
      h("img", {
        src: XHS_LOGO,
        alt: "小红薯",
        style: { height: 30, width: "auto", borderRadius: 30, flex: "none" },
      }),
      h(
        "div",
        null,
        h("h1", { style: { margin: 0, fontSize: 18 } }, "小红薯运营"),
        h(
          "div",
          { className: "xhs-meta" },
          [
            effectiveLicense.plugin_version,
            effectiveLicense.tenant_name,
            effectiveLicense.expires_at
              ? "许可至 " + String(effectiveLicense.expires_at).slice(0, 10)
              : "",
          ]
            .filter(Boolean)
            .join(" · "),
        ),
      ),
      h("span", { style: { flex: 1 } }),
      textModels.length > 0 &&
        h(
          "select",
          {
            className: "xhs-select",
            style: { width: 200, marginTop: 0 },
            value: modelRef,
            disabled: readOnly,
            "aria-label": "生成模型",
            title: "生成模型",
            onChange: (event) => setModelRef(event.target.value),
          },
          h("option", { value: "" }, "默认授权模型"),
          textModels.map((model) =>
            h(
              "option",
              { key: model.id, value: model.id },
              (model.source === "personal" ? "个人模型 · " : "企业模型 · ") +
                model.name,
            ),
          ),
        ),
      h(PauseButton, { snapshot, host, readOnly, refresh }),
    ),
    h(
      "div",
      { className: "xhs-groups" },
      groups.map((g) =>
        h(
          "button",
          {
            key: g.id,
            className: `xhs-btn xhs-group${g.id === group.id ? " active" : ""}`,
            onClick: () => {
              setFocus("");
              setTab(g.tabs.find(allowed)?.id || g.tabs[0].id);
            },
          },
          ic(g.label),
          g.label,
        ),
      ),
    ),
    h(
      "div",
      { className: "xhs-tabs" },
      group.tabs.map((item) =>
        h(
          "button",
          {
            key: item.id,
            className: `xhs-tab${current.id === item.id ? " active" : ""}`,
            onClick: () => {
              setFocus("");
              setTab(item.id);
            },
            title: readOnly || allowed(item) ? undefined : "未分配给你",
          },
          ic(item.label),
          item.label,
          !readOnly &&
            !allowed(item) &&
            h("span", { "aria-hidden": true }, " 🔒"),
        ),
      ),
    ),
    error &&
      h(
        "div",
        { className: "xhs-card xhs-danger", style: { marginBottom: 12 } },
        error,
        h(
          "button",
          {
            className: "xhs-btn",
            style: { marginLeft: 10 },
            onClick: () => setError(""),
          },
          "关闭",
        ),
      ),
    readOnly &&
      h(
        "div",
        {
          className: "xhs-card",
          style: { marginBottom: 12, borderColor: C.amber },
        },
        "当前授权为只读状态，编辑、发布和协作操作已禁用。",
      ),
    panel,
    note && h("div", { className: "xhs-toast", role: "status" }, note),
  );
}

// ---- 对话卡片：一次工具调用一张卡，确认动作留给人 ----
const CARD_CSS = `
  .xc{max-width:760px;width:100%;padding:0;overflow:hidden;margin-bottom:10px}
  .xc-head{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid ${C.line};background:${C.soft}}
  .xc-body{padding:14px}
  .xc-foot{display:flex;flex-wrap:wrap;gap:7px;align-items:center;padding:10px 14px;border-top:1px solid ${C.line}}
  .xc-kv{display:grid;grid-template-columns:88px minmax(0,1fr);gap:6px 12px;font-size:12.5px;margin:0}
  .xc-kv dt{color:${C.muted}} .xc-kv dd{margin:0}
  .xc-chips{display:flex;gap:5px;flex-wrap:wrap}
`;
const openWorkbench = (tab) => {
  window.location.href = "/apps/xhs-ops" + (tab ? "#tab=" + tab : "");
};
function ChatCard({ title, state, tone = "warn", tab, foot, note, children }) {
  return h(
    "section",
    { className: "xhs-card xc" },
    h(
      "div",
      { className: "xc-head" },
      h("img", {
        src: XHS_LOGO,
        alt: "小红薯",
        style: { height: 18, width: "auto", borderRadius: 18 },
      }),
      h("b", { style: { flex: 1 } }, title),
      state && pill(state, tone, true),
      h(
        "button",
        {
          type: "button",
          className: "xhs-link",
          onClick: () => openWorkbench(tab),
        },
        "工作台",
      ),
    ),
    h("div", { className: "xc-body" }, children),
    (foot || note) &&
      h(
        "div",
        { className: "xc-foot" },
        foot,
        h("span", { style: { flex: 1 } }),
        note && h("span", { className: "xhs-meta" }, note),
      ),
  );
}
const kv = (pairs) =>
  h(
    "dl",
    { className: "xc-kv" },
    pairs
      .filter(Boolean)
      .flatMap(([k, v]) => [
        h("dt", { key: "t" + k }, k),
        h("dd", { key: "d" + k }, v),
      ]),
  );
const chips = (list) =>
  h(
    "div",
    { className: "xc-chips" },
    rows(list).length
      ? rows(list).map((x) => h("span", { key: x, className: "xhs-pill" }, x))
      : "—",
  );
function ChatComment({ c, snapshot, host, readOnly, refresh }) {
  const [value, setValue] = useState(c.text || rows(c.candidates)[0] || "");
  const count = [...value.trim()].length;
  const review = (decision) => async () => {
    await send(host, "comment.review", {
      id: c.id,
      version: c.version || 1,
      decision,
      ...(decision === "approved" ? { text: value.trim() } : {}),
      note: "",
    });
    await refresh();
  };
  return h(
    "div",
    { className: "xhs-row", style: { alignItems: "flex-start" } },
    h(
      "div",
      { style: { flex: 1, minWidth: 0 } },
      h("b", null, c.post?.title || c.post_title || "笔记"),
      h(
        "div",
        { className: "xhs-meta" },
        `${accountName(snapshot, c.account_id)} · 2–10 字，正向具体，不含营销`,
      ),
      rows(c.candidates).length > 1 &&
        h(
          "div",
          { className: "xc-chips", style: { margin: "5px 0" } },
          rows(c.candidates).map((text) =>
            h(
              "button",
              {
                key: text,
                type: "button",
                className: `xhs-btn${text === value ? " is-active" : ""}`,
                onClick: () => setValue(text),
              },
              text,
            ),
          ),
        ),
      h("input", {
        className: "xhs-input",
        "aria-label": "评论原文",
        value,
        maxLength: 10,
        disabled: readOnly,
        onChange: (e) => setValue(e.target.value),
      }),
    ),
    h(
      "div",
      { style: { display: "flex", gap: 6 } },
      h(
        Button,
        {
          primary: true,
          disabled: readOnly || count < 2 || count > 10,
          onClick: review("approved"),
        },
        "审核通过",
      ),
      h(Button, { disabled: readOnly, onClick: review("rejected") }, "拒绝"),
    ),
  );
}
function XhsChatCard({ host, data }) {
  useStyle();
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const locale = String(host.getToolContext().locale || "zh");
  const refresh = async () => {
    try {
      setSnapshot(await host.request("/plugin-apps/xhs-ops/snapshot"));
      setError("");
    } catch (e) {
      setError(operationError(e, locale));
    }
  };
  useEffect(() => {
    if (typeof host.request === "function") refresh();
    else setError("unavailable");
    const receive = (event) => setError(operationError(event.detail, locale));
    window.addEventListener("octop:xhs-error", receive);
    return () => window.removeEventListener("octop:xhs-error", receive);
  }, []);
  if (snapshot && snapshot.data?.effective_policy?.chat_cards === false)
    return h(WorkbenchLink, { host });
  if (!snapshot)
    return error
      ? h(WorkbenchLink, { host })
      : h("div", { className: "xhs-meta" }, "正在读取小红薯运营…");
  const d = snapshot.data;
  const readOnly = Boolean(snapshot.read_only);
  const zone = tz(snapshot);
  const kind = data?.kind;
  const style = h("style", { key: "css" }, CARD_CSS);
  const problem =
    error &&
    h(
      "div",
      { key: "err", className: "xhs-danger", style: { marginBottom: 8 } },
      error,
    );
  const run = (command, payload) => async () => {
    await send(host, command, payload);
    await refresh();
  };
  let card = null;
  if (kind === "profile") {
    const project = rows(d.projects).find((p) => p.id === data.project_id);
    const profile = project?.profile;
    if (project && profile && typeof profile === "object")
      card = h(
        ChatCard,
        {
          title: `目标画像确认 · ${project.name}`,
          state: profile.confirmed_at ? "已确认" : "需要你确认",
          tone: profile.confirmed_at ? "ok" : "warn",
          tab: "projects",
          note: "确认后才能生成人设",
          foot: [
            h(
              Button,
              {
                key: "ok",
                primary: true,
                disabled: readOnly || Boolean(profile.confirmed_at),
                onClick: run("profile.confirm", {
                  project_id: project.id,
                  version: project.version,
                  profile: {
                    summary: profile.summary,
                    base: profile.base,
                    vertical_interests: profile.vertical_interests,
                    general_interests: profile.general_interests,
                  },
                  confirmed: true,
                }),
              },
              "确认画像",
            ),
            h(
              Button,
              { key: "edit", onClick: () => openWorkbench("projects") },
              "编辑画像",
            ),
            h(
              Button,
              {
                key: "re",
                disabled: readOnly,
                onClick: run("profile.generate", {
                  project_id: project.id,
                  version: project.version,
                }),
              },
              "重新生成",
            ),
          ],
        },
        kv([
          ["画像概述", profile.summary],
          [
            "年龄 / 性别",
            `${profile.base?.age_range || "—"} · ${
              profile.base?.gender_ratio || "—"
            }`,
          ],
          ["地区", rows(profile.base?.regions).join("、") || "—"],
          ["垂直兴趣", chips(profile.vertical_interests)],
          ["泛兴趣", chips(profile.general_interests)],
        ]),
      );
  } else if (kind === "personas") {
    const project = rows(d.projects).find((p) => p.id === data.project_id);
    const candidates = rows(d.persona_candidates).filter(
      (c) => c.project_id === data.project_id && c.status !== "stale",
    );
    const adopted = (c) =>
      c.status === "applied" ||
      rows(d.accounts).some(
        (a) => a.project_id === c.project_id && (a.label || a.name) === c.label,
      );
    if (project)
      card = h(
        ChatCard,
        {
          title: `候选人设 · ${candidates.length} 个`,
          state: "需要你确认",
          tab: "personas",
          foot: [
            h(
              Button,
              {
                key: "c",
                primary: true,
                onClick: () => openWorkbench("personas"),
              },
              "确认人设分布",
            ),
            h(
              Button,
              {
                key: "re",
                disabled: readOnly,
                onClick: run("persona.generate", {
                  project_id: project.id,
                  version: project.version,
                  count: Math.max(1, candidates.length || 4),
                }),
              },
              `再生成 ${Math.max(1, candidates.length || 4)} 个`,
            ),
            h(
              Button,
              { key: "e", onClick: () => openWorkbench("personas") },
              "编辑人设",
            ),
          ],
        },
        h(
          "div",
          { className: "xhs-grid" },
          candidates.map((c) =>
            h(
              "div",
              { key: c.id, className: "xhs-card" },
              h("b", null, c.label),
              h(
                "div",
                { className: "xhs-meta" },
                [
                  c.persona?.age,
                  c.persona?.gender,
                  c.persona?.region,
                  c.persona?.occupation,
                ]
                  .filter(Boolean)
                  .join(" · "),
              ),
              h(
                "div",
                { className: "xhs-meta" },
                `核心兴趣 ${rows(c.interest_pool?.core).join("、")}`,
              ),
              h(
                "div",
                { className: "xhs-actions" },
                adopted(c)
                  ? h(Button, { primary: true, disabled: true }, "已采用")
                  : h(
                      Button,
                      {
                        disabled: readOnly,
                        onClick: run("persona.apply", {
                          project_id: project.id,
                          version: c.project_version,
                          candidate_id: c.id,
                          confirmed: true,
                        }),
                      },
                      "采用为新号",
                    ),
              ),
            ),
          ),
        ),
        !candidates.length &&
          h("div", { className: "xhs-empty" }, "候选已经过期，请重新生成"),
      );
  } else if (kind === "content" || kind === "week") {
    const tasks = rows(d.content_tasks).filter(
      (t) => t.batch_id === data.batch_id,
    );
    const drafts = tasks
      .map((t) => rows(d.drafts).find((x) => x.id === t.draft_id))
      .filter(
        (x) =>
          x &&
          ["pending_review", "returned", undefined].includes(x.review_status),
      );
    if (kind === "week" && tasks.length) {
      const byAccount = new Map();
      for (const t of tasks)
        byAccount.set(t.account_id, [
          ...(byAccount.get(t.account_id) || []),
          t,
        ]);
      card = h(
        ChatCard,
        {
          title: "本周内容计划",
          state: "已准备好",
          tone: "ok",
          tab: "plan",
          note: "已在内容计划的待制作里，仍需逐篇审核",
          foot: [
            h(
              Button,
              { key: "p", primary: true, onClick: () => openWorkbench("plan") },
              "查看内容计划",
            ),
            h(
              Button,
              {
                key: "n",
                disabled:
                  readOnly || !tasks.some((t) => t.status === "to_make"),
                onClick: async () => {
                  for (const t of tasks.filter((x) => x.status === "to_make"))
                    await send(host, "task.dismiss", { id: t.id });
                  await refresh();
                },
              },
              "这周不需要",
            ),
          ],
        },
        h(Table, {
          head: ["账号", "本周", "结构", "为什么这样排"],
          body: Array.from(byAccount, ([id, list]) => [
            accountName(snapshot, id),
            `${list.length} 篇`,
            ["marketing", "life", "knowledge"]
              .map((n) => [n, list.filter((t) => t.nature === n).length])
              .filter(([, n]) => n)
              .map(([n, c]) => `${NATURE_MARK[n]} ${c}`)
              .join(" · "),
            list[0].reason || "—",
          ]),
        }),
      );
    } else if (tasks.length) {
      const draft = drafts[Math.min(index, Math.max(0, drafts.length - 1))];
      card = h(
        ChatCard,
        {
          title: draft
            ? `内容草稿审核 · 第 ${Math.min(index, drafts.length - 1) + 1} / ${
                drafts.length
              } 篇`
            : `内容任务 · ${tasks.length} 篇`,
          state: draft ? "需要你确认" : "制作中",
          tab: "plan",
          foot: draft
            ? [
                h(
                  Button,
                  {
                    key: "ok",
                    primary: true,
                    disabled: readOnly,
                    onClick: async () => {
                      if (
                        rows(draft.checks?.items).some(
                          (i) =>
                            ["ai_label", "disclosure"].includes(i.key) &&
                            i.level !== "ok",
                        )
                      )
                        await send(host, "content.meta", {
                          id: draft.id,
                          meta: {},
                          fix_labels: true,
                        });
                      await send(host, "plan.update", {
                        action: "approve",
                        ids: [draft.id],
                      });
                      await refresh();
                    },
                  },
                  rows(draft.checks?.items).some(
                    (i) =>
                      ["ai_label", "disclosure"].includes(i.key) &&
                      i.level !== "ok",
                  )
                    ? "补上标识并通过"
                    : "通过",
                ),
                h(
                  Button,
                  { key: "e", onClick: () => openWorkbench("editor") },
                  "编辑",
                ),
                h(
                  Button,
                  {
                    key: "r",
                    disabled: readOnly,
                    onClick: run("plan.update", {
                      action: "return",
                      ids: [draft.id],
                    }),
                  },
                  "退回重写",
                ),
                drafts.length > 1 &&
                  h(
                    Button,
                    {
                      key: "p",
                      disabled: index <= 0,
                      onClick: () => setIndex(index - 1),
                    },
                    "上一篇",
                  ),
                drafts.length > 1 &&
                  h(
                    Button,
                    {
                      key: "n",
                      disabled: index >= drafts.length - 1,
                      onClick: () => setIndex(index + 1),
                    },
                    "下一篇",
                  ),
              ]
            : [
                h(
                  Button,
                  { key: "p", onClick: () => openWorkbench("plan") },
                  "查看内容计划",
                ),
              ],
        },
        draft
          ? [
              h("b", { key: "t" }, draft.title),
              h(
                "div",
                {
                  key: "c",
                  className: "xhs-meta",
                  style: { margin: "4px 0 10px", whiteSpace: "pre-wrap" },
                },
                String(draft.content || "").slice(0, 160),
              ),
              h(
                "div",
                { key: "k" },
                kv([
                  ["发布账号", accountName(snapshot, draft.account_id)],
                  [
                    "排期",
                    draft.scheduled_at
                      ? fmt(draft.scheduled_at, zone)
                      : "未排期",
                  ],
                  ["内容母版", templateName(snapshot, draft.template_id)],
                  ["来源", srcPill(draft.source)],
                  ["发布前检查", checkPills(draft.checks)],
                ]),
              ),
            ]
          : h(
              "div",
              { className: "xhs-meta" },
              `${tasks.length} 个任务在内容计划的“待制作”里，生成草稿后在这里或工作台审核。`,
            ),
      );
    }
  } else if (kind === "material") {
    const m = rows(d.materials).find((x) => x.id === data.material_id);
    if (m) {
      const a = m.analysis || {};
      const suggested = rows(a.suggested_account_ids);
      card = h(
        ChatCard,
        {
          title: `素材整理 · ${m.title || String(m.text || "").slice(0, 14)}`,
          state: m.confirmed ? "已确认" : "需要你确认",
          tone: m.confirmed ? "ok" : "warn",
          tab: "materials",
          foot: [
            h(
              Button,
              {
                key: "g",
                primary: true,
                disabled: readOnly || m.status === "frozen",
                onClick: async () => {
                  await send(host, "task.add", {
                    title: String(m.title || m.text || "素材选题").slice(0, 40),
                    account_id: suggested[0] || "",
                    nature: "life",
                    material_ids: [m.id],
                    source: "material",
                  });
                  toast("已加入内容计划");
                  await refresh();
                },
              },
              "保存素材并生成草稿",
            ),
            h(
              Button,
              { key: "s", onClick: () => openWorkbench("materials") },
              "只保存素材",
            ),
          ],
        },
        kv([
          ["素材类型", `${MATERIAL_KINDS[m.kind]} · 文字`],
          [
            "归属",
            a.owner_hint || (m.owner === "public" ? "公共素材库" : "绑定账号"),
          ],
          ["建议账号", chips(suggested.map((id) => accountName(snapshot, id)))],
          ["可以做成", rows(a.formats).join(" · ") || "—"],
          [
            "使用边界",
            a.boundary || "只能用于本人账号，不能改写成其他账号的亲身经历",
          ],
        ]),
      );
    }
  } else if (kind === "replies") {
    const auto = rows(d.reply_items)
      .filter((i) => i.auto && i.status === "sent")
      .slice(-5);
    const pending = rows(d.reply_items)
      .filter((i) => i.status === "new" && i.draft && i.kind !== "negative")
      .slice(0, 3);
    card = [
      auto.length > 0 &&
        h(
          ChatCard,
          {
            key: "auto",
            title: `已自动回复 · ${auto.length} 条闲聊评论`,
            state: "已发送 · 事后通知",
            tone: "ok",
            tab: "upkeep",
            foot: [
              h(
                Button,
                { key: "all", onClick: () => openWorkbench("upkeep") },
                "查看全部",
              ),
              h(
                Button,
                {
                  key: "pause",
                  disabled:
                    readOnly || Boolean(d.member_settings?.auto_reply_paused),
                  onClick: () =>
                    saveSettings(host, snapshot, refresh, {
                      auto_reply_paused: true,
                    }),
                },
                d.member_settings?.auto_reply_paused
                  ? "自动回复已暂停"
                  : "暂停自动回复",
              ),
            ],
          },
          auto.map((i) =>
            h(
              Row,
              {
                key: i.id,
                title: `“${i.text}”`,
                sub: `${accountName(snapshot, i.account_id)} · 回复：${
                  i.sent_text || i.draft
                }`,
              },
              h(
                Button,
                {
                  disabled: readOnly,
                  onClick: run("reply.delete", { id: i.id }),
                },
                "删除回复",
              ),
            ),
          ),
        ),
      h(
        ChatCard,
        {
          key: "review",
          title: `回复审核 · ${pending.length} 条`,
          state: pending.length ? "需要你确认" : "没有待审核",
          tone: pending.length ? "warn" : "ok",
          tab: "upkeep",
          note: "不留联系方式 · 不承诺效果",
          foot: [
            h(
              Button,
              { key: "e", onClick: () => openWorkbench("upkeep") },
              "逐条修改",
            ),
          ],
        },
        pending.map((i) =>
          h(
            Row,
            {
              key: i.id,
              title: `“${i.text}”`,
              sub: `${i.author} · ${accountName(
                snapshot,
                i.account_id,
              )} · 草稿：${i.draft}`,
            },
            h(
              Button,
              {
                primary: true,
                disabled: readOnly,
                onClick: run("reply.approve", {
                  id: i.id,
                  version: i.version,
                  handwritten: false,
                }),
              },
              "通过并发送",
            ),
            i.kind === "intent" &&
              !i.lead &&
              h(
                Button,
                {
                  disabled: readOnly,
                  onClick: run("reply.lead", { id: i.id }),
                },
                "记为线索",
              ),
          ),
        ),
        !pending.length &&
          h(
            "div",
            { className: "xhs-meta" },
            "新评论读取完成后，待审核的回复会出现在这里和工作台的“笔记维护”。",
          ),
      ),
    ];
  } else if (kind === "alerts") {
    const alerts = rows(d.alerts).filter((a) => a.level === "action");
    card = h(
      ChatCard,
      {
        title: alerts.length ? `账号异常 · ${alerts.length} 项` : "账号异常",
        state: alerts.length ? "需要你处理" : "没有异常",
        tone: alerts.length ? "bad" : "ok",
        tab: "alerts",
        foot: [
          h(
            Button,
            { key: "a", primary: true, onClick: () => openWorkbench("alerts") },
            "去处理",
          ),
          h(
            Button,
            { key: "q", onClick: () => openWorkbench("queue") },
            "查看执行队列",
          ),
        ],
        note: "异常账号的自动任务保持暂停，恢复前需要重新核对身份",
      },
      alerts.map((a) => h(Row, { key: a.id, title: a.title, sub: a.detail })),
      !alerts.length &&
        h("div", { className: "xhs-meta" }, "当前没有需要处理的账号异常。"),
    );
  } else if (kind === "diagnosis") {
    const diagnosis = rows(d.diagnoses)
      .filter(
        (x) => x.account_id === data.account_id && x.status !== "superseded",
      )
      .slice(-1)[0];
    if (diagnosis)
      card = h(
        ChatCard,
        {
          title: `账号诊断 · ${accountName(snapshot, data.account_id)}`,
          state: diagnosis.status === "confirmed" ? "已确认" : "需要你确认",
          tone: diagnosis.status === "confirmed" ? "ok" : "warn",
          tab: "audits",
          note: "确认后才会生成变更单，改资料前还会逐项让你确认",
        },
        h(DiagnosisCard, {
          d: diagnosis,
          account: rows(d.accounts).find((a) => a.id === data.account_id),
          cmd: async (command, payload) => {
            await send(host, command, payload);
            await refresh();
          },
          host,
          readOnly,
          refresh,
        }),
      );
  }
  if (kind === "daily") {
    const day = rows(d.operation_days).find((x) => x.id === data.day_id);
    if (day) {
      const runs = rows(d.runs).filter((r) => r.day_id === day.id);
      const active = runs.find((r) =>
        ["queued", "preparing", "running"].includes(r.status),
      );
      const check = day.precheck;
      const fresh =
        check?.expires_at && new Date(check.expires_at) > new Date();
      const planned = day.status === "planned";
      card = h(
        ChatCard,
        {
          title: planned
            ? `今日养号计划确认 · ${String(day.date).slice(5)} · 第 ${
                day.round || 1
              } 轮`
            : `今日养号 · ${operationLabel(day.status)}`,
          state: planned ? "需要你确认" : operationLabel(day.status),
          tone: planned ? "warn" : "ok",
          tab: "operations",
          note:
            planned && fresh
              ? `确认有效至 ${hm(check.expires_at, zone)}`
              : planned
              ? "预检已过期，请重新预检"
              : undefined,
          foot: planned
            ? [
                h(
                  Button,
                  {
                    key: "go",
                    primary: true,
                    disabled: readOnly || !fresh,
                    onClick: run("ops.start", {
                      id: day.id,
                      version: day.version,
                      confirm_digest: check?.digest,
                      confirmed: true,
                    }),
                  },
                  "确认启动日常运营",
                ),
                !fresh &&
                  h(
                    Button,
                    {
                      key: "re",
                      disabled: readOnly,
                      onClick: run("ops.precheck", {
                        id: day.id,
                        version: day.version,
                      }),
                    },
                    "重新预检",
                  ),
                h(
                  Button,
                  { key: "edit", onClick: () => openWorkbench("operations") },
                  "调整计划",
                ),
              ]
            : [
                h(
                  Button,
                  { key: "see", onClick: () => openWorkbench("operations") },
                  "查看账号核对截图",
                ),
                active &&
                  h(
                    Button,
                    {
                      key: "stop",
                      disabled: readOnly,
                      onClick: run("run.cancel", { run_id: active.id }),
                    },
                    "停止此分段",
                  ),
              ],
        },
        kv([
          ["账号", accountName(snapshot, day.account_id)],
          ...rows(day.plans).map((p, i) => [
            `第 ${p.segment?.index || i + 1} 段`,
            `搜索 ${rows(p.keywords)
              .map((k) => `「${k.keyword}」${k.count} 篇`)
              .join("、")}${
              p.home_feed_count ? ` · 首页 ${p.home_feed_count} 篇` : ""
            } · 每篇停留 ${p.dwell_sec_min}–${p.dwell_sec_max} 秒`,
          ]),
          [
            "互动上限",
            ["like", "collect", "follow"]
              .map((k) => [k, rows(day.plans)[0]?.interaction?.[k]])
              .filter(([, r]) => r?.enabled)
              .map(
                ([k, r]) =>
                  `${{ like: "点赞", collect: "收藏", follow: "关注" }[k]} ≤ ${
                    r.daily_cap
                  }`,
              )
              .join(" · ") || "全部关闭",
          ],
          !planned && [
            "进度",
            runs
              .map(
                (r) =>
                  `${operationLabel(r.status)}${
                    r.summary
                      ? ` ${r.summary.browsed}/${r.summary.planned}`
                      : ""
                  }`,
              )
              .join(" · ") || "—",
          ],
        ]),
      );
    }
  } else if (kind === "batch") {
    const batch = rows(d.batches).find((x) => x.id === data.batch_id);
    if (batch) {
      const check = batch.precheck;
      const fresh =
        check?.expires_at && new Date(check.expires_at) > new Date();
      const waiting = batch.status === "prechecked";
      const items = rows(check?.items || batch.items);
      card = h(
        ChatCard,
        {
          title: `批量发布${waiting ? "确认" : ""} · ${batch.name || ""} · ${
            items.length
          } 篇`,
          state: waiting ? "需要你确认" : statusLabel(batch.status),
          tone: waiting ? "warn" : "ok",
          tab: "batches",
          note:
            waiting && fresh
              ? `五分钟内有效 · 至 ${hm(check.expires_at, zone)}`
              : waiting
              ? "预检已过期，请重新预检"
              : undefined,
          foot: waiting
            ? [
                h(
                  Button,
                  {
                    key: "go",
                    primary: true,
                    disabled: readOnly || !fresh,
                    onClick: run("batch.start", {
                      id: batch.id,
                      version: batch.version,
                      confirm_digest: check?.digest,
                      confirmed: true,
                      idempotency_key: `batch-${batch.id}-${check?.digest}`,
                    }),
                  },
                  `确认启动 ${items.length} 篇`,
                ),
                !fresh &&
                  h(
                    Button,
                    {
                      key: "re",
                      disabled: readOnly,
                      onClick: run("batch.precheck", {
                        id: batch.id,
                        version: batch.version,
                      }),
                    },
                    "重新预检",
                  ),
                h(
                  Button,
                  { key: "edit", onClick: () => openWorkbench("batches") },
                  "返回修改",
                ),
              ]
            : [
                !["completed", "cancelled", "draft"].includes(batch.status) &&
                  h(
                    Button,
                    {
                      key: "stop",
                      disabled: readOnly,
                      onClick: run("batch.cancel", {
                        id: batch.id,
                        confirmed: true,
                      }),
                    },
                    "停止批次",
                  ),
                h(
                  Button,
                  { key: "see", onClick: () => openWorkbench("runs") },
                  "查看截图证据",
                ),
              ],
        },
        items.map((item, i) => {
          const draft = rows(d.drafts).find((x) => x.id === item.draft_id);
          const changed =
            draft &&
            item.draft_version !== undefined &&
            draft.version !== item.draft_version;
          return h(
            Row,
            {
              key: item.id || i,
              title: `第 ${i + 1} 篇 · ${draft?.title || "草稿已删除"}`,
              sub: `${accountName(snapshot, item.account_id)} · ${
                rows(draft?.images).length
              } 张图`,
            },
            changed
              ? pill("! 预检后有改动，请重新预检", "warn")
              : pill("✓ 预检通过", "ok"),
          );
        }),
      );
    }
  } else if (kind === "comments") {
    const pending = rows(d.comments)
      .filter((c) => c.status === "pending")
      .slice(0, 3);
    card = h(
      ChatCard,
      {
        title: `评论审核 · ${pending.length} 条候选`,
        state: pending.length ? "需要你确认" : "没有待审核",
        tone: pending.length ? "warn" : "ok",
        tab: "comments",
        note: "审核通过后，发送前还要在工作台预检并确认",
        foot: [
          h(
            Button,
            { key: "all", onClick: () => openWorkbench("comments") },
            "去评论审核",
          ),
        ],
      },
      pending.map((c) =>
        h(ChatComment, { key: c.id, c, snapshot, host, readOnly, refresh }),
      ),
      !pending.length &&
        h("div", { className: "xhs-meta" }, "没有待审核的候选评论。"),
    );
  }
  if (!card) return h(WorkbenchLink, { host });
  return h("div", null, style, problem, card);
}

function WorkbenchLink({ host }) {
  return h(
    "button",
    {
      className: "xhs-btn primary",
      onClick: () => {
        window.location.href = "/apps/xhs-ops";
      },
    },
    host.getToolContext().locale.startsWith("zh")
      ? "打开小红薯运营工作台"
      : "Open XHS operations workbench",
  );
}

export function setup(host) {
  host.registerPage({ id: "main", title: "小红薯运营", component: XhsOpsPage });
  host.registerRenderer({
    id: "xhs_workbench",
    tools: ["xhs_workbench"],
    component: WorkbenchCards,
  });
  host.registerRenderer({
    id: "xhs_card",
    tools: [
      "xhs_generate_profile",
      "xhs_generate_personas",
      "xhs_prepare_content",
      "xhs_organize_material",
      "xhs_check_comments",
      "xhs_account_alerts",
      "xhs_diagnose_account",
      "xhs_daily_plan",
      "xhs_precheck_batch",
      "xhs_comment_candidates",
    ],
    component: XhsChatCard,
  });
}

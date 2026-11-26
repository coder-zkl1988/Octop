const React = window.__OCTOP_REACT__;
const h = React.createElement;
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
    enterprise_paused: "企业管理员已暂停全部自动任务，恢复前不会执行养号、发布和回复。",
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
    member_quota_exceeded: "你本月的额度已用完，可以在能力与配额里向管理员申请。",
    enterprise_backend_unavailable: "暂时连不上企业后台，请稍后重试。",
    enterprise_request_rejected: "企业后台拒绝了这次请求，请联系管理员。",
    enterprise_response_invalid: "企业后台返回的数据不完整，请稍后重试。",
    authorization_not_active: "所选授权已撤回、过期或缺少授权书。",
    authorization_scope_exceeded: "素材绑定的账号超出了授权范围。",
    authorization_withdrawn: "素材关联的授权已撤回，不能再使用。",
    experience_must_stay_with_its_owner: "真实个人经历不能放进公共素材库，请绑定到授权人的账号。",
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
        new CustomEvent("octop:xhs-error", { detail: new Error("源账号没有可迁移设备") }),
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
                    disabled: readOnly || !accounts.some((item) => item.device_id),
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
        avatar_prompt: avatarPrompt,
        cover_prompt: coverPrompt,
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
          h("h3", { style: { marginTop: 18 } }, "手机准备与身份"),
          h(
            "div",
            { className: "xhs-actions" },
            h(
              Button,
              {
                onClick: () =>
                  act(account.authorized_at ? "takeover.identity.read" : "account.identity", {
                    account_id: account.id,
                    account_version: account.version,
                    confirmed: true,
                  }),
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
                `接管待确认身份：${account.pending_identity.account_id || "未读到"}`,
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

function DraftPanel({ snapshot, host, readOnly, refresh, modelRef }) {
  const drafts = rows(snapshot.data && snapshot.data.drafts);
  const projects = rows(snapshot.data && snapshot.data.projects);
  const accounts = rows(snapshot.data && snapshot.data.accounts);
  const [draft, setDraft] = useState(null);
  const [projectId, setProjectId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [images, setImages] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [theme, setTheme] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageModels, setImageModels] = useState([]);
  const [imageModel, setImageModel] = useState("");
  const [ratio, setRatio] = useState("3:4");
  const [reading, setReading] = useState(false);
  useEffect(() => {
    if (!draft || readOnly) return;
    let active = true;
    host
      .request("/plugin-apps/xhs-ops/image-models")
      .then((value) => {
        if (active) setImageModels(rows(value));
      })
      .catch(() => {
        if (active) setImageModels([]);
      });
    return () => {
      active = false;
    };
  }, [Boolean(draft), readOnly]);
  const open = (d) => {
    setDraft({ ...d });
    setProjectId(d.project_id || "");
    setAccountId(d.account_id || "");
    setTitle(d.title || "");
    setContent(d.content || "");
    setHashtags((d.hashtags || []).join(" "));
    setImages(Array.isArray(d.images) ? d.images : []);
  };
  const save = async (close = true) => {
    const id = draft.id || crypto.randomUUID();
    const result = await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({
        command: "draft.save",
        payload: {
          id,
          version: draft && draft.version,
          project_id: projectId,
          account_id: accountId,
          title,
          content,
          hashtags: hashtags.split(/[\s,，#]+/).filter(Boolean),
          images,
        },
      }),
    });
    const saved = rows(result.data?.drafts).find((item) => item.id === id);
    if (!saved) throw new Error("草稿保存结果不完整，请刷新后检查。");
    if (close) setDraft(null);
    else open(saved);
    await refresh();
    return saved;
  };
  const generate = async () => {
    if (!projectId) return;
    setGenerating(true);
    try {
      const id = draft.id || crypto.randomUUID();
      const result = await host.request("/plugin-apps/xhs-ops/commands", {
        method: "POST",
        body: JSON.stringify({
          command: "content.generate",
          payload: {
            id,
            ...(draft.version ? { version: draft.version } : {}),
            project_id: projectId,
            account_id: accountId,
            theme: theme.trim() || title.trim(),
            ...(modelRef ? { model_ref: modelRef } : {}),
          },
        }),
      });
      const generated = rows(result.data?.drafts).find(
        (item) => item.id === id,
      );
      if (!generated) throw new Error("文案生成结果不完整，请刷新后检查。");
      open({ ...generated, images });
      await refresh();
    } finally {
      setGenerating(false);
    }
  };
  const generateImage = async () => {
    const saved = await save(false);
    const result = await host.request("/plugin-apps/xhs-ops/commands", {
      method: "POST",
      body: JSON.stringify({
        command: "image.generate",
        payload: {
          draft_id: saved.id,
          version: saved.version,
          prompt: imagePrompt,
          aspect_ratio: ratio,
          ...(imageModel ? { model_ref: imageModel } : {}),
        },
      }),
    });
    const generated = rows(result.data?.drafts).find(
      (item) => item.id === saved.id,
    );
    if (!generated) throw new Error("图片生成结果不完整，请刷新后检查。");
    open(generated);
    await refresh();
  };
  const readFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    setReading(true);
    try {
      if (images.length + files.length > 9)
        throw new Error("每篇最多上传 9 张图片。");
      const added = (await readImageFiles(files)).map((image) => ({
        ...image,
        origin: "upload",
      }));
      setImages((current) => [...current, ...added]);
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent("octop:xhs-error", { detail: error }),
      );
    } finally {
      setReading(false);
    }
  };
  const moveImage = (index, direction) =>
    setImages((current) => {
      const next = [...current];
      [next[index], next[index + direction]] = [
        next[index + direction],
        next[index],
      ];
      return next;
    });
  return h(
    "div",
    { className: "xhs-grid" },
    h(
      "div",
      { className: "xhs-card" },
      h("h3", null, "内容草稿"),
      drafts.length
        ? drafts.map((d) =>
            h(
              "div",
              { className: "xhs-row", key: d.id },
              h(
                "div",
                null,
                h("strong", null, text(d.title, "未命名草稿")),
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      gap: 5,
                      flexWrap: "wrap",
                      marginTop: 4,
                    },
                  },
                  srcPill(d.source),
                  pill(REVIEW_LABELS[d.review_status || "pending_review"]),
                  checkPills(d.checks),
                ),
              ),
              h(Button, { onClick: () => open(d), disabled: readOnly }, "编辑"),
            ),
          )
        : h("div", { className: "xhs-empty" }, "还没有草稿"),
      !readOnly &&
        h(
          "div",
          { className: "xhs-actions" },
          h(Button, { primary: true, onClick: () => open({}) }, "新建草稿"),
        ),
    ),
    draft &&
      h(
        "div",
        { className: "xhs-card" },
        h("h3", null, "编辑内容"),
        h(
          "label",
          { className: "xhs-field" },
          h("div", { className: "xhs-label" }, "项目"),
          h(
            "select",
            {
              className: "xhs-select",
              value: projectId,
              onChange: (e) => setProjectId(e.target.value),
              disabled: readOnly,
            },
            h("option", { value: "" }, "选择项目"),
            projects.map((p) =>
              h("option", { key: p.id, value: p.id }, p.name),
            ),
          ),
        ),
        h(
          "label",
          { className: "xhs-field" },
          h("div", { className: "xhs-label" }, "账号（可选）"),
          h(
            "select",
            {
              className: "xhs-select",
              value: accountId,
              onChange: (e) => setAccountId(e.target.value),
              disabled: readOnly,
            },
            h("option", { value: "" }, "暂不指定"),
            accounts
              .filter((a) => !projectId || a.project_id === projectId)
              .map((a) => h("option", { key: a.id, value: a.id }, a.name)),
          ),
        ),
        h(Field, {
          label: "内容主题与文案要求",
          value: theme,
          onChange: setTheme,
          multiline: true,
          disabled: readOnly,
        }),
        h(Field, {
          label: `标题（${title.length}/20）`,
          value: title,
          onChange: setTitle,
          disabled: readOnly,
        }),
        h(Field, {
          label: `正文（${content.length}/1800）`,
          value: content,
          onChange: setContent,
          multiline: true,
          disabled: readOnly,
        }),
        h(Field, {
          label: "话题标签",
          value: hashtags,
          onChange: setHashtags,
          placeholder: "例如 生活方式 旅行",
          disabled: readOnly,
        }),
        h(
          "label",
          { className: "xhs-field" },
          h("div", { className: "xhs-label" }, "上传图片"),
          h("input", {
            className: "xhs-input",
            type: "file",
            accept: "image/png,image/jpeg,image/webp",
            multiple: true,
            onChange: readFiles,
            disabled: readOnly || reading || images.length >= 9,
          }),
          h(
            "div",
            null,
            h(
              "div",
              { className: "xhs-meta" },
              `${images.length}/9 张，按当前顺序发布`,
            ),
            images.map((image, index) =>
              h(
                "div",
                { className: "xhs-row", key: `${index}-${image.filename}` },
                h(PrivateImage, {
                  host,
                  image,
                  className: "xhs-preview",
                  alt: image.display_name || image.filename,
                }),
                h("span", null, image.display_name || image.filename),
                h(
                  Button,
                  {
                    onClick: () => moveImage(index, -1),
                    disabled: readOnly || index === 0,
                  },
                  `上移第${index + 1}张`,
                ),
                h(
                  Button,
                  {
                    onClick: () => moveImage(index, 1),
                    disabled: readOnly || index === images.length - 1,
                  },
                  `下移第${index + 1}张`,
                ),
                h(
                  Button,
                  {
                    onClick: () =>
                      setImages((current) =>
                        current.filter((_, at) => at !== index),
                      ),
                    disabled: readOnly,
                  },
                  `移除第${index + 1}张`,
                ),
              ),
            ),
          ),
        ),
        h(Field, {
          label: "生图描述",
          value: imagePrompt,
          onChange: setImagePrompt,
          multiline: true,
          disabled: readOnly,
        }),
        h(
          "label",
          { className: "xhs-field" },
          "生图模型",
          h(
            "select",
            {
              className: "xhs-select",
              value: imageModel,
              onChange: (e) => setImageModel(e.target.value),
              disabled: readOnly,
            },
            h("option", { value: "" }, "默认个人生图模型"),
            imageModels.map((item) =>
              h(
                "option",
                { key: item.id, value: item.id },
                `${item.source === "enterprise" ? "企业模型" : "个人模型"} · ${
                  item.name
                }`,
              ),
            ),
          ),
        ),
        h(
          "label",
          { className: "xhs-field" },
          "图片比例",
          h(
            "select",
            {
              className: "xhs-select",
              value: ratio,
              onChange: (e) => setRatio(e.target.value),
              disabled: readOnly,
            },
            ["3:4", "1:1", "4:3", "16:9", "9:16"].map((value) =>
              h("option", { key: value, value }, value),
            ),
          ),
        ),
        !imageModels.length &&
          h(
            "p",
            { className: "xhs-meta" },
            "当前没有获授权的生图模型，请检查企业或个人媒体模型配置。",
          ),
        h(
          Button,
          {
            onClick: generateImage,
            disabled:
              readOnly ||
              reading ||
              !projectId ||
              !title.trim() ||
              !content.trim() ||
              !imagePrompt.trim() ||
              !imageModels.length ||
              images.length >= 9,
          },
          "生成配图并加入草稿",
        ),
        h(
          "article",
          { className: "xhs-card", "aria-label": "图文预览" },
          h("h3", null, "图文预览"),
          images.map((image, index) =>
            h(PrivateImage, {
              host,
              image,
              key: `${index}-${image.filename}`,
              alt: `预览第${index + 1}张`,
              style: { width: "100%", maxWidth: 360, borderRadius: 8 },
            }),
          ),
          h("h3", null, title || "标题预览"),
          h(
            "p",
            { style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } },
            content || "正文预览",
          ),
          h(
            "p",
            { className: "xhs-meta" },
            hashtags
              .split(/[\s,，#]+/)
              .filter(Boolean)
              .map((tag) => `#${tag}`)
              .join(" "),
          ),
        ),
        h(
          "div",
          { className: "xhs-actions" },
          h(
            Button,
            {
              primary: true,
              onClick: () => save(),
              disabled:
                readOnly ||
                reading ||
                !projectId ||
                !title.trim() ||
                title.length > 20 ||
                !content.trim() ||
                content.length > 1800,
            },
            "保存草稿",
          ),
          h(
            Button,
            {
              onClick: generate,
              disabled:
                generating ||
                reading ||
                readOnly ||
                !projectId ||
                !(theme.trim() || title.trim()),
            },
            generating ? "生成中…" : "生成内容",
          ),
          h(Button, { onClick: () => setDraft(null) }, "取消"),
        ),
      ),
    draft &&
      draft.id &&
      h(DraftMeta, { snapshot, host, readOnly, refresh, draftId: draft.id }),
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
function ReportPanel({ snapshot, host, readOnly, refresh }) {
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
    if (!window.confirm("导入只写入本地历史记录；活动运行会转为结果不明，设备需要重新绑定，不会派发手机任务。确认继续？")) return;
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
        `本地审计 outbox：${rows(snapshot.data?.audit_outbox).length} 条待同步；dry-run 不派发手机任务、不修改平台。`,
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
                disabled: readOnly || !hasFeature(snapshot.license, "xhs.analytics"),
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
      h("h3", null, "首页与异常"),
      h(
        "p",
        null,
        "首页回执浏览 " +
          report.home.browsed +
          " 篇 · 回执互动 " +
          report.home.interactions +
          " · 有效观察 " +
          report.home.observations,
      ),
      rows(report.anomalies).map((item) =>
        h(
          "p",
          { key: item.type },
          statusLabel(item.type) + " · " + item.count + " 次",
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
                    const reference = window.prompt("请确认手机任务已停止，并记录核对依据") || "";
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
                disabled: readOnly || !account?.authorized_at || !account?.device_id,
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
                  `待确认小红薯号：${account.pending_identity.account_id || "未读到"}`,
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
        h(
          "div",
          { className: "xhs-row", key: d.id },
          h(
            "div",
            null,
            h("strong", null, text(d.summary)),
            h(Badge, { value: d.status }),
          ),
          h(
            Button,
            {
              onClick: () =>
                cmd("diagnosis.confirm", { id: d.id, confirmed: true }),
              disabled: readOnly || d.status === "confirmed",
            },
            "确认方案",
          ),
          (() => {
            const account = accounts.find((item) => item.id === d.account_id);
            return account?.plan_confirmed
              ? h(
                  Button,
                  {
                    onClick: async () => {
                      if (!window.confirm("撤销接管方案并作废尚未开始的变更单？")) return;
                      await cmd("takeover.plan.revert", {
                        account_id: account.id,
                        account_version: account.version,
                        confirmed: true,
                      });
                    },
                    disabled: readOnly,
                  },
                  "撤销方案",
                )
              : null;
          })(),
          h(
            Button,
            {
              onClick: () =>
                cmd("diagnosis.decisions", {
                  id: d.id,
                  decisions: {
                    note: window.prompt("请输入本次诊断采纳/保留说明") || "",
                  },
                  confirmed: true,
                }),
              disabled: readOnly || ["confirmed", "superseded"].includes(d.status),
            },
            "记录采纳意见",
          ),
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
            )
              .length !== 1,
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
                      evidence_url: o.result?.evidence_url || o.evidence_url || "",
                      reference: window.prompt("请输入手机回读核验记录") || "",
                      confirmed: true,
                    }),
                  disabled: readOnly,
                },
                "补跑核验",
              ),
            ["awaiting_verification", "observing", "rollback_observing"].includes(o.status) &&
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
            ["awaiting_verification", "observing", "rollback_observing"].includes(o.status) &&
              Object.keys(o.fields || {}).some((field) => ["avatar", "cover"].includes(field)) &&
              h(
                Button,
                {
                  onClick: async () => {
                    const field = Object.keys(o.fields || {}).find((key) =>
                      ["avatar", "cover"].includes(key),
                    );
                    if (!field) return;
                    const matched = window.confirm(`${field === "avatar" ? "头像" : "背景图"}与手机回读一致吗？`);
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

// ---------------------------------------------------------------------------
// Workbench (round 4): 总览, 执行队列, 异常与告警, 冷启动方案, 内容计划, 素材库,
// 内容母版, 业务资料, 排期日历, 笔记维护, 自动化与风控, 授权台账, 能力与配额.
// Every action goes through the plugin command endpoint; the backend owns the rules.
// ---------------------------------------------------------------------------

// 小红薯 wordmark (112×56), inlined so the page needs no extra asset request.
const XHS_LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHAAAAA4CAYAAAAl63xKAAAiT0lEQVR42r2debxlRXXvv6tq73PuvT13A9KMtqKgCJjQqAgEo+ThLD5oSCBqIAlPNLxoQviYYGLQj74M6jOfp8E45hlilA5OEYMT0kEE0gwCEmQUuqHpebp9h3P2rlrvj9pD1T6nUTO8/oPue++5e6iqtdZv/dZvLYT/wB9FBV5mhXVl873jXrOs3LfvRCndixFO8KpHK3Kwql+KSE+9goCIoIAggIIqIgIqqPrwGQRVBZH2pqKgUH0g/Lz+EdWlABETvggfDv9VEBSMQVWR8ACohKcg+n2obhsuVt1Hw/MaaT6LNH+1j+fcUIzsFiObjZcHEO5W4bYM7pAN39/V3ur0DNY5aW/5c/+Rf//GnWuEtQ5AX3rRIrY+9kpfuLO9d6cYr4eZegFVcerxCir1LXXM3+FnWi9y+t30/vo0b9GsZnQwkitKdOvq+Eh90eqTEm1QdYA0vld1GqT6XH2H+rkEsCJYERBTHQCH9/qEiNxsbHYtk0uulwe+Nh1+f42Ftf7fs5E/9wbqmjVW1lYb9/q3H8LDj1ziZmbebFWOQAHvGHiPoq56Qal2RiS2JO08gXaOSHSiE/OovqgtL2yACX+rjzYBVIXRNZHWzEz1dWzlzb8j/9Dddzq/Uv1QtNpEUTT8R42g1QdtT0zYUCN47zcY4XMwcZVs/M6meiNro/hP30BVFUSMgNPv3bXU/+H7f89v3X5JVrgD8I6BqgsHU03wkOM3q9kC1Y7rSq0uMbP6c7Ul1G64cZfd7Q1LrarjX1k08sTS2SENG1K7y9q6pPnXyIFr31XDzzV+5trEwYdT7EHoG2MRi1O33Yq5CiMflsfX7f55rfFn2kB9z3uMXHmlxwrFRX94trnjvj8z23cd5cqCEkoFa6oj115YGkuq30E6txuJX82+6ejei7SLHfxsY9zSeEuNYmu8gel9RdqYqK0NjbjzxDvUz18bbL2VCmKk9RvauVJ1WJKbAx5UVF1mbGZNhsc/7IV35RtuujZc6z1GuNL/hzdQr7nGyrnnOlWd8Oe/44Pmzvvfzu69DKyUClYUEdHIYEbdlnSsI8IgzYltAAUCOua5R8xM61PRsVjpxEQdf53IUtivpUp7WOqPGFN9Xlv3W7vb2GwilyzxPeLTEw6bour6xmYYi8d/zBh7mTy+bv5ncanys2ze7OzOI/oXXPEFc/t9Jw+KgcNaEVWj0ctJc461i3g6a1qd3eRttXGL7aJLd+cbq6ujU3Pu48DUuE8atIt2g25qwc2B6X42PjS0ix4/k0S/ryLBA8SAaFwUFmliqNbIVdQLaM/0rMffMuhN/OrUo9/Z8NM20fxUy3tkw3H9NZffYG754cmDYlCItVa8N80K1SFB4kfV6MSl7lDjk6saLR7pKa2uocnrV4ujvoo22ljzOCAk2r1mZAmR+1SlWfT2pMko0IpjtWqLUuuDkCyBVj/2kZVGcRxFfTi4AfKIUcQO3LAwnpP7w8ENg6NfdZyw1oW4+HNYYLN5O6aP9b/9rhvMun89aL5nSoPJ4rg2Gsuk9WoxnK+PW40cdIxpRie/PsVNztgc9y5SbHM0iRO4DpKtN0+ihU08cg1cjFRpx5gY2FktVW1z2HHuvmO1cU4rEqPo9j4qgniPQtk3NvM221ouW/zy/t3/dN/+LFFGAYsauVK8qh5evvGSf8m+f8czB7ktBTKS0FM/EBGwkBTVkSbhccxLEKam8CdcwyfIVIjASQ1cIjerzcKnqYY0iXrkWutDUsffbmYqjFpjfGxVG8CUeA+R/eynoKZCzzq66g04qmNmeMuyLzYrjTxWHLzil6Zu/+rGccBGxqQKgmpevun3b8q+c8tJA9FSkKzZLNIkeTRNliTZTV9U2oVuECUJW9JFm2nkkgRXNK5b44Rf6Fyx3Ys2MEYHr2Z+pAEbMbYJxpt80bo/KgQqEjaHNFaPIFrvxyNcotxTJcpotOybPCt7dn12zORpXH99Ub2yjo+B5641Yo0f/sGffyS76Y6T5rQsRSTTOL/pLo+0/kiS+Fed7sbny7jDR518aJPv08YkbTMxxqUZsQVE94ihgzQpQrS40rJsddbX+P0oVErExmgT70L+Sr1xGm9MHFx9+3vSjZU64palAWaRLxKTzWtRZoU/afjA/EdE8LDGjAUxes01Vtae64ovfuOs3vdue+tgero0WZapanpS2hV+Wgg7Ci58WO/MgrVgDZpZMJaWkNL0gDSbqwkMalJmqWF9CjLUh8UTjR9bR55Pm3jacUgabWZsIPU3vHZ/3Oy2NtYlzaar863lJ2Cu/WWtYqBKGu8Fkw3LYdkr/Vvnj33VWV1QIx3Xuah44yX3yL+sP7yc6Kmomvi0JotbJbNSEcP1w8uY3KtmPGRYwuxsi9xFwBpk4QJ8hRpFOuC7jpFjGTGF+QH0euHuxoDzwQvZLIpbNb2mICah6TQmMCPUKsaEw1ZZKWKgLKD0kAV+ExcsT/q9cGjqIGIMMhii9doIUJRIr4dak3qr0ncAmu+kL4oiPkNE82xjfvTzjuc7n5iuXWnWuE5wxRUfuiy/56Ej5nNTimrWdeOth4hijY+TA23jS8xZisD8EDlmFeYtZ4eF8YpmFv/gT/CfvgYxNqKi0mRcO+AECIs3NUH2ifcjzzocLcoQw3o5xR9/BP3295HFC4N78x5feQwVN0rLjcQuwvX27K04UwOzM8ipJ5Ff9b42j/Ued9EfonfcCxMTqHOINejcDOaKS7EXnAWDIUz00Icep/i1dyBlUd1bkDyDhVMtFhDCQUl5OgyYUn054fSI8pEHL8vhjyvKzYm+5z2GK69UfvKTZxTnvvN+Ht242PV7IhrXDnTUTTUMfHpzkbQmowQrY+du7IXnYP/6vcl58I9tpHjR2SnQayoZnfywNl1rw/UufTPZB/8o2Vq/ay/FS86B7Tsgz8IGTk6Acy2MjwGVKjSHR6AsYVBgDz4Q8+tvgH4vvMrcHHL8MZjXn5F6l3/6Lv7eB4J1qYIRZDBEznk18txntkfPOdxfXw2z8+F7eQ73/Bj9+g3Q60X5sEkIjVC+Au9VM0XVmr35IUufx/pvbAEk48YbjUDp/urq38m37Fo6n9lgfTFrMpIkx5BcEGkBfvAYMhq3BPxwiC0dOiyCkeU57NlX0U0mQO3EVyr4eBOrk+8cLFmEvXBNcF1FGTZjoo//1DXwkw3wjBWwcw/Ze9+JOedMGBYhvoiMBGsRAe9Qm1H+5SfwH/+/yEXnYP7oktHgPiwSLCKvewXmda8YjweKooFSiGAvfUvqrZ/YTPHt70PpwsY3LtREqU7wEqIqDlxf7NJy2/Tv5PBu5XSbybp1paouKk497yKdnVXyzDRgRVIGP6GQVNBuOaCxVx3lRLVyV5kNyWoFaNSYUSYmZnLooDdjYfcezJpXwbHPgaIMLtkIumcaf/VXYNFUxXAAxz8XjjxsPAIeE1bl8EOAsn2uTibYxLAkfdkPkDMmWkIZvZ41FY4sR8mKhmbVOB823pWqKhdte+nr/1x+8LXpDMBd/pevzLfsXDkvOAHb8Jqq6H544LbEoGhcf0j4wBbICyDWjKRBIm1inELsUSIAApGseY79rV9t3bnziO3hrv0m/sFHkRVL29g2Nx/c6HCIWttmlCJJVUGcR3o5DAao6aN3/Qi94RZ0MES9Q4YleshB2BedULljCfHuth/iN29Dsgz1ilgLwyHyi89HDlsZPIQxyPwA/y/rg4v2CsuXoD+4KzzfRN4xmBRQRfStKVRdn2zlsq17XgmszbCC/9H9a+zsrGKNNlSxaLOJaJ2ga1LPS4hnU22e861loo38IFBVJvoVSYCf1JXvOi7VLtqY5riLFdg7g/nlFyOnnQhliRoJVjk/wH1mLTLRD9ZXG20vDwtoQ/pSHxSlrX40hLcxAb1KD3/PAxSvuhCOWgUvOAq270LOOAX7ohMShsdddyP6wx9B3kedw/Qy/O59ZJdfjBxxaPAQ1sLsfPAO8wN0dh5/533I7mlYtgi8D2un+6HmNAGRivfq5t0aYG2mpV9arH79KepKwRirHWGIRO4tkackzJGGmw+GsGAifN9VmzcsKv+uEeLTFBDVwdq78PdEXsW+ClSUJVrni96T/dZ5IR3wlevJDO7L30JvuRNZvgQG88E7OI/u2RcstFokpFOVrFkW7/GlQ/dMQ27Be8wLjyX/zufQRQuaAr53LhwGAOfI3vuOsSIRDwGV5lm4/vKl5Fd/uMnI/Ne/h7vwDyIpR7QuDWMUeaPGjar16kWdnqInvGFpVl76p6vN7pmVg5r66PpMbXdM6PKO1WeMQadnyd7/+5jX/XJYcKeYfs7wY1fjP/759qWTCnZliVbQQYEceSi9v/8wOjURFtxamJlj+GvvgE1bYOAxq49FXnV6ADI2FEXEe+xLXojc+PlgcaqYfp/hZX9G+bvvRz7+D+ievciJx9H75AfCoQDIMti5m+EFvwe79oTD9MRmZMki2D0NJzw3bN5ggBiLF0Gy6D2cA+fwlfvVatPU+5AfV/XDZkOLElGP5Dn2lF/ELV0MO/ci/XxMTXKU+arx8xDVHFk5v2vL6kzve+Ql2dxAhiLOKHa0KDta4hGpqg51buUcOtlDXn0arDo8PY3Ll4bFzrKUyU+AjwkvNtmH444ePdGHHgwbn4JiiPmNcwK0Hw4Ra0M2q4qsOhxb3RtAp2fQrdtg3wx69/2waw+ybMko0VI69J4fw45d0MuRPA8QH9Bh2VpDniFbt1Oc9z/RJzeTXf4/ML91HloUiHrK838Xd+td2MsuJnvbryNFAcbiLngn/l/vgbPOIPuLd0FR58WDjt6nw4vGRWDVBplWG+utWEvJSzJ27XohzkUllKTAF9dcOgIUbXQtOI8sXYhOTCBekbIMp7CXoxs2tWRvxRlKzItW7gtr0el96I7dYaFdSA3IMmTpYpidQ456Juas/xZgdYQSw0aUVX3NIf0Jyo9ejf7bI8jBK8ApTE2GfLCLGoXws/lBxbxUTq6yIrwi3ofrT/Sxbzsf3TsLq18QDmYVo835r8ec+Utw/DFoEYCKqsO++SzkZS9Gn30kUlknziGZrVBoHfMZRe2kyDw5eAre8sKMufnnqPpIhSSj0qsGykqLGEUaAhrnYfGSYG2GACzEhpfbsauirxQdV3eNi7WzAxgOQ8z0FUo0BjlgKb4cwKEHwoqlAe1VXqAtDwpqgovTmRn0mq8jC6ZgWAEd71HnE3lgw1+rDwvrTQTxLbptJ8YafLXxZvEiZM1r29S0Qq9qBPPaV4xT1WDOPD2V1mQVwTUo0H2zwYuojiW90mJ0i2YUlYqLfE6mzh/sVFFpSZRu5TouzI4ovQINgBy4FJmaCIABAvviHGzZgeQWBsMmVMdlM4m1mXNzMD0DK4mEtMCSRZD34b6HcNd+k+y/nxmQp2pwgbXQ1nvIctyXv43/t0dg2SJ0WFY0XVusHaVVpXUuSiCfF0yht99D8XsfQJ/3bLBVTbGsUOVgiHnxC5FfPDbEwqIEa3A33Q4PPApTE+hgSKlgDlyObt+NZAExa1GgV38toNAlCxAXeSaR/WlRkrJLiUe9HJz5+eGyCp0JY3RJIm1OmKil4410LsQpwklvgM3OPfhtFaU1P0gqCd0SkViDzg/Q3XuJ1RkKcMCyYPGlUrz1Ctz//kyIqSuWkH/qfwUXW6PDQYH7xBegF/hWiXKVpP7aVRRopOnRoN5mZh698z5kKtBk6jQcTBGYmUWf9+y6bhfqgtbC1h34Bx6FRZNhrXbupfjUNdjzXgsnHx+8lVfkLW9E9uxFH3sC7feqZ43Vce2J6oZKUcShKGZZJt7lKoytJsQpRYw8JZZRVKSuHL6yKbVoTedt2wm79oYX85H1alRaqXQvIia4z+07R9TYcsDysKaZQQofQMf0LszFb0KWLUGHRfh8L0O/dRN+/b2YJQsqoZTpCixGWEEdJ/vOLDhP9jfvwxz9rARUJf8uywZhq/fY816DOe81Ta3OA3r6izBrXp24SHf3j9Gde8LhrkFdV9RFKv/oUvugedbkZiIVfknlsegYJk0ixXJNaB95aComAvTJLTAzF6gtSZ+kLqQ2xl+VgvyWHZhEFw1y0PIQK7wPLneij0w8g+x3f6O9ng15YvnJLyK9LFBh3kVXkk7heYSkS2grduzGD+coPnAV9pTVeHWIsaF6by0MBpgTj8O86ATUuXAPa3DfuxV/30OYyT5+2TLkzFMxa16NL8rKSxj0pvWUr7kYLYbIActDvmq6Xi86xJFEQDtMVqYihUBey9ADIIg2URqyKQT7pPJSIdBejqw6bJTze3wTDApkqanYHRnfy9BUB4Cntoy6/AOWQ78X3I+1ISU46wzk+RUXKiDW4m64Ff+17yILJtC9MzDRCwsWUXyjEaWVFoZCcJBJ2Lecjaxaid++G3//g9DP8a5S0WUWpmdh1RGR9rO66KYt6IOP4PMce+bLYKKPVmQGvRxm59F7foy9/CL08afwX/0u9LK6QNo5ZJJsona0OQpFZsTsMuoPKpvSoyTC5zTeRUBA2rqcLFuErDq8KYTWQMY/+ngq0tX9UshtEfXxTa17qixdDloBixbCzExVzbcJFyqVmsysOpTe1z6ONwbJLMUf/xX+Rw9iFk5WYVDHsFPaUmom8JgcspLsqivDfTryhREX6lx45yqU2AvegLngDUn1IpRkQ98IvQx5x0VkgNv4FP6bNwUQaCTZwJGUIkkaVa2KeNVdmcBmixxUBg2fEGtIVBreL/W/0vKcgwJWHYasPLBJO6RiH/ShxwK096O0vUSrIlXeRWbRxza1Cuj6bgcsR5YvRfftQ6dnMKtfgLz85JaNIbAxsupwWHU4GeA3b0c3bUXyQDJ3mY6knayO75U8QytAopHmJJZg6DCUicSERpXYK/nO70gvH1uxUEJMx5pQTqpbAlRH5Ix1fTsu7llEnMjmTI0+JJ7jUdVWgTWqpEt4w6DsD18PC+T5z4V+Hy2KABqyALP1kY3NC8TNJiMMRP1FnsMTm9G9+2BRBa9LB1MTsOpQ9JHHEPWYC9eERR4WTYVDRaAowvemJnH/52+RjZuQg1YE1/g0Mk+pRUrq0V5gXAYXXo457GCkLBGv6EQfli/Bnng85sUnhCQ8qhbUZLw8uQX3+a/ht+0IxDqxgAoQDzaHBRPoPQ/CzDzS77WCqUT22KY5kvZkaDASfSgT+CFwdqJgF0blfOPEPxKYCvPSExoEKrZK8jdsgo1Phg10PqDI/aifahcjWYZu3oY+/iRy3NGJctu84DnoN25EpvqYY58dTn+1QMkZy3Pczj2UX7gOs2RBABgiI8nD2DDcqOwM8uBjsHcvHHQA+qwjMMc8Gzl6FXLIwfjaq3iXykKN4HfsQo9YiRx5SCAkjAkpldPgDTY+iX/vxwLBMTEBCybb+EfKctVCqrZtwbcg1YB4fpg5Y281lCqxQq2bStToJ6lP1QE9w990B+bi8wNg8B5Rxd/1byGFWLooTTm6/Ut1pcOHF2TnHvTeB6oNDNdnMERvvB2ZnAAjlH/+N2Tv/h1k0cKkRwXnUGvxf/eVYMkrlgbXXAuUbDaGSpPws8yieQZFgSxcQH79Z2HRgvEnznnUGkxFbMfHwx5/DBx/TFoE7iBfv3QxxVv/BFmyMDBFRFIikyrx03Qu7JwIxuHVGW7N5sXeLlo81RNzyABVoxpj0KY3ru3OiZTXzsGCSdx1N2LrRZ8fBAu84dYQW6wN7sAatK4CSIfbq+Xm9VusvxfOf31AnT2D/+4P8OvvgqVLYG4O/fL1DL/ynVCtqOUYmUFLh4hBFk0iyxaj23aDusqlT6PTM2PkUYru3A3bd0GeoyKYbdtxf/sl7NvOh7n5kKJktu1ntBbZuw//91/FD4ZNetPqWCr128wcnLYae+pqvHPhXfMMViwP/KzznY6mcYXsuAfFoIL2RaRQ3TTRm7g9W/b4ut2DlSffbJBzxBUOyGTEUrQVwCaMRaDMZGYG97f/SPahKxor8t+9BZmahN1B2SXz08iBK1rmw4xRLHqFiT7u++sx8wM0zxFVyk9fg+YZMjuH+ZVTMaedhM7NRgyLCVXzXo5ueAr/D9fBsMS+5Y3osw4LZPRgiDx3VdJXoZXgKb/8YnRuvupNAP3ndbhPfxF76ZuQhQuC86oJ/1qKX5b4nXvww0H4ncqbGBG8EQyCzsxhhkXY8Fr8ZW3IB6WTb3fKRhq3pqUVISeSWcHfLI+v251VtOVavKzRug1axlQj6DBtdXLvSmTBFP5L34R3XgSHrQzF1Q1PIMuXkP3ppbDyoABaf+XUSmJgGwZefNSa5V2Q593/MH7dbdgzfwl3293od2/FTE4imSH/yBVwxKH77T90a79BedVnsa97JfmnPtDpbaJKutumFqYmsZf9dvIZ97yjGJx7CeVVn4eli9EnN5G/8zcrIwieR1YsI3v32/eLMBuVXEU1BqLCtdihYVqk0ZPXpHzb0SVJ6A6iMRWMijGshaphxS6U64d73VM9Yw8u1HvxmISQHBMGAkqqiOteDzY8hfvSNzFv+3X8Rz6DLJhEZ+eRU05CTjquBQo1qPCBE9QntsDsfIgHpWse2H/ks2EDP/clGAxgHuTXXhs2b34+SjMiADEoKD/wSURMsD6v6Px8cKGRxDGJTarocNhqTfMcHQww+QTu3R/C79yBOfkkuOxiKMtwaI2B3XspPvmFoEKI3F6N9cRYdH4ec+pqzK+c0m5ebGmSlMpH2CEaEqUp7vpcjBm68qneMLs+MDGcnskD66bdoad8xqBXDJ1zIvXUAGnZ0xFtRtTW4hUWLsB/7svoD+5CH3sSlixENu/A//ONZL/wfHQYFNQ0PXMeYwT/5W+HOFVvsXOwcAp/850UF16Orlsf0OawwP7mmpbfjFVjrgJT37oZ/dE9mGOfjznjtACC8izhniQejlDftb6WdoRXU5OYwaIg04gbccTgnUO37Qx5cIJxpbFUnZ1HZ+faInbdR+F81eNYI8s2TUBrfUwjHY84FPWZsVmp/jOy4wfTyulZButCF95w+NHCmLfnYheXqIpqVGNJ2nDHWKSHiR785An8Az8JBdKihIke/ls3wZ9cimRTbaJfu6prrsNdcx2yeFFAkHWO6Bz0e/gvXBeQ4GCAOeMU5NTV4fb9Xuq2sgrd/d2XUDcI6u/FC8MhqxLy/c2rSP7YavDC1GTTTSQIsmtPeO5KKCyArFiG/Yt3/WwDIryvRFUh+fc/uBN1HhPzyTGBplHreYVyvKrmYkzhy9256kfDbqzzWaiVr7Gybe3mYuVLPpph3l26ogzLMtpWlcosojCsBNlBnlXNHMCCSfwP76f89Frs+a8LLlI9uuGpsHkf+/vQZ1CH7riLR4HFCwOT4zxy4gtg264g2atLOrX15xZ3853oN2/GLD0QeeHzgnUUZWVd7USMqhs2CfGNhLkio/z6e8KCew9Tk+h9D+M+9UXsm97YquSiJpo0PdK0582Y5hmYH+K+8i38Z/8x6G6cT0BKw3pJp28uPJ/LJMuGuI/K1vWb64bPtKnqWWcsKmb23iNqDi/UqRGMdmZLaNRuGXpiNEW6tZvSGpgoqlW5qWZLtuxA9+5DliyK2gN1TAU6kkvmFpmcrGbBkMZAkUBwiwncQr8XrFTHDOWJ1AVxVb/i0IJL2z0dKK7IRasrkaOeiUyEZ9B0gkjU85hyYGKiGLd3Gn10Q6imZKYFLXGbG6NsmKr3uVjx6Ma8cMez646muSV6/LCj8we96Ky+sV8e+LJUrVMK7YxtkdH6WdOfqDVh0L4UBBFS/d08Cwl63a/QGUJQP3+7n5UkcUStHYGAzLTlMF8PTZCu/jECBDpWMQ0SaWM6/nZuSIBu6fs1FGFnqIV0+Ds1VSmsrrGOE00jrehLmthZ9m2WDcS9ceKpf/1K3G7dKRVWm/iM1Vf1pffWOTcoRUwkJ5MOgpLGIhplY7cCrlG3kowZ6qOR0q3LuicqnjF9DfHi+rjNOy7ExD3pkvQhjnQ41qvvtdtv3W6WyNjBT2P6p6rnMCmSTCZipBXJuO07YAXFq5aTtpcN3PDjE9tuv6TbK9+t9Qq8Rzjqtrzcu/OmTMxJc74sDWTjF68SC9WtxppC6bFFye6YLNL6jNIOvWtMWav8a2yHg3ZFNm2PXywH6cxd024fdTLHZXTmTHe+Ql0/HRkzM6JOiiTV2jYCxedDGZUWihg8Wk6aPCt9uT7buvM0uKCAK/ffYl3/QB6+flBk/bNL9Y9Nis08WjYhymvL1WkkYdd4WF3KAySjNzSWaTS6+ubvtslD0xZq1dFRHnGrpHZnzEjUFp16T03Ud+kO6eiMw0jQPH6a1Gg36/hvpD382g7Ii6SCUg1k8Gg5KSYrfflYkfmzhYcHcOWIAsSM2tSVXlljpzbdtNGLvtar3zopWdjEmMesJfEj2YU2LeJJ37q2TaCNvCHqRNUxU5a0O/oxOWk6qitTHTsOJHGPGgMNjaZhaOKH9tuO3Z3bqKPbnjgHTV9EInc6Mtay+iWPlpPYzKlu9TJ47dSm2zcG14n/mQb91H3Y/S3r7yvFn+HRRyYly1R9ocnQAU0ZtwSQaCJDlKhW1bLrfjR2RAekGVAgnVEFWvVixMLg7i7HffwjXbgkI7K0PpDV4ZI47CabI2M3S5Dxlle/f2RmqS5VxrWKFJM2z7zoIw53Rn/L3fc93bQms/9euWoTt95x78C6l3v1t0zaXi7gVGoObWQKVtQ8oonf0e74He2W6OPGE0knAEYzY7o98toMPJCqqiHjM/Y4iHVcZizt0BH2dPygn8R9J6O7xtQZjYybiJCkDhpe0k2YLPfO3zIw5cv7W++496eN2vrpw+6qC+iRR074wcEfNCpvV++YV1+KYCXUlyAa0Ji6Fhlt2JAxE1pTIc7+WR/pjOkYO8iu24ATyUo61+iOQUsGE0krZtZu+jT2nUaHDI1d4holSw0j1PUwmREJw+4mt14mjz/+Hx92Fz2iqf1vceDqs0X5M2uzo0p1FN6XINYIkSy13cA2gY7LXDE+1TTQyH7mQo4RBHfga+qikwaa/eHXFr43OyxBtS5dC2mmQ42Dm5rA6TQkyP6mHiuIy0SyXCwO97Cqvivfdvu13TV/uj+Gn22oqA/xeI3Nt91+rS2Kk7z378OzfdJkWV9EVNWpeqeoxqMnY8Qat1/XQ+vQTjfq0yC6tjIZSThHcEVoFpHOVMFut3HD4Wob/7R606T+GUMxjeOaj26ZKspGUkVpwIn6ap16YmTS2EzQ7V7L99nB8KR82+3XKmtsPQPjv2bkcmTWuuIXDsHklzj0zVbMEXjFizIIL+faZAuRjiZN0aSRUXQ/rrBKrKWTQ7adVF2XKsmExHTggiSTeZ/OpY8ztqbLK85X2+ltyanzYfiOSq2X92p7gJFQ2nL4Ddaaz1EWV8mOu/7rRy6PJvxr2qHnK166CC1fWVKercIpYsxhGaZhHkoU11hAdLa127w4Zini4QdJfiLtAKH9iU86KvDR5JrRljkhmUKl3aF13YmHNZ/Z+Q0rhsyYZvab8x6Pf0LU3JwZuRa/53rZ8cD//6Hnoxt5evq/HVhy3LKy3z9Rvb4YlRM8/mjxerAzstRY09PIkuoUwVfxRWKyuWL9FR9ShmiaX6097V6nJrilsYr6d3wzf0WaJD9qKRBBvU+vFdF3yUD1WrsTJarG2nBN58K1inIog+Fu0M0GHjDK3WrktmxicIdsuPc/9X878P8ANYy2lncPuXgAAAAASUVORK5CYII=";

const css2 = `
  .xhs-groups { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; align-items:center; }
  .xhs-group { display:inline-flex; align-items:center; gap:5px; }
  .xhs-group.active { background:#182230; border-color:#182230; color:#fff; }
  .xhs-stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-bottom:12px; }
  .xhs-stat-value { font-size:20px; font-weight:700; margin-top:4px; }
  .xhs-two { display:grid; grid-template-columns:minmax(0,3fr) minmax(0,2fr); gap:12px; align-items:start; }
  .xhs-two.even { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .xhs-stack { display:flex; flex-direction:column; gap:12px; min-width:0; }
  .xhs-pill.ok { color:${C.green}; } .xhs-pill.warn { color:${C.amber}; } .xhs-pill.bad { color:${C.red}; }
  .xhs-pill.lock { background:#f1f0fb; color:#5b4fc7; }
  .xhs-pill.src-ai { background:#eef4ff; color:#2f5bd7; } .xhs-pill.src-instruction { background:#fff4e5; color:${C.amber}; } .xhs-pill.src-material { background:#eaf7ee; color:${C.green}; }
  .xhs-tbl { width:100%; border-collapse:collapse; }
  .xhs-tbl th, .xhs-tbl td { text-align:left; padding:7px 8px; border-bottom:1px solid ${C.line}; font-size:12px; vertical-align:top; }
  .xhs-tbl th { color:${C.muted}; font-weight:500; }
  .xhs-tbl .xhs-btn { white-space:nowrap; }
  .xhs-link { border:0; background:none; padding:0; color:#2f5bd7; cursor:pointer; font:inherit; text-align:left; }
  .xhs-link:hover { text-decoration:underline; }
  .xhs-app textarea { font:inherit; }
  .xhs-steps { display:grid; gap:10px 8px; margin:4px 0 10px; }
  .xhs-step { display:flex; gap:7px; align-items:flex-start; }
  .xhs-step-n { width:20px; height:20px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex:none; background:${C.soft}; color:${C.muted}; }
  .xhs-step-n.done { background:#eaf7ee; color:${C.green}; } .xhs-step-n.cur { background:${C.red}; color:#fff; }
  .xhs-lane { position:relative; height:26px; border-radius:6px; background:${C.soft}; margin:2px 0 8px; overflow:hidden; }
  .xhs-blk { position:absolute; top:3px; bottom:3px; border-radius:4px; font-size:10px; line-height:20px; padding:0 5px; white-space:nowrap; overflow:hidden; box-sizing:border-box; }
  .xhs-blk.publish { background:#ffe3e7; color:#d81b3c; } .xhs-blk.nurture, .xhs-blk.browse { background:#eef4ff; color:#2f5bd7; } .xhs-blk.reply, .xhs-blk.inbox { background:#eaf7ee; color:${C.green}; } .xhs-blk.paused { background:repeating-linear-gradient(45deg,#ececec,#ececec 5px,#f7f7f7 5px,#f7f7f7 10px); color:${C.muted}; }
  .xhs-now { position:absolute; top:0; bottom:0; width:2px; background:#182230; }
  .xhs-axis { display:flex; justify-content:space-between; font-size:10px; color:${C.muted}; }
  .xhs-bar { height:6px; border-radius:3px; background:${C.soft}; overflow:hidden; margin-top:5px; }
  .xhs-bar > span { display:block; height:100%; background:${C.red}; }
  .xhs-bar.ent > span { background:#5b4fc7; }
  .xhs-level { border:1px solid ${C.line}; border-radius:10px; padding:12px; cursor:pointer; background:${C.surface}; text-align:left; color:${C.ink}; font:inherit; }
  .xhs-level.active { border-color:${C.red}; }
  .xhs-level:disabled { opacity:.5; cursor:not-allowed; }
  .xhs-check { display:flex; gap:6px; align-items:flex-start; margin:6px 0; }
  .xhs-cal td { min-width:96px; }
  .xhs-chip { display:block; border-radius:6px; padding:4px 6px; margin-bottom:4px; font-size:11px; background:${C.soft}; }
  .xhs-chip.marketing { background:#ffe3e7; } .xhs-chip.life { background:#eaf7ee; } .xhs-chip.knowledge { background:#eef4ff; }
  .xhs-banner { display:flex; gap:10px; align-items:center; flex-wrap:wrap; border-left:3px solid #5b4fc7; }
  .xhs-banner.paused { border-left-color:${C.red}; background:#fff0f2; }
  @media (max-width:900px) { .xhs-stats, .xhs-two, .xhs-two.even { grid-template-columns:1fr; } }
`;

async function send(host, command, payload) {
  return host.request("/plugin-apps/xhs-ops/commands", {
    method: "POST",
    body: JSON.stringify({ command, payload }),
  });
}
function pill(label, tone) {
  return h("span", { className: `xhs-pill${tone ? " " + tone : ""}` }, label);
}
function Lock({ children = "企业规则" }) {
  return h("span", { className: "xhs-pill lock" }, "🔒 ", children);
}
function Card({ title, right, hint, children, style }) {
  return h(
    "section",
    { className: "xhs-card", style },
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
        h("h3", { style: { margin: 0, flex: 1 }, title: hint }, title),
        right,
      ),
    children,
  );
}
function Stat({ label, value, sub }) {
  return h(
    "div",
    { className: "xhs-card" },
    h("div", { className: "xhs-meta" }, label),
    h("div", { className: "xhs-stat-value" }, value),
    sub && h("div", { className: "xhs-meta" }, sub),
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
function Select({ label, value, onChange, options, disabled }) {
  return h(
    "label",
    { className: "xhs-field" },
    label && h("div", { className: "xhs-label" }, label),
    h(
      "select",
      {
        className: "xhs-select",
        value: value ?? "",
        disabled,
        onChange: (e) => onChange(e.target.value),
      },
      options.map(([v, l]) => h("option", { key: v, value: v }, l)),
    ),
  );
}
function Check({ label, checked, onChange, disabled }) {
  return h(
    "label",
    { className: "xhs-check" },
    h("input", {
      type: "checkbox",
      checked: !!checked,
      disabled,
      onChange: (e) => onChange(e.target.checked),
    }),
    h("span", null, label),
  );
}
function NumberField({ label, value, onChange, disabled, hint }) {
  return h(
    "label",
    { className: "xhs-field" },
    h("div", { className: "xhs-label" }, label),
    h("input", {
      className: "xhs-input",
      type: "number",
      value: value ?? 0,
      disabled,
      onChange: (e) => onChange(Number(e.target.value)),
    }),
    hint && h("div", { className: "xhs-meta" }, hint),
  );
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
    return new Intl.DateTimeFormat("zh-CN", { timeZone: zone, ...opts }).format(
      new Date(value),
    );
  } catch {
    return String(value);
  }
}
function accountName(snapshot, id) {
  const account = rows(snapshot.data.accounts).find((a) => a.id === id);
  return account
    ? account.name || account.label || id
    : id
    ? "已删除的账号"
    : "暂不指定";
}
const SOURCE_LABELS = {
  ai: "AI 主动",
  instruction: "运营指令",
  manual: "手动创作",
  material: "素材",
};
const NATURE_LABELS = { marketing: "营销", life: "生活", knowledge: "知识" };
const LEVEL_LABELS = { manual: "手动", semi: "半自动", full: "全自动" };
const FREQ_LABELS = { off: "关闭", weekly: "每周一次", daily: "每天一次" };
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
function srcPill(source) {
  return pill(SOURCE_LABELS[source] || "手动创作", `src-${source || "manual"}`);
}
function checkPills(checks) {
  if (!checks) return pill("未检查");
  if (checks.stale) return pill("内容已改，需重新检查", "warn");
  const bad = rows(checks.items).filter((i) => i.level === "bad");
  const warn = rows(checks.items).filter((i) => i.level === "warn");
  return h(
    "span",
    { style: { display: "inline-flex", gap: 4, flexWrap: "wrap" } },
    !bad.length && !warn.length && pill("✓ 发布前检查通过", "ok"),
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
        "! " + i.label,
      ),
    ),
    checks.high_risk && pill("需合规复核", "lock"),
  );
}

// ---- 总览 ----
function OverviewPanel({ snapshot, host, readOnly, refresh, modelRef, go }) {
  const data = snapshot.data;
  const drafts = rows(data.drafts);
  const pending = drafts.filter(
    (d) => (d.review_status || "pending_review") === "pending_review",
  );
  const scheduled = drafts.filter((d) => d.review_status === "scheduled");
  const alerts = rows(data.alerts).filter((a) => a.level === "action");
  const [instruction, setInstruction] = useState("");
  const eff = data.effective_policy || {};
  const plan = data.last_plan;
  const health = rows(data.account_health);
  const zone = tz(snapshot);
  const suggestions = [
    "最近几个账号生活内容偏少，加一些咖啡和探店",
    "这个月效果好的选题，继续准备下一批",
    "给新号各准备 2 篇人设类内容",
  ];
  return h(
    "div",
    { className: "xhs-stack" },
    h(
      "div",
      { className: "xhs-stats" },
      h(Stat, {
        label: "待审核内容",
        value: pending.length,
        sub: `其中 ${
          pending.filter((d) => d.source === "ai").length
        } 篇来自 AI 主动`,
      }),
      h(Stat, {
        label: "已排期",
        value: scheduled.length,
        sub: `覆盖 ${new Set(scheduled.map((d) => d.account_id)).size} 个账号`,
      }),
      h(Stat, {
        label: "今日任务",
        value: rows(data.queue).length,
        sub: `${
          rows(data.queue).filter((q) =>
            ["running", "preparing"].includes(q.status),
          ).length
        } 个执行中`,
      }),
      h(Stat, {
        label: "待处理异常",
        value: alerts.length,
        sub: alerts[0] ? alerts[0].label : "无",
      }),
    ),
    h(
      "div",
      { className: "xhs-two" },
      h(
        "div",
        { className: "xhs-stack" },
        h(
          Card,
          {
            title: "AI 运营助手",
            hint: "像聊天一样下发运营要求，系统拆成内容任务放进内容计划，等你审核。",
          },
          eff.automation_level === "manual" &&
            h(
              "div",
              { className: "xhs-meta" },
              "当前为手动档，AI 不会准备内容。可在 设置 › 自动化与风控 调整。",
            ),
          h("textarea", {
            className: "xhs-textarea",
            style: { minHeight: 64 },
            value: instruction,
            disabled: readOnly || eff.automation_level === "manual",
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
            suggestions.map((s) =>
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
                disabled:
                  readOnly ||
                  !instruction.trim() ||
                  eff.automation_level === "manual",
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
              {
                disabled: readOnly || eff.automation_level === "manual",
                onClick: async () => {
                  await send(host, "plan.generate", {
                    model_ref: modelRef || undefined,
                  });
                  await refresh();
                },
              },
              "让 AI 主动准备一批",
            ),
            h(Button, { onClick: () => go("content", "editor") }, "手动创作"),
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
            hint: "按账号人设、近期发布和素材准备的草稿。通过前会再做一次发布前检查。",
          },
          pending.slice(0, 6).map((d) =>
            h(
              "div",
              { key: d.id, className: "xhs-row" },
              h(
                "div",
                { style: { minWidth: 0 } },
                h("b", null, d.title),
                h(
                  "div",
                  { className: "xhs-meta" },
                  accountName(snapshot, d.account_id),
                  " · ",
                  NATURE_LABELS[d.nature] || "未标注",
                ),
                h(
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
              ),
              h(
                "div",
                { style: { display: "flex", gap: 6 } },
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
          ),
          !pending.length &&
            h("div", { className: "xhs-empty" }, "没有待审核的内容"),
          pending.length > 6 &&
            h(
              "div",
              { className: "xhs-actions" },
              h(
                Button,
                { onClick: () => go("content", "plan") },
                `全部 ${pending.length} 篇`,
              ),
            ),
        ),
      ),
      h(
        "div",
        { className: "xhs-stack" },
        plan &&
          h(
            Card,
            { title: "上一条指令的结果" },
            h(
              "div",
              { className: "xhs-meta" },
              plan.instruction ? `“${plan.instruction}”` : "AI 主动准备",
              " · ",
              fmt(plan.at, zone),
            ),
            h(
              "div",
              { className: "xhs-row" },
              h(
                "div",
                null,
                h("b", null, `已拆成 ${plan.count} 个内容任务`),
                h(
                  "div",
                  { className: "xhs-meta" },
                  `用到 ${rows(plan.templates).length} 种母版`,
                ),
              ),
              h(
                Button,
                { primary: true, onClick: () => go("content", "plan") },
                "去制作",
              ),
            ),
          ),
        h(
          Card,
          { title: "今天" },
          h(
            "div",
            { className: "xhs-row" },
            h(
              "div",
              null,
              h("b", null, "执行队列"),
              h(
                "div",
                { className: "xhs-meta" },
                `${rows(data.queue).length} 项 · ${
                  rows(data.queue).filter((q) => q.status === "paused").length
                } 项已暂停`,
              ),
            ),
            h(Button, { onClick: () => go("home", "queue") }, "查看"),
          ),
          h(
            "div",
            { className: "xhs-row" },
            h(
              "div",
              null,
              h("b", null, "笔记维护"),
              h(
                "div",
                { className: "xhs-meta" },
                `${
                  rows(data.reply_items).filter((i) => i.status === "new")
                    .length
                } 条待你审核 · 已自动回复 ${
                  rows(data.reply_items).filter(
                    (i) => i.auto && i.status === "sent",
                  ).length
                } 条`,
              ),
            ),
            h(Button, { onClick: () => go("publish", "upkeep") }, "查看"),
          ),
          h(
            "div",
            { className: "xhs-row" },
            h(
              "div",
              null,
              h("b", null, "需要处理"),
              h(
                "div",
                { className: "xhs-meta" },
                alerts[0] ? alerts[0].label : "没有需要你处理的异常",
              ),
            ),
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
        head: ["账号", "接入", "手机", "阶段", "近 7 天发布", "状态"],
        body: rows(data.accounts).map((a) => {
          const hl = health.find((x) => x.account_id === a.id) || {};
          const stage = (data.cold_start_status || {})[a.id];
          const device = rows(snapshot.devices).find(
            (d) => d.device_id === a.device_id,
          );
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
            device
              ? device.name || device.device_id
              : a.device_id
              ? a.device_id
              : "未绑定",
            stage
              ? stage.graduated
                ? "日常运营"
                : `冷启动 · ${stage.name} · 第 ${stage.day} 天`
              : a.entry_mode === "existing"
              ? "接管"
              : "建号",
            `${hl.publish_ok ?? 0} 篇`,
            pill(
              hl.state === "healthy"
                ? "正常"
                : hl.state === "paused"
                ? "已暂停"
                : "待配置",
              hl.state === "healthy"
                ? "ok"
                : hl.state === "paused"
                ? "bad"
                : "warn",
            ),
          ];
        }),
      }),
    ),
  );
}

// ---- 执行队列 ----
function QueuePanel({ snapshot }) {
  const zone = tz(snapshot);
  const queue = rows(snapshot.data.queue);
  const devices = [...new Set(queue.map((q) => q.device_id).filter(Boolean))];
  const unbound = rows(snapshot.data.accounts).filter((a) => !a.device_id);
  const hour = (iso) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(new Date(iso))
      .split(":");
    return Number(parts[0]) + Number(parts[1]) / 60;
  };
  const nowH = hour(new Date().toISOString());
  const pos = (v) => `${Math.max(0, Math.min(100, ((v - 8) / 15) * 100))}%`;
  const eff = snapshot.data.effective_policy || {};
  const settings = snapshot.data.member_settings || {};
  return h(
    "div",
    { className: "xhs-stack" },
    h(
      "div",
      { className: "xhs-stats" },
      h(Stat, {
        label: "今日任务",
        value: queue.length,
        sub: `${devices.length} 台手机`,
      }),
      h(Stat, {
        label: "执行中",
        value: queue.filter((q) => ["running", "preparing"].includes(q.status))
          .length,
      }),
      h(Stat, {
        label: "排队",
        value: queue.filter((q) =>
          ["queued", "planned", "awaiting_confirmation"].includes(q.status),
        ).length,
      }),
      h(Stat, {
        label: "已暂停",
        value: queue.filter((q) => q.status === "paused").length,
        sub: eff.enterprise_paused
          ? "企业已暂停"
          : eff.member_paused
          ? "你已暂停"
          : "",
      }),
    ),
    h(
      "div",
      { className: "xhs-two" },
      h(
        "div",
        { className: "xhs-stack" },
        devices.length === 0 &&
          h(
            Card,
            { title: "今天还没有任务" },
            h(
              "div",
              { className: "xhs-empty" },
              "到点的发布、养号和回复会出现在这里。",
            ),
          ),
        devices.map((deviceId) => {
          const items = queue.filter((q) => q.device_id === deviceId);
          const device = rows(snapshot.devices).find(
            (d) => d.device_id === deviceId,
          );
          return h(
            Card,
            {
              key: deviceId,
              title: `${device?.name || deviceId} · ${accountName(
                snapshot,
                items[0]?.account_id,
              )}`,
              right: pill(
                items.some((i) => i.status === "running")
                  ? "执行中"
                  : items.some((i) => i.status === "paused")
                  ? "已暂停"
                  : "排队",
                items.some((i) => i.status === "paused") ? "bad" : "ok",
              ),
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
                    className: `xhs-blk ${
                      i.status === "paused" ? "paused" : i.kind
                    }`,
                    style: { left: pos(hour(i.at)), width: "7%" },
                    title: RUN_LABELS[i.kind] || i.kind,
                  },
                  RUN_LABELS[i.kind] || i.kind,
                ),
              ),
              h("span", { className: "xhs-now", style: { left: pos(nowH) } }),
            ),
            items.map((i) =>
              h(
                "div",
                { key: i.id, className: "xhs-row" },
                h(
                  "div",
                  null,
                  h(
                    "b",
                    null,
                    `${fmt(i.at, zone, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })} ${RUN_LABELS[i.kind] || i.kind}`,
                  ),
                  i.title &&
                    h("div", { className: "xhs-meta" }, `「${i.title}」`),
                  i.error &&
                    h("div", { className: "xhs-meta xhs-danger" }, i.error),
                ),
                pill(
                  i.status === "awaiting_confirmation"
                    ? "到点待你确认"
                    : statusLabel(i.status),
                  i.status === "paused" || i.status === "unknown"
                    ? "bad"
                    : i.status === "running"
                    ? "ok"
                    : "",
                ),
              ),
            ),
          );
        }),
      ),
      h(
        "div",
        { className: "xhs-stack" },
        unbound.length > 0 &&
          h(
            Card,
            { title: "不在队列里" },
            unbound.map((a) =>
              h(
                "div",
                { key: a.id, className: "xhs-row" },
                h(
                  "div",
                  null,
                  h("b", null, a.name),
                  h(
                    "div",
                    { className: "xhs-meta" },
                    "未绑定手机，到点的发布无法执行",
                  ),
                ),
              ),
            ),
          ),
        h(
          Card,
          {
            title: "排队规则",
            hint: "这里只排队和提示冲突，不改你定好的发布时间。",
          },
          h(
            "div",
            { className: "xhs-row" },
            h("b", null, "同一台手机一次只执行一个任务"),
            h(Lock, { children: "固定" }),
          ),
          h(
            "div",
            { className: "xhs-row" },
            h(
              "b",
              null,
              "手机离线或登录失效时暂停这台手机的队列，不换手机执行",
            ),
            h(Lock, { children: "固定" }),
          ),
          h(
            "div",
            { className: "xhs-row" },
            h("b", null, "到点的发布需要你确认后才执行"),
            h(Lock, { children: "固定" }),
          ),
          h(
            "div",
            { className: "xhs-row" },
            h("b", null, "资料变更当天"),
            pill(
              settings.profile_change_day === "publish_only"
                ? "只发布"
                : "不发布、不养号",
            ),
          ),
          h(
            "div",
            { className: "xhs-row" },
            h("b", null, "每个账号每天自动操作时长上限"),
            pill(`${settings.daily_minutes_cap || 60} 分钟`),
          ),
        ),
      ),
    ),
  );
}

// ---- 异常与告警 ----
function AlertsPanel({ snapshot, host, readOnly, refresh, go }) {
  const zone = tz(snapshot);
  const list = rows(snapshot.data.alerts);
  const action = list.filter((a) => a.level === "action");
  const auto = list.filter((a) => a.level !== "action");
  const health = rows(snapshot.data.account_health);
  const [notice, setNotice] = useState({
    account_id: "",
    text: "",
    restricted: false,
  });
  return h(
    "div",
    { className: "xhs-stack" },
    h(
      "div",
      { className: "xhs-stats" },
      h(Stat, { label: "待处理", value: action.length }),
      h(Stat, { label: "提醒", value: auto.length }),
      h(Stat, {
        label: "已暂停账号",
        value: health.filter((x) => x.state === "paused").length,
      }),
      h(Stat, {
        label: "健康账号",
        value: `${health.filter((x) => x.state === "healthy").length} / ${
          health.length
        }`,
      }),
    ),
    h(
      "div",
      { className: "xhs-two" },
      h(
        Card,
        {
          title: "待处理",
          hint: "出现平台提示、验证码或登录失效时，系统只会停下来等你处理，不会重试、换设备或换账号继续。",
        },
        action.map((a) =>
          h(
            "div",
            { key: a.id, className: "xhs-row", style: { display: "block" } },
            h(
              "div",
              null,
              pill("需要你处理", "bad"),
              " ",
              h(
                "b",
                null,
                a.account_id
                  ? `${accountName(snapshot, a.account_id)} · ${a.label}`
                  : a.label,
              ),
            ),
            h(
              "div",
              { className: "xhs-meta" },
              fmt(a.at, zone),
              " · ",
              RUN_LABELS[a.kind] || a.kind,
            ),
            h(
              "div",
              { className: "xhs-actions" },
              [
                "login_required",
                "phone_interaction_required",
                "account_paused",
              ].includes(a.code) &&
                h(
                  Button,
                  { primary: true, onClick: () => go("build", "accounts") },
                  "我已在手机上处理，去重新核对身份",
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
            ),
          ),
        ),
        !action.length &&
          h("div", { className: "xhs-empty" }, "没有需要你处理的异常"),
      ),
      h(
        Card,
        { title: "提醒与已自动处理" },
        h(Table, {
          head: ["时间", "账号", "内容"],
          body: auto
            .slice(0, 12)
            .map((a) => [
              fmt(a.at, zone),
              a.account_id ? accountName(snapshot, a.account_id) : "—",
              a.label,
            ]),
          empty: "近期没有提醒",
        }),
      ),
    ),
    h(
      Card,
      {
        title: "账号健康",
        hint: "平台通知由你在手机上查看后登记；系统只读取页面上显示的内容，不推断是否被限流。",
      },
      h(Table, {
        head: [
          "账号",
          "登录",
          "7 天养号完成率",
          "7 天发布",
          "平台通知",
          "状态",
        ],
        body: health.map((x) => [
          accountName(snapshot, x.account_id),
          pill(
            x.login === "ok"
              ? "正常"
              : x.login === "lost"
              ? "登录失效"
              : "未绑定",
            x.login === "ok" ? "ok" : "bad",
          ),
          x.nurture_rate == null ? "—" : `${x.nurture_rate}%`,
          `${x.publish_ok} / ${x.publish_total}${
            x.publish_unknown ? ` · ${x.publish_unknown} 篇结果不明` : ""
          }`,
          rows(x.notices).length ? rows(x.notices).slice(-1)[0].text : "无",
          pill(
            x.state === "healthy"
              ? "健康"
              : x.state === "paused"
              ? "已暂停"
              : "待配置",
            x.state === "healthy"
              ? "ok"
              : x.state === "paused"
              ? "bad"
              : "warn",
          ),
        ]),
      }),
      h(
        "div",
        { className: "xhs-two even", style: { marginTop: 12 } },
        h(Select, {
          label: "登记平台通知 · 账号",
          value: notice.account_id,
          onChange: (v) => setNotice({ ...notice, account_id: v }),
          options: [
            ["", "选择账号"],
            ...rows(snapshot.data.accounts).map((a) => [a.id, a.name || a.id]),
          ],
        }),
        h(Field, {
          label: "通知内容",
          value: notice.text,
          onChange: (v) => setNotice({ ...notice, text: v }),
          placeholder: "照手机上显示的抄写",
        }),
      ),
      h(Check, {
        label:
          "这是限制或违规提示（会暂停该账号的养号、发布和回复至少 72 小时）",
        checked: notice.restricted,
        onChange: (v) => setNotice({ ...notice, restricted: v }),
      }),
      h(
        "div",
        { className: "xhs-actions" },
        h(
          Button,
          {
            disabled: readOnly || !notice.account_id || !notice.text.trim(),
            onClick: async () => {
              await send(host, "notice.record", notice);
              setNotice({ account_id: "", text: "", restricted: false });
              await refresh();
            },
          },
          "登记平台通知",
        ),
      ),
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
  const set = (i, key, value) =>
    setStages(stages.map((s, j) => (j === i ? { ...s, [key]: value } : s)));
  const fresh = rows(snapshot.data.accounts).filter(
    (a) => a.entry_mode === "new",
  );
  return h(
    "div",
    { className: "xhs-stack" },
    h(
      Card,
      {
        title: "冷启动方案",
        hint: "新号完成资料核验后，先按较低的强度养号，再过渡到账号日常预算。每一档仍要先生成计划、预检、由你确认后才执行。",
      },
      h(Table, {
        head: [
          "阶段",
          "天数",
          "每日浏览",
          "分段",
          "搜索占比 %",
          "点赞（开 / 上限 / %）",
          "收藏（开 / 上限 / %）",
          "关注",
        ],
        body: stages.map((s, i) => [
          s.name,
          `第 ${s.day_from}–${s.day_to} 天`,
          h("input", {
            className: "xhs-input",
            type: "number",
            value: s.daily_target_posts,
            disabled: readOnly,
            onChange: (e) =>
              set(i, "daily_target_posts", Number(e.target.value)),
          }),
          h("input", {
            className: "xhs-input",
            type: "number",
            value: s.segments,
            disabled: readOnly,
            onChange: (e) => set(i, "segments", Number(e.target.value)),
          }),
          h("input", {
            className: "xhs-input",
            type: "number",
            value: s.search_ratio_percent,
            disabled: readOnly,
            onChange: (e) =>
              set(i, "search_ratio_percent", Number(e.target.value)),
          }),
          ...["like", "collect"].map((k) =>
            h(
              "span",
              {
                key: k,
                style: { display: "flex", gap: 4, alignItems: "center" },
              },
              h("input", {
                type: "checkbox",
                checked: !!s[k][0],
                disabled: readOnly,
                onChange: (e) =>
                  set(i, k, [e.target.checked, s[k][1], s[k][2]]),
              }),
              h("input", {
                className: "xhs-input",
                style: { width: 52, marginTop: 0 },
                type: "number",
                value: s[k][1],
                disabled: readOnly,
                onChange: (e) =>
                  set(i, k, [s[k][0], Number(e.target.value), s[k][2]]),
              }),
              h("input", {
                className: "xhs-input",
                style: { width: 52, marginTop: 0 },
                type: "number",
                value: s[k][2],
                disabled: readOnly,
                onChange: (e) =>
                  set(i, k, [s[k][0], s[k][1], Number(e.target.value)]),
              }),
            ),
          ),
          "关闭",
        ]),
      }),
      h(
        "div",
        { className: "xhs-meta", style: { marginTop: 8 } },
        "第 15 天起按账号日常预算。评论只发送评论审核里逐条批准过的原文。",
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
              await refresh();
            },
          },
          "保存为默认方案",
        ),
      ),
    ),
    h(
      Card,
      { title: "新号进度" },
      fresh.map((a) => {
        const s = status[a.id];
        return h(
          "div",
          { key: a.id, className: "xhs-row" },
          h(
            "div",
            null,
            h("b", null, a.name),
            h(
              "div",
              { className: "xhs-meta" },
              s
                ? s.graduated
                  ? `第 ${s.day} 天 · 已转日常`
                  : `第 ${s.day} 天 · ${s.name}`
                : "未开始",
            ),
          ),
          h(
            "div",
            { style: { display: "flex", gap: 6 } },
            !s &&
              h(
                Button,
                {
                  primary: true,
                  disabled: readOnly,
                  onClick: async () => {
                    await send(host, "coldstart.apply", { account_id: a.id });
                    await refresh();
                  },
                },
                "开始冷启动",
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
          ),
        );
      }),
      !fresh.length && h("div", { className: "xhs-empty" }, "还没有新账号"),
    ),
  );
}

// ---- 内容计划 ----
function PlanPanel({ snapshot, host, readOnly, refresh, modelRef, go }) {
  const zone = tz(snapshot);
  const drafts = rows(snapshot.data.drafts);
  const tasks = rows(snapshot.data.content_tasks).filter(
    (t) => t.status === "to_make" || t.status === "making",
  );
  const [filter, setFilter] = useState("pending_review");
  const [selected, setSelected] = useState([]);
  const [when, setWhen] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [review, setReview] = useState(null);
  const buckets = {
    to_make: tasks.length,
    pending_review: drafts.filter((d) =>
      ["pending_review", "returned", undefined].includes(d.review_status),
    ).length,
    approved: drafts.filter((d) =>
      ["approved", "scheduled"].includes(d.review_status),
    ).length,
    published: drafts.filter((d) => d.review_status === "published").length,
    failed: drafts.filter((d) => d.review_status === "failed").length,
  };
  const shown = drafts.filter((d) => {
    const s = d.review_status || "pending_review";
    if (filter === "pending_review")
      return ["pending_review", "returned"].includes(s);
    if (filter === "approved") return ["approved", "scheduled"].includes(s);
    return s === filter;
  });
  const batch = async (action, extra = {}) => {
    await send(host, "plan.update", { action, ids: selected, ...extra });
    setSelected([]);
    await refresh();
  };
  const toggle = (id, on) =>
    setSelected(
      on ? [...new Set([...selected, id])] : selected.filter((x) => x !== id),
    );
  const accounts = rows(snapshot.data.accounts);
  return h(
    "div",
    { className: "xhs-stack" },
    h(
      Card,
      {
        title: "内容任务池",
        hint: "AI 主动生成、运营指令、素材和手动创作的内容都在这里，使用同一套审核、排期和发布。",
      },
      h(
        "div",
        { className: "xhs-tabs", style: { marginBottom: 10 } },
        [
          ["to_make", "待制作"],
          ["pending_review", "待审核"],
          ["approved", "待发布"],
          ["published", "已发布"],
          ["failed", "发布失败"],
        ].map(([k, l]) =>
          h(
            "button",
            {
              key: k,
              className: `xhs-tab${filter === k ? " active" : ""}`,
              onClick: () => {
                setFilter(k);
                setSelected([]);
              },
            },
            `${l} ${buckets[k]}`,
          ),
        ),
      ),
      filter === "to_make"
        ? h(Table, {
            head: ["选题", "来源", "账号", "性质", "为什么这样安排", ""],
            body: tasks.map((t) => [
              h("b", null, t.title),
              srcPill(t.source),
              accountName(snapshot, t.account_id),
              NATURE_LABELS[t.nature],
              h("span", { className: "xhs-meta" }, t.reason || "—"),
              t.status === "making"
                ? pill("制作中")
                : h(
                    "span",
                    { style: { display: "flex", gap: 6 } },
                    h(
                      Button,
                      {
                        primary: true,
                        disabled: readOnly,
                        onClick: async () => {
                          await send(host, "task.generate", {
                            id: t.id,
                            model_ref: modelRef || undefined,
                          });
                          await refresh();
                        },
                      },
                      "生成草稿",
                    ),
                    h(
                      Button,
                      {
                        disabled: readOnly,
                        onClick: async () => {
                          await send(host, "task.dismiss", { id: t.id });
                          await refresh();
                        },
                      },
                      "忽略",
                    ),
                  ),
            ]),
            empty:
              "没有待制作的任务。可以在工作台让 AI 准备一批，或在素材库用素材生成。",
          })
        : h(
            "div",
            null,
            selected.length > 0 &&
              h(
                "div",
                {
                  className: "xhs-actions",
                  style: {
                    alignItems: "flex-end",
                    marginTop: 0,
                    marginBottom: 8,
                  },
                },
                h(
                  "span",
                  { className: "xhs-meta" },
                  `已选 ${selected.length} 篇`,
                ),
                filter === "pending_review" &&
                  h(
                    Button,
                    {
                      primary: true,
                      disabled: readOnly,
                      onClick: () => batch("approve"),
                    },
                    "批量通过",
                  ),
                filter === "pending_review" &&
                  h(
                    Button,
                    { disabled: readOnly, onClick: () => batch("return") },
                    "退回修改",
                  ),
                h("input", {
                  className: "xhs-input",
                  style: { width: 200, marginTop: 0 },
                  type: "datetime-local",
                  value: when,
                  onChange: (e) => setWhen(e.target.value),
                }),
                h(
                  Button,
                  {
                    disabled: readOnly || !when,
                    onClick: () =>
                      batch("schedule", {
                        scheduled_at: new Date(when).toISOString(),
                      }),
                  },
                  "批量排期",
                ),
                h(
                  "select",
                  {
                    className: "xhs-select",
                    style: { width: 160, marginTop: 0 },
                    value: assignTo,
                    onChange: (e) => setAssignTo(e.target.value),
                  },
                  h("option", { value: "" }, "换到账号…"),
                  accounts.map((a) =>
                    h("option", { key: a.id, value: a.id }, a.name || a.id),
                  ),
                ),
                h(
                  Button,
                  {
                    disabled: readOnly || !assignTo,
                    onClick: () => batch("assign", { account_id: assignTo }),
                  },
                  "批量换账号",
                ),
                h(
                  Button,
                  { disabled: readOnly, onClick: () => batch("pause") },
                  "暂停",
                ),
              ),
            h(Table, {
              head: [
                "",
                "选题",
                "来源",
                "账号",
                "排期",
                "发布前检查",
                "状态",
                "",
              ],
              body: shown.map((d) => [
                h("input", {
                  type: "checkbox",
                  checked: selected.includes(d.id),
                  onChange: (e) => toggle(d.id, e.target.checked),
                }),
                h("b", null, d.title),
                srcPill(d.source),
                accountName(snapshot, d.account_id),
                d.scheduled_at ? fmt(d.scheduled_at, zone) : "未排期",
                checkPills(d.checks),
                pill(
                  REVIEW_LABELS[d.review_status || "pending_review"],
                  d.review_status === "failed" ? "bad" : "",
                ),
                h(
                  "span",
                  { style: { display: "flex", gap: 6 } },
                  h(
                    Button,
                    {
                      disabled: readOnly,
                      onClick: async () => {
                        await send(host, "content.precheck", { id: d.id });
                        await refresh();
                      },
                    },
                    "检查",
                  ),
                  d.checks?.blocking &&
                    h(
                      Button,
                      {
                        disabled: readOnly,
                        onClick: async () => {
                          await send(host, "content.meta", {
                            id: d.id,
                            meta: {},
                            fix_labels: true,
                          });
                          await refresh();
                        },
                      },
                      "补上标识与披露",
                    ),
                  d.checks?.high_risk &&
                    h(
                      Button,
                      {
                        disabled: readOnly,
                        onClick: () =>
                          setReview({
                            id: d.id,
                            reviewer:
                              snapshot.data.effective_policy?.reviewer_name ||
                              "",
                            reference: "",
                            decision: "approved",
                          }),
                      },
                      "记录合规复核",
                    ),
                ),
              ]),
              empty: "这里没有内容",
            }),
          ),
      review &&
        h(
          "div",
          {
            className: "xhs-card",
            style: { marginTop: 12, borderColor: "#5b4fc7" },
          },
          h("h4", { style: { marginTop: 0 } }, "记录合规复核"),
          h(
            "div",
            { className: "xhs-meta" },
            "高风险内容由企业指定的复核人在审批流程里签字，这里记录结论和单号。内容再改动需要重新复核。",
          ),
          h(
            "div",
            { className: "xhs-two even" },
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
          ),
          h(Select, {
            label: "结论",
            value: review.decision,
            onChange: (v) => setReview({ ...review, decision: v }),
            options: [
              ["approved", "通过"],
              ["rejected", "退回"],
            ],
          }),
          h(
            "div",
            { className: "xhs-actions" },
            h(
              Button,
              {
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
            h(Button, { onClick: () => setReview(null) }, "取消"),
          ),
        ),
    ),
    h(
      Card,
      { title: "审核流" },
      h(
        "div",
        { className: "xhs-row" },
        h(
          "div",
          null,
          h("b", null, "普通内容"),
          h("div", { className: "xhs-meta" }, "生活、知识类"),
        ),
        pill("运营本人"),
      ),
      h(
        "div",
        { className: "xhs-row" },
        h(
          "div",
          null,
          h("b", null, "营销内容"),
          h("div", { className: "xhs-meta" }, "补全商业推广披露后才能通过"),
        ),
        pill("运营本人"),
      ),
      h(
        "div",
        { className: "xhs-row" },
        h(
          "div",
          null,
          h("b", null, "高风险内容"),
          h(
            "div",
            { className: "xhs-meta" },
            "效果描述、案例、对比类；医疗美容内容一律走这一档",
          ),
        ),
        h(Lock, {
          children: `合规复核人${
            snapshot.data.effective_policy?.reviewer_name
              ? " · " + snapshot.data.effective_policy.reviewer_name
              : ""
          }`,
        }),
      ),
    ),
  );
}

// ---- 素材库 ----
function MaterialsPanel({ snapshot, host, readOnly, refresh, go }) {
  const materials = rows(snapshot.data.materials);
  const consents = rows(snapshot.data.authorizations).filter(
    (c) => c.status === "active",
  );
  const accounts = rows(snapshot.data.accounts);
  const blank = {
    kind: "experience",
    title: "",
    text: "",
    owner: "public",
    account_ids: [],
    origin: "spoken",
    consent_id: "",
    images: [],
  };
  const [form, setForm] = useState(blank);
  const [kind, setKind] = useState("");
  const shown = materials.filter((m) => !kind || m.kind === kind);
  const KINDS = {
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
  const save = async () => {
    await send(host, "material.save", {
      ...form,
      id: form.id || "",
      version: form.version ?? null,
    });
    setForm(blank);
    await refresh();
  };
  return h(
    "div",
    { className: "xhs-stack" },
    h(
      "div",
      { className: "xhs-two even" },
      h(
        Card,
        {
          title: "添加素材",
          hint: "文字、图片、文件都可以。不用马上做成笔记，系统会先整理保存，之后做内容计划时自动匹配。",
        },
        h(Field, {
          label: "标题（可选）",
          value: form.title,
          onChange: (v) => setForm({ ...form, title: v }),
        }),
        h(Field, {
          label: "内容",
          multiline: true,
          value: form.text,
          onChange: (v) => setForm({ ...form, text: v }),
          placeholder:
            "例如：小王周末去了天坛，下午阳光很好，想分享一下秋天的景色，但是没有拍照。",
        }),
        h(
          "div",
          { className: "xhs-two even" },
          h(Select, {
            label: "类型",
            value: form.kind,
            onChange: (v) => setForm({ ...form, kind: v }),
            options: Object.entries(KINDS),
          }),
          h(Select, {
            label: "来源",
            value: form.origin,
            onChange: (v) => setForm({ ...form, origin: v }),
            options: Object.entries(ORIGINS),
          }),
          h(Select, {
            label: "归属",
            value: form.owner,
            onChange: (v) =>
              setForm({
                ...form,
                owner: v,
                account_ids: v === "public" ? [] : form.account_ids,
              }),
            options: [
              ["public", "公共素材库"],
              ["account", "绑定账号"],
              ["shared", "多账号共用"],
            ],
          }),
          h(Select, {
            label: "授权（真实人物或经历时必选）",
            value: form.consent_id,
            onChange: (v) => setForm({ ...form, consent_id: v }),
            options: [
              ["", "不涉及个人授权"],
              ...consents.map((c) => [c.id, `${c.person} · 至 ${c.valid_to}`]),
            ],
          }),
        ),
        form.owner !== "public" &&
          h(
            "div",
            { style: { display: "flex", gap: 12, flexWrap: "wrap" } },
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
        h(
          "label",
          { className: "xhs-field" },
          h(
            "div",
            { className: "xhs-label" },
            `图片（${form.images.length}/9）`,
          ),
          h("input", {
            type: "file",
            accept: "image/png,image/jpeg,image/webp",
            multiple: true,
            disabled: readOnly,
            onChange: async (e) => {
              const added = await readImageFiles([...e.target.files]);
              setForm({
                ...form,
                images: [...form.images, ...added].slice(0, 9),
              });
            },
          }),
        ),
        h(
          "div",
          { className: "xhs-actions" },
          h(
            Button,
            {
              primary: true,
              disabled: readOnly || (!form.text.trim() && !form.images.length),
              onClick: save,
            },
            "保存素材",
          ),
        ),
      ),
      h(
        Card,
        { title: "使用边界" },
        h(
          "div",
          { className: "xhs-row" },
          h(
            "b",
            null,
            "真实个人经历、人物照片只能用于授权人对应的账号，不能改写成其他账号的亲身经历",
          ),
          h(Lock, { children: "固定" }),
        ),
        h(
          "div",
          { className: "xhs-row" },
          h("b", null, "AI 重现的图片保留来源标记，不当作现场实拍"),
          h(Lock, { children: "固定" }),
        ),
        h(
          "div",
          { className: "xhs-row" },
          h("b", null, "第三方内容只作参考，提炼结构，不复制原文和原图"),
          h(Lock, { children: "固定" }),
        ),
      ),
    ),
    h(
      Card,
      {
        title: "素材资产库",
        right: h(
          "select",
          {
            className: "xhs-select",
            style: { width: 180, marginTop: 0 },
            value: kind,
            onChange: (e) => setKind(e.target.value),
          },
          h("option", { value: "" }, "全部类型"),
          Object.entries(KINDS).map(([k, l]) =>
            h("option", { key: k, value: k }, l),
          ),
        ),
      },
      h(Table, {
        head: [
          "素材",
          "类型",
          "归属",
          "来源",
          "状态",
          "已使用",
          "系统整理",
          "",
        ],
        body: shown.map((m) => [
          h(
            "div",
            null,
            h("b", null, m.title || (m.text || "").slice(0, 20) || "图片素材"),
            h("div", { className: "xhs-meta" }, (m.text || "").slice(0, 60)),
          ),
          KINDS[m.kind],
          m.owner === "public"
            ? "公共素材库"
            : rows(m.account_ids)
                .map((id) => accountName(snapshot, id))
                .join("、"),
          ORIGINS[m.origin] || m.origin,
          pill(
            m.status === "frozen" ? "已冻结（授权撤回）" : "可用",
            m.status === "frozen" ? "bad" : "ok",
          ),
          `${m.used || 0} 次`,
          m.analysis
            ? h(
                "span",
                { className: "xhs-meta" },
                [
                  rows(m.analysis.formats).join("、"),
                  m.analysis.missing?.length
                    ? `缺：${m.analysis.missing.join("、")}`
                    : "",
                  m.analysis.boundary,
                ]
                  .filter(Boolean)
                  .join(" · "),
              )
            : "—",
          h(
            "span",
            { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
            h(
              Button,
              {
                disabled: readOnly || m.status === "frozen",
                onClick: async () => {
                  await send(host, "material.organize", { id: m.id });
                  await refresh();
                },
              },
              "AI 整理",
            ),
            h(
              Button,
              {
                primary: true,
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
              "用它生成内容",
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
function TemplatesPanel({ snapshot, host, readOnly, refresh }) {
  const cache = snapshot.data.catalog_cache || {};
  const templates = rows(cache.templates);
  const subs = rows(snapshot.data.template_submissions);
  const drafts = rows(snapshot.data.drafts).filter(
    (d) =>
      d.review_status === "published" ||
      d.review_status === "approved" ||
      d.review_status === "scheduled",
  );
  const [submit, setSubmit] = useState({ id: "", structure: "", metrics: "" });
  return h(
    "div",
    { className: "xhs-stack" },
    h(
      Card,
      {
        title: "内容母版库",
        hint: "母版 = 运营经验 + 文案结构 + 图片形式 + 适用条件。系统按运营目标、账号人设和现有素材自动匹配，你也可以手动切换。",
        right: h(
          "span",
          { style: { display: "flex", gap: 6, alignItems: "center" } },
          cache.fetched_at &&
            h(
              "span",
              { className: "xhs-meta" },
              `同步于 ${fmt(cache.fetched_at, tz(snapshot))}`,
            ),
          h(
            Button,
            {
              disabled: readOnly,
              onClick: async () => {
                await send(host, "catalog.refresh", {});
                await refresh();
              },
            },
            "从企业同步",
          ),
        ),
      },
      !templates.length &&
        h(
          "div",
          { className: "xhs-empty" },
          "还没有同步母版。点“从企业同步”获取平台为企业开通的母版和词库。",
        ),
      h(
        "div",
        { className: "xhs-grid" },
        templates.map((t) =>
          h(
            "div",
            {
              key: t.id,
              className: "xhs-card",
              style: t.available === false ? { opacity: 0.55 } : undefined,
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
              t.compliance !== "通用" && pill(t.compliance, "warn"),
              t.available === false && h(Lock, { children: "企业未开通" }),
            ),
            h("div", { className: "xhs-meta" }, "结构：", t.structure),
            h(
              "div",
              { className: "xhs-meta", style: { marginTop: 4 } },
              "配图：",
              t.visual || "—",
            ),
            h(
              "div",
              { className: "xhs-meta", style: { marginTop: 4 } },
              "需要素材：",
              t.required_material || "—",
            ),
          ),
        ),
      ),
    ),
    h(
      "div",
      { className: "xhs-two even" },
      h(
        Card,
        {
          title: "提交优质内容为母版候选",
          hint: "提交的是结构和做法，平台审核时会去掉账号信息；被采纳后，范围内的企业都能用。",
        },
        h(Select, {
          label: "内容",
          value: submit.id,
          onChange: (v) => setSubmit({ ...submit, id: v }),
          options: [
            ["", "选择一篇已通过或已发布的内容"],
            ...drafts.map((d) => [d.id, d.title]),
          ],
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
        h(
          "div",
          { className: "xhs-actions" },
          h(
            Button,
            {
              primary: true,
              disabled: readOnly || !submit.id,
              onClick: async () => {
                await send(host, "template.submit", submit);
                setSubmit({ id: "", structure: "", metrics: "" });
                await refresh();
              },
            },
            "提交",
          ),
        ),
      ),
      h(
        Card,
        { title: "我提交的母版候选" },
        h(Table, {
          head: ["内容", "提交时间", "平台审核"],
          body: subs.map((s) => [
            s.title,
            fmt(s.created_at, tz(snapshot)),
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
            ),
          ]),
          empty: "还没有提交",
        }),
      ),
    ),
  );
}

// ---- 业务资料 ----
function BizDocsPanel({ snapshot, host, readOnly, refresh }) {
  const docs = rows(snapshot.data.biz_docs);
  const [kind, setKind] = useState("org");
  const TEMPLATES = {
    org: ["主营业务", "机构介绍", "门店与服务地区", "资质文件"],
    project: ["核心卖点", "价格", "适用条件", "注意事项"],
    person: ["身份", "可公开信息", "资质", "授权"],
  };
  const blank = (k) => ({
    kind: k,
    name: "",
    fields: Object.fromEntries(TEMPLATES[k].map((f) => [f, ""])),
    source: "",
  });
  const [form, setForm] = useState(blank("org"));
  return h(
    "div",
    { className: "xhs-stack" },
    h(
      Card,
      {
        title: "业务资料",
        hint: "生成内容时，价格、功效、适用条件等信息只从这里取，取不到就不写。发布前检查也会用它核对价格。",
      },
      h(
        "div",
        { className: "xhs-tabs", style: { marginBottom: 10 } },
        [
          ["org", "机构资料"],
          ["project", "项目资料"],
          ["person", "医生与人员资料"],
        ].map(([k, l]) =>
          h(
            "button",
            {
              key: k,
              className: `xhs-tab${kind === k ? " active" : ""}`,
              onClick: () => {
                setKind(k);
                setForm(blank(k));
              },
            },
            l,
          ),
        ),
      ),
      h(Table, {
        head: ["名称", ...TEMPLATES[kind], "资料来源", ""],
        body: docs
          .filter((d) => d.kind === kind)
          .map((d) => [
            h("b", null, d.name),
            ...TEMPLATES[kind].map((f) => (d.fields || {})[f] || "—"),
            d.source || "—",
            h(
              "span",
              { style: { display: "flex", gap: 6 } },
              h(
                Button,
                {
                  disabled: readOnly,
                  onClick: () =>
                    setForm({
                      ...d,
                      fields: {
                        ...Object.fromEntries(
                          TEMPLATES[kind].map((f) => [f, ""]),
                        ),
                        ...d.fields,
                      },
                    }),
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
        empty: "还没有资料",
      }),
      h("h4", null, form.id ? `编辑 · ${form.name}` : "添加"),
      h(Field, {
        label: "名称",
        value: form.name,
        onChange: (v) => setForm({ ...form, name: v }),
      }),
      h(
        "div",
        { className: "xhs-two even" },
        Object.keys(form.fields).map((f) =>
          h(Field, {
            key: f,
            label: f,
            value: form.fields[f],
            onChange: (v) =>
              setForm({ ...form, fields: { ...form.fields, [f]: v } }),
          }),
        ),
      ),
      h(Field, {
        label: "资料来源",
        value: form.source,
        onChange: (v) => setForm({ ...form, source: v }),
        placeholder: "例如：产品部 · 10-20",
      }),
      kind === "person" &&
        h(
          "div",
          { className: "xhs-meta" },
          "医疗、医美机构在这里录入医生资料与执业资质；内容里出现的专业信息必须能在这里找到来源。",
        ),
      h(
        "div",
        { className: "xhs-actions" },
        h(
          Button,
          {
            primary: true,
            disabled: readOnly || !form.name.trim(),
            onClick: async () => {
              await send(host, "bizdoc.save", {
                id: form.id || "",
                version: form.version ?? null,
                kind: form.kind,
                name: form.name,
                fields: form.fields,
                source: form.source || "",
              });
              setForm(blank(kind));
              await refresh();
            },
          },
          "保存",
        ),
        form.id &&
          h(Button, { onClick: () => setForm(blank(kind)) }, "取消编辑"),
      ),
    ),
  );
}

// ---- 排期日历 ----
function CalendarPanel({ snapshot }) {
  const zone = tz(snapshot);
  const [offset, setOffset] = useState(0);
  const start = new Date();
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7);
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return fmt(d.toISOString(), zone, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  });
  const key = (iso) =>
    fmt(iso, zone, { year: "numeric", month: "2-digit", day: "2-digit" });
  const drafts = rows(snapshot.data.drafts).filter((d) => d.scheduled_at);
  const eff = snapshot.data.effective_policy || {};
  const warnings = [];
  rows(snapshot.data.accounts).forEach((a) => {
    const mine = drafts
      .filter((d) => d.account_id === a.id)
      .sort((x, y) => (x.scheduled_at < y.scheduled_at ? -1 : 1));
    mine.forEach((d, i) => {
      if (
        i > 0 &&
        (new Date(d.scheduled_at) - new Date(mine[i - 1].scheduled_at)) /
          3600000 <
          eff.min_interval_hours
      )
        warnings.push(
          `${a.name}：「${d.title}」与上一篇间隔不足 ${eff.min_interval_hours} 小时`,
        );
    });
    if (!a.device_id && mine.length)
      warnings.push(`${a.name}：未绑定手机，排期的发布无法执行`);
  });
  return h(
    "div",
    { className: "xhs-stack" },
    h(
      Card,
      {
        title: "排期日历",
        right: h(
          "span",
          { style: { display: "flex", gap: 6, alignItems: "center" } },
          h(Button, { onClick: () => setOffset(offset - 1) }, "上一周"),
          h("span", { className: "xhs-meta" }, `${days[0]} 至 ${days[6]}`),
          h(Button, { onClick: () => setOffset(offset + 1) }, "下一周"),
        ),
      },
      h(
        "div",
        { className: "xhs-cal", style: { overflowX: "auto" } },
        h(Table, {
          head: ["账号", ...days.map((d) => d.slice(5))],
          body: rows(snapshot.data.accounts).map((a) => [
            h("b", null, a.name),
            ...days.map((day) =>
              h(
                "div",
                { key: day },
                drafts
                  .filter(
                    (d) => d.account_id === a.id && key(d.scheduled_at) === day,
                  )
                  .map((d) =>
                    h(
                      "span",
                      {
                        key: d.id,
                        className: `xhs-chip ${d.nature || ""}`,
                        title: d.title,
                      },
                      `${NATURE_LABELS[d.nature] || ""} ${fmt(
                        d.scheduled_at,
                        zone,
                        { hour: "2-digit", minute: "2-digit" },
                      )} ${d.title}`,
                    ),
                  ),
              ),
            ),
          ]),
        }),
      ),
      h(
        "div",
        { className: "xhs-meta", style: { marginTop: 8 } },
        `不要求每个账号每天发帖。排期必须在 ${
          eff.publish_window || "08:00-22:30"
        } 之内，同一账号间隔至少 ${
          eff.min_interval_hours || 48
        } 小时，每周最多 ${
          eff.weekly_max_posts ?? 4
        } 篇；到点的发布需要你确认后执行。`,
      ),
    ),
    h(
      Card,
      { title: "排期提醒" },
      warnings.length
        ? warnings.map((w) =>
            h(
              "div",
              { key: w, className: "xhs-row" },
              w,
              pill("需要调整", "warn"),
            ),
          )
        : h("div", { className: "xhs-empty" }, "本周排期没有冲突"),
    ),
  );
}

// ---- 笔记维护 ----
function UpkeepPanel({ snapshot, host, readOnly, refresh }) {
  const zone = tz(snapshot);
  const items = rows(snapshot.data.reply_items);
  const leads = rows(snapshot.data.leads);
  const eff = snapshot.data.effective_policy || {};
  const pending = items.filter(
    (i) => i.status === "new" || i.status === "failed",
  );
  const autoSent = items.filter(
    (i) =>
      i.auto &&
      ["sent", "sending", "auto_queued", "unknown"].includes(i.status),
  );
  const [edits, setEdits] = useState({});
  const accounts = rows(snapshot.data.accounts).filter((a) => a.device_id);
  return h(
    "div",
    { className: "xhs-stack" },
    h(
      "div",
      { className: "xhs-stats" },
      h(Stat, {
        label: "新评论",
        value: items.filter((i) => i.status !== "ignored").length,
      }),
      h(Stat, {
        label: "已自动回复",
        value: autoSent.filter((i) => i.status === "sent").length,
        sub: eff.auto_reply
          ? `闲聊类 · 每账号每天 ≤ ${eff.auto_reply_daily} 条`
          : "未开启",
      }),
      h(Stat, { label: "待你审核", value: pending.length }),
      h(Stat, {
        label: "意向线索",
        value: leads.filter((l) => l.status === "new").length,
      }),
    ),
    h(
      Card,
      {
        title: "读取新评论",
        hint: "在手机上只读打开本人作品页，读取近 3 天的新评论；不点赞、不回复、不删除。",
      },
      accounts.map((a) =>
        h(
          "div",
          { key: a.id, className: "xhs-row" },
          h(
            "div",
            null,
            h("b", null, a.name),
            h(
              "div",
              { className: "xhs-meta" },
              a.inbox_checked_at
                ? `上次读取 ${fmt(a.inbox_checked_at, zone)}`
                : "还没有读取过",
            ),
          ),
          h(
            Button,
            {
              disabled: readOnly,
              onClick: async () => {
                await send(host, "inbox.collect", { account_id: a.id });
                await refresh();
              },
            },
            "读取新评论",
          ),
        ),
      ),
      !accounts.length &&
        h("div", { className: "xhs-empty" }, "没有绑定手机的账号"),
    ),
    h(
      Card,
      {
        title: "待你审核",
        hint: eff.auto_reply
          ? "闲聊类已按规则自动回复，不在这里。咨询和意向起草后等你通过；负面评价不起草。"
          : "所有回复都要你通过后才发送。",
      },
      pending.map((i) => {
        const draft = edits[i.id] ?? i.draft ?? "";
        return h(
          "div",
          { key: i.id, className: "xhs-row", style: { display: "block" } },
          h("div", null, h("b", null, `“${i.text}”`)),
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
            { style: { display: "flex", gap: 6, margin: "5px 0" } },
            pill(
              KIND_LABELS[i.kind] || i.kind,
              i.kind === "negative" ? "bad" : i.kind === "intent" ? "ok" : "",
            ),
            i.error && pill(i.error, "bad"),
          ),
          i.kind !== "negative" || edits[i.id] !== undefined
            ? h("input", {
                className: "xhs-input",
                value: draft,
                maxLength: 30,
                disabled: readOnly,
                placeholder: "回复草稿（30 字以内，不留联系方式，不承诺效果）",
                onChange: (e) => setEdits({ ...edits, [i.id]: e.target.value }),
              })
            : h("div", { className: "xhs-meta" }, "负面与投诉不自动起草"),
          h(
            "div",
            { className: "xhs-actions" },
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
            h(
              Button,
              {
                primary: true,
                disabled: readOnly || !draft.trim(),
                onClick: async () => {
                  let current = i;
                  if (edits[i.id] !== undefined && edits[i.id] !== i.draft) {
                    const result = await send(host, "reply.save", {
                      id: i.id,
                      version: i.version,
                      draft: edits[i.id],
                    });
                    current =
                      rows(result.data?.reply_items).find(
                        (x) => x.id === i.id,
                      ) || i;
                  }
                  await send(host, "reply.approve", {
                    id: i.id,
                    version: current.version,
                    handwritten: i.kind === "negative",
                  });
                  setEdits({ ...edits, [i.id]: undefined });
                  await refresh();
                },
              },
              "通过并发送",
            ),
            i.kind === "negative" &&
              edits[i.id] === undefined &&
              h(
                Button,
                { onClick: () => setEdits({ ...edits, [i.id]: "" }) },
                "手写回复",
              ),
            (i.kind === "intent" || i.kind === "question") &&
              !i.lead &&
              h(
                Button,
                {
                  disabled: readOnly,
                  onClick: async () => {
                    await send(host, "reply.lead", { id: i.id });
                    await refresh();
                  },
                },
                "记为线索",
              ),
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
      !pending.length &&
        h("div", { className: "xhs-empty" }, "没有待审核的评论"),
    ),
    h(
      "div",
      { className: "xhs-two even" },
      h(
        Card,
        {
          title: "已自动回复",
          hint: "闲聊类按规则直接发送，这里是事后清单。发得不合适可以删除回复，或在自动化与风控里改回“等我通过”。",
        },
        h(Table, {
          head: ["评论", "自动回复", "账号", "时间", "状态", ""],
          body: autoSent.map((i) => [
            `“${i.text}”`,
            i.sent_text || i.draft,
            accountName(snapshot, i.account_id),
            fmt(i.sent_at || i.created_at, zone, {
              hour: "2-digit",
              minute: "2-digit",
            }),
            pill(
              i.status === "sent"
                ? "已发送"
                : i.status === "auto_queued"
                ? "排队中"
                : statusLabel(i.status),
              i.status === "sent" ? "ok" : i.status === "unknown" ? "bad" : "",
            ),
            i.status === "sent"
              ? h(
                  Button,
                  {
                    danger: true,
                    disabled: readOnly,
                    onClick: async () => {
                      await send(host, "reply.delete", { id: i.id });
                      await refresh();
                    },
                  },
                  "删除回复",
                )
              : null,
          ]),
          empty: eff.auto_reply ? "今天还没有自动回复" : "闲聊类自动回复未开启",
        }),
      ),
      h(
        Card,
        {
          title: "意向线索",
          hint: "只记录公开评论内容和昵称，不采集个人信息；跟进由同事在平台内完成。",
        },
        h(Table, {
          head: ["评论", "来源笔记", "账号", "状态", ""],
          body: leads.map((l) => [
            `“${l.comment}”`,
            l.note_title,
            accountName(snapshot, l.account_id),
            pill(
              {
                new: "新",
                transferred: `已转交${l.assignee ? " · " + l.assignee : ""}`,
                contacted: "已联系",
                closed: "已关闭",
              }[l.status],
              l.status === "new" ? "warn" : "ok",
            ),
            h(
              "select",
              {
                className: "xhs-select",
                style: { marginTop: 0, width: 110 },
                value: l.status,
                disabled: readOnly,
                onChange: async (e) => {
                  await send(host, "lead.update", {
                    id: l.id,
                    status: e.target.value,
                    assignee: l.assignee || "",
                  });
                  await refresh();
                },
              },
              [
                ["new", "新"],
                ["transferred", "已转交"],
                ["contacted", "已联系"],
                ["closed", "已关闭"],
              ].map(([v, t]) => h("option", { key: v, value: v }, t)),
            ),
          ]),
          empty: "还没有线索",
        }),
      ),
    ),
  );
}

// ---- 自动化与风控 ----
function SettingsPanel({ snapshot, host, readOnly, refresh, go }) {
  const eff = snapshot.data.effective_policy || {};
  const saved = snapshot.data.member_settings || {};
  const [form, setForm] = useState(saved);
  useEffect(
    () => setForm(snapshot.data.member_settings || {}),
    [saved.version],
  );
  const set = (k, v) => setForm({ ...form, [k]: v });
  const capRank = ["manual", "semi", "full"].indexOf(
    eff.automation_cap || "full",
  );
  const payload = Object.fromEntries(
    Object.entries(form).filter(
      ([k]) =>
        ![
          "paused",
          "paused_at",
          "paused_scope",
          "cold_start",
          "updated_at",
        ].includes(k),
    ),
  );
  const save = async () => {
    await send(host, "settings.save", payload);
    await refresh();
  };
  const level = (key, name, hint, items) =>
    h(
      "button",
      {
        key,
        className: `xhs-level${form.automation_level === key ? " active" : ""}`,
        disabled: readOnly || ["manual", "semi", "full"].indexOf(key) > capRank,
        onClick: () => set("automation_level", key),
      },
      h("b", null, name),
      h("div", { className: "xhs-meta", style: { margin: "6px 0" } }, hint),
      items.map((x) => h("div", { key: x, style: { fontSize: 12 } }, x)),
    );
  return h(
    "div",
    { className: "xhs-stack" },
    h(
      "section",
      {
        className: `xhs-card xhs-banner${
          eff.enterprise_paused ? " paused" : ""
        }`,
      },
      h(Lock, {
        children: eff.enterprise_paused
          ? "企业已暂停全部自动任务"
          : "企业规则生效中",
      }),
      h(
        "span",
        { style: { flex: 1 } },
        eff.enterprise_paused
          ? eff.enterprise_paused_reason ||
              "管理员暂停了全企业的养号、发布和回复。"
          : "自动化上限、发布节奏、禁用词和高风险复核人由管理员在后台设定，这里只能设得更严。",
      ),
      h(
        Button,
        { onClick: () => go("settings", "entitlement") },
        "查看能力与配额",
      ),
    ),
    h(
      Card,
      {
        title: "自动化程度",
        hint: "三档共用同一个工作台、草稿库和审核发布流程，区别只在系统替你做多少。发布、改资料和养号评论都要你确认。",
      },
      h(
        "div",
        {
          style: {
            display: "grid",
            gridTemplateColumns: "repeat(3,minmax(0,1fr))",
            gap: 10,
          },
        },
        level("manual", "手动", "你来写、你来排", [
          "任务：手动指定账号和时间",
          "文案：自己写",
          "配图：自己上传",
        ]),
        level("semi", "半自动", "AI 帮你写和配图，你来安排", [
          "任务：手动指定账号和时间",
          "文案：套母版或仿写参考",
          "配图：平台 AI 生图，可带参考图",
        ]),
        level("full", "全自动", "AI 主动准备，你只审核", [
          "任务：自动匹配账号、类型、时间",
          "文案与配图：自动生成",
          "维护：闲聊回复可自动发，其余等你通过",
        ]),
      ),
      h(
        "div",
        { className: "xhs-two even" },
        h(Select, {
          label: "AI 主动准备内容",
          value: form.ai_proactive,
          onChange: (v) => set("ai_proactive", v),
          options: Object.entries(FREQ_LABELS),
        }),
        h(NumberField, {
          label: "每次最多准备（篇）",
          value: form.max_per_run,
          onChange: (v) => set("max_per_run", v),
        }),
      ),
    ),
    h(
      "div",
      { className: "xhs-two even" },
      h(
        "div",
        { className: "xhs-stack" },
        h(
          Card,
          { title: "发布节奏" },
          h(
            "div",
            { className: "xhs-two even" },
            h(NumberField, {
              label: "同一账号发布最小间隔（小时）",
              value: form.min_interval_hours,
              onChange: (v) => set("min_interval_hours", v),
              hint: `生效：${eff.min_interval_hours} 小时`,
            }),
            h(NumberField, {
              label: "每账号每周最多发布（篇）",
              value: form.weekly_max_posts,
              onChange: (v) => set("weekly_max_posts", v),
              hint: `生效：${eff.weekly_max_posts} 篇`,
            }),
            h(NumberField, {
              label: "营销内容占比上限（%）",
              value: form.marketing_ratio_max,
              onChange: (v) => set("marketing_ratio_max", v),
              hint: `生效：${eff.marketing_ratio_max}%`,
            }),
            h(Field, {
              label: "允许发布的时段",
              value: form.publish_window,
              onChange: (v) => set("publish_window", v),
            }),
            h(Select, {
              label: "资料变更当天",
              value: form.profile_change_day,
              onChange: (v) => set("profile_change_day", v),
              options: [
                ["hold", "不发布、不养号"],
                ["publish_only", "只发布"],
              ],
            }),
            h(Select, {
              label: "发布失败后",
              value: form.on_publish_failure,
              onChange: (v) => set("on_publish_failure", v),
              options: [
                ["stop", "停下，等人工处理"],
                ["retry_once", "下个时段重试一次"],
              ],
            }),
          ),
        ),
        h(
          Card,
          { title: "敏感词" },
          h(
            "div",
            { className: "xhs-row" },
            h(
              "div",
              null,
              h("b", null, "企业禁用词与行业词库"),
              h(
                "div",
                { className: "xhs-meta" },
                `${rows(eff.banned_words).length} 个企业词 · 词库：${
                  rows(eff.libraries).join("、") || "未同步"
                }`,
              ),
            ),
            h(Lock, { children: "只读" }),
          ),
          h(Field, {
            label: "我补充的敏感词（每行一个）",
            multiline: true,
            value: rows(form.my_words).join("\n"),
            onChange: (v) => set("my_words", v.split("\n")),
          }),
        ),
      ),
      h(
        "div",
        { className: "xhs-stack" },
        h(
          Card,
          {
            title: "回复规则",
            hint: "闲聊类可以自动发送，事后在清单和对话卡片里通知你；其余类型起草后等你通过。",
          },
          h(Select, {
            label: "闲聊类回复",
            value: form.small_talk,
            disabled: !eff.auto_reply_enterprise && form.small_talk !== "auto",
            onChange: (v) => set("small_talk", v),
            options: [
              ["review", "起草后等我通过"],
              [
                "auto",
                eff.auto_reply_enterprise
                  ? "自动发送，事后通知我"
                  : "自动发送（企业未开启）",
              ],
            ],
          }),
          h(Select, {
            label: "自动回复用语",
            value: form.reply_wording,
            onChange: (v) => set("reply_wording", v),
            options: [
              ["phrases", "只用我审核过的短句"],
              ["ai", "AI 自拟，15 字以内"],
            ],
          }),
          h(Field, {
            label: "审核过的短句（每行一个）",
            multiline: true,
            value: rows(form.reply_phrases).join("\n"),
            onChange: (v) => set("reply_phrases", v.split("\n")),
          }),
          h(
            "div",
            { className: "xhs-two even" },
            h(NumberField, {
              label: "每个账号每小时最多自动回复",
              value: form.auto_reply_hourly,
              onChange: (v) => set("auto_reply_hourly", v),
            }),
            h(NumberField, {
              label: "每个账号每天最多自动回复",
              value: form.auto_reply_daily,
              onChange: (v) => set("auto_reply_daily", v),
              hint: `生效：${eff.auto_reply_daily} 条`,
            }),
          ),
          h(Select, {
            label: "回复口吻",
            value: form.reply_tone,
            onChange: (v) => set("reply_tone", v),
            options: [
              ["persona", "跟随账号人设"],
              ["service", "统一客服口吻"],
            ],
          }),
          [
            "咨询、意向：起草后等你通过",
            "负面与投诉：不起草，转人工",
            "分类拿不准或命中敏感词：不自动发",
            "账号有异常或已暂停：停止自动回复",
            "不留联系方式，不承诺效果",
          ].map((x) =>
            h(
              "div",
              { key: x, className: "xhs-row" },
              x,
              h(Lock, { children: "固定" }),
            ),
          ),
        ),
        h(
          Card,
          {
            title: "账号保护",
            hint: "出现平台提示、验证码或登录失效时，系统只会停下来等你处理，不会重试、换设备或换账号继续。",
          },
          h(
            "div",
            { className: "xhs-row" },
            "账号受限或平台提示违规：暂停该账号至少 72 小时",
            h(Lock, { children: "固定" }),
          ),
          h(
            "div",
            { className: "xhs-row" },
            "登录失效或要求验证码：暂停这台手机的队列",
            h(Lock, { children: "固定" }),
          ),
          h(
            "div",
            { className: "xhs-two even" },
            h(NumberField, {
              label: "每个账号每天自动操作时长上限（分钟）",
              value: form.daily_minutes_cap,
              onChange: (v) => set("daily_minutes_cap", v),
            }),
            h(Select, {
              label: "恢复后的前 3 天",
              value: form.resume_mode,
              onChange: (v) => set("resume_mode", v),
              options: [
                ["start_stage", "按“起步”档执行"],
                ["keep", "按原预算执行"],
              ],
            }),
          ),
        ),
      ),
    ),
    h(
      "div",
      { className: "xhs-actions" },
      h(
        Button,
        { primary: true, disabled: readOnly, onClick: save },
        "保存设置",
      ),
    ),
  );
}

// ---- 授权台账 ----
function ConsentPanel({ snapshot, host, readOnly, refresh }) {
  const list = rows(snapshot.data.authorizations);
  const accounts = rows(snapshot.data.accounts);
  const today = new Date().toISOString().slice(0, 10);
  const blank = {
    person: "",
    role: "employee",
    covers: ["portrait", "experience"],
    account_ids: [],
    usage: "own_account_no_rewrite",
    valid_from: today,
    valid_to: "",
    proof_asset: "",
  };
  const [form, setForm] = useState(blank);
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
  const days = (d) => Math.round((new Date(d) - new Date()) / 86400000);
  return h(
    "div",
    { className: "xhs-stack" },
    h(
      "div",
      { className: "xhs-stats" },
      h(Stat, {
        label: "有效授权",
        value: list.filter((c) => c.status === "active").length,
      }),
      h(Stat, {
        label: "30 天内到期",
        value: list.filter(
          (c) => c.status === "active" && days(c.valid_to) <= 30,
        ).length,
      }),
      h(Stat, {
        label: "已撤回",
        value: list.filter((c) => c.status === "withdrawn").length,
      }),
      h(Stat, {
        label: "待补授权书",
        value: list.filter((c) => c.status === "proof_missing").length,
      }),
    ),
    h(
      Card,
      {
        title: "授权台账",
        hint: "人物形象、真实经历、托管账号和案例资料的授权都登记在这里。撤回后，关联的素材冻结，未发布的草稿退回待制作，已发布的列出来由你处理。",
      },
      h(Table, {
        head: [
          "授权人",
          "授权内容",
          "可用账号",
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
            .join("、"),
          rows(c.account_ids)
            .map((id) => accountName(snapshot, id))
            .join("、") || "—",
          `${c.valid_from} 至 ${c.valid_to}`,
          c.proof_asset || pill("待上传", "warn"),
          `素材 ${
            rows(snapshot.data.materials).filter((m) => m.consent_id === c.id)
              .length
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
          ),
          c.status === "withdrawn"
            ? !c.published_handled &&
              h(
                Button,
                {
                  disabled: readOnly,
                  onClick: async () => {
                    await send(host, "consent.handled", { id: c.id });
                    await refresh();
                  },
                },
                `已处理 ${rows(c.published_drafts).length} 篇已发布内容`,
              )
            : h(
                "span",
                { style: { display: "flex", gap: 6 } },
                h(
                  Button,
                  { disabled: readOnly, onClick: () => setForm({ ...c }) },
                  c.status === "proof_missing" ? "补授权书" : "续期或修改",
                ),
                h(
                  Button,
                  {
                    danger: true,
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
              ),
        ]),
        empty: "还没有登记授权",
      }),
    ),
    h(
      Card,
      { title: form.id ? `修改授权 · ${form.person}` : "登记新授权" },
      h(
        "div",
        { className: "xhs-two even" },
        h(Field, {
          label: "授权人",
          value: form.person,
          onChange: (v) => setForm({ ...form, person: v }),
        }),
        h(Select, {
          label: "身份",
          value: form.role,
          onChange: (v) => setForm({ ...form, role: v }),
          options: Object.entries(ROLES),
        }),
        h(Field, {
          label: "生效日期",
          type: "date",
          value: form.valid_from,
          onChange: (v) => setForm({ ...form, valid_from: v }),
        }),
        h(Field, {
          label: "到期日期",
          type: "date",
          value: form.valid_to,
          onChange: (v) => setForm({ ...form, valid_to: v }),
        }),
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
      h("div", { className: "xhs-label" }, "可用账号（不选表示不限定）"),
      h(
        "div",
        { style: { display: "flex", gap: 14, flexWrap: "wrap" } },
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
      h(Select, {
        label: "可用内容",
        value: form.usage,
        onChange: (v) => setForm({ ...form, usage: v }),
        options: [
          ["own_account_no_rewrite", "图文，不可改写成他人经历"],
          ["image_and_reference", "图文与生图参考"],
        ],
      }),
      h(Field, {
        label: "授权书（文件名或存档编号）",
        value: form.proof_asset,
        onChange: (v) => setForm({ ...form, proof_asset: v }),
        placeholder: "没有授权书时状态为“待补授权书”，关联素材暂不可用",
      }),
      h(
        "div",
        { className: "xhs-actions" },
        h(
          Button,
          {
            primary: true,
            disabled:
              readOnly ||
              !form.person.trim() ||
              !form.valid_to ||
              !form.covers.length,
            onClick: async () => {
              const body = Object.fromEntries(
                [
                  "person",
                  "role",
                  "covers",
                  "account_ids",
                  "usage",
                  "valid_from",
                  "valid_to",
                  "proof_asset",
                ].map((k) => [k, form[k]]),
              );
              await send(host, "consent.save", {
                ...body,
                id: form.id || "",
                version: form.version ?? null,
              });
              setForm(blank);
              await refresh();
            },
          },
          "保存",
        ),
        form.id && h(Button, { onClick: () => setForm(blank) }, "取消"),
      ),
      h(
        "div",
        { className: "xhs-meta", style: { marginTop: 8 } },
        "AI 虚拟角色不需要个人授权；图片带“虚拟人物”标记，不能写成真实消费体验或效果证明。案例与病例资料需要当事人书面授权，医疗美容内容还需医疗广告审查。",
      ),
    ),
  );
}

// ---- 能力与配额 ----
const FEATURE_INFO = [
  [
    "xhs.content",
    "内容创作",
    "内容计划 · 创作编辑器 · 素材库 · 内容母版 · 业务资料 · AI 生图",
  ],
  ["xhs.publish", "内容发布", "排期日历 · 批量发布 · 发布与历史 · 执行队列"],
  [
    "xhs.ops",
    "运营管理",
    "项目与画像 · 人设规划 · 账号与设备 · 新号资料 · 日常运营 · 冷启动方案 · 异常与告警",
  ],
  ["xhs.comment", "评论互动", "评论审核 · 笔记维护（回复评论）· 意向线索"],
  ["xhs.takeover", "账号托管", "老号接管 · 账号审计 · 诊断 · 资料变更单"],
  ["xhs.analytics", "数据分析", "复盘报表 · 数据同步"],
];
function EntitlementPanel({ snapshot, host, readOnly, refresh }) {
  const license = snapshot.license || {};
  const policy = license.policy || {};
  const caps = policy.caps || {};
  const rules = policy.rules || {};
  const usage = policy.usage || {};
  const quota = policy.member_quota || {};
  const requests = rows(snapshot.data.member_requests);
  const [req, setReq] = useState({ kinds: ["posts"], amount: "", note: "" });
  const q = (label, mine, mineCap, ent, entCap, unit) =>
    h(
      "div",
      {
        key: label,
        style: { padding: "9px 0", borderBottom: `1px solid ${C.line}` },
      },
      h(
        "div",
        { style: { display: "flex", justifyContent: "space-between" } },
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
      h("b", null, "小红薯运营许可"),
      h(
        "span",
        { className: "xhs-meta" },
        `状态 ${
          {
            active: "有效",
            expired: "已过期",
            revoked: "已撤销",
            read_only: "只读",
          }[license.status] || statusLabel(license.status)
        } · ${
          license.expires_at
            ? "至 " + String(license.expires_at).slice(0, 10)
            : "不限期"
        } · 平台授予，企业管理员分配`,
      ),
      h("span", { style: { flex: 1 } }),
      pill(`自动化上限 ${LEVEL_LABELS[caps.automation_cap] || "—"}`, "ok"),
      pill(`母版范围 ${rows(caps.template_scope).join(" + ") || "—"}`),
    ),
    h(
      "div",
      { className: "xhs-grid" },
      FEATURE_INFO.map(([key, label, unlocks]) =>
        h(
          "div",
          {
            key,
            className: "xhs-card",
            style: hasFeature(license, key) ? undefined : { opacity: 0.6 },
          },
          h(
            "div",
            { style: { display: "flex", gap: 8, alignItems: "center" } },
            h("b", { style: { flex: 1 } }, label),
            hasFeature(license, key)
              ? pill("已分配给我", "ok")
              : h(Lock, { children: "未分配" }),
          ),
          h("div", { className: "xhs-meta", style: { marginTop: 6 } }, unlocks),
        ),
      ),
    ),
    h(
      "div",
      { className: "xhs-meta" },
      "不需要单独分配：工作台、授权台账、自动化与风控、能力与配额。",
    ),
    h(
      "div",
      { className: "xhs-two even" },
      h(
        Card,
        {
          title: "我的用量与企业额度",
          hint: "红色是我的用量，紫色是企业合计。",
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
        h(
          "div",
          { style: { padding: "9px 0" } },
          h("b", null, "账号与手机"),
          h(
            "span",
            { className: "xhs-meta" },
            ` 企业上限 ${license.limits?.accounts ?? 0} 个账号 · ${
              license.limits?.devices ?? 0
            } 台手机${
              quota.accounts != null ? ` · 我最多 ${quota.accounts} 个账号` : ""
            }`,
          ),
        ),
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
              rules.auto_reply_enabled
                ? `允许 · 每账号每天 ≤ ${rules.auto_reply_daily_cap} 条`
                : "不允许",
              rules.auto_reply_enabled ? "关闭，或设得更少" : "—",
            ],
            ["紧急暂停", rules.paused ? "已暂停" : "未暂停", "暂停自己的任务"],
          ],
        }),
      ),
    ),
    h(
      "div",
      { className: "xhs-two even" },
      h(
        Card,
        { title: "向管理员申请" },
        h(
          "div",
          { style: { display: "flex", gap: 14, flexWrap: "wrap" } },
          [
            ["posts", "更多内容额度"],
            ["images", "更多生图额度"],
            ["accounts", "更多账号"],
            ["feature", "未分配的能力"],
            ["templates", "更多母版范围"],
          ].map(([k, l]) =>
            h(Check, {
              key: k,
              label: l,
              checked: req.kinds.includes(k),
              onChange: (on) =>
                setReq({
                  ...req,
                  kinds: on
                    ? [...req.kinds, k]
                    : req.kinds.filter((x) => x !== k),
                }),
            }),
          ),
        ),
        h(Field, {
          label: "期望数量",
          value: req.amount,
          onChange: (v) => setReq({ ...req, amount: v }),
          placeholder: "例如：每月内容 80 篇",
        }),
        h(Field, {
          label: "说明",
          value: req.note,
          onChange: (v) => setReq({ ...req, note: v }),
        }),
        h(
          "div",
          { className: "xhs-actions" },
          h(
            Button,
            {
              primary: true,
              disabled: readOnly || !req.kinds.length,
              onClick: async () => {
                await send(host, "request.create", req);
                setReq({ kinds: ["posts"], amount: "", note: "" });
                await refresh();
              },
            },
            "提交申请",
          ),
          h(
            Button,
            {
              onClick: async () => {
                await send(host, "catalog.refresh", {});
                await refresh();
              },
            },
            "刷新申请状态",
          ),
        ),
      ),
      h(
        Card,
        { title: "我的申请" },
        h(Table, {
          head: ["申请", "时间", "状态"],
          body: requests.map((r) => [
            `${rows(r.kinds).join("、")} ${r.amount || ""}`,
            fmt(r.created_at, tz(snapshot)),
            pill(
              r.status === "pending"
                ? "管理员处理中"
                : r.status === "approved"
                ? "已通过"
                : "已拒绝",
              r.status === "approved"
                ? "ok"
                : r.status === "pending"
                ? "warn"
                : "",
            ),
          ]),
          empty: "还没有申请",
        }),
      ),
    ),
  );
}

// ---- 创作编辑器补充：性质、母版、披露、检查 ----
function DraftMeta({ snapshot, host, readOnly, refresh, draftId }) {
  const draft = rows(snapshot.data.drafts).find((d) => d.id === draftId);
  if (!draft) return null;
  const templates = rows(snapshot.data.catalog_cache?.templates).filter(
    (t) => t.available !== false,
  );
  const meta = async (patch, fix = false) => {
    await send(host, "content.meta", {
      id: draft.id,
      meta: patch,
      fix_labels: fix,
    });
    await refresh();
  };
  return h(
    "div",
    { className: "xhs-card", style: { marginTop: 12 } },
    h("h3", null, "发布前检查与内容性质"),
    h(
      "div",
      { className: "xhs-two even" },
      h(Select, {
        label: "内容性质",
        value: draft.nature || "",
        disabled: readOnly,
        onChange: (v) => meta({ nature: v }),
        options: [
          ["", "请选择"],
          ["marketing", "营销内容 · 需披露"],
          ["life", "生活内容"],
          ["knowledge", "知识内容"],
        ],
      }),
      h(Select, {
        label: "内容母版",
        value: draft.template_id || "",
        disabled: readOnly,
        onChange: (v) => meta({ template_id: v }),
        options: [["", "不使用母版"], ...templates.map((t) => [t.id, t.name])],
      }),
    ),
    rows(draft.checks?.items).map((i) =>
      h(
        "div",
        { key: i.key, className: "xhs-row" },
        h("span", null, i.label),
        h(
          "span",
          {
            className: `xhs-pill ${
              i.level === "ok" ? "ok" : i.level === "bad" ? "bad" : "warn"
            }`,
          },
          (i.level === "ok" ? "✓ " : i.level === "bad" ? "✕ " : "! ") +
            i.detail,
        ),
      ),
    ),
    !draft.checks && h("div", { className: "xhs-meta" }, "还没有检查"),
    h(
      "div",
      { className: "xhs-actions" },
      h(
        Button,
        { disabled: readOnly, onClick: () => meta({}, true) },
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
      h(
        Button,
        {
          primary: true,
          disabled: readOnly || draft.checks?.blocking,
          onClick: async () => {
            await send(host, "plan.update", {
              action: "approve",
              ids: [draft.id],
            });
            await refresh();
          },
        },
        "提交审核并通过",
      ),
    ),
    rows(draft.review_log).length > 0 &&
      h(
        "div",
        { style: { marginTop: 8 } },
        rows(draft.review_log).map((x, i) =>
          h(
            "div",
            { key: i, className: "xhs-meta" },
            `${fmt(x.at, tz(snapshot))} · ${x.event}`,
          ),
        ),
      ),
  );
}

// ---- 暂停全部自动任务 ----
function PauseButton({ snapshot, host, readOnly, refresh }) {
  const settings = snapshot.data.member_settings || {};
  const eff = snapshot.data.effective_policy || {};
  const paused = Boolean(settings.paused);
  return h(
    "span",
    { style: { display: "inline-flex", gap: 6, alignItems: "center" } },
    eff.enterprise_paused && pill("企业已暂停", "bad"),
    h(
      "span",
      { className: "xhs-pill ok" },
      `${LEVEL_LABELS[eff.automation_level] || "半自动"} · 关键动作需你确认`,
    ),
    h(
      Button,
      {
        danger: !paused,
        disabled: readOnly,
        onClick: async () => {
          if (
            !paused &&
            !window.confirm(
              "暂停你的全部养号、发布和回复？正在执行的任务会在当前这一步结束后停下，已排期的内容保留。",
            )
          )
            return;
          await send(host, "pause.set", { paused: !paused });
          await refresh();
        },
      },
      paused ? "恢复自动任务" : "暂停全部自动任务",
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

// ---- 账号档案：一个账号的全部信息，以及转交给同事 ----
const TRANSFER_STATUS = {
  pending_approval: ["待管理员审批", "warn"],
  approved: ["待对方接收", "warn"],
  accepted: ["对方导入中", "warn"],
  completed: ["已转交", "ok"],
  rejected: ["管理员未通过", ""],
  declined: ["对方已拒收", ""],
  cancelled: ["已撤回", ""],
};
const HEALTH_LABELS = {
  healthy: ["正常", "ok"],
  paused: ["已暂停", "bad"],
  unconfigured: ["待绑定手机", "warn"],
  transferring: ["转交中", "warn"],
};
const PROFILE_LABELS = [
  ["nickname", "名字"],
  ["bio", "简介"],
  ["occupation", "职业"],
  ["gender", "性别"],
  ["birthday", "生日"],
  ["region", "地区"],
];
const PERSONA_LABELS = [
  ["age", "年龄"],
  ["gender", "性别"],
  ["region", "地区"],
  ["occupation", "职业"],
  ["life_status", "生活状态"],
];
const SUMMARY_LABELS = {
  drafts: "未发布草稿",
  materials: "素材",
  authorizations: "授权",
  leads: "线索",
  images: "图片",
};

function KV({ label, children }) {
  return h(
    "div",
    { className: "xhs-row", style: { padding: "7px 0" } },
    h("span", { className: "xhs-meta" }, label),
    h("span", { style: { textAlign: "right", minWidth: 0 } }, children),
  );
}

function TransferDialog({ snapshot, host, account, onClose, refresh }) {
  const transfer = snapshot.data.transfers || {};
  const members = rows(transfer.members);
  const [to, setTo] = useState(members[0]?.id || "");
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

function AccountProfilePanel({ snapshot, host, readOnly, refresh, go, focus }) {
  const data = snapshot.data;
  const zone = tz(snapshot);
  const accounts = rows(data.accounts);
  const [selected, setSelected] = useState(focus || accounts[0]?.id || "");
  const [transferring, setTransferring] = useState(false);
  useEffect(() => {
    if (focus) setSelected(focus);
  }, [focus]);
  useEffect(() => {
    // Pick up transfers decided while the page was closed; a desktop without an enterprise has none.
    send(host, "transfer.sync", {})
      .then(() => refresh())
      .catch(() => undefined);
  }, []);
  const account = accounts.find((a) => a.id === selected) || accounts[0];
  const incoming = h(IncomingTransfers, {
    snapshot,
    host,
    readOnly,
    refresh,
    onImported: (id) => setSelected(id),
  });
  if (!account)
    return h(
      "div",
      { className: "xhs-stack" },
      incoming,
      h(
        Card,
        { title: "账号档案" },
        h(
          "div",
          { className: "xhs-empty" },
          "还没有账号。在 建号 › 账号与设备 里添加。",
        ),
      ),
    );
  const id = account.id;
  const health =
    rows(data.account_health).find((x) => x.account_id === id) || {};
  const stage = (data.cold_start_status || {})[id];
  const device = rows(snapshot.devices).find(
    (d) => d.device_id === account.device_id,
  );
  const project = rows(data.projects).find((p) => p.id === account.project_id);
  const drafts = rows(data.drafts).filter((d) => d.account_id === id);
  const upcoming = drafts
    .filter((d) => d.scheduled_at && d.review_status !== "published")
    .sort((a, b) => (a.scheduled_at < b.scheduled_at ? -1 : 1));
  const published = drafts.filter((d) => d.review_status === "published");
  const runs = rows(data.runs).filter((r) => r.account_id === id);
  const replies = rows(data.reply_items).filter((r) => r.account_id === id);
  const leads = rows(data.leads).filter((l) => l.account_id === id);
  const materials = rows(data.materials).filter((m) =>
    rows(m.account_ids).includes(id),
  );
  const consents = rows(data.authorizations).filter((c) =>
    rows(c.account_ids).includes(id),
  );
  const audits = rows(data.audits).filter((a) => a.account_id === id);
  const orders = rows(data.change_orders).filter((o) => o.account_id === id);
  const transfer = account.transfer;
  const before = rows(account.history_before_transfer);
  const [stateLabel, stateTone] = HEALTH_LABELS[health.state] || [
    "待配置",
    "warn",
  ];
  const persona = account.persona || {};
  const tags = account.persona_tags || {};
  const profile = account.profile_draft || {};
  const history = [
    ...published.map((d) => ({
      at: d.published_at || d.updated_at || d.scheduled_at,
      text: `发布「${d.title}」`,
      tone: "ok",
    })),
    ...runs
      .filter((r) => r.kind !== "publish")
      .map((r) => ({
        at: r.updated_at || r.created_at,
        text: `${RUN_LABELS[r.kind] || r.kind} · ${statusLabel(r.status)}`,
        tone: ["unknown", "interrupted", "error", "failed"].includes(r.status)
          ? "bad"
          : "",
      })),
    ...before.map((x) => ({
      at: x.at,
      text: `${
        x.kind === "publish"
          ? `发布「${x.title}」`
          : `${RUN_LABELS[x.kind] || x.kind} · ${statusLabel(x.status)}`
      }（转交前）`,
      tone: "",
    })),
  ]
    .filter((x) => x.at)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 12);
  const outgoing = rows(data.transfers?.items).filter(
    (t) => t.account_id === id,
  );
  return h(
    "div",
    { className: "xhs-stack" },
    incoming,
    h(
      "section",
      {
        className: "xhs-card",
        style: {
          display: "flex",
          gap: 14,
          alignItems: "center",
          flexWrap: "wrap",
        },
      },
      h(
        "div",
        {
          style: {
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "#ffe3e7",
            color: C.red,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            fontWeight: 700,
            flex: "none",
          },
        },
        (account.name || "?").slice(0, 1),
      ),
      h(
        "div",
        { style: { flex: 1, minWidth: 200 } },
        h(
          "div",
          {
            style: {
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            },
          },
          h("b", { style: { fontSize: 16 } }, account.name),
          pill(stateLabel, stateTone),
          pill(account.entry_mode === "new" ? "新账号" : "已有账号"),
        ),
        h(
          "div",
          { className: "xhs-meta", style: { marginTop: 4 } },
          [
            account.platform_account_id
              ? `小红薯号 ${account.platform_account_id}`
              : "未核对小红薯号",
            project ? `项目 ${project.name}` : "",
            stage
              ? stage.graduated
                ? "日常运营"
                : `冷启动 · ${stage.name} · 第 ${stage.day} 天`
              : "",
          ]
            .filter(Boolean)
            .join(" · "),
        ),
        account.transferred_in &&
          h(
            "div",
            { className: "xhs-meta" },
            `${account.transferred_in.from_member_name || "同事"} 于 ${fmt(
              account.transferred_in.at,
              zone,
            )} 转交给你`,
          ),
      ),
      accounts.length > 1 &&
        h(
          "select",
          {
            className: "xhs-select",
            style: { width: 200, marginTop: 0 },
            value: id,
            "aria-label": "选择账号",
            onChange: (e) => setSelected(e.target.value),
          },
          accounts.map((a) =>
            h("option", { key: a.id, value: a.id }, a.name || a.id),
          ),
        ),
      h(
        "span",
        { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
        h(
          Button,
          { onClick: () => go("build", "accounts") },
          account.device_id ? "账号与设备" : "绑定手机",
        ),
        h(Button, { onClick: () => go("nurture", "operations") }, "日常运营"),
        !transfer &&
          h(
            Button,
            { disabled: readOnly, onClick: () => setTransferring(true) },
            "转交给同事",
          ),
      ),
    ),
    transfer &&
      h(
        "section",
        { className: "xhs-card xhs-banner paused" },
        h(Lock, { children: "转交中" }),
        h(
          "span",
          { style: { flex: 1 } },
          `正在转交给 ${transfer.to_member_name || "同事"} · ${
            (TRANSFER_STATUS[transfer.status] || [transfer.status])[0]
          }。这期间账号暂停全部自动任务，也不能修改。`,
        ),
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
    account.transfer_returned &&
      !transfer &&
      h(
        "section",
        { className: "xhs-card xhs-banner" },
        h(
          "span",
          { style: { flex: 1 } },
          `上次转交${
            (TRANSFER_STATUS[account.transfer_returned.status] || ["已结束"])[0]
          }${
            account.transfer_returned.note
              ? "：" + account.transfer_returned.note
              : ""
          }，账号已恢复。`,
        ),
      ),
    transferring &&
      h(TransferDialog, {
        snapshot,
        host,
        account,
        refresh,
        onClose: () => setTransferring(false),
      }),
    h(
      "div",
      { className: "xhs-two" },
      h(
        "div",
        { className: "xhs-stack" },
        h(
          Card,
          {
            title: "人设与定位",
            right: h(
              Button,
              { onClick: () => go("build", "personas") },
              "人设规划",
            ),
          },
          h(
            "div",
            null,
            account.positioning ||
              h("span", { className: "xhs-meta" }, "还没有定位"),
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                margin: "8px 0",
              },
            },
            [...rows(tags.vertical), ...rows(tags.general)].map((t) =>
              h("span", { key: t, className: "xhs-pill" }, t),
            ),
          ),
          PERSONA_LABELS.filter(([k]) => persona[k]).map(([k, l]) =>
            h(KV, { key: k, label: l }, persona[k]),
          ),
        ),
        h(
          Card,
          {
            title: "主页资料",
            right: h(
              Button,
              {
                onClick: () =>
                  go(
                    "build",
                    account.entry_mode === "new" ? "profiles" : "audits",
                  ),
              },
              account.entry_mode === "new" ? "新号资料" : "老号接管",
            ),
          },
          PROFILE_LABELS.some(([k]) => profile[k])
            ? PROFILE_LABELS.map(([k, l]) =>
                h(
                  KV,
                  { key: k, label: l },
                  profile[k] || h("span", { className: "xhs-meta" }, "—"),
                ),
              )
            : h("div", { className: "xhs-empty" }, "还没有资料草稿"),
          audits.length > 0 &&
            h(
              KV,
              { label: "账号审计" },
              `${audits.length} 次 · 最近 ${statusLabel(
                audits[audits.length - 1].status,
              )}`,
            ),
          orders.length > 0 &&
            h(
              KV,
              { label: "资料变更单" },
              `${orders.length} 张 · 最近 ${statusLabel(
                orders[orders.length - 1].status,
              )}`,
            ),
        ),
        h(
          Card,
          {
            title: "内容",
            right: h(
              Button,
              { onClick: () => go("content", "plan") },
              "内容计划",
            ),
          },
          h(
            "div",
            {
              style: {
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                marginBottom: 8,
              },
            },
            Object.entries(REVIEW_LABELS)
              .filter(([k]) => k !== "scheduled")
              .map(([k, l]) => [
                l,
                drafts.filter(
                  (d) =>
                    (d.review_status || "pending_review") === k ||
                    (k === "approved" && d.review_status === "scheduled"),
                ).length,
              ])
              .filter(([, n]) => n > 0)
              .map(([l, n]) =>
                h("span", { key: l, className: "xhs-pill" }, `${l} ${n}`),
              ),
          ),
          h(Table, {
            head: ["接下来", "排期", "检查"],
            body: upcoming
              .slice(0, 5)
              .map((d) => [
                d.title,
                fmt(d.scheduled_at, zone),
                checkPills(d.checks),
              ]),
            empty: "没有排期中的内容",
          }),
        ),
        h(
          Card,
          { title: "运营记录" },
          history.length
            ? history.map((x, i) =>
                h(
                  "div",
                  { key: i, className: "xhs-row", style: { padding: "6px 0" } },
                  h(
                    "span",
                    { className: x.tone === "bad" ? "xhs-danger" : "" },
                    x.text,
                  ),
                  h("span", { className: "xhs-meta" }, fmt(x.at, zone)),
                ),
              )
            : h("div", { className: "xhs-empty" }, "还没有记录"),
        ),
      ),
      h(
        "div",
        { className: "xhs-stack" },
        h(
          Card,
          { title: "手机与登录" },
          h(
            KV,
            { label: "手机" },
            device
              ? `${device.name || device.device_id}${
                  device.online ? "" : " · 离线"
                }`
              : account.device_id
              ? account.device_id
              : "未绑定",
          ),
          h(
            KV,
            { label: "登录" },
            pill(
              health.login === "ok"
                ? "正常"
                : health.login === "lost"
                ? "登录失效"
                : "未绑定",
              health.login === "ok" ? "ok" : "bad",
            ),
          ),
          h(
            KV,
            { label: "身份核对" },
            account.identity_confirmed_at
              ? fmt(account.identity_confirmed_at, zone)
              : account.entry_mode === "new"
              ? "新账号"
              : "未核对",
          ),
          h(
            KV,
            { label: "近 7 天养号完成率" },
            health.nurture_rate == null ? "—" : `${health.nurture_rate}%`,
          ),
          h(
            KV,
            { label: "近 7 天发布" },
            `${health.publish_ok ?? 0} / ${health.publish_total ?? 0}${
              health.publish_unknown
                ? ` · ${health.publish_unknown} 篇结果不明`
                : ""
            }`,
          ),
          rows(health.notices).length > 0 &&
            h(
              KV,
              { label: "平台通知" },
              rows(health.notices).slice(-1)[0].text,
            ),
        ),
        h(
          Card,
          {
            title: "评论与线索",
            right: h(
              Button,
              { onClick: () => go("publish", "upkeep") },
              "笔记维护",
            ),
          },
          h(
            KV,
            { label: "待你审核的回复" },
            replies.filter((r) => ["new", "failed"].includes(r.status)).length,
          ),
          h(
            KV,
            { label: "已自动回复" },
            replies.filter((r) => r.auto && r.status === "sent").length,
          ),
          h(
            KV,
            { label: "意向线索" },
            `${leads.length}（新 ${
              leads.filter((l) => l.status === "new").length
            }）`,
          ),
          h(
            KV,
            { label: "上次读取新评论" },
            account.inbox_checked_at
              ? fmt(account.inbox_checked_at, zone)
              : "—",
          ),
        ),
        h(
          Card,
          {
            title: "素材与授权",
            right: h(
              Button,
              { onClick: () => go("settings", "consent") },
              "授权台账",
            ),
          },
          h(KV, { label: "绑定的素材" }, `${materials.length} 条`),
          consents.length
            ? consents.map((c) =>
                h(
                  KV,
                  { key: c.id, label: c.person },
                  pill(
                    c.status === "withdrawn" ? "已撤回" : `至 ${c.valid_to}`,
                    c.status === "withdrawn" ? "bad" : "ok",
                  ),
                ),
              )
            : h("div", { className: "xhs-meta" }, "没有登记个人授权"),
        ),
        outgoing.length > 0 &&
          h(
            Card,
            { title: "转交记录" },
            outgoing
              .slice(0, 5)
              .map((t) =>
                h(
                  KV,
                  {
                    key: t.id,
                    label: `${
                      t.direction === "incoming"
                        ? `${t.from_member_name} → 你`
                        : `你 → ${t.to_member_name}`
                    } · ${fmt(t.created_at, zone)}`,
                  },
                  pill(
                    (TRANSFER_STATUS[t.status] || [t.status])[0],
                    (TRANSFER_STATUS[t.status] || [])[1],
                  ),
                ),
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
  const [tab, setTab] = useState("overview");
  const [focus, setFocus] = useState("");
  const [error, setError] = useState("");
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
          { id: "projects", label: "项目与画像" },
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
  const go = (_group, id, accountId) => {
    if (accountId) setFocus(accountId);
    setTab(id);
  };
  const common = { snapshot, host, readOnly, refresh, modelRef, go, focus };
  const panels = {
    overview: () => h(OverviewPanel, common),
    queue: () => h(QueuePanel, common),
    alerts: () => h(AlertsPanel, common),
    projects: () =>
      h(ProjectPanel, { ...common, license: effectiveLicense }),
    personas: () => h(PersonaPanel, common),
    accounts: () => h(AccountPanel, common),
    profile: () => h(AccountProfilePanel, common),
    profiles: () => h(ProfilePanel, common),
    audits: () => h(AuditPanel, common),
    operations: () => h(OperationsPanel, common),
    coldstart: () => h(ColdStartPanel, common),
    comments: () => h(CommentsPanel, common),
    plan: () => h(PlanPanel, common),
    editor: () => h(DraftPanel, common),
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
        style: { width: 56, height: 28 },
      }),
      h("b", { style: { fontSize: 16 } }, "运营"),
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
            onClick: () => setTab(g.tabs.find(allowed)?.id || g.tabs[0].id),
          },
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
            onClick: () => setTab(item.id),
            title: readOnly || allowed(item) ? undefined : "未分配给你",
          },
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
  );
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
}

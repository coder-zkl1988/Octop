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
    node.textContent = css;
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
    account_identity_required: "请先在账号与设备中填写并核对目标小红书号。",
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
      "手机当前账号与绑定的小红书号不符，请本人处理后重新核对。",
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
      "请记录有效笔记标题和作者，或正确的小红书笔记链接。",
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
            `目标小红书号：${account.platform_account_id || "待核对"}`,
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
              account.authorized_at ? "读取接管身份" : "只读核对小红书号",
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
              `手机回读的小红书号：${account.profile_identity.account_id}。请与目标账号核对后，在账号与设备中确认绑定。`,
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
                      window.prompt("请输入截图中核对后的小红书号") ||
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
              `目标小红书号：${account.platform_account_id} · 手机：${preview.device_id}`,
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
      const added = await readImageFiles(files);
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
                h("div", { className: "xhs-meta" }, text(d.status, "草稿")),
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
        "。每段先只读核对小红书号；同一手机串行，登录或账号不符时停止，不自动切换账号。",
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
                "目标小红书号：" +
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
                "我已核对目标小红书号、手机、每段计划与互动预算",
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
                  `待确认小红书号：${account.pending_identity.account_id || "未读到"}`,
                ),
                h(
                  Button,
                  {
                    primary: true,
                    disabled: readOnly,
                    onClick: async () => {
                      const value =
                        account.pending_identity.account_id ||
                        window.prompt("请输入截图中核对后的小红书号") ||
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

function XhsOpsPage({ host, license }) {
  useStyle();
  const [textModels, setTextModels] = useState([]);
  const [modelRef, setModelRef] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const effectiveLicense = snapshot?.license || license;
  const [tab, setTab] = useState("projects");
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
  const tabs = useMemo(
    () => [
      { id: "projects", label: "项目" },
      { id: "personas", label: "人设规划" },
      { id: "accounts", label: "账号与设备" },
      { id: "profiles", label: "新号资料" },
      { id: "operations", label: "日常运营" },
      { id: "drafts", label: "内容草稿" },
      { id: "batches", label: "批量发布" },
      { id: "runs", label: "发布与历史" },
      { id: "comments", label: "评论审核" },
      { id: "audits", label: "诊断与变更" },
      { id: "reports", label: "复盘报表" },
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
        h("h3", null, "小红书运营"),
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
          "项目管理、内容草稿、发布运行、评论协作与审计能力",
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
  const feature =
    tab === "projects"
      ? null
      : tab === "accounts" ||
          tab === "personas" ||
          tab === "profiles" ||
          tab === "operations"
        ? "xhs.ops"
        : tab === "drafts"
          ? "xhs.content"
          : tab === "batches"
            ? "xhs.publish"
            : tab === "comments"
              ? "xhs.comment"
              : tab === "audits"
                ? "xhs.takeover"
                : tab === "reports"
                  ? "xhs.analytics"
                  : null;
  const runAvailable = [
    "xhs.publish",
    "xhs.ops",
    "xhs.takeover",
    "xhs.analytics",
    "xhs.comment",
  ].some((item) => hasFeature(effectiveLicense, item));
  const panel =
    !readOnly &&
    ((feature && !hasFeature(effectiveLicense, feature)) ||
      (tab === "runs" && !runAvailable))
      ? h(FeatureLocked, { locale })
      : tab === "projects"
        ? h(ProjectPanel, {
            snapshot,
            host,
            readOnly,
            refresh,
            license: effectiveLicense,
            modelRef,
          })
        : tab === "personas"
          ? h(PersonaPanel, { snapshot, host, readOnly, refresh, modelRef })
          : tab === "accounts"
            ? h(AccountPanel, { snapshot, host, readOnly, refresh })
            : tab === "profiles"
              ? h(ProfilePanel, { snapshot, host, readOnly, refresh, modelRef })
              : tab === "operations"
                ? h(OperationsPanel, { snapshot, host, readOnly, refresh })
                : tab === "reports"
                  ? h(ReportPanel, { snapshot, host, readOnly, refresh })
                  : tab === "drafts"
                    ? h(DraftPanel, {
                        snapshot,
                        host,
                        readOnly,
                        refresh,
                        modelRef,
                      })
                    : tab === "batches"
                      ? h(BatchPanel, {
                          snapshot,
                          host,
                          readOnly,
                          refresh,
                          license: effectiveLicense,
                        })
                      : tab === "runs"
                        ? h(RunPanel, {
                            snapshot,
                            host,
                            readOnly,
                            refresh,
                            license: effectiveLicense,
                          })
                        : tab === "comments"
                          ? h(CommentsPanel, {
                              snapshot,
                              host,
                              readOnly,
                              refresh,
                              modelRef,
                            })
                          : h(AuditPanel, {
                              snapshot,
                              host,
                              readOnly,
                              refresh,
                              modelRef,
                            });
  return h(
    "div",
    { className: "xhs-app" },
    textModels.length > 0 &&
      h(
        "label",
        { className: "xhs-field" },
        "生成模型",
        h(
          "select",
          {
            className: "xhs-select",
            value: modelRef,
            disabled: readOnly,
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
      ),
    h(
      "div",
      { className: "xhs-tabs" },
      tabs.map((item) =>
        h(
          "button",
          {
            key: item.id,
            className: `xhs-tab${tab === item.id ? " active" : ""}`,
            onClick: () => setTab(item.id),
          },
          item.label,
        ),
      ),
    ),
    error &&
      h(
        "div",
        { className: "xhs-card xhs-danger", style: { marginBottom: 12 } },
        error,
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
      ? "打开小红书运营工作台"
      : "Open XHS operations workbench",
  );
}

export function setup(host) {
  host.registerPage({ id: "main", title: "小红书运营", component: XhsOpsPage });
  host.registerRenderer({
    id: "xhs_workbench",
    tools: ["xhs_workbench"],
    component: WorkbenchLink,
  });
}

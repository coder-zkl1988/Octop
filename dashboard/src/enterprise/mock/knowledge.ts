import type {
  EnterpriseKnowledgeBase,
  KnowledgePublishRequest,
  KnowledgeShareTargets,
} from "../api/knowledge";

/**
 * Sample enterprise-cloud knowledge data (public knowledge bases, share
 * targets, publish requests) used until the enterprise cloud API exists.
 * Personal knowledge bases are real and come from `knowledgeBasesApi`.
 */

export const MOCK_PUBLIC_KNOWLEDGE_BASES: EnterpriseKnowledgeBase[] = [
  {
    id: "kb9f4a07d3b5",
    name: "法规汇编",
    description: "数据安全、个人信息保护相关法规与公司合规要求。",
    iconName: "scale",
    ownerDepartment: "法务部",
    docCount: 27,
    access: "read",
  },
  {
    id: "kb51e0c9a7d4",
    name: "员工手册",
    description: "入职指南、考勤与报销制度、IT 支持流程。",
    iconName: "users",
    ownerDepartment: "人力资源部",
    docCount: 64,
    access: "edit",
  },
];

export const MOCK_SHARE_TARGETS: KnowledgeShareTargets = {
  departments: [
    "研发部",
    "产品部",
    "客服部",
    "售前支持部",
    "市场部",
    "法务部",
    "人力资源部",
    "财务部",
  ],
  members: [
    { id: "mb_wanglei", name: "王磊", department: "研发部" },
    { id: "mb_chensi", name: "陈思", department: "产品部" },
    { id: "mb_zhangmin", name: "张敏", department: "客服部" },
    { id: "mb_lina", name: "李娜", department: "售前支持部" },
    { id: "mb_zhaoyang", name: "赵阳", department: "市场部" },
  ],
};

/** Publish requests survive reloads so the 审批中 state is demoable. */
const PUBLISH_STORAGE_KEY = "tabby:enterprise-kb-publish";

export function readPublishRequests(): KnowledgePublishRequest[] {
  try {
    const raw = localStorage.getItem(PUBLISH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as KnowledgePublishRequest[]) : [];
  } catch {
    return [];
  }
}

export function writePublishRequests(rows: KnowledgePublishRequest[]) {
  try {
    localStorage.setItem(PUBLISH_STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // Storage unavailable (private mode) — requests last for this session only.
  }
}

/**
 * Prompt 集中管理
 *
 * 对应说明书第 20 节、设计文档第 6 节。
 * 所有 Prompt 模板集中管理，带版本号。
 * 未来支持 A/B 测试和版本切换。
 */

import { CORE_SYSTEM_PROMPT, PROMPT_TEMPLATES } from './systemPrompt'

export interface PromptEntry {
  id: string
  name: string
  version: string
  content: string
  description: string
  updatedAt: string
}

/** Prompt 注册表 */
const REGISTRY: PromptEntry[] = [
  {
    id: 'core',
    name: '核心系统提示',
    version: '1.0.0',
    content: CORE_SYSTEM_PROMPT,
    description: '所有 AI 调用的基础约束：角色、边界、输出格式',
    updatedAt: '2026-08-13',
  },
  ...Object.entries(PROMPT_TEMPLATES).map(([key, content]) => ({
    id: key,
    name: SCENARIO_NAMES[key] ?? key,
    version: '1.0.0',
    content,
    description: SCENARIO_DESCRIPTIONS[key] ?? '',
    updatedAt: '2026-08-13',
  })),
]

/** 场景名称映射 */
const SCENARIO_NAMES: Record<string, string> = {
  naturalLanguageParse: '自然语言解析',
  dailySummary: '每日总结',
  weeklyAnalysis: '每周分析',
  monthlySummary: '每月总结',
  patternExplain: '行为模式解释',
  cognitiveInsight: '认知突破分析',
  chat: '同行者对话',
}

/** 场景描述映射 */
const SCENARIO_DESCRIPTIONS: Record<string, string> = {
  naturalLanguageParse: 'AI-011：将自然语言解析为结构化活动',
  dailySummary: 'AI-001：每日活动总结与建议',
  weeklyAnalysis: 'AI-002：每周数据分析与趋势',
  monthlySummary: 'AI-003：30 天成长总结',
  patternExplain: 'AI-009：向用户解释检测到的行为模式',
  cognitiveInsight: 'AI-031：分析感悟中的认知突破',
  chat: 'AI-006：同行者自由对话',
}

/**
 * 获取 Prompt
 */
export const getPrompt = (id: string): PromptEntry | null => {
  return REGISTRY.find((p) => p.id === id) ?? null
}

/**
 * 列出所有 Prompt
 */
export const listPrompts = (): PromptEntry[] => {
  return [...REGISTRY]
}

/**
 * 获取 Prompt 统计
 */
export const getPromptStats = (): {
  total: number
  versions: Record<string, string>
} => {
  const versions: Record<string, string> = {}
  for (const entry of REGISTRY) {
    versions[entry.id] = entry.version
  }
  return { total: REGISTRY.length, versions }
}

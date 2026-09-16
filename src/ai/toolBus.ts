/**
 * AI-002 Tool Calling
 *
 * 对应说明书第 8、9 节。
 * AI 通过工具调用系统，不直接改库。
 * 三级权限：READ / WRITE / GAMEWRITE
 */

import type { AppState, Activity, ActivityType, Intensity } from '../types'

/** 工具权限等级 */
export type ToolPermission = 'READ' | 'WRITE' | 'GAMEWRITE'

/** 工具调用结果 */
export interface ToolResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/** 工具定义 */
export interface ToolDef<P = Record<string, unknown>, R = unknown> {
  name: string
  permission: ToolPermission
  description: string
  execute: (params: P, context: ToolContext) => R | Promise<R>
}

/** 工具执行上下文，提供对 store 的安全访问 */
export interface ToolContext {
  state: AppState
  /** WRITE 权限的执行回调（由 store 提供） */
  createActivity?: (input: {
    type: ActivityType
    title: string
    description?: string
    durationMinutes?: number
    intensity?: Intensity
    subtype?: string
    difficulty?: number
    proactive?: boolean
    isEscape?: boolean
  }) => ToolResult<{ activityId: string; xp: number; warnings: string[] }>
  addMemory?: (memory: {
    type: import('../types').MemoryType
    level: import('../types').MemoryLevel
    content: string
    confidence: number
    source: import('../types').MemorySource
  }) => string
  addSuggestion?: (suggestion: {
    reason: string
    action: string
    priority: number
    category: import('../types').SuggestionCategory
  }) => string
}

// ===== READ 权限工具 =====

const getActivities: ToolDef<{ type?: ActivityType; from?: string; to?: string; limit?: number }, Activity[]> = {
  name: 'getActivities',
  permission: 'READ',
  description: '查询用户活动记录',
  execute: (params, ctx) => {
    let acts = ctx.state.activities
    if (params.type) acts = acts.filter((a) => a.type === params.type)
    if (params.from) acts = acts.filter((a) => a.createdAt >= params.from!)
    if (params.to) acts = acts.filter((a) => a.createdAt <= params.to!)
    if (params.limit) acts = acts.slice(-params.limit)
    return acts
  },
}

const getPlayerStats: ToolDef<Record<string, never>, AppState['player']> = {
  name: 'getPlayerStats',
  permission: 'READ',
  description: '查询玩家属性与等级',
  execute: (_, ctx) => ctx.state.player,
}

const getMemories: ToolDef<{
  type?: import('../types').MemoryType
  level?: import('../types').MemoryLevel
  status?: import('../types').MemoryStatus
}, import('../types').AIMemory[]> = {
  name: 'getMemories',
  permission: 'READ',
  description: '查询 AI 记忆',
  execute: (params, ctx) => {
    let mems = ctx.state.memories ?? []
    if (params.type) mems = mems.filter((m) => m.type === params.type)
    if (params.level) mems = mems.filter((m) => m.level === params.level)
    if (params.status) mems = mems.filter((m) => m.status === params.status)
    else mems = mems.filter((m) => m.status === 'active')
    return mems
  },
}

const getAchievements: ToolDef<Record<string, never>, AppState['achievements']> = {
  name: 'getAchievements',
  permission: 'READ',
  description: '查询成就列表',
  execute: (_, ctx) => ctx.state.achievements,
}

const getBehaviorPatterns: ToolDef<{ minSample?: number }, import('../types').BehaviorPattern[]> = {
  name: 'getBehaviorPatterns',
  permission: 'READ',
  description: '查询行为模式',
  execute: (params, ctx) => {
    let pats = ctx.state.patterns ?? []
    if (params.minSample) pats = pats.filter((p) => p.sampleCount >= params.minSample!)
    return pats
  },
}

// ===== WRITE 权限工具 =====

const createActivity: ToolDef<{
  type: ActivityType
  title: string
  durationMinutes?: number
  intensity?: Intensity
  subtype?: string
  difficulty?: number
  proactive?: boolean
}, ToolResult<{ activityId: string; xp: number; warnings: string[] }>> = {
  name: 'createActivity',
  permission: 'WRITE',
  description: '创建活动记录（XP 由规则引擎决定，不接受 xp 参数）',
  execute: (params, ctx) => {
    if (!ctx.createActivity) {
      return { success: false, error: 'createActivity 回调不可用' }
    }
    return ctx.createActivity(params)
  },
}

const saveMemory: ToolDef<{
  type: import('../types').MemoryType
  level: import('../types').MemoryLevel
  content: string
  confidence: number
  source: import('../types').MemorySource
}, ToolResult<{ memoryId: string }>> = {
  name: 'saveMemory',
  permission: 'WRITE',
  description: '保存长期记忆',
  execute: (params, ctx) => {
    if (!ctx.addMemory) {
      return { success: false, error: 'addMemory 回调不可用' }
    }
    const id = ctx.addMemory(params)
    return { success: true, data: { memoryId: id } }
  },
}

const createSuggestion: ToolDef<{
  reason: string
  action: string
  priority: number
  category: import('../types').SuggestionCategory
}, ToolResult<{ suggestionId: string }>> = {
  name: 'createSuggestion',
  permission: 'WRITE',
  description: '创建 AI 建议',
  execute: (params, ctx) => {
    if (!ctx.addSuggestion) {
      return { success: false, error: 'addSuggestion 回调不可用' }
    }
    const id = ctx.addSuggestion(params)
    return { success: true, data: { suggestionId: id } }
  },
}

// ===== GAMEWRITE 权限工具（默认对 AI 关闭） =====
// 这些工具不注册到 AI 可调用列表，仅保留定义供内部使用

/**
 * 工具注册表
 * 使用 ToolDef<any, any> 绕过泛型协变问题，具体类型在各 ToolDef 定义处保证
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL_TOOLS: Record<string, ToolDef<any, any>> = {
  getActivities,
  getPlayerStats,
  getMemories,
  getAchievements,
  getBehaviorPatterns,
  createActivity,
  saveMemory,
  createSuggestion,
}

/**
 * AI 可调用的工具名列表（不含 GAMEWRITE）
 */
const AI_ALLOWED_TOOLS = Object.entries(ALL_TOOLS)
  .filter(([, def]) => def.permission !== 'GAMEWRITE')
  .map(([name]) => name)

/**
 * 执行工具调用
 *
 * 1. 检查工具是否存在
 * 2. 检查工具是否在 AI 允许列表中
 * 3. 执行工具
 */
export const callTool = async (
  toolName: string,
  params: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> => {
  const tool = ALL_TOOLS[toolName]
  if (!tool) {
    return { success: false, error: `工具 "${toolName}" 不存在` }
  }

  if (!AI_ALLOWED_TOOLS.includes(toolName)) {
    return { success: false, error: `工具 "${toolName}" 不允许 AI 调用（GAMEWRITE 权限）` }
  }

  try {
    const result = await tool.execute(params, context)
    return { success: true, data: result }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : '工具执行失败',
    }
  }
}

/**
 * 获取所有可用工具的描述（供 LLM function calling 使用）
 */
export const getToolSchemas = () => {
  return AI_ALLOWED_TOOLS.map((name) => {
    const tool = ALL_TOOLS[name]
    return {
      name: tool.name,
      description: tool.description,
      permission: tool.permission,
    }
  })
}

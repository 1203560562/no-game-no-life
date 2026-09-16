/**
 * AI-004 长期记忆
 *
 * 对应说明书第 11~14 节、第 43~45 节。
 * 写入/检索/冲突处理。
 * 本轮（无 Embedding）使用关键词匹配检索。
 */

import type {
  AIMemory,
  AppState,
  MemoryLevel,
  MemorySource,
  MemoryType,
} from '../../types'

/** 写入记忆的输入 */
export interface SaveMemoryInput {
  type: MemoryType
  level: MemoryLevel
  content: string
  confidence: number
  source: MemorySource
  /** 关联的旧记忆 id（冲突处理时使用） */
  supersedes?: string
}

/** 记忆写入门槛（第 12 节：Level 越高门槛越高） */
const WRITE_THRESHOLDS: Record<MemoryLevel, { minConfidence: number; requireExplicit: boolean }> = {
  1: { minConfidence: 0.5, requireExplicit: false },
  2: { minConfidence: 0.7, requireExplicit: true },
  3: { minConfidence: 0.8, requireExplicit: true },
  4: { minConfidence: 0.9, requireExplicit: true },
}

/**
 * 校验是否满足写入门槛
 */
export const canWriteMemory = (input: SaveMemoryInput): { ok: boolean; reason?: string } => {
  const threshold = WRITE_THRESHOLDS[input.level]

  if (input.confidence < threshold.minConfidence) {
    return {
      ok: false,
      reason: `Level ${input.level} 记忆要求置信度 ≥ ${threshold.minConfidence}，当前 ${input.confidence}`,
    }
  }

  if (threshold.requireExplicit && input.source !== 'explicit_user_statement') {
    // L2+ 允许 observed 来源，但 inferred 需要更高置信度
    if (input.source === 'inferred' && input.confidence < 0.85) {
      return {
        ok: false,
        reason: `inferred 来源的 Level ${input.level} 记忆要求置信度 ≥ 0.85`,
      }
    }
  }

  return { ok: true }
}

/**
 * 检查记忆是否在黑名单中（用户禁止记忆的主题）
 */
export const isBlacklisted = (content: string, blacklist: string[]): boolean => {
  return blacklist.some((topic) => content.toLowerCase().includes(topic.toLowerCase()))
}

/**
 * 检索相关记忆
 *
 * 本轮：关键词匹配 + 类型过滤 + level 优先 + 置信度排序
 * 未来（接 Embedding）：向量检索 Top-K
 */
export const retrieveMemories = (
  state: AppState,
  query: string,
  options: {
    type?: MemoryType
    topK?: number
    minConfidence?: number
  } = {},
): AIMemory[] => {
  const { type, topK = 8, minConfidence = 0.5 } = options

  let mems = (state.memories ?? []).filter(
    (m) => m.status === 'active' && !m.userFlagged && m.confidence >= minConfidence,
  )

  // 类型过滤
  if (type) mems = mems.filter((m) => m.type === type)

  // 关键词匹配：将 query 分词，与 content 匹配
  const queryWords = query
    .toLowerCase()
    .split(/[\s,，。.!?！？]+/)
    .filter((w) => w.length > 1)

  const scored = mems.map((m) => {
    const contentLower = m.content.toLowerCase()
    let score = 0
    for (const word of queryWords) {
      if (contentLower.includes(word)) score += 1
    }
    // level 加权：高 level 记忆更重要
    score += m.level * 0.5
    // 置信度加权
    score += m.confidence * 0.3
    return { memory: m, score }
  })

  // 过滤掉零分（无关键词匹配）的，除非结果太少
  let filtered = scored.filter((s) => s.score > 0.5)
  if (filtered.length < 3) filtered = scored // 不足时返回全部

  return filtered
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.memory)
}

/**
 * 冲突检测：查找与新记忆内容冲突的旧记忆
 *
 * 简单启发式：同 type 且 content 有较高相似度
 */
export const findConflictingMemory = (
  state: AppState,
  input: SaveMemoryInput,
): AIMemory | null => {
  const existing = (state.memories ?? []).filter(
    (m) => m.status === 'active' && m.type === input.type,
  )

  // 检查是否有内容相似的旧记忆
  const inputWords = input.content.toLowerCase().split(/[\s,，。.]+/).filter((w) => w.length > 1)

  for (const mem of existing) {
    const memWords = mem.content.toLowerCase().split(/[\s,，。.]+/).filter((w) => w.length > 1)
    const overlap = inputWords.filter((w) => memWords.includes(w))
    // 若重叠词 ≥ 50%，视为潜在冲突
    if (inputWords.length > 0 && overlap.length / inputWords.length >= 0.5) {
      return mem
    }
  }

  return null
}

/**
 * 处理记忆冲突（第 45 节）
 *
 * 旧记忆 status → deprecated（不删除历史真实性）
 * 新记忆 active, supersedes 指向旧 id
 */
export const handleConflict = (
  oldMemory: AIMemory,
  newInput: SaveMemoryInput,
): {
  oldPatch: Partial<AIMemory>
  newInputWithSupersedes: SaveMemoryInput
} => {
  return {
    oldPatch: { status: 'deprecated' },
    newInputWithSupersedes: {
      ...newInput,
      supersedes: oldMemory.id,
    },
  }
}

/**
 * 记忆确认（用户再次陈述同一事实时）
 *
 * 更新 lastConfirmedAt + 提升 confidence
 */
export const confirmExistingMemory = (memory: AIMemory): Partial<AIMemory> => {
  return {
    lastConfirmedAt: new Date().toISOString(),
    confidence: Math.min(1, memory.confidence + 0.05),
    lastUsedAt: new Date().toISOString(),
    useCount: memory.useCount + 1,
  }
}

/**
 * 查找与给定内容匹配的已有记忆（用于确认）
 */
export const findMatchingMemory = (
  state: AppState,
  content: string,
  type?: MemoryType,
): AIMemory | null => {
  let mems = (state.memories ?? []).filter((m) => m.status === 'active')
  if (type) mems = mems.filter((m) => m.type === type)

  const contentLower = content.toLowerCase()
  return (
    mems.find((m) => m.content.toLowerCase() === contentLower) ??
    mems.find((m) => m.content.toLowerCase().includes(contentLower) || contentLower.includes(m.content.toLowerCase())) ??
    null
  )
}

/**
 * AI 记忆生命周期管理
 *
 * 对应说明书第 44 节。
 * Create → Use → Confirm → Decay / Archive
 */

import type { AIMemory, AppState } from '../../types'

const DAY_MS = 86400000

/** 记忆衰减阈值 */
const DECAY_THRESHOLDS = {
  /** 超过此天数未使用，开始降低优先级 */
  unusedDays: 30,
  /** 超过此天数未确认，confidence 衰减 */
  unconfirmedDays: 60,
  /** 超过此天数未使用，归档 */
  archiveDays: 90,
  /** 每次衰减的 confidence 减少量 */
  decayStep: 0.05,
  /** confidence 低于此值时归档 */
  minConfidenceToKeep: 0.3,
}

/**
 * 执行记忆衰减
 *
 * 长期未使用（useCount 低 + 时间久）的 active 记忆降低 confidence。
 * 不直接修改 state，返回需要更新的 patch 列表。
 */
export const computeDecay = (state: AppState): { id: string; patch: Partial<AIMemory> }[] => {
  const now = Date.now()
  const mems = state.memories ?? []
  const updates: { id: string; patch: Partial<AIMemory> }[] = []

  for (const mem of mems) {
    if (mem.status !== 'active') continue

    const lastUsed = mem.lastUsedAt ? new Date(mem.lastUsedAt).getTime() : new Date(mem.createdAt).getTime()
    const daysSinceUsed = (now - lastUsed) / DAY_MS

    // 长期未使用 → 降低 confidence
    if (daysSinceUsed > DECAY_THRESHOLDS.unusedDays) {
      const lastConfirmed = mem.lastConfirmedAt
        ? new Date(mem.lastConfirmedAt).getTime()
        : new Date(mem.createdAt).getTime()
      const daysSinceConfirmed = (now - lastConfirmed) / DAY_MS

      // 未确认时间越长，衰减越多
      let decayAmount = DECAY_THRESHOLDS.decayStep
      if (daysSinceConfirmed > DECAY_THRESHOLDS.unconfirmedDays) {
        decayAmount *= 2
      }

      const newConfidence = Math.max(0, mem.confidence - decayAmount)

      // confidence 过低 → 归档
      if (newConfidence < DECAY_THRESHOLDS.minConfidenceToKeep) {
        updates.push({ id: mem.id, patch: { status: 'archived', confidence: newConfidence } })
      } else if (newConfidence < mem.confidence) {
        updates.push({ id: mem.id, patch: { confidence: newConfidence } })
      }
    }
  }

  return updates
}

/**
 * 执行记忆归档
 *
 * 超过 archiveDays 未使用且 useCount ≤ 1 的 active 记忆归档。
 */
export const computeArchive = (state: AppState): { id: string; patch: Partial<AIMemory> }[] => {
  const now = Date.now()
  const mems = state.memories ?? []
  const updates: { id: string; patch: Partial<AIMemory> }[] = []

  for (const mem of mems) {
    if (mem.status !== 'active') continue

    const lastUsed = mem.lastUsedAt ? new Date(mem.lastUsedAt).getTime() : new Date(mem.createdAt).getTime()
    const daysSinceUsed = (now - lastUsed) / DAY_MS

    if (daysSinceUsed > DECAY_THRESHOLDS.archiveDays && mem.useCount <= 1) {
      updates.push({ id: mem.id, patch: { status: 'archived' } })
    }
  }

  return updates
}

/**
 * 运行完整的生命周期维护
 *
 * 合并衰减 + 归档的结果。
 * 应在应用启动或每日结算时调用。
 */
export const runLifecycleMaintenance = (state: AppState): { id: string; patch: Partial<AIMemory> }[] => {
  const decayUpdates = computeDecay(state)
  const archiveUpdates = computeArchive(state)

  // 合并：同一 id 取归档优先（归档是更重的操作）
  const merged = new Map<string, Partial<AIMemory>>()
  for (const u of decayUpdates) merged.set(u.id, u.patch)
  for (const u of archiveUpdates) merged.set(u.id, { ...merged.get(u.id), ...u.patch })

  return Array.from(merged.entries()).map(([id, patch]) => ({ id, patch }))
}

/**
 * 提升记忆使用计数（被检索引用时调用）
 */
export const markMemoryUsed = (memory: AIMemory): Partial<AIMemory> => ({
  lastUsedAt: new Date().toISOString(),
  useCount: memory.useCount + 1,
})

/**
 * 获取记忆统计信息
 */
export const getMemoryStats = (state: AppState): {
  total: number
  active: number
  archived: number
  deprecated: number
  byLevel: Record<number, number>
  byType: Record<string, number>
  avgConfidence: number
} => {
  const mems = state.memories ?? []
  const active = mems.filter((m) => m.status === 'active')
  const archived = mems.filter((m) => m.status === 'archived')
  const deprecated = mems.filter((m) => m.status === 'deprecated')

  const byLevel: Record<number, number> = {}
  const byType: Record<string, number> = {}
  for (const m of active) {
    byLevel[m.level] = (byLevel[m.level] ?? 0) + 1
    byType[m.type] = (byType[m.type] ?? 0) + 1
  }

  const avgConfidence = active.length > 0
    ? active.reduce((s, m) => s + m.confidence, 0) / active.length
    : 0

  return {
    total: mems.length,
    active: active.length,
    archived: archived.length,
    deprecated: deprecated.length,
    byLevel,
    byType,
    avgConfidence,
  }
}

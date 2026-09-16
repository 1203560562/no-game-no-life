/**
 * 服饰系统引擎：换装记录推进 + 服饰成就评估 + 主题套装 XP 加成
 *
 * 换装记录 player.outfitLog: ISO 时间戳数组（保留最近 500 条防止膨胀），
 * 成就条件基于该数组统计（深夜换装 / 单日全换 / 累计次数）。
 */

import type { AppState } from '../types'
import { todayKey } from './xpCalculator'

/** outfitLog 条数上限（防膨胀） */
const OUTFIT_LOG_LIMIT = 500

/** 记录一次换装（成就评估由调用方 evalWithRewards 统一处理） */
export const applyOutfitLog = (base: AppState): AppState => {
  const now = new Date().toISOString()
  const log = [...(base.player.outfitLog ?? []), now].slice(-OUTFIT_LOG_LIMIT)
  return { ...base, player: { ...base.player, outfitLog: log } }
}

// ===== 服饰成就统计 helper（供 achievements.ts 的 check 使用） =====

/** 累计换装次数 */
export const outfitChangeCount = (s: AppState): number => (s.player.outfitLog ?? []).length

/** 深夜（0-5 点）换装次数 */
export const nightOutfitChanges = (s: AppState): number =>
  (s.player.outfitLog ?? []).filter((t) => new Date(t).getHours() < 6).length

/** 单日换装次数的最大值 */
export const maxOutfitChangesPerDay = (s: AppState): number => {
  const c: Record<string, number> = {}
  for (const t of s.player.outfitLog ?? []) {
    const k = t.slice(0, 10)
    c[k] = (c[k] ?? 0) + 1
  }
  return Math.max(0, ...Object.values(c))
}

/** 今日换装次数 */
export const todayOutfitChanges = (s: AppState): number =>
  (s.player.outfitLog ?? []).filter((t) => t.slice(0, 10) === todayKey()).length

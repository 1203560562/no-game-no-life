/**
 * v1.0 局引擎 —— 「人生增量游戏」核心数学
 *
 * 效率模型：
 *   最终产出 XP/min = BASE_EFFICIENCY × 等级修正 × 属性修正 × 类型修正
 *   效率修正（×x.xx）= 等级修正 × 属性修正 × 类型修正（玩家相对基础的成长倍率）
 *
 * 升级 / 属性增长会真实提高下一局收益 —— 「下一局真的比上一局更强」。
 */

import type { ActivityType, Attributes, GameSession, Player } from '../types'
import {
  ATTR_BONUS_PER_POINT,
  ATTRIBUTE_GAIN_TABLE,
  BASE_EFFICIENCY,
  SESSION_ATTR_MINUTES_PER_ROUND,
  SKILL_DEFS,
  SKILL_TRANSCEND_ID,
  TYPE_ATTR_BONUS,
  TYPE_EFFICIENCY,
  levelEfficiencyMod,
} from '../config/xpConfig'

export interface EfficiencyBreakdown {
  /** 基础效率（XP/min） */
  base: number
  /** 等级修正 ×x.xx */
  levelMod: number
  /** 属性修正 ×x.xx */
  attrMod: number
  /** 技能修正 ×x.xx（领域技能等级） */
  skillMod: number
  /** 类型修正 ×x.xx */
  typeMod: number
  /** 总效率修正 ×x.xx（levelMod × attrMod × skillMod × typeMod） */
  multiplier: number
  /** 最终产出 XP/min */
  xpPerMin: number
}

/** 计算某类型一局的效率分解 */
export const computeEfficiency = (
  player: Pick<Player, 'level' | 'attributes' | 'skills'>,
  type: ActivityType,
): EfficiencyBreakdown => {
  const levelMod = levelEfficiencyMod(player.level)
  const attrs = TYPE_ATTR_BONUS[type] ?? []
  const attrPoints = attrs.reduce((s, k) => s + (player.attributes[k] ?? 0), 0)
  const attrMod = 1 + attrPoints * ATTR_BONUS_PER_POINT
  const skill = SKILL_DEFS.find((d) => d.type === type)
  const skillLevel = skill ? player.skills?.[skill.id] ?? 0 : 0
  // 突破自我：全领域技能，独立于领域技能结算（type 挂在 mental 仅为图鉴归类）
  const transcendDef = SKILL_DEFS.find((d) => d.id === SKILL_TRANSCEND_ID)
  const transcendLevel = player.skills?.[SKILL_TRANSCEND_ID] ?? 0
  const skillMod = (1 + skillLevel * (skill?.bonusPerLevel ?? 0)) * (1 + transcendLevel * (transcendDef?.bonusPerLevel ?? 0))
  const typeMod = TYPE_EFFICIENCY[type] ?? 1
  const multiplier = levelMod * attrMod * skillMod * typeMod
  return {
    base: BASE_EFFICIENCY,
    levelMod,
    attrMod,
    skillMod,
    typeMod,
    multiplier,
    xpPerMin: BASE_EFFICIENCY * multiplier,
  }
}

/** 一局收益预估（用于「下一局预计收益」与结算） */
export const estimateSessionGain = (
  player: Pick<Player, 'level' | 'attributes' | 'skills'>,
  type: ActivityType,
  minutes: number,
): { xp: number; efficiency: EfficiencyBreakdown } => {
  const efficiency = computeEfficiency(player, type)
  return { xp: Math.round(efficiency.xpPerMin * minutes), efficiency }
}

/** 局的属性增长：每 25 分钟按增长表结一轮（至少 1） */
export const sessionAttributeGains = (
  type: ActivityType,
  minutes: number,
): Partial<Attributes> => {
  const table = ATTRIBUTE_GAIN_TABLE[type]
  const rounds = Math.max(1, Math.round(minutes / SESSION_ATTR_MINUTES_PER_ROUND))
  const cleaned: Partial<Attributes> = {}
  for (const [k, v] of Object.entries(table)) {
    if (v && v > 0) {
      const total = v * rounds
      cleaned[k as keyof Attributes] = total
    }
  }
  return cleaned
}

// ===== 效率统计（从局历史派生） =====

export interface EfficiencyStats {
  /** 历史最高效率修正 */
  best: number
  /** 平均效率修正 */
  average: number
  /** 局数 */
  count: number
  /** 累计投入分钟 */
  totalMinutes: number
  /** 最近一局效率（无局为 0） */
  latest: number
}

export const efficiencyStats = (sessions: GameSession[]): EfficiencyStats => {
  if (sessions.length === 0) {
    return { best: 0, average: 0, count: 0, totalMinutes: 0, latest: 0 }
  }
  let best = 0
  let sum = 0
  let totalMinutes = 0
  for (const s of sessions) {
    if (s.efficiency > best) best = s.efficiency
    sum += s.efficiency
    totalMinutes += s.actualMinutes
  }
  return {
    best,
    average: sum / sessions.length,
    count: sessions.length,
    totalMinutes,
    latest: sessions[sessions.length - 1].efficiency,
  }
}

/** 格式化小时数：1284.3 → "1,284h 16m" */
export const fmtHours = (minutes: number): string => {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${h.toLocaleString()}h ${String(m).padStart(2, '0')}m`
}

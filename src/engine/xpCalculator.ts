import type {
  ActivityType,
  Attributes,
  Intensity,
  XpGainResult,
} from '../types'
import {
  ATTRIBUTE_GAIN_TABLE,
  XP_CONFIG,
  sleepReward,
} from '../config/xpConfig'

export const todayKey = (iso?: string): string => {
  const d = iso ? new Date(iso) : new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

const intensityFactor = (rule: typeof XP_CONFIG[ActivityType], intensity?: Intensity) => {
  if (!intensity || !rule.intensityMultiplier) return 1
  return rule.intensityMultiplier[intensity]
}

/**
 * Compute raw xp for a single activity BEFORE daily caps & diminishing.
 * Implements the "effort ≠ hours" philosophy:熬夜/超长时长不再无限奖励。
 */
const computeRawXp = (input: {
  type: ActivityType
  durationMinutes?: number
  intensity?: Intensity
  difficulty?: number
  proactive?: boolean
  hoursOfSleep?: number
  /** 睡眠时段 id（早睡/正常/晚睡/熬夜，见 SLEEP_PERIODS） */
  sleepPeriod?: string
}): number => {
  const { type } = input
  const rule = XP_CONFIG[type]

  // Sleep is special-cased by hours + 时段系数.
  if (type === 'sleep') {
    const hours = input.hoursOfSleep ?? (input.durationMinutes ?? 0) / 60
    return sleepReward(hours, input.sleepPeriod).xp
  }

  let xp = rule.base
  const minutes = input.durationMinutes ?? 0
  if (rule.perMinute) xp += rule.perMinute * minutes

  xp *= intensityFactor(rule, input.intensity)

  // Work "effort value": difficulty × proactivity × focus(output) — NOT raw hours.
  if (type === 'work') {
    const diff = input.difficulty ?? 3 // 1..5
    const diffFactor = 0.7 + diff * 0.12 // 0.82 .. 1.3
    const proactiveFactor = input.proactive ? 1.15 : 1
    xp *= diffFactor * proactiveFactor * (rule.difficultyMultiplier ?? 1)
  }
  if (type === 'study' && input.difficulty) {
    xp *= 0.85 + input.difficulty * 0.1
  }

  return Math.round(xp)
}

export interface XpInput {
  type: ActivityType
  durationMinutes?: number
  intensity?: Intensity
  difficulty?: number
  proactive?: boolean
  isEscape?: boolean
  /** 睡眠时段 id（存于 Activity.subtype） */
  sleepPeriod?: string
}

/**
 * 手动记录（非局）收益计算。
 *
 * v1.0 起：
 * - 金币只有「一局」结算才产出（局走 useGameStore.endSession，汇率更高）
 * - 不再有日上限 / 递减压制 —— 增量游戏理念「做了多少，就获得多少」
 */
export const calculateXp = (input: XpInput): XpGainResult => {
  const warnings: string[] = []

  // Escaped entertainment: no xp, no deduction. Just recorded.
  if (input.isEscape) {
    return {
      xp: 0,
      attributeGains: {},
      coins: 0,
      warnings: ['记录为「逃避型娱乐」，未获得娱乐 XP，也未扣分。'],
      diminished: false,
    }
  }

  const raw = computeRawXp(input)
  const attributeGains = computeAttributeGains(input)

  return { xp: raw, attributeGains, coins: 0, warnings, diminished: false }
}

const computeAttributeGains = (input: XpInput): Partial<Attributes> => {
  const gains = { ...ATTRIBUTE_GAIN_TABLE[input.type] }

  // Sleep hours-based vitality（时段只影响 XP，vitality 按时长质量带给）.
  if (input.type === 'sleep') {
    const hours = (input.durationMinutes ?? 0) / 60
    gains.vitality = sleepReward(hours, input.sleepPeriod).vitality
  }

  // Work courage bonus for hard/proactive tasks.
  if (input.type === 'work' && input.difficulty && input.difficulty >= 4) {
    gains.courage = (gains.courage ?? 0) + 1
  }
  if (input.type === 'work' && input.proactive) {
    gains.freedom = (gains.freedom ?? 0) + 1
  }

  // Strip zero gains.
  const cleaned: Partial<Attributes> = {}
  for (const [k, v] of Object.entries(gains)) {
    if (v && v > 0) cleaned[k as keyof Attributes] = v
  }
  return cleaned
}

export const sumAttributes = (a: Partial<Attributes>, base: Attributes): Attributes => {
  const result = { ...base }
  for (const k of Object.keys(a) as (keyof Attributes)[]) {
    result[k] += a[k] ?? 0
  }
  return result
}

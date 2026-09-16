/**
 * AI-007/008 用户画像
 *
 * 对应说明书第 15 节。
 * 从活动数据 + 情绪 + 记忆构建用户画像。
 * 画像用于 Context 构建、个性化建议、模式识别。
 */

import type { AppState, ActivityType, Activity, Attributes, AttributeKey } from '../types'

/** 领域画像：每个活动类型的统计 */
export interface DomainProfile {
  type: ActivityType
  totalCount: number
  totalMinutes: number
  avgIntensity: number // 0..1 (low=0.33, medium=0.67, high=1)
  avgDifficulty: number // 1..5
  proactiveRatio: number // 0..1
  escapeRatio: number // 0..1
  /** 最常出现的子类型 */
  topSubtypes: { subtype: string; count: number }[]
  /** 最近 7 天次数 */
  recent7Days: number
  /** 最近 30 天次数 */
  recent30Days: number
}

/** 时间画像：活动时间分布 */
export interface TimeProfile {
  /** 0=周日 .. 6=周六 */
  byWeekday: number[]
  /** 0..23 小时分布（活动开始时间） */
  byHour: number[]
  /** 最活跃时段 */
  peakHours: number[]
  /** 是否夜猫子（23-5 点活动占比高） */
  isNightOwl: boolean
  /** 是否早起型（6-9 点活动占比高） */
  isEarlyBird: boolean
}

/** 属性画像：七维属性分布 */
export interface AttributeProfile {
  current: Attributes
  /** 各属性占比 */
  distribution: Record<AttributeKey, number>
  /** 最强属性 */
  strongest: AttributeKey
  /** 最弱属性 */
  weakest: AttributeKey
  /** 是否均衡（最强最弱差 < 10） */
  isBalanced: boolean
}

/** 情绪画像 */
export interface EmotionProfile {
  avgMood: number // 1..6
  moodVariability: number // 标准差
  recentTrend: 'improving' | 'stable' | 'declining' | 'unknown'
  dominantEmotions: { emotion: string; count: number }[]
}

/** 用户画像汇总 */
export interface UserProfile {
  domainProfiles: DomainProfile[]
  timeProfile: TimeProfile
  attributeProfile: AttributeProfile
  emotionProfile: EmotionProfile
  /** 主导活动类型（按总时长） */
  primaryDomains: ActivityType[]
  /** 活动总天数 */
  activeDays: number
  /** 总活动数 */
  totalActivities: number
  /** 画像生成时间 */
  generatedAt: string
}

const DAY_MS = 86400000
const INTENSITY_MAP = { low: 0.33, medium: 0.67, high: 1 }

/**
 * 构建领域画像
 */
const buildDomainProfiles = (activities: Activity[]): DomainProfile[] => {
  const now = Date.now()
  const cutoff7 = now - 7 * DAY_MS
  const cutoff30 = now - 30 * DAY_MS

  const types: ActivityType[] = ['work', 'study', 'exercise', 'food', 'sleep', 'game', 'life', 'social', 'creative', 'challenge', 'mental']

  return types
    .map((type) => {
      const acts = activities.filter((a) => a.type === type)
      if (acts.length === 0) {
        return {
          type,
          totalCount: 0,
          totalMinutes: 0,
          avgIntensity: 0,
          avgDifficulty: 0,
          proactiveRatio: 0,
          escapeRatio: 0,
          topSubtypes: [],
          recent7Days: 0,
          recent30Days: 0,
        }
      }

      const totalMinutes = acts.reduce((s, a) => s + (a.durationMinutes ?? 0), 0)
      const intensityValues = acts
        .filter((a) => a.intensity)
        .map((a) => INTENSITY_MAP[a.intensity!])
      const difficultyValues = acts.filter((a) => a.difficulty).map((a) => a.difficulty!)
      const proactiveCount = acts.filter((a) => a.proactive).length
      const escapeCount = acts.filter((a) => a.isEscape).length

      // 子类型统计
      const subtypeMap = new Map<string, number>()
      for (const a of acts) {
        if (a.subtype) {
          subtypeMap.set(a.subtype, (subtypeMap.get(a.subtype) ?? 0) + 1)
        }
      }
      const topSubtypes = Array.from(subtypeMap.entries())
        .map(([subtype, count]) => ({ subtype, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)

      const recent7Days = acts.filter((a) => new Date(a.createdAt).getTime() >= cutoff7).length
      const recent30Days = acts.filter((a) => new Date(a.createdAt).getTime() >= cutoff30).length

      return {
        type,
        totalCount: acts.length,
        totalMinutes,
        avgIntensity: intensityValues.length > 0
          ? intensityValues.reduce((s, v) => s + v, 0) / intensityValues.length
          : 0,
        avgDifficulty: difficultyValues.length > 0
          ? difficultyValues.reduce((s, v) => s + v, 0) / difficultyValues.length
          : 0,
        proactiveRatio: acts.length > 0 ? proactiveCount / acts.length : 0,
        escapeRatio: acts.length > 0 ? escapeCount / acts.length : 0,
        topSubtypes,
        recent7Days,
        recent30Days,
      }
    })
    .filter((d) => d.totalCount > 0)
}

/**
 * 构建时间画像
 */
const buildTimeProfile = (activities: Activity[]): TimeProfile => {
  const byWeekday = new Array(7).fill(0)
  const byHour = new Array(24).fill(0)

  for (const a of activities) {
    const time = a.startTime ? new Date(a.startTime) : new Date(a.createdAt)
    byWeekday[time.getDay()]++
    byHour[time.getHours()]++
  }

  const total = activities.length || 1

  // 找峰值时段（取前 3 个小时）
  const peakHours = byHour
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .filter((h) => h.count > 0)
    .map((h) => h.hour)

  // 夜猫子：23-5 点活动占比 > 25%
  const nightCount = [23, 0, 1, 2, 3, 4, 5].reduce((s, h) => s + byHour[h], 0)
  const isNightOwl = nightCount / total > 0.25

  // 早起型：6-9 点活动占比 > 25%
  const morningCount = [6, 7, 8, 9].reduce((s, h) => s + byHour[h], 0)
  const isEarlyBird = morningCount / total > 0.25

  return { byWeekday, byHour, peakHours, isNightOwl, isEarlyBird }
}

/**
 * 构建属性画像
 */
const buildAttributeProfile = (attributes: Attributes): AttributeProfile => {
  const keys: AttributeKey[] = ['vitality', 'wisdom', 'focus', 'creativity', 'courage', 'connection', 'freedom']
  const total = keys.reduce((s, k) => s + attributes[k], 0) || 1

  const distribution = {} as Record<AttributeKey, number>
  for (const k of keys) {
    distribution[k] = attributes[k] / total
  }

  const sorted = keys.sort((a, b) => attributes[b] - attributes[a])
  const strongest = sorted[0]
  const weakest = sorted[sorted.length - 1]
  const isBalanced = attributes[strongest] - attributes[weakest] < 10

  return { current: attributes, distribution, strongest, weakest, isBalanced }
}

/**
 * 构建情绪画像
 */
const buildEmotionProfile = (state: AppState): EmotionProfile => {
  const moods = state.moods ?? []
  const emotions = state.emotions ?? []

  if (moods.length === 0) {
    return {
      avgMood: 0,
      moodVariability: 0,
      recentTrend: 'unknown',
      dominantEmotions: [],
    }
  }

  const avgMood = moods.reduce((s, m) => s + m.mood, 0) / moods.length
  const moodValues = moods.map((m) => m.mood)
  const variance = moodValues.reduce((s, v) => s + (v - avgMood) ** 2, 0) / moodValues.length
  const moodVariability = Math.sqrt(variance)

  // 近期趋势：比较最近 3 天和之前 7 天的平均
  const now = Date.now()
  const recent3 = moods.filter((m) => now - new Date(m.createdAt).getTime() <= 3 * DAY_MS)
  const previous7 = moods.filter((m) => {
    const t = now - new Date(m.createdAt).getTime()
    return t > 3 * DAY_MS && t <= 10 * DAY_MS
  })

  let recentTrend: EmotionProfile['recentTrend'] = 'unknown'
  if (recent3.length > 0 && previous7.length > 0) {
    const recentAvg = recent3.reduce((s, m) => s + m.mood, 0) / recent3.length
    const prevAvg = previous7.reduce((s, m) => s + m.mood, 0) / previous7.length
    const diff = recentAvg - prevAvg
    if (diff > 0.5) recentTrend = 'improving'
    else if (diff < -0.5) recentTrend = 'declining'
    else recentTrend = 'stable'
  }

  // 主导情绪
  const emotionMap = new Map<string, number>()
  for (const e of emotions) {
    emotionMap.set(e.emotion, (emotionMap.get(e.emotion) ?? 0) + 1)
  }
  const dominantEmotions = Array.from(emotionMap.entries())
    .map(([emotion, count]) => ({ emotion, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  return { avgMood, moodVariability, recentTrend, dominantEmotions }
}

/**
 * 构建完整用户画像
 */
export const buildUserProfile = (state: AppState): UserProfile => {
  const activities = state.activities ?? []
  const domainProfiles = buildDomainProfiles(activities)
  const timeProfile = buildTimeProfile(activities)
  const attributeProfile = buildAttributeProfile(state.player.attributes)
  const emotionProfile = buildEmotionProfile(state)

  // 主导领域：按总时长排序
  const primaryDomains = [...domainProfiles]
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, 3)
    .map((d) => d.type)

  return {
    domainProfiles,
    timeProfile,
    attributeProfile,
    emotionProfile,
    primaryDomains,
    activeDays: state.player.activeDays,
    totalActivities: activities.length,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * 获取画像摘要文本（供 LLM Context 使用）
 */
export const getProfileSummary = (profile: UserProfile): string => {
  const parts: string[] = []

  parts.push(`用户已活跃 ${profile.activeDays} 天，共记录 ${profile.totalActivities} 条活动。`)

  if (profile.primaryDomains.length > 0) {
    parts.push(`主要活动领域：${profile.primaryDomains.join('、')}。`)
  }

  const attr = profile.attributeProfile
  parts.push(`属性最强：${attr.strongest}，最弱：${attr.weakest}，${attr.isBalanced ? '发展均衡' : '发展不均衡'}。`)

  const time = profile.timeProfile
  if (time.isNightOwl) parts.push('时间倾向：夜猫子型。')
  else if (time.isEarlyBird) parts.push('时间倾向：早起型。')
  if (time.peakHours.length > 0) {
    parts.push(`活跃时段：${time.peakHours.map((h) => `${h}点`).join('、')}。`)
  }

  const emo = profile.emotionProfile
  if (emo.avgMood > 0) {
    parts.push(`平均心情：${emo.avgMood.toFixed(1)}/6，趋势：${emo.recentTrend}。`)
  }

  return parts.join(' ')
}

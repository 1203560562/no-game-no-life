/**
 * AI-009/010 行为模式识别
 *
 * 对应说明书第 16~18 节。
 * 从活动序列中识别 触发→行为→结果 模式。
 * 样本量 ≥3 = candidate，≥5 = confirmed。
 */

import type { AppState, Activity, BehaviorPattern, ActivityType, EmotionRecord } from '../types'

/** 模式类型标签 */
export type PatternKind =
  | 'escape'          // 逃避模式：压力后转向娱乐
  | 'compensation'    // 补偿模式：某领域不足后过度补偿
  | 'procrastination' // 拖延模式：困难任务后转向简单任务
  | 'overwork'        // 过度工作：连续长时间工作
  | 'binge'           // 报复性放纵：长期克制后突然暴增
  | 'consistent'      // 一致性模式：稳定的好习惯
  | 'mood_driven'     // 情绪驱动：特定情绪后特定行为
  | 'time_routine'    // 时间规律：固定时间做固定事

/** 检测到的模式候选 */
export interface DetectedPattern {
  kind: PatternKind
  trigger: string
  behavior: string
  result: string
  longTermEffect?: string
  evidenceIds: string[]
  sampleCount: number
  confidence: number
}

/**
 * 将活动按天分组
 */
const groupByDay = (activities: Activity[]): Map<string, Activity[]> => {
  const groups = new Map<string, Activity[]>()
  for (const a of activities) {
    const day = a.createdAt.slice(0, 10)
    if (!groups.has(day)) groups.set(day, [])
    groups.get(day)!.push(a)
  }
  // 每天内按时间排序
  for (const [, acts] of groups) {
    acts.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  return groups
}

/**
 * 1. 逃避模式检测
 *
 * 触发：工作/学习高强度活动
 * 行为：随后转向 game（非 escape 标记的也算）
 * 结果：娱乐时长 > 工作时长
 */
const detectEscapePatterns = (activities: Activity[]): DetectedPattern[] => {
  const byDay = groupByDay(activities)
  const patterns: DetectedPattern[] = []
  const evidenceMap = new Map<string, string[]>()

  for (const [, dayActs] of byDay) {
    for (let i = 0; i < dayActs.length - 1; i++) {
      const curr = dayActs[i]
      const next = dayActs[i + 1]

      // 工作或学习后转向游戏
      const isStressful = (curr.type === 'work' || curr.type === 'study') &&
        (curr.intensity === 'high' || (curr.durationMinutes ?? 0) > 120)
      const isEscape = next.type === 'game' && (next.durationMinutes ?? 0) > 60

      if (isStressful && isEscape) {
        const key = `escape_${curr.type}_to_game`
        if (!evidenceMap.has(key)) evidenceMap.set(key, [])
        evidenceMap.get(key)!.push(curr.id, next.id)
      }
    }
  }

  for (const [, ids] of evidenceMap) {
    const sampleCount = Math.floor(ids.length / 2)
    if (sampleCount >= 3) {
      patterns.push({
        kind: 'escape',
        trigger: '高强度工作/学习后',
        behavior: '转向较长时间的游戏娱乐',
        result: '可能形成压力-逃避循环',
        longTermEffect: '长期可能导致工作焦虑加剧',
        evidenceIds: ids,
        sampleCount,
        confidence: Math.min(0.9, 0.4 + sampleCount * 0.1),
      })
    }
  }

  return patterns
}

/**
 * 2. 过度工作模式检测
 *
 * 触发：无（持续行为）
 * 行为：连续多天工作时长 > 8 小时
 * 结果：后续几天活动骤减（疲劳恢复）
 */
const detectOverworkPatterns = (activities: Activity[]): DetectedPattern[] => {
  const byDay = groupByDay(activities)
  const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]))

  const overworkDays: { day: string; minutes: number; ids: string[] }[] = []
  for (const [day, acts] of days) {
    const workMinutes = acts
      .filter((a) => a.type === 'work')
      .reduce((s, a) => s + (a.durationMinutes ?? 0), 0)
    if (workMinutes > 480) {
      overworkDays.push({
        day,
        minutes: workMinutes,
        ids: acts.filter((a) => a.type === 'work').map((a) => a.id),
      })
    }
  }

  if (overworkDays.length >= 3) {
    return [{
      kind: 'overwork',
      trigger: '无明显触发（持续行为）',
      behavior: `单日工作时长超过 8 小时（共 ${overworkDays.length} 次）`,
      result: '可能伴随后续活动减少（疲劳恢复期）',
      longTermEffect: '长期可能导致倦怠和效率下降',
      evidenceIds: overworkDays.flatMap((d) => d.ids),
      sampleCount: overworkDays.length,
      confidence: Math.min(0.9, 0.4 + overworkDays.length * 0.1),
    }]
  }

  return []
}

/**
 * 3. 一致性模式检测（正面模式）
 *
 * 触发：每天固定时间
 * 行为：特定类型活动
 * 结果：持续稳定
 */
const detectConsistentPatterns = (activities: Activity[]): DetectedPattern[] => {
  const byDay = groupByDay(activities)
  const patterns: DetectedPattern[] = []

  // 检查每个活动类型在多少天中出现
  const typeDayCount = new Map<ActivityType, { days: Set<string>; ids: string[] }>()

  for (const [day, acts] of byDay) {
    for (const a of acts) {
      if (!typeDayCount.has(a.type)) {
        typeDayCount.set(a.type, { days: new Set(), ids: [] })
      }
      typeDayCount.get(a.type)!.days.add(day)
      typeDayCount.get(a.type)!.ids.push(a.id)
    }
  }

  for (const [type, { days, ids }] of typeDayCount) {
    // 连续 5 天以上出现
    if (days.size >= 5) {
      patterns.push({
        kind: 'consistent',
        trigger: '每日规律',
        behavior: `持续进行 ${type} 类活动（${days.size} 天）`,
        result: '形成稳定习惯',
        longTermEffect: '有助于相关属性稳定增长',
        evidenceIds: ids.slice(-20),
        sampleCount: days.size,
        confidence: Math.min(0.95, 0.5 + days.size * 0.05),
      })
    }
  }

  return patterns
}

/**
 * 4. 情绪驱动模式检测
 *
 * 触发：特定情绪
 * 行为：随后进行特定活动
 * 结果：情绪与行为的关联
 */
const detectMoodDrivenPatterns = (
  activities: Activity[],
  emotions: EmotionRecord[],
): DetectedPattern[] => {
  if (emotions.length < 3) return []

  const patterns: DetectedPattern[] = []
  const combos = new Map<string, { emotion: string; activityType: ActivityType; ids: string[]; count: number }>()

  for (const emo of emotions) {
    const emoTime = new Date(emo.createdAt).getTime()
    // 找情绪记录后 6 小时内的活动
    const nearby = activities.filter((a) => {
      const actTime = new Date(a.createdAt).getTime()
      return actTime >= emoTime && actTime <= emoTime + 6 * 3600000
    })

    for (const act of nearby) {
      const key = `${emo.emotion}_${act.type}`
      if (!combos.has(key)) {
        combos.set(key, { emotion: emo.emotion, activityType: act.type, ids: [], count: 0 })
      }
      const combo = combos.get(key)!
      combo.ids.push(act.id, emo.id)
      combo.count++
    }
  }

  for (const [, combo] of combos) {
    if (combo.count >= 3) {
      patterns.push({
        kind: 'mood_driven',
        trigger: `感到 ${combo.emotion} 时`,
        behavior: `倾向于进行 ${combo.activityType} 活动`,
        result: '情绪与行为的关联模式',
        evidenceIds: combo.ids,
        sampleCount: combo.count,
        confidence: Math.min(0.85, 0.3 + combo.count * 0.1),
      })
    }
  }

  return patterns
}

/**
 * 5. 时间规律模式检测
 *
 * 触发：固定时间段
 * 行为：特定活动
 */
const detectTimeRoutinePatterns = (activities: Activity[]): DetectedPattern[] => {
  const patterns: DetectedPattern[] = []
  // 按小时+类型分组
  const hourTypeCount = new Map<string, { hour: number; type: ActivityType; ids: string[]; count: number }>()

  for (const a of activities) {
    const hour = new Date(a.startTime ?? a.createdAt).getHours()
    const key = `${hour}_${a.type}`
    if (!hourTypeCount.has(key)) {
      hourTypeCount.set(key, { hour, type: a.type, ids: [], count: 0 })
    }
    const entry = hourTypeCount.get(key)!
    entry.ids.push(a.id)
    entry.count++
  }

  for (const [, entry] of hourTypeCount) {
    if (entry.count >= 5) {
      patterns.push({
        kind: 'time_routine',
        trigger: `每天 ${entry.hour} 点左右`,
        behavior: `进行 ${entry.type} 活动`,
        result: '形成时间锚点',
        longTermEffect: '稳定的时间节律有助于习惯维持',
        evidenceIds: entry.ids.slice(-20),
        sampleCount: entry.count,
        confidence: Math.min(0.9, 0.4 + entry.count * 0.08),
      })
    }
  }

  return patterns
}

/**
 * 6. 报复性放纵模式
 *
 * 触发：连续多天低娱乐
 * 行为：突然大量娱乐
 * 结果：可能影响后续状态
 */
const detectBingePatterns = (activities: Activity[]): DetectedPattern[] => {
  const byDay = groupByDay(activities)
  const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]))

  const bingeEvents: string[] = []

  for (let i = 2; i < days.length; i++) {
    const prev2 = days[i - 2][1].concat(days[i - 1][1])
    const curr = days[i][1]

    const prevGameMinutes = prev2
      .filter((a) => a.type === 'game')
      .reduce((s, a) => s + (a.durationMinutes ?? 0), 0)
    const currGameMinutes = curr
      .filter((a) => a.type === 'game')
      .reduce((s, a) => s + (a.durationMinutes ?? 0), 0)

    // 前两天游戏 < 60 分钟，当天 > 180 分钟
    if (prevGameMinutes < 60 && currGameMinutes > 180) {
      bingeEvents.push(...curr.filter((a) => a.type === 'game').map((a) => a.id))
    }
  }

  if (bingeEvents.length >= 3) {
    return [{
      kind: 'binge',
      trigger: '连续低娱乐后',
      behavior: '突然大量娱乐（报复性放纵）',
      result: '可能伴随 guilt 和后续状态波动',
      longTermEffect: '长期可能形成克制-暴放纵循环',
      evidenceIds: bingeEvents,
      sampleCount: Math.floor(bingeEvents.length / 2),
      confidence: Math.min(0.8, 0.3 + bingeEvents.length * 0.1),
    }]
  }

  return []
}

/**
 * 运行所有模式检测器
 *
 * 返回检测到的模式候选列表。
 * 样本量 ≥3 的才会返回。
 */
export const detectPatterns = (state: AppState): DetectedPattern[] => {
  const activities = state.activities ?? []
  const emotions = state.emotions ?? []

  if (activities.length < 5) return []

  const all: DetectedPattern[] = [
    ...detectEscapePatterns(activities),
    ...detectOverworkPatterns(activities),
    ...detectConsistentPatterns(activities),
    ...detectMoodDrivenPatterns(activities, emotions),
    ...detectTimeRoutinePatterns(activities),
    ...detectBingePatterns(activities),
  ]

  // 过滤：样本量 ≥3
  return all.filter((p) => p.sampleCount >= 3)
}

/**
 * 将 DetectedPattern 转换为 store 中的 BehaviorPattern 格式
 */
export const toBehaviorPattern = (
  detected: DetectedPattern,
  existing?: BehaviorPattern,
): Omit<BehaviorPattern, 'id' | 'firstSeenAt' | 'lastSeenAt'> => {
  const status: BehaviorPattern['status'] =
    detected.sampleCount >= 5 ? 'confirmed' : 'candidate'

  return {
    trigger: detected.trigger,
    behavior: detected.behavior,
    result: detected.result,
    longTermEffect: detected.longTermEffect,
    sampleCount: detected.sampleCount,
    evidenceIds: detected.evidenceIds,
    confidence: detected.confidence,
    status: existing?.status === 'confirmed' ? 'confirmed' : status,
  }
}

/**
 * 获取模式摘要文本（供 LLM Context 使用）
 */
export const getPatternSummary = (patterns: DetectedPattern[]): string => {
  if (patterns.length === 0) return '未检测到明显行为模式。'

  const kindLabels: Record<PatternKind, string> = {
    escape: '逃避模式',
    compensation: '补偿模式',
    procrastination: '拖延模式',
    overwork: '过度工作',
    binge: '报复性放纵',
    consistent: '一致性习惯',
    mood_driven: '情绪驱动',
    time_routine: '时间规律',
  }

  return patterns
    .map((p) => `${kindLabels[p.kind]}：${p.trigger} → ${p.behavior}（样本 ${p.sampleCount}，置信 ${(p.confidence * 100).toFixed(0)}%）`)
    .join('；')
}

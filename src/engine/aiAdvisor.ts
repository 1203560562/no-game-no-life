import type { AppState, ActivityType } from '../types'
import { DOMAIN_META } from '../config/xpConfig'

export type AdviceType = 'encourage' | 'observe' | 'suggest'

export interface Advice {
  id: string
  type: AdviceType
  content: string
}

const DAY_MS = 86400000

// 时间窗口内的活动
const activitiesIn = (state: AppState, days: number): AppState['activities'] => {
  const cutoff = Date.now() - days * DAY_MS
  return state.activities.filter((a) => new Date(a.createdAt).getTime() >= cutoff)
}

// 按领域汇总分钟数
const minutesByType = (acts: AppState['activities']): Record<ActivityType, number> => {
  const out = {} as Record<ActivityType, number>
  for (const k of Object.keys(DOMAIN_META) as ActivityType[]) out[k] = 0
  for (const a of acts) out[a.type] += a.durationMinutes ?? 0
  return out
}

/**
 * 规则引擎版 AI 顾问。
 * - 语气：温和、清醒、不羞辱、不强迫、有游戏感
 * - 每日最多 3 条
 * - 结合最近 7 / 30 天数据
 * - 不得骂用户懒、不得用羞耻激励、不得鼓励熬夜/脱水/极端节食/过量运动
 */
export const generateAdvice = (state: AppState): Advice[] => {
  const advice: Advice[] = []
  const push = (type: AdviceType, content: string) =>
    advice.push({ id: `advice_${advice.length}`, type, content })

  const last7 = activitiesIn(state, 7)
  const last30 = activitiesIn(state, 30)
  const m7 = minutesByType(last7)

  const todayKey = new Date().toISOString().slice(0, 10)
  const todayActs = state.activities.filter((a) => a.createdAt.slice(0, 10) === todayKey)
  const todayXp = todayActs.reduce((s, a) => s + a.xp, 0)

  // ===== 1. 鼓励类：今日已获得 XP =====
  if (todayXp > 0) {
    if (todayXp >= 200) {
      push('encourage', `今天你已经获得 ${todayXp} XP，做了不少事。不需要再为了证明自己而增加工作量。`)
    } else if (todayXp >= 50) {
      push('encourage', `今天已经获得 ${todayXp} XP。哪怕只有一点，也是你今天真正做过的事情。`)
    }
  }

  // ===== 2. 睡眠不足观察 =====
  const recentSleep = last7.filter((a) => a.type === 'sleep')
  if (recentSleep.length > 0) {
    const avgSleepH = recentSleep.reduce((s, a) => s + (a.durationMinutes ?? 0), 0) / recentSleep.length / 60
    if (avgSleepH > 0 && avgSleepH < 6) {
      push('observe', `最近 7 天平均睡眠 ${avgSleepH.toFixed(1)}h。继续刷 XP 没意义，你的身体不是刷 XP 的工具。先去恢复。`)
    } else if (avgSleepH >= 7 && avgSleepH <= 9) {
      // 睡眠良好时给正向反馈（但不重复占用名额）
      push('encourage', `最近平均睡眠 ${avgSleepH.toFixed(1)}h，恢复得不错。生命力属性在稳定增长。`)
    }
  }

  // ===== 3. 工作过长观察 =====
  const workH7 = m7.work / 60
  if (workH7 > 50) {
    const exerciseH7 = m7.exercise / 60
    if (exerciseH7 < 1) {
      push('suggest', `本周工作 ${Math.round(workH7)}h 但几乎没有运动。明天可以补一次轻量活动，哪怕散步 10 分钟。`)
    }
  }

  // ===== 4. 逃避型娱乐模式（工作/学习后转向娱乐）=====
  const escapes = last7.filter((a) => a.isEscape)
  if (escapes.length >= 3) {
    // 检查是否多出现在困难任务之后
    const sorted = [...last7].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    let patternCount = 0
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const cur = sorted[i]
      if (
        (prev.type === 'work' && (prev.difficulty ?? 0) >= 4) ||
        (prev.type === 'study' && (prev.difficulty ?? 0) >= 4)
      ) {
        if (cur.type === 'game' || cur.isEscape) {
          patternCount++
        }
      }
    }
    if (patternCount >= 2) {
      push('observe', `最近几次遇到复杂任务后都转向了娱乐。这很正常。如果愿意，下次可以只做任务的第一步，不要求一次完成整个问题。`)
    }
  }

  // ===== 5. 连续运动鼓励 =====
  const exerciseDays = new Set(last30.filter((a) => a.type === 'exercise').map((a) => a.createdAt.slice(0, 10)))
  if (exerciseDays.size >= 12) {
    push('encourage', `过去 30 天有 ${exerciseDays.size} 天运动。连续性比单次爆发更重要，生命力属性正在稳步积累。`)
  }

  // ===== 6. 学习输出鼓励 =====
  const studyNotes = last30.filter(
    (a) => a.type === 'study' && (a.description?.includes('笔记') || a.title.includes('笔记')),
  )
  if (studyNotes.length >= 3) {
    push('encourage', `近 30 天输出了 ${studyNotes.length} 次学习笔记。输入+理解+输出，智慧属性在真正增长。`)
  }

  // ===== 7. 一周行动量低（失败处理）=====
  if (last7.length <= 2 && todayXp === 0) {
    push('suggest', `本周行动量较低。不需要解决整个问题，可以从一个最小行动开始：打开项目、看5页书、出门走10分钟。`)
  }

  // ===== 8. 体重记录连续性 =====
  const weightDays = new Set(state.weights.map((w) => w.date))
  if (weightDays.size >= 7 && weightDays.size < 30) {
    push('encourage', `已连续记录体重 ${weightDays.size} 天。短期体重只是噪音，你真正获得的是长期趋势。`)
  }

  // 每日最多 3 条，优先级：观察 > 建议 > 鼓励（让重要的提醒先出现）
  const priority: Record<AdviceType, number> = { observe: 0, suggest: 1, encourage: 2 }
  advice.sort((a, b) => priority[a.type] - priority[b.type])
  return advice.slice(0, 3)
}

/** 今日打开 App 时的状态摘要（第四十八节） */
export interface DailyStatus {
  yesterdayXp: number
  sleepHours?: number
  exerciseMinutes: number
  workHours: number
  mood?: number
}

export const buildDailyStatus = (state: AppState): DailyStatus => {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yKey = yesterday.toISOString().slice(0, 10)
  const yActs = state.activities.filter((a) => a.createdAt.slice(0, 10) === yKey)
  const yesterdayXp = yActs.reduce((s, a) => s + a.xp, 0)
  const sleep = yActs.find((a) => a.type === 'sleep')
  return {
    yesterdayXp,
    sleepHours: sleep ? (sleep.durationMinutes ?? 0) / 60 : undefined,
    exerciseMinutes: yActs.filter((a) => a.type === 'exercise').reduce((s, a) => s + (a.durationMinutes ?? 0), 0),
    workHours: yActs.filter((a) => a.type === 'work').reduce((s, a) => s + (a.durationMinutes ?? 0), 0) / 60,
    mood: state.moods.find((m) => m.date === yKey)?.mood,
  }
}

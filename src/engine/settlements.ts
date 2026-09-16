import type { Activity, ActivityType, AppState, WeightRecord } from '../types'
import { DOMAIN_META } from '../config/xpConfig'

export const dateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`

export interface DailySettlement {
  day: number
  date: string
  totalXp: number
  domainXp: Record<ActivityType, number>
  attributeGains: Record<string, number>
  achievements: Activity[]
  /** rule-based evaluation (AI removed) */
  evaluation: string
  highlights: string[]
}

export const buildDailySettlement = (
  state: AppState,
  date?: Date,
): DailySettlement => {
  const key = dateKey(date ?? new Date())
  const dayActivities = state.activities.filter((a) => a.createdAt.slice(0, 10) === key)

  const domainXp = Object.fromEntries(
    (Object.keys(DOMAIN_META) as ActivityType[]).map((t) => [t, 0]),
  ) as Record<ActivityType, number>

  const attributeGains: Record<string, number> = {}
  const highlights: string[] = []
  let totalXp = 0

  for (const a of dayActivities) {
    domainXp[a.type] += a.xp
    totalXp += a.xp
    if (a.attributeGains) {
      for (const [k, v] of Object.entries(a.attributeGains)) {
        attributeGains[k] = (attributeGains[k] ?? 0) + (v ?? 0)
      }
    }
    // highlights: long exercise, reading, important work
    if (a.type === 'exercise' && (a.durationMinutes ?? 0) >= 90) {
      highlights.push(`${DOMAIN_META[a.type].icon} ${a.title} ${a.durationMinutes}min`)
    } else if (a.type === 'study' && (a.durationMinutes ?? 0) >= 30) {
      highlights.push(`📖 ${a.title} ${a.durationMinutes}min`)
    } else if (a.type === 'mental') {
      highlights.push(`🧠 ${a.title}`)
    }
  }

  // day number since creation (按本地日期 0 点计算，避免时区/不足 24h 的差 1 问题)
  const now = date ?? new Date()
  const created = new Date(state.player.createdAt)
  const createdMidnight = new Date(created.getFullYear(), created.getMonth(), created.getDate()).getTime()
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diffDays = Math.round((nowMidnight - createdMidnight) / 86400000) + 1

  return {
    day: diffDays,
    date: key,
    totalXp,
    domainXp,
    attributeGains,
    achievements: dayActivities,
    evaluation: generateEvaluation(dayActivities, totalXp),
    highlights,
  }
}

/** Rule-based evaluation replacing AI (per user: AI removed). */
const generateEvaluation = (
  today: Activity[],
  totalXp: number,
): string => {
  if (today.length === 0) {
    return '今天也是你的人生。休息也属于系统的一部分。'
  }
  if (totalXp === 0) {
    return '今天记录的行为没有产生 XP，但你已经开始记录，这本身就是行动。'
  }
  const exercise = today.filter((a) => a.type === 'exercise').reduce((s, a) => s + (a.durationMinutes ?? 0), 0)
  const sleep = today.find((a) => a.type === 'sleep')
  const work = today.filter((a) => a.type === 'work').reduce((s, a) => s + (a.durationMinutes ?? 0), 0)

  const parts: string[] = []
  parts.push(`今天你获得了 ${totalXp} XP。`)
  if (exercise >= 90) parts.push('运动投入很扎实，生命力属性在增长。')
  if (sleep) {
    const hours = (sleep.durationMinutes ?? 0) / 60
    if (hours < 6) parts.push('检测到睡眠不足。继续刷 XP 没意义，你的身体不是刷 XP 的工具。')
    else if (hours >= 7) parts.push('睡眠充足，恢复得不错。')
  }
  if (work >= 480) parts.push('工作时间较长，注意不是越累越好。')
  if (exercise === 0 && work > 0) parts.push('今天有工作但没运动，明天可以补一次轻量活动。')
  parts.push('今天真正值得记录的，不是你做了多少事，而是你主动选择了什么。')
  return parts.join(' ')
}

export interface WeeklyReport {
  weekXp: number
  lastWeekXp: number
  xpChangePct: number
  attributeGains: Record<string, number>
  timeInvestment: Record<ActivityType, number> // minutes
  totalMinutes: number
  evaluation: string
}

export const buildWeeklyReport = (state: AppState, refDate?: Date): WeeklyReport => {
  const now = refDate ?? new Date()
  // 统计口径为「近 7 天滚动窗口」（非自然周），页面文案同口径标注，
  // 避免"周一当天却显示上周数据"的语义错位
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - 6) // last 7 days inclusive
  weekStart.setHours(0, 0, 0, 0)
  const lastWeekStart = new Date(weekStart)
  lastWeekStart.setDate(weekStart.getDate() - 7)

  const inRange = (iso: string, start: Date, end: Date) => {
    const t = new Date(iso).getTime()
    return t >= start.getTime() && t < end.getTime()
  }

  const thisWeek = state.activities.filter((a) => inRange(a.createdAt, weekStart, new Date(now.getTime() + 86400000)))
  const lastWeek = state.activities.filter((a) => inRange(a.createdAt, lastWeekStart, weekStart))

  const weekXp = thisWeek.reduce((s, a) => s + a.xp, 0)
  const lastWeekXp = lastWeek.reduce((s, a) => s + a.xp, 0)
  const xpChangePct = lastWeekXp > 0 ? Math.round(((weekXp - lastWeekXp) / lastWeekXp) * 100) : weekXp > 0 ? 100 : 0

  const attributeGains: Record<string, number> = {}
  const timeInvestment = Object.fromEntries(
    (Object.keys(DOMAIN_META) as ActivityType[]).map((t) => [t, 0]),
  ) as Record<ActivityType, number>

  for (const a of thisWeek) {
    timeInvestment[a.type] += a.durationMinutes ?? 0
    if (a.attributeGains) {
      for (const [k, v] of Object.entries(a.attributeGains)) {
        attributeGains[k] = (attributeGains[k] ?? 0) + (v ?? 0)
      }
    }
  }
  const totalMinutes = Object.values(timeInvestment).reduce((s, v) => s + v, 0)

  return {
    weekXp,
    lastWeekXp,
    xpChangePct,
    attributeGains,
    timeInvestment,
    totalMinutes,
    evaluation: generateWeeklyEvaluation(thisWeek, weekXp, timeInvestment),
  }
}

const generateWeeklyEvaluation = (
  week: Activity[],
  weekXp: number,
  time: Record<ActivityType, number>,
): string => {
  const parts: string[] = []
  parts.push(`近 7 天获得 ${weekXp} XP。`)
  const top = (Object.entries(time) as [ActivityType, number][])
    .filter(([, m]) => m > 0)
    .sort((a, b) => b[1] - a[1])[0]
  if (top) parts.push(`时间投入最多的是${DOMAIN_META[top[0]].label}（${Math.round(top[1] / 60 * 10) / 10}h）。`)
  const exercise = time.exercise
  const study = time.study
  if (study >= 180) parts.push('学习投入稳定，智慧属性在积累。')
  if (exercise >= 120) parts.push('保持了运动习惯，连续性比单次爆发更重要。')
  const escape = week.filter((a) => a.isEscape).length
  if (escape >= 3) parts.push('近 7 天出现多次逃避型娱乐，可能需要在困难任务后给自己更小的下一步。')
  parts.push('成长不在于爆发，而在于连续。')
  return parts.join(' ')
}

// ===== Weight averaging =====
export interface WeightStats {
  today?: number
  avg7?: number
  avg28?: number
  trend?: number // avg7 - avg28
  trendDir: 'down' | 'up' | 'flat'
}

export const computeWeightStats = (weights: WeightRecord[]): WeightStats => {
  if (weights.length === 0) return { trendDir: 'flat' }
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date))
  const today = sorted[sorted.length - 1].weightKg

  const avg = (n: number) => {
    const slice = sorted.slice(-n)
    if (slice.length === 0) return undefined
    return slice.reduce((s, w) => s + w.weightKg, 0) / slice.length
  }
  const avg7 = avg(7)
  const avg28 = avg(28)
  let trend: number | undefined
  let trendDir: 'down' | 'up' | 'flat' = 'flat'
  if (avg7 && avg28) {
    trend = Math.round((avg7 - avg28) * 10) / 10
    trendDir = trend < -0.05 ? 'down' : trend > 0.05 ? 'up' : 'flat'
  }
  return { today, avg7, avg28, trend, trendDir }
}

// ===== Happiness sources (娱乐来源) over last 30 days =====
export const computeHappinessSources = (state: AppState): { name: string; minutes: number; icon: string }[] => {
  const cutoff = Date.now() - 30 * 86400000
  const map = new Map<string, { minutes: number; icon: string }>()
  for (const a of state.activities) {
    if (new Date(a.createdAt).getTime() < cutoff) continue
    if (a.type === 'game' || a.type === 'social' || a.type === 'exercise' || a.type === 'creative') {
      const name = a.subtype || a.title || DOMAIN_META[a.type].label
      const icon = DOMAIN_META[a.type].icon
      const cur = map.get(name) ?? { minutes: 0, icon }
      cur.minutes += a.durationMinutes ?? 0
      map.set(name, cur)
    }
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, minutes: v.minutes, icon: v.icon }))
    .sort((a, b) => b.minutes - a.minutes)
}

// ===== 30-day growth summary (第五十节) =====
export interface MonthlySummary {
  totalXp: number
  levelFrom: number
  levelTo: number
  exerciseHours: number
  studyHours: number
  creativeCount: number
  workImportantCount: number
  weightTrend?: number
  reflectionCount: number
  bookCount: number
  evaluation: string
}

export const buildMonthlySummary = (state: AppState): MonthlySummary => {
  const cutoff = Date.now() - 30 * 86400000
  const acts = state.activities.filter((a) => new Date(a.createdAt).getTime() >= cutoff)
  const totalXp = acts.reduce((s, a) => s + a.xp, 0)

  // 估算 30 天前的等级：用 totalXp 反推不现实，改用"30天内净增 XP / 当前等级所需XP"近似
  // 更准确做法：记录等级变化。这里用近似 —— levelFrom = 当前等级 - 增长的等级数（估算）
  const xpPerLevelApprox = 100 * Math.pow(state.player.level, 1.35)
  const levelsGainedApprox = Math.floor(totalXp / xpPerLevelApprox)
  const levelFrom = Math.max(1, state.player.level - levelsGainedApprox)
  const levelTo = state.player.level

  const exerciseMinutes = acts.filter((a) => a.type === 'exercise').reduce((s, a) => s + (a.durationMinutes ?? 0), 0)
  const studyMinutes = acts.filter((a) => a.type === 'study').reduce((s, a) => s + (a.durationMinutes ?? 0), 0)
  const creativeCount = acts.filter((a) => a.type === 'creative').length
  const workImportantCount = acts.filter((a) => a.type === 'work' && (a.difficulty ?? 0) >= 4).length
  const reflectionCount = state.moods.filter((m) => new Date(m.createdAt).getTime() >= cutoff).length
  const bookCount = acts.filter(
    (a) => a.type === 'study' && (a.title.includes('读完') || a.description?.includes('读完')),
  ).length

  // 体重趋势：30天前后对比
  let weightTrend: number | undefined
  if (state.weights.length >= 2) {
    const sorted = [...state.weights].sort((a, b) => a.date.localeCompare(b.date))
    const recentAvg = sorted.slice(-7).reduce((s, w) => s + w.weightKg, 0) / Math.min(7, sorted.length)
    const oldSlice = sorted.slice(0, Math.min(7, sorted.length - 7))
    if (oldSlice.length > 0) {
      const oldAvg = oldSlice.reduce((s, w) => s + w.weightKg, 0) / oldSlice.length
      weightTrend = Math.round((recentAvg - oldAvg) * 10) / 10
    }
  }

  // 生成评价
  const parts: string[] = []
  parts.push(`过去 30 天获得 ${totalXp} XP。`)
  if (levelsGainedApprox > 0) parts.push(`等级 ${levelFrom} → ${levelTo}。`)
  if (exerciseMinutes > 0) parts.push(`运动 ${Math.round(exerciseMinutes / 6) / 10}h。`)
  if (studyMinutes > 0) parts.push(`学习 ${Math.round(studyMinutes / 6) / 10}h。`)
  if (creativeCount > 0) parts.push(`创作 ${creativeCount} 次。`)
  if (reflectionCount > 0) parts.push(`记录了 ${reflectionCount} 次重要反思。`)
  if (bookCount > 0) parts.push(`读完 ${bookCount} 本书。`)
  if (weightTrend !== undefined) parts.push(`体重趋势 ${weightTrend > 0 ? '+' : ''}${weightTrend}kg。`)
  parts.push('你不是完成了多少任务，你创造了一段自己的历史。')

  return {
    totalXp,
    levelFrom,
    levelTo,
    exerciseHours: Math.round(exerciseMinutes / 6) / 10,
    studyHours: Math.round(studyMinutes / 6) / 10,
    creativeCount,
    workImportantCount,
    weightTrend,
    reflectionCount,
    bookCount,
    evaluation: parts.join(' '),
  }
}

import type {
  Achievement,
  AchievementCategory,
  AchievementRarity,
  Activity,
  AppState,
  GameSession,
} from '../types'
import { OUTFIT_ITEMS } from '../config/outfitThemes'
import { outfitChangeCount, nightOutfitChanges, maxOutfitChangesPerDay } from './outfitEngine'
import { isoWeekKey } from './bossEngine'

/** 全部服饰道具 id（收集成就用） */
const OUTFIT_IDS = OUTFIT_ITEMS.map((i) => i.id)

export interface AchievementDef {
  id: string
  title: string
  description: string
  icon: string
  category: AchievementCategory
  rarity: AchievementRarity
  /** 隐藏成就：解锁前不展示完整条件 */
  hidden?: boolean
  /** 认知突破类（珍贵） */
  isCognitive?: boolean
  /** 解锁奖励：Insight XP（认知类专用） */
  insightXp?: number
  /** 解锁奖励：普通 XP */
  xpReward?: number
  /** 解锁奖励：金币 */
  coinReward?: number
  /** 解锁后发放的商店物品 id */
  unlockItemIds?: string[]
  /** 解锁后发放的称号（加入 player.titles） */
  grantTitle?: string
  check: (state: AppState) => boolean
}

// ===== 辅助函数（成就条件解耦） =====

const dayKey = (iso: string): string => iso.slice(0, 10)

/** 去重日期数 */
const distinctDays = (acts: Activity[]): number =>
  new Set(acts.map((a) => dayKey(a.createdAt))).size

/** 按类型筛选 */
const byType = (s: AppState, type: Activity['type']): Activity[] =>
  s.activities.filter((a) => a.type === type)

/** 标题或描述含关键词 */
const hasKeyword = (acts: Activity[], kw: string): boolean =>
  acts.some((a) => a.title.includes(kw) || (a.description ?? '').includes(kw))

/** 连续记录天数（最长连续） */
const longestStreak = (acts: Activity[]): number => {
  if (acts.length === 0) return 0
  const days = Array.from(new Set(acts.map((a) => dayKey(a.createdAt)))).sort()
  let best = 1
  let cur = 1
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1])
    const now = new Date(days[i])
    const diff = Math.round((now.getTime() - prev.getTime()) / 86400000)
    if (diff === 1) cur++
    else cur = 1
    if (cur > best) best = cur
  }
  return best
}

/** 周键（年-周） */
const weekKey = (iso: string): string => {
  const d = new Date(iso)
  const onejan = new Date(d.getFullYear(), 0, 1)
  return `${d.getFullYear()}-${Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7)}`
}

/** 月键（年-月） */
const monthKey = (iso: string): string => iso.slice(0, 7)

/** 不同月数 */
const distinctMonths = (acts: Activity[]): number =>
  new Set(acts.map((a) => monthKey(a.createdAt))).size

/** 不同子类型数 */
const distinctSubtypes = (acts: Activity[]): number =>
  new Set(acts.map((a) => a.subtype ?? a.title).values()).size

/** 运动总时长（分钟） */
const exerciseTotalMin = (s: AppState): number =>
  byType(s, 'exercise').reduce((sum, a) => sum + (a.durationMinutes ?? 0), 0)

// ===== 任务榜 / 番茄钟 helper =====

/** 任务榜节点（宽松结构） */
interface BoardNode {
  data?: { status?: unknown; [k: string]: unknown }
  children?: BoardNode[]
}

/** 深度遍历任务榜节点树 */
const walkBoard = (node: BoardNode | undefined, fn: (n: BoardNode) => void): void => {
  if (!node) return
  fn(node)
  for (const c of node.children ?? []) walkBoard(c, fn)
}

/** 任务榜节点总数（含根节点） */
const boardNodeCount = (s: AppState): number =>
  (s.mindMaps ?? []).reduce((sum, m) => {
    let n = 0
    walkBoard(m.data as BoardNode, () => {
      n++
    })
    return sum + n
  }, 0)

/** 任务榜上指定状态的节点数（如 'done' / 'urgent'） */
const boardStatusCount = (s: AppState, status: string): number =>
  (s.mindMaps ?? []).reduce((sum, m) => {
    let n = 0
    walkBoard(m.data as BoardNode, (node) => {
      if (node.data?.status === status) n++
    })
    return sum + n
  }, 0)

/** 番茄钟完成的专注活动（由番茄钟自动记录，描述含 🍅 标记） */
const pomodoroActs = (s: AppState): Activity[] =>
  s.activities.filter((a) => (a.description ?? '').includes('🍅'))

/** 单日完成番茄数的最大值 */
const maxPomoPerDay = (acts: Activity[]): number => {
  const c: Record<string, number> = {}
  for (const a of acts) {
    const k = dayKey(a.createdAt)
    c[k] = (c[k] ?? 0) + 1
  }
  return Math.max(0, ...Object.values(c))
}

// ===== 夜行 / 超长单次 helper =====

/** 活动发生的小时（本地时间 0-23） */
const hourOf = (iso: string): number => new Date(iso).getHours()

/** 凌晨活动（0-5 点，排除睡眠——睡眠的记录时刻不代表熬夜时长） */
const nightActs = (s: AppState): Activity[] =>
  s.activities.filter((a) => a.type !== 'sleep' && hourOf(a.createdAt) < 6)

/** 凌晨累计活动时长 ≥ minutes 的不同日期数 */
const nightDaysOver = (acts: Activity[], minutes: number): number => {
  const c: Record<string, number> = {}
  for (const a of acts) {
    const k = dayKey(a.createdAt)
    c[k] = (c[k] ?? 0) + (a.durationMinutes ?? 0)
  }
  return Object.values(c).filter((v) => v >= minutes).length
}

/** 单日凌晨累计活动时长的最大值（分钟） */
const maxNightMinutes = (acts: Activity[]): number => {
  const c: Record<string, number> = {}
  for (const a of acts) {
    const k = dayKey(a.createdAt)
    c[k] = (c[k] ?? 0) + (a.durationMinutes ?? 0)
  }
  return Math.max(0, ...Object.values(c))
}

/** 通宵：前一晚 21 点后有活动，且次日 0-5 点仍在活动 */
const hasAllNighter = (acts: Activity[]): boolean => {
  const nightKeys = new Set<string>()
  const eveKeys = new Set<string>()
  for (const a of acts) {
    const h = hourOf(a.createdAt)
    if (h < 6) nightKeys.add(dayKey(a.createdAt))
    else if (h >= 21) eveKeys.add(dayKey(a.createdAt))
  }
  for (const k of nightKeys) {
    const prev = new Date(new Date(k).getTime() - 86400000).toISOString().slice(0, 10)
    if (eveKeys.has(prev)) return true
  }
  return false
}

/** 单次活动最大时长（分钟，排除睡眠） */
const maxSingleDuration = (s: AppState): number =>
  Math.max(0, ...s.activities.filter((a) => a.type !== 'sleep').map((a) => a.durationMinutes ?? 0))

// ===== 局（Session）helper =====

/** 局历史（v1.0 局系统） */
const sessions = (s: AppState): GameSession[] => s.sessions ?? []

/** 累计局数 */
const sessionCount = (s: AppState): number => sessions(s).length

/** 累计投入分钟 */
const sessionTotalMin = (s: AppState): number =>
  sessions(s).reduce((sum, x) => sum + x.actualMinutes, 0)

/** 单局最大实际投入（分钟） */
const sessionMaxMin = (s: AppState): number =>
  Math.max(0, ...sessions(s).map((x) => x.actualMinutes))

/** 历史最高效率修正 */
const sessionBestEff = (s: AppState): number =>
  Math.max(0, ...sessions(s).map((x) => x.efficiency))

/** 提前结束的局数（做了多少，就获得多少） */
const sessionEarlyCount = (s: AppState): number =>
  sessions(s).filter((x) => x.status === 'early').length

/** 单日完成局数的最大值 */
const sessionMaxPerDay = (s: AppState): number => {
  const c: Record<string, number> = {}
  for (const x of sessions(s)) {
    const k = dayKey(x.endTime)
    c[k] = (c[k] ?? 0) + 1
  }
  return Math.max(0, ...Object.values(c))
}

// ===== ⚔️ 讨伐（BOSS）helper =====

/** 累计讨伐次数（历届击杀 + 本周已击杀） */
const bossKillCount = (s: AppState): number =>
  (s.bossState?.history ?? []).filter((h) => h.killed).length +
  (s.bossState?.killedAt ? 1 : 0)

/** 历次击杀的小时（本地时间 0-23，旧档案无 killedAt 则缺失） */
const bossKillHours = (s: AppState): number[] => {
  const hours: number[] = []
  for (const h of s.bossState?.history ?? []) {
    if (h.killed && h.killedAt) hours.push(new Date(h.killedAt).getHours())
  }
  if (s.bossState?.killedAt) hours.push(new Date(s.bossState.killedAt).getHours())
  return hours
}

/** 是否工作时间（9-17 点）内击杀 */
const isWorkHourKill = (h: number): boolean => h >= 9 && h < 17

/** 讨伐累计实际生活耗时（分钟，= 造成过伤害的局的 actualMinutes 之和） */
const bossTotalMin = (s: AppState): number =>
  (s.sessions ?? [])
    .filter((x) => (x.bossDamage ?? 0) > 0)
    .reduce((sum, x) => sum + x.actualMinutes, 0)

/** 单一方式讨伐：某次击杀周内造成伤害的所有局（≥2 局）全是同一活动类型 */
const bossSingleMethodKill = (s: AppState): boolean => {
  const bs = s.bossState
  if (!bs) return false
  const killedWeeks = new Set<string>()
  for (const h of bs.history) if (h.killed) killedWeeks.add(h.weekKey)
  if (bs.killedAt) killedWeeks.add(bs.weekKey)
  if (killedWeeks.size === 0) return false
  const weekTypes = new Map<string, Set<string>>()
  const weekHits = new Map<string, number>()
  for (const x of s.sessions ?? []) {
    if ((x.bossDamage ?? 0) <= 0) continue
    const wk = isoWeekKey(new Date(x.endTime))
    if (!killedWeeks.has(wk)) continue
    if (!weekTypes.has(wk)) {
      weekTypes.set(wk, new Set())
      weekHits.set(wk, 0)
    }
    weekTypes.get(wk)!.add(x.type)
    weekHits.set(wk, weekHits.get(wk)! + 1)
  }
  for (const [wk, types] of weekTypes) {
    if (types.size === 1 && (weekHits.get(wk) ?? 0) >= 2) return true
  }
  return false
}

// ===== 成就定义（190 个，23 分类） =====

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  // ===== 🌱 初见 (10) =====
  {
    id: 'first_xp',
    title: '第一个 XP',
    description: '获得第一次经验值。',
    icon: '🌱',
    category: 'first',
    rarity: 'common',
    xpReward: 10,
    check: (s) => s.player.totalXp > 0,
  },
  {
    id: 'first_action',
    title: '迈出第一步',
    description: '记录第一次行动。',
    icon: '🌱',
    category: 'first',
    rarity: 'common',
    xpReward: 10,
    check: (s) => s.activities.length >= 1,
  },
  {
    id: 'first_levelup',
    title: '第一次升级',
    description: '达到 Lv.2。',
    icon: '🌱',
    category: 'first',
    rarity: 'common',
    coinReward: 50,
    check: (s) => s.player.level >= 2,
  },
  {
    id: 'first_purchase',
    title: '第一次购买物品',
    description: '在商店购买第一件物品。',
    icon: '🌱',
    category: 'first',
    rarity: 'common',
    check: (s) => s.player.unlockedItems.length >= 1,
  },
  {
    id: 'first_mood',
    title: '第一次写每日感悟',
    description: '记录第一次心理状态。',
    icon: '🌱',
    category: 'first',
    rarity: 'common',
    xpReward: 10,
    check: (s) => s.moods.length >= 1,
  },
  {
    id: 'first_pattern',
    title: '第一次发现行为模式',
    description: 'AI 识别出你的第一个行为模式。',
    icon: '🌱',
    category: 'first',
    rarity: 'uncommon',
    insightXp: 30,
    check: (s) => (s.patterns ?? []).length >= 1,
  },
  {
    id: 'first_insight_xp',
    title: '第一次获得 Insight XP',
    description: '通过认知突破获得 Insight XP。',
    icon: '🌱',
    category: 'first',
    rarity: 'uncommon',
    insightXp: 20,
    check: (s) => s.achievements.some((a) => a.isCognitive),
  },
  {
    id: 'first_ai_advice',
    title: '第一次完成 AI 建议',
    description: '根据同行者的话采取行动。',
    icon: '🌱',
    category: 'first',
    rarity: 'common',
    xpReward: 15,
    check: (s) => (s.suggestions ?? []).some((g) => g.status === 'accepted' || g.status === 'executed'),
  },
  {
    id: 'first_minimal_action',
    title: '第一次完成最小行动',
    description: '在不想做的时候，依然完成一个小步骤。',
    icon: '🌱',
    category: 'first',
    rarity: 'common',
    xpReward: 15,
    check: (s) => hasKeyword(s.activities, '最小行动') || hasKeyword(s.activities, '五分钟'),
  },
  {
    id: 'first_rest',
    title: '第一次进入休息模式',
    description: '主动开启休息模式。',
    icon: '🌱',
    category: 'first',
    rarity: 'common',
    check: () => false, // 由 store 在 toggleRestMode 时标记；此处保留占位
  },

  // ===== 🔥 行动 (10) =====
  {
    id: 'act_today_too',
    title: '今天也做了',
    description: '连续 2 天记录行动。',
    icon: '🔥',
    category: 'action',
    rarity: 'common',
    xpReward: 15,
    check: (s) => longestStreak(s.activities) >= 2,
  },
  {
    id: 'act_no_tomorrow',
    title: '不等明天',
    description: '在一天内记录 3 次以上行动。',
    icon: '🔥',
    category: 'action',
    rarity: 'common',
    xpReward: 20,
    check: (s) => {
      const today = dayKey(new Date().toISOString())
      return s.activities.filter((a) => dayKey(a.createdAt) === today).length >= 3
    },
  },
  {
    id: 'act_five_min_hero',
    title: '五分钟勇者',
    description: '完成一次时长 5 分钟以内的行动——开始本身就是胜利。',
    icon: '🔥',
    category: 'action',
    rarity: 'common',
    xpReward: 15,
    check: (s) => s.activities.some((a) => (a.durationMinutes ?? 99) <= 5 && a.durationMinutes !== undefined),
  },
  {
    id: 'act_streak_7',
    title: '连续七日',
    description: '连续 7 天记录行动。',
    icon: '🔥',
    category: 'action',
    rarity: 'uncommon',
    xpReward: 50,
    coinReward: 50,
    check: (s) => longestStreak(s.activities) >= 7,
  },
  {
    id: 'act_streak_30',
    title: '连续三十日',
    description: '连续 30 天记录行动。',
    icon: '🔥',
    category: 'action',
    rarity: 'rare',
    xpReward: 150,
    coinReward: 200,
    check: (s) => longestStreak(s.activities) >= 30,
  },
  {
    id: 'act_restart',
    title: '重新开始',
    description: '中断记录 7 天后，重新开始记录。',
    icon: '🔥',
    category: 'action',
    rarity: 'uncommon',
    insightXp: 40,
    check: (s) => {
      if (s.activities.length < 2) return false
      const days = Array.from(new Set(s.activities.map((a) => dayKey(a.createdAt)))).sort()
      for (let i = 1; i < days.length; i++) {
        const diff = Math.round((new Date(days[i]).getTime() - new Date(days[i - 1]).getTime()) / 86400000)
        if (diff >= 7) return true
      }
      return false
    },
  },
  {
    id: 'act_first_step_done',
    title: '做完第一步',
    description: '记录一次标题包含「第一步」的行动。',
    icon: '🔥',
    category: 'action',
    rarity: 'common',
    xpReward: 15,
    check: (s) => hasKeyword(s.activities, '第一步'),
  },
  {
    id: 'act_push_procrastinated',
    title: '把一个拖延很久的事情推进',
    description: '记录一次标题包含「拖延」的推进。',
    icon: '🔥',
    category: 'action',
    rarity: 'uncommon',
    insightXp: 40,
    check: (s) => hasKeyword(s.activities, '拖延'),
  },
  {
    id: 'act_five_minimal',
    title: '连续完成五个最小行动',
    description: '累计记录 5 次最小行动。',
    icon: '🔥',
    category: 'action',
    rarity: 'uncommon',
    xpReward: 40,
    check: (s) => s.activities.filter((a) => a.title.includes('最小行动') || a.title.includes('五分钟')).length >= 5,
  },
  {
    id: 'act_unwilling_done',
    title: '在不想做的时候依然完成',
    description: '记录一次低强度但主动的行动。',
    icon: '🔥',
    category: 'action',
    rarity: 'uncommon',
    insightXp: 30,
    check: (s) => s.activities.some((a) => a.proactive && a.intensity === 'low'),
  },

  // ===== 💻 工作 (10) =====
  {
    id: 'work_first_solve',
    title: '第一次独立解决问题',
    description: '记录一次独立完成的高难度工作任务。',
    icon: '💻',
    category: 'work',
    rarity: 'common',
    xpReward: 20,
    check: (s) => s.activities.some((a) => a.type === 'work' && a.proactive && (a.difficulty ?? 0) >= 3),
  },
  {
    id: 'work_first_bug',
    title: '第一次独立定位 Bug',
    description: '记录一次标题包含「Bug」或「定位」的工作。',
    icon: '💻',
    category: 'work',
    rarity: 'common',
    xpReward: 20,
    check: (s) => hasKeyword(byType(s, 'work'), 'Bug') || hasKeyword(byType(s, 'work'), '定位'),
  },
  {
    id: 'work_first_complex',
    title: '第一次完成复杂需求',
    description: '记录一次难度 4 以上的工作任务。',
    icon: '💻',
    category: 'work',
    rarity: 'uncommon',
    xpReward: 30,
    check: (s) => s.activities.some((a) => a.type === 'work' && (a.difficulty ?? 0) >= 4),
  },
  {
    id: 'work_first_comm',
    title: '第一次主动沟通',
    description: '记录一次主动沟通的社交活动。',
    icon: '💻',
    category: 'work',
    rarity: 'common',
    xpReward: 20,
    check: (s) => s.activities.some((a) => a.type === 'social' && a.proactive),
  },
  {
    id: 'work_first_decompose',
    title: '第一次拆解模糊需求',
    description: '记录一次标题包含「拆解」或「需求」的工作。',
    icon: '💻',
    category: 'work',
    rarity: 'uncommon',
    xpReward: 30,
    check: (s) => hasKeyword(byType(s, 'work'), '拆解') || hasKeyword(byType(s, 'work'), '需求'),
  },
  {
    id: 'work_first_urgent',
    title: '第一次成功处理紧急事件',
    description: '记录一次标题包含「紧急」或「线上」的工作。',
    icon: '💻',
    category: 'work',
    rarity: 'uncommon',
    xpReward: 35,
    check: (s) => hasKeyword(byType(s, 'work'), '紧急') || hasKeyword(byType(s, 'work'), '线上'),
  },
  {
    id: 'work_find_system_issue',
    title: '第一次发现系统问题',
    description: '记录一次标题包含「系统」或「架构」的发现。',
    icon: '💻',
    category: 'work',
    rarity: 'rare',
    xpReward: 50,
    check: (s) => hasKeyword(byType(s, 'work'), '系统') || hasKeyword(byType(s, 'work'), '架构'),
  },
  {
    id: 'work_help_other',
    title: '第一次帮助别人解决技术问题',
    description: '记录一次标题包含「帮助」或「分享」的工作。',
    icon: '💻',
    category: 'work',
    rarity: 'uncommon',
    xpReward: 30,
    check: (s) => hasKeyword(byType(s, 'work'), '帮助') || hasKeyword(byType(s, 'work'), '分享'),
  },
  {
    id: 'work_efficient_not_overtime',
    title: '用更高效的方法替代无意义加班',
    description: '记录一次标题包含「高效」或「优化」的工作。',
    icon: '💻',
    category: 'work',
    rarity: 'rare',
    insightXp: 50,
    check: (s) => hasKeyword(byType(s, 'work'), '高效') || hasKeyword(byType(s, 'work'), '优化'),
  },
  {
    id: 'work_refuse_unfair',
    title: '第一次主动拒绝不合理责任转移',
    description: '记录一次标题包含「拒绝」的反思。',
    icon: '💻',
    category: 'work',
    rarity: 'rare',
    insightXp: 60,
    check: (s) => s.moods.some((m) => m.content.includes('拒绝')) || s.activities.some((a) => a.title.includes('拒绝')),
  },

  // ===== 📚 学习 (10) =====
  {
    id: 'study_first_page',
    title: '翻开第一页',
    description: '记录第一次学习活动。',
    icon: '📚',
    category: 'study',
    rarity: 'common',
    xpReward: 10,
    check: (s) => byType(s, 'study').length >= 1,
  },
  {
    id: 'study_first_chapter',
    title: '第一章',
    description: '记录一次标题包含「第一章」或「章节」的学习。',
    icon: '📚',
    category: 'study',
    rarity: 'common',
    xpReward: 15,
    check: (s) => hasKeyword(byType(s, 'study'), '第一章') || hasKeyword(byType(s, 'study'), '章节'),
  },
  {
    id: 'study_first_book',
    title: '第一本完整读完的书',
    description: '记录一次标题包含「读完」的学习活动。',
    icon: '📚',
    category: 'study',
    rarity: 'uncommon',
    xpReward: 40,
    check: (s) => byType(s, 'study').some((a) => a.title.includes('读完') || (a.description ?? '').includes('读完')),
  },
  {
    id: 'study_streak_7',
    title: '连续七日学习',
    description: '在 7 个不同日期记录过学习活动。',
    icon: '📚',
    category: 'study',
    rarity: 'uncommon',
    xpReward: 40,
    check: (s) => distinctDays(byType(s, 'study')) >= 7,
  },
  {
    id: 'study_first_output',
    title: '第一次学习输出',
    description: '记录一次包含描述的学习笔记。',
    icon: '📚',
    category: 'study',
    rarity: 'common',
    xpReward: 20,
    check: (s) => byType(s, 'study').some((a) => (a.description ?? '').length > 10),
  },
  {
    id: 'study_first_share',
    title: '第一次技术分享',
    description: '记录一次标题包含「分享」的学习。',
    icon: '📚',
    category: 'study',
    rarity: 'uncommon',
    xpReward: 35,
    check: (s) => hasKeyword(byType(s, 'study'), '分享'),
  },
  {
    id: 'study_strange_tech',
    title: '第一次解决陌生技术问题',
    description: '记录一次标题包含「陌生」或「新技术」的学习。',
    icon: '📚',
    category: 'study',
    rarity: 'uncommon',
    xpReward: 35,
    check: (s) => hasKeyword(byType(s, 'study'), '陌生') || hasKeyword(byType(s, 'study'), '新技术'),
  },
  {
    id: 'study_explain_concept',
    title: '第一次把复杂概念讲给别人',
    description: '记录一次标题包含「讲解」或「概念」的学习。',
    icon: '📚',
    category: 'study',
    rarity: 'rare',
    insightXp: 40,
    check: (s) => hasKeyword(byType(s, 'study'), '讲解') || hasKeyword(byType(s, 'study'), '概念'),
  },
  {
    id: 'study_indie_project',
    title: '第一次完成独立学习项目',
    description: '记录一次标题包含「项目」或「完成」的学习。',
    icon: '📚',
    category: 'study',
    rarity: 'rare',
    xpReward: 60,
    check: (s) => hasKeyword(byType(s, 'study'), '项目') || hasKeyword(byType(s, 'study'), 'Demo'),
  },
  {
    id: 'study_for_interest',
    title: '因为兴趣主动学习',
    description: '记录一次主动的、不为任务的学习。',
    icon: '📚',
    category: 'study',
    rarity: 'uncommon',
    insightXp: 40,
    check: (s) => byType(s, 'study').some((a) => a.proactive && (a.title.includes('兴趣') || (a.description?.includes('兴趣') ?? false))),
  },

  // ===== 🏸 运动 (8) =====
  {
    id: 'ex_first',
    title: '第一次运动',
    description: '记录第一次运动。',
    icon: '🏸',
    category: 'exercise',
    rarity: 'common',
    xpReward: 10,
    check: (s) => byType(s, 'exercise').length >= 1,
  },
  {
    id: 'ex_first_badminton',
    title: '第一场羽毛球',
    description: '记录一次羽毛球运动。',
    icon: '🏸',
    category: 'exercise',
    rarity: 'common',
    xpReward: 15,
    check: (s) => byType(s, 'exercise').some((a) => a.subtype === 'badminton' || a.title.includes('羽毛球')),
  },
  {
    id: 'ex_streak_7',
    title: '连续七日运动',
    description: '在 7 个不同日期记录过运动。',
    icon: '🏸',
    category: 'exercise',
    rarity: 'uncommon',
    xpReward: 40,
    check: (s) => distinctDays(byType(s, 'exercise')) >= 7,
  },
  {
    id: 'ex_over_1h',
    title: '第一次运动超过 1 小时',
    description: '记录一次时长超过 60 分钟的运动。',
    icon: '🏸',
    category: 'exercise',
    rarity: 'common',
    xpReward: 20,
    check: (s) => s.activities.some((a) => a.type === 'exercise' && (a.durationMinutes ?? 0) > 60),
  },
  {
    id: 'ex_recover_mood',
    title: '主动选择运动恢复心情',
    description: '记录一次标题包含「恢复」或「心情」的运动。',
    icon: '🏸',
    category: 'exercise',
    rarity: 'uncommon',
    insightXp: 30,
    check: (s) => hasKeyword(byType(s, 'exercise'), '恢复') || hasKeyword(byType(s, 'exercise'), '心情'),
  },
  {
    id: 'ex_find_suitable',
    title: '发现某种运动适合自己',
    description: '记录 3 次以上同一类型的运动。',
    icon: '🏸',
    category: 'exercise',
    rarity: 'uncommon',
    xpReward: 30,
    check: (s) => {
      const subs = byType(s, 'exercise').map((a) => a.subtype ?? a.title)
      const counts: Record<string, number> = {}
      for (const k of subs) counts[k] = (counts[k] ?? 0) + 1
      return Object.values(counts).some((c) => c >= 3)
    },
  },
  {
    id: 'ex_10_types',
    title: '完成 10 种不同运动',
    description: '尝试过 10 种不同的运动方式。',
    icon: '🏸',
    category: 'exercise',
    rarity: 'rare',
    xpReward: 60,
    check: (s) => distinctSubtypes(byType(s, 'exercise')) >= 10,
  },
  {
    id: 'ex_total_1000min',
    title: '运动总时长达到里程碑',
    description: '累计运动时长超过 1000 分钟。',
    icon: '🏸',
    category: 'exercise',
    rarity: 'epic',
    xpReward: 100,
    coinReward: 100,
    check: (s) => exerciseTotalMin(s) >= 1000,
  },

  // ===== 🥗 健康 (6) =====
  {
    id: 'health_first_weight',
    title: '第一次记录体重',
    description: '记录第一次体重数据。',
    icon: '🥗',
    category: 'health',
    rarity: 'common',
    xpReward: 10,
    check: (s) => s.weights.length >= 1,
  },
  {
    id: 'health_weight_7',
    title: '连续记录体重 7 天',
    description: '在 7 个不同日期记录体重。',
    icon: '🥗',
    category: 'health',
    rarity: 'common',
    xpReward: 25,
    check: (s) => new Set(s.weights.map((w) => w.date)).size >= 7,
  },
  {
    id: 'health_weight_30',
    title: '连续记录体重 30 天',
    description: '在 30 个不同日期记录体重。',
    icon: '🥗',
    category: 'health',
    rarity: 'uncommon',
    xpReward: 60,
    coinReward: 50,
    check: (s) => new Set(s.weights.map((w) => w.date)).size >= 30,
  },
  {
    id: 'health_first_sleep',
    title: '第一次记录睡眠',
    description: '记录一次睡眠活动。',
    icon: '🥗',
    category: 'health',
    rarity: 'common',
    xpReward: 10,
    check: (s) => byType(s, 'sleep').length >= 1,
  },
  {
    id: 'health_good_sleep_7',
    title: '连续 7 天记录睡眠',
    description: '在 7 个不同日期记录过睡眠。',
    icon: '🥗',
    category: 'health',
    rarity: 'uncommon',
    xpReward: 40,
    check: (s) => distinctDays(byType(s, 'sleep')) >= 7,
  },
  {
    id: 'health_first_food',
    title: '第一次记录饮食',
    description: '记录一次饮食活动。',
    icon: '🥗',
    category: 'health',
    rarity: 'common',
    xpReward: 10,
    check: (s) => byType(s, 'food').length >= 1,
  },

  // ===== ⚖️ 生活 (6) =====
  {
    id: 'life_first',
    title: '第一次记录生活',
    description: '记录第一次生活类活动。',
    icon: '⚖️',
    category: 'life',
    rarity: 'common',
    xpReward: 10,
    check: (s) => byType(s, 'life').length >= 1,
  },
  {
    id: 'life_first_cook',
    title: '第一次为自己做饭',
    description: '记录一次标题包含「做饭」或「下厨」的生活。',
    icon: '⚖️',
    category: 'life',
    rarity: 'common',
    xpReward: 20,
    check: (s) => hasKeyword(byType(s, 'life'), '做饭') || hasKeyword(byType(s, 'life'), '下厨'),
  },
  {
    id: 'life_first_clean',
    title: '第一次整理房间',
    description: '记录一次标题包含「整理」或「打扫」的生活。',
    icon: '⚖️',
    category: 'life',
    rarity: 'common',
    xpReward: 20,
    check: (s) => hasKeyword(byType(s, 'life'), '整理') || hasKeyword(byType(s, 'life'), '打扫'),
  },
  {
    id: 'life_30_days',
    title: '认真生活 30 天',
    description: '在 30 个不同日期记录过生活类活动。',
    icon: '⚖️',
    category: 'life',
    rarity: 'uncommon',
    xpReward: 60,
    check: (s) => distinctDays(byType(s, 'life')) >= 30,
  },
  {
    id: 'life_first_walk',
    title: '第一次散步',
    description: '记录一次标题包含「散步」或「走路」的生活。',
    icon: '⚖️',
    category: 'life',
    rarity: 'common',
    xpReward: 15,
    check: (s) => hasKeyword(byType(s, 'life'), '散步') || hasKeyword(byType(s, 'life'), '走路'),
  },
  {
    id: 'life_routine',
    title: '建立自己的节奏',
    description: '在 14 个不同日期记录过生活类活动。',
    icon: '⚖️',
    category: 'life',
    rarity: 'uncommon',
    insightXp: 30,
    check: (s) => distinctDays(byType(s, 'life')) >= 14,
  },

  // ===== 🎨 创造 (10) =====
  {
    id: 'create_first_work',
    title: '第一个作品',
    description: '记录第一次创造类活动。',
    icon: '🎨',
    category: 'creative',
    rarity: 'common',
    xpReward: 15,
    check: (s) => byType(s, 'creative').length >= 1,
  },
  {
    id: 'create_first_image',
    title: '第一张图片',
    description: '记录一次标题包含「图片」或「画」的创造。',
    icon: '🎨',
    category: 'creative',
    rarity: 'common',
    xpReward: 20,
    check: (s) => hasKeyword(byType(s, 'creative'), '图片') || hasKeyword(byType(s, 'creative'), '画'),
  },
  {
    id: 'create_first_video',
    title: '第一条视频',
    description: '记录一次标题包含「视频」的创造。',
    icon: '🎨',
    category: 'creative',
    rarity: 'common',
    xpReward: 20,
    check: (s) => hasKeyword(byType(s, 'creative'), '视频'),
  },
  {
    id: 'create_first_code',
    title: '第一段代码',
    description: '记录一次标题包含「代码」或「编程」的创造。',
    icon: '🎨',
    category: 'creative',
    rarity: 'common',
    xpReward: 20,
    check: (s) => hasKeyword(byType(s, 'creative'), '代码') || hasKeyword(byType(s, 'creative'), '编程'),
  },
  {
    id: 'create_first_scene',
    title: '第一个游戏场景',
    description: '记录一次标题包含「场景」或「Godot」的创造。',
    icon: '🎨',
    category: 'creative',
    rarity: 'uncommon',
    xpReward: 35,
    check: (s) => hasKeyword(byType(s, 'creative'), '场景') || hasKeyword(byType(s, 'creative'), 'Godot'),
  },
  {
    id: 'create_first_demo',
    title: '第一个 Godot Demo',
    description: '记录一次标题包含「Demo」或「原型」的创造。',
    icon: '🎨',
    category: 'creative',
    rarity: 'uncommon',
    xpReward: 40,
    check: (s) => hasKeyword(byType(s, 'creative'), 'Demo') || hasKeyword(byType(s, 'creative'), '原型'),
  },
  {
    id: 'create_first_publish',
    title: '第一次发布作品',
    description: '记录一次标题包含「发布」或「上线」的创造。',
    icon: '🎨',
    category: 'creative',
    rarity: 'rare',
    xpReward: 60,
    check: (s) => hasKeyword(byType(s, 'creative'), '发布') || hasKeyword(byType(s, 'creative'), '上线'),
  },
  {
    id: 'create_first_seen',
    title: '第一次有人看到自己的作品',
    description: '记录一次标题包含「反馈」或「点赞」的创造。',
    icon: '🎨',
    category: 'creative',
    rarity: 'rare',
    insightXp: 40,
    check: (s) => hasKeyword(byType(s, 'creative'), '反馈') || hasKeyword(byType(s, 'creative'), '点赞'),
  },
  {
    id: 'create_streak_7',
    title: '连续创造 7 天',
    description: '在 7 个不同日期记录过创造活动。',
    icon: '🎨',
    category: 'creative',
    rarity: 'uncommon',
    xpReward: 50,
    check: (s) => distinctDays(byType(s, 'creative')) >= 7,
  },
  {
    id: 'create_idea_to_real',
    title: '把想法变成可运行的东西',
    description: '记录一次标题包含「运行」或「实现」的创造。',
    icon: '🎨',
    category: 'creative',
    rarity: 'epic',
    xpReward: 100,
    coinReward: 100,
    check: (s) => hasKeyword(byType(s, 'creative'), '运行') || hasKeyword(byType(s, 'creative'), '实现'),
  },

  // ===== 🎮 快乐 (8) =====
  {
    id: 'joy_first_game',
    title: '第一次发现真正喜欢的游戏',
    description: '记录一次游戏类活动。',
    icon: '🎮',
    category: 'joy',
    rarity: 'common',
    xpReward: 10,
    check: (s) => byType(s, 'game').length >= 1,
  },
  {
    id: 'joy_first_rest',
    title: '第一次主动休息',
    description: '进入休息模式。',
    icon: '🎮',
    category: 'joy',
    rarity: 'common',
    xpReward: 15,
    check: () => false, // 由 store 标记
  },
  {
    id: 'joy_mood_better',
    title: '因为一张图片心情变好',
    description: '记录一次标题包含「图片」或「开心」的快乐。',
    icon: '🎮',
    category: 'joy',
    rarity: 'common',
    insightXp: 20,
    check: (s) => hasKeyword(byType(s, 'game'), '图片') || hasKeyword(byType(s, 'game'), '开心'),
  },
  {
    id: 'joy_record_source',
    title: '第一次记录快乐来源',
    description: '记录一次标题包含「快乐」或「喜欢」的活动。',
    icon: '🎮',
    category: 'joy',
    rarity: 'common',
    xpReward: 15,
    check: (s) => s.activities.some((a) => a.title.includes('快乐') || a.title.includes('喜欢')),
  },
  {
    id: 'joy_find_way',
    title: '找到自己的快乐方式',
    description: '记录 5 次以上游戏类活动。',
    icon: '🎮',
    category: 'joy',
    rarity: 'uncommon',
    insightXp: 30,
    check: (s) => byType(s, 'game').length >= 5,
  },
  {
    id: 'joy_5_week',
    title: '一周拥有 5 次主动快乐',
    description: '在同一周内记录 5 次游戏活动。',
    icon: '🎮',
    category: 'joy',
    rarity: 'uncommon',
    xpReward: 40,
    check: (s) => {
      const counts: Record<string, number> = {}
      for (const a of byType(s, 'game')) {
        const k = weekKey(a.createdAt)
        counts[k] = (counts[k] ?? 0) + 1
      }
      return Object.values(counts).some((c) => c >= 5)
    },
  },
  {
    id: 'joy_enjoy_afternoon',
    title: '第一次认真享受一个下午',
    description: '记录一次时长超过 120 分钟的游戏活动。',
    icon: '🎮',
    category: 'joy',
    rarity: 'uncommon',
    xpReward: 30,
    check: (s) => s.activities.some((a) => a.type === 'game' && (a.durationMinutes ?? 0) > 120),
  },
  {
    id: 'joy_no_guilt',
    title: '第一次不因休息而自责',
    description: '在休息模式下记录一次心理状态，且心情 ≥ 4。',
    icon: '🎮',
    category: 'joy',
    rarity: 'rare',
    insightXp: 50,
    check: (s) => s.restMode && s.moods.some((m) => m.mood >= 4),
  },

  // ===== ❤️ 关系 (6) =====
  {
    id: 'rel_first_social',
    title: '第一次主动社交',
    description: '记录一次主动的社交活动。',
    icon: '❤️',
    category: 'relation',
    rarity: 'common',
    xpReward: 15,
    check: (s) => s.activities.some((a) => a.type === 'social' && a.proactive),
  },
  {
    id: 'rel_first_reach',
    title: '第一次主动联系朋友',
    description: '记录一次标题包含「联系」或「朋友」的社交。',
    icon: '❤️',
    category: 'relation',
    rarity: 'common',
    xpReward: 20,
    check: (s) => hasKeyword(byType(s, 'social'), '联系') || hasKeyword(byType(s, 'social'), '朋友'),
  },
  {
    id: 'rel_first_listen',
    title: '第一次认真倾听',
    description: '记录一次标题包含「倾听」或「聊天」的社交。',
    icon: '❤️',
    category: 'relation',
    rarity: 'uncommon',
    xpReward: 25,
    check: (s) => hasKeyword(byType(s, 'social'), '倾听') || hasKeyword(byType(s, 'social'), '聊天'),
  },
  {
    id: 'rel_first_thanks',
    title: '第一次说「谢谢」而不是「没有没有」',
    description: '记录一次标题包含「谢谢」或「接受」的社交。',
    icon: '❤️',
    category: 'relation',
    rarity: 'uncommon',
    insightXp: 30,
    check: (s) => hasKeyword(byType(s, 'social'), '谢谢') || hasKeyword(byType(s, 'social'), '接受'),
  },
  {
    id: 'rel_first_family',
    title: '第一次主动陪伴家人',
    description: '记录一次标题包含「家人」或「陪伴」的社交。',
    icon: '❤️',
    category: 'relation',
    rarity: 'uncommon',
    xpReward: 30,
    check: (s) => hasKeyword(byType(s, 'social'), '家人') || hasKeyword(byType(s, 'social'), '陪伴'),
  },
  {
    id: 'rel_boundary',
    title: '第一次建立边界',
    description: '记录一次标题包含「边界」或「拒绝」的社交。',
    icon: '❤️',
    category: 'relation',
    rarity: 'rare',
    insightXp: 50,
    check: (s) => hasKeyword(byType(s, 'social'), '边界') || hasKeyword(byType(s, 'social'), '拒绝'),
  },

  // ===== 🧠 洞察 (10) =====
  {
    id: 'ins_first_observe',
    title: '第一次认真观察自己的情绪',
    description: '记录第一次心理状态。',
    icon: '🧠',
    category: 'insight',
    rarity: 'common',
    insightXp: 20,
    check: (s) => s.moods.length >= 1,
  },
  {
    id: 'ins_fact_vs_explain',
    title: '第一次分辨事实和解释',
    description: '记录一次标题包含「事实」或「解释」的心理活动。',
    icon: '🧠',
    category: 'insight',
    rarity: 'uncommon',
    insightXp: 40,
    check: (s) => hasKeyword(byType(s, 'mental'), '事实') || hasKeyword(byType(s, 'mental'), '解释'),
  },
  {
    id: 'ins_rumination',
    title: '第一次发现自己的反刍',
    description: '通过同行者对话识别出反刍。',
    icon: '🧠',
    category: 'insight',
    rarity: 'rare',
    insightXp: 60,
    check: (s) => (s.chatHistory ?? []).some((m) => m.isRumination),
  },
  {
    id: 'ins_external_trigger',
    title: '第一次发现外部评价触发',
    description: '记录一次标题包含「评价」或「比较」的心理活动。',
    icon: '🧠',
    category: 'insight',
    rarity: 'uncommon',
    insightXp: 40,
    check: (s) => hasKeyword(byType(s, 'mental'), '评价') || hasKeyword(byType(s, 'mental'), '比较'),
  },
  {
    id: 'ins_escape',
    title: '第一次识别逃避行为',
    description: '记录一次标题包含「逃避」的心理活动。',
    icon: '🧠',
    category: 'insight',
    rarity: 'uncommon',
    insightXp: 40,
    check: (s) => hasKeyword(byType(s, 'mental'), '逃避'),
  },
  {
    id: 'ins_compare',
    title: '第一次识别自己的比较心理',
    description: '记录一次标题包含「比较」或「别人」的心理活动。',
    icon: '🧠',
    category: 'insight',
    rarity: 'uncommon',
    insightXp: 40,
    check: (s) => hasKeyword(byType(s, 'mental'), '比较') || hasKeyword(byType(s, 'mental'), '别人'),
  },
  {
    id: 'ins_accept_emotion',
    title: '第一次接受自己的真实情绪',
    description: '记录一次标题包含「接受」或「真实」的心理活动。',
    icon: '🧠',
    category: 'insight',
    rarity: 'rare',
    insightXp: 60,
    check: (s) => hasKeyword(byType(s, 'mental'), '接受') || hasKeyword(byType(s, 'mental'), '真实'),
  },
  {
    id: 'ins_find_pattern',
    title: '第一次发现自己的行为模式',
    description: 'AI 识别出 3 个以上行为模式。',
    icon: '🧠',
    category: 'insight',
    rarity: 'rare',
    insightXp: 60,
    check: (s) => (s.patterns ?? []).length >= 3,
  },
  {
    id: 'ins_re_understand',
    title: '第一次重新理解过去',
    description: '记录一次标题包含「过去」或「重新」的心理活动。',
    icon: '🧠',
    category: 'insight',
    rarity: 'epic',
    insightXp: 80,
    check: (s) => hasKeyword(byType(s, 'mental'), '过去') || hasKeyword(byType(s, 'mental'), '重新'),
  },
  {
    id: 'ins_already_effort',
    title: '第一次发现自己已经努力',
    description: '记录一次标题包含「努力」或「已经」的心理活动。',
    icon: '🧠',
    category: 'insight',
    rarity: 'rare',
    insightXp: 60,
    check: (s) => hasKeyword(byType(s, 'mental'), '努力') || hasKeyword(byType(s, 'mental'), '已经'),
  },

  // ===== 🛡️ 勇气 (8) =====
  {
    id: 'cou_ask_clear',
    title: '第一次主动问清楚',
    description: '记录一次标题包含「问清楚」或「确认」的工作或社交。',
    icon: '🛡️',
    category: 'courage',
    rarity: 'common',
    xpReward: 20,
    check: (s) => s.activities.some((a) => a.title.includes('问清楚') || a.title.includes('确认')),
  },
  {
    id: 'cou_diff_opinion',
    title: '第一次主动表达不同意见',
    description: '记录一次标题包含「不同意见」或「反对」的活动。',
    icon: '🛡️',
    category: 'courage',
    rarity: 'uncommon',
    xpReward: 30,
    check: (s) => s.activities.some((a) => a.title.includes('不同意见') || a.title.includes('反对')),
  },
  {
    id: 'cou_face_hard',
    title: '第一次面对难题没有逃走',
    description: '记录一次难度 4 以上且主动的工作。',
    icon: '🛡️',
    category: 'courage',
    rarity: 'uncommon',
    xpReward: 30,
    check: (s) => s.activities.some((a) => a.type === 'work' && a.proactive && (a.difficulty ?? 0) >= 4),
  },
  {
    id: 'cou_admit_unknown',
    title: '第一次承认自己不知道',
    description: '记录一次标题包含「不知道」或「请教」的活动。',
    icon: '🛡️',
    category: 'courage',
    rarity: 'uncommon',
    insightXp: 40,
    check: (s) => s.activities.some((a) => a.title.includes('不知道') || a.title.includes('请教')),
  },
  {
    id: 'cou_accept_disapproval',
    title: '第一次接受别人可能不认可自己',
    description: '记录一次标题包含「不认可」或「接受」的心理活动。',
    icon: '🛡️',
    category: 'courage',
    rarity: 'rare',
    insightXp: 60,
    check: (s) => hasKeyword(byType(s, 'mental'), '不认可') || hasKeyword(byType(s, 'mental'), '认可'),
  },
  {
    id: 'cou_refuse',
    title: '第一次拒绝不合理要求',
    description: '记录一次标题包含「拒绝」的活动。',
    icon: '🛡️',
    category: 'courage',
    rarity: 'rare',
    insightXp: 60,
    check: (s) => s.activities.some((a) => a.title.includes('拒绝')),
  },
  {
    id: 'cou_seek_help',
    title: '第一次主动寻求帮助',
    description: '记录一次标题包含「求助」或「帮助」的活动。',
    icon: '🛡️',
    category: 'courage',
    rarity: 'uncommon',
    xpReward: 30,
    check: (s) => s.activities.some((a) => a.title.includes('求助') || a.title.includes('寻求帮助')),
  },
  {
    id: 'cou_scary_decision',
    title: '第一次做一个让自己害怕的决定',
    description: '记录一次标题包含「害怕」或「决定」的心理活动。',
    icon: '🛡️',
    category: 'courage',
    rarity: 'epic',
    insightXp: 80,
    check: (s) => hasKeyword(byType(s, 'mental'), '害怕') || hasKeyword(byType(s, 'mental'), '决定'),
  },

  // ===== ⏳ 时间 (6) =====
  {
    id: 'time_1_week',
    title: '第一周',
    description: '在 7 个不同日期记录过行动。',
    icon: '⏳',
    category: 'time',
    rarity: 'common',
    xpReward: 20,
    check: (s) => distinctDays(s.activities) >= 7,
  },
  {
    id: 'time_1_month',
    title: '第一个月',
    description: '在 30 个不同日期记录过行动。',
    icon: '⏳',
    category: 'time',
    rarity: 'uncommon',
    xpReward: 50,
    check: (s) => distinctDays(s.activities) >= 30,
  },
  {
    id: 'time_3_months',
    title: '三个月',
    description: '在 3 个不同月份记录过行动。',
    icon: '⏳',
    category: 'time',
    rarity: 'uncommon',
    xpReward: 80,
    check: (s) => distinctMonths(s.activities) >= 3,
  },
  {
    id: 'time_half_year',
    title: '半年',
    description: '在 6 个不同月份记录过行动。',
    icon: '⏳',
    category: 'time',
    rarity: 'rare',
    xpReward: 150,
    coinReward: 100,
    check: (s) => distinctMonths(s.activities) >= 6,
  },
  {
    id: 'time_1_year',
    title: '一整年',
    description: '在 12 个不同月份记录过行动。',
    icon: '⏳',
    category: 'time',
    rarity: 'epic',
    xpReward: 300,
    coinReward: 300,
    check: (s) => distinctMonths(s.activities) >= 12,
  },
  {
    id: 'time_active_30',
    title: '活跃 30 天',
    description: '累计活跃天数达到 30 天。',
    icon: '⏳',
    category: 'time',
    rarity: 'uncommon',
    xpReward: 60,
    check: (s) => s.player.activeDays >= 30,
  },
  {
    id: 'time_single_3h',
    title: '一次三小时',
    description: '单次活动时长满 3 小时。沉浸进去了。',
    icon: '⏳',
    category: 'time',
    rarity: 'uncommon',
    xpReward: 60,
    check: (s) => maxSingleDuration(s) >= 180,
  },
  {
    id: 'time_single_5h',
    title: '五小时马拉松',
    description: '单次活动时长满 5 小时。忘了时间的那种投入。',
    icon: '⏳',
    category: 'time',
    rarity: 'rare',
    xpReward: 120,
    coinReward: 100,
    check: (s) => maxSingleDuration(s) >= 300,
  },
  {
    id: 'time_single_8h',
    title: '八小时传说',
    description: '单次活动时长满 8 小时。传说中的心流一整日。',
    icon: '⏳',
    category: 'time',
    rarity: 'epic',
    xpReward: 250,
    coinReward: 200,
    check: (s) => maxSingleDuration(s) >= 480,
  },

  // ===== 🌙 休息 (6) =====
  {
    id: 'rest_first_active',
    title: '第一次主动休息',
    description: '进入休息模式。',
    icon: '🌙',
    category: 'rest',
    rarity: 'common',
    xpReward: 15,
    check: () => false, // 由 store 标记
  },
  {
    id: 'rest_first_nap',
    title: '第一次完整午睡',
    description: '记录一次标题包含「午睡」或「午休」的活动。',
    icon: '🌙',
    category: 'rest',
    rarity: 'common',
    xpReward: 20,
    check: (s) => s.activities.some((a) => a.title.includes('午睡') || a.title.includes('午休')),
  },
  {
    id: 'rest_play_no_guilt',
    title: '第一次不带罪恶感地玩游戏',
    description: '在休息模式下记录一次游戏活动。',
    icon: '🌙',
    category: 'rest',
    rarity: 'uncommon',
    insightXp: 40,
    check: (s) => s.restMode && byType(s, 'game').length > 0,
  },
  {
    id: 'rest_do_nothing',
    title: '第一次什么都不做',
    description: '进入休息模式且当天无其他行动。',
    icon: '🌙',
    category: 'rest',
    rarity: 'uncommon',
    insightXp: 30,
    check: (s) => s.restMode,
  },
  {
    id: 'rest_as_life',
    title: '把休息视为生活的一部分',
    description: '累计进入休息模式 7 次（历史记录）。',
    icon: '🌙',
    category: 'rest',
    rarity: 'rare',
    insightXp: 50,
    check: () => false, // 由 store 标记
  },
  {
    id: 'rest_stop_when_tired',
    title: '在疲惫时主动停止消耗',
    description: '记录一次标题包含「停止」或「休息」的心理活动。',
    icon: '🌙',
    category: 'rest',
    rarity: 'rare',
    insightXp: 50,
    check: (s) => hasKeyword(byType(s, 'mental'), '停止') || hasKeyword(byType(s, 'mental'), '休息'),
  },

  // ===== 🗺️ 探索 (5) =====
  {
    id: 'explore_first_new',
    title: '第一次尝试新事物',
    description: '记录一次标题包含「第一次」或「尝试」的活动。',
    icon: '🗺️',
    category: 'explore',
    rarity: 'common',
    xpReward: 20,
    check: (s) => s.activities.some((a) => a.title.includes('第一次') || a.title.includes('尝试')),
  },
  {
    id: 'explore_5_types',
    title: '尝试 5 种不同类型的活动',
    description: '记录过 5 种不同 ActivityType。',
    icon: '🗺️',
    category: 'explore',
    rarity: 'uncommon',
    xpReward: 40,
    check: (s) => new Set(s.activities.map((a) => a.type)).size >= 5,
  },
  {
    id: 'explore_all_types',
    title: '探索全部领域',
    description: '记录过全部 10 种类型的活动。',
    icon: '🗺️',
    category: 'explore',
    rarity: 'rare',
    xpReward: 100,
    coinReward: 100,
    check: (s) => new Set(s.activities.map((a) => a.type)).size >= 10,
  },
  {
    id: 'explore_new_place',
    title: '第一次去一个新地方',
    description: '记录一次标题包含「新地方」或「旅行」的活动。',
    icon: '🗺️',
    category: 'explore',
    rarity: 'uncommon',
    xpReward: 30,
    check: (s) => s.activities.some((a) => a.title.includes('新地方') || a.title.includes('旅行')),
  },
  {
    id: 'explore_curiosity',
    title: '因好奇而行动',
    description: '记录一次标题包含「好奇」或「为什么」的活动。',
    icon: '🗺️',
    category: 'explore',
    rarity: 'uncommon',
    insightXp: 30,
    check: (s) => s.activities.some((a) => a.title.includes('好奇') || a.title.includes('为什么')),
  },

  // ===== 📋 任务榜 (11) =====
  {
    id: 'board_first_map',
    title: '第一张任务榜',
    description: '创建第一张任务榜，把散落的想法铺开来看。',
    icon: '📋',
    category: 'taskboard',
    rarity: 'common',
    xpReward: 10,
    check: (s) => (s.mindMaps ?? []).length >= 1,
  },
  {
    id: 'board_first_branch',
    title: '第一个分支',
    description: '在任务榜上拆出第一个子任务。',
    icon: '📋',
    category: 'taskboard',
    rarity: 'common',
    xpReward: 10,
    check: (s) => boardNodeCount(s) >= 2,
  },
  {
    id: 'board_10_nodes',
    title: '十件想清楚的事',
    description: '任务榜累计 10 个节点。',
    icon: '📋',
    category: 'taskboard',
    rarity: 'common',
    xpReward: 20,
    check: (s) => boardNodeCount(s) >= 10,
  },
  {
    id: 'board_50_nodes',
    title: '五十个落点',
    description: '任务榜累计 50 个节点。',
    icon: '📋',
    category: 'taskboard',
    rarity: 'uncommon',
    xpReward: 60,
    check: (s) => boardNodeCount(s) >= 50,
  },
  {
    id: 'board_100_nodes',
    title: '百节任务树',
    description: '任务榜累计 100 个节点。',
    icon: '📋',
    category: 'taskboard',
    rarity: 'rare',
    xpReward: 120,
    coinReward: 100,
    check: (s) => boardNodeCount(s) >= 100,
  },
  {
    id: 'board_5_maps',
    title: '分而治之',
    description: '创建 5 张不同的任务榜。',
    icon: '📋',
    category: 'taskboard',
    rarity: 'uncommon',
    xpReward: 40,
    check: (s) => (s.mindMaps ?? []).length >= 5,
  },
  {
    id: 'board_first_done',
    title: '第一个划掉的任务',
    description: '在任务榜上标记第一个「完成」。',
    icon: '📋',
    category: 'taskboard',
    rarity: 'common',
    xpReward: 15,
    check: (s) => boardStatusCount(s, 'done') >= 1,
  },
  {
    id: 'board_10_done',
    title: '清掉一片',
    description: '任务榜累计 10 个任务标记完成。',
    icon: '📋',
    category: 'taskboard',
    rarity: 'uncommon',
    xpReward: 50,
    coinReward: 50,
    check: (s) => boardStatusCount(s, 'done') >= 10,
  },
  {
    id: 'board_50_done',
    title: '榜上半数皆绿',
    description: '任务榜累计 50 个任务标记完成。',
    icon: '📋',
    category: 'taskboard',
    rarity: 'rare',
    xpReward: 150,
    coinReward: 150,
    check: (s) => boardStatusCount(s, 'done') >= 50,
  },
  {
    id: 'board_urgent_flag',
    title: '分清轻重缓急',
    description: '第一次给任务标记「紧急」。',
    icon: '📋',
    category: 'taskboard',
    rarity: 'common',
    xpReward: 15,
    check: (s) => boardStatusCount(s, 'urgent') >= 1,
  },
  {
    id: 'board_full_cycle',
    title: '从想法到完成',
    description: '同一张任务榜上有 20 个以上节点，且至少 10 个已完成。',
    icon: '📋',
    category: 'taskboard',
    rarity: 'rare',
    xpReward: 100,
    insightXp: 40,
    check: (s) =>
      (s.mindMaps ?? []).some((m) => {
        let total = 0
        let done = 0
        walkBoard(m.data as BoardNode, (node) => {
          total++
          if (node.data?.status === 'done') done++
        })
        return total >= 20 && done >= 10
      }),
  },

  // ===== 🍅 番茄钟 (11) =====
  {
    id: 'pomo_first',
    title: '第一个番茄',
    description: '用番茄钟完成第一次专注。',
    icon: '🍅',
    category: 'pomodoro',
    rarity: 'common',
    xpReward: 15,
    check: (s) => pomodoroActs(s).length >= 1,
  },
  {
    id: 'pomo_10',
    title: '十枚番茄',
    description: '累计完成 10 个番茄钟。',
    icon: '🍅',
    category: 'pomodoro',
    rarity: 'common',
    xpReward: 40,
    check: (s) => pomodoroActs(s).length >= 10,
  },
  {
    id: 'pomo_50',
    title: '五十枚番茄',
    description: '累计完成 50 个番茄钟。',
    icon: '🍅',
    category: 'pomodoro',
    rarity: 'uncommon',
    xpReward: 100,
    coinReward: 100,
    check: (s) => pomodoroActs(s).length >= 50,
  },
  {
    id: 'pomo_100',
    title: '百茄园主',
    description: '累计完成 100 个番茄钟。',
    icon: '🍅',
    category: 'pomodoro',
    rarity: 'rare',
    xpReward: 250,
    coinReward: 200,
    check: (s) => pomodoroActs(s).length >= 100,
  },
  {
    id: 'pomo_4_a_day',
    title: '完整一轮',
    description: '一天内完成 4 个番茄钟（标准番茄节奏的一轮）。',
    icon: '🍅',
    category: 'pomodoro',
    rarity: 'uncommon',
    xpReward: 50,
    check: (s) => maxPomoPerDay(pomodoroActs(s)) >= 4,
  },
  {
    id: 'pomo_8_a_day',
    title: '深潜一日',
    description: '一天内完成 8 个番茄钟。',
    icon: '🍅',
    category: 'pomodoro',
    rarity: 'rare',
    xpReward: 120,
    coinReward: 100,
    check: (s) => maxPomoPerDay(pomodoroActs(s)) >= 8,
  },
  {
    id: 'pomo_12_a_day',
    title: '番茄风暴',
    description: '一天内完成 12 个番茄钟。记得也好好休息。',
    icon: '🍅',
    category: 'pomodoro',
    rarity: 'epic',
    xpReward: 200,
    coinReward: 200,
    check: (s) => maxPomoPerDay(pomodoroActs(s)) >= 12,
  },
  {
    id: 'pomo_streak_3',
    title: '三天不断',
    description: '连续 3 天都完成过番茄钟。',
    icon: '🍅',
    category: 'pomodoro',
    rarity: 'common',
    xpReward: 30,
    check: (s) => longestStreak(pomodoroActs(s)) >= 3,
  },
  {
    id: 'pomo_streak_7',
    title: '一周的节奏',
    description: '连续 7 天都完成过番茄钟。',
    icon: '🍅',
    category: 'pomodoro',
    rarity: 'uncommon',
    xpReward: 80,
    coinReward: 80,
    check: (s) => longestStreak(pomodoroActs(s)) >= 7,
  },
  {
    id: 'pomo_streak_21',
    title: '习惯的形状',
    description: '连续 21 天都完成过番茄钟，专注已经成为习惯。',
    icon: '🍅',
    category: 'pomodoro',
    rarity: 'epic',
    xpReward: 300,
    coinReward: 300,
    check: (s) => longestStreak(pomodoroActs(s)) >= 21,
  },
  {
    id: 'pomo_multi_domain',
    title: '番茄无处不在',
    description: '番茄钟被用在 3 种不同的活动类型上。',
    icon: '🍅',
    category: 'pomodoro',
    rarity: 'uncommon',
    xpReward: 50,
    check: (s) => new Set(pomodoroActs(s).map((a) => a.type)).size >= 3,
  },

  // ===== 🌃 夜行 (6) =====
  {
    id: 'night_first',
    title: '凌晨也在',
    description: '在凌晨 0-5 点记录过一次活动。夜里的你也在认真生活。',
    icon: '🌃',
    category: 'night',
    rarity: 'common',
    xpReward: 15,
    check: (s) => nightActs(s).length >= 1,
  },
  {
    id: 'night_10',
    title: '夜猫子',
    description: '凌晨累计记录过 10 次活动。',
    icon: '🌃',
    category: 'night',
    rarity: 'uncommon',
    xpReward: 30,
    check: (s) => nightActs(s).length >= 10,
  },
  {
    id: 'night_dawn',
    title: '天亮说晚安',
    description: '在凌晨 4-5 点（快天亮时）记录过活动。',
    icon: '🌃',
    category: 'night',
    rarity: 'uncommon',
    xpReward: 30,
    check: (s) => nightActs(s).some((a) => hourOf(a.createdAt) >= 4),
  },
  {
    id: 'night_3h',
    title: '修仙初成',
    description: '同一个凌晨累计活动满 3 小时。筑基期，注意护肝。',
    icon: '🌃',
    category: 'night',
    rarity: 'rare',
    xpReward: 80,
    check: (s) => maxNightMinutes(nightActs(s)) >= 180,
  },
  {
    id: 'night_3h_3days',
    title: '渡劫飞升',
    description: '3 个不同的凌晨各活动满 3 小时。金丹已成，但白日飞升才是真境界。',
    icon: '🌃',
    category: 'night',
    rarity: 'epic',
    xpReward: 200,
    coinReward: 200,
    check: (s) => nightDaysOver(nightActs(s), 180) >= 3,
  },
  {
    id: 'night_allnighter',
    title: '通宵达旦',
    description: '从晚上 21 点后一直活动到次日凌晨。撑过了一整夜。',
    icon: '🌃',
    category: 'night',
    rarity: 'rare',
    xpReward: 100,
    check: (s) => hasAllNighter(s.activities.filter((a) => a.type !== 'sleep')),
  },

  // ===== ⚡ 局 (14) =====
  {
    id: 'session_first',
    title: '第一局',
    description: '完成第一局。人生增量游戏，正式开局。',
    icon: '⚡',
    category: 'session',
    rarity: 'common',
    xpReward: 15,
    check: (s) => sessionCount(s) >= 1,
  },
  {
    id: 'session_10',
    title: '十局之约',
    description: '累计完成 10 局。',
    icon: '⚡',
    category: 'session',
    rarity: 'common',
    xpReward: 40,
    check: (s) => sessionCount(s) >= 10,
  },
  {
    id: 'session_50',
    title: '五十局',
    description: '累计完成 50 局。节奏已经属于你。',
    icon: '⚡',
    category: 'session',
    rarity: 'uncommon',
    xpReward: 100,
    coinReward: 80,
    check: (s) => sessionCount(s) >= 50,
  },
  {
    id: 'session_100',
    title: '百局行者',
    description: '累计完成 100 局。',
    icon: '⚡',
    category: 'session',
    rarity: 'rare',
    xpReward: 250,
    coinReward: 200,
    check: (s) => sessionCount(s) >= 100,
  },
  {
    id: 'session_hour_first',
    title: '一小时深潜',
    description: '完成第一次 60 分钟的一局。',
    icon: '🕐',
    category: 'session',
    rarity: 'uncommon',
    xpReward: 60,
    check: (s) => sessionMaxMin(s) >= 60,
  },
  {
    id: 'session_day_3',
    title: '一天三局',
    description: '一天内完成 3 局。',
    icon: '⚡',
    category: 'session',
    rarity: 'common',
    xpReward: 50,
    check: (s) => sessionMaxPerDay(s) >= 3,
  },
  {
    id: 'session_time_10h',
    title: '十小时筹码',
    description: '在局里累计投入 10 小时。',
    icon: '⏳',
    category: 'session',
    rarity: 'common',
    xpReward: 50,
    check: (s) => sessionTotalMin(s) >= 600,
  },
  {
    id: 'session_time_50h',
    title: '五十小时长河',
    description: '在局里累计投入 50 小时。',
    icon: '⏳',
    category: 'session',
    rarity: 'uncommon',
    xpReward: 150,
    coinReward: 100,
    check: (s) => sessionTotalMin(s) >= 3000,
  },
  {
    id: 'session_time_100h',
    title: '百小时之路',
    description: '在局里累计投入 100 小时。这条路你走了很久。',
    icon: '⏳',
    category: 'session',
    rarity: 'epic',
    xpReward: 400,
    coinReward: 300,
    check: (s) => sessionTotalMin(s) >= 6000,
  },
  {
    id: 'session_eff_15',
    title: '效率 ×1.5',
    description: '一局效率修正首次达到 ×1.5。你比基础版的自己强了 50%。',
    icon: '📈',
    category: 'session',
    rarity: 'uncommon',
    xpReward: 80,
    check: (s) => sessionBestEff(s) >= 1.5,
  },
  {
    id: 'session_eff_2',
    title: '效率翻倍',
    description: '一局效率修正首次达到 ×2.0。同样的时间，双倍的产出。',
    icon: '📈',
    category: 'session',
    rarity: 'rare',
    xpReward: 200,
    coinReward: 150,
    check: (s) => sessionBestEff(s) >= 2,
  },
  {
    id: 'session_eff_3',
    title: '效率 ×3',
    description: '一局效率修正首次达到 ×3.0。这是长期成长的形状。',
    icon: '📈',
    category: 'session',
    rarity: 'legendary',
    xpReward: 600,
    coinReward: 500,
    check: (s) => sessionBestEff(s) >= 3,
  },
  {
    id: 'session_early_5',
    title: '重新开始总是可以',
    description: '提前结束过 5 局——做了多少，就算多少，这本身就是一种诚实。',
    icon: '🌤️',
    category: 'session',
    rarity: 'uncommon',
    xpReward: 60,
    check: (s) => sessionEarlyCount(s) >= 5,
  },
  {
    id: 'session_type_5',
    title: '全领域开局',
    description: '在 5 种不同的活动类型上完成过局。',
    icon: '⚡',
    category: 'session',
    rarity: 'uncommon',
    xpReward: 80,
    check: (s) => new Set(sessions(s).map((x) => x.type)).size >= 5,
  },

  // ===== ⚔️ 讨伐 (9) =====
  {
    id: 'boss_first_kill',
    title: '初次讨伐',
    description: '首次击杀周 BOSS。传说从这里开始。',
    icon: '⚔️',
    category: 'boss',
    rarity: 'uncommon',
    xpReward: 80,
    coinReward: 100,
    check: (s) => bossKillCount(s) >= 1,
  },
  {
    id: 'boss_kill_5',
    title: '五连讨伐',
    description: '累计讨伐 5 次 BOSS。每周一的它，等你。',
    icon: '⚔️',
    category: 'boss',
    rarity: 'rare',
    xpReward: 200,
    coinReward: 200,
    check: (s) => bossKillCount(s) >= 5,
  },
  {
    id: 'boss_kill_10',
    title: '十届屠魔者',
    description: '累计讨伐 10 次 BOSS。讨伐已成为你的节奏。',
    icon: '⚔️',
    category: 'boss',
    rarity: 'epic',
    xpReward: 400,
    coinReward: 350,
    check: (s) => bossKillCount(s) >= 10,
  },
  {
    id: 'boss_time_10h',
    title: '讨伐之路·十时',
    description: '为讨伐 BOSS 累计投入 10 小时的真实生活时间。',
    icon: '⏳',
    category: 'boss',
    rarity: 'uncommon',
    xpReward: 120,
    check: (s) => bossTotalMin(s) >= 600,
  },
  {
    id: 'boss_time_50h',
    title: '讨伐之路·五十时',
    description: '为讨伐 BOSS 累计投入 50 小时的真实生活时间。每一分钟都是真的。',
    icon: '⏳',
    category: 'boss',
    rarity: 'epic',
    xpReward: 350,
    coinReward: 250,
    check: (s) => bossTotalMin(s) >= 3000,
  },
  {
    id: 'boss_dawn_kill',
    title: '凌晨斩魔',
    description: '在凌晨 0-5 点完成一次讨伐。夜最深的时刻，刀光最亮。',
    icon: '🌃',
    category: 'boss',
    rarity: 'rare',
    xpReward: 150,
    coinReward: 100,
    check: (s) => bossKillHours(s).some((h) => h < 6),
  },
  {
    id: 'boss_anti_worker',
    title: '反工作者',
    description: '3 次以上讨伐，且所有讨伐都不在 9-17 点之间。BOSS 永远等不到你的上班时间。',
    icon: '🌙',
    category: 'boss',
    rarity: 'epic',
    xpReward: 300,
    coinReward: 250,
    check: (s) => {
      const hours = bossKillHours(s)
      return hours.length >= 3 && hours.every((h) => !isWorkHourKill(h))
    },
  },
  {
    id: 'boss_love_life',
    title: '热爱生活',
    description: '5 次以上讨伐，且主要讨伐时间（>50%）在 9-17 点之外。用自己的时间，赢自己的仗。',
    icon: '🌿',
    category: 'boss',
    rarity: 'uncommon',
    xpReward: 100,
    check: (s) => {
      const hours = bossKillHours(s)
      if (hours.length < 5) return false
      return hours.filter((h) => !isWorkHourKill(h)).length / hours.length > 0.5
    },
  },
  {
    id: 'boss_single_method',
    title: '一以贯之',
    description: '用同一种活动类型（≥2 局）完成一次讨伐。一种功夫，练到破防。',
    icon: '🎯',
    category: 'boss',
    rarity: 'rare',
    xpReward: 180,
    coinReward: 120,
    check: (s) => bossSingleMethodKill(s),
  },

  // ===== 🏆 里程碑 (8) =====
  {
    id: 'ms_level_5',
    title: '初入冒险',
    description: '达到 Lv.5。',
    icon: '🏆',
    category: 'milestone',
    rarity: 'common',
    coinReward: 50,
    check: (s) => s.player.level >= 5,
  },
  {
    id: 'ms_level_10',
    title: '开始行动的人',
    description: '达到 Lv.10。',
    icon: '🏆',
    category: 'milestone',
    rarity: 'uncommon',
    coinReward: 100,
    check: (s) => s.player.level >= 10,
  },
  {
    id: 'ms_level_25',
    title: '不再等待的人',
    description: '达到 Lv.25。',
    icon: '🏆',
    category: 'milestone',
    rarity: 'rare',
    coinReward: 300,
    check: (s) => s.player.level >= 25,
  },
  {
    id: 'ms_level_50',
    title: '自己的冒险家',
    description: '达到 Lv.50。',
    icon: '🏆',
    category: 'milestone',
    rarity: 'epic',
    coinReward: 800,
    check: (s) => s.player.level >= 50,
  },
  {
    id: 'ms_100_actions',
    title: '百次行动',
    description: '累计记录 100 次行动。',
    icon: '🏆',
    category: 'milestone',
    rarity: 'uncommon',
    xpReward: 100,
    check: (s) => s.activities.length >= 100,
  },
  {
    id: 'ms_500_actions',
    title: '五百次行动',
    description: '累计记录 500 次行动。',
    icon: '🏆',
    category: 'milestone',
    rarity: 'rare',
    xpReward: 300,
    coinReward: 200,
    check: (s) => s.activities.length >= 500,
  },
  {
    id: 'ms_50_memories',
    title: '五十段记忆',
    description: '同行者记住了 50 条关于你的记忆。',
    icon: '🏆',
    category: 'milestone',
    rarity: 'rare',
    insightXp: 80,
    check: (s) => (s.memories ?? []).length >= 50,
  },
  {
    id: 'ms_5_insights',
    title: '五次认知突破',
    description: '累计记录 5 次认知突破。',
    icon: '🏆',
    category: 'milestone',
    rarity: 'epic',
    insightXp: 100,
    check: (s) => s.achievements.filter((a) => a.isCognitive).length >= 5,
  },

  // ===== 👑 传奇 (4) =====
  {
    id: 'leg_level_100',
    title: '成为自己的冒险家',
    description: '达到 Lv.100。',
    icon: '👑',
    category: 'legend',
    rarity: 'legendary',
    coinReward: 2000,
    check: (s) => s.player.level >= 100,
  },
  {
    id: 'leg_1000_actions',
    title: '千次行动',
    description: '累计记录 1000 次行动。',
    icon: '👑',
    category: 'legend',
    rarity: 'legendary',
    xpReward: 1000,
    coinReward: 1000,
    check: (s) => s.activities.length >= 1000,
  },
  {
    id: 'leg_1_year_streak',
    title: '一年的陪伴',
    description: '在 365 个不同日期记录过行动。',
    icon: '👑',
    category: 'legend',
    rarity: 'legendary',
    xpReward: 1000,
    coinReward: 1500,
    check: (s) => distinctDays(s.activities) >= 365,
  },
  {
    id: 'leg_10_insights',
    title: '十次认知突破',
    description: '累计记录 10 次认知突破。',
    icon: '👑',
    category: 'legend',
    rarity: 'legendary',
    insightXp: 300,
    check: (s) => s.achievements.filter((a) => a.isCognitive).length >= 10,
  },

  // ===== 🔮 隐藏 (5) =====
  {
    id: 'hid_so_it_is',
    title: '原来如此',
    description: '???',
    icon: '🔮',
    category: 'hidden',
    rarity: 'rare',
    hidden: true,
    insightXp: 80,
    check: (s) => (s.patterns ?? []).length >= 1 && (s.memories ?? []).some((m) => m.content.includes('模式')),
  },
  {
    id: 'hid_no_back_zero',
    title: '我没有回到原点',
    description: '???',
    icon: '🔮',
    category: 'hidden',
    rarity: 'rare',
    hidden: true,
    insightXp: 80,
    check: (s) => {
      if (s.activities.length < 2) return false
      const days = Array.from(new Set(s.activities.map((a) => dayKey(a.createdAt)))).sort()
      for (let i = 1; i < days.length; i++) {
        const diff = Math.round((new Date(days[i]).getTime() - new Date(days[i - 1]).getTime()) / 86400000)
        if (diff >= 14) return true // 中断 14 天以上后重新开始
      }
      return false
    },
  },
  {
    id: 'hid_this_time_diff',
    title: '这次不一样',
    description: '???',
    icon: '🔮',
    category: 'hidden',
    rarity: 'epic',
    hidden: true,
    insightXp: 100,
    check: (s) => {
      // 中断后重新开始，且新阶段记录了 3 次以上主动行动
      if (s.activities.length < 3) return false
      const days = Array.from(new Set(s.activities.map((a) => dayKey(a.createdAt)))).sort()
      let restarted = false
      for (let i = 1; i < days.length; i++) {
        const diff = Math.round((new Date(days[i]).getTime() - new Date(days[i - 1]).getTime()) / 86400000)
        if (diff >= 14) {
          restarted = true
          break
        }
      }
      return restarted && s.activities.filter((a) => a.proactive).length >= 3
    },
  },
  {
    id: 'hid_just_rest',
    title: '我只是休息',
    description: '???',
    icon: '🔮',
    category: 'hidden',
    rarity: 'rare',
    hidden: true,
    insightXp: 60,
    check: (s) => s.restMode && s.moods.length > 0,
  },
  {
    id: 'hid_become_yourself',
    title: '成为自己',
    description: '???',
    icon: '🔮',
    category: 'hidden',
    rarity: 'legendary',
    hidden: true,
    insightXp: 500,
    check: (s) =>
      s.player.level >= 50 &&
      s.achievements.filter((a) => a.isCognitive).length >= 5 &&
      (s.patterns ?? []).length >= 3 &&
      distinctDays(s.activities) >= 100,
  },

  // ===== 👗 服饰（换装系统） =====
  {
    id: 'outfit_first_change',
    title: '第一次换装',
    description: '更换一次服饰。衣橱的第一次心跳。',
    icon: '👗',
    category: 'joy',
    rarity: 'common',
    coinReward: 50,
    check: (s) => outfitChangeCount(s) >= 1,
  },
  {
    id: 'outfit_ten_changes',
    title: '百变衣橱',
    description: '累计换装 10 次。',
    icon: '👗',
    category: 'joy',
    rarity: 'uncommon',
    coinReward: 200,
    check: (s) => outfitChangeCount(s) >= 10,
  },
  {
    id: 'outfit_fifty_changes',
    title: '换装成瘾',
    description: '累计换装 50 次。每天都要新鲜感。',
    icon: '👗',
    category: 'joy',
    rarity: 'epic',
    coinReward: 800,
    check: (s) => outfitChangeCount(s) >= 50,
  },
  {
    id: 'outfit_night_owl',
    title: '深夜衣橱',
    description: '凌晨 0-5 点换装 10 次。夜深了，还在挑衣服。',
    icon: '🌙',
    category: 'night',
    rarity: 'rare',
    coinReward: 300,
    check: (s) => nightOutfitChanges(s) >= 10,
  },
  {
    id: 'outfit_seven_a_day',
    title: '一日七变',
    description: '单日内换完全部 7 款服饰。今天想做哪个自己？',
    icon: '✨',
    category: 'joy',
    rarity: 'epic',
    coinReward: 600,
    check: (s) => maxOutfitChangesPerDay(s) >= 7,
  },
  {
    id: 'outfit_full_collection',
    title: '衣橱的主人',
    description: '集齐全部服饰（含宝箱限定款）。获得称号「衣橱的主人」。',
    icon: '👑',
    category: 'legend',
    rarity: 'legendary',
    coinReward: 3000,
    grantTitle: '衣橱的主人',
    check: (s) => {
      const outfitItems = OUTFIT_IDS
      return outfitItems.every((id) => s.player.unlockedItems.includes(id))
    },
  },
]

export interface AchievementEval {
  list: Achievement[]
  newly: Achievement[]
}

export const evaluateAchievements = (state: AppState): AchievementEval => {
  const unlocked = new Map(state.achievements.map((a) => [a.id, a]))
  const newlyUnlocked: Achievement[] = []
  for (const def of ACHIEVEMENT_DEFS) {
    if (unlocked.has(def.id)) continue
    if (def.check(state)) {
      const ach: Achievement = {
        id: def.id,
        title: def.title,
        description: def.description,
        icon: def.icon,
        unlockedAt: new Date().toISOString(),
        isCognitive: def.isCognitive,
        insightXp: def.insightXp,
        category: def.category,
        rarity: def.rarity,
        hidden: def.hidden,
      }
      unlocked.set(def.id, ach)
      newlyUnlocked.push(ach)
    }
  }
  return { list: Array.from(unlocked.values()), newly: newlyUnlocked }
}

// helper for callers that only want the full list
export const allAchievementsList = (state: AppState): Achievement[] =>
  evaluateAchievements(state).list

/**
 * Manually grant a "cognitive breakthrough" achievement (section 30).
 * These are special & precious — created when the user records an insight.
 */
export const grantCognitiveBreakthrough = (
  title: string,
  content: string,
): Achievement => ({
  id: `cognitive_${Date.now()}`,
  title,
  description: content.slice(0, 120),
  icon: '🧠',
  unlockedAt: new Date().toISOString(),
  isCognitive: true,
  insightXp: 100,
  category: 'insight',
  rarity: 'epic',
})

/** 分类元信息（供 UI 使用） */
export const CATEGORY_META: Record<AchievementCategory, { label: string; icon: string }> = {
  first: { label: '初见', icon: '🌱' },
  action: { label: '行动', icon: '🔥' },
  work: { label: '工作', icon: '💻' },
  study: { label: '学习', icon: '📚' },
  exercise: { label: '运动', icon: '🏸' },
  health: { label: '健康', icon: '🥗' },
  life: { label: '生活', icon: '⚖️' },
  creative: { label: '创造', icon: '🎨' },
  joy: { label: '快乐', icon: '🎮' },
  relation: { label: '关系', icon: '❤️' },
  insight: { label: '洞察', icon: '🧠' },
  courage: { label: '勇气', icon: '🛡️' },
  time: { label: '时间', icon: '⏳' },
  rest: { label: '休息', icon: '🌙' },
  explore: { label: '探索', icon: '🗺️' },
  taskboard: { label: '任务榜', icon: '📋' },
  pomodoro: { label: '番茄钟', icon: '🍅' },
  night: { label: '夜行', icon: '🌃' },
  session: { label: '局', icon: '⚡' },
  boss: { label: '讨伐', icon: '⚔️' },
  milestone: { label: '里程碑', icon: '🏆' },
  legend: { label: '传奇', icon: '👑' },
  hidden: { label: '隐藏', icon: '🔮' },
}

/** 稀有度元信息（供 UI 使用） */
export const RARITY_META: Record<AchievementRarity, { label: string; color: string; border: string }> = {
  common: { label: '普通', color: 'text-gray-300', border: 'border-gray-500' },
  uncommon: { label: '不凡', color: 'text-green-300', border: 'border-green-500' },
  rare: { label: '稀有', color: 'text-blue-300', border: 'border-blue-500' },
  epic: { label: '史诗', color: 'text-purple-300', border: 'border-purple-500' },
  legendary: { label: '传奇', color: 'text-amber-300', border: 'border-amber-400' },
}

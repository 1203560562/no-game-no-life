/**
 * 周委托任务引擎（纯函数）
 *
 * - 每周一随 BOSS 同步刷新（共用 ISO 周 key，惰性：weekKey 不一致时重新生成）
 * - 每周 3 个随机委托（类型不重复），进度从 sessions/bossState/dailyXpLog 实时派生
 *   ——进度不持久化快照，领取时校验 + 幂等标记
 * - 奖励：金币 + XP（领取时经 addActivity 发放，走完整链路含成就评估）
 */

import type { ActivityType, AppState, Quest, QuestKind, WeeklyQuests } from '../types'
import { DOMAIN_META } from '../config/xpConfig'
import { isoWeekKey } from './bossEngine'

// ===== 生成 =====

/** 委托模板池：目标数值按周内可达性标定（每天 2~4 局的玩家一周内可完成） */
interface QuestTemplate {
  kind: QuestKind
  /** 目标候选（随机一档） */
  targets: number[]
  /** 各档位金币奖励（与 targets 一一对应；锚定经济规模：一局 ≈1600 💰、商店宝箱 1000 💰） */
  coins: number[]
  /** XP 奖励基数（+ 档位 ×40） */
  xpReward: number
  makeTitle: (target: number, activityType?: ActivityType) => string
}

const TEMPLATES: QuestTemplate[] = [
  {
    kind: 'sessions',
    targets: [8, 10, 12],
    coins: [300, 450, 650],
    xpReward: 150,
    makeTitle: (t) => `完成 ${t} 局（任意类型）`,
  },
  {
    kind: 'sessionsType',
    targets: [3, 4, 5],
    coins: [250, 400, 600],
    xpReward: 180,
    makeTitle: (t, at) => `完成 ${DOMAIN_META[at ?? 'work'].label}类型的局 ×${t}`,
  },
  {
    kind: 'bossDamage',
    targets: [4000, 6000, 8000],
    coins: [500, 800, 1200],
    xpReward: 200,
    makeTitle: (t) => `本周对 BOSS 累计造成 ${t.toLocaleString()} 伤害`,
  },
  {
    kind: 'xp',
    targets: [3000, 5000, 7000],
    coins: [400, 700, 1000],
    xpReward: 160,
    makeTitle: (t) => `本周累计获得 ${t.toLocaleString()} XP`,
  },
  {
    kind: 'earlyBird',
    targets: [2, 3, 4],
    coins: [350, 550, 800],
    xpReward: 220,
    makeTitle: (t) => `${t} 个不同的日子在 10:00 前完成一局`,
  },
  {
    kind: 'focusMinutes',
    targets: [120, 180, 240],
    coins: [300, 500, 750],
    xpReward: 150,
    makeTitle: (t) => `本周累计专注 ${t >= 60 ? `${Math.floor(t / 60)} 小时` : `${t} 分钟`}`,
  },
]

/** 生成一周委托：3 个类型不重复的随机委托 */
export const createWeeklyQuests = (): WeeklyQuests => {
  const pool = [...TEMPLATES]
  const quests: Quest[] = []
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const tpl = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]
    const target = tpl.targets[Math.floor(Math.random() * tpl.targets.length)]
    const activityType: ActivityType | undefined =
      tpl.kind === 'sessionsType'
        ? (['work', 'study', 'exercise', 'creative', 'life'] as ActivityType[])[
            Math.floor(Math.random() * 5)
          ]
        : undefined
    // 目标越高金币越多（按档位取对应奖励）
    const tierIdx = tpl.targets.indexOf(target)
    quests.push({
      id: `quest_${isoWeekKey()}_${tpl.kind}_${i}`,
      kind: tpl.kind,
      target,
      ...(activityType ? { activityType } : {}),
      title: tpl.makeTitle(target, activityType),
      coins: tpl.coins[tierIdx],
      xp: tpl.xpReward + tierIdx * 40,
    })
  }
  return { weekKey: isoWeekKey(), quests }
}

// ===== 惰性刷新 =====

/** 按（kind, target）查模板重算金币：迁移旧公式（coins × target）生成的异常数值 */
const questCoinsFor = (kind: QuestKind, target: number): number | null => {
  const tpl = TEMPLATES.find((t) => t.kind === kind)
  if (!tpl) return null
  const tierIdx = tpl.targets.indexOf(target)
  return tierIdx >= 0 ? tpl.coins[tierIdx] : null
}

/** 周不一致时重新生成（与 BOSS rollover 同一个调用点，无需单独触发）；
 *  同周时迁移旧档：修正旧公式生成的异常金币（如 XP 委托 441,000） */
export const rolloverQuestsIfNeeded = (state: AppState): AppState => {
  const wq = state.weeklyQuests
  if (!wq || wq.weekKey !== isoWeekKey()) {
    return { ...state, weeklyQuests: createWeeklyQuests() }
  }
  let changed = false
  const quests = wq.quests.map((q) => {
    const coins = questCoinsFor(q.kind, q.target)
    if (coins !== null && coins !== q.coins) {
      changed = true
      return { ...q, coins }
    }
    return q
  })
  return changed ? { ...state, weeklyQuests: { ...wq, quests } } : state
}

// ===== 进度派生（不持久化，展示/领取校验共用） =====

/** 本周一的 0 点时间戳（ISO 周起点） */
const weekStart = (): number => {
  const now = new Date()
  const day = now.getDay() === 0 ? 7 : now.getDay()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (day - 1)).getTime()
}

export const questProgress = (state: AppState, quest: Quest): number => {
  const start = weekStart()
  const sessions = (state.sessions ?? []).filter((s) => new Date(s.startTime).getTime() >= start)
  switch (quest.kind) {
    case 'sessions':
      return sessions.length
    case 'sessionsType':
      return sessions.filter((s) => s.type === quest.activityType).length
    case 'bossDamage':
      return state.bossState?.totalDamage ?? 0
    case 'xp':
      return sessions.reduce((sum, s) => sum + s.xpGained, 0)
    case 'earlyBird': {
      // 不同日子：10:00 前开始的局记 1 天（按 startTime 判断，一天多局只算一次）
      const days = new Set(
        sessions
          .filter((s) => {
            const d = new Date(s.startTime)
            return d.getHours() < 10
          })
          .map((s) => s.startTime.slice(0, 10)),
      )
      return days.size
    }
    case 'focusMinutes':
      return Math.round(sessions.reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0))
  }
}

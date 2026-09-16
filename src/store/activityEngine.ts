/**
 * 活动记录引擎（从 useGameStore.ts 拆出）：
 * addActivity 的核心状态变换（XP/属性/日志/streak/成就/里程碑）+ endSession 收益计算
 */
import type {
  Achievement,
  Activity,
  AppState,
  Attributes,
  GameSession,
  MilestoneReward,
  Player,
} from '../types'
import { calculateXp, sumAttributes, todayKey } from '../engine/xpCalculator'
import { applyXp } from '../engine/levelSystem'
import { evaluateAchievements, ACHIEVEMENT_DEFS } from '../engine/achievements'
import { dateKey } from '../engine/settlements'
import { SESSION_COINS_PER_XP, WEIGHT_STREAK_REWARDS, XP_CONFIG } from '../config/xpConfig'
import {
  computeEfficiency,
  estimateSessionGain,
  sessionAttributeGains,
} from '../engine/sessionEngine'
import { CONSUMABLE_EFFECTS, SHOP_ITEMS } from '../config/shopItems'
import { grantLevelUnlocks } from './grantLevelUnlocks'
import type { ActivityFeedback, SessionOverride } from './types'

/** 成就奖励查找表：id → { xpReward, coinReward, insightXp } */
export const ACHIEVEMENT_REWARDS = new Map(
  ACHIEVEMENT_DEFS.map((d) => [d.id, { xpReward: d.xpReward ?? 0, coinReward: d.coinReward ?? 0, insightXp: d.insightXp ?? 0 }]),
)

/** 重复活动检测：同类型+同标题 10 分钟内重复 → 警告（不阻断）；异常时长提示 */
export const detectDuplicate = (activities: Activity[], input: {
  type: Activity['type']
  title: string
  durationMinutes?: number
}): string[] => {
  const warnings: string[] = []
  const tenMinAgo = Date.now() - 10 * 60 * 1000
  const recentDup = activities.find((a) => {
    if (a.type !== input.type) return false
    if (new Date(a.createdAt).getTime() < tenMinAgo) return false
    const sameTitle = a.title.trim() === (input.title?.trim() ?? '')
    if (!sameTitle) return false
    const durDiff = Math.abs((a.durationMinutes ?? 0) - (input.durationMinutes ?? 0))
    return durDiff <= 5 || (input.durationMinutes ?? 0) === 0
  })
  if (recentDup) {
    warnings.push('检测到刚刚已记录过相同活动。本次仍会记录，但请确认不是误操作。')
  }
  if (input.durationMinutes && input.durationMinutes > 480 && input.type !== 'sleep') {
    warnings.push(`本次时长 ${input.durationMinutes} 分钟较长，请确认记录是否准确。`)
  }
  return warnings
}

/** 记录局数据 + 更新玩家局统计 + 消耗品扣减（返回更新后的 player 和 sessions） */
export const recordSession = (
  sessions: GameSession[],
  player: Player,
  so: SessionOverride,
  input: { type: Activity['type']; title: string },
): { sessions: GameSession[]; player: Player } => {
  const record: GameSession = {
    id: so.sessionId,
    type: input.type,
    title: input.title,
    startTime: so.startTime,
    endTime: new Date().toISOString(),
    plannedMinutes: so.plannedMinutes,
    actualMinutes: so.actualMinutes,
    status: so.earlyEnded ? 'early' : 'completed',
    xpGained: so.xp,
    coinsGained: so.coins,
    attributeGains: so.attributeGains,
    efficiency: so.efficiency,
    xpPerMin: so.xpPerMin,
    taskId: so.taskId,
  }
  const nextSessions = [...sessions, record].slice(-50)
  let nextPlayer: Player = {
    ...player,
    totalSessions: (player.totalSessions ?? 0) + 1,
    totalSessionMinutes: (player.totalSessionMinutes ?? 0) + so.actualMinutes,
    bestEfficiency: Math.max(player.bestEfficiency ?? 0, so.efficiency),
  }
  // 消耗品扣减（未生效的 buff 不传 buffItemId = 自动退还）
  if (so.buffItemId) {
    const inv = { ...(nextPlayer.inventory ?? {}) }
    const left = (inv[so.buffItemId] ?? 0) - 1
    if (left > 0) inv[so.buffItemId] = left
    else delete inv[so.buffItemId]
    nextPlayer = { ...nextPlayer, inventory: inv }
  }
  return { sessions: nextSessions, player: nextPlayer }
}

/** 自动更新等级目标的进度（targetLevel 存在的里程碑） */
export const updateMilestoneProgress = (
  milestones: MilestoneReward[],
  playerLevel: number,
): MilestoneReward[] =>
  milestones.some((m) => m.targetLevel)
    ? milestones.map((m) =>
        m.targetLevel
          ? { ...m, progress: Math.min(1, playerLevel / m.targetLevel), done: playerLevel >= m.targetLevel }
          : m,
      )
    : milestones

export interface AddActivityInput {
  type: Activity['type']
  title: string
  description?: string
  durationMinutes?: number
  intensity?: Activity['intensity']
  subtype?: string
  difficulty?: number
  proactive?: boolean
  isEscape?: boolean
  session?: SessionOverride
}

/**
 * addActivity 核心状态变换（纯函数）：返回新 state + 反馈数据。
 * 副作用（set/persist/Toast）由调用方处理。
 */
export const applyActivity = (
  st: AppState,
  input: AddActivityInput,
): { state: AppState; feedback: ActivityFeedback } => {
  const tKey = todayKey()

  // ===== 重复活动检测 =====
  const dupWarnings = detectDuplicate(st.activities, input)

  let gain = input.session
    ? {
        xp: input.session.xp,
        coins: input.session.coins,
        attributeGains: input.session.attributeGains,
        warnings: [],
        diminished: false,
      }
    : calculateXp({
        type: input.type,
        durationMinutes: input.durationMinutes,
        intensity: input.intensity,
        difficulty: input.difficulty,
        proactive: input.proactive,
        isEscape: input.isEscape,
        // 睡眠时段复用 subtype 字段（exercise 的子类型同理独立使用）
        sleepPeriod: input.type === 'sleep' ? input.subtype : undefined,
      })

  // v1.1 运动手动记录与局结算口径一致：运动常发生在事后（打完球才记录，无法开局计时），
  // XP 走效率引擎（随等级/属性/技能成长），金币按局汇率产出，属性按 25 分钟/轮累计。
  // 强度仍作为倍率参与（轻松 0.7 / 正常 1 / 高强度 1.3），保留手动记录的强度语义。
  // v1.2 挑战自我同理：挑战自己的事件即便手动记录，同样给予与局相同的经验。
  // 注：记录行动表单的运动/挑战已改走 endSession（含结算 Overlay + BOSS 伤害），
  // 本分支继续服务 AI 工具（toolBus）等直接调用 addActivity 的入口。
  if (!input.session && (input.type === 'exercise' || input.type === 'challenge') && (input.durationMinutes ?? 0) > 0) {
    const eff = computeEfficiency(st.player, input.type)
    const intensityMult = input.intensity
      ? (XP_CONFIG[input.type].intensityMultiplier?.[input.intensity] ?? 1)
      : 1
    const xp = Math.max(1, Math.round(eff.xpPerMin * (input.durationMinutes ?? 0) * intensityMult))
    gain = {
      ...gain,
      xp,
      coins: Math.round(xp * SESSION_COINS_PER_XP),
      attributeGains: sessionAttributeGains(input.type, input.durationMinutes ?? 0),
    }
  }

  const activity: Activity = {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: input.type,
    title: input.title,
    description: input.description,
    // 局记录的发生时间（补录运动 = 运动发生时刻）；普通记录 = 记录时刻
    startTime: input.session?.startTime ?? new Date().toISOString(),
    durationMinutes: input.durationMinutes,
    intensity: input.intensity,
    subtype: input.subtype,
    difficulty: input.difficulty,
    proactive: input.proactive,
    isEscape: input.isEscape,
    xp: gain.xp,
    attributeGains: gain.attributeGains,
    createdAt: new Date().toISOString(),
    isSession: input.session ? true : undefined,
    sessionId: input.session?.sessionId,
  }

  // apply xp + level up
  const { player: leveledPlayer, result: levelUp } = applyXp(st.player, gain.xp)

  // apply attribute gains + activity coins
  const playerWithAttrs: Player = grantLevelUnlocks(
    {
      ...leveledPlayer,
      attributes: gain.attributeGains
        ? sumAttributes(gain.attributeGains, leveledPlayer.attributes)
        : leveledPlayer.attributes,
      coins: leveledPlayer.coins + gain.coins,
    },
    levelUp.unlockedRewards,
  )

  // update daily logs
  const dailyXpLog = { ...st.dailyXpLog, [tKey]: (st.dailyXpLog[tKey] ?? 0) + gain.xp }
  const dailyDomainXp = { ...st.dailyDomainXp }
  const dom = { ...(dailyDomainXp[tKey] ?? {}) }
  dom[input.type] = (dom[input.type] ?? 0) + gain.xp
  dailyDomainXp[tKey] = dom

  // record streak (no penalty on break — just track)
  let recordStreak = st.recordStreak
  let lastRecordDate = st.lastRecordDate
  if (lastRecordDate !== tKey) {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yKey = dateKey(yesterday)
    if (lastRecordDate === yKey) recordStreak += 1
    else recordStreak = 1
    lastRecordDate = tKey
  }

  const activities = [...st.activities, activity]

  const activeDaysDelta = st.lastRecordDate === tKey ? 0 : 1

  // v1.0：局记录与玩家局统计
  const sessResult = input.session
    ? recordSession(st.sessions ?? [], playerWithAttrs, input.session, input)
    : { sessions: st.sessions ?? [], player: playerWithAttrs }
  const { sessions, player: sessionPlayer } = sessResult

  const newState: AppState = {
    ...st,
    player: {
      ...sessionPlayer,
      activeDays: sessionPlayer.activeDays + activeDaysDelta,
    },
    activities,
    sessions,
    dailyXpLog,
    dailyDomainXp,
    recordStreak,
    lastRecordDate,
  }

  // evaluate achievements against new state
  const ach = evaluateAchievements(newState)
  newState.achievements = ach.list

  // 发放成就奖励：Insight XP（认知类）+ 普通 XP + 金币 + 称号（成就自带）
  let insightXp: number | undefined
  let achXp = 0
  let achCoins = 0
  let newTitles: string[] = []
  if (ach.newly.length > 0) {
    for (const a of ach.newly) {
      const r = ACHIEVEMENT_REWARDS.get(a.id)
      if (!r) continue
      if (a.isCognitive) insightXp = (insightXp ?? 0) + r.insightXp
      achXp += r.xpReward
      achCoins += r.coinReward
      // 成就定义自带称号（如「衣橱的主人」）
      const def = ACHIEVEMENT_DEFS.find((d) => d.id === a.id)
      if (def?.grantTitle && !newState.player.titles.includes(def.grantTitle)) {
        newTitles.push(def.grantTitle)
      }
    }
    const totalAchXp = (insightXp ?? 0) + achXp
    if (totalAchXp > 0) {
      const { player: p2 } = applyXp(newState.player, totalAchXp)
      newState.player = { ...p2, attributes: newState.player.attributes, coins: p2.coins + achCoins }
    } else if (achCoins > 0) {
      newState.player = { ...newState.player, coins: newState.player.coins + achCoins }
    }
    if (newTitles.length > 0) {
      newState.player = { ...newState.player, titles: [...newState.player.titles, ...newTitles] }
    }
  }

  // 自动更新等级目标的进度
  newState.milestones = updateMilestoneProgress(newState.milestones, newState.player.level)

  const feedback: ActivityFeedback = {
    activityId: activity.id,
    xp: gain.xp,
    coins: gain.coins,
    attributeGains: gain.attributeGains,
    warnings: [...dupWarnings, ...gain.warnings],
    levelUp: levelUp.leveledUp ? levelUp : undefined,
    newAchievements: ach.newly,
    insightXp,
  }
  return { state: newState, feedback }
}

/** endSession 的消耗品 buff 计算（返回结算参数） */
export const computeSessionBuff = (buffItemId: string | undefined) => {
  let buffMult = 1
  let crit = false
  let buffName: string | undefined
  let buffIcon: string | undefined
  let buffDetail: string | undefined
  const buffItem = buffItemId
    ? SHOP_ITEMS.find((i) => i.id === buffItemId && i.category === 'consumable')
    : undefined
  const buffEffect = buffItemId ? CONSUMABLE_EFFECTS[buffItemId] : undefined
  if (buffItem && buffEffect) {
    buffName = buffItem.name
    buffIcon = buffItem.icon
    buffDetail = buffEffect.detail
    if (buffEffect.kind === 'deepBonus') {
      buffMult = 1
    } else if (buffEffect.kind === 'crit') {
      crit = Math.random() < (buffEffect.chance ?? 0.3)
      buffMult = crit ? buffEffect.multiplier : 1
    } else {
      buffMult = buffEffect.multiplier
    }
  }
  return { buffMult, crit, buffName, buffIcon, buffDetail, buffItem }
}

/** 体重连续记录奖励天数判定（返回命中的奖励） */
export const findWeightStreakReward = (weights: { date: string }[]): { days: number; xp: number } | undefined => {
  const distinctDays = new Set(weights.map((w) => w.date)).size
  return WEIGHT_STREAK_REWARDS.find((r) => r.days === distinctDays)
}

export { calculateXp, sumAttributes, todayKey, applyXp, evaluateAchievements, dateKey, SESSION_COINS_PER_XP, computeEfficiency, estimateSessionGain, sessionAttributeGains }
export type { Achievement, Attributes }

/**
 * 里程碑引擎：真实数据驱动的进度 + 阶段检查点奖励 + 完成领取
 *
 * 设计原则（参考 Habitica 等高星 RPG 化产品的核心机制）：
 * - 进度只能来自真实数据（等级/体重/累计XP/局数/成就/连续天数），绝不手动调整
 * - 25/50/75/100 四个检查点，跨过即发放阶段奖励（XP+金币），即时可见
 * - 达成 100% 后需手动「领取完成奖励」——把奖励变成一次仪式，而非静默 done
 *
 * 本模块为纯函数集，由 useGameStore 的 update() 在每次状态变更后统一调用同步。
 */

import type { AppState, MilestoneMetric, MilestoneMetricKind, MilestoneReward, MilestoneTier } from '../types'
import { applyXp } from './levelSystem'

/** 检查点百分比（0..1）；100% 不自动发奖，达成后需手动「领取完成奖励」 */
export const MILESTONE_STAGES = [0.25, 0.5, 0.75, 1] as const

/** 档位元信息（徽章 + 奖励基数）——两周量级的长期目标，奖励须显著高于日常签到 */
export const TIER_META: Record<MilestoneTier, { label: string; badge: string; xp: number; coins: number; border: string; text: string }> = {
  bronze: { label: '青铜', badge: '🥉', xp: 300, coins: 200, border: 'border-amber-700/60', text: 'text-amber-600' },
  silver: { label: '白银', badge: '🥈', xp: 600, coins: 400, border: 'border-slate-400/60', text: 'text-slate-300' },
  gold: { label: '黄金', badge: '🥇', xp: 1200, coins: 800, border: 'border-rpg-gold/60', text: 'text-rpg-gold' },
  legendary: { label: '传说', badge: '👑', xp: 2400, coins: 1600, border: 'border-fuchsia-400/60', text: 'text-fuchsia-300' },
}

/** 指标展示元信息 */
export const METRIC_META: Record<MilestoneMetricKind, { label: string; icon: string; unit: string }> = {
  level: { label: '等级', icon: '⭐', unit: '级' },
  weight: { label: '体重目标', icon: '⚖️', unit: 'kg' },
  totalXp: { label: '累计经验', icon: '✨', unit: 'XP' },
  sessions: { label: '完成局数', icon: '⚡', unit: '局' },
  achievements: { label: '成就数', icon: '🏆', unit: '个' },
  streakDays: { label: '连续记录', icon: '🔥', unit: '天' },
  time: { label: '时间投入', icon: '⏳', unit: 'h' },
}

/** 按指标与目标推导档位 */
export const tierForMetric = (kind: MilestoneMetricKind, target: number): MilestoneTier => {
  const t: Record<MilestoneMetricKind, [number, number, number]> = {
    // [bronze 上限, silver 上限, gold 上限]，超过 gold 上限 = legendary
    level: [20, 40, 70],
    weight: [5, 10, 20],
    totalXp: [5000, 20000, 60000],
    sessions: [20, 60, 150],
    achievements: [10, 25, 50],
    streakDays: [14, 30, 100],
    // 时间投入（分钟）：≤25h 青铜，≤60h 白银，≤150h 黄金，以上传说
    time: [25 * 60, 60 * 60, 150 * 60],
  }
  const [b, s, g] = t[kind]
  if (target <= b) return 'bronze'
  if (target <= s) return 'silver'
  if (target <= g) return 'gold'
  return 'legendary'
}

/** 读取指标的当前值 */
export const metricCurrentValue = (state: AppState, kind: MilestoneMetricKind): number | null => {
  switch (kind) {
    case 'level':
      return state.player.level
    case 'totalXp':
      return state.player.totalXp
    case 'sessions':
      return state.sessions?.length ?? 0
    case 'achievements':
      return state.achievements.length
    case 'streakDays':
      return state.recordStreak
    case 'time':
      // time 指标的当前值存在里程碑自身（linkedMinutes），不在全局状态
      return null
    case 'weight': {
      const goal = state.weightGoal
      if (!goal) return null
      const ws = [...state.weights].sort((a, b) => a.date.localeCompare(b.date))
      const latest = ws[ws.length - 1]?.weightKg
      return latest ?? null
    }
  }
}

/** 计算绑定指标的里程碑进度（0..1，weight 为双向，time 用自身累计分钟） */
const computeProgress = (state: AppState, m: MilestoneReward & { metric: MilestoneMetric }): number => {
  if (m.metric.kind === 'weight') {
    const goal = state.weightGoal
    if (!goal || goal.targetKg === goal.startKg) return 0
    const ws = [...state.weights].sort((a, b) => a.date.localeCompare(b.date))
    const latest = ws[ws.length - 1]?.weightKg
    if (latest === undefined) return 0
    const delta = goal.targetKg - goal.startKg
    return Math.max(0, Math.min(1, (latest - goal.startKg) / delta))
  }
  if (m.metric.kind === 'time') {
    return Math.max(0, Math.min(1, (m.linkedMinutes ?? 0) / m.metric.target))
  }
  const cur = metricCurrentValue(state, m.metric.kind)
  if (cur === null) return 0
  return Math.max(0, Math.min(1, cur / m.metric.target))
}

/** 阶段奖励数值：档位基数 × 检查点倍率（完成领取为基数 ×2） */
export const stageReward = (tier: MilestoneTier, stage: number): { xp: number; coins: number } => {
  const base = TIER_META[tier]
  const mult = stage >= 1 ? 2 : 0.5 + stage // 25%→0.75, 50%→1, 75%→1.25, 100%→2
  return { xp: Math.round(base.xp * mult), coins: Math.round(base.coins * mult) }
}

/** 旧档字段归一化：targetLevel/weightTarget → metric；旧「自定义」目标 → time 指标（默认 50h，按已有进度折算分钟） */
const MIGRATED_TIME_TARGET_MIN = 50 * 60
const normalizeMilestone = (m: MilestoneReward): MilestoneReward => {
  if (m.metric) return m
  if (m.targetLevel !== undefined) return { ...m, metric: { kind: 'level', target: m.targetLevel } }
  if (m.weightTarget !== undefined) return { ...m, metric: { kind: 'weight', target: m.weightTarget } }
  // 旧自定义目标：迁移为时间投入型，进度按比例折算为已投入分钟
  return {
    ...m,
    custom: false,
    metric: { kind: 'time', target: MIGRATED_TIME_TARGET_MIN },
    linkedMinutes: Math.round((m.progress ?? 0) * MIGRATED_TIME_TARGET_MIN),
  }
}

export interface MilestoneSyncResult {
  state: AppState
  /** 本次跨过的阶段（含里程碑 id、阶段、奖励——用于弹窗/toast 反馈） */
  stageGrants: Array<{ id: string; goal: string; stage: number; xp: number; coins: number }>
  /** 本次达成 100% 的里程碑（待领取） */
  completed: Array<{ id: string; goal: string }>
}

/**
 * 同步所有里程碑：归一化 → 重算进度 → 结算跨过的阶段奖励（纯函数）。
 * 由 store.update() 在每次状态变更后调用，保证进度永远反映真实数据。
 */
export const syncMilestones = (state: AppState): MilestoneSyncResult => {
  if (state.milestones.length === 0) return { state, stageGrants: [], completed: [] }

  const stageGrants: MilestoneSyncResult['stageGrants'] = []
  const completed: MilestoneSyncResult['completed'] = []
  let xpTotal = 0
  let coinsTotal = 0

  const milestones = state.milestones.map((raw) => {
    const m = normalizeMilestone(raw)
    if (!m.metric) return m

    const progress = computeProgress(state, m as MilestoneReward & { metric: MilestoneMetric })
    const tier: MilestoneTier = m.tier ?? tierForMetric(m.metric.kind, m.metric.target)
    const claimed = new Set(m.stagesClaimed ?? [])
    const newlyClaimed: number[] = []
    for (const stage of MILESTONE_STAGES) {
      const key = Math.round(stage * 100)
      if (progress >= stage && !claimed.has(key)) {
        if (stage >= 1) {
          // 100%：只登记完成（待领取），不自动发奖——领取是仪式
          if (!m.finalClaimed && !raw.done) completed.push({ id: m.id, goal: m.goal })
          continue
        }
        const r = stageReward(tier, stage)
        xpTotal += r.xp
        coinsTotal += r.coins
        newlyClaimed.push(key)
        stageGrants.push({ id: m.id, goal: m.goal, stage: key, xp: r.xp, coins: r.coins })
      }
    }
    const done = progress >= 1
    return {
      ...m,
      tier,
      progress,
      done,
      // 完成时间：首次达成时写入（回顾墙展示；已存在的保留原值）
      ...(done && !m.doneAt ? { doneAt: new Date().toISOString() } : {}),
      ...(newlyClaimed.length > 0 ? { stagesClaimed: [...(m.stagesClaimed ?? []), ...newlyClaimed] } : {}),
    }
  })

  if (stageGrants.length === 0 && milestones.every((m, i) => m === state.milestones[i])) {
    return { state, stageGrants: [], completed: [] }
  }

  let player = state.player
  if (xpTotal > 0) {
    const { player: p2 } = applyXp(player, xpTotal)
    player = { ...p2, attributes: player.attributes, coins: p2.coins + coinsTotal }
  } else if (coinsTotal > 0) {
    player = { ...player, coins: player.coins + coinsTotal }
  }

  return { state: { ...state, milestones, player }, stageGrants, completed }
}

/** 单次投入限制的实际计入分钟（clamp 规则）：
 * 低于 minPerSession → 0（防开小局刷进度）；高于 maxPerSession → 封顶（防单次爆量） */
export const linkedMinutesFor = (m: MilestoneReward, minutes: number): number => {
  const min = m.limits?.minPerSession
  const max = m.limits?.maxPerSession
  if (min !== undefined && minutes < min) return 0
  if (max !== undefined && minutes > max) return max
  return minutes
}

export interface LinkedMinutesResult {
  milestones: MilestoneReward[]
  /** 计入说明（结算反馈展示）：「目标A +25min」「目标B 未达单次下限(30min)，未计入」「目标C 按上限60min计入」 */
  notes: string[]
}

/** 记录行动/完成局时向多个 time 型里程碑累计投入分钟（各自应用自己的单次限制） */
export const addLinkedMinutes = (
  milestones: MilestoneReward[],
  milestoneIds: string[],
  minutes: number,
): LinkedMinutesResult => {
  const ids = new Set(milestoneIds)
  const notes: string[] = []
  if (minutes <= 0 || ids.size === 0) return { milestones, notes }
  const result = milestones.map((m) => {
    if (!ids.has(m.id) || m.metric?.kind !== 'time') return m
    const applied = linkedMinutesFor(m, minutes)
    if (applied === 0) {
      notes.push(`「${m.goal}」未达单次下限（${m.limits?.minPerSession}min），本次未计入`)
      return m
    }
    if (applied < minutes) {
      notes.push(`「${m.goal}」按单次上限计入 ${applied}min（实际 ${minutes}min）`)
    } else {
      notes.push(`「${m.goal}」+${applied}min`)
    }
    return { ...m, linkedMinutes: (m.linkedMinutes ?? 0) + applied }
  })
  return { milestones: result, notes }
}

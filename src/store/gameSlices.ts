/**
 * 游戏域 slices（从 useGameStore.ts 拆出）：
 * 商店购买（消耗品/形象/宝箱）、开箱、技能升级、体重/心情记录、里程碑、称号、金币消费、重置/导入
 */
import type { AppState, MilestoneReward, MilestoneMetricKind, MoodRecord, Player, WeightRecord } from '../types'
import { evaluateAchievements } from '../engine/achievements'
import { applyXp } from '../engine/levelSystem'
import { todayKey } from '../engine/xpCalculator'
import { stageReward, tierForMetric } from '../engine/milestoneEngine'
import { SKILL_DEFS, WEIGHT_GOAL_NODE_PCTS, weightNodeReward } from '../config/xpConfig'
import { SHOP_ITEMS } from '../config/shopItems'
import { rollChest, SHOP_CHEST_PRICE } from '../config/chestConfig'
import { unlockModel, isModelUnlocked, LIVE2D_MODELS } from '../config/live2dModels'
import { defaultState, mergeImportedState } from './stateDefaults'
import { findWeightStreakReward } from './activityEngine'
import { applyOutfitLog } from '../engine/outfitEngine'
import { backupToServer } from '../lib/serverBackup'
import type { StoreCtx } from './storeCtx'

/** 体重目标专属里程碑 id（固定值，body 页设置目标时 upsert；进度由 milestoneEngine 统一驱动） */
const WEIGHT_GOAL_MS_ID = 'ms_weight_goal'

/** 体重目标节点奖励发放：跨过未领取的百分比档位即发 XP+金币（一次可连跨多档） */
const grantWeightNodeRewards = (ctx: StoreCtx) => {
  const { get, update } = ctx
  const s = get().state
  const goal = s.weightGoal
  if (!goal) return
  const sortedWs = [...s.weights].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sortedWs[sortedWs.length - 1]?.weightKg
  if (latest === undefined) return
  const delta = goal.targetKg - goal.startKg
  if (delta === 0) return
  const progress = Math.max(0, Math.min(1, (latest - goal.startKg) / delta))
  const claimed = new Set(s.weightGoalNodesClaimed ?? [])
  const totalKg = Math.abs(delta)
  let xp = 0
  let coins = 0
  const newlyClaimed: number[] = []
  for (const pct of WEIGHT_GOAL_NODE_PCTS) {
    const key = Math.round(pct * 100)
    if (progress >= pct && !claimed.has(key)) {
      const r = weightNodeReward(pct, totalKg)
      xp += r.xp
      coins += r.coins
      newlyClaimed.push(key)
    }
  }
  if (newlyClaimed.length === 0) return
  const { player } = applyXp(s.player, xp)
  update((st) => ({
    ...st,
    player: { ...player, coins: player.coins + coins },
    weightGoalNodesClaimed: [...(st.weightGoalNodesClaimed ?? []), ...newlyClaimed],
  }))
}

/** 游戏域方法集（组合进 useGameStore） */
export const createGameSlices = (ctx: StoreCtx) => {
  const { set, get, update, flushPersist, evalWithRewards } = ctx
  return {
    openChest: (level: number) => {
      const st = get().state
      const roll = rollChest(level, st.player.chestPity ?? 0, st.player.unlockedItems)
      // 先推进解锁/金币，再统一评估成就（集齐服饰发「衣橱的主人」等）
      let base = { ...st, player: { ...st.player, chestPity: roll.nextPity } }
      if (roll.loot.kind === 'coins') {
        base = { ...base, player: { ...base.player, coins: base.player.coins + roll.loot.amount } }
      } else if (roll.loot.kind === 'model') {
        // 宝箱限定形象：解锁（选择由玩家在背包页手动切换）
        unlockModel(roll.loot.model.id)
      } else {
        const p = { ...base.player }
        if (!p.unlockedItems.includes(roll.loot.item.id)) {
          p.unlockedItems = [...p.unlockedItems, roll.loot.item.id]
        }
        if (roll.loot.convertedCoins) p.coins += roll.loot.convertedCoins
        base = { ...base, player: p }
      }
      const { state: next } = evalWithRewards(base)
      update(() => next)
      return roll
    },

    buyShopChest: () => {
      const st = get().state
      if (st.player.coins < SHOP_CHEST_PRICE) return false
      update((s) => ({ ...s, player: { ...s.player, coins: s.player.coins - SHOP_CHEST_PRICE } }))
      // 开箱等级取当前玩家等级（决定概率与金币规模）
      set({ pendingChests: { level: get().state.player.level, count: 1, attributeChoice: false } })
      return true
    },

    buyConsumable: (itemId: string) => {
      const st = get().state
      const item = SHOP_ITEMS.find((i) => i.id === itemId && i.category === 'consumable')
      if (!item) return false
      if (st.player.coins < item.price) return false
      update((s) => ({
        ...s,
        player: {
          ...s.player,
          coins: s.player.coins - item.price,
          inventory: { ...(s.player.inventory ?? {}), [itemId]: (s.player.inventory?.[itemId] ?? 0) + 1 },
        },
      }))
      return true
    },

    buyModel: (modelId: string) => {
      const st = get().state
      const def = LIVE2D_MODELS.find((m) => m.id === modelId)
      if (!def?.shopPrice || isModelUnlocked(modelId)) return false
      if (st.player.coins < def.shopPrice) return false
      update((s) => ({
        ...s,
        player: { ...s.player, coins: s.player.coins - def.shopPrice! },
      }))
      unlockModel(modelId)
      return true
    },

    upgradeSkill: (skillId: string) => {
      const st = get().state
      const def = SKILL_DEFS.find((d) => d.id === skillId)
      if (!def) return false
      const level = st.player.skills?.[skillId] ?? 0
      if (level >= def.maxLevel) return false
      if (st.player.skillPoints < def.spCost) return false
      update((s) => ({
        ...s,
        player: {
          ...s.player,
          skillPoints: s.player.skillPoints - def.spCost,
          skills: { ...(s.player.skills ?? {}), [skillId]: level + 1 },
        },
      }))
      return true
    },

    addWeight: (weightKg: number, date?: string) => {
      const d = date ?? todayKey()
      // 体重里程碑进度由 update() 内的 syncMilestones 统一重算（真实数据驱动）
      update((s) => {
        const without = s.weights.filter((w) => w.date !== d)
        const weights: WeightRecord[] = [...without, { date: d, weightKg }]
        return { ...s, weights }
      })
      // 体重目标节点奖励：跨过未领取的百分比档位即发放（XP+金币，结合节点对应 kg 量）
      grantWeightNodeRewards(ctx)
      // separate: grant streak xp once when crossing thresholds
      const st = get().state
      const reward = findWeightStreakReward(st.weights)
      if (reward) {
        // grant via a system activity
        const before = get().state.player
        const { player } = applyXp(before, reward.xp)
        update((s) => ({ ...s, player }))
      }
    },

    setWeightGoal: (startKg: number, targetKg: number, reward?: string) => {
      if (!(startKg > 0) || !(targetKg > 0) || startKg === targetKg) return
      update((s) => {
        const goal = { startKg, targetKg }
        const existing = s.milestones.find((m) => m.id === WEIGHT_GOAL_MS_ID)
        const ms: MilestoneReward = {
          id: WEIGHT_GOAL_MS_ID,
          goal: `体重达到 ${targetKg}kg`,
          reward: reward?.trim() || existing?.reward || '给自己的健康奖励',
          progress: 0,
          done: false,
          metric: { kind: 'weight', target: targetKg },
          weightTarget: targetKg, // 兼容旧读取方
          tier: tierForMetric('weight', Math.abs(targetKg - startKg)),
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        }
        const milestones = existing
          ? s.milestones.map((m) => (m.id === WEIGHT_GOAL_MS_ID ? ms : m))
          : [...s.milestones, ms]
        // 新目标 = 新征程：节点奖励与检查点从零计（已发过的历史奖励不追回）
        return { ...s, weightGoal: goal, milestones, weightGoalNodesClaimed: [] }
      })
      // 设置时立即结算当前进度已跨过的节点（如用历史体重设置远期目标）
      grantWeightNodeRewards(ctx)
    },

    clearWeightGoal: () => {
      update((s) => ({
        ...s,
        weightGoal: undefined,
        milestones: s.milestones.filter((m) => m.id !== WEIGHT_GOAL_MS_ID),
      }))
    },

    addMood: (mood: MoodRecord['mood'], content?: string) => {
      const rec: MoodRecord = {
        id: `mood_${Date.now()}`,
        date: todayKey(),
        mood,
        content: content ?? '',
        createdAt: new Date().toISOString(),
      }
      update((s) => {
        const moods = [...s.moods.filter((m) => m.date !== rec.date), rec]
        const partial: AppState = { ...s, moods }
        const ach = evaluateAchievements(partial)
        partial.achievements = ach.list
        return partial
      })
    },

    grantCognitiveBreakthrough: (title: string, content: string) => {
      update((s) => {
        const id = `cognitive_${Date.now()}`
        const ach = {
          id,
          title,
          description: content.slice(0, 120),
          icon: '🧠',
          unlockedAt: new Date().toISOString(),
          isCognitive: true,
          insightXp: 100,
        }
        const { player } = applyXp(s.player, ach.insightXp!)
        const newState = { ...s, achievements: [...s.achievements, ach], player }
        return newState
      })
    },

    toggleRestMode: () => update((s) => ({ ...s, restMode: !s.restMode })),

    addMilestone: (
      goal: string,
      reward: string,
      metric?: { kind: MilestoneMetricKind; target: number },
      opts?: { limits?: { minPerSession?: number; maxPerSession?: number }; durationLocked?: boolean; messageToSelf?: string },
    ) =>
      update((s) => {
        const ms: MilestoneReward = {
          id: `ms_${Date.now()}`,
          goal,
          reward,
          progress: 0,
          done: false,
          custom: !metric,
          createdAt: new Date().toISOString(),
          ...(metric
            ? {
                metric,
                tier: tierForMetric(metric.kind, metric.target),
                // 兼容旧读取方
                ...(metric.kind === 'level' ? { targetLevel: metric.target } : {}),
                ...(metric.kind === 'weight' ? { weightTarget: metric.target } : {}),
              }
            : {}),
          ...(opts?.limits ? { limits: opts.limits } : {}),
          ...(opts?.durationLocked ? { durationLocked: true } : {}),
          ...(opts?.messageToSelf?.trim() ? { messageToSelf: opts.messageToSelf.trim() } : {}),
        }
        return { ...s, milestones: [...s.milestones, ms] }
      }),

    claimMilestone: (id: string) => {
      const st = get().state
      const m = st.milestones.find((x) => x.id === id)
      if (!m || !m.done || m.finalClaimed) return null
      const tier = m.tier ?? 'bronze'
      const r = stageReward(tier, 1)
      update((s) => {
        const { player } = applyXp(s.player, r.xp)
        return {
          ...s,
          player: { ...player, attributes: s.player.attributes, coins: player.coins + r.coins },
          milestones: s.milestones.map((x) =>
            x.id === id
              ? { ...x, finalClaimed: true, stagesClaimed: [...new Set([...(x.stagesClaimed ?? []), 100])] }
              : x,
          ),
        }
      })
      return { goal: m.goal, xp: r.xp, coins: r.coins }
    },

    extendMilestoneTarget: (id: string, newTargetMinutes: number) => {
      const m = get().state.milestones.find((x) => x.id === id)
      // 只增不减；仅 time 型可调；创建时选择锁定的不可调
      if (!m?.metric || m.metric.kind !== 'time' || m.durationLocked || newTargetMinutes <= m.metric.target) return false
      update((s) => ({
        ...s,
        milestones: s.milestones.map((x) =>
          x.id === id
            ? {
                ...x,
                metric: { kind: 'time', target: newTargetMinutes },
                // 档位按新目标重定级（后续检查点按新档位发奖励；已领取的不补发不追回）
                tier: tierForMetric('time', newTargetMinutes),
                // done 交由 update() 内的 syncMilestones 按新目标重算（可能回落为未完成）
              }
            : x,
        ),
      }))
      return true
    },

    deleteMilestone: (id: string) => {
      const st = get().state
      const m = st.milestones.find((x) => x.id === id)
      if (!m) return false
      // 删除是放弃承诺：强制花费 2500 金币，让「删除」成为需要三思的决定
      if (st.player.coins < 2500) return false
      update((s) => ({
        ...s,
        player: { ...s.player, coins: s.player.coins - 2500 },
        milestones: s.milestones.filter((x) => x.id !== id),
      }))
      return true
    },

    setTitle: (title: string) =>
      update((s) => ({ ...s, player: { ...s.player, currentTitle: title } })),

    spendCoins: (amount: number, item: string) => {
      const st = get().state
      if (st.player.coins < amount) return false
      const purchased = {
        ...st,
        player: {
          ...st.player,
          coins: st.player.coins - amount,
          unlockedItems: st.player.unlockedItems.includes(item)
            ? st.player.unlockedItems
            : [...st.player.unlockedItems, item],
        },
      }
      // 购买后评估成就（集齐服饰发「衣橱的主人」等）
      const { state: next } = evalWithRewards(purchased)
      update(() => next)
      return true
    },

    setItemsUnlocked: (ids: string[], unlocked: boolean) =>
      update((s) => ({
        ...s,
        player: {
          ...s.player,
          unlockedItems: unlocked
            ? [...new Set([...s.player.unlockedItems, ...ids])]
            : s.player.unlockedItems.filter((i) => !ids.includes(i)),
        },
      })),

    recordOutfitChange: () => {
      const st = get().state
      // 记录换装 + 成就评估（含称号/金币奖励发放）
      const logged = applyOutfitLog(st)
      const { state: next } = evalWithRewards(logged)
      update(() => next)
    },

    dailyCheckin: () => {
      const st = get().state
      const today = todayKey()
      if (st.player.lastCheckinDate === today) return false
      // 连续签到：昨日已签则 +1，否则重置为 1
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      const streak =
        st.player.lastCheckinDate === yesterday ? (st.player.checkinStreak ?? 0) + 1 : 1
      // 奖励：基础 100 + 连续签到加成（每 3 天 +50，封顶 +300）
      const bonus = Math.min(300, Math.floor(streak / 3) * 50)
      const coins = 100 + bonus
      update((s) => ({
        ...s,
        player: {
          ...s.player,
          coins: s.player.coins + coins,
          checkinStreak: streak,
          lastCheckinDate: today,
        },
      }))
      return true
    },

    resetGame: async () => {
      const fresh = defaultState()
      set({ state: fresh, pendingFeedback: null, pendingLevelUp: null })
      // 重置是关键操作：取消 debounce，立即写入
      await flushPersist(fresh)
      // 用户明确重置：强制覆盖服务器备份（绕过异常小档护栏），否则下次启动三源择优会复活旧档
      backupToServer(fresh, { force: true })
    },

    importState: (imported: AppState) => {
      // 深合并：补齐嵌套对象缺失字段，避免属性/aiGrowth undefined 运行时报错
      const merged = mergeImportedState(imported)
      set({ state: merged, pendingFeedback: null, pendingLevelUp: null })
      // 导入同样需要立即写入
      void flushPersist(merged)
      // 用户明确导入（可能是 XP 更少的旧档）：强制覆盖服务器备份，防止下次启动被三源择优复活
      backupToServer(merged, { force: true })
    },

    chooseLevelUpAttribute: (attr: keyof Player['attributes']) => {
      update((s) => ({
        ...s,
        player: {
          ...s.player,
          attributes: {
            ...s.player.attributes,
            [attr]: s.player.attributes[attr] + 1,
          },
        },
      }))
      // 选择后清除 pendingLevelUp（update 内部已 persist 新 state）
      set({ pendingLevelUp: null })
    },
  }
}

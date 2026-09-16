import type { Player } from '../types'
import {
  DUPLICATE_REWARD_COIN_RATE,
  getLevelUpReward,
  levelRewardPrice,
  levelUpCoinReward,
  levelUpSkillPointReward,
  requiredXpForLevel,
  titleForLevel,
} from '../config/xpConfig'
import { isModelUnlocked, LIVE2D_MODELS } from '../config/live2dModels'

export interface LevelUpResult {
  leveledUp: boolean
  fromLevel: number
  toLevel: number
  coinsGained: number
  skillPointsGained: number
  newTitle?: string
  /** levels skipped (multi-level) */
  levelsGained: number
  /** 本次升级获得的宝箱数（每升 1 级 1 箱，装备改由宝箱产出） */
  chests: number
  /** 本次升级解锁的功能标识 */
  unlockedFeatures: string[]
  /** 本次升级解锁的背景/Live2D 形象 id（由调用方发放） */
  unlockedRewards: string[]
  /** 本次升级命中已拥有的等级奖励 id（折算金币补偿） */
  duplicateRewards: string[]
  /** 重复奖励折算获得的金币（已并入 coinsGained） */
  rewardCoins: number
  /** 是否包含里程碑 */
  hasMilestone: boolean
  /** 里程碑描述（叙事性） */
  milestoneDesc?: string
  /** 是否可选属性加成（每次升级均可选） */
  attributeChoiceAvailable: boolean
}

/**
 * Apply xp to a player and resolve level-ups.
 * Returns a NEW player object + the level-up result.
 */
export const applyXp = (player: Player, xp: number): { player: Player; result: LevelUpResult } => {
  const base: Player = {
    ...player,
    attributes: { ...player.attributes },
    titles: [...player.titles],
    unlockedItems: [...player.unlockedItems],
  }

  let totalXp = base.totalXp + xp
  let level = base.level
  let currentXp = base.xp + xp
  let coinsGained = 0
  let skillPointsGained = 0
  let newTitle: string | undefined
  let chests = 0
  const unlockedFeatures: string[] = []
  const unlockedRewards: string[] = []
  const duplicateRewards: string[] = []
  let rewardCoins = 0
  let hasMilestone = false
  let milestoneDesc: string | undefined

  let needed = requiredXpForLevel(level)
  while (currentXp >= needed && level < 999) {
    currentXp -= needed
    level += 1
    coinsGained += levelUpCoinReward(level)
    skillPointsGained += levelUpSkillPointReward()
    chests += 1
    const t = titleForLevel(level)
    if (!base.titles.includes(t)) {
      base.titles.push(t)
      newTitle = t
    }
    // 应用升级奖励（功能/里程碑；背景与 Live2D 形象 id 由调用方发放）
    const reward = getLevelUpReward(level)
    if (reward) {
      if (reward.featureUnlocks) {
        unlockedFeatures.push(...reward.featureUnlocks)
      }
      // 奖励已被其他渠道（商店/宝箱/先前等级）拥有 → 折算金币补偿
      for (const id of reward.unlocks ?? []) {
        const owned = LIVE2D_MODELS.some((m) => m.id === id)
          ? isModelUnlocked(id)
          : base.unlockedItems.includes(id)
        if (owned) {
          duplicateRewards.push(id)
          rewardCoins += Math.round(levelRewardPrice(id) * DUPLICATE_REWARD_COIN_RATE)
        } else {
          unlockedRewards.push(id)
        }
      }
      if (reward.milestone) hasMilestone = true
      if (reward.milestoneDesc && !milestoneDesc) milestoneDesc = reward.milestoneDesc
    }
    needed = requiredXpForLevel(level)
  }

  const leveledUp = level > base.level
  coinsGained += rewardCoins
  const result: LevelUpResult = {
    leveledUp,
    fromLevel: base.level,
    toLevel: level,
    coinsGained,
    skillPointsGained,
    newTitle,
    levelsGained: level - base.level,
    chests,
    unlockedFeatures,
    unlockedRewards,
    duplicateRewards,
    rewardCoins,
    hasMilestone,
    milestoneDesc,
    attributeChoiceAvailable: leveledUp,
  }

  const updated: Player = {
    ...base,
    level,
    xp: currentXp,
    totalXp,
    coins: base.coins + coinsGained,
    skillPoints: base.skillPoints + skillPointsGained,
    currentTitle: newTitle ?? base.currentTitle,
  }

  return { player: updated, result }
}

export const levelProgress = (player: Player) => {
  const needed = requiredXpForLevel(player.level)
  const pct = needed > 0 ? Math.min(100, Math.round((player.xp / needed) * 100)) : 0
  return { needed, pct }
}

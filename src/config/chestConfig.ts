// ===== 升级宝箱系统 =====
// 概率体系参考 sleepless_lootbox（GitHub）的权重稀有度模型：
// 权重越小越稀有，等级越高高稀有度权重越大（线性插值），
// 低等级仍有小概率开出高稀有度 —— 惊喜感保留。
// 动画设计参考 card-loot-opening（全息卡牌）与常见开箱动效：
// 抖动 → 光柱冲天(颜色悬念轮播) → 卡片 3D 翻转揭示 → 稀有度越高特效越强。

import { SHOP_ITEMS, type ShopItem } from './shopItems'
import { LIVE2D_MODELS, getUnlockedModels, type Live2DModelDef } from './live2dModels'

/** 宝箱稀有度（五档，用户指定色板） */
export type ChestRarity = 'white' | 'blue' | 'purple' | 'gold' | 'red'

export const CHEST_RARITY_ORDER: ChestRarity[] = ['white', 'blue', 'purple', 'gold', 'red']

export interface ChestRarityMeta {
  label: string
  /** 主题色（光柱/边框/粒子） */
  hex: string
  /** 发光 rgba */
  glow: string
  text: string
  border: string
  /** 揭示音效音高倍率（越高越华丽） */
  fanfare: number
  /** 粒子数量 */
  particles: number
  /** 是否全屏闪光 */
  flash: boolean
  /** 是否震屏 */
  quake: boolean
}

export const CHEST_RARITY_META: Record<ChestRarity, ChestRarityMeta> = {
  white: {
    label: '普通', hex: '#e5e7eb', glow: 'rgba(229,231,235,0.9)',
    text: 'text-gray-200', border: 'border-gray-300',
    fanfare: 1, particles: 8, flash: false, quake: false,
  },
  blue: {
    label: '稀有', hex: '#60a5fa', glow: 'rgba(96,165,250,0.9)',
    text: 'text-blue-300', border: 'border-blue-400',
    fanfare: 2, particles: 16, flash: false, quake: false,
  },
  purple: {
    label: '史诗', hex: '#c084fc', glow: 'rgba(192,132,252,0.9)',
    text: 'text-purple-300', border: 'border-purple-400',
    fanfare: 3, particles: 28, flash: true, quake: false,
  },
  gold: {
    label: '传说', hex: '#ffd54a', glow: 'rgba(255,213,74,0.95)',
    text: 'text-amber-300', border: 'border-amber-400',
    fanfare: 4, particles: 44, flash: true, quake: true,
  },
  red: {
    label: '神话', hex: '#ef4444', glow: 'rgba(239,68,68,0.95)',
    text: 'text-red-300', border: 'border-red-500',
    fanfare: 5, particles: 64, flash: true, quake: true,
  },
}

/** 商店装备稀有度 → 宝箱稀有度映射 */
import type { ShopRarity } from './shopItems'

const SHOP_TO_CHEST: Record<ShopRarity, ChestRarity> = {
  common: 'white',
  uncommon: 'white',
  rare: 'blue',
  epic: 'purple',
  legendary: 'gold',
}

// ===== 宝箱专属背景（商店不售卖，仅宝箱产出） =====
// 加入 SHOP_ITEMS 以复用购买/背包逻辑，ShopPage 通过 chestExclusive 过滤
// 图片资源：public/backgrounds/chest-*.jpg（AI 绘制）

export const CHEST_EXCLUSIVE_DEFS: ShopItem[] = [
  // 白 —— 纪念向
  { id: 'chest_bg_white', name: '初心者·晨光小径', description: '第一只宝箱的回响：晨雾尽头，是你出发那天的路。', icon: '🌅', price: 999999, category: 'background', rarity: 'common', chestExclusive: true, chestRarity: 'white' },
  // 蓝 —— 精制
  { id: 'chest_bg_blue', name: '苍蓝·深海回廊', description: '光柱垂入深海，潮声在遗迹间回荡。', icon: '🌊', price: 999999, category: 'background', rarity: 'rare', chestExclusive: true, chestRarity: 'blue' },
  // 紫 —— 史诗
  { id: 'chest_bg_purple', name: '幻紫·星尘秘境', description: '紫色星云与浮空水晶，只对开箱的人显形。', icon: '🔮', price: 999999, category: 'background', rarity: 'epic', chestExclusive: true, chestRarity: 'purple' },
  // 金 —— 传说
  { id: 'chest_bg_gold', name: '黄金·黎明殿堂', description: '真正的殿堂不靠继承，是你一只只宝箱开出来的。', icon: '👑', price: 999999, category: 'background', rarity: 'legendary', chestExclusive: true, chestRarity: 'gold' },
  // 红 —— 神话（至臻）
  { id: 'chest_bg_red', name: '绯红·天启之门', description: '神话之门为你而开，所有坚持的回声在此汇聚。', icon: '🚪', price: 999999, category: 'background', rarity: 'legendary', chestExclusive: true, chestRarity: 'red' },

  // ===== 服饰说明 =====
  // 黑水手制服（20000）/ 黑水手-全（24000）已改为商店直售（红档定价），
  // 定义移至 shopItems.ts；直标 chestRarity: 'red' 使其仍进入红档宝箱奖池。
]

/** 注入商店列表（模块加载时执行一次；equipItem/背包遍历 SHOP_ITEMS 自动生效） */
let injected = false
export const injectChestExclusives = () => {
  if (injected) return
  injected = true
  for (const d of CHEST_EXCLUSIVE_DEFS) {
    if (!SHOP_ITEMS.some((i) => i.id === d.id)) SHOP_ITEMS.push(d)
  }
}

/** 装备的宝箱稀有度 */
export const chestRarityOf = (item: ShopItem): ChestRarity =>
  item.chestRarity ?? SHOP_TO_CHEST[item.rarity]

// ===== 等级 → 稀有度权重（线性插值，等级越高高稀有度占比越大） =====

interface Tier { lv: number; w: Record<ChestRarity, number> }

const TIERS: Tier[] = [
  { lv: 1,   w: { white: 66, blue: 23, purple: 8,  gold: 2.4, red: 0.6 } },
  { lv: 25,  w: { white: 45, blue: 27, purple: 16, gold: 8,   red: 3 } },
  { lv: 50,  w: { white: 28, blue: 30, purple: 24, gold: 13,  red: 5 } },
  { lv: 100, w: { white: 14, blue: 24, purple: 30, gold: 21,  red: 11 } },
]

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const chestRarityWeights = (level: number): Record<ChestRarity, number> => {
  const lv = Math.max(1, Math.min(100, level))
  let lo = TIERS[0]
  let hi = TIERS[TIERS.length - 1]
  for (let i = 0; i < TIERS.length - 1; i++) {
    if (lv >= TIERS[i].lv && lv <= TIERS[i + 1].lv) {
      lo = TIERS[i]
      hi = TIERS[i + 1]
      break
    }
  }
  const t = hi.lv === lo.lv ? 0 : (lv - lo.lv) / (hi.lv - lo.lv)
  return {
    white: lerp(lo.w.white, hi.w.white, t),
    blue: lerp(lo.w.blue, hi.w.blue, t),
    purple: lerp(lo.w.purple, hi.w.purple, t),
    gold: lerp(lo.w.gold, hi.w.gold, t),
    red: lerp(lo.w.red, hi.w.red, t),
  }
}

/** 各稀有度当前概率（展示用） */
export const chestRarityChances = (level: number): Record<ChestRarity, number> => {
  const w = chestRarityWeights(level)
  const total = CHEST_RARITY_ORDER.reduce((s, r) => s + w[r], 0)
  const out = {} as Record<ChestRarity, number>
  for (const r of CHEST_RARITY_ORDER) out[r] = w[r] / total
  return out
}

// ===== 金币奖励区间（v1.1 整体减半：直出金币与重复折算同步下调 50%） =====

const COIN_RANGE: Record<ChestRarity, [number, number]> = {
  white: [25, 75],
  blue: [300, 750],
  purple: [1000, 2250],
  gold: [3000, 6000],
  red: [9000, 18000],
}

// ===== 抽奖引擎 =====

export type ChestLoot =
  | { kind: 'coins'; amount: number; rarity: ChestRarity }
  | { kind: 'item'; item: ShopItem; rarity: ChestRarity; convertedCoins?: number }
  | { kind: 'model'; model: Live2DModelDef; rarity: ChestRarity }

/** 保底：连续 N 次未出紫色以上 → 必出紫色以上 */
export const CHEST_PITY_LIMIT = 9

/** 商店购买宝箱单价（金币） */
export const SHOP_CHEST_PRICE = 1000

/** 宝箱限定形象在同稀有度池中的权重（装备为 1；越低越稀有） */
const CHEST_MODEL_WEIGHT = 0.45

const pickWeighted = <T,>(entries: [T, number][]): T => {
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * total
  for (const [v, w] of entries) {
    r -= w
    if (r <= 0) return v
  }
  return entries[entries.length - 1][0]
}

/** 可入奖池的道具分类（背景装饰 + 服饰换装贴图） */
const LOOT_CATS = new Set(['background', 'outfit'])

const randInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1))

export interface ChestRollResult {
  loot: ChestLoot
  /** 是否触发保底 */
  pityTriggered: boolean
  /** 抽后的保底计数 */
  nextPity: number
}

/**
 * 开一箱。
 * @param level 升级到的等级（决定概率与金币规模）
 * @param pityCount 当前保底计数
 * @param ownedItems 玩家已拥有的物品 id（重复装备折算金币）
 */
export const rollChest = (level: number, pityCount: number, ownedItems: string[]): ChestRollResult => {
  let rarity: ChestRarity
  let pityTriggered = false

  if (pityCount >= CHEST_PITY_LIMIT - 1) {
    // 保底：紫色及以上
    rarity = pickWeighted<ChestRarity>([
      ['purple', 62],
      ['gold', 28],
      ['red', 10],
    ])
    pityTriggered = true
  } else {
    const w = chestRarityWeights(level)
    rarity = pickWeighted(CHEST_RARITY_ORDER.map((r) => [r, w[r]] as [ChestRarity, number]))
  }

  const nextPity = rarity === 'purple' || rarity === 'gold' || rarity === 'red' ? 0 : pityCount + 1

  // 25% 金币 / 75% 背景或形象（金币区间三倍化后，下调直出金币占比保持开箱期望平衡）
  if (Math.random() < 0.25) {
    const [min, max] = COIN_RANGE[rarity]
    const scale = 1 + Math.min(2, level * 0.02) // 等级加成，封顶 ×3
    return {
      loot: { kind: 'coins', amount: Math.round(randInt(min, max) * scale), rarity },
      pityTriggered,
      nextPity,
    }
  }

  // 该稀有度的候选：宝箱专属（背景/服饰）+ 商店背景与服饰（无等级门槛）
  // + 未解锁的限定 Live2D 形象（蓝/紫/金/红档，权重低于背景保持稀有感）
  const exclusives = CHEST_EXCLUSIVE_DEFS.filter((i) => i.chestRarity === rarity)
  const entries: [ShopItem | Live2DModelDef, number][] = exclusives.map((e) => [e, 1])
  for (const it of SHOP_ITEMS) {
    if (it.chestExclusive) continue
    if (!LOOT_CATS.has(it.category)) continue
    if (chestRarityOf(it) === rarity) entries.push([it, 1])
  }
  const unlockedModels = new Set(getUnlockedModels())
  for (const m of LIVE2D_MODELS) {
    if (m.chestRarity === rarity && !unlockedModels.has(m.id)) entries.push([m, CHEST_MODEL_WEIGHT])
  }
  if (entries.length === 0) {
    const [min, max] = COIN_RANGE[rarity]
    return {
      loot: { kind: 'coins', amount: Math.round(randInt(min, max) * (1 + Math.min(2, level * 0.02))) , rarity },
      pityTriggered,
      nextPity,
    }
  }

  const won = pickWeighted(entries)
  // 形象奖励：直接解锁（不重复 —— 已解锁的不进池）
  if ('cubism' in won) {
    return { loot: { kind: 'model', model: won, rarity }, pityTriggered, nextPity }
  }
  const item = won
  const owned = ownedItems.includes(item.id)
  let convertedCoins: number | undefined
  if (owned) {
    const [min, max] = COIN_RANGE[rarity]
    convertedCoins = Math.round(randInt(min, max) * 0.6 * (1 + Math.min(2, level * 0.02)))
  }
  return { loot: { kind: 'item', item, rarity, convertedCoins }, pityTriggered, nextPity }
}

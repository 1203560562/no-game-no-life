/**
 * 服饰图鉴 / 收集统计 / 主题套装加成
 *
 * - OUTFIT_ITEMS：全部可解锁服饰道具（含免费款不在此列——图鉴只统计解锁项）
 * - THEMES：主题套装（服饰 + 背景搭配触发 XP 加成），加成在 calculateXp 的
 *   styleBonus 通道生效（见 engine/xpCalculator.ts）
 * - 收集奖励：集齐全部服饰发称号「衣橱的主人」（经成就 outfit_full_collection）
 */

import { SHOP_ITEMS } from './shopItems'
import { getModelChoice, getOutfitChoice } from './live2dModels'
import { getBackgroundChoice } from './backgrounds'

/** 全部服饰道具（商店直售 + 宝箱专属，均已在 SHOP_ITEMS） */
export const OUTFIT_ITEMS = SHOP_ITEMS.filter((i) => i.category === 'outfit')

/** 已解锁的服饰道具 id 集 */
export const ownedOutfitIds = (unlockedItems: string[]): Set<string> =>
  new Set(OUTFIT_ITEMS.filter((i) => unlockedItems.includes(i.id)).map((i) => i.id))

/** 图鉴完成度（0-1） */
export const outfitCollectionRatio = (unlockedItems: string[]): number =>
  OUTFIT_ITEMS.length === 0 ? 0 : ownedOutfitIds(unlockedItems).size / OUTFIT_ITEMS.length

/** 主题套装：指定服饰道具 + 指定背景道具同时启用时触发 XP 加成 */
export interface OutfitTheme {
  id: string
  /** 套装名 */
  label: string
  /** 触发描述（展示用） */
  hint: string
  /** 服饰道具 id（须已解锁且当前穿着对应 outfitId） */
  outfitItemId: string
  /** 对应 OutfitDef.id */
  outfitId: string
  /** 背景道具 id（须已拥有且当前启用） */
  bgItemId: string
  /** XP 加成（如 0.05 = +5%） */
  bonus: number
}

/** 主题套装表（服饰 → 搭配背景） */
export const THEMES: OutfitTheme[] = [
  {
    id: 'rainy_night',
    label: '雨夜独行',
    hint: '黑水手制服 × 雨夜街灯 · XP +5%',
    outfitItemId: 'outfit_black_sailor',
    outfitId: 'blackSailor',
    bgItemId: 'bg_anime_rain_city',
    bonus: 0.05,
  },
  {
    id: 'midnight_train',
    label: '午夜列车',
    hint: '黑水手-全 × 不夜城 · XP +6%',
    outfitItemId: 'outfit_black_sailor_full',
    outfitId: 'blackSailorFull',
    bgItemId: 'bg_anime_urban_night',
    bonus: 0.06,
  },
  {
    id: 'sakura_daily',
    label: '樱花日常',
    hint: '粉水手制服 × 秋日私语 · XP +4%',
    outfitItemId: 'outfit_pink_sailor',
    outfitId: 'pinkSailor',
    bgItemId: 'bg_anime_autumn',
    bonus: 0.04,
  },
  {
    id: 'starlit_voyage',
    label: '星海远航',
    hint: '白水手黑 × 星穹之幕 · XP +5%',
    outfitItemId: 'outfit_4',
    outfitId: 'outfit4',
    bgItemId: 'bg_celestial',
    bonus: 0.05,
  },
]

/**
 * 当前生效的主题套装加成（同时满足：服饰已解锁且穿着、背景已拥有且启用）。
 * 返回命中的套装列表（可能多个；加成叠加）。
 */
export const activeThemes = (
  unlockedItems: string[],
  currentOutfitByModel: Record<string, string>,
  currentModelId: string,
  currentBgId: string | null,
): OutfitTheme[] => {
  const owned = new Set(unlockedItems)
  const wornOutfitId = currentOutfitByModel[currentModelId] ?? ''
  return THEMES.filter(
    (t) =>
      owned.has(t.outfitItemId) &&
      wornOutfitId === t.outfitId &&
      owned.has(t.bgItemId) &&
      currentBgId === t.bgItemId,
  )
}

// ===== 主题套装加成（局结算时调用） =====

/**
 * 结算时计算主题加成：读取当前形象/服饰/背景选择（内存态 API，
 * 与 UI 实际展示一致），返回命中的加成总和与描述（多套叠加）。
 */
export const computeThemeBonus = (unlockedItems: string[]): { bonus: number; label: string } => {
  try {
    const modelId = getModelChoice()
    const wornOutfitId = getOutfitChoice(modelId)
    const bgId = getBackgroundChoice()
    const hits = activeThemes(unlockedItems, { [modelId]: wornOutfitId }, modelId, bgId)
    if (hits.length === 0) return { bonus: 0, label: '' }
    return {
      bonus: hits.reduce((s, t) => s + t.bonus, 0),
      label: hits.map((t) => `${t.label} +${Math.round(t.bonus * 100)}%`).join(' · '),
    }
  } catch {
    return { bonus: 0, label: '' }
  }
}

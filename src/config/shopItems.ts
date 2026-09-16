// ===== 《成为自己 · 冒险商店》商品配置 =====
// 购买后加入 player.unlockedItems。
// v2 精简：穿戴配饰已下架（Live2D 立绘无法真实呈现），
// 只保留有实际视觉/功能效果的品类：
// - background 背景装饰（渲染见 config/backgrounds.ts：CSS 渐变 / 高清图片 + 粒子）
// - consumable 局增益消耗品（XP 加成）

import { WARDROBE_OUTFIT_ITEMS } from './wardrobeOutfits'

/** 商店分类（3 类） */
export type ShopCategory =
  | 'background' // 🌌 背景
  | 'consumable' // 🧪 消耗品
  | 'outfit' // 👗 服饰（Live2D 换装贴图）

/** 稀有度 */
export type ShopRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

/** 限时类型（穿戴配饰下架后仅剩个性化） */
export type LimitedType = 'personal' | null

export interface ShopItem {
  id: string
  name: string
  description: string
  icon: string
  price: number
  category: ShopCategory
  rarity: ShopRarity
  /** 最低等级要求 */
  requiredLevel?: number
  /** 个性化标记（基于玩家行为解锁的条件描述，仅用于展示） */
  limited?: LimitedType
  /** 个性化商品：解锁条件描述（仅用于展示） */
  personalHint?: string
  /** 宝箱专属精品：商店不售卖，仅升级宝箱产出 */
  chestExclusive?: boolean
  /** 宝箱稀有度（专属道具直标；其余按 rarity 映射） */
  chestRarity?: import('./chestConfig').ChestRarity
}

// ===== 稀有度价格区间参考 =====
// common:   100~500   （CSS 渐变背景）
// uncommon: 500~1000  （入门图片背景）
// rare:     1000~2000
// epic:     2000~3500
// legendary: 4000+    （金/红档图片背景）

export const SHOP_ITEMS: ShopItem[] = [
  // ===== CSS 渐变背景（白档入门，零资源开销） =====
  { id: 'bg_stars', name: '星空背景', description: '更密集的星空粒子。', icon: '✨', price: 200, category: 'background', rarity: 'common', requiredLevel: 2 },
  { id: 'bg_forest', name: '森林背景', description: '宁静的森林色调。', icon: '🌲', price: 300, category: 'background', rarity: 'common', requiredLevel: 3 },
  { id: 'bg_ocean', name: '海洋背景', description: '深邃的海洋色调。', icon: '🌊', price: 300, category: 'background', rarity: 'common', requiredLevel: 3 },
  { id: 'bg_sunset', name: '黄昏背景', description: '温暖的黄昏色调。', icon: '🌅', price: 400, category: 'background', rarity: 'uncommon', requiredLevel: 5 },
  { id: 'bg_aurora', name: '极光背景', description: '流动的极光效果。', icon: '🌌', price: 500, category: 'background', rarity: 'uncommon', requiredLevel: 8 },
  { id: 'bg_cherry', name: '樱花背景', description: '漫天樱花飘落。', icon: '🌸', price: 800, category: 'background', rarity: 'uncommon', requiredLevel: 8 },
  { id: 'bg_galaxy', name: '银河背景', description: '壮阔的银河。', icon: '🌌', price: 1500, category: 'background', rarity: 'rare', requiredLevel: 12 },
  { id: 'bg_void', name: '虚空背景', description: '深邃的虚空。', icon: '⚫', price: 2500, category: 'background', rarity: 'epic', requiredLevel: 18 },

  // ===== 高清图片背景（GitHub: VisualVault 精选 + AI 绘制） =====
  // --- 白档（入门图） ---
  { id: 'bg_dunes', name: '沙丘余晖', description: '落日把沙丘染成蜜色。', icon: '🏜️', price: 600, category: 'background', rarity: 'uncommon', requiredLevel: 3 },
  { id: 'bg_neon_field', name: '霓虹原野', description: '抽象的霓虹地平线。', icon: '🌆', price: 700, category: 'background', rarity: 'uncommon', requiredLevel: 4 },
  { id: 'bg_calm', name: '静谧', description: '安放思绪的一片风景。', icon: '🫧', price: 800, category: 'background', rarity: 'uncommon', requiredLevel: 5 },
  { id: 'bg_dark_waves', name: '暗涌', description: '深色的浪，藏着力量的海。', icon: '🌊', price: 900, category: 'background', rarity: 'uncommon', requiredLevel: 6 },

  // --- 蓝档 ---
  { id: 'bg_moon_lake', name: '月下湖', description: '满月悬在湖面之上。', icon: '🌕', price: 1200, category: 'background', rarity: 'rare', requiredLevel: 6 },
  { id: 'bg_mist', name: '迷雾森林', description: '雾气在林间流动。', icon: '🌲', price: 1400, category: 'background', rarity: 'rare', requiredLevel: 8 },
  { id: 'bg_northern_night', name: '极夜', description: '北方的夜空低垂。', icon: '🌃', price: 1600, category: 'background', rarity: 'rare', requiredLevel: 10 },
  { id: 'bg_comet', name: '彗星之夜', description: '一颗彗星划过长夜。', icon: '☄️', price: 1800, category: 'background', rarity: 'rare', requiredLevel: 10 },

  // --- 紫档 ---
  { id: 'bg_neon_city', name: '霓虹都市', description: '雨后的霓虹之城。', icon: '🏙️', price: 2500, category: 'background', rarity: 'epic', requiredLevel: 12 },
  { id: 'bg_night_city', name: '不夜城', description: '灯火永不熄灭的城市。', icon: '🌃', price: 2600, category: 'background', rarity: 'epic', requiredLevel: 14 },
  { id: 'bg_cyber', name: '赛博空间', description: '数据洪流中的都市幻影。', icon: '🤖', price: 2800, category: 'background', rarity: 'epic', requiredLevel: 15 },
  { id: 'bg_mystic_town', name: '魔夜小镇', description: '魔法之夜笼罩的小镇。', icon: '🏘️', price: 3000, category: 'background', rarity: 'epic', requiredLevel: 16 },

  // --- 金档 ---
  { id: 'bg_sunset_peaks', name: '落日群山', description: '落日点燃了整片山脉。', icon: '🏔️', price: 8000, category: 'background', rarity: 'legendary', requiredLevel: 18 },
  { id: 'bg_lofoten', name: '罗弗敦暮色', description: '北纬 68° 的黄昏。', icon: '🌇', price: 8400, category: 'background', rarity: 'legendary', requiredLevel: 18 },
  { id: 'bg_mountain_dawn', name: '山巅冬阳', description: '冬日暖阳照上山脊。', icon: '⛰️', price: 9000, category: 'background', rarity: 'legendary', requiredLevel: 20 },
  { id: 'bg_copper_peak', name: '暮色山峦', description: '铜色的黄昏山脉。', icon: '🗻', price: 9600, category: 'background', rarity: 'legendary', requiredLevel: 20 },
  { id: 'bg_moonlight', name: '月光', description: '清辉遍地，万籁俱寂。', icon: '🌙', price: 10000, category: 'background', rarity: 'legendary', requiredLevel: 22 },
  { id: 'bg_earthrise', name: '地出', description: '从月球回望家园升起。', icon: '🌍', price: 10400, category: 'background', rarity: 'legendary', requiredLevel: 22 },

  // ===== 动漫场景背景（GitHub: l2a1n/wallpaper-bank 精选，无人物无版权角色） =====
  // --- 白档 ---
  { id: 'bg_anime_window', name: '粉彩之窗', description: '粉彩色调的窗边，光线温柔得像一封信。', icon: '🪟', price: 700, category: 'background', rarity: 'uncommon', requiredLevel: 3 },
  { id: 'bg_anime_staircase', name: '长阶光影', description: '长长的石阶通向夏日，光斑落了一路。', icon: '🪜', price: 800, category: 'background', rarity: 'uncommon', requiredLevel: 4 },
  { id: 'bg_anime_snow_valley', name: '静雪之谷', description: '雪落无声的山谷，安静得能听见呼吸。', icon: '❄️', price: 900, category: 'background', rarity: 'uncommon', requiredLevel: 5 },

  // --- 蓝档 ---
  { id: 'bg_anime_room', name: '和风小屋', description: '木质小屋洒满夕光，时光在这里放慢。', icon: '🏠', price: 1200, category: 'background', rarity: 'rare', requiredLevel: 6 },
  { id: 'bg_anime_autumn', name: '秋日私语', description: '红叶漫山的秋天，风里都是故事。', icon: '🍁', price: 1400, category: 'background', rarity: 'rare', requiredLevel: 8 },
  { id: 'bg_anime_lake', name: '镜面之湖', description: '湖面平静如镜，倒映着整片天空。', icon: '🏞️', price: 1600, category: 'background', rarity: 'rare', requiredLevel: 8 },
  { id: 'bg_anime_cafe', name: '街角咖啡', description: 'lofi 音乐里的街角咖啡店，慢下来的傍晚。', icon: '☕', price: 1800, category: 'background', rarity: 'rare', requiredLevel: 10 },

  // --- 紫档 ---
  { id: 'bg_anime_shrine', name: '朱红鸟居', description: '朱红鸟居立在暮色里，通往另一个世界。', icon: '⛩️', price: 2500, category: 'background', rarity: 'epic', requiredLevel: 12 },
  { id: 'bg_anime_rain_city', name: '雨夜街灯', description: '雨夜的街道，霓虹在积水中碎成星光。', icon: '🌧️', price: 2600, category: 'background', rarity: 'epic', requiredLevel: 14 },
  { id: 'bg_anime_field', name: '苍穹之野', description: '幻想原野之上，苍穹低垂触手可及。', icon: '🌾', price: 2800, category: 'background', rarity: 'epic', requiredLevel: 15 },
  { id: 'bg_anime_urban_night', name: '都市晚风', description: '晚风穿过都市的夜，灯河在楼宇间流淌。', icon: '🌃', price: 3000, category: 'background', rarity: 'epic', requiredLevel: 16 },

  // --- 金档 ---
  { id: 'bg_anime_fireworks', name: '夏夜花火', description: '夏夜祭典的花火，在头顶炸开成星海。', icon: '🎆', price: 9000, category: 'background', rarity: 'legendary', requiredLevel: 18 },
  { id: 'bg_anime_starlit', name: '星穹之下', description: '立于星穹之下，银河倾泻进眼里。', icon: '🌠', price: 9600, category: 'background', rarity: 'legendary', requiredLevel: 20 },
  { id: 'bg_anime_garden', name: '秘境花园', description: '无人知晓的秘境花园，四季花开不败。', icon: '🌺', price: 10000, category: 'background', rarity: 'legendary', requiredLevel: 22 },
  { id: 'bg_anime_season_tree', name: '四季之树', description: '一棵树看尽四季，花瓣与落叶同风起舞。', icon: '🌳', price: 9600, category: 'background', rarity: 'legendary', requiredLevel: 20 },
  { id: 'bg_anime_dusk_forest', name: '云海林径', description: '暮色沉入云海，森林小径通向最后的霞光。', icon: '🌲', price: 9600, category: 'background', rarity: 'legendary', requiredLevel: 20 },

  // --- 金档（AI 绘制） ---
  { id: 'bg_celestial', name: '星穹之幕', description: '铺满整个画框的星穹，金星与暗云交织。', icon: '🌠', price: 10000, category: 'background', rarity: 'legendary', requiredLevel: 20 },
  { id: 'bg_aurora_palace', name: '极光圣殿', description: '极光垂落如帘，像一座光织成的殿堂。', icon: '🗻', price: 9000, category: 'background', rarity: 'legendary', requiredLevel: 18 },

  // --- 红档（神话，直标 chestRarity） ---
  { id: 'bg_inferno', name: '熔焰之心', description: '地心熔焰在画框深处燃烧，火星升腾。', icon: '🔥', price: 32000, category: 'background', rarity: 'legendary', chestRarity: 'red', requiredLevel: 25 },
  { id: 'bg_blackhole', name: '黑洞视界', description: '连光也无法逃逸的边界。', icon: '🕳️', price: 24000, category: 'background', rarity: 'legendary', chestRarity: 'red', requiredLevel: 25 },
  { id: 'bg_dark_star', name: '暗星', description: '一颗即将熄灭的暗星。', icon: '⭐', price: 26000, category: 'background', rarity: 'legendary', chestRarity: 'red', requiredLevel: 28 },

  // ===== 个性化商品（行为解锁） =====
  { id: 'pers_creator_bg', name: '创造者工作室背景', description: '为创造者定制的工作室背景。', icon: '🎨', price: 2200, category: 'background', rarity: 'rare', limited: 'personal', requiredLevel: 12, personalHint: '创造记录 ≥ 20 次' },

  // ===== 服饰（日和·衣橱换装贴图；单一注册表派生，含红档直售款，见 wardrobeOutfits.ts） =====
  ...WARDROBE_OUTFIT_ITEMS,

  // ===== v1.0 局增益消耗品 (4) =====
  { id: 'buff_double', name: '双倍收益卡', description: '下一局 XP ×2。全力以赴的时刻。', icon: '💥', price: 200, category: 'consumable', rarity: 'uncommon' },
  { id: 'buff_eff25', name: '效率药剂', description: '下一局效率 +25%。苦但有效。', icon: '🧪', price: 150, category: 'consumable', rarity: 'common' },
  { id: 'buff_crit', name: '暴击券', description: '下一局 30% 概率 XP ×3。赌一把运气。', icon: '🎲', price: 250, category: 'consumable', rarity: 'rare' },
  { id: 'buff_deep45', name: '专注加速', description: '45 分钟及以上的局 XP +15%。为深度局准备。', icon: '⚡', price: 100, category: 'consumable', rarity: 'common' },
]

// ===== v1.0 消耗品效果定义 =====

export interface ConsumableEffect {
  kind: 'double' | 'efficiency' | 'crit' | 'deepBonus'
  /** XP 倍率（deepBonus 仅对 ≥45min 局生效） */
  multiplier: number
  /** 概率（仅 crit） */
  chance?: number
  /** 触发条件描述 */
  detail: string
}

export const CONSUMABLE_EFFECTS: Record<string, ConsumableEffect> = {
  buff_double: { kind: 'double', multiplier: 2, detail: 'XP ×2' },
  buff_eff25: { kind: 'efficiency', multiplier: 1.25, detail: '效率 +25%' },
  buff_crit: { kind: 'crit', multiplier: 3, chance: 0.3, detail: '30% 概率 XP ×3' },
  buff_deep45: { kind: 'deepBonus', multiplier: 1.15, detail: '45min+ 局 XP +15%' },
}

/** 消耗品道具 id 列表（UI 展示顺序） */
export const CONSUMABLE_ITEM_IDS = ['buff_double', 'buff_eff25', 'buff_crit', 'buff_deep45']

/** 分类元信息（供 UI 使用） */
export const CATEGORY_META: Record<ShopCategory, { label: string; icon: string }> = {
  background: { label: '背景', icon: '🌌' },
  consumable: { label: '消耗品', icon: '🧪' },
  outfit: { label: '服饰', icon: '👗' },
}

/** 稀有度元信息（供 UI 使用） */
export const RARITY_META: Record<ShopRarity, { label: string; color: string; border: string }> = {
  common: { label: '普通', color: 'text-gray-300', border: 'border-gray-500' },
  uncommon: { label: '不凡', color: 'text-green-300', border: 'border-green-500' },
  rare: { label: '稀有', color: 'text-blue-300', border: 'border-blue-500' },
  epic: { label: '史诗', color: 'text-purple-300', border: 'border-purple-500' },
  legendary: { label: '传奇', color: 'text-amber-300', border: 'border-amber-400' },
}

/** 限时类型元信息 */
export const LIMITED_META: Record<NonNullable<LimitedType>, { label: string; color: string }> = {
  personal: { label: '专属', color: 'text-pink-300' },
}

/** 按分类分组（兼容旧 API） */
export const ITEMS_BY_CATEGORY = SHOP_ITEMS.reduce(
  (acc, item) => {
    ;(acc[item.category] ??= []).push(item)
    return acc
  },
  {} as Record<ShopCategory, ShopItem[]>,
)

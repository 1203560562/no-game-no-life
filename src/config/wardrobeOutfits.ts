/**
 * 日和·衣橱服饰注册表（单一数据源）
 *
 * 新增服饰只需两步：
 *   1. 贴图 png 放入 public/live2d/hiyori-wardrobe/Hiyori.2048/（须与 texture_01.png 同尺寸同 UV 布局）
 *   2. 在下方 WARDROBE_OUTFITS 加一行
 * 自动生效：换装切换器 / 商直售卖卡 / 宝箱奖池（chestRarity）/ 服饰图鉴与收集成就 / 主题套装引用
 *
 * 派生消费方：
 * - live2dModels.ts  ← WARDROBE_OUTFIT_DEFS（OutfitDef[]，穿着/试穿/热替换）
 * - shopItems.ts     ← WARDROBE_OUTFIT_ITEMS（ShopItem[]，商店/图鉴/宝箱池）
 */

import type { OutfitDef } from './live2dModels'
import type { ShopItem, ShopRarity } from './shopItems'

/** 贴图所在目录（model3.json 的 textureIndex 1） */
const TEX_DIR = '/live2d/hiyori-wardrobe/Hiyori.2048/'

export interface WardrobeOutfit {
  /** OutfitDef.id（穿着选择持久化用，一经发布不可更改） */
  id: string
  label: string
  icon: string
  /** 贴图文件名（放 TEX_DIR 下，2048×2048 同 UV 布局） */
  file: string
  /** 商店道具 id（unlockedItems 持久化用，一经发布不可更改）；缺省 = 免费默认款，不入商店/图鉴/宝池 */
  itemId?: string
  price?: number
  rarity?: ShopRarity
  /** 宝箱掉落档位；缺省不入宝箱池 */
  chestRarity?: 'blue' | 'purple' | 'gold' | 'red'
  requiredLevel?: number
  /** 商店卡片文案；缺省自动生成 */
  description?: string
}

/** 全部衣橱服饰（第一套为默认免费款） */
export const WARDROBE_OUTFITS: WardrobeOutfit[] = [
  { id: 'blueSailor', label: '蓝水手', icon: '👚', file: 'outfit_1_blue_sailor.png' },
  { id: 'pinkSailor', label: '粉水手', icon: '🌸', file: 'outfit_5_pink_sailor.png', itemId: 'outfit_pink_sailor', price: 48000, rarity: 'legendary', chestRarity: 'gold', requiredLevel: 8, description: '日和的粉色水手服。樱花色的日常。' },
  { id: 'pinkSailorFull', label: '粉水手-全', icon: '🌷', file: 'outfit_8_pink_sailor_full.png', itemId: 'outfit_pink_sailor_full', price: 80000, rarity: 'legendary', chestRarity: 'red', requiredLevel: 9, description: '粉色水手服完全体，含裤袜的完整搭配。' },
  { id: 'pinkSailorOverknee', label: '粉水手-过膝', icon: '🌺', file: 'texture_01.pink_overknee.png', itemId: 'outfit_pink_sailor_overknee', price: 54000, rarity: 'legendary', chestRarity: 'gold', requiredLevel: 9, description: '粉色水手服·过膝袜搭配，介于粉与全之间的甜度。' },
  { id: 'blackSailor', label: '黑水手', icon: '🖤', file: 'outfit_6_black_sailor.png', itemId: 'outfit_black_sailor', price: 80000, rarity: 'legendary', chestRarity: 'red', requiredLevel: 24, description: '传说中的黑色水手服。商店直售的神话。' },
  { id: 'blackSailorFull', label: '黑水手-全', icon: '🧦', file: 'outfit_7_black_sailor_full.png', itemId: 'outfit_black_sailor_full', price: 96000, rarity: 'legendary', chestRarity: 'red', requiredLevel: 26, description: '黑色水手服完全体，含裤袜的完整形态。神话宝箱的另一种偏爱。' },
  { id: 'blackSailorOverknee', label: '黑水手-过膝', icon: '🖤', file: 'texture_01.black_overknee.png', itemId: 'outfit_black_sailor_overknee', price: 88000, rarity: 'legendary', chestRarity: 'red', requiredLevel: 25, description: '黑色水手服·过膝袜搭配，冷艳的收束感。' },
  { id: 'outfit2', label: 'test', icon: '🧣', file: 'outfit_2_test.png', itemId: 'outfit_2', price: 1400, rarity: 'rare', requiredLevel: 10, description: '衣橱第 2 套：测试用换装贴图。' },
  { id: 'outfit3', label: '白水手白', icon: '🥼', file: 'outfit_3_white_sailor_white.png', itemId: 'outfit_3', price: 2800, rarity: 'epic', requiredLevel: 14, description: '白色水手服·白裙版本。清爽的纯白搭配。' },
  { id: 'outfit4', label: '白水手黑', icon: '🧥', file: 'outfit_4_white_sailor_black.png', itemId: 'outfit_4', price: 3200, rarity: 'epic', requiredLevel: 16, description: '白色水手服·黑裙版本。黑白撞色的经典。' },
]

/** 派生：OutfitDef[]（live2dModels 注册用，顺序即切换器展示顺序） */
export const WARDROBE_OUTFIT_DEFS: OutfitDef[] = WARDROBE_OUTFITS.map((o) => ({
  id: o.id,
  label: o.label,
  icon: o.icon,
  texture: TEX_DIR + o.file,
  textureIndex: 1,
  ...(o.itemId ? { unlockItem: o.itemId } : {}),
}))

/** 派生：可购买的服饰商品（shopItems 注册用；免费款自动排除） */
export const WARDROBE_OUTFIT_ITEMS: ShopItem[] = WARDROBE_OUTFITS
  .filter((o): o is WardrobeOutfit & { itemId: string; price: number } =>
    Boolean(o.itemId && o.price !== undefined))
  .map((o) => ({
    id: o.itemId,
    name: o.label,
    description: o.description ?? `日和·衣橱换装贴图：${o.label}。`,
    icon: o.icon,
    price: o.price,
    category: 'outfit' as const,
    rarity: o.rarity ?? 'epic',
    ...(o.chestRarity ? { chestRarity: o.chestRarity } : {}),
    ...(o.requiredLevel !== undefined ? { requiredLevel: o.requiredLevel } : {}),
  }))

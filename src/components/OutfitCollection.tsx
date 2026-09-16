/**
 * 服饰图鉴：收集进度 + 全部服饰卡片（已解锁/未解锁）+ 收集奖励说明
 * 集齐全部服饰解锁成就「衣橱的主人」（含 3000 金币 + 称号）。
 */

import { useGameStore } from '../store/useGameStore'
import { OUTFIT_ITEMS, outfitCollectionRatio } from '../config/outfitThemes'
import { CHEST_RARITY_META, chestRarityOf } from '../config/chestConfig'
import { LIVE2D_MODELS, getOutfitChoice } from '../config/live2dModels'

/** 道具 id → 对应的服饰名（用于显示 outfitId） */
const outfitLabelOf = (itemId: string): string => {
  for (const m of LIVE2D_MODELS) {
    const o = (m.outfits ?? []).find((x) => x.unlockItem === itemId)
    if (o) return `${m.label} · ${o.label}`
  }
  return ''
}

export const OutfitCollection: React.FC = () => {
  const unlockedItems = useGameStore((s) => s.state.player.unlockedItems)
  const owned = new Set(unlockedItems)
  const ownedCount = OUTFIT_ITEMS.filter((i) => owned.has(i.id)).length
  const total = OUTFIT_ITEMS.length
  const ratio = outfitCollectionRatio(unlockedItems)
  // 当前穿着的服饰（图鉴中标记）
  const wardrobe = LIVE2D_MODELS.find((m) => m.id === 'hiyori-wardrobe')
  const wornOutfitId = wardrobe ? getOutfitChoice(wardrobe.id) : ''

  return (
    <div className="rpg-panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs text-gray-300">👗 服饰图鉴</div>
        <div className="text-[9px] text-gray-500">
          {ownedCount}/{total} · 集齐发称号「衣橱的主人」+3000 金币
        </div>
      </div>

      {/* 收集进度条 */}
      <div className="mb-3 h-2 w-full overflow-hidden rounded-full border border-rpg-border bg-rpg-bg">
        <div
          className="h-full bg-gradient-to-r from-rpg-gold/60 to-rpg-gold transition-all duration-500"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {OUTFIT_ITEMS.map((item) => {
          const isOwned = owned.has(item.id)
          const meta = CHEST_RARITY_META[chestRarityOf(item)]
          const isWorn = isOwned && wardrobe?.outfits?.some(
            (o) => o.unlockItem === item.id && o.id === wornOutfitId,
          )
          return (
            <div
              key={item.id}
              className={`relative rounded-lg border-2 p-2 transition-all ${
                isOwned ? `${meta.border} bg-rpg-panelLight` : 'border-rpg-border/50 bg-rpg-panel/50'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`text-lg ${isOwned ? '' : 'grayscale opacity-50'}`}>
                  {isOwned ? item.icon : '🔒'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-[10px] font-bold ${isOwned ? 'text-white' : 'text-gray-600'}`}>
                    {item.name}
                  </div>
                  <div className={`truncate text-[8px] ${isOwned ? meta.text : 'text-gray-700'}`}>
                    {meta.label}
                    {item.chestExclusive ? ' · 宝箱专属' : ''}
                  </div>
                </div>
              </div>
              {/* 获取方式 */}
              <div className="mt-1 truncate text-[8px] text-gray-500">
                {isOwned
                  ? isWorn
                    ? '✓ 穿着中'
                    : `已解锁 · ${outfitLabelOf(item.id)}`
                  : item.chestExclusive
                    ? '宝箱开出'
                    : `商店 💰${item.price}${item.requiredLevel ? ` · Lv.${item.requiredLevel}` : ''}`}
              </div>
              {/* 穿着中角标 */}
              {isWorn && (
                <span className="absolute right-1 top-1 rounded bg-rpg-gold/20 px-1 text-[7px] font-bold text-rpg-gold">
                  穿着中
                </span>
              )}
            </div>
          )
        })}
      </div>

      {ownedCount === total && (
        <div className="mt-3 rounded-lg border-2 border-rpg-gold bg-rpg-gold/10 p-2 text-center">
          <span className="text-[10px] font-bold text-rpg-gold">
            👑 衣橱的主人 — 已集齐全部 {total} 件服饰
          </span>
        </div>
      )}
    </div>
  )
}

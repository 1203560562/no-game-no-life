/**
 * 服饰切换器：当前形象的换装选择（热替换贴图，全局生效，按形象分别记忆）
 * 仅当选中形象配置了 outfits 时渲染；背包页/今日冒险/形象展示模态/细节查看器共用。
 * 带 unlockItem 的服饰需商店购买或宝箱开出（player.unlockedItems）后解锁。
 */

import { useSyncExternalStore } from 'react'
import {
  LIVE2D_MODELS,
  getModelChoice,
  subscribeModelChoice,
  getOutfitChoice,
  setOutfitChoice,
  subscribeOutfitChoice,
  type OutfitDef,
} from '../config/live2dModels'
import { useGameStore } from '../store/useGameStore'

/** 服饰是否已解锁：无 unlockItem 免费；有则需拥有对应商店道具 */
const isOutfitUnlocked = (o: OutfitDef, unlockedItems: string[]): boolean =>
  !o.unlockItem || unlockedItems.includes(o.unlockItem)

/** 换装并记录（服饰成就统计） */
const changeOutfit = (modelId: string, outfitId: string) => {
  setOutfitChoice(modelId, outfitId)
  useGameStore.getState().recordOutfitChange()
}

export const OutfitSwitcher: React.FC<{ modelIdOverride?: string }> = ({ modelIdOverride }) => {
  const chosenId = useSyncExternalStore(subscribeModelChoice, getModelChoice)
  const modelId = modelIdOverride ?? chosenId
  const def = LIVE2D_MODELS.find((m) => m.id === modelId)
  const outfits = def?.outfits
  const unlockedItems = useGameStore((s) => s.state.player.unlockedItems)

  // 订阅服饰变化（切换器高亮同步；无服饰形象返回空串）
  const outfitId = useSyncExternalStore(
    subscribeOutfitChoice,
    () => getOutfitChoice(modelId),
    () => getOutfitChoice(modelId),
  )

  if (!outfits?.length) return null

  const unlockedCount = outfits.filter((o) => isOutfitUnlocked(o, unlockedItems)).length

  return (
    <div className="w-full">
      <div className="mb-1 text-center text-[9px] text-gray-500">
        服饰（{unlockedCount}/{outfits.length} · 即换即生效）
      </div>
      <div className="grid grid-cols-6 gap-1">
        {outfits.map((o) => {
          const unlocked = isOutfitUnlocked(o, unlockedItems)
          return (
            <button
              key={o.id}
              onClick={() => unlocked && changeOutfit(modelId, o.id)}
              disabled={!unlocked}
              title={unlocked ? o.label : '🔒 商店购买或开宝箱解锁'}
              className={`truncate rounded border px-1 py-0.5 text-[9px] transition-all ${
                !unlocked
                  ? 'cursor-not-allowed border-rpg-border/50 bg-rpg-panel/50 text-gray-600'
                  : outfitId === o.id
                    ? 'border-rpg-gold bg-rpg-gold/20 text-rpg-gold'
                    : 'border-rpg-border bg-rpg-panel text-gray-400 hover:text-white'
              }`}
            >
              {unlocked ? `${o.icon ? `${o.icon} ` : ''}${o.label}` : `🔒 ${o.label}`}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * 形象切换器：选择当前 Live2D 模型
 * （localStorage 持久化，全局生效；限定款需开宝箱或商店购买解锁）
 * 背包页与形象展示模态共用。
 */

import { useSyncExternalStore } from 'react'
import { CHEST_RARITY_META } from '../config/chestConfig'
import {
  LIVE2D_MODELS,
  getModelChoice,
  setModelChoice,
  subscribeModelChoice,
  getUnlockedModels,
  subscribeModelUnlocks,
  isModelUnlocked,
} from '../config/live2dModels'

export const ModelSwitcher: React.FC = () => {
  const modelId = useSyncExternalStore(subscribeModelChoice, getModelChoice)
  const unlockedModels = useSyncExternalStore(subscribeModelUnlocks, getUnlockedModels, getUnlockedModels)
  return (
    <div className="w-full">
      <div className="mb-1 text-center text-[9px] text-gray-500">形象（{LIVE2D_MODELS.length} 款）</div>
      <div className="grid grid-cols-2 gap-1">
        {LIVE2D_MODELS.map((m) => {
          const locked = !isModelUnlocked(m.id)
          return (
            <button
              key={m.id}
              onClick={() => setModelChoice(m.id)}
              disabled={locked}
              title={locked ? `🔒 ${CHEST_RARITY_META[m.chestRarity!].label}档 · 开宝箱或商店购买解锁` : `Cubism ${m.cubism}`}
              className={`truncate rounded border px-1.5 py-0.5 text-[9px] transition-all ${
                locked
                  ? 'cursor-not-allowed border-rpg-border/50 bg-rpg-panel/50 text-gray-600'
                  : modelId === m.id
                    ? 'border-rpg-gold bg-rpg-gold/20 text-rpg-gold'
                    : 'border-rpg-border bg-rpg-panel text-gray-400 hover:text-white'
              }`}
            >
              {locked ? `🔒 ${m.label}` : `${m.icon} ${m.label}`}
            </button>
          )
        })}
      </div>
      {unlockedModels.length < LIVE2D_MODELS.filter((m) => m.chestRarity).length && (
        <div className="mt-1 text-center text-[8px] text-gray-600">🔒 款需开宝箱或商店购买解锁</div>
      )}
    </div>
  )
}

/**
 * 主题套装展示：服饰 × 背景搭配触发 XP 加成
 * 实时显示当前命中的套装与激活状态，结算时自动生效（engine 见 outfitThemes.ts）。
 */

import { useSyncExternalStore } from 'react'
import { useGameStore } from '../store/useGameStore'
import { THEMES } from '../config/outfitThemes'
import {
  getBackgroundChoice,
  subscribeBackgroundChoice,
} from '../config/backgrounds'
import {
  getModelChoice,
  subscribeModelChoice,
  getOutfitChoice,
  subscribeOutfitChoice,
} from '../config/live2dModels'

export const ThemePanel: React.FC = () => {
  const unlockedItems = useGameStore((s) => s.state.player.unlockedItems)
  const modelId = useSyncExternalStore(subscribeModelChoice, getModelChoice)
  const bgChoice = useSyncExternalStore(subscribeBackgroundChoice, getBackgroundChoice)
  // 订阅服饰选择变化
  useSyncExternalStore(
    subscribeOutfitChoice,
    () => getOutfitChoice(modelId),
    () => getOutfitChoice(modelId),
  )
  const wornOutfitId = getOutfitChoice(modelId)
  const owned = new Set(unlockedItems)

  return (
    <div className="rpg-panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs text-gray-300">✨ 主题套装</div>
        <div className="text-[9px] text-gray-500">服饰 × 背景搭配 · 一局 XP 加成</div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {THEMES.map((t) => {
          const outfitOwned = owned.has(t.outfitItemId)
          const bgOwned = owned.has(t.bgItemId)
          const wearing = wornOutfitId === t.outfitId
          const bgOn = bgChoice === t.bgItemId
          const active = outfitOwned && bgOwned && wearing && bgOn
          const ready = outfitOwned && bgOwned && !active
          return (
            <div
              key={t.id}
              className={`rounded-lg border-2 p-2 transition-all ${
                active
                  ? 'border-rpg-gold bg-rpg-gold/10'
                  : ready
                    ? 'border-rpg-xp/50 bg-rpg-panelLight'
                    : 'border-rpg-border/50 bg-rpg-panel/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-[11px] font-bold ${active ? 'text-rpg-gold' : ready ? 'text-white' : 'text-gray-500'}`}>
                    {active ? '✨ ' : ''}{t.label}
                  </div>
                  <div className="mt-0.5 truncate text-[9px] text-gray-500">{t.hint}</div>
                </div>
                {active && (
                  <span className="flex-shrink-0 rounded bg-rpg-gold/20 px-1.5 py-0.5 text-[8px] font-bold text-rpg-gold">
                    生效中
                  </span>
                )}
              </div>
              {/* 条件状态 */}
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[8px]">
                <span className={outfitOwned ? 'text-gray-400' : 'text-gray-700'}>
                  {outfitOwned ? (wearing ? '👕 服饰穿着中' : '👕 服饰已解锁') : '🔒 服饰未解锁'}
                </span>
                <span className={bgOwned ? 'text-gray-400' : 'text-gray-700'}>
                  {bgOwned ? (bgOn ? '🌌 背景启用中' : '🌌 背景已拥有') : '🔒 背景未拥有'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

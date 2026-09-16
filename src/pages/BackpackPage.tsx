import { useState, useMemo, useSyncExternalStore } from 'react'
import { useGameStore } from '../store/useGameStore'
import { SHOP_ITEMS, CONSUMABLE_EFFECTS, type ShopItem } from '../config/shopItems'
import { CHEST_RARITY_META, chestRarityOf } from '../config/chestConfig'
import { getBackgroundChoice, setBackgroundChoice, subscribeBackgroundChoice } from '../config/backgrounds'
import { Character, useStageSize } from '../components/Character'
import { MotionBar } from '../components/MotionBar'
import { StageAdjust } from '../components/StageAdjust'
import { BackgroundSwatch } from '../components/BackgroundLayer'
import { ModelSwitcher } from '../components/ModelSwitcher'
import { OutfitSwitcher } from '../components/OutfitSwitcher'
import { OutfitCollection } from '../components/OutfitCollection'
import { ThemePanel } from '../components/ThemePanel'
import { ZoomHint, MotionHint } from '../components/Live2DShowcase'
import { PageHeader } from '../components/PageHeader'

/** 装备的宝箱稀有度样式（白/蓝/紫/金/红 五档） */
const chestMetaOf = (item: ShopItem) => CHEST_RARITY_META[chestRarityOf(item)]

export const BackpackPage: React.FC = () => {
  const player = useGameStore((s) => s.state.player)
  const [msg, setMsg] = useState<string | null>(null)

  const showMsg = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(null), 2500)
  }

  // 已拥有的背景装饰（点击启用）
  const ownedBackgrounds = useMemo(
    () =>
      SHOP_ITEMS.filter(
        (i) => i.category === 'background' && player.unlockedItems.includes(i.id),
      ),
    [player.unlockedItems],
  )

  // 当前启用的背景（localStorage 持久化，角色画框实时渲染）
  const bgChoice = useSyncExternalStore(subscribeBackgroundChoice, getBackgroundChoice)

  // 角色大舞台尺寸（与今日冒险一致，随视口自适应）
  const stageSize = useStageSize()

  // v1.0 消耗品库存（开局时在首页选用）
  const consumables = useMemo(() => {
    const inv = player.inventory ?? {}
    return SHOP_ITEMS.filter(
      (i) => i.category === 'consumable' && (inv[i.id] ?? 0) > 0,
    ).map((i) => ({ ...i, count: inv[i.id] }))
  }, [player.inventory])

  return (
    <div className="space-y-4">
      <PageHeader
        icon="🎒"
        title="背包"
        right={<span className="text-[10px] text-gray-400">背景 {ownedBackgrounds.length}</span>}
      />

      {/* 角色预览 */}
      <div className="rpg-panel flex flex-col items-center gap-2 p-4">
        <div className="group relative">
          <StageAdjust storageKey="levelup.backpack.stage">
            <Character level={player.level} size={stageSize} quality={3} />
          </StageAdjust>
          <ZoomHint />
          <MotionHint />
        </div>
        {/* 动作切换（全部动作点击直接播放） */}
        <MotionBar />
        {/* 服饰切换（换装，优先展示） + 形象切换（Live2D 模型） */}
        <OutfitSwitcher />
        <ModelSwitcher />
        <div className="text-center">
          <div className="text-sm font-bold text-white">{player.name}</div>
          <div className="text-[10px] text-gray-400">Lv.{player.level}</div>
        </div>
      </div>

      {/* 服饰图鉴（收集进度 + 全部服饰） */}
      <OutfitCollection />

      {/* 主题套装（服饰 × 背景搭配加成） */}
      <ThemePanel />

      {/* 背景装饰（点击启用，实时渲染到角色画框） */}
      {ownedBackgrounds.length > 0 && (
        <div className="rpg-panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs text-gray-300">🌌 背景装饰</div>
            <div className="text-[9px] text-gray-500">点击切换角色画框背景</div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/* 默认（无背景） */}
            <button
              onClick={() => { setBackgroundChoice(null); showMsg('已恢复默认背景') }}
              className={`rounded-lg border-2 p-1.5 text-left transition-all ${
                bgChoice === null
                  ? 'border-rpg-gold bg-rpg-gold/15'
                  : 'border-rpg-border bg-rpg-panelLight hover:border-rpg-gold/60'
              }`}
            >
              <div className="h-12 w-full rounded border border-rpg-border bg-gradient-to-b from-rpg-panel to-rpg-bg" />
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-300">默认背景</span>
                {bgChoice === null && <span className="text-[9px] text-rpg-gold">✓ 使用中</span>}
              </div>
            </button>
            {ownedBackgrounds.map((item) => {
              const rarity = chestMetaOf(item)
              const inUse = bgChoice === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (inUse) {
                      setBackgroundChoice(null)
                      showMsg('已恢复默认背景')
                    } else {
                      setBackgroundChoice(item.id)
                      showMsg(`背景已切换：${item.name}`)
                    }
                  }}
                  className={`rounded-lg border-2 p-1.5 text-left transition-all ${
                    inUse
                      ? 'border-rpg-gold bg-rpg-gold/15'
                      : `bg-rpg-panelLight hover:border-rpg-gold/60 ${rarity.border}`
                  }`}
                >
                  <div className="h-12 w-full overflow-hidden rounded border border-rpg-border">
                    <BackgroundSwatch bgId={item.id} />
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-1">
                    <span className="truncate text-[10px] font-bold text-white">
                      {item.icon} {item.name}
                    </span>
                    {inUse ? (
                      <span className="flex-shrink-0 text-[9px] text-rpg-gold">✓ 使用中</span>
                    ) : (
                      <span className={`flex-shrink-0 text-[9px] ${rarity.text}`}>
                        {rarity.label}{item.chestExclusive ? ' · 宝箱专属' : ''}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* v1.0 消耗品 */}
      {consumables.length > 0 && (
        <div className="rpg-panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs text-gray-300">🧪 消耗品</div>
            <div className="text-[9px] text-gray-500">在首页「开始一局」配置时选用</div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {consumables.map((item) => {
              const rarity = chestMetaOf(item)
              const eff = CONSUMABLE_EFFECTS[item.id]
              return (
                <div
                  key={item.id}
                  className={`rounded-lg border-2 p-2 ${rarity.border} bg-rpg-panelLight`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg">{item.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[10px] font-bold text-white">
                        {item.name} <span className="text-rpg-xp">×{item.count}</span>
                      </div>
                      <div className={`text-[9px] ${rarity.text}`}>
                        {eff?.detail ?? item.description}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 空状态 */}
      {ownedBackgrounds.length === 0 && consumables.length === 0 && (
        <div className="rpg-panel p-8 text-center">
          <div className="mb-2 text-4xl">🎒</div>
          <div className="text-sm text-gray-300">背包是空的</div>
          <div className="mt-1 text-[10px] text-gray-500">
            去商店购买背景或消耗品后会出现在这里
          </div>
        </div>
      )}

      {/* 消息提示 */}
      {msg && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg border-2 border-rpg-gold bg-rpg-panel px-4 py-2 text-xs text-rpg-gold animate-slide-up">
          {msg}
        </div>
      )}
    </div>
  )
}

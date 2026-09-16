import { useState, useMemo, useSyncExternalStore } from 'react'
import { useGameStore } from '../store/useGameStore'
import {
  SHOP_ITEMS,
  CATEGORY_META,
  RARITY_META,
  LIMITED_META,
  type ShopItem,
  type ShopCategory,
  type LimitedType,
} from '../config/shopItems'
import { CHEST_RARITY_META, CHEST_RARITY_ORDER, CHEST_PITY_LIMIT, SHOP_CHEST_PRICE } from '../config/chestConfig'
import {
  LIVE2D_MODELS,
  getUnlockedModels,
  subscribeModelUnlocks,
  isModelUnlocked,
  setModelChoice,
  setOutfitChoice,
} from '../config/live2dModels'
import { Character, useStageSize } from '../components/Character'
import { PageHeader } from '../components/PageHeader'
import { MotionBar } from '../components/MotionBar'
import { StageAdjust } from '../components/StageAdjust'
import { ZoomHint, MotionHint } from '../components/Live2DShowcase'
import { BackgroundSwatch } from '../components/BackgroundLayer'

type Filter = ShopCategory | 'limited' | 'models' | 'all'

export const ShopPage: React.FC = () => {
  const player = useGameStore((s) => s.state.player)
  const spendCoins = useGameStore((s) => s.spendCoins)
  const buyConsumable = useGameStore((s) => s.buyConsumable)
  const buyModel = useGameStore((s) => s.buyModel)
  const buyShopChest = useGameStore((s) => s.buyShopChest)
  const pity = useGameStore((s) => s.state.player.chestPity ?? 0)
  useSyncExternalStore(subscribeModelUnlocks, getUnlockedModels, getUnlockedModels)
  const [filter, setFilter] = useState<Filter>('all')
  const [msg, setMsg] = useState<string | null>(null)
  // 角色大舞台尺寸（与今日冒险一致，随视口自适应）
  const stageSize = useStageSize()

  const owned = new Set(player.unlockedItems)
  const inventory = player.inventory ?? {}

  const showMsg = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(null), 2500)
  }

  const handleBuy = (item: ShopItem) => {
    if (item.requiredLevel && player.level < item.requiredLevel) {
      showMsg(`需要 Lv.${item.requiredLevel} 才能购买。`)
      return
    }
    // 消耗品：可重复购买，加入库存
    if (item.category === 'consumable') {
      const ok = buyConsumable(item.id)
      if (ok) {
        showMsg(`购买成功！${item.name} ×${(inventory[item.id] ?? 0) + 1}（开局时使用）`)
      } else {
        showMsg('金币不足。')
      }
      return
    }
    if (owned.has(item.id)) {
      showMsg('已经拥有该物品。')
      return
    }
    const ok = spendCoins(item.price, item.id)
    if (ok) {
      showMsg(`购买成功！${item.name} 已加入背包。`)
    } else {
      showMsg('金币不足。')
    }
  }

  const handleBuyModel = (modelId: string) => {
    const def = LIVE2D_MODELS.find((m) => m.id === modelId)
    if (!def) return
    if (isModelUnlocked(modelId)) {
      showMsg('已经拥有该形象。')
      return
    }
    const ok = buyModel(modelId)
    showMsg(ok ? `购买成功！${def.label} 已解锁，可在背包页切换。` : '金币不足。')
  }

  const handleBuyChest = () => {
    if (player.coins < SHOP_CHEST_PRICE) {
      showMsg('金币不足。')
      return
    }
    const ok = buyShopChest()
    if (!ok) showMsg('金币不足。')
  }

  // 筛选 + 排序（稀有度降序）；宝箱专属精品不在商店售卖
  const sellable = useMemo(() => SHOP_ITEMS.filter((i) => !i.chestExclusive), [])
  const visible = useMemo(() => {
    let arr: ShopItem[]
    if (filter === 'all') arr = sellable
    else if (filter === 'limited') arr = sellable.filter((i) => i.limited)
    else if (filter === 'models') arr = []
    else arr = sellable.filter((i) => i.category === filter)
    const order = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 } as const
    return [...arr].sort((a, b) => order[b.rarity] - order[a.rarity] || a.price - b.price)
  }, [filter, sellable])

  // 可售卖的 Live2D 形象（稀有度降序 + 价格升序）
  const sellableModels = useMemo(
    () =>
      LIVE2D_MODELS.filter((m) => m.shopPrice).sort(
        (a, b) =>
          CHEST_RARITY_ORDER.indexOf(b.chestRarity!) - CHEST_RARITY_ORDER.indexOf(a.chestRarity!) ||
          a.shopPrice! - b.shopPrice!,
      ),
    [],
  )

  // 各分类计数
  const catCounts = useMemo(() => {
    const counts: Partial<Record<Filter, number>> = {}
    for (const i of sellable) {
      counts[i.category] = (counts[i.category] ?? 0) + 1
    }
    counts['limited'] = sellable.filter((i) => i.limited).length
    counts['all'] = sellable.length
    return counts
  }, [sellable])

  const ownedCount = useMemo(() => {
    let n = 0
    for (const i of sellable) {
      if (owned.has(i.id)) n++
    }
    return n
  }, [player.unlockedItems, sellable])

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 商店宝箱（最上层显眼位置） */}
      <div className="rpg-panel relative overflow-hidden border-2 border-rpg-gold p-4 shadow-gold">
        {/* 底部光效装饰 */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-rpg-gold/10 via-transparent to-rpg-gold/10" />
        <div className="relative flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="animate-bounce text-4xl">🎁</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="pixel-text text-xs text-rpg-gold">神秘宝箱</span>
                <span className="rounded border border-rpg-gold/50 bg-rpg-gold/10 px-1.5 text-[8px] font-bold text-rpg-gold">
                  35% 金币 / 65% 背景或形象或服饰
                </span>
              </div>
              <div className="mt-0.5 text-[10px] text-gray-400">
                与升级宝箱同池，共享保底 · 当前距保底（必出史诗）还有{' '}
                <span className="font-bold text-rpg-gold">{Math.max(0, CHEST_PITY_LIMIT - pity)}</span> 箱
              </div>
            </div>
          </div>
          <button
            onClick={handleBuyChest}
            disabled={player.coins < SHOP_CHEST_PRICE}
            className={`w-full rounded-lg border-2 py-2 text-xs font-bold transition-all sm:w-44 ${
              player.coins >= SHOP_CHEST_PRICE
                ? 'border-rpg-gold bg-gradient-to-r from-rpg-gold/30 to-rpg-gold/10 text-rpg-gold hover:from-rpg-gold hover:text-rpg-bg active:scale-95'
                : 'border-gray-600 bg-rpg-panel text-gray-500'
            }`}
          >
            {player.coins >= SHOP_CHEST_PRICE ? `开启一箱 · 💰 ${SHOP_CHEST_PRICE}` : '金币不足'}
          </button>
        </div>
      </div>

      {/* 金币余额 + 角色预览 */}
      <div className="rpg-panel p-5">
        <PageHeader
          icon="🛒"
          title="冒险商店"
          subtitle="金币不能兑换现实消费。只能购买神秘宝箱、背景装饰、Live2D 形象、服饰换装与局增益消耗品。"
          right={
            <>
              <span className="text-[10px] text-gray-400">{ownedCount}/{sellable.length}</span>
              <span className="flex items-center gap-1 text-rpg-gold">💰 {player.coins}</span>
            </>
          }
        />

        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl bg-gradient-to-b from-rpg-panelLight/50 to-transparent py-4">
          <div className="group relative">
            <StageAdjust storageKey="levelup.shop.stage">
              <Character level={player.level} size={stageSize} quality={3} />
            </StageAdjust>
            <ZoomHint />
            <MotionHint />
          </div>
          {/* 动作切换（全部动作点击直接播放） */}
          <div className="w-full max-w-md">
            <MotionBar />
          </div>
        </div>
      </div>

      {/* 分类筛选 */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip label="全部" count={catCounts['all']} active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterChip label="限时" count={catCounts['limited']} active={filter === 'limited'} onClick={() => setFilter('limited')} accent />
        <FilterChip label="🧍 形象" count={sellableModels.length} active={filter === 'models'} onClick={() => setFilter('models')} accent />
        {(Object.keys(CATEGORY_META) as ShopCategory[]).map((c) => (
          <FilterChip
            key={c}
            label={`${CATEGORY_META[c].icon} ${CATEGORY_META[c].label}`}
            count={catCounts[c]}
            active={filter === c}
            onClick={() => setFilter(c)}
          />
        ))}
      </div>

      {/* Live2D 形象商城 */}
      {filter === 'models' && (
        <div className="space-y-2">
          <p className="text-[10px] text-gray-500">
            形象也可通过升级宝箱开出（同稀有度池，概率低于背景）；购买后在背包页切换。
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {sellableModels.map((m) => {
              const rarity = CHEST_RARITY_META[m.chestRarity!]
              const unlocked = isModelUnlocked(m.id)
              const canAfford = player.coins >= m.shopPrice!
              return (
                <div
                  key={m.id}
                  className="rpg-panel border-l-4 p-3 text-center transition-all"
                  style={{ borderLeftColor: rarity.hex }}
                >
                  <div className={`text-3xl ${unlocked ? '' : 'opacity-50 grayscale'}`}>{m.icon}</div>
                  <div className="mt-1 truncate text-xs font-bold text-white">{m.label}</div>
                  <div className={`text-[8px] font-bold ${rarity.text}`}>
                    {rarity.label} · Cubism {m.cubism}
                  </div>
                  <div className="mt-2 text-xs font-bold text-rpg-gold">💰 {m.shopPrice}</div>
                  <div className="mt-2">
                    {unlocked ? (
                      <div className="rounded-lg border-2 border-rpg-xp bg-rpg-xp/10 py-1.5 text-center text-[10px] text-rpg-xp">
                        ✓ 已拥有
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            // 试穿：临时切换到该形象（force 绕过解锁校验，刷新自动回退默认；不解锁不扣费）
                            setModelChoice(m.id, { force: true })
                            showMsg(`试穿中：${m.label}（角色舞台实时预览 · 购买后可长期使用）`)
                          }}
                          className="mb-1.5 w-full rounded-lg border-2 border-rpg-border bg-rpg-panel py-1 text-[10px] text-gray-300 transition-all hover:border-rpg-gold hover:text-rpg-gold active:scale-95"
                        >
                          🧍 试穿预览
                        </button>
                        <button
                          onClick={() => handleBuyModel(m.id)}
                          disabled={!canAfford}
                          className={`w-full rounded-lg border-2 py-1.5 text-[10px] transition-all ${
                            canAfford
                              ? 'border-rpg-gold bg-rpg-panelLight text-rpg-gold hover:bg-rpg-gold hover:text-rpg-bg active:scale-95'
                              : 'border-gray-600 bg-rpg-panel text-gray-500'
                          }`}
                        >
                          {canAfford ? '购买' : '金币不足'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 商品列表（背景 / 消耗品） */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visible.map((item) => {
          const isConsumable = item.category === 'consumable'
          // 服饰：图标展示（无背景预览图），一次性购买
          const isOutfit = item.category === 'outfit'
          const heldCount = inventory[item.id] ?? 0
          const isOwned = !isConsumable && owned.has(item.id)
          const levelLocked = item.requiredLevel && player.level < item.requiredLevel
          const canAfford = player.coins >= item.price
          const rarity = RARITY_META[item.rarity]
          const lim = item.limited ? LIMITED_META[item.limited as NonNullable<LimitedType>] : null
          return (
            <div
              key={item.id}
              className={`rpg-panel border-l-4 p-3 transition-all ${isOwned ? `${rarity.border} opacity-100` : levelLocked ? 'border-gray-700 opacity-50' : `${rarity.border} opacity-100`}`}
            >
              <div className="flex items-start gap-3">
                {isConsumable || isOutfit ? (
                  <span className={`text-2xl ${levelLocked && !isOwned ? 'grayscale' : ''}`}>{item.icon}</span>
                ) : (
                  <div
                    className={`relative h-14 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-rpg-border ${
                      levelLocked && !isOwned ? 'grayscale opacity-60' : ''
                    }`}
                  >
                    <BackgroundSwatch bgId={item.id} mini />
                    <span className="absolute bottom-0 right-0 bg-black/40 px-0.5 text-[10px] leading-4">{item.icon}</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold text-white">{item.name}</span>
                    <span className={`text-[8px] font-bold ${rarity.color}`}>{rarity.label}</span>
                    {lim && <span className={`text-[8px] font-bold ${lim.color}`}>● {lim.label}</span>}
                    {isConsumable && heldCount > 0 && (
                      <span className="rounded border border-rpg-xp/50 bg-rpg-xp/10 px-1 text-[8px] font-bold text-rpg-xp">
                        持有 ×{heldCount}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-relaxed text-gray-400">{item.description}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs font-bold text-rpg-gold">💰 {item.price}</span>
                    {item.requiredLevel && (
                      <span className="text-[9px] text-gray-500">Lv.{item.requiredLevel}+</span>
                    )}
                    {item.personalHint && (
                      <span className="text-[9px] text-pink-300/70">🔐 {item.personalHint}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3">
                {isOutfit && (
                  <div className="mb-2 flex items-center gap-2">
                    <button
                      onClick={() => {
                        // 试穿：临时切换到该服饰（热替换，舞台实时预览；不解锁不扣费）
                        const m = LIVE2D_MODELS.find((mm) =>
                          (mm.outfits ?? []).some((o) => o.unlockItem === item.id),
                        )
                        const o = m?.outfits?.find((oo) => oo.unlockItem === item.id)
                        if (!m || !o) return
                        setOutfitChoice(m.id, o.id)
                        showMsg(`试穿中：${item.name}（角色舞台实时预览 · 购买后可长期穿着）`)
                      }}
                      className="rounded-lg border-2 border-rpg-border bg-rpg-panel px-3 py-1 text-[10px] text-gray-300 transition-all hover:border-rpg-gold hover:text-rpg-gold active:scale-95"
                    >
                      👗 试穿预览
                    </button>
                    <span className="text-[8px] text-gray-600">在角色舞台上实时查看效果</span>
                  </div>
                )}
                {isConsumable ? (
                  <button
                    onClick={() => handleBuy(item)}
                    disabled={!canAfford}
                    className={`w-full rounded-lg border-2 py-1.5 text-xs transition-all ${
                      canAfford
                        ? 'border-rpg-gold bg-rpg-panelLight text-rpg-gold hover:bg-rpg-gold hover:text-rpg-bg active:scale-95'
                        : 'border-gray-600 bg-rpg-panel text-gray-500'
                    }`}
                  >
                    {canAfford ? `购买${heldCount > 0 ? `（已有 ×${heldCount}）` : ''}` : '金币不足'}
                  </button>
                ) : isOwned ? (
                  <div className="rounded-lg border-2 border-rpg-xp bg-rpg-xp/10 py-1.5 text-center text-xs text-rpg-xp">
                    ✓ 已拥有（背包页可启用）
                  </div>
                ) : levelLocked ? (
                  <div className="rounded-lg border-2 border-gray-600 bg-rpg-panel py-1.5 text-center text-[10px] text-gray-500">
                    需 Lv.{item.requiredLevel}
                  </div>
                ) : (
                  <button
                    onClick={() => handleBuy(item)}
                    disabled={!canAfford}
                    className={`w-full rounded-lg border-2 py-1.5 text-xs transition-all ${
                      canAfford
                        ? 'border-rpg-gold bg-rpg-panelLight text-rpg-gold hover:bg-rpg-gold hover:text-rpg-bg active:scale-95'
                        : 'border-gray-600 bg-rpg-panel text-gray-500'
                    }`}
                  >
                    {canAfford ? '购买' : '金币不足'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {msg && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 animate-slide-up">
          <div className="rpg-panel border-rpg-gold px-4 py-2 text-xs text-rpg-gold shadow-gold">
            {msg}
          </div>
        </div>
      )}
    </div>
  )
}

const FilterChip: React.FC<{
  label: string
  count?: number
  active: boolean
  onClick: () => void
  accent?: boolean
}> = ({ label, count, active, onClick, accent }) => (
  <button
    onClick={onClick}
    className={`rounded-full border px-2.5 py-1 text-[10px] transition-all ${
      active
        ? 'border-rpg-gold bg-rpg-gold/20 text-rpg-gold'
        : accent
          ? 'border-sky-500/50 text-sky-300/70 hover:text-sky-300'
          : 'border-rpg-border text-gray-400 hover:text-white'
    }`}
  >
    {label} {count !== undefined && <span className="opacity-50">{count}</span>}
  </button>
)

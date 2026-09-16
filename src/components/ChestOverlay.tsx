/**
 * 升级宝箱开启（CSGO 式滚轮抽奖动画）
 *
 * 流程：宝箱入场(点击开启) → 蓄力抖动 → 横向物品滚轮高速滚动 →
 *       长减速滑行（咔嗒声逐渐变慢）→ 定格在中奖物品（带随机偏移）→
 *       高亮中奖 + 卡片揭示 + 粒子爆发（稀有度越高特效越强）
 *
 * 设计参考：CS:GO 武器箱（横向 reel + 中心指针 + 指数减速）、
 * card-loot-opening（全息卡牌）、sleepless_lootbox（权重稀有度）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import {
  CHEST_RARITY_META,
  CHEST_RARITY_ORDER,
  CHEST_PITY_LIMIT,
  chestRarityOf,
  type ChestLoot,
  type ChestRarity,
} from '../config/chestConfig'
import { SHOP_ITEMS } from '../config/shopItems'
import { LIVE2D_MODELS } from '../config/live2dModels'
import { WARDROBE_OUTFITS } from '../config/wardrobeOutfits'
import { Live2DCharacter } from './Live2DCharacter'
import { BackgroundSwatch } from './BackgroundLayer'
import { sfx } from '../lib/soundFx'
import { CountUp } from './CountUp'

type Phase = 'enter' | 'shake' | 'reel' | 'reveal'

// ===== 滚轮几何（同比放大大屏版：卡宽/间隙/卡高全部 ≈ ×1.45） =====
const REEL_COUNT = 48
const WINNER_INDEX = 41
const ITEM_W = 96
const ITEM_GAP = 12
const STEP = ITEM_W + ITEM_GAP
const REEL_MS = 9000
/** 减速曲线：快速起步 → 长尾减速（CSGO 手感核心） */
const REEL_EASING = 'cubic-bezier(0.11, 0.72, 0.05, 1)'

interface ReelItem {
  key: string
  icon: string
  name: string
  rarity: ChestRarity
  /** 背景道具：滚轮卡内嵌实景预览 */
  bgId?: string
}

interface ParticleSpec {
  id: number
  angle: number
  dist: number
  size: number
  color: string
  delay: number
}

/**
 * 金币雨（WAAPI 持续生成器）：金币抽中时的全屏庆祝。
 * 定时投放单次动画的硬币（落完自动回收并移除 DOM），密度由投放节奏决定——
 * 不同于「固定 N 枚无限循环 + 随机延迟」方案（周期性出现密度低谷，观感戛然而止），
 * 生成器保证雨幕任意时刻密度恒定，直到组件卸载（点收下）为止。
 */
const CoinRain: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = ref.current
    if (!host) return
    // 首屏预铺一批「已经在半空」的硬币，避免开场空窗
    const spawn = (preRolled = false) => {
      const el = document.createElement('div')
      el.textContent = Math.random() < 0.55 ? '🪙' : Math.random() < 0.3 ? '💰' : '✨'
      const depth = Math.random() // 0 远 1 近：远处小而暗，近处大而亮，制造层次
      el.style.cssText = `position:absolute;top:-12vh;left:${(Math.random() * 100).toFixed(1)}%;font-size:${16 + depth * 34}px;opacity:${0.55 + depth * 0.45};will-change:transform;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5));`
      host.appendChild(el)
      const rot = (Math.random() - 0.5) * 620
      const dur = 2600 + Math.random() * 3200
      // 预铺：把进度拨到 0~80% 之间，开场即有满屏硬币
      const anim = el.animate(
        [
          { transform: 'translateY(0) rotate(0deg)', opacity: 0 },
          { opacity: 1, offset: 0.08 },
          { transform: `translateY(115vh) rotate(${rot}deg)`, opacity: 0.95, offset: 0.94 },
          { transform: `translateY(120vh) rotate(${rot}deg)`, opacity: 0 },
        ],
        { duration: dur, delay: preRolled ? -Math.random() * dur * 0.8 : 0, easing: 'linear' },
      )
      anim.onfinish = () => el.remove()
    }
    for (let i = 0; i < 26; i++) spawn(true)
    // 持续投放：~110ms 一枚 → 常驻约 30~40 枚在空中，密度恒定
    const timer = setInterval(() => spawn(), 110)
    return () => {
      clearInterval(timer)
      host.replaceChildren()
    }
  }, [])
  return <div ref={ref} className="pointer-events-none fixed inset-0 z-[6] overflow-hidden" />
}

/**
 * 全屏超大检视舞台：抽中形象/背景/服饰时组合预览（新形象 × 当前背景 /
 * 日和穿新衣 × 当前背景 / 当前形象 × 新背景），铺满视口的固定展示，
 * 点击形象有互动，检视满意后点「收下」进入下一箱。
 */
const InspectStage: React.FC<{
  level: number
  /** 新形象 id（抽中形象时传；抽中背景时缺省 = 当前形象） */
  modelId?: string
  /** 新背景 id（抽中背景时传；抽中形象时缺省 = 当前背景） */
  bgId?: string
  /** 新服饰 id（抽中服饰时传：日和穿上新衣 × 当前背景） */
  outfitId?: string
  /** 稀有度主题色（标题渐变与光效） */
  rarityHex: string
  rarityGlow: string
  label: string
  sub: string
  onDone: () => void
  doneLabel: string
}> = ({ level, modelId, bgId, outfitId, rarityHex, rarityGlow, label, sub, onDone, doneLabel }) => {
  // 铺满视口但预留文案+按钮空间（约 260px）：标题48+副标30+提示16+按钮38+间距/内边距≈120，
  // 190 不够会裁按钮；极小屏形象缩到 240 而非 320，保证按钮完整可见
  const [size, setSize] = useState(600)
  useEffect(() => {
    const fit = () => setSize(Math.max(240, Math.min(window.innerWidth * 0.96, window.innerHeight - 260)))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  return (
    <>
      <div className="relative animate-boss-emerge" style={{ width: size, height: size }}>
        <Live2DCharacter level={level} size={size} modelIdOverride={modelId} bgIdOverride={bgId} outfitIdOverride={outfitId} quality={1.5} frameless />
      </div>
      {/* 新品登榜横幅：主角标题（全屏最大字号 + 白→稀有色渐变 + 弹跳入场）。
          字体与顶部稀有度标签统一为 Zpix；装饰线全屏仅此一处（顶部已简化为纯文字）。 */}
      <div className="mt-3 flex w-full max-w-xl flex-col items-center">
        <div className="relative animate-pop-in">
          {/* 两侧斜切装饰线（唯一一处，仅主角配得） */}
          <span
            className="pointer-events-none absolute -left-20 top-1/2 hidden h-[3px] w-16 -translate-y-1/2 -rotate-6 sm:block"
            style={{ background: `linear-gradient(90deg, transparent, ${rarityHex})`, boxShadow: `0 0 12px ${rarityGlow}` }}
          />
          <span
            className="pointer-events-none absolute -right-20 top-1/2 hidden h-[3px] w-16 -translate-y-1/2 rotate-6 sm:block"
            style={{ background: `linear-gradient(270deg, transparent, ${rarityHex})`, boxShadow: `0 0 12px ${rarityGlow}` }}
          />
          <div
            className="font-rpg px-2 py-1 text-3xl font-bold leading-tight sm:text-4xl"
            style={{
              background: `linear-gradient(180deg, #ffffff 20%, ${rarityHex} 75%)`,
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
              filter: `drop-shadow(0 0 14px ${rarityGlow}) drop-shadow(0 2px 0 rgba(0,0,0,0.65))`,
            }}
          >
            {label}
          </div>
        </div>
        <div
          className="animate-slide-up mt-2 rounded-full border px-4 py-1 text-xs"
          style={{
            animationDelay: '180ms',
            animationFillMode: 'backwards',
            borderColor: `${rarityHex}88`,
            background: `linear-gradient(180deg, ${rarityHex}26 0%, ${rarityHex}0d 100%)`,
            color: rarityHex,
            boxShadow: `0 0 14px ${rarityGlow}`,
          }}
        >
          {sub}
        </div>
        <div className="mt-1.5 text-[10px] text-gray-500">🖱️ 点击形象有互动</div>
      </div>
      <button
        onClick={onDone}
        className="mt-4 rounded-lg border-2 border-rpg-gold/60 bg-rpg-gold/10 px-8 py-2 text-sm font-bold text-rpg-gold transition-all hover:bg-rpg-gold/20"
      >
        {doneLabel}
      </button>
      <div className="mt-1.5 text-[10px] text-gray-500">Enter / 空格 亦可收下</div>
    </>
  )
}

/** 粒子爆发（WAAPI，一次性） */
const ParticleBurst: React.FC<{ count: number; color: string; secondary: string }> = ({ count, color, secondary }) => {
  const ref = useRef<HTMLDivElement>(null)
  const specs = useMemo<ParticleSpec[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        angle: Math.random() * Math.PI * 2,
        dist: 60 + Math.random() * 160,
        size: 3 + Math.random() * 5,
        color: i % 3 === 0 ? secondary : color,
        delay: Math.random() * 0.18,
      })),
    [count, color, secondary],
  )

  useEffect(() => {
    const host = ref.current
    if (!host) return
    const anims: Animation[] = []
    const nodes: HTMLElement[] = []
    for (const p of specs) {
      const el = document.createElement('div')
      el.style.cssText = `position:absolute;left:50%;top:50%;width:${p.size}px;height:${p.size}px;border-radius:${p.size > 5 ? '2px' : '50%'};background:${p.color};`
      host.appendChild(el)
      nodes.push(el)
      const dx = Math.cos(p.angle) * p.dist
      const dy = Math.sin(p.angle) * p.dist - 40
      const anim = el.animate(
        [
          { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.2) rotate(${Math.random() * 360}deg)`, opacity: 0 },
        ],
        { duration: 700 + Math.random() * 500, delay: p.delay * 1000, easing: 'cubic-bezier(0.16, 0.84, 0.44, 1)', fill: 'forwards' },
      )
      anims.push(anim)
    }
    return () => {
      anims.forEach((a) => a.cancel())
      nodes.forEach((n) => n.remove())
    }
  }, [specs])

  return <div ref={ref} className="pointer-events-none absolute inset-0 overflow-visible" />
}

/** 滚轮中的单个物品卡（CSGO 式：渐变底 + 底部稀有度条） */
const ReelCard: React.FC<{ item: ReelItem; winner: boolean; dimmed: boolean; landed: boolean }> = ({
  item,
  winner,
  dimmed,
  landed,
}) => {
  const meta = CHEST_RARITY_META[item.rarity]
  return (
    <div
      className="flex flex-col items-center gap-1"
      style={{
        width: ITEM_W,
        marginRight: ITEM_GAP,
        opacity: dimmed ? 0.25 : 1,
        transform: winner && landed ? 'scale(1.12)' : undefined,
        transition: 'opacity 0.4s, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        zIndex: winner ? 2 : 1,
      }}
    >
      <div
        className="relative flex items-center justify-center overflow-hidden rounded-lg"
        style={{
          width: ITEM_W,
          height: 112,
          background: `linear-gradient(175deg, ${meta.hex}14 0%, ${meta.hex}38 78%, ${meta.hex}55 100%)`,
          border: winner && landed ? `2.5px solid ${meta.hex}` : `2px solid ${meta.hex}55`,
          boxShadow: winner && landed ? `0 0 26px ${meta.glow}` : undefined,
        }}
      >
        {item.bgId && <div className="absolute inset-0"><BackgroundSwatch bgId={item.bgId} /></div>}
        <span
          className="relative"
          style={{ fontSize: 46, filter: winner && landed ? 'drop-shadow(0 0 8px rgba(255,255,255,0.6))' : undefined }}
        >
          {item.icon}
        </span>
        {/* 底部稀有度条（CSGO 经典元素） */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: '10%',
            width: '80%',
            height: 5,
            borderRadius: 2,
            background: meta.hex,
            boxShadow: `0 0 8px ${meta.glow}`,
          }}
        />
      </div>
      <div className="w-full truncate text-center text-[10px] leading-tight text-gray-400">{item.name}</div>
    </div>
  )
}

/** 单个宝箱的开箱舞台（forcedLoot：测试面板注入的指定奖品，跳过真实抽奖） */
const ChestStage: React.FC<{
  level: number
  index: number
  total: number
  onDone: () => void
  forcedLoot?: import('../config/chestConfig').ChestLoot
}> = ({ level, index, total, onDone, forcedLoot }) => {
  const openChest = useGameStore((s) => s.openChest)
  const [phase, setPhase] = useState<Phase>('enter')
  const [loot, setLoot] = useState<ChestLoot | null>(null)
  const [pityHit, setPityHit] = useState(false)
  const [strip, setStrip] = useState<ReelItem[]>([])
  const [offset, setOffset] = useState<number | null>(null)
  const [landed, setLanded] = useState(false)
  const [showCard, setShowCard] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const rafRef = useRef<number>(0)
  const reelBoxRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const pointerRef = useRef<HTMLDivElement>(null)

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms))
  }
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout)
      cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  // ===== 滚轮数据池：可装备商店物品 + 背景装饰 + 服饰 + 宝箱专属 + 宝箱限定形象（陪跑预告） =====
  const reelPool = useMemo(() => {
    const equipCats = new Set(['head', 'face', 'back', 'body', 'feet', 'effect', 'pet', 'hand', 'aura', 'background', 'outfit'])
    return SHOP_ITEMS.filter((i) => equipCats.has(i.category))
  }, [])

  // 宝箱限定形象卡（陪跑出现，制造期待感）
  const chestModels = useMemo(() => LIVE2D_MODELS.filter((m) => m.chestRarity), [])

  const randomFiller = useCallback(
    (): ReelItem => {
      // 滚轮陪跑物品权重：偏低稀有度为主，偶尔高稀有度（期待感）
      const rarity = (() => {
        const r = Math.random() * 100
        if (r < 48) return 'white' as ChestRarity
        if (r < 76) return 'blue' as ChestRarity
        if (r < 91) return 'purple' as ChestRarity
        if (r < 98) return 'gold' as ChestRarity
        return 'red' as ChestRarity
      })()
      // 35% 概率插入限定形象卡作为陪跑（蓝/紫/金/红档，无论是否已解锁）
      const tease = chestModels.filter((m) => m.chestRarity === rarity)
      if (tease.length > 0 && Math.random() < 0.35) {
        const m = tease[Math.floor(Math.random() * tease.length)]
        return { key: Math.random().toString(36).slice(2), icon: m.icon, name: `形象·${m.label}`, rarity: m.chestRarity as ChestRarity }
      }
      const same = reelPool.filter((i) => chestRarityOf(i) === rarity)
      const pool = same.length > 0 ? same : reelPool
      const it = pool[Math.floor(Math.random() * pool.length)]
      return {
        key: Math.random().toString(36).slice(2),
        icon: it.icon,
        name: it.name,
        rarity: chestRarityOf(it),
        bgId: it.id,
      }
    },
    [reelPool, chestModels],
  )

  const lootToReelItem = useCallback((l: ChestLoot, key: string): ReelItem => {
    if (l.kind === 'coins') {
      return { key, icon: '💰', name: `${l.amount} 金币`, rarity: l.rarity }
    }
    if (l.kind === 'model') {
      return { key, icon: l.model.icon, name: `形象·${l.model.label}`, rarity: l.rarity }
    }
    return {
      key,
      icon: l.item.icon,
      name: l.item.name,
      rarity: l.rarity,
      bgId: l.item.category === 'background' ? l.item.id : undefined,
    }
  }, [])

  // ===== 开箱：抖动 → 滚轮 =====
  const beginOpen = useCallback(() => {
    if (phase !== 'enter') return
    setPhase('shake')
    sfx.chestShake()
    later(() => {
      // 抽奖结果在此刻确定（滚轮只是表演）；测试注入 forcedLoot 时跳过真实抽奖
      const roll = forcedLoot ? { loot: forcedLoot, pityTriggered: false } : openChest(level)
      setLoot(roll.loot)
      setPityHit(roll.pityTriggered)

      // 构建滚轮：中奖物固定在 WINNER_INDEX
      const winnerItem = lootToReelItem(roll.loot, 'winner')
      const items: ReelItem[] = []
      for (let i = 0; i < REEL_COUNT; i++) {
        items.push(i === WINNER_INDEX ? winnerItem : randomFiller())
      }
      setStrip(items)
      setPhase('reel')
    }, 600)
  }, [phase, level, openChest, lootToReelItem, randomFiller, forcedLoot])

  // ===== 滚轮启动：测量宽度 → 计算落点 → 触发长减速滚动 =====
  useEffect(() => {
    if (phase !== 'reel' || strip.length === 0) return
    const box = reelBoxRef.current
    if (!box) return
    // 等布局稳定后启动
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        // 指针实际中心（相对未变换的物品条原点）：rect 实测代替 boxW/2 推算，
        // 消除边框造成的 ~2px 系统性左偏；指针与物品条同盒测量，祖先 transform 位移互相抵消
        const stRect = stripRef.current?.getBoundingClientRect()
        const prRect = pointerRef.current?.getBoundingClientRect()
        const pointerX =
          stRect && prRect ? prRect.left + prRect.width / 2 - stRect.left : box.offsetWidth / 2
        // 中奖物中心对准指针，附加随机偏移制造悬念（CSGO 经典手感）。
        // 偏移覆盖 ±45% 卡宽：指针可明显落在奖品左右任意一侧（此前 ±35% 时
        // 图标偏右落点概率被边框偏差压低，观感上"永远停在左侧/中部"）；
        // 仅留边上几像素安全边距，避免指针压到相邻卡造成歧义
        const jitter = (Math.random() - 0.5) * ITEM_W * 0.9
        const target = WINNER_INDEX * STEP + ITEM_W / 2 - pointerX + jitter
        setOffset(-target)
      })
    })
  }, [phase, strip])

  // ===== 滚动中的咔嗒声：rAF 监测指针下方的物品索引 =====
  useEffect(() => {
    if (phase !== 'reel') return
    let lastIdx = -1
    const loop = () => {
      const box = reelBoxRef.current
      const st = stripRef.current
      if (box && st) {
        const center = box.getBoundingClientRect().left + box.offsetWidth / 2
        const stripLeft = st.getBoundingClientRect().left
        const idx = Math.floor((center - stripLeft) / STEP)
        if (idx !== lastIdx) {
          if (lastIdx >= 0) sfx.reelTick()
          lastIdx = idx
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase])

  // ===== 滚动结束 → 定格揭示 =====
  const handleTransitionEnd = useCallback(() => {
    if (phase !== 'reel') return
    setLanded(true)
    setPhase('reveal')
    const tierIdx = loot ? CHEST_RARITY_ORDER.indexOf(loot.rarity) : 0
    sfx.chestOpen()
    later(() => {
      sfx.chestReveal(tierIdx + 1)
      setShowCard(true)
    }, 400)
  }, [phase, loot])

  const meta = CHEST_RARITY_META[loot?.rarity ?? 'white']
  /** 抽中形象/背景/服饰：进入全屏检视（不自动跳下一箱，等用户点收下） */
  const isInspect =
    !!loot &&
    (loot.kind === 'model' ||
      (loot.kind === 'item' && (loot.item.category === 'background' || loot.item.category === 'outfit')))
  /** 服饰 itemId → OutfitDef.id（检视时日和穿上新衣） */
  const inspectOutfitId =
    loot?.kind === 'item' && loot.item.category === 'outfit'
      ? WARDROBE_OUTFITS.find((o) => o.itemId === loot.item.id)?.id
      : undefined

  const next = useCallback(() => {
    if (phase !== 'reveal' || !showCard) return
    onDone()
  }, [phase, showCard, onDone])

  // 键盘备用确认：Enter/空格 开箱（enter 阶段）与收下（揭示后），
  // 小屏按钮被裁或够不到时仍可完成流程
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      if (e.repeat) return
      e.preventDefault()
      if (phase === 'enter') beginOpen()
      else if (phase === 'reveal' && showCard) next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, showCard, next, beginOpen])

  // 揭示后自动进入下一箱（可点击立即跳过；检视类等用户亲自收下）
  useEffect(() => {
    if (showCard && !isInspect) {
      const t = setTimeout(onDone, 2000)
      return () => clearTimeout(t)
    }
  }, [showCard, onDone, isInspect])

  const particles = showCard && loot ? meta.particles : 0

  return (
    <div className="flex w-full flex-col items-center">
      {/* 进度 */}
      <div className="mb-3 text-[11px] tracking-widest text-gray-400">
        宝箱 {index + 1} / {total}
      </div>

      {/* ===== 入场 / 抖动：宝箱本体 ===== */}
      {(phase === 'enter' || phase === 'shake') && (
        <button
          onClick={beginOpen}
          className={`mb-2 select-none text-[11rem] transition-transform ${
            phase === 'enter'
              ? 'animate-chest-idle cursor-pointer hover:scale-110'
              : 'animate-chest-shake'
          }`}
          style={
            phase === 'shake'
              ? { filter: `drop-shadow(0 0 18px ${CHEST_RARITY_META.gold.glow})` }
              : undefined
          }
          aria-label="开启宝箱"
        >
          🎁
        </button>
      )}

      {/* ===== 滚轮（CSGO 式横向滚动；揭示时淡出让位全屏奖品） ===== */}
      {(phase === 'reel' || phase === 'reveal') && (
        <div
          ref={reelBoxRef}
          className={`relative mb-3 w-full overflow-hidden rounded-xl border-2 border-rpg-border bg-black/40 py-3 transition-opacity duration-500 ${
            showCard ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
          style={{
            maskImage: 'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)',
            WebkitMaskImage: 'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)',
          }}
        >
          {/* 中心指针 */}
          <div
            ref={pointerRef}
            className="pointer-events-none absolute left-1/2 top-0 z-10 h-full -translate-x-1/2"
          >
            <div
              className="mx-auto h-full w-0.5"
              style={{ background: '#ffd54a', boxShadow: '0 0 8px rgba(255,213,74,0.9)' }}
            />
            <div
              className="absolute -top-0 left-1/2 -translate-x-1/2 -translate-y-0.5"
              style={{
                width: 0,
                height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '8px solid #ffd54a',
                filter: 'drop-shadow(0 0 4px rgba(255,213,74,0.9))',
              }}
            />
          </div>
          {/* 物品条 */}
          <div
            ref={stripRef}
            className="flex will-change-transform"
            style={{
              transform: offset === null ? 'translateX(0)' : `translateX(${offset}px)`,
              transition: offset === null ? 'none' : `transform ${REEL_MS}ms ${REEL_EASING}`,
            }}
            onTransitionEnd={handleTransitionEnd}
          >
            {strip.map((item, i) => (
              <ReelCard
                key={item.key}
                item={item}
                winner={i === WINNER_INDEX}
                dimmed={landed && i !== WINNER_INDEX}
                landed={landed}
              />
            ))}
          </div>
        </div>
      )}

      {/* 提示文案 */}
      <div className="mb-2 h-5 text-center text-[11px] text-gray-400">
        {phase === 'enter' && <span className="animate-pulse">点击宝箱开启 ✨</span>}
        {phase === 'shake' && <span>宝箱在震动……</span>}
        {phase === 'reel' && <span className="animate-pulse">命运正在滚动……</span>}
      </div>

      {/* 全屏闪光（紫+） */}
      {phase === 'reveal' && meta.flash && showCard && (
        <div className="pointer-events-none fixed inset-0 z-[5] animate-chest-flash" style={{ background: meta.glow }} />
      )}

      {/* 金币雨：抽中金币时的全屏庆祝 */}
      {phase === 'reveal' && loot?.kind === 'coins' && showCard && <CoinRain />}

      {/* ===== 揭示：全屏奖品舞台（BOSS 胜利定格同款语言） ===== */}
      {/* overflow-y-auto + m-auto：小屏内容超高时从顶部开始可滚动（justify-center
          溢出会把底部按钮推出屏幕外且滚不回来），不超高时 m-auto 仍垂直居中 */}
      {phase === 'reveal' && (
        <div
          className={`fixed inset-0 z-10 flex flex-col overflow-y-auto p-4 ${meta.quake ? 'animate-chest-quake' : ''}`}
          onClick={isInspect ? undefined : showCard ? next : undefined}
        >
        <div className="relative m-auto flex w-full flex-col items-center">
          {/* 中央暗色衬底：金币雨从文字后穿过时压暗背景，内容与雨幕分层不重叠 */}
          {loot?.kind === 'coins' && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(ellipse 340px 260px at 50% 46%, rgba(10,6,24,0.72) 0%, rgba(10,6,24,0.4) 55%, transparent 78%)',
              }}
            />
          )}
          {/* 全屏定格光晕背景 */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: `radial-gradient(ellipse at center, ${meta.glow}30 0%, transparent 65%)` }}
          />
          {/* 稀有度标签（eyebrow）：小字 + 宽字距 + 单层光晕，轻于下方主角名字。
              全 Zpix 字体——Press Start 2P 无中文字形，中文会 fallback 系统字体与
              底部名字（Zpix）字形打架，这是此前「不和谐」的主因。
              注意：勿给 tracking 加负右边距回补（-mr-[0.45em]）——本标签是 flex 纵列
              子项，宽度按内容自适应，负 margin 会把可用宽度压到比单行文字还窄，
              CJK 逐字断行 → "史诗/神话"变成一字一行的竖排。如需去尾部字距，
              只能用 whitespace-nowrap 保证单行，尾部空隙交给 items-center 容错。 */}
          <div className={`mb-4 font-rpg text-xl leading-relaxed sm:text-2xl ${showCard ? 'animate-kill-slam' : 'opacity-0'}`}>
            <span
              className="tracking-[0.45em] whitespace-nowrap"
              style={{ color: meta.hex, textShadow: `0 0 16px ${meta.glow}, 0 2px 0 rgba(0,0,0,0.7)` }}
            >
              {pityHit ? `✦ 保底 · ${meta.label} ✦` : meta.label}
            </span>
          </div>

          {showCard && isInspect ? (
            /* ===== 形象/背景/服饰：全屏检视舞台（拖拽/缩放组合预览） ===== */
            <InspectStage
              level={level}
              modelId={loot?.kind === 'model' ? loot.model.id : undefined}
              bgId={loot?.kind === 'item' && loot.item.category === 'background' ? loot.item.id : undefined}
              outfitId={inspectOutfitId}
              rarityHex={meta.hex}
              rarityGlow={meta.glow}
              label={loot?.kind === 'model' ? `${loot.model.icon} ${loot.model.label}` : (loot?.kind === 'item' ? loot.item.name : '')}
              sub={
                loot?.kind === 'item' && loot.convertedCoins
                  ? `已拥有 · 折算 +${loot.convertedCoins} 💰`
                  : loot?.kind === 'model'
                    ? '新形象 · 已解锁（背包页可切换）'
                    : loot?.kind === 'item' && loot.item.category === 'outfit'
                      ? '新服饰 · 已解锁（背包页可换装）'
                      : '新背景 · 已入背包（背包页可启用）'
              }
              onDone={next}
              doneLabel={index + 1 < total ? '收下，开下一箱 →' : '收下！'}
            />
          ) : showCard && (
            <div
              className="relative flex flex-col items-center justify-center gap-3 rounded-2xl p-6 animate-card-flip animate-holo-shine"
              style={{
                background: `radial-gradient(ellipse at center, ${meta.hex}18 0%, transparent 72%)`,
                boxShadow: `0 0 64px ${meta.glow}`,
              }}
            >
              {loot?.kind === 'item' ? (
                loot.item.category === 'outfit' ? (
                  <>
                    <div
                      className="flex h-40 w-64 items-center justify-center rounded-lg border-2"
                      style={{ borderColor: meta.hex, boxShadow: `0 0 26px ${meta.glow}` }}
                    >
                      <span className="text-8xl">{loot.item.icon}</span>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-white">{loot.item.name}</div>
                      <div className={`text-xs ${meta.text}`}>
                        {meta.label}服饰{loot.item.chestExclusive ? ' · 宝箱专属' : ''} · 已解锁（背包页可换装）
                      </div>
                    </div>
                    {loot.convertedCoins && (
                      <div className="text-xs text-rpg-gold">（已拥有 · 折算 +{loot.convertedCoins} 💰）</div>
                    )}
                  </>
                ) : (
                  <>
                    <div
                      className="h-40 w-64 overflow-hidden rounded-lg border-2"
                      style={{ borderColor: meta.hex, boxShadow: `0 0 26px ${meta.glow}` }}
                    >
                      <BackgroundSwatch bgId={loot.item.id} mini={false} />
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-white">{loot.item.name}</div>
                      <div className={`text-xs ${meta.text}`}>
                        {meta.label}背景{loot.item.chestExclusive ? ' · 宝箱专属' : ''} · 已入背包（背包页可启用）
                      </div>
                    </div>
                    {loot.convertedCoins && (
                      <div className="text-xs text-rpg-gold">（已拥有 · 折算 +{loot.convertedCoins} 💰）</div>
                    )}
                  </>
                )
              ) : loot?.kind === 'model' ? (
                <>
                  <Live2DCharacter level={level} size={260} modelIdOverride={loot.model.id} />
                  <div className="text-center">
                    <div className="text-lg font-bold text-white">{loot.model.icon} {loot.model.label}</div>
                    <div className={`text-xs ${meta.text}`}>{meta.label}形象 · 已解锁（背包页可切换）</div>
                  </div>
                </>
              ) : loot?.kind === 'coins' ? (
                <>
                  <div className="text-8xl">💰</div>
                  <div className="pixel-text text-4xl text-rpg-gold">
                    +<CountUp value={loot.amount} duration={900} />
                  </div>
                  <div className={`text-xs ${meta.text}`}>{meta.label}金币</div>
                </>
              ) : null}
            </div>
          )}

          {/* 粒子（全屏规模） */}
          {particles > 0 && <ParticleBurst count={particles} color={meta.hex} secondary="#ffffff" />}

          {/* 下一箱按钮（检视类由 InspectStage 自带收下按钮） */}
          {showCard && !isInspect && (
            <>
              <button
                onClick={next}
                className="mt-5 rounded-lg border-2 border-rpg-gold/60 bg-rpg-gold/10 px-6 py-1.5 text-sm text-rpg-gold transition-all hover:bg-rpg-gold/20"
              >
                {index + 1 < total ? '开启下一箱 →' : '收下！'}
              </button>
              <div className="mt-1.5 text-[10px] text-gray-500">Enter / 空格 / 点击画面 皆可收下</div>
            </>
          )}
        </div>
        </div>
      )}
    </div>
  )
}

export const ChestOverlay: React.FC = () => {
  const pending = useGameStore((s) => s.pendingChests)
  const clearChests = useGameStore((s) => s.clearChests)
  const pity = useGameStore((s) => s.state.player.chestPity ?? 0)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (pending) setIndex(0)
  }, [pending])

  if (!pending) return null

  const handleDone = () => {
    if (index + 1 >= pending.count) {
      clearChests()
    } else {
      setIndex((v) => v + 1)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-hidden bg-black/90 animate-fade-in p-4 backdrop-blur-sm">
      {/* 全屏氛围：暗角 + 缓慢旋转的金色光芒（BOSS 胜利舞台同款） */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.6)_100%)]" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
        <div
          className="animate-rays-spin h-[160vmax] w-[160vmax] opacity-[0.07]"
          style={{
            background: 'repeating-conic-gradient(from 0deg, rgba(255,213,74,0.9) 0deg 8deg, transparent 8deg 26deg)',
            maskImage: 'radial-gradient(circle, transparent 20%, black 42%)',
            WebkitMaskImage: 'radial-gradient(circle, transparent 20%, black 42%)',
          }}
        />
      </div>

      {/* 顶部标题（浮在全屏舞台上） */}
      <div className="relative mb-1 pixel-text text-sm text-rpg-gold">LEVEL UP CHEST</div>
      <div className="relative mb-4 text-[11px] text-gray-400">
        Lv.{pending.level} · 距保底（必出史诗）还有 {Math.max(0, CHEST_PITY_LIMIT - pity)} 箱
      </div>

      {/* 舞台：滚轮铺满屏宽 */}
      <div className="relative w-full max-w-6xl">
        <ChestStage key={`${pending.level}-${index}`} level={pending.level} index={index} total={pending.count} onDone={handleDone} forcedLoot={pending.forcedLoot} />
      </div>
    </div>
  )
}

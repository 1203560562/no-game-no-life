/**
 * 背景装饰渲染层
 *
 * 画框级背景装饰（config/backgrounds.ts 定义）：
 * - CSS 渐变底色（白/蓝/紫档）或 AI 背景图（金/红档，public/backgrounds/）
 * - CSS 粒子动画（星点/花瓣/气泡/叶片/火星/暗紫光球/金屑）
 * - 顶部/底部轻微渐暗保证 Live2D 立绘对比度
 *
 * 两个出口：
 * - BackgroundLayer：绝对定位铺满父容器（Live2DCharacter 画框底层）
 * - BackgroundSwatch：由父容器控制尺寸的预览块（商店卡片 / 背包切换）
 */

import { useMemo } from 'react'
import { getBackgroundDef, type BackgroundDef, type BackgroundParticles } from '../config/backgrounds'

// ===== 粒子规格 =====

interface ParticleMeta {
  count: number
  /** 动画类（tailwind animate-*） */
  cls: string
  /** 基准时长（秒） */
  duration: number
  /** 点状粒子：尺寸区间与颜色；emoji 粒子：字号与字符 */
  sizeMin: number
  sizeMax: number
  colors: string[]
  emoji?: string
  /** 点状粒子发光 */
  glow?: boolean
  /** 星点/光球：随机固定位置（不落体/不上升） */
  fixedPos?: boolean
}

const PARTICLE_META: Record<BackgroundParticles, ParticleMeta> = {
  stars: {
    count: 16, cls: 'animate-bg-twinkle', duration: 2.6,
    sizeMin: 2, sizeMax: 4, colors: ['#ffffff', '#ffd54a', '#a5c8ff'], glow: true, fixedPos: true,
  },
  petal: {
    count: 9, cls: 'animate-bg-fall', duration: 8.5,
    sizeMin: 8, sizeMax: 12, colors: ['#f9a8d4'], emoji: '🌸',
  },
  bubble: {
    count: 11, cls: 'animate-bg-rise', duration: 6.5,
    sizeMin: 3, sizeMax: 8, colors: ['rgba(190,230,255,0.55)', 'rgba(150,210,255,0.4)'],
  },
  leaf: {
    count: 8, cls: 'animate-bg-fall', duration: 10,
    sizeMin: 8, sizeMax: 12, colors: ['#86efac'], emoji: '🍃',
  },
  ember: {
    count: 15, cls: 'animate-bg-rise', duration: 5.5,
    sizeMin: 2, sizeMax: 5, colors: ['#ffb347', '#ff6b35', '#ffd54a'], glow: true,
  },
  void: {
    count: 9, cls: 'animate-bg-drift', duration: 5,
    sizeMin: 4, sizeMax: 10, colors: ['#a855f7', '#7c3aed', '#c084fc'], glow: true, fixedPos: true,
  },
  spark: {
    count: 11, cls: 'animate-bg-rise', duration: 7.5,
    sizeMin: 2, sizeMax: 4, colors: ['#ffd54a', '#fbbf24', '#fde68a'], glow: true,
  },
}

const Particles: React.FC<{ type: BackgroundParticles; mini?: boolean }> = ({ type, mini }) => {
  const meta = PARTICLE_META[type]
  const count = mini ? Math.min(6, Math.ceil(meta.count / 3)) : meta.count
  const specs = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: meta.sizeMin + Math.random() * (meta.sizeMax - meta.sizeMin),
        delay: -Math.random() * meta.duration,
        duration: meta.duration * (0.7 + Math.random() * 0.6),
        color: meta.colors[i % meta.colors.length],
      })),
    [count, meta],
  )

  return (
    <>
      {specs.map((p) =>
        meta.emoji ? (
          <span
            key={p.id}
            className={`pointer-events-none absolute select-none ${meta.cls}`}
            style={{
              left: `${p.left}%`,
              fontSize: mini ? p.size * 0.7 : p.size,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          >
            {meta.emoji}
          </span>
        ) : (
          <span
            key={p.id}
            className={`pointer-events-none absolute rounded-full ${meta.cls}`}
            style={{
              left: `${p.left}%`,
              ...(meta.fixedPos ? { top: `${p.top}%` } : {}),
              width: p.size,
              height: p.size,
              background: p.color,
              boxShadow: meta.glow ? `0 0 ${p.size * 2}px ${p.color}` : undefined,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        ),
      )}
    </>
  )
}

// ===== 背景视图（层与预览块共用） =====

const BackgroundView: React.FC<{ def: BackgroundDef; mini?: boolean; hideVignette?: boolean }> = ({ def, mini, hideVignette = false }) => (
  <>
    {def.image ? (
      <img
        src={def.image}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full select-none object-cover"
      />
    ) : null}
    {def.particles ? <Particles type={def.particles} mini={mini} /> : null}
    {/* 边缘渐暗：保证立绘对比度（mini 预览略轻；无框检视模式关闭） */}
    {!hideVignette && (
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: mini
            ? 'radial-gradient(ellipse at 50% 45%, transparent 65%, rgba(10,6,24,0.22) 100%)'
            : 'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(10,6,24,0.38) 100%)',
        }}
      />
    )}
  </>
)

/** 画框底层：绝对定位铺满父容器（父容器需 relative）；vignette=false 关闭边缘渐暗（无框检视） */
export const BackgroundLayer: React.FC<{ bgId: string | null | undefined; vignette?: boolean }> = ({ bgId, vignette = true }) => {
  const def = getBackgroundDef(bgId)
  if (!def) return null
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: def.css }}>
      <BackgroundView def={def} hideVignette={!vignette} />
    </div>
  )
}

/** 预览块：由父容器控制尺寸（rounded/border 由父容器装饰） */
export const BackgroundSwatch: React.FC<{
  bgId: string | null | undefined
  className?: string
  mini?: boolean
}> = ({ bgId, className = '', mini = true }) => {
  const def = getBackgroundDef(bgId)
  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{ background: def?.css ?? 'linear-gradient(180deg, #2a1a4a 0%, #1a1033 100%)' }}
    >
      {def ? <BackgroundView def={def} mini={mini} /> : null}
    </div>
  )
}

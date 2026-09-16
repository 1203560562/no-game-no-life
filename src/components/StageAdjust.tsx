/**
 * 可调舞台 —— 角色画框的形象/背景分层调整（今日冒险页）
 *
 * - 调整模式（✥ 开启）：先选目标（🧍 形象 / 🌌 背景），再拖拽移动、滚轮缩放（指针锚点）
 * - 变换通过 Context 传给画框内组件（Live2DCharacter 分别应用到 PIXI 画布与背景层），
 *   不侵入 PIXI 内部适配逻辑；超出画框的部分被裁切（画框内平移语义）
 * - 两层变换各自持久化 localStorage（按 storageKey 区分页面）
 * - 调整模式下画框上方盖透明遮罩接管指针事件：防止拖拽误触 Live2D 点击动作
 */

import type { CSSProperties, FC, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { createContext, useEffect, useRef, useState } from 'react'

export interface StageTransform {
  x: number
  y: number
  s: number
}

const DEFAULT_TF: StageTransform = { x: 0, y: 0, s: 1 }
const S_MIN = 0.3
const S_MAX = 3
/** 画框实际尺寸缩放范围（460 基准 × 2 = 920 上限，适配 max-w-5xl 容器） */
const FRAME_MIN = 0.5
const FRAME_MAX = 2

const clampScale = (s: number) => Math.min(S_MAX, Math.max(S_MIN, s))
const clampFrame = (s: number) => Math.min(FRAME_MAX, Math.max(FRAME_MIN, s))

/** 分层变换上下文：Live2DCharacter 在 StageAdjust 内时消费（外层页面不受影响）。
 *  frameScale 控制 PIXI 画框实际尺寸（改变 canvas 分辨率，非 CSS 变换） */
export const StageLayersContext = createContext<{
  model: StageTransform
  bg: StageTransform
  frameScale: number
} | null>(null)

/** 变换 → CSS style 片段（Live2DCharacter 内使用） */
export const stageTfStyle = (t: StageTransform): CSSProperties => ({
  transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`,
  transformOrigin: 'center',
})

const readStored = (key: string): { model: StageTransform; bg: StageTransform; frameScale: number } => {
  const fallback = { model: { ...DEFAULT_TF }, bg: { ...DEFAULT_TF }, frameScale: 1 }
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as {
      model?: Partial<StageTransform>
      bg?: Partial<StageTransform>
      frameScale?: number
    } | null
    if (!v) return fallback
    const pick = (p?: Partial<StageTransform>): StageTransform =>
      p && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.s === 'number'
        ? { x: p.x, y: p.y, s: clampScale(p.s) }
        : { ...DEFAULT_TF }
    return {
      model: pick(v.model),
      bg: pick(v.bg),
      frameScale: typeof v.frameScale === 'number' ? clampFrame(v.frameScale) : 1,
    }
  } catch {
    return fallback
  }
}

/**
 * 全局共享的舞台变换 key：形象/背景/画框的调整跨页面生效
 * （今日冒险 / 商店 / 背景页共用同一份）。
 * 变换曾按页面独立持久化，导致"在 A 页调过背景、B 页仍默认"的
 * 大小不一致；统一后任意页调整一次、全页生效。
 */
export const GLOBAL_STAGE_KEY = 'levelup.stage'

/** 一次性迁移：全局 key 无数据时，继承旧页面 key（今日冒险优先）中最先存在的一份 */
const ensureGlobalStage = () => {
  try {
    if (localStorage.getItem(GLOBAL_STAGE_KEY) !== null) return
    const legacyKeys = [
      'levelup.dashboard.stage',
      'levelup.shop.stage',
      'levelup.backpack.stage',
    ]
    for (const k of legacyKeys) {
      const raw = localStorage.getItem(k)
      if (raw === null) continue
      JSON.parse(raw) // 校验可解析
      localStorage.setItem(GLOBAL_STAGE_KEY, raw)
      return
    }
  } catch {
    /* 迁移失败按默认处理 */
  }
}

type Target = 'model' | 'bg' | 'frame'

export const StageAdjust: FC<{
  storageKey: string
  children: ReactNode
}> = ({ children }) => {
  // 全局共享 key：形象/背景/画框的调整跨页面一致（曾按页面独立持久化，
  // 导致"在 A 页调过背景、B 页仍默认"的大小不一致）
  const effectiveKey = GLOBAL_STAGE_KEY
  const [tfs, setTfs] = useState(() => {
    ensureGlobalStage()
    return readStored(effectiveKey)
  })
  const [target, setTarget] = useState<Target>('model')
  const [adjusting, setAdjusting] = useState(false)
  const [dragging, setDragging] = useState(false)
  /** 画框布局盒（两层变换的 origin 基准；本身不变换） */
  const frameRef = useRef<HTMLDivElement>(null)
  /** 调整模式遮罩（wheel 需 non-passive 监听才能 preventDefault） */
  const overlayRef = useRef<HTMLDivElement>(null)
  /** tfs 的渲染级镜像：wheel/pointer 回调里读最新值，避免闭包过期 */
  const tfsRef = useRef(tfs)
  tfsRef.current = tfs
  const targetRef = useRef(target)
  targetRef.current = target
  /** 拖拽起点（屏幕坐标 + 起始平移量） */
  const dragRef = useRef<{ px: number; py: number; tx: number; ty: number } | null>(null)

  // 持久化（变换数据量极小，直接存）
  useEffect(() => {
    try {
      localStorage.setItem(effectiveKey, JSON.stringify(tfs))
    } catch {
      /* ignore */
    }
  }, [tfs, effectiveKey])

  // ===== 滚轮缩放（以指针为锚点；non-passive 阻止页面滚动） =====
  useEffect(() => {
    const el = overlayRef.current
    if (!el || !adjusting) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const frame = frameRef.current
      if (!frame) return
      const tgt = targetRef.current
      // 画框缩放：直接调整 frameScale（改变 PIXI canvas 实际尺寸，非 CSS 变换）
      if (tgt === 'frame') {
        const cur = tfsRef.current.frameScale
        const ns = clampFrame(cur * Math.exp(-e.deltaY * 0.0012))
        if (ns === cur) return
        setTfs((c) => ({ ...c, frameScale: ns }))
        return
      }
      const t = tfsRef.current[tgt]
      const rect = frame.getBoundingClientRect()
      // 布局盒中心 = origin（两层 transformOrigin 均为 center）
      const ox = rect.left + rect.width / 2
      const oy = rect.top + rect.height / 2
      const px = e.clientX - ox
      const py = e.clientY - oy
      const ns = clampScale(t.s * Math.exp(-e.deltaY * 0.0012))
      if (ns === t.s) return
      // 锚点固定：t' = t + p·(1/s′ − 1/s)
      const next = { s: ns, x: t.x + px * (1 / ns - 1 / t.s), y: t.y + py * (1 / ns - 1 / t.s) }
      setTfs((cur) => ({ ...cur, [targetRef.current]: next }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [adjusting])

  // ===== 拖拽移动（pointer capture；范围限 ±1 画框宽高，防拖飞；画框目标禁用） =====
  const onPointerDown = (e: ReactPointerEvent) => {
    const tgt = targetRef.current
    if (tgt === 'frame') return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const t = tfsRef.current[tgt]
    dragRef.current = { px: e.clientX, py: e.clientY, tx: t.x, ty: t.y }
    setDragging(true)
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    if (target === 'frame') return
    const tgt = target as 'model' | 'bg'
    const d = dragRef.current
    if (!d) return
    const lim = Math.max(200, (frameRef.current?.offsetWidth ?? 400) * 1.2)
    const clamp = (v: number) => Math.max(-lim, Math.min(lim, v))
    const x = clamp(d.tx + (e.clientX - d.px))
    const y = clamp(d.ty + (e.clientY - d.py))
    setTfs((cur) => ({ ...cur, [tgt]: { ...cur[tgt], x, y } }))
  }
  const endDrag = () => {
    dragRef.current = null
    setDragging(false)
  }

  const stepScale = (dir: 1 | -1) => {
    if (target === 'frame') {
      setTfs((cur) => ({
        ...cur,
        frameScale: clampFrame(Math.round((cur.frameScale + dir * 0.1) * 100) / 100),
      }))
      return
    }
    setTfs((cur) => ({
      ...cur,
      [target]: {
        ...cur[target],
        s: clampScale(Math.round((cur[target].s + dir * 0.1) * 100) / 100),
      },
    }))
  }

  const curVal = target === 'frame' ? tfs.frameScale : tfs[target].s
  const TARGET_META: Record<Target, { label: string; icon: string }> = {
    model: { label: '形象', icon: '🧍' },
    bg: { label: '背景', icon: '🌌' },
    frame: { label: '画框', icon: '📐' },
  }

  return (
    <StageLayersContext.Provider value={tfs}>
      <div className="relative" ref={frameRef}>
        {children}

        {/* 调整模式遮罩：接管指针（防误触模型点击反应），拖拽/滚轮都在这层 */}
        {adjusting && (
          <div
            ref={overlayRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className={`absolute inset-0 z-20 rounded-xl border-2 border-dashed transition-colors ${
              dragging ? 'cursor-grabbing border-rpg-gold/70 bg-rpg-gold/5' : 'cursor-grab border-rpg-gold/30'
            }`}
          >
            <div className="pointer-events-none absolute left-1/2 top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded border border-rpg-gold/50 bg-black/70 px-1.5 py-0.5 text-[9px] text-rpg-gold">
              {TARGET_META[target].icon} {TARGET_META[target].label} · 拖拽移动 · 滚轮缩放
            </div>
          </div>
        )}

        {/* 控制条：左上角（与右上角的 🔍/🎬 按钮错开）；hover 淡显，调整模式常驻 */}
        <div
          className={`absolute -top-2 left-0 z-30 flex items-center gap-1 transition-opacity ${
            adjusting ? 'opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'
          }`}
        >
          {adjusting && (
            <>
              {/* 目标切换：形象 / 背景 */}
              {(Object.keys(TARGET_META) as Target[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTarget(t)}
                  className={`rounded border px-1.5 py-0.5 text-[10px] transition-all ${
                    target === t
                      ? 'border-rpg-gold bg-rpg-gold/20 text-rpg-gold'
                      : 'border-rpg-border bg-rpg-panel text-gray-400 hover:text-white'
                  }`}
                  title={`调整${TARGET_META[t].label}`}
                >
                  {TARGET_META[t].icon}
                </button>
              ))}
              <button
                onClick={() => stepScale(-1)}
                className="rounded border border-rpg-border bg-rpg-panel px-1.5 py-0.5 text-[10px] text-gray-300 hover:text-white"
                title="缩小"
              >
                −
              </button>
              <span className="min-w-9 text-center text-[9px] font-bold text-rpg-gold">
                {(curVal * 100).toFixed(0)}%
              </span>
              <button
                onClick={() => stepScale(1)}
                className="rounded border border-rpg-border bg-rpg-panel px-1.5 py-0.5 text-[10px] text-gray-300 hover:text-white"
                title="放大"
              >
                +
              </button>
              <button
                onClick={() =>
                  setTfs((cur) =>
                    target === 'frame'
                      ? { ...cur, frameScale: 1 }
                      : { ...cur, [target]: { ...DEFAULT_TF } },
                  )
                }
                className="rounded border border-rpg-border bg-rpg-panel px-1.5 py-0.5 text-[10px] text-gray-300 hover:text-white"
                title={`恢复${TARGET_META[target].label}默认`}
              >
                ↺
              </button>
            </>
          )}
          <button
            onClick={() => setAdjusting((v) => !v)}
            className={`rounded border px-1.5 py-0.5 text-[10px] transition-all ${
              adjusting
                ? 'border-rpg-gold bg-rpg-gold/20 text-rpg-gold'
                : 'border-rpg-border bg-rpg-panel text-gray-400 hover:border-rpg-gold/60 hover:text-rpg-gold'
            }`}
            title={adjusting ? '完成调整' : '调整位置和大小（形象 / 背景分层）'}
          >
            {adjusting ? '✓ 完成' : '✥'}
          </button>
        </div>
      </div>
    </StageLayersContext.Provider>
  )
}

/**
 * Live2D 形象全屏展示模态
 *
 * 任意页面角色画框的 🔍 按钮（ZoomHint）点击打开；
 * 大尺寸完整展示当前形象 —— 点击身体/头部触发反应动作、视线跟随鼠标，
 * 内置形象切换器（含宝箱限定款锁定状态），Esc / 点击遮罩关闭。
 *
 * 打开方式：import { openLive2DShowcase } 后调用（模块级状态，无需 store）
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useGameStore } from '../store/useGameStore'
import { Live2DCharacter } from './Live2DCharacter'
import { ModelSwitcher } from './ModelSwitcher'
import { OutfitSwitcher } from './OutfitSwitcher'
import { getModelChoice, subscribeModelChoice, LIVE2D_MODELS } from '../config/live2dModels'
import { titleForLevel } from '../config/xpConfig'
import { openLive2DInspector, isInspectorOpen } from './Live2DInspector'

// ===== 开关状态（模块级 + 订阅） =====

let openFlag = false
const listeners = new Set<() => void>()

const notify = () => listeners.forEach((l) => l())

export const openLive2DShowcase = () => {
  openFlag = true
  notify()
}

const closeShowcase = () => {
  openFlag = false
  notify()
}

/** 画框角上的放大按钮（hover 显示；stopPropagation 避免与 Live2D 点击交互冲突） */
export const ZoomHint: React.FC = () => (
  <button
    onClick={(e) => {
      e.stopPropagation()
      openLive2DShowcase()
    }}
    title="放大查看形象"
    aria-label="放大查看形象"
    className="absolute right-0.5 top-0.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-rpg-gold/60 bg-rpg-bg/80 text-[11px] text-rpg-gold opacity-0 backdrop-blur-sm transition-all hover:scale-110 group-hover:opacity-100"
  >
    🔍
  </button>
)

/** 画框角上的动作按钮（hover 显示；直达细节查看器并自动展开动作面板，无需先 🔍） */
export const MotionHint: React.FC = () => (
  <button
    onClick={(e) => {
      e.stopPropagation()
      openLive2DInspector(undefined, { autoMotions: true })
    }}
    title="查看全部动作"
    aria-label="查看全部动作"
    className="absolute right-8 top-0.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-rpg-gold/60 bg-rpg-bg/80 text-[11px] text-rpg-gold opacity-0 backdrop-blur-sm transition-all hover:scale-110 group-hover:opacity-100"
  >
    🎬
  </button>
)

export const Live2DShowcase: React.FC = () => {
  const player = useGameStore((s) => s.state.player)
  const isOpen = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => openFlag,
  )
  const modelId = useSyncExternalStore(subscribeModelChoice, getModelChoice)
  const modelDef = LIVE2D_MODELS.find((m) => m.id === modelId) ?? LIVE2D_MODELS[0]

  // 大画框尺寸：随视口自适应（宽 92% / 高 68% / 上限 680），完整角色大展示
  const [size, setSize] = useState(560)
  useEffect(() => {
    const calc = () =>
      setSize(Math.round(Math.min(window.innerWidth * 0.92, window.innerHeight * 0.68, 680)))
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [])

  // Esc 关闭（细节查看器打开时避让，只关它自己）
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isInspectorOpen()) closeShowcase()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center animate-fade-in bg-black/80 p-4"
      onClick={closeShowcase}
    >
      <div
        className="rpg-panel relative flex max-h-[92vh] w-full max-w-2xl flex-col items-center gap-3 overflow-y-auto rounded-2xl border-4 border-rpg-gold px-4 py-5 shadow-gold"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={closeShowcase}
          aria-label="关闭"
          className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full border border-rpg-border bg-rpg-panel text-[11px] text-gray-400 transition-all hover:border-rpg-gold hover:text-rpg-gold"
        >
          ✕
        </button>

        <div className="pixel-text text-xs text-rpg-gold">CHARACTER VIEW</div>
        <div className="-mt-2 text-[10px] text-gray-400">
          {modelDef.icon} {modelDef.label} · Cubism {modelDef.cubism}
        </div>

        <Live2DCharacter level={player.level} size={size} quality={2} />

        <div className="-mt-1 text-center">
          <div className="text-sm font-bold text-white">{player.name}</div>
          <div className="text-[10px] text-purple-300">
            「{player.currentTitle ?? titleForLevel(player.level)}」
          </div>
        </div>

        <ModelSwitcher />
        <OutfitSwitcher />

        <button
          onClick={() => openLive2DInspector(modelId)}
          className="rounded-lg border-2 border-rpg-gold/70 bg-rpg-panelLight px-4 py-1.5 text-[11px] text-rpg-gold transition-all hover:bg-rpg-gold hover:text-rpg-bg active:scale-95"
        >
          🔬 细节查看（超大画面 · 缩放平移）
        </button>

        <div className="text-[9px] text-gray-500">点击形象不同部位有惊喜 · Esc 或点击空白处关闭</div>
      </div>
    </div>
  )
}

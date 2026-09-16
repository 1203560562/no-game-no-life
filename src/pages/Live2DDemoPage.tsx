/**
 * Live2D 纸片人 · 效果预览页（临时 demo，验证画风与交互手感）
 *
 * 技术栈：pixi.js v6 + pixi-live2d-display（guansss，MIT，1.1k★）
 * 模型：Live2D 官方免费示例（Haru / Shizuku，随 pixi-live2d-display 测试资源分发）
 *
 * 预览要点：
 * 1. VTuber 级立绘画风（对比 VRM 3D 的核心差异）
 * 2. 视线跟随鼠标 + 点击身体/头部触发反应动作（含语音）
 * 3. 动作组 / 表情切换
 * 4. 说话嘴型模拟（LipSync 参数注入）
 *
 * ⚠️ 换装局限演示：服装是烘焙进贴图的，无法像 VRM/LPC 那样逐件叠加装备
 */

import { useEffect, useRef, useState } from 'react'
import * as PIXI from 'pixi.js'
// ⚠️ 仅类型导入：库在模块顶层校验 window.Live2D / window.Live2DCubismCore，
// 静态导入会在核心脚本加载前求值并抛错（整页白屏），必须在脚本就绪后动态 import
import type { Live2DModel } from 'pixi-live2d-display'

const MODELS = [
  { id: 'haru', label: '🎧 Haru', cubism: 4, url: '/live2d/haru/haru_greeter_t03.model3.json', idleGroup: 'Idle' },
  { id: 'shizuku', label: '👗 Shizuku', cubism: 2, url: '/live2d/shizuku/shizuku.model.json', idleGroup: 'idle' },
] as const

const MOTION_LABELS: Record<string, string> = {
  idle: '待机', Idle: '待机',
  tap: '点击反应', Tap: '点击反应',
  tap_body: '戳身体', flick_head: '摸头',
  pinch_in: '捏脸(内)', pinch_out: '捏脸(外)', shake: '摇晃',
}

/** 幂等加载 script（Cubism 核心运行时） */
const loadedScripts = new Map<string, Promise<void>>()
const loadScript = (src: string) => {
  let p = loadedScripts.get(src)
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src
      s.onload = () => resolve()
      s.onerror = () => reject(new Error(`核心加载失败: ${src}`))
      document.head.appendChild(s)
    })
    loadedScripts.set(src, p)
  }
  return p
}

/** 控制按钮 */
const Chip: React.FC<{ active?: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`rounded-lg border-2 px-2.5 py-1 text-[11px] transition-all ${
      active ? 'border-rpg-gold bg-rpg-gold/20 text-rpg-gold' : 'border-rpg-border bg-rpg-panel text-gray-400 hover:text-white'
    }`}
  >
    {children}
  </button>
)

export const Live2DDemoPage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PIXI.Application | null>(null)
  const modelRef = useRef<Live2DModel | null>(null)
  /** 动态导入的库实例（核心脚本就绪后才可用） */
  const libRef = useRef<typeof import('pixi-live2d-display') | null>(null)
  const naturalRef = useRef({ w: 1, h: 1 })
  const zoomRef = useRef(1)
  const speakingRef = useRef(false)

  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modelId, setModelId] = useState<string>(MODELS[0].id)
  const [groups, setGroups] = useState<string[]>([])
  const [expressions, setExpressions] = useState<string[]>([])
  const [zoom, setZoom] = useState(1)
  const [speaking, setSpeaking] = useState(false)
  const [hint, setHint] = useState('')

  const model = MODELS.find((m) => m.id === modelId) ?? MODELS[0]

  /** 适配画框：按自然尺寸等比缩放居中 */
  const fit = () => {
    const app = appRef.current
    const m = modelRef.current
    if (!app || !m) return
    const s =
      Math.min(app.renderer.width / naturalRef.current.w, app.renderer.height / naturalRef.current.h) * 0.96 * zoomRef.current
    m.scale.set(s)
    m.position.set(app.renderer.width / 2, app.renderer.height / 2)
  }

  // ===== 1. 初始化：先加载 Cubism 2/4 核心脚本 → 动态导入库 → 创建 PIXI 应用 =====
  useEffect(() => {
    let disposed = false
    let app: PIXI.Application | null = null
    ;(async () => {
      try {
        await Promise.all([loadScript('/live2d/live2dcubismcore.min.js'), loadScript('/live2d/live2d.min.js')])
        // 核心就绪后才能加载库（库模块顶层会校验运行时是否存在）
        const lib = await import('pixi-live2d-display')
        lib.Live2DModel.registerTicker(PIXI.Ticker)
        libRef.current = lib
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        return
      }
      if (disposed || !containerRef.current) return
      app = new PIXI.Application({ backgroundAlpha: 0, antialias: true, preserveDrawingBuffer: true, resizeTo: containerRef.current })
      containerRef.current.appendChild(app.view)
      appRef.current = app
      setReady(true)
    })()
    return () => {
      disposed = true
      app?.destroy(true, { children: true })
      appRef.current = null
      modelRef.current = null
      setReady(false)
    }
  }, [])

  // ===== 2. 加载模型（模型切换时重建） =====
  useEffect(() => {
    const lib = libRef.current
    if (!ready || !appRef.current || !lib) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        // 先读模型设置，生成动作/表情按钮元数据
        const json = await (await fetch(model.url)).json()
        if (cancelled) return
        const motionMap: Record<string, unknown> = json.FileReferences?.Motions ?? json.motions ?? {}
        const exprList: { Name?: string; name?: string }[] = json.FileReferences?.Expressions ?? json.expressions ?? []
        const motionKeys = Object.keys(motionMap)
        setGroups(motionKeys)
        setExpressions(exprList.map((e) => e.Name ?? e.name ?? '').filter(Boolean))

        const m = await lib.Live2DModel.from(model.url, {
          autoInteract: true, // 指针移动 → 视线跟随；点击 → hit 事件
          idleMotionGroup: model.idleGroup,
        })
        if (cancelled) {
          m.destroy()
          return
        }

        // 替换旧模型（切换期间旧模型保持可见）
        if (modelRef.current) {
          appRef.current?.stage.removeChild(modelRef.current)
          modelRef.current.destroy()
        }
        modelRef.current = m
        naturalRef.current = { w: m.width, h: m.height }
        m.anchor.set(0.5, 0.5)
        appRef.current?.stage.addChild(m)
        fit()
        setLoading(false)

        // 点击命中区域 → 触发对应动作组（head→摸头 / body→戳身体，含语音）
        m.on('hit', (areas: string[]) => {
          setHint(`命中: ${areas.join(', ')}`)
          for (const area of areas) {
            const a = area.toLowerCase().replace(/\s+/g, '_')
            const group = [`tap_${a}`, `flick_${a}`, 'tap', 'Tap', 'tap_body'].find((g) => motionKeys.includes(g))
            if (group) {
              m.motion(group)
              return
            }
          }
        })

        // 说话嘴型：每帧在模型更新前注入 LipSync 参数（两版 Cubism 参数 id 不同）
        m.internalModel.on('beforeModelUpdate', () => {
          if (!speakingRef.current) return
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const core = (m.internalModel as any).coreModel
          const v = Math.abs(Math.sin(performance.now() / 85)) * 1.15
          if (typeof core.setParameterValueById === 'function') core.setParameterValueById('ParamMouthOpenY', v)
          else core.setParamFloat?.('PARAM_MOUTH_OPEN_Y', v)
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ready, modelId, model.url, model.idleGroup])

  // ===== 3. 画框尺寸变化 → 重新适配 =====
  useEffect(() => {
    if (!ready || !containerRef.current) return
    const ro = new ResizeObserver(() => fit())
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [ready])

  // 状态同步到 ref
  useEffect(() => {
    zoomRef.current = zoom
    fit()
  }, [zoom])
  useEffect(() => {
    speakingRef.current = speaking
  }, [speaking])

  return (
    <div className="rpg-panel p-5">
      {/* 标题 */}
      <div className="mb-4">
        <h1 className="pixel-text text-sm text-rpg-gold">🎭 Live2D 纸片人 · 效果预览</h1>
        <p className="mt-1 text-[11px] text-gray-400">
          pixi-live2d-display 渲染 · 视线跟随鼠标 · 点击身体/头部有反应动作（含语音）· 说话嘴型模拟
        </p>
      </div>

      {/* 画布 */}
      <div
        ref={containerRef}
        className="relative flex h-[480px] items-center justify-center overflow-hidden rounded-xl border-2 border-rpg-border bg-gradient-to-b from-rpg-panelLight/50 to-transparent"
      >
        {(loading || error) && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-rpg-bg/40">
            {error ? (
              <span className="text-[11px] text-rose-400">加载失败: {error}</span>
            ) : (
              <span className="pixel-text animate-pulse text-[11px] text-rpg-gold">加载模型中...</span>
            )}
          </div>
        )}
        {hint && !loading && (
          <div className="pointer-events-none absolute right-2 top-2 rounded-lg border border-rpg-border bg-rpg-panel/80 px-2 py-1 text-[10px] text-gray-400">
            {hint}
          </div>
        )}
      </div>

      {/* 控制面板 */}
      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-[10px] text-gray-500">模型</span>
          {MODELS.map((m) => (
            <Chip key={m.id} active={modelId === m.id} onClick={() => setModelId(m.id)}>
              {m.label} <span className="text-gray-600">C{m.cubism}</span>
            </Chip>
          ))}
          <span className="ml-2 text-[10px] text-gray-600">（Cubism 4 新版 / Cubism 2 经典）</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-[10px] text-gray-500">动作组</span>
          {groups.map((g) => (
            <Chip key={g} onClick={() => modelRef.current?.motion(g)}>
              {MOTION_LABELS[g] ?? g}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-[10px] text-gray-500">表情</span>
          {expressions.map((name) => (
            <Chip key={name} onClick={() => modelRef.current?.expression(name)}>
              {name}
            </Chip>
          ))}
          {expressions.length === 0 && <span className="text-[10px] text-gray-600">（当前模型无表情）</span>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-[10px] text-gray-500">交互</span>
          <Chip active={speaking} onClick={() => setSpeaking((v) => !v)}>
            💬 说话嘴型 {speaking ? 'ON' : 'OFF'}
          </Chip>
          <div className="ml-2 flex items-center gap-2">
            <span className="text-[10px] text-gray-500">缩放</span>
            <input
              type="range"
              min={0.5}
              max={1.6}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-32 accent-amber-400"
            />
            <span className="text-[10px] text-gray-500">{Math.round(zoom * 100)}%</span>
          </div>
        </div>
      </div>

      {/* 使用提示 */}
      <div className="mt-4 rounded-xl border-2 border-rpg-border bg-rpg-panelLight/30 p-3 text-[11px] leading-relaxed text-gray-400">
        💡 鼠标在画布内移动，角色视线和头部会跟随；点击她的<b className="text-gray-200">头部</b>或<b className="text-gray-200">身体</b>有反应动作（Haru 带日语语音）；
        开启「说话嘴型」后嘴会持续开合，模拟播报/对话场景。
      </div>

      {/* 对比说明 */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border-2 border-emerald-600/50 bg-emerald-500/10 p-3">
          <div className="text-[11px] font-bold text-emerald-300">✅ Live2D 强项</div>
          <p className="mt-1 text-[10px] leading-relaxed text-gray-400">
            立绘精度天花板（VTuber 同款技术）；纸片人反而更贴合网页助手场景；交互灵动（视线/点击/嘴型）。
          </p>
        </div>
        <div className="rounded-xl border-2 border-rose-600/50 bg-rose-500/10 p-3">
          <div className="text-[11px] font-bold text-rose-300">⚠️ Live2D 短板</div>
          <p className="mt-1 text-[10px] leading-relaxed text-gray-400">
            <b>换装体系不可行</b>——服装烘焙进贴图，装备槽位（帽子/武器/翅膀…）只能整体换模型或作废；正式商用模型基本都收费。
          </p>
        </div>
        <div className="rounded-xl border-2 border-rpg-border bg-rpg-panelLight/30 p-3">
          <div className="text-[11px] font-bold text-gray-300">🔗 对比参考</div>
          <p className="mt-1 text-[10px] leading-relaxed text-gray-400">
            VRM 3D 预览页：<span className="text-rpg-gold">/vrm-demo</span>（可换装、可挂装备）；两者都看过后再决定方向。
          </p>
        </div>
      </div>

      <p className="mt-3 text-center text-[10px] text-gray-600">
        模型：Live2D 官方免费示例数据（Haru / Shizuku，随 pixi-live2d-display 测试资源分发） · 依赖：pixi.js v6 + pixi-live2d-display（MIT）
      </p>
    </div>
  )
}

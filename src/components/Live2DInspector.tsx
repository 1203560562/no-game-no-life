/**
 * Live2D 细节查看器（全屏 + 自由缩放平移）
 *
 * 从角色展示模态（Live2DShowcase）的「🔬 细节查看」进入；
 * 超大画布占满视口，高分辨率渲染（devicePixelRatio 封顶 3），支持：
 * - 滚轮缩放（以鼠标位置为中心，0.4x ~ 6x）
 * - 拖拽平移 · 双击复位
 * - 点击身体/头部触发反应动作（与主画框一致）
 * - ‹ › 切换已解锁形象（仅本地查看，不改变全局选择）
 * - Esc / 点击遮罩关闭
 *
 * 结构：外层 Live2DInspector 管开合（常驻 App），内层 InspectorView
 * 仅在打开时挂载 —— PIXI 应用随开随建、随关随销，避免空挂载初始化。
 *
 * GL 上下文：与 Live2DCharacter 共享 epoch 广播机制 ——
 * 本查看器卸载销毁上下文时 bump，其他存活实例重建着色器，反之亦然。
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import * as PIXI from 'pixi.js'
import { loadLive2DLib, type Live2DModel } from '../lib/live2dRuntime'
import { getModelChoice, LIVE2D_MODELS, isModelUnlocked, getOutfitChoice, subscribeOutfitChoice } from '../config/live2dModels'
import { bumpCtxEpoch, subscribeCtxEpoch, getCtxEpoch, findTapGroup, claimLive2DRender, releaseLive2DRender } from './Live2DCharacter'
import { OutfitSwitcher } from './OutfitSwitcher'

// ===== 开关状态（模块级 + 订阅） =====

let openFlag = false
let targetModelId: string | null = null
/** 本次打开是否自动展开动作面板（主画框 🎬 按钮直达；挂载时消费并复位） */
let autoMotions = false
const listeners = new Set<() => void>()

const notify = () => listeners.forEach((l) => l())

/** 打开细节查看器；modelId 缺省查看当前选中形象；opts.autoMotions 自动展开动作面板 */
export const openLive2DInspector = (modelId?: string, opts?: { autoMotions?: boolean }) => {
  targetModelId = modelId ?? getModelChoice()
  autoMotions = !!opts?.autoMotions
  openFlag = true
  notify()
}

const closeInspector = () => {
  openFlag = false
  notify()
}

/** 细节查看器是否打开（Showcase 的 Esc 需避让：Inspector 打开时只有它响应） */
export const isInspectorOpen = () => openFlag

const FIT_MARGIN = 0.9
const MIN_SCALE = 0.4
const MAX_SCALE = 6

/** 内层视图：挂载即建 PIXI，卸载即销毁（bump epoch 通知存活实例重建着色器） */
const InspectorView: React.FC<{ initialModelId: string }> = ({ initialModelId }) => {
  const [viewId, setViewId] = useState(initialModelId)
  const modelDef = LIVE2D_MODELS.find((m) => m.id === viewId) ?? LIVE2D_MODELS[0]

  // 当前查看形象的服饰（换装：模型加载后应用 + 切换时热替换贴图）
  const outfitId = useSyncExternalStore(
    subscribeOutfitChoice,
    () => getOutfitChoice(viewId),
    () => getOutfitChoice(viewId),
  )
  /** 热替换贴图：渲染循环每帧从 model.textures 取纹理，替换后下一帧生效 */
  const applyOutfit = (m: Live2DModel) => {
    const outfit = modelDef.outfits?.find((o) => o.id === outfitId)
    if (!outfit) return
    const textures = (m as unknown as { textures: PIXI.Texture[] }).textures
    if (!textures || outfit.textureIndex >= textures.length) return
    textures[outfit.textureIndex] = PIXI.Texture.from(outfit.texture)
  }
  useEffect(() => {
    if (modelRef.current) applyOutfit(modelRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outfitId, modelDef.id])

  // 已解锁形象清单（‹ › 循环切换）
  const viewable = LIVE2D_MODELS.filter((m) => isModelUnlocked(m.id))
  const idx = viewable.findIndex((m) => m.id === viewId)

  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PIXI.Application | null>(null)
  const modelRef = useRef<Live2DModel | null>(null)
  const naturalRef = useRef({ w: 1, h: 1 })
  const fitScaleRef = useRef(1)
  const motionGroupsRef = useRef<string[]>([])
  /** 用户已手动缩放/平移（容器变化时不再自动复位适配） */
  const userZoomedRef = useRef(false)
  const [zoomLabel, setZoomLabel] = useState('100%')
  /** 动作面板：全部动作（组+序号+显示名）与面板开合。
   *  初始值消费模块级 autoMotions（主画框 🎬 直达入口，仅本次打开生效） */
  const [motionList, setMotionList] = useState<Array<{ group: string; index: number; label: string }>>([])
  const [showMotions, setShowMotions] = useState(() => {
    const v = autoMotions
    autoMotions = false
    return v
  })
  const [activeMotion, setActiveMotion] = useState('')

  // 其他实例卸载 → 重置本实例 GL 上下文标记（着色器重建）
  const epoch = useSyncExternalStore(subscribeCtxEpoch, getCtxEpoch)
  useEffect(() => {
    if (epoch === 0 || !modelRef.current) return
    ;(modelRef.current as unknown as { glContextID: number }).glContextID = -1
  }, [epoch])

  /** drawable 顶点联合包围盒（与 Live2DCharacter 同款；Cubism2 无 API 时回退画布盒） */
  const contentBounds = (
    m: Live2DModel,
  ): { minX: number; minY: number; maxX: number; maxY: number } | null => {
    try {
      const im = m.internalModel as unknown as {
        coreModel: {
          getDrawableCount?: () => number
          getNumDrawData?: () => number
          getDrawableOpacity?: (i: number) => number
        }
        getDrawableVertices: (i: number) => Float32Array | number[]
        localTransform: { a: number; d: number; tx: number; ty: number }
      }
      const count = im.coreModel.getDrawableCount?.() ?? im.coreModel.getNumDrawData?.() ?? 0
      if (!count) return null
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      const lt = im.localTransform
      for (let i = 0; i < count; i++) {
        if ((im.coreModel.getDrawableOpacity?.(i) ?? 1) < 0.01) continue
        const v = im.getDrawableVertices(i)
        for (let j = 0; j + 1 < v.length; j += 2) {
          const x = lt.tx + v[j] * lt.a
          const y = lt.ty + v[j + 1] * lt.d
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
      if (!Number.isFinite(minX)) return null
      return { minX, minY, maxX, maxY }
    } catch {
      return null
    }
  }

  /** 初始适配：内容包围盒缩放居中；记录基准缩放供复位与百分比显示。
   *  应用注册表 viewZoom/viewOffset*（与主画框一致，如斯佩伯爵放大、吸血鬼居中修正） */
  const fit = (app: PIXI.Application, m: Live2DModel) => {
    const w = naturalRef.current.w
    const h = naturalRef.current.h
    const b = contentBounds(m)
    const bw = b ? b.maxX - b.minX : w
    const bh = b ? b.maxY - b.minY : h
    const s =
      Math.min(app.screen.width / bw, app.screen.height / bh) * FIT_MARGIN * (modelDef.viewZoom ?? 1)
    m.scale.set(s)
    fitScaleRef.current = s
    const cx = b ? (b.minX + b.maxX) / 2 : w / 2
    const cy = b ? (b.minY + b.maxY) / 2 : h / 2
    m.position.set(
      app.screen.width / 2 - (cx - w / 2) * s + (modelDef.viewOffsetX ?? 0) * app.screen.width,
      app.screen.height / 2 - (cy - h / 2) * s + (modelDef.viewOffsetY ?? 0) * app.screen.height,
    )
    setZoomLabel('100%')
  }

  // ===== 初始化 PIXI（挂载即建） =====
  useEffect(() => {
    let disposed = false
    let app: PIXI.Application | null = null
    /** 渲染权回调：active → ticker 起动；否则停止（让位给更新挂载的实例） */
    const resume = (active: boolean) => {
      const a = appRef.current
      if (!a) return
      if (active) a.ticker.start()
      else a.ticker.stop()
    }
    ;(async () => {
      try {
        await loadLive2DLib()
      } catch {
        return
      }
      if (disposed || !containerRef.current) return
      app = new PIXI.Application({
        backgroundAlpha: 0,
        antialias: true,
        preserveDrawingBuffer: true,
        // 细节查看：渲染分辨率上限提到 3（常规画框为 2），放大后依然锐利
        resolution: Math.min(window.devicePixelRatio || 1, 3),
        autoDensity: true,
        resizeTo: containerRef.current,
      })
      containerRef.current.appendChild(app.view)
      appRef.current = app
      claimLive2DRender(resume)
    })()
    return () => {
      disposed = true
      releaseLive2DRender(resume)
      app?.destroy(true, { children: true })
      appRef.current = null
      modelRef.current = null
      bumpCtxEpoch()
    }
  }, [])

  // ===== 加载/切换模型 =====
  useEffect(() => {
    let cancelled = false
    let model: Live2DModel | null = null
    ;(async () => {
      let waited = 0
      while (!appRef.current && !cancelled && waited < 10_000) {
        await new Promise((r) => setTimeout(r, 100))
        waited += 100
      }
      const app = appRef.current
      const lib = await loadLive2DLib().catch(() => null)
      if (cancelled || !app || !lib) return

      try {
        model = await lib.Live2DModel.from(modelDef.url, {
          autoInteract: true,
          idleMotionGroup: modelDef.idleGroup,
        })
      } catch {
        return
      }
      if (cancelled) {
        model.destroy()
        return
      }

      if (modelRef.current) {
        app.stage.removeChild(modelRef.current)
        modelRef.current.destroy()
      }
      modelRef.current = model
      model.anchor.set(0.5, 0.5)
      naturalRef.current = { w: model.width, h: model.height }
      app.stage.addChild(model)
      // 加载完成后应用当前选中服饰（outfit effect 可能在模型就绪前已跑过）
      applyOutfit(model)
      fit(app, model)
      userZoomedRef.current = false

      const mm = model.internalModel?.motionManager?.definitions
      motionGroupsRef.current = mm ? Object.keys(mm) : []

      // 构建动作清单（组名 → 动作数组展开；文件名去路径去后缀作为显示名）
      const list: Array<{ group: string; index: number; label: string }> = []
      for (const [group, arr] of Object.entries(mm ?? {})) {
        const motions = arr ?? []
        motions.forEach((mo, index) => {
          // moc3 用大写 File，Cubism 2 model.json 用小写 file
          const file = (mo as { File?: string; file?: string }).File ?? (mo as { file?: string }).file ?? ''
          const label = file.split('/').pop()?.replace(/\.(motion3|mt[n3]?|mtn)\.?(json)?$/i, '') ?? `${index + 1}`
          list.push({ group, index, label: label || `${index + 1}` })
        })
      }
      setMotionList(list)
      setActiveMotion('')

      // 空字符串待机组强制同步（部分模型组名为空串）
      const manager = model.internalModel?.motionManager as
        | { groups: { idle: string }; startRandomMotion: (g: string) => unknown }
        | undefined
      if (manager && manager.groups.idle !== modelDef.idleGroup && mm && modelDef.idleGroup in mm) {
        manager.groups.idle = modelDef.idleGroup
        void manager.startRandomMotion(modelDef.idleGroup)
      }

      model.on('hit', (areas: string[]) => {
        const group = findTapGroup(areas, motionGroupsRef.current)
        if (group) modelRef.current?.motion(group)
      })
    })()
    return () => {
      cancelled = true
    }
  }, [modelDef.url, modelDef.idleGroup])

  // ===== 缩放 / 平移 / 复位（DOM 事件层，比 PIXI interaction 更可控） =====
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const toCanvasPoint = (e: { clientX: number; clientY: number }) => {
      const rect = el.getBoundingClientRect()
      return new PIXI.Point(e.clientX - rect.left, e.clientY - rect.top)
    }

    const zoomAt = (factor: number, at: PIXI.Point) => {
      const m = modelRef.current
      if (!m) return
      userZoomedRef.current = true
      const old = m.scale.x
      const next = Math.max(MIN_SCALE * fitScaleRef.current, Math.min(MAX_SCALE * fitScaleRef.current, old * factor))
      if (next === old) return
      // anchor(0.5,0.5)：local→screen 为 sxy = m.xy + (lxy - natural/2) * scale
      // 先求 at 的局部坐标，再以新缩放算回世界坐标，平移使该点固定在鼠标下
      const nw = naturalRef.current.w
      const nh = naturalRef.current.h
      const lx = (at.x - m.x) / old + nw / 2
      const ly = (at.y - m.y) / old + nh / 2
      m.scale.set(next)
      m.position.x += at.x - (m.x + (lx - nw / 2) * next)
      m.position.y += at.y - (m.y + (ly - nh / 2) * next)
      setZoomLabel(Math.round((next / fitScaleRef.current) * 100) + '%')
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, toCanvasPoint(e))
    }

    // 拖拽平移（点击交给 PIXI hit 交互）
    let dragging = false
    let last: PIXI.Point | null = null
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      dragging = true
      last = toCanvasPoint(e)
      el.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging || !last) return
      const p = toCanvasPoint(e)
      const m = modelRef.current
      if (m) {
        m.position.x += p.x - last.x
        m.position.y += p.y - last.y
        userZoomedRef.current = true
      }
      last = p
    }
    const onUp = () => {
      dragging = false
      last = null
    }

    const onDbl = () => {
      const app = appRef.current
      const m = modelRef.current
      if (app && m) {
        fit(app, m)
        userZoomedRef.current = false
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('dblclick', onDbl)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('dblclick', onDbl)
    }
  }, [])

  // ===== 容器尺寸变化（窗口缩放/布局稳定）→ canvas 重测 + 未手动操作时复位适配 =====
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(() => {
      const app = appRef.current
      const m = modelRef.current
      if (app && m) {
        app.resize()
        if (!userZoomedRef.current) fit(app, m)
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // ===== 键盘：Esc 关闭 / 方向键切换 =====
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeInspector()
      if (e.key === 'ArrowLeft' && idx > 0) setViewId(viewable[idx - 1].id)
      if (e.key === 'ArrowRight' && idx < viewable.length - 1) setViewId(viewable[idx + 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, viewable])

  const switchTo = (dir: 1 | -1) => {
    if (viewable.length === 0) return
    const n = (idx + dir + viewable.length) % viewable.length
    setViewId(viewable[n].id)
  }

  /** 播放指定动作（组+序号；FORCE 优先级打断待机循环） */
  const playMotion = (group: string, index: number) => {
    const m = modelRef.current
    const manager = m?.internalModel?.motionManager as
      | { startMotion: (g: string, i?: number, priority?: number) => unknown }
      | undefined
    if (!manager) return
    try {
      void manager.startMotion(group, index, 3)
      setActiveMotion(`${group}#${index}`)
    } catch {
      /* 库版本差异忽略 */
    }
  }

  /** 按组折叠的动作清单（空组名显示「通用」） */
  const motionGroups = motionList.reduce<Array<{ group: string; items: typeof motionList }>>((acc, mo) => {
    const last = acc[acc.length - 1]
    if (last && last.group === mo.group) last.items.push(mo)
    else acc.push({ group: mo.group, items: [mo] })
    return acc
  }, [])

  return (
    <div className="fixed inset-0 z-[88] flex flex-col bg-black/95 animate-fade-in">
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="pixel-text text-xs text-rpg-gold">INSPECTOR · 细节查看</div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-400">
            {modelDef.icon} {modelDef.label} · Cubism {modelDef.cubism} · {zoomLabel}
          </span>
          <button
            onClick={() => setShowMotions((v) => !v)}
            disabled={motionList.length === 0}
            className={`rounded-lg border px-2 py-0.5 text-[10px] transition-all disabled:opacity-30 ${
              showMotions
                ? 'border-rpg-gold bg-rpg-gold/10 text-rpg-gold'
                : 'border-rpg-border bg-rpg-panel text-gray-300 hover:border-rpg-gold hover:text-rpg-gold'
            }`}
          >
            🎬 动作 ({motionList.length})
          </button>
          <button
            onClick={closeInspector}
            aria-label="关闭"
            className="flex h-6 w-6 items-center justify-center rounded-full border border-rpg-border bg-rpg-panel text-[11px] text-gray-400 transition-all hover:border-rpg-gold hover:text-rpg-gold"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 画布区 */}
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" />

        {/* 动作面板：右侧抽屉（列出模型全部动作，点击播放） */}
        {showMotions && motionList.length > 0 && (
          <div className="absolute right-0 top-0 z-10 flex h-full w-52 flex-col border-l border-rpg-border bg-rpg-bg/95 backdrop-blur-sm">
            <div className="border-b border-rpg-border px-3 py-2 text-[10px] text-rpg-gold">
              动作一览 · {motionList.length} 个
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {motionGroups.map(({ group, items }) => (
                <div key={group} className="mb-2">
                  <div className="mb-1 px-1 text-[9px] uppercase tracking-wide text-gray-500">
                    {group === '' ? '◦ 通用' : group}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {items.map((mo) => (
                      <button
                        key={`${mo.group}#${mo.index}`}
                        onClick={() => playMotion(mo.group, mo.index)}
                        title={mo.group === '' ? mo.label : `${mo.group} / ${mo.label}`}
                        className={`rounded border px-1.5 py-0.5 text-[9px] transition-all ${
                          activeMotion === `${mo.group}#${mo.index}`
                            ? 'border-rpg-gold bg-rpg-gold/20 text-rpg-gold'
                            : 'border-rpg-border bg-rpg-panel text-gray-300 hover:border-rpg-gold/60 hover:text-rpg-gold'
                        }`}
                      >
                        {mo.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 底栏：形象切换 + 服饰切换 + 操作提示 */}
      <div className="flex items-center justify-center gap-4 px-4 py-2">
        <button
          onClick={() => switchTo(-1)}
          disabled={viewable.length < 2}
          className="rounded-lg border border-rpg-border bg-rpg-panel px-3 py-1 text-sm text-gray-300 transition-all hover:border-rpg-gold hover:text-rpg-gold disabled:opacity-30"
        >
          ‹
        </button>
        <div className="min-w-0 max-w-md flex-1">
          <OutfitSwitcher modelIdOverride={viewId} />
        </div>
        <button
          onClick={() => switchTo(1)}
          disabled={viewable.length < 2}
          className="rounded-lg border border-rpg-border bg-rpg-panel px-3 py-1 text-sm text-gray-300 transition-all hover:border-rpg-gold hover:text-rpg-gold disabled:opacity-30"
        >
          ›
        </button>
      </div>
      <div className="pb-2 text-center text-[10px] text-gray-500">
        滚轮缩放 · 拖拽平移 · 双击复位 · 点击形象互动 · ←/→ 切换 · Esc 关闭
      </div>
    </div>
  )
}

export const Live2DInspector: React.FC = () => {
  const isOpen = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => openFlag,
  )

  if (!isOpen) return null

  // 锁定形象回退当前选择
  const target = targetModelId ?? getModelChoice()
  const initial = isModelUnlocked(target) ? target : getModelChoice()

  // key 含 initial：再次打开时强制重建内层（state 初始化取最新 target）
  return <InspectorView key={initial} initialModelId={initial} />
}

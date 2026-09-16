/**
 * 角色渲染 v5 —— Live2D 纸片人（多形象可选）
 *
 * 技术栈：pixi.js v6 + pixi-live2d-display（核心运行时见 lib/live2dRuntime.ts）
 *
 * - 形象由 config/live2dModels.ts 注册表 + localStorage 选择驱动（背包页可切换）
 * - 背景装饰由 config/backgrounds.ts 选择驱动（画框底层渲染，背包页可切换）
 * - 姿态映射：idle→待机动作组；attack/cast/cheer/walk→点击反应动作
 * - 视线跟随鼠标；点击命中区域触发对应反应动作（模型 hit_areas 定义）
 */

import { useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import * as PIXI from 'pixi.js'
import { loadLive2DLib, type Live2DModel } from '../lib/live2dRuntime'
import { getModelChoice, subscribeModelChoice, LIVE2D_MODELS, getOutfitChoice, subscribeOutfitChoice } from '../config/live2dModels'
import { subscribePlayMotion, getPlayMotion } from '../lib/live2dMotionBus'
import { getBackgroundChoice, subscribeBackgroundChoice } from '../config/backgrounds'
import { BackgroundLayer } from './BackgroundLayer'
import { StageLayersContext, stageTfStyle } from './StageAdjust'
import type { CharacterPose } from './Character'

/** 内容适配留边系数：<1 留出少量余量，防止待机动作超出静态包围盒时被裁 */
const FIT_MARGIN = 0.96

// ===== GL 上下文修复 =====
// pixi-live2d-display 的着色器是全局单例，随最后一次渲染它的 WebGL 上下文重建。
// 当弹层实例（展示模态/宝箱预览）卸载销毁自己的上下文后，单例仍指向死上下文，
// 存活实例的 glContextID 未变不会触发重建 → 继续绘制即静默失败白屏。
// 因此：任一实例卸载时广播 epoch，存活实例重置自身 glContextID，
// 下一帧即走 updateWebGLContext 重建着色器（对 Cubism2/4 均生效）。
let ctxEpoch = 0
const ctxListeners = new Set<() => void>()
export const bumpCtxEpoch = () => {
  ctxEpoch++
  ctxListeners.forEach((l) => l())
}
export const subscribeCtxEpoch = (listener: () => void) => {
  ctxListeners.add(listener)
  return () => {
    ctxListeners.delete(listener)
  }
}
export const getCtxEpoch = () => ctxEpoch

// ===== Live2D 渲染权互斥（跨组件共享） =====
// pixi-live2d-display 的着色器是全局单例（CubismShader_WebGL.getInstance()），
// 只绑定最后一次 startUp 的 GL 上下文：多个 WebGL 上下文并发渲染会互相争抢单例
// program；且弹层销毁（PIXI v6 destroy 会 loseContext）后的窗口期内，若实例在
// 死上下文上 generateShaders，createProgram() 返回 null → getAttribLocation 抛
// TypeError（parameter 1 is not of type 'WebGLProgram'）。
// 根治：同一时刻只允许「最新挂载」的实例渲染——弹层（Showcase/Inspector/宝箱
// 预览）打开时主画框 ticker 停止，关闭时渲染权移交 + epoch bump 重建着色器。
type RenderOwner = (active: boolean) => void
const renderOwners = new Set<RenderOwner>()

/** 登记渲染权：最新挂载者 active=true（ticker 起动），其余 ticker 停止 */
export const claimLive2DRender = (owner: RenderOwner) => {
  renderOwners.add(owner)
  const owners = [...renderOwners]
  owners.forEach((o, i) => o(i === owners.length - 1))
}

/** 释放渲染权（实例卸载）：移交最新存活者 + bump epoch 触发其重建着色器 */
export const releaseLive2DRender = (owner: RenderOwner) => {
  renderOwners.delete(owner)
  const owners = [...renderOwners]
  if (owners.length > 0) owners[owners.length - 1](true)
}

/** hit 命中区域名 → 反应动作组（按模型实际拥有的组匹配） */
export const findTapGroup = (areas: string[], groups: string[]): string | undefined => {
  for (const area of areas) {
    const a = area.toLowerCase().replace(/\s+/g, '_')
    // 驼峰形式（官方 Cubism4 模型组名如 TapBody / TapHead）
    const camel = a.replace(/(^|_)(\w)/g, (_, __, c: string) => c.toUpperCase())
    // bronya 系：face→tap_face / head→flick_head / breast→tap_breast …
    const candidates = [`tap_${a}`, `flick_${a}`, `Tap${camel}`, `Flick${camel}`, 'Tap', 'tap']
    const hit = candidates.find((g) => groups.includes(g))
    if (hit) return hit
  }
  return undefined
}

export const Live2DCharacter: React.FC<{
  level: number
  size?: number
  animated?: boolean
  pose?: CharacterPose
  /** 强制渲染指定形象（如宝箱揭示预览）；缺省用全局选择 */
  modelIdOverride?: string
  /** 强制渲染指定背景（如宝箱抽中背景时的检视预览）；缺省用全局选择 */
  bgIdOverride?: string
  /** 强制穿着指定服饰（如宝箱抽中服饰时的检视预览）；缺省用全局选择 */
  outfitIdOverride?: string
  /** 渲染超采样倍率：>1 让小画框也接近大画框的清晰度（与 devicePixelRatio 相乘后封顶 3） */
  quality?: number
  /** 无框模式（开箱检视等全屏演出）：去掉圆角裁切边、边缘渐暗与等级徽章，纯画面沉浸 */
  frameless?: boolean
}> = ({ level, size = 160, animated = true, pose = 'idle', modelIdOverride, bgIdOverride, outfitIdOverride, quality = 1, frameless = false }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PIXI.Application | null>(null)
  const modelRef = useRef<Live2DModel | null>(null)
  const naturalRef = useRef({ w: 1, h: 1 })
  /** 最近采样的内容包围盒（用于延迟重适配与 resize 时复用） */
  const boundsSamplesRef = useRef<Array<{ minX: number; minY: number; maxX: number; maxY: number }>>([])
  const settledBoundsRef = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null)
  const [error, setError] = useState('')
  /** 当前动作组清单（hit→动作映射用） */
  const motionGroupsRef = useRef<string[]>([])

  // 当前选中的形象（localStorage 持久化，背包页可切换）
  const chosenId = useSyncExternalStore(subscribeModelChoice, getModelChoice)
  const modelId = modelIdOverride ?? chosenId
  const modelDef = LIVE2D_MODELS.find((m) => m.id === modelId) ?? LIVE2D_MODELS[0]

  // 当前选中的服饰（按形象分别记忆；无服饰配置的形象返回空串；检视预览可覆盖）
  const chosenOutfitId = useSyncExternalStore(
    subscribeOutfitChoice,
    () => getOutfitChoice(modelId),
    () => getOutfitChoice(modelId),
  )
  const outfitId = outfitIdOverride ?? chosenOutfitId

  // 当前选中的背景装饰（localStorage 持久化，背包页可切换；检视预览可覆盖）
  const chosenBgId = useSyncExternalStore(subscribeBackgroundChoice, getBackgroundChoice)
  const bgId = bgIdOverride ?? chosenBgId

  // 分层舞台调整（今日冒险页 StageAdjust 内时非空：形象/背景独立拖拽缩放 + 画框实际尺寸缩放）
  const stageLayers = useContext(StageLayersContext)

  // 画框实际尺寸：frameScale 直接放大 PIXI canvas 分辨率（非 CSS 变换），角色更清晰
  const frameScale = stageLayers?.frameScale ?? 1
  const actualSize = Math.round(size * frameScale)

  // 其他实例卸载（弹层关闭）→ 重置本实例的 GL 上下文标记，触发着色器重建
  const epoch = useSyncExternalStore(subscribeCtxEpoch, getCtxEpoch)
  useEffect(() => {
    if (epoch === 0 || !modelRef.current) return
    // glContextID 在类型中是 protected，运行时可直接写
    ;(modelRef.current as unknown as { glContextID: number }).glContextID = -1
  }, [epoch])

  // ===== 动作播放总线：MotionBar 请求 → 当前模型执行（FORCE 优先级） =====
  const motionReq = useSyncExternalStore(subscribePlayMotion, getPlayMotion)
  useEffect(() => {
    if (!motionReq || !modelRef.current) return
    const manager = modelRef.current.internalModel?.motionManager as
      | { startMotion: (g: string, i?: number, priority?: number) => unknown }
      | undefined
    if (!manager) return
    try {
      void manager.startMotion(motionReq.group, motionReq.index, 3)
    } catch {
      /* 组名在当前模型不存在（如其他模型实例也在订阅）→ 静默忽略 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionReq?.nonce])

  /** 计算所有可见 drawable 顶点的联合包围盒（Live2DModel 局部坐标）。
   *  库的 getLocalBounds 永远返回逻辑画布盒 (0,0,w,h)，拿不到真实内容位置
   *  （如米团子人物在画布内偏一侧），因此直接遍历顶点求实际包围盒；
   *  跳过透明度≈0 的部件，避免隐藏的离体装饰把包围盒撑歪 */
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
          // internalModel 坐标 → Live2DModel 局部坐标（localTransform 仅缩放+平移）
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

  /** 画框内等比适配（注意用 app.screen 逻辑尺寸；renderer.width 是物理像素，高分屏下会放大偏移）。
   *  按 drawable 实际内容包围盒缩放并居中（画布留白不再参与布局），
   *  一次性修正：画布内人物偏移（米团子偏右）、画布留白导致的裁切（Mao 头部被裁）。
   *  bounds 可传入采样并集（待机动作落定后姿态偏移，如斯佩伯爵倾身出画）。
   *  注册表 viewZoom/viewOffset* 逐模型微调（斯佩伯爵放大、吸血鬼居中修正） */
  const fit = (
    app: PIXI.Application,
    m: Live2DModel,
    bounds?: { minX: number; minY: number; maxX: number; maxY: number } | null,
  ) => {
    const w = naturalRef.current.w
    const h = naturalRef.current.h
    const b = bounds ?? contentBounds(m)
    const bw = b ? b.maxX - b.minX : w
    const bh = b ? b.maxY - b.minY : h
    const s =
      Math.min(app.screen.width / bw, app.screen.height / bh) * FIT_MARGIN * (modelDef.viewZoom ?? 1)
    m.scale.set(s)
    const cx = b ? (b.minX + b.maxX) / 2 : w / 2
    const cy = b ? (b.minY + b.maxY) / 2 : h / 2
    // anchor(0.5,0.5) 下，local 点 (lx,ly) 的世界坐标 = (m.x + (lx - w/2)*s, m.y + (ly - h/2)*s)
    // 令实际内容中心对准画框中心（再叠加逐模型偏移，画框比例，正值右/下）
    m.position.set(
      app.screen.width / 2 - (cx - w / 2) * s + (modelDef.viewOffsetX ?? 0) * app.screen.width,
      app.screen.height / 2 - (cy - h / 2) * s + (modelDef.viewOffsetY ?? 0) * app.screen.height,
    )
  }

  // ===== 初始化 PIXI 应用（一次） =====
  useEffect(() => {
    let disposed = false
    let app: PIXI.Application | null = null
    /** 渲染权回调：active → ticker 起动；否则停止（让位给弹层等更新实例） */
    const resume = (active: boolean) => {
      const a = appRef.current
      if (!a) return
      if (active) a.ticker.start()
      else a.ticker.stop()
    }
    ;(async () => {
      try {
        await loadLive2DLib()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        return
      }
      if (disposed || !containerRef.current) return
      app = new PIXI.Application({
        backgroundAlpha: 0,
        antialias: true,
        preserveDrawingBuffer: true,
        // 高分屏适配：按设备像素比渲染，避免 canvas 拉伸模糊；
        // quality 超采样让小画框（今日冒险 460）也接近大画框（Showcase 680）的清晰度（封顶 3 控制性能开销）
        resolution: Math.min((window.devicePixelRatio || 1) * quality, 3),
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
      // 本实例的 WebGL 上下文已销毁 → 通知存活实例重建共享着色器绑定
      bumpCtxEpoch()
    }
  }, [])

  // ===== 换装：替换 model.textures[idx] =====
  // 渲染循环（_render）每帧从 Live2DModel.textures 数组读取 PIXI 纹理并绑定到 coreModel，
  // 因此直接替换数组元素即可热换装——贴图异步加载完成后下一帧自动生效，无需重载模型。
  const applyOutfit = (m: Live2DModel) => {
    const outfit = modelDef.outfits?.find((o) => o.id === outfitId)
    if (!outfit) return
    const textures = (m as unknown as { textures: PIXI.Texture[] }).textures
    if (!textures || outfit.textureIndex >= textures.length) return
    textures[outfit.textureIndex] = PIXI.Texture.from(outfit.texture)
  }

  // 服饰切换（模型已加载时热替换）
  useEffect(() => {
    if (modelRef.current) applyOutfit(modelRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outfitId, modelDef.id])

  // ===== 加载/切换模型（modelDef 变化时重建） =====
  useEffect(() => {
    let cancelled = false
    let model: Live2DModel | null = null
    // 用可变对象持有定时器：async 函数与 cleanup 闭包共享同一引用，
    // 即使 cleanup 先于调度行执行，后续 async 调度的 timer 也能被 cleanup 清到。
    // 触发后从数组移除，cleanup 只清还在 pending 的，避免对已触发的 timer 做无效 clearTimeout。
    const pendingTimers: { id: number | null }[] = []
    const clearPendingTimers = () => {
      for (const t of pendingTimers) {
        if (t.id !== null) {
          clearTimeout(t.id)
          t.id = null
        }
      }
      pendingTimers.length = 0
    }
    ;(async () => {
      // 等待 PIXI 应用就绪
      let waited = 0
      while (!appRef.current && !cancelled && waited < 10_000) {
        await new Promise((r) => setTimeout(r, 100))
        waited += 100
      }
      const app = appRef.current
      const lib = await loadLive2DLib().catch(() => null)
      if (cancelled || !app || !lib) return

      setError('')
      try {
        model = await lib.Live2DModel.from(modelDef.url, {
          autoInteract: true,
          idleMotionGroup: modelDef.idleGroup,
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        return
      }
      if (cancelled) {
        model.destroy()
        return
      }

      // 替换旧模型
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
      boundsSamplesRef.current = []
      settledBoundsRef.current = null
      fit(app, model)

      // 待机动作落定后姿态可能偏离加载瞬间的包围盒（斯佩伯爵倾身出画）；
      // 但入场/过渡帧又会把部件甩到远处（圣路易斯·改入场，若取并集人物会被缩成蚂蚁）。
      // 因此多次采样包围盒，取「最近 3 次的中位数」重适配：
      // 极端瞬态被中位数过滤，落定姿态主导取景，人物始终居中且不会离谱缩小。
      //
      // 例外：注册了视图微调（viewZoom/viewOffset*）的模型取景由注册表显式指定，
      // 自动重适配的 bounds 波动会被 viewZoom 放大成肉眼可见的跳变（斯佩伯爵）。
      // 这类模型锁定加载时的包围盒（resize 复用同一基准），大小位置恒定。
      // lockFit（如阿尔及利亚）：idle 摆幅大，任何延迟采样都会命中随机姿态帧
      // （挥臂/跨步帧包围盒偏大 → 重适配瞬间人物突然缩小），因此同样冻结在加载瞬间
      // 的默认站姿（先于首个 idle 动作更新，稳定可复现）。
      const sampleAndFit = () => {
        const cur = modelRef.current
        const app2 = appRef.current
        if (!cur || cur !== model || !app2 || cancelled) return
        const b = contentBounds(cur)
        if (!b) return
        const samples = boundsSamplesRef.current
        samples.push(b)
        if (samples.length > 6) samples.shift()
        const recent = samples.slice(-3)
        const byArea = (p: { minX: number; minY: number; maxX: number; maxY: number }) =>
          (p.maxX - p.minX) * (p.maxY - p.minY)
        const median = [...recent].sort((p, q) => byArea(p) - byArea(q))[Math.floor(recent.length / 2)]
        settledBoundsRef.current = median
        fit(app2, cur, median)
      }
      const hasViewTweak = !!(modelDef.viewZoom || modelDef.viewOffsetX || modelDef.viewOffsetY)
      if (hasViewTweak || modelDef.lockFit) {
        settledBoundsRef.current = contentBounds(model)
      } else if (!cancelled) {
        // 调度前再次检查 cancelled：async 加载期间 cleanup 可能已运行，
        // 此时不应再调度任何定时器（cleanup 已无法通过 refitTimers 引用清到新调度的 timer）
        for (const ms of [3500, 6000, 9000, 12000, 16000, 20000]) {
          const slot: { id: number | null } = { id: null }
          const run = () => {
            // 触发即从 pending 移除并置空 id，cleanup 不会再对它做无效 clearTimeout
            slot.id = null
            const idx = pendingTimers.indexOf(slot)
            if (idx >= 0) pendingTimers.splice(idx, 1)
            sampleAndFit()
          }
          slot.id = setTimeout(run, ms)
          pendingTimers.push(slot)
        }
      }

      // 记录动作组（hit→动作映射）
      const mm = model.internalModel?.motionManager?.definitions
      motionGroupsRef.current = mm ? Object.keys(mm) : []

      // 阿库娅等空字符串动作组的模型：库对 idleMotionGroup 做 truthy 检查，
      // 空串赋值被跳过 → 待机组回退 'Idle'（不存在）→ 模型静止。
      // 这里加载后强制同步待机组并启动一次随机动作，后续库的 idle 循环自动接续。
      const manager = model.internalModel?.motionManager as
        | { groups: { idle: string }; startRandomMotion: (g: string) => unknown }
        | undefined
      if (manager && manager.groups.idle !== modelDef.idleGroup && mm && modelDef.idleGroup in mm) {
        manager.groups.idle = modelDef.idleGroup
        void manager.startRandomMotion(modelDef.idleGroup)
      }

      // 点击命中 → 对应反应动作（bronya 系：脸/胸/腹/腿各有专属动作）
      model.on('hit', (areas: string[]) => {
        const group = findTapGroup(areas, motionGroupsRef.current)
        if (group) modelRef.current?.motion(group)
      })
    })()
    return () => {
      cancelled = true
      clearPendingTimers()
    }
  }, [modelDef.url, modelDef.idleGroup])

  // ===== 画框尺寸变化 → 重新适配 =====
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(() => {
      const app = appRef.current
      const m = modelRef.current
      if (app && m) {
        // resizeTo 只监听 window resize；容器尺寸变化（如 flex 布局稳定、size state 更新）需手动触发
        app.resize()
        // 优先用已落定的采样包围盒，避免动作落定后的偏移姿态在 resize 时被裁
        fit(app, m, settledBoundsRef.current)
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // ===== 姿态切换 → 动作/表情 =====
  useEffect(() => {
    const m = modelRef.current
    if (!m || !animated) return
    if (pose === 'idle') return
    // 非待机姿态：触发点击反应动作（haru: Tap；官方系: TapBody；bronya 系: tap_face 等）
    const groups = motionGroupsRef.current
    const group = ['Tap', 'TapBody', 'tap', 'tap_face', 'tap_body', 'flick_head'].find((g) => groups.includes(g))
    if (group) m.motion(group)
    // 表情映射（按模型注册表的 expCheer / expCast，无表情组则静默跳过）
    const expName = pose === 'cheer' ? modelDef.expCheer : pose === 'cast' ? modelDef.expCast : undefined
    m.expression?.(expName)
  }, [pose, animated, modelDef])

  return (
    <div
      className="relative"
      style={{
        width: actualSize,
        height: actualSize,
        // flex 纵向容器内禁止收缩（Showcase 面板内容超高时画框曾被压成 17px 高）
        flexShrink: 0,
        borderRadius: frameless ? 0 : 12,
      }}
    >
      {/* 背景装饰层（PIXI 画布透明，背景透出；StageAdjust 内时应用背景变换，超出裁切） */}
      <div className={`absolute inset-0 overflow-hidden ${frameless ? '' : 'rounded-xl'}`}>
        <div className="absolute inset-0" style={stageLayers ? stageTfStyle(stageLayers.bg) : undefined}>
          {frameless ? (
            <BackgroundLayer bgId={bgId} vignette={false} />
          ) : (
            <BackgroundLayer bgId={bgId} />
          )}
        </div>
      </div>
      {/* PIXI 画布（StageAdjust 内时应用形象变换，超出裁切；canvas 尺寸随布局盒，不受 transform 影响） */}
      <div className={`absolute inset-0 overflow-hidden ${frameless ? '' : 'rounded-xl'}`}>
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={stageLayers ? stageTfStyle(stageLayers.model) : undefined}
        />
      </div>
      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-2 text-center text-[10px] text-rose-400">
          {error}
        </div>
      )}
      {/* 等级徽章（无框模式隐藏） */}
      {!frameless && (
        <div className="pointer-events-none absolute left-1 top-1 rounded-md border border-rpg-gold/60 bg-rpg-bg/70 px-1 text-[9px] font-bold text-rpg-gold backdrop-blur-sm">
          Lv.{level}
        </div>
      )}
    </div>
  )
}

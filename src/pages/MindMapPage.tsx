/**
 * 思维导图页面
 *
 * 基于 simple-mind-map（思绪思维导图，github.com/wanglin2/mind-map，12.6k stars）。
 * 支持多张导图，节点数据经 zustand store 持久化到 IndexedDB。
 * 核心交互：双击编辑节点、Tab 加子节点、Enter 加同级、Delete 删除。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MindMap from 'simple-mind-map'
import type { MindMapNodeData } from 'simple-mind-map'
import Drag from 'simple-mind-map/src/plugins/Drag'
import Select from 'simple-mind-map/src/plugins/Select'
import { bfsWalk, throttle } from 'simple-mind-map/src/utils'
import Themes from 'simple-mind-map-plugin-themes'
import type { ThemeEntry } from 'simple-mind-map-plugin-themes'
import { useGameStore } from '../store/useGameStore'
import { usePomodoroStore } from '../store/usePomodoroStore'
import { classifyNodes, type ClassifiedItem } from '../ai/nodeClassifier'
import { DOMAIN_META } from '../config/xpConfig'
import type { MindMapDoc } from '../types'

/** 模块加载时注册一次官方主题包（54 套） */
Themes.init(MindMap)
/** 注册节点拖拽插件：拖到节点上→子节点，拖到节点前/后→兄弟节点 */
MindMap.usePlugin(Drag)
/** 注册框选插件：Ctrl+鼠标左键拖出矩形框选节点（批量操作） */
MindMap.usePlugin(Select)

/**
 * 主题白名单（从官方 54 套中筛选柔和低饱和、不刺眼的）
 * value 为官方 key，setTheme 时直接传入
 */
const THEME_WHITELIST: { value: string; group: '亮色' | '暗色' }[] = [
  { value: 'default', group: '亮色' }, // 默认（绿）
  { value: 'morandi', group: '亮色' }, // 莫兰迪（暖灰粉）
  { value: 'coffee', group: '亮色' }, // 咖啡（暖棕）
  { value: 'mint', group: '亮色' }, // 薄荷（淡绿）
  { value: 'avocado', group: '亮色' }, // 牛油果（柔绿）
  { value: 'autumn', group: '亮色' }, // 秋天（暖橙）
  { value: 'oreo', group: '亮色' }, // 奥利奥（黑白）
  { value: 'shallowSea', group: '亮色' }, // 浅海（淡蓝）
  { value: 'earthYellow', group: '亮色' }, // 泥土黄
  { value: 'romanticPurple', group: '亮色' }, // 浪漫紫
  { value: 'lateNightOffice', group: '暗色' }, // 深夜办公室（暖夜色）
  { value: 'blackGold', group: '暗色' }, // 黑金（金线黑底）
  { value: 'dark', group: '暗色' }, // 暗色（灰）
  { value: 'dark2', group: '暗色' }, // 暗色2
  { value: 'dark3', group: '暗色' }, // 暗色3
  { value: 'blackHumour', group: '暗色' }, // 黑色幽默
]

/** 旧自定义主题 key → 官方 key 的映射（兼容上一版存档） */
const LEGACY_THEME_MAP: Record<string, string> = {
  mist: 'morandi',
  paper: 'morandi',
  dusk: 'lateNightOffice',
  celadon: 'mint',
  mauve: 'romanticPurple',
}

const DEFAULT_THEME_KEY = 'morandi'

/** 从全部官方主题里筛出白名单条目，用于选项渲染 */
const ALL_THEMES: ThemeEntry[] = [
  { name: '默认', value: 'default', theme: {}, dark: false },
  ...Themes.darkList,
  ...Themes.lightList,
]

const THEME_MAP: Record<string, ThemeEntry> = Object.fromEntries(
  ALL_THEMES.map((t) => [t.value, t]),
)

const getThemeKey = (doc?: MindMapDoc): string => {
  const raw = doc?.theme
  if (!raw) return DEFAULT_THEME_KEY
  // 先按官方 key 直接匹配
  if (THEME_MAP[raw]) return raw
  // 再按旧 key 映射
  if (LEGACY_THEME_MAP[raw] && THEME_MAP[LEGACY_THEME_MAP[raw]]) {
    return LEGACY_THEME_MAP[raw]
  }
  return DEFAULT_THEME_KEY
}

/** 深拷贝（避免实例直接引用 store 里的数据），并做存量数据文案迁移 */
const cloneData = (data: MindMapDoc['data']): MindMapNodeData => {
  const cloned = JSON.parse(JSON.stringify(data)) as MindMapNodeData
  // 历史迁移：状态 later 的显示文案「不急」→「暂停」（旧存档节点上持久化了旧标签文本）
  const walk = (node: { data?: Record<string, unknown>; children?: unknown[] }) => {
    if (node.data?.status === 'later' && Array.isArray(node.data.tag)) {
      for (const t of node.data.tag) {
        if (t && typeof t === 'object' && (t as { text?: string }).text === '不急') {
          ;(t as { text?: string }).text = '暂停'
        }
      }
    }
    if (Array.isArray(node.children)) node.children.forEach((c) => walk(c as typeof node))
  }
  walk(cloned as unknown as { data?: Record<string, unknown>; children?: unknown[] })
  return cloned
}

/** 节点状态：紧急 / 普通 / 进行中 / 暂停 / 完成 */
type NodeStatus = 'urgent' | 'normal' | 'progress' | 'later' | 'done'

interface StatusMeta {
  label: string
  emoji: string
  /** 覆盖主题的节点样式（值为 undefined 表示清除覆盖，回落主题色） */
  style: Record<string, unknown>
  /** 节点上的状态小标签；普通状态为 undefined（不显示） */
  tag: Array<{ text: string; style: Record<string, unknown> }> | undefined
  /** 状态选择器按钮的配色（边框色） */
  color: string
}

const NODE_STATUS: Record<NodeStatus, StatusMeta> = {
  urgent: {
    label: '紧急',
    emoji: '🔴',
    style: { fillColor: '#a83a3a', color: '#fff0f0', borderColor: '#e67373', borderWidth: 2 },
    tag: [{ text: '紧急', style: { fillColor: '#e67373', color: '#fff', fontSize: 10 } }],
    color: '#e67373',
  },
  normal: {
    label: '普通',
    emoji: '⚪',
    // 全部置 undefined → 清除样式覆盖，跟随当前主题
    style: { fillColor: undefined, color: undefined, borderColor: undefined, borderWidth: undefined },
    tag: undefined,
    color: '#9ca3af',
  },
  progress: {
    label: '进行中',
    emoji: '🟡',
    style: { fillColor: '#c9922a', color: '#fffaf0', borderColor: '#f0bd4a', borderWidth: 2 },
    tag: [{ text: '进行中', style: { fillColor: '#f0bd4a', color: '#fff', fontSize: 10 } }],
    color: '#f0bd4a',
  },
  later: {
    label: '暂停',
    emoji: '🔵',
    style: { fillColor: '#4a78b0', color: '#eaf2fc', borderColor: '#7da8e0', borderWidth: 2 },
    tag: [{ text: '暂停', style: { fillColor: '#7da8e0', color: '#fff', fontSize: 10 } }],
    color: '#7da8e0',
  },
  done: {
    label: '完成',
    emoji: '🟢',
    style: { fillColor: '#4caf5a', color: '#f0fff3', borderColor: '#85d88a', borderWidth: 2 },
    tag: [{ text: '完成', style: { fillColor: '#85d88a', color: '#fff', fontSize: 10 } }],
    color: '#85d88a',
  },
}

const isNodeStatus = (v: unknown): v is NodeStatus =>
  typeof v === 'string' && v in NODE_STATUS

/** 视图居左：复位后把根节点中心平移到容器 20% 宽处（左右留白约 1 : 4）
 *  优先用 renderer.root 的布局坐标精确补偿，取不到时按比例估算兜底 */
const alignViewLeft = (mm: MindMap, container: HTMLElement | null) => {
  try {
    mm.view.reset()
    const w = container?.clientWidth ?? 0
    if (w <= 0) return
    const root = (
      mm as unknown as {
        renderer?: { root?: { left: number; width: number } | null }
      }
    ).renderer?.root
    if (root && Number.isFinite(root.left) && Number.isFinite(root.width)) {
      // 屏幕坐标 = 布局坐标 + view.x（reset 后 view.x = 0）
      mm.view.translateX(w * 0.2 - (root.left + root.width / 2))
    } else {
      mm.view.translateX(-w * 0.3)
    }
  } catch (e) {
    console.error('align view left failed', e)
  }
}

export const MindMapPage: React.FC<{ onRecord?: (presetTitle?: string) => void }> = ({
  onRecord,
}) => {
  const docs = useGameStore((s) => s.state.mindMaps ?? [])
  const createMindMap = useGameStore((s) => s.createMindMap)
  const saveMindMap = useGameStore((s) => s.saveMindMap)
  const renameMindMap = useGameStore((s) => s.renameMindMap)
  const setMindMapTheme = useGameStore((s) => s.setMindMapTheme)
  const deleteMindMap = useGameStore((s) => s.deleteMindMap)
  const addActivity = useGameStore((s) => s.addActivity)
  const sessions = useGameStore((s) => s.state.sessions ?? [])
  const setPendingLaunch = usePomodoroStore((s) => s.setPendingLaunch)
  const navigate = useNavigate()

  const [activeId, setActiveId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  /** 当前选中节点的文本（用于"记为今日行动"联动） */
  const [activeNodeText, setActiveNodeText] = useState<string | null>(null)
  /** 当前选中节点的 uid（用于"为此任务开一局"联动） */
  const [activeNodeUid, setActiveNodeUid] = useState<string | null>(null)
  /** 当前选中节点的状态（驱动状态选择器高亮） */
  const [activeStatus, setActiveStatus] = useState<NodeStatus>('normal')
  /** 当前激活节点的数量（框选批量操作时 > 1） */
  const [activeCount, setActiveCount] = useState(0)
  /** AI 分类中 */
  const [classifying, setClassifying] = useState(false)
  /** AI 分类结果（待用户确认） */
  const [classified, setClassified] = useState<ClassifiedItem[] | null>(null)
  /** Ctrl 是否按住：框选期间让底部浮层按钮穿透鼠标事件，避免挡住起手点 */
  const [ctrlHeld, setCtrlHeld] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const mmRef = useRef<MindMap | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  /** 当前选中的节点实例（应用状态时使用） */
  const activeNodeRef = useRef<{ getData: (key: string) => unknown } | null>(null)
  /** 当前所有激活的节点实例（批量设置状态时使用） */
  const activeNodesRef = useRef<Array<{ getData: (key: string) => unknown }>>([])

  // 跟踪 Ctrl 按下状态：按住时底部操作栏 pointer-events 穿透，
  // 让 Ctrl 框选可以从按钮区域起手/划过；窗口失焦时复位。
  // 自愈：右键菜单/浏览器对话框/浏览器工具栏会吃掉 Ctrl 的 keyup（且不触发
  // window blur），导致 ctrlHeld 卡在 true、底部状态栏永久 pointer-events-none
  // （表现为点击状态按钮无效，需再按一次 Ctrl 才恢复）。鼠标和键盘事件自带
  // 实时 ctrlKey 状态，发现 Ctrl 实际未按住时立即复位
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Control') setCtrlHeld(true)
      // 按下任何非 Ctrl 键且事件不带 ctrlKey → Ctrl 必然未按住
      else if (!e.ctrlKey && !e.metaKey) setCtrlHeld(false)
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Control') setCtrlHeld(false)
    }
    const blur = () => setCtrlHeld(false)
    const healOnMouse = (e: MouseEvent) => {
      // buttons === 0：不在拖拽中。避免框选中途松开 Ctrl 时过早恢复
      // 浮层的鼠标事件（挡住框选经过底部区域的 mousemove）
      if (!e.ctrlKey && !e.metaKey && e.buttons === 0) setCtrlHeld(false)
    }
    const healOnMousedown = (e: MouseEvent) => {
      if (!e.ctrlKey && !e.metaKey) setCtrlHeld(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    window.addEventListener('mousemove', healOnMouse)
    window.addEventListener('mousedown', healOnMousedown)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      window.removeEventListener('mousemove', healOnMouse)
      window.removeEventListener('mousedown', healOnMousedown)
    }
  }, [])

  // 确保至少有一张导图，且 activeId 始终有效
  // 通过 getState() 读取实时值，避免 StrictMode 双挂载时重复创建
  useEffect(() => {
    const current = useGameStore.getState().state.mindMaps ?? []
    if (current.length === 0) {
      createMindMap('我的思路')
      return
    }
    if (!activeId || !current.some((d) => d.id === activeId)) {
      setActiveId(current[0].id)
    }
  }, [docs, activeId])

  const activeDoc = docs.find((d) => d.id === activeId)
  const activeDocId = activeDoc?.id
  const themeKey = getThemeKey(activeDoc)

  /** 当前选中节点已关联的局（"为此任务开一局"联动） */
  const taskSessions = useMemo(
    () => (activeNodeUid ? sessions.filter((s) => s.taskId === activeNodeUid) : []),
    [sessions, activeNodeUid],
  )

  /** 切换主题：更新 store（持久化）并热应用到当前实例 */
  const handleThemeChange = (key: string) => {
    if (!activeDocId || key === themeKey) return
    setMindMapTheme(activeDocId, key)
    mmRef.current?.setTheme(key)
  }

  /** 给当前选中的节点（单个或框选批量）应用状态（样式覆盖 + 状态标签，随导图数据持久化） */
  const handleStatusChange = (status: NodeStatus) => {
    const mm = mmRef.current
    const nodes = activeNodesRef.current
    if (!mm || nodes.length === 0) return
    const meta = NODE_STATUS[status]
    nodes.forEach((node) => {
      mm.execCommand('SET_NODE_STYLES', node, {
        status,
        ...meta.style,
        tag: meta.tag,
      })
    })
    setActiveStatus(status)
  }

  /** 框选节点 → AI 分类 → 确认后批量记为今日已完成的活动 */
  const handleBatchRecord = async () => {
    const titles = activeNodesRef.current
      .map((n) => String(n.getData('text') ?? '').trim())
      .filter(Boolean)
    if (titles.length === 0) return
    setClassifying(true)
    setClassified(null)
    try {
      setClassified(await classifyNodes(titles))
    } finally {
      setClassifying(false)
    }
  }

  /** 确认分类结果：同类型杂项合并为一条活动（描述列明细，避免行动历史被刷屏），并把节点批量标记为"完成" */
  const confirmBatchRecord = () => {
    const mm = mmRef.current
    if (!classified || classified.length === 0 || !mm) return
    // 按类型分组，同类型多条 → 合并为一条「杂项·XX×N」，明细写进描述
    const groups = new Map<keyof typeof DOMAIN_META, string[]>()
    classified.forEach((item) => {
      const arr = groups.get(item.type) ?? []
      arr.push(item.title)
      groups.set(item.type, arr)
    })
    groups.forEach((titles, type) => {
      if (titles.length === 1) {
        addActivity({ type, title: titles[0] })
      } else {
        addActivity({
          type,
          title: `杂项·${DOMAIN_META[type].label}×${titles.length}`,
          description: titles.map((t, i) => `${i + 1}. ${t}`).join('\n'),
        })
      }
    })
    const meta = NODE_STATUS.done
    activeNodesRef.current.forEach((node) => {
      mm.execCommand('SET_NODE_STYLES', node, {
        status: 'done',
        ...meta.style,
        tag: meta.tag,
      })
    })
    mm.execCommand('CLEAR_ACTIVE_NODE')
    setClassified(null)
  }

  // 初始化 / 切换导图：创建实例，防抖保存，卸载时销毁
  useEffect(() => {
    if (!activeDocId || !containerRef.current) return
    const doc = useGameStore.getState().state.mindMaps?.find((d) => d.id === activeDocId)
    if (!doc) return

    const mm = new MindMap({
      el: containerRef.current,
      data: cloneData(doc.data),
      layout: 'logical_structure',
      theme: getThemeKey(doc),
      // 不显示新增子节点的"+"图标，避免误触
      isShowCreateChildBtnIcon: false,
      // 关闭库内置"ctrl+单击切换节点激活"：从节点上起手框选时它会先改动选区，
      // 干扰框选结果。Ctrl+单击增选改由下方捕获层按「无拖拽」判定手动实现
      enableCtrlKeyNodeSelection: false,
    })
    mmRef.current = mm

    // 刷新 / 切换导图后默认视图居左（左右留白约 1 : 4）。
    // 库的首帧渲染是 setTimeout(0) 异步的，需等首次 node_tree_render_end
    // 布局坐标就绪后再精确对齐；只对齐这一次，之后的平移不干预
    const alignOnce = () => {
      mm.off('node_tree_render_end', alignOnce)
      alignViewLeft(mm, containerRef.current)
    }
    mm.on('node_tree_render_end', alignOnce)

    // 库内置撤销为 Control+z、重做为 Control+y；
    // 补充常见的 Control+Shift+z 作为重做快捷键
    mm.keyCommand.addShortcut('Control+Shift+z', () => {
      mm.execCommand('FORWARD')
    })

    // 选中单个节点时按空格进入编辑（等效 F2）。
    // 不走库的 keyCommand：它默认要求 keydown 目标是 document.body 且鼠标
    // 悬停在画布内（enableShortcutOnlyWhenMouseInSvg 默认 true），焦点落在
    // 页面按钮上或鼠标移出画布时会静默失效。这里直接监听 window keydown。
    const onSpaceKeyDown = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.keyCode !== 32) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      // 正在编辑节点 / 焦点在输入控件上时不抢按键
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return
      }
      const textEdit = mm.renderer.textEdit as unknown as {
        showTextEdit?: boolean
        show: (opt: { node: unknown }) => void
      }
      if (textEdit.showTextEdit) return
      const active = mm.renderer.activeNodeList ?? []
      if (active.length !== 1) return
      e.preventDefault()
      textEdit.show({ node: active[0] })
    }
    window.addEventListener('keydown', onSpaceKeyDown)

    // 拖拽节点到已收起节点上成为其子节点时，库的 moveNodeTo 会强制展开
    // 目标节点（Render.js 内 toNode.setData({ expand: true })），导致收起
    // 的分组被意外展开。这里包装 MOVE_NODE_TO 命令（undo/redo 走快照恢复，
    // 不经过命令函数，不受影响）：执行前记录收起状态，执行后直接改回数据
    // 并重渲染，保持目标节点收起。
    const commandApi = mm as unknown as {
      command?: {
        commands?: Record<string, Array<(...args: unknown[]) => void>>
      }
    }
    const moveCmds = commandApi.command?.commands?.MOVE_NODE_TO
    if (moveCmds) {
      commandApi.command!.commands!.MOVE_NODE_TO = moveCmds.map((fn) => {
        return (...args: unknown[]) => {
          const toNode = args[args.length - 1] as
            | {
                getData: (k: string) => unknown
                nodeData: { data: Record<string, unknown> }
              }
            | undefined
          const wasCollapsed = toNode?.getData('expand') === false
          fn(...args)
          if (wasCollapsed && toNode.nodeData.data.expand !== false) {
            toNode.nodeData.data.expand = false
            // 库的 render 是 setTimeout 合并的：本次拖拽只会在收起态下
            // 渲染一次，expand 前后都是 false，节点实例缓存的
            // _lastExpandBtnType 没变会让 updateExpandBtnNode 早退，
            // 收起徽标上的子节点数不重算（表现为数字不更新）。
            // 清掉缓存强制重算。
            ;(toNode as unknown as { _lastExpandBtnType?: unknown })._lastExpandBtnType =
              undefined
            mm.render()
          }
        }
      })
    }

    // Drag 插件的位置检测默认节流 300ms（trailing），拖拽排序时占位符更新迟钝；
    // 取原型上的原始方法重新节流到 50ms，让兄弟节点间的排序跟手
    const drag = (
      mm as unknown as {
        drag?: { checkOverlapNode: (...args: unknown[]) => void }
      }
    ).drag
    if (drag) {
      const rawCheck = Object.getPrototypeOf(drag).checkOverlapNode as (
        ...args: unknown[]
      ) => void
      drag.checkOverlapNode = throttle(rawCheck, 50, drag)
    }

    // Select 插件的框选检测同样默认节流 300ms，重新节流到 50ms 让框选高亮跟手
    const select = (
      mm as unknown as {
        select?: { checkInNodes: (...args: unknown[]) => void }
      }
    ).select
    if (select) {
      const rawCheckIn = Object.getPrototypeOf(select).checkInNodes as (
        ...args: unknown[]
      ) => void
      select.checkInNodes = throttle(rawCheckIn, 50, select)
    }

    // ===== 框选稳定性修复 =====
    // 库的非根节点 mousedown 会 stopPropagation，导致从节点上按下时
    // Select 插件（绑在容器 el 上）收不到事件、框选无法启动。
    // 这里在容器捕获阶段拦截 Ctrl+左键：
    //   1. preventDefault → 阻止浏览器原生文本选择（"松开鼠标以搜索文本"/文字选蓝）
    //   2. 手动驱动 select.onMousedown → 从节点上也能起手框选
    const selectApi = mm as unknown as {
      select?: { onMousedown: (e: MouseEvent) => void }
      drag?: { isMousedown: boolean; mousedownNode: unknown }
    }
    // 框选手势标记：mouseup 后浏览器会紧随派发 click，
    // 库的 draw_click 处理（Render.clearActiveNodeListOnDrawClick）在
    // useLeftKeySelectionRightKeyDrag=false 时不做距离检查，会把刚框选
    // 的节点全部清空（松开在空白处必现）。捕获阶段吞掉这次 click 即可保住结果
    let boxSelectGesture = false
    let gestureResetTimer: ReturnType<typeof setTimeout> | null = null
    // Ctrl+单击增选：按下时记录起点，移动超过阈值即判定为框选拖拽而非单击
    let ctrlClickCandidate = false
    let ctrlClickStartX = 0
    let ctrlClickStartY = 0
    const onCaptureMousedown = (e: MouseEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.button !== 0) {
        // 普通 mousedown：复位可能卡住的框选手势标志（鼠标移出窗口松开
        // 时 mouseup 丢失，标志卡 true 会吞掉后续普通节点的 click）
        boxSelectGesture = false
        ctrlClickCandidate = false
        return
      }
      e.preventDefault()
      boxSelectGesture = true
      ctrlClickCandidate = true
      ctrlClickStartX = e.clientX
      ctrlClickStartY = e.clientY
      selectApi.select?.onMousedown(e)
    }
    // 拖动超过 5px → 框选，不再是单击
    const onCaptureMousemove = (e: MouseEvent) => {
      if (!ctrlClickCandidate) return
      if (
        Math.abs(e.clientX - ctrlClickStartX) > 5 ||
        Math.abs(e.clientY - ctrlClickStartY) > 5
      ) {
        ctrlClickCandidate = false
      }
    }
    // Ctrl+左键单击（无拖拽）命中处节点 → 加入/移出当前选区。
    // 与库内置 enableCtrlKeyNodeSelection 等效，但按「无拖拽」判定，
    // 不再干扰从节点上起手的框选（此前因此关闭了内置开关）
    const toggleNodeAtCursor = (e: MouseEvent) => {
      // 自事件目标向上收集 DOM 祖先，用于反查命中节点的实例
      const path = new Set<Element>()
      let el = e.target as Element | null
      while (el && el !== containerRef.current) {
        path.add(el)
        el = el.parentElement
      }
      const renderer = mm.renderer as unknown as {
        root: unknown
        activeNodeList: Array<unknown>
        addNodeToActiveList: (node: unknown, notEmit?: boolean) => void
        removeNodeFromActiveList: (node: unknown) => void
        emitNodeActiveEvent: (node?: unknown) => void
      }
      let hit: unknown = null
      bfsWalk(renderer.root, (node: unknown) => {
        if (hit) return
        const n = node as { group?: { node?: Element } }
        if (n.group?.node && path.has(n.group.node)) hit = node
      })
      if (!hit) return
      const node = hit as { getData: (k: string) => unknown }
      const isActive = node.getData('isActive')
      if (!isActive) mm.emit('before_node_active', hit, renderer.activeNodeList)
      renderer[isActive ? 'removeNodeFromActiveList' : 'addNodeToActiveList'](hit, true)
      renderer.emitNodeActiveEvent(isActive ? null : hit)
    }
    const onCaptureClick = (e: MouseEvent) => {
      if (!boxSelectGesture) return
      boxSelectGesture = false
      if (gestureResetTimer) clearTimeout(gestureResetTimer)
      // 阻止 click 到达 svg：杜绝 draw_click → CLEAR_ACTIVE_NODE 清空框选结果，
      // 也避免松开点的节点被 click 重新激活/取消
      e.preventDefault()
      e.stopPropagation()
      // 无拖拽的 Ctrl+单击 → 增选/移除该节点（点击空白处则仅保持原选区）
      if (ctrlClickCandidate) {
        ctrlClickCandidate = false
        toggleNodeAtCursor(e)
      }
    }
    const onCaptureMouseup = () => {
      // click 在 mouseup 后同步派发；若未派发（如鼠标移出窗口松开），
      // 兜底复位标志，避免误吞下一次普通点击
      if (gestureResetTimer) clearTimeout(gestureResetTimer)
      gestureResetTimer = setTimeout(() => {
        boxSelectGesture = false
        ctrlClickCandidate = false
      }, 50)
    }
    containerRef.current.addEventListener('mousedown', onCaptureMousedown, true)
    containerRef.current.addEventListener('mousemove', onCaptureMousemove, true)
    containerRef.current.addEventListener('click', onCaptureClick, true)
    containerRef.current.addEventListener('mouseup', onCaptureMouseup, true)

    // Drag 插件不检查 Ctrl：从节点上起手框选时会同时开始拖节点。
    // 本钩子注册晚于 Drag 插件（插件在 new MindMap 时注册），
    // 会在 Drag.onNodeMousedown 之后执行，直接重置其拖拽状态
    const onNodeMousedownDragGuard = (...args: unknown[]) => {
      const e = args[1] as MouseEvent
      if (!(e.ctrlKey || e.metaKey) || e.which !== 1) return
      if (selectApi.drag) {
        selectApi.drag.isMousedown = false
        selectApi.drag.mousedownNode = null
      }
    }
    mm.on('node_mousedown', onNodeMousedownDragGuard)

    // 节点选中变化 → 记录选中文本与状态，驱动"记为今日行动"按钮和状态选择器；
    // 框选时 activeList 可能有多个节点，保存完整列表供批量设置状态使用
    mm.on('node_active', (_node, activeList) => {
      const nodes = activeList as Array<{ getData: (key: string) => unknown }>
      activeNodesRef.current = nodes ?? []
      setActiveCount(nodes?.length ?? 0)
      const first = nodes?.[0]
      activeNodeRef.current = first ?? null
      const text = first ? String(first.getData('text') ?? '').trim() : ''
      setActiveNodeText(text || null)
      const uid = first ? String(first.getData('uid') ?? '') : ''
      setActiveNodeUid(uid || null)
      const status = first?.getData('status')
      setActiveStatus(isNodeStatus(status) ? status : 'normal')
    })

    mm.on('data_change', () => {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        try {
          saveMindMap(activeDocId, mm.getData() as MindMapNodeData)
        } catch {
          /* 实例已销毁时忽略 */
        }
      }, 600)
    })

    // 容器尺寸变化时让画布重算（宽高为 0 时跳过：容器隐藏/布局未完成，
    // 库的 resize 会抛「宽高不能为0」）
    const ro = new ResizeObserver(() => {
      const el = containerRef.current
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return
      mm.resize()
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      clearTimeout(saveTimerRef.current)
      window.removeEventListener('keydown', onSpaceKeyDown)
      containerRef.current?.removeEventListener('mousedown', onCaptureMousedown, true)
      containerRef.current?.removeEventListener('mousemove', onCaptureMousemove, true)
      containerRef.current?.removeEventListener('click', onCaptureClick, true)
      containerRef.current?.removeEventListener('mouseup', onCaptureMouseup, true)
      if (gestureResetTimer) clearTimeout(gestureResetTimer)
      mm.off('node_mousedown', onNodeMousedownDragGuard)
      // 文档已被删除时不再回存（避免对已删 id 做无谓的成就重评估）
      const stillExists = useGameStore
        .getState()
        .state.mindMaps?.some((d) => d.id === activeDocId)
      if (stillExists) {
        try {
          saveMindMap(activeDocId, mm.getData() as MindMapNodeData)
        } catch {
          /* ignore */
        }
      }
      mm.destroy()
      mmRef.current = null
    }
  }, [activeDocId])

  const handleCreate = () => {
    const title = `任务榜 ${docs.length + 1}`
    const id = createMindMap(title)
    setActiveId(id)
  }

  const handleDelete = (id: string) => {
    if (!window.confirm('确定删除这张任务榜吗？删除后无法恢复。')) return
    deleteMindMap(id)
    const rest = useGameStore.getState().state.mindMaps ?? []
    if (rest.length === 0) {
      // 删的是最后一张：同步补一张空白榜并激活，
      // 避免 docs 为空的中间渲染（画布卸载重建 + 高频更新链）
      const newId = createMindMap('我的思路')
      setActiveId(newId)
    } else if (activeId === id) {
      // 删的是当前激活的：切到剩余第一张
      setActiveId(rest[0].id)
    }
  }

  const commitRename = () => {
    const t = renameText.trim()
    if (renamingId && t) renameMindMap(renamingId, t)
    setRenamingId(null)
  }

  if (docs.length === 0 || !activeDoc) {
    return (
      <div className="rpg-panel p-8 text-center text-sm text-gray-400 animate-pulse">
        正在准备画布…
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶部工具栏：返回 + 导图列表 + 工具 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-rpg-border bg-rpg-panel/60 px-3 py-1.5 text-[11px] backdrop-blur">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 rounded-lg border-2 border-rpg-border bg-rpg-panel px-2.5 py-1 text-[11px] text-gray-300 transition-all hover:border-rpg-gold hover:text-rpg-gold"
          title="返回"
        >
          <span className="text-sm">←</span>
          <span>返回</span>
        </button>
        {/* 导图列表 */}
        <div className="flex flex-wrap items-center gap-1.5">
        {docs.map((d) => {
          const isActive = d.id === activeDocId
          const isRenaming = renamingId === d.id
          return (
            <div
              key={d.id}
              className={`flex items-center gap-1 rounded-lg border-2 px-2 py-1 text-[11px] transition-all ${
                isActive
                  ? 'border-rpg-gold bg-rpg-panelLight text-rpg-gold'
                  : 'border-rpg-border bg-rpg-panel text-gray-400 hover:border-rpg-gold hover:text-white'
              }`}
            >
              {isRenaming ? (
                <input
                  autoFocus
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  className="w-24 bg-transparent text-[11px] text-white outline-none"
                />
              ) : (
                <>
                  <button
                    onClick={() => setActiveId(d.id)}
                    onDoubleClick={() => {
                      setRenamingId(d.id)
                      setRenameText(d.title)
                    }}
                    title="双击重命名"
                    className="max-w-[8rem] truncate"
                  >
                    {d.title}
                  </button>
                  <button
                    onClick={() => handleDelete(d.id)}
                    title="删除"
                    className="text-gray-600 hover:text-red-400"
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          )
        })}
        <button
          onClick={handleCreate}
          className="rounded-lg border-2 border-dashed border-rpg-border px-2 py-1 text-[11px] text-gray-500 transition-all hover:border-rpg-xp hover:text-rpg-xp"
        >
          ＋ 新建
        </button>
        </div>
        {/* 工具栏：主题 + 视图控制 */}
        <div className="ml-auto flex items-center gap-1">
          <select
            value={themeKey}
            onChange={(e) => handleThemeChange(e.target.value)}
            className="max-w-[8rem] rounded border border-rpg-border bg-rpg-panel px-1.5 py-0.5 text-[11px] text-gray-300 outline-none transition-colors hover:border-rpg-gold"
          >
            {(['亮色', '暗色'] as const).map((group) => (
              <optgroup key={group} label={group}>
                {THEME_WHITELIST.filter((t) => t.group === group).map((t) => {
                  const entry = THEME_MAP[t.value]
                  return (
                    <option key={t.value} value={t.value}>
                      {entry?.name ?? t.value}
                    </option>
                  )
                })}
              </optgroup>
            ))}
          </select>
          <button
            onClick={() => {
              const mm = mmRef.current
              if (!mm) return
              try {
                mm.execCommand('EXPAND_ALL')
              } catch (e) {
                console.error('EXPAND_ALL failed', e)
              }
            }}
            title="展开所有节点"
            className="rounded px-2 py-0.5 text-gray-400 transition-all hover:bg-rpg-panelLight hover:text-white"
          >
            展开
          </button>
          <button
            onClick={() => {
              const mm = mmRef.current
              if (!mm) return
              try {
                mm.execCommand('UNEXPAND_ALL', true)
              } catch (e) {
                console.error('UNEXPAND_ALL failed', e)
              }
            }}
            title="收起所有节点"
            className="rounded px-2 py-0.5 text-gray-400 transition-all hover:bg-rpg-panelLight hover:text-white"
          >
            收起
          </button>
          <button
            onClick={() => {
              const mm = mmRef.current
              if (!mm) return
              alignViewLeft(mm, containerRef.current)
            }}
            title="视图居左（左右留白约 1:4）"
            className="rounded px-2 py-0.5 text-gray-400 transition-all hover:bg-rpg-panelLight hover:text-white"
          >
            居左
          </button>
        </div>
      </div>

      {/* 画布（select-none：节点文字/状态标签不可被拖选，杜绝"松开鼠标以搜索文本"） */}
      <div className="relative flex-1 select-none overflow-hidden">
          <div ref={containerRef} className="absolute inset-0 select-none overflow-hidden" />
          {(activeNodeText || activeCount > 1 || classified) && (
            <div className={`absolute bottom-3 left-1/2 z-10 flex max-w-[95%] -translate-x-1/2 flex-col items-center gap-1.5 ${ctrlHeld ? 'pointer-events-none' : ''}`}>
              {/* 状态选择器（单个选中或框选批量均可用） */}
              <div className="flex items-center gap-1 rounded-full border border-rpg-border bg-rpg-panelLight/95 px-2 py-1 shadow">
                <span className="px-1 text-[10px] text-gray-500">
                  {activeCount > 1 ? `已选 ${activeCount} 个节点` : '状态'}
                </span>
                {(Object.keys(NODE_STATUS) as NodeStatus[]).map((key) => {
                  const meta = NODE_STATUS[key]
                  const isActive = activeStatus === key
                  return (
                    <button
                      key={key}
                      onClick={() => handleStatusChange(key)}
                      title={activeCount > 1 ? `批量设为「${meta.label}」` : `设为「${meta.label}」`}
                      className="rounded-full px-2 py-0.5 text-[10px] transition-all hover:scale-105 active:scale-95"
                      style={
                        isActive
                          ? {
                              backgroundColor: meta.color,
                              color: '#fff',
                              border: `1px solid ${meta.color}`,
                            }
                          : {
                              color: meta.color,
                              border: `1px solid ${meta.color}55`,
                            }
                      }
                    >
                      {meta.emoji} {meta.label}
                    </button>
                  )
                })}
              </div>
              {/* 记为今日行动 / 为此任务开一局（仅单个选中时显示） */}
              {activeNodeText && activeCount <= 1 && (
                <>
                  <button
                    onClick={() => {
                      onRecord?.(activeNodeText)
                      mmRef.current?.execCommand('CLEAR_ACTIVE_NODE')
                    }}
                    className="flex max-w-full items-center gap-1.5 rounded-full border-2 border-rpg-gold bg-rpg-panelLight/95 px-4 py-1.5 text-[11px] text-rpg-gold shadow-gold transition-all hover:scale-105 active:scale-95"
                  >
                    <span>📝</span>
                    <span className="truncate">把「{activeNodeText}」记为今日行动</span>
                  </button>
                  <button
                    onClick={() => {
                      if (!activeNodeUid || !activeNodeText) return
                      // 联动右下角番茄钟 HUD：预填标题/任务 ID 并自动弹出面板，
                      // 全局 PomodoroTimer 消费 pendingLaunch（不跳首页）
                      setPendingLaunch({ taskId: activeNodeUid, title: activeNodeText })
                    }}
                    title="在右下角番茄钟为这个任务开一局"
                    className="flex max-w-full items-center gap-1.5 rounded-full border-2 border-rpg-xp bg-rpg-panelLight/95 px-4 py-1.5 text-[11px] text-rpg-xp transition-all hover:scale-105 active:scale-95"
                  >
                    <span>⚡</span>
                    <span className="truncate">为「{activeNodeText}」开一局</span>
                  </button>
                  {taskSessions.length > 0 && (
                    <div className="text-[10px] text-gray-500">
                      ⚡ 该任务已投 {taskSessions.length} 局 ·{' '}
                      {taskSessions.reduce((s, x) => s + x.actualMinutes, 0)} 分钟
                    </div>
                  )}
                </>
              )}
              {/* 批量 AI 分类记为今日已完成（多选时显示） */}
              {activeCount > 1 && (
                <button
                  onClick={handleBatchRecord}
                  disabled={classifying}
                  className="flex max-w-full items-center gap-1.5 rounded-full border-2 border-rpg-xp bg-rpg-panelLight/95 px-4 py-1.5 text-[11px] text-rpg-xp transition-all hover:scale-105 active:scale-95 disabled:cursor-wait disabled:opacity-60"
                >
                  <span>{classifying ? '⏳' : '✨'}</span>
                  <span className="truncate">
                    {classifying
                      ? 'AI 分类中…'
                      : `把 ${activeCount} 个节点记为今日已完成（AI 分类）`}
                  </span>
                </button>
              )}
              {/* AI 分类结果确认面板 */}
              {classified && (
                <div className="max-h-60 w-full max-w-lg overflow-hidden rounded-xl border-2 border-rpg-xp bg-rpg-panelLight/95 p-3 shadow-lg">
                  <div className="mb-2 text-[11px] text-gray-300">
                    ✨ AI 已分类 {classified.length} 条，确认后同类型将合并为一条记录（明细写进描述）
                  </div>
                  <div className="max-h-32 space-y-1 overflow-y-auto">
                    {classified.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded bg-rpg-panel/60 px-2 py-1 text-[11px]"
                      >
                        <span>{DOMAIN_META[item.type].icon}</span>
                        <span className="flex-1 truncate text-gray-200">{item.title}</span>
                        <span className="shrink-0 text-gray-500">{DOMAIN_META[item.type].label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={confirmBatchRecord} className="rpg-btn-primary flex-1 !py-1 text-[11px]">
                      确认记录
                    </button>
                    <button
                      onClick={() => setClassified(null)}
                      className="rpg-btn flex-1 !py-1 text-[11px]"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
    </div>
  )
}

/**
 * simple-mind-map 模块声明
 *
 * npm 包未随附类型文件（package.json 声明了 types/index.d.ts 但未发布），
 * 此处按 0.14.x 实际 API 补充最小声明。
 */

declare module 'simple-mind-map' {
  export interface MindMapNodeData {
    data: { text: string; [key: string]: unknown }
    children?: MindMapNodeData[]
    [key: string]: unknown
  }

  export interface MindMapOptions {
    el: HTMLElement | null
    data?: MindMapNodeData | null
    readonly?: boolean
    layout?: string
    theme?: string
    themeConfig?: Record<string, unknown>
    viewData?: unknown
    [key: string]: unknown
  }

  export default class MindMap {
    constructor(opt?: MindMapOptions)
    on(event: string, fn: (...args: unknown[]) => void): void
    off(event: string, fn: (...args: unknown[]) => void): void
    emit(event: string, ...args: unknown[]): void
    /** 获取节点树数据；withConfig 为 true 时附带布局/主题/视图 */
    getData(withConfig?: boolean): MindMapNodeData & Record<string, unknown>
    /** 设置节点树数据（会清空历史记录） */
    setData(data: MindMapNodeData): void
    execCommand(...args: unknown[]): void
    render(callback?: () => void, source?: string): void
    resize(): void
    destroy(): void
    setTheme(theme: string, notRender?: boolean): void
    setThemeConfig(config: Record<string, unknown>, notRender?: boolean): void
    setLayout(layout: string, notRender?: boolean): void
    static defineTheme(name: string, config: Record<string, unknown>): void
    static removeTheme(name: string): void
    view: {
      fit(): void
      reset(): void
      enlarge(ratio?: number): void
      narrow(ratio?: number): void
      setTransformData(data: unknown): void
      getTransformData(): unknown
      /** x 方向平移（正值向右，单位 px） */
      translateX(step: number): void
      translateXY(x: number, y: number): void
    }
    keyCommand: {
      /** 注册快捷键，key 形如 'Control+Shift+z'，多个用 | 分隔 */
      addShortcut(key: string, fn: () => void): void
      removeShortcut(key: string, fn: () => void): void
    }
    renderer: {
      expandAllNode(uid?: string): void
      unexpandAllNode(isSetRootNodeCenter?: boolean, uid?: string): void
      /** 当前激活（选中）的节点实例列表 */
      activeNodeList: Array<unknown>
      /** 文本编辑器：show 进入节点文本编辑（F2 同款入口） */
      textEdit: {
        show(opt: { node: unknown; e?: unknown; isInserting?: boolean; isFromKeyDown?: boolean }): Promise<void> | void
      }
    }
    static usePlugin(plugin: unknown, opt?: unknown): void
    static instanceCount: number
  }
}

/** Drag 插件：节点拖拽，可成为子节点或兄弟节点 */
declare module 'simple-mind-map/src/plugins/Drag' {
  const Drag: { new (opt: { mindMap: unknown }): unknown; instanceName: string }
  export default Drag
}

/** Select 插件：Ctrl+鼠标左键框选节点 */
declare module 'simple-mind-map/src/plugins/Select' {
  const Select: { new (opt: { mindMap: unknown }): unknown; instanceName: string }
  export default Select
}

/** 工具函数 */
declare module 'simple-mind-map/src/utils' {
  /** 节流：间隔 time 毫秒执行一次（trailing） */
  export const throttle: (
    fn: (...args: unknown[]) => void,
    time?: number,
    ctx?: unknown
  ) => (...args: unknown[]) => void
  export const debounce: (
    fn: (...args: unknown[]) => void,
    wait?: number,
    ctx?: unknown
  ) => (...args: unknown[]) => void
  /** 广度优先遍历节点树（只走 children，不含概要节点） */
  export const bfsWalk: (root: unknown, callback: (node: unknown, parent: unknown) => void | 'stop') => void
}

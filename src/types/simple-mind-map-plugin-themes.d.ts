/**
 * simple-mind-map-plugin-themes 模块声明
 *
 * 官方主题扩展插件，提供 54+ 套主题（亮色/暗色）。
 * npm 包未随附类型文件，按 1.0.1 实际 API 补充声明。
 */

declare module 'simple-mind-map-plugin-themes' {
  import type MindMap from 'simple-mind-map'

  export interface ThemeEntry {
    name: string
    value: string
    theme: Record<string, unknown>
    dark: boolean
  }

  interface Themes {
    darkList: ThemeEntry[]
    lightList: ThemeEntry[]
    init(MindMap: typeof MindMap): void
    remove(MindMap: typeof MindMap): void
  }

  const Themes: Themes
  export default Themes
}

declare module 'simple-mind-map-plugin-themes/themeList' {
  import type { ThemeEntry } from 'simple-mind-map-plugin-themes'
  const themeList: ThemeEntry[]
  export default themeList
}

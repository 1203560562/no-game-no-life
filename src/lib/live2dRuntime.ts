/**
 * Live2D 运行时共享加载器
 *
 * pixi-live2d-display 在模块顶层校验 window.Live2D / window.Live2DCubismCore，
 * 静态 import 会在核心脚本就绪前求值并抛错（白屏）。
 * 因此统一走本模块：先加载 Cubism 2/4 核心脚本，再动态 import 库并注册 Ticker。
 */

import * as PIXI from 'pixi.js'
import type { Live2DModel } from 'pixi-live2d-display'

export type Live2DLib = typeof import('pixi-live2d-display')

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

let libPromise: Promise<Live2DLib> | null = null

/** 获取已初始化的 pixi-live2d-display（单例；核心脚本就绪 + Ticker 已注册） */
export const loadLive2DLib = (): Promise<Live2DLib> => {
  if (!libPromise) {
    libPromise = (async () => {
      await Promise.all([loadScript('/live2d/live2dcubismcore.min.js'), loadScript('/live2d/live2d.min.js')])
      const lib = await import('pixi-live2d-display')
      lib.Live2DModel.registerTicker(PIXI.Ticker)
      return lib
    })()
  }
  return libPromise
}

/** 稀有度 → 徽章光晕色（与 CHEST_RARITY_META 体系对齐的浅色版） */
export const RARITY_GLOW: Record<string, string> = {
  common: '#cbd5e1',
  uncommon: '#4ade80',
  rare: '#60a5fa',
  epic: '#c084fc',
  legendary: '#fbbf24',
  mythic: '#fb7185',
}

export type { Live2DModel }

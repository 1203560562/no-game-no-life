/**
 * 角色渲染 v5 —— Live2D 纸片人（Haru）
 *
 * 渲染：pixi.js + pixi-live2d-display（见 Live2DCharacter.tsx / lib/live2dRuntime.ts）
 *
 * - 保留旧导出签名（Character / CharacterPose）；等级配饰阶段体系（EVOLUTION_STAGES）已删除，
 *   等级奖励改为解锁背景 / Live2D 形象（见 config/xpConfig.ts LEVEL_UP_REWARDS）
 * - 视线跟随鼠标、点击反应动作、姿态映射（idle→Idle / 其他→Tap）
 */

import { useEffect, useState } from 'react'
import { Live2DCharacter } from './Live2DCharacter'

/** 角色姿态（动作展示台 / 姿态切换用） */
export type CharacterPose = 'idle' | 'walk' | 'attack' | 'cast' | 'cheer'

/** 与旧 API 兼容的角色组件（Live2D 渲染；穿戴配饰体系已下架） */
export const Character: React.FC<{
  level: number
  size?: number
  animated?: boolean
  pose?: CharacterPose
  /** 渲染超采样倍率（转发 Live2DCharacter；小画框提清晰度用） */
  quality?: number
}> = (props) => <Live2DCharacter {...props} />

/** 角色舞台尺寸：随视口自适应，上限 460（今日冒险/背包/商店统一大舞台） */
export const useStageSize = () => {
  const [size, setSize] = useState(380)
  useEffect(() => {
    const calc = () => setSize(Math.round(Math.min(460, window.innerWidth * 0.82)))
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [])
  return size
}

/**
 * Live2D 动作播放总线（模块级 store）
 *
 * 页面上的动作切换条（MotionBar）与主画框渲染器（Live2DCharacter）解耦：
 * - MotionBar 调 requestPlayMotion(group, index) 发起播放请求
 * - Live2DCharacter 订阅后在当前模型上以 FORCE 优先级执行
 *
 * nonce 每次自增：重复点击同一动作也能重新触发（useSyncExternalStore 依赖比较）。
 */

export interface MotionRequest {
  group: string
  index: number
  nonce: number
}

let nonce = 0
let pending: MotionRequest | null = null
const listeners = new Set<() => void>()

/** 请求播放指定动作（组+序号）；所有订阅的 Live2D 实例都会尝试执行 */
export const requestPlayMotion = (group: string, index: number) => {
  pending = { group, index, nonce: ++nonce }
  listeners.forEach((l) => l())
}

/** 供 useSyncExternalStore：读取最近一次播放请求 */
export const getPlayMotion = (): MotionRequest | null => pending

export const subscribePlayMotion = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

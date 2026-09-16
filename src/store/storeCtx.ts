/**
 * Slice 共享上下文（从 useGameStore.ts 拆出的约定）
 * 各 slice 工厂函数接收 StoreCtx，访问 set/get/update/persist 等共享能力
 */
import type { AppState } from '../types'
import type { Achievement } from '../types'
import type { useGameStore } from './useGameStore'

export interface StoreCtx {
  set: (partial: Parameters<typeof useGameStore.setState>[0]) => void
  get: () => ReturnType<typeof useGameStore.getState>
  /** 状态变换 + 自动持久化 */
  update: (mutator: (s: AppState) => AppState) => void
  /** debounced 持久化 */
  persist: (state: AppState) => void
  /** 立即写入（state 已在 pending 队列或直接传入） */
  flushPersist: (state?: AppState) => Promise<void>
  /** 评估成就并发放奖励（任务榜等非活动入口复用） */
  evalWithRewards: (base: AppState) => { state: AppState; newly: Achievement[] }
}

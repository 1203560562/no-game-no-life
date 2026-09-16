/**
 * 任务榜（思维导图）域 slices（从 useGameStore.ts 拆出）
 */
import type { Achievement, MindMapDoc } from '../types'
import type { StoreCtx } from './storeCtx'

/** 任务榜域方法集（组合进 useGameStore） */
export const createMindMapSlices = (ctx: StoreCtx) => {
  const { set, update, evalWithRewards } = ctx
  return {
    createMindMap: (title: string) => {
      const id = `mm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const now = new Date().toISOString()
      const doc: MindMapDoc = {
        id,
        title,
        data: { data: { text: title }, children: [] },
        createdAt: now,
        updatedAt: now,
      }
      let newly: Achievement[] = []
      update((s) => {
        const r = evalWithRewards({ ...s, mindMaps: [...(s.mindMaps ?? []), doc] })
        newly = r.newly
        return r.state
      })
      if (newly.length > 0) set({ pendingAchievements: newly })
      return id
    },

    saveMindMap: (id: string, data: MindMapDoc['data']) => {
      let newly: Achievement[] = []
      update((s) => {
        const base = {
          ...s,
          mindMaps: (s.mindMaps ?? []).map((m) =>
            m.id === id ? { ...m, data, updatedAt: new Date().toISOString() } : m,
          ),
        }
        const r = evalWithRewards(base)
        newly = r.newly
        return r.state
      })
      if (newly.length > 0) set({ pendingAchievements: newly })
    },

    renameMindMap: (id: string, title: string) =>
      update((s) => ({
        ...s,
        mindMaps: (s.mindMaps ?? []).map((m) => (m.id === id ? { ...m, title } : m)),
      })),

    setMindMapTheme: (id: string, theme: string) =>
      update((s) => ({
        ...s,
        mindMaps: (s.mindMaps ?? []).map((m) =>
          m.id === id ? { ...m, theme, updatedAt: new Date().toISOString() } : m,
        ),
      })),

    deleteMindMap: (id: string) =>
      update((s) => ({
        ...s,
        mindMaps: (s.mindMaps ?? []).filter((m) => m.id !== id),
      })),
  }
}

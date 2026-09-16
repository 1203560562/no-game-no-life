/**
 * AI-003 短期记忆
 *
 * 对应说明书第 10 节。
 * 滑动窗口：最近 20~50 条对话 + 最近 7 天关键事件。
 * 不持久化为独立结构，由 store 的 chatHistory + activities 实时裁剪得到。
 */

import type { AppState, Activity, ChatMessage, EmotionRecord, MoodRecord } from '../../types'

export interface RecentEvents {
  activities: Activity[]
  emotions: EmotionRecord[]
  reflections: MoodRecord[]
}

export interface ShortTermMemory {
  recentChats: ChatMessage[]
  recentEvents: RecentEvents
}

const DAY_MS = 86400000

/**
 * 获取最近 N 条对话
 * 默认 10 条（上下文构建用），最大 50 条
 */
export const getRecentChats = (state: AppState, count = 10): ChatMessage[] => {
  const chats = state.chatHistory ?? []
  return chats.slice(-count)
}

/**
 * 获取最近 N 天的关键事件
 * 默认 7 天
 */
export const getRecentEvents = (state: AppState, days = 7): RecentEvents => {
  const cutoff = Date.now() - days * DAY_MS

  const activities = (state.activities ?? []).filter(
    (a) => new Date(a.createdAt).getTime() >= cutoff,
  )

  const emotions = (state.emotions ?? []).filter(
    (e) => new Date(e.createdAt).getTime() >= cutoff,
  )

  const reflections = (state.moods ?? []).filter((m) => {
    const mTime = new Date(m.createdAt).getTime()
    return mTime >= cutoff
  })

  return { activities, emotions, reflections }
}

/**
 * 构建完整的短期记忆上下文
 */
export const buildShortTermMemory = (state: AppState): ShortTermMemory => ({
  recentChats: getRecentChats(state),
  recentEvents: getRecentEvents(state),
})

/**
 * 检查用户输入是否与短期记忆中的近期事件重复
 * 用于反刍检测（AI-012）
 */
export const isRecentTopic = (
  state: AppState,
  topic: string,
  withinMinutes = 30,
): boolean => {
  const cutoff = Date.now() - withinMinutes * 60 * 1000
  const recentChats = (state.chatHistory ?? []).filter(
    (c) => new Date(c.createdAt).getTime() >= cutoff,
  )
  return recentChats.some((c) => c.content.includes(topic))
}

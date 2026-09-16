/**
 * AI 域 slices（从 useGameStore.ts 拆出）：
 * 记忆/聊天记录/建议/情绪/行为模式/认知洞察 CRUD
 */
import type {
  AIMemory,
  AISuggestion,
  BehaviorPattern,
  ChatMessage,
  CognitiveInsight,
  EmotionRecord,
} from '../types'
import { applyXp } from '../engine/levelSystem'
import { sumAttributes } from '../engine/xpCalculator'
import type { StoreCtx } from './storeCtx'

/** AI 域方法集（组合进 useGameStore） */
export const createAiSlices = (ctx: StoreCtx) => {
  const { update } = ctx
  return {
    addMemory: (memory: Omit<AIMemory, 'id' | 'createdAt' | 'useCount'>) => {
      const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const full: AIMemory = {
        ...memory,
        id,
        createdAt: new Date().toISOString(),
        useCount: 0,
      }
      update((s) => ({
        ...s,
        memories: [...(s.memories ?? []), full],
        aiGrowth: { ...(s.aiGrowth ?? { knowledgeLevel: 1, memoryCount: 0, userUnderstanding: 0, predictionAccuracy: 0 }), memoryCount: (s.memories ?? []).length + 1 },
      }))
      return id
    },

    updateMemory: (id: string, patch: Partial<AIMemory>) =>
      update((s) => ({
        ...s,
        memories: (s.memories ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)),
      })),

    deleteMemory: (id: string) =>
      update((s) => ({
        ...s,
        memories: (s.memories ?? []).filter((m) => m.id !== id),
        aiGrowth: { ...(s.aiGrowth ?? { knowledgeLevel: 1, memoryCount: 0, userUnderstanding: 0, predictionAccuracy: 0 }), memoryCount: Math.max(0, (s.memories ?? []).length - 1) },
      })),

    addChatMessage: (msg: Omit<ChatMessage, 'id' | 'createdAt'>) => {
      const full: ChatMessage = {
        ...msg,
        id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
      }
      // 保留最近 50 条（短期记忆窗口）
      update((s) => ({
        ...s,
        chatHistory: [...(s.chatHistory ?? []), full].slice(-50),
      }))
    },

    addSuggestion: (suggestion: Omit<AISuggestion, 'id' | 'createdAt' | 'status'>) => {
      const id = `sg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const full: AISuggestion = {
        ...suggestion,
        id,
        status: 'pending',
        createdAt: new Date().toISOString(),
      }
      update((s) => ({
        ...s,
        suggestions: [...(s.suggestions ?? []), full],
      }))
      return id
    },

    updateSuggestion: (id: string, patch: Partial<AISuggestion>) =>
      update((s) => ({
        ...s,
        suggestions: (s.suggestions ?? []).map((sg) =>
          sg.id === id ? { ...sg, ...patch, resolvedAt: patch.status && patch.status !== 'pending' ? new Date().toISOString() : sg.resolvedAt } : sg,
        ),
      })),

    addEmotion: (emotion: Omit<EmotionRecord, 'id' | 'createdAt'>) => {
      const full: EmotionRecord = {
        ...emotion,
        id: `emo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
      }
      update((s) => ({
        ...s,
        emotions: [...(s.emotions ?? []), full],
      }))
    },

    addPattern: (pattern: Omit<BehaviorPattern, 'id' | 'firstSeenAt' | 'lastSeenAt'>) => {
      const now = new Date().toISOString()
      const full: BehaviorPattern = {
        ...pattern,
        id: `pat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        firstSeenAt: now,
        lastSeenAt: now,
      }
      update((s) => ({
        ...s,
        patterns: [...(s.patterns ?? []), full],
      }))
    },

    addCognitiveInsight: (insight: Omit<CognitiveInsight, 'id' | 'createdAt' | 'userAccepted'>) => {
      const id = `ci_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const full: CognitiveInsight = {
        ...insight,
        id,
        userAccepted: false,
        createdAt: new Date().toISOString(),
      }
      update((s) => ({
        ...s,
        cognitiveInsights: [...(s.cognitiveInsights ?? []), full],
      }))
      return id
    },

    acceptCognitiveInsight: (id: string) =>
      update((s) => {
        const insights = (s.cognitiveInsights ?? []).map((ci) =>
          ci.id === id ? { ...ci, userAccepted: true } : ci,
        )
        const accepted = insights.find((ci) => ci.id === id)
        let player = s.player
        if (accepted?.attributeGains) {
          const { player: leveled } = applyXp(s.player, accepted.insightXp ?? 0)
          player = {
            ...leveled,
            attributes: accepted.attributeGains
              ? sumAttributes(accepted.attributeGains, leveled.attributes)
              : leveled.attributes,
          }
        }
        return { ...s, cognitiveInsights: insights, player }
      }),
  }
}

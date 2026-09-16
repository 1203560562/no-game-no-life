/**
 * AI-006 同行者对话引擎
 *
 * 对应 Master Prompt 第二十二、二十八节。
 * 用户与 AI 同行者自由对话。
 *
 * 特性：
 * - 六层上下文（含长期记忆检索）
 * - 反刍检测（连续重复同一话题 → 三选一）
 * - 心理健康安全拦截
 * - 记忆候选提取（写入长期记忆）
 * - 失败回退（规则引擎版话术）
 */

import type { AppState } from '../types'
import { chat } from './llmAdapter'
import { buildContext, historyToMessages } from './contextBuilder'
import { isRecentTopic } from './memory/shortTerm'
import { detectMentalHealthMention, MENTAL_HEALTH_REDIRECT } from './safetyGuard'
import type { AIMemory, MemoryType, MemoryLevel } from '../types'

/** 对话响应 */
export interface ChatResponse {
  /** AI 回复文本 */
  content: string
  /** 是否触发反刍提示 */
  isRumination: boolean
  /** 是否被安全拦截 */
  isBlocked: boolean
  /** 提取的记忆候选（如 AI 返回了 memoryCandidates） */
  memoryCandidates: Omit<AIMemory, 'id' | 'createdAt' | 'useCount'>[]
  /** 错误信息（回退时） */
  error?: string
}

/** 反刍提示文案 */
const RUMINATION_PROMPT =
  '我注意到我们最近几次都在聊类似的话题。目前似乎没有新增信息。你想怎么做？\n\nA. 采取一个小行动\nB. 暂停休息一下\nC. 继续深入思考'

/** 提取 JSON */
const extractJSON = (text: string): Record<string, unknown> | null => {
  try { return JSON.parse(text) } catch { /* continue */ }
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) { try { return JSON.parse(codeBlock[1]) } catch { /* continue */ } }
  const brace = text.match(/\{[\s\S]*\}/)
  if (brace) { try { return JSON.parse(brace[0]) } catch { /* continue */ } }
  return null
}

/** 提取用户输入的关键词（简单版：取长度≥3的词） */
const extractKeywords = (input: string): string[] => {
  // 中文按字，英文按词
  const cn = input.match(/[\u4e00-\u9fff]{2,}/g) ?? []
  const en = input.match(/[a-zA-Z]{4,}/g) ?? []
  return [...cn, ...en]
}

/**
 * 发送消息并获取 AI 回复
 *
 * @param state 当前应用状态
 * @param userMessage 用户消息
 * @returns AI 回复
 */
export const sendChatMessage = async (
  state: AppState,
  userMessage: string,
): Promise<ChatResponse> => {
  // 1. 心理健康安全检测
  if (detectMentalHealthMention(userMessage)) {
    return {
      content: MENTAL_HEALTH_REDIRECT,
      isRumination: false,
      isBlocked: true,
      memoryCandidates: [],
    }
  }

  // 2. 反刍检测：检查最近 30 分钟是否在讨论同一话题
  const keywords = extractKeywords(userMessage)
  const isRumination = keywords.some((kw) => isRecentTopic(state, kw, 30))

  if (isRumination) {
    return {
      content: RUMINATION_PROMPT,
      isRumination: true,
      isBlocked: false,
      memoryCandidates: [],
    }
  }

  // 3. 构建 Context + 调用 GLM
  try {
    const { messages: contextMessages } = buildContext(state, {
      scenario: 'chat',
      userInput: userMessage,
      memoryQuery: userMessage,
    })

    // 注入最近对话历史（多轮对话）
    const historyMessages = historyToMessages(state.chatHistory ?? [], 10)
    // 合并：system 部分 + 历史 + 当前用户输入（contextBuilder 已含 user 输入）
    // 但 contextBuilder 的 user 输入在最后，这里需要把历史插在 system 之后、user 之前
    const allMessages = [
      ...contextMessages.filter((m) => m.role === 'system'),
      ...historyMessages,
      { role: 'user' as const, content: userMessage },
    ]

    const result = await chat(allMessages, { temperature: 0.7, maxTokens: 800 })
    const json = extractJSON(result.content)

    if (json) {
      const content = (json.response as string) ?? result.content
      const suggestions = (json.suggestions as string[]) ?? []
      const memoryCandidatesRaw = (json.memoryCandidates as Array<Record<string, unknown>>) ?? []

      // 转换记忆候选
      const memoryCandidates = memoryCandidatesRaw
        .filter((m) => m.content && m.type)
        .map((m) => ({
          type: m.type as MemoryType,
          level: (m.level as MemoryLevel) ?? 2,
          content: m.content as string,
          confidence: typeof m.confidence === 'number' ? m.confidence : 0.5,
          source: (m.source as AIMemory['source']) ?? 'inferred',
          status: 'active' as const,
          lastUsedAt: new Date().toISOString(),
        }))

      // 附加建议（如有）
      const fullContent = suggestions.length > 0
        ? `${content}\n\n💡 ${suggestions.join('\n💡 ')}`
        : content

      return {
        content: fullContent,
        isRumination: false,
        isBlocked: false,
        memoryCandidates,
      }
    }

    // JSON 解析失败，用纯文本
    return {
      content: result.content,
      isRumination: false,
      isBlocked: false,
      memoryCandidates: [],
    }
  } catch (e) {
    return {
      content: '我现在有点忙，等会儿再聊吧。',
      isRumination: false,
      isBlocked: false,
      memoryCandidates: [],
      error: e instanceof Error ? e.message : 'AI 不可用',
    }
  }
}

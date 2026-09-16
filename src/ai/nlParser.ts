/**
 * AI-011 自然语言解析
 *
 * 对应 Master Prompt 第四十一节。
 * 用户输入自然语言 → GLM 解析为结构化活动 → 用户确认 → 批量记录。
 *
 * 示例：
 *   输入："今天打了2个半小时羽毛球，然后看了40分钟《被讨厌的勇气》"
 *   输出：[
 *     { type: 'exercise', subtype: 'badminton', title: '羽毛球', durationMinutes: 150 },
 *     { type: 'study', title: '阅读《被讨厌的勇气》', durationMinutes: 40 }
 *   ]
 */

import type { ActivityType, Intensity } from '../types'
import { chat } from './llmAdapter'
import { buildContext } from './contextBuilder'
import type { AppState } from '../types'

/** 解析出的活动候选 */
export interface ParsedActivity {
  type: ActivityType
  title: string
  description?: string
  durationMinutes?: number
  intensity?: Intensity
  subtype?: string
  difficulty?: number
  proactive?: boolean
  isEscape?: boolean
}

/** 解析结果 */
export interface ParseResult {
  /** 解析出的活动列表 */
  activities: ParsedActivity[]
  /** AI 给用户的回复（可能包含询问） */
  reply: string
  /** 是否需要用户补充信息 */
  needsClarification: boolean
  /** 检测到的情绪（如有） */
  detectedEmotion?: string
  /** 错误信息（解析失败时） */
  error?: string
}

/** GLM 返回的 JSON 结构 */
interface GLMParseResponse {
  response: string
  activities: ParsedActivity[]
  needsClarification?: boolean
  detectedEmotion?: string
}

/**
 * 解析自然语言输入
 *
 * @param state 当前应用状态（用于构建上下文）
 * @param input 用户自然语言输入
 * @returns 解析结果
 */
export const parseNaturalLanguage = async (
  state: AppState,
  input: string,
): Promise<ParseResult> => {
  // 构建 Context（含 system prompt + 画像 + 记忆 + 短期）
  // 包装用户输入，避免 GLM 把活动描述当成对 AI 的提问
  const { messages } = buildContext(state, {
    scenario: 'naturalLanguageParse',
    userInput: `请解析以下用户输入为结构化活动记录，只返回 JSON：\n\n${input}`,
    includePatterns: false, // 解析活动不需要模式数据
  })

  try {
    const result = await chat(messages, {
      temperature: 0.3, // 低温度保证结构稳定
      maxTokens: 1024,
    })

    // 从回复中提取 JSON
    const json = extractJSON(result.content)
    if (!json) {
      // AI 返回的不是 JSON，可能是自然语言对话
      // 检查是否是闲聊/提问，给出友好提示
      const lowerContent = result.content.toLowerCase()
      if (lowerContent.includes('我是') || lowerContent.includes('模型') || lowerContent.includes('ai')) {
        return {
          activities: [],
          reply: '我是活动记录助手，只能帮你记录活动。请描述你今天做了什么，例如："打了1小时羽毛球"。',
          needsClarification: true,
        }
      }
      return {
        activities: [],
        reply: '没能理解你的输入。请描述你今天做过的事，例如："看了30分钟书，然后跑了20分钟步"。',
        needsClarification: true,
        error: 'AI 未返回 JSON 格式',
      }
    }

    const parsed = json as unknown as GLMParseResponse

    // 校验活动字段
    const activities = (parsed.activities ?? [])
      .filter((a) => a.type && a.title)
      .map((a) => ({
        type: normalizeActivityType(a.type),
        title: a.title,
        description: a.description,
        durationMinutes: a.durationMinutes ? Math.max(0, Math.round(a.durationMinutes)) : undefined,
        intensity: normalizeIntensity(a.intensity),
        subtype: a.subtype,
        difficulty: a.difficulty ? Math.max(1, Math.min(5, a.difficulty)) : undefined,
        proactive: a.proactive,
        isEscape: a.isEscape,
      }))

    return {
      activities,
      reply: parsed.response ?? '',
      needsClarification: parsed.needsClarification ?? false,
      detectedEmotion: parsed.detectedEmotion,
    }
  } catch (e) {
    return {
      activities: [],
      reply: '解析服务暂时不可用，请使用手动记录。',
      needsClarification: false,
      error: e instanceof Error ? e.message : '未知错误',
    }
  }
}

/**
 * 从文本中提取 JSON 对象
 *
 * GLM 可能把 JSON 包在 ```json ... ``` 中或直接返回。
 */
const extractJSON = (text: string): Record<string, unknown> | null => {
  // 尝试直接 parse
  try {
    return JSON.parse(text)
  } catch {
    // 继续
  }

  // 尝试提取 ```json ... ``` 块
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1])
    } catch {
      // 继续
    }
  }

  // 尝试提取第一个 { ... } 块
  const braceMatch = text.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0])
    } catch {
      // 继续
    }
  }

  return null
}

/** 规范化活动类型 */
const normalizeActivityType = (type: string): ActivityType => {
  const valid: ActivityType[] = ['work', 'study', 'exercise', 'food', 'sleep', 'game', 'life', 'social', 'creative', 'challenge', 'mental']
  const lower = type.toLowerCase()
  return (valid.find((v) => v === lower) ?? 'life') as ActivityType
}

/** 规范化强度 */
const normalizeIntensity = (intensity?: string): Intensity | undefined => {
  if (!intensity) return undefined
  const lower = intensity.toLowerCase()
  if (lower === 'low' || lower === '轻松' || lower === '低') return 'low'
  if (lower === 'high' || lower === '高强度' || lower === '高') return 'high'
  return 'medium'
}

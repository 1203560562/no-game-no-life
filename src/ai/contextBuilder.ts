/**
 * AI-013/014 Context 构建器
 *
 * 对应说明书第 21 节、设计文档第 7 节。
 * 六层上下文 + Token 预算管理。
 *
 * 层次（优先级从高到低）：
 * 1. System Prompt（系统约束，必选）
 * 2. 用户画像（当前状态摘要）
 * 3. 长期记忆（检索 Top-K）
 * 4. 行为模式（已检测的模式）
 * 5. 短期记忆（最近对话 + 近期事件）
 * 6. 用户当前输入
 */

import type { AppState, ChatMessage } from '../types'
import type { ChatMessage as LLMMessage } from './llmAdapter'
import { buildSystemMessages, type PromptScenario } from './systemPrompt'
import { buildUserProfile, getProfileSummary } from './userProfile'
import { detectPatterns, getPatternSummary } from './patternDetector'
import { buildShortTermMemory } from './memory/shortTerm'
import { retrieveMemories } from './memory/longTerm'

/** Token 预算（粗略估算：1 中文 ≈ 2 token） */
const TOKEN_BUDGET = {
  system: 1500,
  profile: 300,
  memory: 500,
  pattern: 300,
  shortTerm: 800,
  user: 500,
  reserve: 1500, // 留给 AI 回复
}

/** 粗略估算字符串 token 数 */
const estimateTokens = (text: string): number => {
  // 中文约 2 token/字，英文约 1 token/4 字符
  const chinese = (text.match(/[\u4e00-\u9fff]/g) ?? []).length
  const other = text.length - chinese
  return Math.ceil(chinese * 2 + other / 4)
}

/** 截断文本到 token 预算内 */
const truncateToTokens = (text: string, maxTokens: number): string => {
  const tokens = estimateTokens(text)
  if (tokens <= maxTokens) return text
  // 粗略截断（按比例）
  const ratio = maxTokens / tokens
  const cutLen = Math.floor(text.length * ratio)
  return text.slice(0, cutLen) + '…'
}

export interface BuildContextOptions {
  /** 场景，决定 system prompt 模板 */
  scenario?: PromptScenario
  /** 用户输入 */
  userInput?: string
  /** 检索记忆的查询词（默认用 userInput） */
  memoryQuery?: string
  /** 是否包含行为模式（某些场景不需要） */
  includePatterns?: boolean
}

/**
 * 构建完整的六层上下文
 *
 * 返回 LLM messages 数组 + 构建统计
 */
export const buildContext = (
  state: AppState,
  options: BuildContextOptions = {},
): { messages: LLMMessage[]; stats: ContextStats } => {
  const {
    scenario,
    userInput,
    memoryQuery = userInput ?? '',
    includePatterns = true,
  } = options

  const stats: ContextStats = {
    systemTokens: 0,
    profileTokens: 0,
    memoryTokens: 0,
    patternTokens: 0,
    shortTermTokens: 0,
    userTokens: 0,
    totalTokens: 0,
    memoryCount: 0,
  }

  const messages: LLMMessage[] = []

  // ===== Layer 1: System Prompt =====
  const systemMsgs = buildSystemMessages(scenario)
  for (const msg of systemMsgs) {
    messages.push(msg)
    stats.systemTokens += estimateTokens(msg.content)
  }

  // ===== Layer 2: 用户画像 =====
  const profile = buildUserProfile(state)
  const profileSummary = getProfileSummary(profile)
  const profileText = truncateToTokens(`【用户画像】\n${profileSummary}`, TOKEN_BUDGET.profile)
  if (profileText) {
    messages.push({ role: 'system', content: profileText })
    stats.profileTokens = estimateTokens(profileText)
  }

  // ===== Layer 3: 长期记忆 =====
  if (memoryQuery) {
    const memories = retrieveMemories(state, memoryQuery, { topK: 5 })
    if (memories.length > 0) {
      const memoryText = memories
        .map((m) => `- [${m.type} L${m.level}] ${m.content}（置信 ${(m.confidence * 100).toFixed(0)}%）`)
        .join('\n')
      const truncated = truncateToTokens(`【长期记忆】\n${memoryText}`, TOKEN_BUDGET.memory)
      messages.push({ role: 'system', content: truncated })
      stats.memoryTokens = estimateTokens(truncated)
      stats.memoryCount = memories.length
    }
  }

  // ===== Layer 4: 行为模式 =====
  if (includePatterns) {
    const patterns = detectPatterns(state)
    if (patterns.length > 0) {
      const patternText = truncateToTokens(
        `【行为模式】\n${getPatternSummary(patterns)}`,
        TOKEN_BUDGET.pattern,
      )
      messages.push({ role: 'system', content: patternText })
      stats.patternTokens = estimateTokens(patternText)
    }
  }

  // ===== Layer 5: 短期记忆（最近对话 + 近期事件） =====
  const shortTerm = buildShortTermMemory(state)
  const shortTermParts: string[] = []

  // 最近 3 条对话
  const recentChats = shortTerm.recentChats.slice(-3)
  if (recentChats.length > 0) {
    const chatText = recentChats
      .map((c) => `${c.role === 'user' ? '用户' : 'AI'}: ${c.content}`)
      .join('\n')
    shortTermParts.push(`最近对话:\n${chatText}`)
  }

  // 最近 3 天活动摘要
  const recentActs = shortTerm.recentEvents.activities.slice(-5)
  if (recentActs.length > 0) {
    const actText = recentActs
      .map((a) => `- ${a.type}: ${a.title} (${a.durationMinutes ?? 0}分钟, +${a.xp}XP)`)
      .join('\n')
    shortTermParts.push(`近期活动:\n${actText}`)
  }

  if (shortTermParts.length > 0) {
    const shortTermText = truncateToTokens(
      `【短期记忆】\n${shortTermParts.join('\n\n')}`,
      TOKEN_BUDGET.shortTerm,
    )
    messages.push({ role: 'system', content: shortTermText })
    stats.shortTermTokens = estimateTokens(shortTermText)
  }

  // ===== Layer 6: 用户输入 =====
  if (userInput) {
    messages.push({ role: 'user', content: userInput })
    stats.userTokens = estimateTokens(userInput)
  }

  stats.totalTokens =
    stats.systemTokens +
    stats.profileTokens +
    stats.memoryTokens +
    stats.patternTokens +
    stats.shortTermTokens +
    stats.userTokens

  return { messages, stats }
}

export interface ContextStats {
  systemTokens: number
  profileTokens: number
  memoryTokens: number
  patternTokens: number
  shortTermTokens: number
  userTokens: number
  totalTokens: number
  memoryCount: number
}

/**
 * 将 store 中的 ChatHistory 转为 LLM 消息格式
 * （用于多轮对话时带上历史）
 */
export const historyToMessages = (
  history: ChatMessage[],
  maxCount = 10,
): LLMMessage[] => {
  return history
    .slice(-maxCount)
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
}

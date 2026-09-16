/**
 * AI-001/002/003 AI 总结引擎
 *
 * 对应 Master Prompt 第三十一~三十三节。
 * 日总结 / 周分析 / 月总结，调用 GLM 生成。
 * 失败时回退到规则引擎版（settlements.ts）。
 */

import type { AppState } from '../types'
import { chat } from './llmAdapter'
import { buildContext } from './contextBuilder'
import {
  buildDailySettlement,
  buildWeeklyReport,
  buildMonthlySummary,
} from '../engine/settlements'
import { getProfileSummary, buildUserProfile } from './userProfile'
import { getPatternSummary, detectPatterns } from './patternDetector'

/** AI 总结结果 */
export interface AISummary {
  /** AI 生成的总结文本 */
  content: string
  /** AI 给出的建议（如有） */
  suggestions: string[]
  /** 是否来自 AI（false = 规则引擎回退） */
  fromAI: boolean
  /** 错误信息（回退时） */
  fallbackReason?: string
}

/** 提取 JSON */
const extractJSON = (text: string): Record<string, unknown> | null => {
  try { return JSON.parse(text) } catch { /* continue */ }
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) { try { return JSON.parse(codeBlock[1]) } catch { /* continue */ } }
  const brace = text.match(/\{[\s\S]*\}/)
  if (brace) { try { return JSON.parse(brace[0]) } catch { /* continue */ } }
  return null
}

/**
 * AI-001 每日总结
 */
export const generateDailySummary = async (state: AppState): Promise<AISummary> => {
  const daily = buildDailySettlement(state)

  try {
    const { messages } = buildContext(state, {
      scenario: 'dailySummary',
      includePatterns: false,
    })

    const result = await chat(messages, { temperature: 0.6, maxTokens: 800 })
    const json = extractJSON(result.content)

    if (json) {
      const response = (json.response as string) ?? result.content
      const suggestions = (json.suggestions as string[]) ?? []
      return { content: response, suggestions, fromAI: true }
    }

    // JSON 解析失败，用纯文本
    return {
      content: result.content || daily.evaluation,
      suggestions: [],
      fromAI: true,
    }
  } catch (e) {
    return {
      content: daily.evaluation,
      suggestions: [],
      fromAI: false,
      fallbackReason: e instanceof Error ? e.message : 'AI 不可用',
    }
  }
}

/**
 * AI-002 每周分析
 */
export const generateWeeklyAnalysis = async (state: AppState): Promise<AISummary> => {
  const weekly = buildWeeklyReport(state)

  try {
    const { messages } = buildContext(state, {
      scenario: 'weeklyAnalysis',
      includePatterns: true,
    })

    const result = await chat(messages, { temperature: 0.6, maxTokens: 1000 })
    const json = extractJSON(result.content)

    if (json) {
      const response = (json.response as string) ?? result.content
      const suggestions = (json.suggestions as string[]) ?? []
      return { content: response, suggestions, fromAI: true }
    }

    return {
      content: result.content || weekly.evaluation,
      suggestions: [],
      fromAI: true,
    }
  } catch (e) {
    return {
      content: weekly.evaluation,
      suggestions: [],
      fromAI: false,
      fallbackReason: e instanceof Error ? e.message : 'AI 不可用',
    }
  }
}

/**
 * AI-003 每月总结（"过去30天的你"）
 */
export const generateMonthlySummary = async (state: AppState): Promise<AISummary> => {
  const monthly = buildMonthlySummary(state)
  const profile = buildUserProfile(state)
  const patterns = detectPatterns(state)

  try {
    const { messages } = buildContext(state, {
      scenario: 'monthlySummary',
      includePatterns: true,
    })

    // 补充月度数据摘要
    const dataSummary = `【30天数据】
总XP: ${monthly.totalXp}
等级变化: ${monthly.levelFrom} → ${monthly.levelTo}
运动: ${monthly.exerciseHours}h, 学习: ${monthly.studyHours}h, 创作: ${monthly.creativeCount}次
心理反思: ${monthly.reflectionCount}次
${monthly.weightTrend !== undefined ? `体重趋势: ${monthly.weightTrend > 0 ? '+' : ''}${monthly.weightTrend}kg` : ''}

${getProfileSummary(profile)}

${patterns.length > 0 ? `检测到的模式:\n${getPatternSummary(patterns)}` : ''}`

    messages.push({ role: 'system', content: dataSummary })

    const result = await chat(messages, { temperature: 0.7, maxTokens: 1200 })
    const json = extractJSON(result.content)

    if (json) {
      const response = (json.response as string) ?? result.content
      const suggestions = (json.suggestions as string[]) ?? []
      return { content: response, suggestions, fromAI: true }
    }

    return {
      content: result.content || monthly.evaluation,
      suggestions: [],
      fromAI: true,
    }
  } catch (e) {
    return {
      content: monthly.evaluation,
      suggestions: [],
      fromAI: false,
      fallbackReason: e instanceof Error ? e.message : 'AI 不可用',
    }
  }
}

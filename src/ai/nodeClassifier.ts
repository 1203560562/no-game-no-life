/**
 * 思维导图节点 → 活动类型分类
 *
 * 用于"框选节点 → 记为今日已完成"场景：
 * 把选中的节点文本批量交给 GLM 分类到 ActivityType，
 * 用户确认后逐条写入活动记录。
 */

import type { ActivityType } from '../types'
import { chat } from './llmAdapter'

export interface ClassifiedItem {
  /** 节点文本（作为活动标题） */
  title: string
  /** AI 分配的活动类型 */
  type: ActivityType
}

const VALID_TYPES: ActivityType[] = [
  'work',
  'study',
  'exercise',
  'food',
  'sleep',
  'game',
  'life',
  'social',
  'creative',
  'challenge',
  'mental',
]

/**
 * 批量分类节点文本
 *
 * AI 失败或个别条目缺失时，对应条目回落为 'life'，保证流程不中断。
 */
export const classifyNodes = async (titles: string[]): Promise<ClassifiedItem[]> => {
  if (titles.length === 0) return []

  const list = titles.map((t, i) => `${i + 1}. ${t}`).join('\n')
  const system = `你是活动分类助手。把用户给出的每条已完成事项分类到最合适的活动类型。

可选类型：
work=工作 study=学习 exercise=运动 food=饮食 sleep=睡眠
game=娱乐 life=生活 social=关系 creative=创作 mental=心理

只返回 JSON，不要任何多余解释，格式：
{"items":[{"index":1,"type":"work"}]}`

  try {
    const result = await chat(
      [
        { role: 'system', content: system },
        { role: 'user', content: `待分类事项：\n${list}` },
      ],
      { temperature: 0.1, maxTokens: 1024 },
    )
    const json = extractJSON(result.content)
    const items = Array.isArray(json?.items) ? (json.items as Array<{ index?: number; type?: string }>) : []
    const byIndex = new Map<number, ActivityType>()
    for (const it of items) {
      const idx = Number(it.index)
      const type = String(it.type ?? '').toLowerCase()
      if (Number.isFinite(idx) && (VALID_TYPES as string[]).includes(type)) {
        byIndex.set(idx, type as ActivityType)
      }
    }
    return titles.map((t, i) => ({ title: t, type: byIndex.get(i + 1) ?? 'life' }))
  } catch {
    // AI 不可用时全部回落为 life
    return titles.map((t) => ({ title: t, type: 'life' as ActivityType }))
  }
}

/** 从 AI 回复中提取 JSON（容忍 ```json 包裹或前后缀文本） */
const extractJSON = (text: string): { items?: unknown } | null => {
  try {
    return JSON.parse(text) as { items?: unknown }
  } catch {
    // 继续
  }
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) {
    try {
      return JSON.parse(codeBlock[1]) as { items?: unknown }
    } catch {
      // 继续
    }
  }
  const brace = text.match(/\{[\s\S]*\}/)
  if (brace) {
    try {
      return JSON.parse(brace[0]) as { items?: unknown }
    } catch {
      // 继续
    }
  }
  return null
}

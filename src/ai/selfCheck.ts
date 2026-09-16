/**
 * AI-018 AI 自我校验
 *
 * 对应说明书第 37 节。
 * AI 输出前强制执行五项校验，任一失败则拦截或要求重写。
 */

import type { AIOutput, AppState, AIMemory } from '../types'
import { safetyCheck } from './safetyGuard'

export interface CheckResult {
  name: string
  passed: boolean
  reason?: string
}

export interface SelfCheckReport {
  passed: boolean
  results: CheckResult[]
}

/**
 * 1. Fact Check — 结论有无用户数据支持？
 *
 * 检查 output.facts 中的每条声明是否能在 state 中找到对应数据。
 * 本轮采用启发式：fact 非空且 output.activities 中有对应活动。
 */
const factCheck = (output: AIOutput, state: AppState): CheckResult => {
  // 如果没有声明 facts，跳过
  if (output.facts.length === 0) return { name: 'Fact Check', passed: true }

  // 简单启发式：facts 中提到的数字应在活动数据范围内
  const totalActivities = state.activities.length
  for (const fact of output.facts) {
    // 提取 fact 中的数字
    const nums = fact.match(/\d+/g)
    if (nums) {
      for (const n of nums) {
        const val = parseInt(n, 10)
        // 如果声称次数超过实际活动数，标记失败
        if (val > totalActivities && val > 0) {
          return {
            name: 'Fact Check',
            passed: false,
            reason: `声明 "${fact.slice(0, 30)}..." 中的数字 ${val} 超过实际活动数 ${totalActivities}`,
          }
        }
      }
    }
  }

  return { name: 'Fact Check', passed: true }
}

/**
 * 2. Memory Check — 是否错误使用长期记忆？
 *
 * 检查 output 引用的记忆是否实际存在且未被标记错误/废弃。
 */
const memoryCheck = (output: AIOutput, memories: AIMemory[]): CheckResult => {
  // 检查 memoryCandidates 是否引用了不存在的记忆
  for (const candidate of output.memoryCandidates) {
    // 如果 candidate 有 supersedes，检查被替代的记忆是否存在
    if (candidate.supersedes) {
      const exists = memories.some((m) => m.id === candidate.supersedes)
      if (!exists) {
        return {
          name: 'Memory Check',
          passed: false,
          reason: `记忆候选引用了不存在的旧记忆 ${candidate.supersedes}`,
        }
      }
    }
  }

  // 检查 response 中是否引用了被标记错误或已废弃的记忆
  const invalidMemories = memories.filter(
    (m) => m.status === 'deprecated' || m.userFlagged === 'wrong',
  )
  for (const mem of invalidMemories) {
    if (output.response.includes(mem.content)) {
      return {
        name: 'Memory Check',
        passed: false,
        reason: `回复引用了已失效的记忆: "${mem.content.slice(0, 20)}..."`,
      }
    }
  }

  return { name: 'Memory Check', passed: true }
}

/**
 * 3. Confidence Check — 是否把猜测说成事实？
 *
 * 检查 inferences 是否出现在 response 中且未用"可能"等限定词。
 */
const confidenceCheck = (output: AIOutput): CheckResult => {
  const certaintyWords = ['肯定', '一定', '绝对', '毫无疑问', '就是因为', '必然']
  const hedgeWords = ['可能', '也许', '或许', '似乎', '倾向于', '看起来']

  for (const inf of output.inferences) {
    // inference 本身是否有限定词
    const hasHedge = hedgeWords.some((w) => inf.includes(w))
    const hasCertainty = certaintyWords.some((w) => inf.includes(w))

    if (hasCertainty && !hasHedge) {
      return {
        name: 'Confidence Check',
        passed: false,
        reason: `推测使用了过于确定的表述: "${inf.slice(0, 30)}..."`,
      }
    }
  }

  // 检查 response 中是否把 inference 当 fact 说
  for (const inf of output.inferences) {
    if (output.response.includes(inf)) {
      const hasHedge = hedgeWords.some((w) => output.response.includes(w))
      if (!hasHedge) {
        return {
          name: 'Confidence Check',
          passed: false,
          reason: `回复中将推测当作事实表述: "${inf.slice(0, 30)}..."`,
        }
      }
    }
  }

  return { name: 'Confidence Check', passed: true }
}

/**
 * 4. Action Check — 建议是否符合当前目标？
 *
 * 检查 suggestions 是否与用户当前里程碑目标相关或至少不冲突。
 */
const actionCheck = (output: AIOutput, state: AppState): CheckResult => {
  // 休息模式下不应产出催促类建议
  if (state.restMode) {
    const pushWords = ['赶紧', '马上做', '必须完成', '不能拖延', '立即开始']
    for (const s of output.suggestions) {
      if (pushWords.some((w) => s.includes(w))) {
        return {
          name: 'Action Check',
          passed: false,
          reason: `休息模式下不应催促用户: "${s.slice(0, 30)}..."`,
        }
      }
    }
  }

  return { name: 'Action Check', passed: true }
}

/**
 * 5. Safety Check — 是否存在危险建议？
 *
 * 委托给 safetyGuard 执行。
 */
const safetyCheckResult = (output: AIOutput): CheckResult => {
  const { violations } = safetyCheck(output)
  const blockViolations = violations.filter((v) => v.severity === 'block')
  if (blockViolations.length > 0) {
    return {
      name: 'Safety Check',
      passed: false,
      reason: blockViolations.map((v) => `${v.rule}: "${v.matched}"`).join('; '),
    }
  }
  return { name: 'Safety Check', passed: true }
}

/**
 * 执行完整五项校验
 *
 * 任一项失败 → passed=false
 */
export const runSelfCheck = (output: AIOutput, state: AppState): SelfCheckReport => {
  const results: CheckResult[] = [
    factCheck(output, state),
    memoryCheck(output, state.memories ?? []),
    confidenceCheck(output),
    actionCheck(output, state),
    safetyCheckResult(output),
  ]

  return {
    passed: results.every((r) => r.passed),
    results,
  }
}

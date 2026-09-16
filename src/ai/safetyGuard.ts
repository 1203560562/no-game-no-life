/**
 * AI-016 安全与心理边界
 *
 * 对应说明书第 34、35、4.2 节。
 * 对所有 AI 输出强制拦截，禁止危险/诊断/依赖性内容。
 */

import type { AIOutput } from '../types'

export interface SafetyViolation {
  rule: string
  matched: string
  severity: 'block' | 'warn'
}

// ===== 禁止关键词模式（正则） =====
const BLOCK_PATTERNS: { pattern: RegExp; rule: string }[] = [
  // 诊断精神疾病
  { rule: '禁止诊断精神疾病', pattern: /抑郁[症]?|焦虑[症]?|ADHD|多动症|双相|躁郁|精神分裂|强迫症|恐慌症|创伤后应激|PTSD/i },
  // 声称确定知道心理原因
  { rule: '禁止声称确定知道心理原因', pattern: /你的真实问题就是|你就是因为.+才|你根本原因就是|你的心理问题就是/i },
  // 诱导极端行为
  { rule: '禁止诱导自伤', pattern: /自伤|自残|割腕|自杀|不想活|结束生命|伤害自己/i },
  { rule: '禁止诱导伤害他人', pattern: /伤害(他|别)人|报复|打人|暴力解决/i },
  // 鼓励过度工作/熬夜
  { rule: '禁止鼓励过度工作', pattern: /熬夜(干活|工作|学习)|通宵(工作|学习)|不睡觉也要|连续工作\d+小时/i },
  // 鼓励极端节食/脱水
  { rule: '禁止鼓励极端节食', pattern: /不吃饭|断食\d+天|只喝水|极低热量|每天只吃\d+/i },
  { rule: '禁止鼓励脱水', pattern: /不喝水|少喝水减肥/i },
  // 鼓励过度运动
  { rule: '禁止鼓励过度运动', pattern: /每天运动[5-9]小时|连续跑步[3-9]小时|过度训练/i },
  // 制造情绪依赖
  { rule: '禁止制造情绪依赖', pattern: /只有我最懂你|没有我你解决不了|你必须每天来找我|你离不开我/i },
]

const WARN_PATTERNS: { pattern: RegExp; rule: string }[] = [
  // 人生评分
  { rule: '禁止人生评分', pattern: /人生得分|人生评分|你的人生[得评]分/i },
  // 无依据鼓励
  { rule: '无依据鼓励', pattern: /你太棒了|你是最棒的|你完美无缺|你无可挑剔/i },
]

// ===== FACT / OBSERVATION / INFERENCE 区分 =====
// 检查是否把推测说成事实
const INFERENCE_AS_FACT_PATTERNS: RegExp[] = [
  /你就是因为/i,
  /你一定是因为/i,
  /你的问题就是/i,
  /你肯定会/i,
  /你永远会/i,
]

/**
 * 扫描文本，返回违规列表
 */
export const scanText = (text: string): SafetyViolation[] => {
  const violations: SafetyViolation[] = []

  for (const { pattern, rule } of BLOCK_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      violations.push({ rule, matched: match[0], severity: 'block' })
    }
  }

  for (const { pattern, rule } of WARN_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      violations.push({ rule, matched: match[0], severity: 'warn' })
    }
  }

  return violations
}

/**
 * 检查推测被说成事实
 */
export const checkInferenceAsFact = (text: string): SafetyViolation[] => {
  const violations: SafetyViolation[] = []
  for (const pattern of INFERENCE_AS_FACT_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      violations.push({
        rule: '把推测说成事实',
        matched: match[0],
        severity: 'block',
      })
    }
  }
  return violations
}

/**
 * 对 AIOutput 执行完整安全扫描
 *
 * 返回 { passed, violations } —— 有 block 级违规时 passed=false
 */
export const safetyCheck = (output: AIOutput): { passed: boolean; violations: SafetyViolation[] } => {
  const violations: SafetyViolation[] = []

  // 扫描 response 文本
  violations.push(...scanText(output.response))
  violations.push(...checkInferenceAsFact(output.response))

  // 扫描 suggestions
  for (const s of output.suggestions) {
    violations.push(...scanText(s))
  }

  // 扫描 inferences，检查是否用了过于确定的语气
  for (const inf of output.inferences) {
    violations.push(...checkInferenceAsFact(inf))
  }

  // 检查 safetyFlags 自身
  for (const flag of output.safetyFlags) {
    violations.push(...scanText(flag))
  }

  const hasBlock = violations.some((v) => v.severity === 'block')
  return { passed: !hasBlock, violations }
}

/**
 * 生成安全替代回复（当 AI 输出被拦截时使用）
 */
export const SAFE_FALLBACK_RESPONSE =
  '我观察到一些情况，但目前还不确定具体原因。我们可以一起看看数据，慢慢理解发生了什么。'

/**
 * 心理边界响应模板
 * 检测到心理/健康相关表述时使用
 */
export const MENTAL_HEALTH_REDIRECT =
  '我注意到你提到了一些感受。我不是专业人士，无法做出诊断。如果这些感受持续困扰你，建议和信任的人聊聊，或寻求专业心理咨询师的帮助。'

/**
 * 检测用户输入是否涉及心理健康关键词（用于触发安全响应）
 */
export const detectMentalHealthMention = (text: string): boolean => {
  const patterns = [
    /不想活|不想存在|想死|结束一切|活着没意义/i,
    /自残|自伤|割自己/i,
    /抑郁|崩溃|撑不下去/i,
  ]
  return patterns.some((p) => p.test(text))
}

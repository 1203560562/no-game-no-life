/**
 * GLM (智谱) LLM Adapter
 *
 * 浏览器通过 Vite proxy（/glm-api）访问智谱 API，
 * Authorization 头由 proxy 从 .env.local 注入，不暴露到前端。
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  /** 模型名，默认取 VITE_GLM_MODEL（当前 glm-5.3，编程套餐端点） */
  model?: string
  /** 温度 0..1，默认 0.7 */
  temperature?: number
  /** 最大 token 数 */
  maxTokens?: number
  /** 是否流式返回 */
  stream?: boolean
}

export interface ChatResult {
  content: string
  /** 完整原始响应（调试用） */
  raw?: unknown
}

// 主力模型：glm-4.7（高智能主力，¥2/¥8 每百万 tokens，推理/编程全面优于 flash）
// 可通过 .env.local 的 VITE_GLM_MODEL 覆盖（如 glm-4.5-air / glm-5.2 / glm-5.3）
const DEFAULT_MODEL = import.meta.env.VITE_GLM_MODEL ?? 'glm-4.7'
const PROXY_BASE = '/glm-api'

/**
 * 调用 GLM chat completions（非流式）
 *
 * 失败时抛错，由调用方决定是否回退规则引擎。
 */
export const chat = async (
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<ChatResult> => {
  const model = opts.model ?? DEFAULT_MODEL
  const body = {
    model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 1024,
    stream: false,
  }

  // 30s 超时，防止 API 慢时用户无限等待
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  const res = await fetch(`${PROXY_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`GLM API ${res.status}: ${errText || res.statusText}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content ?? ''
  return { content, raw: data }
}

/**
 * 流式调用 GLM chat completions
 *
 * 通过 async generator 逐块产出文本。
 */
export async function* chatStream(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): AsyncGenerator<string> {
  const model = opts.model ?? DEFAULT_MODEL
  const body = {
    model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 1024,
    stream: true,
  }

  const res = await fetch(`${PROXY_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`GLM API ${res.status}: ${errText || res.statusText}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const jsonStr = trimmed.slice(5).trim()
      if (jsonStr === '[DONE]') return
      try {
        const chunk = JSON.parse(jsonStr)
        const delta = chunk?.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch {
        // 忽略解析错误的块
      }
    }
  }
}

/**
 * 快速健康检查：发送一个极简请求验证 API Key 与连通性
 */
export const healthCheck = async (): Promise<{ ok: boolean; message: string }> => {
  try {
    const result = await chat(
      [{ role: 'user', content: '请回复"OK"两个字' }],
      { maxTokens: 10, temperature: 0 },
    )
    return { ok: true, message: `连接成功，模型响应: ${result.content.slice(0, 20)}` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '未知错误' }
  }
}

/**
 * 同行者对话面板
 *
 * Dashboard 上的对话入口。
 * 支持展开/收起、消息列表、输入框、反刍提示样式。
 */

import { useState, useRef, useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'
import { sendChatMessage } from '../ai/chatService'
import { APP_CONFIG } from '../config/appConfig'

export const ChatPanel: React.FC = () => {
  const state = useGameStore((s) => s.state)
  const addChatMessage = useGameStore((s) => s.addChatMessage)
  const addMemory = useGameStore((s) => s.addMemory)

  const [expanded, setExpanded] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const chatHistory = state.chatHistory ?? []

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatHistory, loading])

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg || loading) return

    // 写入用户消息
    addChatMessage({ role: 'user', content: msg })
    setInput('')
    setLoading(true)

    try {
      const response = await sendChatMessage(state, msg)

      // 写入 AI 回复
      addChatMessage({
        role: 'assistant',
        content: response.content,
        isRumination: response.isRumination,
      })

      // 写入记忆候选
      for (const candidate of response.memoryCandidates) {
        addMemory(candidate)
      }
    } catch {
      addChatMessage({
        role: 'assistant',
        content: '出错了，请稍后再试。',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="rpg-panel flex w-full items-center gap-2 p-4 transition-all hover:border-rpg-xp"
      >
        <span className="text-xl">💬</span>
        <div className="text-left">
          <div className="text-sm text-rpg-xp">和{APP_CONFIG.companionName}聊聊</div>
          <div className="text-[10px] text-gray-500">AI 会记住你说过的话</div>
        </div>
        <span className="ml-auto text-gray-500">›</span>
      </button>
    )
  }

  return (
    <div className="rpg-panel flex h-[420px] flex-col p-3">
      {/* header */}
      <div className="mb-2 flex items-center justify-between border-b border-rpg-border pb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">💬</span>
          <span className="text-xs text-rpg-xp">{APP_CONFIG.companionName}对话</span>
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="text-[10px] text-gray-500 hover:text-white"
        >
          收起 ›
        </button>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto pr-1">
        {chatHistory.length === 0 && !loading && (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <div className="mb-1 text-2xl">🗣️</div>
              <div className="text-[11px] text-gray-500">
                跟我说说今天怎么样？
                <br />
                我会记住你分享的重要事情。
              </div>
            </div>
          </div>
        )}

        {chatHistory.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-2 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-rpg-xp/20 text-gray-100'
                  : msg.isRumination
                    ? 'border border-rpg-gold/40 bg-rpg-gold/10 text-rpg-gold'
                    : 'bg-rpg-panelLight/50 text-gray-200'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-rpg-panelLight/50 p-2 text-xs text-gray-400">
              <span className="animate-pulse">{APP_CONFIG.companionName}正在思考</span>
              <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
              <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
              <span className="animate-pulse" style={{ animationDelay: '0.6s' }}>●</span>
            </div>
          </div>
        )}
      </div>

      {/* input */}
      <div className="mt-2 flex gap-1.5 border-t border-rpg-border pt-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="说点什么..."
          disabled={loading}
          className="flex-1 rounded-lg border border-rpg-border bg-rpg-bg px-2 py-1.5 text-xs focus:border-rpg-xp focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="rounded-lg border border-rpg-xp/50 bg-rpg-xp/20 px-3 py-1.5 text-xs text-rpg-xp transition-all hover:bg-rpg-xp/30 disabled:opacity-50"
        >
          发送
        </button>
      </div>
    </div>
  )
}

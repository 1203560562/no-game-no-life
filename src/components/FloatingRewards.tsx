/**
 * 全局飘字层：记录活动 / 局结算时，+XP、+金币、+属性、新纪录 飘字从屏幕下方升起淡出。
 * 挂载于 App 根部，自动监听 game store 的两种 feedback。
 */

import { useEffect, useState } from 'react'
import { useGameStore } from '../store/useGameStore'

interface FloatItem {
  id: number
  text: string
  color: string
  /** 随机水平偏移，避免重叠 */
  offset: number
}

let uid = 0

export const FloatingRewards: React.FC = () => {
  const feedback = useGameStore((s) => s.pendingFeedback)
  const sessionFb = useGameStore((s) => s.pendingSessionFeedback)
  const [items, setItems] = useState<FloatItem[]>([])

  const push = (text: string, color: string, delay = 0) => {
    const id = ++uid
    setTimeout(() => {
      setItems((arr) => [...arr.slice(-7), { id, text, color, offset: (Math.random() - 0.5) * 140 }])
      setTimeout(() => setItems((arr) => arr.filter((i) => i.id !== id)), 1700)
    }, delay)
  }

  // 普通活动记录
  useEffect(() => {
    if (!feedback || feedback.xp <= 0) return
    push(`+${feedback.xp} XP`, '#5eead4')
    if (feedback.coins > 0) push(`+${feedback.coins} 💰`, '#ffd54a', 160)
    Object.entries(feedback.attributeGains).forEach(([k, v], i) => {
      if (v && v > 0) push(`+${v} ${k}`, '#c084fc', 320 + i * 160)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback])

  // 局结算：XP / 金币 / 属性 / 新纪录
  useEffect(() => {
    if (!sessionFb) return
    push(`+${sessionFb.xp} XP`, '#5eead4')
    if (sessionFb.coins > 0) push(`+${sessionFb.coins} 💰`, '#ffd54a', 160)
    Object.entries(sessionFb.attributeGains).forEach(([k, v], i) => {
      if (v && v > 0) push(`+${v} ${k}`, '#c084fc', 320 + i * 160)
    })
    if (sessionFb.isNewRecord) push('🏆 新纪录！', '#ffd54a', 650)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionFb])

  if (items.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-1/3 z-[65] flex flex-col items-center">
      {items.map((i) => (
        <div
          key={i.id}
          className="animate-float-up absolute font-rpg text-2xl font-bold tabular-nums drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]"
          style={{ color: i.color, marginLeft: i.offset }}
        >
          {i.text}
        </div>
      ))}
    </div>
  )
}

/**
 * 每日签到：每日一次金币奖励（基础 100 + 连续签到加成）
 * 连续签到每 3 天 +50 金币（封顶 +300）；中断则重新计数。
 */

import { useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import { todayKey } from '../engine/xpCalculator'

export const DailyCheckin: React.FC = () => {
  const lastCheckinDate = useGameStore((s) => s.state.player.lastCheckinDate)
  const checkinStreak = useGameStore((s) => s.state.player.checkinStreak ?? 0)
  const dailyCheckin = useGameStore((s) => s.dailyCheckin)
  const [msg, setMsg] = useState<string | null>(null)

  const today = todayKey()
  const checkedInToday = lastCheckinDate === today
  // 今日签到可领金额（预览展示，与 store 逻辑一致）
  const willStreak = checkedInToday ? checkinStreak : lastCheckinDate === new Date(Date.now() - 86400000).toISOString().slice(0, 10) ? checkinStreak + 1 : 1
  const nextBonus = Math.min(300, Math.floor(willStreak / 3) * 50)
  const nextCoins = 100 + nextBonus

  const handleCheckin = () => {
    const ok = dailyCheckin()
    if (ok) {
      setMsg(`签到成功！+${nextCoins} 金币（连续 ${willStreak} 天）`)
      setTimeout(() => setMsg(null), 2500)
    }
  }

  return (
    <div className="rpg-panel relative overflow-hidden p-3">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-rpg-gold/5 via-transparent to-rpg-gold/5" />
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📅</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="pixel-text text-[10px] text-rpg-gold">每日签到</span>
              <span className="rounded border border-rpg-gold/50 bg-rpg-gold/10 px-1.5 text-[8px] font-bold text-rpg-gold">
                连续 {checkinStreak} 天
              </span>
            </div>
            <div className="mt-0.5 text-[10px] text-gray-400">
              {checkedInToday
                ? `今日已签到 · 明日可领 💰${nextCoins}（连续 ${willStreak} 天）`
                : `今日可领 💰${nextCoins} · 每 3 天 +50（封顶 +300）`}
            </div>
          </div>
        </div>
        <button
          onClick={handleCheckin}
          disabled={checkedInToday}
          className={`flex-shrink-0 rounded-lg border-2 px-4 py-1.5 text-xs font-bold transition-all ${
            checkedInToday
              ? 'border-rpg-xp bg-rpg-xp/10 text-rpg-xp'
              : 'border-rpg-gold bg-gradient-to-r from-rpg-gold/30 to-rpg-gold/10 text-rpg-gold hover:from-rpg-gold hover:text-rpg-bg active:scale-95'
          }`}
        >
          {checkedInToday ? '✓ 已签到' : '签到'}
        </button>
      </div>
      {msg && (
        <div className="absolute inset-x-0 -bottom-1 translate-y-full rounded-lg border-2 border-rpg-gold bg-rpg-panel px-4 py-1.5 text-center text-[10px] text-rpg-gold shadow-gold">
          {msg}
        </div>
      )}
    </div>
  )
}

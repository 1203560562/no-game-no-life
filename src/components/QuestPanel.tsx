/**
 * 周委托任务面板（首页）
 *
 * 每周一随 BOSS 刷新 3 个随机委托，进度从 sessions/bossState 实时派生
 * （零快照：换周自动清零，展示与领取校验同源）。
 * 达标后手动领取：金币直接入账 + XP 走 addActivity 完整链路。
 */

import { useMemo } from 'react'
import { useGameStore } from '../store/useGameStore'
import { questProgress } from '../engine/questEngine'
import { sfx } from '../lib/soundFx'
import { nextMondayMidnight } from '../engine/bossEngine'

/** 周内剩余时间文案 */
const weekCountdown = (): string => {
  const ms = nextMondayMidnight().getTime() - Date.now()
  if (ms <= 0) return '即将刷新'
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  return days > 0 ? `${days} 天 ${hours} 小时` : `${hours} 小时`
}

const KIND_ICON: Record<string, string> = {
  sessions: '⚔️',
  sessionsType: '🎯',
  bossDamage: '💀',
  xp: '✨',
  earlyBird: '🌅',
  focusMinutes: '⏳',
}

export const QuestPanel: React.FC = () => {
  const state = useGameStore((s) => s.state)
  const claimQuest = useGameStore((s) => s.claimQuest)

  const quests = state.weeklyQuests?.quests ?? []
  const progress = useMemo(
    () => quests.map((q) => questProgress(state, q)),
    [state, quests],
  )
  const claimedCount = quests.filter((q) => q.claimed).length

  if (quests.length === 0) return null

  const handleClaim = (id: string) => {
    const r = claimQuest(id)
    if (r) {
      sfx.coin()
      sfx.achievement()
    }
  }

  return (
    <div className="rpg-panel p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="pixel-text text-[10px] text-rpg-gold">📋 周委托</h2>
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <span>
            已领 {claimedCount}/{quests.length}
          </span>
          <span className="text-gray-600">·</span>
          <span>刷新倒计时 {weekCountdown()}</span>
        </div>
      </div>

      <div className="space-y-2">
        {quests.map((q, i) => {
          const cur = progress[i]
          const done = cur >= q.target
          const pct = Math.min(100, (cur / q.target) * 100)
          return (
            <div
              key={q.id}
              className={`rounded-xl border-2 p-3 transition-all ${
                q.claimed
                  ? 'border-rpg-border/50 bg-black/20 opacity-60'
                  : done
                    ? 'border-rpg-gold bg-rpg-gold/10 animate-pulse-glow'
                    : 'border-rpg-border bg-rpg-panelLight/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-base">{KIND_ICON[q.kind] ?? '📋'}</span>
                  <span
                    className={`truncate text-xs font-bold ${
                      q.claimed ? 'text-gray-500 line-through' : 'text-white'
                    }`}
                  >
                    {q.title}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 text-[10px]">
                  <span className="text-rpg-gold">+{q.coins} 💰</span>
                  <span className="text-rpg-xp">+{q.xp} XP</span>
                </div>
              </div>
              {/* 进度条 */}
              <div className="mt-2 flex items-center gap-2">
                <div className="relative h-2 flex-1 overflow-hidden rounded-full border border-rpg-border bg-black/40">
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ${
                      done ? 'bg-rpg-gold' : 'bg-rpg-xp/70'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-24 text-right text-[10px] tabular-nums text-gray-400">
                  {q.claimed ? '✅ 已领取' : `${cur.toLocaleString()} / ${q.target.toLocaleString()}`}
                </span>
                {!q.claimed && done && (
                  <button
                    onClick={() => handleClaim(q.id)}
                    className="rpg-btn-primary px-3 py-1 text-[10px]"
                  >
                    领取
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-2 text-center text-[9px] text-gray-600">
        每周一随 BOSS 刷新 · 进度实时统计，达标别忘领取
      </div>
    </div>
  )
}

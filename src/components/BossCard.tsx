import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/useGameStore'
import { BOSS_ROSTER, bossForStage } from '../config/bossConfig'
import { nextMondayMidnight } from '../engine/bossEngine'

/** 首页 BOSS 周挑战紧凑卡片：血条 + 本周伤害 + 倒计时，点击跳 /boss */
export const BossCard: React.FC = () => {
  const navigate = useNavigate()
  const bossState = useGameStore((s) => s.state.bossState)

  if (!bossState) return null
  const boss = BOSS_ROSTER.find((b) => b.id === bossState.bossId) ?? bossForStage(bossState.stage)
  const hpPct = Math.max(0, Math.min(100, (bossState.hp / bossState.maxHp) * 100))
  const killed = !!bossState.killedAt

  // 倒计时（小时粒度）
  const ms = nextMondayMidnight().getTime() - Date.now()
  const hours = Math.max(0, Math.ceil(ms / 3600000))

  return (
    <button
      onClick={() => navigate('/boss')}
      className="rpg-panel group flex w-full items-center gap-3 p-3 text-left transition-all hover:border-rpg-gold/60"
      title="查看 BOSS 周挑战"
    >
      <img
        src={boss.portrait}
        alt={boss.name}
        className={`h-14 w-14 shrink-0 rounded-lg border-2 object-cover ${
          killed ? 'border-rpg-border opacity-40 grayscale' : 'border-rpg-courage/50'
        }`}
        style={{ boxShadow: killed ? undefined : `0 0 12px ${boss.color}44` }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="pixel-text text-[9px] text-rpg-courage">第 {bossState.stage} 届</span>
          <span className="truncate text-xs font-bold text-white">{boss.name}</span>
          {killed && <span className="text-[9px] text-rpg-gold">⚔️ 已讨伐</span>}
        </div>
        {/* 紧凑血条 */}
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full border border-rpg-border bg-black/60">
          <div
            className="h-full transition-all duration-700"
            style={{
              width: `${hpPct}%`,
              background: `linear-gradient(90deg, ${boss.color}, ${boss.color}aa)`,
            }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[9px] text-gray-500">
          <span>
            HP {bossState.hp.toLocaleString()}/{bossState.maxHp.toLocaleString()}
          </span>
          <span>
            {killed ? `下一位 ${hours}h 后到来` : `本周伤害 ${bossState.totalDamage.toLocaleString()} · 剩 ${hours}h`}
          </span>
        </div>
      </div>
      <span className="shrink-0 text-[10px] text-gray-600 transition-colors group-hover:text-rpg-gold">⚔️</span>
    </button>
  )
}

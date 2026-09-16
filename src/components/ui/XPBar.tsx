import { levelProgress } from '../../engine/levelSystem'
import type { Player } from '../../types'

export const XPBar: React.FC<{ player: Player; compact?: boolean }> = ({ player, compact }) => {
  const { needed, pct } = levelProgress(player)
  return (
    <div className="w-full">
      {!compact && (
        <div className="mb-1 flex justify-between text-xs text-rpg-xp">
          <span className="pixel-text">XP</span>
          <span>
            {player.xp} / {needed}
          </span>
        </div>
      )}
      <div className="h-4 w-full overflow-hidden rounded-full border-2 border-rpg-border bg-rpg-bg">
        <div
          className="h-full rounded-full bg-gradient-to-r from-rpg-xp via-emerald-300 to-cyan-300 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {!compact && (
        <div className="mt-1 text-right text-[10px] text-gray-300">{pct}%</div>
      )}
    </div>
  )
}

/**
 * v1.0 技能面板 —— 技能点出口
 *
 * 升级获得的技能点 → 投入领域技能 → 该领域局效率永久 +3%/级。
 * 「下一局真的比上一局更强」的主动成长手段。
 */

import { useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import { SKILL_DEFS } from '../config/xpConfig'
import { computeEfficiency } from '../engine/sessionEngine'

export const SkillPanel: React.FC = () => {
  const player = useGameStore((s) => s.state.player)
  const upgradeSkill = useGameStore((s) => s.upgradeSkill)
  const [msg, setMsg] = useState<string | null>(null)

  const skills = player.skills ?? {}
  const sp = player.skillPoints

  const handleUpgrade = (skillId: string) => {
    const def = SKILL_DEFS.find((d) => d.id === skillId)!
    const level = skills[skillId] ?? 0
    if (level >= def.maxLevel) return
    if (sp < def.spCost) {
      setMsg('技能点不足 · 升级可获得技能点')
      setTimeout(() => setMsg(null), 2200)
      return
    }
    upgradeSkill(skillId)
    setMsg(`${def.name} Lv.${level + 1}！${def.desc} +${(def.bonusPerLevel * 100).toFixed(1)}%`)
    setTimeout(() => setMsg(null), 2200)
  }

  return (
    <div className="rpg-panel relative p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="pixel-text text-[10px] text-rpg-gold">领域技能</h2>
        <span className="text-xs text-gray-400">
          技能点 <b className={sp > 0 ? 'text-rpg-gold' : 'text-gray-500'}>✦ {sp}</b>
        </span>
      </div>

      <div className="space-y-1.5">
        {SKILL_DEFS.map((def) => {
          const level = skills[def.id] ?? 0
          const maxed = level >= def.maxLevel
          const eff = def.global ? null : computeEfficiency(player, def.type)
          const canUp = !maxed && sp >= def.spCost
          return (
            <div
              key={def.id}
              className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 ${
                def.global ? 'border-rpg-gold/50 bg-rpg-gold/5' : 'border-rpg-border bg-rpg-panelLight/40'
              }`}
            >
              <span className="text-lg">{def.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-bold text-white">{def.name}</span>
                  <span className="text-[9px] text-gray-500">{def.desc}</span>
                </div>
                {/* 等级 pips */}
                <div className="mt-0.5 flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {Array.from({ length: def.maxLevel }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 w-3 rounded-sm ${
                          i < level ? 'bg-rpg-gold' : 'bg-gray-700'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[9px] text-rpg-gold">
                    +{(level * def.bonusPerLevel * 100).toFixed(0)}%
                  </span>
                  <span className="text-[9px] text-gray-500">
                    {eff ? `${eff.xpPerMin.toFixed(1)}/min` : '全部领域生效'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleUpgrade(def.id)}
                disabled={!canUp}
                className={`rounded-lg border px-2.5 py-1 text-[10px] transition-all ${
                  maxed
                    ? 'border-gray-700 text-gray-600'
                    : canUp
                      ? 'border-rpg-gold bg-rpg-gold/15 text-rpg-gold hover:bg-rpg-gold hover:text-rpg-bg active:scale-95'
                      : 'border-gray-700 text-gray-500'
                }`}
                title={maxed ? '已满级' : `消耗 ${def.spCost} 技能点`}
              >
                {maxed ? 'MAX' : `✦${def.spCost} 升`}
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-2.5 text-center text-[10px] text-gray-500">
        技能点通过升级获得 · 领域技能每级 +1.5% 对应局效率 · 突破自我每级 +1% 全部领域
      </div>

      {msg && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-lg border border-rpg-gold bg-rpg-panel px-3 py-1 text-[10px] text-rpg-gold shadow-gold animate-slide-up">
          {msg}
        </div>
      )}
    </div>
  )
}

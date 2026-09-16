import { useMemo } from 'react'
import { useGameStore } from '../store/useGameStore'
import { generateAdvice, buildDailyStatus, type AdviceType } from '../engine/aiAdvisor'
import { APP_CONFIG } from '../config/appConfig'

const TYPE_META: Record<AdviceType, { label: string; icon: string; color: string }> = {
  encourage: { label: '鼓励', icon: '✨', color: 'text-rpg-xp' },
  observe: { label: '观察', icon: '👁️', color: 'text-amber-300' },
  suggest: { label: '建议', icon: '🧭', color: 'text-rpg-creativity' },
}

export const AiAdvisorPanel: React.FC = () => {
  const state = useGameStore((s) => s.state)
  const advices = useMemo(() => generateAdvice(state), [state])
  const status = useMemo(() => buildDailyStatus(state), [state])

  if (advices.length === 0) {
    return (
      <div className="rpg-panel border-rpg-xp p-5">
        <h2 className="mb-2 pixel-text text-[10px] text-rpg-xp">{APP_CONFIG.companionName}的话</h2>
        <p className="text-sm leading-relaxed text-gray-300">
          还没有足够的数据给出建议。先记录几次行动，我才能更懂你。
        </p>
      </div>
    )
  }

  return (
    <div className="rpg-panel border-rpg-xp p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="pixel-text text-[10px] text-rpg-xp">{APP_CONFIG.companionName}的话</h2>
        <span className="text-[9px] text-gray-500">每日最多 3 条</span>
      </div>

      {/* 昨日状态摘要 */}
      <div className="mb-3 grid grid-cols-4 gap-1 text-center text-[10px]">
        <div className="rpg-panel-light p-1.5">
          <div className="text-gray-400">昨日XP</div>
          <div className="font-bold text-rpg-xp">{status.yesterdayXp}</div>
        </div>
        <div className="rpg-panel-light p-1.5">
          <div className="text-gray-400">睡眠</div>
          <div className="font-bold text-rpg-vitality">
            {status.sleepHours ? `${status.sleepHours.toFixed(1)}h` : '—'}
          </div>
        </div>
        <div className="rpg-panel-light p-1.5">
          <div className="text-gray-400">运动</div>
          <div className="font-bold text-rpg-connection">
            {status.exerciseMinutes > 0 ? `${status.exerciseMinutes}m` : '—'}
          </div>
        </div>
        <div className="rpg-panel-light p-1.5">
          <div className="text-gray-400">工作</div>
          <div className="font-bold text-rpg-focus">
            {status.workHours > 0 ? `${status.workHours.toFixed(1)}h` : '—'}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {advices.map((a) => {
          const meta = TYPE_META[a.type]
          return (
            <div
              key={a.id}
              className="flex items-start gap-2 rounded-lg border border-rpg-border bg-rpg-panelLight/40 p-2"
            >
              <span className="text-base">{meta.icon}</span>
              <div className="flex-1">
                <span className={`text-[9px] font-bold ${meta.color}`}>{meta.label}</span>
                <p className="text-xs leading-relaxed text-gray-200">{a.content}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

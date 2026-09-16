import { useMemo, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { ActivityType } from '../types'

interface MiniAction {
  type: ActivityType
  label: string
  title: string
  durationMinutes?: number
  icon: string
}

const MINI_ACTIONS: MiniAction[] = [
  { type: 'work',     label: '打开项目',      title: '打开项目看了一眼', durationMinutes: 5, icon: '💻' },
  { type: 'study',    label: '看 5 页书',     title: '阅读 5 页',        durationMinutes: 10, icon: '📖' },
  { type: 'exercise', label: '出门走 10 分钟', title: '散步',             durationMinutes: 10, icon: '🚶' },
  { type: 'life',     label: '整理一个文件',   title: '整理一个文件',     durationMinutes: 5, icon: '📁' },
  { type: 'creative', label: '写一句想法',     title: '记录一个想法',     durationMinutes: 3, icon: '✏️' },
  { type: 'social',   label: '发一条消息',     title: '主动发一条消息',   durationMinutes: 2, icon: '💬' },
]

const DAY_MS = 86400000

export const MinimalActionPanel: React.FC = () => {
  const state = useGameStore((s) => s.state)
  const addActivity = useGameStore((s) => s.addActivity)
  const restMode = useGameStore((s) => s.state.restMode)
  const [done, setDone] = useState<string | null>(null)

  // 检测：近 3 天行动量低（<=2 条记录）且今天还没记录
  const isLowActivity = useMemo(() => {
    if (restMode) return false
    const cutoff = Date.now() - 3 * DAY_MS
    const recent = state.activities.filter((a) => new Date(a.createdAt).getTime() >= cutoff)
    const todayKey = new Date().toISOString().slice(0, 10)
    const todayHas = state.activities.some((a) => a.createdAt.slice(0, 10) === todayKey)
    return recent.length <= 2 && !todayHas
  }, [state.activities, restMode])

  if (!isLowActivity) return null

  const handlePick = (action: MiniAction) => {
    addActivity({
      type: action.type,
      title: action.title,
      durationMinutes: action.durationMinutes,
      intensity: 'low',
    })
    setDone(action.label)
    setTimeout(() => setDone(null), 2500)
  }

  return (
    <div className="rpg-panel border-rpg-creativity p-5 animate-slide-up">
      <h2 className="mb-1 pixel-text text-[10px] text-rpg-creativity">需要一个最小行动吗？</h2>
      <p className="mb-3 text-[11px] leading-relaxed text-gray-400">
        你不需要解决整个问题。选一个最小行动开始就好 —— 完成它本身就是行动。
      </p>

      {done ? (
        <div className="rounded-lg border-2 border-rpg-xp bg-rpg-xp/10 p-3 text-center text-sm text-rpg-xp animate-pop-in">
          ✅ {done}！+5 XP · 你已经开始了。
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MINI_ACTIONS.map((a) => (
            <button
              key={a.label}
              onClick={() => handlePick(a)}
              className="rpg-panel-light flex flex-col items-center gap-1 p-3 transition-all hover:border-rpg-creativity hover:bg-rpg-panelLight"
            >
              <span className="text-xl">{a.icon}</span>
              <span className="text-[11px] text-gray-200">{a.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 text-center text-[10px] text-gray-500">
        也可以什么都不做 —— 休息也属于你的人生。
      </div>
    </div>
  )
}

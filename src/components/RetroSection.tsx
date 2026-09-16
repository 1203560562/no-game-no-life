import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/useGameStore'
import { EChart } from './charts/EChart'
import { HeatmapCalendar } from './HeatmapCalendar'
import { requiredXpForLevel } from '../config/xpConfig'
import { ATTRIBUTE_KEYS, ATTRIBUTE_META, radarScaleMax } from '../config/xpConfig'
import { TIER_META } from '../engine/milestoneEngine'

/**
 * 冒险回顾（报告页顶部区块）：
 * 1. 年度热力图（GitHub 贡献图风格）
 * 2. 成长回顾卡（第 X 天 / 真实推导的升级曲线 / 属性雷达 / 累计战绩）
 * 3. 里程碑回顾墙（已领取完成的奖杯墙）
 */

/** 从活动时间轴推导升级时刻：与 applyXp 完全同口径（逐级扣减增量 XP，非累计门槛） */
const useLevelTimeline = () => {
  const activities = useGameStore((s) => s.state.activities)
  const player = useGameStore((s) => s.state.player)

  return useMemo(() => {
    const sorted = [...activities].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const points: Array<{ time: string; level: number }> = []
    let currentXp = 0
    let level = 1
    points.push({ time: player.createdAt, level: 1 })
    for (const a of sorted) {
      currentXp += a.xp
      // 与 applyXp 同口径：每级扣掉本级增量（requiredXpForLevel 是 level→level+1 的增量，
      // 不是累计门槛——旧实现按累计比较导致曲线与真实升级时间严重偏差）
      let needed = requiredXpForLevel(level)
      while (currentXp >= needed && level < 999) {
        currentXp -= needed
        level += 1
        points.push({ time: a.createdAt, level })
        needed = requiredXpForLevel(level)
      }
    }
    // 兜底：成就/里程碑等非活动 XP 不在 activities 里，实际等级可能更高；
    // 用最后一条活动的时间（而非 new Date()）落点，避免"画到今天"的长平线
    if (player.level > level) {
      const lastTime = sorted.length > 0 ? sorted[sorted.length - 1].createdAt : player.createdAt
      points.push({ time: lastTime, level: player.level })
    }
    return points
  }, [activities, player.createdAt, player.level])
}

const GrowthRadarOption = (attrs: Record<string, number>, level = 20) => {
  // 七轴统一刻度 = 动态上限（与今日冒险-属性雷达一致）：
  // 不超过等级软上限两倍，也不超过最高属性的 3 倍——最强属性至少占半径 1/3。
  const sharedMax = radarScaleMax(level, attrs)
  return {
    tooltip: { trigger: 'item' },
    radar: {
      indicator: ATTRIBUTE_KEYS.map((k) => ({
        name: `${ATTRIBUTE_META[k].icon} ${ATTRIBUTE_META[k].cn} ${attrs[k] ?? 0}`,
        max: sharedMax,
      })),
      radius: '72%',
      splitNumber: 4,
      splitArea: { areaStyle: { color: ['rgba(0,0,0,0)', 'rgba(255,255,255,0.03)'] } },
      axisName: { color: '#94a3b8', fontSize: 9 },
      splitLine: { lineStyle: { color: 'rgba(148,163,184,0.15)' } },
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: ATTRIBUTE_KEYS.map((k) => attrs[k]),
            areaStyle: { color: 'rgba(94,234,212,0.3)' },
            lineStyle: { color: '#5eead4' },
            itemStyle: { color: '#5eead4' },
          },
        ],
      },
    ],
  }
}

const LevelCurveOption = (points: Array<{ time: string; level: number }>) => ({
  tooltip: {
    trigger: 'axis',
    formatter: (p: { data: [number, number] }[]) => {
      const [t, lv] = p[0]?.data ?? [0, 0]
      const d = new Date(t)
      return `Lv.${lv} · ${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
    },
  },
  grid: { left: 36, right: 12, top: 16, bottom: 28 },
  xAxis: {
    type: 'time',
    axisLabel: { color: '#94a3b8', fontSize: 9, formatter: '{y}/{M}' },
    splitLine: { show: false },
  },
  yAxis: {
    type: 'value',
    minInterval: 1,
    axisLabel: { color: '#94a3b8', fontSize: 9, formatter: 'Lv.{value}' },
    splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
  },
  series: [
    {
      type: 'line',
      step: 'end',
      data: points.map((p) => [new Date(p.time).getTime(), p.level]),
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { color: '#ffd54a', width: 2 },
      itemStyle: { color: '#ffd54a' },
      areaStyle: { color: 'rgba(255,213,74,0.12)' },
    },
  ],
})

export const RetroSection: React.FC = () => {
  const navigate = useNavigate()
  const state = useGameStore((s) => s.state)
  const player = state.player
  const levelPoints = useLevelTimeline()

  const dayCount = useMemo(() => {
    const start = new Date(player.createdAt).getTime()
    if (Number.isNaN(start)) return 0
    return Math.max(1, Math.ceil((Date.now() - start) / 86400000))
  }, [player.createdAt])

  const weightDelta = useMemo(() => {
    const ws = [...state.weights].sort((a, b) => a.date.localeCompare(b.date))
    if (ws.length < 2) return null
    const delta = ws[ws.length - 1].weightKg - ws[0].weightKg
    return Math.round(delta * 10) / 10
  }, [state.weights])

  const completedMilestones = useMemo(
    () => state.milestones.filter((m) => m.finalClaimed),
    [state.milestones],
  )

  return (
    <div className="rpg-panel border-rpg-gold/60 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="pixel-text text-[10px] text-rpg-gold">🎮 冒险回顾</h2>
        <span className="text-[10px] text-gray-500">看见自己走过的路</span>
      </div>

      {/* ===== 1. 年度热力图 ===== */}
      <HeatmapCalendar />

      {/* ===== 2. 成长回顾卡 ===== */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rpg-panel-light p-2 text-center">
          <div className="text-[10px] text-gray-400">加入冒险</div>
          <div className="text-lg font-bold text-rpg-gold">第 {dayCount} 天</div>
        </div>
        <div className="rpg-panel-light p-2 text-center">
          <div className="text-[10px] text-gray-400">完成局数</div>
          <div className="text-lg font-bold text-rpg-xp">{player.totalSessions ?? 0}</div>
        </div>
        <div className="rpg-panel-light p-2 text-center">
          <div className="text-[10px] text-gray-400">成就</div>
          <div className="text-lg font-bold text-white">{state.achievements.length}</div>
        </div>
        <div className="rpg-panel-light p-2 text-center">
          <div className="text-[10px] text-gray-400">连续记录</div>
          <div className="text-lg font-bold text-rpg-courage">{state.recordStreak} 天</div>
        </div>
        <div className="rpg-panel-light p-2 text-center">
          <div className="text-[10px] text-gray-400">体重里程</div>
          <div className="text-lg font-bold text-gray-200">
            {weightDelta === null ? '—' : `${weightDelta > 0 ? '+' : ''}${weightDelta}kg`}
          </div>
        </div>
      </div>

      {/* 升级曲线 + 属性雷达 */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-[10px] text-gray-500">⭐ 升级之路（真实数据推导）</div>
          {levelPoints.length > 1 ? (
            <EChart option={LevelCurveOption(levelPoints)} height={180} />
          ) : (
            <div className="flex h-[180px] items-center justify-center text-xs text-gray-500">
              记录更多行动，等级曲线会在这里生长。
            </div>
          )}
        </div>
        <div>
          <div className="mb-1 text-[10px] text-gray-500">✨ 属性雷达</div>
          <EChart option={GrowthRadarOption(player.attributes, player.level)} height={180} />
        </div>
      </div>

      {/* ===== 3. 里程碑回顾墙 ===== */}
      <div className="mt-4 border-t border-rpg-border pt-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="pixel-text text-[10px] text-rpg-xp">🏆 里程碑回顾墙</h3>
          <button onClick={() => navigate('/milestones')} className="text-[10px] text-gray-500 hover:text-rpg-gold">
            前往里程碑 →
          </button>
        </div>
        {completedMilestones.length === 0 ? (
          <div className="py-4 text-center text-xs text-gray-500">
            还没有攻陷的目标——完成并领取一个里程碑，它的奖杯会挂在这里。
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {completedMilestones.map((m) => {
              const tMeta = TIER_META[m.tier ?? 'bronze']
              return (
                <div
                  key={m.id}
                  className={`rounded-lg border-2 bg-black/20 p-2 ${tMeta.border}`}
                  title={m.messageToSelf ? `「${m.messageToSelf}」` : undefined}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{tMeta.badge}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-white">{m.goal}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[9px]">
                    <span className={tMeta.text}>{tMeta.label}档</span>
                    <span className="text-gray-500">{m.doneAt ? m.doneAt.slice(0, 10) : '—'}</span>
                  </div>
                  {m.messageToSelf && (
                    <p className="mt-1 truncate border-l border-rpg-gold/30 pl-1.5 text-[9px] italic text-gray-400">
                      「{m.messageToSelf}」
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

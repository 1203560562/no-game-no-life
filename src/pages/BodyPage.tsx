import { useMemo, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import { EChart } from '../components/charts/EChart'
import { PageHeader } from '../components/PageHeader'
import { computeWeightStats } from '../engine/settlements'
import { WEIGHT_STREAK_REWARDS, WEIGHT_GOAL_NODE_PCTS, weightNodeReward } from '../config/xpConfig'
import { todayKey } from '../engine/xpCalculator'

export const BodyPage: React.FC = () => {
  const weights = useGameStore((s) => s.state.weights)
  const weightGoal = useGameStore((s) => s.state.weightGoal)
  const nodesClaimed = useGameStore((s) => s.state.weightGoalNodesClaimed)
  const addWeight = useGameStore((s) => s.addWeight)
  const setWeightGoal = useGameStore((s) => s.setWeightGoal)
  const clearWeightGoal = useGameStore((s) => s.clearWeightGoal)
  const [input, setInput] = useState('')
  // 补填历史记录（日期 + 体重）
  const todayStr = todayKey()
  const [showBackfill, setShowBackfill] = useState(false)
  const [backfillDate, setBackfillDate] = useState('')
  const [backfillWeight, setBackfillWeight] = useState('')
  const [backfillMsg, setBackfillMsg] = useState('')

  const backfill = () => {
    const v = parseFloat(backfillWeight)
    if (isNaN(v) || v <= 0) {
      setBackfillMsg('请输入有效体重')
      return
    }
    if (!backfillDate) {
      setBackfillMsg('请选择日期')
      return
    }
    addWeight(v, backfillDate)
    setBackfillMsg('')
    setBackfillWeight('')
    setBackfillDate('')
    setShowBackfill(false)
  }

  // 目标设置表单
  const [editingGoal, setEditingGoal] = useState(false)
  const sorted = useMemo(() => [...weights].sort((a, b) => a.date.localeCompare(b.date)), [weights])
  const latestKg = sorted[sorted.length - 1]?.weightKg
  const [startInput, setStartInput] = useState('')
  const [targetInput, setTargetInput] = useState('')
  const [rewardInput, setRewardInput] = useState('')

  const stats = useMemo(() => computeWeightStats(weights), [weights])

  const distinctDays = new Set(weights.map((w) => w.date)).size
  const nextReward = WEIGHT_STREAK_REWARDS.find((r) => distinctDays < r.days)

  const submit = () => {
    const v = parseFloat(input)
    if (isNaN(v) || v <= 0) return
    addWeight(v)
    setInput('')
  }

  // 目标进度（减重/增重双向）
  const goalProgress = useMemo(() => {
    if (!weightGoal || latestKg === undefined) return null
    const delta = weightGoal.targetKg - weightGoal.startKg
    if (delta === 0) return null
    return {
      pct: Math.max(0, Math.min(1, (latestKg - weightGoal.startKg) / delta)),
      totalKg: Math.abs(delta),
      direction: delta < 0 ? 'down' : 'up',
      // 方向修正后的「距目标剩余 kg」
      remainKg: Math.max(0, Math.abs(latestKg - weightGoal.targetKg)),
    }
  }, [weightGoal, latestKg])

  const openGoalForm = () => {
    setStartInput(String(latestKg ?? weightGoal?.startKg ?? ''))
    setTargetInput(String(weightGoal?.targetKg ?? ''))
    setRewardInput('')
    setEditingGoal(true)
  }

  const submitGoal = () => {
    const s = parseFloat(startInput)
    const t = parseFloat(targetInput)
    if (isNaN(s) || isNaN(t) || s <= 0 || t <= 0 || s === t) return
    setWeightGoal(s, t, rewardInput.trim() || undefined)
    setEditingGoal(false)
  }

  // weight chart: daily + 7d avg + 28d avg lines
  const weightOption = useMemo(() => {
    if (weights.length === 0) return null
    const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date))
    const dates = sorted.map((w) => w.date.slice(5))
    const daily = sorted.map((w) => w.weightKg)
    const avg7 = sorted.map((_, i) => {
      const slice = sorted.slice(Math.max(0, i - 6), i + 1)
      return Math.round((slice.reduce((s, w) => s + w.weightKg, 0) / slice.length) * 10) / 10
    })
    const avg28 = sorted.map((_, i) => {
      const slice = sorted.slice(Math.max(0, i - 27), i + 1)
      return Math.round((slice.reduce((s, w) => s + w.weightKg, 0) / slice.length) * 10) / 10
    })
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['每日', '7日平均', '28日平均'], textStyle: { color: '#cbd5e1', fontSize: 10 } },
      grid: { left: 40, right: 16, top: 30, bottom: 30 },
      xAxis: { type: 'category', data: dates, axisLabel: { color: '#94a3b8', fontSize: 9 } },
      yAxis: { type: 'value', scale: true, axisLabel: { color: '#94a3b8', fontSize: 9 } },
      series: [
        { name: '每日', type: 'line', data: daily, symbolSize: 5, lineStyle: { color: '#94a3b8', type: 'dashed' }, itemStyle: { color: '#94a3b8' } },
        { name: '7日平均', type: 'line', data: avg7, smooth: true, symbol: 'none', lineStyle: { color: '#5eead4', width: 2 } },
        { name: '28日平均', type: 'line', data: avg28, smooth: true, symbol: 'none', lineStyle: { color: '#fbbf24', width: 2 } },
      ],
    }
  }, [weights])

  const trendColor = stats.trendDir === 'down' ? '#34d399' : stats.trendDir === 'up' ? '#fb7185' : '#94a3b8'
  const trendLabel = stats.trendDir === 'down' ? '↓ 下降趋势' : stats.trendDir === 'up' ? '↑ 上升趋势' : '→ 平稳'

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="rpg-panel p-5">
        <PageHeader
          icon="⚖️"
          title="体重记录"
          subtitle="每日体重仅用于记录。短期变化受水分/盐分/糖原影响，请关注 7 日与 28 日趋势。奖励来自持续记录，而非快速掉秤。"
        />

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            type="number"
            step="0.1"
            placeholder="今日体重 (kg)"
            className="flex-1 rounded-lg border-2 border-rpg-border bg-rpg-bg p-2 text-sm focus:border-rpg-gold focus:outline-none"
          />
          <button onClick={submit} className="rpg-btn-primary px-4 text-sm">
            记录
          </button>
          <button
            onClick={() => {
              setShowBackfill((v) => !v)
              setBackfillMsg('')
            }}
            className="rpg-btn shrink-0 px-3 text-xs"
            title="补填历史某天的体重记录"
          >
            🗓️ 补填
          </button>
        </div>

        {showBackfill && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border-2 border-rpg-border bg-rpg-bg p-2 animate-slide-up">
            <input
              type="date"
              value={backfillDate}
              max={todayStr}
              onChange={(e) => setBackfillDate(e.target.value)}
              className="rounded-lg border-2 border-rpg-border bg-rpg-bg p-2 text-sm focus:border-rpg-gold focus:outline-none"
            />
            <input
              value={backfillWeight}
              onChange={(e) => setBackfillWeight(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && backfill()}
              type="number"
              step="0.1"
              placeholder="该日体重 (kg)"
              className="w-36 rounded-lg border-2 border-rpg-border bg-rpg-bg p-2 text-sm focus:border-rpg-gold focus:outline-none"
            />
            <button onClick={backfill} className="rpg-btn-primary px-4 text-sm">
              补填记录
            </button>
            <button onClick={() => setShowBackfill(false)} className="rpg-btn px-3 py-2 text-sm">
              取消
            </button>
            {backfillMsg && <span className="text-xs text-rose-400">{backfillMsg}</span>}
            <span className="w-full text-[10px] text-gray-500">
              同一天已有记录会被覆盖；补填会按日期插入趋势图，累计记录天数按不同日期累计。
            </span>
          </div>
        )}

        {/* stats */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rpg-panel-light p-3 text-center">
            <div className="text-[10px] text-gray-400">今日</div>
            <div className="text-lg font-bold text-white">{stats.today ?? '—'}</div>
          </div>
          <div className="rpg-panel-light p-3 text-center">
            <div className="text-[10px] text-gray-400">7日平均</div>
            <div className="text-lg font-bold text-rpg-xp">{stats.avg7 ? stats.avg7.toFixed(1) : '—'}</div>
          </div>
          <div className="rpg-panel-light p-3 text-center">
            <div className="text-[10px] text-gray-400">28日平均</div>
            <div className="text-lg font-bold text-rpg-gold">{stats.avg28 ? stats.avg28.toFixed(1) : '—'}</div>
          </div>
          <div className="rpg-panel-light p-3 text-center">
            <div className="text-[10px] text-gray-400">趋势</div>
            <div className="text-sm font-bold" style={{ color: trendColor }}>
              {stats.trend !== undefined ? `${stats.trend > 0 ? '+' : ''}${stats.trend}kg` : '—'}
            </div>
            <div className="text-[9px]" style={{ color: trendColor }}>{trendLabel}</div>
          </div>
        </div>

        {/* consistency progress */}
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[10px] text-gray-400">
            <span>累计记录 {distinctDays} 天</span>
            {nextReward ? <span>下个奖励：{nextReward.days}天 +{nextReward.xp}XP</span> : <span>已达成全部记录奖励 🎉</span>}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-rpg-bg">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rpg-xp to-cyan-300 transition-all"
              style={{ width: `${Math.min(100, (distinctDays / 30) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* 体重目标（联动里程碑 + 百分比节点奖励） */}
      <div className="rpg-panel p-5">
        <div className="flex items-center justify-between">
          <PageHeader
            icon="🎯"
            title="体重目标"
            subtitle="设置初始与目标体重，记录体重自动推进里程碑，跨过节点即得 XP 与金币。"
          />
          {!editingGoal && (
            <button onClick={openGoalForm} className="rpg-btn-primary shrink-0 px-3 py-1.5 text-xs">
              {weightGoal ? '修改' : '设置目标'}
            </button>
          )}
        </div>

        {editingGoal ? (
          <div className="mt-4 space-y-3 animate-slide-up">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-gray-300">初始体重 (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={startInput}
                  onChange={(e) => setStartInput(e.target.value)}
                  placeholder="如 75"
                  className="w-full rounded-lg border-2 border-rpg-border bg-rpg-bg p-2 text-sm focus:border-rpg-gold focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-300">目标体重 (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  placeholder={startInput && parseFloat(startInput) > 60 ? '如 65' : '高于初始为增重'}
                  className="w-full rounded-lg border-2 border-rpg-border bg-rpg-bg p-2 text-sm focus:border-rpg-gold focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-300">达成后奖励自己什么？（可选，同步写入里程碑）</label>
              <input
                value={rewardInput}
                onChange={(e) => setRewardInput(e.target.value)}
                placeholder="例如：一顿好吃的 / 一件新衣服"
                className="w-full rounded-lg border-2 border-rpg-border bg-rpg-bg p-2 text-sm focus:border-rpg-gold focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={submitGoal} className="rpg-btn-primary flex-1 px-4 py-2 text-sm">
                保存目标
              </button>
              {weightGoal && (
                <button
                  onClick={() => {
                    if (confirm('删除体重目标（连带删除对应里程碑与节点进度）？')) {
                      clearWeightGoal()
                      setEditingGoal(false)
                    }
                  }}
                  className="rpg-btn px-4 py-2 text-sm"
                >
                  删除
                </button>
              )}
              <button onClick={() => setEditingGoal(false)} className="rpg-btn px-4 py-2 text-sm">
                取消
              </button>
            </div>
            <div className="text-[10px] leading-relaxed text-gray-500">
              目标低于初始 = 减重，高于初始 = 增重，双向都支持。修改目标会重置节点奖励进度。
            </div>
          </div>
        ) : weightGoal && goalProgress ? (
          <div className="mt-4">
            <div className="mb-2 grid grid-cols-4 gap-2 text-center">
              <div className="rpg-panel-light p-2">
                <div className="text-[10px] text-gray-400">初始</div>
                <div className="text-sm font-bold text-gray-300">{weightGoal.startKg}kg</div>
              </div>
              <div className="rpg-panel-light p-2">
                <div className="text-[10px] text-gray-400">当前</div>
                <div className="text-sm font-bold text-white">{latestKg}kg</div>
              </div>
              <div className="rpg-panel-light p-2">
                <div className="text-[10px] text-gray-400">目标</div>
                <div className="text-sm font-bold text-rpg-gold">{weightGoal.targetKg}kg</div>
              </div>
              <div className="rpg-panel-light p-2">
                <div className="text-[10px] text-gray-400">还差</div>
                <div className="text-sm font-bold text-rpg-xp">
                  {goalProgress.pct >= 1 ? '🎉' : `${goalProgress.remainKg.toFixed(1)}kg`}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-[10px] text-gray-400">
                <span>
                  {goalProgress.direction === 'down' ? '减重' : '增重'}目标 · 总量 {goalProgress.totalKg.toFixed(1)}kg
                </span>
                <span className="text-rpg-gold">{Math.round(goalProgress.pct * 100)}%</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-rpg-bg">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rpg-xp to-emerald-300 transition-all"
                  style={{ width: `${goalProgress.pct * 100}%` }}
                />
              </div>
            </div>

            {/* 节点奖励表 */}
            <div className="mt-4">
              <div className="mb-1 text-[10px] text-gray-400">节点奖励（跨过即发放，数值随对应 kg 量放大）</div>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {WEIGHT_GOAL_NODE_PCTS.map((pct) => {
                  const r = weightNodeReward(pct, goalProgress.totalKg)
                  const key = Math.round(pct * 100)
                  const claimed = (nodesClaimed ?? []).includes(key)
                  const reached = goalProgress.pct >= pct
                  return (
                    <div
                      key={pct}
                      className={`rounded-lg border px-2 py-1.5 text-center ${
                        claimed
                          ? 'border-rpg-xp/60 bg-rpg-xp/10'
                          : reached
                            ? 'border-rpg-gold/50 bg-rpg-gold/5'
                            : 'border-rpg-border bg-rpg-bg'
                      }`}
                      title={`对应变化量 ${(pct * goalProgress.totalKg).toFixed(1)}kg`}
                    >
                      <div className={`text-[11px] font-bold ${claimed ? 'text-rpg-xp' : 'text-gray-300'}`}>
                        {Math.round(pct * 100)}%{claimed ? ' ✓' : ''}
                      </div>
                      <div className="text-[9px] text-gray-500">
                        {r.xp}XP + {r.coins}币
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 text-xs text-gray-400">
            还没有体重目标。点右上「设置目标」，让每次记录都通向一个看得见的终点。
          </div>
        )}
      </div>

      {weightOption ? (
        <div className="rpg-panel p-5">
          <h2 className="mb-3 pixel-text text-[10px] text-rpg-gold">体重趋势</h2>
          <EChart option={weightOption} height={280} />
        </div>
      ) : (
        <div className="rpg-panel p-8 text-center text-sm text-gray-400">
          记录体重后这里会显示每日 / 7日 / 28日趋势线。
        </div>
      )}
    </div>
  )
}

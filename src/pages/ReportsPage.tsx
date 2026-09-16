import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/useGameStore'
import { EChart } from '../components/charts/EChart'
import { AiSummarySection } from '../components/AiSummarySection'
import { PageHeader } from '../components/PageHeader'
import { RetroSection } from '../components/RetroSection'
import { ShareCard } from '../components/ShareCard'
import { buildDailySettlement, buildWeeklyReport, computeHappinessSources, buildMonthlySummary } from '../engine/settlements'
import { efficiencyStats } from '../engine/sessionEngine'
import { DOMAIN_META } from '../config/xpConfig'
import type { ActivityType, GameSession } from '../types'

export const ReportsPage: React.FC = () => {
  const navigate = useNavigate()
  const state = useGameStore((s) => s.state)
  const memoryCount = (state.memories ?? []).filter((m) => m.status === 'active').length

  const daily = useMemo(() => buildDailySettlement(state), [state])
  const weekly = useMemo(() => buildWeeklyReport(state), [state])
  const happiness = useMemo(() => computeHappinessSources(state), [state])
  const monthly = useMemo(() => buildMonthlySummary(state), [state])

  // XP curve over last 30 days (cumulative)
  const xpCurveOption = useMemo(() => {
    const days = 30
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const labels: string[] = []
    const dailyXp: number[] = []
    const cumulative: number[] = []
    let acc = 0
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      labels.push(`${d.getMonth() + 1}/${d.getDate()}`)
      const xp = state.activities
        .filter((a) => a.createdAt.slice(0, 10) === key)
        .reduce((s, a) => s + a.xp, 0)
      dailyXp.push(xp)
      acc += xp
      cumulative.push(acc)
    }
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['每日 XP', '累计 XP'], textStyle: { color: '#cbd5e1', fontSize: 10 } },
      grid: { left: 40, right: 40, top: 30, bottom: 30 },
      xAxis: { type: 'category', data: labels, axisLabel: { color: '#94a3b8', fontSize: 8 } },
      yAxis: [
        { type: 'value', name: '每日', axisLabel: { color: '#94a3b8', fontSize: 9 } },
        { type: 'value', name: '累计', axisLabel: { color: '#94a3b8', fontSize: 9 } },
      ],
      series: [
        {
          name: '每日 XP',
          type: 'bar',
          data: dailyXp,
          itemStyle: { color: 'rgba(94,234,212,0.6)' },
        },
        {
          name: '累计 XP',
          type: 'line',
          yAxisIndex: 1,
          data: cumulative,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#ffd54a', width: 2 },
          areaStyle: { color: 'rgba(255,213,74,0.15)' },
        },
      ],
    }
  }, [state.activities])

  // weekly time allocation pie
  const timePieOption = useMemo(() => {
    const data = (Object.entries(weekly.timeInvestment) as [ActivityType, number][])
      .filter(([, m]) => m > 0)
      .map(([t, m]) => ({
        name: `${DOMAIN_META[t].icon} ${DOMAIN_META[t].label}`,
        value: Math.round(m / 6) / 10, // hours
        itemStyle: { color: DOMAIN_META[t].color },
      }))
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c}h ({d}%)' },
      legend: { bottom: 0, textStyle: { color: '#cbd5e1', fontSize: 9 } },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          label: { color: '#e2e8f0', fontSize: 10 },
          data,
        },
      ],
    }
  }, [weekly.timeInvestment])

  // happiness sources bar
  const happinessOption = useMemo(() => {
    if (happiness.length === 0) return null
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 80, right: 16, top: 16, bottom: 24 },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 9, formatter: '{value}m' } },
      yAxis: {
        type: 'category',
        data: happiness.map((h) => `${h.icon} ${h.name}`),
        axisLabel: { color: '#cbd5e1', fontSize: 10 },
      },
      series: [
        {
          type: 'bar',
          data: happiness.map((h) => h.minutes),
          itemStyle: {
            color: '#f472b6',
            borderRadius: [0, 4, 4, 0],
          },
        },
      ],
    }
  }, [happiness])

  // ===== 我的生产力成长（v1.0 局系统：效率成长曲线） =====
  const sessions = state.sessions ?? []
  const effStats = useMemo(() => efficiencyStats(sessions), [sessions])
  const totalSessionXp = useMemo(
    () => sessions.reduce((s, x) => s + x.xpGained, 0),
    [sessions],
  )

  /** 效率成长率：后半段平均 ÷ 前半段平均 - 1（局数 < 2 时无意义） */
  const effGrowth = useMemo(() => {
    if (sessions.length < 2) return null
    const sorted = [...sessions].sort((a, b) => a.startTime.localeCompare(b.startTime))
    const avg = (arr: GameSession[]) =>
      arr.reduce((s, x) => s + x.efficiency, 0) / arr.length
    const half = Math.floor(sorted.length / 2)
    const early = avg(sorted.slice(0, half))
    const recent = avg(sorted.slice(half))
    if (early <= 0) return null
    return (recent / early - 1) * 100
  }, [sessions])

  /** 效率成长曲线：时间轴散点（按活动类型着色）+ 趋势线 + 平均参考线 */
  const productivityOption = useMemo(() => {
    if (sessions.length === 0) return null
    const sorted = [...sessions].sort((a, b) => a.startTime.localeCompare(b.startTime))
    interface EffPoint {
      value: [number, number]
      name: string
      type: ActivityType
      minutes: number
      itemStyle: { color: string }
    }
    const pts: EffPoint[] = sorted.map((s) => ({
      value: [new Date(s.startTime).getTime(), +s.efficiency.toFixed(3)],
      name: s.title,
      type: s.type,
      minutes: s.actualMinutes,
      itemStyle: { color: DOMAIN_META[s.type].color },
    }))
    interface TooltipPoint {
      data: EffPoint
    }
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: TooltipPoint) => {
          const d = p.data
          const m = DOMAIN_META[d.type]
          const dt = new Date(d.value[0])
          const hh = String(dt.getHours()).padStart(2, '0')
          const mm = String(dt.getMinutes()).padStart(2, '0')
          return `<b>${d.name || m.label}</b><br/>${m.icon} ${m.label} · ${dt.getMonth() + 1}/${dt.getDate()} ${hh}:${mm}<br/>效率 ×${d.value[1].toFixed(2)} · ${d.minutes} 分钟`
        },
      },
      grid: { left: 44, right: 16, top: 24, bottom: 40 },
      xAxis: {
        type: 'time',
        axisLabel: { color: '#94a3b8', fontSize: 9, formatter: '{M}/{d}' },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: { color: '#94a3b8', fontSize: 9, formatter: '×{value}' },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
      },
      series: [
        {
          name: '效率趋势',
          type: 'line',
          data: pts.map((p) => p.value),
          smooth: 0.3,
          symbol: 'none',
          lineStyle: { color: '#ffd54a', width: 2, opacity: 0.85 },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [{ yAxis: +effStats.average.toFixed(3) }],
            lineStyle: { color: 'rgba(94,234,212,0.7)', type: 'dashed' },
            label: { color: '#5eead4', fontSize: 9, formatter: '平均 ×{c}' },
          },
        },
        {
          name: '每局效率',
          type: 'scatter',
          data: pts,
          symbolSize: 7,
        },
      ],
    }
  }, [sessions, effStats.average])

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ===== 冒险回顾（热力图 / 成长卡 / 里程碑回顾墙） ===== */}
      <RetroSection />

      {/* ===== 战绩分享卡 ===== */}
      <ShareCard />

      {/* ===== Daily settlement ===== */}
      <div className="rpg-panel p-5">
        <div className="mb-3">
          <PageHeader
            icon="📊"
            title="今日冒险结算"
            right={<span className="pixel-text text-[10px] text-rpg-xp">DAY {daily.day}</span>}
          />
        </div>

        <div className="mb-3 text-center">
          <div className="text-[10px] text-gray-400">今日 XP</div>
          <div className="pixel-text text-2xl text-rpg-xp">+{daily.totalXp}</div>
        </div>

        {daily.totalXp > 0 && (
          <div className="mb-3 grid grid-cols-2 gap-1 sm:grid-cols-3">
            {(Object.entries(daily.domainXp) as [ActivityType, number][])
              .filter(([, v]) => v > 0)
              .map(([t, v]) => {
                const m = DOMAIN_META[t]
                return (
                  <div key={t} className="flex items-center gap-1 text-xs">
                    <span>{m.icon}</span>
                    <span className="text-gray-300">{m.label}</span>
                    <span className="ml-auto text-rpg-xp">+{v}</span>
                  </div>
                )
              })}
          </div>
        )}

        {Object.keys(daily.attributeGains).length > 0 && (
          <div className="mb-3 border-t border-rpg-border pt-2">
            <div className="mb-1 text-[10px] text-gray-400">属性变化</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(daily.attributeGains).map(([k, v]) => (
                <span key={k} className="rounded bg-rpg-xp/20 px-2 py-0.5 text-[10px] text-rpg-xp">
                  {k} +{v}
                </span>
              ))}
            </div>
          </div>
        )}

        {daily.highlights.length > 0 && (
          <div className="mb-3 border-t border-rpg-border pt-2">
            <div className="mb-1 text-[10px] text-gray-400">今日成就</div>
            <div className="space-y-1">
              {daily.highlights.map((h, i) => (
                <div key={i} className="text-xs text-rpg-gold">{h}</div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-rpg-border pt-3">
          <div className="mb-1 text-[10px] text-gray-400">今日评价</div>
          <p className="text-sm leading-relaxed text-gray-200">{daily.evaluation}</p>
        </div>
      </div>

      {/* ===== Weekly report ===== */}
      <div className="rpg-panel p-5">
        <h2 className="mb-3 pixel-text text-[10px] text-rpg-gold">📅 近 7 天报告</h2>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rpg-panel-light p-2">
            <div className="text-[10px] text-gray-400">近 7 天 XP</div>
            <div className="text-lg font-bold text-rpg-xp">{weekly.weekXp}</div>
          </div>
          <div className="rpg-panel-light p-2">
            <div className="text-[10px] text-gray-400">前 7 天 XP</div>
            <div className="text-lg font-bold text-gray-300">{weekly.lastWeekXp}</div>
          </div>
          <div className="rpg-panel-light p-2">
            <div className="text-[10px] text-gray-400">变化</div>
            <div className={`text-lg font-bold ${weekly.xpChangePct >= 0 ? 'text-rpg-xp' : 'text-rpg-courage'}`}>
              {weekly.xpChangePct >= 0 ? '+' : ''}{weekly.xpChangePct}%
            </div>
          </div>
        </div>

        {Object.keys(weekly.attributeGains).length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[10px] text-gray-400">近 7 天属性</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(weekly.attributeGains).map(([k, v]) => (
                <span key={k} className="rounded bg-rpg-panelLight px-2 py-0.5 text-[10px] text-rpg-xp">
                  {k} ↑ {v}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 border-t border-rpg-border pt-3">
          <div className="mb-1 text-[10px] text-gray-400">分析</div>
          <p className="text-sm leading-relaxed text-gray-200">{weekly.evaluation}</p>
        </div>
      </div>

      {/* ===== 30-day growth summary ===== */}
      <div className="rpg-panel border-rpg-gold p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="pixel-text text-[10px] text-rpg-gold">🌱 30 天成长总结</h2>
          <span className="pixel-text text-[10px] text-rpg-xp">30 DAYS</span>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rpg-panel-light p-2 text-center">
            <div className="text-[10px] text-gray-400">总 XP</div>
            <div className="text-lg font-bold text-rpg-xp">+{monthly.totalXp}</div>
          </div>
          <div className="rpg-panel-light p-2 text-center">
            <div className="text-[10px] text-gray-400">等级</div>
            <div className="text-lg font-bold text-rpg-gold">
              {monthly.levelFrom} → {monthly.levelTo}
            </div>
          </div>
          <div className="rpg-panel-light p-2 text-center">
            <div className="text-[10px] text-gray-400">运动</div>
            <div className="text-lg font-bold text-rpg-connection">{monthly.exerciseHours}h</div>
          </div>
          <div className="rpg-panel-light p-2 text-center">
            <div className="text-[10px] text-gray-400">学习</div>
            <div className="text-lg font-bold text-rpg-wisdom">{monthly.studyHours}h</div>
          </div>
          <div className="rpg-panel-light p-2 text-center">
            <div className="text-[10px] text-gray-400">创作</div>
            <div className="text-lg font-bold text-rpg-creativity">{monthly.creativeCount} 次</div>
          </div>
          <div className="rpg-panel-light p-2 text-center">
            <div className="text-[10px] text-gray-400">重要事项</div>
            <div className="text-lg font-bold text-rpg-focus">{monthly.workImportantCount} 个</div>
          </div>
          <div className="rpg-panel-light p-2 text-center">
            <div className="text-[10px] text-gray-400">心理反思</div>
            <div className="text-lg font-bold text-rpg-vitality">{monthly.reflectionCount} 次</div>
          </div>
          <div className="rpg-panel-light p-2 text-center">
            <div className="text-[10px] text-gray-400">体重趋势</div>
            <div className="text-lg font-bold text-gray-300">
              {monthly.weightTrend !== undefined ? `${monthly.weightTrend > 0 ? '+' : ''}${monthly.weightTrend}kg` : '—'}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-rpg-gold/30 bg-rpg-gold/5 p-3">
          <p className="text-sm leading-relaxed text-gray-100">{monthly.evaluation}</p>
        </div>
      </div>

      {/* ===== 我的生产力成长（v1.0 局系统） ===== */}
      <div className="rpg-panel border-rpg-gold p-5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="pixel-text text-[10px] text-rpg-gold">⚡ 我的生产力成长</h2>
          <span className="pixel-text text-[10px] text-rpg-xp">{effStats.count} 局</span>
        </div>
        <p className="mb-3 text-[11px] text-gray-400">
          等级、属性、技能都在真实提高你的每一局——下一局比上一局更强。
        </p>
        {productivityOption ? (
          <>
            <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              <div className="rpg-panel-light p-2 text-center">
                <div className="text-[10px] text-gray-400">累计投入</div>
                <div className="text-lg font-bold text-gray-200">
                  {effStats.totalMinutes < 60
                    ? `${Math.round(effStats.totalMinutes)}m`
                    : `${(effStats.totalMinutes / 60).toFixed(1)}h`}
                </div>
              </div>
              <div className="rpg-panel-light p-2 text-center">
                <div className="text-[10px] text-gray-400">累计产出</div>
                <div className="text-lg font-bold text-rpg-xp">+{totalSessionXp.toLocaleString()}</div>
              </div>
              <div className="rpg-panel-light p-2 text-center">
                <div className="text-[10px] text-gray-400">局数</div>
                <div className="text-lg font-bold text-rpg-gold">{effStats.count}</div>
              </div>
              <div className="rpg-panel-light p-2 text-center">
                <div className="text-[10px] text-gray-400">平均效率</div>
                <div className="text-lg font-bold text-gray-200">×{effStats.average.toFixed(2)}</div>
              </div>
              <div className="rpg-panel-light p-2 text-center">
                <div className="text-[10px] text-gray-400">最高效率</div>
                <div className="text-lg font-bold text-rpg-gold">×{effStats.best.toFixed(2)}</div>
              </div>
              <div className="rpg-panel-light p-2 text-center">
                <div className="text-[10px] text-gray-400">效率成长率</div>
                <div
                  className={`text-lg font-bold ${
                    (effGrowth ?? 0) >= 0 ? 'text-rpg-xp' : 'text-rpg-courage'
                  }`}
                >
                  {effGrowth === null
                    ? '—'
                    : `${effGrowth >= 0 ? '+' : ''}${effGrowth.toFixed(0)}%`}
                </div>
              </div>
            </div>
            <EChart option={productivityOption} height={240} />
          </>
        ) : (
          <div className="py-8 text-center text-sm text-gray-400">
            完成第一局后，这里会长出你的效率成长曲线。
          </div>
        )}
      </div>

      {/* ===== XP curve ===== */}
      <div className="rpg-panel p-5">
        <h2 className="mb-3 pixel-text text-[10px] text-rpg-gold">📈 经验曲线（近30天）</h2>
        <EChart option={xpCurveOption} height={260} />
      </div>

      {/* ===== Time allocation ===== */}
      <div className="rpg-panel p-5">
        <h2 className="mb-3 pixel-text text-[10px] text-rpg-gold">🧭 近 7 天时间分配</h2>
        {weekly.totalMinutes > 0 ? (
          <EChart option={timePieOption} height={280} />
        ) : (
          <div className="py-8 text-center text-sm text-gray-400">近 7 天还没有记录带时长的行动。</div>
        )}
      </div>

      {/* ===== Happiness sources ===== */}
      <div className="rpg-panel p-5">
        <h2 className="mb-3 pixel-text text-[10px] text-rpg-gold">😄 快乐来源（近30天）</h2>
        <p className="mb-3 text-[11px] text-gray-400">什么事情真的能让你恢复精神？</p>
        {happinessOption ? (
          <EChart option={happinessOption} height={Math.max(160, happiness.length * 36)} />
        ) : (
          <div className="py-8 text-center text-sm text-gray-400">
            记录游戏 / 社交 / 运动 / 创作后，这里会显示你的快乐来源分布。
          </div>
        )}
      </div>

      {/* ===== 记忆入口（页面最底部） ===== */}
      <button
        onClick={() => navigate('/memory')}
        className="rpg-panel flex w-full items-center justify-between p-4 text-left transition-colors hover:border-rpg-gold/50"
      >
        <div className="min-w-0">
          <div className="pixel-text text-sm text-rpg-gold">
            <span className="mr-1.5">🧠</span>记忆
          </div>
          <p className="mt-1 text-[11px] text-gray-400">
            同行者记住了 {memoryCount} 条关于你的事 · 查看 / 管理
          </p>
        </div>
        <span className="shrink-0 text-sm text-gray-400">→</span>
      </button>

      {/* ===== AI 深度总结（页面最底部） ===== */}
      <AiSummarySection />
    </div>
  )
}

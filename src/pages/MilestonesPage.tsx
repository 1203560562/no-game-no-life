import { useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import { PageHeader } from '../components/PageHeader'
import {
  MILESTONE_STAGES,
  METRIC_META,
  TIER_META,
  stageReward,
  tierForMetric,
  metricCurrentValue,
} from '../engine/milestoneEngine'
import type { MilestoneMetricKind, MilestoneReward, MilestoneTier } from '../types'

/** 可选的自动指标（weight 由身体页目标驱动，此处不列） */
const METRIC_CHOICES: Array<{ kind: MilestoneMetricKind; label: string; icon: string; hint: string; defaultTarget: number; targetStep: number; unit: string }> = [
  { kind: 'level', label: '等级', icon: '⭐', hint: '升级自动推进', defaultTarget: 30, targetStep: 5, unit: '级' },
  { kind: 'totalXp', label: '累计经验', icon: '✨', hint: '每一局都在积累', defaultTarget: 10000, targetStep: 1000, unit: 'XP' },
  { kind: 'sessions', label: '完成局数', icon: '⚡', hint: '专注一局 +1', defaultTarget: 50, targetStep: 5, unit: '局' },
  { kind: 'achievements', label: '成就数', icon: '🏆', hint: '解锁成就 +1', defaultTarget: 20, targetStep: 5, unit: '个' },
  { kind: 'streakDays', label: '连续记录', icon: '🔥', hint: '每天记录不断火', defaultTarget: 30, targetStep: 7, unit: '天' },
]

/** 领取完成奖励后的撒花庆祝（纯 CSS） */
const Confetti: React.FC = () => {
  const pieces = Array.from({ length: 28 }, (_, i) => i)
  const colors = ['#fbbf24', '#5eead4', '#fb7185', '#c084fc', '#facc15', '#34d399']
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((i) => {
        const left = (i * 37) % 100
        const delay = (i % 7) * 0.12
        const dur = 1.2 + (i % 5) * 0.25
        const size = 5 + (i % 4) * 2
        return (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${left}%`,
              top: '-10px',
              width: size,
              height: size,
              background: colors[i % colors.length],
              animationDelay: `${delay}s`,
              animationDuration: `${dur}s`,
            }}
          />
        )
      })}
    </div>
  )
}

export const MilestonesPage: React.FC = () => {
  const milestones = useGameStore((s) => s.state.milestones)
  const state = useGameStore((s) => s.state)
  const addMilestone = useGameStore((s) => s.addMilestone)
  const extendMilestoneTarget = useGameStore((s) => s.extendMilestoneTarget)
  const deleteMilestone = useGameStore((s) => s.deleteMilestone)
  const claimMilestone = useGameStore((s) => s.claimMilestone)
  const coins = useGameStore((s) => s.state.player.coins)

  const [showForm, setShowForm] = useState(false)
  /** 'auto-<kind>' | 'time' */
  const [mode, setMode] = useState<string>('auto-level')
  const [goal, setGoal] = useState('')
  const [reward, setReward] = useState('')
  const [target, setTarget] = useState(30)
  /** time 型：预计耗时（小时） */
  const [hours, setHours] = useState(50)
  /** time 型：单次投入限制（分钟；空 = 不限制） */
  const [minPer, setMinPer] = useState<number | ''>('')
  const [maxPer, setMaxPer] = useState<number | ''>('')
  /** time 型：是否允许后续调整目标时长 */
  const [durationLocked, setDurationLocked] = useState(false)
  /** 给自己的话（完成仪式/回顾墙展示） */
  const [messageToSelf, setMessageToSelf] = useState('')
  /** 刚领取完成的里程碑 id（触发撒花） */
  const [claimedId, setClaimedId] = useState<string | null>(null)
  /** 点击放大「我就要爬这座山」漫画 */
  const [showMountain, setShowMountain] = useState(false)
  /** 展开调整时长的里程碑 id */
  const [extendingId, setExtendingId] = useState<string | null>(null)
  /** 调整时长输入（小时） */
  const [extendHours, setExtendHours] = useState<number>(0)
  /** 删除确认弹窗的目标（应用内弹窗，不依赖原生 confirm——预览环境返回值不可靠） */
  const [deleteTarget, setDeleteTarget] = useState<MilestoneReward | null>(null)

  const metricChoice = METRIC_CHOICES.find((c) => `auto-${c.kind}` === mode)

  const submit = () => {
    if (!goal.trim() || !reward.trim()) return
    // time 型单次限制（有值才写入）
    const limits =
      mode === 'time' && ((minPer !== '' && minPer > 0) || (maxPer !== '' && maxPer > 0))
        ? {
            ...(minPer !== '' && minPer > 0 ? { minPerSession: minPer } : {}),
            ...(maxPer !== '' && maxPer > 0 ? { maxPerSession: maxPer } : {}),
          }
        : undefined
    const opts = {
      ...(limits ? { limits } : {}),
      ...(mode === 'time' && durationLocked ? { durationLocked: true } : {}),
      ...(messageToSelf.trim() ? { messageToSelf: messageToSelf.trim() } : {}),
    }
    if (mode === 'time') {
      if (hours < 1) return
      addMilestone(goal.trim(), reward.trim(), { kind: 'time', target: Math.round(hours * 60) }, opts)
    } else if (metricChoice) {
      addMilestone(goal.trim(), reward.trim(), { kind: metricChoice.kind, target }, opts)
    } else {
      addMilestone(goal.trim(), reward.trim(), undefined, opts)
    }
    setGoal('')
    setReward('')
    setTarget(30)
    setHours(50)
    setMinPer('')
    setMaxPer('')
    setDurationLocked(false)
    setMessageToSelf('')
    setShowForm(false)
  }

  const handleClaim = (m: MilestoneReward) => {
    const r = claimMilestone(m.id)
    if (r) setClaimedId(m.id)
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="rpg-panel p-5">
        <div className="flex items-center justify-between">
          <PageHeader
            icon="🎯"
            title="里程碑奖励"
            subtitle="进度由真实数据驱动——升级、专注、记录，每一步都算数。"
          />
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rpg-btn-primary px-3 py-1.5 text-xs"
          >
            {showForm ? '收起' : '+ 新目标'}
          </button>
        </div>

        {showForm && (
          <div className="mt-4 space-y-3 animate-slide-up">
            {/* 指标选择网格 */}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {METRIC_CHOICES.map((c) => (
                <button
                  key={c.kind}
                  onClick={() => {
                    setMode(`auto-${c.kind}`)
                    setTarget(c.defaultTarget)
                  }}
                  className={`rounded-lg border-2 p-2 text-center transition-all ${
                    mode === `auto-${c.kind}`
                      ? 'border-rpg-gold bg-rpg-panelLight'
                      : 'border-rpg-border bg-rpg-panel hover:border-rpg-gold/40'
                  }`}
                  title={c.hint}
                >
                  <div className="text-lg">{c.icon}</div>
                  <div className="text-[10px] font-bold text-gray-200">{c.label}</div>
                </button>
              ))}
              <button
                onClick={() => setMode('time')}
                className={`rounded-lg border-2 p-2 text-center transition-all ${
                  mode === 'time'
                    ? 'border-rpg-gold bg-rpg-panelLight'
                    : 'border-rpg-border bg-rpg-panel hover:border-rpg-gold/40'
                }`}
                title="定一个预计耗时，记录行动/开番茄钟时关联累计"
              >
                <div className="text-lg">⏳</div>
                <div className="text-[10px] font-bold text-gray-200">时间投入</div>
              </button>
            </div>

            {mode === 'time' ? (
              <div>
                <label className="mb-1 flex items-center justify-between text-xs text-gray-300">
                  <span>⏳ 预计耗时（记录行动 / 开番茄钟时关联累计）</span>
                  <span className={TIER_META[tierForMetric('time', hours * 60)].text}>
                    {TIER_META[tierForMetric('time', hours * 60)].badge}{' '}
                    {TIER_META[tierForMetric('time', hours * 60)].label}档
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    step={5}
                    value={hours}
                    onChange={(e) => setHours(Math.max(1, Number(e.target.value)))}
                    className="w-24 rounded-lg border-2 border-rpg-border bg-rpg-bg p-2 text-sm focus:border-rpg-gold focus:outline-none"
                  />
                  <span className="text-xs text-gray-400">小时</span>
                  <div className="flex flex-wrap gap-1">
                    {[20, 50, 100, 200].map((h) => (
                      <button
                        key={h}
                        onClick={() => setHours(h)}
                        className={`rounded border px-1.5 py-0.5 text-[10px] transition-all ${
                          hours === h
                            ? 'border-rpg-gold bg-rpg-gold/20 text-rpg-gold'
                            : 'border-rpg-border bg-rpg-panel text-gray-400 hover:text-white'
                        }`}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-1 text-[10px] leading-relaxed text-gray-500">
                  创建后目标时长只增不减；难度档位与检查点奖励随预计耗时判定。
                  25h 内青铜 · 60h 内白银 · 150h 内黄金 · 以上传说。
                </div>

                {/* 单次投入限制（防刷小局 / 防单次爆量） */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] text-gray-500">单次限制（可选）</span>
                  <input
                    type="number"
                    min={1}
                    placeholder="下限"
                    value={minPer}
                    onChange={(e) => setMinPer(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
                    className="w-16 rounded-lg border-2 border-rpg-border bg-rpg-bg p-1.5 text-xs focus:border-rpg-gold focus:outline-none"
                    title="单次实际投入低于该分钟数时，本次完全不计入该目标进度（防开小局刷进度）"
                  />
                  <span className="text-[10px] text-gray-600">≤ 单次 ≤</span>
                  <input
                    type="number"
                    min={1}
                    placeholder="上限"
                    value={maxPer}
                    onChange={(e) => setMaxPer(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
                    className="w-16 rounded-lg border-2 border-rpg-border bg-rpg-bg p-1.5 text-xs focus:border-rpg-gold focus:outline-none"
                    title="单次实际投入高于该分钟数时，按上限计入（防单次爆量冲目标）"
                  />
                  <span className="text-[10px] text-gray-500">分钟，留空不限制</span>
                </div>

                {/* 目标时长锁定开关 */}
                <button
                  onClick={() => setDurationLocked((v) => !v)}
                  className={`mt-2 flex w-full items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-left transition-all ${
                    durationLocked
                      ? 'border-rpg-courage/60 bg-rpg-courage/10'
                      : 'border-rpg-border bg-rpg-panel hover:border-rpg-gold/40'
                  }`}
                  title="锁定后不可再调整目标时长——立下的承诺不再改变"
                >
                  <span className="text-xs">{durationLocked ? '🔒' : '🔓'}</span>
                  <span className="text-[11px] text-gray-300">
                    {durationLocked ? '已锁定：目标时长不可调整' : '允许后续调整目标时长（默认）'}
                  </span>
                </button>
              </div>
            ) : metricChoice ? (
              <div>
                <label className="mb-1 flex items-center justify-between text-xs text-gray-300">
                  <span>
                    {metricChoice.icon} {metricChoice.label}目标（{metricChoice.hint}）
                  </span>
                  <span className={TIER_META[tierForMetric(metricChoice.kind, target)].text}>
                    {TIER_META[tierForMetric(metricChoice.kind, target)].badge}{' '}
                    {TIER_META[tierForMetric(metricChoice.kind, target)].label}档
                  </span>
                </label>
                <input
                  type="number"
                  min={1}
                  step={metricChoice.targetStep}
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                  className="w-full rounded-lg border-2 border-rpg-border bg-rpg-bg p-2 text-sm focus:border-rpg-gold focus:outline-none"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-rpg-border bg-rpg-bg p-2 text-[10px] leading-relaxed text-gray-500">
                请先选择目标类型。
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs text-gray-300">目标描述</label>
              <input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={
                  mode === 'time'
                    ? `投入 ${hours} 小时完成（如：做完第一个游戏 Demo）`
                    : metricChoice
                      ? `${metricChoice.label}达到 ${target}${metricChoice.unit}`
                      : '目标描述'
                }
                className="w-full rounded-lg border-2 border-rpg-border bg-rpg-bg p-2 text-sm focus:border-rpg-gold focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-300">✉️ 给自己的话</label>
              <div className="rounded-lg border-2 border-rpg-border bg-rpg-bg p-2">
                <input
                  value={reward}
                  onChange={(e) => setReward(e.target.value)}
                  placeholder="奖励承诺：例如《XXX》游戏 / 一顿好吃的 / 一次旅行"
                  className="w-full rounded-lg border border-rpg-border/60 bg-rpg-panel p-2 text-sm focus:border-rpg-gold focus:outline-none"
                />
                <textarea
                  value={messageToSelf}
                  onChange={(e) => setMessageToSelf(e.target.value)}
                  placeholder="写给达成那一刻的自己（可选）：为什么定这个目标？做到了意味着什么？"
                  rows={2}
                  className="mt-2 w-full resize-none rounded-lg border border-rpg-border/60 bg-rpg-panel p-2 text-xs text-gray-300 focus:border-rpg-gold focus:outline-none"
                />
                <div className="mt-1 text-[10px] text-gray-500">
                  达成时刻与回顾墙会展示这段话——让未来的你看见此刻的决心。
                </div>
              </div>
            </div>

            <button onClick={submit} className="rpg-btn-primary w-full px-4 py-2 text-sm">
              创建里程碑
            </button>
          </div>
        )}
      </div>

      {milestones.length === 0 ? (
        <div className="rpg-panel p-8 text-center text-sm text-gray-400">
          还没有里程碑。给自己一个值得期待的目标吧。
        </div>
      ) : (
        <div className="space-y-3">
          {milestones.map((m) => {
            const pct = Math.round(m.progress * 100)
            const tier: MilestoneTier = m.tier ?? 'bronze'
            const tMeta = TIER_META[tier]
            const metricKind = m.metric?.kind
            const mMeta = metricKind ? METRIC_META[metricKind] : null
            const cur = metricKind ? metricCurrentValue(state, metricKind) : null
            const claimedStages = new Set(m.stagesClaimed ?? [])
            const stagePct = m.progress * 100
            return (
              <div
                key={m.id}
                className={`rpg-panel relative overflow-hidden p-4 ${tMeta.border} ${
                  m.done ? 'border-rpg-xp' : ''
                } ${claimedId === m.id ? 'claim-burst' : ''}`}
              >
                {claimedId === m.id && <Confetti />}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg" title={tMeta.label + '档'}>
                        {tMeta.badge}
                      </span>
                      <span className="text-sm font-bold text-white">{m.goal}</span>
                      {mMeta && (
                        <span className={`rounded px-1.5 py-0.5 text-[9px] ${tMeta.text} border ${tMeta.border}`}>
                          {mMeta.icon} {mMeta.label}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-rpg-creativity">奖励：{m.reward}</div>
                    {/* time 型限制徽章 */}
                    {metricKind === 'time' && m.limits && (m.limits.minPerSession || m.limits.maxPerSession) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {m.limits.minPerSession !== undefined && (
                          <span
                            className="rounded bg-rpg-courage/15 px-1.5 py-0.5 text-[9px] text-rpg-courage"
                            title={`单次实际投入低于 ${m.limits.minPerSession}min 时，本次完全不计入`}
                          >
                            ⚔️ 单次 ≥ {m.limits.minPerSession}min
                          </span>
                        )}
                        {m.limits.maxPerSession !== undefined && (
                          <span
                            className="rounded bg-rpg-xp/15 px-1.5 py-0.5 text-[9px] text-rpg-xp"
                            title={`单次实际投入高于 ${m.limits.maxPerSession}min 时，按上限计入`}
                          >
                            🛡️ 单次 ≤ {m.limits.maxPerSession}min
                          </span>
                        )}
                      </div>
                    )}
                    {m.durationLocked && metricKind === 'time' && (
                      <span className="ml-1 text-[9px] text-gray-500" title="创建时选择锁定，目标时长不可调整">
                        🔒 时长已锁定
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setDeleteTarget(m)}
                    className="text-xs text-gray-600 transition-colors hover:text-rpg-courage"
                    title="删除需花费 2500 金币——目标不该轻易放弃"
                  >
                    ✕
                  </button>
                </div>

                {/* 分段进度条：4 段检查点（25/50/75/100） */}
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[10px]">
                    <span className="text-gray-400">
                      {metricKind === 'time' && m.metric
                        ? `${((m.linkedMinutes ?? 0) / 60).toFixed(1)}h / ${m.metric.target / 60}h`
                        : m.metric && cur !== null && mMeta
                          ? `${cur}${metricKind === 'totalXp' ? '' : mMeta.unit} / ${m.metric.target}${metricKind === 'totalXp' ? '' : mMeta.unit}`
                          : m.targetLevel
                            ? `Lv.${state.player.level} / Lv.${m.targetLevel}`
                            : `${pct}%`}
                    </span>
                    <span className={m.done ? 'text-rpg-xp' : 'text-gray-400'}>
                      {m.done ? (m.finalClaimed ? '已完成 🎉' : '待领取 🏁') : `${pct}%`}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {MILESTONE_STAGES.map((stage) => {
                      const filled = stagePct >= stage * 100
                      const stageKey = Math.round(stage * 100)
                      const stageDone = claimedStages.has(stageKey)
                      return (
                        <div
                          key={stage}
                          className="relative h-3 flex-1 overflow-hidden rounded-full bg-rpg-bg"
                          title={`${stageKey}% 检查点${stage < 1 ? ` · ${stageReward(tier, stage).xp}XP +${stageReward(tier, stage).coins}币` : ' · 完成奖励'}`}
                        >
                          <div
                            className={`h-full transition-all duration-500 ${
                              stage >= 1
                                ? 'bg-gradient-to-r from-rpg-xp to-emerald-300'
                                : 'bg-gradient-to-r from-rpg-gold to-amber-300'
                            }`}
                            style={{ width: filled ? '100%' : `${Math.min(100, Math.max(0, (stagePct - (stage * 100 - 25)) * 4))}%` }}
                          />
                          {stageDone && stage < 1 && (
                            <span className="absolute inset-0 flex items-center justify-center text-[8px] text-white/90">
                              ✓
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 寄语：进度条下方引用样式 */}
                {m.messageToSelf && (
                  <div className="mt-3 border-l-2 border-rpg-gold/40 pl-3">
                    <p className="text-[11px] italic leading-relaxed text-gray-400">「{m.messageToSelf}」</p>
                    <p className="mt-0.5 text-[9px] text-gray-600">— 创建时写给自己的话</p>
                  </div>
                )}

                {/* 完成领取按钮：仪式感 */}
                {m.done && !m.finalClaimed && (
                  <button
                    onClick={() => handleClaim(m)}
                    className="rpg-btn-primary claim-glow mt-3 w-full px-4 py-2 text-sm"
                  >
                    🎁 领取完成奖励（{stageReward(tier, 1).xp}XP + {stageReward(tier, 1).coins}金币）
                  </button>
                )}

                {/* time 型：目标时长只增不减（进度按新目标重算，不补发已领奖励）；创建时锁定的隐藏入口 */}
                {metricKind === 'time' && m.metric && !m.finalClaimed && !m.durationLocked && (
                  <div className="mt-3">
                    {extendingId === m.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={Math.floor(m.metric.target / 60) + 1}
                          step={5}
                          value={extendHours}
                          onChange={(e) => setExtendHours(Number(e.target.value))}
                          className="w-20 rounded-lg border-2 border-rpg-border bg-rpg-bg p-1.5 text-xs focus:border-rpg-gold focus:outline-none"
                        />
                        <span className="text-[10px] text-gray-500">
                          小时（至少 {Math.floor(m.metric.target / 60) + 1}h，只能增加）
                        </span>
                        <button
                          onClick={() => {
                            if (extendMilestoneTarget(m.id, Math.round(extendHours * 60))) {
                              setExtendingId(null)
                            } else {
                              alert('新时长必须大于当前目标时长')
                            }
                          }}
                          className="rpg-btn-primary px-2 py-1 text-[10px]"
                        >
                          确认提升
                        </button>
                        <button
                          onClick={() => setExtendingId(null)}
                          className="rpg-btn px-2 py-1 text-[10px]"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setExtendingId(m.id)
                          setExtendHours(Math.ceil(m.metric!.target / 60) + 5)
                        }}
                        className="text-[10px] text-gray-500 transition-colors hover:text-rpg-gold"
                        title="目标比预想的更大？延长预计耗时（只增不减，已领奖励不补发）"
                      >
                        ⏱ 调整目标时长（只增不减）
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 信念角：我就要爬这座山 */}
      <button
        onClick={() => setShowMountain(true)}
        className="rpg-panel group flex w-full items-center gap-4 p-4 text-left transition-all hover:border-rpg-gold/60"
        title="点击放大"
      >
        <img
          src="/climb-this-mountain.jpg"
          alt="我就要爬这座山"
          className="h-20 w-20 shrink-0 rounded-lg border border-rpg-border object-cover"
        />
        <div className="min-w-0">
          <div className="text-sm text-gray-300 group-hover:text-white">我就要爬这座山</div>
          <div className="mt-1 text-[10px] leading-relaxed text-gray-500">
            山不会动，我会一直走。累的时候看看它。
          </div>
        </div>
        <span className="ml-auto shrink-0 text-[10px] text-gray-600 group-hover:text-gray-400">
          点击放大
        </span>
      </button>

      {/* 放大查看 */}
      {showMountain && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 animate-fade-in"
          onClick={() => setShowMountain(false)}
        >
          <img
            src="/climb-this-mountain.jpg"
            alt="我就要爬这座山"
            className="max-h-[85vh] max-w-full rounded-xl shadow-2xl"
          />
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-gray-400">
            我就要爬这座山 · 点击任意处关闭
          </div>
        </div>
      )}

      {/* 删除确认弹窗（应用内实现，取消即真正取消） */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fade-in"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="rpg-panel w-full max-w-sm border-2 border-rpg-courage/60 p-5 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-3xl">⚠️</div>
            <div className="pixel-text mt-2 text-sm text-rpg-courage">放弃这个目标？</div>
            <div className="mt-2 text-sm font-bold text-white">{deleteTarget.goal}</div>
            <div className="mt-3 space-y-1 text-xs text-gray-400">
              <p>
                删除需支付 <b className="text-rpg-gold">2500 金币</b>（当前持有 {coins}）
              </p>
              <p>已投入的进度无法找回，这个决定不可撤销。</p>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rpg-btn flex-1 py-2 text-sm"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (deleteMilestone(deleteTarget.id)) {
                    setDeleteTarget(null)
                  }
                  // 失败（金币不足）：coins 订阅会让按钮自动变为禁用态
                }}
                disabled={coins < 2500}
                className="rpg-btn flex-1 border-rpg-courage/60 py-2 text-sm text-rpg-courage transition-all hover:bg-rpg-courage/20 disabled:cursor-not-allowed disabled:opacity-40"
                title={coins < 2500 ? '金币不足' : '支付 2500 金币并删除'}
              >
                {coins < 2500 ? '金币不足' : '支付 2500 并删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

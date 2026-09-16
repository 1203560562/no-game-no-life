/**
 * v1.0 首屏核心：「开始一局」中心
 *
 * 三种状态：
 * 1. 待开局 —— ▶ 开始一局（全页最重要的按钮）+ 今日/长期增长概览
 * 2. 配置中 —— 选类型/时长/标题 → 开局
 * 3. 进行中 —— 实时资源增长（数字在涨）、效率、本局预计收益
 *
 * 计时与结算触发在全局 PomodoroTimer（局 HUD），本组件只做展示与开局配置。
 */

import { useEffect, useMemo, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import { usePomodoroStore } from '../store/usePomodoroStore'
import { DOMAIN_META, SESSION_PRESETS, SESSION_TYPES } from '../config/xpConfig'
import {
  CONSUMABLE_EFFECTS,
  CONSUMABLE_ITEM_IDS,
  SHOP_ITEMS,
} from '../config/shopItems'
import { computeEfficiency, efficiencyStats, fmtHours } from '../engine/sessionEngine'
import { todayKey } from '../engine/xpCalculator'
import type { ActivityType } from '../types'

const fmtClock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export const SessionHero: React.FC = () => {
  const player = useGameStore((s) => s.state.player)
  const sessions = useGameStore((s) => s.state.sessions)
  const timeMilestones = useGameStore((s) =>
    s.state.milestones.filter((m) => m.metric?.kind === 'time' && !m.finalClaimed),
  )
  const pomodoro = usePomodoroStore()

  const [configuring, setConfiguring] = useState(false)
  const [selType, setSelType] = useState<ActivityType>(pomodoro.activityType)
  const [selMinutes, setSelMinutes] = useState(pomodoro.settings.focus)
  const [title, setTitle] = useState('')
  /** 本局选用的消耗品（null = 不用；初始同步番茄钟面板已选的道具） */
  const [selBuff, setSelBuff] = useState<string | null>(pomodoro.buffItemId)
  /** 来自任务榜的节点 uid（null = 自由局） */
  const [launchTaskId, setLaunchTaskId] = useState<string | null>(null)
  /** 本局关联的 time 型里程碑（null = 不关联） */
  const [selMilestoneIds, setSelMilestoneIds] = useState<string[]>([])
  /** 进行中的展示时钟（ms） */
  const [now, setNow] = useState(Date.now())

  // 任务榜「为此任务开一局」跳转：自动进入配置并预填
  const pendingLaunch = usePomodoroStore((s) => s.pendingLaunch)
  useEffect(() => {
    if (!pendingLaunch) return
    setTitle(pendingLaunch.title)
    setLaunchTaskId(pendingLaunch.taskId)
    setConfiguring(true)
    usePomodoroStore.getState().setPendingLaunch(null)
  }, [pendingLaunch])

  const { phase, running } = pomodoro
  const inSession = phase === 'focus' && (running || pomodoro.elapsedMs > 0)
  const inBreak = phase !== 'focus'

  // 拥有的消耗品（id → 名称/图标/数量）
  const ownedBuffs = useMemo(() => {
    const inv = useGameStore.getState().state.player.inventory ?? {}
    return CONSUMABLE_ITEM_IDS.filter((id) => (inv[id] ?? 0) > 0).map((id) => {
      const item = SHOP_ITEMS.find((i) => i.id === id)!
      return { id, name: item.name, icon: item.icon, count: inv[id] }
    })
  }, [configuring, player.coins, player.inventory])

  // 进行中（一局或休息计时）：驱动实时数字的 tick
  useEffect(() => {
    if (!inSession && !pomodoro.running) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [inSession, pomodoro.running])

  // 休息阶段：剩余毫秒（运行中由 tick 驱动；暂停时定格 remainingMs）
  const breakLeftMs =
    pomodoro.running && pomodoro.endAt ? Math.max(0, pomodoro.endAt - now) : pomodoro.remainingMs

  /** 以指定时长开始休息（写入当前休息阶段的设置后启动） */
  const startBreak = (minutes: number) => {
    pomodoro.setSettings(pomodoro.phase === 'long' ? { long: minutes } : { short: minutes })
    pomodoro.start()
  }

  const stats = useMemo(() => efficiencyStats(sessions ?? []), [sessions])
  const today = useMemo(() => {
    const key = todayKey()
    const list = (sessions ?? []).filter((s) => s.endTime.slice(0, 10) === key)
    return {
      count: list.length,
      minutes: list.reduce((s, x) => s + x.actualMinutes, 0),
      xp: list.reduce((s, x) => s + x.xpGained, 0),
      coins: list.reduce((s, x) => s + x.coinsGained, 0),
    }
  }, [sessions])

  const sessionNo = (player.totalSessions ?? 0) + 1

  // ===== 进行中：实时数字 =====
  const liveEff = useMemo(
    () => computeEfficiency(player, pomodoro.activityType),
    [player, pomodoro.activityType],
  )
  const elapsedMs =
    pomodoro.elapsedMs + (running && pomodoro.resumedAt ? now - pomodoro.resumedAt : 0)
  const liveXp = Math.floor(liveEff.xpPerMin * (elapsedMs / 60000))
  const projectedXp = Math.round(liveEff.xpPerMin * pomodoro.settings.focus)
  const totalMs = pomodoro.settings.focus * 60000
  const progress = Math.min(1, elapsedMs / totalMs)

  // ===== 配置中：效率预估 =====
  const previewEff = useMemo(() => computeEfficiency(player, selType), [player, selType])
  const previewXp = Math.round(previewEff.xpPerMin * selMinutes)
  // buff 加成后的预估（暴击券显示期望值，避免误导）
  const selBuffEffect = selBuff ? CONSUMABLE_EFFECTS[selBuff] : undefined
  const buffPreviewMult = selBuffEffect
    ? selBuffEffect.kind === 'deepBonus'
      ? selMinutes >= 45
        ? selBuffEffect.multiplier
        : 1
      : selBuffEffect.kind === 'crit'
        ? 1 + (selBuffEffect.chance ?? 0.3) * (selBuffEffect.multiplier - 1)
        : selBuffEffect.multiplier
    : 1
  const previewXpBuffed = Math.round(previewXp * buffPreviewMult)

  const launchSession = () => {
    pomodoro.setSettings({ focus: selMinutes })
    pomodoro.setActivityType(selType)
    pomodoro.setTaskTitle(title.trim())
    pomodoro.setBuff(selBuff)
    pomodoro.setTaskId(launchTaskId)
    pomodoro.setMilestoneIds(selMilestoneIds)
    pomodoro.setPhase('focus')
    pomodoro.start()
    setConfiguring(false)
    setSelBuff(null)
    setLaunchTaskId(null)
    setSelMilestoneIds([])
  }

  const cancelConfiguring = () => {
    setConfiguring(false)
    setLaunchTaskId(null)
    setTitle('')
    setSelMilestoneIds([])
    pomodoro.setTaskId(null)
    pomodoro.setMilestoneIds([])
  }

  return (
    <div className="rpg-panel relative overflow-hidden border-rpg-gold/60">
      {/* 背景微光 */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-rpg-gold/8 via-transparent to-rpg-xp/8" />

      {/* ===== 进行中 ===== */}
      {inSession ? (
        <div className="relative p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="animate-pulse text-lg">⏳</span>
              <span className="pixel-text text-[10px] text-rpg-gold">第 {sessionNo} 局 · 进行中</span>
            </div>
            <span className="text-xs text-gray-400">
              {DOMAIN_META[pomodoro.activityType].icon}{' '}
              {pomodoro.taskId && <span className="mr-0.5 text-rpg-gold">📋</span>}
              {pomodoro.taskTitle.trim() || DOMAIN_META[pomodoro.activityType].label}
              {pomodoro.buffItemId &&
                (() => {
                  const b = SHOP_ITEMS.find((i) => i.id === pomodoro.buffItemId)
                  return b ? (
                    <span className="ml-2 rounded border border-rpg-gold/60 bg-rpg-gold/15 px-1.5 py-0.5 text-[9px] text-rpg-gold">
                      {b.icon} {b.name} 生效中
                    </span>
                  ) : null
                })()}
            </span>
          </div>

          <div className="flex flex-col items-center py-2">
            <div className="font-rpg text-4xl tabular-nums text-white">
              {fmtClock(elapsedMs)}
              <span className="ml-2 text-sm text-gray-500">/ {pomodoro.settings.focus}:00</span>
            </div>

            {/* 实时增长的核心数字 */}
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-rpg text-3xl tabular-nums text-rpg-xp drop-shadow-[0_0_6px_rgba(94,234,212,0.4)]">
                +{liveXp.toLocaleString()}
              </span>
              <span className="text-xs text-rpg-xp/70">XP</span>
            </div>

            {/* 进度条 */}
            <div className="mt-3 h-3 w-full max-w-md overflow-hidden rounded-full border border-rpg-border bg-black/40">
              <div
                className="h-full rounded-full bg-gradient-to-r from-rpg-xp to-rpg-gold transition-all duration-500"
                style={{ width: `${progress * 100}%` }}
              />
            </div>

            <div className="mt-3 grid w-full max-w-md grid-cols-3 gap-2 text-center text-xs">
              <div>
                <div className="text-gray-500">当前效率</div>
                <div className="font-bold text-rpg-gold">
                  {liveEff.xpPerMin.toFixed(1)}/min
                </div>
              </div>
              <div>
                <div className="text-gray-500">效率修正</div>
                <div className="font-bold text-purple-300">×{liveEff.multiplier.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-500">本局预计</div>
                <div className="font-bold text-rpg-xp">+{projectedXp.toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div className="mt-2 text-center text-[10px] text-gray-500">
            现实里做事就好，数字会替你记住。{!running && '（已暂停）'}
          </div>
        </div>
      ) : (
        /* ===== 待开局 / 配置中 / 休息中 ===== */
        <div className="relative p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="pixel-text text-[10px] text-rpg-gold">
                {inBreak ? '☕ 局间休息中' : configuring ? `第 ${sessionNo} 局 · 配置` : `准备第 ${sessionNo} 局`}
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                <span>Lv.<span className="font-bold text-rpg-gold">{player.level}</span></span>
                <span>
                  效率 <span className="font-bold text-purple-300">×{stats.latest > 0 ? stats.latest.toFixed(2) : previewEff.multiplier.toFixed(2)}</span>
                </span>
                <span>
                  最高 <span className="font-bold text-rpg-gold">×{stats.best > 0 ? stats.best.toFixed(2) : '—'}</span>
                </span>
              </div>
            </div>
            <div className="flex gap-4 text-center text-xs">
              <div>
                <div className="text-gray-500">今日</div>
                <div className="font-bold text-white">{today.count} 局</div>
              </div>
              <div>
                <div className="text-gray-500">今日 XP</div>
                <div className="font-bold text-rpg-xp">+{today.xp.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-500">累计投入</div>
                <div className="font-bold text-rpg-gold">{fmtHours(player.totalSessionMinutes ?? 0)}</div>
              </div>
            </div>
          </div>

          {configuring ? (
            <div className="space-y-3">
              {/* 类型选择 */}
              <div>
                <div className="mb-1.5 text-[10px] text-gray-500">这一局做什么？</div>
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                  {SESSION_TYPES.map((t) => {
                    const m = DOMAIN_META[t]
                    const eff = computeEfficiency(player, t)
                    return (
                      <button
                        key={t}
                        onClick={() => setSelType(t)}
                        className={`flex flex-col items-center gap-0.5 rounded-lg border-2 px-1 py-1.5 transition-all ${
                          selType === t
                            ? 'border-rpg-gold bg-rpg-gold/15'
                            : 'border-rpg-border bg-rpg-panel hover:border-rpg-gold/40'
                        }`}
                      >
                        <span className="text-lg">{m.icon}</span>
                        <span className="text-[10px] text-gray-300">{m.label}</span>
                        <span className="text-[9px] text-rpg-gold">{eff.xpPerMin.toFixed(1)}/m</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 时长选择（预设 + ±5 微调，1~180 分钟） */}
              <div>
                <div className="mb-1.5 text-[10px] text-gray-500">局时长</div>
                <div className="flex gap-1.5">
                  {SESSION_PRESETS.map((m) => (
                    <button
                      key={m}
                      onClick={() => setSelMinutes(m)}
                      className={`flex-1 rounded-lg border-2 py-1.5 text-xs transition-all ${
                        selMinutes === m
                          ? 'border-rpg-gold bg-rpg-gold/15 text-rpg-gold'
                          : 'border-rpg-border bg-rpg-panel text-gray-400 hover:text-white'
                      }`}
                    >
                      {m} 分钟
                    </button>
                  ))}
                  {!SESSION_PRESETS.includes(selMinutes) && (
                    <span className="flex min-w-16 items-center justify-center rounded-lg border-2 border-rpg-gold bg-rpg-gold/15 px-2 py-1.5 text-xs font-bold text-rpg-gold">
                      {selMinutes}′
                    </span>
                  )}
                  <button
                    onClick={() => setSelMinutes((m) => Math.max(1, m - 5))}
                    className="rounded-lg border-2 border-rpg-border bg-rpg-panel px-2.5 py-1.5 text-xs text-gray-400 transition-all hover:text-white"
                    title="减 5 分钟"
                  >
                    −5
                  </button>
                  <button
                    onClick={() => setSelMinutes((m) => Math.min(180, m + 5))}
                    className="rounded-lg border-2 border-rpg-border bg-rpg-panel px-2.5 py-1.5 text-xs text-gray-400 transition-all hover:text-white"
                    title="加 5 分钟"
                  >
                    +5
                  </button>
                </div>
              </div>

              {/* 标题（可选；任务榜跳转时预填并标记） */}
              <div className="flex items-center gap-2">
                {launchTaskId && (
                  <span className="shrink-0 rounded border border-rpg-gold/60 bg-rpg-gold/15 px-1.5 py-1 text-[9px] text-rpg-gold">
                    📋 来自任务榜
                  </span>
                )}
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="给这一局起个名字？（可选）"
                  className="w-full rounded-lg border-2 border-rpg-border bg-rpg-bg px-3 py-1.5 text-xs text-gray-200 outline-none focus:border-rpg-gold"
                />
              </div>

              {/* 关联里程碑：本局实际投入计入其进度（可多选，各自受单次限制） */}
              {timeMilestones.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[10px] text-gray-500">
                    关联里程碑（可多选，本局投入分别累计进各目标进度）
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {timeMilestones.map((m) => {
                      const selected = selMilestoneIds.includes(m.id)
                      const min = m.limits?.minPerSession
                      const tooShort = min !== undefined && selMinutes < min
                      return (
                        <button
                          key={m.id}
                          onClick={() =>
                            setSelMilestoneIds((prev) =>
                              selected ? prev.filter((x) => x !== m.id) : [...prev, m.id],
                            )
                          }
                          title={`${((m.linkedMinutes ?? 0) / 60).toFixed(1)}h / ${((m.metric?.target ?? 0) / 60).toFixed(0)}h · 结算时计入实际投入${
                            min !== undefined ? `（单次≥${min}min 才计入）` : ''
                          }`}
                          className={`flex items-center gap-1 rounded-lg border-2 px-2 py-1 text-[10px] transition-all ${
                            selected
                              ? 'border-rpg-gold bg-rpg-gold/15 text-rpg-gold'
                              : tooShort
                                ? 'border-rpg-border bg-rpg-panel text-gray-600'
                                : 'border-rpg-border bg-rpg-panel text-gray-300 hover:border-rpg-gold/50'
                          }`}
                        >
                          <span>⏳</span>
                          <span className="max-w-36 truncate">{m.goal}</span>
                          <span className="opacity-60">{Math.round(m.progress * 100)}%</span>
                          {tooShort && <span title={`本局 ${selMinutes}min 未达该目标单次下限 ${min}min`}>🚫</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 消耗品（有库存才显示） */}
              {ownedBuffs.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[10px] text-gray-500">用一张道具？</div>
                  <div className="flex flex-wrap gap-1.5">
                    {ownedBuffs.map((b) => {
                      const eff = CONSUMABLE_EFFECTS[b.id]
                      const selected = selBuff === b.id
                      const dimmed =
                        eff.kind === 'deepBonus' && selMinutes < 45
                      return (
                        <button
                          key={b.id}
                          onClick={() => setSelBuff(selected ? null : b.id)}
                          title={eff.detail}
                          className={`flex items-center gap-1 rounded-lg border-2 px-2 py-1 text-[10px] transition-all ${
                            selected
                              ? 'border-rpg-gold bg-rpg-gold/15 text-rpg-gold'
                              : dimmed
                                ? 'border-rpg-border bg-rpg-panel text-gray-600'
                                : 'border-rpg-border bg-rpg-panel text-gray-300 hover:border-rpg-gold/50'
                          }`}
                        >
                          <span>{b.icon}</span>
                          <span>{b.name}</span>
                          <span className="opacity-60">×{b.count}</span>
                          {selected && eff.kind === 'crit' && (
                            <span className="text-purple-300">🎲</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 预估 + 开局 */}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-rpg-border bg-black/30 px-3 py-2">
                <div className="text-xs text-gray-400">
                  预计收益{' '}
                  <span className="font-bold text-rpg-xp">+{previewXpBuffed.toLocaleString()} XP</span>
                  {buffPreviewMult > 1.001 && (
                    <span className="ml-1 text-[10px] text-rpg-gold">
                      （含道具 ×{buffPreviewMult.toFixed(2)}）
                    </span>
                  )}
                  <span className="ml-2 text-gray-500">
                    （×{previewEff.multiplier.toFixed(2)} · {previewEff.xpPerMin.toFixed(1)}/min）
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={cancelConfiguring} className="rpg-btn px-3 py-1.5 text-xs">
                    取消
                  </button>
                  <button onClick={launchSession} className="rpg-btn-primary px-5 py-1.5 text-sm font-bold">
                    ▶ 开局
                  </button>
                </div>
              </div>
            </div>
          ) : inBreak ? (
            /* ===== 休息阶段：选择休息时长 / 休息倒计时 ===== */
            pomodoro.running ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="font-rpg text-3xl tabular-nums text-emerald-300">
                  {fmtClock(breakLeftMs)}
                </div>
                <div className="text-[10px] text-gray-500">
                  休息中 · 到点自动回到下一局，随时可以提前开始
                </div>
                <div className="mt-1 flex gap-2">
                  <button onClick={() => pomodoro.pause()} className="rpg-btn px-4 py-1.5 text-xs">
                    ⏸ 暂停
                  </button>
                  <button onClick={pomodoro.skip} className="rpg-btn-primary px-4 py-1.5 text-xs">
                    ⏭ 跳过休息，开始下一局
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-1.5 text-center text-[10px] text-gray-500">
                  上一局结束了，休息一下？选个时长开始
                </div>
                <div className="mx-auto flex w-full max-w-md gap-1.5">
                  {[5, 10, 15, 20].map((m) => (
                    <button
                      key={m}
                      onClick={() => startBreak(m)}
                      className="flex-1 rounded-lg border-2 border-emerald-500/60 bg-emerald-500/10 py-2 text-xs font-bold text-emerald-300 transition-all hover:scale-[1.03] hover:bg-emerald-500/20 active:scale-[0.97]"
                    >
                      ☕ {m}′
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      pomodoro.skip()
                      setConfiguring(true)
                    }}
                    className="rounded-lg border-2 border-rpg-border bg-rpg-panel px-3 py-2 text-xs text-gray-400 transition-all hover:text-white"
                  >
                    跳过，直接开局
                  </button>
                </div>
              </div>
            )
          ) : (
            <button
              onClick={() => setConfiguring(true)}
              className="group relative mx-auto flex w-full max-w-sm items-center justify-center gap-3 rounded-xl border-2 border-rpg-gold bg-gradient-to-b from-rpg-gold/25 to-rpg-gold/5 py-4 text-lg font-bold text-rpg-gold shadow-[0_0_24px_rgba(251,191,36,0.15)] transition-all hover:scale-[1.02] hover:shadow-[0_0_36px_rgba(251,191,36,0.3)] active:scale-[0.98]"
            >
              <span className="text-2xl transition-transform group-hover:translate-x-0.5">▶</span>
              开始一局
            </button>
          )}

          {!configuring && !inBreak && (
            <div className="mt-3 text-center text-[10px] text-gray-500">
              15~60 分钟一局（可 ±5 微调） · 升级和属性会让下一局真的更强
            </div>
          )}
        </div>
      )}
    </div>
  )
}

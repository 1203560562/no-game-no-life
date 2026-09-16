/**
 * 局 HUD（原番茄钟，v1.0 升级为「一局」的全局计时与结算触发器）
 *
 * 专注阶段 = 一局：到点自动结算（SessionSettleOverlay 展示）；
 * 也可提前结算 —— 做了多少，就获得多少。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePomodoroStore, type PomodoroPhase } from '../store/usePomodoroStore'
import { useGameStore } from '../store/useGameStore'
import { ACTIVITY_TYPES, DOMAIN_META } from '../config/xpConfig'
import { CONSUMABLE_EFFECTS, CONSUMABLE_ITEM_IDS, SHOP_ITEMS } from '../config/shopItems'
import { sfx, startKeepAlive, stopKeepAlive } from '../lib/soundFx'
import {
  getNotifyEnabled,
  notifyPermission,
  notifySupported,
  requestNotifyPermission,
  sendNotification,
  setNotifyEnabled,
} from '../lib/notify'
import type { ActivityType } from '../types'

const PHASE_META: Record<PomodoroPhase, { label: string; color: string; emoji: string }> = {
  focus: { label: '专注', color: '#fb7185', emoji: '🍅' },
  short: { label: '短休息', color: '#34d399', emoji: '☕' },
  long: { label: '长休息', color: '#60a5fa', emoji: '🌿' },
}

const fmt = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export const PomodoroTimer: React.FC = () => {
  const pomodoro = usePomodoroStore()
  const endSession = useGameStore((s) => s.endSession)
  const restMode = useGameStore((s) => s.state.restMode)
  const inventory = useGameStore((s) => s.state.player.inventory ?? {})
  const timeMilestones = useGameStore((s) =>
    s.state.milestones.filter((m) => m.metric?.kind === 'time' && !m.finalClaimed),
  )

  // 拥有的消耗品（有库存才显示道具行）
  const ownedBuffs = useMemo(
    () =>
      CONSUMABLE_ITEM_IDS.filter((id) => (inventory[id] ?? 0) > 0).map((id) => {
        const item = SHOP_ITEMS.find((i) => i.id === id)!
        return { id, name: item.name, icon: item.icon, count: inventory[id] }
      }),
    [inventory],
  )
  const activeBuff = useMemo(
    () => SHOP_ITEMS.find((i) => i.id === pomodoro.buffItemId) ?? null,
    [pomodoro.buffItemId],
  )

  const [open, setOpen] = useState(false)
  /** 展示用的剩余毫秒（运行中由 tick 驱动） */
  const [displayMs, setDisplayMs] = useState(pomodoro.remainingMs)
  const finishingRef = useRef(false)
  /** 到点后的标签页标题闪烁文案；null = 不闪烁 */
  const [flashMsg, setFlashMsg] = useState<string | null>(null)
  /** 「试一条」的结果反馈；null = 不显示（几秒后自动消失） */
  const [testMsg, setTestMsg] = useState<string | null>(null)

  const { phase, running, endAt, remainingMs, settings } = pomodoro

  // ===== 系统通知开关（localStorage 持久化；权限由用户手势触发申请） =====
  const [notifyOn, setNotifyOn] = useState(() => getNotifyEnabled() && notifyPermission() === 'granted')
  const [notifyPerm, setNotifyPerm] = useState<NotificationPermission>(() => notifyPermission())

  const toggleNotify = async () => {
    if (!notifySupported()) return
    if (!notifyOn) {
      // 开启：需要权限（default → 询问；denied → 提示去浏览器设置）
      const perm = await requestNotifyPermission()
      setNotifyPerm(perm)
      if (perm === 'granted') {
        setNotifyEnabled(true)
        setNotifyOn(true)
      } else {
        setNotifyEnabled(false)
        setNotifyOn(false)
      }
    } else {
      setNotifyEnabled(false)
      setNotifyOn(false)
    }
  }

  /** 强制发一条测试通知（绕过开关与可见性检查），并把每一步结果反馈在面板上 */
  const testNotify = async () => {
    if (!notifySupported()) return
    let perm = notifyPermission()
    if (perm === 'default') perm = await requestNotifyPermission()
    setNotifyPerm(perm)
    if (perm !== 'granted') {
      setTestMsg(
        perm === 'denied'
          ? '❌ 权限被拒：点地址栏左侧 🔒/铃铛 → 通知 → 允许（或浏览器设置的网站通知里允许 localhost），然后刷新页面'
          : '❌ 未授权：浏览器权限弹窗选「允许」；若没弹窗，说明询问被禁用，需到浏览器设置里手动开启',
      )
      return
    }
    const r = sendNotification(
      '🔔 测试通知',
      { body: '收到这条 = 系统通知通道正常，番茄到点时会这样提醒你。' },
      { force: true },
    )
    setTestMsg(
      r === 'sent'
        ? '✅ 已发出（带系统铃声）。没看到？①按 Win+N 查通知中心 ②Win 设置→系统→通知：确认放行了浏览器、关闭勿扰'
        : `⚠ 未发出（${r}）——详见浏览器控制台 [notify] 日志`,
    )
  }

  // 「试一条」反馈几秒后自动消失
  useEffect(() => {
    if (!testMsg) return
    const id = setTimeout(() => setTestMsg(null), 12_000)
    return () => clearTimeout(id)
  }, [testMsg])

  // ===== 标签页标题倒计时（不依赖通知权限，切到其他网页也能瞄到进度） =====
  useEffect(() => {
    const baseTitle = document.title.replace(/^🍅\s?\d+:\d+\s·\s/, '')
    if (!running) {
      document.title = baseTitle
      return
    }
    document.title = `🍅 ${fmt(displayMs)} · ${baseTitle}`
    return () => {
      document.title = baseTitle
    }
  }, [running, displayMs])

  // ===== 到点标题闪烁（无需任何权限；回到页面或开始新一局时自动停止） =====
  useEffect(() => {
    if (!flashMsg || running) return
    // 用户正看着页面（标签可见且窗口有焦点）时无需闪烁，Overlay/音效已接管
    if (document.visibilityState === 'visible' && document.hasFocus()) {
      setFlashMsg(null)
      return
    }
    const baseTitle = document.title
    let on = false
    const swap = () => {
      on = !on
      document.title = on ? flashMsg : baseTitle
    }
    swap()
    const id = setInterval(swap, 1000)
    const stopOnAttention = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        document.title = baseTitle
        setFlashMsg(null)
      }
    }
    document.addEventListener('visibilitychange', stopOnAttention)
    window.addEventListener('focus', stopOnAttention)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', stopOnAttention)
      window.removeEventListener('focus', stopOnAttention)
      document.title = baseTitle
    }
  }, [flashMsg, running])

  const phaseTotalMs = useMemo(
    () => (phase === 'focus' ? settings.focus : phase === 'short' ? settings.short : settings.long) * 60_000,
    [phase, settings],
  )

  // 里程碑关联锁：本局一旦开始投入（运行中 / 暂停中 / 休息期暂存半局），
  // 已投入时间按开局时的关联结算，中途换目标无法把前后时间分开计算，
  // 因此锁定不允许重新关联；新一局开始前仍可自由调整
  const milestoneLocked =
    running || (phase === 'focus' && pomodoro.elapsedMs > 0) || !!pomodoro.savedFocus

  // 开局音效：专注阶段从静止 → 运行的上升沿触发（覆盖按钮/任务榜等所有启动入口）
  const focusRunningRef = useRef(false)
  useEffect(() => {
    const focusRunning = running && phase === 'focus'
    if (focusRunning && !focusRunningRef.current) sfx.start()
    focusRunningRef.current = focusRunning
  }, [running, phase])

  // 音频保活：运行中保持"正在播放音频"状态，豁免浏览器对后台标签页的
  // 定时器节流与休眠（否则后台 5 分钟后 tick 降到 ~1 次/分钟，甚至冻结，
  // 到点提醒会迟到或丢失）。开始按钮的手势同时激活了 AudioContext。
  useEffect(() => {
    if (running) startKeepAlive()
    else stopKeepAlive()
    return stopKeepAlive
  }, [running])

  // 任务榜「为此任务开一局」联动：预填标题/任务 ID 并自动弹出本面板。
  // 消费后立即清空 pendingLaunch（首页 SessionHero 不再收到，避免双消费）
  useEffect(() => {
    const pending = pomodoro.pendingLaunch
    if (!pending) return
    pomodoro.setTaskTitle(pending.title)
    pomodoro.setTaskId(pending.taskId)
    if (!pomodoro.running && pomodoro.phase !== 'focus') {
      pomodoro.setPhase('focus')
    }
    setOpen(true)
    usePomodoroStore.getState().setPendingLaunch(null)
  }, [pomodoro.pendingLaunch]) // eslint-disable-line react-hooks/exhaustive-deps

  // 计时 tick：基于 endAt 时间戳计算，切页回来也准确
  useEffect(() => {
    if (!running) {
      setDisplayMs(remainingMs)
      return
    }
    const tick = () => {
      const left = Math.max(0, (endAt ?? 0) - Date.now())
      setDisplayMs(left)
      if (left <= 0 && !finishingRef.current) {
        finishingRef.current = true
        const s = pomodoro
        const buffItemId = s.buffItemId
        const taskId = s.taskId
        const milestoneIds = s.milestoneIds
        const finishedFocus = s.finishPhase()
        // 标签页标题闪烁：不依赖通知权限，窗口切走/被遮挡时也醒目
        setFlashMsg(finishedFocus ? '✅ 专注完成！' : '☕ 休息结束！')
        // 到点提示音：专注/休息结束都奏（共享 AudioContext，开局手势已激活；
        // 后台标签页音频正常播放，与系统通知铃声形成双保险）
        sfx.chime()
        // ===== 系统通知：用户在其他网页/程序中也能收到提醒 =====
        if (finishedFocus) {
          const t = s.taskTitle.trim() || `${DOMAIN_META[s.activityType].label}一局`
          sendNotification(`🍅 专注完成 · ${t}`, {
            body: `这一局（${settings.focus} 分钟）结束了，回来结算收获吧！`,
            tag: 'levelup-pomodoro',
          })
        } else {
          sendNotification('☕ 休息结束', {
            body: '休息好了，随时开始下一局专注。',
            tag: 'levelup-pomodoro',
          })
        }
        if (finishedFocus) {
          // 一局完成 → 完整结算（XP/金币/属性/效率/升级/成就/消耗品）
          endSession({
            type: s.activityType,
            title: s.taskTitle.trim() || `${DOMAIN_META[s.activityType].label}一局`,
            plannedMinutes: settings.focus,
            startTime: s.focusStartedIso ?? undefined,
            taskId: taskId ?? undefined,
            milestoneIds: milestoneIds.length > 0 ? milestoneIds : undefined,
            buffItemId: buffItemId ?? undefined,
          })
        }
        finishingRef.current = false
      }
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [running, endAt, remainingMs, phase, pomodoro, endSession, settings.focus])

  /** 提前结算：做了多少，就获得多少 */
  const settleEarly = () => {
    const s = pomodoro
    if (s.phase !== 'focus') return
    const buffItemId = s.buffItemId
    const taskId = s.taskId
    const milestoneIds = s.milestoneIds
    const actualMinutes = s.abortFocus()
    // 结算曲由 SessionSettleOverlay 演奏
    endSession({
      type: s.activityType,
      title: s.taskTitle.trim() || `${DOMAIN_META[s.activityType].label}一局`,
      plannedMinutes: settings.focus,
      actualMinutes,
      startTime: s.focusStartedIso ?? undefined,
      taskId: taskId ?? undefined,
      milestoneIds: milestoneIds.length > 0 ? milestoneIds : undefined,
      buffItemId: buffItemId ?? undefined,
    })
    setOpen(false)
  }

  const meta = PHASE_META[phase]
  const progress = phaseTotalMs > 0 ? 1 - displayMs / phaseTotalMs : 0
  // SVG 环形进度
  const R = 52
  const C = 2 * Math.PI * R

  const runningMinutes = running && endAt ? Math.ceil((endAt - Date.now()) / 60000) : 0

  return (
    <>
      {/* 浮动按钮 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-36 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full border-2 text-xl shadow-lg transition-all hover:scale-110 active:scale-95"
        style={{
          borderColor: running ? meta.color : '#8b7355',
          background: running ? `${meta.color}22` : 'rgba(30,25,20,0.9)',
        }}
        title={running ? `番茄钟进行中 · ${fmt(displayMs)}` : '番茄钟 · 随时开始一段专注'}
      >
        🍅
        {running && (
          <span
            className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
            style={{ backgroundColor: meta.color }}
          >
            {runningMinutes > 0 ? runningMinutes : '<1'}
          </span>
        )}
      </button>

      {/* 弹出面板 */}
      {open && (
        <div className="rpg-panel fixed bottom-52 right-5 z-40 w-72 animate-slide-up p-4">
          {/* 阶段切换 */}
          <div className="mb-3 flex gap-1">
            {(Object.keys(PHASE_META) as PomodoroPhase[]).map((p) => (
              <button
                key={p}
                onClick={() => !running && pomodoro.setPhase(p)}
                disabled={running}
                className={`flex-1 rounded-lg border-2 py-1 text-[10px] transition-all disabled:opacity-40 ${
                  phase === p ? 'border-rpg-gold bg-rpg-panelLight text-rpg-gold' : 'border-rpg-border bg-rpg-panel text-gray-400'
                }`}
              >
                {PHASE_META[p].emoji} {PHASE_META[p].label}
                {p === 'focus' ? ` ${settings.focus}` : p === 'short' ? ` ${settings.short}` : ` ${settings.long}`}′
              </button>
            ))}
          </div>

          {/* 环形计时 */}
          <div className="relative mx-auto mb-3 flex h-36 w-36 items-center justify-center">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
              <circle
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={meta.color}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - Math.min(1, Math.max(0, progress)))}
                style={{ transition: 'stroke-dashoffset 0.3s linear' }}
              />
            </svg>
            <div className="text-center">
              <div className="font-rpg text-2xl tabular-nums" style={{ color: meta.color }}>
                {fmt(displayMs)}
              </div>
              <div className="mt-1 flex items-center justify-center gap-1.5">
                <span className="text-sm text-gray-400">今日</span>
                <span
                  className="font-rpg text-xl tabular-nums"
                  style={{ color: meta.color }}
                  title="今日完成的专注局数"
                >
                  🍅{pomodoro.completedFocus}
                </span>
              </div>
            </div>
          </div>

          {/* 专注任务绑定（仅专注阶段且未运行时可编辑） */}
          {phase === 'focus' && (
            <div className="mb-2 space-y-1.5">
              {/* 本次时长：开始前可调（预设 + 微调） */}
              {!running && (
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-gray-500">时长</span>
                  {[15, 25, 45, 60].map((m) => (
                    <button
                      key={m}
                      onClick={() => pomodoro.setSettings({ focus: m })}
                      className={`flex-1 rounded border px-1 py-0.5 text-[10px] transition-all ${
                        settings.focus === m
                          ? 'border-rpg-gold bg-rpg-gold/20 text-rpg-gold'
                          : 'border-rpg-border bg-rpg-panel text-gray-400 hover:text-white'
                      }`}
                    >
                      {m}′
                    </button>
                  ))}
                  <button
                    onClick={() => pomodoro.setSettings({ focus: Math.max(1, settings.focus - 5) })}
                    className="rounded border border-rpg-border bg-rpg-panel px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white"
                    title="减 5 分钟"
                  >
                    −5
                  </button>
                  <button
                    onClick={() => pomodoro.setSettings({ focus: Math.min(180, settings.focus + 5) })}
                    className="rounded border border-rpg-border bg-rpg-panel px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white"
                    title="加 5 分钟"
                  >
                    +5
                  </button>
                </div>
              )}
              <input
                value={pomodoro.taskTitle}
                onChange={(e) => pomodoro.setTaskTitle(e.target.value)}
                disabled={running}
                placeholder="这段时间做什么？（如：写周报）"
                className="w-full rounded-lg border-2 border-rpg-border bg-rpg-bg px-2 py-1 text-[11px] text-gray-200 outline-none focus:border-rpg-gold disabled:opacity-50"
              />
              <select
                value={pomodoro.activityType}
                onChange={(e) => pomodoro.setActivityType(e.target.value as ActivityType)}
                disabled={running}
                className="w-full rounded-lg border-2 border-rpg-border bg-rpg-bg px-2 py-1 text-[11px] text-gray-300 outline-none focus:border-rpg-gold disabled:opacity-50"
              >
                {ACTIVITY_TYPES.filter((t) => t !== 'sleep' && t !== 'mental').map((t) => (
                  <option key={t} value={t}>
                    {DOMAIN_META[t].icon} {DOMAIN_META[t].label}
                  </option>
                ))}
              </select>
              {/* 关联里程碑：本局实际投入计入其进度（可多选） */}
              {timeMilestones.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[9px] text-gray-500">
                    关联里程碑（可多选，结算时计入实际投入{milestoneLocked ? '；本局已开始，锁定不可改' : ''}）
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {timeMilestones.map((m) => {
                      const selected = pomodoro.milestoneIds.includes(m.id)
                      const min = m.limits?.minPerSession
                      const tooShort = !milestoneLocked && min !== undefined && settings.focus < min
                      return (
                        <button
                          key={m.id}
                          onClick={() =>
                            pomodoro.setMilestoneIds(
                              selected
                                ? pomodoro.milestoneIds.filter((x) => x !== m.id)
                                : [...pomodoro.milestoneIds, m.id],
                            )
                          }
                          disabled={milestoneLocked}
                          title={`${((m.linkedMinutes ?? 0) / 60).toFixed(1)}h / ${((m.metric?.target ?? 0) / 60).toFixed(0)}h${
                            min !== undefined ? `（单次≥${min}min 才计入）` : ''
                          }${milestoneLocked ? '；本局进行中，无法把已投入时间分开计算到新目标' : ''}`}
                          className={`flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] transition-all disabled:opacity-50 ${
                            selected
                              ? 'border-rpg-gold bg-rpg-gold/20 text-rpg-gold'
                              : tooShort
                                ? 'border-rpg-border bg-rpg-panel text-gray-600'
                                : 'border-rpg-border bg-rpg-panel text-gray-400 hover:text-white'
                          }`}
                        >
                          <span>⏳</span>
                          <span className="max-w-24 truncate">{m.goal}</span>
                          <span className="opacity-60">{Math.round(m.progress * 100)}%</span>
                          {tooShort && <span title={`本局 ${settings.focus}min 未达单次下限 ${min}min`}>🚫</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {/* 本局道具：开局前选用，结算时消费（与首页配置入口共用同一 buffItemId） */}
              {ownedBuffs.length > 0 &&
                (!running ? (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[9px] text-gray-500">道具</span>
                    {ownedBuffs.map((b) => {
                      const eff = CONSUMABLE_EFFECTS[b.id]
                      const selected = pomodoro.buffItemId === b.id
                      const dimmed = eff.kind === 'deepBonus' && settings.focus < 45
                      return (
                        <button
                          key={b.id}
                          onClick={() => pomodoro.setBuff(selected ? null : b.id)}
                          title={eff.detail}
                          className={`flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] transition-all ${
                            selected
                              ? 'border-rpg-gold bg-rpg-gold/20 text-rpg-gold'
                              : dimmed
                                ? 'border-rpg-border bg-rpg-panel text-gray-600'
                                : 'border-rpg-border bg-rpg-panel text-gray-400 hover:text-white'
                          }`}
                        >
                          {b.icon} {b.name}
                          <span className="opacity-60">×{b.count}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  activeBuff && (
                    <div className="flex items-center justify-center gap-1 rounded border border-rpg-gold/60 bg-rpg-gold/15 px-1.5 py-0.5 text-[9px] text-rpg-gold">
                      {activeBuff.icon} {activeBuff.name} 生效中
                    </div>
                  )
                ))}
            </div>
          )}

          {/* 控制按钮 */}
          <div className="flex gap-1.5">
            <button
              onClick={() => (running ? pomodoro.pause() : pomodoro.start())}
              className="rpg-btn-primary flex-1 px-2 py-1.5 text-xs"
              style={running ? undefined : { borderColor: meta.color, color: meta.color }}
            >
              {running ? '⏸ 暂停' : phase === 'focus' ? '▶ 开始专注' : '▶ 开始休息'}
            </button>
            {phase === 'focus' && (pomodoro.elapsedMs > 0 || running) && (
              <button
                onClick={settleEarly}
                className="rpg-btn px-2.5 py-1.5 text-xs text-rpg-gold"
                title="提前结束这一局，做了多少就获得多少"
              >
                ✓ 结算
              </button>
            )}
            <button onClick={pomodoro.reset} className="rpg-btn px-2.5 py-1.5 text-xs" title="重置当前阶段">
              ↺
            </button>
            <button onClick={pomodoro.skip} className="rpg-btn px-2.5 py-1.5 text-xs" title="跳到下一阶段">
              ⏭
            </button>
          </div>

          {restMode && (
            <div className="mt-2 text-center text-[9px] text-rpg-xp">
              休息模式：番茄仍可用，但记不记活动都由你决定 🌙
            </div>
          )}

          {/* 系统通知开关（到点时在其他网页/程序中提醒） */}
          {notifySupported() && (
            <div className="mt-2 flex items-center justify-between rounded-lg border border-rpg-border bg-rpg-panelLight/40 px-2 py-1.5">
              <span className="text-[10px] text-gray-400">🔔 到点系统通知</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={testNotify}
                  className="rounded border border-rpg-border bg-rpg-panel px-2 py-0.5 text-[9px] text-gray-400 transition-all hover:text-white"
                  title="发一条测试通知，验证浏览器/系统通知是否正常"
                >
                  试一条
                </button>
                <button
                  onClick={toggleNotify}
                  className={`rounded border px-2 py-0.5 text-[9px] transition-all ${
                    notifyOn
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                      : 'border-rpg-border bg-rpg-panel text-gray-400 hover:text-white'
                  }`}
                >
                  {notifyOn ? '已开启' : '开启'}
                </button>
              </div>
            </div>
          )}
          {testMsg && (
            <div className="mt-1 rounded-lg border border-rpg-border bg-rpg-panelLight/40 px-2 py-1.5 text-[9px] leading-relaxed text-gray-400">
              {testMsg}
            </div>
          )}
          {!notifyOn && notifySupported() && notifyPerm === 'denied' && (
            <div className="mt-1 text-center text-[9px] text-gray-500">
              通知权限已被浏览器拒绝，请在地址栏权限设置中允许后刷新
            </div>
          )}
          {notifyOn && (
            <div className="mt-1 text-center text-[9px] text-gray-600" title="Windows 设置 → 系统 → 通知中需允许浏览器通知">
              收不到通知时：检查 Windows「专注助手/勿扰」与系统通知设置中是否放行了浏览器
            </div>
          )}
        </div>
      )}
    </>
  )
}

/**
 * 局计时状态（v1.0「人生增量游戏」核心循环，原番茄钟升级而来）
 *
 * 专注阶段 = 一局；休息阶段保留（局间恢复）。
 * 计时基于时间戳，切页/刷新不丢失；运行态存 localStorage。
 * 支持提前结束一局：做了多少，就获得多少，无惩罚。
 */

import { create } from 'zustand'
import type { ActivityType } from '../types'

export type PomodoroPhase = 'focus' | 'short' | 'long'

export interface PomodoroSettings {
  /** 专注时长（分钟）= 一局的计划时长 */
  focus: number
  /** 短休息（分钟） */
  short: number
  /** 长休息（分钟） */
  long: number
  /** 每 N 个专注后长休息 */
  longBreakEvery: number
}

interface PomodoroState {
  phase: PomodoroPhase
  running: boolean
  /** 运行中的目标结束时间戳（ms）；暂停时为 null，用 remainingMs */
  endAt: number | null
  /** 剩余毫秒（暂停时定格） */
  remainingMs: number
  /** 今日完成专注数（用于长休节奏与统计） */
  completedFocus: number
  /** completedFocus 归属日期（跨天清零） */
  completedDate: string
  /** 本次专注对应的任务名 */
  taskTitle: string
  /** 本次专注记录到的活动类型 */
  activityType: ActivityType
  settings: PomodoroSettings
  /** 本次专注已累积的有效毫秒（暂停不计），用于提前结算实际投入 */
  elapsedMs: number
  /** 最近一次恢复运行的时间戳；暂停时为 null */
  resumedAt: number | null
  /** 本局开始时间（ISO）；暂停恢复不覆盖 */
  focusStartedIso: string | null
  /** 本局使用的消耗品 id（结算时消费；null = 不用） */
  buffItemId: string | null
  /** 本局关联的任务榜节点 uid（Phase 5 联动；null = 自由局） */
  taskId: string | null
  /** 本局关联的 time 型里程碑 id 列表（结算时把实际投入分钟计入各目标进度；空 = 不关联） */
  milestoneIds: string[]
  /**
   * 暂停中的半局进度快照：暂停专注后切到休息阶段时暂存，
   * 切回专注时恢复（否则 setPhase 会清零半局投入）。
   */
  savedFocus: { remainingMs: number; elapsedMs: number; focusStartedIso: string | null } | null
  /**
   * 任务榜「为此任务开一局」的待处理跳转（跨页面传递，不持久化）。
   * SessionHero 消费后自动打开配置面板并预填标题。
   */
  pendingLaunch: { taskId: string; title: string } | null

  start: () => void
  pause: () => void
  reset: () => void
  /** 跳过当前阶段（专注阶段跳过不记活动） */
  skip: () => void
  /** 阶段自然结束（返回是否完成了专注阶段） */
  finishPhase: () => boolean
  /**
   * 提前结束一局：返回实际投入分钟数并重置回专注待开始。
   * 调用方负责用返回值结算（做了多少，就获得多少）。
   */
  abortFocus: () => number
  setPhase: (p: PomodoroPhase) => void
  setTaskTitle: (t: string) => void
  setActivityType: (t: ActivityType) => void
  setSettings: (s: Partial<PomodoroSettings>) => void
  /** 设置/取消本局消耗品 */
  setBuff: (itemId: string | null) => void
  /** 设置/清除本局关联的任务榜节点 */
  setTaskId: (id: string | null) => void
  /** 设置本局关联的 time 型里程碑列表（整体覆盖） */
  setMilestoneIds: (ids: string[]) => void
  /** 设置/清除任务榜跳转（SessionHero 消费后清除） */
  setPendingLaunch: (p: { taskId: string; title: string } | null) => void
}

const DEFAULT_SETTINGS: PomodoroSettings = {
  focus: 25,
  short: 5,
  long: 15,
  longBreakEvery: 4,
}

const STORAGE_KEY = 'pomodoro-runtime'

const todayKey = () => new Date().toISOString().slice(0, 10)

const phaseMs = (p: PomodoroPhase, s: PomodoroSettings) =>
  (p === 'focus' ? s.focus : p === 'short' ? s.short : s.long) * 60 * 1000

/** 旧版持久化的单值 milestoneId → 数组（无旧值返回 null） */
const legacyMilestoneId = (data: object): string[] | null => {
  const id = (data as Record<string, unknown>).milestoneId
  return typeof id === 'string' && id ? [id] : null
}

/** 从 localStorage 恢复运行态 */
const restore = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<PomodoroState>
    return {
      phase: data.phase ?? 'focus',
      running: data.running ?? false,
      endAt: data.endAt ?? null,
      remainingMs: data.remainingMs ?? phaseMs('focus', DEFAULT_SETTINGS),
      completedFocus: data.completedDate === todayKey() ? data.completedFocus ?? 0 : 0,
      completedDate: todayKey(),
      taskTitle: data.taskTitle ?? '',
      activityType: data.activityType ?? 'work',
      settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
      elapsedMs: data.elapsedMs ?? 0,
      resumedAt: data.resumedAt ?? null,
      focusStartedIso: data.focusStartedIso ?? null,
      buffItemId: data.buffItemId ?? null,
      taskId: data.taskId ?? null,
      // 新版存数组；旧版单值（string | null）折叠为数组兼容
      milestoneIds: data.milestoneIds ?? (legacyMilestoneId(data) ?? []),
      savedFocus: data.savedFocus ?? null,
    }
  } catch {
    return null
  }
}

const saveRuntime = (s: PomodoroState) => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        phase: s.phase,
        running: s.running,
        endAt: s.endAt,
        remainingMs: s.remainingMs,
        completedFocus: s.completedFocus,
        completedDate: s.completedDate,
        taskTitle: s.taskTitle,
        activityType: s.activityType,
        settings: s.settings,
        elapsedMs: s.elapsedMs,
        resumedAt: s.resumedAt,
        focusStartedIso: s.focusStartedIso,
        buffItemId: s.buffItemId,
        taskId: s.taskId,
        milestoneIds: s.milestoneIds,
        savedFocus: s.savedFocus,
      }),
    )
  } catch {
    /* ignore */
  }
}

export const usePomodoroStore = create<PomodoroState>((set, get) => {
  const init = restore()
  const persistState = () => saveRuntime(get())

  return {
    phase: init?.phase ?? 'focus',
    running: init?.running ?? false,
    endAt: init?.endAt ?? null,
    remainingMs: init?.remainingMs ?? phaseMs('focus', DEFAULT_SETTINGS),
    completedFocus: init?.completedFocus ?? 0,
    completedDate: todayKey(),
    taskTitle: init?.taskTitle ?? '',
    activityType: init?.activityType ?? 'work',
    settings: init?.settings ?? DEFAULT_SETTINGS,
    elapsedMs: init?.elapsedMs ?? 0,
    resumedAt: init?.resumedAt ?? null,
    focusStartedIso: init?.focusStartedIso ?? null,
    buffItemId: init?.buffItemId ?? null,
    taskId: init?.taskId ?? null,
    milestoneIds: init?.milestoneIds ?? [],
    savedFocus: init?.savedFocus ?? null,
    pendingLaunch: null,

    start: () => {
      const s = get()
      // 已在运行中不重复启动
      if (s.running && s.endAt) return
      // 新一局开始（未累积过时间）时记录开始时刻
      const startedIso =
        s.phase === 'focus' && s.elapsedMs === 0 ? new Date().toISOString() : s.focusStartedIso
      set({ running: true, endAt: Date.now() + s.remainingMs, resumedAt: Date.now(), focusStartedIso: startedIso })
      persistState()
    },

    pause: () => {
      const s = get()
      if (!s.running) return
      const remaining = Math.max(0, (s.endAt ?? Date.now()) - Date.now())
      // 累积有效投入（仅专注阶段计入局时间）
      const elapsed =
        s.phase === 'focus' && s.resumedAt
          ? s.elapsedMs + (Date.now() - s.resumedAt)
          : s.elapsedMs
      set({ running: false, endAt: null, remainingMs: remaining, elapsedMs: elapsed, resumedAt: null })
      persistState()
    },

    reset: () => {
      const s = get()
      set({
        running: false,
        endAt: null,
        remainingMs: phaseMs(s.phase, s.settings),
        elapsedMs: 0,
        resumedAt: null,
        focusStartedIso: null,
        savedFocus: null,
      })
      persistState()
    },

    skip: () => {
      const s = get()
      // 专注跳过 → 不计入完成数，直接进休息（半局作废，快照一并清除）；休息跳过 → 回专注
      if (s.phase === 'focus') {
        const next: PomodoroPhase =
          (s.completedFocus + 1) % s.settings.longBreakEvery === 0 ? 'long' : 'short'
        set({
          phase: next,
          running: false,
          endAt: null,
          remainingMs: phaseMs(next, s.settings),
          elapsedMs: 0,
          resumedAt: null,
          focusStartedIso: null,
          savedFocus: null,
        })
      } else if (s.savedFocus) {
        // 休息跳过 → 回专注；有暂存的半局则恢复继续
        set({
          phase: 'focus',
          running: false,
          endAt: null,
          remainingMs: s.savedFocus.remainingMs,
          elapsedMs: s.savedFocus.elapsedMs,
          resumedAt: null,
          focusStartedIso: s.savedFocus.focusStartedIso,
          savedFocus: null,
        })
      } else {
        set({
          phase: 'focus',
          running: false,
          endAt: null,
          remainingMs: phaseMs('focus', s.settings),
          elapsedMs: 0,
          resumedAt: null,
          focusStartedIso: null,
        })
      }
      persistState()
    },

    finishPhase: () => {
      const s = get()
      if (s.phase === 'focus') {
        const completedFocus = s.completedFocus + 1
        const next: PomodoroPhase =
          completedFocus % s.settings.longBreakEvery === 0 ? 'long' : 'short'
        set({
          completedFocus,
          phase: next,
          running: false,
          endAt: null,
          remainingMs: phaseMs(next, s.settings),
          completedDate: todayKey(),
          elapsedMs: 0,
          resumedAt: null,
          focusStartedIso: null,
          buffItemId: null,
          taskId: null,
          milestoneIds: [],
          savedFocus: null,
        })
        persistState()
        return true
      }
      // 休息结束 → 回专注；有暂存的半局则恢复继续（清空字段已在暂存时处理）
      if (s.savedFocus) {
        set({
          phase: 'focus',
          running: false,
          endAt: null,
          remainingMs: s.savedFocus.remainingMs,
          elapsedMs: s.savedFocus.elapsedMs,
          resumedAt: null,
          focusStartedIso: s.savedFocus.focusStartedIso,
          savedFocus: null,
        })
      } else {
        set({
          phase: 'focus',
          running: false,
          endAt: null,
          remainingMs: phaseMs('focus', s.settings),
          elapsedMs: 0,
          resumedAt: null,
          focusStartedIso: null,
        })
      }
      persistState()
      return false
    },

    abortFocus: () => {
      const s = get()
      // 实际有效投入 = 已累积 + 本段运行（若在运行）
      const total =
        s.elapsedMs + (s.running && s.resumedAt ? Date.now() - s.resumedAt : 0)
      // 重置回专注待开始（不计入 completedFocus；半局快照一并作废）
      set({
        phase: 'focus',
        running: false,
        endAt: null,
        remainingMs: phaseMs('focus', s.settings),
        elapsedMs: 0,
        resumedAt: null,
        focusStartedIso: null,
        buffItemId: null,
        taskId: null,
        milestoneIds: [],
        savedFocus: null,
      })
      persistState()
      return Math.max(1, Math.round(total / 60000))
    },

    setPhase: (p) => {
      const s = get()
      // 暂停的半局切去休息 → 暂存进度，切回专注时恢复（不丢已投入时间）
      if (s.phase === 'focus' && p !== 'focus' && !s.running && s.elapsedMs > 0) {
        set({
          phase: p,
          running: false,
          endAt: null,
          remainingMs: phaseMs(p, s.settings),
          elapsedMs: 0,
          resumedAt: null,
          focusStartedIso: null,
          savedFocus: {
            remainingMs: s.remainingMs,
            elapsedMs: s.elapsedMs,
            focusStartedIso: s.focusStartedIso,
          },
        })
        persistState()
        return
      }
      // 从休息切回专注且有暂存的半局 → 恢复进度继续
      if (p === 'focus' && s.phase !== 'focus' && s.savedFocus) {
        set({
          phase: 'focus',
          running: false,
          endAt: null,
          remainingMs: s.savedFocus.remainingMs,
          elapsedMs: s.savedFocus.elapsedMs,
          resumedAt: null,
          focusStartedIso: s.savedFocus.focusStartedIso,
          savedFocus: null,
        })
        persistState()
        return
      }
      set({
        phase: p,
        running: false,
        endAt: null,
        remainingMs: phaseMs(p, s.settings),
        elapsedMs: 0,
        resumedAt: null,
        focusStartedIso: null,
      })
      persistState()
    },

    setTaskTitle: (t) => {
      set({ taskTitle: t })
      persistState()
    },

    setBuff: (itemId) => {
      set({ buffItemId: itemId })
      persistState()
    },

    setTaskId: (id) => {
      set({ taskId: id })
      persistState()
    },

    setMilestoneIds: (ids) => {
      set({ milestoneIds: ids })
      persistState()
    },

    setPendingLaunch: (p) => {
      set({ pendingLaunch: p })
    },

    setActivityType: (t) => {
      set({ activityType: t })
      persistState()
    },

    setSettings: (patch) => {
      const s = get()
      const settings = { ...s.settings, ...patch }
      // 未运行时调整时长立即反映到剩余时间
      const remaining = s.running ? s.remainingMs : phaseMs(s.phase, settings)
      set({ settings, remainingMs: remaining, endAt: s.running ? s.endAt : null })
      persistState()
    },
  }
})

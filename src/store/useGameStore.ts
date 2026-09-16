/**
 * 游戏核心 Store（已按域拆分，本文件仅保留：create 入口、持久化、活动/局结算、init）
 *
 * 拆分结构：
 * - stateDefaults.ts   默认状态 + 导入深合并
 * - types.ts           GameStore 接口 + 反馈类型
 * - activityEngine.ts  addActivity/endSession 核心纯逻辑
 * - grantLevelUnlocks  等级奖励发放
 * - gameSlices.ts      商店/宝箱/技能/体重/心情/里程碑/称号/重置/导入
 * - aiSlices.ts        AI 记忆/聊天/建议/情绪/模式/认知
 * - mindMapSlices.ts   任务榜 CRUD
 *
 * 对外 API（useGameStore 导出）与拆分前完全一致，调用方零改动。
 */
import { create } from 'zustand'
import type { Achievement, AppState, BossState } from '../types'
import { evaluateAchievements, ACHIEVEMENT_DEFS } from '../engine/achievements'
import { applyXp } from '../engine/levelSystem'
import { todayKey } from '../engine/xpCalculator'
import { SESSION_COINS_PER_XP, XP_CONFIG } from '../config/xpConfig'
import { rollChest, injectChestExclusives } from '../config/chestConfig'
import {
  computeEfficiency,
  estimateSessionGain,
  sessionAttributeGains,
} from '../engine/sessionEngine'
import { CONSUMABLE_EFFECTS } from '../config/shopItems'
import { computeThemeBonus } from '../config/outfitThemes'
import { syncMilestones, addLinkedMinutes } from '../engine/milestoneEngine'
import {
  applyBossDamage,
  applyExtraBossDamage,
  bossKillRewards,
  createExtraBoss,
  extraBossKillRewards,
  modifierBonusLabel,
  rolloverBossIfNeeded,
} from '../engine/bossEngine'
import { rolloverQuestsIfNeeded, questProgress } from '../engine/questEngine'
import { BOSS_ROSTER, bossForStage } from '../config/bossConfig'
import { loadState, saveState } from '../lib/idb'
import { writeToBoundFile } from '../lib/fileStorage'
import { backupToServer, fetchServerBackup } from '../lib/serverBackup'
import { defaultState, mergeImportedState } from './stateDefaults'
import { grantLevelUnlocks, levelUnlockIdsUpTo } from './grantLevelUnlocks'
import { applyActivity, computeSessionBuff, ACHIEVEMENT_REWARDS } from './activityEngine'
import { createGameSlices } from './gameSlices'
import { createAiSlices } from './aiSlices'
import { createMindMapSlices } from './mindMapSlices'
import type { GameStore, SessionFeedback } from './types'
import type { StoreCtx } from './storeCtx'

// 宝箱专属背景注入商店列表（背包/开箱遍历 SHOP_ITEMS 自动生效；商店页过滤展示）
injectChestExclusives()

/** 成就奖励查找表（供 evalWithRewards 使用） */
const ACH_REWARDS = ACHIEVEMENT_REWARDS

/** debounced 持久化：短时间内的多次状态变更合并为一次写入，避免并发 IndexedDB 写入竞态 */
let pendingState: AppState | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null

const persist = (state: AppState) => {
  pendingState = state
  if (persistTimer) return
  persistTimer = setTimeout(async () => {
    persistTimer = null
    const s = pendingState
    if (!s) return
    pendingState = null
    try {
      await saveState(s)
    } catch (e) {
      console.error('persist failed', e)
    }
    try {
      await writeToBoundFile(s)
    } catch (e) {
      console.error('file persist failed', e)
    }
    backupToServer(s)
  }, 200)
}

/** 立即刷新挂起的写入（用于 reset/import 等关键路径；传入 state 时直接覆盖队列） */
const flushPersist = async (state?: AppState) => {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  const s = state ?? pendingState
  pendingState = null
  if (!s) return
  try {
    await saveState(s)
  } catch (e) {
    console.error('flush persist failed', e)
  }
  try {
    await writeToBoundFile(s)
  } catch (e) {
    console.error('flush file persist failed', e)
  }
  backupToServer(s)
}

/** init 防重入：进行中的加载 promise（StrictMode 双调用/重试连点复用） */
let initPromise: Promise<void> | null = null

export const useGameStore = create<GameStore>((set, get) => {
  const update = (mutator: (s: AppState) => AppState) => {
    let next = mutator(get().state)
    // BOSS 周挑战：惰性周刷新（跨 ISO 周归档旧届 + 生成新届）
    next = rolloverBossIfNeeded(next).state
    // 周委托：与 BOSS 同步惰性刷新（跨周重新生成 3 个）
    next = rolloverQuestsIfNeeded(next)
    // 里程碑引擎：进度由真实数据驱动，每次状态变更后统一同步
    // （跨过 25/50/75% 检查点即发奖励；100% 只登记完成，待手动领取）
    const res = syncMilestones(next)
    next = res.state
    set({ state: next })
    if (res.stageGrants.length > 0 || res.completed.length > 0) {
      set({
        pendingMilestoneEvents: [...(get().pendingMilestoneEvents ?? []), ...res.stageGrants, ...res.completed.map((c) => ({ ...c, stage: 100, xp: 0, coins: 0 }))]
      })
    }
    void persist(next)
  }

  /** 评估成就并发放奖励（任务榜等非活动入口复用），返回更新后的 state 与新解锁列表 */
  const evalWithRewards = (base: AppState): { state: AppState; newly: Achievement[] } => {
    const ach = evaluateAchievements(base)
    if (ach.newly.length === 0) {
      return { state: { ...base, achievements: ach.list }, newly: [] }
    }
    let insightXp = 0
    let achXp = 0
    let achCoins = 0
    let newTitles: string[] = []
    for (const a of ach.newly) {
      const r = ACH_REWARDS.get(a.id)
      if (!r) continue
      if (a.isCognitive) insightXp += r.insightXp
      achXp += r.xpReward
      achCoins += r.coinReward
      // 成就自带称号（如「衣橱的主人」）
      const def = ACHIEVEMENT_DEFS.find((d) => d.id === a.id)
      if (def?.grantTitle && !base.player.titles.includes(def.grantTitle)) {
        newTitles.push(def.grantTitle)
      }
    }
    const totalXp = insightXp + achXp
    let player = base.player
    if (totalXp > 0) {
      const { player: p2 } = applyXp(player, totalXp)
      player = { ...p2, attributes: player.attributes, coins: p2.coins + achCoins }
    } else if (achCoins > 0) {
      player = { ...player, coins: player.coins + achCoins }
    }
    if (newTitles.length > 0) {
      player = { ...player, titles: [...player.titles, ...newTitles] }
    }
    return { state: { ...base, player, achievements: ach.list }, newly: ach.newly }
  }

  const ctx: StoreCtx = { set, get, update, persist, flushPersist, evalWithRewards }

  return {
    state: defaultState(),
    loaded: false,
    loadError: null,
    pendingFeedback: null,
    pendingLevelUp: null,
    pendingAchievements: null,
    pendingSessionFeedback: null,
    pendingChests: null,
    pendingMilestoneEvents: null,
    clearPendingMilestoneEvents: () => set({ pendingMilestoneEvents: null }),
    pendingBossEvents: null,
    heldBossEvents: [],
    setPendingBossEvents: (v) => set({ pendingBossEvents: v }),
    clearPendingBossEvents: () => set({ pendingBossEvents: null }),
    clearPendingAchievements: () => set({ pendingAchievements: null }),
    setPendingAchievements: (v) => set({ pendingAchievements: v }),
    // 关闭当前结算时自动释放队列中的下一个（连续补录/离线连发依次播放）
    clearSessionFeedback: () => {
      set({ pendingSessionFeedback: null })
      get().releaseHeldSessionFeedback()
    },
    heldSessionFeedback: [],
    releaseHeldSessionFeedback: () => {
      // 先并入押后的 BOSS 事件：BossVictoryOverlay 自身会在结算面板关闭后才播放，
      // 因此先释放不影响「先经验结算、后 BOSS 动画」的顺序
      const heldBoss = get().heldBossEvents
      if (heldBoss.length > 0) {
        set((s) => ({
          heldBossEvents: [],
          pendingBossEvents: [...(s.pendingBossEvents ?? []), ...heldBoss],
        }))
      }
      // 弹出最早的押后反馈；已有面板在展示时继续等（保持一次一个的节奏）
      const held = get().heldSessionFeedback
      if (held.length === 0 || get().pendingSessionFeedback) return
      set({ heldSessionFeedback: held.slice(1), pendingSessionFeedback: held[0] })
    },
    setPendingSessionFeedback: (v) => set({ pendingSessionFeedback: v }),
    setPendingLevelUp: (v) => set({ pendingLevelUp: v }),
    setPendingFeedback: (v) => set({ pendingFeedback: v }),
    setPendingMilestoneEvents: (v) => set({ pendingMilestoneEvents: v }),
    clearChests: () => set({ pendingChests: null }),
    setPendingChests: (v) => set({ pendingChests: v }),

    // ===== 域 slices =====
    ...createGameSlices(ctx),
    ...createAiSlices(ctx),
    ...createMindMapSlices(ctx),

    init: async () => {
      // 防重入：StrictMode（dev）下 effect 双调用 / 错误页重试连点时，
      // 复用同一次加载——否则第二次 init 会从持久层读回旧数据，
      // 覆盖第一次已执行的迁移结果（如道具收回被"复活"）
      if (initPromise) return initPromise
      initPromise = (async () => {
        try {
        // 双源：dev server 磁盘备份（saves/latest.json）为主，IndexedDB 兜底。
        // 页面本身由 dev server 提供，因此服务器读是确定性的——不受 IDB
        // LevelDB 恢复延迟、绑定文件句柄过期影响（曾导致重开浏览器瞬间读到空档）。
        // 防回退护栏：persist 双写中服务器 POST 可能偶发失败（vite 重启窗口、
        // 静态预览期间只有 IDB 在更新），此时 IDB 比 latest.json 新，不能回退旧档。
        const [srvState, idbState] = await Promise.all([
          fetchServerBackup(),
          loadState().catch((e) => {
            console.warn('IDB load failed, fallback to server backup', e)
            return null
          }),
        ])
        const score = (s: AppState): [number, number] => [
          s.player.totalXp ?? 0,
          (s.sessions ?? []).length,
        ]
        let loaded: AppState | null
        if (srvState?.player && idbState?.player) {
          // 两源都在：IDB 严格更新才选 IDB，否则服务器备份胜出（含平局）
          const [sx, ss] = score(srvState)
          const [ix, ic] = score(idbState)
          loaded = ix > sx || (ix === sx && ic > ss) ? idbState : srvState
        } else {
          loaded = srvState?.player ? srvState : idbState?.player ? idbState : null
        }
        if (loaded) {
          // 深合并：补齐嵌套字段缺失，防止旧存档字段不全导致运行时 undefined
          const merged = mergeImportedState(loaded)
          // 补发 ≤ 当前等级的历史等级奖励（奖励表更新/存档迁移时存量玩家不亏）
          const player = grantLevelUnlocks(merged.player, levelUnlockIdsUpTo(merged.player.level))
          // BOSS 周挑战：旧档迁移（无 bossState 创建第 1 届）+ 惰性跨周刷新
          const granted = rolloverQuestsIfNeeded(rolloverBossIfNeeded({ ...merged, player }).state)
          set({ state: granted, loaded: true, loadError: null })
          // 合并/迁移/补发后的状态回写持久层（否则迁移结果只在内存，
          // 下次刷新读回旧数据会复活已收回的道具）
          void persist(granted)
          // 胜者来自服务器备份时，立即回写 IndexedDB 保持两源一致
          if (loaded === srvState) void saveState(granted)
        } else {
          // 全新存档：无持久化数据，defaultState 起步（含 BOSS/委托首建）
          set({ state: rolloverQuestsIfNeeded(rolloverBossIfNeeded(defaultState()).state), loaded: true, loadError: null })
        }
      } catch (e) {
        // 加载失败：仍标记 loaded=true 走出 LOADING 态，但展示错误页供用户重试
        console.error('init failed', e)
        const msg = e instanceof Error ? e.message : String(e)
        set({ loaded: true, loadError: `存档加载失败：${msg}` })
      }
      })()
      return initPromise
    },

    clearLoadError: () => {
      // 允许重试：清掉 inflight 标记，下一次 init 重新加载
      initPromise = null
      set({ loadError: null, loaded: false })
    },

    addActivity: (input) => {
      const st = get().state
      const { state: appliedRaw, feedback } = applyActivity(st, input)
      let applied = appliedRaw
      // ===== BOSS 伤害：周 BOSS 存活 → 打周 BOSS；已击杀且有追加 BOSS → 打追加 BOSS（限制规则结算） =====
      let bossEvent: import('./types').BossEvent | null = null
      if (input.session && applied.bossState) {
        const damageBase = input.session.baseXp ?? feedback.xp
        // 时段限制按局的「发生时间」判定（补录 = 运动发生时刻；番茄钟 = 专注开始时刻）
        const occurredAt = input.session.startTime
          ? new Date(input.session.startTime)
          : undefined
        const bs0 = applied.bossState
        if (!bs0.killedAt) {
          // --- 周 BOSS（伤害受本届随机限制规则约束） ---
          const dmg = applyBossDamage(applied, damageBase, {
            type: input.type,
            minutes: input.session.actualMinutes,
            now: occurredAt,
          })
          applied = dmg.state
          // 实际伤害写回本局记录（BossPage 战况列表展示）
          if (dmg.damage > 0) {
            applied = {
              ...applied,
              sessions: (applied.sessions ?? []).map((s) =>
                s.id === input.session!.sessionId ? { ...s, bossDamage: dmg.damage } : s,
              ),
            }
          }
          // applyBossDamage 输入含 bossState，输出必含（TS 收窄在再赋值后丢失）
          const bs: BossState = dmg.state.bossState!
          const bossDef = BOSS_ROSTER.find((b) => b.id === bs.bossId) ?? bossForStage(bs.stage)
          if (dmg.killed && !bs.rewardClaimed) {
            // 击杀结算：金币 + 必掉紫档以上背景/服饰（与宝箱保底独立）；金币乘高压契约加成
            const rewards = bossKillRewards(bs.stage, applied.player.unlockedItems, bs.modifiers)
            const lootCoins = rewards.loot?.convertedCoins ?? 0
            let player = {
              ...applied.player,
              coins: applied.player.coins + rewards.coins + lootCoins,
            }
            // 非重复掉落直接解锁（与宝箱/等级奖励同口径）
            if (rewards.loot && !rewards.loot.convertedCoins) {
              player = { ...player, unlockedItems: [...player.unlockedItems, rewards.loot.item.id] }
            }
            applied = { ...applied, player, bossState: { ...bs, rewardClaimed: true } }
            // 获得服饰/背景后评估收集成就（与购买/开箱同口径）
            const ev = evalWithRewards(applied)
            applied = ev.state
            bossEvent = {
              bossId: bs.bossId,
              name: bossDef.name,
              stage: bs.stage,
              damage: dmg.damage,
              hpAfter: 0,
              killed: true,
              coins: rewards.coins + lootCoins,
              ...(rewards.loot
                ? {
                    loot: {
                      name: rewards.loot.item.name,
                      icon: rewards.loot.item.icon,
                      rarity: rewards.loot.rarity,
                      ...(rewards.loot.convertedCoins
                        ? { convertedCoins: rewards.loot.convertedCoins }
                        : {}),
                    },
                  }
                : {}),
              // 高压契约加成说明（有限制规则时金币上浮的依据）
              ...(modifierBonusLabel(bs.modifiers)
                ? { notes: [modifierBonusLabel(bs.modifiers)!] }
                : {}),
            }
          } else if (dmg.damage > 0 || dmg.notes.length > 0) {
            // 伤害被限制规则削减/归零也出战报：让玩家看清规则为何生效
            bossEvent = {
              bossId: bs.bossId,
              name: bossDef.name,
              stage: bs.stage,
              damage: dmg.damage,
              hpAfter: bs.hp,
              killed: false,
              coins: 0,
              ...(dmg.notes.length > 0 ? { notes: dmg.notes } : {}),
            }
          }
        } else if (bs0.extra && !bs0.extra.killedAt) {
          // --- 追加讨伐 BOSS（伤害受随机限制规则约束） ---
          const exd = applyExtraBossDamage(applied, damageBase, {
            type: input.type,
            minutes: input.session.actualMinutes,
            now: occurredAt,
          })
          applied = exd.state
          if (exd.damage > 0) {
            applied = {
              ...applied,
              sessions: (applied.sessions ?? []).map((s) =>
                s.id === input.session!.sessionId ? { ...s, bossDamage: exd.damage } : s,
              ),
            }
          }
          const ex = exd.state.bossState!.extra!
          const exDef = BOSS_ROSTER.find((b) => b.id === ex.bossId) ?? bossForStage(bs0.stage)
          if (exd.killed && !ex.rewardClaimed) {
            // 追加击杀结算：金币（周 BOSS 的 60% × 高压契约加成）+ 35% 掉落（无保底，可反复刷）
            const rewards = extraBossKillRewards(bs0.stage, applied.player.unlockedItems, ex.modifiers)
            const lootCoins = rewards.loot?.convertedCoins ?? 0
            let player = {
              ...applied.player,
              coins: applied.player.coins + rewards.coins + lootCoins,
            }
            if (rewards.loot && !rewards.loot.convertedCoins) {
              player = { ...player, unlockedItems: [...player.unlockedItems, rewards.loot.item.id] }
            }
            const bsKilled = exd.state.bossState!
            applied = {
              ...applied,
              player,
              bossState: { ...bsKilled, extra: { ...ex, rewardClaimed: true } },
            }
            const ev = evalWithRewards(applied)
            applied = ev.state
            bossEvent = {
              bossId: ex.bossId,
              name: exDef.name,
              stage: bs0.stage,
              damage: exd.damage,
              hpAfter: 0,
              killed: true,
              coins: rewards.coins + lootCoins,
              extra: true,
              maxHp: ex.maxHp,
              ...(exd.notes.length > 0 || modifierBonusLabel(ex.modifiers)
                ? {
                    notes: [
                      ...(exd.notes ?? []),
                      ...(modifierBonusLabel(ex.modifiers) ? [modifierBonusLabel(ex.modifiers)!] : []),
                    ],
                  }
                : {}),
              ...(rewards.loot
                ? {
                    loot: {
                      name: rewards.loot.item.name,
                      icon: rewards.loot.item.icon,
                      rarity: rewards.loot.rarity,
                      ...(rewards.loot.convertedCoins
                        ? { convertedCoins: rewards.loot.convertedCoins }
                        : {}),
                    },
                  }
                : {}),
            }
          } else if (exd.damage > 0 || exd.notes.length > 0) {
            // 伤害被限制削减/归零也出战报：让玩家看清规则为何生效
            bossEvent = {
              bossId: ex.bossId,
              name: exDef.name,
              stage: bs0.stage,
              damage: exd.damage,
              hpAfter: ex.hp,
              killed: false,
              coins: 0,
              extra: true,
              maxHp: ex.maxHp,
              ...(exd.notes.length > 0 ? { notes: exd.notes } : {}),
            }
          }
        }
      }
      // time 型里程碑：关联的行动/局时长计入投入（多个目标各自应用单次限制）
      const link =
        input.milestoneIds && input.milestoneIds.length > 0 && (input.durationMinutes ?? 0) > 0
          ? addLinkedMinutes(applied.milestones, input.milestoneIds, input.durationMinutes ?? 0)
          : null
      let newState = link ? { ...applied, milestones: link.milestones } : applied
      // 里程碑统一同步（真实数据驱动；跨过 25/50/75% 检查点即发奖励）
      const res = syncMilestones(newState)
      newState = res.state
      set({ state: newState })
      void persist(newState)
      if (res.stageGrants.length > 0 || res.completed.length > 0) {
        set({
          pendingMilestoneEvents: [
            ...(get().pendingMilestoneEvents ?? []),
            ...res.stageGrants,
            ...res.completed.map((c) => ({ ...c, stage: 100, xp: 0, coins: 0 })),
          ],
        })
      }
      if (bossEvent) {
        // 页面不可见/无焦点时押后 BOSS 动画（与 heldSessionFeedback 同一节奏），
        // 否则 6 秒自动关闭会在人不在时播完，回来做完经验结算就没有 BOSS 动画了
        const away = document.visibilityState !== 'visible' || !document.hasFocus()
        if (away) {
          set((s) => ({ heldBossEvents: [...s.heldBossEvents, bossEvent] }))
        } else {
          set({ pendingBossEvents: [...(get().pendingBossEvents ?? []), bossEvent] })
        }
      }
      // 局结算有专属结算 Overlay，不再弹普通 XP Toast；计入说明随 warnings 展示
      if (input.session) {
        set({ pendingLevelUp: feedback.levelUp ?? null })
      } else {
        const withNotes =
          link && link.notes.length > 0
            ? { ...feedback, warnings: [...feedback.warnings, ...link.notes] }
            : feedback
        set({ pendingFeedback: withNotes, pendingLevelUp: withNotes.levelUp ?? null })
      }
      return feedback
    },

    endSession: (input) => {
      const st = get().state
      const actualMinutes = Math.max(1, Math.round(input.actualMinutes ?? input.plannedMinutes))
      const earlyEnded = actualMinutes < input.plannedMinutes
      const efficiency = computeEfficiency(st.player, input.type)

      // v1.0 消耗品加成（暴击券在结算时掷骰；专注加成需 ≥45min）
      const { buffMult, crit, buffName, buffIcon, buffDetail, buffItem } = computeSessionBuff(input.buffItemId)
      const buffEffect = input.buffItemId ? CONSUMABLE_EFFECTS[input.buffItemId] : undefined
      let effectiveBuffDetail = buffDetail
      let effectiveBuffMult = buffMult
      if (buffItem && buffEffect && buffEffect.kind === 'deepBonus') {
        effectiveBuffMult = input.plannedMinutes >= 45 ? buffEffect.multiplier : 1
        if (effectiveBuffMult === 1) effectiveBuffDetail = `${buffEffect.detail}（本局不足 45min，未生效，已退还）`
      }

      const baseXp = Math.max(
        1,
        Math.round(
          efficiency.xpPerMin *
            actualMinutes *
            // 补录（记录行动）的强度倍率：番茄钟恒为 1，手动记录保留强度语义
            (input.manual && input.intensity
              ? (XP_CONFIG[input.type].intensityMultiplier?.[input.intensity] ?? 1)
              : 1),
        ),
      )
      // 主题套装加成（服饰 × 背景搭配，读取当前穿着与背景选择）
      const themeBonus = computeThemeBonus(st.player.unlockedItems)
      const xp = Math.max(1, Math.round(baseXp * effectiveBuffMult * (1 + themeBonus.bonus)))
      const coins = Math.round(xp * SESSION_COINS_PER_XP)
      const attributeGains = sessionAttributeGains(input.type, actualMinutes)
      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const sessionNo = (st.player.totalSessions ?? 0) + 1
      const prevBest = st.player.bestEfficiency ?? 0
      const hasHistory = (st.sessions ?? []).length > 0
      const startIso = input.startTime ?? new Date().toISOString()

      // 走 addActivity 完整链路：升级 / 成就 / streak / 里程碑 / 持久化
      get().addActivity({
        type: input.type,
        title: input.title,
        durationMinutes: actualMinutes,
        intensity: input.intensity ?? 'medium',
        subtype: input.subtype,
        milestoneIds: input.milestoneIds,
        description: `${input.manual ? '📝 补录' : '🎮'} 第 ${sessionNo} 局 · 效率 ×${efficiency.multiplier.toFixed(2)} · ${efficiency.xpPerMin.toFixed(1)}/min${effectiveBuffDetail ? ` · ${buffItem?.name}${effectiveBuffMult > 1 ? ' 生效' : ''}` : ''}${themeBonus.label ? ` · ✨${themeBonus.label}` : ''}${input.manual && input.description ? ` · 📄 ${input.description}` : ''}`,
        session: {
          sessionId,
          startTime: startIso,
          plannedMinutes: input.plannedMinutes,
          actualMinutes,
          earlyEnded,
          xp,
          coins,
          // 纯效率引擎产出（不含消耗品 buff / 主题加成；补录含强度倍率）——BOSS 伤害按此计算
          baseXp,
          attributeGains,
          efficiency: efficiency.multiplier,
          xpPerMin: efficiency.xpPerMin,
          taskId: input.taskId,
          buffItemId: effectiveBuffMult > 1 ? input.buffItemId : undefined,
        },
      })

      // 结算后的最新玩家状态 → 今日累计 & 下一局预计（升级后真实提高）
      const after = get().state
      const tKey = todayKey()
      const todaySessions = (after.sessions ?? []).filter(
        (s) => s.endTime.slice(0, 10) === tKey,
      )
      const todayXp = todaySessions.reduce((s, x) => s + x.xpGained, 0)
      const todayCoins = todaySessions.reduce((s, x) => s + x.coinsGained, 0)
      const next = estimateSessionGain(after.player, input.type, input.plannedMinutes)

      const result: SessionFeedback = {
        sessionId,
        title: input.title,
        type: input.type,
        plannedMinutes: input.plannedMinutes,
        actualMinutes,
        earlyEnded,
        xp,
        coins,
        attributeGains,
        efficiency: efficiency.multiplier,
        xpPerMin: efficiency.xpPerMin,
        isNewRecord: hasHistory && efficiency.multiplier > prevBest,
        prevBest,
        todaySessions: todaySessions.length,
        todayXp,
        todayCoins,
        nextXpEstimate: next.xp,
        nextEfficiency: next.efficiency.multiplier,
        levelUp: undefined,
        newAchievements: [],
        buffName,
        buffIcon,
        buffDetail: effectiveBuffMult > 1 ? effectiveBuffDetail : buffName ? effectiveBuffDetail : undefined,
        crit: crit && effectiveBuffMult > 1,
        manual: input.manual,
        startTime: startIso,
      }
      // 番茄钟到点时玩家可能不在屏幕前：数据已完整落库（上方 addActivity），
      // 但结算仪式押后到玩家回来（页面重新可见且有焦点）再播——否则白闪/
      // 重击动画在人不在时自动放完，回来只剩一个静止面板。
      // 同理：前一个结算还在展示时（连续补录/到点连发），新的也进队列依次播放。
      const away = document.visibilityState !== 'visible' || !document.hasFocus()
      if (away || get().pendingSessionFeedback) {
        set((s) => ({ heldSessionFeedback: [...s.heldSessionFeedback, result] }))
      } else {
        set({ pendingSessionFeedback: result })
      }
      return result
    },

    /** 召唤追加讨伐 BOSS（周 BOSS 击杀后可反复召唤；已有进行中的追加 BOSS 时返回 false） */
    summonExtraBoss: () => {
      const bs = get().state.bossState
      if (!bs || !bs.killedAt || (bs.extra && !bs.extra.killedAt)) return false
      update((s) => {
        const b = s.bossState
        if (!b) return s
        return { ...s, bossState: { ...b, extra: createExtraBoss(b.stage, b.bossId) } }
      })
      return true
    },

    claimQuest: (questId) => {
      const st = get().state
      const quest = st.weeklyQuests?.quests.find((q) => q.id === questId)
      if (!quest || quest.claimed) return null
      // 校验进度（进度是实时派生的，领取时以真实数据为准）
      if (questProgress(st, quest) < quest.target) return null
      // 奖励：金币直接入账；XP 经 addActivity 走完整链路（属性/成就/里程碑联动）
      update((s) => {
        const wq = s.weeklyQuests
        if (!wq) return s
        return {
          ...s,
          player: { ...s.player, coins: s.player.coins + quest.coins },
          weeklyQuests: {
            ...wq,
            quests: wq.quests.map((q) => (q.id === questId ? { ...q, claimed: true } : q)),
          },
        }
      })
      get().addActivity({
        type: 'life',
        title: `📋 周委托完成 · ${quest.title}`,
        durationMinutes: 1,
        intensity: 'low',
        description: `委托奖励 +${quest.xp} XP · +${quest.coins} 💰`,
      })
      return { title: quest.title, coins: quest.coins, xp: quest.xp }
    },

    clearFeedback: () => set({ pendingFeedback: null }),
    clearLevelUp: () => set({ pendingLevelUp: null }),
  }
})

// 兼容旧导入（拆分前 useGameStore.ts 导出的类型，调用方可能直接从该文件 import）
export type { GameStore, SessionFeedback, ActivityFeedback, SessionOverride } from './types'
export { mergeImportedState, defaultState, defaultPlayer } from './stateDefaults'
export { grantLevelUnlocks, levelUnlockIdsUpTo } from './grantLevelUnlocks'
export { detectDuplicate, recordSession, updateMilestoneProgress, applyActivity } from './activityEngine'
export { rollChest }

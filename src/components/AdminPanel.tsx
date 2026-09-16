/**
 * 管理员测试面板
 *
 * 顶栏低调入口（🧪），用于本地验证：
 * - 宝箱抽奖动画：指定等级 + 数量直接触发 ChestOverlay（含保底、各稀有度特效）
 * - 弹窗动画：升级 / 成就 / 局结算 / +XP / 里程碑，注入演示数据触发对应 Overlay
 * - Live2D：解锁/重置宝箱限定形象（测试锁定 UI 与开出流程）、打开全屏展示
 *
 * 仅操作内存/localStorage 与 pendingChests，不影响真实存档的 XP/金币
 * （开箱本身会推进保底计数与解锁，与真实游戏一致 —— 这正是要测试的部分）。
 */

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useGameStore } from '../store/useGameStore'
import { LIVE2D_MODELS, unlockAllModels, resetUnlockedModels, getOutfitChoice, setOutfitChoice } from '../config/live2dModels'
import { SHOP_ITEMS } from '../config/shopItems'
import { openLive2DShowcase } from './Live2DShowcase'
import type { Achievement } from '../types'
import type { BossEvent, SessionFeedback, MilestoneEvent, ActivityFeedback } from '../store/types'
import type { LevelUpResult } from '../engine/levelSystem'

/** 全部服饰道具 id（live2dModels 的 unlockItem ∩ 商店/宝箱道具表） */
const ALL_OUTFIT_ITEMS = Array.from(
  new Set(
    LIVE2D_MODELS.flatMap((m) => m.outfits ?? [])
      .map((o) => o.unlockItem)
      .filter((id): id is string => !!id)
      .filter((id) => SHOP_ITEMS.some((i) => i.id === id)),
  ),
)

export const AdminPanel: React.FC = () => {
  const setPendingChests = useGameStore((s) => s.setPendingChests)
  const setItemsUnlocked = useGameStore((s) => s.setItemsUnlocked)
  const pendingBossEvents = useGameStore((s) => s.pendingBossEvents)
  const setPendingBossEvents = useGameStore((s) => s.setPendingBossEvents)
  const setPendingLevelUp = useGameStore((s) => s.setPendingLevelUp)
  const setPendingAchievements = useGameStore((s) => s.setPendingAchievements)
  const setPendingSessionFeedback = useGameStore((s) => s.setPendingSessionFeedback)
  const setPendingFeedback = useGameStore((s) => s.setPendingFeedback)
  const setPendingMilestoneEvents = useGameStore((s) => s.setPendingMilestoneEvents)
  const unlockedItems = useGameStore((s) => s.state.player.unlockedItems)
  const pity = useGameStore((s) => s.state.player.chestPity ?? 0)
  const unlockedOutfitCount = ALL_OUTFIT_ITEMS.filter((id) => unlockedItems.includes(id)).length
  const [open, setOpen] = useState(false)
  const [chestLevel, setChestLevel] = useState(30)
  const [chestCount, setChestCount] = useState(1)

  const launchChests = () => {
    setOpen(false) // 先关面板，避免遮罩叠层
    setPendingChests({ level: chestLevel, count: chestCount, attributeChoice: false })
  }

  /** 指定奖品类型开箱：注入 forcedLoot 跳过真实抽奖（不扣保底/不发放奖励，纯动画验证） */
  const launchTypedChest = (loot: import('../config/chestConfig').ChestLoot) => {
    setOpen(false)
    setPendingChests({ level: chestLevel, count: 1, attributeChoice: false, forcedLoot: loot })
  }

  /** BOSS 伤害动画测试：直接向 pendingBossEvents 推送构造事件（不碰真实存档） */
  const launchBossEvent = (killed: boolean) => {
    setOpen(false)
    // 墨梦魔君 = 第 2 届，maxHp = 10400；数据与 bossConfig 对齐以驱动血条/立绘/碎裂演出
    const stage = 2
    const ev: BossEvent = killed
      ? {
          bossId: 'boss_nightmare',
          name: '墨梦魔君',
          stage,
          damage: 6108,
          hpAfter: 0,
          killed: true,
          coins: 300,
          loot: { name: '星穹之幕', icon: '🌠', rarity: 'legendary' },
        }
      : {
          bossId: 'boss_nightmare',
          name: '墨梦魔君',
          stage,
          damage: 4292,
          hpAfter: 6108,
          killed: false,
          coins: 0,
        }
    setPendingBossEvents([...(pendingBossEvents ?? []), ev])
  }

  /** 升级弹窗测试：直接注入 pendingLevelUp（chests=0 且不选属性 → 3.8s 后自动收场，不碰真实存档） */
  const launchLevelUp = () => {
    setOpen(false)
    const r: LevelUpResult = {
      leveledUp: true,
      fromLevel: 12,
      toLevel: 13,
      coinsGained: 660,
      skillPointsGained: 3,
      newTitle: '晨光开拓者',
      levelsGained: 1,
      chests: 0,
      unlockedFeatures: [],
      unlockedRewards: [],
      duplicateRewards: [],
      rewardCoins: 0,
      hasMilestone: false,
      attributeChoiceAvailable: false, // true 会真实修改存档属性，测试固定关闭
    }
    setPendingLevelUp(r)
  }

  /** 成就弹窗测试：注入 2 条演示成就（验证 AchievementToast 排队逐条展示） */
  const launchAchievements = () => {
    setOpen(false)
    const now = new Date().toISOString()
    const list: Achievement[] = [
      {
        id: `test_ach_a_${Date.now()}`,
        title: '测试成就 · 深渊回响',
        description: '这是测试面板注入的成就弹窗演示（稀有度：史诗）',
        icon: '🏅',
        unlockedAt: now,
        category: 'boss',
        rarity: 'epic',
      },
      {
        id: `test_ach_b_${Date.now()}`,
        title: '测试成就 · 传奇之证',
        description: '第二条排队成就，验证逐条弹出节奏（稀有度：传说）',
        icon: '👑',
        unlockedAt: now,
        category: 'legend',
        rarity: 'legendary',
      },
    ]
    setPendingAchievements(list)
  }

  /** 局结算弹窗测试：注入新纪录演示数据（含金色闪光/粒子/纪录横幅/结算曲） */
  const launchSessionSettle = () => {
    setOpen(false)
    const f: SessionFeedback = {
      sessionId: `test_session_${Date.now()}`,
      title: 'LevelUP 弹窗测试局',
      type: 'work',
      plannedMinutes: 45,
      actualMinutes: 45,
      earlyEnded: false,
      xp: 1246,
      coins: 3260,
      attributeGains: { focus: 4, wisdom: 2, courage: 1 },
      efficiency: 2.68,
      xpPerMin: 27.7,
      isNewRecord: true,
      prevBest: 2.21,
      todaySessions: 5,
      todayXp: 6890,
      todayCoins: 12840,
      nextXpEstimate: 1310,
      nextEfficiency: 2.74,
      newAchievements: [],
    }
    setPendingSessionFeedback(f)
  }

  /** +XP 浮动提示测试：注入右下角 toast（含金币音效与数字滚动） */
  const launchXpToast = () => {
    setOpen(false)
    const f: ActivityFeedback = {
      activityId: `test_xp_${Date.now()}`,
      xp: 358,
      coins: 1200,
      attributeGains: { focus: 3, wisdom: 2 },
      warnings: [],
      newAchievements: [],
    }
    setPendingFeedback(f)
  }

  /** 里程碑提示测试：注入 50% 检查点事件（7s 自动收场，含奖励数值） */
  const launchMilestoneToast = () => {
    setOpen(false)
    const ev: MilestoneEvent = {
      id: `test_ms_${Date.now()}`,
      goal: '完成 LevelUP 2.0 版本开发',
      stage: 50,
      xp: 240,
      coins: 800,
    }
    setPendingMilestoneEvents([ev])
  }

  /**
   * 番茄钟全链路组合测试：模拟一局到点的完整反馈链。
   * 注入顺序即真实到点顺序：局结算面板（白闪/重击/新纪录）→ +XP toast（并行浮现）→
   * 成就 ×2（排队逐条弹出）→ BOSS 伤害战报（等结算面板关闭后才播放——与真实
   * 到点同一条排队规则）。withBoss=false 时省去战报。
   */
  const launchPomodoroChain = (withBoss: boolean) => {
    setOpen(false)
    // 1. 局结算（真实到点时的主仪式）
    const f: SessionFeedback = {
      sessionId: `test_chain_${Date.now()}`,
      title: '番茄钟全链路测试局',
      type: 'work',
      plannedMinutes: 25,
      actualMinutes: 25,
      earlyEnded: false,
      xp: 856,
      coins: 2140,
      attributeGains: { focus: 3, wisdom: 2 },
      efficiency: 2.42,
      xpPerMin: 34.2,
      isNewRecord: true,
      prevBest: 2.08,
      todaySessions: 6,
      todayXp: 5230,
      todayCoins: 9860,
      nextXpEstimate: 902,
      nextEfficiency: 2.48,
      newAchievements: [],
    }
    setPendingSessionFeedback(f)
    // 2. +XP 浮动提示（真实链路由 addActivity 产生，与结算面板并行展示）
    setPendingFeedback({
      activityId: `test_chain_xp_${Date.now()}`,
      xp: 856,
      coins: 2140,
      attributeGains: { focus: 3, wisdom: 2 },
      warnings: [],
      newAchievements: [],
    })
    // 3. 成就 ×2（AchievementToast 内部排队逐条弹出）
    const now = new Date().toISOString()
    setPendingAchievements([
      {
        id: `test_chain_ach_a_${Date.now()}`,
        title: '链路测试 · 连击节奏',
        description: '番茄钟全链路演示成就（稀有度：史诗）',
        icon: '⚡',
        unlockedAt: now,
        category: 'pomodoro',
        rarity: 'epic',
      },
      {
        id: `test_chain_ach_b_${Date.now()}`,
        title: '链路测试 · 完整闭环',
        description: '第二条排队成就，验证逐条弹出节奏（稀有度：传说）',
        icon: '🔥',
        unlockedAt: now,
        category: 'session',
        rarity: 'legendary',
      },
    ])
    // 4. BOSS 伤害战报（BossVictoryOverlay 等结算面板关闭后才播放，与真实到点一致）
    if (withBoss) {
      const ev: BossEvent = {
        bossId: 'boss_frostqueen',
        name: '霜亡女王·艾希丝',
        stage: 3,
        damage: 2418,
        hpAfter: 3102,
        killed: false,
        coins: 0,
      }
      setPendingBossEvents([ev])
    }
  }

  return (
    <>
      {/* 低调入口 */}
      <button
        onClick={() => setOpen(true)}
        title="管理员测试"
        className="rounded-lg border-2 border-rpg-border bg-rpg-panel px-2 py-1 text-[10px] text-gray-400 transition-all hover:border-rpg-gold hover:text-rpg-gold"
      >
        🧪
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[85] flex items-center justify-center animate-fade-in bg-black/80 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="rpg-panel max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl border-4 border-rpg-gold p-5 shadow-gold"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-1 text-center pixel-text text-xs text-rpg-gold">ADMIN · 测试面板</div>
              <div className="mb-4 text-center text-[9px] text-gray-500">
                仅用于本地验证动画与交互 · 部分操作会推进保底计数
              </div>

              {/* ===== 宝箱测试 ===== */}
              <section className="mb-4 rounded-xl border-2 border-rpg-border bg-rpg-panelLight/40 p-3">
                <div className="mb-2 text-[11px] font-bold text-rpg-gold">🎁 抽奖动画测试</div>
                <div className="flex items-center gap-2 text-[10px] text-gray-300">
                  <label className="flex items-center gap-1">
                    等级
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={chestLevel}
                      onChange={(e) => setChestLevel(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                      className="w-14 rounded border border-rpg-border bg-rpg-bg px-1 py-0.5 text-center"
                    />
                  </label>
                  <span className="flex items-center gap-1">
                    数量
                    {[1, 3, 10].map((n) => (
                      <button
                        key={n}
                        onClick={() => setChestCount(n)}
                        className={`rounded border px-1.5 py-0.5 transition-all ${
                          chestCount === n
                            ? 'border-rpg-gold bg-rpg-gold/20 text-rpg-gold'
                            : 'border-rpg-border bg-rpg-panel text-gray-400 hover:text-white'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </span>
                </div>
                <div className="mt-1.5 text-[9px] text-gray-500">
                  当前保底计数：{pity}（影响史诗保底触发）
                </div>
                <button
                  onClick={launchChests}
                  className="mt-2 w-full rounded-lg border-2 border-rpg-gold/60 bg-rpg-gold/10 py-1 text-[11px] text-rpg-gold transition-all hover:bg-rpg-gold/20"
                >
                  ▶ 立即开箱（Lv.{chestLevel} × {chestCount}）
                </button>
                <div className="mt-1 text-center text-[8px] text-gray-600">
                  等级越高紫/金/红概率越大；限定形象在蓝+池出现（商店亦可购买）
                </div>

                {/* 指定奖品类型：验证各揭示演出（金币雨 / 形象检视 / 背景检视 / 服饰卡） */}
                <div className="mt-2 border-t border-rpg-border/60 pt-2">
                  <div className="mb-1.5 text-[9px] text-gray-500">指定奖品（跳过真实抽奖，不推进保底）</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => launchTypedChest({ kind: 'coins', amount: 26000, rarity: 'red' })}
                      className="rounded-lg border-2 border-rpg-gold/60 bg-rpg-gold/10 py-1 text-[10px] text-rpg-gold transition-all hover:bg-rpg-gold/20"
                    >
                      💰 红档金币雨
                    </button>
                    <button
                      onClick={() => {
                        const m = LIVE2D_MODELS.find((x) => x.chestRarity === 'purple') ?? LIVE2D_MODELS[0]
                        launchTypedChest({ kind: 'model', model: m, rarity: (m.chestRarity ?? 'purple') as 'purple' })
                      }}
                      className="rounded-lg border-2 border-rpg-creativity/60 bg-rpg-creativity/10 py-1 text-[10px] text-rpg-creativity transition-all hover:bg-rpg-creativity/20"
                    >
                      🎭 形象·全屏检视
                    </button>
                    <button
                      onClick={() => {
                        const bg = SHOP_ITEMS.find((i) => i.category === 'background' && i.rarity === 'legendary')
                          ?? SHOP_ITEMS.find((i) => i.category === 'background')!
                        launchTypedChest({ kind: 'item', item: bg, rarity: 'red' })
                      }}
                      className="rounded-lg border-2 border-rpg-xp/60 bg-rpg-xp/10 py-1 text-[10px] text-rpg-xp transition-all hover:bg-rpg-xp/20"
                    >
                      🖼️ 背景·全屏检视
                    </button>
                    <button
                      onClick={() => {
                        const outfit = SHOP_ITEMS.find((i) => i.category === 'outfit')
                        if (outfit) launchTypedChest({ kind: 'item', item: outfit, rarity: 'gold' })
                      }}
                      className="rounded-lg border-2 border-rpg-wisdom/60 bg-rpg-wisdom/10 py-1 text-[10px] text-rpg-wisdom transition-all hover:bg-rpg-wisdom/20"
                    >
                      👗 服饰·揭示卡
                    </button>
                  </div>
                </div>
              </section>

              {/* ===== BOSS 伤害动画测试 ===== */}
              <section className="mb-4 rounded-xl border-2 border-rpg-border bg-rpg-panelLight/40 p-3">
                <div className="mb-2 text-[11px] font-bold text-rpg-gold">⚔️ BOSS 伤害动画测试</div>
                <div className="mb-2 text-[9px] text-gray-500">
                  普通伤害 = hit-stop 定格 + 刀光 + 重击数字 + 受击血条；击杀 = 三幕碎裂仪式（显现 → 交叉斩 → 碎裂 → BOSS SLAIN）
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => launchBossEvent(false)}
                    className="rounded-lg border-2 border-rpg-courage/60 bg-rpg-courage/10 py-1 text-[10px] text-rpg-courage transition-all hover:bg-rpg-courage/20"
                  >
                    💥 普通伤害（-4292）
                  </button>
                  <button
                    onClick={() => launchBossEvent(true)}
                    className="rounded-lg border-2 border-rpg-gold/60 bg-rpg-gold/10 py-1 text-[10px] text-rpg-gold transition-all hover:bg-rpg-gold/20"
                  >
                    ⚔️ 击杀 BOSS
                  </button>
                </div>
                <div className="mt-1 text-center text-[8px] text-gray-600">
                  不影响真实存档（boss_nightmare 演示数据，血量/立绘与图鉴对齐）；击杀仪式可点击跳过
                </div>
              </section>

              {/* ===== 弹窗动画测试 ===== */}
              <section className="mb-4 rounded-xl border-2 border-rpg-border bg-rpg-panelLight/40 p-3">
                <div className="mb-2 text-[11px] font-bold text-rpg-gold">🎉 弹窗动画测试</div>
                <div className="mb-2 text-[9px] text-gray-500">
                  升级 / 成就 / 局结算 / +XP / 里程碑，注入演示数据直接触发对应弹窗
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={launchLevelUp}
                    className="rounded-lg border-2 border-rpg-gold/60 bg-rpg-gold/10 py-1 text-[10px] text-rpg-gold transition-all hover:bg-rpg-gold/20"
                  >
                    ⬆️ 升级弹窗
                  </button>
                  <button
                    onClick={launchAchievements}
                    className="rounded-lg border-2 border-rpg-xp/60 bg-rpg-xp/10 py-1 text-[10px] text-rpg-xp transition-all hover:bg-rpg-xp/20"
                  >
                    🏅 成就弹窗 ×2
                  </button>
                  <button
                    onClick={launchSessionSettle}
                    className="rounded-lg border-2 border-amber-500/60 bg-amber-500/10 py-1 text-[10px] text-amber-300 transition-all hover:bg-amber-500/20"
                  >
                    🍅 局结算·新纪录
                  </button>
                  <button
                    onClick={launchXpToast}
                    className="rounded-lg border-2 border-rpg-border bg-rpg-panel py-1 text-[10px] text-gray-300 transition-all hover:border-rpg-xp hover:text-rpg-xp"
                  >
                    ✨ +XP 浮动提示
                  </button>
                  <button
                    onClick={launchMilestoneToast}
                    className="col-span-2 rounded-lg border-2 border-rpg-border bg-rpg-panel py-1 text-[10px] text-gray-300 transition-all hover:border-rpg-gold hover:text-rpg-gold"
                  >
                    🏆 里程碑检查点提示
                  </button>
                </div>
                <div className="mt-1 text-center text-[8px] text-gray-600">
                  均不影响真实存档（升级演示不附宝箱、不选属性）；局结算的「再来一局」会真实启动番茄钟，测试请点「好的」关闭
                </div>

                {/* ===== 番茄钟全链路组合 ===== */}
                <div className="mt-2 border-t border-rpg-border/60 pt-2">
                  <div className="mb-1.5 text-[9px] text-gray-500">
                    番茄钟到点全链路（结算 → +XP → 成就 ×2 → 战报排队，真实到点同序播放）
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => launchPomodoroChain(true)}
                      className="rounded-lg border-2 border-rpg-courage/60 bg-rpg-courage/10 py-1 text-[10px] text-rpg-courage transition-all hover:bg-rpg-courage/20"
                    >
                      🍅 全链路 · 含BOSS伤害
                    </button>
                    <button
                      onClick={() => launchPomodoroChain(false)}
                      className="rounded-lg border-2 border-rpg-xp/60 bg-rpg-xp/10 py-1 text-[10px] text-rpg-xp transition-all hover:bg-rpg-xp/20"
                    >
                      🍅 全链路 · 无BOSS
                    </button>
                  </div>
                  <div className="mt-1 text-center text-[8px] text-gray-600">
                    演示一局到点的完整反馈链；战报会在结算面板关闭后自动接播（BOSS 数据为霜亡女王演示值）
                  </div>
                </div>
              </section>

              {/* ===== Live2D 测试 ===== */}
              <section className="rounded-xl border-2 border-rpg-border bg-rpg-panelLight/40 p-3">
                <div className="mb-2 text-[11px] font-bold text-rpg-gold">🎭 Live2D 测试</div>
                <div className="mb-2 text-[9px] text-gray-500">
                  限定款 {LIVE2D_MODELS.filter((m) => m.chestRarity).length} / {LIVE2D_MODELS.length} 款
                  （解锁后可在背包页与展示模态切换）
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => unlockAllModels()}
                    className="rounded-lg border-2 border-rpg-border bg-rpg-panel py-1 text-[10px] text-gray-300 transition-all hover:border-rpg-gold hover:text-rpg-gold"
                  >
                    🔓 解锁全部限定
                  </button>
                  <button
                    onClick={() => resetUnlockedModels()}
                    className="rounded-lg border-2 border-rpg-border bg-rpg-panel py-1 text-[10px] text-gray-300 transition-all hover:border-rose-400 hover:text-rose-300"
                  >
                    🔒 重置解锁状态
                  </button>
                  <button
                    onClick={() => {
                      setOpen(false)
                      openLive2DShowcase()
                    }}
                    className="rounded-lg border-2 border-rpg-border bg-rpg-panel py-1 text-[10px] text-gray-300 transition-all hover:border-rpg-gold hover:text-rpg-gold"
                  >
                    🔍 打开全屏展示
                  </button>
                  <Link
                    to="/live2d-demo"
                    onClick={() => setOpen(false)}
                    className="rounded-lg border-2 border-rpg-border bg-rpg-panel py-1 text-center text-[10px] text-gray-300 transition-all hover:border-rpg-gold hover:text-rpg-gold"
                  >
                    📦 模型仓库页
                  </Link>
                </div>
                <div className="mt-2 text-center text-[8px] text-gray-600">
                  重置后若当前形象被锁定，会自动回退到 Haru
                </div>
              </section>

              {/* ===== 服饰测试 ===== */}
              <section className="mt-4 rounded-xl border-2 border-rpg-border bg-rpg-panelLight/40 p-3">
                <div className="mb-2 text-[11px] font-bold text-rpg-gold">👗 服饰测试</div>
                <div className="mb-2 text-[9px] text-gray-500">
                  全部解锁：{unlockedOutfitCount} / {ALL_OUTFIT_ITEMS.length} 件
                  （解锁后背包页 OutfitSwitcher 可换装）
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setItemsUnlocked(ALL_OUTFIT_ITEMS, true)}
                    className="rounded-lg border-2 border-rpg-border bg-rpg-panel py-1 text-[10px] text-gray-300 transition-all hover:border-rpg-gold hover:text-rpg-gold"
                  >
                    🔓 解锁全部服饰
                  </button>
                  <button
                    onClick={() => setItemsUnlocked(ALL_OUTFIT_ITEMS, false)}
                    className="rounded-lg border-2 border-rpg-border bg-rpg-panel py-1 text-[10px] text-gray-300 transition-all hover:border-rose-400 hover:text-rose-300"
                  >
                    🔒 重置服饰解锁
                  </button>
                  <button
                    onClick={() => {
                      // 锁住两款粉水手（调价后需重新购买/宝箱获取）；正穿着时回退默认蓝水手
                      setItemsUnlocked(['outfit_pink_sailor', 'outfit_pink_sailor_full'], false)
                      const worn = getOutfitChoice('hiyori-wardrobe')
                      if (worn === 'pinkSailor' || worn === 'pinkSailorFull') {
                        setOutfitChoice('hiyori-wardrobe', 'blueSailor')
                      }
                    }}
                    className="col-span-2 rounded-lg border-2 border-rpg-border bg-rpg-panel py-1 text-[10px] text-gray-300 transition-all hover:border-rose-400 hover:text-rose-300"
                  >
                    🔒 锁住粉水手（收回拥有权限）
                  </button>
                </div>
              </section>

              <button
                onClick={() => setOpen(false)}
                className="mt-4 w-full rounded-lg border-2 border-rpg-border bg-rpg-panel py-1 text-[10px] text-gray-400 transition-all hover:text-white"
              >
                关闭
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

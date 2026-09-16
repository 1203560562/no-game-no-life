import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/useGameStore'
import type { Achievement, AttributeKey } from '../types'
import type { BossEvent } from '../store/types'
import { ATTRIBUTE_META, ATTRIBUTE_KEYS, levelRewardLabel } from '../config/xpConfig'
import { TIER_META } from '../engine/milestoneEngine'
import { sfx } from '../lib/soundFx'
import { CountUp } from './CountUp'
import { ConfettiBurst } from './ConfettiBurst'
import { BossShatter } from './BossShatter'
import { BOSS_ROSTER, bossForStage, bossMaxHp } from '../config/bossConfig'

/** Floating "+XP / +coins" toast after recording an activity */
export const XpToast: React.FC = () => {
  const feedback = useGameStore((s) => s.pendingFeedback)
  const clear = useGameStore((s) => s.clearFeedback)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!feedback) return
    // 同一条 feedback 不重复触发
    if (lastIdRef.current === feedback.activityId) return
    lastIdRef.current = feedback.activityId

    setVisible(true)
    if (feedback.xp > 0 || feedback.coins > 0) sfx.coin()
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setVisible(false)
      clear()
    }, 10000)
  }, [feedback, clear])

  if (!feedback || !visible) return null

  const isZeroXp = feedback.xp === 0

  return (
    <div className="pointer-events-none fixed bottom-8 right-8 z-[55] animate-slide-up">
      <div className={`rpg-panel border-2 px-5 py-3 shadow-gold ${isZeroXp ? 'border-amber-500/60' : 'border-rpg-gold'}`}>
        {feedback.xp > 0 ? (
          <div className="flex items-center gap-2">
            <span className="pixel-text text-lg text-rpg-xp">
              +<CountUp value={feedback.xp} duration={800} /> XP
            </span>
            {feedback.coins > 0 && (
              <span className="text-rpg-gold">
                💰 +<CountUp value={feedback.coins} duration={800} />
              </span>
            )}
          </div>
        ) : (
          <div className="text-sm font-bold text-amber-300">📝 已记录（未获得 XP）</div>
        )}
        {Object.entries(feedback.attributeGains).map(([k, v]) => (
          <div key={k} className="text-xs text-rpg-xp">
            +{v} {k}
          </div>
        ))}
        {feedback.warnings.map((w, i) => (
          <div key={i} className="mt-1 text-xs text-amber-300">
            ⚠ {w}
          </div>
        ))}
        {feedback.insightXp && (
          <div className="mt-1 text-xs font-bold text-purple-300">
            🧠 认知突破 +{feedback.insightXp} Insight XP
          </div>
        )}
      </div>
    </div>
  )
}

/** Full-screen level-up animation with reward display & attribute choice */
export const LevelUpOverlay: React.FC = () => {
  const levelUp = useGameStore((s) => s.pendingLevelUp)
  const clear = useGameStore((s) => s.clearLevelUp)
  const chooseAttr = useGameStore((s) => s.chooseLevelUpAttribute)
  const setPendingChests = useGameStore((s) => s.setPendingChests)
  const pendingChests = useGameStore((s) => s.pendingChests)
  const [phase, setPhase] = useState<'show' | 'chest' | 'choosing' | 'done'>('done')
  /** hit-stop 白闪期（BOSS 式开场定格） */
  const [intro, setIntro] = useState(true)

  useEffect(() => {
    if (levelUp?.leveledUp) {
      setPhase('show')
      setIntro(true)
      sfx.levelUp()
      const t0 = setTimeout(() => setIntro(false), 480)
      // 3.8s 后：有宝箱先开箱（ChestOverlay 接管），否则进入属性选择或结束
      const t = setTimeout(() => {
        if (levelUp.chests > 0) {
          setPendingChests({ level: levelUp.toLevel, count: levelUp.chests, attributeChoice: levelUp.attributeChoiceAvailable })
          setPhase('chest')
        } else if (levelUp.attributeChoiceAvailable) {
          setPhase('choosing')
        } else {
          setPhase('done')
          clear()
        }
      }, 3800)
      return () => {
        clearTimeout(t)
        clearTimeout(t0)
      }
    }
  }, [levelUp, clear, setPendingChests])

  // 宝箱全部开完 → 回到属性选择或结束流程
  useEffect(() => {
    if (phase === 'chest' && !pendingChests && levelUp) {
      if (levelUp.attributeChoiceAvailable) {
        setPhase('choosing')
      } else {
        setPhase('done')
        clear()
      }
    }
  }, [pendingChests, phase, levelUp, clear])

  if ((phase !== 'show' && phase !== 'choosing') || !levelUp) return null

  const handleChoose = (attr: AttributeKey) => {
    chooseAttr(attr)
    setPhase('done')
  }

  const handleSkip = () => {
    clear()
    setPhase('done')
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/90 p-4 backdrop-blur-sm transition-transform duration-300 ${
        phase === 'show' && intro ? 'scale-[1.05]' : 'scale-100'
      }`}
      onClick={phase === 'show' ? handleSkip : undefined}
    >
      {/* ① 命中定格：全屏白闪（hit-stop，BOSS 式开场） */}
      {phase === 'show' && intro && (
        <div className="animate-white-flash pointer-events-none absolute inset-[-20%] bg-white" />
      )}

      {/* ② 重击定格舞台：旋转金色光芒 + 冲击波 + 粒子 + 大字 */}
      {phase === 'show' && !intro && (
        <div className="absolute inset-0 animate-kill-quake">
          {/* 旋转光芒（径向扇形光带，中心遮罩保证文字可读） */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
            <div
              className="animate-rays-spin h-[160vmax] w-[160vmax] opacity-[0.12]"
              style={{
                background:
                  'repeating-conic-gradient(from 0deg, rgba(255,213,74,0.9) 0deg 8deg, transparent 8deg 26deg)',
                maskImage: 'radial-gradient(circle, transparent 16%, black 36%)',
                WebkitMaskImage: 'radial-gradient(circle, transparent 16%, black 36%)',
              }}
            />
          </div>
          {/* 冲击波环（屏幕中央炸开） */}
          <div className="animate-shockwave pointer-events-none absolute inset-0 m-auto h-64 w-64 rounded-full border-4 border-rpg-gold" />
          <div className="animate-shockwave pointer-events-none absolute inset-0 m-auto h-64 w-64 rounded-full border-2 border-white/80 [animation-delay:150ms]" />
          {/* 金色粒子大爆发 */}
          <ConfettiBurst count={64} colors={['#ffd54a', '#ffe08a', '#fff3b0', '#5eead4', '#ffffff']} radius={240} />

          {/* 内容：LEVEL UP 重击大字 + 奖励 */}
          <div className="relative flex h-full w-full items-center justify-center p-4">
            <div className="w-full max-w-md text-center">
              <div className="animate-kill-slam pixel-text text-3xl text-rpg-gold [text-shadow:0_0_24px_rgba(255,213,74,0.7),0_3px_0_rgba(0,0,0,0.6)] sm:text-4xl">
                {levelUp.hasMilestone ? '★ 里程碑 ★' : 'LEVEL UP!'}
              </div>
              <div className="mt-5 flex items-center justify-center gap-4">
                <span className="text-2xl text-gray-500 line-through sm:text-3xl">Lv.{levelUp.fromLevel}</span>
                <span className="text-2xl text-rpg-xp sm:text-3xl">→</span>
                <span className="animate-damage-slam font-rpg text-6xl tabular-nums text-rpg-gold [text-shadow:0_0_28px_rgba(255,213,74,0.65),0_4px_0_rgba(0,0,0,0.6)] sm:text-7xl">
                  {levelUp.toLevel}
                </span>
              </div>
              <div
                className="animate-slide-up mt-6 space-y-1.5 rounded-2xl border-2 border-rpg-gold/60 bg-rpg-panel/80 p-4 text-sm shadow-gold [animation-fill-mode:backwards]"
                style={{ animationDelay: '220ms' }}
              >
                <div className="text-rpg-xp">+{levelUp.skillPointsGained} 技能点</div>
                <div className="text-rpg-gold">+{levelUp.coinsGained} 💰 金币</div>
                {levelUp.newTitle && (
                  <div className="animate-pop-in text-purple-300">
                    🎁 新称号：「{levelUp.newTitle}」
                  </div>
                )}
                {levelUp.chests > 0 && (
                  <div className="animate-pop-in text-cyan-300">
                    🎁 获得升级宝箱 ×{levelUp.chests}（即将开启）
                  </div>
                )}
                {levelUp.unlockedRewards.length > 0 && (
                  <div className="animate-pop-in text-emerald-300">
                    🎁 等级奖励：{levelUp.unlockedRewards.map(levelRewardLabel).join('、')}
                  </div>
                )}
                {levelUp.duplicateRewards.length > 0 && (
                  <div className="animate-pop-in text-orange-300">
                    ♻️ 已拥有 {levelUp.duplicateRewards.map(levelRewardLabel).join('、')}，折算 +{levelUp.rewardCoins} 💰
                  </div>
                )}
                {levelUp.unlockedFeatures.length > 0 && (
                  <div className="animate-pop-in text-amber-300">
                    🔓 新功能解锁
                  </div>
                )}
                {levelUp.milestoneDesc && (
                  <div className="mt-3 rounded-lg border border-rpg-gold/40 bg-rpg-gold/10 p-3 text-xs leading-relaxed text-rpg-gold">
                    {levelUp.milestoneDesc}
                  </div>
                )}
              </div>
              {levelUp.attributeChoiceAvailable && (
                <div className="mt-4 animate-pulse text-[10px] text-gray-400">
                  即可选择属性加成…
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {phase === 'choosing' && (
        <div className="relative w-full max-w-md rounded-2xl border-4 border-rpg-gold bg-rpg-panel px-8 py-8 text-center shadow-gold">
          <div className="pixel-text mb-2 text-lg text-rpg-gold">选择属性加成</div>
          <p className="mb-4 text-[11px] text-gray-400">
            升级到 Lv.{levelUp.toLevel}，选择一项属性 +1
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ATTRIBUTE_KEYS.map((key) => {
              const meta = ATTRIBUTE_META[key]
              return (
                <button
                  key={key}
                  onClick={() => handleChoose(key)}
                  className="flex items-center gap-2 rounded-lg border-2 border-rpg-border bg-rpg-panelLight p-2.5 text-left transition-all hover:border-rpg-gold hover:bg-rpg-gold/10 active:scale-95"
                >
                  <span className="text-xl">{meta.icon}</span>
                  <div>
                    <div className="text-xs font-bold text-white">{meta.cn}</div>
                    <div className="text-[9px] text-gray-400">+1 {meta.label}</div>
                  </div>
                </button>
              )
            })}
          </div>
          <button
            onClick={handleSkip}
            className="mt-4 text-[10px] text-gray-500 underline hover:text-gray-300"
          >
            稍后再选
          </button>
        </div>
      )}
    </div>
  )
}

/** Achievement toast queue */
export const AchievementToast: React.FC = () => {
  const feedback = useGameStore((s) => s.pendingFeedback)
  const pendingAch = useGameStore((s) => s.pendingAchievements)
  const clearPendingAch = useGameStore((s) => s.clearPendingAchievements)
  const [queue, setQueue] = useState<Achievement[]>([])
  const [current, setCurrent] = useState<Achievement | null>(null)

  useEffect(() => {
    if (feedback?.newAchievements?.length) {
      setQueue((q) => [...q, ...feedback.newAchievements!])
    }
  }, [feedback])

  // 任务榜等非活动入口解锁的成就
  useEffect(() => {
    if (pendingAch?.length) {
      setQueue((q) => [...q, ...pendingAch])
      clearPendingAch()
    }
  }, [pendingAch, clearPendingAch])

  // 队列推进：当前无展示且有排队时，取出下一个
  useEffect(() => {
    if (!current && queue.length > 0) {
      setCurrent(queue[0])
      setQueue((q) => q.slice(1))
    }
  }, [current, queue])

  // 自动消失：仅依赖 current，避免 queue 变化清除定时器
  useEffect(() => {
    if (!current) return
    sfx.achievement()
    const t = setTimeout(() => setCurrent(null), 10000)
    return () => clearTimeout(t)
  }, [current])

  if (!current) return null

  return (
    <div className="fixed left-1/2 top-20 z-[60] -translate-x-1/2 animate-pop-in">
      <div className="rpg-panel flex items-center gap-3 border-rpg-gold px-5 py-3 shadow-gold">
        <span className="text-3xl">{current.icon}</span>
        <div>
          <div className="pixel-text text-[10px] text-rpg-gold">ACHIEVEMENT UNLOCKED</div>
          <div className="text-sm font-bold text-white">{current.title}</div>
          <div className="text-[10px] text-gray-300">{current.description}</div>
        </div>
      </div>
    </div>
  )
}

/** 里程碑事件全屏庆祝（跨检查点奖励 / 达成待领取）——规格对齐局结算，完成事件更华丽 */
export const MilestoneOverlay: React.FC = () => {
  const events = useGameStore((s) => s.pendingMilestoneEvents)
  const clear = useGameStore((s) => s.clearPendingMilestoneEvents)
  const milestones = useGameStore((s) => s.state.milestones)
  const navigate = useNavigate()
  interface MsEvent { id: string; goal: string; stage: number; xp: number; coins: number }
  const [queue, setQueue] = useState<MsEvent[]>([])
  const [current, setCurrent] = useState<MsEvent | null>(null)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (events?.length) {
      setQueue((q) => [...q, ...events])
      clear()
    }
  }, [events, clear])

  // 队列推进
  useEffect(() => {
    if (!current && queue.length > 0) {
      setCurrent(queue[0])
      setQueue((q) => q.slice(1))
    }
  }, [current, queue])

  // 音效 + 检查点自动消失（完成事件不自动关，等用户亲自送走这份仪式）
  useEffect(() => {
    if (!current) return
    if (current.stage >= 100) {
      // 完成：号角 + 华丽琶音冲顶
      sfx.levelUp()
      const t = setTimeout(() => sfx.record(), 500)
      return () => clearTimeout(t)
    }
    sfx.achievement()
    const t = setTimeout(() => close(), 7000)
    return () => clearTimeout(t)
  }, [current])

  if (!current) return null
  const isFinal = current.stage >= 100
  const msDetail = milestones.find((m) => m.id === current.id)
  const tier = msDetail?.tier ?? 'bronze'
  const tMeta = TIER_META[tier]

  const close = () => {
    setLeaving(true)
    setTimeout(() => {
      setCurrent(null)
      setLeaving(false)
    }, 180)
  }

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm transition-opacity duration-200 ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={isFinal ? undefined : close}
    >
      {/* 完成：全屏金色闪光 */}
      {isFinal && (
        <div className="animate-flash pointer-events-none absolute inset-0 bg-gradient-to-b from-rpg-gold/50 via-white/20 to-rpg-xp/30" />
      )}

      {/* 粒子爆发：完成金色大爆发，检查点中等庆祝 */}
      <ConfettiBurst
        count={isFinal ? 84 : 36}
        colors={isFinal ? ['#ffd54a', '#ffe08a', '#fff3b0', '#ffb020', '#5eead4', '#c084fc'] : undefined}
        radius={isFinal ? 260 : 150}
      />

      {/* 完成事件面板金色脉动（独立包装层，避免动画属性互相覆盖） */}
      <div className={isFinal ? 'animate-pulse-glow w-full max-w-sm rounded-2xl' : 'w-full max-w-sm'}>
        <div
          className={`rpg-panel relative w-full overflow-hidden border-2 p-6 text-center animate-slide-up ${
            isFinal ? 'border-rpg-gold' : 'border-rpg-xp/70'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 光效 */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-rpg-gold/10 via-transparent to-rpg-xp/10" />

          {/* 标题 */}
          <div className="relative">
            <div className={`text-4xl ${isFinal ? 'animate-float' : ''}`}>{isFinal ? '🏆' : tMeta.badge}</div>
            <div className={`mt-2 pixel-text text-sm ${isFinal ? 'text-rpg-gold' : 'text-rpg-xp'}`}>
              {isFinal ? 'MILESTONE COMPLETE' : 'MILESTONE CHECKPOINT'}
            </div>
            <div className="mt-2 text-base font-bold text-white">{current.goal}</div>
            <div className="mt-1 text-xs text-gray-400">
              {isFinal ? (
                <span className="text-rpg-gold">目标达成！完成奖励已就绪</span>
              ) : (
                <>进度到达 <b className="text-white">{current.stage}%</b> · {tMeta.label}档检查点</>
              )}
            </div>
          </div>

          {/* 核心收益（数字滚动）——完成事件是待领取的最终大奖 */}
          <div className="relative mt-4 space-y-1.5">
            {isFinal ? (
              <div className="text-2xl font-rpg text-rpg-gold drop-shadow-[0_0_12px_rgba(255,213,74,0.5)]">
                🎁 完成奖励待领取
              </div>
            ) : (
              <>
                <div className="font-rpg text-4xl tabular-nums text-rpg-xp drop-shadow-[0_0_10px_rgba(94,234,212,0.35)]">
                  +<CountUp value={current.xp} duration={1100} /> <span className="text-base">XP</span>
                </div>
                <div className="font-rpg text-2xl tabular-nums text-rpg-gold">
                  +<CountUp value={current.coins} duration={1100} /> <span className="text-sm">💰</span>
                </div>
              </>
            )}
          </div>

          {/* 完成：奖励承诺 + 写给自己的话（达成时刻看见当初的决心） */}
          {isFinal && msDetail && (
            <div className="relative mt-3 rounded-lg border border-rpg-gold/30 bg-black/30 p-3 text-left">
              <div className="text-[11px] text-rpg-creativity">🎁 {msDetail.reward}</div>
              {msDetail.messageToSelf && (
                <div className="mt-1.5 border-l-2 border-rpg-gold/50 pl-2">
                  <p className="text-[11px] italic leading-relaxed text-gray-300">「{msDetail.messageToSelf}」</p>
                  <p className="mt-0.5 text-[9px] text-gray-500">— 创建时写给自己的话</p>
                </div>
              )}
            </div>
          )}

          {/* 按钮 */}
          <div className="relative mt-5 flex gap-2">
            {!isFinal && (
              <button onClick={close} className="rpg-btn flex-1 py-2 text-sm">
                继续冒险
              </button>
            )}
            {isFinal && (
              <>
                <button onClick={close} className="rpg-btn flex-1 py-2 text-sm">
                  稍后再领
                </button>
                <button
                  onClick={() => {
                    close()
                    navigate('/milestones')
                  }}
                  className="rpg-btn-primary flex-[2] py-2 text-sm font-bold"
                >
                  🎁 去领取完成奖励
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** BOSS 受击血条：前条立即掉、白条延迟跟随（经典 RPG 受击手感） */
const BossHpBar: React.FC<{ before: number; after: number; max: number; color: string; drainDelay?: number }> = ({
  before,
  after,
  max,
  color,
  drainDelay = 90,
}) => {
  const [front, setFront] = useState(before)
  const [trail, setTrail] = useState(before)
  useEffect(() => {
    const t1 = setTimeout(() => setFront(after), drainDelay)
    const t2 = setTimeout(() => setTrail(after), drainDelay + 240)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [after, drainDelay])
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`
  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-[9px] text-gray-400">
        <span className="font-rpg tracking-widest" style={{ color }}>
          HP
        </span>
        <span className="tabular-nums">
          {after.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full border border-white/20 bg-black/70">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white/80 transition-[width] duration-700 ease-out"
          style={{ width: pct(trail) }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-150 ease-out"
          style={{ width: pct(front), background: `linear-gradient(to right, ${color}, ${color}cc)` }}
        />
      </div>
    </div>
  )
}

/**
 * BOSS 周挑战事件 Overlay
 *
 * 普通伤害：hit-stop 短定格 → 红光冲击 + 斩击刀光 + 重击数字 + 受击血条（白条残影跟随）
 * 击杀（三幕碎裂仪式，参考高星 game-feel 研究：boss kill ≈ 300ms+ hit-stop + shatter 消散）：
 *   ① 命中定格（白闪 + 画面冻结缩放）→ ② 立绘从黑暗中显现 + 血条出现
 *   → ③ 交叉斩刀光 + 斩击数字 → ④ 立绘碎裂成发光碎片飞散 + 冲击波 + 大震动
 *   → ⑤ BOSS SLAIN 胜利定格 + 败亡台词 + 战利品
 */
export const BossVictoryOverlay: React.FC = () => {
  const events = useGameStore((s) => s.pendingBossEvents)
  const clear = useGameStore((s) => s.clearPendingBossEvents)
  // 局结算面板未关闭时排队等待：番茄钟到点会同时触发结算面板和本战报，
  // 两者同为 z-70 全屏层且结算面板 DOM 靠后，会整层盖住战报（6 秒自动
  // 关闭在幕后播完，用户完全看不到）。等用户点掉结算面板后再弹出。
  const sessionFeedback = useGameStore((s) => s.pendingSessionFeedback)
  const navigate = useNavigate()
  const [current, setCurrent] = useState<BossEvent | null>(null)
  const [leaving, setLeaving] = useState(false)
  /** 击杀仪式：0=命中定格 2=显现 3=斩击 4=碎裂 5=胜利；普通伤害：0=定格 1=冲击 */
  const [phase, setPhase] = useState(0)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (!current && events?.length && !sessionFeedback) {
      setCurrent(events[0])
      setPhase(0)
      clear()
    }
  }, [current, events, clear, sessionFeedback])

  const isKill = !!current?.killed
  const boss = current
    ? (BOSS_ROSTER.find((b) => b.id === current.bossId) ?? bossForStage(current.stage))
    : null
  // 追加讨伐 BOSS 血量上限为周 BOSS 的 60%（事件携带；周 BOSS 走 bossMaxHp）
  const maxHp = current ? (current.maxHp ?? bossMaxHp(current.stage)) : 1
  const hpBefore = current ? Math.min(maxHp, current.hpAfter + current.damage) : 0

  const close = () => {
    setLeaving(true)
    setTimeout(() => {
      setCurrent(null)
      setLeaving(false)
    }, 180)
  }

  // 阶段推进 + 音效编排（击杀全程约 3s；普通伤害 hit-stop 160ms 后爆发，6s 自动关闭）
  useEffect(() => {
    if (!current) return
    const timers = timersRef.current
    timers.length = 0
    sfx.hit()
    if (current.killed) {
      timers.push(setTimeout(() => setPhase(2), 480)) // ② 立绘显现
      timers.push(
        setTimeout(() => {
          setPhase(3) // ③ 交叉斩
          sfx.slash()
        }, 1250),
      )
      timers.push(
        setTimeout(() => {
          setPhase(4) // ④ 碎裂
          sfx.shatter()
          sfx.levelUp()
        }, 1650),
      )
      timers.push(
        setTimeout(() => {
          setPhase(5) // ⑤ 胜利定格
          sfx.record()
        }, 2900),
      )
    } else {
      timers.push(setTimeout(() => setPhase(1), 160)) // hit-stop 后爆发
      timers.push(setTimeout(() => close(), 6000))
    }
    return () => {
      timers.forEach(clearTimeout)
      timers.length = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  /** 击杀仪式播放期间点击任意处跳过到胜利结算 */
  const skip = () => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    setPhase(5)
  }

  if (!current || !boss) return null

  return (
    <div
      className={`fixed inset-0 z-[70] overflow-hidden backdrop-blur-sm transition-[opacity,transform] duration-300 ${
        leaving ? 'bg-black/0 opacity-0' : 'bg-black/90 opacity-100'
      } ${phase === 0 ? 'scale-[1.05]' : 'scale-100'}`}
      onClick={isKill ? (phase < 5 ? skip : undefined) : close}
    >
      {isKill ? (
        /* ===== 击杀：全屏对峙 · 三幕碎裂仪式 ===== */
        <div className={`absolute inset-0 ${phase === 4 ? 'animate-kill-quake' : ''}`}>
          {/* ① 命中定格：全屏白闪（hit-stop 感官锚点，背景层冻结缩放由根节点承担） */}
          {phase === 0 && <div className="animate-white-flash pointer-events-none absolute inset-[-20%] bg-white" />}

          {/* 全屏 BOSS 立绘：② 显现 → ③ 斩击 → ④ 碎裂（与日常 BOSS 页同款取景，铺满整个屏幕） */}
          {phase >= 2 && phase <= 4 && (
            <div className="absolute inset-0">
              <BossShatter portrait={boss.portrait} color={boss.color} shatterDelay={1170} fullscreen />
              {/* 交叉斩刀光（全屏） */}
              {phase === 3 && (
                <>
                  <div className="animate-slash-streak pointer-events-none absolute inset-y-[-15%] left-[-45%] w-[190%] bg-gradient-to-r from-transparent via-white/90 to-transparent blur-[3px]" />
                  <div className="animate-slash-streak pointer-events-none absolute inset-y-[-15%] left-[-45%] w-[190%] -scale-x-100 bg-gradient-to-r from-transparent via-white/90 to-transparent blur-[3px] [animation-delay:120ms]" />
                </>
              )}
              {/* 最后一击伤害数字（屏幕中央偏上） */}
              {phase === 3 && (
                <div className="animate-damage-slam font-rpg pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 text-6xl tabular-nums text-rpg-courage [text-shadow:0_0_24px_rgba(244,63,94,0.85),0_3px_0_rgba(0,0,0,0.7)] sm:text-7xl">
                  -<CountUp value={current.damage} duration={400} />
                </div>
              )}
              {/* 碎裂时刻：主题色闪光 + 双冲击波环（屏幕中央） */}
              {phase === 4 && (
                <>
                  <div className="animate-flash pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.4),transparent_60%)]" />
                  <div className="animate-shockwave pointer-events-none absolute inset-0 m-auto h-64 w-64 rounded-full border-4 border-rpg-gold" />
                  <div className="animate-shockwave pointer-events-none absolute inset-0 m-auto h-64 w-64 rounded-full border-2 border-white/80 [animation-delay:150ms]" />
                </>
              )}
            </div>
          )}

          {/* 碎裂时刻：金色 + 主题色粒子大爆发（全屏规模） */}
          {phase === 4 && (
            <ConfettiBurst
              count={110}
              colors={['#ffd54a', '#ffe08a', boss.color, '#ffffff', '#ffb020']}
              radius={340}
            />
          )}

          {/* 名字 + 受击血条（浮在立绘底部；斩击时开始抽条，碎裂时血条击碎过曝消散） */}
          {phase >= 2 && phase < 5 && (
            <div className="absolute inset-x-0 bottom-10 mx-auto w-72 max-w-[80vw]">
              <div className="mb-2 text-center font-rpg text-lg text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                {current.name}
              </div>
              <div className={phase === 4 ? 'animate-hp-crack' : ''}>
                <BossHpBar before={hpBefore} after={current.hpAfter} max={maxHp} color={boss.color} drainDelay={860} />
              </div>
            </div>
          )}

          {/* ⑤ 胜利定格：BOSS SLAIN + 败亡台词 + 战利品（浮在暗化的立绘残影上） */}
          {phase === 5 && (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              {/* 暗化立绘背景：碎裂后余像渐隐，保持画面连贯 */}
              <img
                src={boss.portrait}
                alt=""
                className="animate-fade-in pointer-events-none absolute inset-0 h-full w-full object-cover object-top opacity-25 grayscale"
              />
              <div className="absolute inset-0 bg-black/55" />
              <div className="relative flex w-full max-w-sm flex-col items-center">
                <div className="animate-float text-4xl">⚔️</div>
                <div className="animate-kill-slam pixel-text mt-1 text-3xl text-rpg-gold [text-shadow:0_0_24px_rgba(255,213,74,0.7),0_3px_0_rgba(0,0,0,0.6)]">
                  BOSS SLAIN
                </div>
                <div className="animate-slide-up mt-2 text-sm text-rpg-gold" style={{ animationDelay: '150ms' }}>
                  {current.extra ? '追加讨伐成功' : `第 ${current.stage} 届讨伐成功`}
                </div>

                <div
                  className="rpg-panel relative mt-4 w-full overflow-hidden border-2 border-rpg-gold p-5 text-center animate-slide-up"
                  style={{ animationDelay: '280ms' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-rpg-gold/10 via-transparent to-rpg-courage/10" />
                  <div className="relative">
                    <div className="text-base font-bold text-white">{boss.name}</div>
                    <div className="mt-0.5 text-[10px] text-gray-500">{boss.title}</div>
                    <div className="mx-auto mt-2 max-w-[16rem] text-[11px] italic leading-relaxed text-gray-400">
                      「{boss.epitaph}」
                    </div>
                  </div>
                  <div className="relative mt-4 space-y-1.5">
                    {/* 高压契约加成（带限制规则击杀时金币上浮的说明） */}
                    {current.notes
                      ?.filter((n) => n.startsWith('⚡'))
                      .map((n, i) => (
                        <div
                          key={i}
                          className="animate-pop-in rounded-full border border-amber-400/50 bg-amber-400/10 px-3 py-1 text-[11px] font-bold text-amber-300"
                        >
                          {n}
                        </div>
                      ))}
                    <div className="font-rpg text-3xl tabular-nums text-rpg-gold drop-shadow-[0_0_12px_rgba(255,213,74,0.5)]">
                      +<CountUp value={current.coins} duration={1100} /> <span className="text-sm">💰</span>
                    </div>
                    {current.loot && (
                      <div className="rounded-lg border border-purple-400/40 bg-purple-400/10 p-2">
                        <div className="text-sm">
                          {current.loot.icon} <span className="font-bold text-purple-200">{current.loot.name}</span>
                        </div>
                        <div className="mt-0.5 text-[10px] text-gray-400">
                          {current.loot.convertedCoins
                            ? `已拥有 → 折算 +${current.loot.convertedCoins} 金币`
                            : '击杀限定掉落 · 已加入背包'}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="relative mt-5 flex gap-2">
                    <button onClick={close} className="rpg-btn flex-1 py-2 text-sm">
                      收下战利品
                    </button>
                    <button
                      onClick={() => {
                        close()
                        navigate('/boss')
                      }}
                      className="rpg-btn-primary flex-[2] py-2 text-sm font-bold"
                    >
                      ⚔️ 查看编年史
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 播放期间提示可跳过 */}
          {phase < 5 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[10px] text-gray-400">
              点击任意处跳过
            </div>
          )}
        </div>
      ) : (
        /* ===== 普通伤害：全屏对峙 · hit-stop 重击 ===== */
        <div className={`absolute inset-0 ${phase === 1 ? 'animate-impact-shake' : ''}`}>
          {/* 全屏 BOSS 立绘：与 BOSS 页同款取景铺满屏幕，受击时红光过曝 */}
          <img
            src={boss.portrait}
            alt={boss.name}
            className={`absolute inset-0 h-full w-full object-cover object-top transition-all duration-300 ${
              phase === 0 ? 'scale-[1.05] brightness-150' : 'scale-100'
            }`}
            style={{ filter: phase === 1 ? `drop-shadow(0 0 30px ${boss.color}55)` : undefined }}
          />
          {/* ① hit-stop 定格白闪 → ② 红光冲击 + 火花 */}
          {phase === 0 ? (
            <div className="animate-white-flash pointer-events-none absolute inset-[-30%] bg-white" />
          ) : (
            <>
              <div className="animate-flash pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(251,113,133,0.35),transparent_65%)]" />
              <ConfettiBurst
                count={34}
                colors={['#fb7185', '#f87171', '#fbbf24', '#ffffff', '#f43f5e']}
                radius={190}
                duration={1400}
              />
            </>
          )}
          {/* 底部渐暗：保证战报信息可读 */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

          {/* 战报信息（浮在立绘之上）：伤害数字 + 血条 + 限制规则说明 */}
          <div className="absolute inset-x-0 bottom-0 p-4 pb-8">
            <div className="mx-auto w-full max-w-sm text-center">
              <div className="pixel-text text-sm text-rpg-courage drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                {current.extra ? '⚔️ 追加讨伐' : '💥 DAMAGE'}
              </div>
              <div className="mt-1 text-base font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                {current.name}
              </div>
              <div className="relative mt-3">
                {current.damage > 0 ? (
                  <div className="animate-damage-slam font-rpg text-6xl tabular-nums text-rpg-courage [text-shadow:0_0_24px_rgba(244,63,94,0.85),0_3px_0_rgba(0,0,0,0.7)]">
                    -<CountUp value={current.damage} duration={1400} /> <span className="text-xl">HP</span>
                  </div>
                ) : (
                  <div className="animate-damage-slam font-rpg text-5xl text-gray-400 [text-shadow:0_3px_0_rgba(0,0,0,0.7)]">
                    伤害无效
                  </div>
                )}
                {current.notes?.map((n, i) => (
                  <div key={i} className="mt-1.5 text-[11px] leading-relaxed text-amber-300">
                    ⚠ {n}
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <BossHpBar before={hpBefore} after={current.hpAfter} max={maxHp} color={boss.color} />
              </div>
              <button
                onClick={close}
                className="rpg-btn relative mt-5 w-full max-w-xs py-2 text-sm"
              >
                继续战斗
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

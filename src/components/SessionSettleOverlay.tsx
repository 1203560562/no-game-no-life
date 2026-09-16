/**
 * v1.0 局结算 Overlay —— 一局结束的仪式感
 *
 * 展示：这一局获得了什么 / 是否新纪录 / 今日累计 / 下一局预计（升级后真实提高）。
 * 提前结束没有失败文案：做了多少，就获得多少。
 * Phase 6：数字滚动 + 粒子爆发 + 新纪录动画（横幅/闪光/金色粒子）+ 结算音效。
 */

import { useEffect, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import { usePomodoroStore } from '../store/usePomodoroStore'
import { ATTRIBUTE_META, DOMAIN_META } from '../config/xpConfig'
import { sfx } from '../lib/soundFx'
import { CountUp } from './CountUp'
import { ConfettiBurst } from './ConfettiBurst'
import type { AttributeKey } from '../types'

export const SessionSettleOverlay: React.FC = () => {
  const feedback = useGameStore((s) => s.pendingSessionFeedback)
  const clear = useGameStore((s) => s.clearSessionFeedback)
  const pomodoro = usePomodoroStore()
  const [leaving, setLeaving] = useState(false)
  /** hit-stop 白闪期（BOSS 式开场定格） */
  const [intro, setIntro] = useState(true)

  // 结算音效：出现即奏结算曲；新纪录追加华丽琶音
  useEffect(() => {
    if (!feedback) return
    setIntro(true)
    sfx.settle()
    const t0 = setTimeout(() => setIntro(false), 480)
    if (feedback.isNewRecord) {
      const t = setTimeout(() => sfx.record(), 450)
      return () => {
        clearTimeout(t)
        clearTimeout(t0)
      }
    }
    return () => clearTimeout(t0)
  }, [feedback])

  if (!feedback) return null

  const close = () => {
    setLeaving(true)
    setTimeout(() => {
      clear()
      setLeaving(false)
    }, 180)
  }

  const again = () => {
    // 同配置立刻再来一局
    pomodoro.setPhase('focus')
    pomodoro.start()
    clear()
  }

  const meta = DOMAIN_META[feedback.type]
  const attrEntries = Object.entries(feedback.attributeGains).filter(
    ([, v]) => v && v > 0,
  ) as [AttributeKey, number][]

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-black/90 p-4 backdrop-blur-sm transition-[opacity,transform] duration-200 ${
        leaving ? 'opacity-0' : 'opacity-100'
      } ${intro ? 'scale-[1.05]' : 'scale-100'}`}
      onClick={close}
    >
      {/* intro 白闪期点击 = 提前收场（跳过开场定格） */}
      {/* ① 命中定格：全屏白闪（hit-stop，BOSS 式开场） */}
      {intro && <div className="animate-white-flash pointer-events-none absolute inset-[-20%] bg-white" />}

      {/* ② 重击定格舞台 */}
      {!intro && (
        <div className={`absolute inset-0 ${feedback.isNewRecord ? 'animate-kill-quake' : 'animate-impact-shake'}`}>
          {/* 新纪录：全屏金色闪光 */}
          {feedback.isNewRecord && (
            <div className="animate-flash pointer-events-none absolute inset-0 bg-gradient-to-b from-rpg-gold/50 via-white/20 to-rpg-gold/30" />
          )}

          {/* 旋转光芒（新纪录金色 / 普通完成青色，中心遮罩保证可读） */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
            <div
              className="animate-rays-spin h-[160vmax] w-[160vmax] opacity-[0.1]"
              style={{
                background: `repeating-conic-gradient(from 0deg, ${
                  feedback.isNewRecord ? 'rgba(255,213,74,0.9)' : 'rgba(94,234,212,0.85)'
                } 0deg 8deg, transparent 8deg 26deg)`,
                maskImage: 'radial-gradient(circle, transparent 16%, black 36%)',
                WebkitMaskImage: 'radial-gradient(circle, transparent 16%, black 36%)',
              }}
            />
          </div>

          {/* 粒子：新纪录金色大爆发，普通完成小庆祝（全屏中心飞散） */}
          <ConfettiBurst
            count={feedback.isNewRecord ? 52 : 20}
            colors={
              feedback.isNewRecord
                ? ['#ffd54a', '#ffe08a', '#fff3b0', '#ffb020', '#5eead4']
                : undefined
            }
            radius={feedback.isNewRecord ? 210 : 130}
          />

          {/* 内容：标题重击大字 + 巨号收益 + 统计卡 */}
          <div className="relative flex h-full w-full items-center justify-center p-4">
            <div className="w-full max-w-sm text-center">
              {/* 标题 */}
              <div className="animate-float text-4xl">{feedback.earlyEnded ? '🌤️' : '🎉'}</div>
              <div className="animate-kill-slam pixel-text mt-1 text-2xl text-rpg-gold [text-shadow:0_0_22px_rgba(255,213,74,0.65),0_3px_0_rgba(0,0,0,0.6)]">
                {feedback.earlyEnded ? '本局提前结束' : '本局完成！'}
              </div>
              <div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-gray-400">
                <span>{meta.icon}</span>
                <span className="max-w-[220px] truncate">{feedback.title}</span>
              </div>
              {feedback.earlyEnded && (
                <div className="mt-1 text-[10px] text-gray-500">
                  实际投入 {feedback.actualMinutes} 分钟 · 做了多少，就获得多少
                </div>
              )}
              {/* 记录行动补录：标注运动发生时刻 */}
              {feedback.manual && feedback.startTime && (
                <div className="mt-1 text-[10px] text-gray-500">
                  📝 补录 · 发生于{' '}
                  {new Date(feedback.startTime).toLocaleString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              )}

              {/* 核心收益（巨号数字重击弹出 + 滚动） */}
              <div className="relative mt-4 space-y-1.5">
                {feedback.crit && (
                  <div className="pixel-text text-sm text-purple-300 animate-pulse">
                    🎲 暴击！XP ×3
                  </div>
                )}
                <div className="animate-damage-slam font-rpg text-6xl tabular-nums text-rpg-xp drop-shadow-[0_0_16px_rgba(94,234,212,0.45)]">
                  +<CountUp value={feedback.xp} duration={1100} /> <span className="text-xl">XP</span>
                </div>
                <div className="font-rpg text-3xl tabular-nums text-rpg-gold">
                  +<CountUp value={feedback.coins} duration={1100} /> <span className="text-base">💰</span>
                </div>
                {feedback.buffName && (
                  <div className="text-[10px] text-rpg-gold/90">
                    {feedback.buffIcon} {feedback.buffName}
                    {feedback.crit ? ' 触发！' : ` · ${feedback.buffDetail ?? ''}`}
                  </div>
                )}
                {attrEntries.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    {attrEntries.map(([k, v]) => (
                      <span key={k} className="rounded border border-rpg-border bg-black/40 px-1.5 py-0.5 text-[10px]" style={{ color: ATTRIBUTE_META[k].color }}>
                        {ATTRIBUTE_META[k].icon} {ATTRIBUTE_META[k].cn} +{v}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 新纪录横幅（数字滚动到位后弹出） */}
              {feedback.isNewRecord && (
                <div className="animate-record-banner relative mx-auto mt-3 w-fit rounded-lg border-2 border-rpg-gold bg-rpg-gold/15 px-4 py-1.5 shadow-gold">
                  <span className="pixel-text text-xs text-rpg-gold">🏆 新纪录！</span>
                  <span className="ml-2 text-[11px] font-bold text-rpg-gold">
                    ×{feedback.prevBest.toFixed(2)} → ×{feedback.efficiency.toFixed(2)}
                  </span>
                </div>
              )}

              {/* 统计卡（效率 / 今日累计 / 下一局期待感 + 按钮） */}
              <div
                className={`animate-slide-up relative mt-4 overflow-hidden rounded-2xl border-2 p-4 text-center [animation-fill-mode:backwards] ${
                  feedback.isNewRecord ? 'animate-pulse-glow border-rpg-gold' : 'border-rpg-gold/70'
                }`}
                style={{ animationDelay: '260ms', background: 'rgba(42,26,74,0.85)' }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* 光效 */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-rpg-gold/10 via-transparent to-rpg-xp/10" />

                {/* 效率对比 */}
                <div className="relative rounded-lg border border-rpg-border bg-black/30 py-2.5">
                  <div className="flex items-center justify-around text-xs">
                    <div>
                      <div className="text-[10px] text-gray-500">本局效率</div>
                      <div className="font-bold text-purple-300">×{feedback.efficiency.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-500">历史最高</div>
                      <div className="font-bold text-rpg-gold">
                        ×{Math.max(feedback.prevBest, feedback.efficiency).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  {feedback.isNewRecord && (
                    <div className="mt-1.5 text-[10px] font-bold text-rpg-gold">
                      🎉 新纪录！×{feedback.prevBest.toFixed(2)} → ×{feedback.efficiency.toFixed(2)}
                    </div>
                  )}
                </div>

                {/* 今日累计 */}
                <div className="relative mt-2 flex items-center justify-around rounded-lg border border-rpg-border bg-black/20 py-2 text-[11px] text-gray-400">
                  <span>今日 <b className="text-white">{feedback.todaySessions}</b> 局</span>
                  <span>XP <b className="text-rpg-xp">{feedback.todayXp.toLocaleString()}</b></span>
                  <span>💰 <b className="text-rpg-gold">{feedback.todayCoins.toLocaleString()}</b></span>
                </div>

                {/* 下一局期待感 */}
                <div className="relative mt-2 rounded-lg border border-rpg-xp/40 bg-rpg-xp/5 py-2 text-[11px]">
                  <span className="text-gray-400">下一局预计 </span>
                  <b className="text-rpg-xp">+{feedback.nextXpEstimate.toLocaleString()} XP</b>
                  {feedback.nextEfficiency > feedback.efficiency + 0.001 && (
                    <span className="ml-1 text-purple-300">（效率 ×{feedback.nextEfficiency.toFixed(2)}，你更强了）</span>
                  )}
                </div>

                {/* 按钮：补录的局已经发生，无「再来一局」 */}
                {feedback.manual ? (
                  <button onClick={close} className="rpg-btn-primary relative mt-4 w-full py-2 text-sm font-bold">
                    好的
                  </button>
                ) : (
                  <div className="relative mt-4 flex gap-2">
                    <button onClick={close} className="rpg-btn flex-1 py-2 text-sm">
                      好的
                    </button>
                    <button
                      onClick={again}
                      className="rpg-btn-primary flex-[2] py-2 text-sm font-bold"
                    >
                      ▶ 再来一局
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

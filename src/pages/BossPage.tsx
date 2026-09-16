import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/useGameStore'
import { PageHeader } from '../components/PageHeader'
import { BOSS_ROSTER, bossForStage, bossMaxHp, bossKillCoins } from '../config/bossConfig'
import { bossDefByOrder, describeBossModifier, bossModifierIcon, modifierBonus, nextMondayMidnight } from '../engine/bossEngine'
import { BossParticles } from '../components/BossParticles'
import type { BossModifier } from '../types'

/** 周内倒计时文案 */
const countdownLabel = (): string => {
  const next = nextMondayMidnight()
  const ms = next.getTime() - Date.now()
  if (ms <= 0) return '周一刷新'
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  return days > 0 ? `${days} 天 ${hours} 小时` : `${hours} 小时`
}

/** 本地日期 key（与引擎 dateKey 同口径，dailySessionCap 今日计数展示用） */
const todayKey = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const BossPage: React.FC = () => {
  const navigate = useNavigate()
  const bossState = useGameStore((s) => s.state.bossState)
  const sessions = useGameStore((s) => s.state.sessions)
  const summonExtraBoss = useGameStore((s) => s.summonExtraBoss)

  // 本周对当前 BOSS 造成伤害的局（sessions 里 endTime 在本周内的）
  const weekSessions = useMemo(() => {
    if (!bossState) return []
    const next = nextMondayMidnight().getTime()
    const mondayStart = next - 7 * 86400000
    return (sessions ?? [])
      .filter((s) => {
        const t = new Date(s.endTime).getTime()
        return t >= mondayStart && t < next
      })
      .sort((a, b) => b.startTime.localeCompare(a.startTime))
  }, [sessions, bossState])

  if (!bossState) {
    return (
      <div className="rpg-panel p-8 text-center text-sm text-gray-400 animate-fade-in">
        BOSS 尚未苏醒。刷新页面或开始一局唤醒挑战。
      </div>
    )
  }

  const boss = BOSS_ROSTER.find((b) => b.id === bossState.bossId) ?? bossForStage(bossState.stage)
  const hpPct = Math.max(0, Math.min(100, (bossState.hp / bossState.maxHp) * 100))
  const killed = !!bossState.killedAt
  const kills = bossState.history.filter((h) => h.killed).length
  const killStreak = (() => {
    let n = 0
    for (const h of bossState.history) {
      if (h.killed) n++
      else break
    }
    return n
  })()
  const nextStage = bossState.stage + 1
  // 下周预告：按牌堆推算；牌堆抽完（下届重洗）时未知 → 显示神秘挑战者
  const nextBoss = bossDefByOrder(nextStage, bossState)
  /** 讨伐进行中：本周已造成过伤害（打过但未分胜负） */
  const fighting = !killed && bossState.totalDamage > 0
  /** 追加讨伐 BOSS */
  const extra = bossState.extra
  const extraDef = extra ? (BOSS_ROSTER.find((b) => b.id === extra.bossId) ?? boss) : null
  const extraKilled = !!extra?.killedAt

  // 图鉴：已讨伐过的 BOSS id（历史 + 本周击杀）
  const killedIds = useMemo(() => {
    const s = new Set(bossState.history.filter((h) => h.killed).map((h) => h.bossId))
    if (killed) s.add(bossState.bossId)
    return s
  }, [bossState.history, killed, bossState.bossId])
  // 图鉴行：4 列分组（BOSS_ROSTER 顺序即届数顺序）
  const galleryRows = useMemo(() => {
    const rows: (typeof BOSS_ROSTER[number] & { stageHint: number })[][] = []
    BOSS_ROSTER.forEach((def, i) => {
      const withHint = { ...def, stageHint: i + 1 }
      if (rows.length === 0 || rows[rows.length - 1].length >= 4) rows.push([withHint])
      else rows[rows.length - 1].push(withHint)
    })
    return rows
  }, [])

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ===== 本周 BOSS ===== */}
      <div className="rpg-panel overflow-hidden">
        <div className="relative">
          {/* BOSS 立绘：铺满整行宽度（object-cover 填充 + 呼吸缩放自带宏伟感），
              三层 idle 动画（外层浮动 → 内层呼吸 → 光晕呼吸用主题色变量） */}
          <div
            className={`relative h-[60vh] min-h-[440px] overflow-hidden bg-gradient-to-b from-black/60 to-black/10 ${
              killed ? '' : 'animate-boss-aura'
            }`}
            style={killed ? undefined : ({ '--boss-glow': `${boss.color}66` } as React.CSSProperties)}
          >
            <div className={`absolute inset-0 ${killed ? '' : 'animate-float-slow'}`}>
              <img
                src={boss.portrait}
                alt={boss.name}
                className={`h-full w-full object-cover object-top transition-all duration-500 ${
                  killed ? 'opacity-30 grayscale' : 'animate-boss-breathe'
                }`}
              />
            </div>
            {/* 底部渐隐：立绘与下方信息区衔接 */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-rpg-panel to-transparent" />
            {/* 主题色环境粒子：上升辉光 + 闪烁星尘（击杀后随画面一起淡出） */}
            <div className={`transition-opacity duration-500 ${killed ? 'opacity-0' : 'opacity-100'}`}>
              <BossParticles color={boss.color} />
            </div>
            {/* 届数徽章 */}
            <div className="absolute left-3 top-3 rounded-lg border-2 border-rpg-gold/60 bg-black/70 px-2 py-1">
              <span className="pixel-text text-[10px] text-rpg-gold">第 {bossState.stage} 届</span>
            </div>
            {/* 倒计时 */}
            <div className="absolute right-3 top-3 rounded-lg border-2 border-rpg-border bg-black/70 px-2 py-1">
              <span className="text-[10px] text-gray-300">⏳ 距周一刷新 {countdownLabel()}</span>
            </div>
            {/* 击杀印章 */}
            {killed && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rotate-[-12deg] rounded-xl border-4 border-rpg-gold bg-black/60 px-6 py-2">
                  <span className="pixel-text text-lg text-rpg-gold drop-shadow-[0_0_16px_rgba(255,213,74,0.8)]">
                    讨伐成功
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 名字 / 称号 / 台词 / 血条 */}
          <div className="relative border-t-2 border-rpg-border p-4">
            <div className="text-center">
              <div className="text-base font-bold text-white">{boss.name}</div>
              <div className="mt-0.5 text-xs" style={{ color: boss.color }}>
                「{boss.title}」
              </div>
              <p className="mt-2 text-[11px] italic text-gray-400">{boss.taunt}</p>
            </div>

            {/* 本届限制规则（每届纯随机 1 条；高压契约 = 限制越狠击杀金币越多） */}
            {bossState.modifiers && bossState.modifiers.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-center gap-2 text-[10px] text-gray-500">
                  <span>—— 本届限制 ——</span>
                  <span className="rounded-full border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 font-bold text-amber-300">
                    ⚡ 高压契约 ×{modifierBonus(bossState.modifiers).toFixed(2)}
                  </span>
                </div>
                {bossState.modifiers.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2"
                  >
                    <span className="text-base">{bossModifierIcon(m)}</span>
                    <span className="text-sm text-amber-200">
                      {describeBossModifier(m)}
                      {m.kind === 'dailySessionCap' && !killed && (
                        <span className="text-gray-400">
                          {' '}
                          （今日 {bossState.dailyDate === todayKey() ? (bossState.dailyCount ?? 0) : 0}/{m.count}）
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* 大血条 */}
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-[10px]">
                <span className="text-gray-400">
                  HP {bossState.hp.toLocaleString()} / {bossState.maxHp.toLocaleString()}
                </span>
                <span className="text-rpg-courage">
                  本周累计伤害 {bossState.totalDamage.toLocaleString()}
                </span>
              </div>
              <div className="relative h-6 overflow-hidden rounded-full border-2 border-rpg-border bg-black/60">
                <div
                  className="h-full transition-all duration-700"
                  style={{
                    width: `${hpPct}%`,
                    background: `linear-gradient(90deg, ${boss.color}, ${boss.color}aa)`,
                    boxShadow: `0 0 12px ${boss.color}66`,
                  }}
                />
                {/* 刻度 */}
                {[25, 50, 75].map((p) => (
                  <div key={p} className="absolute inset-y-0 w-px bg-white/20" style={{ left: `${p}%` }} />
                ))}
              </div>
              {killed && (
                <div className="mt-2 text-center text-xs text-rpg-gold">
                  已讨伐 · 下周一 {nextBoss ? nextBoss.name : '神秘挑战者'}（第 {nextStage} 届，HP{' '}
                  {bossMaxHp(nextStage).toLocaleString()}）来袭
                </div>
              )}
            </div>

            {/* 击杀奖励预告 */}
            <div className="mt-3 rounded-lg border border-rpg-gold/30 bg-rpg-gold/5 p-2 text-center">
              <span className="text-[11px] text-gray-300">
                🏆 击杀奖励：<b className="text-rpg-gold">{bossKillCoins(bossState.stage)} 金币</b> + 必掉 1 件
                <span className="text-purple-300">史诗</span>以上背景/服饰
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 追加讨伐（周 BOSS 击杀后解锁） ===== */}
      {killed &&
        (extra && extraDef ? (
          <div className="rpg-panel overflow-hidden animate-slide-up">
            <div className="relative">
              {/* 追加 BOSS 立绘（比周 BOSS 略矮，区分主次） */}
              <div
                className={`relative h-[40vh] min-h-[320px] overflow-hidden bg-gradient-to-b from-black/60 to-black/10 ${
                  extraKilled ? '' : 'animate-boss-aura'
                }`}
                style={extraKilled ? undefined : ({ '--boss-glow': `${extraDef.color}66` } as React.CSSProperties)}
              >
                <div className={`absolute inset-0 ${extraKilled ? '' : 'animate-float-slow'}`}>
                  <img
                    src={extraDef.portrait}
                    alt={extraDef.name}
                    className={`h-full w-full object-cover object-top transition-all duration-500 ${
                      extraKilled ? 'opacity-30 grayscale' : 'animate-boss-breathe'
                    }`}
                  />
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-rpg-panel to-transparent" />
                <div className={`transition-opacity duration-500 ${extraKilled ? 'opacity-0' : 'opacity-100'}`}>
                  <BossParticles color={extraDef.color} />
                </div>
                {/* 追加讨伐徽章 */}
                <div className="absolute left-3 top-3 rounded-lg border-2 border-purple-400/60 bg-black/70 px-2 py-1">
                  <span className="pixel-text text-[10px] text-purple-300">🎲 追加讨伐</span>
                </div>
                {/* 每日有效局剩余（仅 dailySessionCap 规则显示） */}
                {(() => {
                  const cap = extra.modifiers.find((m) => m.kind === 'dailySessionCap') as
                    | Extract<BossModifier, { kind: 'dailySessionCap' }>
                    | undefined
                  if (!cap || extraKilled) return null
                  return (
                    <div className="absolute right-3 top-3 rounded-lg border-2 border-rpg-border bg-black/70 px-2 py-1">
                      <span className="text-[10px] text-gray-300">
                        🧩 今日有效局 {extra.dailyCount}/{cap.count}
                      </span>
                    </div>
                  )
                })()}
                {extraKilled && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="rotate-[-12deg] rounded-xl border-4 border-purple-400 bg-black/60 px-6 py-2">
                      <span className="pixel-text text-lg text-purple-300 drop-shadow-[0_0_16px_rgba(192,132,252,0.8)]">
                        追加讨伐成功
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 名字 / 台词 / 限制规则 / 血条 */}
              <div className="relative border-t-2 border-rpg-border p-4">
                <div className="text-center">
                  <div className="text-base font-bold text-white">{extraDef.name}</div>
                  <div className="mt-0.5 text-xs" style={{ color: extraDef.color }}>
                    「{extraDef.title}」
                  </div>
                  <p className="mt-2 text-[11px] italic text-gray-400">{extraDef.taunt}</p>
                </div>

                {/* 独特限制规则（高压契约同样生效：金币 = 周BOSS 60% × 加成） */}
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-center gap-2 text-[10px] text-gray-500">
                    <span>—— 独特限制 ——</span>
                    <span className="rounded-full border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 font-bold text-amber-300">
                      ⚡ 高压契约 ×{modifierBonus(extra.modifiers).toFixed(2)}
                    </span>
                  </div>
                  {extra.modifiers.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-center gap-2 rounded-lg border border-purple-400/40 bg-purple-400/10 px-3 py-2"
                    >
                      <span className="text-base">{bossModifierIcon(m)}</span>
                      <span className="text-sm text-purple-200">{describeBossModifier(m)}</span>
                    </div>
                  ))}
                </div>

                {/* 血条 */}
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[10px]">
                    <span className="text-gray-400">
                      HP {extra.hp.toLocaleString()} / {extra.maxHp.toLocaleString()}
                    </span>
                    <span className="text-rpg-courage">累计伤害 {extra.totalDamage.toLocaleString()}</span>
                  </div>
                  <div className="relative h-5 overflow-hidden rounded-full border-2 border-rpg-border bg-black/60">
                    <div
                      className="h-full transition-all duration-700"
                      style={{
                        width: `${Math.max(0, Math.min(100, (extra.hp / extra.maxHp) * 100))}%`,
                        background: `linear-gradient(90deg, ${extraDef.color}, ${extraDef.color}aa)`,
                        boxShadow: `0 0 12px ${extraDef.color}66`,
                      }}
                    />
                  </div>
                </div>

                {/* 奖励预告 + 再召唤 */}
                <div className="mt-3 rounded-lg border border-rpg-gold/30 bg-rpg-gold/5 p-2 text-center">
                  <span className="text-[11px] text-gray-300">
                    🏆 击杀奖励：<b className="text-rpg-gold">
                      {Math.round(bossKillCoins(bossState.stage) * 0.6)} 金币
                    </b>{' '}
                    + 35% 概率掉落<span className="text-purple-300">史诗</span>以上背景/服饰
                  </span>
                </div>
                {extraKilled && (
                  <button
                    onClick={() => summonExtraBoss()}
                    className="rpg-btn-primary mt-3 w-full px-4 py-2 text-sm"
                  >
                    🎲 再召唤一位新的强敌
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rpg-panel p-5 text-center">
            <PageHeader
              icon="🎲"
              title="追加讨伐"
              subtitle="召唤一位随机强敌：血量为周 BOSS 的 60%，但限制更苛刻——随机 1~2 条规则，只有满足条件的一局才能造成伤害。"
            />
            <button onClick={() => summonExtraBoss()} className="rpg-btn-primary mt-3 w-full px-4 py-2 text-sm">
              🎲 召唤追加 BOSS · 随机强敌 + 随机限制
            </button>
          </div>
        ))}

      {/* ===== 本周战况 ===== */}
      <div className="rpg-panel p-5">
        <PageHeader
          icon="⚔️"
          title="本周战况"
          subtitle="每局按纯效率产出结算伤害：双倍效率卡、主题加成只影响收益，不影响伤害。"
        />
        {weekSessions.length === 0 ? (
          killed ? (
            <div className="py-6 text-center text-sm text-rpg-gold">
              本周已讨伐成功 · 下周一 {nextBoss ? nextBoss.name : '神秘挑战者'}（第 {nextStage} 届）来袭
            </div>
          ) : (
            <button onClick={() => navigate('/')} className="rpg-btn-primary w-full px-4 py-2 text-sm">
              ⚡ 去开一局 · 对 BOSS 造成伤害
            </button>
          )
        ) : (
          <div className="mt-3 space-y-2">
            {weekSessions.slice(0, 12).map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-lg border border-rpg-border/60 bg-black/20 px-3 py-2"
              >
                <span className="text-sm">⚡</span>
                <span className="min-w-0 flex-1 truncate text-sm text-gray-300">{s.title}</span>
                <span className="text-xs text-gray-500">{s.actualMinutes}min</span>
                <span className="text-sm font-bold text-rpg-courage">
                  {(s.bossDamage ?? s.xpGained).toLocaleString()} DMG
                </span>
              </div>
            ))}
            {weekSessions.length > 12 && (
              <div className="text-center text-xs text-gray-500">…共 {weekSessions.length} 局</div>
            )}
            {/* 本周未讨伐：讨伐进行中（血量未清零且尚有未结算伤害）→ 无按钮；
                讨伐不是进行中（未开局即满血）→ 引导开一局 */}
            {!killed && !fighting && (
              <button onClick={() => navigate('/')} className="rpg-btn-primary mt-2 w-full px-4 py-2 text-sm">
                ⚡ 去开一局 · 对 BOSS 造成伤害
              </button>
            )}
          </div>
        )}
      </div>

      {/* ===== 编年史 ===== */}
      <div className="rpg-panel p-5">
        <div className="flex items-center justify-between">
          <PageHeader icon="📜" title="讨伐编年史" subtitle="历届 BOSS 的战绩墙。" />
          <div className="text-right">
            <div className="pixel-text text-[10px] text-rpg-gold">🏆 {kills} 次讨伐</div>
            {killStreak > 1 && (
              <div className="text-[10px] text-rpg-xp">{killStreak} 连胜</div>
            )}
          </div>
        </div>
        {bossState.history.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-400">
            第一届正在进行——战报将在每周一归档于此。
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {bossState.history.map((h) => {
              const def = BOSS_ROSTER.find((b) => b.id === h.bossId) ?? bossForStage(h.stage)
              return (
                <div
                  key={h.weekKey}
                  className={`rounded-lg border-2 p-2 text-center ${
                    h.killed ? 'border-rpg-gold/60 bg-rpg-gold/10' : 'border-rpg-border bg-black/20'
                  }`}
                  title={`${def.name} · ${def.title}`}
                >
                  <img src={def.portrait} alt={def.name} className="mx-auto h-16 w-16 rounded object-cover" />
                  <div className="mt-1 truncate text-[10px] font-bold text-white">{def.name}</div>
                  <div className="text-[9px] text-gray-500">{h.weekKey}</div>
                  <div className={`mt-0.5 text-[10px] font-bold ${h.killed ? 'text-rpg-gold' : 'text-gray-500'}`}>
                    {h.killed ? '⚔️ 讨伐成功' : '💀 逃脱（未击杀）'}
                  </div>
                  <div className="text-[9px] text-rpg-courage">伤害 {h.totalDamage.toLocaleString()}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ===== BOSS 图鉴（全立绘墙） ===== */}
      <div className="rpg-panel p-5">
        <div className="flex items-center justify-between">
          <PageHeader icon="👑" title="BOSS 图鉴" subtitle={`全部 ${BOSS_ROSTER.length} 尊心魔的立绘墙。`} />
          <div className="text-right">
            <div className="pixel-text text-[10px] text-rpg-gold">
              {killedIds.size} / {BOSS_ROSTER.length}
            </div>
            <div className="text-[10px] text-gray-500">已讨伐</div>
          </div>
        </div>
        <div className="mt-3 space-y-3">
          {galleryRows.map((row, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {row.map((def) => {
                const slain = killedIds.has(def.id)
                const isCurrent = def.id === boss.id && !killed
                return (
                  <div
                    key={def.id}
                    className="group relative overflow-hidden rounded-xl border-2 text-center transition-transform hover:scale-[1.03]"
                    style={{
                      borderColor: slain ? `${def.color}cc` : 'rgba(91,63,143,0.6)',
                      boxShadow: isCurrent ? `0 0 16px ${def.color}66` : undefined,
                    }}
                    title={`${def.name} · ${def.title}\n「${def.taunt}」`}
                  >
                    {/* 立绘：上半身取景（与首页 BOSS 卡同风格） */}
                    <div className="relative h-44 overflow-hidden">
                      <img
                        src={def.portrait}
                        alt={def.name}
                        loading="lazy"
                        className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                        style={{ filter: slain ? undefined : 'saturate(0.55) brightness(0.7)' }}
                      />
                      {/* 底部渐暗保证文字可读 */}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/85 to-transparent" />
                      {/* 状态角标 */}
                      <div className="absolute right-1.5 top-1.5">
                        {isCurrent ? (
                          <span className="rounded-md border border-rpg-gold/70 bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-rpg-gold">
                            本周
                          </span>
                        ) : slain ? (
                          <span className="rounded-md border border-rpg-gold/60 bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-rpg-gold">
                            ⚔️ 已讨伐
                          </span>
                        ) : (
                          <span className="rounded-md border border-rpg-border bg-black/70 px-1.5 py-0.5 text-[9px] text-gray-400">
                            未讨伐
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="bg-black/40 px-2 py-1.5">
                      <div className="truncate text-[11px] font-bold" style={{ color: def.color }}>
                        {def.name}
                      </div>
                      <div className="truncate text-[9px] text-gray-500">{def.title}</div>
                      <div className="mt-0.5 text-[9px] text-gray-600">
                        HP {bossMaxHp(Math.min(def.stageHint ?? 10, 10)).toLocaleString()} · 第 {def.stageHint ?? '?'} 届起
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

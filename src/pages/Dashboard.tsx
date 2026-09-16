import { useEffect, useMemo, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import { Character, useStageSize } from '../components/Character'
import { MotionBar } from '../components/MotionBar'
import { StageAdjust } from '../components/StageAdjust'
import { OutfitSwitcher } from '../components/OutfitSwitcher'
import { ZoomHint, MotionHint } from '../components/Live2DShowcase'
import { XPBar } from '../components/ui/XPBar'
import { AttributePanel } from '../components/ui/AttributePanel'
import { EChart } from '../components/charts/EChart'
import { AiAdvisorPanel } from '../components/AiAdvisorPanel'
import { MinimalActionPanel } from '../components/MinimalActionPanel'
import { ChatPanel } from '../components/ChatPanel'
import { SessionHero } from '../components/SessionHero'
import { SkillPanel } from '../components/SkillPanel'
import { DailyCheckin } from '../components/DailyCheckin'
import { BossCard } from '../components/BossCard'
import { QuestPanel } from '../components/QuestPanel'
import { DOMAIN_META, titleForLevel, nextLevelUnlockReward, levelRewardLabel, radarScaleMax } from '../config/xpConfig'
import { todayKey } from '../engine/xpCalculator'
import { buildDailySettlement } from '../engine/settlements'
import { levelProgress } from '../engine/levelSystem'
import type { ActivityType } from '../types'

/** 今日冒险每页条数 */
const TODAY_PAGE_SIZE = 5

export const Dashboard: React.FC<{ onRecord: () => void }> = ({ onRecord }) => {
  const state = useGameStore((s) => s.state)
  const { player, activities } = state

  const todayActivities = useMemo(
    () => activities.filter((a) => a.createdAt.slice(0, 10) === todayKey()),
    [activities],
  )

  // ===== 今日冒险：收起 + 翻页 =====
  const [todayCollapsed, setTodayCollapsed] = useState(false)
  const [todayPage, setTodayPage] = useState(0)
  const todayReversed = useMemo(() => [...todayActivities].reverse(), [todayActivities])
  const todayTotalPages = Math.max(1, Math.ceil(todayReversed.length / TODAY_PAGE_SIZE))
  const todayPageItems = useMemo(
    () => todayReversed.slice(todayPage * TODAY_PAGE_SIZE, todayPage * TODAY_PAGE_SIZE + TODAY_PAGE_SIZE),
    [todayReversed, todayPage],
  )
  useEffect(() => {
    if (todayPage > todayTotalPages - 1) setTodayPage(todayTotalPages - 1)
  }, [todayPage, todayTotalPages])

  const todayXp = todayActivities.reduce((s, a) => s + a.xp, 0)

  // ===== 角色大舞台尺寸：随视口自适应，上限 460（与背包/商店统一 useStageSize） =====
  const charSize = useStageSize()

  const domainLevels = useMemo(() => {
    // compute a pseudo "domain level" from cumulative xp per type
    const perType = {} as Record<ActivityType, number>
    for (const a of activities) {
      perType[a.type] = (perType[a.type] ?? 0) + a.xp
    }
    return perType
  }, [activities])

  const domainLevel = (xp: number) => {
    // simple: each level needs ~ base*level^1.3 starting at 80
    let lvl = 1
    let need = 80
    let acc = 0
    while (acc + need <= xp && lvl < 99) {
      acc += need
      lvl++
      need = Math.floor(80 * Math.pow(lvl, 1.3))
    }
    return lvl
  }

  const settlement = useMemo(() => buildDailySettlement(state), [state])
  const { needed } = levelProgress(player)

  // radar option for attributes
  // 七轴统一刻度 = 动态上限：不超过等级软上限两倍，也不超过最高属性的 3 倍
  // （最强属性至少占半径 1/3，雷达不会缩成中心一个点）
  const radarMax = radarScaleMax(player.level, player.attributes)
  const radarOption = useMemo(
    () => ({
      tooltip: {},
      radar: {
        indicator: [
          { name: `生命力 ${player.attributes.vitality}`, max: radarMax },
          { name: `智慧 ${player.attributes.wisdom}`, max: radarMax },
          { name: `专注 ${player.attributes.focus}`, max: radarMax },
          { name: `创造 ${player.attributes.creativity}`, max: radarMax },
          { name: `勇气 ${player.attributes.courage}`, max: radarMax },
          { name: `社交 ${player.attributes.connection}`, max: radarMax },
          { name: `自由 ${player.attributes.freedom}`, max: radarMax },
        ],
        radius: '75%',
        splitNumber: 4,
        splitArea: { areaStyle: { color: ['rgba(94,234,212,0.05)', 'rgba(94,234,212,0.1)'] } },
        axisName: { color: '#cbd5e1', fontSize: 10 },
        splitLine: { lineStyle: { color: '#5b3f8f' } },
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: [
                player.attributes.vitality,
                player.attributes.wisdom,
                player.attributes.focus,
                player.attributes.creativity,
                player.attributes.courage,
                player.attributes.connection,
                player.attributes.freedom,
              ],
              areaStyle: { color: 'rgba(94,234,212,0.3)' },
              lineStyle: { color: '#5eead4' },
              itemStyle: { color: '#5eead4' },
            },
          ],
        },
      ],
    }),
    [player.attributes, radarMax],
  )

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ===== v1.0 开始一局（全页最重要的元素） ===== */}
      <SessionHero />

      {/* ===== BOSS 周挑战 ===== */}
      <BossCard />

      {/* ===== 每日签到 ===== */}
      <DailyCheckin />

      {/* ===== Player Card：角色大舞台 + 数据区 ===== */}
      <div className="rpg-panel overflow-hidden">
        {/* 角色大舞台（Live2D 主展示区，约 4 倍原面积） */}
        <div className="relative flex flex-col items-center rounded-xl bg-gradient-to-b from-rpg-panelLight/50 to-transparent px-4 pb-4 pt-5">
          <div className="group relative">
            <StageAdjust storageKey="levelup.dashboard.stage">
              <Character level={player.level} size={charSize} quality={3} />
            </StageAdjust>
            <ZoomHint />
            <MotionHint />
          </div>
          <EvolutionBadge level={player.level} />
          {/* 动作切换（全部动作点击直接播放） + 服饰切换（换装） */}
          <div className="mt-2 w-full max-w-md">
            <MotionBar />
            <div className="mt-1.5">
              <OutfitSwitcher />
            </div>
          </div>
          <div className="mt-2 flex w-full max-w-md flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <span className="pixel-text text-lg text-rpg-gold">Lv.{player.level}</span>
            <span className="text-lg font-bold">{player.name}</span>
            <span className="flex items-center gap-1 text-rpg-gold">💰 {player.coins}</span>
          </div>
          <div className="mt-0.5 text-xs text-purple-300">
            「{player.currentTitle ?? titleForLevel(player.level)}」
          </div>
        </div>

        {/* 数据区 */}
        <div className="border-t-2 border-rpg-border px-5 pb-5 pt-4">
          <XPBar player={player} />

          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rpg-panel-light p-2">
              <div className="text-gray-400">今日 XP</div>
              <div className="text-lg font-bold text-rpg-xp">+{todayXp}</div>
            </div>
            <div className="rpg-panel-light p-2">
              <div className="text-gray-400">总 XP</div>
              <div className="text-lg font-bold text-rpg-gold">{player.totalXp}</div>
            </div>
            <div className="rpg-panel-light p-2">
              <div className="text-gray-400">连续记录</div>
              <div className="text-lg font-bold text-rpg-courage">{state.recordStreak} 天</div>
            </div>
          </div>
        </div>

        {/* attributes */}
        <div className="border-t-2 border-rpg-border p-5">
          <div className="mb-3 pixel-text text-[10px] text-rpg-gold">属性</div>
          <AttributePanel attributes={player.attributes} level={player.level} />
        </div>
      </div>

      {/* ===== Minimal action prompt (low activity detected) ===== */}
      <MinimalActionPanel />

      {/* ===== Today's Adventures ===== */}
      <div className="rpg-panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="pixel-text text-[10px] text-rpg-gold">今日冒险</h2>
            {todayActivities.length > 0 && (
              <span className="text-[10px] text-gray-500">{todayActivities.length} 条 · +{todayXp} XP</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTodayCollapsed((v) => !v)}
              className="rounded-lg border border-rpg-border bg-rpg-panel px-2 py-1 text-[10px] text-gray-400 transition-all hover:text-white"
            >
              {todayCollapsed ? '展开' : '收起'}
            </button>
            <button onClick={onRecord} className="rpg-btn-primary px-3 py-1 text-xs">
              + 记录行动
            </button>
          </div>
        </div>
        {!todayCollapsed && (
          <>
            {todayActivities.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400">
                {state.restMode
                  ? '今天也是你的人生。休息也是冒险的一部分。'
                  : '今天还没有记录任何行动。先行动，再记录。'}
              </div>
            ) : (
              <>
                <div className="space-y-2 animate-fade-in">
                  {todayPageItems.map((a) => {
                    const m = DOMAIN_META[a.type]
                    return (
                      <div
                        key={a.id}
                        className="flex items-center gap-3 rounded-lg border border-rpg-border bg-rpg-panelLight/40 p-2"
                      >
                        <span className="text-xl">{m.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">
                            {a.isEscape && <span className="text-gray-500">[逃避] </span>}
                            {a.title}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {a.durationMinutes ? `${a.durationMinutes}min · ` : ''}
                            {new Date(a.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        {a.xp > 0 && <span className="text-xs font-bold text-rpg-xp">+{a.xp}</span>}
                        {a.xp === 0 && <span className="text-[10px] text-gray-500">已记录</span>}
                      </div>
                    )
                  })}
                </div>
                {todayTotalPages > 1 && (
                  <div className="mt-3 flex items-center justify-center gap-3">
                    <button
                      onClick={() => setTodayPage((p) => Math.max(0, p - 1))}
                      disabled={todayPage === 0}
                      className="rounded-lg border-2 border-rpg-border bg-rpg-panel px-3 py-1 text-[10px] text-gray-300 transition-all hover:border-rpg-gold disabled:opacity-30 disabled:hover:border-rpg-border"
                    >
                      ‹ 上一页
                    </button>
                    <span className="text-[10px] text-gray-400">
                      第 <span className="text-rpg-gold">{todayPage + 1}</span> / {todayTotalPages} 页
                    </span>
                    <button
                      onClick={() => setTodayPage((p) => Math.min(todayTotalPages - 1, p + 1))}
                      disabled={todayPage >= todayTotalPages - 1}
                      className="rounded-lg border-2 border-rpg-border bg-rpg-panel px-3 py-1 text-[10px] text-gray-300 transition-all hover:border-rpg-gold disabled:opacity-30 disabled:hover:border-rpg-border"
                    >
                      下一页 ›
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ===== 周委托任务（今日冒险 Player Card 与职业面板之间） ===== */}
      <QuestPanel />

      {/* ===== Domain panel (职业面板) ===== */}
      <div className="rpg-panel p-5">
        <h2 className="mb-3 pixel-text text-[10px] text-rpg-gold">职业面板</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {(Object.keys(DOMAIN_META) as ActivityType[]).map((t) => {
            const m = DOMAIN_META[t]
            const xp = domainLevels[t] ?? 0
            const lvl = domainLevel(xp)
            return (
              <div
                key={t}
                className="rpg-panel-light flex flex-col items-center gap-1 p-2 text-center"
                style={{ borderColor: m.color + '55' }}
              >
                <span className="text-xl">{m.icon}</span>
                <span className="text-[10px] text-gray-300">{m.label}</span>
                <span className="pixel-text text-xs" style={{ color: m.color }}>
                  Lv.{lvl}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ===== v1.0 领域技能（技能点出口） ===== */}
      <SkillPanel />

      {/* ===== Attribute radar ===== */}
      <div className="rpg-panel p-5">
        <h2 className="mb-3 pixel-text text-[10px] text-rpg-gold">属性雷达</h2>
        <EChart option={radarOption} height={300} />
      </div>

      {/* ===== AI Advisor (rule-based) ===== */}
      <AiAdvisorPanel />

      {/* ===== Companion Chat ===== */}
      <ChatPanel />

      {/* ===== Daily settlement ===== */}
      <div className="rpg-panel border-rpg-xp p-5">
        <h2 className="mb-2 pixel-text text-[10px] text-rpg-xp">今日结算 · DAY {settlement.day}</h2>
        <p className="text-sm leading-relaxed text-gray-200">{settlement.evaluation}</p>
        {settlement.highlights.length > 0 && (
          <div className="mt-3 space-y-1">
            {settlement.highlights.map((h, i) => (
              <div key={i} className="text-xs text-rpg-gold">
                {h}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pb-4 text-center text-[10px] text-gray-500">
        下一级需要 {needed} XP · Lv.{player.level} 的你已经走了这么远
      </div>
    </div>
  )
}

/** 等级奖励预告徽章（角色下方）：下一个等级将解锁的背景 / Live2D 形象 */
const EvolutionBadge: React.FC<{ level: number }> = ({ level }) => {
  const nxt = nextLevelUnlockReward(level)
  return (
    <div className="mt-3 w-full max-w-[180px] text-center">
      <div className="rpg-panel-light border-rpg-gold/50 px-3 py-2">
        <div className="text-[10px] text-gray-400">等级奖励</div>
        {nxt ? (
          <>
            <div className="text-xs font-bold text-rpg-gold">Lv.{nxt.level} 解锁</div>
            <div className="mt-1 text-[9px] text-gray-400">
              {nxt.ids.map(levelRewardLabel).join('、')}
            </div>
          </>
        ) : (
          <>
            <div className="text-xs font-bold text-rpg-gold">全部解锁 ✨</div>
            <div className="mt-1 text-[9px] text-rpg-creativity">你是自己故事的作者</div>
          </>
        )}
      </div>
    </div>
  )
}

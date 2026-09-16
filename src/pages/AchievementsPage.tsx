import { useMemo, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import {
  ACHIEVEMENT_DEFS,
  CATEGORY_META,
  RARITY_META,
  type AchievementDef,
} from '../engine/achievements'
import type { AchievementCategory } from '../types'
import { PageHeader } from '../components/PageHeader'

export const AchievementsPage: React.FC = () => {
  const achievements = useGameStore((s) => s.state.achievements)
  const grant = useGameStore((s) => s.grantCognitiveBreakthrough)
  const [showInsightForm, setShowInsightForm] = useState(false)
  const [insightTitle, setInsightTitle] = useState('')
  const [insightContent, setInsightContent] = useState('')
  const [activeCat, setActiveCat] = useState<AchievementCategory | 'all'>('all')

  const unlockedIds = useMemo(() => new Set(achievements.map((a) => a.id)), [achievements])

  const cognitiveExtras = achievements.filter((a) => a.isCognitive && !ACHIEVEMENT_DEFS.some((d) => d.id === a.id))

  const submitInsight = () => {
    if (!insightTitle.trim() || !insightContent.trim()) return
    grant(insightTitle.trim(), insightContent.trim())
    setInsightTitle('')
    setInsightContent('')
    setShowInsightForm(false)
  }

  // 按分类分组
  const grouped = useMemo(() => {
    const map = new Map<AchievementCategory, AchievementDef[]>()
    for (const def of ACHIEVEMENT_DEFS) {
      const arr = map.get(def.category) ?? []
      arr.push(def)
      map.set(def.category, arr)
    }
    return map
  }, [])

  const cats = Array.from(grouped.keys())

  // 筛选
  const visibleDefs = activeCat === 'all' ? ACHIEVEMENT_DEFS : (grouped.get(activeCat) ?? [])

  const unlockedCount = achievements.length
  const totalCount = ACHIEVEMENT_DEFS.length + cognitiveExtras.length

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="rpg-panel p-5">
        <PageHeader
          icon="🏆"
          title="成就"
          right={<span className="text-xs text-gray-300">{unlockedCount} / {totalCount}</span>}
        />
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-rpg-bg">
          <div
            className="h-full rounded-full bg-gradient-to-r from-rpg-gold to-amber-300 transition-all"
            style={{ width: `${totalCount > 0 ? (unlockedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* cognitive breakthrough recording */}
      <div className="rpg-panel border-rpg-creativity p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="pixel-text text-[10px] text-rpg-creativity">认知突破</h2>
            <p className="mt-1 text-[11px] text-gray-400">
              记录你对自我的一次重要觉察。这不是普通任务，是最珍贵的成就。
            </p>
          </div>
          <button
            onClick={() => setShowInsightForm((v) => !v)}
            className="rpg-btn px-3 py-1 text-xs"
          >
            {showInsightForm ? '收起' : '+ 记录觉察'}
          </button>
        </div>

        {showInsightForm && (
          <div className="mt-3 space-y-2 animate-slide-up">
            <input
              value={insightTitle}
              onChange={(e) => setInsightTitle(e.target.value)}
              placeholder="觉察的标题，例如：重新认识自己"
              className="w-full rounded-lg border-2 border-rpg-border bg-rpg-bg p-2 text-sm focus:border-rpg-creativity focus:outline-none"
            />
            <textarea
              value={insightContent}
              onChange={(e) => setInsightContent(e.target.value)}
              rows={3}
              placeholder="你意识到了什么？"
              className="w-full rounded-lg border-2 border-rpg-border bg-rpg-bg p-2 text-sm focus:border-rpg-creativity focus:outline-none"
            />
            <button onClick={submitInsight} className="rpg-btn-primary px-4 py-1.5 text-xs">
              记录认知突破 (+100 Insight XP)
            </button>
          </div>
        )}

        {cognitiveExtras.length > 0 && (
          <div className="mt-3 space-y-2">
            {cognitiveExtras.map((a) => (
              <div key={a.id} className="rounded-lg border-2 border-rpg-creativity/50 bg-rpg-creativity/10 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🧠</span>
                  <span className="text-sm font-bold text-rpg-creativity">{a.title}</span>
                </div>
                <p className="mt-1 text-[11px] text-gray-300">{a.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 分类筛选 */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveCat('all')}
          className={`rounded-full border px-2.5 py-1 text-[10px] transition-all ${
            activeCat === 'all'
              ? 'border-rpg-gold bg-rpg-gold/20 text-rpg-gold'
              : 'border-rpg-border text-gray-400 hover:text-white'
          }`}
        >
          全部
        </button>
        {cats.map((c) => {
          const meta = CATEGORY_META[c]
          const total = grouped.get(c)!.length
          const got = grouped.get(c)!.filter((d) => unlockedIds.has(d.id)).length
          return (
            <button
              key={c}
              onClick={() => setActiveCat(c)}
              className={`rounded-full border px-2.5 py-1 text-[10px] transition-all ${
                activeCat === c
                  ? 'border-rpg-gold bg-rpg-gold/20 text-rpg-gold'
                  : 'border-rpg-border text-gray-400 hover:text-white'
              }`}
            >
              {meta.icon} {meta.label} {got}/{total}
            </button>
          )
        })}
      </div>

      {/* achievement grid */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visibleDefs.map((def) => {
          const unlocked = unlockedIds.has(def.id)
          const ach = achievements.find((a) => a.id === def.id)
          const rarity = RARITY_META[def.rarity]
          // 隐藏成就未解锁前不展示标题/描述
          const isHiddenLocked = def.hidden && !unlocked
          return (
            <div
              key={def.id}
              className={`rpg-panel flex items-center gap-3 border-l-4 p-3 transition-all ${
                unlocked ? `${rarity.border} opacity-100` : 'border-rpg-border opacity-60 grayscale'
              }`}
            >
              <span className="text-2xl">{isHiddenLocked ? '❔' : def.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-bold">
                    {isHiddenLocked ? '???' : def.title}
                  </span>
                  <span className={`text-[8px] font-bold ${rarity.color}`}>{rarity.label}</span>
                </div>
                <div className="text-[10px] text-gray-400">
                  {isHiddenLocked ? '隐藏成就——满足条件后揭晓' : def.description}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[9px]">
                  {def.xpReward ? <span className="text-rpg-xp">+{def.xpReward} XP</span> : null}
                  {def.coinReward ? <span className="text-rpg-gold">+{def.coinReward} 金币</span> : null}
                  {def.insightXp ? <span className="text-rpg-creativity">+{def.insightXp} Insight</span> : null}
                  {unlocked && ach?.unlockedAt && (
                    <span className="text-rpg-gold">{new Date(ach.unlockedAt).toLocaleDateString('zh-CN')}</span>
                  )}
                </div>
              </div>
              {unlocked && <span className="text-rpg-gold">✓</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

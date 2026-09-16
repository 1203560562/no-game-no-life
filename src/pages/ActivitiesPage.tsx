import { useEffect, useMemo, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import { ACTIVITY_TYPES, DOMAIN_META } from '../config/xpConfig'
import { todayKey } from '../engine/xpCalculator'
import { PageHeader } from '../components/PageHeader'
import type { ActivityType } from '../types'

/** 每页显示的日期分组数 */
const PAGE_SIZE = 5

export const ActivitiesPage: React.FC<{ onRecord: () => void }> = ({ onRecord }) => {
  const activities = useGameStore((s) => s.state.activities)
  const [filter, setFilter] = useState<ActivityType | 'all'>('all')
  /** 日期搜索（'' = 不过滤） */
  const [dateFilter, setDateFilter] = useState('')
  /** 展开的日期分组 */
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  /** 翻页（对日期分组分页） */
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const list = filter === 'all' ? activities : activities.filter((a) => a.type === filter)
    return [...list].reverse()
  }, [activities, filter])

  // group by date
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const a of filtered) {
      const day = a.createdAt.slice(0, 10)
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(a)
    }
    return Array.from(map.entries())
  }, [filtered])

  // 日期搜索过滤
  const searchApplied = useMemo(() => {
    if (!dateFilter) return grouped
    return grouped.filter(([day]) => day === dateFilter)
  }, [grouped, dateFilter])

  // 分页切片
  const totalPages = Math.max(1, Math.ceil(searchApplied.length / PAGE_SIZE))
  const pageGroups = useMemo(
    () => searchApplied.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [searchApplied, page],
  )

  // 数据/筛选变化时：回到第 1 页、最新一天默认展开
  useEffect(() => {
    setPage(0)
    if (grouped.length > 0) setExpanded(new Set([grouped[0][0]]))
    else setExpanded(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, dateFilter, activities.length])

  // 页码越界保护（如数据变少）
  useEffect(() => {
    if (page > totalPages - 1) setPage(totalPages - 1)
  }, [page, totalPages])

  const toggleDay = (day: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  const expandAll = () => setExpanded(new Set(searchApplied.map(([d]) => d)))
  const collapseAll = () => setExpanded(new Set())

  const totalXp = filtered.reduce((s, a) => s + a.xp, 0)
  const todayCount = activities.filter((a) => a.createdAt.slice(0, 10) === todayKey()).length

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="rpg-panel p-5">
        <PageHeader
          icon="📜"
          title="行动记录"
          right={
            <button onClick={onRecord} className="rpg-btn-primary px-3 py-1 text-xs">
              + 记录
            </button>
          }
        />
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rpg-panel-light p-2">
            <div className="text-gray-400">总行动</div>
            <div className="text-lg font-bold text-rpg-xp">{activities.length}</div>
          </div>
          <div className="rpg-panel-light p-2">
            <div className="text-gray-400">今日</div>
            <div className="text-lg font-bold text-rpg-gold">{todayCount}</div>
          </div>
          <div className="rpg-panel-light p-2">
            <div className="text-gray-400">累计 XP</div>
            <div className="text-lg font-bold text-rpg-courage">{totalXp}</div>
          </div>
        </div>
      </div>

      {/* filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`rounded-lg border-2 px-3 py-1 text-[10px] transition-all ${
            filter === 'all' ? 'border-rpg-gold bg-rpg-panelLight' : 'border-rpg-border bg-rpg-panel'
          }`}
        >
          全部
        </button>
        {ACTIVITY_TYPES.map((t) => {
          const m = DOMAIN_META[t]
          return (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`rounded-lg border-2 px-3 py-1 text-[10px] transition-all ${
                filter === t ? 'border-rpg-gold bg-rpg-panelLight' : 'border-rpg-border bg-rpg-panel'
              }`}
            >
              {m.icon} {m.label}
            </button>
          )
        })}
      </div>

      {/* 搜索日期 + 展开/收起全部 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-lg border-2 border-rpg-border bg-rpg-panel px-2 py-1">
          <span className="text-[10px] text-gray-400">📅 搜索日期</span>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-transparent text-[11px] text-gray-200 outline-none [color-scheme:dark]"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter('')}
              className="text-[10px] text-gray-500 hover:text-white"
              title="清除日期筛选"
            >
              ✕
            </button>
          )}
        </div>
        <button onClick={expandAll} className="rounded-lg border border-rpg-border bg-rpg-panel px-2 py-1 text-[10px] text-gray-400 transition-all hover:text-white">
          展开全部
        </button>
        <button onClick={collapseAll} className="rounded-lg border border-rpg-border bg-rpg-panel px-2 py-1 text-[10px] text-gray-400 transition-all hover:text-white">
          收起全部
        </button>
        <span className="ml-auto text-[10px] text-gray-500">
          {dateFilter ? `筛选 ${searchApplied.length} 天` : `共 ${searchApplied.length} 天`}
        </span>
      </div>

      {/* grouped list */}
      {searchApplied.length === 0 ? (
        <div className="rpg-panel p-8 text-center text-sm text-gray-400">
          {dateFilter ? '这一天没有记录。' : '还没有记录。先行动，再记录。'}
        </div>
      ) : (
        <div className="space-y-4">
          {pageGroups.map(([day, items]) => {
            const dayXp = items.reduce((s, a) => s + a.xp, 0)
            const d = new Date(day)
            const isToday = day === todayKey()
            const isOpen = expanded.has(day)
            return (
              <div key={day} className="rpg-panel overflow-hidden p-4">
                <button
                  onClick={() => toggleDay(day)}
                  className="mb-1 flex w-full items-center justify-between rounded px-1 py-0.5 text-left transition-colors hover:bg-rpg-panelLight/40"
                >
                  <span className="flex items-center gap-1.5 text-xs text-gray-300">
                    <span
                      className="inline-block transition-transform duration-200 text-gray-500"
                      style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    >
                      ▶
                    </span>
                    {isToday ? '今天 · ' : ''}
                    {d.getMonth() + 1}月{d.getDate()}日
                    <span className="text-[10px] text-gray-500">（{items.length} 条）</span>
                  </span>
                  <span className="text-xs text-rpg-xp">+{dayXp} XP</span>
                </button>
                {isOpen && (
                  <div className="space-y-2 animate-fade-in pt-1">
                    {items.map((a) => {
                      const m = DOMAIN_META[a.type]
                      return (
                        <div
                          key={a.id}
                          className="flex items-start gap-3 rounded-lg border border-rpg-border bg-rpg-panelLight/40 p-2"
                        >
                          <span className="text-lg">{m.icon}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm">
                              {a.isEscape && <span className="text-gray-500">[逃避] </span>}
                              {a.title}
                              {a.subtype && <span className="text-[10px] text-gray-400"> · {a.subtype}</span>}
                            </div>
                            {a.description && (
                              <div className="mt-0.5 text-[11px] text-gray-400">{a.description}</div>
                            )}
                            <div className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-gray-500">
                              {a.durationMinutes ? <span>{a.durationMinutes}min</span> : null}
                              {a.intensity && <span>{a.intensity}</span>}
                              {a.difficulty && <span>难度 {a.difficulty}</span>}
                              {a.proactive && <span className="text-rpg-gold">主动</span>}
                              <span>
                                {new Date(a.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-rpg-xp">+{a.xp}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* 翻页控件 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border-2 border-rpg-border bg-rpg-panel px-3 py-1 text-[10px] text-gray-300 transition-all hover:border-rpg-gold disabled:opacity-30 disabled:hover:border-rpg-border"
              >
                ‹ 上一页
              </button>
              <span className="text-[10px] text-gray-400">
                第 <span className="text-rpg-gold">{page + 1}</span> / {totalPages} 页
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-lg border-2 border-rpg-border bg-rpg-panel px-3 py-1 text-[10px] text-gray-300 transition-all hover:border-rpg-gold disabled:opacity-30 disabled:hover:border-rpg-border"
              >
                下一页 ›
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

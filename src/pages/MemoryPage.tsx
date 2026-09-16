import { useState, useMemo } from 'react'
import { useGameStore } from '../store/useGameStore'
import { PageHeader } from '../components/PageHeader'
import { getMemoryStats } from '../ai/memory/lifecycle'
import type { MemoryType, MemoryLevel } from '../types'

const TYPE_LABELS: Record<MemoryType, string> = {
  USER_PREFERENCE: '偏好',
  USER_GOAL: '目标',
  USER_INTEREST: '兴趣',
  USER_PATTERN: '模式',
  IMPORTANT_EVENT: '重要事件',
  COGNITIVE_INSIGHT: '认知洞察',
  HABIT: '习惯',
  PERSONAL_VALUE: '价值观',
}

const LEVEL_LABELS: Record<MemoryLevel, string> = {
  1: '普通',
  2: '长期事实',
  3: '重要认知',
  4: '核心长期',
}

const LEVEL_COLORS: Record<MemoryLevel, string> = {
  1: 'text-gray-400',
  2: 'text-blue-300',
  3: 'text-purple-300',
  4: 'text-rpg-gold',
}

export const MemoryPage: React.FC = () => {
  const memories = useGameStore((s) => s.state.memories ?? [])
  const blacklist = useGameStore((s) => s.state.memoryBlacklist ?? [])
  const updateMemory = useGameStore((s) => s.updateMemory)
  const deleteMemory = useGameStore((s) => s.deleteMemory)

  const [filterType, setFilterType] = useState<MemoryType | 'all'>('all')
  const [filterLevel, setFilterLevel] = useState<MemoryLevel | 'all'>('all')
  const [showArchived, setShowArchived] = useState(false)

  const stats = useMemo(
    () => getMemoryStats(useGameStore.getState().state),
    [memories],
  )

  const filtered = useMemo(() => {
    return memories
      .filter((m) => (showArchived ? true : m.status === 'active'))
      .filter((m) => filterType === 'all' || m.type === filterType)
      .filter((m) => filterLevel === 'all' || m.level === filterLevel)
      .sort((a, b) => {
        // active 优先，然后按 level 降序，再按时间倒序
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1
        if (a.level !== b.level) return b.level - a.level
        return b.createdAt.localeCompare(a.createdAt)
      })
  }, [memories, filterType, filterLevel, showArchived])

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 标题与统计 */}
      <div className="rpg-panel p-5">
        <PageHeader
          icon="🧠"
          title="我的 AI 记忆"
          subtitle="AI 记住了关于你的信息。你可以查看、删除或标记错误。"
        />

        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          <div className="rounded-lg border border-rpg-border bg-rpg-panelLight/50 p-2">
            <div className="text-lg font-bold text-rpg-gold">{stats.active}</div>
            <div className="text-[9px] text-gray-500">活跃</div>
          </div>
          <div className="rounded-lg border border-rpg-border bg-rpg-panelLight/50 p-2">
            <div className="text-lg font-bold text-gray-400">{stats.archived}</div>
            <div className="text-[9px] text-gray-500">已归档</div>
          </div>
          <div className="rounded-lg border border-rpg-border bg-rpg-panelLight/50 p-2">
            <div className="text-lg font-bold text-gray-400">{stats.deprecated}</div>
            <div className="text-[9px] text-gray-500">已失效</div>
          </div>
          <div className="rounded-lg border border-rpg-border bg-rpg-panelLight/50 p-2">
            <div className="text-lg font-bold text-cyan-300">{(stats.avgConfidence * 100).toFixed(0)}%</div>
            <div className="text-[9px] text-gray-500">平均置信</div>
          </div>
        </div>
      </div>

      {/* 过滤器 */}
      <div className="rpg-panel flex flex-wrap items-center gap-2 p-3">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as MemoryType | 'all')}
          className="rounded-lg border border-rpg-border bg-rpg-panel px-2 py-1 text-xs text-gray-300"
        >
          <option value="all">全部类型</option>
          {(Object.keys(TYPE_LABELS) as MemoryType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>

        <select
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value as MemoryLevel | 'all')}
          className="rounded-lg border border-rpg-border bg-rpg-panel px-2 py-1 text-xs text-gray-300"
        >
          <option value="all">全部级别</option>
          {(Object.keys(LEVEL_LABELS) as unknown as MemoryLevel[]).map((l) => (
            <option key={l} value={l}>L{l} {LEVEL_LABELS[l]}</option>
          ))}
        </select>

        <label className="flex items-center gap-1 text-[10px] text-gray-400">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-3 w-3"
          />
          显示归档
        </label>
      </div>

      {/* 记忆列表 */}
      {filtered.length === 0 ? (
        <div className="rpg-panel p-8 text-center text-sm text-gray-500">
          {memories.length === 0
            ? 'AI 还没有记住任何东西。随着你记录活动和与 AI 对话，记忆会逐渐积累。'
            : '没有符合条件的记忆。'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((mem) => (
            <div
              key={mem.id}
              className={`rpg-panel border-l-4 p-3 ${
                mem.status === 'archived'
                  ? 'border-l-gray-600 opacity-50'
                  : mem.status === 'deprecated'
                    ? 'border-l-red-700 opacity-50'
                    : mem.userFlagged === 'wrong'
                      ? 'border-l-red-500'
                      : 'border-l-rpg-gold'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold ${LEVEL_COLORS[mem.level]}`}>
                      L{mem.level} {LEVEL_LABELS[mem.level]}
                    </span>
                    <span className="rounded bg-rpg-panelLight px-1.5 py-0.5 text-[9px] text-gray-400">
                      {TYPE_LABELS[mem.type]}
                    </span>
                    <span className="text-[9px] text-gray-500">
                      置信 {(mem.confidence * 100).toFixed(0)}%
                    </span>
                    {mem.source === 'explicit_user_statement' && (
                      <span className="text-[9px] text-green-400">用户确认</span>
                    )}
                    {mem.userFlagged === 'wrong' && (
                      <span className="text-[9px] text-red-400">已标记错误</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-200">{mem.content}</p>
                  <div className="mt-1 text-[9px] text-gray-600">
                    {new Date(mem.createdAt).toLocaleDateString()} ·
                    使用 {mem.useCount} 次
                    {mem.lastConfirmedAt && ` · 确认于 ${new Date(mem.lastConfirmedAt).toLocaleDateString()}`}
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex flex-col gap-1">
                  {mem.status === 'active' && mem.userFlagged !== 'wrong' && (
                    <button
                      onClick={() => updateMemory(mem.id, { userFlagged: 'wrong' })}
                      className="rounded border border-amber-700/50 px-2 py-0.5 text-[9px] text-amber-400 hover:bg-amber-900/20"
                    >
                      标记错误
                    </button>
                  )}
                  {mem.userFlagged === 'wrong' && (
                    <button
                      onClick={() => updateMemory(mem.id, { userFlagged: null })}
                      className="rounded border border-rpg-border px-2 py-0.5 text-[9px] text-gray-400 hover:bg-rpg-panelLight"
                    >
                      取消标记
                    </button>
                  )}
                  {mem.status === 'active' && (
                    <button
                      onClick={() => updateMemory(mem.id, { status: 'archived' })}
                      className="rounded border border-rpg-border px-2 py-0.5 text-[9px] text-gray-400 hover:bg-rpg-panelLight"
                    >
                      归档
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (confirm('确定删除这条记忆？此操作不可撤销。')) {
                        deleteMemory(mem.id)
                      }
                    }}
                    className="rounded border border-red-800/50 px-2 py-0.5 text-[9px] text-red-400 hover:bg-red-900/20"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 禁止记忆主题 */}
      {blacklist.length > 0 && (
        <div className="rpg-panel p-4">
          <h3 className="text-[10px] text-gray-400">禁止 AI 记忆的主题</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {blacklist.map((topic) => (
              <span
                key={topic}
                className="rounded-full border border-red-800/50 bg-red-900/10 px-2 py-0.5 text-[10px] text-red-400"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

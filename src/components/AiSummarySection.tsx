/**
 * AI 总结区块组件
 *
 * 在报告页展示 AI 生成的日/周/月总结。
 * 支持手动触发生成、loading 状态、回退提示。
 */

import { useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import {
  generateDailySummary,
  generateWeeklyAnalysis,
  generateMonthlySummary,
  type AISummary,
} from '../ai/aiSummary'

type SummaryKind = 'daily' | 'weekly' | 'monthly'

interface SummaryState {
  loading: boolean
  summary: AISummary | null
}

export const AiSummarySection: React.FC = () => {
  const state = useGameStore((s) => s.state)
  const [daily, setDaily] = useState<SummaryState>({ loading: false, summary: null })
  const [weekly, setWeekly] = useState<SummaryState>({ loading: false, summary: null })
  const [monthly, setMonthly] = useState<SummaryState>({ loading: false, summary: null })

  const generate = async (kind: SummaryKind) => {
    const setter = kind === 'daily' ? setDaily : kind === 'weekly' ? setWeekly : setMonthly
    setter({ loading: true, summary: null })

    try {
      const result =
        kind === 'daily'
          ? await generateDailySummary(state)
          : kind === 'weekly'
            ? await generateWeeklyAnalysis(state)
            : await generateMonthlySummary(state)
      setter({ loading: false, summary: result })
    } catch (e) {
      setter({
        loading: false,
        summary: {
          content: '生成失败，请稍后重试。',
          suggestions: [],
          fromAI: false,
          fallbackReason: e instanceof Error ? e.message : '未知错误',
        },
      })
    }
  }

  return (
    <div className="rpg-panel border-rpg-xp/40 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg">✨</span>
        <h2 className="pixel-text text-[10px] text-rpg-xp">AI 深度总结</h2>
      </div>

      <div className="space-y-3">
        <SummaryCard
          title="今日 AI 总结"
          icon="📅"
          kind="daily"
          state={daily}
          onGenerate={() => generate('daily')}
        />
        <SummaryCard
          title="本周 AI 分析"
          icon="📈"
          kind="weekly"
          state={weekly}
          onGenerate={() => generate('weekly')}
        />
        <SummaryCard
          title="30 天 AI 总结"
          icon="🌙"
          kind="monthly"
          state={monthly}
          onGenerate={() => generate('monthly')}
        />
      </div>
    </div>
  )
}

interface SummaryCardProps {
  title: string
  icon: string
  kind: SummaryKind
  state: SummaryState
  onGenerate: () => void
}

const SummaryCard: React.FC<SummaryCardProps> = ({ title, icon, state, onGenerate }) => {
  return (
    <div className="rounded-lg border border-rpg-border bg-rpg-panelLight/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span>{icon}</span>
          <span className="text-xs text-gray-300">{title}</span>
        </div>
        <button
          onClick={onGenerate}
          disabled={state.loading}
          className="rounded border border-rpg-xp/50 bg-rpg-xp/10 px-2 py-0.5 text-[10px] text-rpg-xp transition-all hover:bg-rpg-xp/20 disabled:opacity-50"
        >
          {state.loading ? '生成中...' : state.summary ? '重新生成' : '生成'}
        </button>
      </div>

      {state.loading && (
        <div className="flex items-center gap-2 py-3 text-[10px] text-gray-500">
          <span className="animate-pulse">⏳</span>
          AI 正在分析你的数据...
        </div>
      )}

      {!state.loading && state.summary && (
        <div className="space-y-2">
          <p className="text-xs leading-relaxed text-gray-200 whitespace-pre-wrap">
            {state.summary.content}
          </p>

          {state.summary.suggestions.length > 0 && (
            <div className="border-t border-rpg-border pt-2">
              <div className="mb-1 text-[10px] text-gray-500">建议</div>
              <ul className="space-y-1">
                {state.summary.suggestions.map((s, i) => (
                  <li key={i} className="text-[11px] text-rpg-xp">
                    • {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!state.summary.fromAI && (
            <div className="text-[9px] text-gray-600">
              ⚠ 规则引擎回退{state.summary.fallbackReason ? `（${state.summary.fallbackReason}）` : ''}
            </div>
          )}
        </div>
      )}

      {!state.loading && !state.summary && (
        <div className="py-2 text-[10px] text-gray-600">
          点击"生成"让 AI 分析你的数据
        </div>
      )}
    </div>
  )
}

/**
 * Live2D 动作切换条（页面内直接点击播放，无需打开细节查看器）
 *
 * - 订阅全局形象选择（live2dModels.ts），fetch 模型 json 解析全部动作
 *   （moc3: FileReferences.Motions，Cubism 2: motions；File/file 大小写兜底）
 * - 点击 → lib/live2dMotionBus 请求播放 → 主画框 Live2DCharacter 执行
 * - 高亮最近播放的动作；切换形象时清单自动刷新
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { getModelChoice, subscribeModelChoice, LIVE2D_MODELS } from '../config/live2dModels'
import { requestPlayMotion } from '../lib/live2dMotionBus'

interface MotionItem {
  group: string
  index: number
  label: string
}

/** 解析模型 json 的动作清单（与 Live2DInspector 同规则：文件名去路径去后缀作显示名） */
const parseMotions = (j: unknown): MotionItem[] => {
  const obj = j as {
    FileReferences?: { Motions?: Record<string, Array<{ File?: string }>> }
    motions?: Record<string, Array<{ file?: string }>>
  }
  const defs: Record<string, Array<{ File?: string; file?: string }>> =
    obj.FileReferences?.Motions ?? obj.motions ?? {}
  const list: MotionItem[] = []
  for (const [group, arr] of Object.entries(defs)) {
    ;(arr ?? []).forEach((mo: { File?: string; file?: string }, index: number) => {
      const file = mo.File ?? mo.file ?? ''
      const label =
        file.split('/').pop()?.replace(/\.(motion3|mt[n3]?|mtn)\.?(json)?$/i, '') ?? `${index + 1}`
      list.push({ group, index, label: label || `${index + 1}` })
    })
  }
  return list
}

export const MotionBar: React.FC = () => {
  const modelId = useSyncExternalStore(subscribeModelChoice, getModelChoice)
  const modelDef = LIVE2D_MODELS.find((m) => m.id === modelId) ?? LIVE2D_MODELS[0]

  const [motions, setMotions] = useState<MotionItem[]>([])
  const [active, setActive] = useState('')

  // 形象切换 → 重新拉取该模型的动作清单
  useEffect(() => {
    let cancelled = false
    setMotions([])
    setActive('')
    fetch(modelDef.url)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setMotions(parseMotions(j))
      })
      .catch(() => {
        /* 模型 json 拉取失败 → 动作条静默隐藏（motions 为空） */
      })
    return () => {
      cancelled = true
    }
  }, [modelDef.url])

  if (motions.length === 0) return null

  const play = (m: MotionItem) => {
    requestPlayMotion(m.group, m.index)
    setActive(`${m.group}#${m.index}`)
  }

  return (
    <div className="w-full">
      <div className="mb-1 text-center text-[10px] text-gray-500">
        动作切换 · {motions.length} 个（点击直接播放）
      </div>
      <div className="flex max-h-24 flex-wrap justify-center gap-1 overflow-y-auto px-1">
        {motions.map((m) => (
          <button
            key={`${m.group}#${m.index}`}
            onClick={() => play(m)}
            title={m.group === '' ? m.label : `${m.group} / ${m.label}`}
            className={`rounded border px-1.5 py-0.5 text-[9px] transition-all ${
              active === `${m.group}#${m.index}`
                ? 'border-rpg-gold bg-rpg-gold/20 text-rpg-gold'
                : 'border-rpg-border bg-rpg-panel text-gray-300 hover:border-rpg-gold/60 hover:text-rpg-gold'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}

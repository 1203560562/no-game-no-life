import { ATTRIBUTE_KEYS, ATTRIBUTE_META, attributeCap } from '../../config/xpConfig'
import type { Attributes } from '../../types'

export const AttributePanel: React.FC<{
  attributes: Attributes
  gains?: Record<string, number>
  compact?: boolean
  /** 玩家等级：决定属性软上限（默认按 Lv20 估算） */
  level?: number
}> = ({ attributes, gains, compact, level = 20 }) => {
  // 高天花板 + 超限「突破」：条长逼近满格有成长感，溢出亮徽章庆祝而非截断
  const cap = attributeCap(level)
  return (
    <div className={compact ? 'grid grid-cols-1 gap-1.5' : 'grid grid-cols-1 gap-2'}>
      {ATTRIBUTE_KEYS.map((key) => {
        const meta = ATTRIBUTE_META[key]
        const val = attributes[key]
        const gain = gains?.[key] ?? 0
        const over = val > cap
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="w-5 text-center text-sm">{meta.icon}</span>
            <span className="w-20 text-xs text-gray-300">{meta.cn}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-rpg-bg">
              <div
                className={`h-full rounded-full transition-all duration-500 ${over ? 'animate-pulse-glow' : ''}`}
                style={{ width: `${Math.min(100, (val / cap) * 100)}%`, backgroundColor: meta.color }}
              />
            </div>
            <span className="w-8 text-right text-xs font-bold" style={{ color: meta.color }}>
              {val}
            </span>
            {over && (
              <span className="animate-pop-in text-[10px] font-bold text-rpg-gold" title={`超出等级上限 ${cap}`}>
                ✨突破
              </span>
            )}
            {!over && gain > 0 && (
              <span className="animate-pop-in text-[10px] font-bold text-rpg-xp">+{gain}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

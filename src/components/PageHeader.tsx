/**
 * 统一页面标题（图标一致性：emoji 与底部导航 NAV 一一呼应，层级/字号/配色统一）
 *
 * - emoji 取自 App.tsx NAV 的同页面 icon，进页面后视觉延续
 * - 层级统一 h1 + pixel-text text-sm text-rpg-gold（原各页 h2 text-[10px] 大小不一）
 * - right 插槽放页面级附加信息（金币余额/统计数等）
 */
export const PageHeader: React.FC<{
  /** 与导航一致的 emoji 图标 */
  icon: string
  /** 页面标题 */
  title: string
  /** 右侧附加区（金币/计数等） */
  right?: React.ReactNode
  /** 标题下说明文字 */
  subtitle?: string
}> = ({ icon, title, right, subtitle }) => (
  <div className="flex items-center justify-between gap-2">
    <div className="min-w-0">
      <h1 className="pixel-text text-sm text-rpg-gold">
        <span className="mr-1.5">{icon}</span>
        {title}
      </h1>
      {subtitle && <p className="mt-1 text-[11px] text-gray-400">{subtitle}</p>}
    </div>
    {right && <div className="flex shrink-0 items-center gap-3">{right}</div>}
  </div>
)

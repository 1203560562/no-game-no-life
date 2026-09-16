import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '../store/useGameStore'

/**
 * GitHub 贡献图风格年度热力图（近 53 周 × 7 天）：
 * 每格 = 当日 XP，五档 teal 配色（0 → 空档），悬停显示当日明细。
 * 数据源 dailyXpLog（无新数据采集，纯只读派生）。
 *
 * 交互细节：
 * - 月份标签与格子同处横向滚动区，滚动不错位；
 * - 默认滚动到最右端（最近的一周）——窄窗口下最新数据优先可见；
 * - 悬停明细用游戏风格自定义 tooltip（原生 title 的系统字体与像素风不搭）。
 */

const WEEKS = 53
/** 五档配色（0 档为空） */
const LEVEL_COLORS = ['#0d2733', '#155e75', '#0d9488', '#14b8a6', '#5eead4']
/** 分档阈值（相对当期最大值） */
const levelOf = (xp: number, max: number): number => {
  if (xp <= 0) return 0
  if (max <= 0) return 1
  const q = Math.ceil((xp / max) * 4)
  return Math.max(1, Math.min(4, q))
}

const fmtDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

interface Cell {
  date: string
  xp: number
  level: number
  future: boolean
}

/** 悬停明细（游戏风格 tooltip） */
interface HoverInfo {
  date: string
  xp: number
  sessions: number
  x: number
  y: number
}

export const HeatmapCalendar: React.FC = () => {
  const dailyXpLog = useGameStore((s) => s.state.dailyXpLog)
  const sessions = useGameStore((s) => s.state.sessions)
  const [hover, setHover] = useState<HoverInfo | null>(null)

  // 本周周一为网格最后一列；往前 52 列
  const { columns, monthLabels, sessionCounts } = useMemo(() => {
    const now = new Date()
    const day = now.getDay() === 0 ? 7 : now.getDay()
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (day - 1))
    const start = new Date(thisMonday)
    start.setDate(start.getDate() - (WEEKS - 1) * 7)

    // 每日局数（tooltip 用）
    const sessionCount: Record<string, number> = {}
    for (const s of sessions ?? []) {
      const k = s.endTime.slice(0, 10)
      sessionCount[k] = (sessionCount[k] ?? 0) + 1
    }

    let max = 0
    const cols: Cell[][] = []
    for (let w = 0; w < WEEKS; w++) {
      const col: Cell[] = []
      for (let d = 0; d < 7; d++) {
        const date = new Date(start)
        date.setDate(start.getDate() + w * 7 + d)
        const key = fmtDate(date)
        const future = date > now
        const xp = future ? 0 : dailyXpLog[key] ?? 0
        if (xp > max) max = xp
        col.push({ date: key, xp, level: 0, future })
      }
      cols.push(col)
    }
    // 月份标签（GitHub 风格）：每月 1 日落在哪一列，标签就打在哪一列——
    // 旧逻辑按「周一所在月份」打标，最后一个月（1 日不在周一的列）会漏标
    const labels: { col: number; text: string }[] = []
    let lastLabelMonth = -1
    for (let w = 0; w < WEEKS; w++) {
      for (let d = 0; d < 7; d++) {
        const date = new Date(start)
        date.setDate(start.getDate() + w * 7 + d)
        if (date.getDate() === 1) {
          const m = date.getMonth()
          if (m !== lastLabelMonth) {
            lastLabelMonth = m
            labels.push({ col: w, text: `${m + 1}月` })
          }
          break
        }
      }
    }
    // 分档（依赖 max，第二遍）
    for (const col of cols) {
      for (const c of col) c.level = levelOf(c.xp, max)
    }
    return { columns: cols, monthLabels: labels, sessionCounts: sessionCount }
  }, [dailyXpLog, sessions])

  const totalXp = useMemo(
    () => columns.flat().reduce((s, c) => s + c.xp, 0),
    [columns],
  )
  const activeDays = useMemo(
    () => columns.flat().filter((c) => !c.future && c.xp > 0).length,
    [columns],
  )

  return (
    <div>
      {/* 统计行 + 行末色阶图例：图例放这里避免与右端密集的月份标签重叠
          （网格已撑满容器宽，统计行右缘与网格右缘对齐） */}
      <div className="mb-2 flex items-center justify-between text-[10px] text-gray-400">
        <span>
          近一年：<b className="text-rpg-xp">{totalXp.toLocaleString()} XP</b> ·{' '}
          <b className="text-white">{activeDays}</b> 个活跃日
        </span>
        <div className="flex items-center gap-1">
          <span className="text-gray-600">少</span>
          {LEVEL_COLORS.map((c) => (
            <span key={c} className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: c }} />
          ))}
          <span className="text-gray-600">多</span>
        </div>
      </div>
      {/* 网格整体撑满容器宽：53 列弹性拉伸，左右边缘与面板内容区精确对齐，
          不出横向滚动框（窄容器时格子压缩自适应，min-w-[8px] 兜底） */}
      <div className="pb-1">
        <div className="w-full">
          {/* 月份标签行（按列百分比定位，与拉伸后的列对齐；窄屏隔月抽稀防挤叠） */}
          <div className="relative mb-0.5 ml-[18px] h-3.5 text-[9px] text-gray-500">
            {monthLabels.map((l) => (
              <span
                key={l.col}
                className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap"
                style={{ left: `${(l.col / (WEEKS - 1)) * 100}%` }}
              >
                {l.text}
              </span>
            ))}
          </div>
          <div className="flex w-full items-stretch gap-[3px]">
            {/* 星期标签列：与格子列同构的 7 行结构，一/四/日 对齐第 1/4/7 行 */}
            <div className="mr-0.5 flex w-4 flex-col gap-[3px] text-[8px] leading-none text-gray-600">
              {['一', '', '', '四', '', '', '日'].map((d, i) => (
                <span key={i} className="flex aspect-square w-4 items-center justify-center">
                  {d}
                </span>
              ))}
            </div>
            {columns.map((col, i) => (
              <div key={i} className="flex flex-1 flex-col gap-[3px]">
                {col.map((c) => (
                  <span
                    key={c.date}
                    className={`aspect-square w-full rounded-sm transition-transform hover:scale-125 ${
                      c.future ? 'opacity-0' : 'cursor-default'
                    }`}
                    style={{ backgroundColor: LEVEL_COLORS[c.level] }}
                    onMouseEnter={
                      c.future
                        ? undefined
                        : (e) => {
                            setHover({
                              date: c.date,
                              xp: c.xp,
                              sessions: sessionCounts[c.date] ?? 0,
                              // 跟随鼠标指针：tooltip 出现在光标旁
                              x: e.clientX,
                              y: e.clientY,
                            })
                          }
                    }
                    onMouseMove={
                      c.future
                        ? undefined
                        : (e) => {
                            // 格子只有 11px，指针稍一偏移就离开：跟随鼠标移动，离开格子才消失
                            setHover((h) =>
                              h && h.date === c.date ? { ...h, x: e.clientX, y: e.clientY } : h,
                            )
                          }
                    }
                    onMouseLeave={() => setHover(null)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 悬停明细：跟随鼠标指针的游戏风格 tooltip。
          必须 Portal 到 body —— 祖先 rpg-panel 带 backdrop-blur，会为 fixed 后代
          创建 containing block，导致 tooltip 相对面板而非视口定位（偏到页面右侧）。 */}
      {hover &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[95] max-w-[220px] rounded-xl border-2 border-rpg-gold/60 bg-rpg-panel px-4 py-2.5 shadow-gold"
            style={{
              left: hover.x + 18 > window.innerWidth - 230 ? hover.x - 18 : hover.x + 18,
              top: Math.max(12, hover.y - 52),
              transform: hover.x + 18 > window.innerWidth - 230 ? 'translateX(-100%)' : undefined,
            }}
          >
            <div className="font-rpg text-[11px] tracking-wide text-gray-300">{hover.date}</div>
            <div className="mt-0.5 text-[11px]">
              <span className="text-rpg-xp">{hover.xp.toLocaleString()} XP</span>
              {hover.sessions > 0 && <span className="ml-2 text-white">· {hover.sessions} 局</span>}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

/**
 * 战绩分享卡（今日战绩 → 像素风 PNG）
 *
 * Canvas 2D 渲染 720×960 卡片：等级/称号/今日 XP·局数·金币/BOSS 伤害/连续记录，
 * RPG 深紫配色 + 金色描边 + 稀有度光效，点击「生成」下载 PNG。
 * 数据全部实时派生（今日 sessions / bossState / player），零持久化。
 */

import { useMemo, useRef, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import { titleForLevel } from '../config/xpConfig'
import { todayKey } from '../engine/xpCalculator'
import { BOSS_ROSTER, bossForStage } from '../config/bossConfig'

/** 等宽像素风数字（canvas 无 Zpix 加载，用等宽 + 加粗近似） */
const drawCard = (
  ctx: CanvasRenderingContext2D,
  data: {
    level: number
    title: string
    todayXp: number
    todaySessions: number
    todayCoins: number
    bossName: string
    bossDamage: number
    streak: number
    date: string
  },
) => {
  const W = 720
  const H = 960
  // 背景：深紫渐变
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#2a1a4a')
  bg.addColorStop(1, '#1a1033')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  // 装饰星点
  ctx.save()
  for (let i = 0; i < 60; i++) {
    const x = (i * 137.5) % W
    const y = (i * 89.3) % H
    ctx.globalAlpha = 0.08 + ((i * 7) % 10) / 40
    ctx.fillStyle = i % 3 === 0 ? '#ffd54a' : '#5eead4'
    ctx.fillRect(x, y, 2, 2)
  }
  ctx.restore()
  // 金色外框（双线）
  ctx.strokeStyle = '#ffd54a'
  ctx.lineWidth = 4
  ctx.strokeRect(14, 14, W - 28, H - 28)
  ctx.strokeStyle = 'rgba(255,213,74,0.35)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(26, 26, W - 52, H - 52)

  const center = (text: string, y: number, font: string, color: string, shadow?: string) => {
    ctx.font = font
    ctx.textAlign = 'center'
    if (shadow) {
      ctx.fillStyle = shadow
      ctx.fillText(text, W / 2 + 2, y + 2)
    }
    ctx.fillStyle = color
    ctx.fillText(text, W / 2, y)
  }

  // 标题区
  center('LEVEL UP', 110, 'bold 34px "Press Start 2P", monospace', '#ffd54a', 'rgba(0,0,0,0.6)')
  center('今日战绩', 165, 'bold 30px sans-serif', '#e2e8f0')

  // 等级徽章（大圆）
  ctx.beginPath()
  ctx.arc(W / 2, 280, 84, 0, Math.PI * 2)
  const orb = ctx.createRadialGradient(W / 2, 260, 20, W / 2, 280, 84)
  orb.addColorStop(0, '#3d2a63')
  orb.addColorStop(1, '#1a1033')
  ctx.fillStyle = orb
  ctx.fill()
  ctx.strokeStyle = '#ffd54a'
  ctx.lineWidth = 3
  ctx.stroke()
  center(`Lv.${data.level}`, 295, 'bold 52px "Press Start 2P", monospace', '#ffd54a')
  center(data.title, 420, 'bold 24px sans-serif', '#c084fc')

  // 分割线
  ctx.strokeStyle = 'rgba(255,213,74,0.4)'
  ctx.setLineDash([8, 6])
  ctx.beginPath()
  ctx.moveTo(80, 460)
  ctx.lineTo(W - 80, 460)
  ctx.stroke()
  ctx.setLineDash([])

  // 核心数据：XP 大字
  center(`+${data.todayXp.toLocaleString()} XP`, 545, 'bold 64px "Press Start 2P", monospace', '#5eead4')
  center(`${data.todaySessions} 局 · +${data.todayCoins.toLocaleString()} 💰`, 595, 'bold 26px sans-serif', '#e2e8f0')

  // BOSS 战绩框
  const bx = 90
  const by = 640
  const bw = W - 180
  const bh = 150
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.strokeStyle = 'rgba(244,63,94,0.6)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(bx, by, bw, bh, 14)
  ctx.fill()
  ctx.stroke()
  center('⚔️ BOSS 讨伐', by + 42, 'bold 22px sans-serif', '#fb7185')
  center(data.bossName, by + 78, 'bold 24px sans-serif', '#e2e8f0')
  center(`本周伤害 ${data.bossDamage.toLocaleString()}`, by + 116, 'bold 26px "Press Start 2P", monospace', '#ffd54a')

  // 底部：streak + 日期
  center(`🔥 连续记录 ${data.streak} 天`, 850, 'bold 24px sans-serif', '#fbbf24')
  center(data.date, 900, '16px sans-serif', '#94a3b8')
}

export const ShareCard: React.FC = () => {
  const state = useGameStore((s) => s.state)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** 预览展开状态：生成后展开 8s 供确认，然后自动收起（面板保持紧凑单行） */
  const [previewing, setPreviewing] = useState(false)

  const data = useMemo(() => {
    const tKey = todayKey()
    const today = (state.sessions ?? []).filter((s) => s.endTime.slice(0, 10) === tKey)
    const bs = state.bossState
    const bossDef = bs ? (BOSS_ROSTER.find((b) => b.id === bs.bossId) ?? bossForStage(bs.stage)) : null
    return {
      level: state.player.level,
      title: titleForLevel(state.player.level),
      todayXp: today.reduce((s, x) => s + x.xpGained, 0),
      todaySessions: today.length,
      todayCoins: today.reduce((s, x) => s + x.coinsGained, 0),
      bossName: bossDef?.name ?? '虚位以待',
      bossDamage: bs?.totalDamage ?? 0,
      streak: state.recordStreak,
      date: new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }),
    }
  }, [state])

  const generate = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawCard(canvas.getContext('2d')!, data)
    // 下载
    const a = document.createElement('a')
    a.download = `levelup_${todayKey()}.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
    // 展开 8s 预览后自动收起
    setPreviewing(true)
    window.setTimeout(() => setPreviewing(false), 8000)
  }

  return (
    <div className="rpg-panel p-4">
      {/* 紧凑单行：标题 + 数据摘要 + 生成按钮 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="pixel-text text-[10px] text-rpg-gold">📸 战绩分享卡</h2>
          <span className="text-[10px] text-gray-400">
            今日 +{data.todayXp.toLocaleString()} XP · {data.todaySessions} 局 · 🔥{data.streak} 天
          </span>
        </div>
        <button onClick={generate} className="rpg-btn-primary px-3 py-1 text-[10px]">
          生成 PNG
        </button>
      </div>
      {/* 预览画布：默认收起，生成后限时展开 */}
      <div
        className={`overflow-hidden rounded-xl border-2 border-rpg-border transition-all duration-300 ${
          previewing ? 'mt-3 max-h-[720px]' : 'max-h-0 border-0'
        }`}
      >
        <canvas ref={canvasRef} width={720} height={960} className="block w-full" />
      </div>
    </div>
  )
}

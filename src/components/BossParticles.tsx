/**
 * BOSS 立绘区环境粒子
 *
 * 按 BOSS 主题色生成两层氛围粒子（复用背景装饰粒子的 keyframes）：
 * - 上升辉光粒子（animate-bg-rise）：如火星/魔气从底部升腾
 * - 固定闪烁星尘（animate-bg-twinkle）：散布全区的主题色光尘
 * 粒子颜色由 boss.color 派生（主色 + 提亮的浅色），BOSS 换届时整套粒子随之换色。
 */

import { useMemo } from 'react'

interface BossParticlesProps {
  /** BOSS 主题色（hex，如 #a855f7） */
  color: string
}

/** hex → rgba（主题色带透明度） */
const rgba = (hex: string, alpha: number): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return `rgba(255,255,255,${alpha})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

export const BossParticles: React.FC<BossParticlesProps> = ({ color }) => {
  // 上升粒子：主题色系（主色亮/中/淡三档），带辉光
  const rising = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: `r${i}`,
        left: Math.random() * 100,
        size: 2 + Math.random() * 4,
        delay: -Math.random() * 7,
        duration: 5 + Math.random() * 4,
        color: [rgba(color, 0.9), rgba(color, 0.6), rgba('#ffffff', 0.7)][i % 3],
      })),
    [color],
  )
  // 闪烁星尘：固定位置的主题色微光
  const twinkles = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        id: `t${i}`,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 1.5 + Math.random() * 2.5,
        delay: -Math.random() * 2.6,
        duration: 2.2 + Math.random() * 1.6,
        color: i % 3 === 0 ? '#ffffff' : rgba(color, 0.8),
      })),
    [color],
  )

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {rising.map((p) => (
        <span
          key={p.id}
          className="animate-bg-rise absolute rounded-full"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 ${p.size * 2.5}px ${p.color}`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
      {twinkles.map((p) => (
        <span
          key={p.id}
          className="animate-bg-twinkle absolute rounded-full"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  )
}

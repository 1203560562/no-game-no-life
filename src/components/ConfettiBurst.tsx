/**
 * 粒子爆发（纯 DOM + Web Animations API，无依赖）
 * count 个彩色小粒子从容器中心向四周飞散、旋转、淡出。
 */

import { useEffect, useRef } from 'react'

interface ConfettiBurstProps {
  count?: number
  colors?: string[]
  /** 飞散距离基数（px） */
  radius?: number
  /** 动画时长基数（ms，默认 850） */
  duration?: number
}

const PALETTE = ['#ffd54a', '#5eead4', '#c084fc', '#fb7185', '#60a5fa', '#34d399', '#f9a8d4']

export const ConfettiBurst: React.FC<ConfettiBurstProps> = ({
  count = 24,
  colors = PALETTE,
  radius = 130,
  duration = 850,
}) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return
    const parts: HTMLSpanElement[] = []
    for (let i = 0; i < count; i++) {
      const el = document.createElement('span')
      const size = 4 + Math.random() * 5
      const color = colors[i % colors.length]
      const shape = Math.random() > 0.5 ? '50%' : '2px'
      el.style.cssText = `position:absolute;left:50%;top:45%;width:${size}px;height:${size}px;border-radius:${shape};background:${color};pointer-events:none;`
      container.appendChild(el)
      parts.push(el)

      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8
      const dist = radius * (0.7 + Math.random() * 0.6)
      const dx = Math.cos(angle) * dist
      const dy = Math.sin(angle) * dist - 40 // 稍向上偏，庆祝感
      el.animate(
        [
          { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 },
          {
            transform: `translate(${dx}px, ${dy}px) rotate(${(Math.random() - 0.5) * 540}deg) scale(0.35)`,
            opacity: 0,
          },
        ],
        {
          duration: duration + Math.random() * 550,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'forwards',
        },
      )
    }
    // 粒子清理放到动画结束之后（最慢粒子 ≈ duration + 550ms 缓冲）
    const cleanup = setTimeout(() => parts.forEach((p) => p.remove()), duration + 1200)
    return () => {
      clearTimeout(cleanup)
      parts.forEach((p) => p.remove())
    }
  }, [count, radius, colors, duration])

  return <div ref={ref} className="pointer-events-none absolute inset-0 overflow-visible" />
}

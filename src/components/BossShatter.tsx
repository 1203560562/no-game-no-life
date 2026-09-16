/**
 * BOSS 立绘碎裂消散（击杀仪式核心视觉）
 *
 * 挂载后主立绘以 boss-emerge 从黑暗中显现；shatterDelay 到点时：
 * 主图溶解淡出（blur + 放大），8 块发光碎片（同图 clip-path 中心放射切割）
 * 向四周飞散旋转消散 —— 「dissolve death」参考业界 2D BOSS 战败演出惯例。
 * 纯 DOM + Web Animations API，无依赖。
 */

import { useEffect, useRef } from 'react'

interface BossShatterProps {
  portrait: string
  /** BOSS 主题色（碎片发光/描边） */
  color: string
  /** 挂载到开始碎裂的延迟（ms） */
  shatterDelay?: number
  /** 立绘边长（px，正方形） */
  size?: number
  /** 全屏模式：铺满父容器（object-cover 顶部取景），忽略 size */
  fullscreen?: boolean
}

/**
 * 8 块放射状碎片（中心 50% 48% → 边界不规则点，无缝覆盖全图）
 * 以顺时针楔形排列，飞散方向与楔形朝向一致。
 */
const SHARDS = [
  'polygon(50% 48%, 50% 0%, 85% 8%)',
  'polygon(50% 48%, 85% 8%, 100% 40%)',
  'polygon(50% 48%, 100% 40%, 92% 80%)',
  'polygon(50% 48%, 92% 80%, 70% 100%)',
  'polygon(50% 48%, 70% 100%, 30% 100%)',
  'polygon(50% 48%, 30% 100%, 8% 75%)',
  'polygon(50% 48%, 8% 75%, 15% 20%)',
  'polygon(50% 48%, 15% 20%, 50% 0%)',
]

export const BossShatter: React.FC<BossShatterProps> = ({
  portrait,
  color,
  shatterDelay = 0,
  size = 176,
  fullscreen = false,
}) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return
    const img = container.querySelector<HTMLImageElement>('.bs-main')
    const shards = Array.from(container.querySelectorAll<HTMLDivElement>('.bs-shard'))
    const timer = setTimeout(() => {
      // 主图溶解：blur + 微放大 + 上浮消散
      img?.animate(
        [
          { opacity: 1, filter: 'blur(0px)', transform: 'scale(1)' },
          { opacity: 0, filter: 'blur(7px)', transform: 'scale(1.18) translateY(-10px)' },
        ],
        { duration: 620, easing: 'ease-in', fill: 'forwards' },
      )
      // 碎片：沿各自楔形朝向飞散、旋转、缩小、消散（全屏模式飞散距离随容器尺寸放大）
      const base = fullscreen ? Math.max(container.clientWidth, container.clientHeight) : size
      shards.forEach((el, i) => {
        const angle = (Math.PI * 2 * i) / shards.length + 0.35
        const dist = base * (0.75 + Math.random() * 0.85)
        const dx = Math.cos(angle) * dist
        const dy = Math.sin(angle) * dist - 36
        el.style.opacity = '1'
        el.animate(
          [
            { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 },
            {
              transform: `translate(${dx}px, ${dy}px) rotate(${(Math.random() - 0.5) * 640}deg) scale(0.45)`,
              opacity: 0,
            },
          ],
          {
            duration: 850 + Math.random() * 450,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'forwards',
          },
        )
      })
    }, shatterDelay)
    return () => clearTimeout(timer)
  }, [shatterDelay, size, fullscreen])

  return (
    // 发光描边挂在 wrapper（避免与 img 的动画 filter 相互覆盖）；idle 浮动让立绘「活」着
    // 全屏模式：wrapper 铺满父容器（absolute inset-0），否则 absolute 子元素以 0 尺寸 wrapper 定位导致立绘不可见
    <div
      ref={ref}
      className={fullscreen ? 'absolute inset-0 animate-float-slow' : 'relative animate-float-slow'}
      style={
        fullscreen
          ? { filter: `drop-shadow(0 0 20px ${color}88)` }
          : { width: size, height: size, filter: `drop-shadow(0 0 20px ${color}88)` }
      }
    >
      <img
        src={portrait}
        alt=""
        className={`bs-main animate-boss-emerge absolute inset-0 h-full w-full object-cover object-top ${
          fullscreen ? '' : 'rounded-xl'
        }`}
      />
      {SHARDS.map((clip, i) => (
        <div
          key={i}
          className="bs-shard absolute inset-0 opacity-0"
          style={{
            clipPath: clip,
            backgroundImage: `url(${portrait})`,
            backgroundSize: '100% 100%',
            backgroundPosition: 'center top',
            filter: `drop-shadow(0 0 5px ${color}cc)`,
          }}
        />
      ))}
    </div>
  )
}

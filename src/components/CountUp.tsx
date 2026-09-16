/**
 * 数字滚动：从 from 平滑滚到 value（requestAnimationFrame + easeOutExpo）
 */

import { useEffect, useRef, useState } from 'react'

interface CountUpProps {
  value: number
  from?: number
  /** 毫秒 */
  duration?: number
  className?: string
  format?: (n: number) => string
}

export const CountUp: React.FC<CountUpProps> = ({
  value,
  from = 0,
  duration = 900,
  className,
  format,
}) => {
  const [display, setDisplay] = useState(from)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const start = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p)
      setDisplay(Math.round(from + (value - from) * eased))
      if (p < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value, from, duration])

  return <span className={className}>{format ? format(display) : display.toLocaleString()}</span>
}

import { useEffect, useRef, useState } from 'react'
import type * as echarts from 'echarts'

interface EChartProps {
  // ECharts option unions are extremely strict for inline literals;
  // we accept a loosely-typed option and forward to setOption directly.
  option: Record<string, unknown>
  height?: number | string
  className?: string
}

/**
 * ECharts 封装：动态 import echarts（~1MB 独立 chunk，首屏不加载），
 * 挂载后异步初始化，option 就绪前渲染占位框保持布局稳定
 */
export const EChart: React.FC<EChartProps> = ({ option, height = 240, className }) => {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let disposed = false
    void import('echarts').then((mod) => {
      if (disposed || !ref.current) return
      const echarts = (mod as unknown as { default: typeof mod }).default ?? mod
      chartRef.current = echarts.init(ref.current, undefined, { renderer: 'canvas' })
      setReady(true)
    })
    return () => {
      disposed = true
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  // echarts 就绪后每次 option 变化重设
  useEffect(() => {
    if (ready && chartRef.current) {
      chartRef.current.setOption(option as echarts.EChartsOption, true)
    }
  }, [option, ready])

  useEffect(() => {
    const onResize = () => chartRef.current?.resize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div className={`relative ${className ?? ''}`} style={{ height }}>
      {/* echarts 独占容器：zrender 初始化会接管容器内部 DOM，
          React 子节点若放在同一容器，ready 后 removeChild 会抛 NotFoundError */}
      <div ref={ref} className="absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-500">
          图表加载中...
        </div>
      )}
    </div>
  )
}

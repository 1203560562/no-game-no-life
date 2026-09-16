/**
 * 全局错误边界 —— 防止子组件异常导致整页白屏
 *
 * Live2D WebGL 上下文丢失、EChart 渲染异常、Pixi 报错等均被捕获，
 * 显示友好错误提示 + 重试按钮，而非 React 默认的卸载整棵树。
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="text-4xl">⚠️</div>
          <h1 className="pixel-text text-lg text-rpg-gold">画面出错了</h1>
          <p className="max-w-md text-sm text-gray-400">
            {this.state.error.message || '渲染过程中发生未知错误'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={this.handleReset}
              className="rounded-lg border-2 border-rpg-gold bg-rpg-panel px-4 py-2 text-sm text-rpg-gold transition-all hover:bg-rpg-gold/10"
            >
              重试
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg border-2 border-rpg-border bg-rpg-panel px-4 py-2 text-sm text-gray-300 transition-all hover:border-rpg-gold/60"
            >
              刷新页面
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

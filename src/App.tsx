import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { useGameStore } from './store/useGameStore'
import { ActivityLogger } from './components/ActivityLogger'
import { XpToast, LevelUpOverlay, AchievementToast, MilestoneOverlay, BossVictoryOverlay } from './components/FeedbackOverlay'
import { DataManager } from './components/DataManager'
import { PomodoroTimer } from './components/PomodoroTimer'
import { SessionSettleOverlay } from './components/SessionSettleOverlay'
import { FloatingRewards } from './components/FloatingRewards'
import { ChestOverlay } from './components/ChestOverlay'
import { Live2DShowcase } from './components/Live2DShowcase'
import { Live2DInspector } from './components/Live2DInspector'
import { AdminPanel } from './components/AdminPanel'
import { APP_CONFIG } from './config/appConfig'
import { clearServerBackup, quickSaveToServer } from './lib/serverBackup'

// 路由级懒加载：各页面拆为独立 chunk，首屏只加载首页（three/echarts 等重库随用随载）
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const ActivitiesPage = lazy(() => import('./pages/ActivitiesPage').then((m) => ({ default: m.ActivitiesPage })))
const BodyPage = lazy(() => import('./pages/BodyPage').then((m) => ({ default: m.BodyPage })))
const AchievementsPage = lazy(() => import('./pages/AchievementsPage').then((m) => ({ default: m.AchievementsPage })))
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const MilestonesPage = lazy(() => import('./pages/MilestonesPage').then((m) => ({ default: m.MilestonesPage })))
const BossPage = lazy(() => import('./pages/BossPage').then((m) => ({ default: m.BossPage })))
const ShopPage = lazy(() => import('./pages/ShopPage').then((m) => ({ default: m.ShopPage })))
const MemoryPage = lazy(() => import('./pages/MemoryPage').then((m) => ({ default: m.MemoryPage })))
const BackpackPage = lazy(() => import('./pages/BackpackPage').then((m) => ({ default: m.BackpackPage })))
const MindMapPage = lazy(() => import('./pages/MindMapPage').then((m) => ({ default: m.MindMapPage })))
const VrmDemoPage = lazy(() => import('./pages/VrmDemoPage').then((m) => ({ default: m.VrmDemoPage })))
const Live2DDemoPage = lazy(() => import('./pages/Live2DDemoPage').then((m) => ({ default: m.Live2DDemoPage })))

/** 页面级加载占位（路由切换瞬间） */
const PageFallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center">
    <div className="pixel-text animate-pulse text-rpg-gold">LOADING...</div>
  </div>
)

const NAV = [
  { to: '/', label: APP_CONFIG.nav.adventure, icon: '🏰', end: true },
  { to: '/actions', label: APP_CONFIG.nav.actions, icon: '📜' },
  { to: '/body', label: APP_CONFIG.nav.body, icon: '⚖️' },
  { to: '/achievements', label: APP_CONFIG.nav.achievements, icon: '🏆' },
  { to: '/milestones', label: APP_CONFIG.nav.milestones, icon: '🎯' },
  { to: '/boss', label: '挑战', icon: '⚔️' },
  { to: '/shop', label: APP_CONFIG.nav.shop, icon: '🛒' },
  { to: '/backpack', label: APP_CONFIG.nav.inventory, icon: '🎒' },
  { to: '/reports', label: APP_CONFIG.nav.reports, icon: '📊' },
  { to: '/mindmap', label: APP_CONFIG.nav.mindmap, icon: '📋' },
]

const App: React.FC = () => {
  const init = useGameStore((s) => s.init)
  const loaded = useGameStore((s) => s.loaded)
  const loadError = useGameStore((s) => s.loadError)
  const clearLoadError = useGameStore((s) => s.clearLoadError)
  const restMode = useGameStore((s) => s.state.restMode)
  const toggleRest = useGameStore((s) => s.toggleRestMode)
  const [loggerOpen, setLoggerOpen] = useState(false)
  const [quickSaveMsg, setQuickSaveMsg] = useState<string | null>(null)
  const [loggerPreset, setLoggerPreset] = useState<string | undefined>()
  const location = useLocation()
  const isMindMap = location.pathname.startsWith('/mindmap')

  /** 打开记录弹窗，可携带预填标题（如导图节点文本） */
  const openLogger = (presetTitle?: string) => {
    setLoggerPreset(presetTitle)
    setLoggerOpen(true)
  }

  useEffect(() => {
    void init()
  }, [init])

  // 押后的结算仪式：玩家离开时到点的番茄钟结算（heldSessionFeedback），
  // 等页面重新可见且有焦点（人回来了）再释放播放——白闪/重击动画不错过
  const releaseHeld = useGameStore((s) => s.releaseHeldSessionFeedback)
  useEffect(() => {
    const release = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) releaseHeld()
    }
    document.addEventListener('visibilitychange', release)
    window.addEventListener('focus', release)
    // 挂载时也查一次：切标签页回来由 visibilitychange 覆盖，直接刷新由这里覆盖
    release()
    return () => {
      document.removeEventListener('visibilitychange', release)
      window.removeEventListener('focus', release)
    }
  }, [releaseHeld])

  // Ctrl+S 快速保存：立即将当前存档写入项目 saves/ 目录（dev server 运行时）
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const doQuickSave = async () => {
      const store = useGameStore.getState()
      if (!store.loaded) return
      const r = await quickSaveToServer(store.state)
      setQuickSaveMsg(
        r === 'ok' ? '⚡ 存档已保存到 saves/' : r === 'quarantined' ? '⚠ 存档被隔离为 suspect 文件' : '⚠ 快速保存失败：dev server 未运行'
      )
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setQuickSaveMsg(null), 2500)
    }
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 's' || !(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      void doQuickSave()
    }
    window.addEventListener('keydown', onKeydown)
    return () => {
      window.removeEventListener('keydown', onKeydown)
      if (timer) clearTimeout(timer)
    }
  }, [])

  // 加载失败：展示错误页，提供重试入口
  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-4xl">⚠️</div>
        <h1 className="pixel-text text-sm text-rpg-gold">存档加载失败</h1>
        <p className="max-w-md text-xs text-gray-400">{loadError}</p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              clearLoadError()
              void init()
            }}
            className="rounded-lg border-2 border-rpg-gold bg-rpg-panel px-4 py-2 text-xs text-rpg-gold transition-all hover:bg-rpg-gold/10"
          >
            重试
          </button>
          <button
            onClick={() => {
              if (confirm('将清空当前浏览器存档并重新开始，确定吗？此操作不可恢复。')) {
                indexedDB.deleteDatabase('life-rpg')
                localStorage.clear()
                clearServerBackup()
                clearLoadError()
                window.location.reload()
              }
            }}
            className="rounded-lg border-2 border-rpg-border bg-rpg-panel px-4 py-2 text-xs text-gray-300 transition-all hover:border-rpg-gold/60"
          >
            清空存档重启
          </button>
        </div>
      </div>
    )
  }

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="pixel-text animate-pulse text-rpg-gold">LOADING...</div>
      </div>
    )
  }

  return (
    <div className={isMindMap ? 'h-screen bg-rpg-bg' : 'star-bg min-h-screen'}>
      {/* top bar（思维导图全屏模式下隐藏） */}
      {!isMindMap && (
        <header className="sticky top-0 z-30 border-b-2 border-rpg-border bg-rpg-bg/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
            <span className="font-rpg text-sm text-rpg-gold sm:text-base">{APP_CONFIG.name}</span>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={toggleRest}
                className={`rounded-lg border-2 px-3 py-1 text-[10px] transition-all ${
                  restMode
                    ? 'border-rpg-xp bg-rpg-xp/20 text-rpg-xp'
                    : 'border-rpg-border bg-rpg-panel text-gray-300 hover:border-rpg-gold'
                }`}
              >
                {restMode ? '🌙 休息中' : '休息模式'}
              </button>
              <AdminPanel />
              <DataManager />
            </div>
          </div>
        </header>
      )}

      <main className={isMindMap ? 'h-full' : 'mx-auto max-w-5xl px-4 py-4 pb-28'}>
        {!isMindMap && restMode && (
          <div className="mb-4 rounded-xl border-2 border-rpg-xp bg-rpg-xp/10 p-4 text-center text-sm text-rpg-xp animate-fade-in">
            🌙 休息模式已开启 · 今天也是你的人生 · 不显示待办、不提醒任务、不产生负面分数
          </div>
        )}
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Dashboard onRecord={() => setLoggerOpen(true)} />} />
            <Route path="/actions" element={<ActivitiesPage onRecord={() => setLoggerOpen(true)} />} />
            <Route path="/body" element={<BodyPage />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            <Route path="/milestones" element={<MilestonesPage />} />
            <Route path="/boss" element={<BossPage />} />
            <Route path="/memory" element={<MemoryPage />} />
            <Route path="/shop" element={<ShopPage />} />
            <Route path="/backpack" element={<BackpackPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/mindmap" element={<MindMapPage onRecord={openLogger} />} />
            <Route path="/vrm-demo" element={<VrmDemoPage />} />
            <Route path="/live2d-demo" element={<Live2DDemoPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      {/* floating record button（思维导图全屏模式下隐藏） */}
      {!isMindMap && (
        <button
          onClick={() => setLoggerOpen(true)}
          className="fixed bottom-20 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full border-2 border-rpg-gold bg-rpg-panelLight text-2xl shadow-gold transition-all hover:scale-110 active:scale-95"
          title="记录行动"
        >
          ➕
        </button>
      )}

      {/* bottom nav（思维导图全屏模式下隐藏） */}
      {!isMindMap && (
        <nav className="fixed bottom-0 left-0 right-0 z-30 border-t-2 border-rpg-border bg-rpg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-around px-2 py-2">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                title={n.label}
                className={({ isActive }) =>
                  `flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-[9px] transition-all ${
                    isActive ? 'text-rpg-gold' : 'text-gray-400 hover:text-white'
                  }`
                }
              >
                <span className="text-lg">{n.icon}</span>
                <span className="hidden sm:inline">{n.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      )}

      {loggerOpen && (
        <ActivityLogger
          presetTitle={loggerPreset}
          onClose={() => {
            setLoggerOpen(false)
            setLoggerPreset(undefined)
          }}
        />
      )}
      <XpToast />
      <LevelUpOverlay />
      <ChestOverlay />
      <Live2DShowcase />
      <Live2DInspector />
      <AchievementToast />
      <MilestoneOverlay />
      <BossVictoryOverlay />
      <SessionSettleOverlay />
      <FloatingRewards />

      {/* Ctrl+S 快速保存结果提示 */}
      {quickSaveMsg && (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-[55] -translate-x-1/2 animate-slide-up">
          <div className="rpg-panel border-2 border-rpg-gold px-4 py-2 text-xs text-rpg-gold shadow-gold">
            {quickSaveMsg}
          </div>
        </div>
      )}

      {/* 全局局 HUD（所有页面可用，含任务榜全屏；到点自动结算） */}
      <PomodoroTimer />
    </div>
  )
}

export default App

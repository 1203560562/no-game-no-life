import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import {
  bindSaveFile,
  unbindSaveFile,
  exportToFile,
  importFromFile,
  isFileAccessSupported,
  isBound,
  boundFileName,
} from '../lib/fileStorage'
import { quickSaveToServer } from '../lib/serverBackup'

export const DataManager: React.FC = () => {
  const state = useGameStore((s) => s.state)
  const resetGame = useGameStore((s) => s.resetGame)
  const importState = useGameStore((s) => s.importState)
  const [open, setOpen] = useState(false)
  const [supported, setSupported] = useState(false)
  const [bound, setBound] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [quickSaving, setQuickSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    setSupported(isFileAccessSupported())
    setBound(await isBound())
    setFileName(await boundFileName())
  }

  useEffect(() => {
    void refresh()
  }, [])

  const showMsg = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(null), 3000)
  }

  const handleBind = async () => {
    try {
      const status = await bindSaveFile()
      setBound(true)
      setFileName(status.fileName ?? null)
      // 立即写入一次当前数据
      showMsg(`已绑定到本地文件：${status.fileName}，之后每次记录都会自动保存到磁盘。`)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      showMsg('绑定失败：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const handleUnbind = async () => {
    await unbindSaveFile()
    setBound(false)
    setFileName(null)
    showMsg('已解除绑定（本地文件保留）。数据仍保存在浏览器中。')
  }

  const handleExport = () => {
    exportToFile(state)
    showMsg('已导出备份文件到下载目录。')
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const imported = await importFromFile(file)
      // 验证基本结构
      if (!imported.player || !imported.activities) {
        showMsg('文件格式不正确：缺少 player 或 activities 字段。')
        return
      }
      importState(imported)
      showMsg('已从文件导入数据。')
    } catch (e) {
      showMsg('导入失败：' + (e instanceof Error ? e.message : String(e)))
    }
    e.target.value = ''
  }

  const handleQuickSave = async () => {
    setQuickSaving(true)
    const r = await quickSaveToServer(state)
    setQuickSaving(false)
    showMsg(
      r === 'ok'
        ? '⚡ 已快速保存到项目 saves/ 目录（latest.json + 快照）。'
        : r === 'quarantined'
          ? '⚠ 存档被防覆盖护栏隔离为 suspect 文件，请检查 saves/ 目录。'
          : '⚠ 快速保存失败：dev server 未运行（需在 npm run dev 下使用）。'
    )
  }

  const handleReset = async () => {
    if (!confirm('确定要重置游戏吗？所有角色数据将被清除（已绑定的本地文件不会被删除）。')) return
    await resetGame()
    showMsg('已重置游戏。')
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border-2 border-rpg-border bg-rpg-panel px-2.5 py-1 text-[10px] transition-all hover:border-rpg-gold"
        title="数据管理"
      >
        💾
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fade-in" onClick={() => setOpen(false)}>
          <div className="rpg-panel max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="pixel-text text-xs text-rpg-gold">数据管理</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              {/* 绑定状态 */}
              <div className="rpg-panel-light p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-gray-300">本地文件绑定</span>
                  <span className={`text-[10px] ${bound ? 'text-rpg-xp' : 'text-gray-500'}`}>
                    {bound ? `✓ ${fileName ?? '已绑定'}` : '未绑定'}
                  </span>
                </div>
                <p className="mb-2 text-[10px] leading-relaxed text-gray-400">
                  绑定一个本地文件后，每次记录都会自动保存到磁盘。即使清空浏览器数据，重新绑定该文件即可恢复。
                </p>
                <div className="flex gap-2">
                  {!supported ? (
                    <span className="text-[10px] text-amber-400">
                      当前浏览器不支持本地文件绑定，请用「导出备份」手动保存。
                    </span>
                  ) : bound ? (
                    <button onClick={handleUnbind} className="rpg-btn flex-1 px-3 py-1.5 text-[10px]">
                      解除绑定
                    </button>
                  ) : (
                    <button onClick={handleBind} className="rpg-btn-primary flex-1 px-3 py-1.5 text-[10px]">
                      绑定本地文件
                    </button>
                  )}
                </div>
              </div>

              {/* 快速保存（saves/ 目录） */}
              <div className="rpg-panel-light p-3">
                <div className="mb-2 text-gray-300">快速保存</div>
                <p className="mb-2 text-[10px] leading-relaxed text-gray-400">
                  立即将当前存档写入项目 saves/ 目录（latest.json + 时间戳快照）；随时可按 Ctrl+S 触发。需 dev server（npm run dev）运行中。
                </p>
                <button
                  onClick={handleQuickSave}
                  disabled={quickSaving}
                  className="rpg-btn-primary w-full px-3 py-1.5 text-[10px] disabled:opacity-50"
                >
                  {quickSaving ? '保存中...' : '⚡ 快速保存 (Ctrl+S)'}
                </button>
              </div>

              {/* 导出 / 导入 */}
              <div className="rpg-panel-light p-3">
                <div className="mb-2 text-gray-300">备份与恢复</div>
                <p className="mb-2 text-[10px] leading-relaxed text-gray-400">
                  通用方案：导出会下载 JSON 文件到下载目录；导入会从 JSON 文件恢复数据。
                </p>
                <div className="flex gap-2">
                  <button onClick={handleExport} className="rpg-btn flex-1 px-3 py-1.5 text-[10px]">
                    ⬇ 导出备份
                  </button>
                  <button onClick={handleImportClick} className="rpg-btn flex-1 px-3 py-1.5 text-[10px]">
                    ⬆ 导入备份
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={handleImportFile}
                    className="hidden"
                  />
                </div>
              </div>

              {/* 重置 */}
              <div className="rpg-panel-light border-rpg-courage/40 p-3">
                <div className="mb-2 text-gray-300">危险操作</div>
                <button onClick={handleReset} className="rpg-btn w-full border-rpg-courage px-3 py-1.5 text-[10px] text-rpg-courage">
                  重置游戏（清除所有数据）
                </button>
              </div>

              {msg && (
                <div className="rounded-lg border border-rpg-xp/40 bg-rpg-xp/10 p-2 text-[10px] text-rpg-xp animate-fade-in">
                  {msg}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

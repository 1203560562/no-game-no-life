import type { AppState } from '../types'

/**
 * 磁盘持久化：用 File System Access API 绑定一个本地文件，
 * 每次状态变化自动写入；浏览器数据被清空后，重新绑定该文件即可恢复。
 * 不支持 File System Access API 的浏览器走「导出/导入 JSON」兜底。
 */

const HANDLE_DB = 'life-rpg-meta'
const HANDLE_STORE = 'handles'
const HANDLE_KEY = 'save-file'
const HANDLE_DB_VERSION = 1

// ===== File System Access API support detection =====
export const isFileAccessSupported = (): boolean =>
  typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function'

// ===== tiny IDB wrapper for storing the file handle =====
const openHandleDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, HANDLE_DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(HANDLE_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

interface SaveableFileHandle extends FileSystemFileHandle {}

const getHandle = async (): Promise<SaveableFileHandle | null> => {
  if (!isFileAccessSupported()) return null
  const db = await openHandleDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readonly')
    const req = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY)
    req.onsuccess = () => resolve((req.result as SaveableFileHandle) ?? null)
    req.onerror = () => reject(req.error)
  })
}

const putHandle = async (handle: SaveableFileHandle): Promise<void> => {
  const db = await openHandleDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite')
    tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

const clearHandle = async (): Promise<void> => {
  const db = await openHandleDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite')
    tx.objectStore(HANDLE_STORE).delete(HANDLE_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ===== Public API =====

export interface FileSaveStatus {
  bound: boolean
  supported: boolean
  lastSavedAt?: string
  fileName?: string
}

/**
 * Let the user pick (or create) a local file to bind as the save target.
 * Must be called from a user gesture (button click).
 */
export const bindSaveFile = async (): Promise<FileSaveStatus> => {
  if (!isFileAccessSupported()) {
    throw new Error('当前浏览器不支持 File System Access API，请使用「导出」功能备份。')
  }
  const handle = await (window as unknown as {
    showSaveFilePicker: (opts: {
      suggestedName?: string
      types?: { description?: string; accept: Record<string, string[]> }[]
    }) => Promise<SaveableFileHandle>
  }).showSaveFilePicker({
    suggestedName: 'become-yourself-save.json',
    types: [
      {
        description: '成为自己 存档',
        accept: { 'application/json': ['.json'] },
      },
    ],
  })
  await putHandle(handle)
  return { bound: true, supported: true, fileName: handle.name }
}

/** Unbind the save file (keeps the file on disk). */
export const unbindSaveFile = async (): Promise<void> => {
  await clearHandle()
}

/**
 * Try to write state to the bound file. Silent no-op if not bound.
 * Verifies permission first; if denied, the caller should prompt re-bind.
 */
export const writeToBoundFile = async (state: AppState): Promise<{ ok: boolean; needRebind?: boolean; error?: string }> => {
  if (!isFileAccessSupported()) return { ok: false }
  const handle = await getHandle()
  if (!handle) return { ok: false }

  // check permission
  type PermissionHandle = FileSystemFileHandle & {
    queryPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
    requestPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  }
  const h = handle as PermissionHandle
  if (h.queryPermission) {
    const perm = await h.queryPermission({ mode: 'readwrite' })
    if (perm !== 'granted') {
      // cannot request without user gesture; caller must rebind
      return { ok: false, needRebind: true }
    }
  }

  try {
    const writable = await (handle as FileSystemFileHandle & {
      createWritable: () => Promise<FileSystemWritableFileStream>
    }).createWritable()
    await writable.write(JSON.stringify(state, null, 2))
    await writable.close()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Read state from the bound file (used on startup if bound). */
export const readFromBoundFile = async (): Promise<AppState | null> => {
  if (!isFileAccessSupported()) return null
  const handle = await getHandle()
  if (!handle) return null
  try {
    const file = await handle.getFile()
    const text = await file.text()
    return JSON.parse(text) as AppState
  } catch {
    return null
  }
}

/** Is a save file currently bound? */
export const isBound = async (): Promise<boolean> => {
  const h = await getHandle()
  return !!h
}

/** Get bound file name (without reading contents). */
export const boundFileName = async (): Promise<string | null> => {
  const h = await getHandle()
  return h?.name ?? null
}

// ===== Universal fallback: export / import JSON file =====

/** Trigger a browser download of the state as JSON. Works in all browsers. */
export const exportToFile = (state: AppState): void => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  a.download = `my-rpg-backup-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Read an imported JSON file. Returns parsed state or throws. */
export const importFromFile = (file: File): Promise<AppState> =>
  file.text().then((text) => JSON.parse(text) as AppState)

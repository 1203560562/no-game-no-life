import type { AppState } from '../types'

/** 将存档 POST 给 Vite dev server 落盘到项目 saves/ 目录。
 *  仅在 dev server 运行时存在该接口；生产/静态预览下请求失败静默忽略。
 *  force：用户明确操作（重置/导入旧档）时绕过服务端的异常小档护栏。 */
export const backupToServer = (state: AppState, opts?: { force?: boolean }): void => {
  void fetch(`/api/save-backup${opts?.force ? '?force=1' : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  }).catch(() => {
    /* dev server 未运行时静默忽略 */
  })
}

/** 手动快速保存：立即将存档 POST 到 dev server 落盘 saves/ 目录。
 *  返回 'ok'（已写入）/ 'quarantined'（被防覆盖护栏隔离为 suspect 文件）/ 'offline'（dev server 未运行或失败）。 */
export const quickSaveToServer = async (state: AppState): Promise<'ok' | 'quarantined' | 'offline'> => {
  try {
    const res = await fetch('/api/save-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    })
    if (!res.ok) return 'offline'
    return (await res.text()) === 'quarantined' ? 'quarantined' : 'ok'
  } catch {
    return 'offline'
  }
}

/** 从 dev server 读取磁盘备份（saves/latest.json），作为启动时的第三存档源。
 *  dev server 未运行或无备份时返回 null。 */
export const fetchServerBackup = async (): Promise<AppState | null> => {
  try {
    const res = await fetch('/api/save-backup')
    if (!res.ok) return null
    const data = (await res.json()) as AppState
    return data?.player ? data : null
  } catch {
    return null
  }
}

/** 清空服务器磁盘备份（配合「清空存档重启」：否则三源择优会在下次启动复活旧档）。
 *  写入 JSON null：fetchServerBackup 会因其无 player 字段而忽略。 */
export const clearServerBackup = (): void => {
  void fetch('/api/save-backup?force=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'null',
  }).catch(() => {
    /* dev server 未运行时静默忽略 */
  })
}

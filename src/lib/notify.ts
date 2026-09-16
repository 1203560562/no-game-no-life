/**
 * 系统通知（Web Notifications API）
 *
 * 番茄钟到点时，即使浏览器在其他标签页/最小化、用户在别的程序中，
 * 也会收到系统级桌面通知。
 *
 * - 权限：首次开启时请求 Notification.requestPermission()
 * - 开关持久化：localStorage
 * - 页面可见时跳过（站内有 Overlay/音效提示，避免双重打扰）
 * - tag 去重：同一时刻只保留一条最新通知
 */

const KEY = 'levelup_notify_enabled'

export const notifySupported = (): boolean =>
  typeof window !== 'undefined' && 'Notification' in window

export const getNotifyEnabled = (): boolean => {
  if (!notifySupported()) return false
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export const setNotifyEnabled = (v: boolean) => {
  if (!notifySupported()) return
  try {
    localStorage.setItem(KEY, v ? '1' : '0')
  } catch {
    /* 存储不可用时忽略 */
  }
}

export const notifyPermission = (): NotificationPermission =>
  notifySupported() ? Notification.permission : 'denied'

/** 请求系统通知权限（浏览器只允许在用户手势中调用一次询问） */
export const requestNotifyPermission = async (): Promise<NotificationPermission> => {
  if (!notifySupported()) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

/** sendNotification 的结果，用于「试一条」等调用方反馈 */
export type NotifySendResult =
  | 'sent' // 已创建系统通知（能否显示由浏览器/系统决定）
  | 'unsupported' // 浏览器不支持 Notification API
  | 'denied' // 站点通知权限未授予
  | 'disabled' // 用户关闭了开关
  | 'skipped' // 用户正看着页面，站内提示已接管
  | 'error' // Notification 构造抛错（详见 console）

/**
 * 发送系统通知；未开启/无权限/用户正看着页面时静默跳过。
 *
 * 注意「页面可见」的判断：窗口被其他程序完全遮挡时 visibilityState 仍是 'visible'，
 * 必须配合 hasFocus() —— 只有标签可见且窗口持有焦点才视为"用户在看"。
 */
export const sendNotification = (
  title: string,
  options?: NotificationOptions,
  opts?: { force?: boolean },
): NotifySendResult => {
  if (!notifySupported()) return 'unsupported'
  if (Notification.permission !== 'granted') return 'denied'
  if (!opts?.force) {
    if (!getNotifyEnabled()) return 'disabled'
    if (document.visibilityState === 'visible' && document.hasFocus()) return 'skipped'
  }
  try {
    const n = new Notification(title, {
      tag: 'levelup-pomodoro', // 覆盖旧通知，避免堆积
      // 不设 silent：系统通知自带提示音，页面在后台时站内音效不可靠，
      // 通知铃声是"到点必有声"的最重要一环
      ...options,
    })
    // 点击通知回到页面（番茄结算 Overlay 还在等用户确认）
    n.onclick = () => {
      window.focus()
      n.close()
    }
    console.info('[notify] 已创建通知：', title)
    return 'sent'
  } catch (e) {
    console.warn('[notify] Notification 构造失败：', e)
    return 'error'
  }
}

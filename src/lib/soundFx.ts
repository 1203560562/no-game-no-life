/**
 * 统一音效模块（Web Audio 合成，无外部资源）
 *
 * 场景：start 开局 / settle 局结算 / levelUp 升级 / record 新纪录 / achievement 成就 / coin 记录入账
 * 共享一个 AudioContext；浏览器自动播放策略要求 AudioContext 在用户手势后
 * 创建/恢复——番茄钟刷新后恢复运行等无手势场景下触发的音效会被静默跳过，
 * 首次手势（点击/按键）后自动解锁并补启保活。
 */

let ctx: AudioContext | null = null
/** 是否已发生用户手势（AudioContext 解锁条件） */
let unlocked = false
/** 手势前请求过保活（如刷新后仍在运行的番茄钟）→ 解锁时补启动 */
let keepAlivePending = false

/** 首次手势时解锁音频（capture 确保先于任何组件级处理器） */
const unlock = () => {
  if (unlocked) return
  unlocked = true
  getCtx()
  if (keepAlivePending) {
    keepAlivePending = false
    startKeepAlive()
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock, { once: true, capture: true })
  window.addEventListener('keydown', unlock, { once: true, capture: true })
}

const getCtx = (): AudioContext | null => {
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

interface NoteOptions {
  freq: number
  /** 相对当前时刻的偏移（秒） */
  at?: number
  /** 时长（秒） */
  dur?: number
  volume?: number
  type?: OscillatorType
}

const note = (c: AudioContext, o: NoteOptions) => {
  const t0 = c.currentTime + (o.at ?? 0)
  const dur = o.dur ?? 0.3
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = o.type ?? 'sine'
  osc.frequency.value = o.freq
  const v = o.volume ?? 0.15
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(v, t0 + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

const play = (notes: NoteOptions[]) => {
  // 手势前的触发（如刷新后番茄钟恢复运行的挂载 effect）直接跳过，避免
  // "AudioContext was not allowed to start" 警告；手势后正常发声。
  if (!unlocked) return
  const c = getCtx()
  if (!c) return
  notes.forEach((n) => note(c, n))
}

// ===== 音频保活（防后台节流/休眠） =====
// 浏览器会把后台标签页的定时器节流到 ~1 次/分钟，甚至休眠整个标签页，
// 番茄钟到点检测因此延迟/停摆。播放一个听不见的振荡器可让浏览器认为
// 标签页正在播放音频 → 豁免节流与休眠（番茄钟类网站的标准做法）。
// 副作用：运行期间标签页标题旁会出现 🔊 图标，属预期行为。
let keepAliveOsc: OscillatorNode | null = null

export const startKeepAlive = () => {
  // 手势前先挂起请求，首次手势解锁时补启动（保证后台节流豁免尽快生效）
  if (!unlocked) {
    keepAlivePending = true
    return
  }
  const c = getCtx()
  if (!c || keepAliveOsc) return
  try {
    const gain = c.createGain()
    gain.gain.value = 0.0001 // 实际听不到，但音频管线在跑
    const osc = c.createOscillator()
    osc.frequency.value = 1 // 次声波，人耳不可闻
    osc.connect(gain).connect(c.destination)
    osc.start()
    keepAliveOsc = osc
  } catch {
    /* 保活失败不影响功能 */
  }
}

export const stopKeepAlive = () => {
  keepAlivePending = false // 挂起的保活请求一并取消
  try {
    keepAliveOsc?.stop()
  } catch {
    /* 已停止时忽略 */
  }
  keepAliveOsc = null
}

const F = {
  C4: 261.63, E4: 329.63, G4: 392,
  C5: 523.25, D5: 587.33, E5: 659.25, 'F5sharp': 739.99, G5: 783.99, A5: 880, B5: 987.77,
  C6: 1046.5, D6: 1174.66, E6: 1318.51, 'F6sharp': 1479.98, G6: 1567.98, A6: 1760, C7: 2093,
}

export const sfx = {
  /** 开局：轻快上行三音，仪式感但不吵 */
  start: () =>
    play([
      { freq: F.C5, at: 0, dur: 0.14, volume: 0.1 },
      { freq: F.E5, at: 0.09, dur: 0.14, volume: 0.1 },
      { freq: F.G5, at: 0.18, dur: 0.24, volume: 0.12 },
    ]),
  /** 到点提醒：轻快上行双音（专注/休息结束都奏，通知音的前台补充） */
  chime: () =>
    play([
      { freq: F.A5, at: 0, dur: 0.14, volume: 0.16 },
      { freq: 1108.73, at: 0.16, dur: 0.42, volume: 0.16 },
    ]),
  /** 局结算：温暖大和弦 + 高八度收尾 */
  settle: () =>
    play([
      { freq: F.C5, at: 0, dur: 0.35, volume: 0.12 },
      { freq: F.E5, at: 0.08, dur: 0.35, volume: 0.12 },
      { freq: F.G5, at: 0.16, dur: 0.4, volume: 0.12 },
      { freq: F.C6, at: 0.28, dur: 0.55, volume: 0.13 },
      { freq: F.E5, at: 0.28, dur: 0.55, volume: 0.06 },
      { freq: F.G5, at: 0.28, dur: 0.55, volume: 0.06 },
    ]),
  /** 升级：号角式五连音阶 */
  levelUp: () =>
    play([
      { freq: F.C5, at: 0, dur: 0.12, volume: 0.13, type: 'triangle' },
      { freq: F.E5, at: 0.1, dur: 0.12, volume: 0.13, type: 'triangle' },
      { freq: F.G5, at: 0.2, dur: 0.12, volume: 0.13, type: 'triangle' },
      { freq: F.C6, at: 0.3, dur: 0.14, volume: 0.14, type: 'triangle' },
      { freq: F.E6, at: 0.42, dur: 0.55, volume: 0.15, type: 'triangle' },
      { freq: F.G5, at: 0.42, dur: 0.55, volume: 0.07 },
      { freq: F.C6, at: 0.42, dur: 0.55, volume: 0.07 },
    ]),
  /** 新纪录：华丽上行琶音冲顶 */
  record: () =>
    play([
      { freq: F.G5, at: 0, dur: 0.1, volume: 0.12 },
      { freq: F.C6, at: 0.08, dur: 0.1, volume: 0.12 },
      { freq: F.E6, at: 0.16, dur: 0.1, volume: 0.13 },
      { freq: F.G6, at: 0.24, dur: 0.12, volume: 0.13 },
      { freq: F.C7, at: 0.34, dur: 0.65, volume: 0.14 },
      { freq: F.E6, at: 0.34, dur: 0.65, volume: 0.08 },
      { freq: F.G6, at: 0.34, dur: 0.65, volume: 0.08 },
    ]),
  /** 成就解锁：清脆叮-咚 */
  achievement: () =>
    play([
      { freq: F.E6, at: 0, dur: 0.16, volume: 0.13 },
      { freq: F.C6, at: 0.12, dur: 0.4, volume: 0.12 },
      { freq: F.G5, at: 0.12, dur: 0.4, volume: 0.07 },
    ]),
  /** 记录活动入账：轻快的金币双音 */
  coin: () =>
    play([
      { freq: F.A5, at: 0, dur: 0.09, volume: 0.09 },
      { freq: F.D6, at: 0.06, dur: 0.2, volume: 0.09 },
    ]),
  /** BOSS 受击：短促打击感双音（低频冲击 + 高频余响） */
  hit: () =>
    play([
      { freq: 160, at: 0, dur: 0.12, volume: 0.14, type: 'square' },
      { freq: F.G5, at: 0.05, dur: 0.16, volume: 0.08 },
    ]),
  /** BOSS 斩击：高频快速下滑（刀光掠过） */
  slash: () =>
    play([
      { freq: 1600, at: 0, dur: 0.08, volume: 0.1, type: 'sawtooth' },
      { freq: 820, at: 0.06, dur: 0.12, volume: 0.1, type: 'sawtooth' },
      { freq: F.E5, at: 0.1, dur: 0.08, volume: 0.06 },
    ]),
  /** BOSS 碎裂：低频爆裂 + 玻璃碎高频溅射 */
  shatter: () =>
    play([
      { freq: 60, at: 0, dur: 0.55, volume: 0.24, type: 'sine' },
      { freq: 130, at: 0.02, dur: 0.3, volume: 0.1, type: 'square' },
      { freq: 1900, at: 0.02, dur: 0.06, volume: 0.12, type: 'square' },
      { freq: 2500, at: 0.08, dur: 0.05, volume: 0.1, type: 'square' },
      { freq: 1350, at: 0.06, dur: 0.35, volume: 0.08, type: 'triangle' },
    ]),
  /** 宝箱蓄力抖动：低频隆隆 */
  chestShake: () =>
    play([
      { freq: 70, at: 0, dur: 0.5, volume: 0.16, type: 'sawtooth' },
      { freq: 55, at: 0.25, dur: 0.5, volume: 0.14, type: 'sawtooth' },
      { freq: 82, at: 0.5, dur: 0.45, volume: 0.15, type: 'square' },
    ]),
  /** 开箱滚轮咔嗒：极短促的高频点击（CSGO 式 tick） */
  reelTick: () =>
    play([
      { freq: 1900, at: 0, dur: 0.03, volume: 0.05, type: 'square' },
    ]),
  /** 宝箱开启：啵 + 上滑 */
  chestOpen: () =>
    play([
      { freq: 220, at: 0, dur: 0.08, volume: 0.14, type: 'triangle' },
      { freq: 440, at: 0.07, dur: 0.1, volume: 0.12, type: 'triangle' },
      { freq: 660, at: 0.15, dur: 0.22, volume: 0.11, type: 'triangle' },
    ]),
  /** 稀有度揭示：档位越高琶音越长越华丽（1=白 → 5=红） */
  chestReveal: (tier = 1) => {
    const seq: number[][] = [
      [F.C5],
      [F.C5, F.G5],
      [F.C5, F.E5, F.C6],
      [F.C5, F.E5, F.G5, F.C6, F.E6],
      [F.C5, F.D5, F.F5sharp, F.A5, F.C6, F.F6sharp, F.A6],
    ]
    const notes = seq[Math.max(0, Math.min(4, tier - 1))]
    const list: NoteOptions[] = notes.map((freq, i) => ({
      freq,
      at: i * 0.11,
      dur: 0.3,
      volume: 0.1 + tier * 0.012,
      type: 'triangle',
    }))
    // 高稀有度：结尾大和弦 + 低音鼓
    if (tier >= 3) {
      const end = notes.length * 0.11
      list.push({ freq: notes[notes.length - 1], at: end, dur: 0.7, volume: 0.13, type: 'triangle' })
      list.push({ freq: notes[notes.length - 1] * 0.5, at: end, dur: 0.7, volume: 0.07 })
      list.push({ freq: notes[notes.length - 1] * 0.75, at: end, dur: 0.7, volume: 0.06 })
    }
    if (tier >= 4) {
      const end = notes.length * 0.11
      list.push({ freq: 65, at: end - 0.05, dur: 0.5, volume: 0.2, type: 'sine' })
      list.push({ freq: 130, at: end - 0.05, dur: 0.4, volume: 0.1, type: 'square' })
    }
    if (tier >= 5) {
      const end = notes.length * 0.11
      list.push({ freq: 52, at: end + 0.15, dur: 0.8, volume: 0.22, type: 'sine' })
    }
    play(list)
  },
}

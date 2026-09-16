/**
 * BOSS 周挑战引擎（纯函数）：
 * - 伤害来源 = 局结算 XP（endSession → addActivity 的 session 分支）
 * - 每周一届（ISO 周惰性刷新）：未击杀归档战败，击杀归档讨伐成功，届数 +1 爬塔
 * - 击杀掉落：金币 + 必掉 1 件紫档以上背景/服饰（与宝箱保底计数独立）
 */

import type { ActivityType, AppState, BossModifier, BossState, ExtraBossState } from '../types'
import { BOSS_ROSTER, bossMaxHp, bossKillCoins, shuffleBossIds } from '../config/bossConfig'
import type { BossDef } from '../config/bossConfig'
import { CHEST_EXCLUSIVE_DEFS, chestRarityOf, type ChestRarity } from '../config/chestConfig'
import { SHOP_ITEMS, type ShopItem } from '../config/shopItems'
import { ACTIVITY_TYPES, DOMAIN_META, DUPLICATE_REWARD_COIN_RATE } from '../config/xpConfig'

/** ISO 周 key（YYYY-Www，周一为一周起点） */
export const isoWeekKey = (date: Date = new Date()): string => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7 // 周日=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum) // 周四锚定
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

/** 下一周一 0 点（展示倒计时用） */
export const nextMondayMidnight = (now: Date = new Date()): Date => {
  const d = new Date(now)
  const day = d.getDay() === 0 ? 7 : d.getDay()
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (8 - day))
  return next
}

/** 创建第 stage 届 BOSS 状态（洗牌循环：沿用未抽完的牌堆，抽完/首建重洗；
 *  固定血量见 bossConfig.bossMaxHp；每届随机 1 条限制规则） */
export const createBossState = (
  stage: number,
  history: BossState['history'] = [],
  prev?: BossState,
): BossState => {
  // 沿用上一届牌堆（未抽完时）；抽完、首建或旧档迁移（无牌堆）时重洗
  const reuse =
    !!prev?.bossOrder &&
    prev.orderStartStage !== undefined &&
    stage >= prev.orderStartStage &&
    stage - prev.orderStartStage < prev.bossOrder.length
  const bossOrder = reuse ? prev!.bossOrder! : shuffleBossIds()
  const orderStartStage = reuse ? prev!.orderStartStage! : stage
  const bossId = bossOrder[stage - orderStartStage]
  const maxHp = bossMaxHp(stage)
  return {
    weekKey: isoWeekKey(),
    bossId,
    stage,
    hp: maxHp,
    maxHp,
    totalDamage: 0,
    modifiers: rollBossModifiers(1),
    dailyDate: dateKey(new Date()),
    dailyCount: 0,
    bossOrder,
    orderStartStage,
    history,
  }
}

/** 按牌堆推算某届 BOSS 定义（如下周预告）；牌堆未覆盖该届（即将重洗）或无牌堆时返回 null */
export const bossDefByOrder = (
  stage: number,
  bs?: Pick<BossState, 'bossOrder' | 'orderStartStage'> | null,
): BossDef | null => {
  const order = bs?.bossOrder
  const start = bs?.orderStartStage
  if (!order || order.length === 0 || start === undefined) return null
  const idx = stage - start
  if (idx < 0 || idx >= order.length) return null
  return BOSS_ROSTER.find((b) => b.id === order[idx]) ?? null
}

export interface BossRolloverResult {
  state: AppState
  /** 是否发生了跨周刷新 */
  rolledOver: boolean
}

/** 惰性周刷新：当前 ISO 周与 bossState.weekKey 不一致时归档本届并生成下一届 */
export const rolloverBossIfNeeded = (state: AppState): BossRolloverResult => {
  const bs = state.bossState
  if (!bs) {
    // 旧档迁移：无 BOSS 状态 → 创建第 1 届
    return { state: { ...state, bossState: createBossState(1) }, rolledOver: true }
  }
  const currentWeek = isoWeekKey()
  if (bs.weekKey === currentWeek) {
    // 旧档回填：限制规则功能上线前生成的本周 BOSS 补掷 1 条（新档由 createBossState 生成）
    if (bs.modifiers && bs.modifiers.length > 0) return { state, rolledOver: false }
    return {
      state: { ...state, bossState: { ...bs, modifiers: rollBossModifiers(1) } },
      rolledOver: false,
    }
  }
  // 跨周：归档（击杀=killed；rewardClaimed 保留原值，killedAt 归档供讨伐成就统计），生成下一届
  const record = {
    weekKey: bs.weekKey,
    bossId: bs.bossId,
    stage: bs.stage,
    totalDamage: bs.totalDamage,
    killed: !!bs.killedAt,
    ...(bs.killedAt ? { killedAt: bs.killedAt } : {}),
    rewardClaimed: bs.rewardClaimed,
  }
  return {
    state: { ...state, bossState: createBossState(bs.stage + 1, [record, ...bs.history], bs) },
    rolledOver: true,
  }
}

export interface BossDamageResult {
  state: AppState
  /** 本局实际造成的伤害（击杀时不超过剩余 HP） */
  damage: number
  /** 本次是否击杀 */
  killed: boolean
  /** 限制规则命中说明（伤害被削减/归零时提示原因） */
  notes: string[]
}

/** 局结算 XP 转伤害：先过本届限制规则，再纯扣血（击杀只置 killedAt，奖励由 store 结算） */
export const applyBossDamage = (
  state: AppState,
  xpGained: number,
  session: { type: ActivityType; minutes: number; now?: Date },
): BossDamageResult => {
  const bs = state.bossState
  if (!bs || bs.killedAt || xpGained <= 0) return { state, damage: 0, killed: false, notes: [] }
  const ev = evaluateModifiers(bs.modifiers ?? [], session, bs.dailyDate ?? '', bs.dailyCount ?? 0)
  const damage = Math.min(bs.hp, Math.floor(xpGained * ev.mult))
  if (damage <= 0) return { state, damage: 0, killed: false, notes: ev.notes }
  const hp = bs.hp - damage
  const killed = hp <= 0
  return {
    state: {
      ...state,
      bossState: {
        ...bs,
        hp,
        totalDamage: bs.totalDamage + damage,
        dailyDate: ev.dailyDate,
        dailyCount: ev.capConsumed ? ev.dailyCount + 1 : ev.dailyCount,
        ...(killed ? { killedAt: new Date().toISOString() } : {}),
      },
    },
    damage,
    killed,
    notes: ev.notes,
  }
}

// ===== 击杀掉落 =====

/** BOSS 击杀掉落（一件紫档以上背景/服饰；重复折算金币） */
export interface BossLootDrop {
  item: ShopItem
  rarity: ChestRarity
  /** 重复拥有时折算的金币（发放端入账） */
  convertedCoins?: number
}

const BOSS_LOOT_CATS = new Set(['background', 'outfit'])

const pickWeighted = <T,>(entries: [T, number][]): T => {
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * total
  for (const [v, w] of entries) {
    r -= w
    if (r <= 0) return v
  }
  return entries[entries.length - 1][0]
}

/** 抽一件紫档以上背景/服饰（池空返回 null，改发额外金币） */
export const pickBossLoot = (ownedItems: string[]): BossLootDrop | null => {
  const rarity = pickWeighted<ChestRarity>([
    ['purple', 62],
    ['gold', 28],
    ['red', 10],
  ])
  const entries: [ShopItem, number][] = []
  for (const it of CHEST_EXCLUSIVE_DEFS) {
    if (BOSS_LOOT_CATS.has(it.category) && it.chestRarity === rarity) entries.push([it, 1])
  }
  for (const it of SHOP_ITEMS) {
    if (it.chestExclusive) continue
    if (!BOSS_LOOT_CATS.has(it.category)) continue
    if (chestRarityOf(it) === rarity) entries.push([it, 1])
  }
  if (entries.length === 0) return null
  const item = pickWeighted(entries)
  const owned = ownedItems.includes(item.id)
  return {
    item,
    rarity,
    ...(owned ? { convertedCoins: Math.round(item.price * DUPLICATE_REWARD_COIN_RATE) } : {}),
  }
}

/** 高压契约：限制规则越严苛，击杀金币越多（各规则系数连乘）
 *  「仅指定类型」与「每日前N局」最狠（×1.3），「仅限时段」次之（×1.25），
 *  「减半」最轻（×1.1）——难打的契约理应值钱。 */
const MODIFIER_BONUS: Record<BossModifier['kind'], number> = {
  timeWindow: 1.25,
  halfWindow: 1.1,
  minMinutes: 1.15,
  onlyTypes: 1.3,
  bannedTypes: 1.2,
  dailySessionCap: 1.3,
}

/** 计算限制规则的金币加成系数（无规则 = 1） */
export const modifierBonus = (modifiers?: BossModifier[]): number =>
  (modifiers ?? []).reduce((m, x) => m * MODIFIER_BONUS[x.kind], 1)

/** 高压契约文案（战报展示用）：如「⚡ 高压契约 ×1.56」 */
export const modifierBonusLabel = (modifiers?: BossModifier[]): string | undefined => {
  const b = modifierBonus(modifiers)
  return b > 1.001 ? `⚡ 高压契约：限制加成 ×${b.toFixed(2)}` : undefined
}

/** 击杀奖励数值（金币 + 掉落；带限制规则时按严苛度上浮「高压契约」加成） */
export const bossKillRewards = (
  stage: number,
  ownedItems: string[],
  modifiers?: BossModifier[],
): { coins: number; loot: BossLootDrop | null } => ({
  coins: Math.round(bossKillCoins(stage) * modifierBonus(modifiers)),
  loot: pickBossLoot(ownedItems),
})

// ===== 限制规则（周 BOSS / 追加 BOSS 共用） =====

/** 本地日期 key（dailySessionCap 跨日重置用） */
const dateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 时段判断（endHour=24 表示当天结束） */
const hourInWindow = (h: number, start: number, end: number): boolean => {
  const e = end >= 24 ? 24 : end
  return h >= start && h < e
}

const formatHour = (h: number): string => (h >= 24 ? '24:00' : `${String(h).padStart(2, '0')}:00`)

const typesLabel = (types: ActivityType[]): string => types.map((t) => DOMAIN_META[t].label).join('、')

/** 限制规则 → 中文描述（召唤展示 / 战报提示共用） */
export const describeBossModifier = (m: BossModifier): string => {
  switch (m.kind) {
    case 'timeWindow':
      return `仅 ${formatHour(m.startHour)}–${formatHour(m.endHour)} 期间可造成伤害`
    case 'halfWindow':
      return `${formatHour(m.startHour)}–${formatHour(m.endHour)} 期间伤害减半`
    case 'minMinutes':
      return `单局时长 ≥${m.minutes} 分钟才能造成伤害`
    case 'onlyTypes':
      return `仅 ${typesLabel(m.types)} 类型的局可造成伤害`
    case 'bannedTypes':
      return `${typesLabel(m.types)} 类型的局无法造成伤害`
    case 'dailySessionCap':
      return `每日仅前 ${m.count} 个生效局造成伤害（零碎时间）`
  }
}

/** 规则图标（BOSS 卡片展示） */
export const bossModifierIcon = (m: BossModifier): string => {
  switch (m.kind) {
    case 'timeWindow':
      return '🌙'
    case 'halfWindow':
      return '🌗'
    case 'minMinutes':
      return '⏳'
    case 'onlyTypes':
      return '🎯'
    case 'bannedTypes':
      return '🚫'
    case 'dailySessionCap':
      return '🧩'
  }
}

/** 随机生成一条限制规则 */
const rollBossModifier = (): BossModifier => {
  const kind = pickWeighted<BossModifier['kind']>([
    ['timeWindow', 22],
    ['halfWindow', 15],
    ['minMinutes', 17],
    ['onlyTypes', 16],
    ['bannedTypes', 16],
    ['dailySessionCap', 14],
  ])
  switch (kind) {
    case 'timeWindow': {
      // 窗口 ≥10 小时，且起止全部落在清醒时段（6:00–23:00），避免「全在睡觉时间」的阴间规则
      const windows: [number, number][] = [
        [6, 16], [7, 17], [7, 18], [8, 18], [8, 19], [8, 20], [9, 19], [9, 20],
        [9, 21], [10, 20], [10, 21], [10, 22], [11, 21], [12, 22], [13, 23],
      ]
      const [s, e] = windows[Math.floor(Math.random() * windows.length)]
      return { kind: 'timeWindow', startHour: s, endHour: e }
    }
    case 'halfWindow': {
      const windows: [number, number][] = [[9, 12], [14, 18], [20, 24], [0, 5]]
      const [s, e] = windows[Math.floor(Math.random() * windows.length)]
      return { kind: 'halfWindow', startHour: s, endHour: e }
    }
    case 'minMinutes': {
      const minutes = [20, 25, 30, 45][Math.floor(Math.random() * 4)]
      return { kind: 'minMinutes', minutes }
    }
    case 'onlyTypes': {
      // 11 选 4~5：足够多样，大多数局型都能命中
      const pool = [...ACTIVITY_TYPES]
      const types: ActivityType[] = []
      const n = 4 + (Math.random() < 0.4 ? 1 : 0)
      for (let i = 0; i < n && pool.length > 0; i++) {
        types.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
      }
      return { kind: 'onlyTypes', types }
    }
    case 'bannedTypes': {
      const pool = [...ACTIVITY_TYPES]
      const types: ActivityType[] = []
      for (let i = 0; i < 3 && pool.length > 0; i++) {
        types.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
      }
      return { kind: 'bannedTypes', types }
    }
    case 'dailySessionCap':
      return { kind: 'dailySessionCap', count: 2 + Math.floor(Math.random() * 2) }
  }
}

/** 掷 count 条互不重复的限制规则（周 BOSS 1 条；追加 BOSS 1~2 条） */
const rollBossModifiers = (count: number): BossModifier[] => {
  const modifiers: BossModifier[] = []
  for (let i = 0; i < count; i++) {
    // rollBossModifier 按权重随机 kind，重掷保证互不重复（上限 10 次）
    for (let retry = 0; retry < 10; retry++) {
      const m = rollBossModifier()
      if (!modifiers.some((x) => x.kind === m.kind)) {
        modifiers.push(m)
        break
      }
    }
  }
  return modifiers
}

export interface BossModifierEval {
  /** 伤害倍率（0=无效；多条规则乘算叠加） */
  mult: number
  /** 命中说明（伤害被削减/归零的原因） */
  notes: string[]
  /** dailySessionCap 是否消耗今日一次名额 */
  capConsumed: boolean
  /** 归一后的每日计数日期与计数（跨日自动重置） */
  dailyDate: string
  dailyCount: number
}

/** 评估限制规则（周 BOSS / 追加 BOSS 共用）：逐条检查，倍率乘算叠加 */
const evaluateModifiers = (
  modifiers: BossModifier[],
  session: { type: ActivityType; minutes: number; now?: Date },
  dailyDate: string,
  dailyCount: number,
): BossModifierEval => {
  const now = session.now ?? new Date()
  const h = now.getHours()
  const today = dateKey(now)
  const count = dailyDate === today ? dailyCount : 0
  let mult = 1
  const notes: string[] = []
  let capConsumed = false
  for (const m of modifiers) {
    switch (m.kind) {
      case 'timeWindow':
        if (!hourInWindow(h, m.startHour, m.endHour)) {
          mult = 0
          notes.push(`限制「${describeBossModifier(m)}」：当前不在可伤害时段`)
        }
        break
      case 'halfWindow':
        if (hourInWindow(h, m.startHour, m.endHour)) {
          mult *= 0.5
          notes.push(`限制「${describeBossModifier(m)}」：本局伤害减半`)
        }
        break
      case 'minMinutes':
        if (session.minutes < m.minutes) {
          mult = 0
          notes.push(`限制「${describeBossModifier(m)}」：本局时长不足`)
        }
        break
      case 'onlyTypes':
        if (!m.types.includes(session.type)) {
          mult = 0
          notes.push(`限制「${describeBossModifier(m)}」：本局类型不符`)
        }
        break
      case 'bannedTypes':
        if (m.types.includes(session.type)) {
          mult = 0
          notes.push(`限制「${describeBossModifier(m)}」：本局类型被禁`)
        }
        break
      case 'dailySessionCap':
        if (count >= m.count) {
          mult = 0
          notes.push(`限制「${describeBossModifier(m)}」：今日有效局已用尽`)
        } else {
          capConsumed = true
        }
        break
    }
  }
  return { mult, notes, capConsumed, dailyDate: today, dailyCount: count }
}

// ===== 追加讨伐（周 BOSS 击杀后可反复召唤的额外 BOSS，限制规则 1~2 条） =====

/** 召唤一只追加 BOSS：随机敌人（避开本周 BOSS）+ 互不重复的限制规则，HP 为同届周 BOSS 的 60% */
export const createExtraBoss = (stage: number, excludeBossId: string): ExtraBossState => {
  const pool = BOSS_ROSTER.filter((b) => b.id !== excludeBossId)
  const boss = pool[Math.floor(Math.random() * pool.length)]
  const maxHp = Math.round(bossMaxHp(stage) * 0.6)
  return {
    bossId: boss.id,
    maxHp,
    hp: maxHp,
    totalDamage: 0,
    modifiers: rollBossModifiers(1 + (Math.random() < 0.55 ? 1 : 0)),
    dailyDate: dateKey(new Date()),
    dailyCount: 0,
    summonedAt: new Date().toISOString(),
  }
}

export interface ExtraBossDamageResult {
  state: AppState
  /** 本局实际造成的伤害（限制规则结算后） */
  damage: number
  killed: boolean
  /** 规则命中说明（伤害被削减/归零时提示用户原因） */
  notes: string[]
}

/** 追加 BOSS 伤害结算：逐条评估限制规则（乘算叠加），再扣血 */
export const applyExtraBossDamage = (
  state: AppState,
  xpGained: number,
  session: { type: ActivityType; minutes: number; now?: Date },
): ExtraBossDamageResult => {
  const bs = state.bossState
  const extra = bs?.extra
  if (!bs || !extra || extra.killedAt || xpGained <= 0) {
    return { state, damage: 0, killed: false, notes: [] }
  }
  const ev = evaluateModifiers(extra.modifiers, session, extra.dailyDate, extra.dailyCount)
  const damage = Math.min(extra.hp, Math.floor(xpGained * ev.mult))
  if (damage <= 0) return { state, damage: 0, killed: false, notes: ev.notes }
  const hp = extra.hp - damage
  const killed = hp <= 0
  const nextExtra: ExtraBossState = {
    ...extra,
    hp,
    totalDamage: extra.totalDamage + damage,
    dailyDate: ev.dailyDate,
    dailyCount: ev.capConsumed ? ev.dailyCount + 1 : ev.dailyCount,
    ...(killed ? { killedAt: new Date().toISOString() } : {}),
  }
  return {
    state: { ...state, bossState: { ...bs, extra: nextExtra } },
    damage,
    killed,
    notes: ev.notes,
  }
}

/** 追加 BOSS 击杀奖励：金币为周 BOSS 的 60%（乘高压契约加成），35% 概率掉落紫档以上背景/服饰（可反复刷，不给保底） */
export const extraBossKillRewards = (
  stage: number,
  ownedItems: string[],
  modifiers?: BossModifier[],
): { coins: number; loot: BossLootDrop | null } => ({
  coins: Math.round(bossKillCoins(stage) * 0.6 * modifierBonus(modifiers)),
  loot: Math.random() < 0.35 ? pickBossLoot(ownedItems) : null,
})

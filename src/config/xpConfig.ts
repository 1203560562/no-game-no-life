import type { ActivityType, AttributeKey, Intensity } from '../types'
import { BACKGROUNDS } from './backgrounds'
import { LIVE2D_MODELS } from './live2dModels'
import { SHOP_ITEMS } from './shopItems'

// ===== Level curve =====
// requiredXP(level) = floor(100 * level^1.35)
export const requiredXpForLevel = (level: number): number =>
  Math.floor(100 * Math.pow(level, 1.35))

export const xpToNextLevel = (level: number): number => requiredXpForLevel(level)

// ===== Attribute metadata =====
export const ATTRIBUTE_META: Record<
  AttributeKey,
  { label: string; cn: string; color: string; icon: string }
> = {
  vitality: { label: 'Vitality', cn: '生命力', color: '#ff6b6b', icon: '❤️' },
  wisdom: { label: 'Wisdom', cn: '智慧', color: '#5b8def', icon: '📖' },
  focus: { label: 'Focus', cn: '专注', color: '#fbbf24', icon: '🎯' },
  creativity: { label: 'Creativity', cn: '创造', color: '#c084fc', icon: '🎨' },
  courage: { label: 'Courage', cn: '勇气', color: '#fb7185', icon: '⚔️' },
  connection: { label: 'Connection', cn: '社交', color: '#34d399', icon: '🤝' },
  freedom: { label: 'Freedom', cn: '自由', color: '#60a5fa', icon: '🕊️' },
}

export const ATTRIBUTE_KEYS: AttributeKey[] = [
  'vitality',
  'wisdom',
  'focus',
  'creativity',
  'courage',
  'connection',
  'freedom',
]

// ===== Life domains (职业面板) =====
export interface DomainMeta {
  type: ActivityType
  label: string
  icon: string
  color: string
}

export const DOMAIN_META: Record<ActivityType, DomainMeta> = {
  work: { type: 'work', label: '工作', icon: '💻', color: '#60a5fa' },
  study: { type: 'study', label: '学习', icon: '📚', color: '#5b8def' },
  exercise: { type: 'exercise', label: '运动', icon: '🏸', color: '#34d399' },
  food: { type: 'food', label: '饮食', icon: '🥗', color: '#a3e635' },
  sleep: { type: 'sleep', label: '睡眠', icon: '😴', color: '#818cf8' },
  game: { type: 'game', label: '娱乐', icon: '🎮', color: '#f472b6' },
  life: { type: 'life', label: '生活', icon: '🏠', color: '#fbbf24' },
  social: { type: 'social', label: '关系', icon: '❤️', color: '#fb7185' },
  creative: { type: 'creative', label: '创作', icon: '🎨', color: '#c084fc' },
  challenge: { type: 'challenge', label: '挑战自我', icon: '🧗', color: '#fb923c' },
  mental: { type: 'mental', label: '心理', icon: '🧠', color: '#22d3ee' },
}

export const ACTIVITY_TYPES: ActivityType[] = [
  'work',
  'study',
  'exercise',
  'food',
  'sleep',
  'game',
  'life',
  'social',
  'creative',
  'challenge',
  'mental',
]

// ===== XP config (configurable for balancing) =====
export interface XpRule {
  base: number
  perMinute?: number // xp per minute of duration
  intensityMultiplier?: Record<Intensity, number>
  difficultyMultiplier?: number // for tasks with difficulty 1..5
  /** minutes after which diminishing returns kick in (per day) */
  diminishingAfterMinutes?: number
  /** hard daily cap in minutes for full reward */
  capMinutes?: number
}

export const XP_CONFIG: Record<ActivityType, XpRule> = {
  work: {
    base: 10,
    perMinute: 0.6,
    intensityMultiplier: { low: 0.8, medium: 1, high: 1.25 },
    difficultyMultiplier: 1.2,
    diminishingAfterMinutes: 360, // 6h
    capMinutes: 600,
  },
  study: {
    base: 15,
    perMinute: 0.7,
    intensityMultiplier: { low: 0.8, medium: 1, high: 1.2 },
    diminishingAfterMinutes: 240,
    capMinutes: 360,
  },
  exercise: {
    base: 20,
    perMinute: 0.9,
    intensityMultiplier: { low: 0.7, medium: 1, high: 1.3 },
    diminishingAfterMinutes: 120, // after 2h, diminishing
    capMinutes: 180,
  },
  food: {
    base: 5,
    perMinute: 0,
    intensityMultiplier: { low: 1, medium: 1, high: 1 },
  },
  sleep: {
    base: 0,
    perMinute: 0,
    intensityMultiplier: { low: 1, medium: 1, high: 1 },
  },
  game: {
    base: 5,
    perMinute: 0.3,
    intensityMultiplier: { low: 1, medium: 1, high: 1 },
    diminishingAfterMinutes: 90,
    capMinutes: 180,
  },
  life: {
    base: 8,
    perMinute: 0.4,
    intensityMultiplier: { low: 1, medium: 1, high: 1.1 },
  },
  social: {
    base: 12,
    perMinute: 0.5,
    intensityMultiplier: { low: 1, medium: 1, high: 1.1 },
  },
  creative: {
    base: 20,
    perMinute: 0.8,
    intensityMultiplier: { low: 0.9, medium: 1, high: 1.2 },
    diminishingAfterMinutes: 240,
  },
  challenge: {
    // 手动记录同样走效率引擎（与运动同口径），此表仅作兜底
    base: 20,
    perMinute: 0.9,
    intensityMultiplier: { low: 0.7, medium: 1, high: 1.3 },
  },
  mental: {
    base: 15,
    perMinute: 0,
    intensityMultiplier: { low: 1, medium: 1, high: 1 },
  },
}

// ===== Daily XP cap (anti-grind) =====
export const DAILY_XP_CAP = 800
export const DAILY_DOMAIN_CAP: Record<ActivityType, number> = {
  work: 350,
  study: 200,
  exercise: 180,
  food: 60,
  sleep: 120,
  game: 100,
  life: 80,
  social: 120,
  creative: 200,
  challenge: 250,
  mental: 150,
}

// ===== Coins =====
export const COINS_PER_XP = 1 // 1 coin per xp earned

// ===== v1.0 效率模型（增量游戏核心） =====
// 最终产出 XP/min = BASE_EFFICIENCY × 等级修正 × 属性修正 × 类型修正（× 增益）
// 「效率修正」（×x.xx）= 等级修正 × 属性修正 × 类型修正，即玩家相对基础的成长倍率

/** 基础效率（XP/min） */
export const BASE_EFFICIENCY = 5.0

/** 等级修正：1 + (level-1) × 0.03 → Lv1=×1.00 Lv10=×1.27 Lv20=×1.57 Lv30=×1.87 */
export const levelEfficiencyMod = (level: number): number =>
  1 + Math.max(0, level - 1) * 0.03

/** 各类型影响效率的属性（每点 +0.4%） */
export const TYPE_ATTR_BONUS: Partial<Record<ActivityType, AttributeKey[]>> = {
  work: ['focus', 'wisdom'],
  study: ['wisdom', 'focus'],
  exercise: ['vitality'],
  creative: ['creativity'],
  life: ['vitality', 'freedom'],
  social: ['connection'],
  game: [],
  challenge: ['courage', 'focus'],
}

export const ATTR_BONUS_PER_POINT = 0.004

/**
 * 属性软上限（属性条/属性雷达的刻度上限）：随等级成长
 * Lv1=120 · Lv20=500 · Lv50=1100 · Lv100=2100
 * 超过上限不惩罚——数值照常累计，UI 亮「突破」徽章庆祝溢出。
 */
export const attributeCap = (level: number): number => 100 + Math.max(1, level) * 20

/**
 * 属性雷达的实际刻度上限：不超过等级软上限的 2 倍，也不超过当前最高属性的 2 倍
 * —— 保证最强属性至少占半径一半（雷达饱满有形），其余属性按真实比例展开。
 */
export const radarScaleMax = (level: number, attrs: Record<string, number>): number => {
  const cap = attributeCap(level) * 2
  const maxAttr = Math.max(1, ...Object.values(attrs))
  return Math.min(cap, Math.ceil(maxAttr * 2))
}

/** 类型修正：不同领域天然产出不同（0 表示该类型不适合开局） */
export const TYPE_EFFICIENCY: Record<ActivityType, number> = {
  work: 1.0,
  study: 0.95,
  exercise: 1.1,
  creative: 1.05,
  life: 0.9,
  social: 0.9,
  game: 0.6,
  challenge: 1.1,
  food: 0,
  sleep: 0,
  mental: 0,
}

/** 可作为「一局」类型的活动 */
export const SESSION_TYPES: ActivityType[] = [
  'work',
  'study',
  'exercise',
  'creative',
  'life',
  'social',
  'game',
  'challenge',
]

/** 局时长预设（分钟） */
export const SESSION_PRESETS = [15, 25, 45, 60]

/** 局结算金币汇率（局是金币的主要获取途径；手动记录不再产金币） */
export const SESSION_COINS_PER_XP = 2

/** 局属性增长：每投入 25 分钟按 ATTRIBUTE_GAIN_TABLE 结一轮 */
export const SESSION_ATTR_MINUTES_PER_ROUND = 25

/** 局历史保留条数（效率曲线统计窗口） */
export const SESSION_HISTORY_LIMIT = 500

// ===== v1.0 技能系统（技能点出口） =====
// 升级 +1 技能点 → 投入领域技能 → 该领域局效率永久提升
// 「下一局真的比上一局更强」的主动成长手段

export interface SkillDef {
  /** 技能 id（对应 Player.skills key） */
  id: string
  /** 加成的领域 */
  type: ActivityType
  name: string
  icon: string
  desc: string
  /** 每级效率加成（0.015 = +1.5%/级） */
  bonusPerLevel: number
  maxLevel: number
  /** 每级消耗技能点 */
  spCost: number
  /** 全领域生效（突破自我：加成所有局效率，不限于单一领域） */
  global?: boolean
}

export const SKILL_DEFS: SkillDef[] = [
  { id: 'skill_work', type: 'work', name: '执行力', icon: '💻', desc: '工作局效率提升', bonusPerLevel: 0.015, maxLevel: 10, spCost: 1 },
  { id: 'skill_study', type: 'study', name: '学习力', icon: '📚', desc: '学习局效率提升', bonusPerLevel: 0.015, maxLevel: 10, spCost: 1 },
  { id: 'skill_exercise', type: 'exercise', name: '体能', icon: '🏸', desc: '运动局效率提升', bonusPerLevel: 0.015, maxLevel: 10, spCost: 1 },
  { id: 'skill_creative', type: 'creative', name: '灵感', icon: '🎨', desc: '创作局效率提升', bonusPerLevel: 0.015, maxLevel: 10, spCost: 1 },
  { id: 'skill_life', type: 'life', name: '生活术', icon: '🏠', desc: '生活局效率提升', bonusPerLevel: 0.015, maxLevel: 10, spCost: 1 },
  { id: 'skill_social', type: 'social', name: '亲和力', icon: '❤️', desc: '关系局效率提升', bonusPerLevel: 0.015, maxLevel: 10, spCost: 1 },
  { id: 'skill_game', type: 'game', name: '玩心', icon: '🎮', desc: '娱乐局效率提升', bonusPerLevel: 0.015, maxLevel: 10, spCost: 1 },
  { id: 'skill_transcend', type: 'mental', name: '突破自我', icon: '🔥', desc: '全领域局效率提升', bonusPerLevel: 0.01, maxLevel: 10, spCost: 1, global: true },
]

/** 突破自我（全领域技能）id —— computeEfficiency 对其单独结算 */
export const SKILL_TRANSCEND_ID = 'skill_transcend'

export const skillDefForType = (type: ActivityType): SkillDef | undefined =>
  SKILL_DEFS.find((s) => s.type === type)

// ===== Attribute growth config =====
// each activity type contributes attribute points (small integers)
export const ATTRIBUTE_GAIN_TABLE: Record<
  ActivityType,
  Partial<Record<AttributeKey, number>>
> = {
  work: { focus: 1, wisdom: 1 },
  study: { wisdom: 1, focus: 1 },
  exercise: { vitality: 2 },
  food: { vitality: 1 },
  sleep: { vitality: 2 },
  game: {}, // happiness is separate, not a core attribute
  life: { vitality: 1, freedom: 1 },
  social: { connection: 2 },
  creative: { creativity: 2 },
  mental: { wisdom: 1, courage: 1 },
  challenge: { courage: 2 },
}

// ===== Titles by level =====
export const TITLES_BY_LEVEL: { level: number; title: string }[] = [
  { level: 1, title: '刚刚出发的人' },
  { level: 5, title: '迈出第一步的人' },
  { level: 10, title: '开始行动的人' },
  { level: 15, title: '稳步前行者' },
  { level: 20, title: '持续行动者' },
  { level: 25, title: '不再等待的人' },
  { level: 30, title: '自由探索者' },
  { level: 40, title: '坚定的旅人' },
  { level: 50, title: '自己的冒险家' },
  { level: 75, title: '人生的玩家' },
  { level: 100, title: '自己故事的作者' },
]

export const titleForLevel = (level: number): string => {
  let result = '刚刚出发的人'
  for (const t of TITLES_BY_LEVEL) {
    if (level >= t.level) result = t.title
  }
  return result
}

// ===== Level-up rewards =====
export const levelUpCoinReward = (newLevel: number): number =>
  100 + newLevel * 20

export const levelUpSkillPointReward = (): number => 1

/**
 * 升级奖励配置（《成为自己》内容扩展·第八节；奖励体系 v2）
 *
 * 装饰品道具体系已下架，等级奖励改为解锁背景 / Live2D 形象：
 * - unlocks 里的 id 在 BACKGROUNDS 中 → 背景（加入 player.unlockedItems）
 * - 在 LIVE2D_MODELS 中 → 形象（unlockModel，与宝箱/商店同渠道）
 * 每 10 级里程碑、50/100 级功能解锁保持不变。
 */
export interface LevelUpRewardConfig {
  /** 解锁的背景 / Live2D 形象 id（升级时自动发放） */
  unlocks?: string[]
  /** 解锁的功能标识 */
  featureUnlocks?: string[]
  /** 是否为里程碑（额外展示） */
  milestone?: boolean
  /** 里程碑奖励描述（叙事性） */
  milestoneDesc?: string
}

export const LEVEL_UP_REWARDS: Record<number, LevelUpRewardConfig> = {
  // 前期：白档背景 + 蓝档形象
  3: { unlocks: ['bg_forest'] },
  5: { unlocks: ['bg_stars'], milestoneDesc: '你开始有了冒险者的样子。' },
  8: { unlocks: ['al_chuixue_3'] },
  10: { unlocks: ['bg_neon_city'], milestone: true, milestoneDesc: '十级——你坚持了下来，这本身就很了不起。' },
  // 中期：紫档背景/形象 + 蓝档主力舰
  12: { unlocks: ['al_aierdeliqi_4'] },
  15: { unlocks: ['bg_anime_rain_city'] },
  18: { unlocks: ['al_bisimai_2'] },
  20: { unlocks: ['bg_anime_fireworks'], milestone: true, milestoneDesc: '二十级——你不再需要别人告诉你该做什么。' },
  25: { unlocks: ['al_aidang_2'] },
  // 后期：金/红档背景 + 金档形象
  30: { unlocks: ['bg_celestial'], milestone: true, milestoneDesc: '三十级——你已经走了很远。' },
  35: { unlocks: ['al_beierfasite_2'] },
  40: { unlocks: ['jingliu'], milestone: true, milestoneDesc: '四十级——王冠不是别人给的，是自己走出来的。' },
  45: { unlocks: ['tingyun'] },
  50: {
    unlocks: ['bg_aurora_palace'],
    milestone: true,
    featureUnlocks: ['legendaryShop'],
    milestoneDesc: '五十级——「自己的冒险家」。传奇商店已为你开启。',
  },
  60: { unlocks: ['fuxuan'], milestone: true, milestoneDesc: '六十级——你走出了自己的路。' },
  70: { unlocks: ['ruanmei'], milestone: true, milestoneDesc: '七十级——你看见了时间的纹理。' },
  80: { unlocks: ['kiana'], milestone: true, milestoneDesc: '八十级——你拥有了属于自己的世界线。' },
  90: { unlocks: ['kp31'], milestone: true, milestoneDesc: '九十级——真正的自由是能选择不做什么。' },
  100: {
    unlocks: ['aniya'],
    milestone: true,
    featureUnlocks: ['becomeSelfEnding'],
    milestoneDesc: '一百级——「自己故事的作者」。你成为了自己。',
  },
}

/** 获取某级的升级奖励（若有） */
export const getLevelUpReward = (level: number): LevelUpRewardConfig | null =>
  LEVEL_UP_REWARDS[level] ?? null

/** 等级奖励 id → 展示名（背景「xx」/ 形象「xx」） */
export const levelRewardLabel = (id: string): string => {
  const bg = BACKGROUNDS.find((b) => b.id === id)
  if (bg) return `背景「${bg.name}」`
  const m = LIVE2D_MODELS.find((x) => x.id === id)
  if (m) return `形象「${m.label}」`
  return id
}

/** 等级奖励 id → 商店售价（重复奖励折算金币的基准；查不到返回 0） */
export const levelRewardPrice = (id: string): number =>
  LIVE2D_MODELS.find((m) => m.id === id)?.shopPrice ??
  SHOP_ITEMS.find((s) => s.id === id)?.price ??
  0

/** 重复等级奖励的折算比例（商店价 × 该系数 → 金币，与宝箱折算思路一致） */
export const DUPLICATE_REWARD_COIN_RATE = 0.5

/** 收集 ≤ level 的全部等级奖励 id（存量玩家启动补发用） */
export const levelUnlockIdsUpTo = (level: number): string[] =>
  Object.entries(LEVEL_UP_REWARDS).flatMap(([lv, r]) =>
    Number(lv) <= level ? r.unlocks ?? [] : [],
  )

/** 下一个有奖励的等级（首页徽章预告用）；全部解锁返回 null */
export const nextLevelUnlockReward = (level: number): { level: number; ids: string[] } | null => {
  const keys = Object.keys(LEVEL_UP_REWARDS).map(Number).sort((a, b) => a - b)
  for (const k of keys) {
    const ids = LEVEL_UP_REWARDS[k].unlocks ?? []
    if (k > level && ids.length > 0) return { level: k, ids }
  }
  return null
}


// ===== Sleep rules =====
// hours -> xp & vitality
// ===== 睡眠时段（良好作息奖励系数；period 存于 Activity.subtype） =====
export interface SleepPeriodDef {
  id: string
  label: string
  /** 描述入睡窗口 */
  window: string
  /** XP 奖励系数 */
  mult: number
}

export const SLEEP_PERIODS: SleepPeriodDef[] = [
  { id: 'early', label: '早睡', window: '22:00 前入睡', mult: 1.4 },
  { id: 'normal', label: '正常', window: '22:00–01:00', mult: 1.0 },
  { id: 'late', label: '晚睡', window: '01:00–02:00', mult: 0.6 },
  { id: 'overnight', label: '熬夜', window: '02:00 后', mult: 0.3 },
]

export const sleepPeriodDef = (id?: string): SleepPeriodDef =>
  SLEEP_PERIODS.find((p) => p.id === id) ?? SLEEP_PERIODS[1]

/**
 * 睡眠奖励：时长质量带 × 时段系数。
 * 7-9h 满分 120 XP（早睡 ×1.4 = 168），鼓励「睡够 + 睡对时间」。
 */
export const sleepReward = (hours: number, period?: string): { xp: number; vitality: number } => {
  const mult = sleepPeriodDef(period).mult
  let xp = 0
  let vitality = 0
  if (hours >= 7 && hours <= 9) {
    xp = 120
    vitality = 2
  } else if (hours >= 6 && hours < 7) {
    xp = 50
    vitality = 1
  } else if (hours > 9 && hours <= 10) {
    xp = 50
    vitality = 1
  }
  return { xp: Math.round(xp * mult), vitality }
}

// ===== Weight consistency rewards =====
export const WEIGHT_STREAK_REWARDS: { days: number; xp: number }[] = [
  { days: 7, xp: 50 },
  { days: 30, xp: 300 },
]

// ===== 体重目标节点奖励（进度百分比档位；数值随该节点对应的实际变化 kg 量放大） =====
/** 节点进度百分比（0..1），达成即发放一次性奖励 */
export const WEIGHT_GOAL_NODE_PCTS: number[] = [
  0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1,
]

/**
 * 节点奖励计算：kg = 该节点对应的实际变化量（pct × 总目标变化 |target-start|）。
 * XP 与金币随 kg 线性放大并封顶（防止极端大目标数值失控）。
 */
export const weightNodeReward = (pct: number, totalDeltaKg: number): { xp: number; coins: number } => ({
  xp: Math.min(3200, Math.round(240 + pct * totalDeltaKg * 240)),
  coins: Math.min(2000, Math.round(160 + pct * totalDeltaKg * 120)),
})

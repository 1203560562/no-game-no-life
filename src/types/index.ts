// ===== Core data models for the Become Yourself system =====

export type ActivityType =
  | 'work'
  | 'study'
  | 'exercise'
  | 'food'
  | 'sleep'
  | 'game'
  | 'life'
  | 'social'
  | 'creative'
  | 'mental'
  | 'challenge'

export type Intensity = 'low' | 'medium' | 'high'

export type AttributeKey =
  | 'vitality'
  | 'wisdom'
  | 'focus'
  | 'creativity'
  | 'courage'
  | 'connection'
  | 'freedom'

export type Attributes = Record<AttributeKey, number>

export interface Activity {
  id: string
  type: ActivityType
  title: string
  description?: string
  startTime?: string // ISO
  durationMinutes?: number
  intensity?: Intensity
  /** sub-type, e.g. exercise: badminton / running */
  subtype?: string
  /** difficulty 1..5 for work/study tasks */
  difficulty?: number
  /** was the action proactive (vs reactive)? affects effort */
  proactive?: boolean
  /** escaped-type entertainment (no XP, just recorded) */
  isEscape?: boolean
  /** computed XP awarded */
  xp: number
  /** attribute deltas awarded */
  attributeGains?: Partial<Attributes>
  createdAt: string // ISO
  /** v1.0：由一局结算产生的活动 */
  isSession?: boolean
  sessionId?: string
}

export interface WeightRecord {
  date: string // YYYY-MM-DD
  weightKg: number
}

// ===== BOSS 周挑战 =====

/** 历届 BOSS 战报（编年史） */
export interface BossRecord {
  /** ISO 周 'YYYY-Www' */
  weekKey: string
  bossId: string
  /** 第几届（从 1 递增） */
  stage: number
  /** 当周累计伤害 */
  totalDamage: number
  /** 是否击杀 */
  killed: boolean
  /** 击杀时间（ISO，归档自 killedAt；旧档案可能缺失） */
  killedAt?: string
  /** 击杀奖励是否已入账 */
  rewardClaimed?: boolean
}

/** BOSS 的独特限制规则（周 BOSS 每届随机 1 条；追加 BOSS 随机 1~2 条；伤害结算时评估） */
export type BossModifier =
  /** 仅允许该时段造成伤害（窗口 ≥10h 且不落在睡眠时段；endHour=24 表示当天结束） */
  | { kind: 'timeWindow'; startHour: number; endHour: number }
  /** 该时段内伤害减半 */
  | { kind: 'halfWindow'; startHour: number; endHour: number }
  /** 单局时长不低于 minutes 分钟才造成伤害 */
  | { kind: 'minMinutes'; minutes: number }
  /** 仅这些活动类型的局造成伤害（4~5 种，保证多样性） */
  | { kind: 'onlyTypes'; types: ActivityType[] }
  /** 这些活动类型的局无法造成伤害 */
  | { kind: 'bannedTypes'; types: ActivityType[] }
  /** 每日仅前 count 个有效局造成伤害（零碎时间） */
  | { kind: 'dailySessionCap'; count: number }

/** 追加讨伐 BOSS（周 BOSS 击杀后可反复召唤的额外挑战，带独特限制） */
export interface ExtraBossState {
  bossId: string
  /** 总 HP（周 BOSS 同届血量的 60%） */
  maxHp: number
  hp: number
  totalDamage: number
  /** 随机限制规则（1-2 条） */
  modifiers: BossModifier[]
  /** 每日已结算有效局的日期与计数（dailySessionCap 用，跨日重置） */
  dailyDate: string
  dailyCount: number
  killedAt?: string
  rewardClaimed?: boolean
  summonedAt: string
}

// ===== 周委托任务 =====

/** 委托目标类型（进度统计口径由委托引擎解释） */
export type QuestKind =
  | 'sessions' // 完成任意类型局 N 次
  | 'sessionsType' // 完成指定类型局 N 次
  | 'bossDamage' // 周内 BOSS 累计伤害 ≥ N
  | 'xp' // 周内累计 XP ≥ N
  | 'earlyBird' // N 个不同日子在 10:00 前完成至少一局
  | 'focusMinutes' // 周内累计专注分钟 ≥ N

export interface Quest {
  id: string
  kind: QuestKind
  /** 目标数值（如 5 局 / 8000 伤害） */
  target: number
  /** sessionsType：指定活动类型 */
  activityType?: ActivityType
  /** 标题（生成时定稿） */
  title: string
  /** 奖励金币 */
  coins: number
  /** 奖励 XP（领取时发放） */
  xp: number
  /** 进度（结算时重算，不需要持久化快照） */
  /** 是否已领取奖励 */
  claimed?: boolean
}

/** 一周委托的容器（AppState.weeklyQuests；weekKey 与 ISO 周一致，惰性刷新） */
export interface WeeklyQuests {
  weekKey: string
  quests: Quest[]
}

/** 当前 BOSS 周挑战状态（AppState.bossState，旧档缺省时 init 创建第 1 届） */
export interface BossState {
  /** ISO 周 'YYYY-Www'（周一为起点；与当前周不一致时惰性归档刷新） */
  weekKey: string
  bossId: string
  stage: number
  /** 当前剩余 HP */
  hp: number
  /** 本届总 HP */
  maxHp: number
  /** 本周累计伤害 */
  totalDamage: number
  /** 击杀时间（ISO） */
  killedAt?: string
  /** 击杀奖励是否已入账（幂等标记） */
  rewardClaimed?: boolean
  /** 本届随机限制规则（1 条，纯随机；旧档缺失时惰性回填） */
  modifiers?: BossModifier[]
  /** 周 BOSS 洗牌牌堆（洗牌循环：抽完全部图鉴后重洗；旧档缺失时跨周重建） */
  bossOrder?: string[]
  /** 当前牌堆对应的起始届数（本届 BOSS = bossOrder[stage - orderStartStage]） */
  orderStartStage?: number
  /** 每日已结算有效局的日期与计数（dailySessionCap 用，跨日重置） */
  dailyDate?: string
  dailyCount?: number
  /** 追加讨伐 BOSS（周 BOSS 击杀后召唤；跨周归档时一并清除） */
  extra?: ExtraBossState
  /** 历届战报（新的在前） */
  history: BossRecord[]
}

export interface MoodRecord {
  id: string
  date: string // YYYY-MM-DD
  /** 1..6 mapping to the spec's mood scale (6 = very good) */
  mood: number
  content: string
  createdAt: string
}

export interface Reflection extends MoodRecord {}

/** 成就分类（《成为自己》内容扩展） */
export type AchievementCategory =
  | 'first' // 🌱 初见
  | 'action' // 🔥 行动
  | 'work' // 💻 工作
  | 'study' // 📚 学习
  | 'exercise' // 🏸 运动
  | 'health' // 🥗 健康
  | 'life' // ⚖️ 生活
  | 'creative' // 🎨 创造
  | 'joy' // 🎮 快乐
  | 'relation' // ❤️ 关系
  | 'insight' // 🧠 洞察
  | 'courage' // 🛡️ 勇气
  | 'time' // ⏳ 时间
  | 'rest' // 🌙 休息
  | 'explore' // 🗺️ 探索
  | 'taskboard' // 📋 任务榜
  | 'pomodoro' // 🍅 番茄钟
  | 'night' // 🌃 夜行
  | 'session' // ⚡ 局
  | 'boss' // ⚔️ 讨伐
  | 'milestone' // 🏆 里程碑
  | 'legend' // 👑 传奇
  | 'hidden' // 🔮 隐藏

/** 成就稀有度 */
export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  /** ISO time unlocked */
  unlockedAt?: string
  /** special cognitive breakthrough flag */
  isCognitive?: boolean
  /** insight xp granted */
  insightXp?: number
  /** 分类（内容扩展） */
  category?: AchievementCategory
  /** 稀有度（内容扩展） */
  rarity?: AchievementRarity
  /** 是否为隐藏成就（解锁前不展示完整条件） */
  hidden?: boolean
}

export interface TitleGrant {
  title: string
  grantedAt: string
}

/** 里程碑绑定的真实数据指标（进度自动推进，不可手动调整） */
export type MilestoneMetricKind =
  | 'level' // 当前等级
  | 'weight' // 体重目标进度（weightGoal）
  | 'totalXp' // 累计 XP（player.totalXp）
  | 'sessions' // 完成的局数
  | 'achievements' // 解锁的成就数
  | 'streakDays' // 连续记录天数（recordStreak）
  | 'time' // 时间投入目标：记录行动/番茄钟关联累计

export interface MilestoneMetric {
  kind: MilestoneMetricKind
  /** 目标值（weight 为目标 kg，time 为预计分钟，其余为计数/等级） */
  target: number
}

/** 里程碑档位（决定徽章与阶段奖励基数） */
export type MilestoneTier = 'bronze' | 'silver' | 'gold' | 'legendary'

export interface MilestoneReward {
  id: string
  goal: string // e.g. "Lv.30"
  reward: string // e.g. "《XXX》游戏"
  progress: number // 0..1
  done: boolean
  /** 绑定真实数据的自动目标（进度由数据驱动） */
  metric?: MilestoneMetric
  /** 兼容旧档：等级目标（等价 metric.kind='level'） */
  targetLevel?: number
  /** 兼容旧档：体重目标（等价 metric.kind='weight'） */
  weightTarget?: number
  /** 兼容旧档：自定义目标（已迁移为 time 指标，仅作标记） */
  custom?: boolean
  /** time 指标：已累计投入的分钟数（记录行动/番茄钟关联时累加） */
  linkedMinutes?: number
  /** 档位（缺省按 metric/target 推导） */
  tier?: MilestoneTier
  /** 已领取的阶段检查点（存 25/50/75/100） */
  stagesClaimed?: number[]
  /** 完成奖励是否已领取（领取时发大额奖励 + 仪式） */
  finalClaimed?: boolean
  /** 创建时间（展示用） */
  createdAt?: string
  /** 完成时间（回顾墙展示用；done 置真时由 syncMilestones 写入） */
  doneAt?: string
  /** time 型：单次投入限制（分钟）。低于 minPerSession 的单次不计入；高于 maxPerSession 封顶计入 */
  limits?: { minPerSession?: number; maxPerSession?: number }
  /** 是否锁定目标时长（锁定后隐藏「调整目标时长」入口，缺省可调） */
  durationLocked?: boolean
  /** 创建时写给自己的话（完成仪式/回顾墙展示） */
  messageToSelf?: string
}

export interface Player {
  id: string
  name: string
  level: number
  xp: number // total xp within current level (0 .. requiredXP(level))
  totalXp: number // lifetime xp
  coins: number
  attributes: Attributes
  titles: string[]
  currentTitle?: string
  unlockedItems: string[]
  skillPoints: number
  createdAt: string
  /** total days the player has been active (recorded at least one action) */
  activeDays: number
  // ===== v1.0 局系统（可选，兼容旧存档） =====
  /** 累计完成局数 */
  totalSessions?: number
  /** 局内累计投入分钟数 */
  totalSessionMinutes?: number
  /** 历史最高效率修正（×x.xx） */
  bestEfficiency?: number
  /** v1.0 消耗品库存（itemId → 数量，开局使用、结算消耗） */
  inventory?: Record<string, number>
  /** v1.0 技能等级（skillId → level，技能点升级，提升对应领域效率） */
  skills?: Record<string, number>
  /** 宝箱保底计数（连续未出紫色以上 +1，出则清零） */
  chestPity?: number
  // ===== 服饰系统 =====
  /** 换装记录（成就统计用：单日换完全部服饰 / 深夜换装 / 累计换装次数） */
  outfitLog?: string[] // ISO 时间戳数组，每次换装 push 一条
  /** 每日签到：连续签到天数 */
  checkinStreak?: number
  /** 每日签到：上次签到日期（YYYY-MM-DD） */
  lastCheckinDate?: string
}

/** v1.0 「一局」：一次主动开始并结算的现实行动 */
export interface GameSession {
  id: string
  type: ActivityType
  title: string
  startTime: string // ISO
  endTime: string // ISO
  /** 计划时长（分钟） */
  plannedMinutes: number
  /** 实际投入（分钟）；提前结束时 < plannedMinutes */
  actualMinutes: number
  status: 'completed' | 'early'
  xpGained: number
  coinsGained: number
  attributeGains?: Partial<Attributes>
  /** 本局效率修正（×x.xx，含类型修正） */
  efficiency: number
  /** 本局实际产出 XP/min */
  xpPerMin: number
  /** 对 BOSS 造成的伤害（= baseXp 纯效率产出，不含消耗品 buff / 主题加成；无 BOSS 时缺省） */
  bossDamage?: number
  /** 关联的任务榜节点（Phase 5 接入，暂留） */
  taskId?: string
}

export interface AppState {
  player: Player
  activities: Activity[]
  weights: WeightRecord[]
  /** 体重目标（身体页设置，联动体重里程碑自动进度） */
  weightGoal?: { startKg: number; targetKg: number }
  /** 体重目标已领取的百分比节点（存 pct×100 整数，如 5 = 5%；换目标时重置） */
  weightGoalNodesClaimed?: number[]
  moods: MoodRecord[]
  achievements: Achievement[]
  milestones: MilestoneReward[]
  /** streak of consecutive recording days (no penalty on break) */
  recordStreak: number
  lastRecordDate?: string // YYYY-MM-DD
  restMode: boolean
  /** per-day xp already gained, used for diminishing returns & caps */
  dailyXpLog: Record<string, number> // date -> xp
  /** per-day per-domain xp log */
  dailyDomainXp: Record<string, Record<ActivityType, number>>
  // ===== Phase 4 AI 字段 =====
  memories?: AIMemory[]
  patterns?: BehaviorPattern[]
  emotions?: EmotionRecord[]
  suggestions?: AISuggestion[]
  chatHistory?: ChatMessage[]
  cognitiveInsights?: CognitiveInsight[]
  aiGrowth?: AIGrowth
  /** 用户禁止 AI 记忆的主题 */
  memoryBlacklist?: string[]
  /** 思维导图文档（可选，兼容旧存档） */
  mindMaps?: MindMapDoc[]
  /** v1.0 局历史（保留最近若干条，用于效率曲线与统计） */
  sessions?: GameSession[]
  /** BOSS 周挑战（局结算 XP 转伤害；旧档缺省时 init 创建第 1 届） */
  bossState?: BossState
  /** 周委托任务（周一随 BOSS 惰性刷新；旧档缺省时 init 生成） */
  weeklyQuests?: WeeklyQuests
}

export interface XpGainResult {
  xp: number
  attributeGains: Partial<Attributes>
  coins: number
  /** warnings shown to user (no deduction of earned xp) */
  warnings: string[]
  /** did this action trigger diminishing returns? */
  diminished: boolean
}

// ===== Phase 4 AI 数据模型 =====

/** 记忆类型（说明书第 11 节） */
export type MemoryType =
  | 'USER_PREFERENCE'
  | 'USER_GOAL'
  | 'USER_INTEREST'
  | 'USER_PATTERN'
  | 'IMPORTANT_EVENT'
  | 'COGNITIVE_INSIGHT'
  | 'HABIT'
  | 'PERSONAL_VALUE'

/** 记忆分级（说明书第 12 节）1=普通 2=长期事实 3=重要认知 4=核心长期 */
export type MemoryLevel = 1 | 2 | 3 | 4

/** 记忆来源 */
export type MemorySource =
  | 'explicit_user_statement'
  | 'inferred'
  | 'observed'
  | 'system_generated'

/** 记忆状态（生命周期，第 44 节） */
export type MemoryStatus = 'active' | 'archived' | 'deprecated'

export interface AIMemory {
  id: string
  type: MemoryType
  level: MemoryLevel
  content: string
  confidence: number // 0..1
  source: MemorySource
  status: MemoryStatus
  createdAt: string
  lastConfirmedAt?: string
  lastUsedAt?: string
  useCount: number
  /** 冲突处理：指向被本条更新的旧记忆 id（第 45 节） */
  supersedes?: string
  /** 用户可标记错误/禁止 */
  userFlagged?: 'wrong' | 'private' | null
}

/** 行为模式（第 16 节） */
export interface BehaviorPattern {
  id: string
  trigger: string
  behavior: string
  result: string
  longTermEffect?: string
  /** 样本量（第 17 节：≥3 才可成"可能模式"，≥5 高置信） */
  sampleCount: number
  evidenceIds: string[]
  confidence: number // 0..1
  firstSeenAt: string
  lastSeenAt: string
  status: 'candidate' | 'confirmed' | 'archived'
}

/** 情绪类型（第 19 节） */
export type EmotionType =
  | 'happy' | 'excited' | 'anxious' | 'angry'
  | 'wronged' | 'disappointed' | 'envious'
  | 'calm' | 'tired' | 'bored'

export interface EmotionRecord {
  id: string
  emotion: EmotionType
  intensity: number // 1..5
  trigger?: string
  action?: string
  outcome?: string
  relatedActivityId?: string
  createdAt: string
}

/** AI 建议（可追踪，第 51 节） */
export type SuggestionStatus =
  | 'pending' | 'accepted' | 'rejected' | 'executed' | 'expired'

export type SuggestionCategory =
  | 'proactive' | 'minimal_action' | 'rumination_choice' | 'weekly'

export interface AISuggestion {
  id: string
  reason: string
  action: string
  priority: number // 1..5
  status: SuggestionStatus
  category: SuggestionCategory
  effectiveness?: 'effective' | 'ineffective' | 'unknown'
  createdAt: string
  resolvedAt?: string
}

/** 同行者对话消息 */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  /** 内部结构化输出（第 38 节） */
  structured?: AIOutput
  /** 是否为反刍提示（AI-012） */
  isRumination?: boolean
  createdAt: string
}

/** AI 统一输出结构（第 38 节） */
export interface AIOutput {
  response: string
  facts: string[]
  observations: string[]
  inferences: string[]
  suggestions: string[]
  memoryCandidates: AIMemory[]
  activities: Activity[]
  xpCandidates: { activity: Activity; xp: number }[]
  safetyFlags: string[]
}

/** 认知突破（第 32 节） */
export interface CognitiveInsight {
  id: string
  content: string
  relatedPatternId?: string
  /** 用户必须可拒绝（第 32 节） */
  userAccepted: boolean
  insightXp: number
  attributeGains: Partial<Attributes>
  createdAt: string
}

/** AI 同行者自身成长（第 47 节） */
export interface AIGrowth {
  knowledgeLevel: number
  memoryCount: number
  userUnderstanding: number // 0..100
  predictionAccuracy: number // 0..100
}

// ===== 思维导图 =====

/** simple-mind-map 节点树（宽松结构，保留库的全部字段） */
export interface MindMapNodeData {
  data: { text: string; [key: string]: unknown }
  children?: MindMapNodeData[]
  [key: string]: unknown
}

/** 一张思维导图文档 */
export interface MindMapDoc {
  id: string
  title: string
  /** simple-mind-map 节点树数据 */
  data: MindMapNodeData
  /** 主题 key（见 MindMapPage 的 THEMES），缺省为 'mist' */
  theme?: string
  createdAt: string // ISO
  updatedAt: string // ISO
}

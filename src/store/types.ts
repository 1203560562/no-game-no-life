/**
 * Store 类型定义（从 useGameStore.ts 拆出）
 */
import type {
  Achievement,
  Activity,
  AppState,
  AttributeKey,
  Attributes,
  AIMemory,
  AISuggestion,
  BehaviorPattern,
  ChatMessage,
  CognitiveInsight,
  EmotionRecord,
  MilestoneReward,
  MindMapDoc,
  MindMapNodeData,
  MoodRecord,
  Player,
  WeightRecord,
} from '../types'
import type { LevelUpResult } from '../engine/levelSystem'

export interface ActivityFeedback {
  activityId: string
  xp: number
  coins: number
  attributeGains: Partial<Attributes>
  warnings: string[]
  levelUp?: LevelUpResult
  newAchievements: Achievement[]
  /** cognitive insight if recorded */
  insightXp?: number
}

/** v1.0 局结算反馈（驱动结算 Overlay） */
export interface SessionFeedback {
  sessionId: string
  title: string
  type: Activity['type']
  plannedMinutes: number
  actualMinutes: number
  /** 是否提前结束（做了多少就获得多少，无惩罚） */
  earlyEnded: boolean
  xp: number
  coins: number
  attributeGains: Partial<Attributes>
  /** 本局效率修正 ×x.xx */
  efficiency: number
  xpPerMin: number
  /** 是否刷新历史最高效率 */
  isNewRecord: boolean
  /** 刷新前的最高纪录（未破时即当前最高） */
  prevBest: number
  /** 今日累计局数 */
  todaySessions: number
  /** 今日累计 XP / 金币（含本局） */
  todayXp: number
  todayCoins: number
  /** 下一局（同类型同时长）预计 XP —— 升级后会真实提高 */
  nextXpEstimate: number
  /** 下一局效率（结算后玩家状态计算） */
  nextEfficiency: number
  levelUp?: LevelUpResult
  newAchievements: Achievement[]
  /** v1.0 本局使用的消耗品（结算时已消费） */
  buffName?: string
  buffIcon?: string
  buffDetail?: string
  /** 暴击券是否触发 */
  crit?: boolean
  /** 记录行动补录的局（运动等事后记录）：结算页隐藏「再来一局」 */
  manual?: boolean
  /** 局发生时间（补录 = 运动发生时刻；番茄钟 = 专注开始时刻） */
  startTime?: string
}

/** 里程碑事件（跨检查点奖励 / 达成待领取），驱动 MilestoneToast */
export interface MilestoneEvent {
  id: string
  goal: string
  /** 检查点百分比（100 = 达成待领取） */
  stage: number
  xp: number
  coins: number
}

/** BOSS 周挑战事件（本局伤害 / 击杀），驱动 BossVictoryOverlay 与首页卡片反馈 */
export interface BossEvent {
  bossId: string
  name: string
  stage: number
  /** 本局造成的伤害 */
  damage: number
  /** 伤害后的剩余 HP */
  hpAfter: number
  /** 本次是否击杀 */
  killed: boolean
  /** 击杀金币（含重复折算；未击杀为 0） */
  coins: number
  /** 击杀掉落（重复拥有时只有 convertedCoins） */
  loot?: { name: string; icon: string; rarity: string; convertedCoins?: number }
  /** 追加讨伐 BOSS 战报（伤害受限制规则约束） */
  extra?: boolean
  /** 血条上限（追加 BOSS 为周 BOSS 的 60%，缺省用 bossMaxHp(stage)） */
  maxHp?: number
  /** 限制规则命中说明（伤害被削减/归零的原因） */
  notes?: string[]
}

/** 局收益覆盖（endSession → addActivity 内部传递） */
export interface SessionOverride {
  sessionId: string
  startTime: string
  plannedMinutes: number
  actualMinutes: number
  earlyEnded: boolean
  xp: number
  coins: number
  /** 纯效率引擎产出（不含消耗品 buff / 主题加成）——BOSS 伤害按此计算 */
  baseXp: number
  attributeGains: Partial<Attributes>
  efficiency: number
  xpPerMin: number
  taskId?: string
  /** v1.0 本局使用的消耗品 id（addActivity 中扣库存） */
  buffItemId?: string
}

export interface GameStore {
  state: AppState
  loaded: boolean
  /** 初始化失败错误信息（null 表示无错误）。加载失败时仍标记 loaded=true 以走出 LOADING 态，但展示错误页 */
  loadError: string | null
  pendingFeedback: ActivityFeedback | null
  pendingLevelUp: LevelUpResult | null
  /** 任务榜等非活动入口解锁的成就（驱动 AchievementToast） */
  pendingAchievements: Achievement[] | null
  clearPendingAchievements: () => void
  /** 直接注入成就队列（测试面板用） */
  setPendingAchievements: (v: Achievement[] | null) => void
  /** v1.0 局结算（驱动结算 Overlay） */
  pendingSessionFeedback: SessionFeedback | null
  clearSessionFeedback: () => void
  /**
   * 等待玩家回来看的结算队列：番茄钟到点时若页面不可见/无焦点，
   * 结算数据立即落库（防丢），但反馈押后到玩家重新看到页面时再注入
   * pendingSessionFeedback —— 结算仪式（白闪/重击动画）等你回来才播。
   */
  heldSessionFeedback: SessionFeedback[]
  /** 注入被押后的结算反馈（页面恢复可见时由 App 调用；队列按先后弹出） */
  releaseHeldSessionFeedback: () => void
  /** 直接注入局结算反馈（测试面板用，不碰真实存档） */
  setPendingSessionFeedback: (v: SessionFeedback | null) => void
  /** 直接注入升级结果（测试面板用，不碰真实存档） */
  setPendingLevelUp: (v: LevelUpResult | null) => void
  /** 直接注入活动反馈（+XP 浮动提示测试用） */
  setPendingFeedback: (v: ActivityFeedback | null) => void
  /** 直接注入里程碑事件队列（测试面板用） */
  setPendingMilestoneEvents: (v: MilestoneEvent[] | null) => void
  /** 升级宝箱（驱动 ChestOverlay 依次开箱；forcedLoot 为测试面板注入的指定奖品，跳过真实抽奖） */
  pendingChests: {
    level: number
    count: number
    attributeChoice: boolean
    forcedLoot?: import('../config/chestConfig').ChestLoot
  } | null
  setPendingChests: (
    v: {
      level: number
      count: number
      attributeChoice: boolean
      forcedLoot?: import('../config/chestConfig').ChestLoot
    } | null,
  ) => void
  clearChests: () => void
  /** 里程碑引擎产出的事件（跨检查点奖励 / 达成待领取），驱动 MilestoneToast */
  pendingMilestoneEvents: MilestoneEvent[] | null
  clearPendingMilestoneEvents: () => void
  /** BOSS 周挑战事件（本局伤害 / 击杀），驱动 BossVictoryOverlay */
  pendingBossEvents: BossEvent[] | null
  /**
   * 页面不可见/无焦点时押后的 BOSS 事件队列：与 heldSessionFeedback 同理，
   * 伤害数据已落库，动画押后到玩家回来再播（否则 6 秒自动关闭在人不在时放完）。
   * 由 releaseHeldSessionFeedback 一并释放进 pendingBossEvents。
   */
  heldBossEvents: BossEvent[]
  /** 直接覆盖事件队列（测试面板注入用） */
  setPendingBossEvents: (v: BossEvent[] | null) => void
  clearPendingBossEvents: () => void
  /** 开一箱：应用奖励并返回结果（ChestOverlay 展示用） */
  openChest: (level: number) => import('../config/chestConfig').ChestRollResult
  /** 商店购买宝箱：扣金币并触发开箱（与升级宝箱共享保底计数） */
  buyShopChest: () => boolean
  init: () => Promise<void>
  /** 清除加载错误（重试前调用） */
  clearLoadError: () => void
  addActivity: (input: {
    type: Activity['type']
    title: string
    description?: string
    durationMinutes?: number
    intensity?: Activity['intensity']
    subtype?: string
    difficulty?: number
    proactive?: boolean
    isEscape?: boolean
    /** 关联的 time 型里程碑（投入时长计入其进度；可多个，各自应用单次限制） */
    milestoneIds?: string[]
    /** v1.0 内部：局结算覆盖普通 XP 计算 */
    session?: SessionOverride
  }) => ActivityFeedback
  /**
   * v1.0 结束一局并结算（局 = 核心体验单位）
   *
   * manual=true 为「记录行动」补录（运动/挑战等事后记录）：走与番茄钟完全一致的
   * 局结算链路（结算 Overlay + BOSS 伤害 + 局档案），强度作为 XP/伤害倍率，
   * startTime = 运动发生时刻（BOSS 时段限制按此判定）。
   */
  endSession: (input: {
    type: Activity['type']
    title: string
    plannedMinutes: number
    actualMinutes?: number
    startTime?: string
    taskId?: string
    buffItemId?: string
    /** 关联的 time 型里程碑（实际投入分钟计入其进度；可多个） */
    milestoneIds?: string[]
    /** 补录：手动选择的强度（轻松/正常/高强度作为倍率；番茄钟缺省 1） */
    intensity?: Activity['intensity']
    /** 补录：运动子类型等（存入活动记录，驱动成就/画像统计） */
    subtype?: string
    /** 补录：备注（拼入局档案描述） */
    description?: string
    /** 标记为记录行动补录（结算页隐藏「再来一局」） */
    manual?: boolean
  }) => SessionFeedback
  /** 召唤追加讨伐 BOSS（周 BOSS 击杀后；随机敌人 + 随机限制规则。进行中返回 false） */
  summonExtraBoss: () => boolean
  /** 领取周委托奖励（进度达标且未领取时；返回奖励数值供仪式展示，失败返回 null） */
  claimQuest: (questId: string) => { title: string; coins: number; xp: number } | null
  buyConsumable: (itemId: string) => boolean
  buyModel: (modelId: string) => boolean
  upgradeSkill: (skillId: string) => boolean
  addWeight: (weightKg: number, date?: string) => void
  /** 设置体重目标（初始+目标 kg），自动创建/更新体重里程碑并按最新体重计算进度 */
  setWeightGoal: (startKg: number, targetKg: number, reward?: string) => void
  /** 清除体重目标（连带删除对应体重里程碑） */
  clearWeightGoal: () => void
  addMood: (mood: MoodRecord['mood'], content?: string) => void
  grantCognitiveBreakthrough: (title: string, content: string) => void
  toggleRestMode: () => void
  addMilestone: (
    goal: string,
    reward: string,
    metric?: { kind: import('../types').MilestoneMetricKind; target: number },
    opts?: {
      /** time 型单次投入限制（分钟） */
      limits?: { minPerSession?: number; maxPerSession?: number }
      /** 锁定目标时长（不可再调整） */
      durationLocked?: boolean
      /** 写给自己的话 */
      messageToSelf?: string
    },
  ) => void
  /** 领取里程碑完成奖励（done 且未领取时；返回奖励数值供仪式展示） */
  claimMilestone: (id: string) => { goal: string; xp: number; coins: number } | null
  /**
   * 提升 time 型里程碑的预计时长（只增不减）：
   * 进度按新目标重算（可能回落），档位按新目标重定级（影响后续检查点奖励数值）；
   * 已领取的检查点与完成奖励不补发、不重置。
   */
  extendMilestoneTarget: (id: string, newTargetMinutes: number) => boolean
  /** 删除里程碑：需花费 2500 金币（强制承诺成本）；余额不足或 id 不存在返回 false */
  deleteMilestone: (id: string) => boolean
  setTitle: (title: string) => void
  spendCoins: (amount: number, item: string) => boolean
  /** 批量解锁/取消解锁道具（AdminPanel 服饰测试用；unlocked=false 时移除） */
  setItemsUnlocked: (ids: string[], unlocked: boolean) => void
  /** 记录一次换装（服饰成就统计） */
  recordOutfitChange: () => void
  /** 每日签到（发放金币，返回 true=今日首次签到） */
  dailyCheckin: () => boolean
  resetGame: () => Promise<void>
  importState: (state: AppState) => void
  clearFeedback: () => void
  clearLevelUp: () => void
  /** 升级时选择属性加成 */
  chooseLevelUpAttribute: (attr: AttributeKey) => void
  // ===== Phase 4 AI CRUD =====
  addMemory: (memory: Omit<AIMemory, 'id' | 'createdAt' | 'useCount'>) => string
  updateMemory: (id: string, patch: Partial<AIMemory>) => void
  deleteMemory: (id: string) => void
  addChatMessage: (msg: Omit<ChatMessage, 'id' | 'createdAt'>) => void
  addSuggestion: (suggestion: Omit<AISuggestion, 'id' | 'createdAt' | 'status'>) => string
  updateSuggestion: (id: string, patch: Partial<AISuggestion>) => void
  addEmotion: (emotion: Omit<EmotionRecord, 'id' | 'createdAt'>) => void
  addPattern: (pattern: Omit<BehaviorPattern, 'id' | 'firstSeenAt' | 'lastSeenAt'>) => void
  addCognitiveInsight: (insight: Omit<CognitiveInsight, 'id' | 'createdAt' | 'userAccepted'>) => string
  acceptCognitiveInsight: (id: string) => void
  // ===== 思维导图 CRUD =====
  createMindMap: (title: string) => string
  saveMindMap: (id: string, data: MindMapNodeData) => void
  renameMindMap: (id: string, title: string) => void
  setMindMapTheme: (id: string, theme: string) => void
  deleteMindMap: (id: string) => void
}

// 类型引用（保持原文件 import 语义，避免未使用告警）
export type {
  Achievement,
  Activity,
  AppState,
  Attributes,
  MilestoneReward,
  MindMapDoc,
  MoodRecord,
  Player,
  WeightRecord,
}

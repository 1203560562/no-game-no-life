/**
 * 默认状态构造 + 导入存档深合并（从 useGameStore.ts 拆出）
 *
 * - defaultPlayer / defaultState：新档与字段兜底基准
 * - mergeImportedState：导入/init 加载时补齐嵌套字段缺失，防运行时 undefined
 */
import type { AppState, Attributes, Player } from '../types'

export const defaultAttributes = (): Attributes => ({
  vitality: 10,
  wisdom: 10,
  focus: 10,
  creativity: 10,
  courage: 10,
  connection: 10,
  freedom: 10,
})

export const defaultPlayer = (): Player => ({
  id: 'player-1',
  name: '玩家',
  level: 1,
  xp: 0,
  totalXp: 0,
  coins: 0,
  attributes: defaultAttributes(),
  titles: ['刚刚出发的人'],
  currentTitle: '刚刚出发的人',
  unlockedItems: [],
  skillPoints: 0,
  createdAt: new Date().toISOString(),
  activeDays: 0,
})

export const defaultState = (): AppState => ({
  player: defaultPlayer(),
  activities: [],
  weights: [],
  moods: [],
  achievements: [],
  milestones: [],
  recordStreak: 0,
  restMode: false,
  dailyXpLog: {},
  dailyDomainXp: {},
  // Phase 4 AI
  memories: [],
  patterns: [],
  emotions: [],
  suggestions: [],
  chatHistory: [],
  cognitiveInsights: [],
  aiGrowth: { knowledgeLevel: 1, memoryCount: 0, userUnderstanding: 0, predictionAccuracy: 0 },
  memoryBlacklist: [],
})

/**
 * 深合并导入的存档状态，确保嵌套对象字段完整。
 * 仅针对 AppState 中对象类型字段（player/aiGrowth/player.attributes）做递归补齐；
 * 数组类型字段直接采用导入值（用户存档数据优先，不与默认空数组合并）。
 * - player: 嵌套对象，缺失字段会用 defaultPlayer 补齐，但保留导入的所有实际值
 * - player.attributes: 七项属性任一缺失则整组用默认值兜底（避免属性 undefined 导致引擎报错）
 * - aiGrowth: 嵌套对象，缺失字段用默认值补齐
 */
export const mergeImportedState = (imported: Partial<AppState>): AppState => {
  const def = defaultState()
  const src = imported ?? {}
  // 顶层数组/标量：导入值优先，缺省回退
  const base: AppState = {
    ...def,
    ...src,
  }
  // player 深合并：确保嵌套字段（attributes/titles/unlockedItems 等）完整
  if (src.player) {
    const defPlayer = defaultPlayer()
    const mergedPlayer: Player = { ...defPlayer, ...src.player }
    // attributes 单独兜底：缺字段或非对象时整组回退默认值
    const a = src.player.attributes
    if (!a || typeof a !== 'object' || Array.isArray(a)) {
      mergedPlayer.attributes = defPlayer.attributes
    } else {
      mergedPlayer.attributes = { ...defPlayer.attributes, ...a }
    }
    // titles/unlockedItems 必须是数组
    if (!Array.isArray(mergedPlayer.titles)) mergedPlayer.titles = defPlayer.titles
    if (!Array.isArray(mergedPlayer.unlockedItems)) mergedPlayer.unlockedItems = defPlayer.unlockedItems
    base.player = mergedPlayer
  }
  // aiGrowth 深合并
  if (src.aiGrowth) {
    base.aiGrowth = {
      knowledgeLevel: src.aiGrowth.knowledgeLevel ?? def.aiGrowth!.knowledgeLevel,
      memoryCount: src.aiGrowth.memoryCount ?? def.aiGrowth!.memoryCount,
      userUnderstanding: src.aiGrowth.userUnderstanding ?? def.aiGrowth!.userUnderstanding,
      predictionAccuracy: src.aiGrowth.predictionAccuracy ?? def.aiGrowth!.predictionAccuracy,
    }
  }
  // 顶层确保数组类型（防止导入脏数据导致 .map 报错）
  for (const k of [
    'activities', 'weights', 'moods', 'achievements', 'milestones',
    'memories', 'patterns', 'emotions', 'suggestions', 'chatHistory',
    'cognitiveInsights', 'memoryBlacklist', 'mindMaps', 'sessions',
  ] as (keyof AppState)[]) {
    const v = base[k]
    if (!Array.isArray(v)) (base[k] as unknown[]) = []
  }
  // dailyXpLog / dailyDomainXp 必须是对象
  if (!base.dailyXpLog || typeof base.dailyXpLog !== 'object') base.dailyXpLog = {}
  if (!base.dailyDomainXp || typeof base.dailyDomainXp !== 'object') base.dailyDomainXp = {}
  // weightGoalNodesClaimed 必须是数组
  if (base.weightGoalNodesClaimed !== undefined && !Array.isArray(base.weightGoalNodesClaimed)) {
    base.weightGoalNodesClaimed = []
  }
  return base
}

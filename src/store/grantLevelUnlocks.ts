/**
 * 等级奖励发放（从 useGameStore.ts 拆出）
 * 发放等级奖励：形象走 unlockModel（与宝箱/商店同渠道），背景写入 unlockedItems（幂等）
 */
import type { Player } from '../types'
import { levelUnlockIdsUpTo } from '../config/xpConfig'
import { unlockModel, LIVE2D_MODELS } from '../config/live2dModels'

export { levelUnlockIdsUpTo }

export const grantLevelUnlocks = (player: Player, ids: string[]): Player => {
  let next = player
  for (const id of ids) {
    if (LIVE2D_MODELS.some((m) => m.id === id)) {
      unlockModel(id)
    } else if (!next.unlockedItems.includes(id)) {
      next = { ...next, unlockedItems: [...next.unlockedItems, id] }
    }
  }
  return next
}

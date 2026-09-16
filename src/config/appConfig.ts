/**
 * 应用全局配置
 *
 * 集中管理产品名称、副标题等用户可见文本。
 * 所有面向用户的位置应引用此处，避免硬编码。
 */

export const APP_CONFIG = {
  /** 产品名称 */
  name: '成为自己',
  /** 完整产品名（带书名号） */
  fullName: '《成为自己》',
  /** 副标题 */
  subtitle: '记录你走过的路，见证你成为自己。',
  /** AI 同行者名称 */
  companionName: '同行者',
  /** 存档文件描述 */
  saveFileDescription: '成为自己 存档',
  /** 启动页文案 */
  splashTitle: '成为自己',
  splashSubtitle: '记录你走过的路，见证你成为自己。',
  /** 升级文案 */
  levelUpTitle: 'Level Up',
  levelUpSubtitle: '你又向自己靠近了一点。',
  /** 成就解锁文案 */
  achievementTitle: '新的发现',
  achievementSubtitle: '你刚刚做了一件过去的自己未必会做的事情。',
  /** 休息文案 */
  restTitle: '今天也属于你。',
  /** 隐藏成就文案 */
  hiddenAchievementTitle: '你发现了一个关于自己的东西。',
  /** 页面导航名称 */
  nav: {
    home: '我的世界',
    character: '我的角色',
    adventure: '今日冒险',
    growth: '成长',
    achievements: '成就',
    shop: '商店',
    inventory: '背包',
    journey: '旅程',
    insight: '洞察',
    companion: '同行者',
    actions: '行动',
    body: '身体',
    milestones: '目标',
    reports: '报告',
    memory: '记忆',
    mindmap: '任务榜',
  },
} as const

/** 商店名称 */
export const SHOP_NAME = '成为自己 · 冒险商店'

// ===== 形象画框背景装饰 =====
// 商店「背景」分类购买/宝箱开出的背景道具在这里定义渲染样式：
// - 白档：CSS 渐变 + CSS 粒子动画（零资源开销）
// - 蓝/紫/金/红档：高清背景图（public/backgrounds/：
//   GitHub VisualVault 精选 20 张 + l2a1n/wallpaper-bank 动漫场景 14 张 + AI 绘制 8 张）+ 粒子
// 选择持久化在 localStorage（与 Live2D 形象选择同一模式），
// 所有权走 player.unlockedItems（商店/宝箱双渠道）。

export type BackgroundParticles =
  | 'stars' // 闪烁星点
  | 'petal' // 飘落花瓣
  | 'bubble' // 上浮气泡
  | 'leaf' // 飘落叶片
  | 'ember' // 升腾火星
  | 'void' // 漂浮暗紫光球
  | 'spark' // 上浮金屑

export interface BackgroundDef {
  id: string
  name: string
  /** CSS background 简写（渐变底色） */
  css: string
  /** 背景图路径（public 下绝对路径；与 css 二选一，image 优先） */
  image?: string
  /** 粒子效果 */
  particles?: BackgroundParticles
}

/** 全部背景（id 与 shopItems 的 background 分类道具一一对应） */
export const BACKGROUNDS: BackgroundDef[] = [
  // ===== 白档：纯 CSS 渐变 =====
  {
    id: 'bg_forest',
    name: '森林背景',
    css: 'linear-gradient(180deg, #1d3b2a 0%, #2e5240 55%, #16311f 100%)',
    particles: 'leaf',
  },
  {
    id: 'bg_ocean',
    name: '海洋背景',
    css: 'linear-gradient(180deg, #0e2a4a 0%, #1c4d73 55%, #0a1f38 100%)',
    particles: 'bubble',
  },
  {
    id: 'bg_stars',
    name: '星空背景',
    css: 'linear-gradient(180deg, #0d1030 0%, #1a1f4d 60%, #090b22 100%)',
    particles: 'stars',
  },
  {
    id: 'bg_sunset',
    name: '黄昏背景',
    css: 'linear-gradient(180deg, #4a2b3e 0%, #8a4a3e 45%, #d98a4a 80%, #b3562e 100%)',
    particles: 'spark',
  },
  {
    id: 'bg_aurora',
    name: '极光背景',
    css: 'linear-gradient(165deg, #071a24 0%, #0f3a3a 40%, #1d5c4a 70%, #0a2431 100%)',
    particles: 'stars',
  },
  {
    id: 'bg_cherry',
    name: '樱花背景',
    css: 'linear-gradient(180deg, #3d2030 0%, #6b3a4e 50%, #8f5568 100%)',
    particles: 'petal',
  },
  {
    id: 'bg_galaxy',
    name: '银河背景',
    css: 'radial-gradient(ellipse at 30% 20%, #3b2a6e 0%, transparent 55%), radial-gradient(ellipse at 75% 80%, #1d3a6e 0%, transparent 50%), linear-gradient(180deg, #0b0d2a 0%, #141838 60%, #07081c 100%)',
    particles: 'stars',
  },
  {
    id: 'bg_void',
    name: '虚空背景',
    css: 'radial-gradient(ellipse at 50% 45%, #2e1445 0%, transparent 65%), linear-gradient(180deg, #120720 0%, #1c0d33 55%, #08030f 100%)',
    particles: 'void',
  },
  // ===== 高清图片背景（GitHub: VisualVault 精选） =====
  {
    id: 'bg_dunes',
    name: '沙丘余晖',
    css: 'linear-gradient(180deg, #3a2410 0%, #6b4520 100%)',
    image: '/backgrounds/dunes.jpg',
    particles: 'spark',
  },
  {
    id: 'bg_neon_field',
    name: '霓虹原野',
    css: 'linear-gradient(180deg, #0d1030 0%, #1a1040 100%)',
    image: '/backgrounds/neon-field.jpg',
    particles: 'stars',
  },
  {
    id: 'bg_calm',
    name: '静谧',
    css: 'linear-gradient(180deg, #16283a 0%, #2a4a5c 100%)',
    image: '/backgrounds/calm.jpg',
    particles: 'bubble',
  },
  {
    id: 'bg_dark_waves',
    name: '暗涌',
    css: 'linear-gradient(180deg, #0a1622 0%, #14283a 100%)',
    image: '/backgrounds/dark-waves.jpg',
    particles: 'bubble',
  },
  {
    id: 'bg_moon_lake',
    name: '月下湖',
    css: 'linear-gradient(180deg, #0a1428 0%, #1a2a4a 100%)',
    image: '/backgrounds/moon-lake.jpg',
    particles: 'stars',
  },
  {
    id: 'bg_mist',
    name: '迷雾森林',
    css: 'linear-gradient(180deg, #1a2a20 0%, #2e4434 100%)',
    image: '/backgrounds/mist.png',
    particles: 'leaf',
  },
  {
    id: 'bg_northern_night',
    name: '极夜',
    css: 'linear-gradient(180deg, #0a1226 0%, #14203a 100%)',
    image: '/backgrounds/northern-night.jpg',
    particles: 'stars',
  },
  {
    id: 'bg_comet',
    name: '彗星之夜',
    css: 'linear-gradient(180deg, #0c1028 0%, #181c3c 100%)',
    image: '/backgrounds/comet.jpg',
    particles: 'stars',
  },
  {
    id: 'bg_neon_city',
    name: '霓虹都市',
    css: 'linear-gradient(180deg, #140a26 0%, #24103c 100%)',
    image: '/backgrounds/neon-city.jpg',
    particles: 'stars',
  },
  {
    id: 'bg_night_city',
    name: '不夜城',
    css: 'linear-gradient(180deg, #0e1226 0%, #1c2040 100%)',
    image: '/backgrounds/night-city.jpg',
    particles: 'stars',
  },
  {
    id: 'bg_cyber',
    name: '赛博空间',
    css: 'linear-gradient(180deg, #0d0a20 0%, #1c1440 100%)',
    image: '/backgrounds/cyber.jpg',
    particles: 'void',
  },
  {
    id: 'bg_mystic_town',
    name: '魔夜小镇',
    css: 'linear-gradient(180deg, #160e26 0%, #281842 100%)',
    image: '/backgrounds/mystic-town.jpg',
    particles: 'spark',
  },
  {
    id: 'bg_sunset_peaks',
    name: '落日群山',
    css: 'linear-gradient(180deg, #3a1a14 0%, #6b3420 100%)',
    image: '/backgrounds/sunset-peaks.jpg',
    particles: 'spark',
  },
  {
    id: 'bg_lofoten',
    name: '罗弗敦暮色',
    css: 'linear-gradient(180deg, #2a1a24 0%, #4a3040 100%)',
    image: '/backgrounds/lofoten.jpg',
    particles: 'spark',
  },
  {
    id: 'bg_mountain_dawn',
    name: '山巅冬阳',
    css: 'linear-gradient(180deg, #241c28 0%, #403448 100%)',
    image: '/backgrounds/mountain-dawn.jpg',
    particles: 'spark',
  },
  {
    id: 'bg_copper_peak',
    name: '暮色山峦',
    css: 'linear-gradient(180deg, #2c1c14 0%, #4a3424 100%)',
    image: '/backgrounds/copper-peak.jpg',
    particles: 'spark',
  },
  {
    id: 'bg_moonlight',
    name: '月光',
    css: 'linear-gradient(180deg, #0c1428 0%, #1a2440 100%)',
    image: '/backgrounds/moonlight.jpg',
    particles: 'stars',
  },
  {
    id: 'bg_earthrise',
    name: '地出',
    css: 'linear-gradient(180deg, #060a18 0%, #10182c 100%)',
    image: '/backgrounds/earthrise.jpg',
    particles: 'stars',
  },
  {
    id: 'bg_blackhole',
    name: '黑洞视界',
    css: 'linear-gradient(180deg, #0a0612 0%, #180c24 100%)',
    image: '/backgrounds/blackhole.jpg',
    particles: 'void',
  },
  {
    id: 'bg_dark_star',
    name: '暗星',
    css: 'linear-gradient(180deg, #0c0a14 0%, #181424 100%)',
    image: '/backgrounds/dark-star.jpg',
    particles: 'stars',
  },
  // ===== 动漫场景背景（GitHub: l2a1n/wallpaper-bank 精选，无人物无版权角色） =====
  // --- 白档 ---
  {
    id: 'bg_anime_window',
    name: '粉彩之窗',
    css: 'linear-gradient(180deg, #38243a 0%, #5c4054 100%)',
    image: '/backgrounds/anime-pastel-window.jpg',
    particles: 'petal',
  },
  {
    id: 'bg_anime_staircase',
    name: '长阶光影',
    css: 'linear-gradient(180deg, #1c3028 0%, #34503c 100%)',
    image: '/backgrounds/anime-staircase.jpg',
    particles: 'leaf',
  },
  {
    id: 'bg_anime_snow_valley',
    name: '静雪之谷',
    css: 'linear-gradient(180deg, #1c2a3a 0%, #3a5064 100%)',
    image: '/backgrounds/anime-snow-valley.jpg',
    particles: 'stars',
  },
  // --- 蓝档 ---
  {
    id: 'bg_anime_room',
    name: '和风小屋',
    css: 'linear-gradient(180deg, #3a2c1e 0%, #5c4830 100%)',
    image: '/backgrounds/anime-room.jpg',
    particles: 'petal',
  },
  {
    id: 'bg_anime_autumn',
    name: '秋日私语',
    css: 'linear-gradient(180deg, #3a2414 0%, #6b4420 100%)',
    image: '/backgrounds/anime-autumn.jpg',
    particles: 'leaf',
  },
  {
    id: 'bg_anime_lake',
    name: '镜面之湖',
    css: 'linear-gradient(180deg, #14283a 0%, #2c5064 100%)',
    image: '/backgrounds/anime-lake.jpg',
    particles: 'bubble',
  },
  {
    id: 'bg_anime_cafe',
    name: '街角咖啡',
    css: 'linear-gradient(180deg, #2e2018 0%, #4e3828 100%)',
    image: '/backgrounds/anime-cafe.jpg',
    particles: 'spark',
  },
  // --- 紫档 ---
  {
    id: 'bg_anime_shrine',
    name: '朱红鸟居',
    css: 'linear-gradient(180deg, #341a1e 0%, #5c2c30 100%)',
    image: '/backgrounds/anime-shrine.jpg',
    particles: 'petal',
  },
  {
    id: 'bg_anime_rain_city',
    name: '雨夜街灯',
    css: 'linear-gradient(180deg, #101828 0%, #1e2c44 100%)',
    image: '/backgrounds/anime-rain-city.jpg',
    particles: 'bubble',
  },
  {
    id: 'bg_anime_field',
    name: '苍穹之野',
    css: 'linear-gradient(180deg, #16303a 0%, #2a5450 100%)',
    image: '/backgrounds/anime-fantasy-field.jpg',
    particles: 'stars',
  },
  {
    id: 'bg_anime_urban_night',
    name: '都市晚风',
    css: 'linear-gradient(180deg, #141830 0%, #243058 100%)',
    image: '/backgrounds/anime-urban-night.jpg',
    particles: 'stars',
  },
  // --- 金档 ---
  {
    id: 'bg_anime_fireworks',
    name: '夏夜花火',
    css: 'linear-gradient(180deg, #0c1028 0%, #1a1c40 100%)',
    image: '/backgrounds/anime-fireworks.jpg',
    particles: 'spark',
  },
  {
    id: 'bg_anime_starlit',
    name: '星穹之下',
    css: 'linear-gradient(180deg, #0a0e28 0%, #161e44 100%)',
    image: '/backgrounds/anime-starlit.jpg',
    particles: 'stars',
  },
  {
    id: 'bg_anime_garden',
    name: '秘境花园',
    css: 'linear-gradient(180deg, #1c3024 0%, #345040 100%)',
    image: '/backgrounds/anime-garden.jpg',
    particles: 'petal',
  },
  {
    id: 'bg_anime_season_tree',
    name: '四季之树',
    css: 'linear-gradient(180deg, #28443a 0%, #4a6a4c 100%)',
    image: '/backgrounds/anime-season-tree.jpg',
    particles: 'petal',
  },
  {
    id: 'bg_anime_dusk_forest',
    name: '云海林径',
    css: 'linear-gradient(180deg, #14202e 0%, #2c3e50 100%)',
    image: '/backgrounds/anime-dusk-forest.jpg',
    particles: 'spark',
  },
  // ===== 高清图片背景（AI 绘制） =====
  {
    id: 'bg_celestial',
    name: '星穹之幕',
    css: 'linear-gradient(180deg, #0b0d2a 0%, #141838 100%)',
    image: '/backgrounds/celestial.jpg',
    particles: 'stars',
  },
  {
    id: 'bg_aurora_palace',
    name: '极光圣殿',
    css: 'linear-gradient(180deg, #071a24 0%, #0f3a3a 100%)',
    image: '/backgrounds/aurora.jpg',
    particles: 'stars',
  },
  {
    id: 'bg_inferno',
    name: '熔焰之心',
    css: 'linear-gradient(180deg, #2a0a08 0%, #4a1408 100%)',
    image: '/backgrounds/inferno.jpg',
    particles: 'ember',
  },
  // ===== 宝箱专属背景（AI 绘制，仅宝箱产出） =====
  {
    id: 'chest_bg_white',
    name: '初心者·晨光小径',
    css: 'linear-gradient(180deg, #2a2418 0%, #4a4030 100%)',
    image: '/backgrounds/chest-white-path.jpg',
    particles: 'leaf',
  },
  {
    id: 'chest_bg_blue',
    name: '苍蓝·深海回廊',
    css: 'linear-gradient(180deg, #061428 0%, #0c2a4a 100%)',
    image: '/backgrounds/chest-blue-abyss.jpg',
    particles: 'bubble',
  },
  {
    id: 'chest_bg_purple',
    name: '幻紫·星尘秘境',
    css: 'linear-gradient(180deg, #160a28 0%, #2a1448 100%)',
    image: '/backgrounds/chest-purple-realm.jpg',
    particles: 'void',
  },
  {
    id: 'chest_bg_gold',
    name: '黄金·黎明殿堂',
    css: 'linear-gradient(180deg, #2c2008 0%, #4a3810 100%)',
    image: '/backgrounds/chest-gold-throne.jpg',
    particles: 'spark',
  },
  {
    id: 'chest_bg_red',
    name: '绯红·天启之门',
    css: 'linear-gradient(180deg, #280608 0%, #480c10 100%)',
    image: '/backgrounds/chest-red-gate.jpg',
    particles: 'ember',
  },
  // ===== 个性化（personal 限时） =====
  {
    id: 'pers_creator_bg',
    name: '创造者工作室背景',
    css: 'radial-gradient(ellipse at 50% 30%, #4a3320 0%, transparent 60%), linear-gradient(180deg, #2a1d10 0%, #3d2a1a 55%, #1c130a 100%)',
    particles: 'spark',
  },
]

/** 按 id 查询 */
export const getBackgroundDef = (id: string | null | undefined): BackgroundDef | null =>
  BACKGROUNDS.find((b) => b.id === id) ?? null

// ===== 选择持久化（localStorage + 模块级订阅，供 useSyncExternalStore 使用） =====

const STORAGE_KEY = 'levelup.background.choice'

const listeners = new Set<() => void>()

const readStored = (): string | null => {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'none' || getBackgroundDef(v) ? v : null
  } catch {
    return null
  }
}

let current: string | null = readStored()

export const getBackgroundChoice = (): string | null => current

/** 选择背景（传 null 恢复默认）；是否拥有由调用方（背包页）校验 */
export const setBackgroundChoice = (id: string | null) => {
  const next = id === 'none' ? null : id
  if (next && !getBackgroundDef(next)) return
  if (next === current) return
  current = next
  try {
    if (next) localStorage.setItem(STORAGE_KEY, next)
    else localStorage.setItem(STORAGE_KEY, 'none')
  } catch {
    /* 存储不可用时仅内存生效 */
  }
  listeners.forEach((l) => l())
}

export const subscribeBackgroundChoice = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

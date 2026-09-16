// ===== BOSS 周挑战图鉴 =====
// 每周一届（ISO 周），届数超过图鉴长度后循环复用（数值继续增长）。
// 立绘：public/bosses/<id>.png（AI 生成动漫厚涂风，深色背景融入页面）。

export interface BossDef {
  id: string
  /** 名字（如「深渊巨龙·瓦罗斯」） */
  name: string
  /** 称号（如「沉睡千年的灾厄」） */
  title: string
  /** 主题色（hex，血条/特效/边框） */
  color: string
  /** 立绘路径（public 下） */
  portrait: string
  /** 开场威慑台词 */
  taunt: string
  /** 败亡台词（击杀仪式展示） */
  epitaph: string
}

export const BOSS_ROSTER: BossDef[] = [
  {
    id: 'boss_varoth',
    name: '深渊巨龙·瓦罗斯',
    title: '沉睡千年的灾厄',
    color: '#ef4444',
    portrait: '/bosses/boss_varoth.jpg',
    taunt: '汝之专注，不过是吾鳞片上的一粒尘埃。',
    epitaph: '吾之千载沉眠……竟败于汝之片刻专注。',
  },
  {
    id: 'boss_nightmare',
    name: '墨梦魔君',
    title: '编织怠惰的暗影',
    color: '#a855f7',
    portrait: '/bosses/boss_nightmare.jpg',
    taunt: '停下来吧……梦里什么都有，何必清醒。',
    epitaph: '原来……清醒的滋味，是这样的啊。',
  },
  {
    id: 'boss_frostqueen',
    name: '霜亡女王·艾希丝',
    title: '冻结意志的极寒',
    color: '#38bdf8',
    portrait: '/bosses/boss_frostqueen.jpg',
    taunt: '热情终将冷却，正如所有坚持一样。',
    epitaph: '这份不曾冷却的热忱……吾，认输了。',
  },
  {
    id: 'boss_magmatitan',
    name: '熔核泰坦',
    title: '焚烧决心的洪炉',
    color: '#f97316',
    portrait: '/bosses/boss_magmatitan.jpg',
    taunt: '弱者的誓言，一炉便能烧尽。',
    epitaph: '烧不毁的誓言……竟真的存在。',
  },
  {
    id: 'boss_voiddevourer',
    name: '虚空吞噬者',
    title: '蚕食时间的无形之口',
    color: '#7c3aed',
    portrait: '/bosses/boss_voiddevourer.jpg',
    taunt: '你「稍后在做」的每一件事，都已成吾之血肉。',
    epitaph: '汝把「稍后」都变成了「现在」……吾的盛宴，就此散场。',
  },
  {
    id: 'boss_lionking',
    name: '黄金狮王·雷古勒斯',
    title: '傲视拖延的王座',
    color: '#fbbf24',
    portrait: '/bosses/boss_lionking.jpg',
    taunt: '唯有真正的行动者，配站在吾面前。',
    epitaph: '行动者……汝配得上吾的王座。',
  },
  {
    id: 'boss_lich',
    name: '腐沼巫妖',
    title: '繁殖借口的温床',
    color: '#22c55e',
    portrait: '/bosses/boss_lich.jpg',
    taunt: '「今天太累了」——多好的一句咒语，替吾续命千年。',
    epitaph: '「今天太累了」……这句话，汝竟从未说出口。',
  },
  {
    id: 'boss_phoenix',
    name: '星陨凤凰',
    title: '浴火重生的试炼',
    color: '#2dd4bf',
    portrait: '/bosses/boss_phoenix.jpg',
    taunt: '击溃吾一次，吾便归来一次。你呢？',
    epitaph: '吾会归来。但下一次……汝会更强。',
  },
  {
    id: 'boss_nightking',
    name: '永夜君王',
    title: '漫长黑夜的支配者',
    color: '#3b82f6',
    portrait: '/bosses/boss_nightking.jpg',
    taunt: '深夜的清醒不是力量，是吾赐予你的诅咒。',
    epitaph: '黎明……原来是这个颜色。',
  },
  {
    id: 'boss_chaos',
    name: '众相之主·卡俄斯',
    title: '所有逃避的集合体',
    color: '#e5e7eb',
    portrait: '/bosses/boss_chaos.jpg',
    taunt: '吾即你放弃过的每一个自己。来，战胜吾。',
    epitaph: '汝战胜的不是吾……是每一个想放弃的自己。',
  },
  {
    id: 'boss_mirrorqueen',
    name: '镜渊女皇·维莎拉',
    title: '映照迷惘的万花之镜',
    color: '#c084fc',
    portrait: '/bosses/boss_mirrorqueen.jpg',
    taunt: '来，看看镜中的汝——那就是汝本来的样子。',
    epitaph: '镜中映出的……竟是从未迷惘的汝。',
  },
  {
    id: 'boss_siren',
    name: '星海歌姬·罗蕾莱',
    title: '沉溺温柔的无声之歌',
    color: '#22d3ee',
    portrait: '/bosses/boss_siren.jpg',
    taunt: '别挣扎了……随吾的歌声，沉入安逸的海底。',
    epitaph: '汝竟能在吾的歌声中……保持清醒前行。',
  },
  {
    id: 'boss_flamepriestess',
    name: '焚樱巫女·绯',
    title: '以热情焚烧己身的祈祷',
    color: '#fb7185',
    portrait: '/bosses/boss_flamepriestess.jpg',
    taunt: '汝的热情，不过是吾掌心的一瓣焚樱。',
    epitaph: '这炉火未曾熄灭……吾的祈祷，就交给汝了。',
  },
  {
    id: 'boss_valkyrie',
    name: '雷霆女武神·斯露德',
    title: '裁决懈怠的天雷',
    color: '#a78bfa',
    portrait: '/bosses/boss_valkyrie.jpg',
    taunt: '雷鸣只为警醒者而响。汝，听见了么？',
    epitaph: '这一声雷……是吾为汝的觉醒而鸣。',
  },
  {
    id: 'boss_bloodmoon',
    name: '血月魔女·卡蜜拉',
    title: '沉醉暮色的血色盛宴',
    color: '#dc2626',
    portrait: '/bosses/boss_bloodmoon.jpg',
    taunt: '夜还很长呢……陪吾饮尽这一杯再走。',
    epitaph: '杯中的月光……原来也会有饮尽的一夜。',
  },
  {
    id: 'boss_clockwork',
    name: '时之守望者·克洛诺',
    title: '偷走分秒的无声齿轮',
    color: '#5eead4',
    portrait: '/bosses/boss_clockwork.jpg',
    taunt: '汝挥霍的每一秒，都在吾的齿轮里转动。',
    epitaph: '汝把每一秒都握在了手里……吾的时间，到头了。',
  },
  {
    id: 'boss_blademaster',
    name: '剑冢剑圣·玄爷',
    title: '埋葬借口的一万把刀',
    color: '#60a5fa',
    portrait: '/bosses/boss_blademaster.jpg',
    taunt: '吾的剑冢里，埋着无数「明天再说」。',
    epitaph: '好剑。……汝的每一天，都配得上这一刀。',
  },
  {
    id: 'boss_weaver',
    name: '静默织姬·阿涅丝',
    title: '缠住脚步的无形丝线',
    color: '#94a3b8',
    portrait: '/bosses/boss_weaver.jpg',
    taunt: '别动……再躺一会儿，丝线会替汝织完这一天。',
    epitaph: '汝竟一根一根……剪断了吾织了千日的网。',
  },
  {
    id: 'boss_stormqueen',
    name: '雷暴女皇·忒亚',
    title: '击碎安稳的紫色天雷',
    color: '#8b5cf6',
    portrait: '/bosses/boss_stormqueen.jpg',
    taunt: '雷雨之夜最适合躲进被窝——汝为何还在前行？',
    epitaph: '汝在雷鸣中站稳的样子……值得吾收起天威。',
  },
  {
    id: 'boss_duskblade',
    name: '暮色剑鬼·无铭',
    title: '黄昏时分的一刀惰意',
    color: '#4f46e5',
    portrait: '/bosses/boss_duskblade.jpg',
    taunt: '天都快黑了，今日之事，明日再战不迟。',
    epitaph: '暮色尽头仍有光……是汝提着灯赶路的样子。',
  },
  {
    id: 'boss_gardener',
    name: '荆棘园丁·萝赛塔',
    title: '荒废之事滋生的蔷薇园',
    color: '#f43f5e',
    portrait: '/bosses/boss_gardener.jpg',
    taunt: '汝半途荒废的每一件事，都在吾的园里开成了花。',
    epitaph: '汝一件一件拾回了它们……吾的花园，要荒芜了。',
  },
  {
    id: 'boss_crownless',
    name: '无冕之王·埃德蒙',
    title: '未竟之志堆成的王座',
    color: '#38bdf8',
    portrait: '/bosses/boss_crownless.jpg',
    taunt: '坐下吧。放弃的人，都曾是意气风发的王。',
    epitaph: '汝没有坐下……汝从吾的王座旁，走了过去。',
  },
]

/** 按届数取 BOSS（超过图鉴长度循环；洗牌循环上线后仅作旧档/兜底回退） */
export const bossForStage = (stage: number): BossDef =>
  BOSS_ROSTER[(Math.max(1, stage) - 1) % BOSS_ROSTER.length]

/** 洗牌：随机打乱图鉴顺序（Fisher-Yates，洗牌循环用） */
export const shuffleBossIds = (): string[] => {
  const ids = BOSS_ROSTER.map((b) => b.id)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  return ids
}

// ===== 血量（固定数值，强度按届数爬坡） =====
// 设计基准：20h 工作量起步 → 10 届内线性爬升 → 35h 工作量封顶（按 480 XP/h 折算成固定 HP）。

/** 起始/封顶工时与爬坡届数（仅作强度标定基准，运行时不参与计算） */
export const BOSS_HOURS = { start: 20, max: 35, rampStages: 10 } as const

/** 折算基准（XP/h）：20h × 480 = 9600 起步，35h × 480 = 16800 封顶 */
const HP_BASE_XP_PER_HOUR = 480

/** 本届 HP：9600 →（10 届内线性）→ 16800 封顶（固定数值，不随玩家效率变化） */
export const bossMaxHp = (stage: number): number => {
  const s = Math.max(1, stage)
  const { start, max, rampStages } = BOSS_HOURS
  const hours = s >= rampStages ? max : start + ((max - start) * (s - 1)) / (rampStages - 1)
  return Math.round(hours * HP_BASE_XP_PER_HOUR)
}

/** 击杀金币 */
export const bossKillCoins = (stage: number): number => 150 + Math.max(1, stage) * 50

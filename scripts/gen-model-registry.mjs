// ===== 生成 live2dModels.ts 注册条目（扫描 public/live2d/ 新模型目录） =====
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../public/live2d')

/** 本地包模型（手工稀有度/价格/emoji） */
const LOCAL = {
  tsubaki: { label: '椿', icon: '💐', rarity: 'purple', price: 6000 },
  alexia: { label: 'Alexia', icon: '🦊', rarity: 'purple', price: 6000 },
  aniya: { label: 'ANIYA', icon: '🎭', rarity: 'red', price: 15000 },
  nicole: { label: '妮可', icon: '🛼', rarity: 'gold', price: 10000 },
  tingyun: { label: '停云', icon: '☁️', rarity: 'purple', price: 6000 },
  ellen: { label: '艾莲', icon: '🦈', rarity: 'gold', price: 10000 },
  fuxuan: { label: '符玄', icon: '🔮', rarity: 'gold', price: 10000 },
  jingliu: { label: '镜流', icon: '❄️', rarity: 'gold', price: 10000 },
  changli: { label: '长离', icon: '🦚', rarity: 'purple', price: 5000 },
  ruanmei: { label: '阮梅', icon: '🧧', rarity: 'gold', price: 10000 },
}

/** 碧蓝航线舰娘中文名/emoji/稀有度（人气舰娘 purple，其余 blue） */
const AZUR = {
  aidang_2: { label: '爱宕', icon: '🍇', rarity: 'purple', price: 6000 },
  aierdeliqi_4: { label: '阿尔及利亚', icon: '🌙', rarity: 'blue', price: 3000 },
  aierdeliqi_5: { label: '阿尔及利亚·改', icon: '🌙', rarity: 'blue', price: 3200 },
  aimierbeierding_2: { label: '埃米尔·贝尔坦', icon: '🍰', rarity: 'blue', price: 2800 },
  banrenma_2: { label: '半人马', icon: '🏹', rarity: 'blue', price: 3200 },
  beierfasite_2: { label: '贝尔法斯特', icon: '🍷', rarity: 'purple', price: 6000 },
  biaoqiang: { label: '标枪', icon: '🗡️', rarity: 'blue', price: 2800 },
  biaoqiang_3: { label: '标枪·改', icon: '🗡️', rarity: 'blue', price: 3000 },
  bisimai_2: { label: '俾斯麦', icon: '⚓', rarity: 'purple', price: 6000 },
  chuixue_3: { label: '吹雪', icon: '❄️', rarity: 'blue', price: 2600 },
  dafeng_2: { label: '大凤', icon: '🐦', rarity: 'purple', price: 6000 },
  deyizhi_3: { label: '德意志', icon: '🦅', rarity: 'blue', price: 3000 },
  dujiaoshou_4: { label: '独角兽', icon: '🦄', rarity: 'blue', price: 3200 },
  dunkeerke_2: { label: '敦刻尔克', icon: '⚓', rarity: 'blue', price: 2800 },
  genaisennao_2: { label: '根纳森瑙', icon: '⚓', rarity: 'blue', price: 2800 },
  heitaizi_2: { label: '黑太子', icon: '🖤', rarity: 'blue', price: 2800 },
  huangjiafangzhou_3: { label: '皇家方舟', icon: '🏴', rarity: 'purple', price: 5000 },
  huonululu_3: { label: '火奴鲁鲁', icon: '🌺', rarity: 'blue', price: 2600 },
  huonululu_5: { label: '火奴鲁鲁·改', icon: '🌺', rarity: 'blue', price: 2800 },
  kelifulan_3: { label: '克利夫兰', icon: '🎷', rarity: 'blue', price: 2800 },
  lafei: { label: '拉菲', icon: '🐰', rarity: 'purple', price: 6000 },
  lafei_4: { label: '拉菲·改', icon: '🐰', rarity: 'purple', price: 6200 },
  lingbo: { label: '绫波', icon: '🌊', rarity: 'purple', price: 6000 },
  mingshi: { label: '明石', icon: '🐱', rarity: 'blue', price: 2600 },
  ninghai_4: { label: '宁海', icon: '🐉', rarity: 'blue', price: 2800 },
  pinghai_4: { label: '平海', icon: '🐉', rarity: 'blue', price: 2800 },
  qibolin_2: { label: '齐柏林', icon: '✈️', rarity: 'purple', price: 5000 },
  shengluyisi_2: { label: '圣路易斯', icon: '🎺', rarity: 'blue', price: 3000 },
  shengluyisi_3: { label: '圣路易斯·改', icon: '🎺', rarity: 'blue', price: 3200 },
  sipeibojue_5: { label: '斯佩伯爵', icon: '🚢', rarity: 'blue', price: 2800 },
  taiyuan_2: { label: '太原', icon: '🏮', rarity: 'blue', price: 2600 },
  tianlangxing_3: { label: '天狼星', icon: '🌟', rarity: 'purple', price: 5000 },
  tierbici_2: { label: '提尔比茨', icon: '⚡', rarity: 'purple', price: 6000 },
  xianghe_2: { label: '翔鹤', icon: '🕊️', rarity: 'purple', price: 5000 },
  xixuegui_4: { label: '吸血鬼', icon: '🧛', rarity: 'blue', price: 3000 },
  xuefeng: { label: '雪风', icon: '🌨️', rarity: 'purple', price: 6000 },
  yichui_2: { label: '伊吹', icon: '🌸', rarity: 'blue', price: 3200 },
  z23: { label: 'Z23', icon: '📘', rarity: 'purple', price: 5000 },
  z46_2: { label: 'Z46', icon: '📗', rarity: 'blue', price: 3000 },
  zhala_2: { label: '扎拉', icon: '🍝', rarity: 'blue', price: 3200 },
}

const scan = (id) => {
  const dir = join(ROOT, id)
  const entry = readdirSync(dir).find((f) => f.endsWith('.model3.json'))
  if (!entry) throw new Error(`${id}: no model3.json`)
  const cfg = JSON.parse(readFileSync(join(dir, entry), 'utf8'))
  const groups = Object.keys(cfg.FileReferences.Motions ?? {})
  const idleGroup = groups.includes('Idle') ? 'Idle' : groups.includes('') ? "''" : "''"
  return { url: `/live2d/${id}/${entry}`, idleGroup, hasMotion: groups.length > 0 }
}

const line = (id, meta, cubism) => {
  const s = scan(id)
  const group = s.idleGroup === 'Idle' ? "'Idle'" : "''"
  return `  { id: '${id}', label: '${meta.label}', icon: '${meta.icon}', url: '${s.url}', idleGroup: ${group}, cubism: ${cubism}, chestRarity: '${meta.rarity}', shopPrice: ${meta.price} },`
}

console.log('// ===== 本地收录模型（moc3 v4/v5，抽奖/商店解锁） =====')
for (const [id, meta] of Object.entries(LOCAL)) console.log(line(id, meta, 4))
console.log()
console.log('// ===== 碧蓝航线（Cubism 3，imuncle/live2d 收录，抽奖/商店解锁） =====')
for (const [id, meta] of Object.entries(AZUR)) console.log(line(`al_${id}`, meta, 3))

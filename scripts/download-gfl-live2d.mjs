/**
 * 少女前线 Live2D 批量下载（evrstr/live2d-widget-models，Cubism 2 格式）
 *
 * 用法：node scripts/download-gfl-live2d.mjs
 * 原理：逐个拉取 model.json → 解析 moc/textures/motions/physics/pose 引用 → 全量下载到 public/live2d/{id}/
 * 已存在 model.json 的目录自动跳过（幂等）。
 */
import { mkdir, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'https://cdn.jsdelivr.net/gh/evrstr/live2d-widget-models/live2d_evrstr'
const OUT = join(ROOT, 'public', 'live2d')

/** [源目录名, 本地id] */
const MODELS = [
  ['kp31', 'kp31'],
  ['ump9_3404', 'ump9'],
  ['g36_2407', 'g36'],
  ['welrod_1401', 'welrod'],
  ['dsr50_1801', 'dsr50'],
  ['grizzly_2102', 'grizzly'],
  ['95type_405', 'type95'],
  ['k2_3301', 'k2'],
  ['pkp_1201', 'pkp'],
  ['ots14_3001', 'ots14'],
  ['ntw20_2301', 'ntw20'],
  ['m1928a1_1501', 'thompson'],
]

const fetchOk = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

const exists = async (p) => access(p).then(() => true, () => false)

for (const [src, id] of MODELS) {
  const outDir = join(OUT, id)
  if (await exists(join(outDir, 'model.json'))) {
    console.log(`= ${id}: already exists, skip`)
    continue
  }
  try {
    const jsonBuf = await fetchOk(`${BASE}/${src}/model.json`)
    const cfg = JSON.parse(jsonBuf.toString('utf8'))

    // 删除 layout 字段：游戏原始布局（center_y/width 等）会被 pixi-live2d-display
    // 应用为 localTransform 平移/拉伸，把内容挪出适配画布盒导致形象不可见
    // （KP31 曾因 center_y:-1.3 + width:3 白屏不可见，2026-08 修复）
    delete cfg.layout
    const jsonOut = Buffer.from(JSON.stringify(cfg, null, 2), 'utf8')

    // 收引用清单（相对 model.json）
    const rel = new Set(['model.json'])
    if (cfg.model) rel.add(cfg.model)
    for (const t of cfg.textures ?? []) rel.add(t)
    if (cfg.physics) rel.add(cfg.physics)
    if (cfg.pose) rel.add(cfg.pose)
    for (const e of cfg.expressions ?? []) rel.add(e.file)
    for (const groups of Object.values(cfg.motions ?? {}))
      for (const m of groups) rel.add(m.file)
    // 声音文件跳过（体积大、项目不播放）

    let bytes = 0
    for (const r of rel) {
      const buf = r === 'model.json' ? jsonOut : await fetchOk(`${BASE}/${src}/${r}`)
      const dest = join(outDir, r)
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, buf)
      bytes += buf.length
    }
    console.log(`+ ${id}: ${rel.size} files, ${(bytes / 1024 / 1024).toFixed(2)} MB`)
  } catch (e) {
    console.log(`! ${id}: FAILED - ${e.message}`)
  }
}
console.log('done.')

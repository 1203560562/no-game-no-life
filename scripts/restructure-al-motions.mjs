// ===== 重构碧蓝航线 model3.json 动作分组 =====
// 旧格式模型的动作全部挤在匿名组 ""（含入场/特效/触摸动作），
// 运行时随机播放会把人物移出画布（拉菲入场行走、伊吹全屏特效等）。
// 本脚本把 motions/idle.motion3.json 拆分到独立的 "Idle" 组：
//   - 注册表 idleGroup: 'Idle' → 库只循环播放原地待机动作
//   - 入场/特效/触摸动作留在 "" 组不再被随机选中
// 用法: node scripts/restructure-al-motions.mjs  （幂等，可重复执行）
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../public/live2d')

let changed = 0
let skipped = 0

for (const e of readdirSync(ROOT, { withFileTypes: true })) {
  if (!e.isDirectory() || !e.name.startsWith('al_')) continue
  const dir = join(ROOT, e.name)
  const entry = readdirSync(dir).find((f) => f.endsWith('.model3.json'))
  if (!entry) continue
  const path = join(dir, entry)
  const cfg = JSON.parse(readFileSync(path, 'utf8'))
  const fr = cfg.FileReferences ?? {}
  const motions = fr.Motions ?? {}

  if (motions.Idle) {
    skipped++
    continue // 已有 Idle 组（新格式模型）
  }
  const empty = motions['']
  if (!Array.isArray(empty) || empty.length === 0) {
    skipped++
    continue
  }

  const idleEntries = empty.filter((m) => /idle\.motion3\.json$/.test(m.File ?? ''))
  if (idleEntries.length === 0) {
    skipped++
    continue
  }

  motions[''] = empty.filter((m) => !idleEntries.includes(m))
  if (motions[''].length === 0) delete motions['']
  motions.Idle = idleEntries

  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n')
  changed++
  console.log(`✓ ${e.name}: Idle 组 ← ${idleEntries.map((m) => m.File).join(', ')}；剩余 "" 组 ${motions['']?.length ?? 0} 个动作`)
}

console.log(`\n完成：重构 ${changed} 个 · 跳过 ${skipped} 个`)

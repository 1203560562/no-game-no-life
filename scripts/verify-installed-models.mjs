// ===== 校验 public/live2d/ 已安装模型的完整性 =====
// 检查：入口 JSON 存在、Moc/贴图/物理/动作/表情引用齐全、moc3 版本 ≤5（Core 兼容）
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../public/live2d')

// 关注本次新增目录（本地包 + 碧蓝航线）
const IDS = [
  'tsubaki', 'alexia', 'aniya', 'nicole', 'tingyun', 'ellen', 'fuxuan', 'jingliu', 'changli', 'ruanmei',
]

const results = { ok: [], broken: [], noEntry: [] }

for (const e of readdirSync(ROOT, { withFileTypes: true })) {
  if (!e.isDirectory()) continue
  const id = e.name
  if (!id.startsWith('al_') && !IDS.includes(id)) continue
  const dir = join(ROOT, id)

  const files = readdirSync(dir)
  const entry = files.find((f) => f.endsWith('.model3.json'))
  if (!entry) {
    results.noEntry.push(`${id} :: 只有 [${files.join(', ')}]`)
    continue
  }

  let cfg
  try {
    cfg = JSON.parse(readFileSync(join(dir, entry), 'utf8'))
  } catch (err) {
    results.broken.push(`${id} :: ${entry} JSON 解析失败: ${err.message}`)
    continue
  }

  const missing = []
  const fr = cfg.FileReferences ?? {}
  for (const t of fr.Textures ?? []) if (!existsSync(join(dir, t))) missing.push(`tex:${t}`)
  if (fr.Moc && !existsSync(join(dir, fr.Moc))) missing.push(`moc:${fr.Moc}`)
  if (fr.Physics && !existsSync(join(dir, fr.Physics))) missing.push(`phy:${fr.Physics}`)
  for (const [g, list] of Object.entries(fr.Motions ?? {}))
    for (const m of list ?? [])
      if (m.File && !existsSync(join(dir, m.File))) missing.push(`mot:${g}/${m.File}`)
  for (const ex of fr.Expressions ?? [])
    if (ex.File && !existsSync(join(dir, ex.File))) missing.push(`exp:${ex.File}`)

  let mocVer = '?'
  if (fr.Moc) {
    try { mocVer = readFileSync(join(dir, fr.Moc))[4] } catch { /* ignore */ }
  }

  // Cubism 2 的 layout 字段禁止保留（KP31 教训）
  const hasLayout = 'layout' in cfg
  if (hasLayout) missing.push('layout字段残留')

  const rec = { id, entry, mocVer, missing }
  if (missing.length === 0 && mocVer <= 5) results.ok.push(rec)
  else results.broken.push(`${id} :: moc3 v${mocVer} | ${missing.join(' ; ')}`)
}

console.log(`=== OK (${results.ok.length}) ===`)
for (const r of results.ok) console.log(`  ${r.id} (${r.entry}, moc3 v${r.mocVer})`)
console.log(`\n=== 损坏/缺文件 (${results.broken.length}) ===`)
for (const b of results.broken) console.log(`  ${b}`)
console.log(`\n=== 无入口 model3.json (${results.noEntry.length}) ===`)
for (const n of results.noEntry) console.log(`  ${n}`)

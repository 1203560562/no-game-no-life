// ===== 检查解压包内所有 model3.json 的引用完整性 =====
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../.live2d_extract')

const dirs = ['11月椿', 'Alexia', 'ANIYA', 'ANIYA-walk', 'Nicole', 'tingyun', '免费模型艾莲', '符玄', '镜流', '镜流_Jingliu_', '长离带水印', '阮梅_Ruan_Mei__2_']

for (const d of dirs) {
  const found = []
  const walk = (p) => {
    let entries
    try {
      entries = readdirSync(p, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = join(p, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('.model3.json')) found.push(full)
    }
  }
  walk(join(ROOT, d))
  for (const j of found) {
    const dir = dirname(j)
    let cfg
    try {
      cfg = JSON.parse(readFileSync(j, 'utf8'))
    } catch (err) {
      console.log(`\n## ${d} :: ${j.replace(ROOT + '\\', '')}\n  JSON 解析失败: ${err.message}`)
      continue
    }
    const missing = []
    const fr = cfg.FileReferences ?? {}
    for (const t of fr.Textures ?? []) if (!existsSync(join(dir, t))) missing.push(`tex:${t}`)
    if (fr.Physics && !existsSync(join(dir, fr.Physics))) missing.push(`phy:${fr.Physics}`)
    if (fr.Moc && !existsSync(join(dir, fr.Moc))) missing.push(`moc:${fr.Moc}`)
    const motionGroups = Object.keys(fr.Motions ?? {})
    let motionCount = 0
    for (const [g, list] of Object.entries(fr.Motions ?? {})) {
      for (const m of list ?? []) {
        motionCount++
        if (m.File && !existsSync(join(dir, m.File))) missing.push(`mot:${g}/${m.File}`)
      }
    }
    const exps = fr.Expressions ?? []
    for (const e of exps) {
      if (e.File && !existsSync(join(dir, e.File))) missing.push(`exp:${e.File}`)
    }
    let mocVer = '?'
    if (fr.Moc) {
      try {
        mocVer = readFileSync(join(dir, fr.Moc))[4]
      } catch { /* ignore */ }
    }
    console.log(`\n## ${d} :: ${j.replace(ROOT + '\\', '')}`)
    console.log(`  moc3 v${mocVer} | motions: ${motionCount} (${motionGroups.join(',') || '-'}) | exp: ${exps.length} | missing: ${missing.length === 0 ? '0 OK' : missing.join(' ; ')}`)
  }
}

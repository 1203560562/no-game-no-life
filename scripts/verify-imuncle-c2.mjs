// 验证新下载模型：model.json 引用的资源齐全 + 后处理（layout 删除/匿名组改名/坏引用清理）生效
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../public/live2d')

const MODELS = [
  { dir: 'aoba', entries: ['2.json'] },
  { dir: 'sagiri', entries: ['sagiri.model.json'] },
  { dir: 'yuri', entries: ['model.json'] },
  { dir: 'violet', entries: ['14.json'] },
  { dir: 'mashiro', entries: ['ryoufuku.model.json', 'seifuku.model.json', 'shifuku.model.json'] },
  { dir: 'kp31_310', entries: ['normal/model.json', 'destroy/model.json'] },
]

let problems = 0
for (const { dir, entries } of MODELS) {
  const d = join(ROOT, dir)
  const fileCount = readdirSync(d, { recursive: true }).filter((f) => {
    try { return statSync(join(d, f)).isFile() } catch { return false }
  }).length
  console.log(`\n== ${dir} (${fileCount} files) ==`)
  for (const entry of entries) {
    const cfgPath = join(d, entry)
    if (!existsSync(cfgPath)) { console.log(`  ✗ 缺入口 ${entry}`); problems++; continue }
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
    const refs = []
    refs.push(cfg.model)
    ;(cfg.textures ?? []).forEach((t) => refs.push(t))
    Object.values(cfg.motions ?? {}).forEach((arr) => (arr ?? []).forEach((m) => m.file && refs.push(m.file)))
    ;(cfg.expressions ?? []).forEach((e) => refs.push(e.file))
    if (cfg.physics) refs.push(cfg.physics)
    if (cfg.pose) refs.push(cfg.pose)
    const missing = refs.filter((r) => r && !existsSync(join(dirname(cfgPath), r)))
    const motionCount = Object.values(cfg.motions ?? {}).reduce((s, a) => s + (a?.length ?? 0), 0)
    const checks = [
      ['layout 已删', !cfg.layout],
      ['引用齐全', missing.length === 0],
    ]
    for (const [name, ok] of checks) if (!ok) problems++
    console.log(
      `  ${entry}: ${motionCount} 动作 · ${cfg.textures?.length ?? 0} 贴图 · ` +
      checks.map(([n, ok]) => (ok ? `✓${n}` : `✗${n}`)).join(' ') +
      (missing.length ? ` 缺失: ${missing.join(', ')}` : '') +
      (cfg.layout ? ` layout=${JSON.stringify(cfg.layout)}` : ''),
    )
  }
}
// kp31 匿名组改名验证
for (const e of ['normal/model.json', 'destroy/model.json']) {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'kp31_310', e), 'utf8'))
  const ok = cfg.motions?.tap && !cfg.motions?.['']
  if (!ok) problems++
  console.log(`kp31_310/${e}: 匿名组→tap ${ok ? '✓' : '✗'} (组: ${Object.keys(cfg.motions).join(',')})`)
}
// aoba 坏引用清理验证
const aoba = JSON.parse(readFileSync(join(ROOT, 'aoba', '2.json'), 'utf8'))
const aobaOk = !aoba.motions?.new_msg
if (!aobaOk) problems++
console.log(`aoba new_msg 删除: ${aobaOk ? '✓' : '✗'}`)
console.log(problems === 0 ? '\n全部通过' : `\n${problems} 个问题`)
process.exit(problems === 0 ? 0 : 1)

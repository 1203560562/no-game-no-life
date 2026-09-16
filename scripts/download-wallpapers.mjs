// ===== 高清背景图下载脚本（GitHub: Nirupam-Ghosh2004/VisualVault） =====
// 用法: node scripts/download-wallpapers.mjs
// 挑选原则：暗色氛围系风景/城市/太空，适合作为 Live2D 立绘画框背景（无人物主体、无版权角色）

import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '../public/backgrounds')

const RAW = (f) => `https://raw.githubusercontent.com/Nirupam-Ghosh2004/VisualVault/main/${f}`

/** [源文件名, 本地文件名] */
const LIST = [
  // 白档（common，CSS 渐变之上的入门图）
  ['dunes-sun.jpg', 'dunes.jpg'],
  ['landscape-abstract-neon.jpg', 'neon-field.jpg'],
  ['calm.jpg', 'calm.jpg'],
  ['dark-waves.jpg', 'dark-waves.jpg'],
  // 蓝档（rare）
  ['blue_night_moon_over_lake.jpg', 'moon-lake.jpg'],
  ['mist.png', 'mist.png'],
  ['northern-night.jpg', 'northern-night.jpg'],
  ['comet.jpg', 'comet.jpg'],
  // 紫档（epic）
  ['neon_city.jpg', 'neon-city.jpg'],
  ['night_city.jpg', 'night-city.jpg'],
  ['cyber.jpg', 'cyber.jpg'],
  ['mystical-night-in-town.jpg', 'mystic-town.jpg'],
  // 金档（legendary）
  ['sunset-mountain-beautiful.jpg', 'sunset-peaks.jpg'],
  ['lofoten-sundown.jpg', 'lofoten.jpg'],
  ['mountain-winter-sun.jpg', 'mountain-dawn.jpg'],
  ['evening-landscape.jpg', 'copper-peak.jpg'],
  // 红档（神话）
  ['black-whole.jpg', 'blackhole.jpg'],
  ['dark-star.jpg', 'dark-star.jpg'],
  // 特殊
  ['moonlight.jpg', 'moonlight.jpg'],
  ['earth-from-moon.jpg', 'earthrise.jpg'],
]

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  let ok = 0
  let skip = 0
  let fail = 0
  for (const [src, out] of LIST) {
    const dest = resolve(OUT_DIR, out)
    if (existsSync(dest)) {
      skip++
      console.log(`= ${out}（已存在，跳过）`)
      continue
    }
    try {
      const res = await fetch(RAW(src), { signal: AbortSignal.timeout(60_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      await writeFile(dest, buf)
      ok++
      console.log(`✓ ${out}（${(buf.length / 1024).toFixed(0)} KB）`)
    } catch (e) {
      fail++
      console.error(`✗ ${out}: ${e instanceof Error ? e.message : e}`)
    }
  }
  console.log(`\n完成：成功 ${ok} · 跳过 ${skip} · 失败 ${fail}`)
  if (fail > 0) process.exitCode = 1
}

main()

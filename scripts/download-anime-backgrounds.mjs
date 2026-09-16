// ===== 动漫场景背景下载脚本（GitHub: l2a1n/wallpaper-bank） =====
// 用法: node scripts/download-anime-backgrounds.mjs
// 挑选原则：二次元风格「无人物、无版权角色」的纯场景图，适配 Live2D 立绘画框
// 下载原始图（多为 4K PNG）→ PowerShell System.Drawing 等比缩到最长边 1920 → JPEG(q85)
// 可重跑：目标 jpg 已存在则跳过下载与压缩

import { mkdir, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '../public/backgrounds')
const RAW_DIR = resolve(OUT_DIR, '_anime_raw')

const RAW = (f) => `https://raw.githubusercontent.com/l2a1n/wallpaper-bank/main/${encodeURIComponent(f)}`

/** [源文件名, 本地文件名（不含扩展名）] */
const LIST = [
  // 白档（uncommon）
  ['Pastel-Window.png', 'anime-pastel-window'],
  ['Staircase.png', 'anime-staircase'],
  ['Fantasy-Snow-Valley.png', 'anime-snow-valley'],
  // 蓝档（rare）
  ['Anime-Room.png', 'anime-room'],
  ['Fantasy-Autumn.png', 'anime-autumn'],
  ['Fantasy-Lake1.png', 'anime-lake'],
  ['Lofi-Cafe.jpg', 'anime-cafe'],
  // 紫档（epic）
  ['Manga-Shrine.png', 'anime-shrine'],
  ['City-Rainy-Night.png', 'anime-rain-city'],
  ['Fantasy-Landscape1.png', 'anime-fantasy-field'],
  ['Lofi-Urban-Nightscape.png', 'anime-urban-night'],
  // 金档（legendary）
  ['Anime-Fireworks.png', 'anime-fireworks'],
  ['Under_Starlit_Sky.png', 'anime-starlit'],
  ['Fantasy-Garden.png', 'anime-garden'],
]

/** PowerShell：单文件等比缩放（最长边 1920）+ JPEG q85（写入临时 .ps1 后以 -File 调用） */
const PS_SCRIPT = `
param([string]$Src, [string]$Dst)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($Src)
try {
  $max = 1920
  $w = $img.Width; $h = $img.Height
  if ($w -gt $h) { if ($w -gt $max) { $h = [int]($h * $max / $w); $w = $max } }
  else { if ($h -gt $max) { $w = [int]($w * $max / $h); $h = $max } }
  $bmp = New-Object System.Drawing.Bitmap([int]$w, [int]$h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($img, 0, 0, $w, $h)
  $g.Dispose()
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]85)
  $bmp.Save($Dst, $codec, $ep)
  $bmp.Dispose()
} finally { $img.Dispose() }
Write-Output "$($w)x$($h)"
`.trim()

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const pending = []
  let skip = 0
  for (const [src, out] of LIST) {
    if (existsSync(resolve(OUT_DIR, `${out}.jpg`))) {
      skip++
      console.log(`= ${out}.jpg（已存在，跳过）`)
      continue
    }
    pending.push([src, out])
  }
  if (pending.length === 0) {
    console.log('\n完成：全部已存在，无待处理项')
    return
  }

  await mkdir(RAW_DIR, { recursive: true })
  // PS 脚本写入原始图缓存目录，rm 时一并清理
  const psFile = resolve(RAW_DIR, '_optimize.ps1')
  await writeFile(psFile, PS_SCRIPT, 'utf8')
  const downloaded = []
  let fail = 0
  /** 带重试的下载（网络不稳，最多 4 次、间隔递增） */
  const fetchWithRetry = async (url) => {
    let lastErr
    for (let i = 0; i < 4; i++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(180_000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return Buffer.from(await res.arrayBuffer())
      } catch (e) {
        lastErr = e
        if (i < 3) await new Promise((r) => setTimeout(r, 3000 * (i + 1)))
      }
    }
    throw lastErr
  }
  for (const [src, out] of pending) {
    const rawPath = resolve(RAW_DIR, src)
    try {
      if (!existsSync(rawPath)) {
        const buf = await fetchWithRetry(RAW(src))
        await writeFile(rawPath, buf)
        console.log(`✓ 下载 ${src}（${(buf.length / 1024 / 1024).toFixed(1)} MB）`)
      } else {
        console.log(`= ${src}（原始文件已缓存）`)
      }
      downloaded.push([src, out])
    } catch (e) {
      fail++
      console.error(`✗ 下载 ${src}: ${e instanceof Error ? e.message : e}`)
    }
  }

  for (const [src, out] of downloaded) {
    const dst = resolve(OUT_DIR, `${out}.jpg`)
    try {
      const dim = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', psFile, '-Src', resolve(RAW_DIR, src), '-Dst', dst],
        { encoding: 'utf8', timeout: 120_000 },
      ).trim()
      console.log(`✓ 压缩 ${out}.jpg（${dim}）`)
    } catch (e) {
      fail++
      console.error(`✗ 压缩 ${src}: ${e instanceof Error ? e.message : e}`)
    }
  }

  await rm(RAW_DIR, { recursive: true, force: true })
  console.log(`\n完成：处理 ${downloaded.length - (fail - (pending.length - downloaded.length))} · 跳过 ${skip} · 失败 ${fail}`)
  if (fail > 0) process.exitCode = 1
}

main()

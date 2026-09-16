// ===== 下载 imuncle/live2d 仓库的 Cubism 2 精选模型（含全部衣服与动作） =====
// 用法: node scripts/download-imuncle-c2.mjs
// 源: https://github.com/imuncle/live2d 的 model/ 目录（Cubism 2，游戏/同人提取资源，仅限个人本地使用）
//
// 收录（演示页模型编号）:
//   27 纱雾 sagiri / 14 青叶 aoba(liang) / 33 尤莉 yuri / 48 薇尔莉特 Violet /
//   42 真白 mashiro（3 套衣服）/ 74 KP31·婚纱 kp31_310（普通+大破 2 套）
//
// 后处理（写入本地前修正，见 postProcess）:
//   - 删除 model.json 的 layout 字段（pixi-live2d-display 会把它应用为
//     localTransform 平移/非等比缩放，内容被挪出适配画布盒导致形象不可见）
//   - aoba: 删除 new_msg 组（引用不存在的 motions/ 路径，实际目录是 mtn/）
//   - kp31_310: 匿名动作组 "" 改名 "tap"（findTapGroup 才能命中 → 点击身体触发反应）
//
// 跳过: .DS_Store / voice/ / sound/（音频体积大且 pixi-live2d-display 不播放 motion sound）

import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DST_ROOT = resolve(__dirname, '../public/live2d')
const API = 'https://api.github.com/repos/imuncle/live2d/contents/model/'
const RAW = (dir, f) =>
  `https://raw.githubusercontent.com/imuncle/live2d/master/model/${dir
    .split('/')
    .map(encodeURIComponent)
    .join('/')}/${f.split('/').map(encodeURIComponent).join('/')}`

const HEADERS = { 'User-Agent': 'live2d-dl', Accept: 'application/vnd.github+json' }

/** 下载任务：源目录 → 本地目录 */
const TASKS = [
  { src: 'liang', dst: 'aoba' },               // 14 青叶
  { src: 'sagiri', dst: 'sagiri' },            // 27 纱雾
  { src: 'yuri', dst: 'yuri' },                // 33 尤莉
  { src: 'Violet', dst: 'violet' },            // 48 薇尔莉特
  { src: 'mashiro', dst: 'mashiro' },          // 42 真白（3 套衣服）
  { src: 'dollsfrontline/kp31_310', dst: 'kp31_310' }, // 74 KP31·婚纱（普通+大破）
]

const SKIP_DIRS = new Set(['voice', 'sound']) // 音频：体积大且运行时不播放
const SKIP_FILES = new Set(['.DS_Store'])

const fetchJson = async (url) => {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      if (i === 2) throw e
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)))
    }
  }
}

const fetchBin = async (url) => {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (e) {
      if (i === 3) throw e
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)))
    }
  }
}

/** model.json 后处理：删 layout / 修坏引用 / 匿名组改名 */
const postProcess = (dstId, cfg) => {
  delete cfg.layout
  if (dstId === 'aoba' && cfg.motions?.new_msg) {
    delete cfg.motions.new_msg // 引用不存在的 motions/ 路径
  }
  if (dstId.startsWith('kp31_310') && cfg.motions?.['']) {
    cfg.motions.tap = cfg.motions['']
    delete cfg.motions['']
  }
  return cfg
}

/** 递归列出目录下全部文件相对路径（跳过音频/.DS_Store） */
const listFiles = async (dir) => {
  const entries = await fetchJson(API + dir.split('/').map(encodeURIComponent).join('/'))
  if (!Array.isArray(entries)) throw new Error(`list ${dir}: ` + JSON.stringify(entries).slice(0, 120))
  const files = []
  for (const e of entries) {
    if (e.type === 'file') {
      if (!SKIP_FILES.has(e.name)) files.push(e.name)
    } else if (e.type === 'dir') {
      if (SKIP_DIRS.has(e.name)) continue
      for (const f of await listFiles(`${dir}/${e.name}`)) files.push(`${e.name}/${f}`)
    }
  }
  return files
}

async function main() {
  let ok = 0
  let skip = 0
  let fail = 0
  for (const { src, dst } of TASKS) {
    const dstDir = join(DST_ROOT, dst)
    try {
      const files = await listFiles(src)
      // 幂等：目标目录已有全部文件则跳过
      const missing = files.filter((f) => !existsSync(join(dstDir, f)))
      if (existsSync(dstDir) && missing.length === 0) {
        skip++
        console.log(`= ${dst}（${files.length} 文件，已存在）`)
        continue
      }
      console.log(`↓ ${dst} ← model/${src}（${files.length} 文件）`)
      for (const f of files) {
        const target = join(dstDir, f)
        if (existsSync(target)) continue
        mkdirSync(dirname(target), { recursive: true })
        // model.json：下载 → 后处理 → 写回
        if (/\.json$/i.test(f) && (f.includes('model') || f === '2.json' || f === '14.json')) {
          const text = await fetchBin(RAW(src, f))
          const cfg = JSON.parse(text.toString('utf8'))
          postProcess(dst, cfg)
          writeFileSync(target, JSON.stringify(cfg, null, 2))
        } else {
          writeFileSync(target, await fetchBin(RAW(src, f)))
        }
        ok++
        process.stdout.write('.')
      }
      console.log('')
    } catch (e) {
      fail++
      console.log(`\n✗ ${dst}: ${e.message}`)
    }
  }
  console.log(`\n完成: 新增 ${ok} · 跳过 ${skip} · 失败 ${fail}`)
}

main()

// ===== 补齐模型动作音频（model.json 引用的 sound/voice 文件） =====
// 用法: node scripts/download-model-voices.mjs
// 背景: download-imuncle-c2.mjs 当年跳过了 voice/ sound/（误以为运行时不播放）；
//       实际 pixi-live2d-display 原生支持 motion sound（config.sound 默认开启），
//       点击模型触发带 sound 的动作时会自动播放（点击即用户手势，满足自动播放策略）。
//
// 本脚本解析本地 model.json 中引用的音频路径，从 imuncle/live2d 下载到对应目录。
// 幂等：已存在且非空(>1KB)的文件跳过。
//
// 注意: 青叶(aoba)的语音原始文件是「1024零头+68杂项+MP3流」的非标准容器（非加密，
// 帧头 FF F3 70 7x 清晰可见），本脚本的 mp3 头校验会拒绝它们——青叶语音由专用脚本
// scripts/extract-aoba-voices.mjs 处理（剥离1092字节头+帧对齐校验）。

import { mkdirSync, writeFileSync, existsSync, statSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DST_ROOT = resolve(__dirname, '../public/live2d')
const HEADERS = { 'User-Agent': 'live2d-dl' }

/** 任务：本地模型目录 + json 文件名 → 仓库源目录（imuncle/live2d） */
const TASKS = [
  { dir: 'violet', json: '14.json', src: 'Violet' }, // 48 薇尔莉特（青叶见文件头注释）
]

const raw = (src, rel) =>
  `https://raw.githubusercontent.com/imuncle/live2d/master/model/${src}/${rel
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`

const fetchBin = async (url) => {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(120_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (e) {
      if (i === 3) throw e
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)))
    }
  }
}

/** 从 model.json 提取所有 motion 引用的 sound 相对路径 */
const soundRefs = (jsonPath) => {
  const cfg = JSON.parse(readFileSync(jsonPath, 'utf-8'))
  const refs = new Set()
  for (const group of Object.values(cfg.motions ?? {})) {
    for (const m of group ?? []) {
      if (typeof m.sound === 'string' && m.sound) refs.add(m.sound)
    }
  }
  return [...refs]
}

const run = async () => {
  let ok = 0
  let skip = 0
  const fails = []
  for (const t of TASKS) {
    const modelDir = join(DST_ROOT, t.dir)
    const refs = soundRefs(join(modelDir, t.json))
    if (refs.length === 0) {
      console.log(`[${t.dir}] model.json 未引用任何音频，跳过`)
      continue
    }
    console.log(`[${t.dir}] 需 ${refs.length} 个音频文件`)
    for (const rel of refs) {
      const dst = join(modelDir, rel)
      if (existsSync(dst) && statSync(dst).size > 1024) {
        skip++
        continue
      }
      try {
        const buf = await fetchBin(raw(t.src, rel))
        // mp3 校验: ID3v2 头或 MPEG 帧同步（防止把 404 HTML 页存成音频）
        const head = buf.subarray(0, 3)
        const isMp3 =
          buf.subarray(0, 3).toString('ascii') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)
        if (!isMp3) throw new Error('非 mp3 内容（可能 404）')
        mkdirSync(dirname(dst), { recursive: true })
        writeFileSync(dst, buf)
        ok++
        console.log(`  ✓ ${rel} (${(buf.length / 1024).toFixed(1)}KB)`)
      } catch (e) {
        fails.push(`${t.dir}/${rel}: ${e.message}`)
        console.log(`  ✗ ${rel}: ${e.message}`)
      }
    }
  }
  console.log(`\n完成: 下载 ${ok} / 跳过 ${skip} / 失败 ${fails.length}`)
  if (fails.length) {
    console.log(fails.map((f) => `  - ${f}`).join('\n'))
    process.exitCode = 1
  }
}

run()

// ===== 青叶语音提取：imuncle/live2d 原始文件 → 可播放 MP3 =====
// 用法: node scripts/extract-aoba-voices.mjs
//
// 原始文件结构（逆向分析结论）:
//   [0, 1024)      全零头（提取工具置零的原容器头）
//   [1024, 1092)   68 字节杂项（每文件不同，疑似加密元数据/半帧，弃置）
//   [1092, ...)    纯 MP3 流：MPEG-2 Layer III 56kbps 22050Hz joint-stereo，
//                  padding=0 → 每帧恰好 182 字节（帧头 FF F3 70 7x 周期出现）
// 处理: 剥离前 1092 字节，校验 182 字节帧对齐，尾部截齐到完整帧。
// 幂等: 目标已存在则跳过（--force 强制重跑）。
import { readdirSync, readFileSync, writeFileSync, rmSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DST = resolve(__dirname, '../public/live2d/aoba/voice')
const CACHE = join(tmpdir(), 'aoba-voices') // 原始文件缓存（download-model-voices.mjs 或本脚本下载）
const FORCE = process.argv.includes('--force')

const RAW = 'https://cdn.jsdelivr.net/gh/imuncle/live2d@master/model/liang/voice/'
const NAMES = [
  10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170,
  180, 190, 200, 210, 220, 230, 240, 250, 260, 270, 280, 290, 300, 310, 320, 330, 340,
].map((id) => `400170${String(id).padStart(3, '0')}.mp3`)

const FRAME = 182 // MPEG2 L3: floor(72×56000/22050) = 182，padding=0
const HEADER = 1024 + 68

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

mkdirSync(CACHE, { recursive: true })
mkdirSync(DST, { recursive: true })
if (FORCE) for (const f of readdirSync(DST)) rmSync(join(DST, f))

let ok = 0
let skip = 0
const fails = []
for (const name of NAMES) {
  const dst = join(DST, name)
  if (!FORCE && existsSync(dst) && statSync(dst).size > 1024) {
    skip++
    continue
  }
  // 缓存优先，其次下载
  const cachePath = join(CACHE, name)
  let raw
  if (existsSync(cachePath) && statSync(cachePath).size > 1024) {
    raw = readFileSync(cachePath)
  } else {
    raw = await fetchBin(RAW + name)
    writeFileSync(cachePath, raw)
  }
  const data = raw.subarray(HEADER)
  // 校验：首帧必须是 FF F3 70 7x
  if (!(data[0] === 0xff && data[1] === 0xf3 && data[2] === 0x70 && (data[3] & 0xf0) === 0x70)) {
    fails.push(`${name}: 首帧头异常`)
    continue
  }
  // 帧对齐扫描：每182字节应出现帧头（允许填充位差异 0x70/0x72）
  let frames = 0
  let end = 0
  for (let off = 0; off + 4 <= data.length; off += FRAME) {
    if (data[off] === 0xff && data[off + 1] === 0xf3 && (data[off + 2] & 0xfe) === 0x70) {
      frames++
      end = off + FRAME
    }
  }
  writeFileSync(dst, data.subarray(0, end))
  ok++
  console.log(`${name}: ${frames}帧 ${((frames * 576) / 22050).toFixed(2)}s`)
}
console.log(`\n完成: 提取 ${ok} / 跳过 ${skip} / 失败 ${fails.length}${fails.length ? '\n  ' + fails.join('\n  ') : ''}`)
if (fails.length) process.exitCode = 1

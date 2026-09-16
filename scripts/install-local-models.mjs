// ===== 安装本地 Live2D 模型包到 public/live2d/ =====
// 用法: node scripts/install-local-models.mjs
// 从 .live2d_extract/（zip/rar 解压产物）复制到 public/live2d/{id}/，
// 统一重命名为英文文件名（避免 URL 编码问题），并重写 model3.json 内部引用。
// 重复包已人工筛除（ANIYA-walk / 镜流_Jingliu_ / tingyun (1) / Allium企划 无有效模型）。

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC_ROOT = resolve(__dirname, '../.live2d_extract')
const DST_ROOT = resolve(__dirname, '../public/live2d')

/** 模型清单：源目录（相对 SRC_ROOT）→ 目标 id + 文件名替换规则（中文名 → 英文名） */
const MODELS = [
  { src: '11月椿/椿', id: 'tsubaki', label: '椿', replaces: [['椿', 'tsubaki']] },
  { src: 'Alexia/Alexia', id: 'alexia', label: 'Alexia', replaces: [] },
  { src: 'ANIYA/ANIYA', id: 'aniya', label: 'ANIYA', replaces: [] },
  { src: 'Nicole/Nicole', id: 'nicole', label: '妮可', replaces: [] },
  { src: 'tingyun/tingyun', id: 'tingyun', label: '停云', replaces: [['停云', 'tingyun']] },
  { src: '免费模型艾莲/免费模型艾莲', id: 'ellen', label: '艾莲', replaces: [['免费模型艾莲', 'ellen']] },
  { src: '符玄/符玄', id: 'fuxuan', label: '符玄', replaces: [['符玄', 'fuxuan']] },
  { src: '镜流/镜流', id: 'jingliu', label: '镜流', replaces: [['镜流', 'jingliu']] },
  { src: '长离带水印/长离带水印', id: 'changli', label: '长离', replaces: [['长离', 'changli']] },
  { src: '阮梅_Ruan_Mei__2_/阮梅 Ruan Mei/阮梅 RuanMei', id: 'ruanmei', label: '阮梅', replaces: [['1208阮梅1-12.20 - 动画', 'ruanmei']] },
]

/** 无关文件（VTube Studio 配置 / 说明文档 / 内嵌压缩包 / 工程残留） */
const JUNK = ['.vtube.json', 'items_pinned_to_model.json', '.txt', '.zip', '.rar', '.psd', '.cmo3', '.can3']

const applyReplaces = (name, replaces) => {
  let out = name
  for (const [from, to] of replaces) out = out.split(from).join(to)
  return out
}

const copyTree = (srcDir, dstDir, replaces) => {
  mkdirSync(dstDir, { recursive: true })
  let copied = 0
  let skipped = 0
  for (const e of readdirSync(srcDir, { withFileTypes: true })) {
    if (JUNK.some((j) => e.name.endsWith(j))) {
      skipped++
      continue
    }
    const srcPath = join(srcDir, e.name)
    // 目标名做替换（文件与目录统一）；"aniya idle" 等已有空格名保留
    const dstName = applyReplaces(e.name, replaces)
    const dstPath = join(dstDir, dstName)
    if (e.isDirectory()) {
      const r = copyTree(srcPath, dstPath, replaces)
      copied += r.copied
      skipped += r.skipped
    } else {
      execSync(`copy /y "${srcPath}" "${dstPath}" >nul`, { shell: 'cmd.exe' })
      copied++
    }
  }
  return { copied, skipped }
}

let totalOk = 0
for (const m of MODELS) {
  const srcDir = join(SRC_ROOT, m.src)
  if (!existsSync(srcDir)) {
    console.error(`✗ ${m.id}: 源目录不存在 ${m.src}`)
    continue
  }
  const dstDir = join(DST_ROOT, m.id)
  if (existsSync(dstDir)) {
    console.log(`= ${m.id}（已存在，跳过）`)
    totalOk++
    continue
  }
  const { copied, skipped } = copyTree(srcDir, dstDir, m.replaces)

  // 重写 json 内部引用（把引用路径中的中文名替换为英文）+ 删除 Layout 字段
  let jsonName = null
  const walk = (p) => {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const full = join(p, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('.model3.json')) {
        let text = readFileSync(full, 'utf8')
        for (const [from, to] of m.replaces) text = text.split(from).join(to)
        let cfg
        try {
          cfg = JSON.parse(text)
        } catch (err) {
          console.error(`  ! ${m.id}/${e.name} JSON 解析失败: ${err.message}`)
          continue
        }
        delete cfg.Layout // Cubism 2 教训：layout 字段导致 localTransform 错位（C3 同理防御）
        writeFileSync(full, JSON.stringify(cfg, null, 2))
        if (!jsonName) jsonName = e.name
      }
    }
  }
  walk(dstDir)

  // 找到入口 json（可能被重命名过）
  let entry = null
  const findEntry = (p) => {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const full = join(p, e.name)
      if (e.isDirectory()) {
        const r = findEntry(full)
        if (r) return r
      } else if (e.name.endsWith('.model3.json')) return full
    }
    return null
  }
  entry = findEntry(dstDir)

  if (!entry) {
    console.error(`✗ ${m.id}: 未找到 model3.json`)
    rmSync(dstDir, { recursive: true, force: true })
    continue
  }
  const sizeMB = (() => {
    let s = 0
    const w = (p) => {
      for (const e of readdirSync(p, { withFileTypes: true })) {
        const full = join(p, e.name)
        if (e.isDirectory()) w(full)
        else s += statSync(full).size
      }
    }
    w(dstDir)
    return (s / 1024 / 1024).toFixed(1)
  })()
  console.log(`✓ ${m.id}（${m.label}）· ${copied} 文件 · ${sizeMB}MB · 入口 ${entry.replace(DST_ROOT + '\\', '')}${skipped ? ` · 剔除 ${skipped} 杂项` : ''}`)
  totalOk++
}
console.log(`\n完成：${totalOk}/${MODELS.length}`)

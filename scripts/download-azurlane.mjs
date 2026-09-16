// ===== 下载 imuncle/live2d 仓库的碧蓝航线 Cubism 3 模型 =====
// 用法: node scripts/download-azurlane.mjs
// 源: https://github.com/imuncle/live2d 的 live2d_3/model/Azue Lane(JP)/
// 下载到 public/live2d/al_{id}/（al_ 前缀 = Azur Lane）

import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DST_ROOT = resolve(__dirname, '../public/live2d')
const API = 'https://api.github.com/repos/imuncle/live2d/contents/live2d_3/model/Azue%20Lane%28JP%29'
const RAW = (m, f) => `https://raw.githubusercontent.com/imuncle/live2d/master/live2d_3/model/Azue%20Lane(JP)/${encodeURIComponent(m)}/${f.split('/').map(encodeURIComponent).join('/')}`

const HEADERS = { 'User-Agent': 'live2d-dl', Accept: 'application/vnd.github+json' }

/** 模型目录拼音 → 中文名对照（碧蓝航线日服舰娘） */
const NAME_MAP = {
  aidang_2: '爱宕', aierdeliqi_4: '阿尔及利亚', aierdeliqi_5: '阿尔及利亚·改', aimierbeierding_2: '埃米尔·贝尔坦',
  banrenma_2: '半人马', beierfasite_2: '贝尔法斯特', biaoqiang: '标枪', biaoqiang_3: '标枪·改',
  bisimai_2: '俾斯麦', chuixue_3: '吹雪', dafeng_2: '大凤', deyizhi_3: '德意志',
  dujiaoshou_4: '独角兽', dunkeerke_2: '敦刻尔克', genaisennao_2: '根纳森瑙', heitaizi_2: '黑太子',
  huangjiafangzhou_3: '皇家方舟', huonululu_3: '火奴鲁鲁', huonululu_5: '火奴鲁鲁·改', kelifulan_3: '克利夫兰',
  lafei: '拉菲', lafei_4: '拉菲·改', lingbo: '绫波', mingshi: '明石', ninghai_4: '宁海',
  pinghai_4: '平海', qibolin_2: '齐柏林', shengluyisi_2: '圣路易斯', shengluyisi_3: '圣路易斯·改',
  sipeibojue_5: '斯佩伯爵', taiyuan_2: '太原', tianlangxing_3: '天狼星', tierbici_2: '提尔比茨',
  xianghe_2: '翔鹤', xixuegui_4: '吸血鬼', xuefeng: '雪风', yichui_2: '伊吹',
  z23: 'Z23', z46_2: 'Z46', zhala_2: '扎拉',
}

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

async function main() {
  const models = (await fetchJson(API))
    .filter((e) => e.type === 'dir')
    .map((e) => e.name)
  console.log(`发现 ${models.length} 个碧蓝航线模型`)

  let ok = 0
  let skip = 0
  let fail = 0
  for (const m of models) {
    const id = `al_${m}`
    const dst = join(DST_ROOT, id)
    const label = NAME_MAP[m] ?? m
    // 幂等：已存在且含 model3.json 则跳过
    if (existsSync(dst)) {
      const hasEntry = readdirSync(dst).some((f) => f.endsWith('.model3.json'))
      if (hasEntry) {
        skip++
        console.log(`= ${id}（${label}，已存在）`)
        continue
      }
    }
    try {
      // 列出模型目录文件（motions/textures 为子目录，需递归）
      const files = []
      const list = async (dirPrefix, apiPath) => {
        const entries = await fetchJson(apiPath)
        for (const e of entries) {
          if (e.type === 'file') files.push({ rel: dirPrefix + e.name, size: e.size })
          else await list(dirPrefix + e.name + '/', e.url)
        }
      }
      await list('', `${API}/${encodeURIComponent(m)}`)
      mkdirSync(dst, { recursive: true })
      let bytes = 0
      for (const f of files) {
        const target = join(dst, f.rel)
        mkdirSync(dirname(target), { recursive: true })
        const buf = await fetchBin(RAW(m, f.rel))
        writeFileSync(target, buf)
        bytes += buf.length
      }
      // 校验 moc3 版本 ≤5（Core 兼容）
      const moc = files.find((f) => f.rel.endsWith('.moc3'))
      let verNote = ''
      if (moc) {
        const b = readFileSync(join(dst, moc.rel))
        if (b[4] > 5) verNote = ` · ⚠ moc3 v${b[4]} 超出 Core 支持范围`
      }
      ok++
      console.log(`✓ ${id}（${label}）· ${files.length} 文件 · ${(bytes / 1024 / 1024).toFixed(1)}MB${verNote}`)
    } catch (e) {
      fail++
      console.error(`✗ ${id}（${label}）: ${e instanceof Error ? e.message : e}`)
    }
  }
  console.log(`\n完成：成功 ${ok} · 跳过 ${skip} · 失败 ${fail}`)
}

main()

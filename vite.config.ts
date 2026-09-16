import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

/** 存档自动落盘：前端每次保存时 POST 到 /api/save-backup，写入项目 saves/ 目录。
 *  latest.json 每次覆盖；另外每 30 分钟最多留一个时间戳快照，保留最近 20 份。
 *  GET /api/save-backup 返回 latest.json（启动时的主存档源，IndexedDB 兜底）。
 *  防覆盖护栏：新存档 totalXp 不足现有的一半（且现有 >2000）时判定为异常小档
 *  （如浏览器 IDB 损坏后以默认档启动的实例），隔离到 suspect-*.json 而非覆盖。 */
const saveBackupPlugin = (): Plugin => ({
  name: 'save-backup',
  configureServer(server) {
    const dir = path.resolve(process.cwd(), 'saves')
    const latestPath = path.join(dir, 'latest.json')
    const SNAP_INTERVAL = 30 * 60 * 1000
    let lastSnap = 0
    const pad = (n: number) => String(n).padStart(2, '0')
    const stampOf = (t: number) => {
      const d = new Date(t)
      return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
    }
    server.middlewares.use('/api/save-backup', (req, res) => {
      if (req.method === 'GET') {
        fs.readFile(latestPath, 'utf8', (err, data) => {
          if (err) {
            res.statusCode = 404
            res.end()
            return
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(data)
        })
        return
      }
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      const force = (req.url ?? '').includes('force=1')
      let body = ''
      req.on('data', (c: Buffer) => (body += c.toString()))
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body) // 校验合法 JSON 再落盘
          fs.mkdirSync(dir, { recursive: true })
          // 防覆盖护栏
          if (!force && fs.existsSync(latestPath)) {
            try {
              const old = JSON.parse(fs.readFileSync(latestPath, 'utf8'))
              const oldXp = old?.player?.totalXp ?? 0
              const newXp = parsed?.player?.totalXp ?? 0
              if (oldXp > 2000 && newXp < oldXp * 0.5) {
                fs.writeFileSync(path.join(dir, `suspect-${stampOf(Date.now())}.json`), body)
                res.statusCode = 200
                res.end('quarantined')
                return
              }
            } catch {
              /* 旧 latest.json 损坏则直接覆盖 */
            }
          }
          fs.writeFileSync(latestPath, body)
          const now = Date.now()
          if (now - lastSnap >= SNAP_INTERVAL) {
            lastSnap = now
            fs.writeFileSync(path.join(dir, `backup-${stampOf(now)}.json`), body)
            // 只保留最近 20 份快照
            const snaps = fs
              .readdirSync(dir)
              .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
              .sort()
            for (const f of snaps.slice(0, Math.max(0, snaps.length - 20))) {
              fs.rmSync(path.join(dir, f))
            }
          }
          res.statusCode = 200
          res.end('ok')
        } catch {
          res.statusCode = 400
          res.end('bad json')
        }
      })
    })
  },
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const glmKey = env.GLM_API_KEY ?? ''
  return {
    plugins: [react(), saveBackupPlugin()],
    // echarts 走运行时动态 import（首屏不加载），若不预构建，
    // Vite 会在首次访问时才发现新依赖并触发 re-optimize + reload，
    // 旧模块图半新半旧时会以 ESM 加载 CJS react 报 "no export named 'default'"
    optimizeDeps: {
      include: ['echarts'],
    },
    build: {
      rollupOptions: {
        output: {
          // 重库手动分包：避免单 chunk 超 3MB（原主 bundle 警告）；各库被多页面共享时也不会重复打包
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (id.includes('echarts') || id.includes('zrender')) return 'echarts'
              if (id.includes('three') || id.includes('@pixiv')) return 'three-vrm'
              // pixi-live2d-display 必须独立成 chunk：其模块顶层校验 window.Live2D，
              // 若与静态导入的 pixi.js 合包，会在核心脚本加载前随入口求值而抛错
              if (id.includes('pixi-live2d-display')) return 'live2d-display'
              if (id.includes('pixi.js')) return 'pixi-live2d'
              if (id.includes('simple-mind-map')) return 'mindmap'
              if (id.includes('react') || id.includes('scheduler')) return 'react-vendor'
            }
          },
        },
      },
    },
    server: {
      port: 5014,
      open: false,
      proxy: {
        // 浏览器请求 /glm-api/* → 转发到智谱 API，注入 Authorization 头
        '/glm-api': {
          target: 'https://open.bigmodel.cn',
          changeOrigin: true,
          // GLM 编程套餐的 OpenAI 兼容端点（与 openclaw 等工具同一通道）：
          // 套餐额度只在此端点生效；标准 /api/paas/v4 按量计费，会报 1113
          rewrite: (path) => path.replace(/^\/glm-api/, '/api/coding/paas/v4'),
          headers: {
            Authorization: `Bearer ${glmKey}`,
          },
        },
      },
    },
  }
})

/**
 * BOSS 引擎 + 里程碑多关联 API 级验证（vite ssrLoadModule 加载真实 TS 模块）
 * 运行：node scripts/verify-boss-retro.mjs
 */
import { createServer } from 'vite'

// 浏览器全局 stub（live2dModels 等模块顶层依赖 localStorage）
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
globalThis.window = { Live2D: {} }

const server = await createServer({
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

let failed = 0
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failed++
    console.error(`  ✗ ${name} ${detail}`)
  }
}

try {
  const boss = await server.ssrLoadModule('/src/engine/bossEngine.ts')
  const ms = await server.ssrLoadModule('/src/engine/milestoneEngine.ts')
  const bossConfig = await server.ssrLoadModule('/src/config/bossConfig.ts')

  console.log('== bossEngine ==')
  const week = boss.isoWeekKey()
  ok('isoWeekKey 格式 YYYY-Www', /^\d{4}-W\d{2}$/.test(week), week)

  // 固定血量
  const s1 = boss.createBossState(1)
  ok('第 1 届 HP=9600（20h × 480）', s1.hp === 9600 && s1.maxHp === 9600, `hp=${s1.hp}`)
  ok('第 1 届 bossId=varoth', s1.bossId === 'boss_varoth', s1.bossId)
  const s10 = boss.createBossState(10)
  ok('第 10 届 HP=16800（35h × 480 封顶）', s10.maxHp === 16800, `hp=${s10.maxHp}`)
  const s5 = boss.createBossState(5)
  ok('第 5 届 HP=12800 线性爬坡', s5.maxHp === Math.round((20 + (15 * 4) / 9) * 480), `hp=${s5.maxHp}`)

  const state1 = { player: { unlockedItems: [] }, milestones: [], bossState: s1 }
  const d1 = boss.applyBossDamage(state1, 200)
  ok('伤害 200 → hp=9400', d1.state.bossState.hp === 9400, `hp=${d1.state.bossState.hp}`)
  ok('totalDamage 累计', d1.state.bossState.totalDamage === 200)

  const d2 = boss.applyBossDamage(d1.state, s1.hp)
  ok('超杀击杀（伤害封顶至剩余 HP）', d2.damage === 9400 && d2.killed === true, `damage=${d2.damage}`)
  ok('击杀置 killedAt', !!d2.state.bossState.killedAt)

  const d3 = boss.applyBossDamage(d2.state, 100)
  ok('击杀后不再受伤', d3.damage === 0 && d3.state.bossState.hp === 0)

  // 周刷新
  const stale = { ...state1, bossState: { ...s1, weekKey: '2020-W01' } }
  const r1 = boss.rolloverBossIfNeeded(stale)
  ok('跨周归档 + 新一届 stage=2', r1.rolledOver && r1.state.bossState.stage === 2)
  ok('归档战报 killed=false', r1.state.bossState.history[0].killed === false)
  ok('新届 HP=10400（21.67h × 480）', r1.state.bossState.maxHp === 10400, `hp=${r1.state.bossState.maxHp}`)
  const r2 = boss.rolloverBossIfNeeded(r1.state)
  ok('同周不重复刷新', !r2.rolledOver)

  const noBoss = { player: {}, milestones: [] }
  const r3 = boss.rolloverBossIfNeeded(noBoss)
  ok('旧档迁移创建第 1 届', r3.rolledOver && r3.state.bossState.stage === 1)

  // 击杀奖励
  const rw = boss.bossKillRewards(3, [])
  ok('击杀金币 150+stage×50', rw.coins === 300, `coins=${rw.coins}`)
  ok('掉落稀有度紫以上', ['purple', 'gold', 'red'].includes(rw.loot?.rarity ?? ''), String(rw.loot?.rarity))
  ok('掉落为背景或服饰', ['background', 'outfit'].includes(rw.loot?.item?.category ?? ''), String(rw.loot?.item?.category))
  const rwDup = boss.bossKillRewards(3, [])
  // 随机抽取：多次采样中应存在重复折算与非重复两种结果
  let sawConverted = false
  let sawFresh = false
  const seen = new Set([rw.loot.item.id])
  for (let i = 0; i < 30 && !(sawConverted && sawFresh); i++) {
    const r = boss.bossKillRewards(3, [...seen])
    if (r.loot.convertedCoins && r.loot.convertedCoins > 0) sawConverted = true
    if (!r.loot.convertedCoins) {
      sawFresh = true
      seen.add(r.loot.item.id)
    }
  }
  ok('重复掉落可折算金币（多次采样）', sawConverted)
  ok('非重复掉落不折算', sawFresh)

  console.log('== milestoneEngine 多关联 + 单次限制 ==')
  const msList = [
    { id: 'a', goal: 'A', metric: { kind: 'time', target: 600 }, linkedMinutes: 0 },
    { id: 'b', goal: 'B', metric: { kind: 'time', target: 600 }, linkedMinutes: 0, limits: { minPerSession: 30 } },
    { id: 'c', goal: 'C', metric: { kind: 'time', target: 600 }, linkedMinutes: 0, limits: { maxPerSession: 60 } },
    { id: 'd', goal: 'D', metric: { kind: 'time', target: 600 }, linkedMinutes: 0, limits: { minPerSession: 30, maxPerSession: 60 } },
  ]
  const res = ms.addLinkedMinutes(msList, ['a', 'b', 'c', 'd'], 25)
  const by = (id) => res.milestones.find((m) => m.id === id)
  ok('无限制目标计入 25', by('a').linkedMinutes === 25)
  ok('低于下限不计入', by('b').linkedMinutes === 0)
  ok('低于上限正常计入', by('c').linkedMinutes === 25)
  ok('min+max：低于下限不计入', by('d').linkedMinutes === 0)
  ok('notes 含未计入提示', res.notes.some((n) => n.includes('未达单次下限')), JSON.stringify(res.notes))

  const res2 = ms.addLinkedMinutes(res.milestones, ['a', 'b', 'c', 'd'], 90)
  const by2 = (id) => res2.milestones.find((m) => m.id === id)
  ok('无限制累计 25+90', by2('a').linkedMinutes === 115)
  ok('下限达成计入 90', by2('b').linkedMinutes === 90)
  ok('超上限封顶 60', by2('c').linkedMinutes === 25 + 60, String(by2('c').linkedMinutes))
  ok('min+max 封顶 60', by2('d').linkedMinutes === 60)
  ok('notes 含封顶提示', res2.notes.some((n) => n.includes('按单次上限')), JSON.stringify(res2.notes))

  const res3 = ms.addLinkedMinutes(msList, [], 30)
  ok('空关联不变', res3.milestones === msList)

  console.log('== bossConfig ==')
  ok('HP 封顶 16800（第 20 届）', bossConfig.bossMaxHp(20) === 16800, String(bossConfig.bossMaxHp(20)))
  ok('图鉴循环复用', bossConfig.bossForStage(11).id === bossConfig.bossForStage(1).id)
  ok('第 1 届 HP=9600', bossConfig.bossMaxHp(1) === 9600, String(bossConfig.bossMaxHp(1)))

  console.log(failed === 0 ? '\nALL PASS' : `\nFAILED: ${failed}`)
} finally {
  await server.close()
}
process.exit(failed === 0 ? 0 : 1)

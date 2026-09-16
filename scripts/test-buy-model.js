(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const coinsBefore = (document.body.textContent.match(/💰\s*(\d+)/) || [])[1]
  // 找到雫的卡片并购买
  const cards = Array.from(document.querySelectorAll('.rpg-panel')).filter((p) => /Cubism/.test(p.textContent || ''))
  const target = cards.find((c) => (c.textContent || '').includes('雫'))
  if (!target) return 'FAIL: 雫 card not found'
  const btn = Array.from(target.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === '购买')
  if (!btn) return 'FAIL: no buy button (already owned?)'
  btn.click()
  await sleep(1500)
  // 重新检查卡片状态 + toast
  const cards2 = Array.from(document.querySelectorAll('.rpg-panel')).filter((p) => /Cubism/.test(p.textContent || ''))
  const t2 = cards2.find((c) => (c.textContent || '').includes('雫'))
  const toast = (document.body.textContent.match(/购买成功[^！]*！/) || [''])[0]
  const coinsAfter = (document.body.textContent.match(/💰\s*(\d+)/) || [])[1]
  return JSON.stringify({ coinsBefore, coinsAfter, nowOwned: t2 ? (t2.textContent || '').includes('已拥有') : null, toast })
})()

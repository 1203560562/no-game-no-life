(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const chips = Array.from(document.querySelectorAll('button'))
  const modelChip = chips.find((b) => (b.textContent || '').includes('形象'))
  if (!modelChip) return 'FAIL: no 形象 tab'
  modelChip.click()
  await sleep(800)
  const cards = Array.from(document.querySelectorAll('.rpg-panel')).filter((p) =>
    /Cubism/.test(p.textContent || ''),
  )
  const names = cards.map((c) => ({
    name: (c.querySelector('.text-white')?.textContent || '').trim(),
    owned: (c.textContent || '').includes('已拥有'),
  }))
  return JSON.stringify({ cardCount: cards.length, names })
})()

(() => {
  const coins = (document.body.textContent.match(/💰\s*([\d,]+)/) || [])[1]
  const cards = Array.from(document.querySelectorAll('.rpg-panel')).filter((p) => /Cubism/.test(p.textContent || ''))
  const t = cards.find((c) => (c.textContent || '').includes('雫'))
  return JSON.stringify({
    coins,
    shizukuCard: t ? (t.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) : null,
    buttons: t ? Array.from(t.querySelectorAll('button, div')).map((b) => (b.textContent || '').trim()).filter(Boolean) : [],
  })
})()

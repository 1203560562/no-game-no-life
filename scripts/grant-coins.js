(async () => {
  const req = indexedDB.open('life-rpg')
  const db = await new Promise((r) => {
    req.onsuccess = () => r(req.result)
  })
  const tx = db.transaction('state', 'readwrite')
  const store = tx.objectStore('state')
  const state = await new Promise((r) => {
    const q = store.get('app-state')
    q.onsuccess = () => r(q.result)
  })
  if (!state?.player) return 'FAIL: no state'
  const before = state.player.coins
  state.player.coins = (before ?? 0) + 20000
  await new Promise((r) => {
    const q = store.put(state, 'app-state')
    q.onsuccess = r
  })
  return 'coins: ' + before + ' -> ' + state.player.coins
})()

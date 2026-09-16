(async () => {
  const req = indexedDB.open('life-rpg')
  const db = await new Promise((r) => {
    req.onsuccess = () => r(req.result)
  })
  const names = Array.from(db.objectStoreNames)
  const out = { stores: names }
  for (const n of names) {
    const tx = db.transaction(n, 'readonly')
    const keys = await new Promise((r) => {
      const q = tx.objectStore(n).getAllKeys()
      q.onsuccess = () => r(q.result)
    })
    out[n + ' keys'] = keys
  }
  return JSON.stringify(out)
})()

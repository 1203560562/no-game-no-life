import { openDB, type IDBPDatabase } from 'idb'
import type { AppState } from '../types'

const DB_NAME = 'life-rpg'
const DB_VERSION = 1
const STORE = 'state'

let dbPromise: Promise<IDBPDatabase> | null = null

const getDb = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE)
        }
      },
    })
  }
  return dbPromise
}

const STATE_KEY = 'app-state'

export const loadState = async (): Promise<AppState | null> => {
  const db = await getDb()
  const state = (await db.get(STORE, STATE_KEY)) as AppState | undefined
  return state ?? null
}

export const saveState = async (state: AppState): Promise<void> => {
  const db = await getDb()
  await db.put(STORE, state, STATE_KEY)
}

export const clearState = async (): Promise<void> => {
  const db = await getDb()
  await db.delete(STORE, STATE_KEY)
}

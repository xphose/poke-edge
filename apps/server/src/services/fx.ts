import type Database from 'better-sqlite3'
import { fetchWithRetry } from '../util/http.js'
import { getCached, setCached } from './cache.js'

/** EUR per USD for CardMarket arbitrage (Frankfurter free API). */
export async function getEurPerUsd(db: Database.Database): Promise<number> {
  const key = 'fx:EUR_USD'
  const hit = getCached(db, key) as { rate: number } | null
  if (hit?.rate) return hit.rate

  try {
    const res = await fetchWithRetry('https://api.frankfurter.app/latest?from=USD&to=EUR')
    if (!res.ok) return 0.92
    const j = (await res.json()) as { rates?: { EUR?: number } }
    const rate = j.rates?.EUR ?? 0.92
    setCached(db, key, { rate }, 24 * 60 * 60 * 1000)
    return rate
  } catch {
    return 0.92
  }
}

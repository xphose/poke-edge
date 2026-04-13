import type Database from 'better-sqlite3'
import { config } from '../config.js'
import { fetchWithRetry } from '../util/http.js'

async function getApplicationToken(): Promise<string | null> {
  if (!config.ebayClientId || !config.ebayClientSecret) return null
  const host =
    config.ebayEnvironment === 'sandbox'
      ? 'https://api.sandbox.ebay.com'
      : 'https://api.ebay.com'
  const creds = Buffer.from(`${config.ebayClientId}:${config.ebayClientSecret}`).toString('base64')
  const res = await fetchWithRetry(`${host}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  })
  if (!res.ok) return null
  const j = (await res.json()) as { access_token?: string }
  return j.access_token ?? null
}

/** Median of **active** Buy API results as a free-tier proxy (not sold comps). */
export async function fetchEbayMedianPrice(query: string): Promise<number | null> {
  const token = await getApplicationToken()
  if (!token) return null
  const host =
    config.ebayEnvironment === 'sandbox'
      ? 'https://api.sandbox.ebay.com'
      : 'https://api.ebay.com'
  const q = encodeURIComponent(query)
  const url = `${host}/buy/browse/v1/item_summary/search?q=${q}&limit=20`
  const res = await fetchWithRetry(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    },
  })
  if (!res.ok) return null
  const data = (await res.json()) as {
    itemSummaries?: { price?: { value?: string } }[]
  }
  const prices = (data.itemSummaries ?? [])
    .map((i) => Number(i.price?.value))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)
  if (!prices.length) return null
  const mid = Math.floor(prices.length / 2)
  return prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2
}

function extractNumber(cardId: string): string {
  const idx = cardId.lastIndexOf('-')
  return idx >= 0 ? cardId.slice(idx + 1) : cardId
}

export function buildEbayCardQuery(name: string, cardId: string, setName: string | null): string {
  const num = extractNumber(cardId)
  const parts = [name, num]
  if (setName) parts.push(setName)
  parts.push('pokemon card')
  return parts.join(' ')
}

export async function refreshEbayMediansForCards(db: Database.Database, limit = 80) {
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.market_price, s.name AS set_name
       FROM cards c
       LEFT JOIN sets s ON c.set_id = s.id
       WHERE c.market_price IS NOT NULL
       ORDER BY c.market_price DESC LIMIT ?`,
    )
    .all(limit) as { id: string; name: string; market_price: number; set_name: string | null }[]

  const stmt = db.prepare(`UPDATE cards SET ebay_median = ? WHERE id = ?`)
  for (const r of rows) {
    const q = buildEbayCardQuery(r.name, r.id, r.set_name)
    const med = await fetchEbayMedianPrice(q)
    if (med != null) stmt.run(med, r.id)
    await new Promise((res) => setTimeout(res, 400))
  }
}

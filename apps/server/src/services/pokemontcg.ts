import type Database from 'better-sqlite3'
import { config } from '../config.js'
import { getDb } from '../db/connection.js'
import { fetchWithRetry } from '../util/http.js'
import { getCached, setCached, TTL_4H } from './cache.js'

const HEADERS = () => {
  const h: Record<string, string> = { Accept: 'application/json' }
  if (config.pokemonTcgApiKey) h['X-Api-Key'] = config.pokemonTcgApiKey
  return h
}

async function ptcgGet<T>(path: string, query = ''): Promise<T> {
  const url = `${config.pokemonTcgBase}${path}${query}`
  const cacheKey = `GET:${url}`
  let db: Database.Database | null = null
  try {
    db = getDb()
  } catch {
    db = null
  }
  if (db) {
    const hit = getCached(db, cacheKey)
    if (hit) return hit as T
  }
  const res = await fetchWithRetry(url, { headers: HEADERS() })
  if (!res.ok) throw new Error(`PokémonTCG.io ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as T
  if (db) setCached(db, cacheKey, json, TTL_4H)
  return json
}

export async function fetchSet(setId: string) {
  type R = { data: Record<string, unknown> }
  return ptcgGet<R>(`/sets/${setId}`)
}

export async function fetchAllTargetSets() {
  const found: Record<string, unknown>[] = []
  for (const id of config.targetSetIds) {
    try {
      const r = await fetchSet(id)
      found.push(r.data as Record<string, unknown>)
    } catch {
      /* set may not exist yet */
    }
  }
  return found
}

function tcgplayerMarket(card: Record<string, unknown>): number | null {
  const tcg = card.tcgplayer as Record<string, unknown> | undefined
  if (!tcg) return null
  const prices = tcg.prices as Record<string, Record<string, number>> | undefined
  if (!prices) return null
  for (const k of Object.keys(prices)) {
    const p = prices[k]
    if (p && typeof p.market === 'number' && p.market > 0) return p.market
    if (p && typeof p.mid === 'number' && p.mid > 0) return p.mid
  }
  return null
}

function imageUrl(card: Record<string, unknown>): string {
  const images = card.images as { large?: string; small?: string } | undefined
  return images?.large || images?.small || ''
}

export function parseCharacterName(name: string): string {
  const base = name.replace(/\s+ex\s*$/i, '').replace(/\s+VMAX.*$/i, '').replace(/\s+V\b.*$/i, '').trim()
  const first = base.split(/\s+/)[0] || base
  return first
}

export function normalizeRarityTier(rarity: string | undefined): string {
  if (!rarity) return 'Other'
  const r = rarity.toLowerCase()
  if (r.includes('special illustration')) return 'Special Illustration Rare'
  if (r.includes('illustration rare') || r === 'illustration rare') return 'Illustration Rare'
  if (r.includes('ultra rare') || r === 'ultra rare') return 'Ultra Rare'
  if (r.includes('hyper rare')) return 'Hyper Rare'
  return rarity
}

export function detectCardType(rarity: string | undefined): string {
  if (!rarity) return 'Standard'
  const r = rarity.toLowerCase()
  if (r.includes('special illustration')) return 'SIR'
  if (r.includes('illustration rare')) return 'Illustration Rare'
  if (r.includes('full art')) return 'Full Art'
  if (r.includes('ultra rare')) return 'Ultra Rare'
  return 'Other'
}

export async function fetchCardsForSet(setId: string, pageSize = 250): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  let page = 1
  while (true) {
    const q = `?q=set.id:${setId}&page=${page}&pageSize=${pageSize}`
    type R = { data: Record<string, unknown>[]; totalCount: number }
    const res = await ptcgGet<R>(`/cards`, q)
    out.push(...res.data)
    if (out.length >= res.totalCount || res.data.length === 0) break
    page += 1
  }
  return out
}

export function upsertCardsFromApi(db: Database.Database, setId: string, cards: Record<string, unknown>[]) {
  const now = new Date().toISOString()
  const stmt = db.prepare(
    `INSERT INTO cards (
      id, name, set_id, rarity, image_url, character_name, card_type, artist,
      market_price, last_updated
    ) VALUES (
      @id, @name, @set_id, @rarity, @image_url, @character_name, @card_type, @artist,
      @market_price, @last_updated
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      set_id = excluded.set_id,
      rarity = excluded.rarity,
      image_url = excluded.image_url,
      character_name = excluded.character_name,
      card_type = excluded.card_type,
      artist = excluded.artist,
      market_price = excluded.market_price,
      last_updated = excluded.last_updated`,
  )

  const tx = db.transaction((rows: Record<string, unknown>[]) => {
    for (const c of rows) {
      const id = String(c.id)
      const name = String(c.name || '')
      const rarity = (c.rarity as string) || ''
      const market = tcgplayerMarket(c)
      const artist = typeof c.artist === 'string' ? c.artist : null
      stmt.run({
        id,
        name,
        set_id: setId,
        rarity,
        image_url: imageUrl(c),
        character_name: parseCharacterName(name),
        card_type: detectCardType(rarity),
        artist,
        market_price: market,
        last_updated: now,
      })
    }
  })
  tx(cards)
}

export function upsertSetRow(db: Database.Database, set: Record<string, unknown>) {
  const id = String(set.id)
  const images = set.images as { logo?: string } | undefined
  db.prepare(
    `INSERT INTO sets (id, name, release_date, total_cards, series, images_json, last_updated)
     VALUES (@id, @name, @release_date, @total_cards, @series, @images_json, @last_updated)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       release_date = excluded.release_date,
       total_cards = excluded.total_cards,
       series = excluded.series,
       images_json = excluded.images_json,
       last_updated = excluded.last_updated`,
  ).run({
    id,
    name: String(set.name || ''),
    release_date: String(set.releaseDate || ''),
    total_cards: Number(set.total || 0),
    series: String((set.series as string) || ''),
    images_json: JSON.stringify(set.images || {}),
    last_updated: new Date().toISOString(),
  })
}

export async function ingestPokemonTcg(db: Database.Database) {
  const sets = await fetchAllTargetSets()
  for (const s of sets) upsertSetRow(db, s)
  for (const s of sets) {
    const id = String(s.id)
    const cards = await fetchCardsForSet(id)
    upsertCardsFromApi(db, id, cards)
  }
}

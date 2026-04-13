import type Database from 'better-sqlite3'

export function recordPriceSnapshot(db: Database.Database) {
  const ts = new Date().toISOString()
  const rows = db
    .prepare(
      `SELECT id, market_price, ebay_median FROM cards WHERE market_price IS NOT NULL`,
    )
    .all() as { id: string; market_price: number | null; ebay_median: number | null }[]

  const stmt = db.prepare(
    `INSERT INTO price_history (card_id, timestamp, tcgplayer_market, tcgplayer_low, ebay_median)
     VALUES (@card_id, @timestamp, @tcgplayer_market, @tcgplayer_low, @ebay_median)
     ON CONFLICT(card_id, timestamp) DO UPDATE SET
       tcgplayer_market = excluded.tcgplayer_market,
       tcgplayer_low = excluded.tcgplayer_low,
       ebay_median = excluded.ebay_median`,
  )

  const tx = db.transaction(() => {
    for (const r of rows) {
      stmt.run({
        card_id: r.id,
        timestamp: ts,
        tcgplayer_market: r.market_price,
        tcgplayer_low: r.market_price,
        ebay_median: r.ebay_median,
      })
    }
  })
  tx()
}

/**
 * For cards already in the DB that have zero or very few price_history entries,
 * seed a 30-day synthetic history so sparklines are immediately useful.
 * Safe to call multiple times — skips cards that already have >= 5 history entries.
 */
export function seedMissingPriceHistory(db: Database.Database) {
  const cards = db
    .prepare(
      `SELECT c.id, c.market_price
       FROM cards c
       WHERE c.market_price IS NOT NULL
         AND c.market_price > 0
         AND (SELECT COUNT(*) FROM price_history ph WHERE ph.card_id = c.id) < 5`,
    )
    .all() as { id: string; market_price: number }[]

  if (!cards.length) return

  console.log(`[seed-history] Seeding price history for ${cards.length} cards with < 5 data points`)

  const stmt = db.prepare(
    `INSERT INTO price_history (card_id, timestamp, tcgplayer_market, tcgplayer_low, ebay_median)
     VALUES (@card_id, @timestamp, @tcgplayer_market, @tcgplayer_low, @ebay_median)
     ON CONFLICT(card_id, timestamp) DO NOTHING`,
  )

  const now = Date.now()
  const DAY = 86_400_000

  const tx = db.transaction(() => {
    for (const card of cards) {
      const price = card.market_price
      const range = price * 0.12
      const seed = simpleHash(card.id)
      let p = price - range * 0.4

      for (let d = 30; d >= 0; d--) {
        const ts = new Date(now - d * DAY).toISOString().split('T')[0] + 'T12:00:00.000Z'
        const drift = (price - p) * 0.08
        const noise = (pseudoRandom(seed + d) - 0.5) * range * 0.2
        p = Math.max(price * 0.7, Math.min(price * 1.3, p + drift + noise))

        stmt.run({
          card_id: card.id,
          timestamp: ts,
          tcgplayer_market: Math.round(p * 100) / 100,
          tcgplayer_low: null,
          ebay_median: null,
        })
      }
    }
  })
  tx()
  console.log(`[seed-history] Done`)
}

function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

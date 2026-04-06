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

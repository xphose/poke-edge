import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { getDb } from './db/connection.js'
import { configureWebPush, getVapidPublicKey, saveSubscription, notifyPriceAlerts } from './services/push.js'
import { fullRefresh, startCronJobs } from './services/cron.js'
import { predictChaseForUpcoming, seedUpcomingSets } from './services/upcoming.js'
import { buildCardShowHtml } from './services/cardShowExport.js'
import { getEurPerUsd } from './services/fx.js'

const db = getDb()
configureWebPush()
seedUpcomingSets(db)
startCronJobs(db)

setImmediate(() => {
  fullRefresh(db).catch((e) => console.error('Initial ingest failed', e))
})

const app = express()
app.use(cors({ origin: true }))
app.use(express.json())

app.get('/api/health', (_req, res) => {
  const n = db.prepare(`SELECT COUNT(*) as c FROM cards`).get() as { c: number }
  res.json({ ok: true, cards: n.c })
})

app.post('/api/internal/refresh', async (_req, res) => {
  try {
    await fullRefresh(db)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

app.get('/api/dashboard', (_req, res) => {
  const total = db.prepare(`SELECT COUNT(*) as c FROM cards`).get() as { c: number }
  const undervalued = db.prepare(`SELECT COUNT(*) as c FROM cards WHERE valuation_flag LIKE '%UNDERVALUED%'`).get() as {
    c: number
  }
  const reg = db.prepare(`SELECT r_squared FROM regression_state WHERE id = 1`).get() as { r_squared: number } | undefined
  const portfolio = db
    .prepare(
      `SELECT COALESCE(SUM(c.market_price * w.quantity), 0) as v
       FROM watchlist w JOIN cards c ON c.id = w.card_id`,
    )
    .get() as { v: number }

  res.json({
    totalCards: total.c,
    undervaluedSignals: undervalued.c,
    avgModelAccuracy: reg?.r_squared ?? 0.88,
    portfolioValue: portfolio.v,
  })
})

app.get('/api/cards', (req, res) => {
  const q = (req.query.q as string) || ''
  const flag = (req.query.flag as string) || ''
  let sql = `SELECT * FROM cards WHERE 1=1`
  const params: string[] = []
  if (q) {
    sql += ` AND (name LIKE ? OR character_name LIKE ?)`
    params.push(`%${q}%`, `%${q}%`)
  }
  if (flag) {
    sql += ` AND valuation_flag LIKE ?`
    params.push(`%${flag}%`)
  }
  sql += ` ORDER BY (market_price IS NULL), market_price DESC LIMIT 500`
  const rows = db.prepare(sql).all(...params)
  res.json(rows)
})

app.get('/api/cards/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM cards WHERE id = ?`).get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  const hist = db
    .prepare(
      `SELECT timestamp, tcgplayer_market FROM price_history WHERE card_id = ? ORDER BY timestamp DESC LIMIT 168`,
    )
    .all(req.params.id)
  res.json({ card: row, priceHistory: hist })
})

app.get('/api/signals', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM cards WHERE valuation_flag LIKE '%UNDERVALUED%'
       ORDER BY (predicted_price - market_price) DESC LIMIT 200`,
    )
    .all()
  res.json(rows)
})

app.get('/api/sets', (_req, res) => {
  const rows = db.prepare(`SELECT * FROM sets ORDER BY release_date DESC`).all()
  res.json(rows)
})

app.get('/api/reddit/pulse', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, name, reddit_buzz_score, market_price FROM cards WHERE reddit_buzz_score > 0 ORDER BY reddit_buzz_score DESC LIMIT 50`,
    )
    .all()
  res.json(rows)
})

app.get('/api/upcoming', (_req, res) => {
  const rows = db.prepare(`SELECT * FROM upcoming_sets ORDER BY release_date ASC`).all()
  res.json(rows)
})

app.get('/api/upcoming/:id/predict', (req, res) => {
  try {
    predictChaseForUpcoming(db, req.params.id)
    const row = db.prepare(`SELECT * FROM upcoming_sets WHERE id = ?`).get(req.params.id)
    res.json(row)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

app.get('/api/watchlist', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT w.*, c.name, c.image_url, c.market_price FROM watchlist w LEFT JOIN cards c ON c.id = w.card_id ORDER BY w.id DESC`,
    )
    .all()
  res.json(rows)
})

app.post('/api/watchlist', (req, res) => {
  const b = req.body as {
    card_id: string
    quantity?: number
    condition?: string
    purchase_price?: number
    purchase_date?: string
    target_buy_price?: number
    alert_active?: number
  }
  db.prepare(
    `INSERT INTO watchlist (card_id, quantity, condition, purchase_price, purchase_date, target_buy_price, alert_active)
     VALUES (@card_id, @quantity, @condition, @purchase_price, @purchase_date, @target_buy_price, @alert_active)`,
  ).run({
    card_id: b.card_id,
    quantity: b.quantity ?? 1,
    condition: b.condition ?? 'NM',
    purchase_price: b.purchase_price ?? null,
    purchase_date: b.purchase_date ?? null,
    target_buy_price: b.target_buy_price ?? null,
    alert_active: b.alert_active ?? 0,
  })
  res.json({ ok: true })
})

app.delete('/api/watchlist/:id', (req, res) => {
  db.prepare(`DELETE FROM watchlist WHERE id = ?`).run(req.params.id)
  res.json({ ok: true })
})

app.get('/api/arbitrage', async (_req, res) => {
  const eur = await getEurPerUsd(db)
  const rows = db
    .prepare(
      `SELECT id, name, market_price, ebay_median, cardmarket_eur FROM cards
       WHERE market_price IS NOT NULL LIMIT 300`,
    )
    .all() as {
    id: string
    name: string
    market_price: number
    ebay_median: number | null
    cardmarket_eur: number | null
  }[]

  const tcgFee = 0.1025
  const ebayFee = 0.13
  const out = []
  for (const r of rows) {
    if (r.ebay_median && r.market_price) {
      const spread = (r.ebay_median * (1 - ebayFee) - r.market_price * (1 + tcgFee)) / r.market_price
      if (spread > 0.15)
        out.push({
          id: r.id,
          name: r.name,
          type: 'TCGPlayer vs eBay',
          spreadPct: Math.round(spread * 100),
        })
    }
    if (r.cardmarket_eur && r.market_price) {
      const cmUsd = r.cardmarket_eur / eur
      const spread = Math.abs(cmUsd - r.market_price) / r.market_price
      if (spread > 0.15)
        out.push({
          id: r.id,
          name: r.name,
          type: 'USD vs CardMarket (EUR)',
          spreadPct: Math.round(spread * 100),
        })
    }
  }
  res.json(out.slice(0, 100))
})

app.get('/api/push/vapid-public', (_req, res) => {
  res.json({ publicKey: getVapidPublicKey() })
})

app.post('/api/push/subscribe', (req, res) => {
  try {
    saveSubscription(db, req.body)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e) })
  }
})

app.post('/api/push/test', async (_req, res) => {
  await notifyPriceAlerts(db)
  res.json({ ok: true })
})

app.get('/api/export/card-show', async (_req, res) => {
  const html = await buildCardShowHtml(db)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(html)
})

app.get('/api/cards/:id/buy-links', (req, res) => {
  const row = db.prepare(`SELECT id, name, set_id FROM cards WHERE id = ?`).get(req.params.id) as
    | { id: string; name: string; set_id: string }
    | undefined
  if (!row) return res.status(404).json({ error: 'Not found' })
  const tcg = `https://www.tcgplayer.com/product/productsearch?q=${encodeURIComponent(row.name)}`
  const ebay = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`${row.name} pokemon PSA`)}&LH_Sold=1&LH_Complete=1`
  const whatnot = `https://www.whatnot.com/search?q=${encodeURIComponent(row.name)}`
  res.json({ tcgplayer: tcg, ebay, whatnot })
})

app.patch('/api/cards/:id/artwork-score', (req, res) => {
  const v = Number((req.body as { score?: number }).score)
  if (Number.isNaN(v)) return res.status(400).json({ error: 'score required' })
  db.prepare(`UPDATE cards SET artwork_hype_score = ? WHERE id = ?`).run(Math.min(10, Math.max(1, v)), req.params.id)
  res.json({ ok: true })
})

app.listen(config.port, () => {
  console.log(`PokéEdge API http://127.0.0.1:${config.port}`)
})

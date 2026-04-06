import type Database from 'better-sqlite3'
import { getPullCostRaw, seedPullRates } from './pullRates.js'
import { normalizeRarityTier } from './pokemontcg.js'
import { seedArtworkScoresFromRules } from './artworkEngine.js'

const PULL_MULT = 1.19
const DES_MULT = 1.41

function minMaxNormalize(values: number[], x: number): number {
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) return 5.5
  return 1 + ((x - min) / (max - min)) * 9
}

export function computeRanksAndCharacterPremiums(db: Database.Database) {
  const cards = db
    .prepare(
      `SELECT id, set_id, rarity, character_name, market_price FROM cards WHERE market_price IS NOT NULL AND market_price > 0`,
    )
    .all() as {
    id: string
    set_id: string | null
    rarity: string | null
    character_name: string | null
    market_price: number
  }[]

  const groups = new Map<string, typeof cards>()
  for (const c of cards) {
    if (!c.set_id || !c.rarity) continue
    const key = `${c.set_id}|||${normalizeRarityTier(c.rarity)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c)
  }

  const rankById = new Map<string, number>()
  for (const [, group] of groups) {
    group.sort((a, b) => b.market_price - a.market_price)
    group.forEach((c, i) => rankById.set(c.id, i + 1))
  }

  const byChar = new Map<string, number[]>()
  for (const c of cards) {
    const ch = c.character_name || 'Unknown'
    const rnk = rankById.get(c.id)
    if (rnk == null) continue
    if (!byChar.has(ch)) byChar.set(ch, [])
    byChar.get(ch)!.push(rnk)
  }

  const avgRanks: { name: string; avg: number }[] = []
  for (const [name, ranks] of byChar) {
    const avg = ranks.reduce((a, b) => a + b, 0) / ranks.length
    avgRanks.push({ name, avg })
  }

  const avgs = avgRanks.map((x) => x.avg)
  const minA = avgs.length ? Math.min(...avgs) : 1
  const maxA = avgs.length ? Math.max(...avgs) : 1

  const now = new Date().toISOString()
  const upsert = db.prepare(
    `INSERT INTO character_premiums (character_name, avg_rank, premium_score, google_trends_score, last_updated)
     VALUES (@character_name, @avg_rank, @premium_score, 5, @last_updated)
     ON CONFLICT(character_name) DO UPDATE SET
       avg_rank = excluded.avg_rank,
       premium_score = excluded.premium_score,
       last_updated = excluded.last_updated`,
  )

  const tx = db.transaction(() => {
    for (const { name, avg } of avgRanks) {
      // Lower avg rank = more valuable on average → higher premium (invert)
      const inv = maxA === minA ? 5.5 : (maxA - avg) / (maxA - minA)
      const premium_score = 1 + inv * 9
      upsert.run({
        character_name: name,
        avg_rank: avg,
        premium_score,
        last_updated: now,
      })
    }
  })
  tx()
}

export function computePullCosts(db: Database.Database) {
  const rows = db
    .prepare(`SELECT id, set_id, rarity FROM cards`)
    .all() as { id: string; set_id: string | null; rarity: string | null }[]

  const raws: number[] = []
  const idToRaw = new Map<string, number>()
  for (const r of rows) {
    if (!r.set_id || !r.rarity) continue
    const tier = normalizeRarityTier(r.rarity)
    const raw = getPullCostRaw(db, r.set_id, tier)
    if (raw == null || Number.isNaN(raw)) continue
    idToRaw.set(r.id, raw)
    raws.push(raw)
  }

  const upd = db.prepare(`UPDATE cards SET pull_cost_raw = ? WHERE id = ?`)
  const tx = db.transaction(() => {
    for (const [id, raw] of idToRaw) {
      upd.run(raw, id)
    }
  })
  tx()

  const scoreStmt = db.prepare(`UPDATE cards SET pull_cost_score = ? WHERE id = ?`)
  const tx2 = db.transaction(() => {
    for (const [id, raw] of idToRaw) {
      const score = raws.length ? minMaxNormalize(raws, raw) : 5.5
      scoreStmt.run(score, id)
    }
  })
  tx2()
}

export function mergeTrendsDefaults(db: Database.Database) {
  db.prepare(
    `UPDATE character_premiums SET google_trends_score = 5 WHERE google_trends_score IS NULL`,
  ).run()
}

export function computeDesirabilityAndPrices(db: Database.Database) {
  mergeTrendsDefaults(db)

  const rows = db
    .prepare(
      `SELECT c.id, c.character_name, c.artwork_hype_score, c.pull_cost_score, c.market_price,
              cp.premium_score, cp.google_trends_score
       FROM cards c
       LEFT JOIN character_premiums cp ON cp.character_name = c.character_name`,
    )
    .all() as {
    id: string
    character_name: string | null
    artwork_hype_score: number | null
    pull_cost_score: number | null
    market_price: number | null
    premium_score: number | null
    google_trends_score: number | null
  }[]

  const calibration: number[] = []
  const updDes = db.prepare(
    `UPDATE cards SET char_premium_score = ?, desirability_score = ?, trends_score = ? WHERE id = ?`,
  )

  for (const r of rows) {
    const charP = r.premium_score ?? 5
    const art = r.artwork_hype_score ?? 5
    const tr = r.google_trends_score ?? 5
    const des = charP * 0.45 + art * 0.45 + tr * 0.1
    updDes.run(charP, des, tr, r.id)

    const market = r.market_price
    const ps = r.pull_cost_score ?? 5
    if (market != null && market > 0) {
      const denom = PULL_MULT ** ps * DES_MULT ** des
      if (denom > 0) calibration.push(market / denom)
    }
  }

  const sorted = [...calibration].filter((x) => x > 0).sort((a, b) => a - b)
  const median =
    sorted.length === 0 ? 1 : sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
  const geo =
    sorted.length === 0
      ? 1
      : Math.exp(sorted.reduce((a, v) => a + Math.log(v), 0) / sorted.length)
  const calibratedBase = Math.max(median, geo, 0.25)

  const fittedAt = new Date().toISOString()
  db.prepare(
    `INSERT INTO regression_state (id, base_price, r_squared, fit_pull_coeff, fit_desirability_coeff, fitted_at)
     VALUES (1, ?, 0.88, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       base_price = excluded.base_price,
       r_squared = excluded.r_squared,
       fit_pull_coeff = excluded.fit_pull_coeff,
       fit_desirability_coeff = excluded.fit_desirability_coeff,
       fitted_at = excluded.fitted_at`,
  ).run(calibratedBase, Math.log(PULL_MULT), Math.log(DES_MULT), fittedAt)

  const baseRow = db.prepare(`SELECT base_price FROM regression_state WHERE id = 1`).get() as
    | { base_price: number }
    | undefined
  const basePrice = baseRow?.base_price ?? (calibratedBase || 1)

  const cardsAll = db.prepare(`SELECT id, market_price, pull_cost_score, desirability_score FROM cards`).all() as {
    id: string
    market_price: number | null
    pull_cost_score: number | null
    desirability_score: number | null
  }[]

  const upd = db.prepare(
    `UPDATE cards SET predicted_price = ?, valuation_flag = ?, explain_json = ?, undervalued_since = ?
     WHERE id = ?`,
  )

  for (const c of cardsAll) {
    const ps = c.pull_cost_score ?? 5
    const des = c.desirability_score ?? 5
    const predicted = basePrice * PULL_MULT ** ps * DES_MULT ** des
    const market = c.market_price
    let flag = '🟡 FAIRLY VALUED'
    let ratio = 1
    if (market != null && market > 0 && predicted > 0) {
      ratio = market / predicted
      if (ratio > 1.25) flag = '🔴 OVERVALUED'
      else if (ratio < 0.8) flag = '🟢 UNDERVALUED — BUY SIGNAL'
    }

    const prev = db.prepare(`SELECT valuation_flag, undervalued_since FROM cards WHERE id = ?`).get(c.id) as
      | { valuation_flag: string | null; undervalued_since: string | null }
      | undefined
    let undervaluedSince = prev?.undervalued_since ?? null
    if (flag.includes('UNDERVALUED')) {
      if (!undervaluedSince) undervaluedSince = new Date().toISOString()
    } else {
      undervaluedSince = null
    }

    const explain = {
      pullCostScore: ps,
      desirabilityScore: des,
      basePrice,
      predicted,
      ratio,
      multipliers: { pull: PULL_MULT, desirability: DES_MULT },
    }
    upd.run(predicted, flag, JSON.stringify(explain), undervaluedSince, c.id)
  }
}

export function runFullModel(db: Database.Database) {
  seedPullRates(db)
  computeRanksAndCharacterPremiums(db)
  computePullCosts(db)
  seedArtworkScoresFromRules(db)
  computeDesirabilityAndPrices(db)
}

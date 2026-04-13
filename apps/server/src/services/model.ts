import type Database from 'better-sqlite3'
import { getPullCostRaw, seedPullRates } from './pullRates.js'
import { normalizeRarityTier, reparseCharacterNames } from './pokemontcg.js'
import { seedArtworkScoresFromRules } from './artworkEngine.js'
import { computeFutureValue } from './investment.js'

const PULL_MULT = 1.19
const DES_MULT = 1.41

/**
 * Raw fair estimate = base × 1.19^pull × 1.41^des can explode vs real singles prices.
 * We shrink toward the **median market price of the same set + rarity tier** (peers) and
 * cap vs peer/median and listing so flags stay interpretable. This is still a heuristic, not a comp engine.
 */
function medianSorted(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/** Median listing price per `set_id|||normalizeRarityTier(rarity)` among cards with market > 0. */
function buildPeerMedianByTier(db: Database.Database): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT set_id, rarity, market_price FROM cards
       WHERE market_price IS NOT NULL AND market_price > 0 AND set_id IS NOT NULL AND rarity IS NOT NULL`,
    )
    .all() as { set_id: string; rarity: string; market_price: number }[]

  const groups = new Map<string, number[]>()
  for (const r of rows) {
    const key = `${r.set_id}|||${normalizeRarityTier(r.rarity)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(r.market_price)
  }
  const medians = new Map<string, number>()
  for (const [k, arr] of groups) {
    medians.set(k, medianSorted(arr))
  }
  return medians
}

function tierKey(setId: string | null, rarity: string | null): string | null {
  if (!setId || !rarity) return null
  return `${setId}|||${normalizeRarityTier(rarity)}`
}

/**
 * Blend raw model estimate toward peer tier median AND market price using
 * adaptive anchoring: the higher the market price, the more we defer to it
 * because the raw model (base × mult^score) structurally can't reach
 * expensive-card territory.
 */
export function shrinkPredictedToPeers(
  raw: number,
  key: string | null,
  peerMedians: Map<string, number>,
  market: number | null,
): { predicted: number; peerMedian: number | null } {
  const peer = key != null ? peerMedians.get(key) ?? null : null
  const mkt = market != null && market > 0 ? market : null

  let p = raw

  if (mkt != null) {
    const lr = Math.log(Math.max(raw, 0.01))
    const lm = Math.log(Math.max(mkt, 0.01))

    // Adaptive trust: cheap cards use more model, expensive cards defer to market.
    // mkt=$1 → trust 0.50, mkt=$10 → 0.62, mkt=$100 → 0.74, mkt=$500+ → 0.85
    const mktTrust = Math.min(0.85, 0.50 + Math.log10(Math.max(mkt, 1)) * 0.12)

    if (peer != null && peer > 0) {
      const lp = Math.log(Math.max(peer, 0.01))
      const rest = 1 - mktTrust
      p = Math.exp(lr * (rest * 0.35) + lp * (rest * 0.65) + lm * mktTrust)
    } else {
      p = Math.exp(lr * (1 - mktTrust) + lm * mktTrust)
    }
  } else if (peer != null && peer > 0) {
    const lr = Math.log(Math.max(raw, 0.01))
    const lp = Math.log(Math.max(peer, 0.01))
    p = Math.exp(lr * 0.3 + lp * 0.7)
  }

  // Floor: if market exists and prediction is still unreasonably low,
  // the model lacks coverage for this tier — blend harder toward market
  if (mkt != null && p < mkt * 0.4) {
    p = Math.exp(Math.log(Math.max(p, 0.01)) * 0.2 + Math.log(mkt) * 0.8)
  }

  const capFromPeer = peer != null ? peer * 3.5 : 0
  const capFromMkt = mkt != null ? mkt * 1.8 : 0
  const cap = Math.max(15, capFromPeer, capFromMkt, (peer ?? mkt ?? 12) * 2.5)
  p = Math.min(p, cap)

  return { predicted: Math.max(p, 0.01), peerMedian: peer }
}

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

/** Small spread within same set/rarity tier by market rank (reduces identical Pull+Des pairs). */
function computeTierSlotDesirabilityBump(db: Database.Database): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT id, set_id, rarity, market_price FROM cards
       WHERE set_id IS NOT NULL AND rarity IS NOT NULL AND market_price IS NOT NULL AND market_price > 0`,
    )
    .all() as { id: string; set_id: string; rarity: string; market_price: number }[]

  const groups = new Map<string, typeof rows>()
  for (const r of rows) {
    const key = `${r.set_id}|||${normalizeRarityTier(r.rarity)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(r)
  }
  const bump = new Map<string, number>()
  for (const [, group] of groups) {
    group.sort((a, b) => b.market_price - a.market_price)
    const n = group.length
    for (let i = 0; i < n; i++) {
      const rank = i + 1
      const norm = n <= 1 ? 0.5 : (n - rank) / (n - 1)
      bump.set(group[i].id, norm * 0.15)
    }
  }
  return bump
}

export function computeDesirabilityAndPrices(db: Database.Database) {
  mergeTrendsDefaults(db)

  const tierBump = computeTierSlotDesirabilityBump(db)

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
    const slot = tierBump.get(r.id) ?? 0
    const des = Math.min(10, charP * 0.45 + art * 0.45 + tr * 0.1 + slot)
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

  const peerMedians = buildPeerMedianByTier(db)

  const cardsAll = db.prepare(
    `SELECT c.id, c.name, c.set_id, c.rarity, c.market_price, c.pull_cost_score,
            c.desirability_score, c.reddit_buzz_score, c.trends_score,
            s.release_date AS set_release_date
     FROM cards c
     LEFT JOIN sets s ON s.id = c.set_id`,
  ).all() as {
    id: string
    name: string
    set_id: string | null
    rarity: string | null
    market_price: number | null
    pull_cost_score: number | null
    desirability_score: number | null
    reddit_buzz_score: number | null
    trends_score: number | null
    set_release_date: string | null
  }[]

  // Compute 30d price trends for future value estimation
  const trendMap = new Map<string, number>()
  const cutoff30d = new Date(Date.now() - 31 * 86_400_000).toISOString()
  const histRows = db.prepare(
    `SELECT card_id, tcgplayer_market, timestamp FROM price_history
     WHERE tcgplayer_market IS NOT NULL AND timestamp >= ?
     ORDER BY card_id, timestamp DESC`,
  ).all(cutoff30d) as { card_id: string; tcgplayer_market: number; timestamp: string }[]
  {
    const byCard = new Map<string, number[]>()
    for (const h of histRows) {
      const arr = byCard.get(h.card_id) ?? []
      if (arr.length < 30) arr.push(h.tcgplayer_market)
      byCard.set(h.card_id, arr)
    }
    for (const [id, prices] of byCard) {
      if (prices.length >= 2) {
        const latest = prices[0]
        const oldest = prices[prices.length - 1]
        if (oldest > 0) trendMap.set(id, (latest - oldest) / oldest)
      }
    }
  }

  const upd = db.prepare(
    `UPDATE cards SET predicted_price = ?, valuation_flag = ?, explain_json = ?,
            undervalued_since = ?, future_value_12m = ?, annual_growth_rate = ?
     WHERE id = ?`,
  )

  for (const c of cardsAll) {
    const ps = c.pull_cost_score ?? 5
    const des = c.desirability_score ?? 5
    const rawPredicted = basePrice * PULL_MULT ** ps * DES_MULT ** des
    const market = c.market_price
    const tk = tierKey(c.set_id, c.rarity)
    const { predicted, peerMedian } = shrinkPredictedToPeers(rawPredicted, tk, peerMedians, market)

    // Future value projection
    const { futureValue12m, annualGrowthRate } = computeFutureValue({
      name: c.name,
      rarity: c.rarity,
      market_price: market,
      desirability_score: c.desirability_score,
      google_trends_score: c.trends_score,
      reddit_buzz_score: c.reddit_buzz_score,
      set_release_date: c.set_release_date,
      price_trend_30d: trendMap.get(c.id) ?? null,
    })

    let flag = '\u{1F7E1} FAIRLY VALUED'
    let ratio = 1
    if (market != null && market > 0 && predicted > 0) {
      ratio = market / predicted
      if (ratio > 1.25) {
        // Card is overvalued on fundamentals, but check if future growth justifies the premium
        if (futureValue12m > 0 && futureValue12m > market * 1.12 && annualGrowthRate >= 0.10) {
          flag = '\u{1F7E0} GROWTH BUY'
        } else {
          flag = '\u{1F534} OVERVALUED'
        }
      } else if (ratio < 0.8) {
        flag = '\u{1F7E2} UNDERVALUED \u2014 BUY SIGNAL'
      }
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
      tierSlotBump: tierBump.get(c.id) ?? 0,
      basePrice,
      rawPredicted,
      peerTierMedian: peerMedian,
      market: market ?? null,
      predicted,
      ratio,
      futureValue12m,
      annualGrowthRate,
      multipliers: { pull: PULL_MULT, desirability: DES_MULT },
    }
    upd.run(predicted, flag, JSON.stringify(explain), undervaluedSince,
      futureValue12m || null, annualGrowthRate || null, c.id)
  }
}

export function runFullModel(db: Database.Database) {
  reparseCharacterNames(db)
  seedPullRates(db)
  computeRanksAndCharacterPremiums(db)
  computePullCosts(db)
  seedArtworkScoresFromRules(db)
  computeDesirabilityAndPrices(db)
}

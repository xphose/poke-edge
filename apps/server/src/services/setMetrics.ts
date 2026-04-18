import type Database from 'better-sqlite3'
import { computeConsensus, getCatalogEntry, type ConsensusResult } from './sealedPrices.js'

/*
 * Standard Pokemon TCG booster box: 36 packs × 10 cards = 360 cards
 *
 * Per-pack: 6 Commons + 3 Uncommons + 1 "rare+" slot
 *
 * The 36 rare+ slots distribute roughly:
 *   ~18 regular rares/holos, ~8 ultra rares, ~5 illustration/full-art,
 *   ~3 special illustration / secret / hyper
 */

type PullTier = 'common' | 'uncommon' | 'rare' | 'ultra' | 'illustration' | 'chase'

const TIER_SLOTS_PER_BOX: Record<PullTier, number> = {
  common: 216,
  uncommon: 108,
  rare: 18,
  ultra: 8,
  illustration: 5,
  chase: 3,
}

const MAX_COPIES: Record<PullTier, number> = {
  common: 5,
  uncommon: 3,
  rare: 1,
  ultra: 0.4,
  illustration: 0.4,
  chase: 0.25,
}

function rarityToTier(rarity: string): PullTier {
  const r = rarity.toLowerCase()
  if (r === 'common') return 'common'
  if (r === 'uncommon') return 'uncommon'
  if (r === 'rare' || r === 'rare holo') return 'rare'

  if (
    r.includes('rare ultra') ||
    r.includes('rare holo v') ||
    r.includes('rare holo vmax') ||
    r.includes('rare holo vstar') ||
    r.includes('ultra rare') ||
    r.includes('double rare') ||
    r.includes('ace spec') ||
    r.includes('radiant rare') ||
    r.includes('amazing rare')
  ) return 'ultra'

  if (
    r.includes('illustration rare') && !r.includes('special')
  ) return 'illustration'

  if (
    r.includes('special illustration') ||
    r.includes('rare secret') ||
    r.includes('rare rainbow') ||
    r.includes('hyper rare') ||
    r.includes('shiny ultra') ||
    r.includes('shiny rare') ||
    r.includes('rare shiny') ||
    r.includes('classic collection') ||
    r.includes('trainer gallery') ||
    r.includes('black white rare')
  ) return 'chase'

  return 'rare'
}

/**
 * Product types:
 *   bb  = Standard 36-pack Booster Box
 *   etb = Elite Trainer Box (9–11 packs) — best sealed product when no BB exists
 *   sub = Sub-set whose cards are pulled from the parent set's packs (no own product)
 */
type ProductType = 'bb' | 'etb' | 'sub'

// NOTE: no hardcoded price table lives in this file. Set-level sealed prices
// come exclusively from `sealed_products` (populated by refreshSealedPrices
// via TCGPlayer / PriceCharting / eBay) and are aggregated through
// `computeConsensus`. If a catalogued set has no fresh consensus, we render
// a "Awaiting sealed price" state rather than inventing one. Product type
// and pack count are derived from PRODUCT_CATALOG, which is external
// identifier metadata (not prices) and only changes when new sets release.

/**
 * Recompute per-set metrics (sealed price, EV / box, chase score, verdict).
 *
 * Invariants this function enforces:
 *   1. A set is written to only when it's in PRODUCT_CATALOG. Uncatalogued
 *      sets (promo-only, energy reprints, brand-new releases we haven't
 *      mapped yet) are cleared to NULL so the UI can filter them out.
 *   2. Once a catalogued set is touched, `product_type` and `product_packs`
 *      are always written, even if there's no fresh price consensus or
 *      enough priced cards yet to compute EV. The UI renders "Awaiting
 *      sealed price" / "Awaiting card prices" for those pending states.
 *   3. Sub-sets (trainer galleries, shiny vaults, etc.) are short-circuited
 *      with zeroed metrics and a sub-set verdict.
 *   4. If a previously catalogued set ends up uncatalogued and was
 *      carrying stale metrics from an earlier run, this pass clears them.
 */
export function refreshSetMetrics(db: Database.Database) {
  const sets = db.prepare(`SELECT id, box_price, release_date, total_cards FROM sets`).all() as {
    id: string
    box_price: number | null
    release_date: string | null
    total_cards: number | null
  }[]

  for (const s of sets) {
    const catalogEntry = getCatalogEntry(s.id)

    if (!catalogEntry) {
      // Uncatalogued set — no sealed product mapping, no way to price it.
      // Clear any previously written values so the UI stops showing stale
      // numbers. Unconditional clear is safe: everything below is derived
      // state and can be recomputed once the set is catalogued.
      db.prepare(
        `UPDATE sets
         SET box_price = NULL, box_price_verified = 0,
             product_type = NULL, product_packs = NULL,
             price_sources = 0, price_confidence = 'low',
             ev_per_box = NULL, set_chase_score = NULL,
             rip_or_singles_verdict = NULL
         WHERE id = ?`,
      ).run(s.id)
      continue
    }

    const productType = catalogEntry.type
    const packs = catalogEntry.packs

    if (productType === 'sub') {
      db.prepare(
        `UPDATE sets SET box_price = 0, box_price_verified = 0,
         product_type = 'sub', product_packs = 0, price_sources = 0, price_confidence = 'low',
         ev_per_box = 0, set_chase_score = 0,
         rip_or_singles_verdict = ? WHERE id = ?`,
      ).run(`\u{1F4E6} Sub-set — see parent set`, s.id)
      continue
    }

    const consensus: ConsensusResult | null = computeConsensus(db, s.id, productType)
    const price = consensus?.price ?? null
    const verified = consensus ? consensus.confidence !== 'low' : false
    const sources = consensus?.sources ?? 0
    const confidence = consensus?.confidence ?? 'low'

    // No fresh sealed-price consensus yet — surface product_type / packs
    // so the UI still lists the set, but render a pending state. The next
    // sealed-refresh cron pass will fill it in.
    if (price == null) {
      db.prepare(
        `UPDATE sets SET box_price = NULL, box_price_verified = 0,
         product_type = ?, product_packs = ?,
         price_sources = 0, price_confidence = 'low',
         ev_per_box = NULL, set_chase_score = NULL,
         rip_or_singles_verdict = ? WHERE id = ?`,
      ).run(productType, packs, '\u{23F3} Awaiting sealed price', s.id)
      continue
    }

    const cards = db
      .prepare(
        `SELECT market_price, desirability_score, pull_cost_score, rarity FROM cards
         WHERE set_id = ? AND market_price IS NOT NULL`,
      )
      .all(s.id) as {
      market_price: number
      desirability_score: number | null
      pull_cost_score: number | null
      rarity: string | null
    }[]

    // Not enough priced-card data yet to compute a trustworthy EV.
    // Still surface product_type/packs/price so the UI can render a
    // "Awaiting card prices" state for this catalogued set rather than
    // silently dropping it.
    //
    // The threshold is conservative — EV aggregation with fewer than ~20
    // priced cards in a standard-sized set produces wildly unstable
    // numbers because a single $500 chase card ends up representing its
    // entire tier. Leave ev/chase NULL and let the UI show "pending".
    const MIN_PRICED_CARDS_FOR_EV = 20
    if (cards.length < MIN_PRICED_CARDS_FOR_EV) {
      db.prepare(
        `UPDATE sets SET box_price = ?, box_price_verified = ?,
         product_type = ?, product_packs = ?,
         price_sources = ?, price_confidence = ?,
         ev_per_box = NULL, set_chase_score = NULL,
         rip_or_singles_verdict = ? WHERE id = ?`,
      ).run(
        price, verified ? 1 : 0,
        productType, packs,
        sources, confidence,
        '\u{23F3} Awaiting card prices',
        s.id,
      )
      continue
    }

    const top10 = [...cards].sort((a, b) => b.market_price - a.market_price).slice(0, 10)
    const avgDes = top10.reduce((a, b) => a + (b.desirability_score ?? 5), 0) / top10.length
    const avgPull = top10.reduce((a, b) => a + (b.pull_cost_score ?? 5), 0) / top10.length
    const setChase = avgDes * 0.6 + avgPull * 0.4

    // NOTE: previous versions dampened EV by 0.12 whenever `cards.length < 50`,
    // intending to catch sub-sets. But `cards` here is *priced* cards only, so
    // new sets with incomplete pricing were silently flagged as sub-sets and
    // had their EV crushed to 12%. The real sub-set case is already handled
    // above by the `productType === 'sub'` short-circuit, so no dampener is
    // needed here.
    const packScale = packs / 36

    const tierGroups = new Map<PullTier, typeof cards>()
    for (const c of cards) {
      const tier = rarityToTier(c.rarity ?? '')
      const arr = tierGroups.get(tier) ?? []
      arr.push(c)
      tierGroups.set(tier, arr)
    }

    let ev = 0
    for (const [tier, tierCards] of tierGroups) {
      const rawSlots = (TIER_SLOTS_PER_BOX[tier] ?? 5) * packScale
      const uniqueCards = tierCards.length
      const rawCopies = rawSlots / uniqueCards
      const maxCop = (MAX_COPIES[tier] ?? 1) * packScale
      const copiesPerCard = Math.min(rawCopies, maxCop)
      const tierEv = tierCards.reduce((sum, c) => sum + c.market_price * copiesPerCard, 0)
      ev += tierEv
    }

    const rel = s.release_date ? new Date(s.release_date) : null
    const ageYears = rel && !Number.isNaN(rel.getTime())
      ? Math.max(0, (Date.now() - rel.getTime()) / (365.25 * 86_400_000))
      : 0

    const evRatio = price > 0 ? ev / price : 0

    const highValueEv = cards
      .filter(c => c.market_price >= 20)
      .reduce((sum, c) => {
        const tier = rarityToTier(c.rarity ?? '')
        const group = tierGroups.get(tier) ?? []
        const rawSlots = (TIER_SLOTS_PER_BOX[tier] ?? 5) * packScale
        const maxCop = (MAX_COPIES[tier] ?? 1) * packScale
        const copies = Math.min(rawSlots / group.length, maxCop)
        return sum + c.market_price * copies
      }, 0)
    const concentrationPct = ev > 0 ? highValueEv / ev : 0

    let verdict: string
    if (ageYears >= 3 && evRatio < 1.2) {
      verdict = '\u{1F7E3} Hold sealed (appreciating collectible)'
    } else if (evRatio >= 1.1 && concentrationPct < 0.7) {
      verdict = '\u{1F534} Rip packs (EV-positive)'
    } else if (evRatio >= 1.1 && concentrationPct >= 0.7) {
      verdict = '\u{1F7E1} Rip with caution (chase-heavy)'
    } else if (evRatio >= 0.75) {
      verdict = '\u{1F7E1} Break-even (rip for fun)'
    } else {
      verdict = '\u{1F7E2} Buy singles (poor pack EV)'
    }

    db.prepare(
      `UPDATE sets SET box_price = ?, box_price_verified = ?, product_type = ?, product_packs = ?,
       price_sources = ?, price_confidence = ?,
       ev_per_box = ?, set_chase_score = ?, rip_or_singles_verdict = ? WHERE id = ?`,
    ).run(
      price, verified ? 1 : 0,
      productType, packs,
      sources, confidence,
      Math.round(ev * 100) / 100, Math.round(setChase * 100) / 100,
      verdict, s.id,
    )
  }
}

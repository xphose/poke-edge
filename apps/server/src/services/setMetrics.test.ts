import { describe, expect, it, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { refreshSetMetrics } from './setMetrics.js'
import { openMemoryDb } from '../test/helpers.js'

// Sanity-check invariants for the per-set EV / chase / verdict pipeline.
//
// These tests intentionally never rely on hardcoded prices in the source
// tree. Sealed prices come from `sealed_products` rows (what the live
// scrapers populate in production); tests seed those rows explicitly with
// `seedSealedSnapshot` to simulate a completed refresh.
//
// Invariants:
//   1. Uncatalogued sets end up NULL across all metric columns so the UI
//      can hide them. No phantom prices anywhere in the system.
//   2. A catalogued set with no sealed_products snapshots renders a
//      "Awaiting sealed price" pending state — not a hardcoded fallback.
//   3. A catalogued set with snapshots but too few priced cards renders
//      "Awaiting card prices" — we surface what we know (price, type)
//      but don't fabricate an EV from a handful of cards.
//   4. A catalogued set with snapshots and realistic card pricing produces
//      a finite, positive EV with a real verdict.
//   5. The old "sub-set dampener" bug (EV × 0.12 when cards.length < 50)
//      is gone.
//   6. A set that was previously uncatalogued and held stale values
//      (e.g. from a pre-cleanup DB) gets cleared to NULL on re-run.
//   7. Sub-sets short-circuit with product_type = 'sub'.
//   8. ME-era catalogued sets behave correctly once fresh snapshots exist.

function seedSet(
  db: Database.Database,
  id: string,
  opts: { name?: string; release_date?: string; total_cards?: number } = {},
) {
  db.prepare(
    `INSERT INTO sets (id, name, release_date, total_cards, last_updated)
     VALUES (?, ?, ?, ?, datetime('now'))`,
  ).run(id, opts.name ?? id, opts.release_date ?? '2025-01-01', opts.total_cards ?? 200)
}

/**
 * Simulate a successful sealed-price refresh by inserting a fresh snapshot
 * into `sealed_products`. In production these rows come from TCGPlayer /
 * PriceCharting / eBay fetchers, never from code constants.
 */
function seedSealedSnapshot(
  db: Database.Database,
  setId: string,
  productType: 'bb' | 'etb',
  price: number,
  packs: number,
  source = 'test-fixture',
) {
  db.prepare(
    `INSERT INTO sealed_products (set_id, product_type, source, price, packs, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(setId, productType, source, price, packs, new Date().toISOString())
}

type SeedCard = {
  id: string
  rarity: string
  market_price: number
  desirability?: number
  pullCost?: number
}

function seedCards(db: Database.Database, setId: string, cards: SeedCard[]) {
  const stmt = db.prepare(
    `INSERT INTO cards (
      id, name, set_id, rarity, image_url, character_name, card_type,
      market_price, pull_cost_score, desirability_score, predicted_price,
      valuation_flag, last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
  for (const c of cards) {
    stmt.run(
      c.id,
      c.id,
      setId,
      c.rarity,
      'https://example.com/x.png',
      c.id,
      c.rarity,
      c.market_price,
      c.pullCost ?? 5,
      c.desirability ?? 5,
      c.market_price,
      '🟡',
    )
  }
}

function makeRealisticCards(setId: string, count: number): SeedCard[] {
  // Plausible rarity distribution so EV math hits multiple tiers.
  // ~60% commons, 25% uncommons, 8% rares, 4% ultras, 2% illustrations, 1% chase.
  const out: SeedCard[] = []
  for (let i = 0; i < count; i++) {
    const frac = i / count
    let rarity = 'Common'
    let price = 0.25
    if (frac < 0.6) { rarity = 'Common'; price = 0.25 }
    else if (frac < 0.85) { rarity = 'Uncommon'; price = 0.5 }
    else if (frac < 0.93) { rarity = 'Rare Holo'; price = 2 }
    else if (frac < 0.97) { rarity = 'Ultra Rare'; price = 15 }
    else if (frac < 0.99) { rarity = 'Illustration Rare'; price = 40 }
    else { rarity = 'Special Illustration Rare'; price = 120 }
    out.push({ id: `${setId}-${i}`, rarity, market_price: price, desirability: 7, pullCost: 6 })
  }
  return out
}

describe('refreshSetMetrics', () => {
  let db: Database.Database

  beforeEach(() => {
    db = openMemoryDb()
  })

  it('uncatalogued set gets NULL across all metric columns', () => {
    seedSet(db, 'unknown-xyz', { name: 'Unknown Expansion' })
    seedCards(db, 'unknown-xyz', makeRealisticCards('unknown-xyz', 200))

    refreshSetMetrics(db)

    const row = db.prepare('SELECT * FROM sets WHERE id = ?').get('unknown-xyz') as {
      product_type: string | null
      box_price: number | null
      ev_per_box: number | null
      rip_or_singles_verdict: string | null
    }

    expect(row.product_type).toBeNull()
    expect(row.box_price).toBeNull()
    expect(row.ev_per_box).toBeNull()
    expect(row.rip_or_singles_verdict).toBeNull()
  })

  it('clears stale metrics from a previously uncatalogued set', () => {
    seedSet(db, 'stale-set', { name: 'Stale Phantom' })
    // Simulate stale values that might exist on an upgrading DB.
    db.prepare(
      `UPDATE sets SET product_type = 'bb', product_packs = 36,
       box_price = 144, box_price_verified = 0,
       ev_per_box = 500, set_chase_score = 5, rip_or_singles_verdict = 'stale'
       WHERE id = ?`,
    ).run('stale-set')

    refreshSetMetrics(db)

    const row = db.prepare('SELECT * FROM sets WHERE id = ?').get('stale-set') as {
      product_type: string | null
      box_price: number | null
      ev_per_box: number | null
      rip_or_singles_verdict: string | null
    }
    expect(row.product_type).toBeNull()
    expect(row.box_price).toBeNull()
    expect(row.ev_per_box).toBeNull()
    expect(row.rip_or_singles_verdict).toBeNull()
  })

  it('catalogued set with no sealed_products snapshots renders "Awaiting sealed price"', () => {
    // sv7 is catalogued but we seed no sealed_products rows.
    seedSet(db, 'sv7', { name: 'Stellar Crown', total_cards: 175 })
    seedCards(db, 'sv7', makeRealisticCards('sv7', 175))

    refreshSetMetrics(db)

    const row = db.prepare('SELECT * FROM sets WHERE id = ?').get('sv7') as {
      product_type: string | null
      product_packs: number | null
      box_price: number | null
      ev_per_box: number | null
      rip_or_singles_verdict: string | null
    }

    expect(row.product_type).toBe('bb')
    expect(row.product_packs).toBe(36)
    expect(row.box_price).toBeNull()
    expect(row.ev_per_box).toBeNull()
    expect(row.rip_or_singles_verdict).toContain('Awaiting sealed')
  })

  it('catalogued set with a snapshot but too few priced cards renders "Awaiting card prices"', () => {
    seedSet(db, 'me3', { name: 'Perfect Order', release_date: '2026-03-27', total_cards: 124 })
    seedSealedSnapshot(db, 'me3', 'bb', 204, 36)
    // Only 5 priced cards — below the MIN_PRICED_CARDS_FOR_EV threshold.
    seedCards(db, 'me3', makeRealisticCards('me3', 5))

    refreshSetMetrics(db)

    const row = db.prepare('SELECT * FROM sets WHERE id = ?').get('me3') as {
      product_type: string | null
      box_price: number | null
      ev_per_box: number | null
      set_chase_score: number | null
      rip_or_singles_verdict: string | null
    }

    expect(row.product_type).toBe('bb')
    expect(row.box_price).toBe(204)
    expect(row.ev_per_box).toBeNull()
    expect(row.set_chase_score).toBeNull()
    expect(row.rip_or_singles_verdict).toContain('Awaiting card')
  })

  it('catalogued set with a snapshot and realistic card pricing produces positive EV', () => {
    seedSet(db, 'sv7', { name: 'Stellar Crown', release_date: '2024-09-13', total_cards: 175 })
    seedSealedSnapshot(db, 'sv7', 'bb', 288, 36)
    seedCards(db, 'sv7', makeRealisticCards('sv7', 175))

    refreshSetMetrics(db)

    const row = db.prepare('SELECT * FROM sets WHERE id = ?').get('sv7') as {
      product_type: string | null
      box_price: number | null
      ev_per_box: number | null
      set_chase_score: number | null
      rip_or_singles_verdict: string | null
    }

    expect(row.product_type).toBe('bb')
    expect(row.box_price).toBe(288)
    expect(row.ev_per_box).not.toBeNull()
    expect(row.ev_per_box!).toBeGreaterThan(0)
    expect(row.set_chase_score).not.toBeNull()
    expect(row.rip_or_singles_verdict).not.toBeNull()
    expect(row.rip_or_singles_verdict).not.toContain('Awaiting')
  })

  it('consensus uses the median of multiple snapshots, not a single stale one', () => {
    // If a buggy "seed" function ever comes back and inserts a far-off
    // price (e.g. $99), two real scraper rows should outvote it.
    seedSet(db, 'sv7', { name: 'Stellar Crown', total_cards: 175 })
    seedSealedSnapshot(db, 'sv7', 'bb', 99, 36, 'phantom-seed')
    seedSealedSnapshot(db, 'sv7', 'bb', 288, 36, 'tcgplayer')
    seedSealedSnapshot(db, 'sv7', 'bb', 290, 36, 'pricecharting')
    seedCards(db, 'sv7', makeRealisticCards('sv7', 175))

    refreshSetMetrics(db)

    const row = db.prepare('SELECT box_price FROM sets WHERE id = ?').get('sv7') as { box_price: number }
    // Median of [99, 288, 290] sorted ascending is 288. With outlier
    // filtering (> 2× or < 0.5× median) the $99 is dropped and we end
    // up at 289 (median of 288, 290 ≈ 289).
    expect(row.box_price).toBeGreaterThanOrEqual(288)
    expect(row.box_price).toBeLessThanOrEqual(290)
  })

  it('sub-set catalog entries are short-circuited with zeroed metrics', () => {
    seedSet(db, 'swsh12tg', { name: 'Silver Tempest Trainer Gallery', total_cards: 30 })
    seedCards(db, 'swsh12tg', makeRealisticCards('swsh12tg', 30))

    refreshSetMetrics(db)

    const row = db.prepare('SELECT * FROM sets WHERE id = ?').get('swsh12tg') as {
      product_type: string | null
      ev_per_box: number | null
      rip_or_singles_verdict: string | null
    }

    expect(row.product_type).toBe('sub')
    expect(row.ev_per_box).toBe(0)
    expect(row.rip_or_singles_verdict).toContain('Sub-set')
  })

  it('regression guard: EV is not crushed by the old sub-set dampener', () => {
    // Before the fix, 25 priced cards triggered the sub-set dampener and
    // multiplied EV by 0.12. With 25 chase-heavy cards we should land in
    // a three-digit EV, not single-digit.
    seedSet(db, 'sv7', { name: 'Stellar Crown', total_cards: 175 })
    seedSealedSnapshot(db, 'sv7', 'bb', 288, 36)
    const fewCards: SeedCard[] = []
    for (let i = 0; i < 25; i++) {
      fewCards.push({
        id: `sv7-chase-${i}`,
        rarity: i < 18 ? 'Rare Holo' : i < 22 ? 'Ultra Rare' : 'Special Illustration Rare',
        market_price: i < 18 ? 3 : i < 22 ? 25 : 150,
        desirability: 8,
        pullCost: 7,
      })
    }
    seedCards(db, 'sv7', fewCards)

    refreshSetMetrics(db)

    const row = db.prepare('SELECT ev_per_box FROM sets WHERE id = ?').get('sv7') as {
      ev_per_box: number | null
    }
    expect(row.ev_per_box).not.toBeNull()
    expect(row.ev_per_box!).toBeGreaterThan(100)
  })

  it('all four ME-era sets are catalogued and compute correctly once snapshots exist', () => {
    const meSets: Array<[string, 'bb' | 'etb', number]> = [
      ['me1', 'bb', 250],
      ['me2', 'bb', 347],
      ['me2pt5', 'etb', 145],
      ['me3', 'bb', 204],
    ]
    for (const [id, type, price] of meSets) {
      seedSet(db, id, { name: id, total_cards: 150 })
      seedSealedSnapshot(db, id, type, price, type === 'bb' ? 36 : 9)
      seedCards(db, id, makeRealisticCards(id, 150))
    }

    refreshSetMetrics(db)

    for (const [id, expectedType, expectedPrice] of meSets) {
      const row = db
        .prepare('SELECT product_type, box_price, ev_per_box FROM sets WHERE id = ?')
        .get(id) as { product_type: string | null; box_price: number | null; ev_per_box: number | null }
      expect(row.product_type, `product_type for ${id}`).toBe(expectedType)
      expect(row.box_price, `box_price for ${id}`).toBe(expectedPrice)
      expect(row.ev_per_box, `ev_per_box for ${id}`).toBeGreaterThan(0)
    }
  })
})

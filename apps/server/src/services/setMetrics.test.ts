import { describe, expect, it, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { refreshSetMetrics } from './setMetrics.js'
import { openMemoryDb } from '../test/helpers.js'

// Sanity-check invariants for the per-set EV / chase / verdict pipeline.
//
// What we care about:
//   1. Unknown sets (not in PRODUCT_CATALOG and not in PRODUCT_LOOKUP) are
//      not given phantom fallback prices. The old $144 / 36-pack fallback
//      is gone — uncatalogued sets should come out with product_type NULL
//      so the UI filter can hide them.
//   2. Sub-sets are short-circuited with product_type='sub' so they can be
//      filtered out.
//   3. A catalogued set with no priced cards yet reports product_type but
//      leaves ev_per_box / set_chase_score NULL and a "pending" verdict.
//   4. A catalogued set with plenty of priced cards produces a finite,
//      positive EV, a finite chase score, and a non-"pending" verdict.
//   5. The stale-$144-fallback bug is actively repaired on re-run: if a set
//      has phantom values from a prior run, refreshing clears them.
//   6. The old "sub-set dampener" bug (EV × 0.12 when cards.length < 50)
//      is gone — a real set with 25 priced cards should still get a
//      reasonable EV, not a silently crushed one.

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

function makeRealisticCards(setId: string, count: number, priceMix: number[] = []): SeedCard[] {
  // Build a plausible rarity distribution so the EV math hits multiple tiers.
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
    out.push({
      id: `${setId}-${i}`,
      rarity,
      market_price: priceMix[i] ?? price,
      desirability: 7,
      pullCost: 6,
    })
  }
  return out
}

describe('refreshSetMetrics', () => {
  let db: Database.Database

  beforeEach(() => {
    db = openMemoryDb()
  })

  it('uncatalogued set gets NULL product_type so the UI can filter it out', () => {
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

  it('clears a stale $144 phantom-price row from a prior refresh', () => {
    seedSet(db, 'stale-set', { name: 'Stale Phantom' })
    // Simulate what the old code used to write for uncatalogued sets.
    db.prepare(
      `UPDATE sets SET product_type = 'bb', product_packs = 36,
       box_price = 144, box_price_verified = 0,
       ev_per_box = 500, set_chase_score = 5, rip_or_singles_verdict = '🔴 Rip packs (EV-positive)'
       WHERE id = ?`,
    ).run('stale-set')
    seedCards(db, 'stale-set', makeRealisticCards('stale-set', 200))

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

  it('a catalogued set with no priced cards yet reports product_type but NULL EV + pending verdict', () => {
    // me3 Perfect Order is in the catalog but we seed zero priced cards here.
    seedSet(db, 'me3', { name: 'Perfect Order', release_date: '2026-03-27', total_cards: 124 })

    refreshSetMetrics(db)

    const row = db.prepare('SELECT * FROM sets WHERE id = ?').get('me3') as {
      product_type: string | null
      product_packs: number | null
      box_price: number | null
      ev_per_box: number | null
      set_chase_score: number | null
      rip_or_singles_verdict: string | null
    }

    expect(row.product_type).toBe('bb')
    expect(row.product_packs).toBe(36)
    expect(row.box_price).toBeGreaterThan(0)
    expect(row.ev_per_box).toBeNull()
    expect(row.set_chase_score).toBeNull()
    expect(row.rip_or_singles_verdict).toContain('Awaiting')
  })

  it('a catalogued set with realistic card pricing produces positive EV and a non-pending verdict', () => {
    // sv7 Stellar Crown is a standard 36-pack BB with a static lookup entry.
    seedSet(db, 'sv7', { name: 'Stellar Crown', release_date: '2024-09-13', total_cards: 175 })
    seedCards(db, 'sv7', makeRealisticCards('sv7', 175))

    refreshSetMetrics(db)

    const row = db.prepare('SELECT * FROM sets WHERE id = ?').get('sv7') as {
      product_type: string | null
      ev_per_box: number | null
      set_chase_score: number | null
      rip_or_singles_verdict: string | null
    }

    expect(row.product_type).toBe('bb')
    expect(row.ev_per_box).not.toBeNull()
    expect(row.ev_per_box!).toBeGreaterThan(0)
    expect(row.set_chase_score).not.toBeNull()
    expect(row.rip_or_singles_verdict).not.toBeNull()
    expect(row.rip_or_singles_verdict).not.toContain('Awaiting')
    expect(row.rip_or_singles_verdict).not.toContain('Sub-set')
  })

  it('EV ratio is in a sane range for a typical BB — not crushed to 12% of its real value', () => {
    // Regression test for the old `subSetDampen = cards.length < 50 ? 0.12 : 1`
    // bug. Before the fix, a set with 25 priced cards would have its EV
    // multiplied by 0.12 even though it's a normal BB, just early in its life.
    // Now: 25 priced cards is below MIN_PRICED_CARDS_FOR_EV (20), so we use
    // exactly 25, which is above the threshold. EV should be undampened.
    seedSet(db, 'sv7', { name: 'Stellar Crown', release_date: '2024-09-13', total_cards: 175 })
    // Give it 25 cards with chase-like prices to make the bug visible if it
    // regressed (0.12x dampening would drop EV below sealed price).
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

    const row = db.prepare('SELECT box_price, ev_per_box FROM sets WHERE id = ?').get('sv7') as {
      box_price: number | null
      ev_per_box: number | null
    }

    // With the old 0.12 dampener, EV on this card set would be ~$60-80, far
    // below the ~$300 static box price → bogus "Buy singles" verdict. Without
    // the dampener, EV should land in a realistic three-digit range.
    expect(row.ev_per_box).not.toBeNull()
    expect(row.ev_per_box!).toBeGreaterThan(100)
  })

  it('sub-sets are marked with product_type = sub and zeroed metrics', () => {
    // swsh12tg is a trainer gallery sub-set in the lookup.
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

  it('Mega Evolution era sets (me1..me3) are catalogued with correct product types', () => {
    // Seed all four ME-era sets with enough cards to compute EV.
    const meSets: Array<[string, 'bb' | 'etb']> = [
      ['me1', 'bb'],
      ['me2', 'bb'],
      ['me2pt5', 'etb'],
      ['me3', 'bb'],
    ]
    for (const [id] of meSets) {
      seedSet(db, id, { name: id, total_cards: 150 })
      seedCards(db, id, makeRealisticCards(id, 150))
    }

    refreshSetMetrics(db)

    for (const [id, expectedType] of meSets) {
      const row = db.prepare('SELECT product_type, box_price, ev_per_box FROM sets WHERE id = ?').get(id) as {
        product_type: string | null
        box_price: number | null
        ev_per_box: number | null
      }
      expect(row.product_type, `product_type for ${id}`).toBe(expectedType)
      expect(row.box_price, `box_price for ${id}`).toBeGreaterThan(0)
      expect(row.ev_per_box, `ev_per_box for ${id}`).toBeGreaterThan(0)
    }
  })
})

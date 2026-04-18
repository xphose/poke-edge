import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyPcCsv, parsePcCsv } from './pricechartingCsv.js'

function makeTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE cards (
      id TEXT PRIMARY KEY,
      name TEXT,
      set_id TEXT,
      pricecharting_id TEXT,
      pricecharting_median REAL,
      pc_price_raw REAL,
      pc_price_grade7 REAL,
      pc_price_grade8 REAL,
      pc_price_grade9 REAL,
      pc_price_grade95 REAL,
      pc_price_psa10 REAL,
      pc_price_bgs10 REAL
    );
    CREATE TABLE card_grade_history (
      card_id TEXT NOT NULL,
      grade TEXT NOT NULL,
      ts TEXT NOT NULL,
      price REAL NOT NULL,
      source TEXT NOT NULL DEFAULT 'pricecharting-csv',
      PRIMARY KEY (card_id, grade, ts)
    );
  `)
  return db
}

// Real rows pulled from a 2026-04-18 PC CSV download; phantom/lone rows
// constructed by counting columns against the actual header (27 fields).
const SAMPLE_CSV = `id,console-name,product-name,loose-price,cib-price,new-price,graded-price,box-only-price,manual-only-price,bgs-10-price,condition-17-price,condition-18-price,gamestop-price,gamestop-trade-price,retail-loose-buy,retail-loose-sell,retail-cib-buy,retail-cib-sell,retail-new-buy,retail-new-sell,upc,sales-volume,genre,tcg-id,asin,epid,release-date
6277151,Pokemon Paldean Fates,Mew ex #232,$748.75,$542.11,$686.50,$781.82,$831.11,$2325.00,$3023.00,$1255.00,$425.01,,,$494.40,$824.00,$357.60,$596.00,$453.00,$755.00,,2181,Pokemon Card,534919,,,2024-01-26
9999999,Pokemon Test,Phantom Card,$0.00,,,,,,,,,,,,,,,,,,0,Pokemon Card,,,,
1111111,Pokemon Other,Lone Card #1,$10.00,$15.00,$20.00,$25.00,$30.00,$50.00,$60.00,,,,,,,,,,,,99,Pokemon Card,777,,,2020-01-01`

describe('parsePcCsv', () => {
  it('parses prices stripping $ and converting empty cells to null', () => {
    const rows = parsePcCsv(SAMPLE_CSV)
    expect(rows).toHaveLength(3)
    const mew = rows.find((r) => r.id === '6277151')!
    expect(mew.productName).toBe('Mew ex #232')
    expect(mew.consoleName).toBe('Pokemon Paldean Fates')
    expect(mew.loosePrice).toBe(748.75)
    expect(mew.psa10Price).toBe(2325)
    expect(mew.bgs10Price).toBe(3023)
    expect(mew.salesVolume).toBe(2181)
    expect(mew.tcgId).toBe('534919')
    expect(mew.releaseDate).toBe('2024-01-26')
  })

  it('treats $0.00 as null (matches the existing pennies(>0) convention)', () => {
    const rows = parsePcCsv(SAMPLE_CSV)
    const phantom = rows.find((r) => r.id === '9999999')!
    expect(phantom.loosePrice).toBeNull()
    expect(phantom.grade7Price).toBeNull()
  })

  it('skips rows with mismatched column counts (defensive against future PC quoting)', () => {
    const broken = SAMPLE_CSV + '\n6277151,bad,row,with,too,few,cols'
    const rows = parsePcCsv(broken)
    expect(rows).toHaveLength(3)
  })
})

describe('applyPcCsv', () => {
  it('updates only matched cards and appends a daily snapshot per grade', () => {
    const db = makeTestDb()
    db.prepare(
      `INSERT INTO cards (id, name, set_id, pricecharting_id) VALUES
        ('sv4pt5-232', 'Mew ex',  'sv4pt5', '6277151'),
        ('sv4pt5-001', 'Bulbasaur', 'sv4pt5', '1111111'),
        ('sv4pt5-099', 'Unmatched', 'sv4pt5', NULL)`,
    ).run()

    const rows = parsePcCsv(SAMPLE_CSV)
    const stats = applyPcCsv(db, rows)
    expect(stats.cardsUpdated).toBe(2)
    expect(stats.unmatchedPcIds).toBe(0)

    const mew = db.prepare(`SELECT * FROM cards WHERE id = 'sv4pt5-232'`).get() as any
    expect(mew.pricecharting_median).toBe(748.75)
    expect(mew.pc_price_raw).toBe(748.75)
    expect(mew.pc_price_psa10).toBe(2325)

    const unchanged = db.prepare(`SELECT * FROM cards WHERE id = 'sv4pt5-099'`).get() as any
    expect(unchanged.pricecharting_median).toBeNull()

    const grades = db
      .prepare(`SELECT grade, price FROM card_grade_history WHERE card_id = 'sv4pt5-232' ORDER BY grade`)
      .all() as { grade: string; price: number }[]
    expect(grades.map((g) => g.grade).sort()).toEqual(
      ['bgs10', 'grade7', 'grade8', 'grade9', 'grade95', 'psa10', 'raw'].sort(),
    )
    const psa10 = grades.find((g) => g.grade === 'psa10')!
    expect(psa10.price).toBe(2325)
  })

  it('counts cards whose pricecharting_id is missing from the CSV as unmatched', () => {
    const db = makeTestDb()
    db.prepare(
      `INSERT INTO cards (id, name, set_id, pricecharting_id) VALUES
        ('foo-1', 'foo', 'foo', '6277151'),
        ('foo-2', 'bar', 'foo', '5555555')`,
    ).run()
    const stats = applyPcCsv(db, parsePcCsv(SAMPLE_CSV))
    expect(stats.cardsUpdated).toBe(1)
    expect(stats.unmatchedPcIds).toBe(1)
  })

  it('is idempotent within a UTC day (re-running same day → 0 new grade rows)', () => {
    const db = makeTestDb()
    db.prepare(
      `INSERT INTO cards (id, name, set_id, pricecharting_id) VALUES ('a', 'a', 'x', '6277151')`,
    ).run()
    const rows = parsePcCsv(SAMPLE_CSV)
    const first = applyPcCsv(db, rows)
    const second = applyPcCsv(db, rows)
    expect(first.gradeHistoryRowsInserted).toBeGreaterThan(0)
    expect(second.gradeHistoryRowsInserted).toBe(0)
  })

  it('skips null-priced grades (does not write 0/null to card_grade_history)', () => {
    const db = makeTestDb()
    db.prepare(
      `INSERT INTO cards (id, name, set_id, pricecharting_id) VALUES ('phantom', 'p', 'x', '9999999')`,
    ).run()
    const stats = applyPcCsv(db, parsePcCsv(SAMPLE_CSV))
    expect(stats.cardsUpdated).toBe(1)
    expect(stats.gradeHistoryRowsInserted).toBe(0)
  })
})

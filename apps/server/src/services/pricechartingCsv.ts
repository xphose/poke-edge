import type Database from 'better-sqlite3'
import { config } from '../config.js'

/**
 * PriceCharting bulk CSV ingest.
 *
 * Why this exists: the per-product `/api/product?id=…` API + HTML chart-scrape
 * approach in `pricechartingBackfill.ts` makes O(N) HTTP requests across an
 * IP-rate-limited Cloudflare frontend. After a few thousand requests the prod
 * IP gets soft-banned (instant 403s for hours/days). The bulk
 * `/price-guide/download-custom?category=pokemon-cards` endpoint returns the
 * ENTIRE catalog (~83k Pokémon products, ~12 MB) in a single CSV — one HTTP
 * request, no rate-limit exposure.
 *
 * Coverage: any card we've already matched (i.e. has `pricecharting_id` set)
 * gets a price refresh + a fresh `card_grade_history` snapshot row in O(1)
 * per card. The CSV does NOT replace Phase 1 fuzzy matching for cards we've
 * never matched (it carries its own opaque `tcg-id` that is TCGPlayer's, not
 * pokemontcg.io's, so we can't auto-join newcomers — that still needs the
 * per-card `matchCard` call once Cloudflare lets us back in).
 */

const PC_BASE = 'https://www.pricecharting.com'
const PC_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export interface PcCsvRow {
  id: string
  consoleName: string
  productName: string
  loosePrice: number | null
  grade7Price: number | null
  grade8Price: number | null
  grade9Price: number | null
  grade95Price: number | null
  psa10Price: number | null
  bgs10Price: number | null
  salesVolume: number | null
  tcgId: string | null
  releaseDate: string | null
}

/**
 * Parse a "$1,234.56" or "$0.50" cell into a number, or null for empty/junk.
 * PriceCharting uses literal `$` prefix and standard US formatting; missing
 * values are empty strings.
 */
function parsePrice(cell: string): number | null {
  if (!cell) return null
  const cleaned = cell.replace(/[$,\s]/g, '')
  if (!cleaned) return null
  const n = parseFloat(cleaned)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Minimal CSV parser tuned for the PriceCharting export format. The export
 * does NOT quote fields and never embeds commas inside cells (we sampled
 * 83k rows on 2026-04-18 — all rows had exactly 27 columns). A split-on-comma
 * is correct for this specific feed and ~10× faster than papaparse for 12 MB.
 *
 * If PC ever starts quoting fields we'll see column-count mismatches and
 * `parsePcCsv` will skip those rows rather than mis-parse them.
 */
export function parsePcCsv(csv: string): PcCsvRow[] {
  const lines = csv.split('\n')
  if (lines.length < 2) return []
  const header = lines[0].split(',').map((s) => s.trim())
  const idx = (name: string) => header.indexOf(name)

  const iId = idx('id')
  const iCon = idx('console-name')
  const iProd = idx('product-name')
  const iLoose = idx('loose-price')
  const iCib = idx('cib-price')
  const iNew = idx('new-price')
  const iGraded = idx('graded-price')
  const iBox = idx('box-only-price')
  const iManual = idx('manual-only-price')
  const iBgs10 = idx('bgs-10-price')
  const iSales = idx('sales-volume')
  const iTcg = idx('tcg-id')
  const iRelease = idx('release-date')

  if (iId < 0 || iLoose < 0) {
    throw new Error(`PC CSV missing required columns; header: ${header.slice(0, 10).join(',')}…`)
  }

  const expectedCols = header.length
  const rows: PcCsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const cols = line.split(',')
    if (cols.length !== expectedCols) continue
    const id = cols[iId]?.trim()
    if (!id) continue
    const sales = cols[iSales]?.trim()
    rows.push({
      id,
      consoleName: cols[iCon] ?? '',
      productName: cols[iProd] ?? '',
      loosePrice: parsePrice(cols[iLoose]),
      grade7Price: parsePrice(cols[iCib]),
      grade8Price: parsePrice(cols[iNew]),
      grade9Price: parsePrice(cols[iGraded]),
      grade95Price: parsePrice(cols[iBox]),
      psa10Price: parsePrice(cols[iManual]),
      bgs10Price: parsePrice(cols[iBgs10]),
      salesVolume: sales ? parseInt(sales, 10) || null : null,
      tcgId: cols[iTcg]?.trim() || null,
      releaseDate: cols[iRelease]?.trim() || null,
    })
  }
  return rows
}

/**
 * Download the bulk Pokémon-cards CSV. Single HTTP call, ~12 MB, ~80k rows.
 * Times out after 60s — the endpoint is normally fast (<5s) so anything
 * slower means something is wrong.
 */
export async function downloadPcCsv(token: string): Promise<string> {
  const url = `${PC_BASE}/price-guide/download-custom?t=${token}&category=pokemon-cards`
  const resp = await fetch(url, {
    headers: { 'User-Agent': PC_UA, Accept: 'text/csv,*/*' },
    signal: AbortSignal.timeout(60_000),
  })
  if (!resp.ok) {
    const head = (await resp.text()).slice(0, 200).replace(/\s+/g, ' ')
    throw new Error(`PC CSV download failed: HTTP ${resp.status} body[:200]="${head}"`)
  }
  return resp.text()
}

export interface CsvIngestStats {
  rowsParsed: number
  cardsUpdated: number
  gradeHistoryRowsInserted: number
  unmatchedPcIds: number
  durationMs: number
}

/**
 * Apply a parsed CSV to the local DB in a single transaction:
 *   1. UPDATE cards (price columns) for every card whose `pricecharting_id`
 *      appears in the CSV. Sets `pricecharting_median = loose-price` to keep
 *      the existing aggregator consumers happy.
 *   2. INSERT a fresh `card_grade_history` snapshot row per (card, grade)
 *      with today's date — gives the chart UI a daily data point even if we
 *      never get to the per-card HTML scrape.
 *
 * Idempotent: card_grade_history PK is (card_id, grade, ts) so re-running on
 * the same day is a no-op (INSERT OR IGNORE).
 */
export function applyPcCsv(db: Database.Database, rows: PcCsvRow[]): CsvIngestStats {
  const t0 = Date.now()
  const byPcId = new Map<string, PcCsvRow>()
  for (const r of rows) byPcId.set(r.id, r)

  const matched = db
    .prepare(`SELECT id, pricecharting_id FROM cards WHERE pricecharting_id IS NOT NULL`)
    .all() as { id: string; pricecharting_id: string }[]

  const updateCard = db.prepare(
    `UPDATE cards SET
       pricecharting_median = ?,
       pc_price_raw = ?,
       pc_price_grade7 = ?,
       pc_price_grade8 = ?,
       pc_price_grade9 = ?,
       pc_price_grade95 = ?,
       pc_price_psa10 = ?,
       pc_price_bgs10 = ?
     WHERE id = ?`,
  )
  const insertGrade = db.prepare(
    `INSERT OR IGNORE INTO card_grade_history (card_id, grade, ts, price, source)
     VALUES (?, ?, ?, ?, 'pricecharting-csv')`,
  )

  // ISO date (YYYY-MM-DD) — one snapshot per UTC day so re-running the
  // ingest within the same day doesn't duplicate rows (PK conflict → ignore).
  const today = new Date().toISOString().slice(0, 10)

  let cardsUpdated = 0
  let gradeRows = 0
  let unmatched = 0

  const apply = db.transaction(() => {
    for (const card of matched) {
      const row = byPcId.get(card.pricecharting_id)
      if (!row) {
        unmatched++
        continue
      }
      updateCard.run(
        row.loosePrice, row.loosePrice,
        row.grade7Price, row.grade8Price, row.grade9Price,
        row.grade95Price, row.psa10Price, row.bgs10Price,
        card.id,
      )
      cardsUpdated++

      const grades: [string, number | null][] = [
        ['raw', row.loosePrice],
        ['grade7', row.grade7Price],
        ['grade8', row.grade8Price],
        ['grade9', row.grade9Price],
        ['grade95', row.grade95Price],
        ['psa10', row.psa10Price],
        ['bgs10', row.bgs10Price],
      ]
      for (const [grade, price] of grades) {
        if (price == null) continue
        const result = insertGrade.run(card.id, grade, today, price)
        if (result.changes > 0) gradeRows++
      }
    }
  })
  apply()

  return {
    rowsParsed: rows.length,
    cardsUpdated,
    gradeHistoryRowsInserted: gradeRows,
    unmatchedPcIds: unmatched,
    durationMs: Date.now() - t0,
  }
}

let csvIngestRunning = false

/**
 * Convenience one-shot used by both the admin route and the CLI: download,
 * parse, apply. Single-flight (concurrency-guarded) so a double-click on the
 * admin button can't kick off two parallel transactions.
 */
export async function runPcCsvIngest(db: Database.Database): Promise<CsvIngestStats> {
  if (csvIngestRunning) {
    throw new Error('PC CSV ingest already running on this node')
  }
  if (!config.pricechartingApiKey) {
    throw new Error('PRICECHARTING_API_KEY not configured')
  }
  csvIngestRunning = true
  try {
    console.log('[pc-csv] downloading bulk Pokémon CSV…')
    const csv = await downloadPcCsv(config.pricechartingApiKey)
    console.log(`[pc-csv] downloaded ${csv.length} bytes`)
    const rows = parsePcCsv(csv)
    console.log(`[pc-csv] parsed ${rows.length} rows`)
    const stats = applyPcCsv(db, rows)
    console.log(
      `[pc-csv] applied — cards updated: ${stats.cardsUpdated}, ` +
        `grade-history rows inserted: ${stats.gradeHistoryRowsInserted}, ` +
        `unmatched pc-ids: ${stats.unmatchedPcIds}, took: ${stats.durationMs}ms`,
    )
    return stats
  } finally {
    csvIngestRunning = false
  }
}

export function isPcCsvIngestRunning(): boolean {
  return csvIngestRunning
}

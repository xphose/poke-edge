/**
 * Ground-truth smoke check: prints model fields for named chase cards (run after ingest).
 * Usage: npm run validate-model -w server
 */
import { getDb } from '../db/connection.js'

const TARGETS = [
  { nameIncludes: 'Mega Charizard X', setHint: 'Fantastical' },
  { nameIncludes: 'Umbreon', setHint: 'Prismatic' },
  { nameIncludes: 'Charizard ex', setHint: 'Obsidian' },
  { nameIncludes: 'Mew', setHint: '151' },
  { nameIncludes: 'Pikachu', setHint: 'Ascended' },
  { nameIncludes: 'Mewtwo', setHint: 'Destined' },
]

function main() {
  const db = getDb()
  for (const t of TARGETS) {
    const rows = db
      .prepare(
        `SELECT c.name, s.name as set_name, c.market_price, c.predicted_price, c.valuation_flag,
                c.pull_cost_score, c.desirability_score
         FROM cards c LEFT JOIN sets s ON s.id = c.set_id
         WHERE c.name LIKE ? AND s.name LIKE ?
         ORDER BY c.market_price DESC LIMIT 3`,
      )
      .all(`%${t.nameIncludes}%`, `%${t.setHint}%`) as {
      name: string
      set_name: string
      market_price: number | null
      predicted_price: number | null
      valuation_flag: string | null
      pull_cost_score: number | null
      desirability_score: number | null
    }[]

    console.log(`\n--- ${t.nameIncludes} (${t.setHint}) ---`)
    if (!rows.length) {
      console.log('  (no rows — widen filters or run ingest)')
      continue
    }
    for (const r of rows) {
      console.log(
        `  ${r.name} | ${r.set_name} | mkt $${r.market_price ?? '—'} pred $${r.predicted_price?.toFixed?.(2) ?? '—'} | ${r.valuation_flag ?? ''}`,
      )
      console.log(
        `    pull ${r.pull_cost_score?.toFixed?.(2) ?? '—'} des ${r.desirability_score?.toFixed?.(2) ?? '—'}`,
      )
    }
  }
}

main()

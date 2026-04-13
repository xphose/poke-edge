import type { Database } from 'better-sqlite3'

/**
 * Print bucket definitions aligned with `GET /api/cards` `print=` filter logic.
 * Order is preserved for UI dropdowns.
 */
const BUCKET_CHECKS: { label: string; where: string }[] = [
  { label: 'SIR', where: `(card_type = 'SIR' OR rarity LIKE '%Special Illustration%')` },
  {
    label: 'Illustration Rare',
    where: `(card_type = 'Illustration Rare' OR (rarity LIKE '%Illustration Rare%' AND rarity NOT LIKE '%Special%'))`,
  },
  {
    label: 'Ultra Rare',
    where: `(card_type = 'Ultra Rare' OR (rarity LIKE '%Ultra Rare%' AND rarity NOT LIKE '%Hyper%'))`,
  },
  { label: 'Hyper Rare', where: `(card_type = 'Hyper Rare' OR rarity LIKE '%Hyper Rare%')` },
  { label: 'Double Rare', where: `(card_type = 'Double Rare' OR rarity LIKE '%Double Rare%')` },
  { label: 'Full Art', where: `(card_type = 'Full Art' OR rarity LIKE '%Full Art%')` },
  { label: 'Standard', where: `card_type = 'Standard'` },
  { label: 'Other', where: `card_type = 'Other'` },
]

const CANONICAL_LABELS = new Set(BUCKET_CHECKS.map((b) => b.label))

/**
 * Returns print bucket labels that have at least one card in scope.
 * When `setId` is set, only cards in that expansion are considered (matches `/api/cards?set_id=`).
 */
export function computePrintBuckets(db: Database, setId: string | null): string[] {
  const scope = setId ? `set_id = ?` : '1=1'
  const scopeParams: string[] = setId ? [setId] : []

  const out: string[] = []
  for (const { label, where } of BUCKET_CHECKS) {
    const row = db.prepare(`SELECT 1 FROM cards WHERE ${scope} AND (${where}) LIMIT 1`).get(...scopeParams)
    if (row) out.push(label)
  }

  const placeholders = [...CANONICAL_LABELS].map(() => '?').join(',')
  const extras = db
    .prepare(
      `SELECT DISTINCT card_type FROM cards
       WHERE ${scope} AND card_type IS NOT NULL
         AND card_type NOT IN (${placeholders})
       ORDER BY card_type COLLATE NOCASE ASC`,
    )
    .all(...scopeParams, ...CANONICAL_LABELS) as { card_type: string }[]

  for (const r of extras) {
    if (!out.includes(r.card_type)) out.push(r.card_type)
  }

  return out
}

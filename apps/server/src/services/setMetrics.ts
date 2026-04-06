import type Database from 'better-sqlite3'

/** Aggregate EV / chase metrics per set (heuristic). */
export function refreshSetMetrics(db: Database.Database) {
  const sets = db.prepare(`SELECT id FROM sets`).all() as { id: string }[]

  for (const s of sets) {
    const top = db
      .prepare(
        `SELECT market_price, desirability_score, pull_cost_score FROM cards
         WHERE set_id = ? AND market_price IS NOT NULL ORDER BY market_price DESC LIMIT 5`,
      )
      .all(s.id) as { market_price: number; desirability_score: number | null; pull_cost_score: number | null }[]

    if (!top.length) continue

    const avgDes =
      top.reduce((a, b) => a + (b.desirability_score ?? 5), 0) / top.length
    const avgPull =
      top.reduce((a, b) => a + (b.pull_cost_score ?? 5), 0) / top.length
    const setChase = avgDes * 0.6 + avgPull * 0.4

    const box = db.prepare(`SELECT box_price FROM sets WHERE id = ?`).get(s.id) as { box_price: number | null }
    const boxPrice = box?.box_price ?? 120
    const ev = top.reduce((a, t) => a + (t.market_price ?? 0) * 0.02, 0)

    let verdict = '🟡 EV-positive to rip'
    if (ev < boxPrice * 0.5) verdict = '🟢 Buy singles'
    if (ev > boxPrice * 1.2) verdict = '🔴 Don’t rip (chase too expensive)'

    db.prepare(
      `UPDATE sets SET ev_per_box = ?, set_chase_score = ?, rip_or_singles_verdict = ? WHERE id = ?`,
    ).run(ev, setChase, verdict, s.id)
  }
}

import { createRequire } from 'node:module'
import type Database from 'better-sqlite3'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const googleTrends = require('google-trends-api') as {
  interestOverTime: (opts: Record<string, unknown>) => Promise<string>
}

function normalizeTrendsScore(values: number[]): number {
  if (!values.length) return 5
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  return Math.min(10, Math.max(1, 1 + (avg / 100) * 9))
}

export async function refreshGoogleTrendsForCharacters(db: Database.Database, names: string[]) {
  const endTime = new Date()
  const startTime = new Date()
  startTime.setDate(startTime.getDate() - 90)

  const upd = db.prepare(
    `UPDATE character_premiums SET google_trends_score = ?, last_updated = ? WHERE character_name = ?`,
  )

  for (const name of names) {
    try {
      const raw = await googleTrends.interestOverTime({
        keyword: `${name} pokemon card`,
        startTime,
        endTime,
      })
      const parsed = JSON.parse(raw) as {
        default?: { timelineData?: { value?: number[] }[] }
      }
      const series = parsed.default?.timelineData?.map((t) => t.value?.[0] ?? 0) ?? []
      const score = normalizeTrendsScore(series)
      upd.run(score, new Date().toISOString(), name)
    } catch {
      /* rate limit or block — leave existing */
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
}

export async function refreshTrendsForAllCharacters(db: Database.Database) {
  const rows = db.prepare(`SELECT DISTINCT character_name FROM cards WHERE character_name IS NOT NULL`).all() as {
    character_name: string
  }[]
  const names = [...new Set(rows.map((r) => r.character_name))].slice(0, 40)
  await refreshGoogleTrendsForCharacters(db, names)
}

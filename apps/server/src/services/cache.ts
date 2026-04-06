import type Database from 'better-sqlite3'

export function getCached(db: Database.Database, key: string): unknown | null {
  const row = db
    .prepare(
      `SELECT payload, expires_at FROM api_cache WHERE cache_key = ?`,
    )
    .get(key) as { payload: string; expires_at: string } | undefined
  if (!row) return null
  if (new Date(row.expires_at) < new Date()) return null
  try {
    return JSON.parse(row.payload) as unknown
  } catch {
    return null
  }
}

export function setCached(
  db: Database.Database,
  key: string,
  payload: unknown,
  ttlMs: number,
) {
  const expires = new Date(Date.now() + ttlMs).toISOString()
  db.prepare(
    `INSERT INTO api_cache (cache_key, payload, expires_at)
     VALUES (@k, @p, @e)
     ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at`,
  ).run({ k: key, p: JSON.stringify(payload), e: expires })
}

export const TTL_4H = 4 * 60 * 60 * 1000

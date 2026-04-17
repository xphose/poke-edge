/**
 * Deep health endpoint for the Sentinel watchdog.
 *
 * Unlike /api/health which only confirms the server process is responding,
 * /api/canary exercises critical code paths and reports the app's internal
 * state — DB read/write, cache round-trip, data freshness, memory, and
 * cron liveness — as a structured JSON document the watchdog can parse.
 *
 * Status rules:
 *   - HTTP 200 with status "ok"       → everything within tolerance
 *   - HTTP 200 with status "degraded" → one or more warnings; app still serving
 *   - HTTP 503 with status "critical" → a core check failed; needs attention
 *
 * Anyone can hit this — intentionally. The watchdog runs on the host without
 * app credentials, and the payload contains nothing sensitive. Rate-limited
 * by the global /api limiter already in app.ts.
 */
import type { Request, Response, Router } from 'express'
import express from 'express'
import type { Database } from 'better-sqlite3'
import { cacheGet, cacheSet } from '../cache.js'

type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip'

interface Check {
  name: string
  status: CheckStatus
  detail?: string
  value?: number | string | boolean | null
  threshold?: number | string
  duration_ms?: number
}

const MB = 1024 * 1024
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function ensureHeartbeatTable(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sentinel_heartbeats (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_ping_at TEXT NOT NULL,
      ping_count INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO sentinel_heartbeats (id, last_ping_at, ping_count)
      VALUES (1, datetime('now'), 0);
  `)
}

function minutesSince(iso?: string | null): number | null {
  if (!iso) return null
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return null
  return Math.round((Date.now() - ts) / 60000)
}

function rollUp(checks: Check[]): 'ok' | 'degraded' | 'critical' {
  if (checks.some(c => c.status === 'fail')) return 'critical'
  if (checks.some(c => c.status === 'warn')) return 'degraded'
  return 'ok'
}

export function canaryRoutes(db: Database): Router {
  const router = express.Router()
  ensureHeartbeatTable(db)

  router.get('/api/canary', (_req: Request, res: Response) => {
    const startedAt = Date.now()
    const checks: Check[] = []

    // 1) DB read — count cards and sets
    try {
      const t = Date.now()
      const r = db.prepare(`SELECT
        (SELECT COUNT(*) FROM cards) as cards,
        (SELECT COUNT(*) FROM sets) as sets
      `).get() as { cards: number; sets: number }
      const cardsOk = r.cards > 0
      checks.push({
        name: 'db_read',
        status: cardsOk ? 'ok' : 'fail',
        value: r.cards,
        detail: `${r.cards} cards, ${r.sets} sets`,
        duration_ms: Date.now() - t,
      })
    } catch (e) {
      checks.push({ name: 'db_read', status: 'fail', detail: String(e) })
    }

    // 2) DB write — heartbeat upsert (also proves WAL/lock health)
    try {
      const t = Date.now()
      db.prepare(`UPDATE sentinel_heartbeats
                  SET last_ping_at = datetime('now'), ping_count = ping_count + 1
                  WHERE id = 1`).run()
      checks.push({
        name: 'db_write',
        status: 'ok',
        duration_ms: Date.now() - t,
      })
    } catch (e) {
      checks.push({ name: 'db_write', status: 'fail', detail: String(e) })
    }

    // 3) Cache round-trip — prove in-memory cache is functional
    try {
      const t = Date.now()
      const probe = `__canary_${Date.now()}`
      cacheSet(probe, { n: 42 }, 5000)
      const got = cacheGet(probe)
      const ok = !!got && got.includes('42')
      checks.push({
        name: 'cache_roundtrip',
        status: ok ? 'ok' : 'fail',
        duration_ms: Date.now() - t,
      })
    } catch (e) {
      checks.push({ name: 'cache_roundtrip', status: 'fail', detail: String(e) })
    }

    // 4) Price data freshness — newest price_history row
    try {
      const row = db.prepare(`SELECT MAX(timestamp) as ts FROM price_history`)
        .get() as { ts: string | null }
      const mins = minutesSince(row.ts)
      // Price snapshots run every 30 min; warn >2h, fail >8h
      let status: CheckStatus = 'ok'
      if (mins === null) status = 'warn'
      else if (mins > 480) status = 'fail'
      else if (mins > 120) status = 'warn'
      checks.push({
        name: 'price_snapshot_freshness',
        status,
        value: mins,
        threshold: '120m warn / 480m fail',
        detail: mins === null ? 'no rows' : `${mins}m ago`,
      })
    } catch (e) {
      checks.push({ name: 'price_snapshot_freshness', status: 'fail', detail: String(e) })
    }

    // 5) Model freshness — weekly regression + analytics bundle
    try {
      const rows = db.prepare(`SELECT model_id, computed_at FROM model_results`)
        .all() as { model_id: string; computed_at: string }[]
      if (rows.length === 0) {
        checks.push({
          name: 'model_freshness',
          status: 'warn',
          detail: 'no persisted model results yet (cold start)',
        })
      } else {
        const oldest = rows.reduce((acc, r) => {
          const m = minutesSince(r.computed_at)
          if (m === null) return acc
          return m > acc.mins ? { id: r.model_id, mins: m } : acc
        }, { id: '', mins: 0 })
        // Models run weekly; warn at >10 days, fail at >21 days
        let status: CheckStatus = 'ok'
        if (oldest.mins > 21 * 24 * 60) status = 'fail'
        else if (oldest.mins > 10 * 24 * 60) status = 'warn'
        checks.push({
          name: 'model_freshness',
          status,
          value: oldest.mins,
          detail: `oldest: ${oldest.id} ${Math.round(oldest.mins / 60 / 24)}d ago`,
          threshold: '10d warn / 21d fail',
        })
      }
    } catch (e) {
      checks.push({ name: 'model_freshness', status: 'fail', detail: String(e) })
    }

    // 6) Reddit polling liveness
    try {
      const row = db.prepare(
        `SELECT MAX(last_run) as ts FROM reddit_fetch_state`,
      ).get() as { ts: string | null }
      const mins = minutesSince(row.ts)
      // Reddit polls every 30 min; warn >2h, fail >12h
      let status: CheckStatus = 'ok'
      if (mins === null) status = 'warn'
      else if (mins > 12 * 60) status = 'fail'
      else if (mins > 2 * 60) status = 'warn'
      checks.push({
        name: 'reddit_poll_freshness',
        status,
        value: mins,
        detail: mins === null ? 'never polled' : `${mins}m ago`,
        threshold: '120m warn / 720m fail',
      })
    } catch (e) {
      // reddit_fetch_state may not exist on fresh dev DBs — treat as skip
      checks.push({ name: 'reddit_poll_freshness', status: 'skip', detail: String(e) })
    }

    // 7) Process memory — report in MB. Thresholds tuned against PM2's
    //    max_memory_restart=1200M: warn at 900 (give us time to investigate
    //    before PM2 kills), fail at 1100 (imminent restart).
    //    Skip during the first 90s of uptime — the startup ingest + analytics
    //    hydration briefly pushes RSS up, and V8 hasn't GC'd yet.
    try {
      const m = process.memoryUsage()
      const rssMb = Math.round(m.rss / MB)
      const heapMb = Math.round(m.heapUsed / MB)
      const uptime = process.uptime()
      let status: CheckStatus = 'ok'
      let detail = `rss ${rssMb}MB, heap ${heapMb}MB`
      if (uptime < 90) {
        status = 'skip'
        detail = `skipped during warm-up (uptime ${Math.round(uptime)}s). ${detail}`
      } else if (rssMb > 1100) {
        status = 'fail'
      } else if (rssMb > 900) {
        status = 'warn'
      }
      checks.push({
        name: 'process_memory',
        status,
        value: rssMb,
        detail,
        threshold: '900MB warn / 1100MB fail (vs PM2 restart at 1200MB)',
      })
    } catch (e) {
      checks.push({ name: 'process_memory', status: 'fail', detail: String(e) })
    }

    // 8) Event loop lag — quick sample. >150ms = lag, >500ms = bad
    //    (measured by the gap between setImmediate and its callback, sync approx)
    const now = Date.now()
    const loopDrift = now - startedAt  // how long it took us to get here
    const loopStatus: CheckStatus = loopDrift > 500 ? 'fail' : loopDrift > 150 ? 'warn' : 'ok'
    checks.push({
      name: 'event_loop_responsive',
      status: loopStatus,
      value: loopDrift,
      detail: `${loopDrift}ms since request entry`,
      threshold: '150ms warn / 500ms fail',
    })

    const overall = rollUp(checks)
    const payload = {
      status: overall,
      ts: new Date().toISOString(),
      uptime_s: Math.round(process.uptime()),
      node_version: process.version,
      checks,
      summary: {
        ok: checks.filter(c => c.status === 'ok').length,
        warn: checks.filter(c => c.status === 'warn').length,
        fail: checks.filter(c => c.status === 'fail').length,
        skip: checks.filter(c => c.status === 'skip').length,
      },
    }

    res.setHeader('Cache-Control', 'no-store')
    res.status(overall === 'critical' ? 503 : 200).json(payload)
  })

  return router
}

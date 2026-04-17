import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { config } from '../config.js'
import { runMigrations } from './migrate.js'

let dbInstance: Database.Database | null = null

/**
 * Open (or return cached) SQLite connection with pragmas tuned for our
 * read-heavy, single-writer workload. Safe for PM2 cluster mode: each worker
 * opens its own connection; WAL lets N readers see the database while one
 * writer commits a transaction.
 *
 * Pragma choices:
 *   journal_mode = WAL    → readers don't block the writer and vice versa
 *   synchronous  = NORMAL → safe with WAL (no risk of corruption, only
 *                           risk is losing the last-committed txn on power
 *                           loss — acceptable for a card-price DB), ~3-5x
 *                           faster than FULL
 *   busy_timeout = 10000  → wait up to 10s for the WAL lock before throwing
 *                           SQLITE_BUSY; critical once >1 worker writes
 *   temp_store   = MEMORY → ORDER BY / GROUP BY temp tables live in RAM
 *   cache_size   = -65536 → 64 MiB per-connection page cache (negative = KiB)
 *   mmap_size    = 256MB  → memory-map the DB file; OS page cache becomes
 *                           the bottleneck, not syscalls
 *   foreign_keys = ON     → enforce FK constraints (defensive; SQLite default
 *                           is OFF for backwards compat)
 */
export function getDb(): Database.Database {
  if (dbInstance) return dbInstance
  const dir = path.dirname(config.databasePath)
  fs.mkdirSync(dir, { recursive: true })
  const db = new Database(config.databasePath)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('busy_timeout = 10000')
  db.pragma('temp_store = MEMORY')
  db.pragma('cache_size = -65536')
  db.pragma('mmap_size = 268435456')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  dbInstance = db
  return db
}

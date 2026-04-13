import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function runMigrations(db: Database.Database) {
  const dir = path.join(__dirname, 'migrations')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8')
    db.exec(sql)
  }
  // Safe column additions for databases created before these columns existed
  const safeAdd = (table: string, col: string, type: string) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`)
    } catch {
      /* column already exists */
    }
  }
  safeAdd('cards', 'future_value_12m', 'REAL')
  safeAdd('cards', 'annual_growth_rate', 'REAL')
  safeAdd('cards', 'pricecharting_id', 'TEXT')
  safeAdd('price_history', 'pricecharting_median', 'REAL')
  safeAdd('sets', 'box_price_verified', 'INTEGER DEFAULT 0')
  safeAdd('sets', 'product_type', "TEXT DEFAULT 'bb'")
  safeAdd('sets', 'product_packs', 'INTEGER DEFAULT 36')
  safeAdd('sets', 'price_sources', 'INTEGER DEFAULT 0')
  safeAdd('sets', 'price_confidence', "TEXT DEFAULT 'low'")

  db.exec(`CREATE TABLE IF NOT EXISTS sealed_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    set_id TEXT NOT NULL,
    product_type TEXT NOT NULL,
    source TEXT NOT NULL,
    price REAL NOT NULL,
    packs INTEGER NOT NULL,
    fetched_at TEXT NOT NULL
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sealed_set_type ON sealed_products(set_id, product_type, fetched_at)`)

  db.exec(`CREATE TABLE IF NOT EXISTS prediction_snapshots (
    card_id TEXT NOT NULL,
    snapshot_date TEXT NOT NULL,
    predicted_price REAL,
    market_price REAL,
    valuation_flag TEXT,
    desirability_score REAL,
    pull_cost_score REAL,
    future_value_12m REAL,
    annual_growth_rate REAL,
    PRIMARY KEY (card_id, snapshot_date)
  )`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_snapshots_date ON prediction_snapshots(snapshot_date)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_snapshots_flag ON prediction_snapshots(valuation_flag)`)
}

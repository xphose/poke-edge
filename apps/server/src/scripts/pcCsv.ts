/**
 * One-shot CLI: download the PriceCharting bulk CSV and apply it to the
 * local DB. Useful for backfilling on demand or when the per-product API
 * is rate-limited.
 *
 * Usage:
 *   npm run pc:csv -w server
 *   npm run pc:csv -w server -- --csv=/tmp/pc-cards.csv     # use already-downloaded CSV
 *
 * The --csv flag exists so we can run this on a host whose IP is currently
 * Cloudflare-banned: download the file from a clean box, scp it over, then
 * run with --csv=… (no PC HTTP call needed).
 */
import { readFileSync } from 'node:fs'
import { getDb } from '../db/connection.js'
import {
  applyPcCsv,
  downloadPcCsv,
  parsePcCsv,
  runPcCsvIngest,
} from '../services/pricechartingCsv.js'
import { config } from '../config.js'

function parseArg(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`))
  return arg ? arg.slice(name.length + 3) : undefined
}

async function main() {
  const db = getDb()
  const csvPath = parseArg('csv')

  if (csvPath) {
    console.log(`[pc-csv] reading CSV from ${csvPath}`)
    const csv = readFileSync(csvPath, 'utf-8')
    const rows = parsePcCsv(csv)
    console.log(`[pc-csv] parsed ${rows.length} rows`)
    const stats = applyPcCsv(db, rows)
    console.log('[pc-csv] done:', stats)
    return
  }

  if (!config.pricechartingApiKey) {
    console.error('[pc-csv] PRICECHARTING_API_KEY not set')
    process.exit(1)
  }
  if (process.env.PC_CSV_DOWNLOAD_ONLY) {
    const csv = await downloadPcCsv(config.pricechartingApiKey)
    process.stdout.write(csv)
    return
  }
  const stats = await runPcCsvIngest(db)
  console.log('[pc-csv] done:', stats)
}

main().catch((e) => {
  console.error('[pc-csv] FAILED:', e)
  process.exit(1)
})

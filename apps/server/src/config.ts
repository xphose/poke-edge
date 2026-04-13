import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
for (const p of [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '..', '.env'),
  path.join(__dirname, '..', '..', '.env'),
]) {
  if (fs.existsSync(p)) dotenv.config({ path: p })
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  databasePath: process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'pokeedge.sqlite'),
  pokemonTcgApiKey: process.env.POKEMONTCG_API_KEY || '',
  ebayClientId: process.env.EBAY_CLIENT_ID || '',
  ebayClientSecret: process.env.EBAY_CLIENT_SECRET || '',
  ebayEnvironment: (process.env.EBAY_ENVIRONMENT || 'production') as 'sandbox' | 'production',
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:localhost@poke.edge',
  pricechartingApiKey: process.env.PRICECHARTING_API_KEY || '',
  publicAppUrl: process.env.PUBLIC_APP_URL || 'http://localhost:5173',
  pokemonTcgBase: 'https://api.pokemontcg.io/v2',
  /**
   * Sets to ingest from PokémonTCG.io (official `id` values).
   * Sword & Shield through Scarlet & Violet — pull-rate tiers default to `sv10` when not listed in pull-rate-seed.json.
   */
  targetSetIds: [
    // Sword & Shield era (approx. 2020–2023)
    'swsh1',
    'swsh2',
    'swsh3',
    'swsh35',
    'swsh4',
    'swsh45',
    'swsh45sv',
    'swsh5',
    'swsh6',
    'swsh7',
    'swsh8',
    'swsh9',
    'swsh9tg',
    'swsh10',
    'swsh10tg',
    'swsh11',
    'swsh11tg',
    'swsh12',
    'swsh12tg',
    'swsh12pt5',
    'swsh12pt5gg',
    'cel25',
    'cel25c',
    'pgo',
    // Scarlet & Violet (2023+)
    'sv1',
    'sv2',
    'sv3',
    'sv3pt5',
    'sv4',
    'sv4pt5',
    'sv5',
    'sv6',
    'sv6pt5',
    'sv7',
    'sv8',
    'sv8pt5',
    'sv9',
    'sv10',
    'zsv10pt5',
    'rsv10pt5',
  ] as string[],
}

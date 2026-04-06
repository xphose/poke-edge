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
  publicAppUrl: process.env.PUBLIC_APP_URL || 'http://localhost:5173',
  pokemonTcgBase: 'https://api.pokemontcg.io/v2',
  /** Scarlet & Violet sets to track first (API set ids). */
  targetSetIds: [
    'sv1',
    'sv3',
    'sv3.5',
    'sv4',
    'sv4.5',
    'sv6',
    'sv6.5',
    'sv7',
    'sv8',
    'sv8.5',
    'sv9.5',
    'sv10',
    'sv11',
    'sv11.5',
  ] as string[],
}

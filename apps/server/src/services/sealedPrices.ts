import type Database from 'better-sqlite3'
import { config } from '../config.js'
import { fetchWithRetry } from '../util/http.js'

type ProductType = 'bb' | 'etb' | 'sub'

interface CatalogEntry {
  setId: string
  type: ProductType
  packs: number
  parent?: string
  /** TCGPlayer product IDs for API price fetching */
  tcgIds?: number[]
  /** PriceCharting slug: e.g. "pokemon-evolving-skies" → used as /game/{slug}/booster-box */
  pcSlug?: string
}

const PRODUCT_CATALOG: CatalogEntry[] = [
  // ── Mega Evolution era (2025-2026) ─────────────────────────
  // me1 released 2025-09-26; me2 2025-11-21; me2pt5 2026-01-30 (ETB-only, no BB);
  // me3 2026-03-27. TCG IDs intentionally left off for now — PriceCharting
  // scrape is the primary signal until we lock in confirmed TCGPlayer product IDs.
  { setId: 'me1',     type: 'bb',  packs: 36, pcSlug: 'pokemon-mega-evolution' },
  { setId: 'me2',     type: 'bb',  packs: 36, pcSlug: 'pokemon-phantasmal-flames' },
  { setId: 'me2pt5',  type: 'etb', packs: 9,  pcSlug: 'pokemon-ascended-heroes' },
  { setId: 'me3',     type: 'bb',  packs: 36, pcSlug: 'pokemon-perfect-order' },
  // ── SV Booster Box sets ────────────────────────────────────
  { setId: 'sv10',  type: 'bb',  packs: 36, tcgIds: [624679],  pcSlug: 'pokemon-scarlet-violet-destined-rivals' },
  { setId: 'sv9',   type: 'bb',  packs: 36, tcgIds: [610931],  pcSlug: 'pokemon-scarlet-violet-journey-together' },
  { setId: 'sv8',   type: 'bb',  packs: 36, tcgIds: [565606],  pcSlug: 'pokemon-scarlet-violet-surging-sparks' },
  { setId: 'sv7',   type: 'bb',  packs: 36, tcgIds: [557354],  pcSlug: 'pokemon-scarlet-violet-stellar-crown' },
  { setId: 'sv6',   type: 'bb',  packs: 36, tcgIds: [543846],  pcSlug: 'pokemon-scarlet-violet-twilight-masquerade' },
  { setId: 'sv5',   type: 'bb',  packs: 36, tcgIds: [536225],  pcSlug: 'pokemon-scarlet-violet-temporal-forces' },
  { setId: 'sv4',   type: 'bb',  packs: 36, tcgIds: [512821],  pcSlug: 'pokemon-scarlet-violet-paradox-rift' },
  { setId: 'sv3',   type: 'bb',  packs: 36, tcgIds: [501257],  pcSlug: 'pokemon-scarlet-violet-obsidian-flames' },
  { setId: 'sv2',   type: 'bb',  packs: 36, tcgIds: [493975],  pcSlug: 'pokemon-scarlet-violet-paldea-evolved' },
  { setId: 'sv1',   type: 'bb',  packs: 36, tcgIds: [476452],  pcSlug: 'pokemon-scarlet-violet' },
  // ── SV ETB-only sets ───────────────────────────────────────
  { setId: 'sv8pt5', type: 'etb', packs: 9,  tcgIds: [593355],  pcSlug: 'pokemon-scarlet-violet-prismatic-evolutions' },
  { setId: 'sv6pt5', type: 'etb', packs: 9,  tcgIds: [552999],  pcSlug: 'pokemon-scarlet-violet-shrouded-fable' },
  { setId: 'sv4pt5', type: 'etb', packs: 9,  tcgIds: [528040],  pcSlug: 'pokemon-scarlet-violet-paldean-fates' },
  { setId: 'sv3pt5', type: 'etb', packs: 9,  tcgIds: [503313],  pcSlug: 'pokemon-scarlet-violet-151' },
  // ── SWSH Booster Box sets ──────────────────────────────────
  { setId: 'swsh12', type: 'bb',  packs: 36, tcgIds: [283389],  pcSlug: 'pokemon-silver-tempest' },
  { setId: 'swsh11', type: 'bb',  packs: 36, tcgIds: [277324],  pcSlug: 'pokemon-lost-origin' },
  { setId: 'swsh10', type: 'bb',  packs: 36, tcgIds: [265519],  pcSlug: 'pokemon-astral-radiance' },
  { setId: 'swsh9',  type: 'bb',  packs: 36, tcgIds: [256141],  pcSlug: 'pokemon-brilliant-stars' },
  { setId: 'swsh8',  type: 'bb',  packs: 36, tcgIds: [247654],  pcSlug: 'pokemon-fusion-strike' },
  { setId: 'swsh7',  type: 'bb',  packs: 36, tcgIds: [242436],  pcSlug: 'pokemon-evolving-skies' },
  { setId: 'swsh6',  type: 'bb',  packs: 36, tcgIds: [236258],  pcSlug: 'pokemon-chilling-reign' },
  { setId: 'swsh5',  type: 'bb',  packs: 36, tcgIds: [229277],  pcSlug: 'pokemon-battle-styles' },
  { setId: 'swsh4',  type: 'bb',  packs: 36, tcgIds: [221313],  pcSlug: 'pokemon-vivid-voltage' },
  { setId: 'swsh3',  type: 'bb',  packs: 36, tcgIds: [216853],  pcSlug: 'pokemon-darkness-ablaze' },
  { setId: 'swsh2',  type: 'bb',  packs: 36, tcgIds: [210561],  pcSlug: 'pokemon-rebel-clash' },
  { setId: 'swsh1',  type: 'bb',  packs: 36,                     pcSlug: 'pokemon-sword-shield' },
  // ── SWSH ETB / Special ─────────────────────────────────────
  { setId: 'swsh12pt5', type: 'etb', packs: 10, tcgIds: [453470], pcSlug: 'pokemon-crown-zenith' },
  { setId: 'pgo',       type: 'etb', packs: 10, tcgIds: [270708], pcSlug: 'pokemon-pokemon-go' },
  { setId: 'cel25',     type: 'etb', packs: 10, tcgIds: [242811], pcSlug: 'pokemon-celebrations' },
  { setId: 'swsh45',    type: 'etb', packs: 10, tcgIds: [228821], pcSlug: 'pokemon-shining-fates' },
  { setId: 'swsh35',    type: 'etb', packs: 10, tcgIds: [218791], pcSlug: 'pokemon-champions-path' },
  // ── SV Special Split Expansion (ETB-only in English, no BB) ─
  { setId: 'zsv10pt5', type: 'etb', packs: 9, tcgIds: [630686], pcSlug: 'pokemon-black-bolt' },
  { setId: 'rsv10pt5', type: 'etb', packs: 9, tcgIds: [630689], pcSlug: 'pokemon-white-flare' },
  // ── Sub-sets (no sealed product) ───────────────────────────
  { setId: 'swsh12pt5gg', type: 'sub', packs: 0, parent: 'swsh12pt5' },
  { setId: 'swsh12tg',    type: 'sub', packs: 0, parent: 'swsh12' },
  { setId: 'swsh11tg',    type: 'sub', packs: 0, parent: 'swsh11' },
  { setId: 'swsh10tg',    type: 'sub', packs: 0, parent: 'swsh10' },
  { setId: 'swsh9tg',     type: 'sub', packs: 0, parent: 'swsh9' },
  { setId: 'cel25c',      type: 'sub', packs: 0, parent: 'cel25' },
  { setId: 'swsh45sv',    type: 'sub', packs: 0, parent: 'swsh45' },
]

/** Map product type to the PriceCharting URL suffix */
const PC_PRODUCT_SUFFIX: Record<ProductType, string> = {
  bb: 'booster-box',
  etb: 'elite-trainer-box',
  sub: '',
}

export function getCatalogEntry(setId: string): CatalogEntry | undefined {
  return PRODUCT_CATALOG.find(e => e.setId === setId)
}

/* ── Source 1: TCGPlayer Marketplace API ─────────────────────── */

interface TcgPricePoint {
  printingType: string
  marketPrice: number | null
  listedMedianPrice: number | null
}

async function fetchTcgPlayerPrice(productId: number): Promise<number | null> {
  try {
    const url = `https://mpapi.tcgplayer.com/v2/product/${productId}/pricepoints`
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'PokeGrails/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!resp.ok) return null
    const data = (await resp.json()) as TcgPricePoint[]
    const normal = data.find(d => d.printingType === 'Normal')
    const price = normal?.marketPrice ?? normal?.listedMedianPrice ?? null
    return price && price > 0 && price < 50_000 ? price : null
  } catch {
    return null
  }
}

/* ── Source 2: PriceCharting page scrape ──────────────────────── */

async function fetchPriceChartingPrice(
  pcSlug: string,
  productType: ProductType,
): Promise<number | null> {
  const suffix = PC_PRODUCT_SUFFIX[productType]
  if (!suffix) return null
  const url = `https://www.pricecharting.com/game/${pcSlug}/${suffix}`
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    })
    if (!resp.ok) return null
    const html = await resp.text()
    // PriceCharting shows price in elements like <span class="price js-price">$XXX.XX</span>
    // or in the "used_price" td for sealed (Ungraded/Unopened)
    const patterns = [
      /id="used_price"[^>]*>.*?\$([\d,]+\.\d{2})/s,
      /id="complete_price"[^>]*>.*?\$([\d,]+\.\d{2})/s,
      /<span class="price[^"]*">\s*\$([\d,]+\.\d{2})/,
    ]
    for (const pat of patterns) {
      const m = html.match(pat)
      if (m) {
        const price = parseFloat(m[1].replace(/,/g, ''))
        if (price > 0 && price < 50_000) return price
      }
    }
    return null
  } catch {
    return null
  }
}

/* ── Source 3: eBay Browse API (median of active listings) ───── */

async function getEbayToken(): Promise<string | null> {
  if (!config.ebayClientId || !config.ebayClientSecret) return null
  const host =
    config.ebayEnvironment === 'sandbox'
      ? 'https://api.sandbox.ebay.com'
      : 'https://api.ebay.com'
  const creds = Buffer.from(`${config.ebayClientId}:${config.ebayClientSecret}`).toString('base64')
  try {
    const res = await fetchWithRetry(`${host}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
    })
    if (!res.ok) return null
    const j = (await res.json()) as { access_token?: string }
    return j.access_token ?? null
  } catch {
    return null
  }
}

const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  bb: 'Booster Box',
  etb: 'Elite Trainer Box',
  sub: '',
}

async function fetchEbaySealedPrice(
  setName: string,
  productType: ProductType,
): Promise<number | null> {
  const token = await getEbayToken()
  if (!token) return null
  const label = PRODUCT_TYPE_LABEL[productType]
  if (!label) return null
  const host =
    config.ebayEnvironment === 'sandbox'
      ? 'https://api.sandbox.ebay.com'
      : 'https://api.ebay.com'
  const q = encodeURIComponent(`Pokemon ${setName} ${label} sealed`)
  const url = `${host}/buy/browse/v1/item_summary/search?q=${q}&limit=15&filter=conditionIds:{1000}&category_ids=183454`
  try {
    const res = await fetchWithRetry(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      itemSummaries?: { price?: { value?: string } }[]
    }
    const prices = (data.itemSummaries ?? [])
      .map(i => Number(i.price?.value))
      .filter(n => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b)
    if (!prices.length) return null
    const mid = Math.floor(prices.length / 2)
    return prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2
  } catch {
    return null
  }
}

/** Readable name for eBay queries (derived from PriceCharting slug) */
function setNameFromSlug(slug: string): string {
  return slug
    .replace(/^pokemon-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

/* ── Price storage ──────────────────────────────────────────── */

export function storePriceSnapshot(
  db: Database.Database,
  setId: string,
  productType: ProductType,
  source: string,
  price: number,
  packs: number,
) {
  if (price <= 0 || price > 50_000) return
  db.prepare(
    `INSERT INTO sealed_products (set_id, product_type, source, price, packs, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(setId, productType, source, price, packs, new Date().toISOString())
}

/* ── Consensus algorithm ────────────────────────────────────── */

export interface ConsensusResult {
  price: number
  sources: number
  confidence: 'high' | 'medium' | 'low'
  packs: number
  type: ProductType
}

/**
 * Compute a consensus price from recent snapshots.
 * 1. Gather all snapshots from the last `windowDays` days
 * 2. If only 1 value, return it (low confidence)
 * 3. Compute median, then drop outliers (> 2× or < 0.5× median)
 * 4. Return median of remaining values
 */
export function computeConsensus(
  db: Database.Database,
  setId: string,
  productType: ProductType,
  windowDays = 30,
): ConsensusResult | null {
  const cutoff = new Date(Date.now() - windowDays * 86_400_000).toISOString()
  const rows = db
    .prepare(
      `SELECT price, packs FROM sealed_products
       WHERE set_id = ? AND product_type = ? AND fetched_at >= ?
       ORDER BY price`,
    )
    .all(setId, productType, cutoff) as { price: number; packs: number }[]

  if (!rows.length) return null

  const packs = rows[0].packs
  const prices = rows.map(r => r.price).sort((a, b) => a - b)

  if (prices.length === 1) {
    return { price: prices[0], sources: 1, confidence: 'low', packs, type: productType }
  }

  const rawMedian = prices[Math.floor(prices.length / 2)]
  const filtered = prices.filter(p => p >= rawMedian * 0.5 && p <= rawMedian * 2)
  if (!filtered.length) {
    return { price: rawMedian, sources: prices.length, confidence: 'low', packs, type: productType }
  }

  const finalPrice = filtered[Math.floor(filtered.length / 2)]
  const confidence: ConsensusResult['confidence'] =
    filtered.length >= 3 ? 'high' : filtered.length >= 2 ? 'medium' : 'low'

  return { price: Math.round(finalPrice * 100) / 100, sources: filtered.length, confidence, packs, type: productType }
}

/* ── Automated multi-source price refresh ─────────────────────── */

export async function refreshSealedPrices(db: Database.Database) {
  let fetched = 0
  let failed = 0

  for (const entry of PRODUCT_CATALOG) {
    if (entry.type === 'sub') continue

    let gotAny = false

    // Source 1: TCGPlayer API
    if (entry.tcgIds?.length) {
      for (const tcgId of entry.tcgIds) {
        const price = await fetchTcgPlayerPrice(tcgId)
        if (price) {
          storePriceSnapshot(db, entry.setId, entry.type, 'tcgplayer', price, entry.packs)
          fetched++
          gotAny = true
        }
        await new Promise(r => setTimeout(r, 400))
      }
    }

    // Source 2: PriceCharting (page scrape)
    if (entry.pcSlug) {
      const pcPrice = await fetchPriceChartingPrice(entry.pcSlug, entry.type)
      if (pcPrice) {
        storePriceSnapshot(db, entry.setId, entry.type, 'pricecharting', pcPrice, entry.packs)
        fetched++
        gotAny = true
      }
      await new Promise(r => setTimeout(r, 800))
    }

    // Source 3: eBay (median of active listings, if credentials present)
    if (entry.pcSlug && config.ebayClientId) {
      const ebayName = setNameFromSlug(entry.pcSlug)
      const ebayPrice = await fetchEbaySealedPrice(ebayName, entry.type)
      if (ebayPrice) {
        storePriceSnapshot(db, entry.setId, entry.type, 'ebay', ebayPrice, entry.packs)
        fetched++
        gotAny = true
      }
      await new Promise(r => setTimeout(r, 500))
    }

    if (!gotAny) failed++
  }

  console.log(`[sealed] refresh done: ${fetched} fetched, ${failed} failed`)
  return { fetched, failed }
}

/* ── Seed with researched multi-source data ─────────────────── */

export function seedSealedPrices(db: Database.Database) {
  const existing = (db.prepare(`SELECT COUNT(*) as c FROM sealed_products`).get() as { c: number }).c
  if (existing > 0) return

  const ins = db.prepare(
    `INSERT INTO sealed_products (set_id, product_type, source, price, packs, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const now = new Date().toISOString()
  const s = (setId: string, type: ProductType, source: string, price: number, packs: number) =>
    ins.run(setId, type, source, price, packs, now)

  // ── sv10 Destined Rivals BB
  s('sv10', 'bb', 'pokemonwizard', 521.25, 36)
  s('sv10', 'bb', 'pittpokeresearch', 539.91, 36)

  // ── sv9 Journey Together BB
  s('sv9', 'bb', 'pokemonwizard_a', 252.06, 36)
  s('sv9', 'bb', 'pokemonwizard_b', 222.36, 36)
  s('sv9', 'bb', 'pittpokeresearch', 252.38, 36)
  s('sv9', 'bb', 'user_report', 287, 36)

  // ── sv8pt5 Prismatic Evolutions ETB
  s('sv8pt5', 'etb', 'pokemonwizard', 176.03, 9)

  // ── sv8 Surging Sparks BB
  s('sv8', 'bb', 'pokemonwizard', 255.08, 36)
  s('sv8', 'bb', 'pittpokeresearch', 259.53, 36)

  // ── sv7 Stellar Crown BB
  s('sv7', 'bb', 'pokemonwizard', 288.48, 36)

  // ── sv6pt5 Shrouded Fable ETB
  s('sv6pt5', 'etb', 'pokemonwizard', 74.31, 9)
  s('sv6pt5', 'etb', 'pricecharting', 87.94, 9)
  s('sv6pt5', 'etb', 'user_report', 90, 9)

  // ── sv6 Twilight Masquerade BB
  s('sv6', 'bb', 'pokemonwizard', 320.58, 36)

  // ── sv5 Temporal Forces BB
  s('sv5', 'bb', 'pokemonwizard', 253.79, 36)

  // ── sv4pt5 Paldean Fates ETB
  s('sv4pt5', 'etb', 'pokemonwizard', 319.93, 9)

  // ── sv4 Paradox Rift BB
  s('sv4', 'bb', 'pokemonwizard', 246.85, 36)

  // ── sv3pt5 151 ETB
  s('sv3pt5', 'etb', 'pokemonwizard_a', 488.26, 9)
  s('sv3pt5', 'etb', 'pokemonwizard_b', 521.94, 9)

  // ── sv3 Obsidian Flames BB
  s('sv3', 'bb', 'pokemonwizard', 345.22, 36)

  // ── sv2 Paldea Evolved BB
  s('sv2', 'bb', 'pokemonwizard', 419.75, 36)

  // ── sv1 Scarlet & Violet BB
  s('sv1', 'bb', 'pokemonwizard', 269.22, 36)
  s('sv1', 'bb', 'pricecharting', 267.21, 36)

  // ── swsh12pt5 Crown Zenith ETB
  s('swsh12pt5', 'etb', 'pokemonwizard', 289.90, 10)

  // ── swsh12 Silver Tempest BB
  s('swsh12', 'bb', 'pokemonwizard', 471.01, 36)

  // ── swsh11 Lost Origin BB
  s('swsh11', 'bb', 'pokemonwizard', 733.67, 36)

  // ── swsh10 Astral Radiance BB
  s('swsh10', 'bb', 'pokemonwizard', 390.83, 36)

  // ── swsh9 Brilliant Stars BB
  s('swsh9', 'bb', 'pokemonwizard', 575.91, 36)

  // ── swsh8 Fusion Strike BB
  s('swsh8', 'bb', 'pokemonwizard', 990.28, 36)

  // ── swsh7 Evolving Skies BB
  s('swsh7', 'bb', 'pokemonwizard', 2567.47, 36)
  s('swsh7', 'bb', 'pricecharting', 2545, 36)

  // ── swsh6 Chilling Reign BB
  s('swsh6', 'bb', 'pokemonwizard', 492.65, 36)

  // ── swsh5 Battle Styles BB
  s('swsh5', 'bb', 'pokemonwizard', 184.13, 36)

  // ── swsh4 Vivid Voltage BB
  s('swsh4', 'bb', 'pokemonwizard', 200.92, 36)

  // ── swsh3 Darkness Ablaze BB
  s('swsh3', 'bb', 'pokemonwizard', 211.24, 36)

  // ── swsh2 Rebel Clash BB
  s('swsh2', 'bb', 'pokemonwizard', 274.09, 36)

  // ── swsh1 Sword & Shield BB
  s('swsh1', 'bb', 'pricecharting', 230, 36)

  // ── pgo Pokemon GO ETB
  s('pgo', 'etb', 'estimate', 100, 10)

  // ── cel25 Celebrations ETB
  s('cel25', 'etb', 'estimate', 150, 10)

  // ── swsh45 Shining Fates ETB
  s('swsh45', 'etb', 'estimate', 120, 10)

  // ── swsh35 Champion's Path ETB
  s('swsh35', 'etb', 'estimate', 120, 10)

  // ── Black Bolt ETB
  s('zsv10pt5', 'etb', 'estimate', 96, 9)

  // ── White Flare ETB
  s('rsv10pt5', 'etb', 'estimate', 98, 9)

  // ── Mega Evolution era (seeded from PriceCharting April 2026) ─────
  // Seeded to bootstrap consensus; the 12h sealed-refresh cron will add
  // fresher snapshots and the consensus median will move with the market.
  s('me1',    'bb',  'pricecharting', 250.74, 36)
  s('me2',    'bb',  'pricecharting', 346.92, 36)
  s('me2pt5', 'etb', 'pricecharting', 144.76, 9)
  s('me3',    'bb',  'pricecharting', 203.88, 36)
}

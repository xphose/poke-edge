const base = ''

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

export type SetMeta = {
  id: string
  name: string | null
  release_date: string | null
  series: string | null
  total_cards: number | null
}

export type CardFiltersMeta = {
  sets: SetMeta[]
  setIds: string[]
  printBuckets: string[]
}

export type CardRow = {
  id: string
  name: string
  set_id: string | null
  rarity: string | null
  card_type: string | null
  image_url: string | null
  pull_cost_score: number | null
  desirability_score: number | null
  predicted_price: number | null
  market_price: number | null
  ebay_median: number | null
  valuation_flag: string | null
  reddit_buzz_score: number | null
  trends_score?: number | null
  explain_json: string | null
  undervalued_since: string | null
  future_value_12m: number | null
  annual_growth_rate: number | null
  ai_score?: number
  ai_decision?: 'BUY' | 'WATCH' | 'PASS'
  spark_30d?: { p: number }[]
}

/** Paginated list from GET /api/cards */
export type CardsListResponse = {
  items: CardRow[]
  total: number
  limit: number
  offset: number
}

/**
 * Build a search-engine-friendly query string for a specific card printing.
 * Includes collector number and set name to avoid blending across printings.
 */
export function buildCardSearchQuery(
  name: string,
  cardId: string,
  setName: string | null | undefined,
  suffix = 'pokemon card',
): string {
  const idx = cardId.lastIndexOf('-')
  const num = idx >= 0 ? cardId.slice(idx + 1) : ''
  return [name, num, setName, suffix].filter(Boolean).join(' ')
}

export type CardInvestmentInsight = {
  card_name: string
  set: string
  grade: string
  composite_score: number
  signal_breakdown: {
    momentum: number
    pop_scarcity: number
    sentiment: number
    lifecycle: number
  }
  pokemon_tier: 'S' | 'A' | 'B' | 'C'
  reprint_risk: 'low' | 'medium' | 'high'
  decision: 'BUY' | 'WATCH' | 'PASS'
  investment_horizon: 'short' | 'medium' | 'long'
  fair_value_estimate: number
  negotiation: {
    opening_offer: number
    ideal_price: number
    max_pay: number
    walk_away_script: string
  }
  thesis: string
  red_flags: string[]
  catalyst_events: string[]
  comparable_cards: string[]
}

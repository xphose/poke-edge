const base = ''

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

export type CardRow = {
  id: string
  name: string
  set_id: string | null
  rarity: string | null
  image_url: string | null
  pull_cost_score: number | null
  desirability_score: number | null
  predicted_price: number | null
  market_price: number | null
  ebay_median: number | null
  valuation_flag: string | null
  reddit_buzz_score: number | null
  explain_json: string | null
  undervalued_since: string | null
}

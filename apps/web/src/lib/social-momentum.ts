import type { CardRow } from '@/lib/api'

export type SocialMomentumRow = {
  id: string
  name: string
  marketPrice: number
  predictedPrice: number | null
  redditBuzz: number
  momentumScore: number
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export function computeMomentumScore(redditBuzz: number | null | undefined, trendsScore: number | null | undefined): number {
  const redditNorm = clamp((redditBuzz ?? 0) / 20, 0, 1)
  const trendsNorm = clamp((trendsScore ?? 0) / 10, 0, 1)
  if (redditNorm > 0.05) return redditNorm * 0.6 + trendsNorm * 0.4
  return trendsNorm * 0.7
}

function characterKey(name: string): string {
  return name.split(/\s+(ex|vmax|vstar|gx|v|V)\b/i)[0].toLowerCase().trim()
}

export function buildSocialMomentumRows(cards: CardRow[], limit = 10): SocialMomentumRow[] {
  const rows = cards
    .filter((c) => (c.market_price ?? 0) > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      marketPrice: c.market_price ?? 0,
      predictedPrice: c.predicted_price ?? null,
      redditBuzz: c.reddit_buzz_score ?? 0,
      momentumScore: computeMomentumScore(c.reddit_buzz_score, c.trends_score),
    }))
    .filter((c) => c.momentumScore > 0)
    .sort((a, b) => b.momentumScore - a.momentumScore || b.redditBuzz - a.redditBuzz)

  const deduped: SocialMomentumRow[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const key = characterKey(row.name)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(row)
    if (deduped.length >= limit) break
  }

  return deduped
}

/**
 * Shared WHERE / ORDER BY builders for GET /api/cards (list + count).
 */

export type CardsListFilters = {
  whereSuffix: string
  params: (string | number)[]
  sortKey: string
  order: 'ASC' | 'DESC'
  textSort: boolean
}

const SORT_COLS: Record<string, string> = {
  market_price: 'market_price',
  predicted_price: 'predicted_price',
  pull_cost_score: 'pull_cost_score',
  desirability_score: 'desirability_score',
  reddit_buzz_score: 'reddit_buzz_score',
  future_value_12m: 'future_value_12m',
  annual_growth_rate: 'annual_growth_rate',
  name: 'name',
  set_id: 'set_id',
  rarity: 'rarity',
  card_type: 'card_type',
  ebay_median: 'ebay_median',
}

export function parseCardsListFilters(query: {
  q?: string
  flag?: string
  set_id?: string
  print?: string
  sort?: string
  order?: string
}): CardsListFilters {
  const q = (query.q as string) || ''
  const flag = (query.flag as string) || ''
  const setId = (query.set_id as string) || ''
  const print = (query.print as string) || ''
  const sortParam = (query.sort as string) || 'market_price'
  const orderParam = (query.order as string) || 'desc'

  const sortKey = SORT_COLS[sortParam] ?? 'market_price'
  const order = orderParam.toLowerCase() === 'asc' ? 'ASC' : 'DESC'

  let where = ''
  const params: (string | number)[] = []
  if (q) {
    where += ` AND (name LIKE ? OR character_name LIKE ?)`
    params.push(`%${q}%`, `%${q}%`)
  }
  if (flag) {
    where += ` AND valuation_flag LIKE ?`
    params.push(`%${flag}%`)
  }
  if (setId) {
    where += ` AND set_id = ?`
    params.push(setId)
  }
  if (print) {
    const p = print.trim()
    if (p === 'SIR') {
      where += ` AND (card_type = 'SIR' OR rarity LIKE '%Special Illustration%')`
    } else if (p === 'Illustration Rare') {
      where += ` AND (card_type = 'Illustration Rare' OR (rarity LIKE '%Illustration Rare%' AND rarity NOT LIKE '%Special%'))`
    } else if (p === 'Ultra Rare') {
      where += ` AND (card_type = 'Ultra Rare' OR (rarity LIKE '%Ultra Rare%' AND rarity NOT LIKE '%Hyper%'))`
    } else if (p === 'Hyper Rare') {
      where += ` AND (card_type = 'Hyper Rare' OR rarity LIKE '%Hyper Rare%')`
    } else if (p === 'Double Rare') {
      where += ` AND (card_type = 'Double Rare' OR rarity LIKE '%Double Rare%')`
    } else if (p === 'Full Art') {
      where += ` AND (card_type = 'Full Art' OR rarity LIKE '%Full Art%')`
    } else {
      where += ` AND card_type = ?`
      params.push(p)
    }
  }

  const textSort = ['name', 'rarity', 'set_id', 'card_type'].includes(sortKey)
  return { whereSuffix: where, params, sortKey, order, textSort }
}

export function orderByClause(f: CardsListFilters): string {
  if (f.textSort) {
    return ` ORDER BY ${f.sortKey} COLLATE NOCASE ${f.order}`
  }
  return ` ORDER BY (${f.sortKey} IS NULL), ${f.sortKey} ${f.order}`
}

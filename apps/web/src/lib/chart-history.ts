export type HistoryRow = {
  timestamp: string
  tcgplayer_market: number | null
}

export type ChartPoint = {
  ts: number
  label: string
  brushLabel: string
  p: number
}

export type TrendWindow = '1m' | '3m' | '6m' | '1y' | 'all'

const WINDOW_DAYS: Record<Exclude<TrendWindow, 'all'>, number> = {
  '1m': 31,
  '3m': 92,
  '6m': 183,
  '1y': 366,
}

export function buildFullHistory(rows: HistoryRow[]): ChartPoint[] {
  return rows
    .map((h) => {
      const ts = Date.parse(h.timestamp)
      const p = h.tcgplayer_market
      if (!Number.isFinite(ts) || p == null || p <= 0) return null
      const dt = new Date(ts)
      return {
        ts,
        label: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        brushLabel: dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        p,
      }
    })
    .filter((d): d is ChartPoint => d != null)
    .sort((a, b) => a.ts - b.ts)
}

export function filterChartData(
  fullHistory: ChartPoint[],
  window: TrendWindow,
): ChartPoint[] {
  if (fullHistory.length <= 2 || window === 'all') return fullHistory
  const latest = fullHistory[fullHistory.length - 1]?.ts ?? Date.now()
  const daysBack = WINDOW_DAYS[window]
  const cutoff = latest - daysBack * 86_400_000
  const sliced = fullHistory.filter((d) => d.ts >= cutoff)
  return sliced.length >= 2 ? sliced : fullHistory
}

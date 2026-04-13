/** Compact tick labels for Recharts axes (avoid long floats). */

export function formatScoreAxis(n: number): string {
  if (!Number.isFinite(n)) return ''
  return n.toFixed(1)
}

export function formatUsdAxis(n: number): string {
  if (!Number.isFinite(n)) return ''
  const a = Math.abs(n)
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (a >= 10_000) return `$${(n / 1000).toFixed(1)}k`
  if (a >= 1000) return `$${(n / 1000).toFixed(2)}k`
  if (a >= 100) return `$${n.toFixed(0)}`
  if (a >= 10) return `$${n.toFixed(1)}`
  return `$${n.toFixed(2)}`
}

export function formatPctAxis(n: number): string {
  if (!Number.isFinite(n)) return ''
  return `${Math.round(n)}%`
}

export function formatCountAxis(n: number): string {
  if (!Number.isFinite(n)) return ''
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(Math.round(n))
}

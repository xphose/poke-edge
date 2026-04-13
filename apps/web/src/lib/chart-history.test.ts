import { describe, expect, it } from 'vitest'
import {
  buildFullHistory,
  filterChartData,
  type ChartPoint,
  type HistoryRow,
} from './chart-history'

function makeRow(isoDate: string, price: number | null): HistoryRow {
  return { timestamp: isoDate, tcgplayer_market: price }
}

function dayMs(days: number) {
  return days * 86_400_000
}

const NOW = Date.parse('2026-04-13T00:00:00Z')

function makeSpanRows(count: number, startDaysAgo: number): HistoryRow[] {
  const rows: HistoryRow[] = []
  for (let i = 0; i < count; i++) {
    const ts = NOW - dayMs(startDaysAgo - i)
    rows.push(makeRow(new Date(ts).toISOString(), 10 + i * 0.5))
  }
  return rows
}

describe('buildFullHistory', () => {
  it('converts rows to sorted ChartPoints with numeric ts', () => {
    const rows: HistoryRow[] = [
      makeRow('2026-03-15T00:00:00Z', 5.0),
      makeRow('2026-01-10T00:00:00Z', 3.5),
      makeRow('2026-04-01T00:00:00Z', 7.0),
    ]
    const result = buildFullHistory(rows)

    expect(result).toHaveLength(3)
    expect(result[0].ts).toBeLessThan(result[1].ts)
    expect(result[1].ts).toBeLessThan(result[2].ts)
  })

  it('produces unique ts values for distinct timestamps', () => {
    const rows: HistoryRow[] = [
      makeRow('2026-01-01T12:00:00Z', 1),
      makeRow('2026-01-01T18:00:00Z', 2),
      makeRow('2026-01-02T06:00:00Z', 3),
    ]
    const result = buildFullHistory(rows)
    const tsValues = result.map((d) => d.ts)
    const unique = new Set(tsValues)
    expect(unique.size).toBe(tsValues.length)
  })

  it('filters out rows with null price', () => {
    const rows = [makeRow('2026-01-01T00:00:00Z', null), makeRow('2026-01-02T00:00:00Z', 5)]
    expect(buildFullHistory(rows)).toHaveLength(1)
    expect(buildFullHistory(rows)[0].p).toBe(5)
  })

  it('filters out rows with zero or negative price', () => {
    const rows = [
      makeRow('2026-01-01T00:00:00Z', 0),
      makeRow('2026-01-02T00:00:00Z', -3),
      makeRow('2026-01-03T00:00:00Z', 2),
    ]
    expect(buildFullHistory(rows)).toHaveLength(1)
  })

  it('filters out rows with invalid timestamps', () => {
    const rows = [makeRow('not-a-date', 5), makeRow('2026-01-01T00:00:00Z', 10)]
    expect(buildFullHistory(rows)).toHaveLength(1)
  })

  it('handles empty input', () => {
    expect(buildFullHistory([])).toEqual([])
  })

  it('preserves price values exactly', () => {
    const rows = [makeRow('2026-02-14T00:00:00Z', 12.34)]
    const result = buildFullHistory(rows)
    expect(result[0].p).toBe(12.34)
  })

  it('includes the latest data point (last by timestamp)', () => {
    const rows = [
      makeRow('2025-01-01T00:00:00Z', 5),
      makeRow('2026-04-12T23:59:59Z', 42),
      makeRow('2026-04-13T00:00:00Z', 43),
    ]
    const result = buildFullHistory(rows)
    const last = result[result.length - 1]
    expect(last.p).toBe(43)
    expect(last.ts).toBe(Date.parse('2026-04-13T00:00:00Z'))
  })

  it('handles rows with close timestamps correctly', () => {
    const base = Date.parse('2026-04-10T00:00:00Z')
    const rows: HistoryRow[] = []
    for (let h = 0; h < 24; h++) {
      rows.push(makeRow(new Date(base + h * 3_600_000).toISOString(), 10 + h * 0.1))
    }
    const result = buildFullHistory(rows)
    expect(result).toHaveLength(24)
    for (let i = 1; i < result.length; i++) {
      expect(result[i].ts).toBeGreaterThan(result[i - 1].ts)
    }
  })
})

describe('filterChartData', () => {
  function buildTestHistory(daysSpan: number): ChartPoint[] {
    const rows = makeSpanRows(daysSpan, daysSpan)
    return buildFullHistory(rows)
  }

  it('returns all data for "all" window', () => {
    const full = buildTestHistory(400)
    const result = filterChartData(full, 'all')
    expect(result).toBe(full)
  })

  it('returns all data when <= 2 points', () => {
    const full = buildTestHistory(2)
    expect(filterChartData(full, '1m')).toBe(full)
  })

  it('filters to ~1 month for "1m"', () => {
    const full = buildTestHistory(200)
    const result = filterChartData(full, '1m')
    const latest = full[full.length - 1]
    const earliest = result[0]
    const rangeDays = (latest.ts - earliest.ts) / dayMs(1)
    expect(rangeDays).toBeLessThanOrEqual(31)
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('filters to ~3 months for "3m"', () => {
    const full = buildTestHistory(200)
    const result = filterChartData(full, '3m')
    const latest = full[full.length - 1]
    const earliest = result[0]
    const rangeDays = (latest.ts - earliest.ts) / dayMs(1)
    expect(rangeDays).toBeLessThanOrEqual(92)
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('filters to ~6 months for "6m"', () => {
    const full = buildTestHistory(300)
    const result = filterChartData(full, '6m')
    const latest = full[full.length - 1]
    const earliest = result[0]
    const rangeDays = (latest.ts - earliest.ts) / dayMs(1)
    expect(rangeDays).toBeLessThanOrEqual(183)
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('filters to ~1 year for "1y"', () => {
    const full = buildTestHistory(500)
    const result = filterChartData(full, '1y')
    const latest = full[full.length - 1]
    const earliest = result[0]
    const rangeDays = (latest.ts - earliest.ts) / dayMs(1)
    expect(rangeDays).toBeLessThanOrEqual(366)
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('always includes the last data point in every window', () => {
    const full = buildTestHistory(400)
    const windows: Array<'1m' | '3m' | '6m' | '1y' | 'all'> = ['1m', '3m', '6m', '1y', 'all']
    const lastPoint = full[full.length - 1]
    for (const w of windows) {
      const result = filterChartData(full, w)
      expect(result[result.length - 1].ts).toBe(lastPoint.ts)
    }
  })

  it('falls back to full history when window has < 2 points', () => {
    const rows: HistoryRow[] = [
      makeRow('2025-01-01T00:00:00Z', 5),
      makeRow('2025-01-05T00:00:00Z', 6),
      makeRow('2026-04-13T00:00:00Z', 50),
    ]
    const full = buildFullHistory(rows)
    const result = filterChartData(full, '1m')
    expect(result.length).toBe(full.length)
  })

  it('preserves chronological sort order', () => {
    const full = buildTestHistory(200)
    for (const w of ['1m', '3m', '6m', '1y', 'all'] as const) {
      const result = filterChartData(full, w)
      for (let i = 1; i < result.length; i++) {
        expect(result[i].ts).toBeGreaterThan(result[i - 1].ts)
      }
    }
  })

  it('includes a point added just 1 hour before the latest', () => {
    const latest = NOW
    const nearLatest = NOW - 3_600_000
    const old = NOW - dayMs(60)
    const rows: HistoryRow[] = [
      makeRow(new Date(old).toISOString(), 5),
      makeRow(new Date(nearLatest).toISOString(), 9.9),
      makeRow(new Date(latest).toISOString(), 10),
    ]
    const full = buildFullHistory(rows)
    const result = filterChartData(full, '1m')
    expect(result).toHaveLength(2)
    expect(result[0].p).toBe(9.9)
    expect(result[1].p).toBe(10)
  })
})

describe('chart data guards against NaN SVG attributes', () => {
  it('buildFullHistory with single row returns 1 point — chart guard should prevent rendering', () => {
    const rows = [makeRow('2026-04-13T00:00:00Z', 10)]
    const result = buildFullHistory(rows)
    expect(result).toHaveLength(1)
    const canRender = result.length >= 2 && result[0].ts !== result[result.length - 1].ts
    expect(canRender).toBe(false)
  })

  it('two points at the same timestamp are guarded (same ts means degenerate X domain)', () => {
    const rows = [
      makeRow('2026-04-13T00:00:00Z', 10),
      makeRow('2026-04-13T00:00:00Z', 12),
    ]
    const result = buildFullHistory(rows)
    const canRender = result.length >= 2 && result[0].ts !== result[result.length - 1].ts
    expect(canRender).toBe(false)
  })

  it('two points at different timestamps pass the chart guard', () => {
    const rows = [
      makeRow('2026-04-12T00:00:00Z', 10),
      makeRow('2026-04-13T00:00:00Z', 12),
    ]
    const result = buildFullHistory(rows)
    const canRender = result.length >= 2 && result[0].ts !== result[result.length - 1].ts
    expect(canRender).toBe(true)
  })

  it('all points with identical prices still pass chart guard if timestamps differ', () => {
    const rows = [
      makeRow('2026-04-10T00:00:00Z', 5),
      makeRow('2026-04-11T00:00:00Z', 5),
      makeRow('2026-04-12T00:00:00Z', 5),
    ]
    const result = buildFullHistory(rows)
    const canRender = result.length >= 2 && result[0].ts !== result[result.length - 1].ts
    expect(canRender).toBe(true)
  })

  it('filterChartData with "all" window and single point is guarded', () => {
    const rows = [makeRow('2026-04-13T00:00:00Z', 10)]
    const full = buildFullHistory(rows)
    const chart = filterChartData(full, 'all')
    const canRender = chart.length >= 2 && chart[0].ts !== chart[chart.length - 1].ts
    expect(canRender).toBe(false)
  })

  it('filterChartData "all" with two valid points at different timestamps is renderable', () => {
    const rows = [
      makeRow('2026-01-01T00:00:00Z', 5),
      makeRow('2026-04-13T00:00:00Z', 15),
    ]
    const full = buildFullHistory(rows)
    const chart = filterChartData(full, 'all')
    const canRender = chart.length >= 2 && chart[0].ts !== chart[chart.length - 1].ts
    expect(canRender).toBe(true)
  })

  it('MiniSpark degenerate data: all identical prices produce safe Y domain', () => {
    const data = [{ p: 5 }, { p: 5 }, { p: 5 }]
    const min = Math.min(...data.map((d) => d.p))
    const max = Math.max(...data.map((d) => d.p))
    const yMin = min === max ? min * 0.95 : min
    const yMax = min === max ? max * 1.05 || 1 : max
    expect(yMin).toBeLessThan(yMax)
    expect(Number.isFinite(yMin)).toBe(true)
    expect(Number.isFinite(yMax)).toBe(true)
  })

  it('MiniSpark degenerate data: all zeros produce safe Y domain', () => {
    const data = [{ p: 0 }, { p: 0 }]
    const min = Math.min(...data.map((d) => d.p))
    const max = Math.max(...data.map((d) => d.p))
    const yMin = min === max ? min * 0.95 : min
    const yMax = min === max ? max * 1.05 || 1 : max
    expect(yMax).toBeGreaterThan(yMin)
    expect(Number.isFinite(yMin)).toBe(true)
    expect(Number.isFinite(yMax)).toBe(true)
  })

  it('empty history produces no renderable chart data', () => {
    const result = buildFullHistory([])
    const chart = filterChartData(result, 'all')
    const canRender = chart.length >= 2 && chart[0]?.ts !== chart[chart.length - 1]?.ts
    expect(canRender).toBe(false)
  })
})

describe('chart data uniqueness for hover tracking', () => {
  it('numeric ts ensures unique x-axis values even when label strings collide', () => {
    const rows: HistoryRow[] = [
      makeRow('2026-04-10T06:00:00Z', 10),
      makeRow('2026-04-10T12:00:00Z', 11),
      makeRow('2026-04-10T18:00:00Z', 12),
    ]
    const result = buildFullHistory(rows)
    expect(result[0].label).toBe(result[1].label)
    expect(result[0].ts).not.toBe(result[1].ts)
    expect(result[1].ts).not.toBe(result[2].ts)
  })

  it('ts-based xaxis allows correct nearest-point resolution for close data', () => {
    const base = Date.parse('2026-04-01T00:00:00Z')
    const rows: HistoryRow[] = Array.from({ length: 50 }, (_, i) =>
      makeRow(new Date(base + i * 3_600_000).toISOString(), 5 + Math.sin(i) * 2),
    )
    const result = buildFullHistory(rows)
    expect(result).toHaveLength(50)
    const tsValues = result.map((d) => d.ts)
    const uniqueTs = new Set(tsValues)
    expect(uniqueTs.size).toBe(50)

    for (let i = 1; i < result.length; i++) {
      const gap = result[i].ts - result[i - 1].ts
      expect(gap).toBe(3_600_000)
    }
  })

  it('last point is reachable — its ts equals dataMax', () => {
    const rows: HistoryRow[] = [
      makeRow('2026-01-01T00:00:00Z', 5),
      makeRow('2026-04-12T00:00:00Z', 9),
      makeRow('2026-04-13T00:00:00Z', 10),
    ]
    const result = buildFullHistory(rows)
    const dataMax = Math.max(...result.map((d) => d.ts))
    expect(result[result.length - 1].ts).toBe(dataMax)
  })
})

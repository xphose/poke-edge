import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import {
  loadSetsVerdictFilter,
  saveSetsVerdictFilter,
  loadSetsSelectedId,
  saveSetsSelectedId,
  type SetsVerdictFilter,
} from '@/lib/ui-persist'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { HelpButton } from '@/components/help-center'

type ProductType = 'bb' | 'etb' | 'sub'

type PriceConfidence = 'high' | 'medium' | 'low'

type SetRow = {
  id: string
  name: string
  release_date: string | null
  total_cards: number | null
  box_price: number | null
  box_price_verified: number | null
  product_type: ProductType | null
  product_packs: number | null
  price_sources: number | null
  price_confidence: PriceConfidence | null
  ev_per_box: number | null
  set_chase_score: number | null
  rip_or_singles_verdict: string | null
  images_json: string | null
}

function confidenceBadge(c: PriceConfidence | null, sources: number | null) {
  const s = sources ?? 0
  if (c === 'high') return { label: `${s} sources`, cls: 'text-emerald-600 dark:text-emerald-400', icon: '✓' }
  if (c === 'medium') return { label: `${s} sources`, cls: 'text-amber-600 dark:text-amber-400', icon: '~' }
  return { label: s > 0 ? `${s} source` : 'est.', cls: 'text-red-500', icon: '⚠' }
}

function productLabel(t: ProductType | null): string {
  if (t === 'etb') return 'ETB'
  if (t === 'sub') return 'Sub-set'
  return 'Booster Box'
}

function productShort(t: ProductType | null): string {
  if (t === 'etb') return 'ETB'
  if (t === 'sub') return '—'
  return 'BB'
}

type VerdictClass = 'buy_singles' | 'rip' | 'rip_caution' | 'hold_sealed' | 'breakeven'

function classifyVerdict(verdict: string | null): VerdictClass {
  const v = verdict ?? ''
  if (v.includes('Buy singles') || v.includes('\u{1F7E2}')) return 'buy_singles'
  if (v.includes('Rip packs') || v.includes('\u{1F534}')) return 'rip'
  if (v.includes('Rip with caution') || v.includes('chase-heavy')) return 'rip_caution'
  if (v.includes('Hold sealed') || v.includes('\u{1F7E3}')) return 'hold_sealed'
  return 'breakeven'
}

function verdictLabel(vc: VerdictClass): string {
  return vc === 'buy_singles' ? 'Buy singles'
    : vc === 'rip' ? 'Rip packs'
      : vc === 'rip_caution' ? 'Rip (caution)'
        : vc === 'hold_sealed' ? 'Hold sealed'
          : 'Break-even'
}

function verdictTextColor(vc: VerdictClass): string {
  return vc === 'buy_singles' ? 'text-emerald-600 dark:text-emerald-400'
    : vc === 'rip' ? 'text-red-600 dark:text-red-400'
      : vc === 'rip_caution' ? 'text-orange-600 dark:text-orange-400'
        : vc === 'hold_sealed' ? 'text-purple-600 dark:text-purple-400'
          : 'text-amber-600 dark:text-amber-400'
}

function verdictBorderColor(vc: VerdictClass): string {
  return vc === 'buy_singles' ? 'border-emerald-500/40'
    : vc === 'rip' ? 'border-red-500/40'
      : vc === 'rip_caution' ? 'border-orange-500/40'
        : vc === 'hold_sealed' ? 'border-purple-500/40'
          : 'border-amber-500/40'
}

function verdictDotColor(vc: VerdictClass): string {
  return vc === 'buy_singles' ? 'oklch(0.72 0.2 145)'
    : vc === 'rip' ? 'oklch(0.62 0.22 25)'
      : vc === 'rip_caution' ? 'oklch(0.72 0.18 55)'
        : vc === 'hold_sealed' ? 'oklch(0.62 0.18 300)'
          : 'oklch(0.78 0.16 85)'
}

export function SetsPage() {
  const [verdictFilter, setVerdictFilter] = useState<SetsVerdictFilter>(() => loadSetsVerdictFilter())

  const { data: sets = [] } = useQuery({
    queryKey: ['api', 'sets'],
    queryFn: () => api<SetRow[]>('/api/sets'),
    staleTime: 60_000,
  })

  useEffect(() => {
    saveSetsVerdictFilter(verdictFilter)
  }, [verdictFilter])

  const nonSubSets = useMemo(() => sets.filter(s => (s.product_type as ProductType) !== 'sub'), [sets])

  const filtered = useMemo(() => {
    if (verdictFilter === 'all') return nonSubSets
    return nonSubSets.filter((s) => classifyVerdict(s.rip_or_singles_verdict) === verdictFilter)
  }, [nonSubSets, verdictFilter])

  const mapRows = useMemo(() => {
    const now = new Date()
    return filtered
      .map((s) => {
        const verdict = classifyVerdict(s.rip_or_singles_verdict)
        const chase = Math.max(0, Math.min(10, s.set_chase_score ?? 0))
        const ev = Math.max(0, s.ev_per_box ?? 0)
        const box = Math.max(1, s.box_price ?? 120)
        const evRatio = ev / box
        const rel = s.release_date ? new Date(s.release_date) : null
        const ageMonths =
          rel && !Number.isNaN(rel.getTime())
            ? Math.max(
                0,
                (now.getFullYear() - rel.getFullYear()) * 12 + (now.getMonth() - rel.getMonth()),
              )
            : 0
        const ageNorm = Math.min(1, ageMonths / 30)
        const cardsNorm = Math.min(1, Math.max(0, (s.total_cards ?? 0) / 300))
        // A simple "how interesting is this set to inspect first?" score.
        const opportunityScore = evRatio * 0.5 + (chase / 10) * 0.3 + ageNorm * 0.2 - cardsNorm * 0.08
        return {
          id: s.id,
          name: s.name,
          verdict,
          chase,
          ev,
          box,
          boxVerified: s.box_price_verified === 1,
          productType: (s.product_type ?? 'bb') as ProductType,
          packs: s.product_packs ?? 36,
          priceSources: s.price_sources ?? 0,
          priceConfidence: (s.price_confidence ?? 'low') as PriceConfidence,
          evRatio,
          ageMonths,
          releaseDate: s.release_date,
          totalCards: s.total_cards ?? 0,
          opportunityScore,
        }
      })
      .filter((r) => r.productType !== 'sub' && (r.ev > 0 || r.box > 0 || r.chase > 0))
  }, [filtered])

  const topMapRows = useMemo(
    () =>
      [...mapRows]
        .sort((a, b) => b.opportunityScore - a.opportunityScore)
        .slice(0, 5),
    [mapRows],
  )

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-start gap-1">
        <p className="text-xs text-muted-foreground sm:text-sm">
          Compare opening EV versus sealed price and chase dynamics by set.
        </p>
        <HelpButton sectionId="sets-overview" className="mt-[-2px]" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-sm text-muted-foreground">Show:</Label>
        {(
          [
            ['all', 'All sets'],
            ['rip', 'Rip packs'],
            ['rip_caution', 'Rip (caution)'],
            ['breakeven', 'Break-even'],
            ['buy_singles', 'Buy singles'],
            ['hold_sealed', 'Hold sealed'],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={verdictFilter === id ? 'secondary' : 'outline'}
            className={cn(verdictFilter === id && 'ring-2 ring-ring')}
            onClick={() => setVerdictFilter(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-1">
              <CardTitle className="text-base">Set Opportunity Map</CardTitle>
              <HelpButton sectionId="sets-opportunity-map" />
            </div>
          </CardHeader>
          <CardContent>
            <SetOpportunityMap rows={mapRows} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top sets to review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topMapRows.map((r) => (
              <div key={r.id} className="rounded-md border border-border/70 bg-muted/20 p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium">{r.name}</p>
                  <span className={cn('shrink-0 text-xs font-semibold', verdictTextColor(r.verdict))}>{verdictLabel(r.verdict)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  EV {(r.evRatio * 100).toFixed(0)}% of {productShort(r.productType)} · chase {r.chase.toFixed(1)} · {r.ageMonths}mo old
                </p>
              </div>
            ))}
            {!topMapRows.length && <p className="text-sm text-muted-foreground">Not enough data yet.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((s) => {
          let logo: string | null = null
          try {
            const img = s.images_json ? (JSON.parse(s.images_json) as { logo?: string }) : null
            logo = img?.logo ?? null
          } catch {
            logo = null
          }
          const verdict = s.rip_or_singles_verdict ?? ''
          const vc = classifyVerdict(verdict)
          const color = verdictBorderColor(vc)

          const cardsHref = `/cards?set_id=${encodeURIComponent(s.id)}&sort=market_price&order=desc`

          return (
            <Card key={s.id} className={cn('min-w-0', color)}>
              <CardHeader>
                {logo && <img src={logo} alt="" className="mb-2 h-12 w-auto object-contain" />}
                <CardTitle className="text-lg">{s.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">Released {s.release_date ?? '—'}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Product</span>
                  <span className="text-xs font-medium">{productLabel(s.product_type as ProductType)}{s.product_type === 'etb' ? ` (${s.product_packs ?? 9}pk)` : s.product_type === 'bb' ? ' (36pk)' : ''}</span>
                  <span className="text-muted-foreground">{productShort(s.product_type as ProductType)} price</span>
                  <span className="tabular-nums">
                    {(s.box_price ?? 0) > 0 ? `$${(s.box_price ?? 0).toLocaleString()}` : '—'}
                    {(() => {
                      const cb = confidenceBadge(s.price_confidence, s.price_sources)
                      return (s.box_price ?? 0) > 0 ? (
                        <span className={cn('ml-1 text-[0.6rem]', cb.cls)} title={cb.label}>{cb.icon}</span>
                      ) : null
                    })()}
                  </span>
                  <span className="text-muted-foreground">EV / {productShort(s.product_type as ProductType)}</span>
                  <span className="tabular-nums font-medium">{(s.ev_per_box ?? 0) > 0 ? `$${(s.ev_per_box ?? 0).toFixed(2)}` : '—'}</span>
                  <span className="text-muted-foreground">EV ratio</span>
                  <span className={cn('tabular-nums font-semibold',
                    (s.ev_per_box ?? 0) / Math.max(1, s.box_price ?? 120) >= 1.15 ? 'text-red-600 dark:text-red-400'
                      : (s.ev_per_box ?? 0) / Math.max(1, s.box_price ?? 120) >= 0.85 ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400',
                  )}>
                    {((s.ev_per_box ?? 0) / Math.max(1, s.box_price ?? 120) * 100).toFixed(0)}%
                  </span>
                  <span className="text-muted-foreground">Chase score</span>
                  <span className="tabular-nums">{(s.set_chase_score ?? 0).toFixed(1)} / 10</span>
                </div>
                <Badge variant="outline" className={cn(
                  verdictBorderColor(vc).replace('/40', '/60'), verdictTextColor(vc),
                )}>{verdict || 'Verdict pending'}</Badge>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Link to={cardsHref} className={cn(buttonVariants({ variant: 'default', size: 'sm' }))}>
                    Browse cards in set
                  </Link>
                  <a
                    className={cn(
                      'inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-muted',
                    )}
                    href={`https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(s.name)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    TCGPlayer search
                  </a>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      {!sets.length && <p className="text-muted-foreground">No sets — start API ingest.</p>}
      {sets.length > 0 && !filtered.length && (
        <p className="text-muted-foreground">No sets match this filter. Try &quot;All sets&quot;.</p>
      )}
    </div>
  )
}

const SV = { w: 800, h: 420 }
const SM = { t: 24, r: 16, b: 50, l: 60 }
const SP = { w: SV.w - SM.l - SM.r, h: SV.h - SM.t - SM.b }

function niceTicks(lo: number, hi: number, approx: number): number[] {
  const range = hi - lo
  if (range <= 0) return [lo]
  const raw = range / Math.max(1, approx)
  const exp = Math.pow(10, Math.floor(Math.log10(raw)))
  const frac = raw / exp
  const nice = frac <= 1.5 ? 1 : frac <= 3 ? 2 : frac <= 7 ? 5 : 10
  const step = nice * exp
  const start = Math.ceil(lo / step) * step
  const out: number[] = []
  for (let v = start; v <= hi + step * 1e-6; v += step) out.push(Math.round(v / step) * step)
  return out
}

type SetMapRow = {
  id: string
  name: string
  verdict: VerdictClass
  chase: number
  ev: number
  box: number
  boxVerified: boolean
  productType: ProductType
  packs: number
  priceSources: number
  priceConfidence: PriceConfidence
  evRatio: number
  ageMonths: number
  releaseDate: string | null
  totalCards: number
}

function SetOpportunityMap({ rows }: { rows: SetMapRow[] }) {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedId, _setSelectedId] = useState<string | null>(() => loadSetsSelectedId())
  const setSelectedId = (v: string | null) => { _setSelectedId(v); saveSetsSelectedId(v) }
  const [hovered, setHovered] = useState<{ id: string; cx: number; cy: number } | null>(null)

  const fullX: [number, number] = useMemo(() => [0, Math.max(10, ...rows.map((r) => r.chase)) * 1.05], [rows])
  const fullY: [number, number] = useMemo(() => {
    const evMax = Math.max(1.5, ...rows.map((r) => r.evRatio)) * 1.08
    const evMin = Math.min(0.3, ...rows.map((r) => r.evRatio)) * 0.92
    return [evMin, evMax]
  }, [rows])

  const [vd, setVd] = useState<{ x: [number, number]; y: [number, number] }>({
    x: [...fullX] as [number, number],
    y: [...fullY] as [number, number],
  })
  const vdRef = useRef(vd)
  vdRef.current = vd
  const fullXRef = useRef(fullX)
  const fullYRef = useRef(fullY)
  fullXRef.current = fullX
  fullYRef.current = fullY

  useEffect(() => {
    setVd({ x: [...fullX] as [number, number], y: [...fullY] as [number, number] })
  }, [fullX[0], fullX[1], fullY[0], fullY[1]])

  const fullXRange = fullX[1] - fullX[0]
  const fullYRange = fullY[1] - fullY[0]
  const isZoomed = (vd.x[1] - vd.x[0]) < fullXRange * 0.98 || (vd.y[1] - vd.y[0]) < fullYRange * 0.98
  const zoomLevel = Math.max(fullXRange / (vd.x[1] - vd.x[0]), fullYRange / (vd.y[1] - vd.y[0]))

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cur = vdRef.current
      const fx = fullXRef.current, fy = fullYRef.current
      const mxFrac = (e.clientX - rect.left) / rect.width
      const myFrac = (e.clientY - rect.top) / rect.height
      const plotFx = Math.max(0, Math.min(1, (mxFrac * SV.w - SM.l) / SP.w))
      const plotFy = Math.max(0, Math.min(1, 1 - (myFrac * SV.h - SM.t) / SP.h))
      const dataX = cur.x[0] + plotFx * (cur.x[1] - cur.x[0])
      const dataY = cur.y[0] + plotFy * (cur.y[1] - cur.y[0])
      const factor = e.deltaY < 0 ? 0.82 : 1 / 0.82
      let xr = (cur.x[1] - cur.x[0]) * factor
      let yr = (cur.y[1] - cur.y[0]) * factor
      const fxr = fx[1] - fx[0], fyr = fy[1] - fy[0]
      if (xr >= fxr && yr >= fyr) { setVd({ x: [...fx] as [number, number], y: [...fy] as [number, number] }); return }
      xr = Math.max(fxr * 0.02, Math.min(fxr, xr))
      yr = Math.max(fyr * 0.02, Math.min(fyr, yr))
      let x0 = dataX - plotFx * xr, x1 = dataX + (1 - plotFx) * xr
      let y0 = dataY - plotFy * yr, y1 = dataY + (1 - plotFy) * yr
      if (x0 < fx[0]) { x1 += fx[0] - x0; x0 = fx[0] }
      if (x1 > fx[1]) { x0 -= x1 - fx[1]; x1 = fx[1] }
      if (y0 < fy[0]) { y1 += fy[0] - y0; y0 = fy[0] }
      if (y1 > fy[1]) { y0 -= y1 - fy[1]; y1 = fy[1] }
      setVd({
        x: [Math.max(fx[0], x0), Math.min(fx[1], x1)],
        y: [Math.max(fy[0], y0), Math.min(fy[1], y1)],
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const panRef = useRef<{
    sx: number; sy: number
    vdx: [number, number]; vdy: [number, number]
    dragging: boolean
  } | null>(null)

  const startPan = (e: React.MouseEvent) => {
    if (!isZoomed || e.button !== 0) return
    panRef.current = { sx: e.clientX, sy: e.clientY, vdx: [...vd.x] as [number, number], vdy: [...vd.y] as [number, number], dragging: false }
  }
  const movePan = (e: React.MouseEvent) => {
    const p = panRef.current
    if (!p || !containerRef.current) return
    const dx = e.clientX - p.sx, dy = e.clientY - p.sy
    if (!p.dragging && Math.hypot(dx, dy) < 4) return
    p.dragging = true
    const rect = containerRef.current.getBoundingClientRect()
    const xr = p.vdx[1] - p.vdx[0], yr = p.vdy[1] - p.vdy[0]
    const ratioX = SV.w / SP.w, ratioY = SV.h / SP.h
    const ddx = -(dx / rect.width) * xr * ratioX
    const ddy = (dy / rect.height) * yr * ratioY
    const fx = fullXRef.current, fy = fullYRef.current
    let x0 = p.vdx[0] + ddx, x1 = p.vdx[1] + ddx
    let y0 = p.vdy[0] + ddy, y1 = p.vdy[1] + ddy
    if (x0 < fx[0]) { x1 += fx[0] - x0; x0 = fx[0] }
    if (x1 > fx[1]) { x0 -= x1 - fx[1]; x1 = fx[1] }
    if (y0 < fy[0]) { y1 += fy[0] - y0; y0 = fy[0] }
    if (y1 > fy[1]) { y0 -= y1 - fy[1]; y1 = fy[1] }
    setVd({
      x: [Math.max(fx[0], x0), Math.min(fx[1], x1)],
      y: [Math.max(fy[0], y0), Math.min(fy[1], y1)],
    })
  }
  const endPan = () => { panRef.current = null }

  if (!rows.length) return <p className="text-sm text-muted-foreground">No set metrics yet — run ingest/refresh.</p>

  const sx = (v: number) => SM.l + ((v - vd.x[0]) / (vd.x[1] - vd.x[0])) * SP.w
  const sy = (v: number) => SM.t + SP.h - ((v - vd.y[0]) / (vd.y[1] - vd.y[0])) * SP.h
  const dotR = (cards: number) => 2.5 + Math.min(4.5, Math.log10(Math.max(1, cards)) * 2)
  const dotColor = (v: VerdictClass) => verdictDotColor(v)
  const evTicks = niceTicks(vd.y[0], vd.y[1], 6)
  const chaseTicks = niceTicks(vd.x[0], vd.x[1], 8)
  const fg = 'hsl(var(--foreground))'
  const grid = 'hsl(var(--border))'

  const handleSelect = (row: SetMapRow) => {
    if (panRef.current?.dragging) return
    if (selectedId === row.id) {
      navigate(`/cards?set_id=${encodeURIComponent(row.id)}&sort=market_price&order=desc`)
    } else {
      setSelectedId(row.id)
    }
  }
  const handleHover = (id: string, e: React.MouseEvent) => {
    if (!containerRef.current) return
    const r = containerRef.current.getBoundingClientRect()
    setHovered({ id, cx: e.clientX - r.left, cy: e.clientY - r.top })
  }

  const hovRow = hovered ? rows.find((r) => r.id === hovered.id) : null

  return (
    <div className="space-y-2">
      <div className="flex h-full w-full flex-col">
        <div className="flex items-center justify-between border-b border-border/40 px-3 py-1.5 text-[0.65rem] text-muted-foreground">
          <span>{isZoomed ? `${zoomLevel.toFixed(1)}× — drag to pan` : 'Scroll to zoom · click dot to select · double-click to browse'}</span>
          {isZoomed && (
            <button type="button" className="rounded px-1.5 py-0.5 font-medium text-primary hover:bg-muted"
              onClick={() => setVd({ x: [...fullX] as [number, number], y: [...fullY] as [number, number] })}>
              Reset zoom
            </button>
          )}
        </div>
        <div ref={containerRef}
          className="relative min-h-0 flex-1 overflow-visible rounded-b-lg border border-t-0 border-border"
          style={{ cursor: isZoomed ? (panRef.current?.dragging ? 'grabbing' : 'grab') : undefined }}
          onMouseDown={startPan} onMouseMove={movePan} onMouseUp={endPan}
          onMouseLeave={() => { endPan(); setHovered(null) }}
        >
          <svg viewBox={`0 0 ${SV.w} ${SV.h}`} className="h-[300px] w-full sm:h-[360px] md:h-[420px]" style={{ userSelect: 'none' }}>
            <defs>
              <clipPath id="sets-clip"><rect x={SM.l} y={SM.t} width={SP.w} height={SP.h} /></clipPath>
            </defs>

            <g clipPath="url(#sets-clip)">
              {chaseTicks.map((v) => (
                <line key={`gx${v}`} x1={sx(v)} x2={sx(v)} y1={SM.t} y2={SM.t + SP.h}
                  stroke={grid} strokeOpacity={0.3} strokeDasharray="3 6" />
              ))}
              {evTicks.map((v) => (
                <line key={`gy${v}`} x1={SM.l} x2={SM.l + SP.w} y1={sy(v)} y2={sy(v)}
                  stroke={Math.abs(v - 1) < 0.001 ? fg : grid}
                  strokeOpacity={Math.abs(v - 1) < 0.001 ? 0.4 : 0.3}
                  strokeDasharray={Math.abs(v - 1) < 0.001 ? 'none' : '3 6'} />
              ))}

              {rows.map((row) => {
                const px = sx(row.chase), py = sy(row.evRatio)
                if (px < SM.l - 2 || px > SM.l + SP.w + 2 || py < SM.t - 2 || py > SM.t + SP.h + 2) return null
                const r = dotR(row.totalCards)
                const active = selectedId === row.id
                const isHov = hovered?.id === row.id
                const color = dotColor(row.verdict)
                const hitR = Math.max(r + 5, 12)
                return (
                  <g key={row.id}>
                    {active && <circle cx={px} cy={py} r={r + 5} fill="none" stroke={color} strokeWidth={1.5} opacity={0.5} />}
                    <circle cx={px} cy={py} r={active ? r + 1 : r} fill={color}
                      stroke={active || isHov ? fg : 'hsl(var(--background)/0.6)'}
                      strokeWidth={active ? 1.5 : isHov ? 1 : 0.7}
                      fillOpacity={isHov || active ? 1 : 0.8}
                      style={{ pointerEvents: 'none' }} />
                    <circle cx={px} cy={py} r={hitR} fill="transparent" cursor="pointer"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => handleSelect(row)}
                      onMouseEnter={(e) => handleHover(row.id, e)}
                      onMouseLeave={() => setHovered(null)} />
                  </g>
                )
              })}
            </g>

            <line x1={SM.l} x2={SM.l + SP.w} y1={SM.t + SP.h} y2={SM.t + SP.h} stroke={fg} strokeOpacity={0.5} />
            <line x1={SM.l} x2={SM.l} y1={SM.t} y2={SM.t + SP.h} stroke={fg} strokeOpacity={0.5} />

            {chaseTicks.map((v) => (
              <text key={`tx${v}`} x={sx(v)} y={SM.t + SP.h + 18} textAnchor="middle" fontSize={11} fill={fg}>
                {v.toFixed(v % 1 === 0 ? 0 : 1)}
              </text>
            ))}
            {evTicks.map((v) => (
              <text key={`ty${v}`} x={SM.l - 8} y={sy(v) + 4} textAnchor="end" fontSize={11} fill={fg}
                fontWeight={Math.abs(v - 1) < 0.001 ? 600 : 400}>
                {v.toFixed(1)}x
              </text>
            ))}

            <text x={SM.l + SP.w / 2} y={SV.h - 6} textAnchor="middle" fontSize={12} fontWeight={500} fill={fg}>
              Chase Score →
            </text>
            <text x={16} y={SM.t + SP.h / 2} transform={`rotate(-90 16 ${SM.t + SP.h / 2})`}
              textAnchor="middle" fontSize={12} fontWeight={500} fill={fg}>
              EV / Box Price
            </text>
          </svg>

          {hovRow && hovered && (
            <div
              className="pointer-events-none absolute z-50 max-w-[16rem] rounded-lg border border-border/80 bg-popover/95 px-2.5 py-1.5 text-[0.7rem] text-popover-foreground shadow-lg backdrop-blur-sm"
              style={{
                left: hovered.cx > (containerRef.current?.clientWidth ?? 600) * 0.55 ? hovered.cx - 8 : hovered.cx + 14,
                top: hovered.cy < 60 ? hovered.cy + 14 : hovered.cy - 8,
                transform: `translate(${hovered.cx > (containerRef.current?.clientWidth ?? 600) * 0.55 ? '-100%' : '0'}, ${hovered.cy < 60 ? '0' : '-100%'})`,
              }}
            >
              <p className="font-semibold leading-snug">{hovRow.name}</p>
              {hovRow.releaseDate && (
                <p className="text-[0.6rem] text-muted-foreground">
                  Released {hovRow.releaseDate} · {hovRow.ageMonths < 12 ? `${hovRow.ageMonths}mo` : `${(hovRow.ageMonths / 12).toFixed(1)}yr`} old
                </p>
              )}
              <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
                <span>{productShort(hovRow.productType)} price</span>
                <span className="tabular-nums text-foreground">
                  ${hovRow.box.toLocaleString()}
                  {hovRow.productType === 'etb' && <span className="ml-1 text-xs text-muted-foreground">({hovRow.packs}pk)</span>}
                  {(() => {
                    const cb = confidenceBadge(hovRow.priceConfidence, hovRow.priceSources)
                    return <span className={cn('ml-1', cb.cls)} title={cb.label}>{cb.icon}</span>
                  })()}
                </span>
                <span>EV / {productShort(hovRow.productType)}</span>
                <span className="tabular-nums text-foreground">${hovRow.ev.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                <span>EV ratio</span>
                <span className={cn('tabular-nums font-semibold',
                  hovRow.evRatio >= 1.15 ? 'text-red-600 dark:text-red-400'
                    : hovRow.evRatio >= 0.85 ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400',
                )}>{(hovRow.evRatio * 100).toFixed(0)}%</span>
                <span>Chase</span>
                <span className="tabular-nums text-foreground">{hovRow.chase.toFixed(1)} / 10</span>
                <span>Cards</span>
                <span className="tabular-nums text-foreground">{hovRow.totalCards}</span>
                <span>Verdict</span>
                <span className={cn('font-medium', verdictTextColor(hovRow.verdict))}>
                  {verdictLabel(hovRow.verdict)}
                </span>
              </div>
              <p className="mt-1 text-[0.6rem] text-muted-foreground">
                {selectedId === hovRow.id ? 'Click again to browse set cards' : 'Click to select'}
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[oklch(0.62_0.22_25)]" /> Rip packs
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[oklch(0.72_0.18_55)]" /> Rip (caution)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[oklch(0.78_0.16_85)]" /> Break-even
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[oklch(0.72_0.2_145)]" /> Buy singles
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[oklch(0.62_0.18_300)]" /> Hold sealed
        </span>
        <span>Dot size = set size. Click to select, click again to browse.</span>
      </div>
    </div>
  )
}

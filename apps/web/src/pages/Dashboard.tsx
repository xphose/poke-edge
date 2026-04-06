import { useEffect, useState } from 'react'
import {
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { api, type CardRow } from '@/lib/api'

type DashKpis = {
  totalCards: number
  undervaluedSignals: number
  avgModelAccuracy: number
  portfolioValue: number
}

function flagColor(flag: string | null) {
  if (!flag) return 'hsl(var(--chart-3))'
  if (flag.includes('OVERVALUED')) return 'oklch(0.62 0.22 25)'
  if (flag.includes('UNDERVALUED')) return 'oklch(0.72 0.2 145)'
  return 'oklch(0.78 0.16 85)'
}

export function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState<DashKpis | null>(null)
  const [cards, setCards] = useState<CardRow[]>([])
  const [pulse, setPulse] = useState<{ id: string; name: string; reddit_buzz_score: number }[]>([])
  const [upcoming, setUpcoming] = useState<{ id: string; name: string; release_date: string }[]>([])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api<DashKpis>('/api/dashboard'),
      api<CardRow[]>('/api/cards'),
      api<{ id: string; name: string; reddit_buzz_score: number }[]>('/api/reddit/pulse'),
      api<{ id: string; name: string; release_date: string }[]>('/api/upcoming'),
    ])
      .then(([d, c, p, u]) => {
        setKpis(d)
        setCards(c)
        setPulse(p)
        setUpcoming(u)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const scatterData = cards
    .filter((c) => c.pull_cost_score != null && c.desirability_score != null)
    .map((c) => ({
      x: c.pull_cost_score ?? 0,
      y: c.desirability_score ?? 0,
      z: Math.max(1, c.predicted_price ?? c.market_price ?? 1),
      name: c.name,
      flag: c.valuation_flag,
      id: c.id,
    }))
    .slice(0, 400)

  const movers = [...cards]
    .filter((c) => c.market_price && c.reddit_buzz_score)
    .sort((a, b) => (b.reddit_buzz_score ?? 0) - (a.reddit_buzz_score ?? 0))
    .slice(0, 12)

  if (loading) {
    return <p className="text-muted-foreground">Loading dashboard…</p>
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Total cards tracked" value={kpis?.totalCards ?? '—'} />
        <Kpi title="Undervalued signals" value={kpis?.undervaluedSignals ?? '—'} />
        <Kpi title="Avg model R²" value={kpis ? kpis.avgModelAccuracy.toFixed(2) : '—'} />
        <Kpi
          title="Portfolio value"
          value={kpis ? `$${kpis.portfolioValue.toFixed(0)}` : '—'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pull cost vs desirability</CardTitle>
          </CardHeader>
          <CardContent className="h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" dataKey="x" name="Pull" unit="" label={{ value: 'Pull cost score', position: 'bottom' }} />
                <YAxis type="number" dataKey="y" name="Desirability" label={{ value: 'Desirability', angle: -90, position: 'insideLeft' }} />
                <ZAxis type="number" dataKey="z" range={[20, 400]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Scatter name="Cards" data={scatterData}>
                  {scatterData.map((e, i) => (
                    <Cell key={i} fill={flagColor(e.flag)} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming sets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {upcoming.map((u) => (
              <div key={u.id} className="flex justify-between gap-2 border-b border-border py-2 last:border-0">
                <span className="font-medium">{u.name}</span>
                <span className="text-muted-foreground">{u.release_date}</span>
              </div>
            ))}
            {!upcoming.length && <p className="text-muted-foreground">No upcoming rows (seed in API).</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Price / hype velocity</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-40">
              <ul className="space-y-2 text-sm">
                {movers.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2">
                    <span>{m.name}</span>
                    <span className="text-muted-foreground">buzz {m.reddit_buzz_score?.toFixed(0)}</span>
                  </li>
                ))}
                {!movers.length && <li className="text-muted-foreground">Waiting for Reddit poll…</li>}
              </ul>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reddit hype pulse</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-40">
              <ul className="space-y-2 text-sm">
                {pulse.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span>{p.name}</span>
                    <span className="text-muted-foreground">{p.reddit_buzz_score}</span>
                  </li>
                ))}
                {!pulse.length && <li className="text-muted-foreground">No mentions yet.</li>}
              </ul>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Kpi({ title, value }: { title: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}

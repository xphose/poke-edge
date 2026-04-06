import { useEffect, useState } from 'react'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'

type SetRow = {
  id: string
  name: string
  release_date: string | null
  total_cards: number | null
  ev_per_box: number | null
  set_chase_score: number | null
  rip_or_singles_verdict: string | null
  images_json: string | null
}

export function SetsPage() {
  const [sets, setSets] = useState<SetRow[]>([])

  useEffect(() => {
    api<SetRow[]>('/api/sets').then(setSets).catch(console.error)
  }, [])

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {sets.map((s) => {
        let logo: string | null = null
        try {
          const img = s.images_json ? (JSON.parse(s.images_json) as { logo?: string }) : null
          logo = img?.logo ?? null
        } catch {
          logo = null
        }
        const verdict = s.rip_or_singles_verdict ?? ''
        const color =
          verdict.includes('Buy singles') || verdict.includes('🟢')
            ? 'border-emerald-500/40'
            : verdict.includes('Don’t rip') || verdict.includes('🔴')
              ? 'border-red-500/40'
              : 'border-amber-500/40'

        return (
          <Card key={s.id} className={color}>
            <CardHeader>
              {logo && <img src={logo} alt="" className="mb-2 h-12 w-auto object-contain" />}
              <CardTitle className="text-lg">{s.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">Released {s.release_date ?? '—'}</p>
              <p>EV / box (heuristic): ${(s.ev_per_box ?? 0).toFixed(2)}</p>
              <p>Set chase score: {(s.set_chase_score ?? 0).toFixed(2)}</p>
              <Badge variant="outline">{verdict || 'Verdict pending'}</Badge>
              <div className="h-24 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparkPlaceholder(s.id)}>
                    <XAxis dataKey="x" hide />
                    <YAxis hide />
                    <Tooltip />
                    <Line type="monotone" dataKey="y" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )
      })}
      {!sets.length && <p className="text-muted-foreground">No sets — start API ingest.</p>}
    </div>
  )
}

function sparkPlaceholder(seed: string) {
  const n = seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return Array.from({ length: 12 }, (_, i) => ({
    x: i,
    y: 40 + ((n + i * 7) % 35),
  }))
}

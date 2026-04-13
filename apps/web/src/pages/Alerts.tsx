import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api, type CardRow } from '@/lib/api'
import { HelpButton } from '@/components/help-center'

type AlertRow = CardRow & {
  ai_score: number
  ai_decision: 'BUY' | 'WATCH' | 'PASS'
  anomaly_flag: 1 | -1
  target_buy_price: number | null
}

export function AlertsPage() {
  const q = useQuery({
    queryKey: ['api', 'alerts'],
    queryFn: () => api<AlertRow[]>('/api/alerts'),
    staleTime: 30_000,
  })
  const rows = q.data ?? []

  if (q.isPending) return <p className="text-sm text-muted-foreground">Loading alerts…</p>
  if (q.error) return <p className="text-sm text-destructive">{q.error.message}</p>

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-1">
        <p className="text-sm text-muted-foreground">
          BUY-zone action list sorted by composite score.
        </p>
        <HelpButton sectionId="alerts-overview" className="mt-[-2px]" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{r.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline">{r.set_id ?? 'unknown set'}</Badge>
                <Badge className="tabular-nums">{Math.round((r.ai_score ?? 0) * 100)}%</Badge>
              </div>
              <p>
                Fair: <span className="tabular-nums">${r.predicted_price?.toFixed(2) ?? '—'}</span> · Market:{' '}
                <span className="tabular-nums">${r.market_price?.toFixed(2) ?? '—'}</span>
              </p>
              <div className="pt-1">
                <Link to="/cards" className="text-sm text-primary underline">
                  Open in Cards
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!rows.length && <p className="text-sm text-muted-foreground">No active BUY alerts right now.</p>}
    </div>
  )
}

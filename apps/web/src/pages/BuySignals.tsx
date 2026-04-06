import { useEffect, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { api, type CardRow } from '@/lib/api'

export function BuySignals() {
  const [rows, setRows] = useState<CardRow[]>([])

  useEffect(() => {
    api<CardRow[]>('/api/signals').then(setRows).catch(console.error)
  }, [])

  const addWatch = async (id: string) => {
    await api('/api/watchlist', {
      method: 'POST',
      body: JSON.stringify({ card_id: id, alert_active: 1 }),
    })
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((c) => {
        const fair = c.predicted_price ?? 0
        const mkt = c.market_price ?? 0
        const disc = fair > 0 && mkt > 0 ? ((fair - mkt) / fair) * 100 : 0
        return (
          <Card key={c.id} className="overflow-hidden border-emerald-500/30">
            <CardHeader className="flex flex-row items-start gap-3">
              {c.image_url && (
                <img src={c.image_url} alt="" className="h-20 w-auto rounded border border-border" />
              )}
              <div>
                <CardTitle className="text-base leading-snug">{c.name}</CardTitle>
                <Badge className="mt-2 bg-emerald-600 text-white hover:bg-emerald-600">
                  {disc.toFixed(1)}% below fair value
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>Fair value (model): ${fair.toFixed(2)}</p>
              <p>Market: ${mkt.toFixed(2)}</p>
              <p className="mt-1 text-xs">Undervalued since: {c.undervalued_since ?? 'n/a'}</p>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              <a
                className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                href={`https://www.tcgplayer.com/product/productsearch?q=${encodeURIComponent(c.name)}`}
                target="_blank"
                rel="noreferrer"
              >
                TCGPlayer
              </a>
              <a
                className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`${c.name} pokemon`)}&LH_Sold=1&LH_Complete=1`}
                target="_blank"
                rel="noreferrer"
              >
                eBay
              </a>
              <Button size="sm" type="button" onClick={() => addWatch(c.id)}>
                Add to watchlist
              </Button>
            </CardFooter>
          </Card>
        )
      })}
      {!rows.length && <p className="text-muted-foreground">No buy signals yet — run ingest or widen filters.</p>}
    </div>
  )
}

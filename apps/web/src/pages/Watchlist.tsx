import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { loadWatchlistForm, saveWatchlistForm } from '@/lib/ui-persist'
import { HelpButton } from '@/components/help-center'

type WRow = {
  id: number
  card_id: string
  quantity: number
  condition: string | null
  purchase_price: number | null
  purchase_date: string | null
  target_buy_price: number | null
  alert_active: number | null
  name: string | null
  image_url: string | null
  market_price: number | null
}

const LS_KEY = 'pokeedge_watchlist_local'

export function WatchlistPage() {
  const queryClient = useQueryClient()
  const [cardId, setCardId] = useState(() => loadWatchlistForm().cardId)
  const [target, setTarget] = useState(() => loadWatchlistForm().target)
  const [pushReady, setPushReady] = useState(false)

  const watchlistQuery = useQuery({
    queryKey: ['api', 'watchlist'],
    queryFn: async () => {
      const r = await api<WRow[]>('/api/watchlist')
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(r))
      } catch {
        /* ignore */
      }
      return r
    },
    staleTime: 30_000,
  })
  const rows = watchlistQuery.data ?? []

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    api<{ publicKey: string }>('/api/push/vapid-public')
      .then((k) => setPushReady(!!k.publicKey))
      .catch(() => setPushReady(false))
  }, [])

  useEffect(() => {
    saveWatchlistForm({ cardId, target })
  }, [cardId, target])

  const add = async () => {
    await api('/api/watchlist', {
      method: 'POST',
      body: JSON.stringify({
        card_id: cardId,
        quantity: 1,
        target_buy_price: target ? Number(target) : null,
        alert_active: target ? 1 : 0,
      }),
    })
    setCardId('')
    setTarget('')
    await queryClient.invalidateQueries({ queryKey: ['api', 'watchlist'] })
  }

  const remove = async (id: number) => {
    await api(`/api/watchlist/${id}`, { method: 'DELETE' })
    await queryClient.invalidateQueries({ queryKey: ['api', 'watchlist'] })
  }

  const subscribePush = async () => {
    const reg = await navigator.serviceWorker.ready
    const { publicKey } = await api<{ publicKey: string }>('/api/push/vapid-public')
    if (!publicKey) return
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
    await api('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(sub.toJSON()),
    })
    alert('Push subscription saved (requires VAPID keys in server .env).')
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 flex items-center gap-1">
          <p className="text-sm font-medium">Add to watchlist</p>
          <HelpButton sectionId="watchlist-overview" />
        </div>
        <div className="flex flex-wrap gap-3">
          <div>
            <Label htmlFor="cid">Card id (PokémonTCG.io)</Label>
            <Input id="cid" value={cardId} onChange={(e) => setCardId(e.target.value)} placeholder="sv8-123" />
          </div>
          <div>
            <Label htmlFor="tgt">Target buy price (optional)</Label>
            <Input id="tgt" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="25.00" />
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={add}>
              Add
            </Button>
          </div>
        </div>
        {pushReady && (
          <Button type="button" variant="secondary" className="mt-3" onClick={() => subscribePush()}>
            Enable browser price alerts
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table className="w-max min-w-full">
          <TableHeader>
            <TableRow>
              <TableHead>
                <span className="inline-flex items-center gap-1">
                  Card
                  <HelpButton sectionId="watchlist-overview" />
                </span>
              </TableHead>
              <TableHead className="whitespace-nowrap">Qty</TableHead>
              <TableHead className="whitespace-nowrap">Purchase</TableHead>
              <TableHead className="whitespace-nowrap">Market</TableHead>
              <TableHead className="whitespace-nowrap">P&amp;L</TableHead>
              <TableHead className="whitespace-nowrap">Target</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((w) => {
              const pl =
                w.purchase_price != null && w.market_price != null
                  ? (w.market_price - w.purchase_price) * w.quantity
                  : null
              return (
                <TableRow key={w.id}>
                  <TableCell className="flex items-center gap-2 whitespace-nowrap">
                    {w.image_url && <img src={w.image_url} alt="" className="h-10 w-auto rounded" />}
                    <span className="max-w-[10rem] truncate sm:max-w-none">{w.name ?? w.card_id}</span>
                  </TableCell>
                  <TableCell className="tabular-nums">{w.quantity}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">{w.purchase_price != null ? `$${w.purchase_price.toFixed(2)}` : '—'}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">{w.market_price != null ? `$${w.market_price.toFixed(2)}` : '—'}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">{pl != null ? `$${pl.toFixed(2)}` : '—'}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">{w.target_buy_price != null ? `$${w.target_buy_price.toFixed(2)}` : '—'}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" type="button" onClick={() => remove(w.id)}>
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const buf = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i)
  return buf
}

import { useEffect, useMemo, useState } from 'react'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { api, type CardRow } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type Hist = { timestamp: string; tcgplayer_market: number | null }

export function Cards() {
  const [rows, setRows] = useState<CardRow[]>([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState<CardRow | null>(null)
  const [hist, setHist] = useState<Hist[]>([])
  const [buyLinks, setBuyLinks] = useState<{ tcgplayer: string; ebay: string; whatnot: string } | null>(null)

  const load = () => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : ''
    api<CardRow[]>(`/api/cards${qs}`).then(setRows).catch(console.error)
  }

  useEffect(() => {
    load()
  }, [])

  const openDetail = async (c: CardRow) => {
    setSel(c)
    setOpen(true)
    const d = await api<{ priceHistory: Hist[] }>(`/api/cards/${c.id}`)
    setHist(d.priceHistory)
    try {
      const links = await api<{ tcgplayer: string; ebay: string; whatnot: string }>(
        `/api/cards/${c.id}/buy-links`,
      )
      setBuyLinks(links)
    } catch {
      setBuyLinks(null)
    }
  }

  const chartData = useMemo(
    () =>
      [...hist]
        .reverse()
        .map((h) => ({ t: h.timestamp.slice(5, 16), p: h.tcgplayer_market ?? 0 })),
    [hist],
  )

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-sm"
          />
          <Button type="button" onClick={load}>
            Search
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Card</TableHead>
                <TableHead>Set</TableHead>
                <TableHead>Rarity</TableHead>
                <TableHead>Pull</TableHead>
                <TableHead>Desire</TableHead>
                <TableHead>Predicted</TableHead>
                <TableHead>Market</TableHead>
                <TableHead>eBay</TableHead>
                <TableHead>Flag</TableHead>
                <TableHead>30d</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => openDetail(c)}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.set_id}</TableCell>
                  <TableCell className="text-muted-foreground">{c.rarity}</TableCell>
                  <TableCell>{c.pull_cost_score?.toFixed(1) ?? '—'}</TableCell>
                  <TableCell>{c.desirability_score?.toFixed(1) ?? '—'}</TableCell>
                  <TableCell>{c.predicted_price != null ? `$${c.predicted_price.toFixed(2)}` : '—'}</TableCell>
                  <TableCell>{c.market_price != null ? `$${c.market_price.toFixed(2)}` : '—'}</TableCell>
                  <TableCell>{c.ebay_median != null ? `$${c.ebay_median.toFixed(2)}` : '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="whitespace-nowrap text-xs">
                      {c.valuation_flag ?? '—'}
                    </Badge>
                  </TableCell>
                  <TableCell className="w-32">
                    <MiniSpark data={[]} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{sel?.name}</SheetTitle>
          </SheetHeader>
          {sel?.image_url && (
            <img src={sel.image_url} alt="" className="mx-auto mt-4 max-h-80 rounded-lg border border-border" />
          )}
          <div className="mt-4 space-y-2 text-sm">
            <Explain label="Pull cost score" value={sel?.pull_cost_score} />
            <Explain label="Desirability" value={sel?.desirability_score} />
            <Explain label="Predicted" value={sel?.predicted_price} prefix="$" />
            <Explain label="Market" value={sel?.market_price} prefix="$" />
            {sel?.explain_json && (
              <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-2 text-xs">{sel.explain_json}</pre>
            )}
          </div>
          {chartData.length > 1 && (
            <div className="mt-4 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="t" hide />
                  <YAxis domain={['auto', 'auto']} hide />
                  <RTooltip />
                  <Line type="monotone" dataKey="p" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {buyLinks && (
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                href={buyLinks.tcgplayer}
                target="_blank"
                rel="noreferrer"
              >
                TCGPlayer
              </a>
              <a
                className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                href={buyLinks.ebay}
                target="_blank"
                rel="noreferrer"
              >
                eBay sold
              </a>
              <a
                className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                href={buyLinks.whatnot}
                target="_blank"
                rel="noreferrer"
              >
                Whatnot
              </a>
            </div>
          )}
          <PsaRoi cardName={sel?.name ?? ''} rawPrice={sel?.market_price ?? 0} />
        </SheetContent>
      </Sheet>
    </>
  )
}

function Explain({
  label,
  value,
  prefix = '',
}: {
  label: string
  value: number | null | undefined
  prefix?: string
}) {
  return (
    <div className="flex justify-between gap-2">
      <Tooltip>
        <TooltipTrigger className="cursor-help border-b border-dotted border-muted-foreground">
          {label}
        </TooltipTrigger>
        <TooltipContent>Model input used for valuation.</TooltipContent>
      </Tooltip>
      <span>
        {prefix}
        {value != null ? (typeof value === 'number' ? value.toFixed(2) : value) : '—'}
      </span>
    </div>
  )
}

function MiniSpark({ data }: { data: { p: number }[] }) {
  if (!data.length) return <span className="text-muted-foreground">—</span>
  return (
    <div className="h-8 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="p" stroke="hsl(var(--chart-2))" dot={false} strokeWidth={1} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function PsaRoi({ cardName, rawPrice }: { cardName: string; rawPrice: number }) {
  const [grade, setGrade] = useState<'9' | '10'>('10')
  const gradingCost = 25
  const estimatedGraded = rawPrice * (grade === '10' ? 2.4 : 1.6)
  const roi = rawPrice > 0 ? ((estimatedGraded - gradingCost - rawPrice) / rawPrice) * 100 : 0

  return (
    <div className="mt-6 space-y-3 rounded-lg border border-border p-3">
      <p className="font-medium">PSA grading ROI (estimate)</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label>Target grade</Label>
          <select
            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
            value={grade}
            onChange={(e) => setGrade(e.target.value as '9' | '10')}
          >
            <option value="9">PSA 9</option>
            <option value="10">PSA 10</option>
          </select>
        </div>
        <div>
          <Label>Card</Label>
          <p className="mt-1 text-sm text-muted-foreground">{cardName}</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Assumes graded value ≈ {grade === '10' ? '2.4×' : '1.6×'} raw (TCGPlayer-style heuristic), ${gradingCost}{' '}
        economy grading.
      </p>
      <p className="text-sm">
        Est. ROI: <strong>{roi.toFixed(1)}%</strong> · Est. graded resale:{' '}
        <strong>${estimatedGraded.toFixed(2)}</strong>
      </p>
    </div>
  )
}

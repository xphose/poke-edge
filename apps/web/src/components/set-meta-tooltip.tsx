import type { SetMeta } from '@/lib/api'

export function setHoverTitle(s: SetMeta): string {
  return [
    s.name ?? s.id,
    `Code: ${s.id}`,
    s.series ? `Series: ${s.series}` : '',
    `Released: ${s.release_date ?? '—'}`,
    s.total_cards != null ? `Cards in set: ${s.total_cards}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function SetMetaTooltipBody({ s }: { s: SetMeta }) {
  return (
    <div className="space-y-1 text-left">
      <p className="font-semibold leading-snug">{s.name ?? s.id}</p>
      <p className="opacity-90">
        <span className="opacity-70">Code:</span> {s.id}
      </p>
      {s.series ? (
        <p className="opacity-90">
          <span className="opacity-70">Series:</span> {s.series}
        </p>
      ) : null}
      <p className="opacity-90">
        <span className="opacity-70">Released:</span> {s.release_date ?? '—'}
      </p>
      {s.total_cards != null ? (
        <p className="opacity-90">
          <span className="opacity-70">Cards in set:</span> {s.total_cards}
        </p>
      ) : null}
    </div>
  )
}

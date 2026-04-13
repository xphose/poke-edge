import type { ScatterShapeProps } from 'recharts'

/**
 * Resolve the card id for dashboard scatter charts.
 * Always use `payload.id` — Recharts also passes DOM/SVG `id` and internal fields on the
 * same props object; those must not override the data row id.
 */
export function getCardIdFromScatterPointData(data: unknown): string | null {
  if (data == null || typeof data !== 'object') return null
  const d = data as ScatterShapeProps & { payload?: { id?: unknown } }
  const raw = d.payload?.id
  if (raw != null && String(raw) !== '') return String(raw)
  return null
}

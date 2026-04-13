/**
 * Tiny in-memory TTL cache for read-heavy JSON API responses.
 * Invalidated after full data refresh so UI never stays stale for long.
 */
type Entry = { value: string; expiresAt: number }

const store = new Map<string, Entry>()

export function cacheGet(key: string): string | null {
  const e = store.get(key)
  if (!e) return null
  if (Date.now() > e.expiresAt) {
    store.delete(key)
    return null
  }
  return e.value
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  store.set(key, {
    value: typeof value === 'string' ? value : JSON.stringify(value),
    expiresAt: Date.now() + ttlMs,
  })
}

export function cacheInvalidateAll(): void {
  store.clear()
}

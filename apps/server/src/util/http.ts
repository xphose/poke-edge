const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: { retries?: number; baseMs?: number } = {},
): Promise<Response> {
  const retries = opts.retries ?? 4
  const baseMs = opts.baseMs ?? 400
  let lastErr: unknown
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, init)
      if (res.status === 429 || res.status >= 500) {
        const wait = baseMs * 2 ** i + Math.random() * 200
        await sleep(wait)
        continue
      }
      return res
    } catch (e) {
      lastErr = e
      const wait = baseMs * 2 ** i
      await sleep(wait)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

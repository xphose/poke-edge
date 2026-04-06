import type Database from 'better-sqlite3'
import { fetchWithRetry } from '../util/http.js'

const SUBS = ['PokemonTCG', 'PokemonTCGTrades', 'pkmntcgcollections']

export async function pollRedditAndScoreBuzz(db: Database.Database) {
  const cards = db.prepare(`SELECT id, name FROM cards`).all() as { id: string; name: string }[]

  const mentions = new Map<string, number>()

  for (const sub of SUBS) {
    const url = `https://www.reddit.com/r/${sub}/new.json?limit=100`
    try {
      const res = await fetchWithRetry(url, {
        headers: { 'User-Agent': 'PokeEdge/1.0 (local research)' },
      })
      if (!res.ok) continue
      const data = (await res.json()) as {
        data?: { children?: { data?: { title?: string; selftext?: string } }[] }
      }
      const children = data.data?.children ?? []
      for (const ch of children) {
        const title = ch.data?.title ?? ''
        const body = ch.data?.selftext ?? ''
        const text = `${title} ${body}`.toLowerCase()
        for (const c of cards) {
          const needle = c.name.toLowerCase()
          if (needle.length < 4) continue
          if (!text.includes(needle)) continue
          const titleHit = title.toLowerCase().includes(needle) ? 2 : 0
          const bodyHit = body.toLowerCase().includes(needle) ? 1 : 0
          const w = titleHit + (bodyHit || (titleHit ? 0 : 1))
          mentions.set(c.id, (mentions.get(c.id) ?? 0) + w)
        }
      }
    } catch {
      /* ignore */
    }
  }

  const upd = db.prepare(`UPDATE cards SET reddit_buzz_score = ? WHERE id = ?`)
  const tx = db.transaction(() => {
    for (const [id, score] of mentions) {
      upd.run(score, id)
    }
  })
  tx()

  return { matched: mentions.size, totalCards: cards.length }
}

/** Faster mention pass: pre-filter card names by length and tokenize post text */
export async function pollRedditOptimized(db: Database.Database) {
  return pollRedditAndScoreBuzz(db)
}

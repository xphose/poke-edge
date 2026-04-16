import type Database from 'better-sqlite3'
import { fetchWithRetry } from '../util/http.js'

const SUBS = [
  'PokemonTCG',
  'PokemonTCGTrades',
  'pkmntcgcollections',
  'PokemonCardValue',
  'pokemoncardcollectors',
  'PokemonTCGDeals',
]

function extractCharacterName(fullName: string): string | null {
  const cleaned = fullName
    .replace(/\b(ex|EX|GX|gx|VMAX|VSTAR|V|vmax|vstar)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const first = cleaned.split(/[\s']+/)[0]?.toLowerCase()
  return first && first.length >= 4 ? first : null
}

export async function pollRedditAndScoreBuzz(db: Database.Database) {
  const cards = db.prepare(`SELECT id, name, character_name FROM cards`).all() as {
    id: string
    name: string
    character_name: string | null
  }[]

  const charToCards = new Map<string, { id: string; name: string }[]>()
  for (const c of cards) {
    const charName = c.character_name?.toLowerCase() || extractCharacterName(c.name)
    if (charName) {
      const list = charToCards.get(charName) ?? []
      list.push(c)
      charToCards.set(charName, list)
    }
  }

  const mentions = new Map<string, number>()
  let totalPosts = 0
  let subsOk = 0
  let subsFailed = 0

  for (const sub of SUBS) {
    const url = `https://www.reddit.com/r/${sub}/new.json?limit=100`
    try {
      const res = await fetchWithRetry(url, {
        headers: {
          'User-Agent': 'PokeGrails/1.0 (local research)',
          'Accept': 'application/json',
        },
      })
      if (!res.ok) {
        console.warn(`[reddit] r/${sub} returned ${res.status}`)
        subsFailed++
        continue
      }
      subsOk++
      const data = (await res.json()) as {
        data?: { children?: { data?: { title?: string; selftext?: string } }[] }
      }
      const children = data.data?.children ?? []
      totalPosts += children.length

      for (const ch of children) {
        const title = (ch.data?.title ?? '').toLowerCase()
        const body = (ch.data?.selftext ?? '').toLowerCase()
        const text = `${title} ${body}`

        for (const c of cards) {
          const needle = c.name.toLowerCase()
          if (needle.length < 4) continue
          if (!text.includes(needle)) continue
          const titleHit = title.includes(needle) ? 3 : 0
          const bodyHit = body.includes(needle) ? 1 : 0
          mentions.set(c.id, (mentions.get(c.id) ?? 0) + titleHit + bodyHit)
        }

        for (const [charName, cardList] of charToCards) {
          if (!text.includes(charName)) continue
          const inTitle = title.includes(charName)
          const w = inTitle ? 1.5 : 0.5
          for (const c of cardList) {
            mentions.set(c.id, (mentions.get(c.id) ?? 0) + w)
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`[reddit] r/${sub} fetch failed: ${msg}`)
      subsFailed++
    }
  }

  if (subsFailed === SUBS.length) {
    console.warn(`[reddit] All ${SUBS.length} subs failed — likely rate-limited. Skipping score decay.`)
    return { matched: 0, totalCards: cards.length }
  }

  const DECAY = 0.85
  const read = db.prepare(`SELECT reddit_buzz_score FROM cards WHERE id = ?`)
  const upd = db.prepare(`UPDATE cards SET reddit_buzz_score = ? WHERE id = ?`)
  const tx = db.transaction(() => {
    for (const c of cards) {
      const prev = (read.get(c.id) as { reddit_buzz_score: number | null } | undefined)?.reddit_buzz_score ?? 0
      const fresh = mentions.get(c.id) ?? 0
      const blended = prev * DECAY + fresh
      upd.run(Math.round(blended * 100) / 100, c.id)
    }
  })
  tx()

  const uniqueCards = mentions.size
  console.log(
    `[reddit] Polled ${subsOk}/${SUBS.length} subs, ${totalPosts} posts scanned, ` +
    `${[...mentions.values()].reduce((a, b) => a + b, 0).toFixed(0)} mentions across ${uniqueCards} cards`,
  )

  return { matched: uniqueCards, totalCards: cards.length }
}

export async function pollRedditOptimized(db: Database.Database) {
  return pollRedditAndScoreBuzz(db)
}

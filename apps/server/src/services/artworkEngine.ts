import type Database from 'better-sqlite3'
import { detectCardType, normalizeRarityTier } from './pokemontcg.js'

const TOP_ARTISTS = new Set(['Mitsuhiro Arita', 'Ryota Murayama', 'Atsushi Furusawa', '5ban Graphics'])
const GEN1 = new Set([
  'Bulbasaur',
  'Ivysaur',
  'Venusaur',
  'Charmander',
  'Charmeleon',
  'Charizard',
  'Squirtle',
  'Wartortle',
  'Blastoise',
  'Pikachu',
  'Raichu',
  'Mew',
  'Mewtwo',
])

export function scoreArtworkHype(input: {
  rarity: string
  artist?: string | null
  characterName: string
  redditBoost?: number
}): number {
  let s = 5
  const tier = normalizeRarityTier(input.rarity)
  const ct = detectCardType(input.rarity)
  if (ct === 'SIR' || tier.includes('Special Illustration')) s += 2
  else if (tier.includes('Illustration')) s += 1.5
  else if (input.rarity.toLowerCase().includes('full art')) s += 1

  if (input.artist && TOP_ARTISTS.has(input.artist)) s += 1

  const first = input.characterName.split(/[\s']+/)[0]
  if (GEN1.has(first)) s += 0.5

  if (input.redditBoost) s += Math.min(1.5, input.redditBoost)

  return Math.min(10, Math.max(1, Math.round(s * 10) / 10))
}

export function seedArtworkScoresFromRules(db: Database.Database) {
  const rows = db
    .prepare(
      `SELECT id, name, rarity, character_name, artist, reddit_buzz_score FROM cards WHERE artwork_hype_score IS NULL OR artwork_hype_score = 0`,
    )
    .all() as {
    id: string
    name: string
    rarity: string | null
    character_name: string | null
    artist: string | null
    reddit_buzz_score: number | null
  }[]

  const upd = db.prepare(`UPDATE cards SET artwork_hype_score = ? WHERE id = ?`)
  const tx = db.transaction(() => {
    for (const r of rows) {
      const buzz = r.reddit_buzz_score != null ? Math.min(1, r.reddit_buzz_score / 50) : 0
      const score = scoreArtworkHype({
        rarity: r.rarity || '',
        characterName: r.character_name || r.name,
        artist: r.artist,
        redditBoost: buzz,
      })
      upd.run(score, r.id)
    }
  })
  tx()
}

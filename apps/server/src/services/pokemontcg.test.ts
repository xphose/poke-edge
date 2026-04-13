import { describe, expect, it } from 'vitest'
import { detectCardType, normalizeRarityTier, parseCharacterName, printBucket } from './pokemontcg.js'

describe('pokemontcg helpers', () => {
  it('parseCharacterName uses Pokémon after trainer possessive (Team Rocket)', () => {
    expect(parseCharacterName('Charizard ex')).toBe('Charizard')
    expect(parseCharacterName("Team Rocket's Mewtwo ex")).toBe('Mewtwo')
    expect(parseCharacterName("Team Rocket's Crobat ex")).toBe('Crobat')
  })

  it('parseCharacterName strips regional prefixes', () => {
    expect(parseCharacterName('Alolan Vulpix')).toBe('Vulpix')
  })

  it('normalizeRarityTier maps illustration tiers', () => {
    expect(normalizeRarityTier('Special Illustration Rare')).toBe('Special Illustration Rare')
    expect(normalizeRarityTier('Illustration Rare')).toBe('Illustration Rare')
    expect(normalizeRarityTier('Ultra Rare')).toBe('Ultra Rare')
  })

  it('detectCardType returns SIR and Hyper Rare', () => {
    expect(detectCardType('Special Illustration Rare')).toBe('SIR')
    expect(detectCardType('Ultra Rare')).toBe('Ultra Rare')
    expect(detectCardType('Hyper Rare')).toBe('Hyper Rare')
    expect(detectCardType('Double Rare')).toBe('Double Rare')
  })

  it('printBucket matches detectCardType', () => {
    expect(printBucket('Special Illustration Rare')).toBe('SIR')
  })
})

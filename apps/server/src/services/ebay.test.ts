import { describe, expect, it } from 'vitest'
import { buildEbayCardQuery } from './ebay.js'

describe('buildEbayCardQuery', () => {
  it('includes name, collector number, set name, and "pokemon card"', () => {
    const q = buildEbayCardQuery('Charizard ex', 'sv3pt5-25', 'Scarlet & Violet 151')
    expect(q).toBe('Charizard ex 25 Scarlet & Violet 151 pokemon card')
  })

  it('works without set name (null)', () => {
    const q = buildEbayCardQuery('Pikachu', 'sv1-42', null)
    expect(q).toBe('Pikachu 42 pokemon card')
  })

  it('handles id without hyphen', () => {
    const q = buildEbayCardQuery('Mew', 'abc123', 'Some Set')
    expect(q).toBe('Mew abc123 Some Set pokemon card')
  })

  it('extracts number from last hyphen segment', () => {
    const q = buildEbayCardQuery('Umbreon VMAX', 'swsh7-215', 'Evolving Skies')
    expect(q).toBe('Umbreon VMAX 215 Evolving Skies pokemon card')
  })

  it('does not include "PSA" in the query', () => {
    const q = buildEbayCardQuery('Charizard', 'sv1-1', 'Test')
    expect(q).not.toContain('PSA')
  })
})

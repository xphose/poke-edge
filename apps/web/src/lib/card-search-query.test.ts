import { describe, expect, it } from 'vitest'
import { buildCardSearchQuery } from './api'

describe('buildCardSearchQuery', () => {
  it('includes name, collector number, set name, and default suffix', () => {
    const q = buildCardSearchQuery('Charizard ex', 'sv3pt5-25', 'Scarlet & Violet 151')
    expect(q).toBe('Charizard ex 25 Scarlet & Violet 151 pokemon card')
  })

  it('works without set name', () => {
    const q = buildCardSearchQuery('Pikachu', 'sv1-42', null)
    expect(q).toBe('Pikachu 42 pokemon card')
  })

  it('works with undefined set name', () => {
    const q = buildCardSearchQuery('Mew', 'sv1-1', undefined)
    expect(q).toBe('Mew 1 pokemon card')
  })

  it('uses custom suffix', () => {
    const q = buildCardSearchQuery('Charizard', 'sv1-4', 'Base Set', '')
    expect(q).toBe('Charizard 4 Base Set')
  })

  it('extracts number from last hyphen segment for multi-hyphen ids', () => {
    const q = buildCardSearchQuery('Umbreon VMAX', 'swsh7-215', 'Evolving Skies')
    expect(q).toBe('Umbreon VMAX 215 Evolving Skies pokemon card')
  })

  it('handles id without hyphen', () => {
    const q = buildCardSearchQuery('Mew', 'abc123', 'Some Set')
    expect(q).toBe('Mew Some Set pokemon card')
  })
})

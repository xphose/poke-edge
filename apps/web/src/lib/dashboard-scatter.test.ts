import { describe, expect, it } from 'vitest'
import { getCardIdFromScatterPointData } from './dashboard-scatter'

describe('getCardIdFromScatterPointData', () => {
  it('returns id from payload', () => {
    expect(
      getCardIdFromScatterPointData({
        cx: 10,
        cy: 20,
        payload: { id: 'sv1-12', name: 'Pikachu' },
      }),
    ).toBe('sv1-12')
  })

  it('stringifies numeric ids', () => {
    expect(
      getCardIdFromScatterPointData({
        payload: { id: 42 },
      }),
    ).toBe('42')
  })

  it('ignores top-level id when payload has the card id (Recharts / SVG confusion)', () => {
    expect(
      getCardIdFromScatterPointData({
        id: 'recharts-series-or-svg',
        payload: { id: 'real-card-id' },
      }),
    ).toBe('real-card-id')
  })

  it('returns null when payload missing', () => {
    expect(getCardIdFromScatterPointData({ cx: 1, cy: 2 })).toBeNull()
  })

  it('returns null for empty id', () => {
    expect(getCardIdFromScatterPointData({ payload: { id: '' } })).toBeNull()
  })
})

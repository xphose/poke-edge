import { describe, expect, it } from 'vitest'
import { shrinkPredictedToPeers } from './model.js'

describe('shrinkPredictedToPeers', () => {
  it('adapts market trust based on price level', () => {
    const peers = new Map([['swsh7|||Rare Rainbow', 8.5]])
    // Cheap card — model has more influence
    const cheap = shrinkPredictedToPeers(5, 'swsh7|||Rare Rainbow', peers, 4)
    expect(cheap.predicted).toBeGreaterThan(3)
    expect(cheap.predicted).toBeLessThan(10)

    // Expensive card — market dominates
    const expensive = shrinkPredictedToPeers(15, 'swsh7|||Rare Rainbow', peers, 1500)
    expect(expensive.predicted).toBeGreaterThan(500)
    expect(expensive.predicted).toBeLessThan(1500 * 1.8 + 1)
  })

  it('floors prediction when model cannot reach market territory', () => {
    const peers = new Map([['sv8|||SIR', 200]])
    // raw=15, market=1476 → prediction would be very low without floor
    const { predicted } = shrinkPredictedToPeers(15, 'sv8|||SIR', peers, 1476)
    // Should be at least 40% of market due to floor
    expect(predicted).toBeGreaterThan(1476 * 0.35)
    expect(predicted).toBeLessThan(1476 * 1.8 + 1)
  })

  it('caps predictions to prevent overestimation', () => {
    const peers = new Map([['x|||Ultra Rare', 12]])
    const { predicted } = shrinkPredictedToPeers(900, 'x|||Ultra Rare', peers, 5)
    expect(predicted).toBeLessThanOrEqual(12 * 3.5 + 1)
  })

  it('falls back toward peer when no market data', () => {
    const peers = new Map([['a|||Rare', 50]])
    const { predicted, peerMedian } = shrinkPredictedToPeers(500, 'a|||Rare', peers, null)
    expect(peerMedian).toBe(50)
    expect(predicted).toBeLessThan(500)
    expect(predicted).toBeGreaterThan(40)
  })

  it('returns raw when neither peer nor market exist', () => {
    const empty = new Map<string, number>()
    const { predicted, peerMedian } = shrinkPredictedToPeers(10, null, empty, null)
    expect(peerMedian).toBeNull()
    expect(predicted).toBe(10)
  })
})

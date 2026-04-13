import { describe, expect, it, beforeEach } from 'vitest'
import { openMemoryDb, seedMinimalCard } from '../test/helpers.js'
import { takePredictionSnapshot, computeTrackRecord } from './trackRecord.js'
import type Database from 'better-sqlite3'

describe('trackRecord', () => {
  let db: Database.Database

  beforeEach(() => {
    db = openMemoryDb()
  })

  describe('takePredictionSnapshot', () => {
    it('creates snapshot rows for cards with predictions', () => {
      seedMinimalCard(db)
      takePredictionSnapshot(db)

      const rows = db
        .prepare('SELECT * FROM prediction_snapshots')
        .all() as { card_id: string; predicted_price: number; market_price: number }[]
      expect(rows.length).toBe(1)
      expect(rows[0].card_id).toBe('test-card-1')
      expect(rows[0].predicted_price).toBe(12)
      expect(rows[0].market_price).toBe(10)
    })

    it('upserts on same day', () => {
      seedMinimalCard(db)
      takePredictionSnapshot(db)

      db.prepare(`UPDATE cards SET predicted_price = 15 WHERE id = 'test-card-1'`).run()
      takePredictionSnapshot(db)

      const rows = db.prepare('SELECT * FROM prediction_snapshots').all()
      expect(rows.length).toBe(1)
      expect((rows[0] as { predicted_price: number }).predicted_price).toBe(15)
    })

    it('skips cards with no prediction and no market price', () => {
      seedMinimalCard(db)
      db.prepare(`UPDATE cards SET predicted_price = NULL, market_price = NULL WHERE id = 'test-card-1'`).run()
      takePredictionSnapshot(db)

      const rows = db.prepare('SELECT * FROM prediction_snapshots').all()
      expect(rows.length).toBe(0)
    })
  })

  describe('computeTrackRecord', () => {
    it('returns empty-ish response with no data', () => {
      const result = computeTrackRecord(db)
      expect(result.total_signals_evaluated).toBe(0)
      expect(result.active_signals).toBe(0)
      expect(result.accuracy_timeline).toEqual([])
      expect(result.top_winners).toEqual([])
      expect(result.notable_misses).toEqual([])
    })

    it('computes prediction accuracy from snapshots', () => {
      seedMinimalCard(db)
      takePredictionSnapshot(db)

      const result = computeTrackRecord(db)
      expect(result.prediction_accuracy_pct).toBeGreaterThan(0)
      expect(result.accuracy_timeline.length).toBe(1)
      expect(result.accuracy_timeline[0].mean_error_pct).toBeGreaterThanOrEqual(0)
    })

    it('picks up undervalued signals from snapshots', () => {
      seedMinimalCard(db)
      db.prepare(
        `UPDATE cards SET valuation_flag = '🟢 UNDERVALUED — BUY SIGNAL', undervalued_since = datetime('now', '-10 days') WHERE id = 'test-card-1'`,
      ).run()
      takePredictionSnapshot(db)

      const result = computeTrackRecord(db)
      expect(result.accuracy_timeline[0].signal_count).toBe(1)
    })

    it('tracks legacy undervalued_since signals without snapshots', () => {
      seedMinimalCard(db)
      db.prepare(
        `UPDATE cards SET valuation_flag = '🟢 UNDERVALUED — BUY SIGNAL', undervalued_since = datetime('now', '-30 days') WHERE id = 'test-card-1'`,
      ).run()
      db.prepare(
        `INSERT INTO price_history (card_id, timestamp, tcgplayer_market) VALUES (?, datetime('now', '-30 days'), ?)`,
      ).run('test-card-1', 8)

      const result = computeTrackRecord(db)
      const allSignals = [
        ...result.top_winners,
        ...result.notable_misses,
        ...result.active_signal_details,
      ]
      expect(allSignals.length).toBeGreaterThanOrEqual(1)
    })

    it('includes prediction_vs_actual scatter data', () => {
      seedMinimalCard(db)
      const result = computeTrackRecord(db)
      expect(result.prediction_vs_actual.length).toBe(1)
      expect(result.prediction_vs_actual[0].name).toBe('Pikachu')
      expect(result.prediction_vs_actual[0].predicted).toBe(12)
      expect(result.prediction_vs_actual[0].actual).toBe(10)
    })

    it('confidence score stays in 0–100 range', () => {
      seedMinimalCard(db)
      takePredictionSnapshot(db)
      const result = computeTrackRecord(db)
      expect(result.confidence_score).toBeGreaterThanOrEqual(0)
      expect(result.confidence_score).toBeLessThanOrEqual(100)
    })

    it('includes meta with snapshot date range and card counts', () => {
      seedMinimalCard(db)
      takePredictionSnapshot(db)
      const result = computeTrackRecord(db)
      expect(result.meta).toBeDefined()
      expect(result.meta.total_snapshot_days).toBe(1)
      expect(result.meta.total_cards_tracked).toBe(1)
      expect(result.meta.first_snapshot_date).toBeTruthy()
      expect(result.meta.last_snapshot_date).toBeTruthy()
      expect(result.meta.signal_evaluation_threshold_days).toBe(7)
      expect(result.meta.valuation_thresholds.undervalued_ratio).toBe(0.8)
      expect(typeof result.meta.model_refresh_frequency).toBe('string')
    })

    it('meta returns nulls when no snapshots exist', () => {
      const result = computeTrackRecord(db)
      expect(result.meta.first_snapshot_date).toBeNull()
      expect(result.meta.last_snapshot_date).toBeNull()
      expect(result.meta.total_snapshot_days).toBe(0)
      expect(result.meta.total_cards_tracked).toBe(0)
    })
  })
})

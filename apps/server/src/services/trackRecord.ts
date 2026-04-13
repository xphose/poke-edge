import type Database from 'better-sqlite3'

/**
 * Snapshot current model predictions for every card.
 * Called after each full model run so we can later compare against actual outcomes.
 * Uses date-level granularity (one snapshot per card per day).
 */
export function takePredictionSnapshot(db: Database.Database) {
  const date = new Date().toISOString().slice(0, 10)

  const rows = db
    .prepare(
      `SELECT id, predicted_price, market_price, valuation_flag,
              desirability_score, pull_cost_score, future_value_12m, annual_growth_rate
       FROM cards
       WHERE predicted_price IS NOT NULL OR market_price IS NOT NULL`,
    )
    .all() as {
    id: string
    predicted_price: number | null
    market_price: number | null
    valuation_flag: string | null
    desirability_score: number | null
    pull_cost_score: number | null
    future_value_12m: number | null
    annual_growth_rate: number | null
  }[]

  const stmt = db.prepare(
    `INSERT INTO prediction_snapshots
       (card_id, snapshot_date, predicted_price, market_price, valuation_flag,
        desirability_score, pull_cost_score, future_value_12m, annual_growth_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(card_id, snapshot_date) DO UPDATE SET
       predicted_price   = excluded.predicted_price,
       market_price      = excluded.market_price,
       valuation_flag    = excluded.valuation_flag,
       desirability_score = excluded.desirability_score,
       pull_cost_score   = excluded.pull_cost_score,
       future_value_12m  = excluded.future_value_12m,
       annual_growth_rate = excluded.annual_growth_rate`,
  )

  const tx = db.transaction(() => {
    for (const r of rows) {
      stmt.run(
        r.id, date, r.predicted_price, r.market_price, r.valuation_flag,
        r.desirability_score, r.pull_cost_score, r.future_value_12m, r.annual_growth_rate,
      )
    }
  })
  tx()
}

/* ------------------------------------------------------------------ */
/*  Types returned by the /api/track-record endpoint                   */
/* ------------------------------------------------------------------ */

export type SignalOutcome = {
  card_id: string
  card_name: string
  set_name: string | null
  image_url: string | null
  signal_date: string
  price_at_signal: number
  current_price: number
  return_pct: number
  days_held: number
  status: 'active' | 'resolved_win' | 'resolved_loss'
}

export type AccuracyPoint = {
  date: string
  mean_error_pct: number
  signal_count: number
  hit_rate: number | null
}

export type TrackRecordMeta = {
  first_snapshot_date: string | null
  last_snapshot_date: string | null
  total_snapshot_days: number
  total_cards_tracked: number
  total_signals_ever: number
  model_refresh_frequency: string
  snapshot_frequency: string
  signal_evaluation_threshold_days: number
  valuation_thresholds: { undervalued_ratio: number; overvalued_ratio: number }
}

export type TrackRecordResponse = {
  meta: TrackRecordMeta
  confidence_score: number
  prediction_accuracy_pct: number
  buy_signal_hit_rate: number
  buy_signal_avg_return: number
  total_signals_evaluated: number
  active_signals: number
  accuracy_timeline: AccuracyPoint[]
  top_winners: SignalOutcome[]
  notable_misses: SignalOutcome[]
  active_signal_details: SignalOutcome[]
  prediction_vs_actual: { predicted: number; actual: number; name: string }[]
}

/* ------------------------------------------------------------------ */
/*  Compute the full track record from snapshots + current prices      */
/* ------------------------------------------------------------------ */

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function computeTrackRecord(db: Database.Database): TrackRecordResponse {
  // --- 0. Metadata ---
  const snapshotRange = db
    .prepare(
      `SELECT MIN(snapshot_date) AS first, MAX(snapshot_date) AS last,
              COUNT(DISTINCT snapshot_date) AS days, COUNT(DISTINCT card_id) AS cards
       FROM prediction_snapshots`,
    )
    .get() as { first: string | null; last: string | null; days: number; cards: number }

  const totalSignalsEver = db
    .prepare(
      `SELECT COUNT(DISTINCT card_id) AS c FROM prediction_snapshots WHERE valuation_flag LIKE '%UNDERVALUED%'`,
    )
    .get() as { c: number }

  const meta: TrackRecordMeta = {
    first_snapshot_date: snapshotRange.first,
    last_snapshot_date: snapshotRange.last,
    total_snapshot_days: snapshotRange.days,
    total_cards_tracked: snapshotRange.cards,
    total_signals_ever: totalSignalsEver.c,
    model_refresh_frequency: 'Every 4 hours (automatic) + on-demand',
    snapshot_frequency: 'Daily at midnight + after each model refresh',
    signal_evaluation_threshold_days: 7,
    valuation_thresholds: { undervalued_ratio: 0.8, overvalued_ratio: 1.25 },
  }

  // --- 1. Prediction accuracy: compare predicted vs actual market for each snapshot date ---
  const dates = db
    .prepare(`SELECT DISTINCT snapshot_date FROM prediction_snapshots ORDER BY snapshot_date`)
    .all() as { snapshot_date: string }[]

  const timeline: AccuracyPoint[] = []
  const allErrors: number[] = []

  for (const { snapshot_date } of dates) {
    const rows = db
      .prepare(
        `SELECT ps.predicted_price, ps.market_price, ps.valuation_flag
         FROM prediction_snapshots ps
         WHERE ps.snapshot_date = ?
           AND ps.predicted_price IS NOT NULL AND ps.predicted_price > 0
           AND ps.market_price IS NOT NULL AND ps.market_price > 0`,
      )
      .all(snapshot_date) as {
      predicted_price: number
      market_price: number
      valuation_flag: string | null
    }[]

    const errors: number[] = []
    let signals = 0
    for (const r of rows) {
      const err = Math.abs(r.predicted_price - r.market_price) / r.market_price
      errors.push(err)
      if (r.valuation_flag?.includes('UNDERVALUED')) signals++
    }
    if (errors.length > 0) {
      allErrors.push(...errors)
      timeline.push({
        date: snapshot_date,
        mean_error_pct: Math.round(median(errors) * 10000) / 100,
        signal_count: signals,
        hit_rate: null, // filled below
      })
    }
  }

  // --- 2. Buy signal outcomes: track every card that was flagged UNDERVALUED ---
  // For each signal, find earliest snapshot date with that flag, get price then vs now
  const signalRows = db
    .prepare(
      `SELECT ps.card_id, MIN(ps.snapshot_date) AS signal_date,
              ps.market_price AS price_at_signal
       FROM prediction_snapshots ps
       WHERE ps.valuation_flag LIKE '%UNDERVALUED%'
         AND ps.market_price IS NOT NULL AND ps.market_price > 0
       GROUP BY ps.card_id`,
    )
    .all() as { card_id: string; signal_date: string; price_at_signal: number }[]

  // Also use undervalued_since from cards table as a fallback for signals before snapshots existed
  const legacySignals = db
    .prepare(
      `SELECT c.id AS card_id, c.undervalued_since AS signal_date, c.name AS card_name,
              c.market_price AS current_price, c.image_url, s.name AS set_name
       FROM cards c
       LEFT JOIN sets s ON c.set_id = s.id
       WHERE c.undervalued_since IS NOT NULL AND c.market_price IS NOT NULL AND c.market_price > 0`,
    )
    .all() as {
    card_id: string
    signal_date: string
    card_name: string
    current_price: number
    image_url: string | null
    set_name: string | null
  }[]

  const outcomes: SignalOutcome[] = []
  const now = Date.now()
  const seenCards = new Set<string>()

  // Process snapshot-based signals
  for (const sig of signalRows) {
    seenCards.add(sig.card_id)
    const current = db
      .prepare(
        `SELECT c.name, c.market_price, c.image_url, s.name AS set_name
         FROM cards c LEFT JOIN sets s ON c.set_id = s.id
         WHERE c.id = ?`,
      )
      .get(sig.card_id) as
      | { name: string; market_price: number | null; image_url: string | null; set_name: string | null }
      | undefined
    if (!current?.market_price) continue

    // Also try to get the actual price at signal date from price_history for more accuracy
    const histPrice = db
      .prepare(
        `SELECT COALESCE(tcgplayer_market, pricecharting_median) AS price
         FROM price_history
         WHERE card_id = ? AND timestamp >= ? || 'T00:00:00'
         ORDER BY timestamp ASC LIMIT 1`,
      )
      .get(sig.card_id, sig.signal_date) as { price: number | null } | undefined

    const priceAtSignal = histPrice?.price ?? sig.price_at_signal
    const returnPct = ((current.market_price - priceAtSignal) / priceAtSignal) * 100
    const daysHeld = Math.round((now - new Date(sig.signal_date).getTime()) / 86_400_000)

    outcomes.push({
      card_id: sig.card_id,
      card_name: current.name,
      set_name: current.set_name,
      image_url: current.image_url,
      signal_date: sig.signal_date,
      price_at_signal: priceAtSignal,
      current_price: current.market_price,
      return_pct: Math.round(returnPct * 100) / 100,
      days_held: daysHeld,
      status: daysHeld < 7 ? 'active' : returnPct > 0 ? 'resolved_win' : 'resolved_loss',
    })
  }

  // Process legacy undervalued_since signals not covered by snapshots
  for (const sig of legacySignals) {
    if (seenCards.has(sig.card_id)) continue
    seenCards.add(sig.card_id)

    const histPrice = db
      .prepare(
        `SELECT COALESCE(tcgplayer_market, pricecharting_median) AS price
         FROM price_history
         WHERE card_id = ? AND timestamp <= ?
         ORDER BY timestamp DESC LIMIT 1`,
      )
      .get(sig.card_id, sig.signal_date) as { price: number | null } | undefined

    const priceAtSignal = histPrice?.price ?? sig.current_price
    if (priceAtSignal <= 0) continue
    const returnPct = ((sig.current_price - priceAtSignal) / priceAtSignal) * 100
    const daysHeld = Math.round((now - new Date(sig.signal_date).getTime()) / 86_400_000)

    outcomes.push({
      card_id: sig.card_id,
      card_name: sig.card_name,
      set_name: sig.set_name,
      image_url: sig.image_url,
      signal_date: sig.signal_date.slice(0, 10),
      price_at_signal: priceAtSignal,
      current_price: sig.current_price,
      return_pct: Math.round(returnPct * 100) / 100,
      days_held: daysHeld,
      status: daysHeld < 7 ? 'active' : returnPct > 0 ? 'resolved_win' : 'resolved_loss',
    })
  }

  // --- 3. Aggregate metrics ---
  const evaluated = outcomes.filter((o) => o.status !== 'active')
  const wins = evaluated.filter((o) => o.status === 'resolved_win')
  const hitRate = evaluated.length > 0 ? wins.length / evaluated.length : 0
  const avgReturn =
    evaluated.length > 0
      ? evaluated.reduce((s, o) => s + o.return_pct, 0) / evaluated.length
      : 0

  const medianError = allErrors.length > 0 ? median(allErrors) : 0.12
  const predictionAccuracy = Math.max(0, Math.min(100, (1 - medianError) * 100))

  // Fill hit rates on timeline
  for (const pt of timeline) {
    const asOf = new Date(pt.date).getTime()
    const relevantSignals = outcomes.filter(
      (o) => new Date(o.signal_date).getTime() <= asOf && o.status !== 'active',
    )
    const relevantWins = relevantSignals.filter((o) => o.status === 'resolved_win')
    pt.hit_rate =
      relevantSignals.length > 0
        ? Math.round((relevantWins.length / relevantSignals.length) * 100) / 100
        : null
  }

  // Confidence score: weighted blend of prediction accuracy + signal hit rate
  const hitRateComponent = hitRate * 100
  const confidenceScore = Math.round(
    Math.min(100, predictionAccuracy * 0.5 + hitRateComponent * 0.3 + Math.min(evaluated.length, 50) * 0.4),
  )

  // --- 4. Sort for display ---
  const sorted = [...outcomes].sort((a, b) => b.return_pct - a.return_pct)
  const topWinners = sorted.filter((o) => o.return_pct > 0).slice(0, 10)
  const notableMisses = [...sorted].reverse().filter((o) => o.return_pct < 0).slice(0, 10)
  const activeSignals = outcomes
    .filter((o) => o.status === 'active')
    .sort((a, b) => b.return_pct - a.return_pct)

  // --- 5. Prediction vs actual scatter data ---
  const scatterData = db
    .prepare(
      `SELECT c.name, c.predicted_price, c.market_price
       FROM cards c
       WHERE c.predicted_price IS NOT NULL AND c.predicted_price > 0
         AND c.market_price IS NOT NULL AND c.market_price > 0
       ORDER BY c.market_price DESC LIMIT 200`,
    )
    .all() as { name: string; predicted_price: number; market_price: number }[]

  return {
    meta,
    confidence_score: confidenceScore,
    prediction_accuracy_pct: Math.round(predictionAccuracy * 100) / 100,
    buy_signal_hit_rate: Math.round(hitRate * 10000) / 100,
    buy_signal_avg_return: Math.round(avgReturn * 100) / 100,
    total_signals_evaluated: evaluated.length,
    active_signals: activeSignals.length,
    accuracy_timeline: timeline,
    top_winners: topWinners,
    notable_misses: notableMisses,
    active_signal_details: activeSignals,
    prediction_vs_actual: scatterData.map((r) => ({
      predicted: r.predicted_price,
      actual: r.market_price,
      name: r.name,
    })),
  }
}

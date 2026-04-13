export type HelpSection = {
  id: string
  page: string
  title: string
  summary: string
  details: string[]
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'dashboard-overview',
    page: 'Dashboard',
    title: 'Dashboard overview',
    summary: 'High-level snapshot of model, pricing, and opportunity signals.',
    details: [
      'Dashboard cards and charts read from /api/dashboard, /api/cards, /api/sets, and /api/upcoming.',
      'All chart filters are local UI preferences only; they do not retrain or modify backend model outputs.',
      'Use this page to identify where to drill deeper into Cards, Buy Signals, and Sets.',
    ],
  },
  {
    id: 'dashboard-chart-panel',
    page: 'Dashboard',
    title: 'Chart panel and tabs',
    summary: 'Interactive charts that switch among pull-demand, fair-market, deal mix, and set ranking.',
    details: [
      'Pull vs demand: x = pull_cost_score, y = desirability_score, bubble size ~ price scale.',
      'Price reality check: x = market_price, y = predicted_price. Points below diagonal are below model fair.',
      'Deal mix bins positive discount where discount = ((fair - market) / fair) * 100.',
      'Sets with deals counts cards in each set with discount >= your minimum deal threshold.',
    ],
  },
  {
    id: 'dashboard-social-momentum',
    page: 'Dashboard',
    title: 'Social momentum',
    summary: 'Ranks cards by blended social activity signal.',
    details: [
      'Momentum score blends reddit_buzz_score and trends_score; trend fallback is used when Reddit is sparse.',
      'Rows are deduplicated by character family so one character does not dominate multiple slots.',
      'Higher momentum does not guarantee value; pair with fair-vs-market and set context.',
    ],
  },
  {
    id: 'dashboard-model-pipeline',
    page: 'Dashboard',
    title: 'Model pipeline',
    summary: 'Coverage diagnostics for ingestion, market pricing, model scoring, and social enrichment.',
    details: [
      'Shows counts with market prices, model predictions, and social signals currently available.',
      'Valuation chips summarize UNDERVALUED / FAIR / OVERVALUED distribution from valuation_flag.',
      'If coverage is low, run ingest/refresh before acting on outputs.',
    ],
  },
  {
    id: 'cards-overview',
    page: 'Cards',
    title: 'Cards page overview',
    summary: 'Main card explorer with sorting, filtering, trend, and deep model detail.',
    details: [
      'Filters combine name, set, print bucket, valuation flag, and sort order.',
      'Column chooser controls visibility only; no backend impact.',
      'Open a row to view full fair-value breakdown, trend chart, AI view, and buy links.',
    ],
  },
  {
    id: 'cards-model-fair',
    page: 'Cards',
    title: 'Model fair and valuation math',
    summary: 'How fair value and gap metrics are calculated.',
    details: [
      'Model fair is a heuristic estimate (pull/desirability + anchoring), not a guaranteed market quote.',
      'Dollar gap uses market - fair. Negative gap means market is below model fair (possible deal).',
      'Relative spread is normalized by the larger absolute price to avoid tiny-price distortion.',
    ],
  },
  {
    id: 'cards-30d-trend',
    page: 'Cards',
    title: '30d trend sparkline',
    summary: 'Small chart summarizing recent price movement.',
    details: [
      'Sparkline uses up to 31 latest points from price history.',
      'Price point source uses tcgplayer_market when present, otherwise pricecharting_median fallback.',
      'Displayed % is computed from first to last point in the sparkline window.',
    ],
  },
  {
    id: 'cards-detail-sheet',
    page: 'Cards',
    title: 'Card detail sheet',
    summary: 'Expanded view for one card with calculations and negotiation guidance.',
    details: [
      'Shows pull/desire, model fair, market, adjusted condition view, and optional explain_json details.',
      'AI investment section displays composite score and its signal components.',
      'Negotiation values are generated heuristics and should be treated as guidance bands.',
    ],
  },
  {
    id: 'cards-psa-roi',
    page: 'Cards',
    title: 'PSA ROI estimator',
    summary: 'Quick grading outcome estimate from raw price assumptions.',
    details: [
      'Estimated graded value uses fixed multipliers (PSA 9 ~1.6x, PSA 10 ~2.4x).',
      'ROI formula: ((estimatedGraded - gradingCost - rawPrice) / rawPrice) * 100.',
      'This is a rough scenario tool and excludes fees, shipping, and variance.',
    ],
  },
  {
    id: 'sets-overview',
    page: 'Sets',
    title: 'Sets page and verdicts',
    summary: 'Compares sealed product economics versus buying singles.',
    details: [
      'Verdicts classify each set as rip packs, rip with caution, buy singles, hold sealed, or break-even.',
      'EV ratio is EV per product divided by product price, shown as a percentage.',
      'Confidence icons reflect quantity/quality of price sources used.',
    ],
  },
  {
    id: 'sets-opportunity-map',
    page: 'Sets',
    title: 'Set opportunity map',
    summary: 'Scatter map positioning sets by chase intensity and EV ratio.',
    details: [
      'X-axis: chase score. Y-axis: EV / box price.',
      'Dot size scales with set size (card count). Color reflects verdict class.',
      'Use selection and hover to inspect details, then click through to set cards.',
    ],
  },
  {
    id: 'signals-overview',
    page: 'Buy Signals',
    title: 'Buy signals overview',
    summary: 'Cards currently flagged undervalued by model criteria.',
    details: [
      'Discount % uses ((fair - market) / fair) * 100 when fair and market are both positive.',
      'Most savings uses absolute dollars (fair - market).',
      'Sort and set filters help prioritize either efficiency (% off) or absolute savings.',
    ],
  },
  {
    id: 'watchlist-overview',
    page: 'Watchlist',
    title: 'Watchlist and alerts',
    summary: 'Track holdings or targets and monitor live market changes.',
    details: [
      'Each row stores quantity, optional purchase price, and optional target buy price.',
      'P&L is (market - purchase_price) * quantity when both prices are available.',
      'Browser push alerts require service worker registration and VAPID configuration.',
    ],
  },
  {
    id: 'alerts-overview',
    page: 'Alerts',
    title: 'Alerts action list',
    summary: 'Filtered high-priority BUY candidates with anomaly guardrails.',
    details: [
      'List is intended for score-qualified BUY-zone candidates from backend rules.',
      'Cards are shown with fair and market context for quick triage.',
      'Use Cards page for detailed validation before acting.',
    ],
  },
  {
    id: 'card-show-overview',
    page: 'Card Show',
    title: 'Card show export',
    summary: 'Offline printable export of top opportunities.',
    details: [
      'Exports a single HTML artifact for printing or event-floor usage.',
      'Includes top undervalued picks, negotiation bands, and QR back to dashboard.',
      'Data reflects latest server snapshot at time of export.',
    ],
  },
  {
    id: 'track-record-overview',
    page: 'Track Record',
    title: 'Track record overview',
    summary: 'Transparent performance tracking — see how the model\'s predictions hold up over time.',
    details: [
      'The Track Record page gives you full transparency into how the model performs. It is organized into four tabs: Overview, Trends, Accuracy Map, and Signals.',
      'The data coverage banner at the top shows the full tracking period, number of snapshots, cards tracked, and total buy signals ever issued.',
      'The Confidence Score (0–100) is a weighted blend: 50% prediction accuracy, 30% buy signal hit rate, and 20% sample size depth. Higher is better.',
      'Prediction Accuracy measures how close the model\'s "fair value" estimate is to actual market prices, calculated as (1 − median absolute error) × 100.',
      'Buy Signal Hit Rate shows what percentage of UNDERVALUED flags led to price increases. Signals need 7+ days before being evaluated.',
      'Data accumulates automatically — the model snapshots predictions daily at midnight and after every refresh (every 4 hours). Over days and weeks, the track record builds a complete picture.',
      'Use this page to gauge how much weight to give the model\'s recommendations and to spot trends in model quality.',
    ],
  },
  {
    id: 'track-record-methodology',
    page: 'Track Record',
    title: 'Methodology and scoring',
    summary: 'How the track record metrics are computed and what the numbers mean.',
    details: [
      'Confidence Score: blends prediction accuracy (50%), signal hit rate (30%), and how many signals have been evaluated (20%). Range 0–100. ≥70 = Excellent, ≥65 = Good, ≥45 = Fair, below = Building.',
      'Prediction Accuracy: for each snapshot day, we compare every card\'s predicted fair value to its actual market price. The metric is (1 − median absolute % error) × 100. Example: 85% accuracy means the median card prediction is within 15% of market.',
      'Buy Signal Hit Rate: a card is flagged UNDERVALUED when market price / predicted fair value < 0.80. We track the market price on the date the flag was first issued and compare to the current market price. "Hit" = price went up. Signals < 7 days old are shown as "active" and excluded from the hit rate calculation.',
      'Average Signal Return: the mean percentage return across all evaluated (7d+) buy signals. Positive means the model\'s buy signals are profitable on average.',
      'The valuation model uses a calibrated multiplicative formula: base × 1.19^pull_cost × 1.41^desirability, then shrinks toward peer tier medians and market anchoring. "OVERVALUED" is flagged when market/predicted > 1.25; "GROWTH BUY" when overvalued but 12-month projection exceeds market by 12%+ with ≥10% annual growth.',
      'Snapshots are taken daily at midnight and after each model refresh cycle (every 4 hours). Each snapshot records every card\'s predicted price, market price, and valuation flag.',
    ],
  },
  {
    id: 'track-record-timeline',
    page: 'Track Record',
    title: 'Prediction error timeline',
    summary: 'How the model\'s prediction error trends over time.',
    details: [
      'Each point on the chart is the median absolute percentage error between predicted fair value and actual market price for that snapshot day.',
      'Lower is better — a value of 10% means the model\'s fair estimate was within 10% of the actual market price, on average (median).',
      'The trend matters more than any single point: a downward trend means the model is improving; an upward trend means market conditions may be shifting.',
      'The chart tooltip also shows how many active buy signals existed on that date, giving context for signal-heavy vs signal-sparse periods.',
      'This chart requires at least 2 daily snapshots to render. Each point represents one day\'s worth of predictions across all tracked cards.',
    ],
  },
  {
    id: 'track-record-hit-rate',
    page: 'Track Record',
    title: 'Signal hit rate timeline',
    summary: 'Cumulative buy signal success rate over time.',
    details: [
      'Hit rate = (signals where price went up) / (total evaluated signals) as of each snapshot date.',
      'A signal is "evaluated" once it has been active for at least 7 days — this gives the market enough time to move.',
      'This chart shows the running (cumulative) hit rate up to each date, so it smooths out as more signals accumulate.',
      'Early on with few signals, the hit rate may be volatile (e.g. 0% or 100%). As more signals are evaluated, the rate stabilizes and becomes more meaningful.',
      'A sustained rate above 50% means the model identifies undervalued cards more often than not.',
    ],
  },
  {
    id: 'track-record-scatter',
    page: 'Track Record',
    title: 'Predicted vs actual scatter',
    summary: 'Visual comparison of model fair values against real market prices for up to 200 top cards.',
    details: [
      'Each dot is one card. X-axis = actual market price, Y-axis = model\'s fair value estimate. Up to 200 cards are shown, sorted by market price.',
      'The dashed diagonal line represents perfect prediction (predicted = actual). Points above the line are undervalued (model thinks they\'re worth more than market); points below are overvalued.',
      'Green dots: cards flagged as undervalued (model fair > market × 1.25). Blue dots: fairly valued (within 25% of each other). Red dots: overvalued (market > model fair × 1.25).',
      'A tight cluster along the diagonal means high overall model accuracy. Scatter spread indicates disagreement between model and market.',
      'The summary line above the chart shows counts of undervalued, fair, and overvalued cards in the current data set.',
    ],
  },
]

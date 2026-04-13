-- PokéEdge core schema + operational tables

CREATE TABLE IF NOT EXISTS api_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sets (
  id TEXT PRIMARY KEY,
  name TEXT,
  release_date TEXT,
  total_cards INTEGER,
  box_price REAL,
  ev_per_box REAL,
  set_chase_score REAL,
  rip_or_singles_verdict TEXT,
  series TEXT,
  images_json TEXT,
  last_updated TEXT
);

CREATE TABLE IF NOT EXISTS pull_rates (
  set_id TEXT NOT NULL,
  rarity_tier TEXT NOT NULL,
  pull_rate_denominator REAL NOT NULL,
  cards_in_rarity_slot INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (set_id, rarity_tier)
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  name TEXT,
  set_id TEXT,
  rarity TEXT,
  image_url TEXT,
  character_name TEXT,
  artist TEXT,
  card_type TEXT,
  artwork_hype_score REAL,
  char_premium_score REAL,
  pull_cost_raw REAL,
  pull_cost_score REAL,
  desirability_score REAL,
  predicted_price REAL,
  market_price REAL,
  ebay_median REAL,
  pricecharting_median REAL,
  cardmarket_eur REAL,
  valuation_flag TEXT,
  reddit_buzz_score REAL,
  trends_score REAL,
  explain_json TEXT,
  undervalued_since TEXT,
  future_value_12m REAL,
  annual_growth_rate REAL,
  last_updated TEXT,
  FOREIGN KEY (set_id) REFERENCES sets(id)
);

CREATE INDEX IF NOT EXISTS idx_cards_set ON cards(set_id);
CREATE INDEX IF NOT EXISTS idx_cards_character ON cards(character_name);
CREATE INDEX IF NOT EXISTS idx_cards_flag ON cards(valuation_flag);

CREATE TABLE IF NOT EXISTS price_history (
  card_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  tcgplayer_market REAL,
  tcgplayer_low REAL,
  ebay_median REAL,
  PRIMARY KEY (card_id, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_price_history_card ON price_history(card_id);

CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  condition TEXT,
  purchase_price REAL,
  purchase_date TEXT,
  target_buy_price REAL,
  alert_active INTEGER DEFAULT 0,
  artwork_override REAL
);

CREATE TABLE IF NOT EXISTS character_premiums (
  character_name TEXT PRIMARY KEY,
  avg_rank REAL,
  premium_score REAL,
  google_trends_score REAL,
  last_updated TEXT
);

CREATE TABLE IF NOT EXISTS regression_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  base_price REAL,
  r_squared REAL,
  fit_pull_coeff REAL,
  fit_desirability_coeff REAL,
  fitted_at TEXT
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  keys_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reddit_fetch_state (
  subreddit TEXT PRIMARY KEY,
  last_fullname TEXT,
  last_run TEXT
);

CREATE TABLE IF NOT EXISTS upcoming_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  release_date TEXT,
  source TEXT,
  predicted_top_json TEXT
);

CREATE TABLE IF NOT EXISTS prediction_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id TEXT,
  predicted_at TEXT,
  top_cards_json TEXT,
  actual_top_json TEXT,
  accuracy_note TEXT
);

CREATE TABLE IF NOT EXISTS fx_rates (
  base TEXT PRIMARY KEY,
  rates_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

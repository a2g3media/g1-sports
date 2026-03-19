
-- Bookmakers table
CREATE TABLE bookmakers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  region TEXT DEFAULT 'us',
  is_active BOOLEAN DEFAULT 1,
  priority INTEGER DEFAULT 100,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default bookmakers
INSERT INTO bookmakers (key, name, region, priority) VALUES
  ('draftkings', 'DraftKings', 'us', 1),
  ('fanduel', 'FanDuel', 'us', 2),
  ('betmgm', 'BetMGM', 'us', 3),
  ('caesars', 'Caesars', 'us', 4),
  ('pointsbet', 'PointsBet', 'us', 5),
  ('espnbet', 'ESPN BET', 'us', 6),
  ('bet365', 'Bet365', 'uk', 7),
  ('consensus', 'Consensus', 'all', 0);

-- Odds markets reference table
CREATE TABLE odds_markets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'MAIN',
  sort_order INTEGER DEFAULT 100,
  is_enabled BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed markets
INSERT INTO odds_markets (market_key, display_name, category, sort_order) VALUES
  ('SPREAD', 'Spread', 'MAIN', 1),
  ('TOTAL', 'Total', 'MAIN', 2),
  ('MONEYLINE', 'Moneyline', 'MAIN', 3),
  ('SPREAD_1H', '1H Spread', 'HALF', 10),
  ('TOTAL_1H', '1H Total', 'HALF', 11),
  ('ML_1H', '1H Moneyline', 'HALF', 12),
  ('SPREAD_2H', '2H Spread', 'HALF', 20),
  ('TOTAL_2H', '2H Total', 'HALF', 21),
  ('ML_2H', '2H Moneyline', 'HALF', 22),
  ('PLAYER_PROP', 'Player Prop', 'PROP', 30),
  ('TEAM_PROP', 'Team Prop', 'PROP', 31),
  ('ALT_SPREAD', 'Alt Spread', 'ALT', 40),
  ('ALT_TOTAL', 'Alt Total', 'ALT', 41),
  ('LIVE_SPREAD', 'Live Spread', 'LIVE', 50),
  ('LIVE_TOTAL', 'Live Total', 'LIVE', 51),
  ('LIVE_ML', 'Live Moneyline', 'LIVE', 52);

-- Current odds quotes (one row per book/market/outcome)
CREATE TABLE odds_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data_scope TEXT DEFAULT 'PROD',
  game_id TEXT NOT NULL,
  bookmaker_key TEXT NOT NULL,
  market_key TEXT NOT NULL,
  outcome_key TEXT NOT NULL,
  line_value REAL,
  price_american INTEGER,
  price_decimal REAL,
  implied_probability REAL,
  is_live BOOLEAN DEFAULT 0,
  source_provider TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_odds_quotes_game ON odds_quotes(game_id, data_scope);
CREATE INDEX idx_odds_quotes_lookup ON odds_quotes(game_id, market_key, bookmaker_key, data_scope);

-- Opening lines (captured once per game)
CREATE TABLE odds_opening (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data_scope TEXT DEFAULT 'PROD',
  game_id TEXT NOT NULL,
  bookmaker_key TEXT NOT NULL,
  market_key TEXT NOT NULL,
  outcome_key TEXT NOT NULL,
  opening_line_value REAL,
  opening_price_american INTEGER,
  opening_price_decimal REAL,
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_odds_opening_game ON odds_opening(game_id, data_scope);
CREATE UNIQUE INDEX idx_odds_opening_unique ON odds_opening(game_id, bookmaker_key, market_key, outcome_key, data_scope);

-- Snapshots for line movement history
CREATE TABLE odds_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data_scope TEXT DEFAULT 'PROD',
  game_id TEXT NOT NULL,
  bookmaker_key TEXT,
  market_key TEXT NOT NULL,
  outcome_key TEXT NOT NULL,
  line_value REAL,
  price_american INTEGER,
  price_decimal REAL,
  is_live BOOLEAN DEFAULT 0,
  captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_odds_snapshots_game ON odds_snapshots(game_id, data_scope);
CREATE INDEX idx_odds_snapshots_history ON odds_snapshots(game_id, market_key, captured_at, data_scope);


-- Current odds (one row per game, latest values)
CREATE TABLE sdio_odds_current (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  spread_home REAL,
  spread_away REAL,
  total REAL,
  moneyline_home INTEGER,
  moneyline_away INTEGER,
  open_spread REAL,
  open_total REAL,
  open_moneyline_home INTEGER,
  open_moneyline_away INTEGER,
  movement_spread REAL,
  movement_total REAL,
  last_updated DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(game_id)
);

CREATE INDEX idx_sdio_odds_current_game ON sdio_odds_current(game_id);

-- Odds history (append-only, tracks every change)
CREATE TABLE sdio_odds_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  spread_home REAL,
  spread_away REAL,
  total REAL,
  moneyline_home INTEGER,
  moneyline_away INTEGER,
  recorded_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sdio_odds_history_game ON sdio_odds_history(game_id);
CREATE INDEX idx_sdio_odds_history_recorded ON sdio_odds_history(recorded_at);

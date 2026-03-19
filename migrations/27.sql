
CREATE TABLE game_watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  data_scope TEXT DEFAULT 'PROD',
  game_id TEXT NOT NULL,
  sport_key TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  game_start_time TEXT NOT NULL,
  watch_spread BOOLEAN DEFAULT 1,
  watch_total BOOLEAN DEFAULT 1,
  watch_moneyline BOOLEAN DEFAULT 1,
  spread_alert_threshold REAL DEFAULT 0.5,
  total_alert_threshold REAL DEFAULT 0.5,
  ml_alert_threshold INTEGER DEFAULT 10,
  initial_spread REAL,
  initial_total REAL,
  initial_home_ml INTEGER,
  has_unread_alert BOOLEAN DEFAULT 0,
  last_alert_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_watchlist_user_scope ON game_watchlist(user_id, data_scope);
CREATE INDEX idx_watchlist_game ON game_watchlist(game_id);
CREATE UNIQUE INDEX idx_watchlist_user_game ON game_watchlist(user_id, game_id, data_scope);

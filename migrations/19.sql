
CREATE TABLE standings_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  period_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  total_points INTEGER DEFAULT 0,
  correct_picks INTEGER DEFAULT 0,
  total_picks INTEGER DEFAULT 0,
  win_percentage REAL DEFAULT 0,
  snapshot_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_standings_history_league ON standings_history(league_id);
CREATE INDEX idx_standings_history_user ON standings_history(user_id);
CREATE INDEX idx_standings_history_period ON standings_history(league_id, period_id);

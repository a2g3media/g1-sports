
CREATE TABLE picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  league_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL,
  period_id TEXT NOT NULL,
  pick_value TEXT NOT NULL,
  confidence_rank INTEGER,
  tiebreaker_value INTEGER,
  is_locked BOOLEAN DEFAULT 0,
  locked_at TIMESTAMP,
  receipt_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_picks_user_league ON picks(user_id, league_id);
CREATE INDEX idx_picks_period ON picks(league_id, period_id);
CREATE INDEX idx_picks_event ON picks(event_id);


CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT,
  sport_key TEXT NOT NULL,
  league_key TEXT,
  season TEXT,
  period_id TEXT,
  start_at TIMESTAMP NOT NULL,
  home_team TEXT,
  away_team TEXT,
  home_score INTEGER,
  away_score INTEGER,
  status TEXT DEFAULT 'scheduled',
  final_result TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_sport_key ON events(sport_key);
CREATE INDEX idx_events_period_id ON events(period_id);
CREATE INDEX idx_events_start_at ON events(start_at);
CREATE INDEX idx_events_external_id ON events(external_id);

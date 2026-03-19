
CREATE TABLE threshold_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data_scope TEXT DEFAULT 'PROD',
  sport_type TEXT NOT NULL,
  league_context_id INTEGER,
  game_id INTEGER,
  event_category TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO',
  headline TEXT NOT NULL,
  details_json TEXT,
  source TEXT,
  expires_at DATETIME,
  is_visible BOOLEAN DEFAULT 1,
  is_consumed BOOLEAN DEFAULT 0,
  rank_score REAL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_threshold_events_scope ON threshold_events(data_scope);
CREATE INDEX idx_threshold_events_game ON threshold_events(game_id);
CREATE INDEX idx_threshold_events_category ON threshold_events(event_category);
CREATE INDEX idx_threshold_events_severity ON threshold_events(severity);
CREATE INDEX idx_threshold_events_visible ON threshold_events(is_visible, expires_at);
CREATE INDEX idx_threshold_events_created ON threshold_events(created_at DESC);

CREATE TABLE threshold_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sport_type TEXT NOT NULL DEFAULT 'GLOBAL',
  threshold_key TEXT NOT NULL,
  threshold_value REAL NOT NULL,
  is_enabled BOOLEAN DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_threshold_config_key ON threshold_config(sport_type, threshold_key);

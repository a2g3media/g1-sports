-- Scout-specific alert preferences (extends alert_preferences)
CREATE TABLE scout_alert_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  category_line_movement BOOLEAN DEFAULT 1,
  category_injury BOOLEAN DEFAULT 1,
  category_weather BOOLEAN DEFAULT 1,
  category_game_state BOOLEAN DEFAULT 1,
  category_schedule BOOLEAN DEFAULT 1,
  line_movement_points REAL DEFAULT 0.5,
  weather_impact_minimum INTEGER DEFAULT 3,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_scout_alert_prefs_user ON scout_alert_preferences(user_id);

-- Scout-specific alerts with source tracking
CREATE TABLE scout_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data_scope TEXT DEFAULT 'PROD',
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO',
  headline TEXT NOT NULL,
  body TEXT,
  game_id TEXT,
  team_key TEXT,
  player_key TEXT,
  source_type TEXT,
  source_data_json TEXT,
  deep_link TEXT,
  dedupe_key TEXT NOT NULL,
  expires_at DATETIME,
  read_at DATETIME,
  dismissed_at DATETIME,
  action_taken TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_scout_alerts_user ON scout_alerts(user_id);
CREATE INDEX idx_scout_alerts_category ON scout_alerts(category);
CREATE INDEX idx_scout_alerts_dedupe ON scout_alerts(dedupe_key);
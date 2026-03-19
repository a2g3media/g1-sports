-- Maps pool periods to their relevant events (which games matter for this pool)
CREATE TABLE pool_event_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_id INTEGER NOT NULL,
  period_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'GAME',
  sport_key TEXT NOT NULL,
  home_team TEXT,
  away_team TEXT,
  start_time DATETIME,
  is_required BOOLEAN DEFAULT 0,
  metadata_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(pool_id, period_id, event_id)
);

CREATE INDEX idx_pool_event_map_pool_period ON pool_event_map(pool_id, period_id);
CREATE INDEX idx_pool_event_map_event ON pool_event_map(event_id);

-- Tracks user actions/selections within a pool (picks, entries, etc.)
CREATE TABLE pool_entry_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_id INTEGER NOT NULL,
  period_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  selection_id TEXT NOT NULL,
  selection_label TEXT,
  confidence_rank INTEGER,
  is_locked BOOLEAN DEFAULT 0,
  locked_at DATETIME,
  result TEXT,
  metadata_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(pool_id, period_id, user_id, event_id, action_type)
);

CREATE INDEX idx_pool_entry_actions_pool_period ON pool_entry_actions(pool_id, period_id);
CREATE INDEX idx_pool_entry_actions_event ON pool_entry_actions(event_id);
CREATE INDEX idx_pool_entry_actions_user ON pool_entry_actions(user_id);
CREATE INDEX idx_pool_entry_actions_selection ON pool_entry_actions(selection_id);

-- Caches live event state for quick lookups
CREATE TABLE event_live_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL DEFAULT 'GAME',
  sport_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  home_team TEXT,
  away_team TEXT,
  home_score INTEGER,
  away_score INTEGER,
  period TEXT,
  clock TEXT,
  live_data_json TEXT,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_event_live_state_status ON event_live_state(status);
CREATE INDEX idx_event_live_state_sport ON event_live_state(sport_key);

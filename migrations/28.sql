
-- Watchlists: named collections a user can create
CREATE TABLE watchlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'My Watchlist',
  is_default BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_watchlists_user ON watchlists(user_id);

-- Watchlist items: polymorphic follows (games, teams, leagues, pools, sports)
CREATE TABLE watchlist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  watchlist_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  sport_type TEXT,
  display_name TEXT,
  metadata_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, item_type, item_id)
);

CREATE INDEX idx_watchlist_items_user ON watchlist_items(user_id);
CREATE INDEX idx_watchlist_items_type ON watchlist_items(item_type, item_id);
CREATE INDEX idx_watchlist_items_watchlist ON watchlist_items(watchlist_id);

-- Alert events: user-facing alerts derived from threshold_events
CREATE TABLE alert_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data_scope TEXT DEFAULT 'PROD',
  user_id TEXT NOT NULL,
  threshold_event_id INTEGER,
  game_id TEXT,
  pool_id INTEGER,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO',
  headline TEXT NOT NULL,
  body TEXT,
  context_label TEXT,
  deep_link TEXT,
  dedupe_key TEXT NOT NULL,
  read_at DATETIME,
  dismissed_at DATETIME,
  delivery_status TEXT DEFAULT 'IN_APP_ONLY',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alert_events_user ON alert_events(user_id);
CREATE INDEX idx_alert_events_user_unread ON alert_events(user_id, read_at);
CREATE INDEX idx_alert_events_dedupe ON alert_events(user_id, dedupe_key);
CREATE INDEX idx_alert_events_severity ON alert_events(severity);
CREATE INDEX idx_alert_events_scope ON alert_events(data_scope);

-- Alert preferences: user notification settings
CREATE TABLE alert_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  is_enabled BOOLEAN DEFAULT 1,
  sensitivity TEXT DEFAULT 'CALM',
  severity_minimum TEXT DEFAULT 'IMPACT',
  channel_in_app BOOLEAN DEFAULT 1,
  channel_push BOOLEAN DEFAULT 0,
  channel_email BOOLEAN DEFAULT 0,
  channel_sms BOOLEAN DEFAULT 0,
  quiet_hours_enabled BOOLEAN DEFAULT 1,
  quiet_hours_start TEXT DEFAULT '22:00',
  quiet_hours_end TEXT DEFAULT '07:00',
  per_item_overrides_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alert_preferences_user ON alert_preferences(user_id);

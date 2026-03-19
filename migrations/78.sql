
CREATE TABLE player_alert_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  event_id TEXT,
  last_stat_value REAL,
  last_alert_type TEXT,
  last_alert_at DATETIME,
  prop_hit_alerted INTEGER DEFAULT 0,
  pace_alert_phase TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_player_alert_state_user_player ON player_alert_state(user_id, player_id);
CREATE INDEX idx_player_alert_state_user_player_event ON player_alert_state(user_id, player_id, event_id);

CREATE TABLE player_alert_throttle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  last_sent_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, player_id, alert_type)
);

CREATE INDEX idx_player_alert_throttle_lookup ON player_alert_throttle(user_id, player_id, alert_type);

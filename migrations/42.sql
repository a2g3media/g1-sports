
-- Push notification tables

CREATE TABLE IF NOT EXISTS push_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data_json TEXT,
  data_scope TEXT NOT NULL DEFAULT 'PROD',
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_push_notifications_user_sent ON push_notifications(user_id, sent_at);
CREATE INDEX idx_push_notifications_scope ON push_notifications(data_scope);

CREATE TABLE IF NOT EXISTS push_delivery_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  alert_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  category TEXT NOT NULL,
  data_scope TEXT NOT NULL DEFAULT 'PROD',
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_push_delivery_user_sent ON push_delivery_log(user_id, sent_at);
CREATE INDEX idx_push_delivery_game ON push_delivery_log(game_id);
CREATE INDEX idx_push_delivery_scope ON push_delivery_log(data_scope);

CREATE TABLE IF NOT EXISTS push_suppression_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  alert_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  category TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  data_scope TEXT NOT NULL DEFAULT 'PROD',
  suppressed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_push_suppression_user ON push_suppression_log(user_id, suppressed_at);
CREATE INDEX idx_push_suppression_reason ON push_suppression_log(reason);
CREATE INDEX idx_push_suppression_scope ON push_suppression_log(data_scope);

-- Add alert preference to scout_alert_preferences
ALTER TABLE scout_alert_preferences ADD COLUMN alert_delivery_mode TEXT DEFAULT 'bundled';

-- Add data freshness tracking
CREATE TABLE IF NOT EXISTS data_freshness_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT NOT NULL,
  data_scope TEXT NOT NULL DEFAULT 'PROD',
  metadata_json TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_freshness_source_scope ON data_freshness_log(source_name, data_scope);

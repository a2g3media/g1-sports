CREATE TABLE IF NOT EXISTS partner_alert_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_key TEXT NOT NULL,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  provider TEXT NOT NULL,
  message TEXT NOT NULL,
  next_action TEXT NOT NULL,
  metric TEXT,
  metric_value REAL,
  metric_threshold REAL,
  status TEXT NOT NULL DEFAULT 'active',
  occurrences INTEGER NOT NULL DEFAULT 1,
  first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_partner_alert_events_status_updated
  ON partner_alert_events(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_alert_events_provider_updated
  ON partner_alert_events(provider, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_alert_events_category_updated
  ON partner_alert_events(category, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_alert_events_key_active
  ON partner_alert_events(alert_key, status);

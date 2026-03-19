
CREATE TABLE upgrade_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  from_tier TEXT,
  to_tier TEXT,
  trigger_source TEXT NOT NULL,
  trigger_context TEXT,
  trigger_feature TEXT,
  page_path TEXT,
  converted INTEGER DEFAULT 0,
  conversion_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_upgrade_events_user ON upgrade_events(user_id);
CREATE INDEX idx_upgrade_events_source ON upgrade_events(trigger_source);
CREATE INDEX idx_upgrade_events_created ON upgrade_events(created_at);
CREATE INDEX idx_upgrade_events_converted ON upgrade_events(converted);

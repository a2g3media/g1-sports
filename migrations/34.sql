
CREATE TABLE data_source_freshness (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL UNIQUE,
  source_name TEXT NOT NULL,
  category TEXT NOT NULL,
  last_successful_fetch TIMESTAMP,
  last_fetch_attempt TIMESTAMP,
  record_count INTEGER DEFAULT 0,
  freshness_status TEXT DEFAULT 'unknown',
  error_message TEXT,
  avg_latency_ms INTEGER,
  check_interval_minutes INTEGER DEFAULT 15,
  is_critical BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE data_freshness_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  headline TEXT NOT NULL,
  details TEXT,
  is_resolved BOOLEAN DEFAULT 0,
  resolved_at TIMESTAMP,
  resolved_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_freshness_source ON data_source_freshness(source_key);
CREATE INDEX idx_freshness_status ON data_source_freshness(freshness_status);
CREATE INDEX idx_freshness_alerts_unresolved ON data_freshness_alerts(is_resolved, created_at);

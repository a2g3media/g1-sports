
-- Custom alert rules for Elite users
CREATE TABLE custom_alert_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  data_scope TEXT NOT NULL DEFAULT 'PROD',
  name TEXT NOT NULL,
  description TEXT,
  
  -- Scope
  scope_type TEXT NOT NULL, -- 'WATCHLIST', 'LEAGUE', 'TEAM', 'PLAYER'
  scope_ids TEXT, -- JSON array of IDs (team abbrs, player IDs, league keys)
  scope_sports TEXT, -- JSON array of sport keys
  
  -- Trigger configuration
  trigger_type TEXT NOT NULL,
  -- SCORE_EVENT, PERIOD_BREAK, FINAL_SCORE, LINE_MOVEMENT, INJURY, WEATHER, DOMINANT_PERFORMANCE
  trigger_config_json TEXT NOT NULL, -- sport-aware thresholds and conditions
  
  -- Conditions
  threshold_value REAL,
  time_window_minutes INTEGER,
  
  -- Delivery
  is_bundled BOOLEAN DEFAULT 1,
  max_per_game_per_hour INTEGER DEFAULT 3,
  push_enabled BOOLEAN DEFAULT 1,
  in_app_enabled BOOLEAN DEFAULT 1,
  
  -- DND / Quiet Hours
  quiet_hours_enabled BOOLEAN DEFAULT 0,
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT 1,
  last_triggered_at DATETIME,
  trigger_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_custom_alert_rules_user ON custom_alert_rules(user_id, is_active);
CREATE INDEX idx_custom_alert_rules_trigger ON custom_alert_rules(trigger_type, is_active);

-- Log of rule triggers
CREATE TABLE custom_alert_rule_triggers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  data_scope TEXT NOT NULL DEFAULT 'PROD',
  game_id TEXT,
  trigger_data_json TEXT,
  alert_id INTEGER,
  was_bundled BOOLEAN DEFAULT 0,
  was_suppressed BOOLEAN DEFAULT 0,
  suppression_reason TEXT,
  triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rule_triggers_rule ON custom_alert_rule_triggers(rule_id);
CREATE INDEX idx_rule_triggers_user ON custom_alert_rule_triggers(user_id);

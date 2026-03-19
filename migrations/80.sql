-- User alerts for the Command Center
CREATE TABLE user_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  category TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 2,
  title TEXT NOT NULL,
  body TEXT,
  sport TEXT,
  game_id TEXT,
  team TEXT,
  player TEXT,
  deep_link TEXT,
  source TEXT,
  source_id TEXT,
  is_read BOOLEAN DEFAULT 0,
  read_at DATETIME,
  is_saved BOOLEAN DEFAULT 0,
  saved_at DATETIME,
  is_dismissed BOOLEAN DEFAULT 0,
  dismissed_at DATETIME,
  expires_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_alerts_user_id ON user_alerts(user_id);
CREATE INDEX idx_user_alerts_category ON user_alerts(category);
CREATE INDEX idx_user_alerts_created_at ON user_alerts(created_at);

-- Alert history for archival
CREATE TABLE alert_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  alert_id INTEGER NOT NULL,
  alert_type TEXT NOT NULL,
  category TEXT NOT NULL,
  priority INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  sport TEXT,
  game_id TEXT,
  team TEXT,
  player TEXT,
  deep_link TEXT,
  source TEXT,
  outcome TEXT,
  was_read BOOLEAN DEFAULT 0,
  was_saved BOOLEAN DEFAULT 0,
  was_acted_upon BOOLEAN DEFAULT 0,
  action_taken TEXT,
  original_created_at DATETIME NOT NULL,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alert_history_user_id ON alert_history(user_id);
CREATE INDEX idx_alert_history_archived_at ON alert_history(archived_at);
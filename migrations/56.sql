CREATE TABLE user_bonus_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  total_days_earned INTEGER DEFAULT 0,
  total_days_used INTEGER DEFAULT 0,
  days_remaining INTEGER DEFAULT 0,
  last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_bonus_days_user ON user_bonus_days(user_id);

-- Track AI interaction soft caps for free users
CREATE TABLE ai_interaction_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  interaction_date DATE NOT NULL,
  interaction_count INTEGER DEFAULT 0,
  last_interaction_at TIMESTAMP,
  trial_offer_shown BOOLEAN DEFAULT 0,
  trial_offer_shown_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, interaction_date)
);

CREATE INDEX idx_ai_tracking_user_date ON ai_interaction_tracking(user_id, interaction_date);

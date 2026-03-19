CREATE TABLE referral_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  referral_id INTEGER NOT NULL,
  reward_type TEXT NOT NULL DEFAULT 'PRO_DAYS',
  days_granted INTEGER NOT NULL,
  total_days_after INTEGER NOT NULL,
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_referral_rewards_user ON referral_rewards(user_id);
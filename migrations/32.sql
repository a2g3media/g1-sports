
-- User notification preferences for pick submission confirmations
CREATE TABLE user_notification_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  confirm_channel TEXT DEFAULT 'email',
  confirm_pick_submission BOOLEAN DEFAULT 1,
  confirm_pick_lock_reminder BOOLEAN DEFAULT 0,
  weekly_recap_opt_in BOOLEAN DEFAULT 1,
  phone_verified BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_notification_preferences_user_id ON user_notification_preferences(user_id);

-- Phone verification OTP flow
CREATE TABLE phone_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  phone TEXT NOT NULL,
  otp_code_hash TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  expires_at TIMESTAMP NOT NULL,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_phone_verifications_user_id ON phone_verifications(user_id);
CREATE INDEX idx_phone_verifications_status ON phone_verifications(status);

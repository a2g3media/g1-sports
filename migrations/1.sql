
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  is_phone_verified BOOLEAN DEFAULT 0,
  notification_email BOOLEAN DEFAULT 1,
  notification_sms BOOLEAN DEFAULT 0,
  notification_invites BOOLEAN DEFAULT 1,
  notification_reminders BOOLEAN DEFAULT 1,
  notification_results BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);

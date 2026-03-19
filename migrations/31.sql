
CREATE TABLE reminder_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  target_group TEXT,
  channels TEXT DEFAULT 'email',
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO reminder_templates (template_key, name, subject, body, target_group, channels) VALUES
('picks_due', 'Picks Due Soon', 'Don''t forget to submit your picks!', 'Hey {name}, the deadline is approaching! Submit your picks for {pool_name} before it''s too late.', 'missing_picks', 'email,push'),
('payment_required', 'Payment Required', 'Payment needed for {pool_name}', 'Hi {name}, your entry fee for {pool_name} is still pending. Pay now to be eligible for prizes.', 'unpaid', 'email'),
('welcome_join', 'Welcome / Join Now', 'You''re invited to join {pool_name}!', 'Hey {name}, you''ve been invited to join {pool_name}. Click below to accept your invitation and start playing!', 'invited', 'email');

CREATE TABLE reminder_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL,
  template_id INTEGER,
  sender_user_id INTEGER NOT NULL,
  target_group TEXT,
  target_user_ids TEXT,
  channel TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  recipient_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reminder_sends_league ON reminder_sends(league_id);

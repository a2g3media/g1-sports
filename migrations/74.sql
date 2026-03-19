CREATE TABLE ticket_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 2,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  deep_link TEXT,
  ticket_id INTEGER,
  event_id TEXT,
  leg_id INTEGER,
  is_read BOOLEAN DEFAULT 0,
  delivered_push BOOLEAN DEFAULT 0,
  delivered_banner BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ticket_alerts_user ON ticket_alerts(user_id);
CREATE INDEX idx_ticket_alerts_user_unread ON ticket_alerts(user_id, is_read);
CREATE INDEX idx_ticket_alerts_ticket ON ticket_alerts(ticket_id);
CREATE INDEX idx_ticket_alerts_created ON ticket_alerts(created_at);

CREATE TABLE alert_state_tracker (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  leg_id INTEGER,
  event_id TEXT,
  last_status TEXT,
  last_margin REAL,
  last_cover_state TEXT,
  last_alert_type TEXT,
  last_alert_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alert_state_user_leg ON alert_state_tracker(user_id, leg_id);
CREATE INDEX idx_alert_state_user_event ON alert_state_tracker(user_id, event_id);
CREATE INDEX idx_alert_state_updated ON alert_state_tracker(updated_at);

CREATE TABLE alert_throttle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  alert_category TEXT NOT NULL,
  last_sent_at TIMESTAMP NOT NULL,
  count_in_window INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alert_throttle_user_event ON alert_throttle(user_id, event_id);
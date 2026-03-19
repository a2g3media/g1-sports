ALTER TABLE partner_alert_events ADD COLUMN escalated_at DATETIME;
ALTER TABLE partner_alert_events ADD COLUMN escalation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_partner_alert_events_escalated
  ON partner_alert_events(escalated_at, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS partner_alert_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_event_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  destination TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(alert_event_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_partner_alert_notifications_status
  ON partner_alert_notifications(status, updated_at DESC);

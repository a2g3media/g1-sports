ALTER TABLE partner_alert_events ADD COLUMN acknowledged_at DATETIME;
ALTER TABLE partner_alert_events ADD COLUMN acknowledged_by TEXT;
ALTER TABLE partner_alert_events ADD COLUMN snoozed_until DATETIME;
ALTER TABLE partner_alert_events ADD COLUMN snooze_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_partner_alert_events_ack
  ON partner_alert_events(acknowledged_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_alert_events_snooze
  ON partner_alert_events(snoozed_until, status, updated_at DESC);

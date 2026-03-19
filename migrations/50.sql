
-- Performance indexes batch 2: Events, notifications, alerts

-- events: Game lookups by sport, status, date
CREATE INDEX IF NOT EXISTS idx_events_sport_key ON events(sport_key);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_start_at ON events(start_at);
CREATE INDEX IF NOT EXISTS idx_events_sport_status ON events(sport_key, status);

-- notifications: User inbox queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- alert_events: User alert feed
CREATE INDEX IF NOT EXISTS idx_alert_events_user_id ON alert_events(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_events_user_unread ON alert_events(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_alert_events_dedupe_key ON alert_events(dedupe_key);

-- scout_alerts: Scout notification queries
CREATE INDEX IF NOT EXISTS idx_scout_alerts_user_id ON scout_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_scout_alerts_user_unread ON scout_alerts(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_scout_alerts_dedupe_key ON scout_alerts(dedupe_key);

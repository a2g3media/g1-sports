
-- Performance indexes batch 4: Push, subscriptions, chat, misc

-- push_subscriptions: Push delivery lookups
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(is_active);

-- scheduled_notifications: Pending notification queries
CREATE INDEX IF NOT EXISTS idx_scheduled_notif_status ON scheduled_notifications(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_notif_scheduled ON scheduled_notifications(scheduled_for);

-- user_subscriptions: Subscription status checks
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);

-- league_feed: Chat/feed pagination
CREATE INDEX IF NOT EXISTS idx_league_feed_league ON league_feed(league_id);
CREATE INDEX IF NOT EXISTS idx_league_feed_created ON league_feed(league_id, created_at);

-- league_messages: Chat message retrieval
CREATE INDEX IF NOT EXISTS idx_league_messages_league ON league_messages(league_id);
CREATE INDEX IF NOT EXISTS idx_league_messages_created ON league_messages(league_id, created_at);

-- custom_alert_rules: User rule lookups
CREATE INDEX IF NOT EXISTS idx_custom_alert_rules_user ON custom_alert_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_alert_rules_active ON custom_alert_rules(user_id, is_active);

-- ai_interaction_tracking: Daily limit checks
CREATE INDEX IF NOT EXISTS idx_ai_tracking_user_date ON ai_interaction_tracking(user_id, interaction_date);

-- upgrade_events: Conversion tracking
CREATE INDEX IF NOT EXISTS idx_upgrade_events_user ON upgrade_events(user_id);
CREATE INDEX IF NOT EXISTS idx_upgrade_events_converted ON upgrade_events(converted);

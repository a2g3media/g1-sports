
DROP INDEX idx_freshness_source_scope;
DROP TABLE data_freshness_log;
ALTER TABLE scout_alert_preferences DROP COLUMN alert_delivery_mode;
DROP INDEX idx_push_suppression_scope;
DROP INDEX idx_push_suppression_reason;
DROP INDEX idx_push_suppression_user;
DROP TABLE push_suppression_log;
DROP INDEX idx_push_delivery_scope;
DROP INDEX idx_push_delivery_game;
DROP INDEX idx_push_delivery_user_sent;
DROP TABLE push_delivery_log;
DROP INDEX idx_push_notifications_scope;
DROP INDEX idx_push_notifications_user_sent;
DROP TABLE push_notifications;

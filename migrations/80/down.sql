DROP INDEX IF EXISTS idx_alert_history_archived_at;
DROP INDEX IF EXISTS idx_alert_history_user_id;
DROP TABLE IF EXISTS alert_history;

DROP INDEX IF EXISTS idx_user_alerts_created_at;
DROP INDEX IF EXISTS idx_user_alerts_category;
DROP INDEX IF EXISTS idx_user_alerts_user_id;
DROP TABLE IF EXISTS user_alerts;
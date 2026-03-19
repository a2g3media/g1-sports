
DROP TABLE demo_members;
DROP TABLE demo_settings;

ALTER TABLE users DROP COLUMN simulated_admin_mode;
ALTER TABLE users DROP COLUMN simulated_subscription;
ALTER TABLE users DROP COLUMN demo_mode_enabled;
ALTER TABLE users DROP COLUMN is_demo_user;

ALTER TABLE standings_history DROP COLUMN data_scope;
ALTER TABLE league_messages DROP COLUMN data_scope;
ALTER TABLE squares_scores DROP COLUMN data_scope;
ALTER TABLE squares DROP COLUMN data_scope;
ALTER TABLE squares_grids DROP COLUMN data_scope;
ALTER TABLE league_feed DROP COLUMN data_scope;
ALTER TABLE ai_event_log DROP COLUMN data_scope;
ALTER TABLE transaction_ledger DROP COLUMN data_scope;
ALTER TABLE event_log DROP COLUMN data_scope;
ALTER TABLE receipt_deliveries DROP COLUMN data_scope;
ALTER TABLE pick_receipts DROP COLUMN data_scope;
ALTER TABLE picks DROP COLUMN data_scope;
ALTER TABLE events DROP COLUMN data_scope;
ALTER TABLE league_members DROP COLUMN data_scope;
ALTER TABLE leagues DROP COLUMN data_scope;

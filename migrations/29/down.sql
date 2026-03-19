ALTER TABLE leagues DROP COLUMN pool_type_version;
ALTER TABLE leagues DROP COLUMN pool_type_id;

DROP INDEX idx_notification_deliveries_channel;
DROP INDEX idx_notification_deliveries_status;
DROP TABLE notification_deliveries;

DROP TABLE marketing_campaigns;
DROP TABLE marketing_segments;
DROP TABLE feature_flags;
DROP TABLE platform_settings;

DROP INDEX idx_pool_types_status;
DROP INDEX idx_pool_types_sport;
DROP TABLE pool_types;

ALTER TABLE users DROP COLUMN flags_json;
ALTER TABLE users DROP COLUMN subscription_status;
ALTER TABLE users DROP COLUMN last_active_at;
ALTER TABLE users DROP COLUMN status;
ALTER TABLE users DROP COLUMN roles;

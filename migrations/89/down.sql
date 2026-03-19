DROP INDEX IF EXISTS idx_pool_marketplace_status;
DROP TABLE IF EXISTS pool_marketplace_listings;

DROP INDEX IF EXISTS idx_commissioner_ratings_league;
DROP INDEX IF EXISTS idx_commissioner_ratings_commissioner;
DROP TABLE IF EXISTS commissioner_ratings;
DROP TABLE IF EXISTS commissioner_profiles;

DELETE FROM feature_flags
WHERE flag_key IN ('MARKETPLACE_ENABLED', 'LISTING_FEES_ENABLED', 'COMMISSIONER_RATINGS_ENABLED');

CREATE TABLE IF NOT EXISTS commissioner_profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  rating_avg REAL DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  total_pools INTEGER DEFAULT 0,
  total_members INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commissioner_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL,
  commissioner_user_id TEXT NOT NULL,
  rater_user_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(league_id, rater_user_id)
);

CREATE INDEX IF NOT EXISTS idx_commissioner_ratings_commissioner ON commissioner_ratings(commissioner_user_id);
CREATE INDEX IF NOT EXISTS idx_commissioner_ratings_league ON commissioner_ratings(league_id);

CREATE TABLE IF NOT EXISTS pool_marketplace_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL UNIQUE,
  listing_status TEXT NOT NULL DEFAULT 'listed',
  category_key TEXT,
  is_featured INTEGER DEFAULT 0,
  listing_fee_cents INTEGER DEFAULT 0,
  listed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pool_marketplace_status ON pool_marketplace_listings(listing_status, is_featured);

INSERT OR IGNORE INTO feature_flags (flag_key, is_enabled, description)
VALUES
  ('MARKETPLACE_ENABLED', 0, 'Enable public marketplace browse and commissioner profile flows.'),
  ('LISTING_FEES_ENABLED', 0, 'Require listing fee flow for marketplace publication.'),
  ('COMMISSIONER_RATINGS_ENABLED', 1, 'Enable commissioner ratings and review aggregation.');


CREATE TABLE user_follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_user_id TEXT NOT NULL,
  following_user_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(follower_user_id, following_user_id)
);

CREATE INDEX idx_user_follows_follower ON user_follows(follower_user_id);
CREATE INDEX idx_user_follows_following ON user_follows(following_user_id);

CREATE TABLE shared_picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  sport_key TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  pick_type TEXT NOT NULL,
  pick_side TEXT NOT NULL,
  line_value REAL,
  note TEXT,
  visibility TEXT DEFAULT 'friends',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shared_picks_user ON shared_picks(user_id);
CREATE INDEX idx_shared_picks_created ON shared_picks(created_at DESC);

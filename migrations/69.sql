
-- Watchboards: user's named collections of games to watch
CREATE TABLE watchboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'My Watchboard',
  pinned_game_id TEXT,
  is_active BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_watchboards_user_id ON watchboards(user_id);
CREATE INDEX idx_watchboards_user_active ON watchboards(user_id, is_active);

-- Watchboard games: games in each watchboard with order
CREATE TABLE watchboard_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  watchboard_id INTEGER NOT NULL,
  game_id TEXT NOT NULL,
  order_index INTEGER DEFAULT 0,
  added_from TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(watchboard_id, game_id)
);

CREATE INDEX idx_watchboard_games_board ON watchboard_games(watchboard_id);
CREATE INDEX idx_watchboard_games_order ON watchboard_games(watchboard_id, order_index);

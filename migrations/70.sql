
CREATE TABLE watchboard_props (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  watchboard_id INTEGER NOT NULL,
  game_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  player_id TEXT,
  team TEXT,
  sport TEXT NOT NULL,
  prop_type TEXT NOT NULL,
  line_value REAL NOT NULL,
  selection TEXT NOT NULL,
  odds_american INTEGER,
  current_stat_value REAL,
  order_index INTEGER DEFAULT 0,
  added_from TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_watchboard_props_watchboard ON watchboard_props(watchboard_id);
CREATE INDEX idx_watchboard_props_game ON watchboard_props(game_id);

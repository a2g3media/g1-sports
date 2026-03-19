
CREATE TABLE watchboard_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  watchboard_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  player_id TEXT,
  sport TEXT NOT NULL,
  team TEXT,
  team_abbr TEXT,
  position TEXT,
  headshot_url TEXT,
  prop_type TEXT,
  prop_line REAL,
  prop_selection TEXT,
  current_stat_value REAL,
  order_index INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_watchboard_players_user ON watchboard_players(user_id);
CREATE INDEX idx_watchboard_players_board ON watchboard_players(watchboard_id);
CREATE UNIQUE INDEX idx_watchboard_players_unique ON watchboard_players(watchboard_id, player_name, sport);

CREATE TABLE IF NOT EXISTS historical_verified_lines_strict (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sport TEXT NOT NULL,
  league TEXT,
  game_id TEXT NOT NULL,
  player_internal_id TEXT NOT NULL,
  stat_type TEXT NOT NULL,
  verified_line_value REAL NOT NULL,
  over_price REAL,
  under_price REAL,
  sportsbook TEXT,
  selected_snapshot_id INTEGER NOT NULL,
  snapshot_rule_used TEXT NOT NULL,
  locked_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_verified_strict_unique
ON historical_verified_lines_strict (sport, game_id, player_internal_id, stat_type);

CREATE INDEX IF NOT EXISTS idx_hist_verified_strict_game_player
ON historical_verified_lines_strict (sport, game_id, player_internal_id);

CREATE TABLE IF NOT EXISTS historical_verified_lines_expanded (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sport TEXT NOT NULL,
  league TEXT,
  game_id TEXT NOT NULL,
  player_internal_id TEXT NOT NULL,
  stat_type TEXT NOT NULL,
  verified_line_value REAL NOT NULL,
  over_price REAL,
  under_price REAL,
  sportsbook TEXT,
  selected_snapshot_id INTEGER NOT NULL,
  snapshot_rule_used TEXT NOT NULL,
  locked_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_verified_expanded_unique
ON historical_verified_lines_expanded (sport, game_id, player_internal_id, stat_type);

CREATE INDEX IF NOT EXISTS idx_hist_verified_expanded_game_player
ON historical_verified_lines_expanded (sport, game_id, player_internal_id);

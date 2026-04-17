-- Fully independent historical line archive foundation

CREATE TABLE IF NOT EXISTS canonical_teams (
  id TEXT PRIMARY KEY,
  sport TEXT NOT NULL,
  league TEXT,
  provider_team_id TEXT,
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_teams_provider
ON canonical_teams (sport, COALESCE(provider_team_id, ''));

CREATE TABLE IF NOT EXISTS canonical_games (
  id TEXT PRIMARY KEY,
  sport TEXT NOT NULL,
  league TEXT,
  provider_event_id TEXT,
  provider_game_id TEXT,
  home_team_id TEXT,
  away_team_id TEXT,
  start_time TEXT,
  status TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_canonical_games_sport_start
ON canonical_games (sport, start_time);

CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_games_provider
ON canonical_games (sport, COALESCE(provider_game_id, ''), COALESCE(provider_event_id, ''));

CREATE TABLE IF NOT EXISTS historical_prop_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sport TEXT NOT NULL,
  league TEXT,
  event_id TEXT,
  game_id TEXT,
  player_internal_id TEXT,
  player_provider_id TEXT,
  team_id TEXT,
  opponent_team_id TEXT,
  stat_type TEXT NOT NULL,
  market_type TEXT NOT NULL,
  line_value REAL NOT NULL,
  over_price REAL,
  under_price REAL,
  sportsbook TEXT,
  captured_at TEXT NOT NULL,
  game_start_time TEXT,
  source_payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'captured',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hist_snapshots_lookup
ON historical_prop_snapshots (sport, game_id, player_internal_id, stat_type, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_hist_snapshots_event
ON historical_prop_snapshots (sport, event_id, player_provider_id, stat_type, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_hist_snapshots_status
ON historical_prop_snapshots (status, captured_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_hist_snapshots_block_update
BEFORE UPDATE ON historical_prop_snapshots
BEGIN
  SELECT RAISE(ABORT, 'historical_prop_snapshots is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_hist_snapshots_block_delete
BEFORE DELETE ON historical_prop_snapshots
BEGIN
  SELECT RAISE(ABORT, 'historical_prop_snapshots is append-only');
END;

CREATE TABLE IF NOT EXISTS historical_verified_lines (
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(selected_snapshot_id) REFERENCES historical_prop_snapshots(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_verified_unique
ON historical_verified_lines (sport, game_id, player_internal_id, stat_type);

CREATE INDEX IF NOT EXISTS idx_hist_verified_game_player
ON historical_verified_lines (sport, game_id, player_internal_id);

CREATE TABLE IF NOT EXISTS historical_line_grades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sport TEXT NOT NULL,
  league TEXT,
  game_id TEXT NOT NULL,
  player_internal_id TEXT NOT NULL,
  stat_type TEXT NOT NULL,
  verified_line_value REAL NOT NULL,
  actual_stat_value REAL,
  grade_result TEXT NOT NULL,
  graded_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_grades_unique
ON historical_line_grades (sport, game_id, player_internal_id, stat_type);

CREATE INDEX IF NOT EXISTS idx_hist_grades_recent
ON historical_line_grades (graded_at DESC, sport);

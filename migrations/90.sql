CREATE TABLE IF NOT EXISTS pool_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  entry_number INTEGER NOT NULL DEFAULT 1,
  entry_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  is_primary INTEGER NOT NULL DEFAULT 0,
  entry_fee_cents INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(league_id, user_id, entry_number)
);

CREATE INDEX IF NOT EXISTS idx_pool_entries_league_user ON pool_entries(league_id, user_id);
CREATE INDEX IF NOT EXISTS idx_pool_entries_league_status ON pool_entries(league_id, status);

CREATE TABLE IF NOT EXISTS pool_entry_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_entry_id INTEGER NOT NULL,
  league_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  period_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pool_entry_events_entry_created ON pool_entry_events(pool_entry_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pool_entry_events_league_period ON pool_entry_events(league_id, period_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pool_entry_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_entry_id INTEGER NOT NULL UNIQUE,
  league_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  total_points INTEGER NOT NULL DEFAULT 0,
  correct_picks INTEGER NOT NULL DEFAULT 0,
  total_picks INTEGER NOT NULL DEFAULT 0,
  win_percentage REAL NOT NULL DEFAULT 0,
  longest_win_streak INTEGER NOT NULL DEFAULT 0,
  current_win_streak INTEGER NOT NULL DEFAULT 0,
  lives_remaining INTEGER,
  is_eliminated INTEGER NOT NULL DEFAULT 0,
  eliminated_period_id TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pool_entry_stats_league_points ON pool_entry_stats(league_id, total_points DESC);

CREATE TABLE IF NOT EXISTS pool_entry_weekly_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_entry_id INTEGER NOT NULL,
  league_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  period_id TEXT NOT NULL,
  rank INTEGER,
  rank_delta INTEGER,
  points_earned INTEGER NOT NULL DEFAULT 0,
  total_points INTEGER NOT NULL DEFAULT 0,
  correct_picks INTEGER NOT NULL DEFAULT 0,
  total_picks INTEGER NOT NULL DEFAULT 0,
  win_percentage REAL NOT NULL DEFAULT 0,
  recap_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(pool_entry_id, period_id)
);

CREATE INDEX IF NOT EXISTS idx_pool_entry_weekly_stats_league_period ON pool_entry_weekly_stats(league_id, period_id, rank);

ALTER TABLE picks ADD COLUMN entry_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_picks_league_user_entry_period ON picks(league_id, user_id, entry_id, period_id);

ALTER TABLE pick_receipts ADD COLUMN entry_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_pick_receipts_league_entry_period ON pick_receipts(league_id, entry_id, period_id);

ALTER TABLE standings_history ADD COLUMN entry_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_standings_history_league_entry_period ON standings_history(league_id, entry_id, period_id);

DROP INDEX IF EXISTS idx_pool_entry_actions_pool_period;
DROP INDEX IF EXISTS idx_pool_entry_actions_event;
DROP INDEX IF EXISTS idx_pool_entry_actions_user;
DROP INDEX IF EXISTS idx_pool_entry_actions_selection;

ALTER TABLE pool_entry_actions RENAME TO pool_entry_actions_legacy;

CREATE TABLE pool_entry_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_id INTEGER NOT NULL,
  period_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  entry_id INTEGER,
  event_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  selection_id TEXT NOT NULL,
  selection_label TEXT,
  confidence_rank INTEGER,
  is_locked BOOLEAN DEFAULT 0,
  locked_at DATETIME,
  result TEXT,
  metadata_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(pool_id, period_id, user_id, entry_id, event_id, action_type)
);

INSERT INTO pool_entry_actions (
  id,
  pool_id,
  period_id,
  user_id,
  entry_id,
  event_id,
  action_type,
  selection_id,
  selection_label,
  confidence_rank,
  is_locked,
  locked_at,
  result,
  metadata_json,
  created_at,
  updated_at
)
SELECT
  id,
  pool_id,
  period_id,
  user_id,
  NULL as entry_id,
  event_id,
  action_type,
  selection_id,
  selection_label,
  confidence_rank,
  is_locked,
  locked_at,
  result,
  metadata_json,
  created_at,
  updated_at
FROM pool_entry_actions_legacy;

DROP TABLE pool_entry_actions_legacy;

CREATE INDEX IF NOT EXISTS idx_pool_entry_actions_pool_period ON pool_entry_actions(pool_id, period_id);
CREATE INDEX IF NOT EXISTS idx_pool_entry_actions_event ON pool_entry_actions(event_id);
CREATE INDEX IF NOT EXISTS idx_pool_entry_actions_user ON pool_entry_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_pool_entry_actions_user_entry ON pool_entry_actions(user_id, entry_id, period_id);
CREATE INDEX IF NOT EXISTS idx_pool_entry_actions_selection ON pool_entry_actions(selection_id);

DROP INDEX IF EXISTS idx_pool_entry_actions_user_entry;
DROP INDEX IF EXISTS idx_pool_entry_actions_selection;
DROP INDEX IF EXISTS idx_pool_entry_actions_user;
DROP INDEX IF EXISTS idx_pool_entry_actions_event;
DROP INDEX IF EXISTS idx_pool_entry_actions_pool_period;

ALTER TABLE pool_entry_actions RENAME TO pool_entry_actions_v90;

CREATE TABLE pool_entry_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_id INTEGER NOT NULL,
  period_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
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
  UNIQUE(pool_id, period_id, user_id, event_id, action_type)
);

INSERT INTO pool_entry_actions (
  id,
  pool_id,
  period_id,
  user_id,
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
FROM pool_entry_actions_v90;

DROP TABLE pool_entry_actions_v90;

CREATE INDEX IF NOT EXISTS idx_pool_entry_actions_pool_period ON pool_entry_actions(pool_id, period_id);
CREATE INDEX IF NOT EXISTS idx_pool_entry_actions_event ON pool_entry_actions(event_id);
CREATE INDEX IF NOT EXISTS idx_pool_entry_actions_user ON pool_entry_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_pool_entry_actions_selection ON pool_entry_actions(selection_id);

DROP INDEX IF EXISTS idx_standings_history_league_entry_period;
ALTER TABLE standings_history DROP COLUMN entry_id;

DROP INDEX IF EXISTS idx_pick_receipts_league_entry_period;
ALTER TABLE pick_receipts DROP COLUMN entry_id;

DROP INDEX IF EXISTS idx_picks_league_user_entry_period;
ALTER TABLE picks DROP COLUMN entry_id;

DROP INDEX IF EXISTS idx_pool_entry_weekly_stats_league_period;
DROP TABLE IF EXISTS pool_entry_weekly_stats;

DROP INDEX IF EXISTS idx_pool_entry_stats_league_points;
DROP TABLE IF EXISTS pool_entry_stats;

DROP INDEX IF EXISTS idx_pool_entry_events_league_period;
DROP INDEX IF EXISTS idx_pool_entry_events_entry_created;
DROP TABLE IF EXISTS pool_entry_events;

DROP INDEX IF EXISTS idx_pool_entries_league_status;
DROP INDEX IF EXISTS idx_pool_entries_league_user;
DROP TABLE IF EXISTS pool_entries;

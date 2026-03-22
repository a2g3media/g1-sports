CREATE TABLE IF NOT EXISTS league_rule_acceptance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rule_hash TEXT,
  rule_snapshot_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(league_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_league_rule_acceptance_league_id
  ON league_rule_acceptance(league_id);

CREATE INDEX IF NOT EXISTS idx_league_rule_acceptance_user_id
  ON league_rule_acceptance(user_id);

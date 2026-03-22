-- Payout Engine Tables
CREATE TABLE IF NOT EXISTS payout_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL,
  bucket_type TEXT NOT NULL,
  total_pool_cents INTEGER NOT NULL DEFAULT 0,
  split_mode TEXT NOT NULL DEFAULT 'equal',
  tie_mode TEXT NOT NULL DEFAULT 'split_no_skip',
  placements_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(league_id, bucket_type)
);

CREATE INDEX IF NOT EXISTS idx_payout_config_league ON payout_config(league_id, is_active);

CREATE TABLE IF NOT EXISTS payout_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL,
  entry_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  bucket_type TEXT NOT NULL,
  period_id TEXT,
  place INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  is_tie_split INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT,
  approved_at TIMESTAMP,
  paid_at TIMESTAMP,
  voided_at TIMESTAMP,
  void_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payout_ledger_league ON payout_ledger(league_id, bucket_type, period_id);
CREATE INDEX IF NOT EXISTS idx_payout_ledger_user ON payout_ledger(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payout_ledger_entry ON payout_ledger(entry_id, status);

-- Calcutta Ownership Tables
CREATE TABLE IF NOT EXISTS calcutta_ownerships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  ownership_pct REAL NOT NULL DEFAULT 100,
  price_paid_cents INTEGER NOT NULL DEFAULT 0,
  acquired_via TEXT NOT NULL DEFAULT 'auction',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(league_id, team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_calcutta_ownerships_league ON calcutta_ownerships(league_id, team_id);
CREATE INDEX IF NOT EXISTS idx_calcutta_ownerships_user ON calcutta_ownerships(user_id, league_id);

-- Bundle Pool Support
CREATE TABLE IF NOT EXISTS bundle_pools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_league_id INTEGER NOT NULL,
  child_league_id INTEGER NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(parent_league_id, child_league_id)
);

CREATE INDEX IF NOT EXISTS idx_bundle_pools_parent ON bundle_pools(parent_league_id, is_active);
CREATE INDEX IF NOT EXISTS idx_bundle_pools_child ON bundle_pools(child_league_id);

-- Recalculation Audit Log
CREATE TABLE IF NOT EXISTS recalculation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL,
  period_id TEXT,
  trigger_type TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  is_dry_run INTEGER NOT NULL DEFAULT 0,
  snapshot_json TEXT,
  result_json TEXT,
  affected_entries INTEGER NOT NULL DEFAULT 0,
  affected_picks INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recalculation_log_league ON recalculation_log(league_id, created_at DESC);

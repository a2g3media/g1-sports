
-- Scheduler state and persistent locks
CREATE TABLE scheduler_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scheduler_key TEXT NOT NULL UNIQUE,
  is_enabled INTEGER DEFAULT 1,
  last_master_run_at DATETIME,
  last_live_run_at DATETIME,
  last_master_result TEXT,
  last_live_result TEXT,
  last_master_error TEXT,
  last_live_error TEXT,
  next_master_run_at DATETIME,
  next_live_run_at DATETIME,
  master_games_inserted INTEGER DEFAULT 0,
  master_odds_inserted INTEGER DEFAULT 0,
  master_props_inserted INTEGER DEFAULT 0,
  live_odds_inserted INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Persistent locks for preventing overlapping jobs
CREATE TABLE scheduler_locks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lock_key TEXT NOT NULL UNIQUE,
  acquired_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  holder_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default scheduler state
INSERT INTO scheduler_state (scheduler_key, is_enabled) VALUES ('sports_data', 1);

-- Index for faster lock lookups
CREATE INDEX idx_scheduler_locks_key ON scheduler_locks(lock_key);
CREATE INDEX idx_scheduler_locks_expires ON scheduler_locks(expires_at);

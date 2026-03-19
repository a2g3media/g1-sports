
CREATE TABLE tracker_picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  data_scope TEXT DEFAULT 'PROD',
  
  -- Game reference
  game_id TEXT NOT NULL,
  sport_key TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  game_start_time TEXT NOT NULL,
  
  -- Pick details
  pick_type TEXT NOT NULL,
  pick_side TEXT NOT NULL,
  line_value REAL,
  odds_american INTEGER NOT NULL,
  odds_decimal REAL NOT NULL,
  
  -- Stake
  stake_units REAL DEFAULT 1.0,
  stake_amount_cents INTEGER,
  
  -- Result
  result TEXT DEFAULT 'PENDING',
  result_profit_units REAL,
  result_profit_cents INTEGER,
  
  -- Metadata
  notes TEXT,
  is_graded BOOLEAN DEFAULT 0,
  graded_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tracker_picks_user ON tracker_picks(user_id);
CREATE INDEX idx_tracker_picks_game ON tracker_picks(game_id);
CREATE INDEX idx_tracker_picks_result ON tracker_picks(result);
CREATE INDEX idx_tracker_picks_sport ON tracker_picks(sport_key);


-- Squares grid configuration per league
CREATE TABLE squares_grids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL,
  event_id INTEGER,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  row_numbers TEXT,
  col_numbers TEXT,
  price_per_square_cents INTEGER DEFAULT 0,
  is_numbers_revealed BOOLEAN DEFAULT 0,
  game_date TEXT,
  game_time TEXT,
  venue TEXT,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Individual squares in the 10x10 grid
CREATE TABLE squares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grid_id INTEGER NOT NULL,
  row_num INTEGER NOT NULL,
  col_num INTEGER NOT NULL,
  owner_id TEXT,
  purchased_at TIMESTAMP,
  is_q1_winner BOOLEAN DEFAULT 0,
  is_q2_winner BOOLEAN DEFAULT 0,
  is_q3_winner BOOLEAN DEFAULT 0,
  is_q4_winner BOOLEAN DEFAULT 0,
  is_final_winner BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Quarter scores for squares pools
CREATE TABLE squares_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grid_id INTEGER NOT NULL,
  quarter TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  winning_square_id INTEGER,
  payout_cents INTEGER DEFAULT 0,
  is_paid BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_squares_grids_league ON squares_grids(league_id);
CREATE INDEX idx_squares_grid ON squares(grid_id);
CREATE INDEX idx_squares_owner ON squares(owner_id);
CREATE INDEX idx_squares_scores_grid ON squares_scores(grid_id);

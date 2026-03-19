
CREATE TABLE league_standings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data_scope TEXT DEFAULT 'PROD',
  sport_key TEXT NOT NULL,
  league_key TEXT NOT NULL,
  season TEXT NOT NULL,
  team_abbr TEXT NOT NULL,
  team_name TEXT NOT NULL,
  division TEXT,
  conference TEXT,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  ties INTEGER DEFAULT 0,
  win_pct REAL DEFAULT 0,
  games_back REAL,
  home_record TEXT,
  away_record TEXT,
  division_record TEXT,
  conference_record TEXT,
  streak TEXT,
  last_10 TEXT,
  points_for INTEGER DEFAULT 0,
  points_against INTEGER DEFAULT 0,
  point_diff INTEGER DEFAULT 0,
  rank_overall INTEGER,
  rank_division INTEGER,
  rank_conference INTEGER,
  clinched_playoff BOOLEAN DEFAULT 0,
  clinched_division BOOLEAN DEFAULT 0,
  eliminated BOOLEAN DEFAULT 0,
  source TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_standings_league ON league_standings(sport_key, league_key, season);
CREATE INDEX idx_standings_team ON league_standings(team_abbr);
CREATE INDEX idx_standings_division ON league_standings(division);
CREATE UNIQUE INDEX idx_standings_unique ON league_standings(sport_key, league_key, season, team_abbr);

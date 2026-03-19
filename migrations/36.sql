
CREATE TABLE injuries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data_scope TEXT DEFAULT 'PROD',
  sport_key TEXT NOT NULL,
  league_key TEXT,
  team_abbr TEXT NOT NULL,
  team_name TEXT NOT NULL,
  player_name TEXT NOT NULL,
  player_id TEXT,
  position TEXT,
  status TEXT NOT NULL,
  injury_type TEXT,
  injury_details TEXT,
  estimated_return TEXT,
  impact_rating TEXT,
  source TEXT,
  reported_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_injuries_team ON injuries(team_abbr, sport_key);
CREATE INDEX idx_injuries_sport ON injuries(sport_key);
CREATE INDEX idx_injuries_status ON injuries(status);
CREATE INDEX idx_injuries_updated ON injuries(updated_at);

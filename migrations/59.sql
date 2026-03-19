
-- Core games table with normalized structure
CREATE TABLE sdio_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_game_id TEXT NOT NULL,
  sport TEXT NOT NULL,
  league TEXT,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  start_time DATETIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  score_home INTEGER,
  score_away INTEGER,
  period TEXT,
  clock TEXT,
  venue TEXT,
  last_sync DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider_game_id, sport)
);

CREATE INDEX idx_sdio_games_sport ON sdio_games(sport);
CREATE INDEX idx_sdio_games_start_time ON sdio_games(start_time);
CREATE INDEX idx_sdio_games_status ON sdio_games(status);
CREATE INDEX idx_sdio_games_sport_status ON sdio_games(sport, status);

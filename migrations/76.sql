
CREATE TABLE coach_g_previews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  sport TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  game_start_at DATETIME NOT NULL,
  preview_content TEXT NOT NULL,
  sources_used TEXT,
  scraped_data TEXT,
  word_count INTEGER,
  generation_cost_cents INTEGER,
  expires_at DATETIME NOT NULL,
  is_stale INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_coach_g_previews_game ON coach_g_previews(game_id);
CREATE INDEX idx_coach_g_previews_expires ON coach_g_previews(expires_at);
CREATE INDEX idx_coach_g_previews_sport ON coach_g_previews(sport);

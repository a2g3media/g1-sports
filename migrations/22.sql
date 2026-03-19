
CREATE TABLE survivor_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  entry_number INTEGER DEFAULT 1,
  lives_remaining INTEGER DEFAULT 1,
  is_eliminated BOOLEAN DEFAULT 0,
  eliminated_at DATETIME,
  eliminated_period TEXT,
  reentry_from_entry_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_survivor_entries_league_user ON survivor_entries(league_id, user_id);
CREATE INDEX idx_survivor_entries_league_active ON survivor_entries(league_id, is_eliminated);

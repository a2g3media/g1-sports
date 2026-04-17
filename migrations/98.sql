CREATE TABLE IF NOT EXISTS player_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias_name TEXT NOT NULL,
  canonical_player_id TEXT,
  canonical_player_key TEXT NOT NULL DEFAULT '',
  sport TEXT NOT NULL,
  confidence_score REAL,
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_aliases_unique
ON player_aliases (sport, alias_name, canonical_player_key);

CREATE INDEX IF NOT EXISTS idx_player_aliases_sport_alias
ON player_aliases (sport, alias_name);

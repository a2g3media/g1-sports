-- Canonical player identity registry + conflict log (Wave A1)

CREATE TABLE IF NOT EXISTS canonical_players (
  sport TEXT NOT NULL,
  canonical_player_id TEXT NOT NULL,
  espn_player_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  team_ids_json TEXT NOT NULL DEFAULT '[]',
  provider_ids_json TEXT NOT NULL DEFAULT '{}',
  position TEXT,
  jersey TEXT,
  status TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (sport, canonical_player_id),
  UNIQUE (sport, espn_player_id)
);

CREATE INDEX IF NOT EXISTS idx_canonical_players_updated
ON canonical_players(updated_at);

CREATE TABLE IF NOT EXISTS canonical_player_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sport TEXT NOT NULL,
  espn_player_id TEXT NOT NULL,
  input_name TEXT,
  existing_name TEXT,
  reason TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_canonical_conflicts_sport_player
ON canonical_player_conflicts(sport, espn_player_id);

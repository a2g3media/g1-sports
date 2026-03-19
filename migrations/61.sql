
-- Current props (one row per player/prop combination)
CREATE TABLE sdio_props_current (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  team TEXT,
  prop_type TEXT NOT NULL,
  line_value REAL NOT NULL,
  open_line_value REAL,
  movement REAL,
  last_updated DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(game_id, player_name, prop_type)
);

CREATE INDEX idx_sdio_props_current_game ON sdio_props_current(game_id);
CREATE INDEX idx_sdio_props_current_prop_type ON sdio_props_current(prop_type);
CREATE INDEX idx_sdio_props_current_player ON sdio_props_current(player_name);

-- Props history (append-only, tracks every line change)
CREATE TABLE sdio_props_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  prop_type TEXT NOT NULL,
  line_value REAL NOT NULL,
  recorded_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sdio_props_history_game ON sdio_props_history(game_id);
CREATE INDEX idx_sdio_props_history_recorded ON sdio_props_history(recorded_at);

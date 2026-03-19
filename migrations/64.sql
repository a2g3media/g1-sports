
CREATE TABLE line_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  sport TEXT NOT NULL,
  market_type TEXT NOT NULL,
  value REAL NOT NULL,
  timestamp DATETIME NOT NULL,
  source TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_line_history_game_id ON line_history(game_id);
CREATE INDEX idx_line_history_game_market ON line_history(game_id, market_type);
CREATE INDEX idx_line_history_timestamp ON line_history(timestamp);

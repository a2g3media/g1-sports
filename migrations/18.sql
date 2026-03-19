
CREATE TABLE league_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  reply_to_id INTEGER,
  is_edited BOOLEAN DEFAULT 0,
  is_deleted BOOLEAN DEFAULT 0,
  reactions_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_league_messages_league ON league_messages(league_id);
CREATE INDEX idx_league_messages_created ON league_messages(created_at);

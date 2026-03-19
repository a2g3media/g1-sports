
CREATE TABLE ai_event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  persona TEXT NOT NULL,
  user_id INTEGER,
  league_id INTEGER,
  request_text TEXT NOT NULL,
  response_text TEXT,
  sources_used TEXT,
  flags TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_event_log_user ON ai_event_log(user_id);
CREATE INDEX idx_ai_event_log_league ON ai_event_log(league_id);
CREATE INDEX idx_ai_event_log_persona ON ai_event_log(persona);

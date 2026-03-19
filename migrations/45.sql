-- Elite AI session memory for multi-turn context
CREATE TABLE ai_session_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL DEFAULT 1,
  user_message TEXT NOT NULL,
  assistant_response TEXT NOT NULL,
  tools_used TEXT,
  games_referenced TEXT,
  teams_referenced TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_session_memory_user_session ON ai_session_memory(user_id, session_id);
CREATE INDEX idx_ai_session_memory_user_recent ON ai_session_memory(user_id, created_at DESC);

-- AI routing performance metrics
CREATE TABLE ai_routing_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  response_time_ms INTEGER NOT NULL,
  queue_wait_ms INTEGER DEFAULT 0,
  was_cached BOOLEAN DEFAULT 0,
  was_rate_limited BOOLEAN DEFAULT 0,
  error_type TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_routing_metrics_tier ON ai_routing_metrics(tier, created_at);
CREATE INDEX idx_ai_routing_metrics_user ON ai_routing_metrics(user_id, created_at);
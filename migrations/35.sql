
CREATE TABLE scout_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key TEXT NOT NULL UNIQUE,
  tool_name TEXT NOT NULL,
  data_json TEXT NOT NULL,
  source TEXT NOT NULL,
  last_updated TEXT NOT NULL,
  cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  hit_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_scout_cache_tool ON scout_cache(tool_name);
CREATE INDEX idx_scout_cache_expires ON scout_cache(expires_at);

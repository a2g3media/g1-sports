
-- Scout Memory: Followed Entities
-- Tracks teams, players, leagues that a user cares about
CREATE TABLE scout_memory_entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  data_scope TEXT DEFAULT 'PROD',
  entity_type TEXT NOT NULL, -- 'TEAM', 'PLAYER', 'LEAGUE', 'GAME'
  entity_key TEXT NOT NULL, -- team_abbr, player_id, league_key, game_id
  entity_name TEXT NOT NULL, -- display name
  sport_key TEXT NOT NULL,
  priority INTEGER DEFAULT 5, -- 1-10, higher = more important
  context TEXT, -- why following (e.g., "fantasy team", "hometown", "bet on them")
  auto_added BOOLEAN DEFAULT 0, -- true if Scout inferred this
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, data_scope, entity_type, entity_key)
);

-- Scout Memory: User Preferences
-- Controls how Scout personalizes responses
CREATE TABLE scout_memory_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  data_scope TEXT DEFAULT 'PROD',
  
  -- Tone preferences
  tone TEXT DEFAULT 'balanced', -- 'casual', 'balanced', 'analytical'
  detail_level TEXT DEFAULT 'medium', -- 'brief', 'medium', 'detailed'
  
  -- Focus areas
  focus_injuries BOOLEAN DEFAULT 1,
  focus_weather BOOLEAN DEFAULT 1,
  focus_trends BOOLEAN DEFAULT 1,
  focus_line_movement BOOLEAN DEFAULT 1,
  focus_matchups BOOLEAN DEFAULT 1,
  
  -- Context preferences
  include_historical_context BOOLEAN DEFAULT 1,
  include_market_context BOOLEAN DEFAULT 1,
  include_social_sentiment BOOLEAN DEFAULT 0,
  
  -- Personalization behavior
  auto_learn_follows BOOLEAN DEFAULT 1, -- learn from picks/questions
  use_memory_in_responses BOOLEAN DEFAULT 1,
  show_memory_citations BOOLEAN DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scout Memory: Interaction History
-- Tracks key questions/topics for learning
CREATE TABLE scout_memory_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  data_scope TEXT DEFAULT 'PROD',
  interaction_type TEXT NOT NULL, -- 'QUESTION', 'PICK', 'WATCHLIST_ADD', 'ALERT_VIEWED'
  topic TEXT, -- extracted topic (e.g., "Mahomes injury status", "Lakers vs Warriors")
  entity_keys TEXT, -- JSON array of entity keys mentioned
  sport_key TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_scout_memory_entities_user ON scout_memory_entities(user_id, data_scope, is_active);
CREATE INDEX idx_scout_memory_entities_type ON scout_memory_entities(entity_type, sport_key);
CREATE INDEX idx_scout_memory_interactions_user ON scout_memory_interactions(user_id, data_scope);
CREATE INDEX idx_scout_memory_interactions_created ON scout_memory_interactions(created_at);

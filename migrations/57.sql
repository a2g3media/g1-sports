
CREATE TABLE shared_takes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  share_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  game_context TEXT,
  scout_take TEXT NOT NULL,
  confidence TEXT,
  persona TEXT NOT NULL DEFAULT 'billy',
  sport_key TEXT,
  teams TEXT,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE share_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  share_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  referrer_url TEXT,
  user_agent TEXT,
  converted_user_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shared_takes_share_id ON shared_takes(share_id);
CREATE INDEX idx_shared_takes_user_id ON shared_takes(user_id);
CREATE INDEX idx_share_events_share_id ON share_events(share_id);
CREATE INDEX idx_share_events_event_type ON share_events(event_type);

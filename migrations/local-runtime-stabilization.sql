-- Local runtime stabilization migration.
-- This file is intentionally local-only and idempotent for table/index creation.

-- Bet Tickets core tables (from migrations/71.sql)
CREATE TABLE IF NOT EXISTS bet_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  title TEXT,
  sportsbook TEXT,
  ticket_type TEXT NOT NULL DEFAULT 'single',
  stake_amount REAL,
  to_win_amount REAL,
  total_odds INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  source TEXT NOT NULL DEFAULT 'manual',
  source_image_url TEXT,
  raw_ai_response TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bet_tickets_user_id ON bet_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_bet_tickets_status ON bet_tickets(status);

CREATE TABLE IF NOT EXISTS bet_ticket_legs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  leg_index INTEGER NOT NULL DEFAULT 0,
  sport TEXT,
  league TEXT,
  event_id TEXT,
  team_or_player TEXT NOT NULL,
  opponent_or_context TEXT,
  market_type TEXT NOT NULL DEFAULT 'Other',
  side TEXT,
  user_line_value REAL,
  user_odds INTEGER,
  stake_override REAL,
  confidence_score REAL,
  is_needs_review BOOLEAN DEFAULT 0,
  raw_text TEXT,
  leg_status TEXT NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bet_ticket_legs_ticket_id ON bet_ticket_legs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_bet_ticket_legs_event_id ON bet_ticket_legs(event_id);
CREATE INDEX IF NOT EXISTS idx_bet_ticket_legs_leg_status ON bet_ticket_legs(leg_status);

CREATE TABLE IF NOT EXISTS bet_ticket_watchboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  watchboard_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(ticket_id, watchboard_id)
);

CREATE INDEX IF NOT EXISTS idx_bet_ticket_watchboards_ticket_id ON bet_ticket_watchboards(ticket_id);
CREATE INDEX IF NOT EXISTS idx_bet_ticket_watchboards_watchboard_id ON bet_ticket_watchboards(watchboard_id);

-- Ticket alert tables (from migrations/74.sql)
CREATE TABLE IF NOT EXISTS ticket_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 2,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  deep_link TEXT,
  ticket_id INTEGER,
  event_id TEXT,
  leg_id INTEGER,
  is_read BOOLEAN DEFAULT 0,
  delivered_push BOOLEAN DEFAULT 0,
  delivered_banner BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ticket_alerts_user ON ticket_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_alerts_user_unread ON ticket_alerts(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_ticket_alerts_ticket ON ticket_alerts(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_alerts_created ON ticket_alerts(created_at);

CREATE TABLE IF NOT EXISTS alert_state_tracker (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  leg_id INTEGER,
  event_id TEXT,
  last_status TEXT,
  last_margin REAL,
  last_cover_state TEXT,
  last_alert_type TEXT,
  last_alert_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alert_state_user_leg ON alert_state_tracker(user_id, leg_id);
CREATE INDEX IF NOT EXISTS idx_alert_state_user_event ON alert_state_tracker(user_id, event_id);
CREATE INDEX IF NOT EXISTS idx_alert_state_updated ON alert_state_tracker(updated_at);

CREATE TABLE IF NOT EXISTS alert_throttle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  alert_category TEXT NOT NULL,
  last_sent_at TIMESTAMP NOT NULL,
  count_in_window INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alert_throttle_user_event ON alert_throttle(user_id, event_id);

-- Watchboard performance indexes for local runtime stability
CREATE INDEX IF NOT EXISTS idx_watchboards_user_id ON watchboards(user_id);
CREATE INDEX IF NOT EXISTS idx_watchboards_user_active ON watchboards(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_watchboards_user_name ON watchboards(user_id, name);
CREATE INDEX IF NOT EXISTS idx_watchboard_games_board_id ON watchboard_games(watchboard_id);
CREATE INDEX IF NOT EXISTS idx_watchboard_games_board_game ON watchboard_games(watchboard_id, game_id);
CREATE INDEX IF NOT EXISTS idx_watchboard_games_board_order ON watchboard_games(watchboard_id, order_index);

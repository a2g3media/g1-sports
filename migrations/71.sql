-- Bet Tickets: Main ticket container
CREATE TABLE bet_tickets (
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

CREATE INDEX idx_bet_tickets_user_id ON bet_tickets(user_id);
CREATE INDEX idx_bet_tickets_status ON bet_tickets(status);

-- Bet Ticket Legs: Individual legs/selections in a ticket
CREATE TABLE bet_ticket_legs (
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

CREATE INDEX idx_bet_ticket_legs_ticket_id ON bet_ticket_legs(ticket_id);
CREATE INDEX idx_bet_ticket_legs_event_id ON bet_ticket_legs(event_id);
CREATE INDEX idx_bet_ticket_legs_leg_status ON bet_ticket_legs(leg_status);

-- Link table for tickets to watchboards
CREATE TABLE bet_ticket_watchboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  watchboard_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(ticket_id, watchboard_id)
);

CREATE INDEX idx_bet_ticket_watchboards_ticket_id ON bet_ticket_watchboards(ticket_id);
CREATE INDEX idx_bet_ticket_watchboards_watchboard_id ON bet_ticket_watchboards(watchboard_id);
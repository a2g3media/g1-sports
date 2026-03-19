
CREATE TABLE leagues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sport_key TEXT NOT NULL,
  format_key TEXT NOT NULL,
  season TEXT,
  rules_json TEXT,
  entry_fee_cents INTEGER DEFAULT 0,
  is_payment_required BOOLEAN DEFAULT 0,
  invite_code TEXT UNIQUE,
  owner_id INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_leagues_invite_code ON leagues(invite_code);
CREATE INDEX idx_leagues_owner_id ON leagues(owner_id);

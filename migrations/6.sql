
CREATE TABLE pick_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_code TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  league_id INTEGER NOT NULL,
  period_id TEXT NOT NULL,
  format_key TEXT NOT NULL,
  submitted_at TIMESTAMP NOT NULL,
  picks_payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT DEFAULT 'submitted',
  replaced_by_receipt_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pick_receipts_user ON pick_receipts(user_id);
CREATE INDEX idx_pick_receipts_league_period ON pick_receipts(league_id, period_id);
CREATE INDEX idx_pick_receipts_code ON pick_receipts(receipt_code);


CREATE TABLE transaction_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_txn_id TEXT,
  intent_type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  fee_cents INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending',
  webhook_payload_hash TEXT,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transaction_ledger_league ON transaction_ledger(league_id);
CREATE INDEX idx_transaction_ledger_user ON transaction_ledger(user_id);
CREATE INDEX idx_transaction_ledger_provider_txn ON transaction_ledger(provider_txn_id);

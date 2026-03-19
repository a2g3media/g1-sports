
CREATE TABLE receipt_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  channel TEXT NOT NULL,
  destination TEXT NOT NULL,
  status TEXT DEFAULT 'queued',
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  failed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_receipt_deliveries_receipt ON receipt_deliveries(receipt_id);
CREATE INDEX idx_receipt_deliveries_status ON receipt_deliveries(status);

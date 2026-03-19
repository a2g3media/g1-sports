
CREATE TABLE parse_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  image_key TEXT NOT NULL,
  image_type TEXT NOT NULL,
  ticket_id INTEGER,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_parse_jobs_user_status ON parse_jobs(user_id, status);

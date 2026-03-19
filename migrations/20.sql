
-- Add data_scope to isolate DEMO vs PROD data
ALTER TABLE leagues ADD COLUMN data_scope TEXT DEFAULT 'PROD';
ALTER TABLE league_members ADD COLUMN data_scope TEXT DEFAULT 'PROD';
ALTER TABLE events ADD COLUMN data_scope TEXT DEFAULT 'PROD';
ALTER TABLE picks ADD COLUMN data_scope TEXT DEFAULT 'PROD';
ALTER TABLE pick_receipts ADD COLUMN data_scope TEXT DEFAULT 'PROD';
ALTER TABLE receipt_deliveries ADD COLUMN data_scope TEXT DEFAULT 'PROD';
ALTER TABLE event_log ADD COLUMN data_scope TEXT DEFAULT 'PROD';
ALTER TABLE transaction_ledger ADD COLUMN data_scope TEXT DEFAULT 'PROD';
ALTER TABLE ai_event_log ADD COLUMN data_scope TEXT DEFAULT 'PROD';
ALTER TABLE league_feed ADD COLUMN data_scope TEXT DEFAULT 'PROD';
ALTER TABLE squares_grids ADD COLUMN data_scope TEXT DEFAULT 'PROD';
ALTER TABLE squares ADD COLUMN data_scope TEXT DEFAULT 'PROD';
ALTER TABLE squares_scores ADD COLUMN data_scope TEXT DEFAULT 'PROD';
ALTER TABLE league_messages ADD COLUMN data_scope TEXT DEFAULT 'PROD';
ALTER TABLE standings_history ADD COLUMN data_scope TEXT DEFAULT 'PROD';

-- Add demo user flag
ALTER TABLE users ADD COLUMN is_demo_user BOOLEAN DEFAULT 0;
ALTER TABLE users ADD COLUMN demo_mode_enabled BOOLEAN DEFAULT 0;
ALTER TABLE users ADD COLUMN simulated_subscription TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN simulated_admin_mode BOOLEAN DEFAULT 0;

-- Create demo_settings table for persistent demo configuration
CREATE TABLE demo_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  auto_seed_on_login BOOLEAN DEFAULT 1,
  impersonating_user_id INTEGER,
  last_seeded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create demo_users table for generated demo members
CREATE TABLE demo_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  demo_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  performance_tier TEXT DEFAULT 'mid',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

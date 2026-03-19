
CREATE TABLE ticket_alert_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  is_enabled BOOLEAN DEFAULT 1,
  min_priority INTEGER DEFAULT 3,
  channel_push BOOLEAN DEFAULT 1,
  channel_banner BOOLEAN DEFAULT 1,
  channel_center BOOLEAN DEFAULT 1,
  mute_ticket_settled BOOLEAN DEFAULT 0,
  mute_parlay_last_leg BOOLEAN DEFAULT 0,
  mute_cover_flip_clutch BOOLEAN DEFAULT 0,
  mute_game_final BOOLEAN DEFAULT 0,
  mute_cover_flip BOOLEAN DEFAULT 0,
  mute_momentum_shift BOOLEAN DEFAULT 0,
  mute_overtime_start BOOLEAN DEFAULT 0,
  mute_game_start BOOLEAN DEFAULT 0,
  mute_lead_change BOOLEAN DEFAULT 0,
  mute_buzzer_beater BOOLEAN DEFAULT 0,
  mute_major_run BOOLEAN DEFAULT 0,
  quiet_hours_enabled BOOLEAN DEFAULT 0,
  quiet_hours_start TEXT DEFAULT '22:00',
  quiet_hours_end TEXT DEFAULT '07:00',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ticket_alert_prefs_user ON ticket_alert_preferences(user_id);

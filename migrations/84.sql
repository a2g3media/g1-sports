CREATE TABLE IF NOT EXISTS coachg_featured_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL UNIQUE,
  date_key TEXT NOT NULL,
  sport TEXT NOT NULL,
  game_id TEXT NOT NULL,
  home_team TEXT,
  away_team TEXT,
  headline TEXT NOT NULL,
  short_summary TEXT NOT NULL,
  full_analysis_text TEXT NOT NULL,
  video_script TEXT NOT NULL,
  publish_status TEXT NOT NULL DEFAULT 'draft',
  video_job_id TEXT,
  video_status TEXT NOT NULL DEFAULT 'pending',
  video_url TEXT,
  social_status_instagram TEXT NOT NULL DEFAULT 'not_requested',
  social_status_facebook TEXT NOT NULL DEFAULT 'not_requested',
  social_status_tiktok TEXT NOT NULL DEFAULT 'not_requested',
  source_payload_id TEXT,
  metadata_json TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coachg_featured_items_date_sport
  ON coachg_featured_items(date_key, sport);
CREATE INDEX IF NOT EXISTS idx_coachg_featured_items_publish_status
  ON coachg_featured_items(publish_status);
CREATE INDEX IF NOT EXISTS idx_coachg_featured_items_video_status
  ON coachg_featured_items(video_status);
CREATE INDEX IF NOT EXISTS idx_coachg_featured_items_game_id
  ON coachg_featured_items(game_id);

CREATE TABLE IF NOT EXISTS coachg_social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_job_id TEXT NOT NULL UNIQUE,
  item_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  caption_text TEXT,
  post_id TEXT,
  response_json TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coachg_social_posts_item_id
  ON coachg_social_posts(item_id);
CREATE INDEX IF NOT EXISTS idx_coachg_social_posts_platform_status
  ON coachg_social_posts(platform, status);
CREATE INDEX IF NOT EXISTS idx_coachg_social_posts_next_retry
  ON coachg_social_posts(next_retry_at);

CREATE TABLE IF NOT EXISTS coachg_pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL UNIQUE,
  date_key TEXT NOT NULL,
  trigger_source TEXT NOT NULL DEFAULT 'scheduled',
  status TEXT NOT NULL DEFAULT 'running',
  selected_games_count INTEGER NOT NULL DEFAULT 0,
  generated_items_count INTEGER NOT NULL DEFAULT 0,
  video_requested_count INTEGER NOT NULL DEFAULT 0,
  video_ready_count INTEGER NOT NULL DEFAULT 0,
  social_published_count INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coachg_pipeline_runs_date_source
  ON coachg_pipeline_runs(date_key, trigger_source);
CREATE INDEX IF NOT EXISTS idx_coachg_pipeline_runs_status
  ON coachg_pipeline_runs(status);

CREATE TABLE IF NOT EXISTS coachg_pipeline_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_key TEXT NOT NULL UNIQUE,
  config_value TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO coachg_pipeline_config (config_key, config_value) VALUES
  ('enabled', 'true'),
  ('daily_max_videos', '12'),
  ('enabled_sports', '["nba","nfl","mlb","nhl","soccer","golf","mma","ncaab"]'),
  ('platform_instagram_enabled', 'true'),
  ('platform_facebook_enabled', 'true'),
  ('platform_tiktok_enabled', 'true'),
  ('shadow_mode', 'false');

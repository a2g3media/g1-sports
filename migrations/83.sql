CREATE TABLE IF NOT EXISTS coachg_video_jobs (
  job_id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  payload_id TEXT,
  script_text TEXT NOT NULL,
  heygen_video_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  video_url TEXT,
  social_status TEXT NOT NULL DEFAULT 'not_requested',
  social_response TEXT,
  error_message TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coachg_video_jobs_created_at ON coachg_video_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coachg_video_jobs_game_id ON coachg_video_jobs(game_id);

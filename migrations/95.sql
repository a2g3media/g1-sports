-- Wave B: queue lanes/backoff/dead-letter + Coach G feature store

ALTER TABLE player_document_build_queue ADD COLUMN lane TEXT NOT NULL DEFAULT 'background';
ALTER TABLE player_document_build_queue ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 6;
ALTER TABLE player_document_build_queue ADD COLUMN next_retry_at TEXT NOT NULL DEFAULT (datetime('now'));
ALTER TABLE player_document_build_queue ADD COLUMN last_attempt_at TEXT;

CREATE INDEX IF NOT EXISTS idx_player_document_queue_retry
ON player_document_build_queue(status, lane, next_retry_at, updated_at);

CREATE TABLE IF NOT EXISTS coach_g_player_features (
  sport TEXT NOT NULL,
  player_id TEXT NOT NULL,
  feature_json TEXT NOT NULL,
  completeness_json TEXT NOT NULL,
  confidence_json TEXT NOT NULL,
  build_version TEXT NOT NULL DEFAULT 'v1',
  built_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (sport, player_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_g_player_features_updated
ON coach_g_player_features(updated_at);

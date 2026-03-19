
-- Refresh logs for tracking sync operations
CREATE TABLE sdio_refresh_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  refresh_type TEXT NOT NULL,
  sport TEXT NOT NULL,
  started_at DATETIME NOT NULL,
  completed_at DATETIME,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  games_processed INTEGER DEFAULT 0,
  odds_updated INTEGER DEFAULT 0,
  props_updated INTEGER DEFAULT 0,
  errors TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sdio_refresh_logs_type ON sdio_refresh_logs(refresh_type);
CREATE INDEX idx_sdio_refresh_logs_sport ON sdio_refresh_logs(sport);
CREATE INDEX idx_sdio_refresh_logs_status ON sdio_refresh_logs(status);
CREATE INDEX idx_sdio_refresh_logs_started ON sdio_refresh_logs(started_at);

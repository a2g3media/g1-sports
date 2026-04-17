-- Player profile documents (page-data L2) + background build queue
-- Runtime also ensures these via ensurePlayerDocumentsTable / ensurePlayerDocumentQueueTable (single-statement exec for local D1).

CREATE TABLE IF NOT EXISTS player_documents (
  sport TEXT NOT NULL,
  player_id TEXT NOT NULL,
  display_name TEXT,
  document_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  built_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (sport, player_id)
);

CREATE INDEX IF NOT EXISTS idx_player_documents_updated ON player_documents(updated_at);

CREATE TABLE IF NOT EXISTS player_document_build_queue (
  sport TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (sport, player_id)
);

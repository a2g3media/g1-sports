/**
 * DB Bootstrap — ensures required D1 tables exist on first request.
 * Runs CREATE TABLE IF NOT EXISTS for each table once per isolate
 * lifetime, so repeated requests skip the check.
 */

let bootstrapped = false;

export async function ensureCoreTables(db: D1Database): Promise<void> {
  if (bootstrapped) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS sdio_games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_game_id TEXT NOT NULL,
        sport TEXT NOT NULL,
        league TEXT,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        home_team_name TEXT,
        away_team_name TEXT,
        start_time DATETIME NOT NULL,
        status TEXT NOT NULL DEFAULT 'SCHEDULED',
        score_home INTEGER,
        score_away INTEGER,
        period TEXT,
        clock TEXT,
        venue TEXT,
        channel TEXT,
        last_sync DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider_game_id, sport)
      );

      CREATE TABLE IF NOT EXISTS sdio_odds_current (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        spread_home REAL,
        spread_away REAL,
        total REAL,
        moneyline_home INTEGER,
        moneyline_away INTEGER,
        open_spread REAL,
        open_total REAL,
        open_moneyline_home INTEGER,
        open_moneyline_away INTEGER,
        movement_spread REAL,
        movement_total REAL,
        last_updated DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(game_id)
      );

      CREATE TABLE IF NOT EXISTS sdio_odds_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        spread_home REAL,
        spread_away REAL,
        total REAL,
        moneyline_home INTEGER,
        moneyline_away INTEGER,
        recorded_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sdio_props_current (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER,
        player_name TEXT,
        prop_type TEXT,
        line REAL,
        over_odds INTEGER,
        under_odds INTEGER,
        last_updated DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS api_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_key TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL DEFAULT '',
        endpoint TEXT NOT NULL DEFAULT '',
        data_json TEXT NOT NULL DEFAULT '{}',
        ttl_seconds INTEGER NOT NULL DEFAULT 300,
        cached_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL DEFAULT (datetime('now','+300 seconds')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        hit_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS odds_opening (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_scope TEXT NOT NULL DEFAULT 'PROD',
        game_id TEXT NOT NULL,
        bookmaker_key TEXT NOT NULL DEFAULT 'consensus',
        market_key TEXT NOT NULL,
        outcome_key TEXT NOT NULL,
        opening_line_value REAL,
        opening_price_american REAL,
        opened_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS odds_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_scope TEXT NOT NULL DEFAULT 'PROD',
        game_id TEXT NOT NULL,
        bookmaker_key TEXT NOT NULL DEFAULT 'consensus',
        market_key TEXT NOT NULL,
        outcome_key TEXT NOT NULL,
        line_value REAL,
        price_american REAL,
        snapshot_at TEXT NOT NULL DEFAULT (datetime('now')),
        captured_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS canonical_teams (
        id TEXT PRIMARY KEY,
        sport TEXT NOT NULL,
        league TEXT,
        provider_team_id TEXT,
        display_name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        aliases_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_teams_provider
      ON canonical_teams(sport, COALESCE(provider_team_id, ''));

      CREATE TABLE IF NOT EXISTS canonical_games (
        id TEXT PRIMARY KEY,
        sport TEXT NOT NULL,
        league TEXT,
        provider_event_id TEXT,
        provider_game_id TEXT,
        home_team_id TEXT,
        away_team_id TEXT,
        start_time TEXT,
        status TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_canonical_games_sport_start
      ON canonical_games(sport, start_time);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_games_provider
      ON canonical_games(sport, COALESCE(provider_game_id, ''), COALESCE(provider_event_id, ''));

      CREATE TABLE IF NOT EXISTS historical_prop_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sport TEXT NOT NULL,
        league TEXT,
        event_id TEXT,
        game_id TEXT,
        player_internal_id TEXT,
        player_provider_id TEXT,
        team_id TEXT,
        opponent_team_id TEXT,
        stat_type TEXT NOT NULL,
        market_type TEXT NOT NULL,
        line_value REAL NOT NULL,
        over_price REAL,
        under_price REAL,
        sportsbook TEXT,
        captured_at TEXT NOT NULL,
        game_start_time TEXT,
        source_payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'captured',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_hist_snapshots_lookup
      ON historical_prop_snapshots(sport, game_id, player_internal_id, stat_type, captured_at DESC);

      CREATE INDEX IF NOT EXISTS idx_hist_snapshots_event
      ON historical_prop_snapshots(sport, event_id, player_provider_id, stat_type, captured_at DESC);

      CREATE INDEX IF NOT EXISTS idx_hist_snapshots_status
      ON historical_prop_snapshots(status, captured_at DESC);

      CREATE TRIGGER IF NOT EXISTS trg_hist_snapshots_block_update
      BEFORE UPDATE ON historical_prop_snapshots
      BEGIN
        SELECT RAISE(ABORT, 'historical_prop_snapshots is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_hist_snapshots_block_delete
      BEFORE DELETE ON historical_prop_snapshots
      BEGIN
        SELECT RAISE(ABORT, 'historical_prop_snapshots is append-only');
      END;

      CREATE TABLE IF NOT EXISTS historical_verified_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sport TEXT NOT NULL,
        league TEXT,
        game_id TEXT NOT NULL,
        player_internal_id TEXT NOT NULL,
        stat_type TEXT NOT NULL,
        verified_line_value REAL NOT NULL,
        over_price REAL,
        under_price REAL,
        sportsbook TEXT,
        selected_snapshot_id INTEGER NOT NULL,
        snapshot_rule_used TEXT NOT NULL,
        locked_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(selected_snapshot_id) REFERENCES historical_prop_snapshots(id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_verified_unique
      ON historical_verified_lines(sport, game_id, player_internal_id, stat_type);

      CREATE INDEX IF NOT EXISTS idx_hist_verified_game_player
      ON historical_verified_lines(sport, game_id, player_internal_id);

      CREATE TABLE IF NOT EXISTS historical_verified_lines_strict (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sport TEXT NOT NULL,
        league TEXT,
        game_id TEXT NOT NULL,
        player_internal_id TEXT NOT NULL,
        stat_type TEXT NOT NULL,
        verified_line_value REAL NOT NULL,
        over_price REAL,
        under_price REAL,
        sportsbook TEXT,
        selected_snapshot_id INTEGER NOT NULL,
        snapshot_rule_used TEXT NOT NULL,
        locked_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_verified_strict_unique
      ON historical_verified_lines_strict(sport, game_id, player_internal_id, stat_type);

      CREATE INDEX IF NOT EXISTS idx_hist_verified_strict_game_player
      ON historical_verified_lines_strict(sport, game_id, player_internal_id);

      CREATE TABLE IF NOT EXISTS historical_verified_lines_expanded (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sport TEXT NOT NULL,
        league TEXT,
        game_id TEXT NOT NULL,
        player_internal_id TEXT NOT NULL,
        stat_type TEXT NOT NULL,
        verified_line_value REAL NOT NULL,
        over_price REAL,
        under_price REAL,
        sportsbook TEXT,
        selected_snapshot_id INTEGER NOT NULL,
        snapshot_rule_used TEXT NOT NULL,
        locked_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_verified_expanded_unique
      ON historical_verified_lines_expanded(sport, game_id, player_internal_id, stat_type);

      CREATE INDEX IF NOT EXISTS idx_hist_verified_expanded_game_player
      ON historical_verified_lines_expanded(sport, game_id, player_internal_id);

      CREATE TABLE IF NOT EXISTS historical_line_grades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sport TEXT NOT NULL,
        league TEXT,
        game_id TEXT NOT NULL,
        player_internal_id TEXT NOT NULL,
        stat_type TEXT NOT NULL,
        verified_line_value REAL NOT NULL,
        actual_stat_value REAL,
        grade_result TEXT NOT NULL,
        graded_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_grades_unique
      ON historical_line_grades(sport, game_id, player_internal_id, stat_type);

      CREATE INDEX IF NOT EXISTS idx_hist_grades_recent
      ON historical_line_grades(graded_at DESC, sport);

      CREATE TABLE IF NOT EXISTS player_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alias_name TEXT NOT NULL,
        canonical_player_id TEXT,
        canonical_player_key TEXT NOT NULL DEFAULT '',
        sport TEXT NOT NULL,
        confidence_score REAL,
        source TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_player_aliases_unique
      ON player_aliases(sport, alias_name, canonical_player_key);

      CREATE INDEX IF NOT EXISTS idx_player_aliases_sport_alias
      ON player_aliases(sport, alias_name);
    `);
    bootstrapped = true;
    console.log('[DB Bootstrap] Core tables verified');
  } catch (err) {
    console.error('[DB Bootstrap] Error ensuring tables:', err);
  }
}

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
    `);
    bootstrapped = true;
    console.log('[DB Bootstrap] Core tables verified');
  } catch (err) {
    console.error('[DB Bootstrap] Error ensuring tables:', err);
  }
}

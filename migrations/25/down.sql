
DROP INDEX IF EXISTS idx_odds_snapshots_history;
DROP INDEX IF EXISTS idx_odds_snapshots_game;
DROP TABLE IF EXISTS odds_snapshots;

DROP INDEX IF EXISTS idx_odds_opening_unique;
DROP INDEX IF EXISTS idx_odds_opening_game;
DROP TABLE IF EXISTS odds_opening;

DROP INDEX IF EXISTS idx_odds_quotes_lookup;
DROP INDEX IF EXISTS idx_odds_quotes_game;
DROP TABLE IF EXISTS odds_quotes;

DROP TABLE IF EXISTS odds_markets;
DROP TABLE IF EXISTS bookmakers;

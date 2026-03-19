
-- Performance indexes batch 3: Standings, odds, tracker

-- standings_history: Leaderboard queries
CREATE INDEX IF NOT EXISTS idx_standings_league_id ON standings_history(league_id);
CREATE INDEX IF NOT EXISTS idx_standings_user_id ON standings_history(user_id);
CREATE INDEX IF NOT EXISTS idx_standings_league_period ON standings_history(league_id, period_id);

-- odds_quotes: Live odds lookups
CREATE INDEX IF NOT EXISTS idx_odds_quotes_game_id ON odds_quotes(game_id);
CREATE INDEX IF NOT EXISTS idx_odds_quotes_game_market ON odds_quotes(game_id, market_key);

-- odds_snapshots: Historical odds queries
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_game_id ON odds_snapshots(game_id);
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_captured_at ON odds_snapshots(captured_at);

-- tracker_picks: User betting history
CREATE INDEX IF NOT EXISTS idx_tracker_picks_user_id ON tracker_picks(user_id);
CREATE INDEX IF NOT EXISTS idx_tracker_picks_result ON tracker_picks(result);

-- game_watchlist: User watchlist queries
CREATE INDEX IF NOT EXISTS idx_game_watchlist_user_id ON game_watchlist(user_id);


-- Performance indexes batch 1: Core tables (picks, league_members, leagues)

-- picks: Most queried table - by user, league, event, period
CREATE INDEX IF NOT EXISTS idx_picks_user_id ON picks(user_id);
CREATE INDEX IF NOT EXISTS idx_picks_league_id ON picks(league_id);
CREATE INDEX IF NOT EXISTS idx_picks_event_id ON picks(event_id);
CREATE INDEX IF NOT EXISTS idx_picks_user_league ON picks(user_id, league_id);
CREATE INDEX IF NOT EXISTS idx_picks_league_period ON picks(league_id, period_id);

-- league_members: User's leagues lookup, league membership checks
CREATE INDEX IF NOT EXISTS idx_league_members_user_id ON league_members(user_id);
CREATE INDEX IF NOT EXISTS idx_league_members_league_id ON league_members(league_id);
CREATE INDEX IF NOT EXISTS idx_league_members_user_league ON league_members(user_id, league_id);

-- leagues: Active leagues by owner, browsable leagues
CREATE INDEX IF NOT EXISTS idx_leagues_owner_id ON leagues(owner_id);
CREATE INDEX IF NOT EXISTS idx_leagues_is_active ON leagues(is_active);
CREATE INDEX IF NOT EXISTS idx_leagues_sport_key ON leagues(sport_key);

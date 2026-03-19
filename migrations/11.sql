
-- Seed sample NFL Week 16 events for testing picks UI
INSERT INTO events (external_id, sport_key, period_id, start_at, home_team, away_team, status) VALUES
('nfl-2024-w16-1', 'nfl', 'Week 16', datetime('now', '+1 day'), 'Kansas City Chiefs', 'Houston Texans', 'scheduled'),
('nfl-2024-w16-2', 'nfl', 'Week 16', datetime('now', '+1 day'), 'Baltimore Ravens', 'Pittsburgh Steelers', 'scheduled'),
('nfl-2024-w16-3', 'nfl', 'Week 16', datetime('now', '+1 day', '+2 hours'), 'Buffalo Bills', 'New England Patriots', 'scheduled'),
('nfl-2024-w16-4', 'nfl', 'Week 16', datetime('now', '+1 day', '+2 hours'), 'Philadelphia Eagles', 'Dallas Cowboys', 'scheduled'),
('nfl-2024-w16-5', 'nfl', 'Week 16', datetime('now', '+2 days'), 'San Francisco 49ers', 'Miami Dolphins', 'scheduled'),
('nfl-2024-w16-6', 'nfl', 'Week 16', datetime('now', '+2 days'), 'Detroit Lions', 'Chicago Bears', 'scheduled'),
('nfl-2024-w16-7', 'nfl', 'Week 16', datetime('now', '+2 days', '+4 hours'), 'Green Bay Packers', 'New Orleans Saints', 'scheduled'),
('nfl-2024-w16-8', 'nfl', 'Week 16', datetime('now', '+2 days', '+4 hours'), 'Seattle Seahawks', 'Minnesota Vikings', 'scheduled');

-- Seed sample NBA games
INSERT INTO events (external_id, sport_key, period_id, start_at, home_team, away_team, status) VALUES
('nba-2024-w8-1', 'nba', 'Week 8', datetime('now', '+1 day'), 'Boston Celtics', 'Milwaukee Bucks', 'scheduled'),
('nba-2024-w8-2', 'nba', 'Week 8', datetime('now', '+1 day'), 'Denver Nuggets', 'Phoenix Suns', 'scheduled'),
('nba-2024-w8-3', 'nba', 'Week 8', datetime('now', '+1 day', '+1 hour'), 'Los Angeles Lakers', 'Golden State Warriors', 'scheduled'),
('nba-2024-w8-4', 'nba', 'Week 8', datetime('now', '+2 days'), 'Miami Heat', 'New York Knicks', 'scheduled');

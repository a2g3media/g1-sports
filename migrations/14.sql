
-- Seed NFL Week 15 Games (2024 season)
INSERT INTO events (external_id, sport_key, season, period_id, start_at, home_team, away_team, status) VALUES
('nfl-2024-w15-1', 'nfl', '2024-2025', 'Week 15', datetime('now', '+2 hours'), 'Kansas City Chiefs', 'Cleveland Browns', 'scheduled'),
('nfl-2024-w15-2', 'nfl', '2024-2025', 'Week 15', datetime('now', '+2 hours'), 'Buffalo Bills', 'Detroit Lions', 'scheduled'),
('nfl-2024-w15-3', 'nfl', '2024-2025', 'Week 15', datetime('now', '+2 hours'), 'Philadelphia Eagles', 'Pittsburgh Steelers', 'scheduled'),
('nfl-2024-w15-4', 'nfl', '2024-2025', 'Week 15', datetime('now', '+2 hours'), 'Dallas Cowboys', 'Carolina Panthers', 'scheduled'),
('nfl-2024-w15-5', 'nfl', '2024-2025', 'Week 15', datetime('now', '+2 hours'), 'Green Bay Packers', 'Seattle Seahawks', 'scheduled'),
('nfl-2024-w15-6', 'nfl', '2024-2025', 'Week 15', datetime('now', '+6 hours'), 'San Francisco 49ers', 'Los Angeles Rams', 'scheduled'),
('nfl-2024-w15-7', 'nfl', '2024-2025', 'Week 15', datetime('now', '+6 hours'), 'Miami Dolphins', 'New York Jets', 'scheduled'),
('nfl-2024-w15-8', 'nfl', '2024-2025', 'Week 15', datetime('now', '+26 hours'), 'Baltimore Ravens', 'New York Giants', 'scheduled'),
('nfl-2024-w15-9', 'nfl', '2024-2025', 'Week 15', datetime('now', '+26 hours'), 'Cincinnati Bengals', 'Tennessee Titans', 'scheduled'),
('nfl-2024-w15-10', 'nfl', '2024-2025', 'Week 15', datetime('now', '+50 hours'), 'Denver Broncos', 'Indianapolis Colts', 'scheduled'),
('nfl-2024-w15-11', 'nfl', '2024-2025', 'Week 15', datetime('now', '+2 hours'), 'Chicago Bears', 'Minnesota Vikings', 'scheduled'),
('nfl-2024-w15-12', 'nfl', '2024-2025', 'Week 15', datetime('now', '+2 hours'), 'Las Vegas Raiders', 'Atlanta Falcons', 'scheduled'),
('nfl-2024-w15-13', 'nfl', '2024-2025', 'Week 15', datetime('now', '+2 hours'), 'New England Patriots', 'Arizona Cardinals', 'scheduled'),
('nfl-2024-w15-14', 'nfl', '2024-2025', 'Week 15', datetime('now', '+2 hours'), 'New Orleans Saints', 'Washington Commanders', 'scheduled'),
('nfl-2024-w15-15', 'nfl', '2024-2025', 'Week 15', datetime('now', '+6 hours'), 'Tampa Bay Buccaneers', 'Los Angeles Chargers', 'scheduled'),
('nfl-2024-w15-16', 'nfl', '2024-2025', 'Week 15', datetime('now', '+26 hours'), 'Houston Texans', 'Jacksonville Jaguars', 'scheduled');

-- Seed NFL Week 14 Games (completed)
INSERT INTO events (external_id, sport_key, season, period_id, start_at, home_team, away_team, home_score, away_score, status, winner, final_result) VALUES
('nfl-2024-w14-1', 'nfl', '2024-2025', 'Week 14', datetime('now', '-7 days'), 'Kansas City Chiefs', 'Los Angeles Chargers', 24, 17, 'final', 'Kansas City Chiefs', 'Kansas City Chiefs 24 - 17 Los Angeles Chargers'),
('nfl-2024-w14-2', 'nfl', '2024-2025', 'Week 14', datetime('now', '-7 days'), 'Buffalo Bills', 'New York Jets', 35, 21, 'final', 'Buffalo Bills', 'Buffalo Bills 35 - 21 New York Jets'),
('nfl-2024-w14-3', 'nfl', '2024-2025', 'Week 14', datetime('now', '-7 days'), 'Philadelphia Eagles', 'Carolina Panthers', 28, 14, 'final', 'Philadelphia Eagles', 'Philadelphia Eagles 28 - 14 Carolina Panthers'),
('nfl-2024-w14-4', 'nfl', '2024-2025', 'Week 14', datetime('now', '-7 days'), 'Detroit Lions', 'Green Bay Packers', 31, 28, 'final', 'Detroit Lions', 'Detroit Lions 31 - 28 Green Bay Packers'),
('nfl-2024-w14-5', 'nfl', '2024-2025', 'Week 14', datetime('now', '-7 days'), 'Dallas Cowboys', 'Cincinnati Bengals', 20, 27, 'final', 'Cincinnati Bengals', 'Dallas Cowboys 20 - 27 Cincinnati Bengals'),
('nfl-2024-w14-6', 'nfl', '2024-2025', 'Week 14', datetime('now', '-7 days'), 'San Francisco 49ers', 'Chicago Bears', 38, 13, 'final', 'San Francisco 49ers', 'San Francisco 49ers 38 - 13 Chicago Bears'),
('nfl-2024-w14-7', 'nfl', '2024-2025', 'Week 14', datetime('now', '-7 days'), 'Miami Dolphins', 'New England Patriots', 24, 20, 'final', 'Miami Dolphins', 'Miami Dolphins 24 - 20 New England Patriots'),
('nfl-2024-w14-8', 'nfl', '2024-2025', 'Week 14', datetime('now', '-7 days'), 'Baltimore Ravens', 'Tennessee Titans', 42, 17, 'final', 'Baltimore Ravens', 'Baltimore Ravens 42 - 17 Tennessee Titans');

-- Seed NFL Weeks 16-18 (upcoming)
INSERT INTO events (external_id, sport_key, season, period_id, start_at, home_team, away_team, status) VALUES
('nfl-2024-w16-1', 'nfl', '2024-2025', 'Week 16', datetime('now', '+7 days'), 'Pittsburgh Steelers', 'Baltimore Ravens', 'scheduled'),
('nfl-2024-w16-2', 'nfl', '2024-2025', 'Week 16', datetime('now', '+7 days'), 'Minnesota Vikings', 'Seattle Seahawks', 'scheduled'),
('nfl-2024-w16-3', 'nfl', '2024-2025', 'Week 16', datetime('now', '+7 days'), 'New York Giants', 'Atlanta Falcons', 'scheduled'),
('nfl-2024-w16-4', 'nfl', '2024-2025', 'Week 16', datetime('now', '+7 days'), 'Cleveland Browns', 'Cincinnati Bengals', 'scheduled'),
('nfl-2024-w17-1', 'nfl', '2024-2025', 'Week 17', datetime('now', '+14 days'), 'Dallas Cowboys', 'Philadelphia Eagles', 'scheduled'),
('nfl-2024-w17-2', 'nfl', '2024-2025', 'Week 17', datetime('now', '+14 days'), 'Detroit Lions', 'Chicago Bears', 'scheduled'),
('nfl-2024-w18-1', 'nfl', '2024-2025', 'Week 18', datetime('now', '+21 days'), 'Kansas City Chiefs', 'Denver Broncos', 'scheduled'),
('nfl-2024-w18-2', 'nfl', '2024-2025', 'Week 18', datetime('now', '+21 days'), 'Buffalo Bills', 'Miami Dolphins', 'scheduled');

-- Seed NBA Game Days
INSERT INTO events (external_id, sport_key, season, period_id, start_at, home_team, away_team, status) VALUES
('nba-2024-d42-1', 'nba', '2024-2025', 'Game Day 42', datetime('now', '+7 hours'), 'Boston Celtics', 'Milwaukee Bucks', 'scheduled'),
('nba-2024-d42-2', 'nba', '2024-2025', 'Game Day 42', datetime('now', '+7 hours'), 'Denver Nuggets', 'Phoenix Suns', 'scheduled'),
('nba-2024-d42-3', 'nba', '2024-2025', 'Game Day 42', datetime('now', '+7 hours'), 'Los Angeles Lakers', 'Golden State Warriors', 'scheduled'),
('nba-2024-d42-4', 'nba', '2024-2025', 'Game Day 42', datetime('now', '+8 hours'), 'Miami Heat', 'Philadelphia 76ers', 'scheduled'),
('nba-2024-d42-5', 'nba', '2024-2025', 'Game Day 42', datetime('now', '+8 hours'), 'Dallas Mavericks', 'Oklahoma City Thunder', 'scheduled'),
('nba-2024-d42-6', 'nba', '2024-2025', 'Game Day 42', datetime('now', '+10 hours'), 'Los Angeles Clippers', 'Sacramento Kings', 'scheduled'),
('nba-2024-d43-1', 'nba', '2024-2025', 'Game Day 43', datetime('now', '+24 hours'), 'New York Knicks', 'Brooklyn Nets', 'scheduled'),
('nba-2024-d43-2', 'nba', '2024-2025', 'Game Day 43', datetime('now', '+24 hours'), 'Cleveland Cavaliers', 'Chicago Bulls', 'scheduled'),
('nba-2024-d43-3', 'nba', '2024-2025', 'Game Day 43', datetime('now', '+24 hours'), 'Atlanta Hawks', 'Toronto Raptors', 'scheduled'),
('nba-2024-d43-4', 'nba', '2024-2025', 'Game Day 43', datetime('now', '+24 hours'), 'Memphis Grizzlies', 'San Antonio Spurs', 'scheduled');

-- Seed NBA completed games
INSERT INTO events (external_id, sport_key, season, period_id, start_at, home_team, away_team, home_score, away_score, status, winner, final_result) VALUES
('nba-2024-d41-1', 'nba', '2024-2025', 'Game Day 41', datetime('now', '-24 hours'), 'Boston Celtics', 'Orlando Magic', 112, 98, 'final', 'Boston Celtics', 'Boston Celtics 112 - 98 Orlando Magic'),
('nba-2024-d41-2', 'nba', '2024-2025', 'Game Day 41', datetime('now', '-24 hours'), 'Denver Nuggets', 'Minnesota Timberwolves', 105, 108, 'final', 'Minnesota Timberwolves', 'Denver Nuggets 105 - 108 Minnesota Timberwolves'),
('nba-2024-d41-3', 'nba', '2024-2025', 'Game Day 41', datetime('now', '-24 hours'), 'Los Angeles Lakers', 'Sacramento Kings', 118, 115, 'final', 'Los Angeles Lakers', 'Los Angeles Lakers 118 - 115 Sacramento Kings');

-- Seed MLB games
INSERT INTO events (external_id, sport_key, season, period_id, start_at, home_team, away_team, status) VALUES
('mlb-2024-w22-1', 'mlb', '2024', 'Week 22', datetime('now', '+12 hours'), 'New York Yankees', 'Boston Red Sox', 'scheduled'),
('mlb-2024-w22-2', 'mlb', '2024', 'Week 22', datetime('now', '+12 hours'), 'Los Angeles Dodgers', 'San Francisco Giants', 'scheduled'),
('mlb-2024-w22-3', 'mlb', '2024', 'Week 22', datetime('now', '+12 hours'), 'Houston Astros', 'Texas Rangers', 'scheduled'),
('mlb-2024-w22-4', 'mlb', '2024', 'Week 22', datetime('now', '+12 hours'), 'Atlanta Braves', 'Philadelphia Phillies', 'scheduled'),
('mlb-2024-w22-5', 'mlb', '2024', 'Week 22', datetime('now', '+36 hours'), 'Chicago Cubs', 'St. Louis Cardinals', 'scheduled'),
('mlb-2024-w22-6', 'mlb', '2024', 'Week 22', datetime('now', '+36 hours'), 'San Diego Padres', 'Arizona Diamondbacks', 'scheduled');

-- Seed Soccer (Premier League) Match Day games
INSERT INTO events (external_id, sport_key, season, period_id, start_at, home_team, away_team, status) VALUES
('epl-2024-md18-1', 'soccer', '2024-2025', 'Match Day 18', datetime('now', '+24 hours'), 'Manchester City', 'Liverpool', 'scheduled'),
('epl-2024-md18-2', 'soccer', '2024-2025', 'Match Day 18', datetime('now', '+24 hours'), 'Arsenal', 'Chelsea', 'scheduled'),
('epl-2024-md18-3', 'soccer', '2024-2025', 'Match Day 18', datetime('now', '+24 hours'), 'Manchester United', 'Tottenham Hotspur', 'scheduled'),
('epl-2024-md18-4', 'soccer', '2024-2025', 'Match Day 18', datetime('now', '+24 hours'), 'Newcastle United', 'Aston Villa', 'scheduled'),
('epl-2024-md18-5', 'soccer', '2024-2025', 'Match Day 18', datetime('now', '+24 hours'), 'Brighton', 'West Ham United', 'scheduled');

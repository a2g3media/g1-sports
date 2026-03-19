
-- Seed default threshold configuration values
INSERT INTO threshold_config (sport_type, threshold_key, threshold_value, is_enabled, notes) VALUES
-- Odds & Market thresholds
('GLOBAL', 'SPREAD_MOVE_PREGAME', 1.0, 1, 'Minimum spread movement pre-game to trigger'),
('GLOBAL', 'SPREAD_MOVE_LIVE', 0.5, 1, 'Minimum spread movement in-game to trigger'),
('GLOBAL', 'TOTAL_MOVE_PREGAME', 2.0, 1, 'Minimum total movement pre-game to trigger'),
('GLOBAL', 'TOTAL_MOVE_LIVE', 1.0, 1, 'Minimum total movement in-game to trigger'),
('GLOBAL', 'ML_PROBABILITY_CHANGE', 5.0, 1, 'Minimum implied probability change % for ML'),
('GLOBAL', 'BOOK_DIVERGENCE', 1.0, 1, 'Minimum divergence across books'),

-- Weather thresholds
('GLOBAL', 'WIND_SUSTAINED_MPH', 15.0, 1, 'Sustained wind threshold'),
('GLOBAL', 'WIND_GUST_MPH', 20.0, 1, 'Wind gust threshold'),
('GLOBAL', 'TEMP_LOW_F', 20.0, 1, 'Low temperature threshold'),
('GLOBAL', 'TEMP_HIGH_F', 90.0, 1, 'High temperature threshold'),

-- Pool impact thresholds
('GLOBAL', 'POOL_EXPOSURE_LOW', 25.0, 1, 'Low exposure % threshold'),
('GLOBAL', 'POOL_EXPOSURE_MED', 40.0, 1, 'Medium exposure % threshold'),
('GLOBAL', 'POOL_EXPOSURE_HIGH', 60.0, 1, 'High exposure % threshold - CRITICAL'),
('GLOBAL', 'SURVIVOR_ELIM_LOW', 10.0, 1, 'Survivor elimination % - low'),
('GLOBAL', 'SURVIVOR_ELIM_MED', 25.0, 1, 'Survivor elimination % - medium - CRITICAL'),
('GLOBAL', 'SURVIVOR_ELIM_HIGH', 50.0, 1, 'Survivor elimination % - high - CRITICAL'),

-- Timing thresholds
('GLOBAL', 'LATE_INJURY_MINUTES', 90.0, 1, 'Minutes before game for late injury'),
('GLOBAL', 'CLOCK_PRESSURE_MINUTES', 5.0, 1, 'Final minutes for clock pressure'),

-- AI activation thresholds
('GLOBAL', 'AI_MULTI_TRIGGER_WINDOW_MINUTES', 10.0, 1, 'Window for multi-trigger AI activation');

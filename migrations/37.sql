
CREATE TABLE weather_forecasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data_scope TEXT DEFAULT 'PROD',
  venue_id TEXT,
  venue_name TEXT NOT NULL,
  game_id INTEGER,
  forecast_time TIMESTAMP NOT NULL,
  temp_fahrenheit REAL,
  feels_like_fahrenheit REAL,
  wind_speed_mph REAL,
  wind_direction TEXT,
  wind_gust_mph REAL,
  precipitation_chance INTEGER,
  precipitation_type TEXT,
  humidity INTEGER,
  conditions TEXT,
  visibility_miles REAL,
  is_dome BOOLEAN DEFAULT 0,
  game_impact_score INTEGER,
  game_impact_notes TEXT,
  source TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_weather_venue ON weather_forecasts(venue_name);
CREATE INDEX idx_weather_game ON weather_forecasts(game_id);
CREATE INDEX idx_weather_time ON weather_forecasts(forecast_time);

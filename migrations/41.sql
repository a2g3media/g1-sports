
-- GZ Sports Subscription Products
-- Tracks available subscription plans with pricing
CREATE TABLE subscription_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tier_level INTEGER NOT NULL,
  price_monthly_cents INTEGER,
  price_annual_cents INTEGER,
  billing_period TEXT NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  features_json TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Subscriptions
-- Tracks individual user subscription state
CREATE TABLE user_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  product_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  billing_period TEXT NOT NULL,
  trial_ends_at DATETIME,
  current_period_start DATETIME NOT NULL,
  current_period_end DATETIME NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT 0,
  canceled_at DATETIME,
  downgrade_to_product_key TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed GZ Sports subscription products
INSERT INTO subscription_products (product_key, name, tier_level, price_monthly_cents, price_annual_cents, billing_period, features_json) VALUES
-- Free tier (logged in)
('free', 'Free', 0, 0, 0, 'permanent', '{"can_browse_scores":true,"can_view_pools":true,"can_submit_picks":false,"scout_daily_cap":10,"live_commentary":false,"proactive_alerts":false,"ai_priority":"standard"}'),

-- Pool Access
('pool_access', 'Pool Access', 1, NULL, 1000, 'annual', '{"can_browse_scores":true,"can_view_pools":true,"can_submit_picks":true,"scout_daily_cap":10,"live_commentary":false,"proactive_alerts":false,"ai_priority":"standard"}'),

-- Scout Pro (Charter pricing $19, future $29)
('scout_pro_monthly_charter', 'Scout Pro (Monthly - Charter)', 2, 1900, NULL, 'monthly', '{"can_browse_scores":true,"can_view_pools":true,"can_submit_picks":true,"scout_daily_cap":100,"live_commentary":true,"proactive_alerts":true,"ai_priority":"elevated","trial_days":7,"includes_pool_access":true}'),
('scout_pro_annual_charter', 'Scout Pro (Annual - Charter)', 2, NULL, 19900, 'annual', '{"can_browse_scores":true,"can_view_pools":true,"can_submit_picks":true,"scout_daily_cap":100,"live_commentary":true,"proactive_alerts":true,"ai_priority":"elevated","trial_days":7,"includes_pool_access":true}'),
('scout_pro_monthly', 'Scout Pro (Monthly)', 2, 2900, NULL, 'monthly', '{"can_browse_scores":true,"can_view_pools":true,"can_submit_picks":true,"scout_daily_cap":100,"live_commentary":true,"proactive_alerts":true,"ai_priority":"elevated","trial_days":7,"includes_pool_access":true}'),
('scout_pro_annual', 'Scout Pro (Annual)', 2, NULL, 29900, 'annual', '{"can_browse_scores":true,"can_view_pools":true,"can_submit_picks":true,"scout_daily_cap":100,"live_commentary":true,"proactive_alerts":true,"ai_priority":"elevated","trial_days":7,"includes_pool_access":true}'),

-- Scout Elite
('scout_elite_monthly', 'Scout Elite (Monthly)', 3, 7900, NULL, 'monthly', '{"can_browse_scores":true,"can_view_pools":true,"can_submit_picks":true,"scout_daily_cap":999999,"live_commentary":true,"proactive_alerts":true,"ai_priority":"priority","multi_game_center":true,"custom_alerts":true,"heat_maps":true,"advanced_filters":true,"includes_pool_access":true}'),
('scout_elite_annual', 'Scout Elite (Annual)', 3, NULL, 79900, 'annual', '{"can_browse_scores":true,"can_view_pools":true,"can_submit_picks":true,"scout_daily_cap":999999,"live_commentary":true,"proactive_alerts":true,"ai_priority":"priority","multi_game_center":true,"custom_alerts":true,"heat_maps":true,"advanced_filters":true,"includes_pool_access":true}'),

-- Admin tiers
('admin_starter', 'Admin Starter', 10, NULL, 9900, 'annual', '{"can_browse_scores":true,"can_view_pools":true,"can_submit_picks":true,"max_pools":3,"admin_dashboard":true,"member_export":true,"dispute_tools":true,"league_chat_toggle":true}'),
('admin_unlimited', 'Admin Unlimited', 11, NULL, 14900, 'annual', '{"can_browse_scores":true,"can_view_pools":true,"can_submit_picks":true,"max_pools":999999,"admin_dashboard":true,"member_export":true,"dispute_tools":true,"league_chat_toggle":true,"advanced_analytics":true,"priority_support":true}');

CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX idx_user_subscriptions_product_key ON user_subscriptions(product_key);

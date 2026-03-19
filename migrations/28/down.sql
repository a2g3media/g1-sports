
DROP INDEX idx_alert_preferences_user;
DROP TABLE alert_preferences;

DROP INDEX idx_alert_events_scope;
DROP INDEX idx_alert_events_severity;
DROP INDEX idx_alert_events_dedupe;
DROP INDEX idx_alert_events_user_unread;
DROP INDEX idx_alert_events_user;
DROP TABLE alert_events;

DROP INDEX idx_watchlist_items_watchlist;
DROP INDEX idx_watchlist_items_type;
DROP INDEX idx_watchlist_items_user;
DROP TABLE watchlist_items;

DROP INDEX idx_watchlists_user;
DROP TABLE watchlists;

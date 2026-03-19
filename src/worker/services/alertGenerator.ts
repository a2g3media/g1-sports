/**
 * Alert Generation Service
 * 
 * Converts threshold_events into personalized alert_events for users
 * based on their watchlist items and preferences.
 * 
 * Key principles:
 * - No spam: strict deduplication and rate limiting
 * - Calm & factual: threshold-driven only, no hype
 * - User control: respect preferences for sensitivity, quiet hours, severity minimum
 */

import type { AlertSeverity, AlertSensitivity } from "@/shared/types";
import { normalizeCoachGAlertCopy } from "./coachgCompliance";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

// =====================================================
// TYPES
// =====================================================

interface ThresholdEvent {
  id: number;
  data_scope: string;
  sport_type: string;
  league_context_id: number | null;
  game_id: number | null;
  event_category: string;
  event_type: string;
  severity: AlertSeverity;
  headline: string;
  details_json: string | null;
  source: string | null;
  expires_at: string | null;
  is_visible: number;
  is_consumed: number;
  rank_score: number;
  created_at: string;
}

interface WatchlistItem {
  user_id: string;
  item_type: string;
  item_id: string;
  sport_type: string | null;
  display_name: string | null;
  metadata_json: string | null;
}

interface UserPreferences {
  user_id: string;
  is_enabled: number;
  sensitivity: AlertSensitivity;
  severity_minimum: AlertSeverity;
  quiet_hours_enabled: number;
  quiet_hours_start: string;
  quiet_hours_end: string;
  per_item_overrides_json: string | null;
}

interface GenerationResult {
  alerts_created: number;
  events_processed: number;
  users_notified: Set<string>;
  dedupe_skipped: number;
  preference_skipped: number;
}

// =====================================================
// CONFIGURATION
// =====================================================

// Deduplication window in minutes (same event type for same game won't re-alert within this window)
const DEDUPE_WINDOW_MINUTES = 30;

// Severity rank for filtering
const SEVERITY_RANK: Record<AlertSeverity, number> = {
  INFO: 1,
  IMPACT: 2,
  CRITICAL: 3,
};

// Sensitivity determines which events pass through
const SENSITIVITY_CONFIG: Record<AlertSensitivity, {
  minSeverity: AlertSeverity;
  rankThreshold: number; // Minimum rank_score for INFO events
}> = {
  CALM: { minSeverity: "IMPACT", rankThreshold: 0.8 },
  STANDARD: { minSeverity: "IMPACT", rankThreshold: 0.5 },
  AGGRESSIVE: { minSeverity: "INFO", rankThreshold: 0.2 },
};

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Generate a deduplication key for an alert
 * Format: {category}-{type}-{game_id}-{time_bucket}
 */
function generateDedupeKey(event: ThresholdEvent, timeBucketMinutes: number = DEDUPE_WINDOW_MINUTES): string {
  const timeBucket = Math.floor(new Date(event.created_at).getTime() / (timeBucketMinutes * 60 * 1000));
  return `${event.event_category}-${event.event_type}-${event.game_id || "global"}-${timeBucket}`;
}

/**
 * Check if current time is within quiet hours
 */
function isQuietHours(start: string, end: string): boolean {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  const [startHour, startMin] = start.split(":").map(Number);
  const [endHour, endMin] = end.split(":").map(Number);
  
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  
  // Handle overnight quiet hours (e.g., 22:00 - 07:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
  
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

/**
 * Check if an event passes the user's sensitivity/severity filter
 */
function passesFilter(
  event: ThresholdEvent,
  sensitivity: AlertSensitivity,
  severityMinimum: AlertSeverity
): boolean {
  const eventSeverityRank = SEVERITY_RANK[event.severity];
  const minSeverityRank = SEVERITY_RANK[severityMinimum];
  
  // Must meet minimum severity
  if (eventSeverityRank < minSeverityRank) {
    // Exception: AGGRESSIVE sensitivity can include high-rank INFO events
    if (sensitivity === "AGGRESSIVE" && event.rank_score >= SENSITIVITY_CONFIG.AGGRESSIVE.rankThreshold) {
      return true;
    }
    return false;
  }
  
  return true;
}

/**
 * Build context label from event data
 */
function buildContextLabel(event: ThresholdEvent, gameInfo?: { home_team?: string; away_team?: string }): string {
  const parts: string[] = [];
  
  if (event.sport_type) {
    parts.push(event.sport_type.toUpperCase());
  }
  
  if (gameInfo?.home_team && gameInfo?.away_team) {
    parts.push(`${gameInfo.away_team}@${gameInfo.home_team}`);
  }
  
  return parts.join(" • ");
}

/**
 * Build deep link from event data
 */
function buildDeepLink(event: ThresholdEvent): string | null {
  if (event.game_id) {
    return `/intel/game/${event.game_id}`;
  }
  if (event.league_context_id) {
    return `/pool/${event.league_context_id}`;
  }
  return null;
}

// =====================================================
// MAIN GENERATION LOGIC
// =====================================================

/**
 * Generate alerts for a single user from a set of threshold events
 */
async function generateAlertsForUser(
  db: D1Database,
  userId: string,
  events: ThresholdEvent[],
  watchlist: WatchlistItem[],
  preferences: UserPreferences | null,
  scope: string
): Promise<{ created: number; dedupeSkipped: number; preferenceSkipped: number }> {
  // Use defaults if no preferences
  const prefs = preferences || {
    user_id: userId,
    is_enabled: 1,
    sensitivity: "CALM" as AlertSensitivity,
    severity_minimum: "IMPACT" as AlertSeverity,
    quiet_hours_enabled: 1,
    quiet_hours_start: "22:00",
    quiet_hours_end: "07:00",
    per_item_overrides_json: null,
  };
  
  // Check if alerts are enabled
  if (!prefs.is_enabled) {
    return { created: 0, dedupeSkipped: 0, preferenceSkipped: events.length };
  }
  
  // Check quiet hours (skip all alerts during quiet hours except CRITICAL)
  const inQuietHours = prefs.quiet_hours_enabled && isQuietHours(prefs.quiet_hours_start, prefs.quiet_hours_end);
  
  // Build lookup sets for watchlist
  const watchedGames = new Set<string>();
  const watchedTeams = new Set<string>();
  const watchedSports = new Set<string>();
  const watchedPools = new Set<string>();
  
  for (const item of watchlist) {
    switch (item.item_type) {
      case "GAME":
        watchedGames.add(item.item_id);
        break;
      case "TEAM":
        watchedTeams.add(item.item_id);
        break;
      case "SPORT":
        watchedSports.add(item.item_id);
        break;
      case "POOL":
        watchedPools.add(item.item_id);
        break;
    }
  }
  
  let created = 0;
  let dedupeSkipped = 0;
  let preferenceSkipped = 0;
  
  for (const event of events) {
    // Determine if this event is relevant to user's watchlist
    let isRelevant = false;
    let itemType = "GAME";
    let itemId = event.game_id ? String(event.game_id) : "";
    
    // Check game watchlist
    if (event.game_id && watchedGames.has(String(event.game_id))) {
      isRelevant = true;
      itemType = "GAME";
      itemId = String(event.game_id);
    }
    
    // Check sport watchlist
    if (event.sport_type && watchedSports.has(event.sport_type)) {
      isRelevant = true;
      // Keep game as item_type if we have a game_id, otherwise use sport
      if (!event.game_id) {
        itemType = "SPORT";
        itemId = event.sport_type;
      }
    }
    
    // Check pool watchlist
    if (event.league_context_id && watchedPools.has(String(event.league_context_id))) {
      isRelevant = true;
      itemType = "POOL";
      itemId = String(event.league_context_id);
    }
    
    if (!isRelevant) continue;
    
    // Check severity/sensitivity filter
    if (!passesFilter(event, prefs.sensitivity as AlertSensitivity, prefs.severity_minimum as AlertSeverity)) {
      preferenceSkipped++;
      continue;
    }
    
    // During quiet hours, only allow CRITICAL
    if (inQuietHours && event.severity !== "CRITICAL") {
      preferenceSkipped++;
      continue;
    }
    
    // Generate dedupe key
    const dedupeKey = generateDedupeKey(event);
    
    // Check for existing alert with same dedupe_key
    const existingAlert = await db.prepare(`
      SELECT id FROM alert_events 
      WHERE user_id = ? AND dedupe_key = ? AND data_scope = ?
    `).bind(userId, dedupeKey, scope).first();
    
    if (existingAlert) {
      dedupeSkipped++;
      continue;
    }
    
    // Create the alert
    const contextLabel = buildContextLabel(event);
    const deepLink = buildDeepLink(event);
    const normalizedCopy = normalizeCoachGAlertCopy({
      title: event.headline,
      body: event.details_json ? extractBody(event.details_json) : null,
    });
    
    await db.prepare(`
      INSERT INTO alert_events (
        data_scope, user_id, threshold_event_id, game_id, pool_id,
        item_type, item_id, severity, headline, body, context_label, 
        deep_link, dedupe_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      scope,
      userId,
      event.id,
      event.game_id ? String(event.game_id) : null,
      event.league_context_id,
      itemType,
      itemId,
      event.severity,
      normalizedCopy.title,
      normalizedCopy.body,
      contextLabel || null,
      deepLink,
      dedupeKey
    ).run();
    
    created++;
  }
  
  return { created, dedupeSkipped, preferenceSkipped };
}

/**
 * Extract a short body text from details JSON
 */
function extractBody(detailsJson: string): string | null {
  try {
    const details = JSON.parse(detailsJson);
    // Look for common fields that could be used as body
    return details.summary || details.description || details.notes || null;
  } catch {
    return null;
  }
}

// =====================================================
// PUBLIC API
// =====================================================

/**
 * Generate alerts for all users from recent threshold events
 * This is the main entry point for batch processing
 */
export async function generateAlertsFromThresholdEvents(
  db: D1Database,
  scope: string = "PROD",
  options: {
    lookbackMinutes?: number;
    maxEventsPerRun?: number;
    specificUserId?: string; // If set, only generate for this user
  } = {}
): Promise<GenerationResult> {
  const {
    lookbackMinutes = 60,
    maxEventsPerRun = 500,
    specificUserId,
  } = options;
  
  const result: GenerationResult = {
    alerts_created: 0,
    events_processed: 0,
    users_notified: new Set(),
    dedupe_skipped: 0,
    preference_skipped: 0,
  };
  
  // Fetch recent threshold events that haven't been fully processed
  const eventsResult = await db.prepare(`
    SELECT * FROM threshold_events 
    WHERE data_scope = ? 
      AND is_visible = 1 
      AND created_at > datetime('now', '-${lookbackMinutes} minutes')
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(scope, maxEventsPerRun).all();
  const events = (eventsResult.results || []) as ThresholdEvent[];
  
  if (!events || events.length === 0) {
    return result;
  }
  
  result.events_processed = events.length;
  
  // Get all users with watchlist items (or specific user)
  let usersQuery = `
    SELECT DISTINCT user_id FROM watchlist_items
  `;
  const userParams: (string | number)[] = [];
  
  if (specificUserId) {
    usersQuery += ` WHERE user_id = ?`;
    userParams.push(specificUserId);
  }
  
  const userRowsResult = await db.prepare(usersQuery).bind(...userParams).all();
  const userRows = (userRowsResult.results || []) as { user_id: string }[];
  
  if (!userRows || userRows.length === 0) {
    return result;
  }
  
  // Process each user
  for (const { user_id } of userRows) {
    // Get user's watchlist
    const watchlistResult = await db.prepare(`
      SELECT item_type, item_id, sport_type, display_name, metadata_json
      FROM watchlist_items WHERE user_id = ?
    `).bind(user_id).all();
    const watchlist = (watchlistResult.results || []) as WatchlistItem[];
    
    // Get legacy game watchlist
    const legacyWatchlistResult = await db.prepare(`
      SELECT game_id FROM game_watchlist WHERE user_id = ? AND data_scope = ?
    `).bind(user_id, scope).all();
    const legacyWatchlist = (legacyWatchlistResult.results || []) as { game_id: string }[];
    
    // Merge legacy watchlist into watchlist items
    const combinedWatchlist: WatchlistItem[] = [...(watchlist || [])];
    for (const legacy of (legacyWatchlist || [])) {
      combinedWatchlist.push({
        user_id,
        item_type: "GAME",
        item_id: legacy.game_id,
        sport_type: null,
        display_name: null,
        metadata_json: null,
      });
    }
    
    if (combinedWatchlist.length === 0) continue;
    
    // Get user's preferences
    const preferences = await db.prepare(`
      SELECT * FROM alert_preferences WHERE user_id = ?
    `).bind(user_id).first() as UserPreferences | null;
    
    // Generate alerts for this user
    const userResult = await generateAlertsForUser(
      db,
      user_id,
      events,
      combinedWatchlist,
      preferences,
      scope
    );
    
    result.alerts_created += userResult.created;
    result.dedupe_skipped += userResult.dedupeSkipped;
    result.preference_skipped += userResult.preferenceSkipped;
    
    if (userResult.created > 0) {
      result.users_notified.add(user_id);
    }
  }
  
  return result;
}

/**
 * Generate demo alerts for a user (creates sample threshold events first)
 */
export async function generateDemoAlerts(
  db: D1Database,
  userId: string,
  scope: string = "DEMO"
): Promise<{ alerts_created: number; threshold_events_created: number }> {
  // Create sample threshold events for demo
  const demoEvents = [
    {
      sport_type: "nfl",
      event_category: "INJURY",
      event_type: "INJURY_CONFIRMED",
      severity: "CRITICAL",
      headline: "Patrick Mahomes (QB) ruled OUT - ankle injury",
      details_json: JSON.stringify({ player: "Patrick Mahomes", team: "KC", injury_type: "ankle", status: "OUT" }),
      rank_score: 0.95,
    },
    {
      sport_type: "nfl",
      event_category: "ODDS",
      event_type: "LINE_MOVE_SHARP",
      severity: "IMPACT",
      headline: "Chiefs spread moves +3.5 → +5.5 (sharp action)",
      details_json: JSON.stringify({ old_line: 3.5, new_line: 5.5, team: "KC" }),
      rank_score: 0.75,
    },
    {
      sport_type: "nba",
      event_category: "INJURY",
      event_type: "INJURY_UPGRADE",
      severity: "IMPACT",
      headline: "LeBron James upgraded to PROBABLE for tonight",
      details_json: JSON.stringify({ player: "LeBron James", team: "LAL", old_status: "QUESTIONABLE", new_status: "PROBABLE" }),
      rank_score: 0.7,
    },
    {
      sport_type: "nfl",
      event_category: "ODDS",
      event_type: "TOTAL_MOVE",
      severity: "IMPACT",
      headline: "PHI@DAL total drops 47.5 → 44.5 (weather concerns)",
      details_json: JSON.stringify({ old_total: 47.5, new_total: 44.5, reason: "weather" }),
      rank_score: 0.65,
    },
    {
      sport_type: "nba",
      event_category: "ROSTER",
      event_type: "STARTER_CHANGE",
      severity: "INFO",
      headline: "Austin Reaves expected to start in place of D'Angelo Russell",
      details_json: JSON.stringify({ player_in: "Austin Reaves", player_out: "D'Angelo Russell", team: "LAL" }),
      rank_score: 0.4,
    },
  ];
  
  let thresholdEventsCreated = 0;
  
  for (const event of demoEvents) {
    await db.prepare(`
      INSERT INTO threshold_events (
        data_scope, sport_type, event_category, event_type, severity, 
        headline, details_json, rank_score, is_visible
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      scope,
      event.sport_type,
      event.event_category,
      event.event_type,
      event.severity,
      event.headline,
      event.details_json,
      event.rank_score
    ).run();
    thresholdEventsCreated++;
  }
  
  // Now generate alerts from these events
  const result = await generateAlertsFromThresholdEvents(db, scope, {
    lookbackMinutes: 5,
    specificUserId: userId,
  });
  
  return {
    alerts_created: result.alerts_created,
    threshold_events_created: thresholdEventsCreated,
  };
}

/**
 * Clean up old alerts (run periodically)
 */
export async function cleanupOldAlerts(
  db: D1Database,
  daysToKeep: number = 7
): Promise<{ deleted: number }> {
  const result = await db.prepare(`
    DELETE FROM alert_events 
    WHERE created_at < datetime('now', '-${daysToKeep} days')
      AND dismissed_at IS NOT NULL
  `).run();
  
  return { deleted: result.meta.changes || 0 };
}

/**
 * Get alert generation stats for monitoring
 */
export async function getAlertGenerationStats(
  db: D1Database,
  scope: string = "PROD"
): Promise<{
  total_alerts_24h: number;
  critical_alerts_24h: number;
  unique_users_24h: number;
  avg_alerts_per_user: number;
}> {
  const stats = await db.prepare(`
    SELECT 
      COUNT(*) as total_alerts,
      SUM(CASE WHEN severity = 'CRITICAL' THEN 1 ELSE 0 END) as critical_alerts,
      COUNT(DISTINCT user_id) as unique_users
    FROM alert_events
    WHERE data_scope = ? AND created_at > datetime('now', '-24 hours')
  `).bind(scope).first() as {
    total_alerts: number;
    critical_alerts: number;
    unique_users: number;
  } | null;
  
  return {
    total_alerts_24h: stats?.total_alerts || 0,
    critical_alerts_24h: stats?.critical_alerts || 0,
    unique_users_24h: stats?.unique_users || 0,
    avg_alerts_per_user: stats?.unique_users 
      ? Math.round((stats.total_alerts / stats.unique_users) * 10) / 10 
      : 0,
  };
}

/**
 * Alert Rate Limiter & Freshness Monitor
 * 
 * Prevents alert flooding and monitors data freshness across alert sources.
 * 
 * Features:
 * - Per-user, per-alert-type rate limiting
 * - Cooldown periods for repeated alerts
 * - Data freshness tracking with degradation indicators
 * - Alert deduplication within time windows
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

export type DataScope = "DEMO" | "PROD";

// ============================================================================
// Configuration
// ============================================================================

export const RATE_LIMIT_CONFIG = {
  // Maximum alerts per user per hour by type
  maxAlertsPerHour: {
    SCORING_EVENT: 50,      // High frequency during live games
    PERIOD_BREAK: 10,       // Limited to period changes
    DOMINANT_PERFORMANCE: 5, // Rare events
    LINE_MOVEMENT: 20,      // Moderate frequency
    INJURY: 10,             // As they happen
    WEATHER: 5,             // Infrequent updates
    GAME_STATE: 20,         // State transitions
    SCHEDULE: 10,           // Schedule changes
    LOCK_REMINDER: 5,       // Pre-deadline reminders
  } as Record<string, number>,
  
  // Cooldown between duplicate alerts (same entity, same type) in seconds
  dedupeWindowSeconds: {
    SCORING_EVENT: 30,      // 30 seconds between same game score alerts
    PERIOD_BREAK: 300,      // 5 minutes between period alerts
    DOMINANT_PERFORMANCE: 600, // 10 minutes for same performance
    LINE_MOVEMENT: 180,     // 3 minutes for same line
    INJURY: 3600,           // 1 hour for same injury
    WEATHER: 1800,          // 30 minutes for same weather
    GAME_STATE: 60,         // 1 minute for same game
    SCHEDULE: 300,          // 5 minutes for same event
    LOCK_REMINDER: 1800,    // 30 minutes for same reminder
  } as Record<string, number>,
  
  // Global limits
  globalMaxPerMinute: 10,  // No more than 10 alerts per minute per user
  globalMaxPerHour: 100,   // No more than 100 alerts per hour per user
  
  // Burst protection - pause all alerts if exceeded
  burstThreshold: 20,      // Alerts in past 5 minutes
  burstPauseDurationSeconds: 300, // Pause for 5 minutes
};

export const FRESHNESS_CONFIG = {
  // Freshness thresholds in seconds
  thresholds: {
    live: 60,       // Less than 1 minute = live
    fresh: 300,     // Less than 5 minutes = fresh
    recent: 900,    // Less than 15 minutes = recent
    aging: 1800,    // Less than 30 minutes = aging
    stale: 3600,    // Less than 1 hour = stale
    // Anything older is "outdated"
  },
  
  // Source-specific freshness expectations
  sources: {
    liveScores: { expectedInterval: 30, maxTolerance: 120 },
    odds: { expectedInterval: 60, maxTolerance: 300 },
    injuries: { expectedInterval: 300, maxTolerance: 1800 },
    weather: { expectedInterval: 600, maxTolerance: 3600 },
    schedule: { expectedInterval: 3600, maxTolerance: 7200 },
  } as Record<string, { expectedInterval: number; maxTolerance: number }>,
};

// ============================================================================
// Types
// ============================================================================

export type FreshnessLevel = "live" | "fresh" | "recent" | "aging" | "stale" | "outdated";

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
  currentCount: number;
  limit: number;
}

export interface FreshnessStatus {
  level: FreshnessLevel;
  lastUpdated: string | null;
  ageSeconds: number;
  isHealthy: boolean;
  degradationNote?: string;
}

export interface AlertRateLimitState {
  userId: string;
  alertType: string;
  alertsThisMinute: number;
  alertsThisHour: number;
  lastAlertAt: string | null;
  isPaused: boolean;
  pauseExpiresAt: string | null;
}

export interface SourceFreshnessState {
  sourceName: string;
  lastUpdated: string | null;
  lastCheckAt: string | null;
  consecutiveFailures: number;
  isHealthy: boolean;
}

// ============================================================================
// In-Memory Rate Limit Tracking
// ============================================================================

// Track recent alerts per user for rate limiting
// Key: `${userId}:${alertType}`, Value: array of timestamps
const recentAlerts = new Map<string, number[]>();

// Track burst state per user
// Key: userId, Value: { isPaused: boolean, pauseExpiresAt: number }
const burstState = new Map<string, { isPaused: boolean; pauseExpiresAt: number }>();

/**
 * Clean up expired entries from in-memory tracking
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  const oneHourAgo = now - 3600000;
  
  // Clean up old alert timestamps
  Array.from(recentAlerts.entries()).forEach(([key, timestamps]) => {
    const filtered = timestamps.filter(ts => ts > oneHourAgo);
    if (filtered.length === 0) {
      recentAlerts.delete(key);
    } else {
      recentAlerts.set(key, filtered);
    }
  });
  
  // Clean up expired burst pauses
  Array.from(burstState.entries()).forEach(([userId, state]) => {
    if (state.isPaused && state.pauseExpiresAt < now) {
      burstState.delete(userId);
    }
  });
}

// ============================================================================
// Rate Limiting Functions
// ============================================================================

/**
 * Check if an alert should be rate limited
 */
export function checkRateLimit(
  userId: string,
  alertType: string
): RateLimitResult {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  const oneHourAgo = now - 3600000;
  const fiveMinutesAgo = now - 300000;
  
  // Clean up periodically
  if (Math.random() < 0.1) {
    cleanupExpiredEntries();
  }
  
  // Check burst protection
  const burst = burstState.get(userId);
  if (burst?.isPaused && burst.pauseExpiresAt > now) {
    const retryAfter = Math.ceil((burst.pauseExpiresAt - now) / 1000);
    return {
      allowed: false,
      reason: "Alert burst detected - temporarily paused",
      retryAfterSeconds: retryAfter,
      currentCount: 0,
      limit: RATE_LIMIT_CONFIG.burstThreshold,
    };
  }
  
  // Get all alerts for this user in the past hour
  const userAlertKeys = Array.from(recentAlerts.keys()).filter(k => k.startsWith(`${userId}:`));
  let totalAlertsLastHour = 0;
  let totalAlertsLastMinute = 0;
  let totalAlertsLast5Minutes = 0;
  
  for (const key of userAlertKeys) {
    const timestamps = recentAlerts.get(key) || [];
    totalAlertsLastHour += timestamps.filter(ts => ts > oneHourAgo).length;
    totalAlertsLastMinute += timestamps.filter(ts => ts > oneMinuteAgo).length;
    totalAlertsLast5Minutes += timestamps.filter(ts => ts > fiveMinutesAgo).length;
  }
  
  // Check burst threshold
  if (totalAlertsLast5Minutes >= RATE_LIMIT_CONFIG.burstThreshold) {
    burstState.set(userId, {
      isPaused: true,
      pauseExpiresAt: now + RATE_LIMIT_CONFIG.burstPauseDurationSeconds * 1000,
    });
    return {
      allowed: false,
      reason: "Alert burst limit exceeded - pausing alerts",
      retryAfterSeconds: RATE_LIMIT_CONFIG.burstPauseDurationSeconds,
      currentCount: totalAlertsLast5Minutes,
      limit: RATE_LIMIT_CONFIG.burstThreshold,
    };
  }
  
  // Check global per-minute limit
  if (totalAlertsLastMinute >= RATE_LIMIT_CONFIG.globalMaxPerMinute) {
    return {
      allowed: false,
      reason: "Too many alerts this minute",
      retryAfterSeconds: 60,
      currentCount: totalAlertsLastMinute,
      limit: RATE_LIMIT_CONFIG.globalMaxPerMinute,
    };
  }
  
  // Check global per-hour limit
  if (totalAlertsLastHour >= RATE_LIMIT_CONFIG.globalMaxPerHour) {
    return {
      allowed: false,
      reason: "Hourly alert limit reached",
      retryAfterSeconds: 3600,
      currentCount: totalAlertsLastHour,
      limit: RATE_LIMIT_CONFIG.globalMaxPerHour,
    };
  }
  
  // Check per-type limit
  const typeKey = `${userId}:${alertType}`;
  const typeTimestamps = recentAlerts.get(typeKey) || [];
  const typeAlertsLastHour = typeTimestamps.filter(ts => ts > oneHourAgo).length;
  const typeLimit = RATE_LIMIT_CONFIG.maxAlertsPerHour[alertType] || 20;
  
  if (typeAlertsLastHour >= typeLimit) {
    return {
      allowed: false,
      reason: `${alertType} alert limit reached`,
      retryAfterSeconds: 3600,
      currentCount: typeAlertsLastHour,
      limit: typeLimit,
    };
  }
  
  return {
    allowed: true,
    currentCount: typeAlertsLastHour,
    limit: typeLimit,
  };
}

/**
 * Record an alert being sent (call after successful delivery)
 */
export function recordAlert(userId: string, alertType: string): void {
  const key = `${userId}:${alertType}`;
  const timestamps = recentAlerts.get(key) || [];
  timestamps.push(Date.now());
  recentAlerts.set(key, timestamps);
}

/**
 * Check if an alert is a duplicate (same entity, same type, within window)
 */
export async function isDuplicateAlert(
  db: D1Database,
  userId: string,
  alertType: string,
  entityKey: string,
  dataScope: DataScope
): Promise<{ isDuplicate: boolean; lastAlertAt: string | null }> {
  const windowSeconds = RATE_LIMIT_CONFIG.dedupeWindowSeconds[alertType] || 60;
  
  const result = await db.prepare(`
    SELECT created_at FROM alert_events
    WHERE user_id = ? AND alert_type = ? AND entity_key = ? AND data_scope = ?
    AND created_at > datetime('now', '-${windowSeconds} seconds')
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(userId, alertType, entityKey, dataScope).first() as { created_at: string } | null;
  
  return {
    isDuplicate: !!result,
    lastAlertAt: result?.created_at || null,
  };
}

/**
 * Get rate limit status for a user
 */
export function getRateLimitStatus(userId: string): AlertRateLimitState[] {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  const oneHourAgo = now - 3600000;
  const states: AlertRateLimitState[] = [];
  
  const alertTypes = Object.keys(RATE_LIMIT_CONFIG.maxAlertsPerHour);
  
  for (const alertType of alertTypes) {
    const key = `${userId}:${alertType}`;
    const timestamps = recentAlerts.get(key) || [];
    
    const alertsThisMinute = timestamps.filter(ts => ts > oneMinuteAgo).length;
    const alertsThisHour = timestamps.filter(ts => ts > oneHourAgo).length;
    const lastAlertAt = timestamps.length > 0 
      ? new Date(Math.max(...timestamps)).toISOString() 
      : null;
    
    const burst = burstState.get(userId);
    
    states.push({
      userId,
      alertType,
      alertsThisMinute,
      alertsThisHour,
      lastAlertAt,
      isPaused: burst?.isPaused && burst.pauseExpiresAt > now ? true : false,
      pauseExpiresAt: burst?.isPaused ? new Date(burst.pauseExpiresAt).toISOString() : null,
    });
  }
  
  return states;
}

// ============================================================================
// Freshness Monitoring Functions
// ============================================================================

/**
 * Calculate freshness level from age in seconds
 */
export function getFreshnessLevel(ageSeconds: number): FreshnessLevel {
  const { thresholds } = FRESHNESS_CONFIG;
  
  if (ageSeconds < thresholds.live) return "live";
  if (ageSeconds < thresholds.fresh) return "fresh";
  if (ageSeconds < thresholds.recent) return "recent";
  if (ageSeconds < thresholds.aging) return "aging";
  if (ageSeconds < thresholds.stale) return "stale";
  return "outdated";
}

/**
 * Get freshness status for a data source
 */
export async function getSourceFreshness(
  db: D1Database,
  sourceName: string,
  dataScope: DataScope
): Promise<FreshnessStatus> {
  // Get latest data point from the source
  const result = await db.prepare(`
    SELECT MAX(updated_at) as last_updated
    FROM data_freshness_log
    WHERE source_name = ? AND data_scope = ?
  `).bind(sourceName, dataScope).first() as { last_updated: string | null } | null;
  
  const lastUpdated = result?.last_updated || null;
  
  if (!lastUpdated) {
    return {
      level: "outdated",
      lastUpdated: null,
      ageSeconds: Infinity,
      isHealthy: false,
      degradationNote: "No data received from this source",
    };
  }
  
  const ageSeconds = Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 1000);
  const level = getFreshnessLevel(ageSeconds);
  
  // Check against source-specific expectations
  const sourceConfig = FRESHNESS_CONFIG.sources[sourceName];
  let isHealthy = true;
  let degradationNote: string | undefined;
  
  if (sourceConfig) {
    if (ageSeconds > sourceConfig.maxTolerance) {
      isHealthy = false;
      degradationNote = `Data is ${Math.floor(ageSeconds / 60)} minutes old (expected within ${Math.floor(sourceConfig.maxTolerance / 60)} minutes)`;
    } else if (ageSeconds > sourceConfig.expectedInterval * 2) {
      isHealthy = true;
      degradationNote = `Data update delayed (${Math.floor(ageSeconds / 60)} min vs expected ${Math.floor(sourceConfig.expectedInterval / 60)} min)`;
    }
  }
  
  return {
    level,
    lastUpdated,
    ageSeconds,
    isHealthy,
    degradationNote,
  };
}

/**
 * Record a data freshness update
 */
export async function recordFreshnessUpdate(
  db: D1Database,
  sourceName: string,
  dataScope: DataScope,
  metadata?: Record<string, unknown>
): Promise<void> {
  await db.prepare(`
    INSERT INTO data_freshness_log (source_name, data_scope, metadata_json, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (source_name, data_scope) DO UPDATE SET
      metadata_json = excluded.metadata_json,
      updated_at = CURRENT_TIMESTAMP
  `).bind(sourceName, dataScope, metadata ? JSON.stringify(metadata) : null).run();
}

/**
 * Get freshness status for all monitored sources
 */
export async function getAllSourcesFreshness(
  db: D1Database,
  dataScope: DataScope
): Promise<Record<string, FreshnessStatus>> {
  const sources = Object.keys(FRESHNESS_CONFIG.sources);
  const result: Record<string, FreshnessStatus> = {};
  
  for (const source of sources) {
    result[source] = await getSourceFreshness(db, source, dataScope);
  }
  
  return result;
}

/**
 * Get overall system health based on source freshness
 */
export async function getAlertSystemHealth(
  db: D1Database,
  dataScope: DataScope
): Promise<{
  overallHealth: "healthy" | "degraded" | "unhealthy";
  healthySources: number;
  totalSources: number;
  issues: string[];
}> {
  const freshness = await getAllSourcesFreshness(db, dataScope);
  const sources = Object.entries(freshness);
  
  const healthySources = sources.filter(([, status]) => status.isHealthy).length;
  const totalSources = sources.length;
  const issues: string[] = [];
  
  for (const [name, status] of sources) {
    if (!status.isHealthy) {
      issues.push(`${name}: ${status.degradationNote || "unhealthy"}`);
    }
  }
  
  let overallHealth: "healthy" | "degraded" | "unhealthy";
  if (healthySources === totalSources) {
    overallHealth = "healthy";
  } else if (healthySources >= totalSources * 0.5) {
    overallHealth = "degraded";
  } else {
    overallHealth = "unhealthy";
  }
  
  return {
    overallHealth,
    healthySources,
    totalSources,
    issues,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Reset rate limits for a user (admin function)
 */
export function resetUserRateLimits(userId: string): void {
  const keysToDelete = Array.from(recentAlerts.keys()).filter(k => k.startsWith(`${userId}:`));
  for (const key of keysToDelete) {
    recentAlerts.delete(key);
  }
  burstState.delete(userId);
}

/**
 * Get freshness display info
 */
export function getFreshnessDisplay(level: FreshnessLevel): {
  icon: string;
  color: string;
  label: string;
} {
  const displays: Record<FreshnessLevel, { icon: string; color: string; label: string }> = {
    live: { icon: "🟢", color: "text-green-500", label: "Live" },
    fresh: { icon: "🟢", color: "text-green-500", label: "Fresh" },
    recent: { icon: "🟡", color: "text-yellow-500", label: "Recent" },
    aging: { icon: "🟠", color: "text-orange-500", label: "Aging" },
    stale: { icon: "🔴", color: "text-red-500", label: "Stale" },
    outdated: { icon: "⚪", color: "text-gray-500", label: "Outdated" },
  };
  return displays[level];
}

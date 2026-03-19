/**
 * Push Notification Intelligence Engine
 * 
 * Smart push notification system for Scout with bundling, tier enforcement, and rate protection.
 * 
 * BUNDLING RULES:
 * - Bundle alerts by GAME within 60-90 second windows
 * - Multiple scoring events = 1 consolidated push
 * - Reset window after inactivity
 * 
 * BYPASS RULES (sent immediately):
 * - Game-winning score
 * - Overtime start
 * - Final score
 * - Confirmed major injury (starters ruled out close to game time)
 * - Extreme line movement (>5 points spread, >10 points total)
 * 
 * TIER ENFORCEMENT:
 * Free: Final scores only (followed teams), game start notifications
 * Pro: All scores, period summaries, proactive alerts, live watching updates
 * Elite: Custom trigger pushes, multi-game bundling
 * 
 * SMART FILTERING:
 * - Bundle by game, NEVER across games
 * - Never send "multiple games updated" generic push
 * 
 * RATE PROTECTION:
 * - Maximum pushes per user per 5-minute window (configurable)
 * - Log suppressed pushes
 */

import { recordAlert } from "./alertRateLimiter";
import { getUserSubscription } from "./subscriptionService";
import type { GZSportsTier } from "./subscriptionService";
import { checkPerGameCap, recordPushWithPeriod } from "./perGameCapService";
import { formatElitePush, formatProPush, formatBundledScoutPush, type ScoutPushAlert } from "./scoutPushFormatter";
import { 
  shouldSendNotification, 

  getUserFollowedTeams,
} from "./notificationDefaultsService";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

export type DataScope = "DEMO" | "PROD";

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Push rate limits per tier (pushes per 5-minute window)
 */
const TIER_PUSH_LIMITS: Record<GZSportsTier, number> = {
  anonymous: 0,        // No pushes for anonymous users
  free: 3,             // 3 pushes per 5 min (final scores + game starts)
  pool_access: 3,      // Same as free for alerts
  scout_pro: 20,       // 20 pushes per 5 min (live action)
  scout_elite: 50,     // 50 pushes per 5 min (unlimited live action)
  admin_starter: 10,   // Admin notifications
  admin_unlimited: 10, // Admin notifications
};

/**
 * Alert categories that bypass bundling (always sent immediately)
 */
const BYPASS_CATEGORIES = [
  "game_winner",           // Game-winning score
  "overtime_start",        // Overtime begins
  "final_score",           // Game ends
  "critical_injury",       // Major injury close to game time
  "extreme_line_movement", // Huge line shift
  "period_break",          // Quarter/period transition
  "dominant_performance",  // Extraordinary performance
];

/**
 * Thresholds for extreme line movements
 */
const EXTREME_LINE_THRESHOLDS = {
  spread: 5,    // 5+ points on spread
  total: 10,    // 10+ points on total
  moneyline: 50, // 50+ cent move on moneyline
};

// ============================================================================
// TYPES
// ============================================================================

export interface PushAlert {
  id: string;
  userId: string;
  gameId: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface FormattedPush {
  title: string;
  body: string;
  data: {
    gameId: string;
    alertId: string;
    category: string;
    deepLink?: string;
  };
}

export interface PushDeliveryResult {
  sent: boolean;
  suppressed: boolean;
  reason?: string;
  bundled?: boolean;
  bypassed?: boolean;
  tierRestricted?: boolean;
  rateLimited?: boolean;
}

export type AlertPreference = "bundled" | "every_event" | "finals_only";

// ============================================================================
// TIER ENFORCEMENT
// ============================================================================

/**
 * Determine if a user's tier allows this alert category
 */
function canUserReceiveAlert(
  tier: GZSportsTier,
  category: string,
  isFollowedGame: boolean
): { allowed: boolean; reason?: string } {
  // Anonymous users get nothing
  if (tier === "anonymous") {
    return { allowed: false, reason: "Not logged in" };
  }
  
  // Free tier restrictions
  if (tier === "free" || tier === "pool_access") {
    const allowedCategories = [
      "final_score",
      "game_start",
    ];
    
    // Only send if it's a followed game
    if (!isFollowedGame) {
      return { allowed: false, reason: "Free tier: followed games only" };
    }
    
    // Only send allowed categories
    if (!allowedCategories.includes(category)) {
      return { allowed: false, reason: "Free tier: limited alert types" };
    }
    
    return { allowed: true };
  }
  
  // Pro tier gets all standard alerts
  if (tier === "scout_pro") {
    const restrictedCategories = [
      "custom_trigger", // Elite only
    ];
    
    if (restrictedCategories.includes(category)) {
      return { allowed: false, reason: "Elite feature" };
    }
    
    return { allowed: true };
  }
  
  // Elite gets everything
  if (tier === "scout_elite") {
    return { allowed: true };
  }
  
  // Admin tiers get admin notifications + standard alerts
  if (tier === "admin_starter" || tier === "admin_unlimited") {
    return { allowed: true };
  }
  
  return { allowed: false, reason: "Unknown tier" };
}

/**
 * Get push rate limit for user's tier
 */
function getUserPushLimit(tier: GZSportsTier): number {
  return TIER_PUSH_LIMITS[tier] || 0;
}

// ============================================================================
// BYPASS DETERMINATION
// ============================================================================

/**
 * Determine if this alert should bypass bundling
 */
function shouldBypassBundling(
  category: string,
  severity: string,
  metadata?: Record<string, unknown>
): boolean {
  // Check category
  if (BYPASS_CATEGORIES.includes(category)) {
    return true;
  }
  
  // Check severity
  if (severity === "critical") {
    return true;
  }
  
  // Check metadata flags
  if (metadata?.isGameWinner || metadata?.isFinalScore || metadata?.isOvertimeStart) {
    return true;
  }
  
  // Check extreme line movement
  if (category === "line_movement" && metadata) {
    const change = Math.abs((metadata.changeAmount as number) || 0);
    const marketType = metadata.marketType as string;
    
    if (marketType === "SPREAD" && change >= EXTREME_LINE_THRESHOLDS.spread) {
      return true;
    }
    if (marketType === "TOTAL" && change >= EXTREME_LINE_THRESHOLDS.total) {
      return true;
    }
    if (marketType === "MONEYLINE" && change >= EXTREME_LINE_THRESHOLDS.moneyline) {
      return true;
    }
  }
  
  return false;
}

// ============================================================================
// PUSH FORMATTING
// ============================================================================

// ============================================================================
// PUSH DELIVERY
// ============================================================================

/**
 * Process a single alert for push delivery
 * 
 * CHECK ORDER (as specified):
 * a) master toggle
 * b) quiet hours
 * c) tier gating
 * d) per-sport/team overrides
 * e) per-game caps
 * f) bundling window
 * g) send
 */
export async function processPushAlert(
  db: D1Database,
  alert: PushAlert,
  dataScope: DataScope = "PROD"
): Promise<PushDeliveryResult> {
  try {
    // Get user subscription and tier
    const subscription = await getUserSubscription(db, alert.userId);
    const tier = subscription?.tier || "free";
    
    // Get context for shouldSendNotification
    const isFollowedGame = await isGameFollowed(db, alert.userId, alert.gameId, dataScope);
    const isWatchedGame = await isGameWatched(db, alert.userId, alert.gameId, dataScope);
    const isPoolGame = await isGameInPool(db, alert.userId, alert.gameId, dataScope);
    const followedTeams = await getUserFollowedTeams(db, alert.userId, dataScope);
    const teamKey = (alert.metadata?.teamKey as string) || (alert.metadata?.homeTeam as string);
    const isFollowedTeam = teamKey ? followedTeams.includes(teamKey) : isFollowedGame;
    
    // =================================================================
    // CHECK ORDER: a) master toggle, b) quiet hours, c) tier gating, 
    //              d) per-sport/team overrides
    // =================================================================
    // shouldSendNotification handles: master toggle, quiet hours, 
    // sport/team overrides, and category-specific settings
    const notificationCheck = await shouldSendNotification(db, alert.userId, tier, dataScope, {
      category: alert.category,
      sport: alert.metadata?.sport as string | undefined,
      teamKey,
      gameId: alert.gameId,
      isFollowedTeam,
      isWatchedGame,
      isPoolGame,
    });
    
    if (!notificationCheck.allowed) {
      await logSuppressedPush(db, alert, "notification_settings", notificationCheck.reason, dataScope);
      return {
        sent: false,
        suppressed: true,
        reason: notificationCheck.reason,
      };
    }
    
    // =================================================================
    // CHECK c) tier gating (basic category restrictions)
    // =================================================================
    const tierCheck = canUserReceiveAlert(tier, alert.category, isFollowedTeam || isWatchedGame || isPoolGame);
    if (!tierCheck.allowed) {
      await logSuppressedPush(db, alert, "tier_restricted", tierCheck.reason, dataScope);
      return {
        sent: false,
        suppressed: true,
        tierRestricted: true,
        reason: tierCheck.reason,
      };
    }
    
    // =================================================================
    // CHECK d) Rate limiting (global)
    // =================================================================
    const pushLimit = getUserPushLimit(tier);
    const rateCheck = await checkPushRateLimit(db, alert.userId, tier, pushLimit, dataScope);
    if (!rateCheck.allowed) {
      await logSuppressedPush(db, alert, "rate_limited", rateCheck.reason, dataScope);
      return {
        sent: false,
        suppressed: true,
        rateLimited: true,
        reason: rateCheck.reason,
      };
    }
    
    // =================================================================
    // CHECK e) per-game caps
    // =================================================================
    const currentPeriod = alert.metadata?.period as string | undefined;
    const capCheck = await checkPerGameCap(
      db, alert.userId, alert.gameId, alert.category, tier, currentPeriod, alert.metadata, dataScope
    );
    if (!capCheck.allowed && !capCheck.bypassed) {
      await logSuppressedPush(db, alert, "per_game_cap", capCheck.reason, dataScope);
      return {
        sent: false,
        suppressed: true,
        reason: capCheck.reason,
      };
    }
    
    // =================================================================
    // CHECK f) bundling window / bypass
    // =================================================================
    const bypass = shouldBypassBundling(alert.category, alert.severity, alert.metadata);
    
    // Format push using enhanced Scout formatter (tier-specific)
    const scoutAlert: ScoutPushAlert = {
      id: alert.id,
      gameId: alert.gameId,
      category: alert.category,
      severity: alert.severity,
      timestamp: alert.timestamp,
      homeTeam: (alert.metadata?.homeTeam as string) || "Home",
      awayTeam: (alert.metadata?.awayTeam as string) || "Away",
      score: alert.metadata?.score as { home: number; away: number } | undefined,
      period: currentPeriod,
      clock: alert.metadata?.clock as string | undefined,
      metadata: alert.metadata,
    };
    
    // Use tier-specific formatting
    const formattedPush = tier === "scout_elite" 
      ? formatElitePush(scoutAlert)
      : formatProPush(scoutAlert);
    
    // Convert to legacy format for sendPushNotification
    const push: FormattedPush = {
      title: formattedPush.title,
      body: formattedPush.body,
      data: {
        gameId: formattedPush.data.gameId,
        alertId: formattedPush.data.alertId,
        category: formattedPush.data.category,
        deepLink: formattedPush.deepLink,
      },
    };
    await sendPushNotification(db, alert.userId, push, dataScope);
    
    // Record push sent with period for cap tracking
    await recordPushWithPeriod(db, alert.userId, alert.id, alert.gameId, alert.category, currentPeriod, dataScope);
    recordAlert(alert.userId, alert.category);
    
    return {
      sent: true,
      suppressed: false,
      bypassed: bypass,
      bundled: false,
    };
  } catch (error) {
    console.error("Error processing push alert:", error);
    return {
      sent: false,
      suppressed: true,
      reason: "Error processing alert",
    };
  }
}

/**
 * Process a bundled set of alerts from the same game
 */
export async function processBundledPush(
  db: D1Database,
  alerts: PushAlert[],
  gameId: string,
  userId: string,
  dataScope: DataScope = "PROD"
): Promise<PushDeliveryResult> {
  if (alerts.length === 0) {
    return { sent: false, suppressed: true, reason: "No alerts to send" };
  }
  
  // If only one alert, send it normally
  if (alerts.length === 1) {
    return processPushAlert(db, alerts[0], dataScope);
  }
  
  try {
    // Get user tier
    const subscription = await getUserSubscription(db, userId);
    const tier = subscription?.tier || "free";
    
    // Rate limiting check
    const pushLimit = getUserPushLimit(tier);
    const rateCheck = await checkPushRateLimit(db, userId, tier, pushLimit, dataScope);
    if (!rateCheck.allowed) {
      await logSuppressedPush(db, alerts[0], "rate_limited", rateCheck.reason, dataScope);
      return {
        sent: false,
        suppressed: true,
        rateLimited: true,
        reason: rateCheck.reason,
      };
    }
    
    // Format and send bundled push using enhanced Scout formatter
    const scoutAlerts: ScoutPushAlert[] = alerts.map(a => ({
      id: a.id,
      gameId: a.gameId,
      category: a.category,
      severity: a.severity,
      timestamp: a.timestamp,
      homeTeam: (a.metadata?.homeTeam as string) || "Home",
      awayTeam: (a.metadata?.awayTeam as string) || "Away",
      score: a.metadata?.score as { home: number; away: number } | undefined,
      period: a.metadata?.period as string | undefined,
      clock: a.metadata?.clock as string | undefined,
      metadata: a.metadata,
    }));
    
    const formattedBundled = formatBundledScoutPush(scoutAlerts, gameId);
    const push: FormattedPush = {
      title: formattedBundled.title,
      body: formattedBundled.body,
      data: {
        gameId: formattedBundled.data.gameId,
        alertId: formattedBundled.data.alertId,
        category: formattedBundled.data.category,
        deepLink: formattedBundled.deepLink,
      },
    };
    await sendPushNotification(db, userId, push, dataScope);
    
    // Record push sent for all alerts
    for (const alert of alerts) {
      await recordPushSent(db, alert, dataScope);
    }
    recordAlert(userId, "bundled_alerts");
    
    return {
      sent: true,
      suppressed: false,
      bundled: true,
    };
  } catch (error) {
    console.error("Error processing bundled push:", error);
    return {
      sent: false,
      suppressed: true,
      reason: "Error processing bundle",
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check push rate limit for user (per 5-minute window)
 */
async function checkPushRateLimit(
  db: D1Database,
  userId: string,
  _tier: GZSportsTier,
  limit: number,
  dataScope: DataScope
): Promise<{ allowed: boolean; reason?: string; count: number }> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  
  const result = await db.prepare(`
    SELECT COUNT(*) as count FROM push_delivery_log
    WHERE user_id = ? AND data_scope = ? AND sent_at > ?
  `).bind(userId, dataScope, fiveMinutesAgo).first() as { count: number };
  
  const count = result?.count || 0;
  
  if (count >= limit) {
    return {
      allowed: false,
      reason: `Push limit reached (${count}/${limit} in last 5 minutes)`,
      count,
    };
  }
  
  return { allowed: true, count };
}

/**
 * Check if user follows a game (via followed teams)
 */
async function isGameFollowed(
  db: D1Database,
  userId: string,
  gameId: string,
  dataScope: DataScope
): Promise<boolean> {
  // Check if user follows either team in this game
  const result = await db.prepare(`
    SELECT 1 FROM watchlist w
    JOIN games g ON (g.home_team = w.team_key OR g.away_team = w.team_key)
    WHERE w.user_id = ? AND g.id = ? AND w.data_scope = ?
    LIMIT 1
  `).bind(userId, gameId, dataScope).first();
  
  return !!result;
}

/**
 * Check if user is actively watching a game (via game_watchlist)
 */
async function isGameWatched(
  db: D1Database,
  userId: string,
  gameId: string,
  dataScope: DataScope
): Promise<boolean> {
  const result = await db.prepare(`
    SELECT 1 FROM game_watchlist
    WHERE user_id = ? AND game_id = ? AND data_scope = ?
    LIMIT 1
  `).bind(userId, gameId, dataScope).first();
  
  return !!result;
}

/**
 * Check if game is part of a pool the user participates in
 */
async function isGameInPool(
  db: D1Database,
  userId: string,
  gameId: string,
  dataScope: DataScope
): Promise<boolean> {
  // Check if this game is associated with any pool the user is a member of
  const result = await db.prepare(`
    SELECT 1 FROM league_members lm
    JOIN picks p ON p.league_id = lm.league_id AND p.user_id = lm.user_id
    WHERE lm.user_id = ? AND p.game_id = ? AND lm.data_scope = ?
    LIMIT 1
  `).bind(userId, gameId, dataScope).first();
  
  return !!result;
}

/**
 * Get user's alert preference
 */
export async function getUserAlertPreference(
  db: D1Database,
  userId: string,
  dataScope: DataScope
): Promise<AlertPreference> {
  const result = await db.prepare(`
    SELECT alert_preference FROM user_settings
    WHERE user_id = ? AND data_scope = ?
  `).bind(userId, dataScope).first() as { alert_preference: AlertPreference } | null;
  
  return result?.alert_preference || "bundled";
}

/**
 * Check if alert should be sent based on user preference
 */
export function shouldSendBasedOnPreference(
  preference: AlertPreference,
  category: string
): boolean {
  if (preference === "every_event") {
    return true; // Send everything
  }
  
  if (preference === "finals_only") {
    return category === "final_score" || category === "game_winner";
  }
  
  // "bundled" (default) sends everything but bundles them
  return true;
}

/**
 * Send push notification (stub - integrate with actual push service)
 */
async function sendPushNotification(
  db: D1Database,
  userId: string,
  push: FormattedPush,
  dataScope: DataScope
): Promise<void> {
  // TODO: Integrate with actual push notification service (FCM, APNs, etc.)
  // For now, just log it
  
  await db.prepare(`
    INSERT INTO push_notifications (
      user_id, title, body, data_json, data_scope, sent_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    userId,
    push.title,
    push.body,
    JSON.stringify(push.data),
    dataScope
  ).run();
  
  console.log(`📱 PUSH [${userId}]: ${push.title} - ${push.body}`);
}

/**
 * Record a push being sent
 */
async function recordPushSent(
  db: D1Database,
  alert: PushAlert,
  dataScope: DataScope
): Promise<void> {
  await db.prepare(`
    INSERT INTO push_delivery_log (
      user_id, alert_id, game_id, category, data_scope, sent_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    alert.userId,
    alert.id,
    alert.gameId,
    alert.category,
    dataScope
  ).run();
}

/**
 * Log a suppressed push
 */
async function logSuppressedPush(
  db: D1Database,
  alert: PushAlert,
  reason: string,
  details: string | undefined,
  dataScope: DataScope
): Promise<void> {
  await db.prepare(`
    INSERT INTO push_suppression_log (
      user_id, alert_id, game_id, category, reason, details, data_scope, suppressed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    alert.userId,
    alert.id,
    alert.gameId,
    alert.category,
    reason,
    details || null,
    dataScope
  ).run();
  
  console.log(`🚫 SUPPRESSED [${alert.userId}]: ${reason} - ${details}`);
}

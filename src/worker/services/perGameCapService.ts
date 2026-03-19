/**
 * Per-Game Watch Caps Service
 * 
 * Configurable rate limits per user per game to prevent notification spam.
 * 
 * CAPS (configurable per tier):
 * - Max pushes per game per 10 minutes
 * - Max pushes per game per period/quarter
 * 
 * BYPASS CONDITIONS (caps ignored):
 * - Game-winner
 * - Overtime start
 * - Final score
 * - Confirmed major injury
 * - Extreme line movement (>5 pts spread, >10 pts total)
 * 
 * Respects existing bundling rules (60-90s windows).
 * Logs suppressed pushes for analytics.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

export type DataScope = "DEMO" | "PROD";

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Per-game caps by tier
 */
export interface GameCapConfig {
  pushesPerTenMinutes: number;
  pushesPerPeriod: number;
}

export const TIER_GAME_CAPS: Record<string, GameCapConfig> = {
  anonymous: { pushesPerTenMinutes: 0, pushesPerPeriod: 0 },
  free: { pushesPerTenMinutes: 0, pushesPerPeriod: 0 }, // Free tier can't watch games
  pool_access: { pushesPerTenMinutes: 0, pushesPerPeriod: 0 },
  scout_pro: { pushesPerTenMinutes: 5, pushesPerPeriod: 3 },
  scout_elite: { pushesPerTenMinutes: 10, pushesPerPeriod: 5 },
  admin_starter: { pushesPerTenMinutes: 5, pushesPerPeriod: 3 },
  admin_unlimited: { pushesPerTenMinutes: 10, pushesPerPeriod: 5 },
};

/**
 * Categories that bypass per-game caps (critical events)
 */
export const CAP_BYPASS_CATEGORIES = [
  "game_winner",           // Game-winning score
  "overtime_start",        // Overtime begins
  "final_score",           // Game ends
  "critical_injury",       // Major injury close to game time
  "extreme_line_movement", // Huge line shift (>5 spread, >10 total)
];

/**
 * Thresholds for extreme line movements
 */
export const EXTREME_THRESHOLDS = {
  spread: 5,     // 5+ points on spread
  total: 10,     // 10+ points on total
  moneyline: 50, // 50+ cent move on moneyline
};

// ============================================================================
// CAP CHECKING
// ============================================================================

export interface CapCheckResult {
  allowed: boolean;
  bypassed: boolean;
  reason?: string;
  currentTenMinCount: number;
  currentPeriodCount: number;
  limits: GameCapConfig;
}

/**
 * Check if an alert should be sent based on per-game caps
 */
export async function checkPerGameCap(
  db: D1Database,
  userId: string,
  gameId: string,
  category: string,
  tier: string,
  currentPeriod: string | undefined,
  metadata?: Record<string, unknown>,
  dataScope: DataScope = "PROD"
): Promise<CapCheckResult> {
  const limits = TIER_GAME_CAPS[tier] || TIER_GAME_CAPS.free;
  
  // Check for bypass conditions first
  if (shouldBypassCap(category, metadata)) {
    return {
      allowed: true,
      bypassed: true,
      currentTenMinCount: 0,
      currentPeriodCount: 0,
      limits,
    };
  }
  
  // Free/Pool tiers can't watch games - shouldn't get here but safety check
  if (limits.pushesPerTenMinutes === 0) {
    return {
      allowed: false,
      bypassed: false,
      reason: "Tier does not support live watching",
      currentTenMinCount: 0,
      currentPeriodCount: 0,
      limits,
    };
  }
  
  // Count pushes in last 10 minutes for this game
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  
  const tenMinResult = await db.prepare(`
    SELECT COUNT(*) as count FROM push_delivery_log
    WHERE user_id = ? AND game_id = ? AND data_scope = ? AND sent_at > ?
  `).bind(userId, gameId, dataScope, tenMinutesAgo).first() as { count: number } | null;
  
  const tenMinCount = tenMinResult?.count || 0;
  
  // Check 10-minute cap
  if (tenMinCount >= limits.pushesPerTenMinutes) {
    await logCapSuppression(db, userId, gameId, category, "ten_minute_cap", 
      `${tenMinCount}/${limits.pushesPerTenMinutes} in last 10 min`, dataScope);
    return {
      allowed: false,
      bypassed: false,
      reason: `10-minute cap reached (${tenMinCount}/${limits.pushesPerTenMinutes})`,
      currentTenMinCount: tenMinCount,
      currentPeriodCount: 0,
      limits,
    };
  }
  
  // Count pushes in current period for this game (if period is known)
  let periodCount = 0;
  if (currentPeriod) {
    const periodResult = await db.prepare(`
      SELECT COUNT(*) as count FROM push_delivery_log
      WHERE user_id = ? AND game_id = ? AND data_scope = ? AND period = ?
    `).bind(userId, gameId, dataScope, currentPeriod).first() as { count: number } | null;
    
    periodCount = periodResult?.count || 0;
    
    // Check period cap
    if (periodCount >= limits.pushesPerPeriod) {
      await logCapSuppression(db, userId, gameId, category, "period_cap",
        `${periodCount}/${limits.pushesPerPeriod} in ${currentPeriod}`, dataScope);
      return {
        allowed: false,
        bypassed: false,
        reason: `Period cap reached (${periodCount}/${limits.pushesPerPeriod} in ${currentPeriod})`,
        currentTenMinCount: tenMinCount,
        currentPeriodCount: periodCount,
        limits,
      };
    }
  }
  
  return {
    allowed: true,
    bypassed: false,
    currentTenMinCount: tenMinCount,
    currentPeriodCount: periodCount,
    limits,
  };
}

/**
 * Determine if an alert should bypass caps (critical events)
 */
function shouldBypassCap(
  category: string,
  metadata?: Record<string, unknown>
): boolean {
  // Check category
  if (CAP_BYPASS_CATEGORIES.includes(category)) {
    return true;
  }
  
  // Check metadata flags
  if (metadata?.isGameWinner || metadata?.isFinalScore || metadata?.isOvertimeStart) {
    return true;
  }
  
  // Check for extreme line movement
  if (category === "line_movement" && metadata) {
    const change = Math.abs((metadata.changeAmount as number) || 0);
    const marketType = metadata.marketType as string;
    
    if (marketType === "SPREAD" && change >= EXTREME_THRESHOLDS.spread) {
      return true;
    }
    if (marketType === "TOTAL" && change >= EXTREME_THRESHOLDS.total) {
      return true;
    }
    if (marketType === "MONEYLINE" && change >= EXTREME_THRESHOLDS.moneyline) {
      return true;
    }
  }
  
  return false;
}

/**
 * Log cap suppression for analytics
 */
async function logCapSuppression(
  db: D1Database,
  userId: string,
  gameId: string,
  category: string,
  capType: "ten_minute_cap" | "period_cap",
  details: string,
  dataScope: DataScope
): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO push_suppression_log (
        user_id, alert_id, game_id, category, reason, details, data_scope, suppressed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      userId,
      `cap_${gameId}_${Date.now()}`,
      gameId,
      category,
      capType,
      details,
      dataScope
    ).run();
    
    console.log(`🚫 CAP [${userId}/${gameId}]: ${capType} - ${details}`);
  } catch (err) {
    console.error("Error logging cap suppression:", err);
  }
}

/**
 * Record a push with period info for cap tracking
 */
export async function recordPushWithPeriod(
  db: D1Database,
  userId: string,
  alertId: string,
  gameId: string,
  category: string,
  period: string | undefined,
  dataScope: DataScope
): Promise<void> {
  await db.prepare(`
    INSERT INTO push_delivery_log (
      user_id, alert_id, game_id, category, period, data_scope, sent_at
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    userId,
    alertId,
    gameId,
    category,
    period || null,
    dataScope
  ).run();
}

/**
 * Get cap statistics for a user+game (for debugging/monitoring)
 */
export async function getGameCapStats(
  db: D1Database,
  userId: string,
  gameId: string,
  tier: string,
  dataScope: DataScope = "PROD"
): Promise<{
  tenMinuteCount: number;
  periodCounts: Record<string, number>;
  suppressedCount: number;
  limits: GameCapConfig;
}> {
  const limits = TIER_GAME_CAPS[tier] || TIER_GAME_CAPS.free;
  
  // Count in last 10 minutes
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const tenMinResult = await db.prepare(`
    SELECT COUNT(*) as count FROM push_delivery_log
    WHERE user_id = ? AND game_id = ? AND data_scope = ? AND sent_at > ?
  `).bind(userId, gameId, dataScope, tenMinutesAgo).first() as { count: number } | null;
  
  // Count per period
  const periodResults = await db.prepare(`
    SELECT period, COUNT(*) as count FROM push_delivery_log
    WHERE user_id = ? AND game_id = ? AND data_scope = ? AND period IS NOT NULL
    GROUP BY period
  `).bind(userId, gameId, dataScope).all() as { results: Array<{ period: string; count: number }> };
  
  const periodCounts: Record<string, number> = {};
  for (const row of periodResults.results || []) {
    periodCounts[row.period] = row.count;
  }
  
  // Count suppressed
  const suppressedResult = await db.prepare(`
    SELECT COUNT(*) as count FROM push_suppression_log
    WHERE user_id = ? AND game_id = ? AND data_scope = ? AND reason IN ('ten_minute_cap', 'period_cap')
  `).bind(userId, gameId, dataScope).first() as { count: number } | null;
  
  return {
    tenMinuteCount: tenMinResult?.count || 0,
    periodCounts,
    suppressedCount: suppressedResult?.count || 0,
    limits,
  };
}

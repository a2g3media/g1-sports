/**
 * Live Game Watcher Integration Layer
 * 
 * Connects the live game watcher service to Scout Live Watch alert triggers.
 * Detects scoring events, period breaks, and dominant performances from
 * game state changes and triggers appropriate alerts.
 */

import type { WatchedGame, GameStateSnapshot } from "./liveGameWatcher";
import type { ScoringEvent } from "./alertTriggers/scoringEventTrigger";
import type { PeriodBreakSummary } from "./alertTriggers/periodBreakSummaryTrigger";
import type { DominantPerformance } from "./alertTriggers/dominantPerformanceTrigger";
import { triggerScoringEventAlerts } from "./alertTriggers/scoringEventTrigger";
import { triggerPeriodBreakAlerts } from "./alertTriggers/periodBreakSummaryTrigger";
import { triggerDominantPerformanceAlerts } from "./alertTriggers/dominantPerformanceTrigger";
import { sendScoutLiveWatchPushNotifications } from "./scoutLiveWatchPushService";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;
export type DataScope = "DEMO" | "PROD";

// ============================================================================
// Event Detection from Game State Changes
// ============================================================================

/**
 * Detect scoring events from game state changes
 */
export function detectScoringEvent(
  current: WatchedGame,
  previous: GameStateSnapshot | undefined
): ScoringEvent | null {
  // No previous state = can't detect change
  if (!previous) return null;
  
  // No score change = no scoring event
  const homeScoreChange = (current.homeScore || 0) - (previous.homeScore || 0);
  const awayScoreChange = (current.awayScore || 0) - (previous.awayScore || 0);
  
  if (homeScoreChange === 0 && awayScoreChange === 0) {
    return null;
  }
  
  // Determine which team scored
  const scoringTeam = homeScoreChange > 0 ? current.homeTeam : current.awayTeam;
  const pointsScored = Math.max(homeScoreChange, awayScoreChange);
  
  // Map points to event type based on sport
  let eventType: ScoringEvent["eventType"] = "GENERIC_SCORE";
  const sport = current.sport.toLowerCase();
  
  if (sport.includes('nfl') || sport.includes('football')) {
    if (pointsScored === 6) eventType = "TOUCHDOWN";
    else if (pointsScored === 3) eventType = "FIELD_GOAL";
    else if (pointsScored === 2) eventType = "SAFETY";
    else if (pointsScored === 1) eventType = "EXTRA_POINT";
  } else if (sport.includes('nba') || sport.includes('basketball')) {
    if (pointsScored === 3) eventType = "THREE_POINTER";
    else if (pointsScored === 2) eventType = "TWO_POINTER";
    else if (pointsScored === 1) eventType = "FREE_THROW";
  } else if (sport.includes('mlb') || sport.includes('baseball')) {
    eventType = pointsScored >= 2 ? "HOME_RUN" : "RUN_SCORED";
  } else if (sport.includes('nhl') || sport.includes('hockey')) {
    eventType = "GOAL";
  } else if (sport.includes('soccer') || sport.includes('mls')) {
    eventType = "SOCCER_GOAL";
  }
  
  return {
    gameId: current.gameId,
    sport: current.sport,
    homeTeam: current.homeTeam,
    awayTeam: current.awayTeam,
    scoringTeam,
    eventType,
    homeScore: current.homeScore || 0,
    awayScore: current.awayScore || 0,
    previousHomeScore: previous.homeScore || 0,
    previousAwayScore: previous.awayScore || 0,
    period: current.period || "Unknown",
    detectedAt: new Date().toISOString(),
  };
}

/**
 * Detect period break from game state changes
 */
export function detectPeriodBreak(
  current: WatchedGame,
  previous: GameStateSnapshot | undefined
): PeriodBreakSummary | null {
  if (!previous) return null;
  
  // Period break detection based on state transition
  const previousState = previous.state.toLowerCase();
  const currentState = current.currentState.toLowerCase();
  
  // Detect end of period: in_progress -> halftime/end_period/final
  const isPeriodEnd = 
    previousState === "in_progress" && 
    (currentState === "halftime" || currentState === "end_period" || currentState === "final");
  
  if (!isPeriodEnd) return null;
  
  // Build period name from context
  let period = current.period || "Unknown";
  
  // For states without explicit period, infer from state
  if (currentState === "halftime") {
    period = "1st Half";
  } else if (currentState === "final") {
    period = "Game";
  }
  
  return {
    gameId: current.gameId,
    sport: current.sport,
    homeTeam: current.homeTeam,
    awayTeam: current.awayTeam,
    period,
    homeScore: current.homeScore || 0,
    awayScore: current.awayScore || 0,
    stats: {}, // Stats would come from external API in real implementation
    detectedAt: new Date().toISOString(),
  };
}

/**
 * Detect dominant performance from game state
 * 
 * Note: This requires detailed game stats which aren't available in basic
 * game state. In production, this would query an external stats API.
 * For now, we return null and this can be enhanced when stats are available.
 */
export function detectDominantPerformance(
  _current: WatchedGame,
  _previous: GameStateSnapshot | undefined
): DominantPerformance | null {
  // Dominant performance detection requires detailed player/team stats
  // which aren't available in basic game state changes.
  // This would be implemented by:
  // 1. Fetching detailed stats from external API
  // 2. Analyzing stats against thresholds
  // 3. Creating performance objects when thresholds are met
  
  // For now, return null. This can be enhanced when we have stats API access.
  return null;
}

// ============================================================================
// Alert Processing Functions
// ============================================================================

/**
 * Process a scoring event and trigger alerts
 */
export async function processScoringEvent(
  db: D1Database,
  event: ScoringEvent,
  dataScope: DataScope
): Promise<{ alertsCreated: number; userIds: string[]; pushSent: number }> {
  try {
    const result = await triggerScoringEventAlerts(db, event, dataScope);
    
    // Send push notifications for the created alerts
    let pushSent = 0;
    if (result.alertsCreated > 0) {
      // Get alert IDs that were just created
      const alertsResult = await db.prepare(`
        SELECT id FROM scout_alerts
        WHERE game_id = ? AND data_scope = ?
        AND source_type = 'LIVE_SCORES'
        AND created_at > datetime('now', '-1 minute')
        ORDER BY created_at DESC
        LIMIT ?
      `).bind(event.gameId, dataScope, result.alertsCreated).all();
      
      const alertIds = ((alertsResult.results || []) as { id: number }[]).map(a => a.id);
      
      if (alertIds.length > 0) {
        const pushResult = await sendScoutLiveWatchPushNotifications(db, alertIds, dataScope);
        pushSent = pushResult.sent;
      }
    }
    
    // Log the processing
    await db.prepare(`
      INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
      VALUES ('scoring_event_alerts_processed', 'alert_trigger', ?, ?)
    `).bind(
      JSON.stringify({
        gameId: event.gameId,
        eventType: event.eventType,
        scoringTeam: event.scoringTeam,
        alertsCreated: result.alertsCreated,
        pushSent,
      }),
      dataScope
    ).run();
    
    return {
      alertsCreated: result.alertsCreated,
      userIds: result.userIds,
      pushSent,
    };
  } catch (error) {
    console.error("Error processing scoring event alerts:", error);
    return { alertsCreated: 0, userIds: [], pushSent: 0 };
  }
}

/**
 * Process a period break and trigger alerts
 */
export async function processPeriodBreak(
  db: D1Database,
  summary: PeriodBreakSummary,
  dataScope: DataScope
): Promise<{ alertsCreated: number; userIds: string[]; pushSent: number }> {
  try {
    const result = await triggerPeriodBreakAlerts(db, summary, dataScope);
    
    // Send push notifications for the created alerts
    let pushSent = 0;
    if (result.alertsCreated > 0) {
      const alertsResult = await db.prepare(`
        SELECT id FROM scout_alerts
        WHERE game_id = ? AND data_scope = ?
        AND source_type = 'LIVE_SCORES'
        AND created_at > datetime('now', '-1 minute')
        ORDER BY created_at DESC
        LIMIT ?
      `).bind(summary.gameId, dataScope, result.alertsCreated).all();
      
      const alertIds = ((alertsResult.results || []) as { id: number }[]).map(a => a.id);
      
      if (alertIds.length > 0) {
        const pushResult = await sendScoutLiveWatchPushNotifications(db, alertIds, dataScope);
        pushSent = pushResult.sent;
      }
    }
    
    // Log the processing
    await db.prepare(`
      INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
      VALUES ('period_break_alerts_processed', 'alert_trigger', ?, ?)
    `).bind(
      JSON.stringify({
        gameId: summary.gameId,
        period: summary.period,
        alertsCreated: result.alertsCreated,
        pushSent,
      }),
      dataScope
    ).run();
    
    return {
      alertsCreated: result.alertsCreated,
      userIds: result.userIds,
      pushSent,
    };
  } catch (error) {
    console.error("Error processing period break alerts:", error);
    return { alertsCreated: 0, userIds: [], pushSent: 0 };
  }
}

/**
 * Process a dominant performance and trigger alerts
 */
export async function processDominantPerformance(
  db: D1Database,
  performance: DominantPerformance,
  dataScope: DataScope
): Promise<{ alertsCreated: number; userIds: string[]; pushSent: number }> {
  try {
    const result = await triggerDominantPerformanceAlerts(db, performance, dataScope);
    
    // Send push notifications for the created alerts
    let pushSent = 0;
    if (result.alertsCreated > 0) {
      const alertsResult = await db.prepare(`
        SELECT id FROM scout_alerts
        WHERE game_id = ? AND data_scope = ?
        AND source_type = 'LIVE_SCORES'
        AND created_at > datetime('now', '-1 minute')
        ORDER BY created_at DESC
        LIMIT ?
      `).bind(performance.gameId, dataScope, result.alertsCreated).all();
      
      const alertIds = ((alertsResult.results || []) as { id: number }[]).map(a => a.id);
      
      if (alertIds.length > 0) {
        const pushResult = await sendScoutLiveWatchPushNotifications(db, alertIds, dataScope);
        pushSent = pushResult.sent;
      }
    }
    
    // Log the processing
    await db.prepare(`
      INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
      VALUES ('dominant_performance_alerts_processed', 'alert_trigger', ?, ?)
    `).bind(
      JSON.stringify({
        gameId: performance.gameId,
        performanceType: performance.performanceType,
        alertsCreated: result.alertsCreated,
        pushSent,
      }),
      dataScope
    ).run();
    
    return {
      alertsCreated: result.alertsCreated,
      userIds: result.userIds,
      pushSent,
    };
  } catch (error) {
    console.error("Error processing dominant performance alerts:", error);
    return { alertsCreated: 0, userIds: [], pushSent: 0 };
  }
}

// ============================================================================
// Main Integration Function
// ============================================================================

export interface ProcessGameUpdateResult {
  scoringEvents: number;
  periodBreaks: number;
  dominantPerformances: number;
  totalAlerts: number;
}

/**
 * Process game updates and trigger all relevant Scout Live Watch alerts
 * 
 * This is the main integration point called by the live game watcher
 * after detecting changes in a game's state.
 */
export async function processGameUpdatesForAlerts(
  db: D1Database,
  current: WatchedGame,
  previous: GameStateSnapshot | undefined,
  dataScope: DataScope
): Promise<ProcessGameUpdateResult> {
  const result: ProcessGameUpdateResult = {
    scoringEvents: 0,
    periodBreaks: 0,
    dominantPerformances: 0,
    totalAlerts: 0,
  };
  
  try {
    // Detect and process scoring events
    const scoringEvent = detectScoringEvent(current, previous);
    if (scoringEvent) {
      const scoringResult = await processScoringEvent(db, scoringEvent, dataScope);
      result.scoringEvents = scoringResult.alertsCreated;
      result.totalAlerts += scoringResult.alertsCreated;
    }
    
    // Detect and process period breaks
    const periodBreak = detectPeriodBreak(current, previous);
    if (periodBreak) {
      const periodResult = await processPeriodBreak(db, periodBreak, dataScope);
      result.periodBreaks = periodResult.alertsCreated;
      result.totalAlerts += periodResult.alertsCreated;
    }
    
    // Detect and process dominant performances
    const dominantPerf = detectDominantPerformance(current, previous);
    if (dominantPerf) {
      const perfResult = await processDominantPerformance(db, dominantPerf, dataScope);
      result.dominantPerformances = perfResult.alertsCreated;
      result.totalAlerts += perfResult.alertsCreated;
    }
    
  } catch (error) {
    console.error("Error processing game updates for alerts:", error);
  }
  
  return result;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a user has Scout Live Watch enabled
 */
export async function userHasScoutLiveWatch(
  db: D1Database,
  userId: string,
  dataScope: DataScope
): Promise<boolean> {
  try {
    // Check if user has a live watch preference record with enabled = true
    const result = await db.prepare(`
      SELECT enabled FROM scout_live_watch_preferences
      WHERE user_id = ? AND data_scope = ? AND enabled = 1
      LIMIT 1
    `).bind(userId, dataScope).first();
    
    return result !== null;
  } catch (error) {
    console.error("Error checking Scout Live Watch status:", error);
    return false;
  }
}

/**
 * Get Scout Live Watch alert statistics for a game
 */
export async function getGameAlertStats(
  db: D1Database,
  gameId: string,
  dataScope: DataScope
): Promise<{
  scoringEvents: number;
  periodBreaks: number;
  dominantPerformances: number;
  totalAlerts: number;
}> {
  try {
    const result = await db.prepare(`
      SELECT 
        source_type,
        COUNT(*) as count
      FROM scout_alerts
      WHERE game_id = ? AND data_scope = ?
      GROUP BY source_type
    `).bind(gameId, dataScope).all();
    
    const stats = {
      scoringEvents: 0,
      periodBreaks: 0,
      dominantPerformances: 0,
      totalAlerts: 0,
    };
    
    for (const row of (result.results || []) as { source_type: string; count: number }[]) {
      // Note: We're using LIVE_SCORES as the source_type for all these alerts
      // In the future, we could add more specific source types
      stats.totalAlerts += row.count;
    }
    
    return stats;
  } catch (error) {
    console.error("Error getting game alert stats:", error);
    return {
      scoringEvents: 0,
      periodBreaks: 0,
      dominantPerformances: 0,
      totalAlerts: 0,
    };
  }
}

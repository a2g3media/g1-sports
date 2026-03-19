/**
 * Alert Delivery Service
 * 
 * Coordinates the alert trigger engines and delivers alerts to users.
 * This service acts as the bridge between data changes (line movements, injuries, etc.)
 * and user notifications.
 */

import type {
  LineMovement,
  InjuryUpdate,
  GameStateChange,
  ScheduleChange,
} from "./alertTriggers";
import type { WeatherConditions } from "./alertTriggers/weatherTrigger";

import {
  triggerLineMovementAlerts,
  triggerLineMovementAlertsBatch,
  triggerInjuryAlerts,
  triggerInjuryAlertsBatch,
  triggerWeatherAlerts,
  triggerGameStateAlerts,
  triggerLockReminderAlerts,
  triggerScheduleChangeAlerts,
} from "./alertTriggers";

import type { ScoringEvent } from "./alertTriggers/scoringEventTrigger";
import type { PeriodBreakSummary } from "./alertTriggers/periodBreakSummaryTrigger";
import type { DominantPerformance } from "./alertTriggers/dominantPerformanceTrigger";
import { triggerScoringEventAlerts } from "./alertTriggers/scoringEventTrigger";
import { triggerPeriodBreakAlerts } from "./alertTriggers/periodBreakSummaryTrigger";
import { triggerDominantPerformanceAlerts } from "./alertTriggers/dominantPerformanceTrigger";

import {
  flushAllBundles,
  cleanupExpiredBundles,
  getBundleStats,
} from "./alertBundlingService";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

export type DataScope = "DEMO" | "PROD";

// ============================================================================
// Alert Delivery Orchestration
// ============================================================================

/**
 * Process a line movement and trigger alerts for affected users
 * 
 * NOTE: Alerts created by this function are eligible for bundling.
 * The bundling logic is handled in the alert creation layer (scout_alerts table triggers).
 * Line movements are bundleable - they'll be grouped with other alerts from the same game
 * within a 60-90 second window, unless a game-winner or critical alert flushes the bundle.
 */
export async function processLineMovement(
  db: D1Database,
  movement: LineMovement,
  dataScope: DataScope = "PROD"
) {
  try {
    const result = await triggerLineMovementAlerts(db, movement, dataScope);
    
    // Log the processing
    await db.prepare(`
      INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
      VALUES ('line_movement_alerts_processed', 'alert_trigger', ?, ?)
    `).bind(
      JSON.stringify({
        gameId: movement.gameId,
        alertsCreated: result.alertsCreated,
        usersNotified: result.userIds.length,
        marketType: result.details.marketType,
        change: result.details.change,
      }),
      dataScope
    ).run();
    
    return result;
  } catch (error) {
    console.error("Error processing line movement alerts:", error);
    throw error;
  }
}

/**
 * Process multiple line movements in batch
 */
export async function processLineMovementsBatch(
  db: D1Database,
  movements: LineMovement[],
  dataScope: DataScope = "PROD"
) {
  try {
    const result = await triggerLineMovementAlertsBatch(db, movements, dataScope);
    
    await db.prepare(`
      INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
      VALUES ('line_movement_batch_processed', 'alert_trigger', ?, ?)
    `).bind(
      JSON.stringify({
        movementsProcessed: movements.length,
        alertsCreated: result.alertsCreated,
        processed: result.processed,
      }),
      dataScope
    ).run();
    
    return result;
  } catch (error) {
    console.error("Error processing line movements batch:", error);
    throw error;
  }
}

/**
 * Process an injury update and trigger alerts
 * 
 * NOTE: Critical injuries (starters ruled out close to game time) are marked
 * with CRITICAL severity and will bypass bundling at the alert delivery layer.
 * Regular injury updates are bundleable.
 */
export async function processInjuryUpdate(
  db: D1Database,
  update: InjuryUpdate,
  dataScope: DataScope = "PROD"
) {
  try {
    const result = await triggerInjuryAlerts(db, update, dataScope);
    
    await db.prepare(`
      INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
      VALUES ('injury_alerts_processed', 'alert_trigger', ?, ?)
    `).bind(
      JSON.stringify({
        playerName: update.playerName,
        teamKey: update.teamKey,
        alertsCreated: result.alertsCreated,
        severity: result.severity,
        impactRating: update.impactRating,
      }),
      dataScope
    ).run();
    
    return result;
  } catch (error) {
    console.error("Error processing injury alerts:", error);
    throw error;
  }
}

/**
 * Process multiple injury updates in batch
 */
export async function processInjuryUpdatesBatch(
  db: D1Database,
  updates: InjuryUpdate[],
  dataScope: DataScope = "PROD"
) {
  try {
    const result = await triggerInjuryAlertsBatch(db, updates, dataScope);
    
    await db.prepare(`
      INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
      VALUES ('injury_batch_processed', 'alert_trigger', ?, ?)
    `).bind(
      JSON.stringify({
        updatesProcessed: updates.length,
        alertsCreated: result.alertsCreated,
        processed: result.processed,
      }),
      dataScope
    ).run();
    
    return result;
  } catch (error) {
    console.error("Error processing injury updates batch:", error);
    throw error;
  }
}

/**
 * Process weather conditions and trigger alerts
 */
export async function processWeatherConditions(
  db: D1Database,
  conditions: WeatherConditions,
  dataScope: DataScope = "PROD"
) {
  try {
    const result = await triggerWeatherAlerts(db, conditions, dataScope);
    
    await db.prepare(`
      INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
      VALUES ('weather_alerts_processed', 'alert_trigger', ?, ?)
    `).bind(
      JSON.stringify({
        gameId: conditions.gameId,
        alertsCreated: result.alertsCreated,
      }),
      dataScope
    ).run();
    
    return result;
  } catch (error) {
    console.error("Error processing weather alerts:", error);
    throw error;
  }
}

/**
 * Process a game state change and trigger alerts
 */
export async function processGameStateChange(
  db: D1Database,
  change: GameStateChange,
  dataScope: DataScope = "PROD"
) {
  try {
    const result = await triggerGameStateAlerts(db, change, dataScope);
    
    await db.prepare(`
      INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
      VALUES ('game_state_alerts_processed', 'alert_trigger', ?, ?)
    `).bind(
      JSON.stringify({
        gameId: change.gameId,
        newState: change.currentState,
        alertsCreated: result.alertsCreated,
      }),
      dataScope
    ).run();
    
    return result;
  } catch (error) {
    console.error("Error processing game state alerts:", error);
    throw error;
  }
}

/**
 * Process lock reminder alerts for upcoming deadlines
 */
export async function processLockReminders(
  db: D1Database,
  dataScope: DataScope = "PROD",
  hoursBeforeLock: number = 1
) {
  try {
    const result = await triggerLockReminderAlerts(
      db,
      1, // poolId - in real implementation, loop through active pools
      "Pool Name", // poolName
      new Date(Date.now() + hoursBeforeLock * 60 * 60 * 1000).toISOString(),
      1, // gameCount
      dataScope
    );
    
    await db.prepare(`
      INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
      VALUES ('lock_reminders_processed', 'alert_trigger', ?, ?)
    `).bind(
      JSON.stringify({
        hoursBeforeLock,
        alertsCreated: result.alertsCreated,
        minutesUntilLock: result.minutesUntilLock,
      }),
      dataScope
    ).run();
    
    return result;
  } catch (error) {
    console.error("Error processing lock reminders:", error);
    throw error;
  }
}

/**
 * Process a schedule change and trigger alerts
 */
export async function processScheduleChange(
  db: D1Database,
  change: ScheduleChange,
  dataScope: DataScope = "PROD"
) {
  try {
    const result = await triggerScheduleChangeAlerts(db, change, dataScope);
    
    await db.prepare(`
      INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
      VALUES ('schedule_change_processed', 'alert_trigger', ?, ?)
    `).bind(
      JSON.stringify({
        gameId: change.gameId,
        changeType: change.changeType,
        alertsCreated: result.alertsCreated,
      }),
      dataScope
    ).run();
    
    return result;
  } catch (error) {
    console.error("Error processing schedule change:", error);
    throw error;
  }
}

// ============================================================================
// Scout Live Watch Alert Processing
// ============================================================================

/**
 * Process a scoring event and trigger Scout Live Watch alerts
 * 
 * NOTE: Scoring events are bundleable by default, but game-winning scores
 * are marked as CRITICAL severity and will bypass bundling, flushing any
 * pending bundles for that game.
 */
export async function processScoringEvent(
  db: D1Database,
  event: ScoringEvent,
  dataScope: DataScope = "PROD"
) {
  try {
    const result = await triggerScoringEventAlerts(db, event, dataScope);
    
    await db.prepare(`
      INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
      VALUES ('scoring_event_processed', 'alert_trigger', ?, ?)
    `).bind(
      JSON.stringify({
        gameId: event.gameId,
        eventType: event.eventType,
        scoringTeam: event.scoringTeam,
        alertsCreated: result.alertsCreated,
        usersNotified: result.userIds.length,
      }),
      dataScope
    ).run();
    
    return result;
  } catch (error) {
    console.error("Error processing scoring event:", error);
    throw error;
  }
}

/**
 * Process a period break and trigger Scout Live Watch alerts
 * 
 * NOTE: Period breaks are marked with category "period_break" which bypasses
 * bundling. They represent natural transition points and will flush any pending
 * bundles for that game before being sent.
 */
export async function processPeriodBreak(
  db: D1Database,
  summary: PeriodBreakSummary,
  dataScope: DataScope = "PROD"
) {
  try {
    const result = await triggerPeriodBreakAlerts(db, summary, dataScope);
    
    await db.prepare(`
      INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
      VALUES ('period_break_processed', 'alert_trigger', ?, ?)
    `).bind(
      JSON.stringify({
        gameId: summary.gameId,
        period: summary.period,
        alertsCreated: result.alertsCreated,
        usersNotified: result.userIds.length,
      }),
      dataScope
    ).run();
    
    return result;
  } catch (error) {
    console.error("Error processing period break:", error);
    throw error;
  }
}

/**
 * Process a dominant performance and trigger Scout Live Watch alerts
 * 
 * NOTE: Dominant performances are marked with category "dominant_performance"
 * which bypasses bundling. These are significant moments that warrant immediate
 * delivery and will flush any pending bundles for that game.
 */
export async function processDominantPerformance(
  db: D1Database,
  performance: DominantPerformance,
  dataScope: DataScope = "PROD"
) {
  try {
    const result = await triggerDominantPerformanceAlerts(db, performance, dataScope);
    
    await db.prepare(`
      INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
      VALUES ('dominant_performance_processed', 'alert_trigger', ?, ?)
    `).bind(
      JSON.stringify({
        gameId: performance.gameId,
        performanceType: performance.performanceType,
        alertsCreated: result.alertsCreated,
        usersNotified: result.userIds.length,
      }),
      dataScope
    ).run();
    
    return result;
  } catch (error) {
    console.error("Error processing dominant performance:", error);
    throw error;
  }
}

// ============================================================================
// Alert Cleanup & Maintenance
// ============================================================================

/**
 * Clean up expired and old dismissed alerts
 */
export async function cleanupOldAlerts(
  db: D1Database,
  dataScope: DataScope = "PROD",
  options: {
    expiredOnly?: boolean;
    dismissedDaysOld?: number;
  } = {}
) {
  const { expiredOnly = false, dismissedDaysOld = 7 } = options;
  
  try {
    let deleted = 0;
    
    // Delete expired alerts
    const expiredResult = await db.prepare(`
      DELETE FROM scout_alerts 
      WHERE data_scope = ? AND expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP
    `).bind(dataScope).run();
    deleted += expiredResult.meta.changes || 0;
    
    // Delete old dismissed alerts if requested
    if (!expiredOnly) {
      const dismissedResult = await db.prepare(`
        DELETE FROM scout_alerts 
        WHERE data_scope = ? AND dismissed_at IS NOT NULL 
        AND dismissed_at < datetime('now', '-${dismissedDaysOld} days')
      `).bind(dataScope).run();
      deleted += dismissedResult.meta.changes || 0;
    }
    
    await db.prepare(`
      INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
      VALUES ('alerts_cleaned_up', 'alert_maintenance', ?, ?)
    `).bind(
      JSON.stringify({ deletedCount: deleted, expiredOnly, dismissedDaysOld }),
      dataScope
    ).run();
    
    return { deleted };
  } catch (error) {
    console.error("Error cleaning up alerts:", error);
    throw error;
  }
}

/**
 * Get alert delivery statistics
 */
export async function getAlertStats(
  db: D1Database,
  dataScope: DataScope = "PROD",
  hoursBack: number = 24
) {
  try {
    const stats = await db.prepare(`
      SELECT 
        category,
        severity,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users
      FROM scout_alerts
      WHERE data_scope = ? AND created_at > datetime('now', '-${hoursBack} hours')
      GROUP BY category, severity
    `).bind(dataScope).all();
    
    const totalStats = await db.prepare(`
      SELECT 
        COUNT(*) as total_alerts,
        COUNT(DISTINCT user_id) as total_users,
        SUM(CASE WHEN read_at IS NOT NULL THEN 1 ELSE 0 END) as read_count,
        SUM(CASE WHEN dismissed_at IS NOT NULL THEN 1 ELSE 0 END) as dismissed_count
      FROM scout_alerts
      WHERE data_scope = ? AND created_at > datetime('now', '-${hoursBack} hours')
    `).bind(dataScope).first();
    
    return {
      timeframe: `${hoursBack} hours`,
      byCategory: stats.results || [],
      total: {
        alerts: totalStats?.total_alerts || 0,
        users: totalStats?.total_users || 0,
        read: totalStats?.read_count || 0,
        dismissed: totalStats?.dismissed_count || 0,
      },
    };
  } catch (error) {
    console.error("Error getting alert stats:", error);
    throw error;
  }
}

// ============================================================================
// Batch Processing Helpers
// ============================================================================

/**
 * Process all pending alerts in a batch job
 * This would typically be called by a scheduled worker/cron
 */
export async function processPendingAlertJobs(
  db: D1Database,
  dataScope: DataScope = "PROD"
) {
  const results = {
    lineMovements: 0,
    injuries: 0,
    weather: 0,
    gameStates: 0,
    lockReminders: 0,
    scheduleChanges: 0,
  };
  
  try {
    // This is a placeholder for the actual implementation
    // In a real system, you would:
    // 1. Fetch pending data changes from external APIs
    // 2. Compare with stored data to detect changes
    // 3. Call the appropriate processing functions
    
    // For now, just log that the job ran
    await db.prepare(`
      INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
      VALUES ('alert_batch_job_completed', 'alert_delivery', ?, ?)
    `).bind(
      JSON.stringify(results),
      dataScope
    ).run();
    
    return results;
  } catch (error) {
    console.error("Error processing pending alert jobs:", error);
    throw error;
  }
}

// ============================================================================
// Alert Bundling Management
// ============================================================================

/**
 * Get current bundle statistics
 */
export function getActiveBundleStats() {
  return getBundleStats();
}

/**
 * Flush all active bundles (for cleanup/shutdown)
 */
export async function flushActiveBundles(
  db: D1Database,
  dataScope: DataScope = "PROD"
) {
  const flushed = await flushAllBundles(db, dataScope);
  
  await db.prepare(`
    INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
    VALUES ('bundles_flushed', 'alert_bundling', ?, ?)
  `).bind(
    JSON.stringify({ bundlesFlushed: flushed }),
    dataScope
  ).run();
  
  return { flushed };
}

/**
 * Clean up expired bundles (maintenance job)
 */
export async function cleanupBundles(
  db: D1Database,
  dataScope: DataScope = "PROD"
) {
  const cleaned = await cleanupExpiredBundles(db, dataScope);
  
  if (cleaned > 0) {
    await db.prepare(`
      INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
      VALUES ('expired_bundles_cleaned', 'alert_bundling', ?, ?)
    `).bind(
      JSON.stringify({ bundlesCleaned: cleaned }),
      dataScope
    ).run();
  }
  
  return { cleaned };
}

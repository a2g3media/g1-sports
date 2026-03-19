/**
 * Internal Scheduler for Sports Data Refresh
 * 
 * Runs entirely within Mocha without external cron triggers.
 * Uses persistent D1 database locks to prevent parallel execution.
 * 
 * Schedule:
 * - Master refresh: every 4 hours (full data sync)
 * - Live mini refresh: every 20 minutes (live game odds only)
 */

import { D1Database } from '@cloudflare/workers-types';

// Intervals in milliseconds
const MASTER_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const LIVE_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes

// Lock TTLs in milliseconds
const MASTER_LOCK_TTL_MS = 30 * 60 * 1000; // 30 minutes
const LIVE_LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Lock keys
const MASTER_LOCK_KEY = 'sportsdata_master_lock';
const LIVE_LOCK_KEY = 'sportsdata_live_lock';
const SCHEDULER_KEY = 'sports_data';

export interface SchedulerState {
  isEnabled: boolean;
  lastMasterRunAt: string | null;
  lastLiveRunAt: string | null;
  nextMasterRunAt: string | null;
  nextLiveRunAt: string | null;
  lastMasterResult: string | null;
  lastLiveResult: string | null;
  lastMasterError: string | null;
  lastLiveError: string | null;
  masterGamesInserted: number;
  masterOddsInserted: number;
  masterPropsInserted: number;
  liveOddsInserted: number;
}

// ============================================
// PERSISTENT LOCK MANAGEMENT
// ============================================

async function acquirePersistentLock(
  db: D1Database,
  lockKey: string,
  ttlMs: number,
  holderId: string
): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  
  try {
    // First, clean up any expired locks
    await db.prepare(
      'DELETE FROM scheduler_locks WHERE lock_key = ? AND expires_at < ?'
    ).bind(lockKey, now.toISOString()).run();
    
    // Try to acquire the lock
    const existing = await db.prepare(
      'SELECT * FROM scheduler_locks WHERE lock_key = ?'
    ).bind(lockKey).first();
    
    if (existing) {
      console.log(`[Scheduler] Lock ${lockKey} already held, skipping`);
      return false;
    }
    
    // Insert new lock
    await db.prepare(
      `INSERT INTO scheduler_locks (lock_key, acquired_at, expires_at, holder_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(lockKey, now.toISOString(), expiresAt.toISOString(), holderId, now.toISOString(), now.toISOString()).run();
    
    console.log(`[Scheduler] Acquired lock: ${lockKey} (expires: ${expiresAt.toISOString()})`);
    return true;
  } catch (error) {
    // Unique constraint violation means another worker got it first
    console.log(`[Scheduler] Failed to acquire lock ${lockKey}:`, error);
    return false;
  }
}

async function releasePersistentLock(db: D1Database, lockKey: string): Promise<void> {
  try {
    await db.prepare('DELETE FROM scheduler_locks WHERE lock_key = ?').bind(lockKey).run();
    console.log(`[Scheduler] Released lock: ${lockKey}`);
  } catch (error) {
    console.error(`[Scheduler] Error releasing lock ${lockKey}:`, error);
  }
}

async function isLockActive(db: D1Database, lockKey: string): Promise<boolean> {
  const now = new Date().toISOString();
  const lock = await db.prepare(
    'SELECT * FROM scheduler_locks WHERE lock_key = ? AND expires_at > ?'
  ).bind(lockKey, now).first();
  return !!lock;
}

// ============================================
// SCHEDULER STATE MANAGEMENT
// ============================================

export async function getSchedulerState(db: D1Database): Promise<SchedulerState> {
  const state = await db.prepare(
    'SELECT * FROM scheduler_state WHERE scheduler_key = ?'
  ).bind(SCHEDULER_KEY).first<{
    is_enabled: number;
    last_master_run_at: string | null;
    last_live_run_at: string | null;
    next_master_run_at: string | null;
    next_live_run_at: string | null;
    last_master_result: string | null;
    last_live_result: string | null;
    last_master_error: string | null;
    last_live_error: string | null;
    master_games_inserted: number;
    master_odds_inserted: number;
    master_props_inserted: number;
    live_odds_inserted: number;
  }>();
  
  if (!state) {
    // Default to DISABLED to prevent automatic refresh in dev environments
    // Production should explicitly enable the scheduler via admin panel
    return {
      isEnabled: false,
      lastMasterRunAt: null,
      lastLiveRunAt: null,
      nextMasterRunAt: null,
      nextLiveRunAt: null,
      lastMasterResult: null,
      lastLiveResult: null,
      lastMasterError: null,
      lastLiveError: null,
      masterGamesInserted: 0,
      masterOddsInserted: 0,
      masterPropsInserted: 0,
      liveOddsInserted: 0
    };
  }
  
  return {
    isEnabled: state.is_enabled === 1,
    lastMasterRunAt: state.last_master_run_at,
    lastLiveRunAt: state.last_live_run_at,
    nextMasterRunAt: state.next_master_run_at,
    nextLiveRunAt: state.next_live_run_at,
    lastMasterResult: state.last_master_result,
    lastLiveResult: state.last_live_result,
    lastMasterError: state.last_master_error,
    lastLiveError: state.last_live_error,
    masterGamesInserted: state.master_games_inserted ?? 0,
    masterOddsInserted: state.master_odds_inserted ?? 0,
    masterPropsInserted: state.master_props_inserted ?? 0,
    liveOddsInserted: state.live_odds_inserted ?? 0
  };
}

export async function setSchedulerEnabled(db: D1Database, enabled: boolean): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare(
    'UPDATE scheduler_state SET is_enabled = ?, updated_at = ? WHERE scheduler_key = ?'
  ).bind(enabled ? 1 : 0, now, SCHEDULER_KEY).run();
  console.log(`[Scheduler] Scheduler ${enabled ? 'enabled' : 'disabled'}`);
}

async function updateSchedulerState(
  db: D1Database,
  updates: Partial<{
    lastMasterRunAt: string;
    lastLiveRunAt: string;
    nextMasterRunAt: string;
    nextLiveRunAt: string;
    lastMasterResult: string;
    lastLiveResult: string;
    lastMasterError: string | null;
    lastLiveError: string | null;
    masterGamesInserted: number;
    masterOddsInserted: number;
    masterPropsInserted: number;
    liveOddsInserted: number;
  }>
): Promise<void> {
  const now = new Date().toISOString();
  const setParts: string[] = ['updated_at = ?'];
  const values: (string | number | null)[] = [now];
  
  if (updates.lastMasterRunAt !== undefined) {
    setParts.push('last_master_run_at = ?');
    values.push(updates.lastMasterRunAt);
  }
  if (updates.lastLiveRunAt !== undefined) {
    setParts.push('last_live_run_at = ?');
    values.push(updates.lastLiveRunAt);
  }
  if (updates.nextMasterRunAt !== undefined) {
    setParts.push('next_master_run_at = ?');
    values.push(updates.nextMasterRunAt);
  }
  if (updates.nextLiveRunAt !== undefined) {
    setParts.push('next_live_run_at = ?');
    values.push(updates.nextLiveRunAt);
  }
  if (updates.lastMasterResult !== undefined) {
    setParts.push('last_master_result = ?');
    values.push(updates.lastMasterResult);
  }
  if (updates.lastLiveResult !== undefined) {
    setParts.push('last_live_result = ?');
    values.push(updates.lastLiveResult);
  }
  if (updates.lastMasterError !== undefined) {
    setParts.push('last_master_error = ?');
    values.push(updates.lastMasterError);
  }
  if (updates.lastLiveError !== undefined) {
    setParts.push('last_live_error = ?');
    values.push(updates.lastLiveError);
  }
  if (updates.masterGamesInserted !== undefined) {
    setParts.push('master_games_inserted = ?');
    values.push(updates.masterGamesInserted);
  }
  if (updates.masterOddsInserted !== undefined) {
    setParts.push('master_odds_inserted = ?');
    values.push(updates.masterOddsInserted);
  }
  if (updates.masterPropsInserted !== undefined) {
    setParts.push('master_props_inserted = ?');
    values.push(updates.masterPropsInserted);
  }
  if (updates.liveOddsInserted !== undefined) {
    setParts.push('live_odds_inserted = ?');
    values.push(updates.liveOddsInserted);
  }
  
  values.push(SCHEDULER_KEY);
  
  await db.prepare(
    `UPDATE scheduler_state SET ${setParts.join(', ')} WHERE scheduler_key = ?`
  ).bind(...values).run();
}

// ============================================
// SCHEDULED JOB EXECUTION
// ============================================

export async function runScheduledMasterRefresh(
  db: D1Database,
  apiKey: string,
  theOddsApiKey?: string
): Promise<{ success: boolean; message: string; gamesInserted: number; oddsInserted: number; propsInserted: number }> {
  void apiKey;
  void theOddsApiKey;
  const holderId = `master_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  // Check if scheduler is enabled
  const state = await getSchedulerState(db);
  if (!state.isEnabled) {
    console.log('[Scheduler] Master refresh skipped: scheduler disabled');
    return { success: false, message: 'Scheduler disabled', gamesInserted: 0, oddsInserted: 0, propsInserted: 0 };
  }
  
  // Try to acquire lock
  const lockAcquired = await acquirePersistentLock(db, MASTER_LOCK_KEY, MASTER_LOCK_TTL_MS, holderId);
  if (!lockAcquired) {
    console.log('[Scheduler] Master refresh skipped: lock active');
    return { success: false, message: 'Skipped: lock active', gamesInserted: 0, oddsInserted: 0, propsInserted: 0 };
  }
  
  const startTime = Date.now();
  let gamesInserted = 0;
  let oddsInserted = 0;
  let propsInserted = 0;
  
  try {
    console.log('[Scheduler] Starting scheduled master refresh');
    const now = new Date();
    const nextRun = new Date(now.getTime() + MASTER_INTERVAL_MS);
    
    // Update state to show we're running
    await updateSchedulerState(db, {
      lastMasterRunAt: now.toISOString(),
      nextMasterRunAt: nextRun.toISOString(),
      lastMasterError: null
    });
    
    const durationMs = Date.now() - startTime;
    const resultSummary = `Skipped in ${durationMs}ms: internal scheduler now uses route-level SportsRadar refresh orchestration`;
    
    // Update state with results
    await updateSchedulerState(db, {
      lastMasterResult: resultSummary,
      lastMasterError: null,
      masterGamesInserted: gamesInserted,
      masterOddsInserted: oddsInserted,
      masterPropsInserted: propsInserted
    });
    
    console.log(`[Scheduler] Master refresh completed: ${resultSummary}`);
    return { success: true, message: resultSummary, gamesInserted, oddsInserted, propsInserted };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Scheduler] Master refresh failed:', errorMsg);
    
    // Update state with error - DO NOT wipe database
    await updateSchedulerState(db, {
      lastMasterResult: 'FAILED',
      lastMasterError: errorMsg
    });
    
    return { success: false, message: errorMsg, gamesInserted, oddsInserted, propsInserted };
  } finally {
    await releasePersistentLock(db, MASTER_LOCK_KEY);
  }
}

export async function runScheduledLiveRefresh(
  db: D1Database,
  apiKey: string
): Promise<{ success: boolean; message: string; oddsInserted: number }> {
  void apiKey;
  const holderId = `live_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  // Check if scheduler is enabled
  const state = await getSchedulerState(db);
  if (!state.isEnabled) {
    console.log('[Scheduler] Live refresh skipped: scheduler disabled');
    return { success: false, message: 'Scheduler disabled', oddsInserted: 0 };
  }
  
  // Check if master lock is active (don't run live during master)
  if (await isLockActive(db, MASTER_LOCK_KEY)) {
    console.log('[Scheduler] Live refresh skipped: master refresh in progress');
    return { success: false, message: 'Skipped: master refresh in progress', oddsInserted: 0 };
  }
  
  // Try to acquire lock
  const lockAcquired = await acquirePersistentLock(db, LIVE_LOCK_KEY, LIVE_LOCK_TTL_MS, holderId);
  if (!lockAcquired) {
    console.log('[Scheduler] Live refresh skipped: lock active');
    return { success: false, message: 'Skipped: lock active', oddsInserted: 0 };
  }
  
  const startTime = Date.now();
  let oddsInserted = 0;
  
  try {
    console.log('[Scheduler] Starting scheduled live refresh');
    const now = new Date();
    const nextRun = new Date(now.getTime() + LIVE_INTERVAL_MS);
    
    // Update state to show we're running
    await updateSchedulerState(db, {
      lastLiveRunAt: now.toISOString(),
      nextLiveRunAt: nextRun.toISOString(),
      lastLiveError: null
    });
    
    const durationMs = Date.now() - startTime;
    const resultSummary = `Skipped in ${durationMs}ms: internal scheduler now uses route-level SportsRadar refresh orchestration`;
    
    // Update state with results
    await updateSchedulerState(db, {
      lastLiveResult: resultSummary,
      lastLiveError: null,
      liveOddsInserted: oddsInserted
    });
    
    console.log(`[Scheduler] Live refresh completed: ${resultSummary}`);
    return { success: true, message: resultSummary, oddsInserted };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Scheduler] Live refresh failed:', errorMsg);
    
    // Update state with error - DO NOT wipe database
    await updateSchedulerState(db, {
      lastLiveResult: 'FAILED',
      lastLiveError: errorMsg
    });
    
    return { success: false, message: errorMsg, oddsInserted };
  } finally {
    await releasePersistentLock(db, LIVE_LOCK_KEY);
  }
}

// ============================================
// SCHEDULER CHECK (called on each request)
// ============================================

/**
 * Check if scheduled jobs need to run.
 * This is designed to be called on incoming requests.
 * Returns immediately if no jobs are due.
 */
export async function checkAndRunScheduledJobs(
  db: D1Database,
  apiKey: string | undefined
): Promise<void> {
  void apiKey;
  
  try {
    const state = await getSchedulerState(db);
    
    if (!state.isEnabled) {
      return;
    }
    
    const now = new Date();
    
    // Check if master refresh is due
    if (state.nextMasterRunAt) {
      const nextMaster = new Date(state.nextMasterRunAt);
      if (now >= nextMaster) {
        // Don't await - fire and forget to not block the request
        runScheduledMasterRefresh(db, apiKey).catch(e => 
          console.error('[Scheduler] Background master refresh error:', e)
        );
      }
    } else if (!state.lastMasterRunAt) {
      // Never run before, schedule first run
      const nextRun = new Date(now.getTime() + 60000); // 1 minute from now
      await updateSchedulerState(db, { nextMasterRunAt: nextRun.toISOString() });
    }
    
    // Check if live refresh is due
    if (state.nextLiveRunAt) {
      const nextLive = new Date(state.nextLiveRunAt);
      if (now >= nextLive) {
        // Don't await - fire and forget
        runScheduledLiveRefresh(db, apiKey).catch(e => 
          console.error('[Scheduler] Background live refresh error:', e)
        );
      }
    } else if (state.lastMasterRunAt && !state.lastLiveRunAt) {
      // Master has run but live hasn't, schedule first live run
      const nextRun = new Date(now.getTime() + 120000); // 2 minutes from now
      await updateSchedulerState(db, { nextLiveRunAt: nextRun.toISOString() });
    }
    
  } catch (error) {
    console.error('[Scheduler] Error checking scheduled jobs:', error);
  }
}

// ============================================
// LOCK STATUS (for admin visibility)
// ============================================

export async function getLockStatus(db: D1Database): Promise<{
  masterLock: { active: boolean; expiresAt: string | null; holderId: string | null };
  liveLock: { active: boolean; expiresAt: string | null; holderId: string | null };
}> {
  const now = new Date().toISOString();
  
  const masterLock = await db.prepare(
    'SELECT expires_at, holder_id FROM scheduler_locks WHERE lock_key = ? AND expires_at > ?'
  ).bind(MASTER_LOCK_KEY, now).first<{ expires_at: string; holder_id: string }>();
  
  const liveLock = await db.prepare(
    'SELECT expires_at, holder_id FROM scheduler_locks WHERE lock_key = ? AND expires_at > ?'
  ).bind(LIVE_LOCK_KEY, now).first<{ expires_at: string; holder_id: string }>();
  
  return {
    masterLock: {
      active: !!masterLock,
      expiresAt: masterLock?.expires_at ?? null,
      holderId: masterLock?.holder_id ?? null
    },
    liveLock: {
      active: !!liveLock,
      expiresAt: liveLock?.expires_at ?? null,
      holderId: liveLock?.holder_id ?? null
    }
  };
}

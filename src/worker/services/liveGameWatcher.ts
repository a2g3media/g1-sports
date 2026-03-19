/**
 * Live Game Watcher Service
 * 
 * Background polling service that monitors followed games for state changes
 * and triggers alerts when significant events occur.
 * 
 * Key Features:
 * - Polls for game updates at configurable intervals
 * - Tracks game state history for change detection
 * - Triggers appropriate alerts via the alert delivery service
 * - Provides "Scout is Watching" status for UI indicators
 */

import type { GameState } from "@/shared/types/alerts";
import {
  processGameStateChange,
} from "./alertDeliveryService";
import type { GameStateChange } from "./alertTriggers/gameStateTrigger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

export type DataScope = "DEMO" | "PROD";

// ============================================================================
// Configuration
// ============================================================================

export const WATCHER_CONFIG = {
  // Polling intervals by game state (in seconds)
  pollingIntervals: {
    pregame: 300,        // 5 minutes before game
    live: 30,            // Every 30 seconds during live games
    halftime: 60,        // Every minute during halftime
    delayed: 120,        // Every 2 minutes when delayed
    postgame: 0,         // No polling after final
  },
  
  // How long to keep watching after final (for stat corrections)
  postgameCooldownMinutes: 30,
  
  // Maximum games to poll per batch
  maxGamesPerBatch: 50,
  
  // State freshness threshold (seconds)
  stateFreshnessSeconds: 60,
  
  // Rate limiting
  minSecondsBetweenPolls: 15,
};

// ============================================================================
// Types
// ============================================================================

export interface WatchedGame {
  gameId: string;
  externalId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  startAt: string;
  currentState: GameState;
  homeScore: number | null;
  awayScore: number | null;
  period: string | null;
  lastPolledAt: string | null;
  lastStateChangeAt: string | null;
  watcherCount: number;
}

export interface GameStateSnapshot {
  gameId: string;
  state: GameState;
  homeScore: number | null;
  awayScore: number | null;
  period: string | null;
  timeRemaining: string | null;
  capturedAt: string;
}

export interface WatcherStatus {
  isActive: boolean;
  gamesWatched: number;
  liveGamesCount: number;
  lastPollAt: string | null;
  nextPollAt: string | null;
  healthStatus: "healthy" | "degraded" | "stale";
}

export interface PollResult {
  gamesPolled: number;
  stateChangesDetected: number;
  alertsTriggered: number;
  errors: string[];
  duration: number;
}

// ============================================================================
// State Tracking
// ============================================================================

// In-memory cache for game states (used for change detection)
const gameStateCache = new Map<string, GameStateSnapshot>();

/**
 * Get cached state for a game
 */
export function getCachedState(gameId: string): GameStateSnapshot | undefined {
  return gameStateCache.get(gameId);
}

/**
 * Update cached state for a game
 */
export function setCachedState(snapshot: GameStateSnapshot): void {
  gameStateCache.set(snapshot.gameId, snapshot);
}

/**
 * Clear cached state for a game
 */
export function clearCachedState(gameId: string): void {
  gameStateCache.delete(gameId);
}

/**
 * Clear all cached states
 */
export function clearAllCachedStates(): void {
  gameStateCache.clear();
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Get all games that should be watched (have watchers and are active)
 */
export async function getGamesToWatch(
  db: D1Database,
  dataScope: DataScope
): Promise<WatchedGame[]> {
  // Get games that:
  // 1. Are in the game_watchlist for any user
  // 2. Have status that indicates they might need watching
  // 3. Start within reasonable timeframe (or are in progress)
  const result = await db.prepare(`
    SELECT DISTINCT
      e.id as game_id,
      e.external_id,
      e.sport_key as sport,
      e.home_team,
      e.away_team,
      e.start_at,
      e.status as current_state,
      e.home_score,
      e.away_score,
      (SELECT COUNT(*) FROM game_watchlist gw WHERE gw.game_id = CAST(e.id AS TEXT) AND gw.data_scope = ?) as watcher_count
    FROM events e
    WHERE e.status IN ('scheduled', 'pregame', 'in_progress', 'halftime', 'overtime', 'delayed')
    AND e.start_at <= datetime('now', '+6 hours')
    AND EXISTS (
      SELECT 1 FROM game_watchlist gw 
      WHERE gw.game_id = CAST(e.id AS TEXT) 
      AND gw.data_scope = ?
    )
    ORDER BY e.start_at ASC
    LIMIT ?
  `).bind(dataScope, dataScope, WATCHER_CONFIG.maxGamesPerBatch).all();
  
  return ((result.results || []) as Record<string, unknown>[]).map(row => ({
    gameId: String(row.game_id),
    externalId: row.external_id as string,
    sport: row.sport as string,
    homeTeam: row.home_team as string,
    awayTeam: row.away_team as string,
    startAt: row.start_at as string,
    currentState: mapStatusToGameState(row.current_state as string),
    homeScore: row.home_score as number | null,
    awayScore: row.away_score as number | null,
    period: null,
    lastPolledAt: null,
    lastStateChangeAt: null,
    watcherCount: row.watcher_count as number,
  }));
}

/**
 * Map database status to GameState type
 */
function mapStatusToGameState(status: string): GameState {
  const mapping: Record<string, GameState> = {
    scheduled: "SCHEDULED",
    pregame: "PREGAME",
    in_progress: "IN_PROGRESS",
    halftime: "HALFTIME",
    overtime: "OVERTIME",
    end_period: "END_PERIOD",
    final: "FINAL",
    final_ot: "FINAL",
    delayed: "DELAYED",
    postponed: "POSTPONED",
    cancelled: "CANCELLED",
  };
  return mapping[status] || "SCHEDULED";
}

/**
 * Get watcher status for the UI indicator
 */
export async function getWatcherStatus(
  db: D1Database,
  dataScope: DataScope
): Promise<WatcherStatus> {
  // Get count of watched games
  const gamesResult = await db.prepare(`
    SELECT COUNT(DISTINCT gw.game_id) as count
    FROM game_watchlist gw
    INNER JOIN events e ON CAST(e.id AS TEXT) = gw.game_id
    WHERE gw.data_scope = ?
    AND e.status IN ('scheduled', 'pregame', 'in_progress', 'halftime', 'overtime', 'delayed')
    AND e.start_at <= datetime('now', '+6 hours')
  `).bind(dataScope).first() as { count: number } | null;
  
  // Get count of currently live games
  const liveResult = await db.prepare(`
    SELECT COUNT(DISTINCT gw.game_id) as count
    FROM game_watchlist gw
    INNER JOIN events e ON CAST(e.id AS TEXT) = gw.game_id
    WHERE gw.data_scope = ?
    AND e.status IN ('in_progress', 'halftime', 'overtime')
  `).bind(dataScope).first() as { count: number } | null;
  
  // Get last poll time from event log
  const lastPoll = await db.prepare(`
    SELECT created_at FROM event_log
    WHERE event_type = 'game_watcher_poll_completed'
    AND data_scope = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(dataScope).first() as { created_at: string } | null;
  
  const gamesWatched = gamesResult?.count || 0;
  const liveGamesCount = liveResult?.count || 0;
  const lastPollAt = lastPoll?.created_at || null;
  
  // Calculate next poll time based on interval
  let nextPollAt: string | null = null;
  if (lastPollAt && liveGamesCount > 0) {
    const lastPollTime = new Date(lastPollAt).getTime();
    const intervalSeconds = WATCHER_CONFIG.pollingIntervals.live;
    nextPollAt = new Date(lastPollTime + intervalSeconds * 1000).toISOString();
  }
  
  // Determine health status
  let healthStatus: "healthy" | "degraded" | "stale" = "healthy";
  if (lastPollAt && liveGamesCount > 0) {
    const secondsSinceLastPoll = (Date.now() - new Date(lastPollAt).getTime()) / 1000;
    if (secondsSinceLastPoll > WATCHER_CONFIG.stateFreshnessSeconds * 3) {
      healthStatus = "stale";
    } else if (secondsSinceLastPoll > WATCHER_CONFIG.stateFreshnessSeconds * 2) {
      healthStatus = "degraded";
    }
  }
  
  return {
    isActive: gamesWatched > 0,
    gamesWatched,
    liveGamesCount,
    lastPollAt,
    nextPollAt,
    healthStatus,
  };
}

/**
 * Log a game state change to the event log
 */
export async function logStateChange(
  db: D1Database,
  gameId: string,
  previousState: GameState,
  newState: GameState,
  dataScope: DataScope
): Promise<void> {
  await db.prepare(`
    INSERT INTO event_log (
      event_type, entity_type, entity_id, payload_json, data_scope
    ) VALUES ('game_state_change', 'event', ?, ?, ?)
  `).bind(
    gameId,
    JSON.stringify({ previousState, newState, gameId }),
    dataScope
  ).run();
}

// ============================================================================
// State Change Detection
// ============================================================================

/**
 * Detect changes between cached state and current state
 */
export function detectStateChanges(
  cached: GameStateSnapshot | undefined,
  current: WatchedGame
): {
  hasStateChange: boolean;
  hasScoreChange: boolean;
  previousState: GameState;
  currentState: GameState;
  scoreDiff: { home: number; away: number } | null;
} {
  const currentState = current.currentState;
  const previousState = cached?.state || "SCHEDULED";
  
  const hasStateChange = cached ? cached.state !== currentState : false;
  
  let hasScoreChange = false;
  let scoreDiff: { home: number; away: number } | null = null;
  
  if (cached && current.homeScore !== null && current.awayScore !== null) {
    const homeDiff = current.homeScore - (cached.homeScore || 0);
    const awayDiff = current.awayScore - (cached.awayScore || 0);
    
    if (homeDiff !== 0 || awayDiff !== 0) {
      hasScoreChange = true;
      scoreDiff = { home: homeDiff, away: awayDiff };
    }
  }
  
  return {
    hasStateChange,
    hasScoreChange,
    previousState,
    currentState,
    scoreDiff,
  };
}

/**
 * Determine the appropriate polling interval for a game
 */
export function getPollingInterval(state: GameState): number {
  switch (state) {
    case "IN_PROGRESS":
    case "OVERTIME":
      return WATCHER_CONFIG.pollingIntervals.live;
    case "HALFTIME":
    case "END_PERIOD":
      return WATCHER_CONFIG.pollingIntervals.halftime;
    case "DELAYED":
      return WATCHER_CONFIG.pollingIntervals.delayed;
    case "PREGAME":
    case "SCHEDULED":
      return WATCHER_CONFIG.pollingIntervals.pregame;
    default:
      return 0; // No polling for final states
  }
}

// ============================================================================
// Main Polling Logic
// ============================================================================

/**
 * Poll all watched games and process state changes
 * This is the main entry point for the background polling service
 */
export async function pollWatchedGames(
  db: D1Database,
  dataScope: DataScope = "PROD"
): Promise<PollResult> {
  const startTime = Date.now();
  const result: PollResult = {
    gamesPolled: 0,
    stateChangesDetected: 0,
    alertsTriggered: 0,
    errors: [],
    duration: 0,
  };
  
  try {
    // Get games that need watching
    const games = await getGamesToWatch(db, dataScope);
    result.gamesPolled = games.length;
    
    if (games.length === 0) {
      result.duration = Date.now() - startTime;
      return result;
    }
    
    // Process each game
    for (const game of games) {
      try {
        const cached = getCachedState(game.gameId);
        const changes = detectStateChanges(cached, game);
        
        // Update cache with current state
        const newSnapshot: GameStateSnapshot = {
          gameId: game.gameId,
          state: game.currentState,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
          period: game.period,
          timeRemaining: null,
          capturedAt: new Date().toISOString(),
        };
        setCachedState(newSnapshot);
        
        // Process state change if detected
        if (changes.hasStateChange) {
          result.stateChangesDetected++;
          
          // Log to history
          await logStateChange(
            db,
            game.gameId,
            changes.previousState,
            changes.currentState,
            dataScope
          );
          
          // Create GameStateChange for alert processing
          const stateChange: GameStateChange = {
            gameId: game.gameId,
            sport: game.sport,
            homeTeam: game.homeTeam,
            awayTeam: game.awayTeam,
            previousState: changes.previousState,
            currentState: changes.currentState,
            homeScore: game.homeScore || undefined,
            awayScore: game.awayScore || undefined,
            period: game.period || undefined,
            detectedAt: new Date().toISOString(),
          };
          
          // Trigger game state change alerts
          const alertResult = await processGameStateChange(db, stateChange, dataScope);
          result.alertsTriggered += alertResult.alertsCreated;
          
          // Trigger Scout Live Watch alerts (scoring, period breaks, dominant performance)
          const { processGameUpdatesForAlerts } = await import("./liveGameWatcherIntegration");
          const liveWatchResult = await processGameUpdatesForAlerts(
            db,
            game,
            cached,
            dataScope
          );
          result.alertsTriggered += liveWatchResult.totalAlerts;
        }
        
        // Clear from cache if game is complete
        if (game.currentState === "FINAL") {
          // Keep in cache briefly for any late updates
          setTimeout(() => {
            clearCachedState(game.gameId);
          }, WATCHER_CONFIG.postgameCooldownMinutes * 60 * 1000);
        }
        
      } catch (gameError) {
        result.errors.push(`Error processing game ${game.gameId}: ${gameError}`);
      }
    }
    
    // Log the poll completion
    await db.prepare(`
      INSERT INTO event_log (event_type, entity_type, payload_json, data_scope)
      VALUES ('game_watcher_poll_completed', 'game_watcher', ?, ?)
    `).bind(
      JSON.stringify({
        gamesPolled: result.gamesPolled,
        stateChangesDetected: result.stateChangesDetected,
        alertsTriggered: result.alertsTriggered,
        errorCount: result.errors.length,
      }),
      dataScope
    ).run();
    
  } catch (error) {
    result.errors.push(`Poll error: ${error}`);
    console.error("Game watcher poll error:", error);
  }
  
  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Check if a specific game needs polling based on its state and last poll time
 */
export function shouldPollGame(
  state: GameState,
  lastPolledAt: string | null
): boolean {
  const interval = getPollingInterval(state);
  
  // No polling for finished games
  if (interval === 0) {
    return false;
  }
  
  // Always poll if never polled
  if (!lastPolledAt) {
    return true;
  }
  
  const secondsSinceLastPoll = (Date.now() - new Date(lastPolledAt).getTime()) / 1000;
  return secondsSinceLastPoll >= interval;
}

// ============================================================================
// User Watchlist Management
// ============================================================================

/**
 * Get watched games for a specific user
 */
export async function getUserWatchedGames(
  db: D1Database,
  userId: string,
  dataScope: DataScope
): Promise<WatchedGame[]> {
  const result = await db.prepare(`
    SELECT
      e.id as game_id,
      e.external_id,
      e.sport_key as sport,
      e.home_team,
      e.away_team,
      e.start_at,
      e.status as current_state,
      e.home_score,
      e.away_score,
      gw.created_at as watch_started_at
    FROM game_watchlist gw
    INNER JOIN events e ON CAST(e.id AS TEXT) = gw.game_id
    WHERE gw.user_id = ? AND gw.data_scope = ?
    ORDER BY e.start_at ASC
  `).bind(userId, dataScope).all();
  
  return ((result.results || []) as Record<string, unknown>[]).map(row => ({
    gameId: String(row.game_id),
    externalId: row.external_id as string,
    sport: row.sport as string,
    homeTeam: row.home_team as string,
    awayTeam: row.away_team as string,
    startAt: row.start_at as string,
    currentState: mapStatusToGameState(row.current_state as string),
    homeScore: row.home_score as number | null,
    awayScore: row.away_score as number | null,
    period: null,
    lastPolledAt: null,
    lastStateChangeAt: null,
    watcherCount: 1,
  }));
}

/**
 * Get game state history for display from event log
 */
export async function getGameStateHistory(
  db: D1Database,
  gameId: string,
  _dataScope: DataScope,
  limit: number = 20
): Promise<Array<{
  previousState: GameState;
  newState: GameState;
  detectedAt: string;
}>> {
  const result = await db.prepare(`
    SELECT payload_json, created_at
    FROM event_log
    WHERE event_type = 'game_state_change'
    AND entity_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(String(gameId), limit).all();
  
  return ((result.results || []) as Record<string, unknown>[]).map(row => {
    const payload = JSON.parse(row.payload_json as string);
    return {
      previousState: payload.previousState as GameState,
      newState: payload.newState as GameState,
      detectedAt: row.created_at as string,
    };
  });
}

/**
 * Get list of watched games (for API endpoints)
 */
export async function getWatchedGamesList(
  db: D1Database,
  dataScope: DataScope,
  userId?: string
): Promise<Array<{
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  status: string;
  startAt: string;
  lastPolled: string | null;
  isActive: boolean;
}>> {
  let query = `
    SELECT DISTINCT
      e.id as game_id,
      e.sport_key as sport,
      e.home_team,
      e.away_team,
      e.status,
      e.start_at,
      NULL as last_polled
    FROM events e
    INNER JOIN game_watchlist gw ON CAST(e.id AS TEXT) = gw.game_id
    WHERE gw.data_scope = ?
  `;
  
  const params: (string | DataScope)[] = [dataScope];
  
  if (userId) {
    query += ` AND gw.user_id = ?`;
    params.push(userId);
  }
  
  query += ` ORDER BY e.start_at ASC`;
  
  const result = await db.prepare(query).bind(...params).all();
  
  return ((result.results || []) as Record<string, unknown>[]).map(row => ({
    gameId: String(row.game_id),
    sport: row.sport as string,
    homeTeam: row.home_team as string,
    awayTeam: row.away_team as string,
    status: row.status as string,
    startAt: row.start_at as string,
    lastPolled: row.last_polled as string | null,
    isActive: !['final', 'cancelled', 'postponed'].includes((row.status as string).toLowerCase()),
  }));
}

/**
 * Poll a single game and return diff
 */
export async function pollSingleGame(
  db: D1Database,
  gameId: string,
  _dataScope: DataScope
): Promise<{
  hasChanges: boolean;
  statusChanged: boolean;
  scoreChanged: boolean;
  currentSnapshot: GameStateSnapshot;
  previousSnapshot: GameStateSnapshot | null;
} | null> {
  const gameResult = await db.prepare(`
    SELECT
      id as game_id,
      external_id,
      sport_key as sport,
      home_team,
      away_team,
      start_at,
      status,
      home_score,
      away_score
    FROM events
    WHERE id = ?
  `).bind(gameId).first() as Record<string, unknown> | null;
  
  if (!gameResult) {
    return null;
  }
  
  const game: WatchedGame = {
    gameId: String(gameResult.game_id),
    externalId: gameResult.external_id as string,
    sport: gameResult.sport as string,
    homeTeam: gameResult.home_team as string,
    awayTeam: gameResult.away_team as string,
    startAt: gameResult.start_at as string,
    currentState: mapStatusToGameState(gameResult.status as string),
    homeScore: gameResult.home_score as number | null,
    awayScore: gameResult.away_score as number | null,
    period: null,
    lastPolledAt: null,
    lastStateChangeAt: null,
    watcherCount: 1,
  };
  
  const cached = getCachedState(gameId);
  const changes = detectStateChanges(cached, game);
  
  const currentSnapshot: GameStateSnapshot = {
    gameId: game.gameId,
    state: game.currentState,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    period: game.period,
    timeRemaining: null,
    capturedAt: new Date().toISOString(),
  };
  
  setCachedState(currentSnapshot);
  
  return {
    hasChanges: changes.hasStateChange || changes.hasScoreChange,
    statusChanged: changes.hasStateChange,
    scoreChanged: changes.hasScoreChange,
    currentSnapshot,
    previousSnapshot: cached || null,
  };
}

/**
 * Clear snapshots for a game
 */
export async function clearGameSnapshots(
  _db: D1Database,
  gameId: string,
  _dataScope: DataScope
): Promise<void> {
  clearCachedState(gameId);
  
  // Note: We don't have a game_state_history table yet, but this is a placeholder
  // for when we add persistent snapshot tracking
}

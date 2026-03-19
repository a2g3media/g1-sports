/**
 * Game State Alert Trigger Engine
 * 
 * Detects live game state changes and creates alerts for users
 * following those games.
 * 
 * State Events:
 * - PREGAME → IN_PROGRESS: Game started
 * - IN_PROGRESS → HALFTIME: Halftime (if applicable)
 * - HALFTIME → IN_PROGRESS: Second half started
 * - IN_PROGRESS → OVERTIME: Game goes to OT
 * - IN_PROGRESS/OVERTIME → FINAL: Game ended
 * - Any → DELAYED: Game delayed
 * - Any → POSTPONED: Game postponed
 * 
 * Severity Rules:
 * - CRITICAL: Postponement, cancellation
 * - IMPACT: Overtime, significant delay
 * - NOTICE: Game start, game final
 * - INFO: Halftime, period ends
 */

import type {
  AlertCategory,
  AlertSeverity,
  GameStateAlertData,
  GameState,
} from "../../../shared/types/alerts";
import { normalizeCoachGAlertCopy } from "../coachgCompliance";

// D1Database type
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
}
interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  error?: string;
  meta?: { changes?: number; last_row_id?: number };
}

// =====================================================
// TYPES
// =====================================================

export type DataScope = "DEMO" | "PROD";

export interface GameStateChange {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  previousState: GameState;
  currentState: GameState;
  homeScore?: number;
  awayScore?: number;
  period?: string;
  timeRemaining?: string;
  delayReason?: string;
  detectedAt: string;
}

export interface GameStateAlert {
  userId: string;
  dataScope: DataScope;
  category: AlertCategory;
  severity: AlertSeverity;
  headline: string;
  body: string;
  gameId: string;
  sourceType: "LIVE_SCORES";
  sourceData: GameStateAlertData;
  deepLink: string;
  dedupeKey: string;
  expiresAt?: string;
}

export interface UserGameStatePrefs {
  userId: string;
  categoryGameState: boolean;
}

// State transitions that trigger alerts
const ALERT_TRANSITIONS: Record<string, {
  from: GameState[];
  to: GameState;
  severity: AlertSeverity;
  type: string;
}[]> = {
  START: [
    { from: ["SCHEDULED", "PREGAME"], to: "IN_PROGRESS", severity: "NOTICE", type: "start" },
  ],
  HALFTIME: [
    { from: ["IN_PROGRESS"], to: "HALFTIME", severity: "INFO", type: "halftime" },
  ],
  OVERTIME: [
    { from: ["IN_PROGRESS", "END_PERIOD"], to: "OVERTIME", severity: "IMPACT", type: "overtime" },
  ],
  FINAL: [
    { from: ["IN_PROGRESS", "OVERTIME", "END_PERIOD"], to: "FINAL", severity: "NOTICE", type: "final" },
  ],
  DELAY: [
    { from: ["SCHEDULED", "PREGAME", "IN_PROGRESS", "HALFTIME"], to: "DELAYED", severity: "IMPACT", type: "delay" },
  ],
  POSTPONE: [
    { from: ["SCHEDULED", "PREGAME", "DELAYED"], to: "POSTPONED", severity: "CRITICAL", type: "postpone" },
  ],
  CANCEL: [
    { from: ["SCHEDULED", "PREGAME", "DELAYED", "POSTPONED"], to: "CANCELLED", severity: "CRITICAL", type: "cancel" },
  ],
};

// =====================================================
// ANALYSIS LOGIC
// =====================================================

/**
 * Analyze a game state change to determine if it warrants an alert
 */
export function analyzeGameStateChange(
  change: GameStateChange
): {
  shouldAlert: boolean;
  severity: AlertSeverity;
  transitionType: string;
} {
  const { previousState, currentState } = change;
  
  // Check each transition category
  for (const [, transitions] of Object.entries(ALERT_TRANSITIONS)) {
    for (const transition of transitions) {
      if (transition.from.includes(previousState) && transition.to === currentState) {
        return {
          shouldAlert: true,
          severity: transition.severity,
          transitionType: transition.type,
        };
      }
    }
  }
  
  // Special case: score updates during live games (not alerting by default)
  if (previousState === "IN_PROGRESS" && currentState === "IN_PROGRESS") {
    return {
      shouldAlert: false,
      severity: "INFO",
      transitionType: "score_update",
    };
  }
  
  return {
    shouldAlert: false,
    severity: "INFO",
    transitionType: "unknown",
  };
}

// =====================================================
// ALERT GENERATION
// =====================================================

/**
 * Generate headline for a game state alert
 */
function generateHeadline(
  change: GameStateChange,
  transitionType: string
): string {
  const { homeTeam, awayTeam, homeScore, awayScore } = change;
  const matchup = `${awayTeam} @ ${homeTeam}`;
  
  switch (transitionType) {
    case "start":
      return `Game Started: ${matchup}`;
    case "halftime":
      if (homeScore !== undefined && awayScore !== undefined) {
        return `Halftime: ${awayTeam} ${awayScore}, ${homeTeam} ${homeScore}`;
      }
      return `Halftime: ${matchup}`;
    case "overtime":
      return `Overtime: ${matchup}`;
    case "final":
      if (homeScore !== undefined && awayScore !== undefined) {
        return `Final: ${awayTeam} ${awayScore}, ${homeTeam} ${homeScore}`;
      }
      return `Final: ${matchup}`;
    case "delay":
      return `Game Delayed: ${matchup}`;
    case "postpone":
      return `Game Postponed: ${matchup}`;
    case "cancel":
      return `Game Cancelled: ${matchup}`;
    default:
      return `Game Update: ${matchup}`;
  }
}

/**
 * Generate body text for a game state alert
 */
function generateBody(
  change: GameStateChange,
  transitionType: string
): string {
  const { homeTeam, awayTeam, homeScore, awayScore, delayReason } = change;
  const parts: string[] = [];
  
  switch (transitionType) {
    case "start":
      parts.push(`${awayTeam} at ${homeTeam} is now underway.`);
      break;
    case "halftime":
      parts.push(`${awayTeam} at ${homeTeam} has reached halftime.`);
      if (homeScore !== undefined && awayScore !== undefined) {
        parts.push(`Score: ${awayTeam} ${awayScore}, ${homeTeam} ${homeScore}.`);
      }
      break;
    case "overtime":
      parts.push(`${awayTeam} at ${homeTeam} is heading to overtime!`);
      if (homeScore !== undefined && awayScore !== undefined) {
        parts.push(`Tied at ${homeScore}.`);
      }
      break;
    case "final":
      if (homeScore !== undefined && awayScore !== undefined) {
        const finalWinner = homeScore > awayScore ? homeTeam : awayScore > homeScore ? awayTeam : null;
        if (finalWinner) {
          parts.push(`${finalWinner} wins! Final: ${awayTeam} ${awayScore}, ${homeTeam} ${homeScore}.`);
        } else {
          parts.push(`Game ends in a tie. Final: ${awayTeam} ${awayScore}, ${homeTeam} ${homeScore}.`);
        }
      } else {
        parts.push(`${awayTeam} at ${homeTeam} has ended.`);
      }
      break;
    case "delay":
      parts.push(`${awayTeam} at ${homeTeam} has been delayed.`);
      if (delayReason) {
        parts.push(`Reason: ${delayReason}.`);
      }
      break;
    case "postpone":
      parts.push(`${awayTeam} at ${homeTeam} has been postponed.`);
      if (delayReason) {
        parts.push(`Reason: ${delayReason}.`);
      }
      parts.push("Check back for rescheduled time.");
      break;
    case "cancel":
      parts.push(`${awayTeam} at ${homeTeam} has been cancelled.`);
      if (delayReason) {
        parts.push(`Reason: ${delayReason}.`);
      }
      break;
  }
  
  return parts.join(" ");
}

/**
 * Create a game state alert object
 */
export function createGameStateAlert(
  userId: string,
  dataScope: DataScope,
  change: GameStateChange,
  analysis: ReturnType<typeof analyzeGameStateChange>
): GameStateAlert {
  const headline = generateHeadline(change, analysis.transitionType);
  const body = generateBody(change, analysis.transitionType);
  
  // Dedupe key: one alert per game per state transition
  const dedupeKey = `GAME_STATE:${change.gameId}:${change.currentState}:${change.detectedAt.slice(0, 13)}`;
  
  // Expiry: state alerts are ephemeral
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(); // 6 hours
  
  const sourceData: GameStateAlertData = {
    gameId: change.gameId,
    homeTeam: change.homeTeam,
    awayTeam: change.awayTeam,
    previousState: change.previousState,
    currentState: change.currentState,
    homeScore: change.homeScore,
    awayScore: change.awayScore,
    timeRemaining: change.timeRemaining,
    period: change.period,
  };
  
  return {
    userId,
    dataScope,
    category: "GAME_STATE",
    severity: analysis.severity,
    headline,
    body,
    gameId: change.gameId,
    sourceType: "LIVE_SCORES",
    sourceData,
    deepLink: `/game/${change.gameId}`,
    dedupeKey,
    expiresAt,
  };
}

// =====================================================
// DATABASE OPERATIONS
// =====================================================

/**
 * Fetch users who should receive game state alerts for a game
 */
export async function getUsersForGameStateAlerts(
  db: D1Database,
  gameId: string,
  dataScope: DataScope
): Promise<UserGameStatePrefs[]> {
  const query = `
    SELECT DISTINCT 
      sap.user_id,
      sap.category_game_state
    FROM scout_alert_preferences sap
    WHERE sap.category_game_state = 1
    AND EXISTS (
      SELECT 1 FROM game_watchlist gw 
      WHERE gw.user_id = sap.user_id 
      AND gw.game_id = ? 
      AND gw.data_scope = ?
    )
  `;
  
  const result = await db.prepare(query).bind(gameId, dataScope).all();
  
  return ((result.results || []) as Record<string, unknown>[]).map(row => ({
    userId: row.user_id as string,
    categoryGameState: Boolean(row.category_game_state),
  }));
}

/**
 * Check if an alert with this dedupe key already exists
 */
async function alertExists(
  db: D1Database,
  userId: string,
  dedupeKey: string
): Promise<boolean> {
  const result = await db.prepare(`
    SELECT 1 FROM scout_alerts 
    WHERE user_id = ? AND dedupe_key = ?
    LIMIT 1
  `).bind(userId, dedupeKey).first();
  
  return result !== null;
}

/**
 * Insert a new game state alert into the database
 */
export async function insertGameStateAlert(
  db: D1Database,
  alert: GameStateAlert
): Promise<number | null> {
  const exists = await alertExists(db, alert.userId, alert.dedupeKey);
  if (exists) {
    return null;
  }
  
  const normalizedCopy = normalizeCoachGAlertCopy({
    title: alert.headline,
    body: alert.body,
  });
  const result = await db.prepare(`
    INSERT INTO scout_alerts (
      data_scope, user_id, category, severity, headline, body,
      game_id, source_type, source_data_json, deep_link,
      dedupe_key, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    alert.dataScope,
    alert.userId,
    alert.category,
    alert.severity,
    normalizedCopy.title,
    normalizedCopy.body || "",
    alert.gameId,
    alert.sourceType,
    JSON.stringify(alert.sourceData),
    alert.deepLink,
    alert.dedupeKey,
    alert.expiresAt || null
  ).run();
  
  return result.meta?.last_row_id || null;
}

// =====================================================
// MAIN TRIGGER FUNCTION
// =====================================================

export interface GameStateTriggerResult {
  processed: boolean;
  alertsCreated: number;
  userIds: string[];
  severity: AlertSeverity;
  transitionType: string;
}

/**
 * Main entry point: Process a game state change and create alerts
 */
export async function triggerGameStateAlerts(
  db: D1Database,
  change: GameStateChange,
  dataScope: DataScope
): Promise<GameStateTriggerResult> {
  const analysis = analyzeGameStateChange(change);
  
  const result: GameStateTriggerResult = {
    processed: analysis.shouldAlert,
    alertsCreated: 0,
    userIds: [],
    severity: analysis.severity,
    transitionType: analysis.transitionType,
  };
  
  if (!analysis.shouldAlert) {
    return result;
  }
  
  // Get users who should receive this alert
  const users = await getUsersForGameStateAlerts(db, change.gameId, dataScope);
  
  // Create and insert alerts for each user
  for (const user of users) {
    const alert = createGameStateAlert(user.userId, dataScope, change, analysis);
    const alertId = await insertGameStateAlert(db, alert);
    
    if (alertId !== null) {
      result.alertsCreated++;
      result.userIds.push(user.userId);
    }
  }
  
  return result;
}

// =====================================================
// DEMO / TESTING UTILITIES
// =====================================================

/**
 * Generate a sample game state change for testing
 */
export function generateDemoGameStateChange(
  gameId: string,
  sport: string,
  homeTeam: string,
  awayTeam: string,
  options: {
    transitionType?: "start" | "halftime" | "overtime" | "final" | "delay";
    homeScore?: number;
    awayScore?: number;
  } = {}
): GameStateChange {
  const transitionType = options.transitionType || "start";
  const homeScore = options.homeScore ?? 21;
  const awayScore = options.awayScore ?? 17;
  
  let previousState: GameState;
  let currentState: GameState;
  
  switch (transitionType) {
    case "start":
      previousState = "PREGAME";
      currentState = "IN_PROGRESS";
      break;
    case "halftime":
      previousState = "IN_PROGRESS";
      currentState = "HALFTIME";
      break;
    case "overtime":
      previousState = "IN_PROGRESS";
      currentState = "OVERTIME";
      break;
    case "final":
      previousState = "IN_PROGRESS";
      currentState = "FINAL";
      break;
    case "delay":
      previousState = "IN_PROGRESS";
      currentState = "DELAYED";
      break;
    default:
      previousState = "PREGAME";
      currentState = "IN_PROGRESS";
  }
  
  return {
    gameId,
    sport,
    homeTeam,
    awayTeam,
    previousState,
    currentState,
    homeScore: transitionType !== "start" ? homeScore : undefined,
    awayScore: transitionType !== "start" ? awayScore : undefined,
    period: transitionType === "overtime" ? "OT" : transitionType === "halftime" ? "Half" : "Q4",
    delayReason: transitionType === "delay" ? "Weather" : undefined,
    detectedAt: new Date().toISOString(),
  };
}

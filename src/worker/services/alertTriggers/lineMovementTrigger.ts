/**
 * Line Movement Alert Trigger Engine
 * 
 * Detects significant line movements and creates alerts for users
 * who follow the relevant games/teams.
 * 
 * Movement Types:
 * - SPREAD: Point spread changes (e.g., -3.5 → -4.5)
 * - TOTAL: Over/under changes (e.g., 44.5 → 46)
 * - MONEYLINE: Price changes and favorite flips
 * 
 * Severity Rules:
 * - CRITICAL: Favorite flip, key number crossed, 2+ point move
 * - IMPACT: 1.5+ point move, or 15%+ ML probability shift
 * - NOTICE: 0.5-1 point move, or 5-15% ML shift
 * - INFO: Minor movements below threshold
 */

import type {
  AlertCategory,
  AlertSeverity,
  LineMovementAlertData,
  LineMovementCause,
  AlertThresholds,
} from "../../../shared/types/alerts";
import { normalizeCoachGAlertCopy } from "../coachgCompliance";

// D1Database type from Cloudflare Workers
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
export type MarketType = "SPREAD" | "TOTAL" | "MONEYLINE";

export interface LineMovement {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  marketType: MarketType;
  previousValue: number;
  currentValue: number;
  previousPrice?: number;
  currentPrice?: number;
  bookmaker?: string;
  isLive?: boolean;
  detectedAt: string;
}

export interface LineMovementAlert {
  userId: string;
  dataScope: DataScope;
  category: AlertCategory;
  severity: AlertSeverity;
  headline: string;
  body: string;
  gameId: string;
  teamKey?: string;
  sourceType: "ODDS_API";
  sourceData: LineMovementAlertData;
  deepLink: string;
  dedupeKey: string;
  expiresAt?: string;
}

export interface UserAlertPrefs {
  userId: string;
  categoryLineMovement: boolean;
  lineMovementPoints: number;
}

// Key numbers for spread movements (sport-specific)
const KEY_NUMBERS: Record<string, number[]> = {
  NFL: [3, 7, 10, 14],
  NCAAF: [3, 7, 10, 14],
  NBA: [3, 5, 7],
  NCAAB: [3, 5, 7],
  MLB: [1.5],
  NHL: [1.5],
  SOCCER: [0.5, 1, 1.5],
};

// =====================================================
// DETECTION LOGIC
// =====================================================

/**
 * Analyze a line movement and determine if it's significant
 */
export function analyzeLineMovement(
  movement: LineMovement,
  thresholds: AlertThresholds["lineMovement"] = { spread: 0.5, total: 0.5, moneyline: 10 }
): {
  isSignificant: boolean;
  severity: AlertSeverity;
  change: number;
  changeDirection: "UP" | "DOWN";
  crossedKeyNumber: number | null;
  cause?: LineMovementCause;
} {
  const change = movement.currentValue - movement.previousValue;
  const absChange = Math.abs(change);
  const changeDirection: "UP" | "DOWN" = change > 0 ? "UP" : "DOWN";
  
  let isSignificant = false;
  let severity: AlertSeverity = "INFO";
  let crossedKeyNumber: number | null = null;
  
  switch (movement.marketType) {
    case "SPREAD": {
      const threshold = thresholds.spread;
      const sportKeys = KEY_NUMBERS[movement.sport.toUpperCase()] || KEY_NUMBERS.NFL;
      
      // Check if key number was crossed
      crossedKeyNumber = findCrossedKeyNumber(
        movement.previousValue,
        movement.currentValue,
        sportKeys
      );
      
      // Check for favorite flip (sign change)
      const favoriteFlipped = 
        (movement.previousValue > 0 && movement.currentValue < 0) ||
        (movement.previousValue < 0 && movement.currentValue > 0);
      
      if (favoriteFlipped) {
        isSignificant = true;
        severity = "CRITICAL";
      } else if (crossedKeyNumber !== null) {
        isSignificant = true;
        severity = absChange >= 1.5 ? "CRITICAL" : "IMPACT";
      } else if (absChange >= 2) {
        isSignificant = true;
        severity = "CRITICAL";
      } else if (absChange >= 1.5) {
        isSignificant = true;
        severity = "IMPACT";
      } else if (absChange >= threshold) {
        isSignificant = true;
        severity = absChange >= 1 ? "NOTICE" : "INFO";
      }
      break;
    }
    
    case "TOTAL": {
      const threshold = thresholds.total;
      
      if (absChange >= 3) {
        isSignificant = true;
        severity = "CRITICAL";
      } else if (absChange >= 2) {
        isSignificant = true;
        severity = "IMPACT";
      } else if (absChange >= 1) {
        isSignificant = true;
        severity = "NOTICE";
      } else if (absChange >= threshold) {
        isSignificant = true;
        severity = "INFO";
      }
      break;
    }
    
    case "MONEYLINE": {
      // For moneyline, we're comparing American odds
      // Calculate implied probability change
      const prevProb = americanToImplied(movement.previousValue);
      const currProb = americanToImplied(movement.currentValue);
      const probChange = Math.abs(currProb - prevProb) * 100; // percentage points
      
      // Check for favorite flip
      const favoriteFlipped =
        (movement.previousValue > 0 && movement.currentValue < 0) ||
        (movement.previousValue < 0 && movement.currentValue > 0);
      
      if (favoriteFlipped) {
        isSignificant = true;
        severity = "CRITICAL";
      } else if (probChange >= 15) {
        isSignificant = true;
        severity = "IMPACT";
      } else if (probChange >= 10) {
        isSignificant = true;
        severity = "NOTICE";
      } else if (probChange >= 5 || absChange >= thresholds.moneyline) {
        isSignificant = true;
        severity = "INFO";
      }
      break;
    }
  }
  
  return {
    isSignificant,
    severity,
    change,
    changeDirection,
    crossedKeyNumber,
  };
}

/**
 * Find if a key number was crossed
 */
function findCrossedKeyNumber(
  previous: number,
  current: number,
  keyNumbers: number[]
): number | null {
  for (const key of keyNumbers) {
    // Check positive key number crossing
    if (
      (previous < key && current >= key) ||
      (previous >= key && current < key)
    ) {
      return key;
    }
    // Check negative key number crossing
    if (
      (previous > -key && current <= -key) ||
      (previous <= -key && current > -key)
    ) {
      return -key;
    }
  }
  return null;
}

/**
 * Convert American odds to implied probability
 */
function americanToImplied(american: number): number {
  if (american > 0) {
    return 100 / (american + 100);
  } else {
    return Math.abs(american) / (Math.abs(american) + 100);
  }
}

// =====================================================
// ALERT GENERATION
// =====================================================

/**
 * Generate headline for a line movement alert
 */
function generateHeadline(
  movement: LineMovement,
  analysis: ReturnType<typeof analyzeLineMovement>
): string {
  const { marketType, homeTeam, awayTeam, previousValue, currentValue } = movement;
  const { crossedKeyNumber, changeDirection } = analysis;
  
  switch (marketType) {
    case "SPREAD": {
      const favoriteFlipped = 
        (previousValue > 0 && currentValue < 0) ||
        (previousValue < 0 && currentValue > 0);
      
      if (favoriteFlipped) {
        const newFavorite = currentValue < 0 ? homeTeam : awayTeam;
        return `Favorite flip: ${newFavorite} now favored`;
      }
      
      if (crossedKeyNumber !== null) {
        return `Spread crosses ${Math.abs(crossedKeyNumber)}: ${homeTeam} vs ${awayTeam}`;
      }
      
      const direction = changeDirection === "UP" ? "rises" : "drops";
      return `Spread ${direction} to ${formatSpread(currentValue)}: ${homeTeam} vs ${awayTeam}`;
    }
    
    case "TOTAL": {
      const direction = changeDirection === "UP" ? "rises" : "drops";
      return `Total ${direction} to ${currentValue}: ${homeTeam} vs ${awayTeam}`;
    }
    
    case "MONEYLINE": {
      const favoriteFlipped =
        (previousValue > 0 && currentValue < 0) ||
        (previousValue < 0 && currentValue > 0);
      
      if (favoriteFlipped) {
        return `Moneyline flip: ${homeTeam} now ${currentValue < 0 ? "favored" : "underdog"}`;
      }
      
      const direction = currentValue < previousValue ? "shortens" : "lengthens";
      return `${homeTeam} ML ${direction} to ${formatOdds(currentValue)}`;
    }
  }
}

/**
 * Generate body text for a line movement alert
 */
function generateBody(
  movement: LineMovement,
  analysis: ReturnType<typeof analyzeLineMovement>
): string {
  const { marketType, homeTeam, awayTeam, previousValue, currentValue, bookmaker } = movement;
  const { change, crossedKeyNumber } = analysis;
  const absChange = Math.abs(change);
  
  const parts: string[] = [];
  
  switch (marketType) {
    case "SPREAD": {
      parts.push(`${homeTeam} spread moved from ${formatSpread(previousValue)} to ${formatSpread(currentValue)} (${absChange.toFixed(1)} pts).`);
      
      if (crossedKeyNumber !== null) {
        parts.push(`Crossed key number ${Math.abs(crossedKeyNumber)}.`);
      }
      break;
    }
    
    case "TOTAL": {
      parts.push(`${homeTeam} vs ${awayTeam} total moved from ${previousValue} to ${currentValue} (${absChange.toFixed(1)} pts).`);
      break;
    }
    
    case "MONEYLINE": {
      const prevProb = americanToImplied(previousValue) * 100;
      const currProb = americanToImplied(currentValue) * 100;
      const probChange = Math.abs(currProb - prevProb);
      
      parts.push(`${homeTeam} moneyline moved from ${formatOdds(previousValue)} to ${formatOdds(currentValue)}.`);
      parts.push(`Implied probability shifted ${probChange.toFixed(1)}%.`);
      break;
    }
  }
  
  if (bookmaker) {
    parts.push(`Source: ${bookmaker}`);
  }
  
  return parts.join(" ");
}

/**
 * Format a spread value for display
 */
function formatSpread(value: number): string {
  if (value > 0) return `+${value}`;
  return value.toString();
}

/**
 * Format American odds for display
 */
function formatOdds(value: number): string {
  if (value > 0) return `+${value}`;
  return value.toString();
}

/**
 * Create a line movement alert object
 */
export function createLineMovementAlert(
  userId: string,
  dataScope: DataScope,
  movement: LineMovement,
  analysis: ReturnType<typeof analyzeLineMovement>
): LineMovementAlert {
  const headline = generateHeadline(movement, analysis);
  const body = generateBody(movement, analysis);
  
  // Dedupe key: prevent duplicate alerts for same movement
  const dedupeKey = `LINE_MOVEMENT:${movement.gameId}:${movement.marketType}:${movement.currentValue}:${new Date().toISOString().slice(0, 13)}`;
  
  // Expiry: game-time relevant alerts expire after the game
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
  
  const sourceData: LineMovementAlertData = {
    gameId: movement.gameId,
    homeTeam: movement.homeTeam,
    awayTeam: movement.awayTeam,
    marketType: movement.marketType,
    previousValue: movement.previousValue,
    currentValue: movement.currentValue,
    change: analysis.change,
    changeDirection: analysis.changeDirection,
    bookmaker: movement.bookmaker,
    cause: analysis.cause,
  };
  
  return {
    userId,
    dataScope,
    category: "LINE_MOVEMENT",
    severity: analysis.severity,
    headline,
    body,
    gameId: movement.gameId,
    sourceType: "ODDS_API",
    sourceData,
    deepLink: `/game/${movement.gameId}`,
    dedupeKey,
    expiresAt,
  };
}

// =====================================================
// DATABASE OPERATIONS
// =====================================================

/**
 * Fetch users who should receive line movement alerts for a game
 */
export async function getUsersForLineMovementAlerts(
  db: D1Database,
  gameId: string,
  dataScope: DataScope
): Promise<UserAlertPrefs[]> {
  // Get users who:
  // 1. Have line movement alerts enabled
  // 2. Are watching this game (via watchlist or followed teams)
  
  const query = `
    SELECT DISTINCT 
      sap.user_id,
      sap.category_line_movement,
      sap.line_movement_points
    FROM scout_alert_preferences sap
    WHERE sap.category_line_movement = 1
    AND EXISTS (
      SELECT 1 FROM game_watchlist gw 
      WHERE gw.user_id = sap.user_id 
      AND gw.game_id = ? 
      AND gw.data_scope = ?
      AND gw.watch_spread = 1
    )
  `;
  
  const result = await db.prepare(query).bind(gameId, dataScope).all();
  
  return ((result.results || []) as Record<string, unknown>[]).map(row => ({
    userId: row.user_id as string,
    categoryLineMovement: Boolean(row.category_line_movement),
    lineMovementPoints: (row.line_movement_points as number) || 0.5,
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
 * Insert a new line movement alert into the database
 */
export async function insertLineMovementAlert(
  db: D1Database,
  alert: LineMovementAlert
): Promise<number | null> {
  // Check for duplicate
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
      game_id, team_key, source_type, source_data_json, deep_link,
      dedupe_key, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    alert.dataScope,
    alert.userId,
    alert.category,
    alert.severity,
    normalizedCopy.title,
    normalizedCopy.body || "",
    alert.gameId,
    alert.teamKey || null,
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

export interface LineMovementTriggerResult {
  processed: boolean;
  alertsCreated: number;
  userIds: string[];
  severity: AlertSeverity;
  details: {
    marketType: MarketType;
    previousValue: number;
    currentValue: number;
    change: number;
    crossedKeyNumber: number | null;
  };
}

/**
 * Main entry point: Process a line movement and create alerts for relevant users
 */
export async function triggerLineMovementAlerts(
  db: D1Database,
  movement: LineMovement,
  dataScope: DataScope
): Promise<LineMovementTriggerResult> {
  // Analyze the movement
  const analysis = analyzeLineMovement(movement);
  
  const result: LineMovementTriggerResult = {
    processed: true,
    alertsCreated: 0,
    userIds: [],
    severity: analysis.severity,
    details: {
      marketType: movement.marketType,
      previousValue: movement.previousValue,
      currentValue: movement.currentValue,
      change: analysis.change,
      crossedKeyNumber: analysis.crossedKeyNumber,
    },
  };
  
  // Skip if not significant
  if (!analysis.isSignificant) {
    result.processed = false;
    return result;
  }
  
  // Get users who should receive this alert
  const users = await getUsersForLineMovementAlerts(db, movement.gameId, dataScope);
  
  // Filter users by their personal threshold
  const eligibleUsers = users.filter(user => {
    const absChange = Math.abs(analysis.change);
    return absChange >= user.lineMovementPoints;
  });
  
  // Create and insert alerts for each eligible user
  for (const user of eligibleUsers) {
    const alert = createLineMovementAlert(user.userId, dataScope, movement, analysis);
    const alertId = await insertLineMovementAlert(db, alert);
    
    if (alertId !== null) {
      result.alertsCreated++;
      result.userIds.push(user.userId);
    }
  }
  
  return result;
}

/**
 * Batch process multiple line movements
 */
export async function triggerLineMovementAlertsBatch(
  db: D1Database,
  movements: LineMovement[],
  dataScope: DataScope
): Promise<{
  total: number;
  processed: number;
  alertsCreated: number;
  results: LineMovementTriggerResult[];
}> {
  const results: LineMovementTriggerResult[] = [];
  let processed = 0;
  let alertsCreated = 0;
  
  for (const movement of movements) {
    const result = await triggerLineMovementAlerts(db, movement, dataScope);
    results.push(result);
    
    if (result.processed) {
      processed++;
      alertsCreated += result.alertsCreated;
    }
  }
  
  return {
    total: movements.length,
    processed,
    alertsCreated,
    results,
  };
}

// =====================================================
// DEMO / TESTING UTILITIES
// =====================================================

/**
 * Generate a sample line movement for testing
 */
export function generateDemoLineMovement(
  gameId: string,
  sport: string,
  homeTeam: string,
  awayTeam: string,
  options: {
    marketType?: MarketType;
    magnitude?: "small" | "medium" | "large" | "flip";
  } = {}
): LineMovement {
  const marketType = options.marketType || "SPREAD";
  const magnitude = options.magnitude || "medium";
  
  let previousValue: number;
  let currentValue: number;
  
  switch (marketType) {
    case "SPREAD": {
      previousValue = -3;
      switch (magnitude) {
        case "small": currentValue = -3.5; break;
        case "medium": currentValue = -4.5; break;
        case "large": currentValue = -7; break;
        case "flip": currentValue = 2.5; break;
      }
      break;
    }
    case "TOTAL": {
      previousValue = 44.5;
      switch (magnitude) {
        case "small": currentValue = 45; break;
        case "medium": currentValue = 46; break;
        case "large": currentValue = 48; break;
        case "flip": currentValue = 41; break;
      }
      break;
    }
    case "MONEYLINE": {
      previousValue = -150;
      switch (magnitude) {
        case "small": currentValue = -160; break;
        case "medium": currentValue = -180; break;
        case "large": currentValue = -250; break;
        case "flip": currentValue = 120; break;
      }
      break;
    }
  }
  
  return {
    gameId,
    sport,
    homeTeam,
    awayTeam,
    marketType,
    previousValue,
    currentValue,
    bookmaker: "consensus",
    isLive: false,
    detectedAt: new Date().toISOString(),
  };
}

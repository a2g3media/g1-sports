/**
 * Injury Alert Trigger Engine
 * 
 * Detects player injury status changes and creates alerts for users
 * who follow the relevant teams.
 * 
 * Status Levels (descending severity):
 * - OUT: Player will not play
 * - Doubtful: Unlikely to play (25% chance)
 * - Questionable: May or may not play (50% chance)
 * - Probable: Likely to play (75% chance)
 * - Day-to-Day: Short-term, reevaluated daily
 * - IR/IL: Injured reserve / injured list
 * - PUP: Physically unable to perform
 * - Healthy: Cleared to play
 * 
 * Severity Rules:
 * - CRITICAL: Star player OUT, or multiple key players OUT
 * - IMPACT: Key player OUT or Doubtful, star Questionable
 * - NOTICE: Starter Questionable, or returning from injury
 * - INFO: Depth player status change, Probable status
 */

import type {
  AlertCategory,
  AlertSeverity,
  InjuryAlertData,
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

export type InjuryStatus = 
  | "OUT"
  | "Doubtful"
  | "Questionable"
  | "Probable"
  | "Day-to-Day"
  | "IR"
  | "IL"
  | "PUP"
  | "Healthy"
  | "Unknown";

export type ImpactRating = "HIGH" | "MEDIUM" | "LOW";

export interface InjuryUpdate {
  sport: string;
  teamKey: string;
  teamName: string;
  playerId?: string;
  playerName: string;
  position?: string;
  previousStatus?: InjuryStatus;
  currentStatus: InjuryStatus;
  injuryType?: string;
  injuryDetails?: string;
  estimatedReturn?: string;
  impactRating?: ImpactRating;
  affectedGameIds?: string[];
  reportedAt: string;
  source?: string;
}

export interface InjuryAlert {
  userId: string;
  dataScope: DataScope;
  category: AlertCategory;
  severity: AlertSeverity;
  headline: string;
  body: string;
  gameId?: string;
  teamKey: string;
  playerKey?: string;
  sourceType: "INJURY_FEED";
  sourceData: InjuryAlertData;
  deepLink: string;
  dedupeKey: string;
  expiresAt?: string;
}

export interface UserInjuryPrefs {
  userId: string;
  categoryInjury: boolean;
}

// Status severity ordering (higher index = more severe for "bad" statuses)
const STATUS_SEVERITY: Record<InjuryStatus, number> = {
  "Healthy": 0,
  "Probable": 1,
  "Day-to-Day": 2,
  "Questionable": 3,
  "Doubtful": 4,
  "OUT": 5,
  "IR": 6,
  "IL": 6,
  "PUP": 6,
  "Unknown": 0,
};

// Statuses that warrant alerts
const ALERT_WORTHY_STATUSES: InjuryStatus[] = [
  "OUT", "Doubtful", "Questionable", "IR", "IL", "PUP"
];

// =====================================================
// ANALYSIS LOGIC
// =====================================================

/**
 * Analyze an injury update and determine alert severity
 */
export function analyzeInjuryUpdate(
  update: InjuryUpdate
): {
  shouldAlert: boolean;
  severity: AlertSeverity;
  isNewInjury: boolean;
  isStatusUpgrade: boolean;
  isStatusDowngrade: boolean;
  isReturning: boolean;
} {
  const { previousStatus, currentStatus, impactRating } = update;
  
  let shouldAlert = false;
  let severity: AlertSeverity = "INFO";
  let isNewInjury = false;
  let isStatusUpgrade = false;
  let isStatusDowngrade = false;
  let isReturning = false;
  
  // Determine if this is worth alerting
  const isCurrentWorthy = ALERT_WORTHY_STATUSES.includes(currentStatus);
  const wasPreviousWorthy = previousStatus ? ALERT_WORTHY_STATUSES.includes(previousStatus) : false;
  
  // New injury (no previous status or was healthy)
  if (!previousStatus || previousStatus === "Healthy" || previousStatus === "Probable") {
    if (isCurrentWorthy) {
      isNewInjury = true;
      shouldAlert = true;
    }
  }
  
  // Status change
  if (previousStatus && previousStatus !== currentStatus) {
    const prevSeverity = STATUS_SEVERITY[previousStatus];
    const currSeverity = STATUS_SEVERITY[currentStatus];
    
    if (currSeverity > prevSeverity) {
      // Getting worse
      isStatusDowngrade = true;
      shouldAlert = isCurrentWorthy;
    } else if (currSeverity < prevSeverity) {
      // Getting better
      isStatusUpgrade = true;
      // Alert on return from serious injury
      if (wasPreviousWorthy && (currentStatus === "Healthy" || currentStatus === "Probable")) {
        isReturning = true;
        shouldAlert = true;
      }
    }
  }
  
  // Determine severity based on status and impact
  if (shouldAlert) {
    severity = determineSeverity(currentStatus, impactRating, {
      isNewInjury,
      isStatusDowngrade,
      isReturning,
    });
  }
  
  return {
    shouldAlert,
    severity,
    isNewInjury,
    isStatusUpgrade,
    isStatusDowngrade,
    isReturning,
  };
}

/**
 * Determine alert severity based on status and player importance
 */
function determineSeverity(
  status: InjuryStatus,
  impactRating?: ImpactRating,
  context?: {
    isNewInjury?: boolean;
    isStatusDowngrade?: boolean;
    isReturning?: boolean;
  }
): AlertSeverity {
  const impact = impactRating || "MEDIUM";
  
  // IR/IL/PUP are always significant
  if (status === "IR" || status === "IL" || status === "PUP") {
    return impact === "HIGH" ? "CRITICAL" : "IMPACT";
  }
  
  // OUT status
  if (status === "OUT") {
    if (impact === "HIGH") return "CRITICAL";
    if (impact === "MEDIUM") return "IMPACT";
    return "NOTICE";
  }
  
  // Doubtful status
  if (status === "Doubtful") {
    if (impact === "HIGH") return "IMPACT";
    return "NOTICE";
  }
  
  // Questionable status
  if (status === "Questionable") {
    if (impact === "HIGH") return "NOTICE";
    return "INFO";
  }
  
  // Returning from injury
  if (context?.isReturning) {
    if (impact === "HIGH") return "NOTICE";
    return "INFO";
  }
  
  return "INFO";
}

// =====================================================
// ALERT GENERATION
// =====================================================

/**
 * Generate headline for an injury alert
 */
function generateHeadline(
  update: InjuryUpdate,
  analysis: ReturnType<typeof analyzeInjuryUpdate>
): string {
  const { playerName, teamKey, currentStatus, position } = update;
  const posStr = position ? ` (${position})` : "";
  
  if (analysis.isReturning) {
    return `${playerName}${posStr} cleared to return for ${teamKey}`;
  }
  
  if (analysis.isNewInjury) {
    return `${playerName}${posStr} ruled ${currentStatus} for ${teamKey}`;
  }
  
  if (analysis.isStatusDowngrade) {
    return `${playerName}${posStr} downgraded to ${currentStatus}`;
  }
  
  if (analysis.isStatusUpgrade) {
    return `${playerName}${posStr} upgraded to ${currentStatus}`;
  }
  
  return `${playerName}${posStr} listed as ${currentStatus}`;
}

/**
 * Generate body text for an injury alert
 */
function generateBody(
  update: InjuryUpdate,
  _analysis: ReturnType<typeof analyzeInjuryUpdate>
): string {
  void _analysis;
  const parts: string[] = [];
  const { playerName, teamName, previousStatus, currentStatus, injuryType, injuryDetails, estimatedReturn } = update;
  
  // Status change description
  if (previousStatus && previousStatus !== currentStatus) {
    parts.push(`${playerName} status changed from ${previousStatus} to ${currentStatus}.`);
  } else {
    parts.push(`${playerName} for ${teamName} is listed as ${currentStatus}.`);
  }
  
  // Injury details
  if (injuryType) {
    parts.push(`Injury: ${injuryType}${injuryDetails ? ` - ${injuryDetails}` : ""}.`);
  }
  
  // Return timeline
  if (estimatedReturn) {
    parts.push(`Estimated return: ${estimatedReturn}.`);
  }
  
  // Impact note
  if (update.impactRating === "HIGH") {
    parts.push("This is a key player for the team.");
  }
  
  return parts.join(" ");
}

/**
 * Create an injury alert object
 */
export function createInjuryAlert(
  userId: string,
  dataScope: DataScope,
  update: InjuryUpdate,
  analysis: ReturnType<typeof analyzeInjuryUpdate>
): InjuryAlert {
  const headline = generateHeadline(update, analysis);
  const body = generateBody(update, analysis);
  
  // Dedupe key: prevent duplicate alerts for same player status
  const dateKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const dedupeKey = `INJURY:${update.teamKey}:${update.playerName}:${update.currentStatus}:${dateKey}`;
  
  // Expiry: injury news expires after the relevant game(s)
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48 hours
  
  const sourceData: InjuryAlertData = {
    playerName: update.playerName,
    teamKey: update.teamKey,
    teamName: update.teamName,
    position: update.position,
    previousStatus: update.previousStatus,
    currentStatus: update.currentStatus,
    injuryType: update.injuryType,
    estimatedReturn: update.estimatedReturn,
    impactRating: update.impactRating,
    affectedGames: update.affectedGameIds,
  };
  
  // Deep link to team's injury report or first affected game
  const deepLink = update.affectedGameIds?.[0]
    ? `/game/${update.affectedGameIds[0]}`
    : `/team/${update.teamKey}`;
  
  return {
    userId,
    dataScope,
    category: "INJURY",
    severity: analysis.severity,
    headline,
    body,
    gameId: update.affectedGameIds?.[0],
    teamKey: update.teamKey,
    playerKey: update.playerId,
    sourceType: "INJURY_FEED",
    sourceData,
    deepLink,
    dedupeKey,
    expiresAt,
  };
}

// =====================================================
// DATABASE OPERATIONS
// =====================================================

/**
 * Fetch users who should receive injury alerts for a team
 */
export async function getUsersForInjuryAlerts(
  db: D1Database,
  teamKey: string,
  _dataScope: DataScope
): Promise<UserInjuryPrefs[]> {
  void _dataScope;
  // Get users who:
  // 1. Have injury alerts enabled
  // 2. Are following this team (via watchlist)
  
  const query = `
    SELECT DISTINCT 
      sap.user_id,
      sap.category_injury
    FROM scout_alert_preferences sap
    WHERE sap.category_injury = 1
    AND EXISTS (
      SELECT 1 FROM watchlist_items wi 
      WHERE wi.user_id = sap.user_id 
      AND wi.item_type = 'TEAM'
      AND wi.item_id = ?
    )
  `;
  
  const result = await db.prepare(query).bind(teamKey).all();
  
  return ((result.results || []) as Record<string, unknown>[]).map(row => ({
    userId: row.user_id as string,
    categoryInjury: Boolean(row.category_injury),
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
 * Insert a new injury alert into the database
 */
export async function insertInjuryAlert(
  db: D1Database,
  alert: InjuryAlert
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
      game_id, team_key, player_key, source_type, source_data_json, deep_link,
      dedupe_key, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    alert.dataScope,
    alert.userId,
    alert.category,
    alert.severity,
    normalizedCopy.title,
    normalizedCopy.body || "",
    alert.gameId || null,
    alert.teamKey,
    alert.playerKey || null,
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

export interface InjuryTriggerResult {
  processed: boolean;
  alertsCreated: number;
  userIds: string[];
  severity: AlertSeverity;
  details: {
    playerName: string;
    teamKey: string;
    previousStatus?: string;
    currentStatus: string;
    isNewInjury: boolean;
    isReturning: boolean;
  };
}

/**
 * Main entry point: Process an injury update and create alerts for relevant users
 */
export async function triggerInjuryAlerts(
  db: D1Database,
  update: InjuryUpdate,
  dataScope: DataScope
): Promise<InjuryTriggerResult> {
  // Analyze the injury update
  const injuryAnalysis = analyzeInjuryUpdate(update);
  
  const result: InjuryTriggerResult = {
    processed: injuryAnalysis.shouldAlert,
    alertsCreated: 0,
    userIds: [],
    severity: injuryAnalysis.severity,
    details: {
      playerName: update.playerName,
      teamKey: update.teamKey,
      previousStatus: update.previousStatus,
      currentStatus: update.currentStatus,
      isNewInjury: injuryAnalysis.isNewInjury,
      isReturning: injuryAnalysis.isReturning,
    },
  };
  
  // Skip if not worthy of alert
  if (!injuryAnalysis.shouldAlert) {
    return result;
  }
  
  // Get users who should receive this alert
  const users = await getUsersForInjuryAlerts(db, update.teamKey, dataScope);
  
  // Create and insert alerts for each user
  for (const user of users) {
    const alert = createInjuryAlert(user.userId, dataScope, update, injuryAnalysis);
    const alertId = await insertInjuryAlert(db, alert);
    
    if (alertId !== null) {
      result.alertsCreated++;
      result.userIds.push(user.userId);
    }
  }
  
  return result;
}

/**
 * Batch process multiple injury updates
 */
export async function triggerInjuryAlertsBatch(
  db: D1Database,
  updates: InjuryUpdate[],
  dataScope: DataScope
): Promise<{
  total: number;
  processed: number;
  alertsCreated: number;
  results: InjuryTriggerResult[];
}> {
  const results: InjuryTriggerResult[] = [];
  let processed = 0;
  let alertsCreated = 0;
  
  for (const update of updates) {
    const result = await triggerInjuryAlerts(db, update, dataScope);
    results.push(result);
    
    if (result.processed) {
      processed++;
      alertsCreated += result.alertsCreated;
    }
  }
  
  return {
    total: updates.length,
    processed,
    alertsCreated,
    results,
  };
}

// =====================================================
// DEMO / TESTING UTILITIES
// =====================================================

const DEMO_PLAYERS: ReadonlyArray<{ name: string; position: string; impact: ImpactRating }> = [
  { name: "Patrick Mahomes", position: "QB", impact: "HIGH" },
  { name: "Travis Kelce", position: "TE", impact: "HIGH" },
  { name: "Isiah Pacheco", position: "RB", impact: "MEDIUM" },
  { name: "Rashee Rice", position: "WR", impact: "MEDIUM" },
  { name: "Justin Watson", position: "WR", impact: "LOW" },
];

/**
 * Generate a sample injury update for testing
 */
export function generateDemoInjuryUpdate(
  sport: string = "NFL",
  teamKey: string = "KC",
  teamName: string = "Kansas City Chiefs",
  options: {
    severity?: "minor" | "moderate" | "major" | "returning";
    playerIndex?: number;
    affectedGameId?: string;
  } = {}
): InjuryUpdate {
  const playerIndex = options.playerIndex ?? Math.floor(Math.random() * DEMO_PLAYERS.length);
  const player = DEMO_PLAYERS[playerIndex % DEMO_PLAYERS.length];
  const updateSeverity = options.severity || "moderate";
  
  let previousStatus: InjuryStatus | undefined;
  let currentStatus: InjuryStatus;
  let injuryType: string;
  
  switch (updateSeverity) {
    case "minor":
      previousStatus = "Healthy";
      currentStatus = "Questionable";
      injuryType = "Ankle";
      break;
    case "moderate":
      previousStatus = "Questionable";
      currentStatus = "Doubtful";
      injuryType = "Knee";
      break;
    case "major":
      previousStatus = "Doubtful";
      currentStatus = "OUT";
      injuryType = "Hamstring";
      break;
    case "returning":
      previousStatus = "OUT";
      currentStatus = "Probable";
      injuryType = "Ankle (recovering)";
      break;
  }
  
  return {
    sport,
    teamKey,
    teamName,
    playerName: player.name,
    position: player.position,
    previousStatus,
    currentStatus,
    injuryType,
    impactRating: player.impact,
    affectedGameIds: options.affectedGameId ? [options.affectedGameId] : undefined,
    reportedAt: new Date().toISOString(),
    source: "Demo Feed",
  };
}

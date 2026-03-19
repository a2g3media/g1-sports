/**
 * Scoring Event Alert Trigger Engine
 * 
 * Generates Scout live commentary for every scoring event across all sports.
 * 
 * Supported scoring events:
 * - NFL: Touchdown, Field Goal, Safety, 2-Point Conversion
 * - NBA/WNBA/NCAA: Basket (2pt, 3pt), Free Throw
 * - MLB: Run scored
 * - NHL: Goal
 * - Soccer: Goal
 * - Combat Sports: Knockdown, Round end
 * - Tennis: Game, Set
 * - Golf: Milestone (eagle, birdie, etc.)
 * 
 * Commentary includes:
 * - Score update with game context
 * - Momentum analysis
 * - Efficiency or dominance indicators
 * - Contextual stats available at the moment
 * - Optional informational market context (line movement)
 * 
 * All commentary is neutral, analytical, and informational only.
 * NO betting advice or directives.
 */

import type {
  AlertCategory,
  AlertSeverity,
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

export type ScoringEventType =
  // NFL
  | "TOUCHDOWN"
  | "FIELD_GOAL"
  | "SAFETY"
  | "TWO_POINT_CONVERSION"
  | "EXTRA_POINT"
  
  // Basketball
  | "TWO_POINTER"
  | "THREE_POINTER"
  | "FREE_THROW"
  
  // Baseball
  | "RUN_SCORED"
  | "HOME_RUN"
  
  // Hockey
  | "GOAL"
  | "POWER_PLAY_GOAL"
  | "SHORT_HANDED_GOAL"
  | "EMPTY_NET_GOAL"
  
  // Soccer
  | "SOCCER_GOAL"
  | "PENALTY_GOAL"
  | "OWN_GOAL"
  
  // Combat
  | "KNOCKDOWN"
  | "ROUND_SCORED"
  
  // Other
  | "GENERIC_SCORE";

export interface ScoringEvent {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  scoringTeam: string; // Which team scored
  eventType: ScoringEventType;
  
  // Score state
  homeScore: number;
  awayScore: number;
  previousHomeScore: number;
  previousAwayScore: number;
  
  // Context
  period: string; // "Q1", "3rd Inning", "1st Half", etc.
  timeRemaining?: string;
  playerName?: string;
  
  // Additional context
  stats?: {
    // Momentum indicators
    scoringStreak?: number; // consecutive scores by same team
    leadChanges?: number;
    timesScoredThisPeriod?: number;
    
    // Efficiency
    yardsOnDrive?: number;
    playsOnDrive?: number;
    timeOfPossession?: string;
    
    // Market context (optional, informational only)
    liveLineMovement?: {
      previousLine: number;
      currentLine: number;
      asOf: string;
    };
  };
  
  detectedAt: string;
}

export interface ScoringEventAlert {
  userId: string;
  dataScope: DataScope;
  category: AlertCategory;
  severity: AlertSeverity;
  headline: string;
  body: string;
  gameId: string;
  teamKey?: string;
  playerKey?: string;
  sourceType: "LIVE_SCORES";
  sourceData: {
    eventType: ScoringEventType;
    scoringTeam: string;
    homeScore: number;
    awayScore: number;
    period: string;
    commentary: string;
    momentum: "SURGE" | "STEADY" | "NEUTRAL";
    marketContext?: {
      lineMovement: string;
      asOf: string;
    };
  };
  deepLink: string;
  dedupeKey: string;
  expiresAt?: string;
}

// =====================================================
// ANALYSIS LOGIC
// =====================================================

/**
 * Analyze momentum based on scoring context
 */
export function analyzeMomentum(event: ScoringEvent): "SURGE" | "STEADY" | "NEUTRAL" {
  const stats = event.stats || {};
  const scoringStreak = stats.scoringStreak || 0;
  const leadChanges = stats.leadChanges || 0;
  
  // Surge: multiple consecutive scores or lead change
  if (scoringStreak >= 2 || leadChanges > 0) {
    return "SURGE";
  }
  
  // Steady: one score, no special momentum
  if (scoringStreak === 1) {
    return "STEADY";
  }
  
  return "NEUTRAL";
}

/**
 * Generate NFL scoring commentary
 */
export function generateNFLCommentary(event: ScoringEvent): string {
  const { scoringTeam, eventType, homeScore, awayScore, period, stats } = event;
  const parts: string[] = [];
  
  // Score update
  const scoreText = `${event.homeTeam} ${homeScore}, ${event.awayTeam} ${awayScore}`;
  
  switch (eventType) {
    case "TOUCHDOWN":
      parts.push(`${scoringTeam} touchdown! ${scoreText}.`);
      if (stats?.yardsOnDrive) {
        parts.push(`${stats.yardsOnDrive}-yard drive in ${stats.playsOnDrive || '?'} plays.`);
      }
      break;
    case "FIELD_GOAL":
      parts.push(`${scoringTeam} field goal. ${scoreText}.`);
      break;
    case "SAFETY":
      parts.push(`Safety! ${scoringTeam} gets 2 points. ${scoreText}.`);
      break;
    default:
      parts.push(`${scoringTeam} scores. ${scoreText}.`);
  }
  
  // Momentum analysis
  const momentum = analyzeMomentum(event);
  if (momentum === "SURGE") {
    if (stats?.scoringStreak && stats.scoringStreak >= 2) {
      parts.push(`${scoringTeam} on a ${stats.scoringStreak}-score run.`);
    }
  }
  
  // Lead context
  const scoreDiff = Math.abs(homeScore - awayScore);
  const leader = homeScore > awayScore ? event.homeTeam : event.awayTeam;
  if (scoreDiff > 0) {
    parts.push(`${leader} leads by ${scoreDiff} in ${period}.`);
  } else {
    parts.push(`Game tied at ${homeScore} in ${period}.`);
  }
  
  return parts.join(" ");
}

/**
 * Generate NBA scoring commentary
 */
export function generateNBACommentary(event: ScoringEvent): string {
  const { scoringTeam, eventType, homeScore, awayScore, period, playerName } = event;
  const parts: string[] = [];
  
  const scoreText = `${event.homeTeam} ${homeScore}, ${event.awayTeam} ${awayScore}`;
  const player = playerName ? ` (${playerName})` : "";
  
  switch (eventType) {
    case "THREE_POINTER":
      parts.push(`${scoringTeam} three${player}! ${scoreText}.`);
      break;
    case "TWO_POINTER":
      parts.push(`${scoringTeam} basket${player}. ${scoreText}.`);
      break;
    case "FREE_THROW":
      parts.push(`${scoringTeam} free throw${player}. ${scoreText}.`);
      break;
    default:
      parts.push(`${scoringTeam} scores${player}. ${scoreText}.`);
  }
  
  // Run analysis
  const scoreDiff = Math.abs(homeScore - awayScore);
  const leader = homeScore > awayScore ? event.homeTeam : event.awayTeam;
  
  const momentum = analyzeMomentum(event);
  if (momentum === "SURGE" && event.stats?.scoringStreak) {
    const runSize = event.stats.scoringStreak * (eventType === "THREE_POINTER" ? 3 : 2);
    parts.push(`${scoringTeam} on a ${runSize}-0 run.`);
  } else if (scoreDiff > 0) {
    parts.push(`${leader} by ${scoreDiff} in ${period}.`);
  } else {
    parts.push(`Tied at ${homeScore} in ${period}.`);
  }
  
  return parts.join(" ");
}

/**
 * Generate MLB scoring commentary
 */
export function generateMLBCommentary(event: ScoringEvent): string {
  const { scoringTeam, eventType, homeScore, awayScore, period } = event;
  const parts: string[] = [];
  
  const scoreText = `${event.homeTeam} ${homeScore}, ${event.awayTeam} ${awayScore}`;
  
  if (eventType === "HOME_RUN") {
    parts.push(`${scoringTeam} home run! ${scoreText}.`);
  } else {
    parts.push(`${scoringTeam} scores. ${scoreText}.`);
  }
  
  // Lead context
  const scoreDiff = Math.abs(homeScore - awayScore);
  const leader = homeScore > awayScore ? event.homeTeam : event.awayTeam;
  
  if (scoreDiff > 0) {
    parts.push(`${leader} leads by ${scoreDiff} in the ${period}.`);
  } else {
    parts.push(`Tied at ${homeScore} in the ${period}.`);
  }
  
  return parts.join(" ");
}

/**
 * Generate NHL scoring commentary
 */
export function generateNHLCommentary(event: ScoringEvent): string {
  const { scoringTeam, eventType, homeScore, awayScore, period, playerName } = event;
  const parts: string[] = [];
  
  const scoreText = `${event.homeTeam} ${homeScore}, ${event.awayTeam} ${awayScore}`;
  const player = playerName ? ` (${playerName})` : "";
  
  switch (eventType) {
    case "POWER_PLAY_GOAL":
      parts.push(`${scoringTeam} power play goal${player}! ${scoreText}.`);
      break;
    case "SHORT_HANDED_GOAL":
      parts.push(`${scoringTeam} short-handed goal${player}! ${scoreText}.`);
      break;
    case "EMPTY_NET_GOAL":
      parts.push(`${scoringTeam} empty net goal${player}. ${scoreText}.`);
      break;
    default:
      parts.push(`${scoringTeam} goal${player}! ${scoreText}.`);
  }
  
  // Lead context
  const scoreDiff = Math.abs(homeScore - awayScore);
  const leader = homeScore > awayScore ? event.homeTeam : event.awayTeam;
  
  if (scoreDiff > 0) {
    parts.push(`${leader} leads by ${scoreDiff} in the ${period}.`);
  } else {
    parts.push(`Tied at ${homeScore} in the ${period}.`);
  }
  
  return parts.join(" ");
}

/**
 * Generate Soccer scoring commentary
 */
export function generateSoccerCommentary(event: ScoringEvent): string {
  const { scoringTeam, eventType, homeScore, awayScore, period, playerName } = event;
  const parts: string[] = [];
  
  const scoreText = `${event.homeTeam} ${homeScore}, ${event.awayTeam} ${awayScore}`;
  const player = playerName ? ` (${playerName})` : "";
  
  switch (eventType) {
    case "PENALTY_GOAL":
      parts.push(`${scoringTeam} penalty goal${player}! ${scoreText}.`);
      break;
    case "OWN_GOAL":
      parts.push(`Own goal! ${scoreText}.`);
      break;
    default:
      parts.push(`${scoringTeam} goal${player}! ${scoreText}.`);
  }
  
  // Lead context
  const scoreDiff = Math.abs(homeScore - awayScore);
  const leader = homeScore > awayScore ? event.homeTeam : event.awayTeam;
  
  if (scoreDiff > 0) {
    parts.push(`${leader} leads by ${scoreDiff} in the ${period}.`);
  } else {
    parts.push(`Tied at ${homeScore} in the ${period}.`);
  }
  
  return parts.join(" ");
}

/**
 * Main commentary generator dispatcher
 */
export function generateScoringCommentary(event: ScoringEvent): string {
  const sport = event.sport.toLowerCase();
  
  if (sport.includes('nfl') || sport.includes('football')) {
    return generateNFLCommentary(event);
  }
  
  if (sport.includes('nba') || sport.includes('wnba') || sport.includes('ncaab') || sport.includes('basketball')) {
    return generateNBACommentary(event);
  }
  
  if (sport.includes('mlb') || sport.includes('baseball')) {
    return generateMLBCommentary(event);
  }
  
  if (sport.includes('nhl') || sport.includes('hockey')) {
    return generateNHLCommentary(event);
  }
  
  if (sport.includes('soccer') || sport.includes('mls') || sport.includes('premier')) {
    return generateSoccerCommentary(event);
  }
  
  // Generic fallback
  const scoreText = `${event.homeTeam} ${event.homeScore}, ${event.awayTeam} ${event.awayScore}`;
  return `${event.scoringTeam} scores. ${scoreText} in ${event.period}.`;
}

/**
 * Determine alert severity based on scoring context
 */
export function determineSeverity(event: ScoringEvent): AlertSeverity {
  const momentum = analyzeMomentum(event);
  
  // High-impact scores: lead changes, big runs
  if (momentum === "SURGE") {
    return "IMPACT";
  }
  
  // Late-game scores (if time info available)
  const period = event.period.toLowerCase();
  if (period.includes('4th') || period.includes('q4') || period.includes('9th') || period.includes('overtime')) {
    const scoreDiff = Math.abs(event.homeScore - event.awayScore);
    if (scoreDiff <= 7) {
      return "IMPACT"; // Close late-game score
    }
  }
  
  // Default: regular scoring play
  return "NOTICE";
}

// =====================================================
// ALERT GENERATION
// =====================================================

/**
 * Create a scoring event alert object
 */
export function createScoringEventAlert(
  userId: string,
  dataScope: DataScope,
  event: ScoringEvent
): ScoringEventAlert {
  const commentary = generateScoringCommentary(event);
  const momentum = analyzeMomentum(event);
  const severity = determineSeverity(event);
  
  const headline = `${event.scoringTeam} Scores!`;
  const body = commentary;
  
  // Dedupe key: one alert per scoring event (use timestamp for uniqueness)
  const timestamp = event.detectedAt.slice(0, 19); // seconds precision
  const dedupeKey = `SCORING_EVENT:${event.gameId}:${timestamp}`;
  
  // Expiry: scoring events are ephemeral, 2 hours
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  
  // Market context (informational only)
  let marketContext: { lineMovement: string; asOf: string } | undefined;
  if (event.stats?.liveLineMovement) {
    const { previousLine, currentLine, asOf } = event.stats.liveLineMovement;
    const movement = currentLine > previousLine ? "+" : "";
    marketContext = {
      lineMovement: `Line moved from ${previousLine} to ${movement}${currentLine}`,
      asOf,
    };
  }
  
  return {
    userId,
    dataScope,
    category: "GAME_STATE",
    severity,
    headline,
    body,
    gameId: event.gameId,
    teamKey: event.scoringTeam,
    playerKey: event.playerName,
    sourceType: "LIVE_SCORES",
    sourceData: {
      eventType: event.eventType,
      scoringTeam: event.scoringTeam,
      homeScore: event.homeScore,
      awayScore: event.awayScore,
      period: event.period,
      commentary,
      momentum,
      marketContext,
    },
    deepLink: `/game/${event.gameId}`,
    dedupeKey,
    expiresAt,
  };
}

// =====================================================
// DATABASE OPERATIONS
// =====================================================

/**
 * Fetch users who should receive scoring event alerts for a game
 */
export async function getUsersForScoringEventAlerts(
  db: D1Database,
  gameId: string,
  dataScope: DataScope
): Promise<{ userId: string }[]> {
  const query = `
    SELECT DISTINCT gw.user_id
    FROM game_watchlist gw
    JOIN scout_alert_preferences sap ON sap.user_id = gw.user_id
    WHERE gw.game_id = ? 
    AND gw.data_scope = ?
    AND sap.category_game_state = 1
  `;
  
  const result = await db.prepare(query).bind(gameId, dataScope).all();
  
  return ((result.results || []) as Record<string, unknown>[]).map(row => ({
    userId: row.user_id as string,
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
 * Insert a new scoring event alert into the database
 */
export async function insertScoringEventAlert(
  db: D1Database,
  alert: ScoringEventAlert
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
      game_id, team_key, player_key, source_type, source_data_json,
      deep_link, dedupe_key, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    alert.dataScope,
    alert.userId,
    alert.category,
    alert.severity,
    normalizedCopy.title,
    normalizedCopy.body || "",
    alert.gameId,
    alert.teamKey || null,
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

export interface ScoringEventTriggerResult {
  processed: boolean;
  alertsCreated: number;
  userIds: string[];
  severity: AlertSeverity;
  eventType: ScoringEventType;
  scoringTeam: string;
}

/**
 * Main entry point: Process a scoring event and create alerts
 */
export async function triggerScoringEventAlerts(
  db: D1Database,
  event: ScoringEvent,
  dataScope: DataScope
): Promise<ScoringEventTriggerResult> {
  const severity = determineSeverity(event);
  
  const result: ScoringEventTriggerResult = {
    processed: true,
    alertsCreated: 0,
    userIds: [],
    severity,
    eventType: event.eventType,
    scoringTeam: event.scoringTeam,
  };
  
  // Get users who should receive this alert
  const users = await getUsersForScoringEventAlerts(
    db,
    event.gameId,
    dataScope
  );
  
  // Create and insert alerts for each user
  for (const user of users) {
    const alert = createScoringEventAlert(user.userId, dataScope, event);
    const alertId = await insertScoringEventAlert(db, alert);
    
    if (alertId !== null) {
      result.alertsCreated++;
      result.userIds.push(user.userId);
    }
  }
  
  return result;
}

// =====================================================
// BATCH PROCESSING
// =====================================================

/**
 * Process multiple scoring events in batch
 */
export async function triggerScoringEventAlertsBatch(
  db: D1Database,
  events: ScoringEvent[],
  dataScope: DataScope
): Promise<ScoringEventTriggerResult[]> {
  const results: ScoringEventTriggerResult[] = [];
  
  for (const event of events) {
    const result = await triggerScoringEventAlerts(db, event, dataScope);
    results.push(result);
  }
  
  return results;
}

// =====================================================
// DEMO / TESTING UTILITIES
// =====================================================

/**
 * Generate a sample scoring event for testing
 */
export function generateDemoScoringEvent(
  gameId: string,
  sport: string,
  homeTeam: string,
  awayTeam: string,
  options: {
    eventType?: ScoringEventType;
    scoringTeam?: string;
    playerName?: string;
    period?: string;
    homeScore?: number;
    awayScore?: number;
    previousHomeScore?: number;
    previousAwayScore?: number;
    scoringStreak?: number;
  } = {}
): ScoringEvent {
  const scoringTeam = options.scoringTeam || homeTeam;
  const eventType = options.eventType || "TOUCHDOWN";
  const period = options.period || "Q2";
  const playerName = options.playerName;
  
  const previousHomeScore = options.previousHomeScore ?? 14;
  const previousAwayScore = options.previousAwayScore ?? 10;
  
  let pointsScored = 0;
  switch (eventType) {
    case "TOUCHDOWN":
      pointsScored = 6;
      break;
    case "FIELD_GOAL":
      pointsScored = 3;
      break;
    case "THREE_POINTER":
      pointsScored = 3;
      break;
    case "TWO_POINTER":
    case "SAFETY":
      pointsScored = 2;
      break;
    case "GOAL":
    case "SOCCER_GOAL":
    case "RUN_SCORED":
      pointsScored = 1;
      break;
    default:
      pointsScored = 1;
  }
  
  const homeScore = scoringTeam === homeTeam 
    ? previousHomeScore + pointsScored 
    : previousHomeScore;
  const awayScore = scoringTeam === awayTeam 
    ? previousAwayScore + pointsScored 
    : previousAwayScore;
  
  return {
    gameId,
    sport,
    homeTeam,
    awayTeam,
    scoringTeam,
    eventType,
    homeScore: options.homeScore ?? homeScore,
    awayScore: options.awayScore ?? awayScore,
    previousHomeScore,
    previousAwayScore,
    period,
    playerName,
    stats: {
      scoringStreak: options.scoringStreak || 1,
      yardsOnDrive: eventType === "TOUCHDOWN" ? 75 : undefined,
      playsOnDrive: eventType === "TOUCHDOWN" ? 8 : undefined,
    },
    detectedAt: new Date().toISOString(),
  };
}

/**
 * Generate demo scoring event scenarios
 */
export function generateDemoScoringEventScenarios(): ScoringEvent[] {
  return [
    // NFL touchdown
    generateDemoScoringEvent('game_001', 'NFL', 'Ravens', '49ers', {
      eventType: 'TOUCHDOWN',
      scoringTeam: 'Ravens',
      playerName: 'Lamar Jackson',
      period: 'Q2',
      homeScore: 21,
      awayScore: 14,
      previousHomeScore: 14,
      previousAwayScore: 14,
    }),
    
    // NBA three-pointer on a run
    generateDemoScoringEvent('game_002', 'NBA', 'Lakers', 'Warriors', {
      eventType: 'THREE_POINTER',
      scoringTeam: 'Lakers',
      playerName: 'LeBron James',
      period: 'Q3',
      homeScore: 78,
      awayScore: 72,
      scoringStreak: 3,
    }),
    
    // MLB home run
    generateDemoScoringEvent('game_003', 'MLB', 'Yankees', 'Red Sox', {
      eventType: 'HOME_RUN',
      scoringTeam: 'Yankees',
      playerName: 'Aaron Judge',
      period: '7th Inning',
      homeScore: 4,
      awayScore: 3,
    }),
    
    // NHL power play goal
    generateDemoScoringEvent('game_004', 'NHL', 'Bruins', 'Maple Leafs', {
      eventType: 'POWER_PLAY_GOAL',
      scoringTeam: 'Bruins',
      playerName: 'David Pastrnak',
      period: '2nd',
      homeScore: 3,
      awayScore: 2,
    }),
    
    // Soccer goal
    generateDemoScoringEvent('game_005', 'Soccer', 'Manchester City', 'Liverpool', {
      eventType: 'SOCCER_GOAL',
      scoringTeam: 'Manchester City',
      playerName: 'Erling Haaland',
      period: '1st Half',
      homeScore: 1,
      awayScore: 0,
    }),
  ];
}

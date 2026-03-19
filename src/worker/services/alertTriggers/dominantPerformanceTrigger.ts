/**
 * Dominant Performance Alert Trigger Engine
 * 
 * Detects exceptional performances across different sports:
 * - MLB: No-hitters, perfect games, strikeout milestones, pitch efficiency
 * - NBA: High-usage scoring quarters, defensive dominance, foul trouble
 * - NFL: Defensive dominance, QB pressure, turnover trends
 * - NHL: Shutout watches, goal-scoring streaks
 * - Soccer: Shot volume pressure, possession dominance, defensive stands
 * - Combat Sports: Round dominance, knockdown watches
 * 
 * All alerts are informational only - neutral, analytical commentary.
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

export type PerformanceType =
  // Baseball
  | "NO_HITTER_WATCH"
  | "PERFECT_GAME_WATCH"
  | "STRIKEOUT_MILESTONE"
  | "PITCH_EFFICIENCY"
  
  // Basketball
  | "SCORING_ERUPTION"
  | "FOUL_TROUBLE"
  | "DEFENSIVE_SHUTDOWN"
  
  // Football
  | "DEFENSIVE_DOMINANCE"
  | "QB_PRESSURE"
  | "TURNOVER_TREND"
  
  // Hockey
  | "SHUTOUT_WATCH"
  | "SCORING_STREAK"
  
  // Soccer
  | "SHOT_PRESSURE"
  | "POSSESSION_DOMINANCE"
  | "DEFENSIVE_STAND"
  
  // Combat
  | "ROUND_DOMINANCE"
  | "KNOCKDOWN_WATCH";

export interface DominantPerformance {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  performanceType: PerformanceType;
  
  // Context
  playerName?: string;
  teamKey?: string;
  period?: string;
  
  // Stats that triggered detection
  stats: Record<string, number | string>;
  
  // Metadata
  impactRating: "HIGH" | "MEDIUM" | "LOW";
  detectedAt: string;
}

export interface DominantPerformanceAlert {
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
    performanceType: PerformanceType;
    stats: Record<string, number | string>;
    period?: string;
    impactRating: string;
  };
  deepLink: string;
  dedupeKey: string;
  expiresAt?: string;
}

// =====================================================
// ANALYSIS LOGIC
// =====================================================

/**
 * Analyze MLB pitching performance for no-hitter/perfect game watches
 */
export function analyzeMLBPitching(
  performance: DominantPerformance
): {
  shouldAlert: boolean;
  severity: AlertSeverity;
  commentary: string;
} {
  const { stats, period } = performance;
  const inning = parseInt(period || "0", 10);
  const hits = (stats.hits_allowed as number) || 0;
  const walks = (stats.walks_allowed as number) || 0;
  const strikeouts = (stats.strikeouts as number) || 0;
  
  // Perfect game watch (5th inning+, no hits, no walks)
  if (inning >= 5 && hits === 0 && walks === 0) {
    return {
      shouldAlert: true,
      severity: inning >= 7 ? "IMPACT" : "NOTICE",
      commentary: `Perfect game watch through ${inning} innings. ${strikeouts} strikeouts, no baserunners allowed.`,
    };
  }
  
  // No-hitter watch (5th inning+, no hits)
  if (inning >= 5 && hits === 0) {
    return {
      shouldAlert: true,
      severity: inning >= 7 ? "IMPACT" : "NOTICE",
      commentary: `No-hitter watch through ${inning} innings. ${strikeouts} strikeouts, ${walks} walks allowed.`,
    };
  }
  
  // Strikeout milestone (10+ Ks)
  if (strikeouts >= 10) {
    return {
      shouldAlert: true,
      severity: strikeouts >= 15 ? "IMPACT" : "NOTICE",
      commentary: `Dominant pitching performance: ${strikeouts} strikeouts through ${inning} innings.`,
    };
  }
  
  return { shouldAlert: false, severity: "INFO", commentary: "" };
}

/**
 * Analyze NBA scoring performance
 */
export function analyzeNBAScoringEruption(
  performance: DominantPerformance
): {
  shouldAlert: boolean;
  severity: AlertSeverity;
  commentary: string;
} {
  const { stats, period } = performance;
  const points = (stats.points as number) || 0;
  const quarter = period || "Q1";
  const fgm = (stats.field_goals_made as number) || 0;
  const fga = (stats.field_goals_attempted as number) || 0;
  const efficiency = fga > 0 ? (fgm / fga * 100).toFixed(1) : "0.0";
  
  // Scoring eruption: 15+ points in a quarter
  if (points >= 15) {
    return {
      shouldAlert: true,
      severity: points >= 20 ? "IMPACT" : "NOTICE",
      commentary: `${points}-point ${quarter} on ${efficiency}% shooting (${fgm}/${fga}).`,
    };
  }
  
  return { shouldAlert: false, severity: "INFO", commentary: "" };
}

/**
 * Analyze NFL defensive dominance
 */
export function analyzeNFLDefense(
  performance: DominantPerformance
): {
  shouldAlert: boolean;
  severity: AlertSeverity;
  commentary: string;
} {
  const { stats, period } = performance;
  const yardsAllowed = (stats.yards_allowed as number) || 0;
  const sacks = (stats.sacks as number) || 0;
  const turnovers = (stats.turnovers_forced as number) || 0;
  const quarter = period || "Q1";
  
  // Defensive shutdown (very low yards allowed)
  if (yardsAllowed <= 50 && parseInt(period || "1", 10) >= 2) {
    return {
      shouldAlert: true,
      severity: "IMPACT",
      commentary: `Defensive dominance through ${quarter}: ${yardsAllowed} yards allowed, ${sacks} sacks, ${turnovers} turnovers forced.`,
    };
  }
  
  // Sack/pressure dominance
  if (sacks >= 4) {
    return {
      shouldAlert: true,
      severity: "NOTICE",
      commentary: `QB under siege: ${sacks} sacks through ${quarter}.`,
    };
  }
  
  // Turnover trend
  if (turnovers >= 3) {
    return {
      shouldAlert: true,
      severity: "IMPACT",
      commentary: `Defensive playmakers: ${turnovers} turnovers forced through ${quarter}.`,
    };
  }
  
  return { shouldAlert: false, severity: "INFO", commentary: "" };
}

/**
 * Analyze NHL shutout performance
 */
export function analyzeNHLShutout(
  performance: DominantPerformance
): {
  shouldAlert: boolean;
  severity: AlertSeverity;
  commentary: string;
} {
  const { stats, period } = performance;
  const goalsAllowed = (stats.goals_allowed as number) || 0;
  const saves = (stats.saves as number) || 0;
  const shotsFaced = (stats.shots_faced as number) || 0;
  const periodNum = parseInt(period || "1", 10);
  
  // Shutout watch (2nd period+, no goals)
  if (periodNum >= 2 && goalsAllowed === 0) {
    const savePercentage = shotsFaced > 0 ? ((saves / shotsFaced) * 100).toFixed(1) : "0.0";
    return {
      shouldAlert: true,
      severity: periodNum >= 3 ? "IMPACT" : "NOTICE",
      commentary: `Shutout watch through ${periodNum} periods. ${saves} saves on ${shotsFaced} shots (${savePercentage}% save rate).`,
    };
  }
  
  return { shouldAlert: false, severity: "INFO", commentary: "" };
}

/**
 * Analyze soccer possession/shot dominance
 */
export function analyzeSoccerDominance(
  performance: DominantPerformance
): {
  shouldAlert: boolean;
  severity: AlertSeverity;
  commentary: string;
} {
  const { stats, period } = performance;
  const possession = (stats.possession_pct as number) || 50;
  const shots = (stats.shots as number) || 0;
  const shotsOnTarget = (stats.shots_on_target as number) || 0;
  const half = period || "1st Half";
  
  // Possession dominance (70%+)
  if (possession >= 70) {
    return {
      shouldAlert: true,
      severity: possession >= 75 ? "IMPACT" : "NOTICE",
      commentary: `Possession dominance: ${possession}% possession with ${shots} shots (${shotsOnTarget} on target) in ${half}.`,
    };
  }
  
  // Shot pressure (10+ shots)
  if (shots >= 10) {
    return {
      shouldAlert: true,
      severity: shots >= 15 ? "IMPACT" : "NOTICE",
      commentary: `Shot volume pressure: ${shots} shots (${shotsOnTarget} on target) in ${half}.`,
    };
  }
  
  return { shouldAlert: false, severity: "INFO", commentary: "" };
}

/**
 * Main analysis dispatcher based on performance type
 */
export function analyzeDominantPerformance(
  performance: DominantPerformance
): {
  shouldAlert: boolean;
  severity: AlertSeverity;
  commentary: string;
} {
  switch (performance.performanceType) {
    case "NO_HITTER_WATCH":
    case "PERFECT_GAME_WATCH":
    case "STRIKEOUT_MILESTONE":
      return analyzeMLBPitching(performance);
      
    case "SCORING_ERUPTION":
      return analyzeNBAScoringEruption(performance);
      
    case "DEFENSIVE_DOMINANCE":
    case "QB_PRESSURE":
    case "TURNOVER_TREND":
      return analyzeNFLDefense(performance);
      
    case "SHUTOUT_WATCH":
      return analyzeNHLShutout(performance);
      
    case "SHOT_PRESSURE":
    case "POSSESSION_DOMINANCE":
      return analyzeSoccerDominance(performance);
      
    default:
      return { shouldAlert: false, severity: "INFO", commentary: "" };
  }
}

// =====================================================
// ALERT GENERATION
// =====================================================

/**
 * Generate headline for a dominant performance alert
 */
function generateHeadline(
  performance: DominantPerformance,
  _commentary: string
): string {
  void _commentary;
  const { performanceType, playerName, teamKey, homeTeam, awayTeam } = performance;
  const matchup = `${awayTeam} @ ${homeTeam}`;
  
  // Player-specific performances
  if (playerName) {
    switch (performanceType) {
      case "NO_HITTER_WATCH":
        return `No-Hitter Watch: ${playerName}`;
      case "PERFECT_GAME_WATCH":
        return `Perfect Game Watch: ${playerName}`;
      case "STRIKEOUT_MILESTONE":
        return `Strikeout Watch: ${playerName}`;
      case "SCORING_ERUPTION":
        return `Scoring Eruption: ${playerName}`;
      case "SHUTOUT_WATCH":
        return `Shutout Watch: ${playerName}`;
      default:
        return `Dominant Performance: ${playerName}`;
    }
  }
  
  // Team-specific performances
  const team = teamKey || homeTeam;
  switch (performanceType) {
    case "DEFENSIVE_DOMINANCE":
      return `Defensive Dominance: ${team}`;
    case "QB_PRESSURE":
      return `QB Under Pressure: ${matchup}`;
    case "TURNOVER_TREND":
      return `Turnover Trend: ${team}`;
    case "SHOT_PRESSURE":
      return `Shot Pressure: ${team}`;
    case "POSSESSION_DOMINANCE":
      return `Possession Control: ${team}`;
    case "DEFENSIVE_STAND":
      return `Defensive Stand: ${team}`;
    default:
      return `Dominant Performance: ${matchup}`;
  }
}

/**
 * Generate body text for a dominant performance alert
 */
function generateBody(
  performance: DominantPerformance,
  analysisCommentary: string
): string {
  const { playerName, teamKey, homeTeam, awayTeam, period } = performance;
  const matchup = `${awayTeam} at ${homeTeam}`;
  const entity = playerName || teamKey || homeTeam;
  const periodInfo = period ? ` as of ${period}` : "";
  
  return `${entity} showing exceptional performance in ${matchup}${periodInfo}. ${analysisCommentary}`;
}

/**
 * Create a dominant performance alert object
 */
export function createDominantPerformanceAlert(
  userId: string,
  dataScope: DataScope,
  performance: DominantPerformance,
  analysis: ReturnType<typeof analyzeDominantPerformance>
): DominantPerformanceAlert {
  const headline = generateHeadline(performance, analysis.commentary);
  const body = generateBody(performance, analysis.commentary);
  
  // Dedupe key: one alert per game per performance type per hour
  const hourStamp = performance.detectedAt.slice(0, 13);
  const dedupeKey = `DOMINANT_PERF:${performance.gameId}:${performance.performanceType}:${hourStamp}`;
  
  // Expiry: performance alerts last 4 hours
  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
  
  return {
    userId,
    dataScope,
    category: "GAME_STATE", // Using GAME_STATE category for live game alerts
    severity: analysis.severity,
    headline,
    body,
    gameId: performance.gameId,
    teamKey: performance.teamKey,
    playerKey: performance.playerName, // Could be enhanced with actual player ID
    sourceType: "LIVE_SCORES",
    sourceData: {
      performanceType: performance.performanceType,
      stats: performance.stats,
      period: performance.period,
      impactRating: performance.impactRating,
    },
    deepLink: `/game/${performance.gameId}`,
    dedupeKey,
    expiresAt,
  };
}

// =====================================================
// DATABASE OPERATIONS
// =====================================================

/**
 * Fetch users who should receive dominant performance alerts for a game
 */
export async function getUsersForDominantPerformanceAlerts(
  db: D1Database,
  gameId: string,
  dataScope: DataScope
): Promise<{ userId: string }[]> {
  // Users who:
  // 1. Are watching the game
  // 2. Have game state alerts enabled (we use this for live game events)
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
 * Insert a new dominant performance alert into the database
 */
export async function insertDominantPerformanceAlert(
  db: D1Database,
  alert: DominantPerformanceAlert
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

export interface DominantPerformanceTriggerResult {
  processed: boolean;
  alertsCreated: number;
  userIds: string[];
  severity: AlertSeverity;
  performanceType: PerformanceType;
}

/**
 * Main entry point: Process a dominant performance and create alerts
 */
export async function triggerDominantPerformanceAlerts(
  db: D1Database,
  performance: DominantPerformance,
  dataScope: DataScope
): Promise<DominantPerformanceTriggerResult> {
  const analysis = analyzeDominantPerformance(performance);
  
  const result: DominantPerformanceTriggerResult = {
    processed: analysis.shouldAlert,
    alertsCreated: 0,
    userIds: [],
    severity: analysis.severity,
    performanceType: performance.performanceType,
  };
  
  if (!analysis.shouldAlert) {
    return result;
  }
  
  // Get users who should receive this alert
  const users = await getUsersForDominantPerformanceAlerts(
    db,
    performance.gameId,
    dataScope
  );
  
  // Create and insert alerts for each user
  for (const user of users) {
    const alert = createDominantPerformanceAlert(user.userId, dataScope, performance, analysis);
    const alertId = await insertDominantPerformanceAlert(db, alert);
    
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
 * Process multiple dominant performances in batch
 */
export async function triggerDominantPerformanceAlertsBatch(
  db: D1Database,
  performances: DominantPerformance[],
  dataScope: DataScope
): Promise<DominantPerformanceTriggerResult[]> {
  const results: DominantPerformanceTriggerResult[] = [];
  
  for (const performance of performances) {
    const result = await triggerDominantPerformanceAlerts(db, performance, dataScope);
    results.push(result);
  }
  
  return results;
}

// =====================================================
// DEMO / TESTING UTILITIES
// =====================================================

/**
 * Generate a sample dominant performance for testing
 */
export function generateDemoDominantPerformance(
  gameId: string,
  sport: string,
  homeTeam: string,
  awayTeam: string,
  options: {
    type?: PerformanceType;
    playerName?: string;
    teamKey?: string;
    period?: string;
  } = {}
): DominantPerformance {
  const performanceType = options.type || "NO_HITTER_WATCH";
  const playerName = options.playerName;
  const teamKey = options.teamKey || homeTeam;
  const period = options.period || "6";
  
  let stats: Record<string, number | string> = {};
  let impactRating: "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
  
  switch (performanceType) {
    case "NO_HITTER_WATCH":
      stats = {
        hits_allowed: 0,
        walks_allowed: 2,
        strikeouts: 8,
        pitches: 87,
      };
      impactRating = "HIGH";
      break;
      
    case "PERFECT_GAME_WATCH":
      stats = {
        hits_allowed: 0,
        walks_allowed: 0,
        strikeouts: 10,
        pitches: 72,
      };
      impactRating = "HIGH";
      break;
      
    case "STRIKEOUT_MILESTONE":
      stats = {
        strikeouts: 12,
        hits_allowed: 3,
        walks_allowed: 1,
      };
      impactRating = "MEDIUM";
      break;
      
    case "SCORING_ERUPTION":
      stats = {
        points: 18,
        field_goals_made: 7,
        field_goals_attempted: 10,
      };
      impactRating = "HIGH";
      break;
      
    case "DEFENSIVE_DOMINANCE":
      stats = {
        yards_allowed: 42,
        sacks: 3,
        turnovers_forced: 2,
      };
      impactRating = "HIGH";
      break;
      
    case "SHUTOUT_WATCH":
      stats = {
        goals_allowed: 0,
        saves: 28,
        shots_faced: 28,
      };
      impactRating = "HIGH";
      break;
      
    case "POSSESSION_DOMINANCE":
      stats = {
        possession_pct: 72,
        shots: 14,
        shots_on_target: 7,
      };
      impactRating = "MEDIUM";
      break;
  }
  
  return {
    gameId,
    sport,
    homeTeam,
    awayTeam,
    performanceType,
    playerName,
    teamKey,
    period,
    stats,
    impactRating,
    detectedAt: new Date().toISOString(),
  };
}

/**
 * Generate multiple demo performances for different scenarios
 */
export function generateDemoPerformanceScenarios(): DominantPerformance[] {
  return [
    generateDemoDominantPerformance(
      "game_001",
      "MLB",
      "Yankees",
      "Red Sox",
      {
        type: "NO_HITTER_WATCH",
        playerName: "Gerrit Cole",
        period: "7",
      }
    ),
    generateDemoDominantPerformance(
      "game_002",
      "NBA",
      "Lakers",
      "Warriors",
      {
        type: "SCORING_ERUPTION",
        playerName: "LeBron James",
        period: "Q3",
      }
    ),
    generateDemoDominantPerformance(
      "game_003",
      "NFL",
      "49ers",
      "Cowboys",
      {
        type: "DEFENSIVE_DOMINANCE",
        teamKey: "49ers",
        period: "Q3",
      }
    ),
    generateDemoDominantPerformance(
      "game_004",
      "NHL",
      "Bruins",
      "Maple Leafs",
      {
        type: "SHUTOUT_WATCH",
        playerName: "Linus Ullmark",
        period: "2",
      }
    ),
    generateDemoDominantPerformance(
      "game_005",
      "Soccer",
      "Manchester City",
      "Liverpool",
      {
        type: "POSSESSION_DOMINANCE",
        teamKey: "Manchester City",
        period: "1st Half",
      }
    ),
  ];
}

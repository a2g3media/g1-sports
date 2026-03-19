/**
 * Period Break Summary Alert Trigger Engine
 * 
 * Generates Scout commentary at the end of quarters, innings, periods, and halves
 * across all sports. Summaries explain the score, identify controlling units,
 * note constraints, and suggest what to watch next.
 * 
 * CRITICAL: Summaries are generated for ALL period breaks, including scoreless periods.
 * 
 * Supported sports:
 * - NFL: End of each quarter
 * - NBA/WNBA/NCAAB: End of each quarter
 * - MLB: End of each inning (or every 3 innings)
 * - NHL: End of each period
 * - Soccer: End of each half
 * - Combat: End of each round
 * 
 * All commentary is neutral, analytical, and informational only.
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

export interface PeriodBreakSummary {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  period: string; // "Q1", "3rd", "1st Half", etc.
  
  // Score
  homeScore: number;
  awayScore: number;
  
  // Game stats for analysis
  stats: {
    // Common
    homeYardsOrPossession?: number;
    awayYardsOrPossession?: number;
    
    // NFL
    homeTotalYards?: number;
    awayTotalYards?: number;
    homePassingYards?: number;
    awayPassingYards?: number;
    homeRushingYards?: number;
    awayRushingYards?: number;
    homeTurnovers?: number;
    awayTurnovers?: number;
    
    // NBA
    homeFieldGoalPct?: number;
    awayFieldGoalPct?: number;
    homeRebounds?: number;
    awayRebounds?: number;
    homeTurnoversCount?: number;
    awayTurnoversCount?: number;
    
    // MLB
    homeHits?: number;
    awayHits?: number;
    homeErrors?: number;
    awayErrors?: number;
    homeLeftOnBase?: number;
    awayLeftOnBase?: number;
    
    // NHL
    homeShotsOnGoal?: number;
    awayShotsOnGoal?: number;
    homePowerPlayGoals?: number;
    awayPowerPlayGoals?: number;
    homePenaltyMinutes?: number;
    awayPenaltyMinutes?: number;
    
    // Soccer
    homePossessionPct?: number;
    awayPossessionPct?: number;
    homeShots?: number;
    awayShots?: number;
    homeShotsOnTarget?: number;
    awayShotsOnTarget?: number;
    homeCorners?: number;
    awayCorners?: number;
    
    // Weather/conditions
    weatherCondition?: string;
    temperature?: number;
    windSpeed?: number;
  };
  
  detectedAt: string;
}

export interface PeriodBreakAlert {
  userId: string;
  dataScope: DataScope;
  category: AlertCategory;
  severity: AlertSeverity;
  headline: string;
  body: string;
  gameId: string;
  sourceType: "LIVE_SCORES";
  sourceData: {
    period: string;
    homeScore: number;
    awayScore: number;
    summary: string;
    keyPoints: string[];
    watchNext: string;
  };
  deepLink: string;
  dedupeKey: string;
  expiresAt?: string;
}

// =====================================================
// ANALYSIS LOGIC BY SPORT
// =====================================================

/**
 * Generate NFL period break summary
 */
export function generateNFLSummary(summary: PeriodBreakSummary): {
  summaryText: string;
  keyPoints: string[];
  watchNext: string;
} {
  const { period, homeTeam, awayTeam, homeScore, awayScore, stats } = summary;
  const scoreDiff = Math.abs(homeScore - awayScore);
  const leader = homeScore > awayScore ? homeTeam : awayScore > homeScore ? awayTeam : null;
  
  const homeTotalYards = stats.homeTotalYards || 0;
  const awayTotalYards = stats.awayTotalYards || 0;
  const homeTurnovers = stats.homeTurnovers || 0;
  const awayTurnovers = stats.awayTurnovers || 0;
  
  const keyPoints: string[] = [];
  
  // Score analysis
  if (homeScore === 0 && awayScore === 0) {
    keyPoints.push(`Scoreless through ${period}. Defenses controlling the game.`);
  } else if (leader) {
    keyPoints.push(`${leader} leads ${homeScore > awayScore ? homeScore : awayScore}-${homeScore < awayScore ? homeScore : awayScore}`);
  }
  
  // Yardage efficiency
  if (homeTotalYards > awayTotalYards * 1.5) {
    keyPoints.push(`${homeTeam} dominating yardage: ${homeTotalYards} to ${awayTotalYards}`);
  } else if (awayTotalYards > homeTotalYards * 1.5) {
    keyPoints.push(`${awayTeam} dominating yardage: ${awayTotalYards} to ${homeTotalYards}`);
  }
  
  // Turnovers
  if (homeTurnovers > awayTurnovers) {
    keyPoints.push(`${homeTeam} has ${homeTurnovers} turnover${homeTurnovers > 1 ? 's' : ''}`);
  } else if (awayTurnovers > homeTurnovers) {
    keyPoints.push(`${awayTeam} has ${awayTurnovers} turnover${awayTurnovers > 1 ? 's' : ''}`);
  }
  
  // Weather impact
  if (stats.weatherCondition && stats.windSpeed && stats.windSpeed > 15) {
    keyPoints.push(`Wind at ${stats.windSpeed}mph affecting passing game`);
  }
  
  const summaryText = keyPoints.join('. ') + '.';
  
  // What to watch next
  let watchNext = '';
  if (period === 'Q1') {
    watchNext = 'Watch for offensive adjustments in Q2';
  } else if (period === 'Q2') {
    watchNext = 'Halftime adjustments will be key for the second half';
  } else if (period === 'Q3') {
    watchNext = 'Q4 will determine the outcome';
  } else if (period === 'Q4' && scoreDiff <= 7) {
    watchNext = 'Close game heading to the wire';
  }
  
  return { summaryText, keyPoints, watchNext };
}

/**
 * Generate NBA period break summary
 */
export function generateNBASummary(summary: PeriodBreakSummary): {
  summaryText: string;
  keyPoints: string[];
  watchNext: string;
} {
  const { period, homeTeam, awayTeam, homeScore, awayScore, stats } = summary;
  const leader = homeScore > awayScore ? homeTeam : awayScore > homeScore ? awayTeam : null;
  
  const homeFGPct = stats.homeFieldGoalPct || 0;
  const awayFGPct = stats.awayFieldGoalPct || 0;
  const homeRebounds = stats.homeRebounds || 0;
  const awayRebounds = stats.awayRebounds || 0;
  
  const keyPoints: string[] = [];
  
  // Score analysis
  if (homeScore === 0 && awayScore === 0) {
    keyPoints.push(`Scoreless start through ${period}`);
  } else if (leader) {
    keyPoints.push(`${leader} leads ${homeScore > awayScore ? homeScore : awayScore}-${homeScore < awayScore ? homeScore : awayScore}`);
  }
  
  // Shooting efficiency
  if (homeFGPct > awayFGPct + 10) {
    keyPoints.push(`${homeTeam} shooting ${homeFGPct.toFixed(1)}% vs ${awayFGPct.toFixed(1)}%`);
  } else if (awayFGPct > homeFGPct + 10) {
    keyPoints.push(`${awayTeam} shooting ${awayFGPct.toFixed(1)}% vs ${homeFGPct.toFixed(1)}%`);
  }
  
  // Rebounding
  if (homeRebounds > awayRebounds + 5) {
    keyPoints.push(`${homeTeam} controlling boards: ${homeRebounds} to ${awayRebounds}`);
  } else if (awayRebounds > homeRebounds + 5) {
    keyPoints.push(`${awayTeam} controlling boards: ${awayRebounds} to ${homeRebounds}`);
  }
  
  const summaryText = keyPoints.join('. ') + '.';
  
  // What to watch next
  let watchNext = '';
  if (period === 'Q1') {
    watchNext = 'Bench units will factor in Q2';
  } else if (period === 'Q2') {
    watchNext = 'Third quarter will set the tone for the finish';
  } else if (period === 'Q3') {
    watchNext = 'Fourth quarter crunch time ahead';
  } else if (period === 'Q4') {
    watchNext = 'Final minutes will decide the outcome';
  }
  
  return { summaryText, keyPoints, watchNext };
}

/**
 * Generate MLB inning summary
 */
export function generateMLBSummary(summary: PeriodBreakSummary): {
  summaryText: string;
  keyPoints: string[];
  watchNext: string;
} {
  const { period, homeTeam, awayTeam, homeScore, awayScore, stats } = summary;
  const leader = homeScore > awayScore ? homeTeam : awayScore > homeScore ? awayTeam : null;
  
  const homeHits = stats.homeHits || 0;
  const awayHits = stats.awayHits || 0;
  const homeLeftOnBase = stats.homeLeftOnBase || 0;
  const awayLeftOnBase = stats.awayLeftOnBase || 0;
  
  const keyPoints: string[] = [];
  
  // Score analysis
  if (homeScore === 0 && awayScore === 0) {
    const inning = parseInt(period.replace(/[^\d]/g, ''), 10);
    keyPoints.push(`Scoreless through ${period}. Pitchers dueling.`);
    if (homeHits === 0 && awayHits === 0 && inning >= 5) {
      keyPoints.push('Combined no-hitter in progress');
    }
  } else if (leader) {
    keyPoints.push(`${leader} leads ${homeScore > awayScore ? homeScore : awayScore}-${homeScore < awayScore ? homeScore : awayScore}`);
  }
  
  // Hitting
  if (homeHits > awayHits + 3) {
    keyPoints.push(`${homeTeam} outhitting ${awayTeam}: ${homeHits} to ${awayHits}`);
  } else if (awayHits > homeHits + 3) {
    keyPoints.push(`${awayTeam} outhitting ${homeTeam}: ${awayHits} to ${homeHits}`);
  }
  
  // Runners left on base
  if (homeLeftOnBase >= 5) {
    keyPoints.push(`${homeTeam} stranding runners: ${homeLeftOnBase} left on base`);
  }
  if (awayLeftOnBase >= 5) {
    keyPoints.push(`${awayTeam} stranding runners: ${awayLeftOnBase} left on base`);
  }
  
  const summaryText = keyPoints.join('. ') + '.';
  
  // What to watch next
  const inning = parseInt(period.replace(/[^\d]/g, ''), 10);
  let watchNext = '';
  if (inning <= 3) {
    watchNext = 'Starters still finding rhythm';
  } else if (inning <= 6) {
    watchNext = 'Bullpens will factor in late innings';
  } else if (inning >= 7) {
    watchNext = 'Closers may be warming up';
  }
  
  return { summaryText, keyPoints, watchNext };
}

/**
 * Generate NHL period summary
 */
export function generateNHLSummary(summary: PeriodBreakSummary): {
  summaryText: string;
  keyPoints: string[];
  watchNext: string;
} {
  const { period, homeTeam, awayTeam, homeScore, awayScore, stats } = summary;
  const leader = homeScore > awayScore ? homeTeam : awayScore > homeScore ? awayTeam : null;
  
  const homeShots = stats.homeShotsOnGoal || 0;
  const awayShots = stats.awayShotsOnGoal || 0;
  const homePPGoals = stats.homePowerPlayGoals || 0;
  const awayPPGoals = stats.awayPowerPlayGoals || 0;
  
  const keyPoints: string[] = [];
  
  // Score analysis
  if (homeScore === 0 && awayScore === 0) {
    keyPoints.push(`Scoreless through ${period}. Goalies standing tall.`);
  } else if (leader) {
    keyPoints.push(`${leader} leads ${homeScore > awayScore ? homeScore : awayScore}-${homeScore < awayScore ? homeScore : awayScore}`);
  }
  
  // Shots
  if (homeShots > awayShots + 5) {
    keyPoints.push(`${homeTeam} pressuring: ${homeShots} shots to ${awayShots}`);
  } else if (awayShots > homeShots + 5) {
    keyPoints.push(`${awayTeam} pressuring: ${awayShots} shots to ${homeShots}`);
  }
  
  // Power play
  if (homePPGoals > 0 || awayPPGoals > 0) {
    keyPoints.push('Special teams making a difference');
  }
  
  const summaryText = keyPoints.join('. ') + '.';
  
  // What to watch next
  let watchNext = '';
  if (period === '1st') {
    watchNext = 'Middle frame will set the pace';
  } else if (period === '2nd') {
    watchNext = 'Third period will determine the outcome';
  } else if (period === '3rd' && Math.abs(homeScore - awayScore) <= 1) {
    watchNext = 'Overtime may be needed';
  }
  
  return { summaryText, keyPoints, watchNext };
}

/**
 * Generate soccer half summary
 */
export function generateSoccerSummary(summary: PeriodBreakSummary): {
  summaryText: string;
  keyPoints: string[];
  watchNext: string;
} {
  const { period, homeTeam, awayTeam, homeScore, awayScore, stats } = summary;
  const leader = homeScore > awayScore ? homeTeam : awayScore > homeScore ? awayTeam : null;
  
  const homePossession = stats.homePossessionPct || 50;
  const awayPossession = stats.awayPossessionPct || 50;
  const homeShots = stats.homeShots || 0;
  const awayShots = stats.awayShots || 0;
  
  const keyPoints: string[] = [];
  
  // Score analysis
  if (homeScore === 0 && awayScore === 0) {
    keyPoints.push(`Goalless at ${period}`);
  } else if (leader) {
    keyPoints.push(`${leader} leads ${homeScore > awayScore ? homeScore : awayScore}-${homeScore < awayScore ? homeScore : awayScore} at ${period}`);
  }
  
  // Possession
  if (homePossession > 60) {
    keyPoints.push(`${homeTeam} controlling possession at ${homePossession.toFixed(0)}%`);
  } else if (awayPossession > 60) {
    keyPoints.push(`${awayTeam} controlling possession at ${awayPossession.toFixed(0)}%`);
  }
  
  // Shots
  if (homeShots > awayShots + 3) {
    keyPoints.push(`${homeTeam} creating chances: ${homeShots} shots to ${awayShots}`);
  } else if (awayShots > homeShots + 3) {
    keyPoints.push(`${awayTeam} creating chances: ${awayShots} shots to ${homeShots}`);
  }
  
  const summaryText = keyPoints.join('. ') + '.';
  
  // What to watch next
  let watchNext = '';
  if (period === '1st Half') {
    watchNext = 'Second half adjustments will be crucial';
  } else if (period === '2nd Half') {
    watchNext = 'Final minutes will be intense';
  }
  
  return { summaryText, keyPoints, watchNext };
}

/**
 * Main analysis dispatcher based on sport
 */
export function analyzePeriodBreak(
  summary: PeriodBreakSummary
): {
  summaryText: string;
  keyPoints: string[];
  watchNext: string;
} {
  const sport = summary.sport.toLowerCase();
  
  if (sport.includes('nfl') || sport.includes('football')) {
    return generateNFLSummary(summary);
  }
  
  if (sport.includes('nba') || sport.includes('wnba') || sport.includes('ncaab') || sport.includes('basketball')) {
    return generateNBASummary(summary);
  }
  
  if (sport.includes('mlb') || sport.includes('baseball')) {
    return generateMLBSummary(summary);
  }
  
  if (sport.includes('nhl') || sport.includes('hockey')) {
    return generateNHLSummary(summary);
  }
  
  if (sport.includes('soccer') || sport.includes('mls') || sport.includes('premier')) {
    return generateSoccerSummary(summary);
  }
  
  // Generic fallback
  const leader = summary.homeScore > summary.awayScore 
    ? summary.homeTeam 
    : summary.awayScore > summary.homeScore 
      ? summary.awayTeam 
      : null;
  
  const keyPoints: string[] = [];
  if (summary.homeScore === 0 && summary.awayScore === 0) {
    keyPoints.push(`Scoreless through ${summary.period}`);
  } else if (leader) {
    keyPoints.push(`${leader} leads after ${summary.period}`);
  }
  
  return {
    summaryText: keyPoints.join('. ') + '.',
    keyPoints,
    watchNext: 'Game continues',
  };
}

// =====================================================
// ALERT GENERATION
// =====================================================

/**
 * Create a period break alert object
 */
export function createPeriodBreakAlert(
  userId: string,
  dataScope: DataScope,
  summary: PeriodBreakSummary,
  analysis: ReturnType<typeof analyzePeriodBreak>
): PeriodBreakAlert {
  const { period, homeTeam, awayTeam, homeScore, awayScore } = summary;
  
  const headline = `End of ${period}: ${awayTeam} ${awayScore}, ${homeTeam} ${homeScore}`;
  const body = `${analysis.summaryText} ${analysis.watchNext}`;
  
  // Dedupe key: one alert per game per period
  const dedupeKey = `PERIOD_BREAK:${summary.gameId}:${period}`;
  
  // Expiry: period break alerts last 2 hours
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  
  return {
    userId,
    dataScope,
    category: "GAME_STATE",
    severity: "INFO", // Period breaks are always INFO unless it's a critical moment
    headline,
    body,
    gameId: summary.gameId,
    sourceType: "LIVE_SCORES",
    sourceData: {
      period,
      homeScore,
      awayScore,
      summary: analysis.summaryText,
      keyPoints: analysis.keyPoints,
      watchNext: analysis.watchNext,
    },
    deepLink: `/game/${summary.gameId}`,
    dedupeKey,
    expiresAt,
  };
}

// =====================================================
// DATABASE OPERATIONS
// =====================================================

/**
 * Fetch users who should receive period break alerts for a game
 */
export async function getUsersForPeriodBreakAlerts(
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
 * Insert a new period break alert into the database
 */
export async function insertPeriodBreakAlert(
  db: D1Database,
  alert: PeriodBreakAlert
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

export interface PeriodBreakTriggerResult {
  processed: boolean;
  alertsCreated: number;
  userIds: string[];
  period: string;
}

/**
 * Main entry point: Process a period break and create alerts
 */
export async function triggerPeriodBreakAlerts(
  db: D1Database,
  summary: PeriodBreakSummary,
  dataScope: DataScope
): Promise<PeriodBreakTriggerResult> {
  const analysis = analyzePeriodBreak(summary);
  
  const result: PeriodBreakTriggerResult = {
    processed: true,
    alertsCreated: 0,
    userIds: [],
    period: summary.period,
  };
  
  // Get users who should receive this alert
  const users = await getUsersForPeriodBreakAlerts(
    db,
    summary.gameId,
    dataScope
  );
  
  // Create and insert alerts for each user
  for (const user of users) {
    const alert = createPeriodBreakAlert(user.userId, dataScope, summary, analysis);
    const alertId = await insertPeriodBreakAlert(db, alert);
    
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
 * Process multiple period breaks in batch
 */
export async function triggerPeriodBreakAlertsBatch(
  db: D1Database,
  summaries: PeriodBreakSummary[],
  dataScope: DataScope
): Promise<PeriodBreakTriggerResult[]> {
  const results: PeriodBreakTriggerResult[] = [];
  
  for (const summary of summaries) {
    const result = await triggerPeriodBreakAlerts(db, summary, dataScope);
    results.push(result);
  }
  
  return results;
}

// =====================================================
// DEMO / TESTING UTILITIES
// =====================================================

/**
 * Generate a sample period break summary for testing
 */
export function generateDemoPeriodBreak(
  gameId: string,
  sport: string,
  homeTeam: string,
  awayTeam: string,
  options: {
    period?: string;
    homeScore?: number;
    awayScore?: number;
    scoreless?: boolean;
  } = {}
): PeriodBreakSummary {
  const period = options.period || 'Q1';
  const homeScore = options.scoreless ? 0 : (options.homeScore ?? 14);
  const awayScore = options.scoreless ? 0 : (options.awayScore ?? 10);
  
  let stats: PeriodBreakSummary['stats'] = {};
  
  if (sport === 'NFL') {
    stats = {
      homeTotalYards: 142,
      awayTotalYards: 98,
      homePassingYards: 87,
      awayPassingYards: 62,
      homeRushingYards: 55,
      awayRushingYards: 36,
      homeTurnovers: 0,
      awayTurnovers: 1,
      weatherCondition: 'Clear',
      windSpeed: 8,
    };
  } else if (sport === 'NBA') {
    stats = {
      homeFieldGoalPct: 48.5,
      awayFieldGoalPct: 42.1,
      homeRebounds: 12,
      awayRebounds: 9,
      homeTurnoversCount: 2,
      awayTurnoversCount: 3,
    };
  } else if (sport === 'MLB') {
    stats = {
      homeHits: 3,
      awayHits: 2,
      homeErrors: 0,
      awayErrors: 1,
      homeLeftOnBase: 4,
      awayLeftOnBase: 2,
    };
  } else if (sport === 'NHL') {
    stats = {
      homeShotsOnGoal: 12,
      awayShotsOnGoal: 8,
      homePowerPlayGoals: 0,
      awayPowerPlayGoals: 0,
      homePenaltyMinutes: 2,
      awayPenaltyMinutes: 4,
    };
  } else if (sport === 'Soccer') {
    stats = {
      homePossessionPct: 58,
      awayPossessionPct: 42,
      homeShots: 9,
      awayShots: 4,
      homeShotsOnTarget: 4,
      awayShotsOnTarget: 2,
      homeCorners: 5,
      awayCorners: 2,
    };
  }
  
  return {
    gameId,
    sport,
    homeTeam,
    awayTeam,
    period,
    homeScore,
    awayScore,
    stats,
    detectedAt: new Date().toISOString(),
  };
}

/**
 * Generate demo period break scenarios including scoreless periods
 */
export function generateDemoPeriodBreakScenarios(): PeriodBreakSummary[] {
  return [
    // NFL scoreless quarter
    generateDemoPeriodBreak('game_001', 'NFL', 'Ravens', '49ers', {
      period: 'Q1',
      scoreless: true,
    }),
    
    // NBA end of Q3
    generateDemoPeriodBreak('game_002', 'NBA', 'Lakers', 'Warriors', {
      period: 'Q3',
      homeScore: 78,
      awayScore: 72,
    }),
    
    // MLB scoreless through 3rd
    generateDemoPeriodBreak('game_003', 'MLB', 'Yankees', 'Red Sox', {
      period: '3rd',
      scoreless: true,
    }),
    
    // NHL end of 2nd period
    generateDemoPeriodBreak('game_004', 'NHL', 'Bruins', 'Maple Leafs', {
      period: '2nd',
      homeScore: 2,
      awayScore: 1,
    }),
    
    // Soccer halftime
    generateDemoPeriodBreak('game_005', 'Soccer', 'Manchester City', 'Liverpool', {
      period: '1st Half',
      homeScore: 1,
      awayScore: 0,
    }),
  ];
}

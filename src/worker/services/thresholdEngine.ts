/**
 * MECCA Threshold Engine
 * 
 * Central intelligence layer that filters ALL live data into meaningful events.
 * This is the app's control tower - no feature may bypass it.
 * 
 * Non-negotiable principles:
 * 1) If it doesn't meet thresholds, it does NOT surface to the user
 * 2) Default is calm + minimal
 * 3) "What Just Changed" shows max 1-3 items
 * 4) AI is silent unless user asks OR thresholds allow auto-insight
 * 5) No hype language, no emojis, no betting advice
 */

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
  meta?: object;
}

// Event categories
export type EventCategory = 'ODDS' | 'INJURY' | 'WEATHER' | 'GAMESTATE' | 'POOL_IMPACT' | 'FORM';

// Event types within each category
export type OddsEventType = 'SPREAD_MOVE' | 'TOTAL_MOVE' | 'ML_SHIFT' | 'FAVORITE_FLIP' | 'KEY_NUMBER_CROSS' | 'BOOK_DIVERGENCE';
export type InjuryEventType = 'PLAYER_OUT' | 'PLAYER_DOWNGRADED' | 'LATE_SCRATCH';
export type WeatherEventType = 'WIND_THRESHOLD' | 'PRECIPITATION' | 'TEMP_EXTREME' | 'WEATHER_SHIFT';
export type GameStateEventType = 'TURNOVER' | 'LEAD_CHANGE' | 'TIE_GAME' | 'SCORING_EVENT' | 'CLOCK_PRESSURE' | 'GAME_STARTED' | 'GAME_ENDED' | 'PERIOD_CHANGE' | 'SCORE_UPDATE';
export type PoolImpactEventType = 'EXPOSURE_THRESHOLD' | 'ELIMINATION_RISK' | 'LEADER_RISK' | 'ELIMINATION_CASCADE';
export type FormEventType = 'TREND_SIGNAL';

export type EventType = OddsEventType | InjuryEventType | WeatherEventType | GameStateEventType | PoolImpactEventType | FormEventType;

// Severity levels
export type Severity = 'INFO' | 'IMPACT' | 'CRITICAL';

// Key numbers for spread betting (NFL/NCAAF primarily)
const KEY_NUMBERS = [3, 7, 10, 14, 17, 21];

// Threshold event interface
export interface ThresholdEvent {
  id?: number;
  data_scope: 'DEMO' | 'PROD';
  sport_type: string;
  league_context_id?: number;
  game_id?: number;
  event_category: EventCategory;
  event_type: EventType;
  severity: Severity;
  headline: string;
  details_json?: string;
  source?: string;
  expires_at?: string;
  is_visible: boolean;
  is_consumed: boolean;
  rank_score: number;
  created_at?: string;
}

// Configuration cache
interface ThresholdConfig {
  [key: string]: number;
}

let configCache: ThresholdConfig | null = null;
let configCacheTime: number = 0;
const CONFIG_CACHE_TTL = 60000; // 1 minute

/**
 * Load threshold configuration from database with caching
 */
export async function getThresholdConfig(db: D1Database): Promise<ThresholdConfig> {
  const now = Date.now();
  if (configCache && (now - configCacheTime) < CONFIG_CACHE_TTL) {
    return configCache;
  }

  const result = await db.prepare(`
    SELECT sport_type, threshold_key, threshold_value 
    FROM threshold_config 
    WHERE is_enabled = 1
  `).all();

  const config: ThresholdConfig = {};
  for (const row of result.results as any[]) {
    const key = row.sport_type === 'GLOBAL' 
      ? row.threshold_key 
      : `${row.sport_type}_${row.threshold_key}`;
    config[key] = row.threshold_value;
  }

  configCache = config;
  configCacheTime = now;
  return config;
}

/**
 * Get config value with sport-specific fallback
 */
function getConfigValue(config: ThresholdConfig, key: string, sportType?: string): number {
  if (sportType) {
    const sportKey = `${sportType}_${key}`;
    if (config[sportKey] !== undefined) return config[sportKey];
  }
  return config[key] ?? 0;
}

/**
 * Calculate severity weight for ranking
 */
function getSeverityWeight(severity: Severity): number {
  switch (severity) {
    case 'CRITICAL': return 100;
    case 'IMPACT': return 50;
    case 'INFO': return 10;
    default: return 0;
  }
}

/**
 * Check if a spread crosses a key number
 */
function crossesKeyNumber(oldSpread: number, newSpread: number): boolean {
  for (const keyNum of KEY_NUMBERS) {
    if ((oldSpread < keyNum && newSpread >= keyNum) || 
        (oldSpread > keyNum && newSpread <= keyNum) ||
        (oldSpread < -keyNum && newSpread >= -keyNum) ||
        (oldSpread > -keyNum && newSpread <= -keyNum)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if favorite/underdog flipped
 */
function favoriteFlipped(oldSpread: number, newSpread: number): boolean {
  return (oldSpread > 0 && newSpread < 0) || (oldSpread < 0 && newSpread > 0);
}

/**
 * Create a threshold event record
 */
export async function createThresholdEvent(
  db: D1Database,
  event: Omit<ThresholdEvent, 'id' | 'created_at'>
): Promise<number> {
  // Calculate rank score based on severity
  const rankScore = getSeverityWeight(event.severity) + (event.rank_score || 0);

  const result = await db.prepare(`
    INSERT INTO threshold_events (
      data_scope, sport_type, league_context_id, game_id,
      event_category, event_type, severity, headline,
      details_json, source, expires_at, is_visible, is_consumed, rank_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    event.data_scope,
    event.sport_type,
    event.league_context_id || null,
    event.game_id || null,
    event.event_category,
    event.event_type,
    event.severity,
    event.headline,
    event.details_json || null,
    event.source || null,
    event.expires_at || null,
    event.is_visible ? 1 : 0,
    event.is_consumed ? 1 : 0,
    rankScore
  ).run();

  return (result.meta as any)?.last_row_id as number || 0;
}

// ============================================
// ODDS & MARKET THRESHOLD DETECTORS
// ============================================

export interface SpreadMoveInput {
  dataScope: 'DEMO' | 'PROD';
  sportType: string;
  gameId: number;
  oldSpread: number;
  newSpread: number;
  isLive: boolean;
  source?: string;
}

export async function detectSpreadMove(
  db: D1Database,
  input: SpreadMoveInput
): Promise<ThresholdEvent | null> {
  const config = await getThresholdConfig(db);
  const threshold = input.isLive 
    ? getConfigValue(config, 'SPREAD_MOVE_LIVE', input.sportType)
    : getConfigValue(config, 'SPREAD_MOVE_PREGAME', input.sportType);

  const movement = Math.abs(input.newSpread - input.oldSpread);
  
  if (movement < threshold) return null;

  const crossedKey = crossesKeyNumber(input.oldSpread, input.newSpread);
  const flipped = favoriteFlipped(input.oldSpread, input.newSpread);

  let severity: Severity = 'IMPACT';
  let eventType: OddsEventType = 'SPREAD_MOVE';
  let headline = `Line moved ${input.oldSpread > 0 ? '+' : ''}${input.oldSpread} → ${input.newSpread > 0 ? '+' : ''}${input.newSpread}`;
  let rankBonus = 0;

  if (flipped) {
    severity = 'CRITICAL';
    eventType = 'FAVORITE_FLIP';
    headline = `Favorite flipped: ${input.oldSpread > 0 ? '+' : ''}${input.oldSpread} → ${input.newSpread > 0 ? '+' : ''}${input.newSpread}`;
    rankBonus = 30;
  } else if (crossedKey) {
    severity = 'CRITICAL';
    eventType = 'KEY_NUMBER_CROSS';
    headline = `Key number crossed: ${input.oldSpread > 0 ? '+' : ''}${input.oldSpread} → ${input.newSpread > 0 ? '+' : ''}${input.newSpread}`;
    rankBonus = 20;
  }

  const event: Omit<ThresholdEvent, 'id' | 'created_at'> = {
    data_scope: input.dataScope,
    sport_type: input.sportType,
    game_id: input.gameId,
    event_category: 'ODDS',
    event_type: eventType,
    severity,
    headline,
    details_json: JSON.stringify({
      old_value: input.oldSpread,
      new_value: input.newSpread,
      movement,
      is_live: input.isLive,
      crossed_key_number: crossedKey,
      favorite_flipped: flipped
    }),
    source: input.source,
    is_visible: true,
    is_consumed: false,
    rank_score: rankBonus
  };

  const id = await createThresholdEvent(db, event);
  return { ...event, id };
}

export interface TotalMoveInput {
  dataScope: 'DEMO' | 'PROD';
  sportType: string;
  gameId: number;
  oldTotal: number;
  newTotal: number;
  isLive: boolean;
  hasRelatedInjury?: boolean;
  hasRelatedWeather?: boolean;
  source?: string;
}

export async function detectTotalMove(
  db: D1Database,
  input: TotalMoveInput
): Promise<ThresholdEvent | null> {
  const config = await getThresholdConfig(db);
  const threshold = input.isLive
    ? getConfigValue(config, 'TOTAL_MOVE_LIVE', input.sportType)
    : getConfigValue(config, 'TOTAL_MOVE_PREGAME', input.sportType);

  const movement = Math.abs(input.newTotal - input.oldTotal);

  if (movement < threshold) return null;

  let severity: Severity = 'IMPACT';
  let rankBonus = 0;

  // Elevate to CRITICAL if combined with injury or weather
  if (input.hasRelatedInjury || input.hasRelatedWeather) {
    severity = 'CRITICAL';
    rankBonus = 15;
  }

  const direction = input.newTotal > input.oldTotal ? 'up' : 'down';
  const headline = `Total moved ${direction}: ${input.oldTotal} → ${input.newTotal}`;

  const event: Omit<ThresholdEvent, 'id' | 'created_at'> = {
    data_scope: input.dataScope,
    sport_type: input.sportType,
    game_id: input.gameId,
    event_category: 'ODDS',
    event_type: 'TOTAL_MOVE',
    severity,
    headline,
    details_json: JSON.stringify({
      old_value: input.oldTotal,
      new_value: input.newTotal,
      movement,
      direction,
      is_live: input.isLive,
      has_related_injury: input.hasRelatedInjury,
      has_related_weather: input.hasRelatedWeather
    }),
    source: input.source,
    is_visible: true,
    is_consumed: false,
    rank_score: rankBonus
  };

  const id = await createThresholdEvent(db, event);
  return { ...event, id };
}

export interface MLShiftInput {
  dataScope: 'DEMO' | 'PROD';
  sportType: string;
  gameId: number;
  teamName: string;
  oldOdds: number;
  newOdds: number;
  source?: string;
}

/**
 * Convert American odds to implied probability
 */
function oddsToImpliedProbability(odds: number): number {
  if (odds > 0) {
    return 100 / (odds + 100);
  } else {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }
}

export async function detectMLShift(
  db: D1Database,
  input: MLShiftInput
): Promise<ThresholdEvent | null> {
  const config = await getThresholdConfig(db);
  const threshold = getConfigValue(config, 'ML_PROBABILITY_CHANGE', input.sportType);

  const oldProb = oddsToImpliedProbability(input.oldOdds) * 100;
  const newProb = oddsToImpliedProbability(input.newOdds) * 100;
  const change = Math.abs(newProb - oldProb);

  if (change < threshold) return null;

  // Check for favorite/underdog flip
  const flipped = (input.oldOdds > 0 && input.newOdds < 0) || 
                  (input.oldOdds < 0 && input.newOdds > 0);

  let severity: Severity = 'IMPACT';
  let headline = `${input.teamName} odds shifted: ${input.oldOdds > 0 ? '+' : ''}${input.oldOdds} → ${input.newOdds > 0 ? '+' : ''}${input.newOdds}`;
  let rankBonus = 0;

  if (flipped) {
    severity = 'CRITICAL';
    headline = `${input.teamName} became ${input.newOdds < 0 ? 'favorite' : 'underdog'}`;
    rankBonus = 25;
  }

  const event: Omit<ThresholdEvent, 'id' | 'created_at'> = {
    data_scope: input.dataScope,
    sport_type: input.sportType,
    game_id: input.gameId,
    event_category: 'ODDS',
    event_type: flipped ? 'FAVORITE_FLIP' : 'ML_SHIFT',
    severity,
    headline,
    details_json: JSON.stringify({
      team: input.teamName,
      old_odds: input.oldOdds,
      new_odds: input.newOdds,
      old_implied_prob: oldProb.toFixed(1),
      new_implied_prob: newProb.toFixed(1),
      probability_change: change.toFixed(1),
      favorite_flipped: flipped
    }),
    source: input.source,
    is_visible: true,
    is_consumed: false,
    rank_score: rankBonus
  };

  const id = await createThresholdEvent(db, event);
  return { ...event, id };
}

// ============================================
// INJURY THRESHOLD DETECTORS
// ============================================

export interface InjuryUpdateInput {
  dataScope: 'DEMO' | 'PROD';
  sportType: string;
  gameId: number;
  playerName: string;
  position: string;
  isStarter: boolean;
  oldStatus: string;
  newStatus: string;
  minutesToGame?: number;
  isLive?: boolean;
  source?: string;
}

export async function detectInjuryUpdate(
  db: D1Database,
  input: InjuryUpdateInput
): Promise<ThresholdEvent | null> {
  // Only trigger for starters/high-usage players
  if (!input.isStarter) return null;

  const config = await getThresholdConfig(db);
  const lateInjuryMinutes = getConfigValue(config, 'LATE_INJURY_MINUTES', input.sportType);

  // Define material status changes
  const materialChanges = [
    { from: 'Active', to: 'Questionable' },
    { from: 'Questionable', to: 'Doubtful' },
    { from: 'Active', to: 'Doubtful' },
    { from: 'Active', to: 'Out' },
    { from: 'Questionable', to: 'Out' },
    { from: 'Doubtful', to: 'Out' },
    { from: 'Probable', to: 'Doubtful' },
    { from: 'Probable', to: 'Out' }
  ];

  const isMaterialChange = materialChanges.some(
    c => c.from.toLowerCase() === input.oldStatus.toLowerCase() && 
         c.to.toLowerCase() === input.newStatus.toLowerCase()
  );

  if (!isMaterialChange) return null;

  const isLateInjury = (input.minutesToGame !== undefined && input.minutesToGame <= lateInjuryMinutes) || input.isLive;
  const isOut = input.newStatus.toLowerCase() === 'out';

  let severity: Severity = 'IMPACT';
  let eventType: InjuryEventType = 'PLAYER_DOWNGRADED';
  let rankBonus = 0;

  if (isLateInjury) {
    severity = 'CRITICAL';
    eventType = 'LATE_SCRATCH';
    rankBonus = 20;
  }

  if (isOut) {
    eventType = 'PLAYER_OUT';
    if (isLateInjury) rankBonus += 10;
  }

  const headline = isOut
    ? `${input.playerName} (${input.position}) ruled OUT`
    : `${input.playerName} (${input.position}) downgraded to ${input.newStatus}`;

  const event: Omit<ThresholdEvent, 'id' | 'created_at'> = {
    data_scope: input.dataScope,
    sport_type: input.sportType,
    game_id: input.gameId,
    event_category: 'INJURY',
    event_type: eventType,
    severity,
    headline,
    details_json: JSON.stringify({
      player: input.playerName,
      position: input.position,
      is_starter: input.isStarter,
      old_status: input.oldStatus,
      new_status: input.newStatus,
      is_late: isLateInjury,
      is_live: input.isLive,
      minutes_to_game: input.minutesToGame
    }),
    source: input.source,
    is_visible: true,
    is_consumed: false,
    rank_score: rankBonus
  };

  const id = await createThresholdEvent(db, event);
  return { ...event, id };
}

// ============================================
// WEATHER THRESHOLD DETECTORS
// ============================================

export interface WeatherUpdateInput {
  dataScope: 'DEMO' | 'PROD';
  sportType: string;
  gameId: number;
  venue?: string;
  windSustained?: number;
  windGust?: number;
  temperature?: number;
  precipitation?: string;
  previousConditions?: {
    windSustained?: number;
    temperature?: number;
    precipitation?: string;
  };
  source?: string;
}

export async function detectWeatherThreshold(
  db: D1Database,
  input: WeatherUpdateInput
): Promise<ThresholdEvent[]> {
  const config = await getThresholdConfig(db);
  const events: ThresholdEvent[] = [];

  // Wind threshold
  const windSustainedThreshold = getConfigValue(config, 'WIND_SUSTAINED_MPH', input.sportType);
  const windGustThreshold = getConfigValue(config, 'WIND_GUST_MPH', input.sportType);

  if (input.windSustained && input.windSustained >= windSustainedThreshold) {
    const event: Omit<ThresholdEvent, 'id' | 'created_at'> = {
      data_scope: input.dataScope,
      sport_type: input.sportType,
      game_id: input.gameId,
      event_category: 'WEATHER',
      event_type: 'WIND_THRESHOLD',
      severity: 'IMPACT',
      headline: `Wind at ${input.windSustained}mph${input.windGust ? ` (gusts ${input.windGust}mph)` : ''}`,
      details_json: JSON.stringify({
        wind_sustained: input.windSustained,
        wind_gust: input.windGust,
        venue: input.venue
      }),
      source: input.source,
      is_visible: true,
      is_consumed: false,
      rank_score: 0
    };
    const id = await createThresholdEvent(db, event);
    events.push({ ...event, id });
  } else if (input.windGust && input.windGust >= windGustThreshold) {
    const event: Omit<ThresholdEvent, 'id' | 'created_at'> = {
      data_scope: input.dataScope,
      sport_type: input.sportType,
      game_id: input.gameId,
      event_category: 'WEATHER',
      event_type: 'WIND_THRESHOLD',
      severity: 'IMPACT',
      headline: `Wind gusts reaching ${input.windGust}mph`,
      details_json: JSON.stringify({
        wind_sustained: input.windSustained,
        wind_gust: input.windGust,
        venue: input.venue
      }),
      source: input.source,
      is_visible: true,
      is_consumed: false,
      rank_score: 0
    };
    const id = await createThresholdEvent(db, event);
    events.push({ ...event, id });
  }

  // Temperature extremes
  const tempLow = getConfigValue(config, 'TEMP_LOW_F', input.sportType);
  const tempHigh = getConfigValue(config, 'TEMP_HIGH_F', input.sportType);

  if (input.temperature !== undefined) {
    if (input.temperature <= tempLow) {
      const event: Omit<ThresholdEvent, 'id' | 'created_at'> = {
        data_scope: input.dataScope,
        sport_type: input.sportType,
        game_id: input.gameId,
        event_category: 'WEATHER',
        event_type: 'TEMP_EXTREME',
        severity: 'INFO',
        headline: `Cold conditions: ${input.temperature}°F`,
        details_json: JSON.stringify({
          temperature: input.temperature,
          venue: input.venue
        }),
        source: input.source,
        is_visible: true,
        is_consumed: false,
        rank_score: 0
      };
      const id = await createThresholdEvent(db, event);
      events.push({ ...event, id });
    } else if (input.temperature >= tempHigh) {
      const event: Omit<ThresholdEvent, 'id' | 'created_at'> = {
        data_scope: input.dataScope,
        sport_type: input.sportType,
        game_id: input.gameId,
        event_category: 'WEATHER',
        event_type: 'TEMP_EXTREME',
        severity: 'INFO',
        headline: `Heat conditions: ${input.temperature}°F`,
        details_json: JSON.stringify({
          temperature: input.temperature,
          venue: input.venue
        }),
        source: input.source,
        is_visible: true,
        is_consumed: false,
        rank_score: 0
      };
      const id = await createThresholdEvent(db, event);
      events.push({ ...event, id });
    }
  }

  // Precipitation
  if (input.precipitation && ['heavy rain', 'snow', 'heavy snow'].includes(input.precipitation.toLowerCase())) {
    const event: Omit<ThresholdEvent, 'id' | 'created_at'> = {
      data_scope: input.dataScope,
      sport_type: input.sportType,
      game_id: input.gameId,
      event_category: 'WEATHER',
      event_type: 'PRECIPITATION',
      severity: 'IMPACT',
      headline: `${input.precipitation} expected`,
      details_json: JSON.stringify({
        precipitation: input.precipitation,
        venue: input.venue
      }),
      source: input.source,
      is_visible: true,
      is_consumed: false,
      rank_score: 5
    };
    const id = await createThresholdEvent(db, event);
    events.push({ ...event, id });
  }

  return events;
}

// ============================================
// POOL IMPACT THRESHOLD DETECTORS
// ============================================

export interface PoolExposureInput {
  dataScope: 'DEMO' | 'PROD';
  sportType: string;
  leagueId: number;
  gameId: number;
  teamName: string;
  pickCount: number;
  totalPickers: number;
  source?: string;
}

export async function detectPoolExposure(
  db: D1Database,
  input: PoolExposureInput
): Promise<ThresholdEvent | null> {
  const config = await getThresholdConfig(db);
  const lowThreshold = getConfigValue(config, 'POOL_EXPOSURE_LOW');
  const medThreshold = getConfigValue(config, 'POOL_EXPOSURE_MED');
  const highThreshold = getConfigValue(config, 'POOL_EXPOSURE_HIGH');

  const percentage = (input.pickCount / input.totalPickers) * 100;

  if (percentage < lowThreshold) return null;

  let severity: Severity = 'IMPACT';
  let rankBonus = 0;

  if (percentage >= highThreshold) {
    severity = 'CRITICAL';
    rankBonus = 30;
  } else if (percentage >= medThreshold) {
    rankBonus = 15;
  }

  const headline = `${Math.round(percentage)}% of pool on ${input.teamName}`;

  const event: Omit<ThresholdEvent, 'id' | 'created_at'> = {
    data_scope: input.dataScope,
    sport_type: input.sportType,
    league_context_id: input.leagueId,
    game_id: input.gameId,
    event_category: 'POOL_IMPACT',
    event_type: 'EXPOSURE_THRESHOLD',
    severity,
    headline,
    details_json: JSON.stringify({
      team: input.teamName,
      pick_count: input.pickCount,
      total_pickers: input.totalPickers,
      percentage: percentage.toFixed(1)
    }),
    source: input.source,
    is_visible: true,
    is_consumed: false,
    rank_score: rankBonus
  };

  const id = await createThresholdEvent(db, event);
  return { ...event, id };
}

export interface SurvivorEliminationRiskInput {
  dataScope: 'DEMO' | 'PROD';
  sportType: string;
  leagueId: number;
  gameId: number;
  teamName: string;
  atRiskCount: number;
  aliveCount: number;
  source?: string;
}

export async function detectSurvivorEliminationRisk(
  db: D1Database,
  input: SurvivorEliminationRiskInput
): Promise<ThresholdEvent | null> {
  const config = await getThresholdConfig(db);
  const lowThreshold = getConfigValue(config, 'SURVIVOR_ELIM_LOW');
  const medThreshold = getConfigValue(config, 'SURVIVOR_ELIM_MED');
  const highThreshold = getConfigValue(config, 'SURVIVOR_ELIM_HIGH');

  const percentage = (input.atRiskCount / input.aliveCount) * 100;

  if (percentage < lowThreshold) return null;

  let severity: Severity = 'IMPACT';
  let eventType: PoolImpactEventType = 'ELIMINATION_RISK';
  let rankBonus = 0;

  if (percentage >= highThreshold) {
    severity = 'CRITICAL';
    eventType = 'ELIMINATION_CASCADE';
    rankBonus = 40;
  } else if (percentage >= medThreshold) {
    severity = 'CRITICAL';
    rankBonus = 25;
  }

  const headline = `${input.teamName} loss would eliminate ${input.atRiskCount} player${input.atRiskCount !== 1 ? 's' : ''}`;

  const event: Omit<ThresholdEvent, 'id' | 'created_at'> = {
    data_scope: input.dataScope,
    sport_type: input.sportType,
    league_context_id: input.leagueId,
    game_id: input.gameId,
    event_category: 'POOL_IMPACT',
    event_type: eventType,
    severity,
    headline,
    details_json: JSON.stringify({
      team: input.teamName,
      at_risk_count: input.atRiskCount,
      alive_count: input.aliveCount,
      percentage: percentage.toFixed(1)
    }),
    source: input.source,
    is_visible: true,
    is_consumed: false,
    rank_score: rankBonus
  };

  const id = await createThresholdEvent(db, event);
  return { ...event, id };
}

export interface LeaderRiskInput {
  dataScope: 'DEMO' | 'PROD';
  sportType: string;
  leagueId: number;
  gameId: number;
  teamName: string;
  leaderNames: string[];
  isLive: boolean;
  source?: string;
}

export async function detectLeaderRisk(
  db: D1Database,
  input: LeaderRiskInput
): Promise<ThresholdEvent | null> {
  if (input.leaderNames.length === 0) return null;
  if (!input.isLive) return null; // Only trigger when game is live or late

  const headline = input.leaderNames.length === 1
    ? `Leader ${input.leaderNames[0]} exposed on ${input.teamName}`
    : `${input.leaderNames.length} leaders exposed on ${input.teamName}`;

  const event: Omit<ThresholdEvent, 'id' | 'created_at'> = {
    data_scope: input.dataScope,
    sport_type: input.sportType,
    league_context_id: input.leagueId,
    game_id: input.gameId,
    event_category: 'POOL_IMPACT',
    event_type: 'LEADER_RISK',
    severity: 'CRITICAL',
    headline,
    details_json: JSON.stringify({
      team: input.teamName,
      leaders: input.leaderNames,
      is_live: input.isLive
    }),
    source: input.source,
    is_visible: true,
    is_consumed: false,
    rank_score: 35
  };

  const id = await createThresholdEvent(db, event);
  return { ...event, id };
}

// ============================================
// GAME STATE THRESHOLD DETECTORS
// ============================================

export interface GameStateInput {
  dataScope: 'DEMO' | 'PROD';
  sportType: string;
  gameId: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  previousHomeScore?: number;
  previousAwayScore?: number;
  quarter?: string;
  minutesRemaining?: number;
  eventDescription?: string;
  affectsPool?: boolean;
  source?: string;
}

export async function detectGameStateChange(
  db: D1Database,
  input: GameStateInput
): Promise<ThresholdEvent | null> {
  const config = await getThresholdConfig(db);
  const clockPressureMinutes = getConfigValue(config, 'CLOCK_PRESSURE_MINUTES');

  const currentMargin = input.homeScore - input.awayScore;
  const previousMargin = (input.previousHomeScore ?? 0) - (input.previousAwayScore ?? 0);
  
  // Determine if this is a meaningful event
  const isLeadChange = (currentMargin > 0 && previousMargin <= 0) || 
                       (currentMargin < 0 && previousMargin >= 0);
  const isTieGame = currentMargin === 0 && previousMargin !== 0;
  const isOneScoreGame = Math.abs(currentMargin) <= 8; // NFL: one possession
  const isClockPressure = input.minutesRemaining !== undefined && 
                          input.minutesRemaining <= clockPressureMinutes;

  // Only trigger for meaningful events
  if (!isLeadChange && !isTieGame && !(isOneScoreGame && isClockPressure && input.affectsPool)) {
    return null;
  }

  let severity: Severity = 'IMPACT';
  let eventType: GameStateEventType = 'SCORING_EVENT';
  let headline = '';
  let rankBonus = 0;

  if (isLeadChange) {
    eventType = 'LEAD_CHANGE';
    const leader = currentMargin > 0 ? input.homeTeam : input.awayTeam;
    headline = `${leader} takes the lead ${input.awayScore}-${input.homeScore}`;
    rankBonus = 15;

    if (isClockPressure) {
      severity = 'CRITICAL';
      rankBonus = 30;
    }
  } else if (isTieGame) {
    eventType = 'TIE_GAME';
    headline = `Game tied ${input.homeScore}-${input.awayScore}`;
    rankBonus = 10;

    if (isClockPressure) {
      severity = 'CRITICAL';
      rankBonus = 25;
    }
  } else if (isClockPressure && isOneScoreGame) {
    eventType = 'CLOCK_PRESSURE';
    headline = `Close game: ${input.awayTeam} ${input.awayScore}, ${input.homeTeam} ${input.homeScore} (${input.minutesRemaining} min left)`;
    
    if (input.affectsPool) {
      severity = 'CRITICAL';
      rankBonus = 20;
    }
  }

  if (!headline) return null;

  const event: Omit<ThresholdEvent, 'id' | 'created_at'> = {
    data_scope: input.dataScope,
    sport_type: input.sportType,
    game_id: input.gameId,
    event_category: 'GAMESTATE',
    event_type: eventType,
    severity,
    headline,
    details_json: JSON.stringify({
      home_team: input.homeTeam,
      away_team: input.awayTeam,
      home_score: input.homeScore,
      away_score: input.awayScore,
      margin: currentMargin,
      quarter: input.quarter,
      minutes_remaining: input.minutesRemaining,
      is_lead_change: isLeadChange,
      is_tie: isTieGame,
      is_one_score: isOneScoreGame,
      affects_pool: input.affectsPool,
      description: input.eventDescription
    }),
    source: input.source,
    is_visible: true,
    is_consumed: false,
    rank_score: rankBonus
  };

  const id = await createThresholdEvent(db, event);
  return { ...event, id };
}

// ============================================
// GAME LIFECYCLE DETECTION (Live Scores Integration)
// ============================================

import type { Game } from "../../shared/types";

export interface GameLifecycleInput {
  dataScope: 'DEMO' | 'PROD';
  game: Game;
  previousGame?: Game;
  poolContext?: {
    leagueId: number;
    pickCount: number;
    totalPickers: number;
    leadersOnTeam?: string[];
  };
}

/**
 * Detect game started (SCHEDULED → IN_PROGRESS)
 */
export async function detectGameStarted(
  db: D1Database,
  input: GameLifecycleInput
): Promise<ThresholdEvent | null> {
  const { game, previousGame, poolContext } = input;
  
  // Only trigger on actual transition
  if (previousGame?.status !== 'SCHEDULED' || game.status !== 'IN_PROGRESS') {
    return null;
  }

  let severity: Severity = 'INFO';
  let rankBonus = 0;

  // Elevate severity if this game has pool implications
  if (poolContext && poolContext.pickCount > 0) {
    const exposure = (poolContext.pickCount / poolContext.totalPickers) * 100;
    if (exposure >= 50) {
      severity = 'IMPACT';
      rankBonus = 15;
    }
    if (poolContext.leadersOnTeam && poolContext.leadersOnTeam.length > 0) {
      severity = 'CRITICAL';
      rankBonus = 25;
    }
  }

  const headline = `${game.away_team_abbr} @ ${game.home_team_abbr} has started`;

  const event: Omit<ThresholdEvent, 'id' | 'created_at'> = {
    data_scope: input.dataScope,
    sport_type: game.sport.toUpperCase(),
    game_id: parseInt(game.game_id.split('-').pop() || '0'),
    event_category: 'GAMESTATE',
    event_type: 'GAME_STARTED',
    severity,
    headline,
    details_json: JSON.stringify({
      game_id: game.game_id,
      away_team: game.away_team_name,
      home_team: game.home_team_name,
      away_abbr: game.away_team_abbr,
      home_abbr: game.home_team_abbr,
      venue: game.venue,
      pool_exposure: poolContext ? (poolContext.pickCount / poolContext.totalPickers * 100).toFixed(1) : null,
      leaders_at_risk: poolContext?.leadersOnTeam,
    }),
    source: 'Live Scores',
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // Expires in 30 min
    is_visible: true,
    is_consumed: false,
    rank_score: rankBonus,
  };

  const id = await createThresholdEvent(db, event);
  return { ...event, id };
}

/**
 * Detect game ended (IN_PROGRESS → FINAL)
 */
export async function detectGameEnded(
  db: D1Database,
  input: GameLifecycleInput
): Promise<ThresholdEvent | null> {
  const { game, previousGame, poolContext } = input;
  
  // Only trigger on actual transition to final state
  if (previousGame?.status !== 'IN_PROGRESS' || 
      (game.status !== 'FINAL' && game.status !== 'POSTPONED' && game.status !== 'CANCELED')) {
    return null;
  }

  const homeWon = (game.home_score ?? 0) > (game.away_score ?? 0);
  const winner = homeWon ? game.home_team_name : game.away_team_name;
  const winnerAbbr = homeWon ? game.home_team_abbr : game.away_team_abbr;
  const loser = homeWon ? game.away_team_name : game.home_team_name;
  const loserAbbr = homeWon ? game.away_team_abbr : game.home_team_abbr;

  let severity: Severity = 'IMPACT';
  let rankBonus = 10;
  let headline = `FINAL: ${game.away_team_abbr} ${game.away_score} - ${game.home_team_abbr} ${game.home_score}`;

  // Check for pool implications
  if (poolContext && poolContext.pickCount > 0) {
    const exposure = (poolContext.pickCount / poolContext.totalPickers) * 100;
    
    if (exposure >= 30) {
      rankBonus += 15;
    }
    
    if (poolContext.leadersOnTeam && poolContext.leadersOnTeam.length > 0) {
      severity = 'CRITICAL';
      rankBonus += 20;
      headline += ` — ${poolContext.leadersOnTeam.length} leader${poolContext.leadersOnTeam.length > 1 ? 's' : ''} affected`;
    }
  }

  // Handle postponed/canceled differently
  if (game.status === 'POSTPONED') {
    severity = 'CRITICAL';
    headline = `POSTPONED: ${game.away_team_abbr} @ ${game.home_team_abbr}`;
    rankBonus = 30;
  } else if (game.status === 'CANCELED') {
    severity = 'CRITICAL';
    headline = `CANCELED: ${game.away_team_abbr} @ ${game.home_team_abbr}`;
    rankBonus = 30;
  }

  const event: Omit<ThresholdEvent, 'id' | 'created_at'> = {
    data_scope: input.dataScope,
    sport_type: game.sport.toUpperCase(),
    game_id: parseInt(game.game_id.split('-').pop() || '0'),
    event_category: 'GAMESTATE',
    event_type: 'GAME_ENDED',
    severity,
    headline,
    details_json: JSON.stringify({
      game_id: game.game_id,
      away_team: game.away_team_name,
      home_team: game.home_team_name,
      away_abbr: game.away_team_abbr,
      home_abbr: game.home_team_abbr,
      away_score: game.away_score,
      home_score: game.home_score,
      final_status: game.status,
      winner,
      winner_abbr: winnerAbbr,
      loser,
      loser_abbr: loserAbbr,
      pool_exposure: poolContext ? (poolContext.pickCount / poolContext.totalPickers * 100).toFixed(1) : null,
      leaders_at_risk: poolContext?.leadersOnTeam,
    }),
    source: 'Live Scores',
    is_visible: true,
    is_consumed: false,
    rank_score: rankBonus,
  };

  const id = await createThresholdEvent(db, event);
  return { ...event, id };
}

/**
 * Detect significant score changes during live games
 */
export async function detectScoreUpdate(
  db: D1Database,
  input: GameLifecycleInput
): Promise<ThresholdEvent | null> {
  const { game, previousGame, poolContext } = input;
  
  // Only for live games with previous state
  if (game.status !== 'IN_PROGRESS' || !previousGame) return null;
  
  const prevAwayScore = previousGame.away_score ?? 0;
  const prevHomeScore = previousGame.home_score ?? 0;
  const currAwayScore = game.away_score ?? 0;
  const currHomeScore = game.home_score ?? 0;
  
  // Check if score actually changed
  if (prevAwayScore === currAwayScore && prevHomeScore === currHomeScore) {
    return null;
  }
  
  const prevMargin = prevHomeScore - prevAwayScore;
  const currMargin = currHomeScore - currAwayScore;
  
  // Detect lead change
  const isLeadChange = (prevMargin > 0 && currMargin < 0) || 
                       (prevMargin < 0 && currMargin > 0);
  const isTie = currMargin === 0 && prevMargin !== 0;
  
  // Only surface significant changes
  if (!isLeadChange && !isTie) {
    // For non-dramatic changes, only show if pool has high exposure
    if (!poolContext || (poolContext.pickCount / poolContext.totalPickers) < 0.3) {
      return null;
    }
  }
  
  let severity: Severity = 'IMPACT';
  let eventType: GameStateEventType = 'SCORE_UPDATE';
  let rankBonus = 0;
  let headline = '';
  
  if (isLeadChange) {
    eventType = 'LEAD_CHANGE';
    const newLeader = currMargin > 0 ? game.home_team_abbr : game.away_team_abbr;
    headline = `${newLeader} takes the lead: ${game.away_team_abbr} ${currAwayScore} - ${game.home_team_abbr} ${currHomeScore}`;
    rankBonus = 15;
    
    if (poolContext?.leadersOnTeam && poolContext.leadersOnTeam.length > 0) {
      severity = 'CRITICAL';
      rankBonus = 30;
    }
  } else if (isTie) {
    eventType = 'TIE_GAME';
    headline = `Game tied: ${game.away_team_abbr} ${currAwayScore} - ${game.home_team_abbr} ${currHomeScore}`;
    rankBonus = 10;
  } else {
    // High exposure score update
    const scorer = currAwayScore > prevAwayScore ? game.away_team_abbr : game.home_team_abbr;
    headline = `${scorer} scores: ${game.away_team_abbr} ${currAwayScore} - ${game.home_team_abbr} ${currHomeScore}`;
  }
  
  // Add period context
  if (game.period_label) {
    headline += ` (${game.period_label}${game.clock ? ` ${game.clock}` : ''})`;
  }
  
  const event: Omit<ThresholdEvent, 'id' | 'created_at'> = {
    data_scope: input.dataScope,
    sport_type: game.sport.toUpperCase(),
    game_id: parseInt(game.game_id.split('-').pop() || '0'),
    event_category: 'GAMESTATE',
    event_type: eventType,
    severity,
    headline,
    details_json: JSON.stringify({
      game_id: game.game_id,
      away_team: game.away_team_name,
      home_team: game.home_team_name,
      away_abbr: game.away_team_abbr,
      home_abbr: game.home_team_abbr,
      prev_away_score: prevAwayScore,
      prev_home_score: prevHomeScore,
      away_score: currAwayScore,
      home_score: currHomeScore,
      period: game.period_label,
      clock: game.clock,
      is_lead_change: isLeadChange,
      is_tie: isTie,
      pool_exposure: poolContext ? (poolContext.pickCount / poolContext.totalPickers * 100).toFixed(1) : null,
    }),
    source: 'Live Scores',
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // Expires in 15 min
    is_visible: true,
    is_consumed: false,
    rank_score: rankBonus,
  };

  const id = await createThresholdEvent(db, event);
  return { ...event, id };
}

/**
 * Detect period/quarter changes
 */
export async function detectPeriodChange(
  db: D1Database,
  input: GameLifecycleInput
): Promise<ThresholdEvent | null> {
  const { game, previousGame, poolContext } = input;
  
  if (game.status !== 'IN_PROGRESS' || !previousGame) return null;
  
  const prevPeriod = previousGame.period_number ?? 0;
  const currPeriod = game.period_number ?? 0;
  
  // Only trigger on actual period change
  if (prevPeriod === currPeriod || currPeriod <= prevPeriod) return null;
  
  // Determine significance - halftime, end of regulation, overtime
  const isHalftime = (game.sport === 'nba' || game.sport === 'ncaab') && currPeriod === 3;
  const isSecondHalf = game.sport === 'soccer' && currPeriod === 2;
  const isOT = (game.sport === 'nfl' && currPeriod === 5) ||
               ((game.sport === 'nba' || game.sport === 'ncaab') && currPeriod === 5) ||
               (game.sport === 'nhl' && currPeriod === 4);
  const isFourthQuarter = (game.sport === 'nfl' || game.sport === 'ncaaf') && currPeriod === 4;
  
  // Only surface significant period changes
  if (!isHalftime && !isSecondHalf && !isOT && !isFourthQuarter) {
    return null;
  }
  
  let severity: Severity = 'INFO';
  let rankBonus = 0;
  let headline = '';
  
  if (isOT) {
    severity = 'CRITICAL';
    headline = `OVERTIME: ${game.away_team_abbr} ${game.away_score} - ${game.home_team_abbr} ${game.home_score}`;
    rankBonus = 25;
  } else if (isHalftime) {
    headline = `Halftime: ${game.away_team_abbr} ${game.away_score} - ${game.home_team_abbr} ${game.home_score}`;
    rankBonus = 5;
  } else if (isSecondHalf) {
    headline = `2nd Half: ${game.away_team_abbr} ${game.away_score} - ${game.home_team_abbr} ${game.home_score}`;
    rankBonus = 5;
  } else if (isFourthQuarter) {
    severity = 'IMPACT';
    headline = `4th Quarter: ${game.away_team_abbr} ${game.away_score} - ${game.home_team_abbr} ${game.home_score}`;
    rankBonus = 10;
  }
  
  // Close game in significant period elevates severity
  const margin = Math.abs((game.home_score ?? 0) - (game.away_score ?? 0));
  const isCloseGame = 
    (game.sport === 'nfl' && margin <= 8) ||
    (game.sport === 'nba' && margin <= 10) ||
    (game.sport === 'mlb' && margin <= 2) ||
    (game.sport === 'nhl' && margin <= 1) ||
    (game.sport === 'soccer' && margin <= 1);
  
  if (isCloseGame && (isFourthQuarter || isOT)) {
    severity = 'CRITICAL';
    rankBonus += 15;
    
    if (poolContext?.leadersOnTeam && poolContext.leadersOnTeam.length > 0) {
      rankBonus += 10;
    }
  }
  
  const event: Omit<ThresholdEvent, 'id' | 'created_at'> = {
    data_scope: input.dataScope,
    sport_type: game.sport.toUpperCase(),
    game_id: parseInt(game.game_id.split('-').pop() || '0'),
    event_category: 'GAMESTATE',
    event_type: 'PERIOD_CHANGE',
    severity,
    headline,
    details_json: JSON.stringify({
      game_id: game.game_id,
      away_team: game.away_team_name,
      home_team: game.home_team_name,
      away_abbr: game.away_team_abbr,
      home_abbr: game.home_team_abbr,
      away_score: game.away_score,
      home_score: game.home_score,
      prev_period: prevPeriod,
      curr_period: currPeriod,
      period_label: game.period_label,
      is_overtime: isOT,
      is_close_game: isCloseGame,
      margin,
    }),
    source: 'Live Scores',
    expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    is_visible: true,
    is_consumed: false,
    rank_score: rankBonus,
  };

  const id = await createThresholdEvent(db, event);
  return { ...event, id };
}

/**
 * Process all game state changes and return triggered events
 * This is the main entry point for live scores integration
 */
export async function processGameStateChange(
  db: D1Database,
  input: GameLifecycleInput
): Promise<ThresholdEvent[]> {
  const events: ThresholdEvent[] = [];
  
  // Check game started
  const startedEvent = await detectGameStarted(db, input);
  if (startedEvent) events.push(startedEvent);
  
  // Check game ended
  const endedEvent = await detectGameEnded(db, input);
  if (endedEvent) events.push(endedEvent);
  
  // Check score update (only if game didn't just start or end)
  if (!startedEvent && !endedEvent) {
    const scoreEvent = await detectScoreUpdate(db, input);
    if (scoreEvent) events.push(scoreEvent);
    
    // Check period change
    const periodEvent = await detectPeriodChange(db, input);
    if (periodEvent) events.push(periodEvent);
  }
  
  return events;
}

// ============================================
// WHAT JUST CHANGED - RANKING & OUTPUT
// ============================================

export interface WhatJustChangedOptions {
  dataScope: 'DEMO' | 'PROD';
  gameId?: number;
  leagueId?: number;
  maxItems?: number;
  includeExpired?: boolean;
}

export interface WhatJustChangedItem {
  id: number;
  category: EventCategory;
  type: EventType;
  severity: Severity;
  headline: string;
  details: Record<string, any>;
  createdAt: string;
  ageMinutes: number;
}

export interface WhatJustChangedResult {
  items: WhatJustChangedItem[];
  hasChanges: boolean;
  message: string;
}

export async function getWhatJustChanged(
  db: D1Database,
  options: WhatJustChangedOptions
): Promise<WhatJustChangedResult> {
  const maxItems = options.maxItems ?? 3;

  let query = `
    SELECT * FROM threshold_events
    WHERE data_scope = ?
      AND is_visible = 1
  `;
  const params: (string | number)[] = [options.dataScope];

  if (!options.includeExpired) {
    query += ` AND (expires_at IS NULL OR expires_at > datetime('now'))`;
  }

  if (options.gameId) {
    query += ` AND game_id = ?`;
    params.push(options.gameId);
  }

  if (options.leagueId) {
    query += ` AND (league_context_id = ? OR league_context_id IS NULL)`;
    params.push(options.leagueId);
  }

  // Order by: severity weight + rank_score, then recency
  query += `
    ORDER BY 
      (CASE severity 
        WHEN 'CRITICAL' THEN 100 
        WHEN 'IMPACT' THEN 50 
        ELSE 10 
      END) + rank_score DESC,
      created_at DESC
    LIMIT ?
  `;
  params.push(maxItems);

  const result = await db.prepare(query).bind(...params).all();
  const results = result.results || [];

  if (results.length === 0) {
    return {
      items: [],
      hasChanges: false,
      message: 'No material changes'
    };
  }

  const items: WhatJustChangedItem[] = (results as Record<string, unknown>[]).map((row) => {
    const createdAtStr = row.created_at as string;
    const createdAt = new Date(createdAtStr);
    const now = new Date();
    const ageMinutes = Math.round((now.getTime() - createdAt.getTime()) / 60000);
    const detailsJson = row.details_json as string | null;

    return {
      id: row.id as number,
      category: row.event_category as EventCategory,
      type: row.event_type as EventType,
      severity: row.severity as Severity,
      headline: row.headline as string,
      details: detailsJson ? JSON.parse(detailsJson) : {},
      createdAt: createdAtStr,
      ageMinutes
    };
  });

  return {
    items,
    hasChanges: true,
    message: `${items.length} material change${items.length !== 1 ? 's' : ''}`
  };
}

// ============================================
// AI ACTIVATION GATING
// ============================================

export interface AIActivationResult {
  allowed: boolean;
  reason: string;
  triggeringEvents?: ThresholdEvent[];
}

export async function checkAIActivation(
  db: D1Database,
  dataScope: 'DEMO' | 'PROD',
  gameId: number
): Promise<AIActivationResult> {
  const config = await getThresholdConfig(db);
  const windowMinutes = getConfigValue(config, 'AI_MULTI_TRIGGER_WINDOW_MINUTES');

  // Check for high-severity standalone triggers
  const criticalEvents = await db.prepare(`
    SELECT * FROM threshold_events
    WHERE data_scope = ?
      AND game_id = ?
      AND is_visible = 1
      AND severity = 'CRITICAL'
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      AND created_at >= datetime('now', '-' || ? || ' minutes')
    ORDER BY created_at DESC
    LIMIT 5
  `).bind(dataScope, gameId, windowMinutes).all();
  const criticalResults = criticalEvents.results || [];

  // If any CRITICAL event exists, allow AI
  if (criticalResults.length > 0) {
    const events = criticalResults as any[];
    
    // Check for specific high-priority triggers
    for (const event of events) {
      const details = event.details_json ? JSON.parse(event.details_json) : {};
      
      // Late injury
      if (event.event_category === 'INJURY' && event.event_type === 'LATE_SCRATCH') {
        return {
          allowed: true,
          reason: 'Late injury update detected',
          triggeringEvents: events
        };
      }
      
      // Favorite flip
      if (event.event_type === 'FAVORITE_FLIP') {
        return {
          allowed: true,
          reason: 'Favorite/underdog flip detected',
          triggeringEvents: events
        };
      }
      
      // Elimination cascade
      if (event.event_type === 'ELIMINATION_CASCADE' && parseFloat(details.percentage || 0) >= 25) {
        return {
          allowed: true,
          reason: 'Significant elimination risk detected',
          triggeringEvents: events
        };
      }
      
      // Leader risk
      if (event.event_type === 'LEADER_RISK') {
        return {
          allowed: true,
          reason: 'Pool leaders at risk',
          triggeringEvents: events
        };
      }
    }
  }

  // Check for multi-trigger scenario (2+ events in window)
  const recentEvents = await db.prepare(`
    SELECT * FROM threshold_events
    WHERE data_scope = ?
      AND game_id = ?
      AND is_visible = 1
      AND severity IN ('IMPACT', 'CRITICAL')
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      AND created_at >= datetime('now', '-' || ? || ' minutes')
    ORDER BY created_at DESC
  `).bind(dataScope, gameId, windowMinutes).all();
  const recentResults = recentEvents.results || [];

  if (recentResults.length >= 2) {
    // Check for different categories (e.g., injury + line move)
    const categories = new Set((recentResults as any[]).map(e => e.event_category));
    if (categories.size >= 2) {
      return {
        allowed: true,
        reason: 'Multiple related events detected',
        triggeringEvents: recentResults as any[]
      };
    }
  }

  return {
    allowed: false,
    reason: 'No significant triggers - AI will respond only to user questions'
  };
}

// ============================================
// DEMO SIMULATION HELPERS
// ============================================

export async function simulateSpreadMove(
  db: D1Database,
  gameId: number,
  oldSpread: number,
  newSpread: number,
  sportType: string = 'NFL'
): Promise<ThresholdEvent | null> {
  return detectSpreadMove(db, {
    dataScope: 'DEMO',
    sportType,
    gameId,
    oldSpread,
    newSpread,
    isLive: false,
    source: 'Demo Simulation'
  });
}

export async function simulateInjury(
  db: D1Database,
  gameId: number,
  playerName: string,
  position: string,
  newStatus: string,
  sportType: string = 'NFL'
): Promise<ThresholdEvent | null> {
  return detectInjuryUpdate(db, {
    dataScope: 'DEMO',
    sportType,
    gameId,
    playerName,
    position,
    isStarter: true,
    oldStatus: 'Active',
    newStatus,
    minutesToGame: 30, // Late injury
    source: 'Demo Simulation'
  });
}

export async function simulateWeather(
  db: D1Database,
  gameId: number,
  windMph: number,
  sportType: string = 'NFL'
): Promise<ThresholdEvent[]> {
  return detectWeatherThreshold(db, {
    dataScope: 'DEMO',
    sportType,
    gameId,
    windSustained: windMph,
    source: 'Demo Simulation'
  });
}

export async function simulateSurvivorCascade(
  db: D1Database,
  leagueId: number,
  gameId: number,
  teamName: string,
  atRiskCount: number,
  aliveCount: number,
  sportType: string = 'NFL'
): Promise<ThresholdEvent | null> {
  return detectSurvivorEliminationRisk(db, {
    dataScope: 'DEMO',
    sportType,
    leagueId,
    gameId,
    teamName,
    atRiskCount,
    aliveCount,
    source: 'Demo Simulation'
  });
}

export async function simulateLeadChange(
  db: D1Database,
  gameId: number,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  minutesRemaining: number,
  sportType: string = 'NFL'
): Promise<ThresholdEvent | null> {
  return detectGameStateChange(db, {
    dataScope: 'DEMO',
    sportType,
    gameId,
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    previousHomeScore: homeScore - 7,
    previousAwayScore: awayScore,
    minutesRemaining,
    affectsPool: true,
    source: 'Demo Simulation'
  });
}

/**
 * Clear demo threshold events (for reset)
 */
export async function clearDemoThresholdEvents(db: D1Database): Promise<void> {
  await db.prepare(`DELETE FROM threshold_events WHERE data_scope = 'DEMO'`).run();
}

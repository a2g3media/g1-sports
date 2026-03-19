/**
 * Weather Alert Trigger Engine
 * 
 * Detects weather conditions that may impact outdoor games
 * and creates alerts for users following those games.
 * 
 * Impact Factors:
 * - Wind: High winds affect passing games, field goals
 * - Precipitation: Rain/snow affects ball handling, footing
 * - Temperature: Extreme cold/heat affects player performance
 * - Visibility: Fog, snow can impact play
 * 
 * Severity Rules:
 * - CRITICAL: Severe weather, game delay/postponement risk
 * - IMPACT: Significant conditions (20+ mph wind, heavy rain/snow)
 * - NOTICE: Moderate conditions (15+ mph wind, light rain)
 * - INFO: Minor conditions worth noting
 */

import type {
  AlertCategory,
  AlertSeverity,
  WeatherAlertData,
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

export interface WeatherConditions {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  isDome: boolean;
  gameTime: string;
  
  // Conditions
  temperature: number;        // Fahrenheit
  feelsLike?: number;         // Wind chill / heat index
  windSpeed: number;          // MPH
  windGust?: number;          // MPH
  windDirection?: string;     // N, NE, E, etc.
  precipitationChance: number; // 0-100
  precipitationType?: "rain" | "snow" | "sleet" | "mixed" | "none";
  humidity?: number;          // 0-100
  visibility?: number;        // Miles
  conditions: string;         // "Partly Cloudy", "Rain", etc.
  
  // Metadata
  forecastedAt: string;
  source?: string;
}

export interface WeatherAlert {
  userId: string;
  dataScope: DataScope;
  category: AlertCategory;
  severity: AlertSeverity;
  headline: string;
  body: string;
  gameId: string;
  sourceType: "WEATHER_API";
  sourceData: WeatherAlertData;
  deepLink: string;
  dedupeKey: string;
  expiresAt?: string;
}

export interface UserWeatherPrefs {
  userId: string;
  categoryWeather: boolean;
  weatherImpactMinimum: number;
}

// Impact thresholds by sport
const WIND_THRESHOLDS = {
  NFL: { notice: 15, impact: 20, critical: 30 },
  NCAAF: { notice: 15, impact: 20, critical: 30 },
  MLB: { notice: 12, impact: 18, critical: 25 },
  SOCCER: { notice: 20, impact: 25, critical: 35 },
  DEFAULT: { notice: 15, impact: 20, critical: 30 },
};

const TEMP_THRESHOLDS = {
  cold: { notice: 32, impact: 20, critical: 10 },
  heat: { notice: 90, impact: 95, critical: 100 },
};

// =====================================================
// IMPACT CALCULATION
// =====================================================

/**
 * Calculate overall weather impact score (1-5)
 */
export function calculateWeatherImpact(
  conditions: WeatherConditions
): {
  impactScore: number;
  impactNotes: string[];
  severity: AlertSeverity;
  factors: {
    wind: number;
    precipitation: number;
    temperature: number;
    visibility: number;
  };
} {
  // Dome games have no weather impact
  if (conditions.isDome) {
    return {
      impactScore: 1,
      impactNotes: ["Indoor venue - weather not a factor"],
      severity: "INFO",
      factors: { wind: 0, precipitation: 0, temperature: 0, visibility: 0 },
    };
  }
  
  const impactNotes: string[] = [];
  let windImpact = 0;
  let precipImpact = 0;
  let tempImpact = 0;
  let visibilityImpact = 0;
  
  const sport = conditions.sport.toUpperCase();
  const windThresh = WIND_THRESHOLDS[sport as keyof typeof WIND_THRESHOLDS] || WIND_THRESHOLDS.DEFAULT;
  
  // Wind impact
  const effectiveWind = conditions.windGust || conditions.windSpeed;
  if (effectiveWind >= windThresh.critical) {
    windImpact = 5;
    impactNotes.push(`Severe winds (${effectiveWind} mph) will significantly affect play`);
  } else if (effectiveWind >= windThresh.impact) {
    windImpact = 4;
    impactNotes.push(`Strong winds (${effectiveWind} mph) may impact passing and kicking`);
  } else if (effectiveWind >= windThresh.notice) {
    windImpact = 2;
    impactNotes.push(`Moderate winds (${effectiveWind} mph) present`);
  }
  
  // Precipitation impact
  if (conditions.precipitationChance >= 80) {
    const type = conditions.precipitationType || "precipitation";
    if (type === "snow" || type === "sleet" || type === "mixed") {
      precipImpact = 5;
      impactNotes.push(`High chance of ${type} (${conditions.precipitationChance}%)`);
    } else {
      precipImpact = 4;
      impactNotes.push(`High chance of rain (${conditions.precipitationChance}%)`);
    }
  } else if (conditions.precipitationChance >= 60) {
    precipImpact = 3;
    impactNotes.push(`Likely precipitation (${conditions.precipitationChance}%)`);
  } else if (conditions.precipitationChance >= 40) {
    precipImpact = 2;
    impactNotes.push(`Possible precipitation (${conditions.precipitationChance}%)`);
  }
  
  // Temperature impact
  if (conditions.temperature <= TEMP_THRESHOLDS.cold.critical) {
    tempImpact = 5;
    impactNotes.push(`Extreme cold (${conditions.temperature}°F) - potential player safety concern`);
  } else if (conditions.temperature <= TEMP_THRESHOLDS.cold.impact) {
    tempImpact = 4;
    impactNotes.push(`Very cold conditions (${conditions.temperature}°F)`);
  } else if (conditions.temperature <= TEMP_THRESHOLDS.cold.notice) {
    tempImpact = 2;
    impactNotes.push(`Cold conditions (${conditions.temperature}°F)`);
  } else if (conditions.temperature >= TEMP_THRESHOLDS.heat.critical) {
    tempImpact = 5;
    impactNotes.push(`Extreme heat (${conditions.temperature}°F) - potential player safety concern`);
  } else if (conditions.temperature >= TEMP_THRESHOLDS.heat.impact) {
    tempImpact = 4;
    impactNotes.push(`Very hot conditions (${conditions.temperature}°F)`);
  } else if (conditions.temperature >= TEMP_THRESHOLDS.heat.notice) {
    tempImpact = 2;
    impactNotes.push(`Hot conditions (${conditions.temperature}°F)`);
  }
  
  // Visibility impact
  if (conditions.visibility !== undefined) {
    if (conditions.visibility < 0.5) {
      visibilityImpact = 5;
      impactNotes.push(`Very poor visibility (${conditions.visibility} mi)`);
    } else if (conditions.visibility < 1) {
      visibilityImpact = 4;
      impactNotes.push(`Poor visibility (${conditions.visibility} mi)`);
    } else if (conditions.visibility < 3) {
      visibilityImpact = 2;
      impactNotes.push(`Reduced visibility (${conditions.visibility} mi)`);
    }
  }
  
  // Calculate overall impact (max of all factors, with bonus for multiple factors)
  const maxImpact = Math.max(windImpact, precipImpact, tempImpact, visibilityImpact);
  const factorCount = [windImpact, precipImpact, tempImpact, visibilityImpact].filter(f => f >= 2).length;
  const multiFactorBonus = factorCount >= 3 ? 1 : factorCount >= 2 ? 0.5 : 0;
  const impactScore = Math.min(5, Math.max(1, Math.round(maxImpact + multiFactorBonus)));
  
  // Determine severity
  let severity: AlertSeverity = "INFO";
  if (impactScore >= 5) {
    severity = "CRITICAL";
  } else if (impactScore >= 4) {
    severity = "IMPACT";
  } else if (impactScore >= 3) {
    severity = "NOTICE";
  }
  
  return {
    impactScore,
    impactNotes,
    severity,
    factors: {
      wind: windImpact,
      precipitation: precipImpact,
      temperature: tempImpact,
      visibility: visibilityImpact,
    },
  };
}

// =====================================================
// ALERT GENERATION
// =====================================================

/**
 * Generate headline for a weather alert
 */
function generateHeadline(
  conditions: WeatherConditions,
  impact: ReturnType<typeof calculateWeatherImpact>
): string {
  const { homeTeam, awayTeam, venue } = conditions;
  const matchup = `${awayTeam} @ ${homeTeam}`;
  
  if (impact.impactScore >= 5) {
    return `Severe weather alert: ${matchup}`;
  }
  
  if (impact.impactScore >= 4) {
    // Highlight the primary factor
    if (impact.factors.wind >= 4) {
      return `High wind warning: ${matchup}`;
    }
    if (impact.factors.precipitation >= 4) {
      const type = conditions.precipitationType === "snow" ? "Snow" : "Rain";
      return `${type} expected: ${matchup}`;
    }
    if (impact.factors.temperature >= 4) {
      const type = conditions.temperature < 32 ? "Extreme cold" : "Extreme heat";
      return `${type} warning: ${matchup}`;
    }
    return `Weather advisory: ${matchup}`;
  }
  
  return `Weather note for ${matchup} at ${venue}`;
}

/**
 * Generate body text for a weather alert
 */
function generateBody(
  conditions: WeatherConditions,
  impact: ReturnType<typeof calculateWeatherImpact>
): string {
  const parts: string[] = [];
  
  // Main conditions
  parts.push(`${conditions.conditions}, ${conditions.temperature}°F.`);
  
  // Wind info
  if (conditions.windSpeed >= 10) {
    const gustStr = conditions.windGust ? ` (gusts to ${conditions.windGust})` : "";
    parts.push(`Wind: ${conditions.windSpeed} mph ${conditions.windDirection || ""}${gustStr}.`);
  }
  
  // Precipitation
  if (conditions.precipitationChance >= 30) {
    const type = conditions.precipitationType || "precipitation";
    parts.push(`${conditions.precipitationChance}% chance of ${type}.`);
  }
  
  // Impact notes
  if (impact.impactNotes.length > 0) {
    parts.push(impact.impactNotes[0]);
  }
  
  return parts.join(" ");
}

/**
 * Create a weather alert object
 */
export function createWeatherAlert(
  userId: string,
  dataScope: DataScope,
  conditions: WeatherConditions,
  impact: ReturnType<typeof calculateWeatherImpact>
): WeatherAlert {
  const headline = generateHeadline(conditions, impact);
  const body = generateBody(conditions, impact);
  
  // Dedupe key: one alert per game per day per impact level
  const dateKey = new Date().toISOString().slice(0, 10);
  const dedupeKey = `WEATHER:${conditions.gameId}:${impact.impactScore}:${dateKey}`;
  
  // Expiry: weather alerts expire after game time
  const gameTime = new Date(conditions.gameTime);
  const expiresAt = new Date(gameTime.getTime() + 4 * 60 * 60 * 1000).toISOString(); // 4 hours after game start
  
  const sourceData: WeatherAlertData = {
    gameId: conditions.gameId,
    venue: conditions.venue,
    homeTeam: conditions.homeTeam,
    awayTeam: conditions.awayTeam,
    conditions: conditions.conditions,
    temperature: conditions.temperature,
    windSpeed: conditions.windSpeed,
    windDirection: conditions.windDirection,
    precipitationChance: conditions.precipitationChance,
    precipitationType: conditions.precipitationType,
    impactScore: impact.impactScore,
    impactNotes: impact.impactNotes.join(" "),
    isDome: conditions.isDome,
  };
  
  return {
    userId,
    dataScope,
    category: "WEATHER",
    severity: impact.severity,
    headline,
    body,
    gameId: conditions.gameId,
    sourceType: "WEATHER_API",
    sourceData,
    deepLink: `/game/${conditions.gameId}`,
    dedupeKey,
    expiresAt,
  };
}

// =====================================================
// DATABASE OPERATIONS
// =====================================================

/**
 * Fetch users who should receive weather alerts for a game
 */
export async function getUsersForWeatherAlerts(
  db: D1Database,
  gameId: string,
  dataScope: DataScope
): Promise<UserWeatherPrefs[]> {
  const query = `
    SELECT DISTINCT 
      sap.user_id,
      sap.category_weather,
      sap.weather_impact_minimum
    FROM scout_alert_preferences sap
    WHERE sap.category_weather = 1
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
    categoryWeather: Boolean(row.category_weather),
    weatherImpactMinimum: (row.weather_impact_minimum as number) || 3,
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
 * Insert a new weather alert into the database
 */
export async function insertWeatherAlert(
  db: D1Database,
  alert: WeatherAlert
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

export interface WeatherTriggerResult {
  processed: boolean;
  alertsCreated: number;
  userIds: string[];
  severity: AlertSeverity;
  impactScore: number;
  impactNotes: string[];
}

/**
 * Main entry point: Process weather conditions and create alerts for relevant users
 */
export async function triggerWeatherAlerts(
  db: D1Database,
  conditions: WeatherConditions,
  dataScope: DataScope
): Promise<WeatherTriggerResult> {
  // Calculate weather impact
  const impact = calculateWeatherImpact(conditions);
  
  const result: WeatherTriggerResult = {
    processed: false,
    alertsCreated: 0,
    userIds: [],
    severity: impact.severity,
    impactScore: impact.impactScore,
    impactNotes: impact.impactNotes,
  };
  
  // Skip if impact is minimal
  if (impact.impactScore < 2) {
    return result;
  }
  
  result.processed = true;
  
  // Get users who should receive this alert
  const users = await getUsersForWeatherAlerts(db, conditions.gameId, dataScope);
  
  // Filter by user's minimum impact threshold
  const eligibleUsers = users.filter(user => impact.impactScore >= user.weatherImpactMinimum);
  
  // Create and insert alerts for each eligible user
  for (const user of eligibleUsers) {
    const alert = createWeatherAlert(user.userId, dataScope, conditions, impact);
    const alertId = await insertWeatherAlert(db, alert);
    
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

const DEMO_VENUES: { name: string; isDome: boolean }[] = [
  { name: "Arrowhead Stadium", isDome: false },
  { name: "Lambeau Field", isDome: false },
  { name: "AT&T Stadium", isDome: true },
  { name: "Soldier Field", isDome: false },
  { name: "U.S. Bank Stadium", isDome: true },
];

/**
 * Generate sample weather conditions for testing
 */
export function generateDemoWeatherConditions(
  gameId: string,
  sport: string,
  homeTeam: string,
  awayTeam: string,
  options: {
    scenario?: "clear" | "windy" | "rainy" | "snowy" | "extreme_cold" | "extreme_heat" | "severe";
    venueIndex?: number;
    forceDome?: boolean;
  } = {}
): WeatherConditions {
  const venueIndex = options.venueIndex ?? Math.floor(Math.random() * DEMO_VENUES.length);
  const venue = DEMO_VENUES[venueIndex % DEMO_VENUES.length];
  const isDome = options.forceDome ?? venue.isDome;
  const scenario = options.scenario || "clear";
  
  let temperature = 65;
  let windSpeed = 5;
  let windGust: number | undefined;
  let precipitationChance = 10;
  let precipitationType: "rain" | "snow" | "none" = "none";
  let conditions = "Clear";
  let visibility = 10;
  
  switch (scenario) {
    case "clear":
      temperature = 72;
      windSpeed = 8;
      precipitationChance = 5;
      conditions = "Partly Cloudy";
      break;
    case "windy":
      temperature = 55;
      windSpeed = 22;
      windGust = 32;
      precipitationChance = 20;
      conditions = "Windy";
      break;
    case "rainy":
      temperature = 48;
      windSpeed = 12;
      precipitationChance = 85;
      precipitationType = "rain";
      conditions = "Rain";
      visibility = 5;
      break;
    case "snowy":
      temperature = 28;
      windSpeed = 15;
      precipitationChance = 90;
      precipitationType = "snow";
      conditions = "Snow";
      visibility = 2;
      break;
    case "extreme_cold":
      temperature = 5;
      windSpeed = 18;
      precipitationChance = 40;
      precipitationType = "snow";
      conditions = "Frigid";
      break;
    case "extreme_heat":
      temperature = 102;
      windSpeed = 5;
      precipitationChance = 5;
      conditions = "Hot and Humid";
      break;
    case "severe":
      temperature = 45;
      windSpeed = 35;
      windGust = 50;
      precipitationChance = 95;
      precipitationType = "rain";
      conditions = "Severe Thunderstorm Warning";
      visibility = 0.5;
      break;
  }
  
  const gameTime = new Date();
  gameTime.setHours(gameTime.getHours() + 3);
  
  return {
    gameId,
    sport,
    homeTeam,
    awayTeam,
    venue: venue.name,
    isDome,
    gameTime: gameTime.toISOString(),
    temperature,
    feelsLike: temperature - (windSpeed > 15 ? 10 : 0),
    windSpeed,
    windGust,
    windDirection: "NW",
    precipitationChance,
    precipitationType: precipitationType === "none" ? undefined : precipitationType,
    humidity: 65,
    visibility,
    conditions,
    forecastedAt: new Date().toISOString(),
    source: "Demo Weather",
  };
}

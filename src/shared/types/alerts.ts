/**
 * Scout Intelligence Engine v2 - Alert Types & Configuration
 * 
 * All alerts are informational only - no betting advice.
 * Outputs include timestamps, sources, and maintain a calm professional tone.
 */

// ============================================================================
// Alert Categories
// ============================================================================

export type AlertCategory = 
  | 'LINE_MOVEMENT'    // Spread, total, or moneyline changes
  | 'INJURY'           // Player status changes (OUT, Doubtful, Questionable, etc.)
  | 'WEATHER'          // Game-impacting weather conditions
  | 'GAME_STATE'       // Live game events (start, halftime, overtime, final)
  | 'SCHEDULE';        // Lock reminders, postponements, cancellations

export type AlertSeverity = 
  | 'INFO'      // Informational, low priority
  | 'NOTICE'    // Worth noting, medium priority
  | 'IMPACT'    // Significant, high priority
  | 'CRITICAL'; // Urgent, immediate attention

// ============================================================================
// Alert Preference Types
// ============================================================================

export interface ScoutAlertPreferences {
  id?: number;
  userId: string;
  
  // Category toggles (all opt-in by default)
  categoryLineMovement: boolean;
  categoryInjury: boolean;
  categoryWeather: boolean;
  categoryGameState: boolean;
  categorySchedule: boolean;
  
  // Thresholds
  lineMovementPoints: number;     // e.g., 0.5 = alert on 0.5+ point moves
  weatherImpactMinimum: number;   // 1-5 scale, 3 = moderate impact
  
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_SCOUT_ALERT_PREFERENCES: Omit<ScoutAlertPreferences, 'userId'> = {
  categoryLineMovement: true,
  categoryInjury: true,
  categoryWeather: true,
  categoryGameState: true,
  categorySchedule: true,
  lineMovementPoints: 0.5,
  weatherImpactMinimum: 3,
};

// ============================================================================
// Alert Event Types
// ============================================================================

export interface ScoutAlert {
  id?: number;
  dataScope: 'DEV' | 'PROD';
  userId: string;
  category: AlertCategory;
  severity: AlertSeverity;
  headline: string;
  body?: string;
  
  // Context references
  gameId?: string;
  teamKey?: string;
  playerKey?: string;
  
  // Source tracking
  sourceType?: AlertSourceType;
  sourceData?: AlertSourceData;
  
  // Navigation
  deepLink?: string;
  
  // Deduplication
  dedupeKey: string;
  
  // Lifecycle
  expiresAt?: string;
  readAt?: string;
  dismissedAt?: string;
  actionTaken?: string;
  
  createdAt?: string;
  updatedAt?: string;
}

export type AlertSourceType = 
  | 'ODDS_API'
  | 'INJURY_FEED'
  | 'WEATHER_API'
  | 'LIVE_SCORES'
  | 'SCHEDULE_API'
  | 'MANUAL';

export interface AlertSourceData {
  provider?: string;
  fetchedAt?: string;
  confidence?: number;
  rawData?: Record<string, unknown>;
}

// ============================================================================
// Category-Specific Alert Data
// ============================================================================

export interface LineMovementAlertData {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  marketType: 'SPREAD' | 'TOTAL' | 'MONEYLINE';
  previousValue: number;
  currentValue: number;
  change: number;
  changeDirection: 'UP' | 'DOWN';
  bookmaker?: string;
  cause?: LineMovementCause;
}

export type LineMovementCause = 
  | 'INJURY'      // Movement caused by injury news
  | 'WEATHER'     // Movement caused by weather
  | 'NEWS'        // Movement caused by other news
  | 'STEAM'       // Sharp money/steam move
  | 'UNKNOWN';    // Cause not identified

export interface InjuryAlertData {
  playerId?: string;
  playerName: string;
  teamKey: string;
  teamName: string;
  position?: string;
  previousStatus?: string;
  currentStatus: string;
  injuryType?: string;
  estimatedReturn?: string;
  impactRating?: 'HIGH' | 'MEDIUM' | 'LOW';
  affectedGames?: string[];
}

export interface WeatherAlertData {
  gameId: string;
  venue: string;
  homeTeam: string;
  awayTeam: string;
  conditions: string;
  temperature?: number;
  windSpeed?: number;
  windDirection?: string;
  precipitationChance?: number;
  precipitationType?: string;
  impactScore: number; // 1-5
  impactNotes?: string;
  isDome: boolean;
}

export interface GameStateAlertData {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  previousState?: GameState;
  currentState: GameState;
  homeScore?: number;
  awayScore?: number;
  timeRemaining?: string;
  period?: string;
}

export type GameState = 
  | 'SCHEDULED'
  | 'PREGAME'
  | 'IN_PROGRESS'
  | 'HALFTIME'
  | 'END_PERIOD'
  | 'OVERTIME'
  | 'FINAL'
  | 'DELAYED'
  | 'POSTPONED'
  | 'CANCELLED';

export interface ScheduleAlertData {
  gameId?: string;
  poolId?: number;
  poolName?: string;
  alertType: ScheduleAlertType;
  originalTime?: string;
  newTime?: string;
  lockTime?: string;
  minutesUntilLock?: number;
  reason?: string;
}

export type ScheduleAlertType = 
  | 'LOCK_REMINDER'    // Pick deadline approaching
  | 'POSTPONEMENT'     // Game postponed
  | 'CANCELLATION'     // Game cancelled
  | 'TIME_CHANGE'      // Game time changed
  | 'VENUE_CHANGE';    // Game venue changed

// ============================================================================
// Alert Generation Thresholds
// ============================================================================

export interface AlertThresholds {
  // Line Movement
  lineMovement: {
    spread: number;      // Points (e.g., 0.5)
    total: number;       // Points (e.g., 0.5)
    moneyline: number;   // American odds change (e.g., 10 = -110 to -120)
  };
  
  // Injury
  injury: {
    statusesOfInterest: string[];  // OUT, Doubtful, Questionable
    impactMinimum: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  
  // Weather
  weather: {
    impactScoreMinimum: number;    // 1-5 scale
    windSpeedMinimum: number;      // MPH
    precipitationChanceMinimum: number; // Percentage
  };
  
  // Game State
  gameState: {
    alertOnStart: boolean;
    alertOnHalftime: boolean;
    alertOnOvertimeStart: boolean;
    alertOnFinal: boolean;
    alertOnDelay: boolean;
  };
  
  // Schedule
  schedule: {
    lockReminderMinutes: number[];  // e.g., [60, 15] = 1 hour and 15 min reminders
    alertOnPostponement: boolean;
    alertOnCancellation: boolean;
  };
}

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  lineMovement: {
    spread: 0.5,
    total: 0.5,
    moneyline: 10,
  },
  injury: {
    statusesOfInterest: ['OUT', 'Doubtful', 'Questionable'],
    impactMinimum: 'MEDIUM',
  },
  weather: {
    impactScoreMinimum: 3,
    windSpeedMinimum: 15,
    precipitationChanceMinimum: 40,
  },
  gameState: {
    alertOnStart: true,
    alertOnHalftime: false,
    alertOnOvertimeStart: true,
    alertOnFinal: true,
    alertOnDelay: true,
  },
  schedule: {
    lockReminderMinutes: [60, 15],
    alertOnPostponement: true,
    alertOnCancellation: true,
  },
};

// ============================================================================
// Alert Delivery
// ============================================================================

export type DeliveryChannel = 'IN_APP' | 'PUSH' | 'EMAIL' | 'SMS';

export interface AlertDeliveryOptions {
  channels: DeliveryChannel[];
  quietHoursEnabled: boolean;
  quietHoursStart: string;  // HH:MM format
  quietHoursEnd: string;    // HH:MM format
}

export const DEFAULT_DELIVERY_OPTIONS: AlertDeliveryOptions = {
  channels: ['IN_APP'],
  quietHoursEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

// ============================================================================
// Alert Creation Helpers
// ============================================================================

export function generateDedupeKey(
  category: AlertCategory,
  ...identifiers: (string | number | undefined)[]
): string {
  const parts = [category, ...identifiers.filter(Boolean)];
  return parts.join(':');
}

export function getSeverityFromImpact(impactRating: 'HIGH' | 'MEDIUM' | 'LOW'): AlertSeverity {
  switch (impactRating) {
    case 'HIGH': return 'IMPACT';
    case 'MEDIUM': return 'NOTICE';
    case 'LOW': return 'INFO';
  }
}

export function getSeverityFromWeatherImpact(impactScore: number): AlertSeverity {
  if (impactScore >= 5) return 'CRITICAL';
  if (impactScore >= 4) return 'IMPACT';
  if (impactScore >= 3) return 'NOTICE';
  return 'INFO';
}

export function formatAlertTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

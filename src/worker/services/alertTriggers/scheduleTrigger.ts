/**
 * Schedule Alert Trigger Engine
 * 
 * Handles schedule-related alerts including pick deadlines,
 * game time changes, and postponements.
 * 
 * Alert Types:
 * - LOCK_REMINDER: Pick deadline approaching (e.g., 1 hour, 15 min)
 * - TIME_CHANGE: Game time has changed
 * - POSTPONEMENT: Game postponed to new date
 * - CANCELLATION: Game cancelled
 * - VENUE_CHANGE: Game venue changed
 * 
 * Severity Rules:
 * - CRITICAL: Cancellation, imminent lock (< 15 min)
 * - IMPACT: Postponement, lock reminder (< 1 hour)
 * - NOTICE: Time change, venue change, longer lock reminders
 * - INFO: General schedule updates
 */

import type {
  AlertCategory,
  AlertSeverity,
  ScheduleAlertData,
  ScheduleAlertType,
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

export interface LockReminder {
  poolId: number;
  poolName: string;
  lockTime: string;
  minutesUntilLock: number;
  gameCount: number;
  userId: string;
  hasUnsubmittedPicks: boolean;
}

export interface ScheduleChange {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  changeType: ScheduleAlertType;
  originalTime?: string;
  newTime?: string;
  originalVenue?: string;
  newVenue?: string;
  reason?: string;
  detectedAt: string;
}

export interface ScheduleAlert {
  userId: string;
  dataScope: DataScope;
  category: AlertCategory;
  severity: AlertSeverity;
  headline: string;
  body: string;
  gameId?: string;
  sourceType: "SCHEDULE_API";
  sourceData: ScheduleAlertData;
  deepLink: string;
  dedupeKey: string;
  expiresAt?: string;
}

export interface UserSchedulePrefs {
  userId: string;
  categorySchedule: boolean;
}

// Lock reminder intervals (in minutes)
const LOCK_REMINDER_INTERVALS = [60, 15]; // 1 hour and 15 minutes

// =====================================================
// LOCK REMINDER LOGIC
// =====================================================

/**
 * Determine severity for a lock reminder
 */
function getLockReminderSeverity(minutesUntilLock: number): AlertSeverity {
  if (minutesUntilLock <= 5) return "CRITICAL";
  if (minutesUntilLock <= 15) return "IMPACT";
  if (minutesUntilLock <= 60) return "NOTICE";
  return "INFO";
}

/**
 * Generate headline for a lock reminder
 */
function generateLockReminderHeadline(reminder: LockReminder): string {
  const { poolName, minutesUntilLock } = reminder;
  
  if (minutesUntilLock <= 5) {
    return `⚠️ Picks lock in ${minutesUntilLock} min: ${poolName}`;
  }
  if (minutesUntilLock <= 15) {
    return `Picks lock in ${minutesUntilLock} min: ${poolName}`;
  }
  if (minutesUntilLock <= 60) {
    return `Picks lock in ${minutesUntilLock} min: ${poolName}`;
  }
  
  const hours = Math.round(minutesUntilLock / 60);
  return `Picks lock in ${hours} hour${hours > 1 ? "s" : ""}: ${poolName}`;
}

/**
 * Generate body for a lock reminder
 */
function generateLockReminderBody(reminder: LockReminder): string {
  const parts: string[] = [];
  
  if (reminder.hasUnsubmittedPicks) {
    parts.push("You have unsubmitted picks.");
  } else {
    parts.push("Your picks are submitted.");
  }
  
  parts.push(`${reminder.gameCount} game${reminder.gameCount !== 1 ? "s" : ""} in this period.`);
  
  const lockDate = new Date(reminder.lockTime);
  const timeStr = lockDate.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  parts.push(`Lock time: ${timeStr}.`);
  
  return parts.join(" ");
}

/**
 * Create a lock reminder alert
 */
export function createLockReminderAlert(
  reminder: LockReminder,
  dataScope: DataScope
): ScheduleAlert {
  const severity = getLockReminderSeverity(reminder.minutesUntilLock);
  const headline = generateLockReminderHeadline(reminder);
  const body = generateLockReminderBody(reminder);
  
  // Dedupe key: one per pool per reminder interval
  const intervalKey = reminder.minutesUntilLock <= 15 ? "15min" : "60min";
  const dateKey = new Date().toISOString().slice(0, 10);
  const dedupeKey = `SCHEDULE:LOCK:${reminder.poolId}:${intervalKey}:${dateKey}`;
  
  // Expiry: lock reminders expire at lock time
  const expiresAt = reminder.lockTime;
  
  const sourceData: ScheduleAlertData = {
    poolId: reminder.poolId,
    poolName: reminder.poolName,
    alertType: "LOCK_REMINDER",
    lockTime: reminder.lockTime,
    minutesUntilLock: reminder.minutesUntilLock,
  };
  
  return {
    userId: reminder.userId,
    dataScope,
    category: "SCHEDULE",
    severity,
    headline,
    body,
    sourceType: "SCHEDULE_API",
    sourceData,
    deepLink: `/pools/${reminder.poolId}/picks`,
    dedupeKey,
    expiresAt,
  };
}

// =====================================================
// SCHEDULE CHANGE LOGIC
// =====================================================

/**
 * Determine severity for a schedule change
 */
function getScheduleChangeSeverity(changeType: ScheduleAlertType): AlertSeverity {
  switch (changeType) {
    case "CANCELLATION":
      return "CRITICAL";
    case "POSTPONEMENT":
      return "IMPACT";
    case "TIME_CHANGE":
    case "VENUE_CHANGE":
      return "NOTICE";
    default:
      return "INFO";
  }
}

/**
 * Generate headline for a schedule change
 */
function generateScheduleChangeHeadline(change: ScheduleChange): string {
  const { homeTeam, awayTeam, changeType } = change;
  const matchup = `${awayTeam} @ ${homeTeam}`;
  
  switch (changeType) {
    case "CANCELLATION":
      return `Game Cancelled: ${matchup}`;
    case "POSTPONEMENT":
      return `Game Postponed: ${matchup}`;
    case "TIME_CHANGE":
      return `Time Changed: ${matchup}`;
    case "VENUE_CHANGE":
      return `Venue Changed: ${matchup}`;
    default:
      return `Schedule Update: ${matchup}`;
  }
}

/**
 * Generate body for a schedule change
 */
function generateScheduleChangeBody(change: ScheduleChange): string {
  const parts: string[] = [];
  const { homeTeam, awayTeam, changeType, originalTime, newTime, newVenue, reason } = change;
  
  switch (changeType) {
    case "CANCELLATION":
      parts.push(`${awayTeam} at ${homeTeam} has been cancelled.`);
      break;
    case "POSTPONEMENT":
      parts.push(`${awayTeam} at ${homeTeam} has been postponed.`);
      if (newTime) {
        const newDate = new Date(newTime);
        parts.push(`New date: ${newDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}.`);
      }
      break;
    case "TIME_CHANGE":
      if (originalTime && newTime) {
        const oldDate = new Date(originalTime);
        const newDate = new Date(newTime);
        const oldStr = oldDate.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
        const newStr = newDate.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
        parts.push(`Game time changed from ${oldStr} to ${newStr}.`);
      }
      break;
    case "VENUE_CHANGE":
      if (newVenue) {
        parts.push(`Game moved to ${newVenue}.`);
      }
      break;
  }
  
  if (reason) {
    parts.push(`Reason: ${reason}.`);
  }
  
  return parts.join(" ");
}

/**
 * Create a schedule change alert
 */
export function createScheduleChangeAlert(
  userId: string,
  dataScope: DataScope,
  change: ScheduleChange
): ScheduleAlert {
  const severity = getScheduleChangeSeverity(change.changeType);
  const headline = generateScheduleChangeHeadline(change);
  const body = generateScheduleChangeBody(change);
  
  // Dedupe key: one per game per change type per day
  const dateKey = new Date().toISOString().slice(0, 10);
  const dedupeKey = `SCHEDULE:${change.changeType}:${change.gameId}:${dateKey}`;
  
  // Expiry: schedule changes are relevant until the new game time
  const expiresAt = change.newTime || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const sourceData: ScheduleAlertData = {
    gameId: change.gameId,
    alertType: change.changeType,
    originalTime: change.originalTime,
    newTime: change.newTime,
    reason: change.reason,
  };
  
  return {
    userId,
    dataScope,
    category: "SCHEDULE",
    severity,
    headline,
    body,
    gameId: change.gameId,
    sourceType: "SCHEDULE_API",
    sourceData,
    deepLink: change.changeType === "CANCELLATION" ? "/intel" : `/game/${change.gameId}`,
    dedupeKey,
    expiresAt,
  };
}

// =====================================================
// DATABASE OPERATIONS
// =====================================================

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
 * Insert a schedule alert into the database
 */
export async function insertScheduleAlert(
  db: D1Database,
  alert: ScheduleAlert
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
    alert.gameId || null,
    alert.sourceType,
    JSON.stringify(alert.sourceData),
    alert.deepLink,
    alert.dedupeKey,
    alert.expiresAt || null
  ).run();
  
  return result.meta?.last_row_id || null;
}

/**
 * Get users who should receive lock reminders for a pool
 */
export async function getUsersNeedingLockReminders(
  db: D1Database,
  poolId: number,
  dataScope: DataScope
): Promise<{ userId: string; hasUnsubmittedPicks: boolean }[]> {
  // Get pool members with schedule alerts enabled
  const query = `
    SELECT DISTINCT 
      lm.user_id,
      CASE WHEN p.id IS NULL THEN 1 ELSE 0 END as has_unsubmitted
    FROM league_members lm
    JOIN scout_alert_preferences sap ON sap.user_id = CAST(lm.user_id AS TEXT)
    LEFT JOIN picks p ON p.user_id = lm.user_id 
      AND p.league_id = lm.league_id 
      AND p.data_scope = ?
      AND p.is_locked = 0
    WHERE lm.league_id = ?
    AND lm.data_scope = ?
    AND sap.category_schedule = 1
    GROUP BY lm.user_id
  `;
  
  const result = await db.prepare(query).bind(dataScope, poolId, dataScope).all();
  
  return ((result.results || []) as Record<string, unknown>[]).map(row => ({
    userId: String(row.user_id),
    hasUnsubmittedPicks: Boolean(row.has_unsubmitted),
  }));
}

/**
 * Get users who should receive schedule change alerts for a game
 */
export async function getUsersForScheduleChangeAlerts(
  db: D1Database,
  gameId: string,
  dataScope: DataScope
): Promise<UserSchedulePrefs[]> {
  const query = `
    SELECT DISTINCT 
      sap.user_id,
      sap.category_schedule
    FROM scout_alert_preferences sap
    WHERE sap.category_schedule = 1
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
    categorySchedule: Boolean(row.category_schedule),
  }));
}

// =====================================================
// MAIN TRIGGER FUNCTIONS
// =====================================================

export interface LockReminderTriggerResult {
  processed: boolean;
  alertsCreated: number;
  userIds: string[];
  severity: AlertSeverity;
  minutesUntilLock: number;
}

/**
 * Trigger lock reminder alerts for a pool
 */
export async function triggerLockReminderAlerts(
  db: D1Database,
  poolId: number,
  poolName: string,
  lockTime: string,
  gameCount: number,
  dataScope: DataScope
): Promise<LockReminderTriggerResult> {
  const now = new Date();
  const lockDate = new Date(lockTime);
  const minutesUntilLock = Math.round((lockDate.getTime() - now.getTime()) / 60000);
  
  const result: LockReminderTriggerResult = {
    processed: false,
    alertsCreated: 0,
    userIds: [],
    severity: getLockReminderSeverity(minutesUntilLock),
    minutesUntilLock,
  };
  
  // Check if this falls within a reminder interval
  const isReminderTime = LOCK_REMINDER_INTERVALS.some(
    interval => minutesUntilLock <= interval && minutesUntilLock > interval - 5
  );
  
  if (!isReminderTime && minutesUntilLock > 5) {
    return result;
  }
  
  result.processed = true;
  
  // Get users who need reminders
  const users = await getUsersNeedingLockReminders(db, poolId, dataScope);
  
  for (const user of users) {
    const reminder: LockReminder = {
      poolId,
      poolName,
      lockTime,
      minutesUntilLock,
      gameCount,
      userId: user.userId,
      hasUnsubmittedPicks: user.hasUnsubmittedPicks,
    };
    
    const alert = createLockReminderAlert(reminder, dataScope);
    const alertId = await insertScheduleAlert(db, alert);
    
    if (alertId !== null) {
      result.alertsCreated++;
      result.userIds.push(user.userId);
    }
  }
  
  return result;
}

export interface ScheduleChangeTriggerResult {
  processed: boolean;
  alertsCreated: number;
  userIds: string[];
  severity: AlertSeverity;
  changeType: ScheduleAlertType;
}

/**
 * Trigger schedule change alerts for a game
 */
export async function triggerScheduleChangeAlerts(
  db: D1Database,
  change: ScheduleChange,
  dataScope: DataScope
): Promise<ScheduleChangeTriggerResult> {
  const severity = getScheduleChangeSeverity(change.changeType);
  
  const result: ScheduleChangeTriggerResult = {
    processed: true,
    alertsCreated: 0,
    userIds: [],
    severity,
    changeType: change.changeType,
  };
  
  // Get users who should receive this alert
  const users = await getUsersForScheduleChangeAlerts(db, change.gameId, dataScope);
  
  for (const user of users) {
    const alert = createScheduleChangeAlert(user.userId, dataScope, change);
    const alertId = await insertScheduleAlert(db, alert);
    
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
 * Generate a demo lock reminder
 */
export function generateDemoLockReminder(
  poolId: number = 1,
  poolName: string = "NFL Week 12",
  options: {
    minutesUntilLock?: number;
    gameCount?: number;
    userId?: string;
    hasUnsubmittedPicks?: boolean;
  } = {}
): LockReminder {
  const minutesUntilLock = options.minutesUntilLock ?? 15;
  const lockTime = new Date(Date.now() + minutesUntilLock * 60000).toISOString();
  
  return {
    poolId,
    poolName,
    lockTime,
    minutesUntilLock,
    gameCount: options.gameCount ?? 14,
    userId: options.userId ?? "demo-user",
    hasUnsubmittedPicks: options.hasUnsubmittedPicks ?? true,
  };
}

/**
 * Generate a demo schedule change
 */
export function generateDemoScheduleChange(
  gameId: string,
  sport: string,
  homeTeam: string,
  awayTeam: string,
  options: {
    changeType?: ScheduleAlertType;
    hoursDelayed?: number;
  } = {}
): ScheduleChange {
  const changeType = options.changeType || "TIME_CHANGE";
  const hoursDelayed = options.hoursDelayed ?? 2;
  
  const originalTime = new Date();
  originalTime.setHours(originalTime.getHours() + 3);
  
  const newTime = new Date(originalTime);
  newTime.setHours(newTime.getHours() + hoursDelayed);
  
  return {
    gameId,
    sport,
    homeTeam,
    awayTeam,
    changeType,
    originalTime: changeType !== "CANCELLATION" ? originalTime.toISOString() : undefined,
    newTime: changeType === "TIME_CHANGE" || changeType === "POSTPONEMENT" ? newTime.toISOString() : undefined,
    reason: changeType === "POSTPONEMENT" ? "Weather" : changeType === "CANCELLATION" ? "Field conditions" : undefined,
    detectedAt: new Date().toISOString(),
  };
}

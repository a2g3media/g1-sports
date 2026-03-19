/**
 * Smart Notification Defaults Service
 * 
 * Applies intelligent notification defaults based on:
 * - User's subscription tier
 * - Favorite sports
 * - Followed teams
 * - Pool participation
 * - Locale/timezone
 * 
 * DEFAULTS BY TIER:
 * 
 * FREE:
 * - Final scores: followed teams only
 * - Game starts: followed teams only
 * - Major moments: followed teams only (capped, not every play)
 * - Proactive alerts: OFF
 * - Line movement: OFF
 * - Injuries: OFF (except confirmed major, but default off)
 * 
 * POOL ACCESS:
 * - Same as Free + pool reminders
 * - Pick lock reminders: ON
 * - Schedule change notifications: ON (for pool games)
 * 
 * PRO:
 * - Every score: ON for followed teams, watched games, pool games
 * - Period summaries: ON for watched games
 * - Proactive alerts: ON (high signal only - line movement, injuries, weather)
 * - Line movement threshold: 1.5+ points
 * - Injuries: confirmed impact only
 * 
 * ELITE:
 * - Same as Pro
 * - Custom alert rules: available (default OFF until user creates them)
 * - Command Center alerts: ON for watched games
 */

import type { GZSportsTier } from "./subscriptionService";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

export type DataScope = "DEMO" | "PROD";

// ============================================================================
// TYPES
// ============================================================================

export type NotificationMode = "smart_bundled" | "every_event" | "finals_only";

export interface NotificationDefaults {
  // Global settings
  mode: NotificationMode;
  masterEnabled: boolean;
  
  // Quiet hours
  quietHoursEnabled: boolean;
  quietHoursStart: string; // "22:00"
  quietHoursEnd: string;   // "08:00"
  
  // Score alerts
  finalScores: boolean;
  gameStarts: boolean;
  everyScore: boolean;
  majorMoments: boolean;
  periodSummaries: boolean;
  
  // Proactive alerts
  lineMovement: boolean;
  lineMovementThreshold: number; // points
  injuries: boolean;
  weather: boolean;
  
  // Pool alerts
  pickLockReminders: boolean;
  scheduleChanges: boolean;
  poolActivity: boolean;
  weeklyRankRecap: boolean;
  
  // Elite features
  customAlertRules: boolean;
  commandCenterAlerts: boolean;
  
  // Scope modifiers
  followedTeamsOnly: boolean;
  watchedGamesIncluded: boolean;
  poolGamesIncluded: boolean;
  
  // Per-sport overrides (empty = use defaults)
  sportOverrides: Record<string, Partial<SportNotificationSettings>>;
  
  // Per-team overrides (empty = use defaults)
  teamOverrides: Record<string, Partial<TeamNotificationSettings>>;
}

export interface SportNotificationSettings {
  enabled: boolean;
  finalScores: boolean;
  everyScore: boolean;
  majorMoments: boolean;
}

export interface TeamNotificationSettings {
  enabled: boolean;
  finalScores: boolean;
  everyScore: boolean;
  allGames: boolean; // true = all games, false = followed/watched only
}

// ============================================================================
// TIER-BASED DEFAULT TEMPLATES
// ============================================================================

const FREE_DEFAULTS: NotificationDefaults = {
  mode: "smart_bundled",
  masterEnabled: true,
  
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  
  finalScores: true,
  gameStarts: true,
  everyScore: false,
  majorMoments: true,
  periodSummaries: false,
  
  lineMovement: false,
  lineMovementThreshold: 2,
  injuries: false,
  weather: false,
  
  pickLockReminders: false,
  scheduleChanges: false,
  poolActivity: false,
  weeklyRankRecap: false,
  
  customAlertRules: false,
  commandCenterAlerts: false,
  
  followedTeamsOnly: true,
  watchedGamesIncluded: false,
  poolGamesIncluded: false,
  
  sportOverrides: {},
  teamOverrides: {},
};

const POOL_ACCESS_DEFAULTS: NotificationDefaults = {
  ...FREE_DEFAULTS,
  
  // Pool-specific additions
  pickLockReminders: true,
  scheduleChanges: true,
  poolActivity: true,
  weeklyRankRecap: true,
  poolGamesIncluded: true,
};

const PRO_DEFAULTS: NotificationDefaults = {
  mode: "smart_bundled",
  masterEnabled: true,
  
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  
  finalScores: true,
  gameStarts: true,
  everyScore: true,
  majorMoments: true,
  periodSummaries: true,
  
  lineMovement: true,
  lineMovementThreshold: 1.5,
  injuries: true,
  weather: true,
  
  pickLockReminders: true,
  scheduleChanges: true,
  poolActivity: true,
  weeklyRankRecap: true,
  
  customAlertRules: false,
  commandCenterAlerts: false,
  
  followedTeamsOnly: false,
  watchedGamesIncluded: true,
  poolGamesIncluded: true,
  
  sportOverrides: {},
  teamOverrides: {},
};

const ELITE_DEFAULTS: NotificationDefaults = {
  ...PRO_DEFAULTS,
  
  // Elite additions
  customAlertRules: false, // available but OFF until user creates them
  commandCenterAlerts: true,
};

const ADMIN_DEFAULTS: NotificationDefaults = {
  ...POOL_ACCESS_DEFAULTS,
  
  // Admin-specific
  poolActivity: true,
  weeklyRankRecap: true,
};

// ============================================================================
// DEFAULT LOOKUP
// ============================================================================

/**
 * Get default notification settings for a tier
 */
export function getDefaultsForTier(tier: GZSportsTier): NotificationDefaults {
  switch (tier) {
    case "anonymous":
      return { ...FREE_DEFAULTS, masterEnabled: false };
    case "free":
      return FREE_DEFAULTS;
    case "pool_access":
      return POOL_ACCESS_DEFAULTS;
    case "scout_pro":
      return PRO_DEFAULTS;
    case "scout_elite":
      return ELITE_DEFAULTS;
    case "admin_starter":
    case "admin_unlimited":
      return ADMIN_DEFAULTS;
    default:
      return FREE_DEFAULTS;
  }
}

/**
 * Determine which features are available (not just default) for a tier
 */
export function getAvailableFeaturesForTier(tier: GZSportsTier): {
  canEnableEveryScore: boolean;
  canEnableProactiveAlerts: boolean;
  canEnableLineMovement: boolean;
  canEnableInjuries: boolean;
  canEnableWeather: boolean;
  canEnablePeriodSummaries: boolean;
  canEnableCustomAlerts: boolean;
  canEnableCommandCenter: boolean;
  canWatchGames: boolean;
} {
  const isPro = tier === "scout_pro";
  const isElite = tier === "scout_elite";
  const isProOrHigher = isPro || isElite;
  
  return {
    canEnableEveryScore: isProOrHigher,
    canEnableProactiveAlerts: isProOrHigher,
    canEnableLineMovement: isProOrHigher,
    canEnableInjuries: isProOrHigher,
    canEnableWeather: isProOrHigher,
    canEnablePeriodSummaries: isProOrHigher,
    canEnableCustomAlerts: isElite,
    canEnableCommandCenter: isElite,
    canWatchGames: isProOrHigher,
  };
}

// ============================================================================
// USER SETTINGS MANAGEMENT
// ============================================================================

/**
 * Get user's current notification settings, falling back to tier defaults
 */
export async function getUserNotificationSettings(
  db: D1Database,
  userId: string,
  tier: GZSportsTier,
  dataScope: DataScope
): Promise<NotificationDefaults> {
  // Get stored settings
  const result = await db.prepare(`
    SELECT setting_value
    FROM user_settings
    WHERE user_id = ? AND setting_key = 'notification_preferences' AND data_scope = ?
  `).bind(userId, dataScope).first() as { setting_value: string } | null;
  
  const tierDefaults = getDefaultsForTier(tier);
  
  if (!result) {
    return tierDefaults;
  }
  
  try {
    const stored = JSON.parse(result.setting_value);
    // Merge stored settings with tier defaults (stored takes precedence)
    return {
      ...tierDefaults,
      ...stored,
      // Keep tier-specific restrictions
      customAlertRules: tier === "scout_elite" ? (stored.customAlertRules ?? false) : false,
      commandCenterAlerts: tier === "scout_elite" ? (stored.commandCenterAlerts ?? true) : false,
    };
  } catch {
    return tierDefaults;
  }
}

/**
 * Save user notification settings
 */
export async function saveUserNotificationSettings(
  db: D1Database,
  userId: string,
  settings: Partial<NotificationDefaults>,
  dataScope: DataScope
): Promise<{ success: boolean; error?: string }> {
  try {
    const settingsJson = JSON.stringify(settings);
    
    await db.prepare(`
      INSERT INTO user_settings (user_id, setting_key, setting_value, data_scope, created_at, updated_at)
      VALUES (?, 'notification_preferences', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, setting_key, data_scope) 
      DO UPDATE SET setting_value = ?, updated_at = CURRENT_TIMESTAMP
    `).bind(userId, settingsJson, dataScope, settingsJson).run();
    
    return { success: true };
  } catch (error) {
    console.error("Error saving notification settings:", error);
    return { success: false, error: "Failed to save settings" };
  }
}

/**
 * Apply tier defaults to a user (called after onboarding or tier change)
 */
export async function applyTierDefaults(
  db: D1Database,
  userId: string,
  tier: GZSportsTier,
  dataScope: DataScope
): Promise<void> {
  const defaults = getDefaultsForTier(tier);
  
  // Get user's favorite sports to apply sport-specific defaults
  const favoritesResult = await db.prepare(`
    SELECT setting_value
    FROM user_settings
    WHERE user_id = ? AND setting_key = 'favorite_sports' AND data_scope = ?
  `).bind(userId, dataScope).first() as { setting_value: string } | null;
  
  let favoriteSports: string[] = [];
  if (favoritesResult) {
    try {
      favoriteSports = JSON.parse(favoritesResult.setting_value);
    } catch {
      // ignore parse errors
    }
  }
  
  // Enable alerts only for favorite sports by default
  if (favoriteSports.length > 0) {
    const sportOverrides: Record<string, Partial<SportNotificationSettings>> = {};
    
    // All sports start disabled, favorites are enabled
    const allSports = ["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab", "soccer", "tennis", "golf", "mma", "boxing", "f1"];
    for (const sport of allSports) {
      if (favoriteSports.includes(sport)) {
        sportOverrides[sport] = { enabled: true };
      } else {
        sportOverrides[sport] = { enabled: false };
      }
    }
    
    defaults.sportOverrides = sportOverrides;
  }
  
  await saveUserNotificationSettings(db, userId, defaults, dataScope);
}

/**
 * Get followed teams for a user
 */
export async function getUserFollowedTeams(
  db: D1Database,
  userId: string,
  dataScope: DataScope
): Promise<string[]> {
  const result = await db.prepare(`
    SELECT setting_value
    FROM user_settings
    WHERE user_id = ? AND setting_key = 'followed_teams' AND data_scope = ?
  `).bind(userId, dataScope).first() as { setting_value: string } | null;
  
  if (!result) return [];
  
  try {
    return JSON.parse(result.setting_value);
  } catch {
    return [];
  }
}

/**
 * Check if a notification should be sent based on user settings
 */
export async function shouldSendNotification(
  db: D1Database,
  userId: string,
  tier: GZSportsTier,
  dataScope: DataScope,
  context: {
    category: string;
    sport?: string;
    teamKey?: string;
    gameId?: string;
    isFollowedTeam?: boolean;
    isWatchedGame?: boolean;
    isPoolGame?: boolean;
  }
): Promise<{ allowed: boolean; reason?: string }> {
  const settings = await getUserNotificationSettings(db, userId, tier, dataScope);
  
  // Master toggle
  if (!settings.masterEnabled) {
    return { allowed: false, reason: "Notifications disabled" };
  }
  
  // Check quiet hours
  if (settings.quietHoursEnabled) {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    
    if (isInQuietHours(currentTime, settings.quietHoursStart, settings.quietHoursEnd)) {
      // Allow critical alerts even in quiet hours
      if (context.category !== "final_score" && context.category !== "game_winner") {
        return { allowed: false, reason: "Quiet hours" };
      }
    }
  }
  
  // Check sport override
  if (context.sport && settings.sportOverrides[context.sport]) {
    const sportSettings = settings.sportOverrides[context.sport];
    if (sportSettings.enabled === false) {
      return { allowed: false, reason: "Sport disabled" };
    }
  }
  
  // Check team override
  if (context.teamKey && settings.teamOverrides[context.teamKey]) {
    const teamSettings = settings.teamOverrides[context.teamKey];
    if (teamSettings.enabled === false) {
      return { allowed: false, reason: "Team disabled" };
    }
  }
  
  // Check scope restrictions for free/pool_access tiers
  if (settings.followedTeamsOnly && !context.isFollowedTeam) {
    if (!settings.watchedGamesIncluded || !context.isWatchedGame) {
      if (!settings.poolGamesIncluded || !context.isPoolGame) {
        return { allowed: false, reason: "Not a followed team/watched/pool game" };
      }
    }
  }
  
  // Check category-specific settings
  switch (context.category) {
    case "final_score":
      return settings.finalScores 
        ? { allowed: true } 
        : { allowed: false, reason: "Final scores disabled" };
    
    case "game_start":
      return settings.gameStarts 
        ? { allowed: true } 
        : { allowed: false, reason: "Game starts disabled" };
    
    case "scoring_event":
      return settings.everyScore 
        ? { allowed: true } 
        : { allowed: false, reason: "Every score disabled" };
    
    case "major_moment":
    case "touchdown":
    case "home_run":
    case "goal":
      return settings.majorMoments 
        ? { allowed: true } 
        : { allowed: false, reason: "Major moments disabled" };
    
    case "period_break":
    case "quarter_summary":
    case "half_summary":
      return settings.periodSummaries 
        ? { allowed: true } 
        : { allowed: false, reason: "Period summaries disabled" };
    
    case "line_movement":
      return settings.lineMovement 
        ? { allowed: true } 
        : { allowed: false, reason: "Line movement disabled" };
    
    case "injury":
      return settings.injuries 
        ? { allowed: true } 
        : { allowed: false, reason: "Injuries disabled" };
    
    case "weather":
      return settings.weather 
        ? { allowed: true } 
        : { allowed: false, reason: "Weather disabled" };
    
    case "pick_lock_reminder":
      return settings.pickLockReminders 
        ? { allowed: true } 
        : { allowed: false, reason: "Pick reminders disabled" };
    
    case "schedule_change":
      return settings.scheduleChanges 
        ? { allowed: true } 
        : { allowed: false, reason: "Schedule changes disabled" };

    case "weekly_results":
    case "weekly_standings_recap":
      return settings.weeklyRankRecap
        ? { allowed: true }
        : { allowed: false, reason: "Weekly rank recap disabled" };
    
    case "custom_trigger":
      return settings.customAlertRules 
        ? { allowed: true } 
        : { allowed: false, reason: "Custom alerts disabled" };
    
    case "command_center":
      return settings.commandCenterAlerts 
        ? { allowed: true } 
        : { allowed: false, reason: "Command center alerts disabled" };
    
    default:
      // Allow unknown categories by default
      return { allowed: true };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if current time is within quiet hours
 */
function isInQuietHours(currentTime: string, start: string, end: string): boolean {
  // Handle overnight quiet hours (e.g., 22:00 to 08:00)
  if (start > end) {
    return currentTime >= start || currentTime < end;
  }
  return currentTime >= start && currentTime < end;
}

/**
 * Get a summary of notification settings for display
 */
export function getSettingsSummary(settings: NotificationDefaults): {
  mode: string;
  enabledCategories: string[];
  disabledCategories: string[];
  quietHours: string | null;
} {
  const modeLabels: Record<NotificationMode, string> = {
    smart_bundled: "Smart Bundled",
    every_event: "Every Event",
    finals_only: "Finals Only",
  };
  
  const enabled: string[] = [];
  const disabled: string[] = [];
  
  if (settings.finalScores) enabled.push("Final Scores");
  else disabled.push("Final Scores");
  
  if (settings.gameStarts) enabled.push("Game Starts");
  else disabled.push("Game Starts");
  
  if (settings.everyScore) enabled.push("Every Score");
  else disabled.push("Every Score");
  
  if (settings.majorMoments) enabled.push("Major Moments");
  else disabled.push("Major Moments");
  
  if (settings.lineMovement) enabled.push("Line Movement");
  else disabled.push("Line Movement");
  
  if (settings.injuries) enabled.push("Injuries");
  else disabled.push("Injuries");
  
  return {
    mode: modeLabels[settings.mode],
    enabledCategories: enabled,
    disabledCategories: disabled,
    quietHours: settings.quietHoursEnabled 
      ? `${settings.quietHoursStart} - ${settings.quietHoursEnd}` 
      : null,
  };
}

export default {
  getDefaultsForTier,
  getAvailableFeaturesForTier,
  getUserNotificationSettings,
  saveUserNotificationSettings,
  applyTierDefaults,
  shouldSendNotification,
  getSettingsSummary,
};

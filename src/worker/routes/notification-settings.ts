/**
 * Notification Settings API Routes
 * 
 * Handles smart notification defaults and user preferences.
 */

import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import { getUserSubscription, type GZSportsTier } from "../services/subscriptionService";
import {
  getDefaultsForTier,
  getAvailableFeaturesForTier,
  getUserNotificationSettings,
  saveUserNotificationSettings,

  getSettingsSummary,
  type NotificationDefaults,
} from "../services/notificationDefaultsService";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

type Env = {
  DB: D1Database;
};

type Variables = {
  userId: string;
  dataScope: "DEMO" | "PROD";
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply auth middleware
app.use("*", authMiddleware);

/**
 * GET /api/notifications/settings
 * Get user's current notification settings with tier context
 */
app.get("/settings", async (c) => {
  const userId = c.get("userId");
  const dataScope = c.get("dataScope");
  const db = c.env.DB;
  
  try {
    const subscription = await getUserSubscription(db, userId);
    const settings = await getUserNotificationSettings(db, userId, subscription.tier, dataScope);
    const availableFeatures = getAvailableFeaturesForTier(subscription.tier);
    const summary = getSettingsSummary(settings);
    
    return c.json({
      settings,
      tier: subscription.tier,
      availableFeatures,
      summary,
    });
  } catch (error) {
    console.error("Error fetching notification settings:", error);
    return c.json({ error: "Failed to fetch settings" }, 500);
  }
});

/**
 * PATCH /api/notifications/settings
 * Update user's notification settings
 */
app.patch("/settings", async (c) => {
  const userId = c.get("userId");
  const dataScope = c.get("dataScope");
  const db = c.env.DB;
  
  try {
    const body = await c.req.json() as Partial<NotificationDefaults>;
    const subscription = await getUserSubscription(db, userId);
    const availableFeatures = getAvailableFeaturesForTier(subscription.tier);
    
    // Enforce tier restrictions
    const sanitizedSettings: Partial<NotificationDefaults> = { ...body };
    
    // Block features not available at tier
    if (!availableFeatures.canEnableEveryScore && body.everyScore) {
      sanitizedSettings.everyScore = false;
    }
    if (!availableFeatures.canEnableProactiveAlerts) {
      sanitizedSettings.lineMovement = false;
      sanitizedSettings.injuries = false;
      sanitizedSettings.weather = false;
    }
    if (!availableFeatures.canEnablePeriodSummaries && body.periodSummaries) {
      sanitizedSettings.periodSummaries = false;
    }
    if (!availableFeatures.canEnableCustomAlerts) {
      sanitizedSettings.customAlertRules = false;
    }
    if (!availableFeatures.canEnableCommandCenter) {
      sanitizedSettings.commandCenterAlerts = false;
    }
    
    const result = await saveUserNotificationSettings(db, userId, sanitizedSettings, dataScope);
    
    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }
    
    // Return updated settings
    const updatedSettings = await getUserNotificationSettings(db, userId, subscription.tier, dataScope);
    
    return c.json({
      success: true,
      settings: updatedSettings,
    });
  } catch (error) {
    console.error("Error updating notification settings:", error);
    return c.json({ error: "Failed to update settings" }, 500);
  }
});

/**
 * POST /api/notifications/apply-defaults
 * Apply tier defaults (usually called after onboarding)
 * 
 * Body params:
 * - favoriteSports: string[] - user's selected favorite sports
 * - followedTeams: string[] - user's selected followed teams
 * - forceApply: boolean - if true, overwrite existing settings; if false, skip if settings exist
 */
app.post("/apply-defaults", async (c) => {
  const userId = c.get("userId");
  const dataScope = c.get("dataScope");
  const db = c.env.DB;
  
  try {
    const body = await c.req.json() as {
      favoriteSports?: string[];
      followedTeams?: string[];
      forceApply?: boolean;
    };
    
    const { favoriteSports = [], followedTeams = [], forceApply = false } = body;
    
    // Check if user already has notification settings (idempotent check)
    if (!forceApply) {
      const existing = await db.prepare(`
        SELECT 1 FROM user_settings
        WHERE user_id = ? AND setting_key = 'notification_preferences' AND data_scope = ?
      `).bind(userId, dataScope).first();
      
      if (existing) {
        // Settings already exist, don't overwrite
        const subscription = await getUserSubscription(db, userId);
        const settings = await getUserNotificationSettings(db, userId, subscription.tier, dataScope);
        return c.json({
          success: true,
          settings,
          tier: subscription.tier,
          skipped: true,
          reason: "Settings already exist. Use forceApply=true to reset.",
        });
      }
    }
    
    const subscription = await getUserSubscription(db, userId);
    const defaults = getDefaultsForTier(subscription.tier);
    
    // Build sport overrides based on favorites
    const allSports = ["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab", "soccer", "tennis", "golf", "mma", "boxing", "f1"];
    const sportOverrides: Record<string, { enabled: boolean }> = {};
    
    for (const sport of allSports) {
      sportOverrides[sport] = {
        enabled: favoriteSports.includes(sport),
      };
    }
    
    // Build team overrides based on followed teams
    const teamOverrides: Record<string, { enabled: boolean; allGames: boolean }> = {};
    
    for (const teamId of followedTeams) {
      teamOverrides[teamId] = {
        enabled: true,
        allGames: true, // Get alerts for ALL games of followed teams
      };
    }
    
    // Merge with tier defaults
    const finalSettings = {
      ...defaults,
      sportOverrides,
      teamOverrides,
    };
    
    // Save the settings
    await saveUserNotificationSettings(db, userId, finalSettings, dataScope);
    
    const settings = await getUserNotificationSettings(db, userId, subscription.tier, dataScope);
    
    return c.json({
      success: true,
      settings,
      tier: subscription.tier,
      applied: true,
    });
  } catch (error) {
    console.error("Error applying defaults:", error);
    return c.json({ error: "Failed to apply defaults" }, 500);
  }
});

/**
 * GET /api/notifications/defaults
 * Get default settings for any tier (for preview/comparison)
 */
app.get("/defaults", async (c) => {
  const tier = c.req.query("tier") as GZSportsTier | undefined;
  
  if (!tier) {
    return c.json({ error: "Tier parameter required" }, 400);
  }
  
  const defaults = getDefaultsForTier(tier);
  const availableFeatures = getAvailableFeaturesForTier(tier);
  
  return c.json({
    tier,
    defaults,
    availableFeatures,
  });
});

/**
 * GET /api/notifications/quiet-hours/check
 * Check if current time is in quiet hours
 */
app.get("/quiet-hours/check", async (c) => {
  const userId = c.get("userId");
  const dataScope = c.get("dataScope");
  const db = c.env.DB;
  
  try {
    const subscription = await getUserSubscription(db, userId);
    const settings = await getUserNotificationSettings(db, userId, subscription.tier, dataScope);
    
    if (!settings.quietHoursEnabled) {
      return c.json({ inQuietHours: false, enabled: false });
    }
    
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    
    const start = settings.quietHoursStart;
    const end = settings.quietHoursEnd;
    
    let inQuietHours = false;
    if (start > end) {
      // Overnight (e.g., 22:00 to 08:00)
      inQuietHours = currentTime >= start || currentTime < end;
    } else {
      inQuietHours = currentTime >= start && currentTime < end;
    }
    
    return c.json({
      inQuietHours,
      enabled: true,
      start,
      end,
      currentTime,
    });
  } catch (error) {
    console.error("Error checking quiet hours:", error);
    return c.json({ error: "Failed to check quiet hours" }, 500);
  }
});

/**
 * GET /api/notifications/tier-comparison
 * Get comparison of features across tiers for upgrade prompts
 */
app.get("/tier-comparison", async (c) => {
  const tiers: GZSportsTier[] = ["free", "pool_access", "scout_pro", "scout_elite"];
  
  const comparison = tiers.map(tier => ({
    tier,
    defaults: getDefaultsForTier(tier),
    features: getAvailableFeaturesForTier(tier),
  }));
  
  return c.json({ comparison });
});

export const notificationSettingsRouter = app;

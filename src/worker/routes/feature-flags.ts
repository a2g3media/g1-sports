/**
 * Feature Flags API Routes
 * Super Admin only for write operations
 * Public read for specific flags needed by frontend
 */
import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import { FeatureFlagService } from "../services/featureFlagService";
import { superAdminMiddleware, logAuditEvent, getPlatformUser } from "../middleware/rbac";

type Env = {
  DB: D1Database;
  MOCHA_USERS_SERVICE_API_URL: string;
  MOCHA_USERS_SERVICE_API_KEY: string;
};

const featureFlagsRouter = new Hono<{ Bindings: Env }>();

// ============ Public Routes (no auth) ============

// Get public-facing flags (for frontend feature gating)
featureFlagsRouter.get("/public", async (c) => {
  const service = new FeatureFlagService(c.env.DB);
  
  // Only return specific flags that the frontend needs
  const publicPoolsFlag = await service.getFlag("PUBLIC_POOLS");
  const marketplaceEnabledFlag = await service.getFlag("MARKETPLACE_ENABLED");
  const gameFavoritesFlag = await service.getFlag("GAME_FAVORITES_ENABLED");
  const homeFavoritesRailFlag = await service.getFlag("HOME_FAVORITES_RAIL_ENABLED");
  const premiumScoutFlowFlag = await service.getFlag("PREMIUM_SCOUT_FLOW_ENABLED");
  const pageDataGamesEnabledFlag = await service.getFlag("PAGE_DATA_GAMES_ENABLED");
  const pageDataObservabilityFlag = await service.getFlag("PAGE_DATA_OBSERVABILITY_ENABLED");
  const pageDataSportHubEnabledFlag = await service.getFlag("PAGE_DATA_SPORT_HUB_ENABLED");
  const pageDataGameDetailEnabledFlag = await service.getFlag("PAGE_DATA_GAME_DETAIL_ENABLED");
  const pageDataOddsEnabledFlag = await service.getFlag("PAGE_DATA_ODDS_ENABLED");
  const pageDataOddsGameEnabledFlag = await service.getFlag("PAGE_DATA_ODDS_GAME_ENABLED");
  
  return c.json({
    PUBLIC_POOLS: publicPoolsFlag?.is_enabled ?? false,
    MARKETPLACE_ENABLED: marketplaceEnabledFlag?.is_enabled ?? false,
    GAME_FAVORITES_ENABLED: gameFavoritesFlag?.is_enabled ?? true,
    HOME_FAVORITES_RAIL_ENABLED: homeFavoritesRailFlag?.is_enabled ?? true,
    PREMIUM_SCOUT_FLOW_ENABLED: premiumScoutFlowFlag?.is_enabled ?? true,
    PAGE_DATA_GAMES_ENABLED: pageDataGamesEnabledFlag?.is_enabled ?? false,
    PAGE_DATA_OBSERVABILITY_ENABLED: pageDataObservabilityFlag?.is_enabled ?? true,
    PAGE_DATA_SPORT_HUB_ENABLED: pageDataSportHubEnabledFlag?.is_enabled ?? false,
    PAGE_DATA_GAME_DETAIL_ENABLED: pageDataGameDetailEnabledFlag?.is_enabled ?? false,
    PAGE_DATA_ODDS_ENABLED: pageDataOddsEnabledFlag?.is_enabled ?? false,
    PAGE_DATA_ODDS_GAME_ENABLED: pageDataOddsGameEnabledFlag?.is_enabled ?? false,
  });
});

// ============ Admin Routes (Super Admin only) ============

// Get all flags
featureFlagsRouter.get("/", authMiddleware, superAdminMiddleware, async (c) => {
  const service = new FeatureFlagService(c.env.DB);
  
  // Ensure defaults are seeded
  await service.seedDefaults();
  
  const flags = await service.getAllFlags();
  return c.json({ flags });
});

// Get single flag
featureFlagsRouter.get("/:flagKey", authMiddleware, superAdminMiddleware, async (c) => {
  const flagKey = c.req.param("flagKey");
  const service = new FeatureFlagService(c.env.DB);
  
  const flag = await service.getFlag(flagKey);
  
  if (!flag) {
    return c.json({ error: "Flag not found" }, 404);
  }
  
  return c.json({ flag });
});

// Update flag
featureFlagsRouter.patch("/:flagKey", authMiddleware, superAdminMiddleware, async (c) => {
  const flagKey = c.req.param("flagKey");
  const { is_enabled, description } = await c.req.json();
  const service = new FeatureFlagService(c.env.DB);
  const platformUser = getPlatformUser(c);
  
  const existingFlag = await service.getFlag(flagKey);
  
  if (!existingFlag) {
    return c.json({ error: "Flag not found" }, 404);
  }
  
  const oldValue = existingFlag.is_enabled;
  
  // Update the flag
  if (typeof is_enabled === "boolean") {
    await service.setFlag(flagKey, is_enabled);
  }
  
  if (typeof description === "string") {
    await service.upsertFlag(flagKey, existingFlag.is_enabled, description);
  }
  
  // Log audit event
  await logAuditEvent(c.env.DB, {
    actorUserId: platformUser?.id || "unknown",
    actorRole: "super_admin",
    entityType: "feature_flag",
    entityId: flagKey,
    actionType: "feature_flag_updated",
    summary: `Feature flag ${flagKey} changed from ${oldValue} to ${is_enabled}`,
    detailsJson: { flag_key: flagKey, old_value: oldValue, new_value: is_enabled },
  });
  
  const updatedFlag = await service.getFlag(flagKey);
  return c.json({ flag: updatedFlag });
});

// Create new flag
featureFlagsRouter.post("/", authMiddleware, superAdminMiddleware, async (c) => {
  const { flag_key, is_enabled, description } = await c.req.json();
  const service = new FeatureFlagService(c.env.DB);
  const platformUser = getPlatformUser(c);
  
  if (!flag_key || typeof flag_key !== "string") {
    return c.json({ error: "flag_key is required" }, 400);
  }
  
  // Check if exists
  const existingFlag = await service.getFlag(flag_key);
  if (existingFlag) {
    return c.json({ error: "Flag already exists" }, 409);
  }
  
  const flag = await service.upsertFlag(flag_key, is_enabled ?? false, description);
  
  // Log audit event
  await logAuditEvent(c.env.DB, {
    actorUserId: platformUser?.id || "unknown",
    actorRole: "super_admin",
    entityType: "feature_flag",
    entityId: flag_key,
    actionType: "feature_flag_created",
    summary: `Feature flag ${flag_key} created`,
    detailsJson: { flag_key, is_enabled: is_enabled ?? false, description },
  });
  
  return c.json({ flag }, 201);
});

// Delete flag
featureFlagsRouter.delete("/:flagKey", authMiddleware, superAdminMiddleware, async (c) => {
  const flagKey = c.req.param("flagKey");
  const service = new FeatureFlagService(c.env.DB);
  const platformUser = getPlatformUser(c);
  
  const existingFlag = await service.getFlag(flagKey);
  
  if (!existingFlag) {
    return c.json({ error: "Flag not found" }, 404);
  }
  
  await service.deleteFlag(flagKey);
  
  // Log audit event
  await logAuditEvent(c.env.DB, {
    actorUserId: platformUser?.id || "unknown",
    actorRole: "super_admin",
    entityType: "feature_flag",
    entityId: flagKey,
    actionType: "feature_flag_deleted",
    summary: `Feature flag ${flagKey} deleted`,
    detailsJson: { flag_key: flagKey },
  });
  
  return c.json({ success: true });
});

export { featureFlagsRouter };

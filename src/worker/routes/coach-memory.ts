/**
 * Coach G Memory API Routes
 * 
 * Endpoints for managing Coach G's personalization memory:
 * - Followed entities (teams, players, leagues)
 * - Preferences (tone, focus areas, behavior)
 * - Memory summary and clearing
 */

import { Hono } from "hono";

// Helper to get data scope for user
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDataScope(db: any, userId: string): Promise<"DEMO" | "PROD"> {
  const user = await db.prepare(`
    SELECT demo_mode_enabled FROM users WHERE id = ?
  `).bind(userId).first() as { demo_mode_enabled: number } | null;
  return user?.demo_mode_enabled ? "DEMO" : "PROD";
}
import {
  getFollowedEntities,
  followEntity,
  unfollowEntity,
  updateEntityPriority,
  clearFollowedEntities,
  getMemoryPreferences,
  updateMemoryPreferences,
  resetMemoryPreferences,
  getRecentInteractions,
  clearInteractionHistory,
  getMemorySummary,
  clearAllMemory,
  EntityType,
  MemoryPreferences,
} from "../services/scoutMemoryService";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bindings = { DB: any };

const coachMemoryRoutes = new Hono<{ Bindings: Bindings }>();

// ============================================================================
// Followed Entities
// ============================================================================

/**
 * GET /api/scout/memory/entities
 * Get all followed entities for the current user
 */
coachMemoryRoutes.get("/entities", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dataScope = await getDataScope(c.env.DB, userId);
  const entityType = c.req.query("type") as EntityType | undefined;
  const sportKey = c.req.query("sport");
  const activeOnly = c.req.query("active") !== "false";

  try {
    const entities = await getFollowedEntities(c.env.DB, userId, dataScope, {
      entityType,
      sportKey,
      activeOnly,
    });

    return c.json({
      success: true,
      entities,
      count: entities.length,
    });
  } catch (error) {
    console.error("Error fetching followed entities:", error);
    return c.json({ error: "Failed to fetch entities" }, 500);
  }
});

/**
 * POST /api/scout/memory/entities
 * Follow a new entity
 */
coachMemoryRoutes.post("/entities", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dataScope = await getDataScope(c.env.DB, userId);

  try {
    const body = await c.req.json();
    const { entityType, entityKey, entityName, sportKey, priority, context } = body;

    if (!entityType || !entityKey || !entityName || !sportKey) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const result = await followEntity(c.env.DB, userId, dataScope, {
      entityType,
      entityKey,
      entityName,
      sportKey,
      priority,
      context,
      autoAdded: false,
    });

    return c.json({
      success: true,
      id: result.id,
      isNew: result.isNew,
      message: result.isNew ? "Entity followed" : "Entity updated",
    });
  } catch (error) {
    console.error("Error following entity:", error);
    return c.json({ error: "Failed to follow entity" }, 500);
  }
});

/**
 * DELETE /api/scout/memory/entities/:type/:key
 * Unfollow an entity
 */
coachMemoryRoutes.delete("/entities/:type/:key", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dataScope = await getDataScope(c.env.DB, userId);
  const entityType = c.req.param("type") as EntityType;
  const entityKey = c.req.param("key");

  try {
    const success = await unfollowEntity(c.env.DB, userId, dataScope, entityType, entityKey);

    return c.json({
      success,
      message: success ? "Entity unfollowed" : "Entity not found",
    });
  } catch (error) {
    console.error("Error unfollowing entity:", error);
    return c.json({ error: "Failed to unfollow entity" }, 500);
  }
});

/**
 * PATCH /api/scout/memory/entities/:id/priority
 * Update entity priority
 */
coachMemoryRoutes.patch("/entities/:id/priority", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dataScope = await getDataScope(c.env.DB, userId);
  const entityId = parseInt(c.req.param("id"));

  try {
    const body = await c.req.json();
    const { priority } = body;

    if (typeof priority !== "number" || priority < 1 || priority > 10) {
      return c.json({ error: "Priority must be between 1 and 10" }, 400);
    }

    const success = await updateEntityPriority(c.env.DB, userId, dataScope, entityId, priority);

    return c.json({
      success,
      message: success ? "Priority updated" : "Entity not found",
    });
  } catch (error) {
    console.error("Error updating priority:", error);
    return c.json({ error: "Failed to update priority" }, 500);
  }
});

/**
 * DELETE /api/scout/memory/entities
 * Clear all followed entities (or by type)
 */
coachMemoryRoutes.delete("/entities", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dataScope = await getDataScope(c.env.DB, userId);
  const entityType = c.req.query("type") as EntityType | undefined;

  try {
    const deleted = await clearFollowedEntities(c.env.DB, userId, dataScope, entityType);

    return c.json({
      success: true,
      deleted,
      message: `${deleted} entities removed`,
    });
  } catch (error) {
    console.error("Error clearing entities:", error);
    return c.json({ error: "Failed to clear entities" }, 500);
  }
});

// ============================================================================
// Preferences
// ============================================================================

/**
 * GET /api/scout/memory/preferences
 * Get memory preferences
 */
coachMemoryRoutes.get("/preferences", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dataScope = await getDataScope(c.env.DB, userId);

  try {
    const preferences = await getMemoryPreferences(c.env.DB, userId, dataScope);

    return c.json({
      success: true,
      preferences,
    });
  } catch (error) {
    console.error("Error fetching preferences:", error);
    return c.json({ error: "Failed to fetch preferences" }, 500);
  }
});

/**
 * PATCH /api/scout/memory/preferences
 * Update memory preferences
 */
coachMemoryRoutes.patch("/preferences", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dataScope = await getDataScope(c.env.DB, userId);

  try {
    const updates = await c.req.json() as Partial<MemoryPreferences>;

    await updateMemoryPreferences(c.env.DB, userId, dataScope, updates);

    const preferences = await getMemoryPreferences(c.env.DB, userId, dataScope);

    return c.json({
      success: true,
      preferences,
      message: "Preferences updated",
    });
  } catch (error) {
    console.error("Error updating preferences:", error);
    return c.json({ error: "Failed to update preferences" }, 500);
  }
});

/**
 * POST /api/scout/memory/preferences/reset
 * Reset preferences to defaults
 */
coachMemoryRoutes.post("/preferences/reset", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    await resetMemoryPreferences(c.env.DB, userId);

    const dataScope = await getDataScope(c.env.DB, userId);
    const preferences = await getMemoryPreferences(c.env.DB, userId, dataScope);

    return c.json({
      success: true,
      preferences,
      message: "Preferences reset to defaults",
    });
  } catch (error) {
    console.error("Error resetting preferences:", error);
    return c.json({ error: "Failed to reset preferences" }, 500);
  }
});

// ============================================================================
// Interactions / History
// ============================================================================

/**
 * GET /api/scout/memory/interactions
 * Get recent interaction history
 */
coachMemoryRoutes.get("/interactions", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dataScope = await getDataScope(c.env.DB, userId);
  const interactionType = c.req.query("type");
  const limit = parseInt(c.req.query("limit") || "50");

  try {
    const interactions = await getRecentInteractions(c.env.DB, userId, dataScope, {
      interactionType,
      limit,
    });

    return c.json({
      success: true,
      interactions,
      count: interactions.length,
    });
  } catch (error) {
    console.error("Error fetching interactions:", error);
    return c.json({ error: "Failed to fetch interactions" }, 500);
  }
});

/**
 * DELETE /api/scout/memory/interactions
 * Clear interaction history
 */
coachMemoryRoutes.delete("/interactions", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dataScope = await getDataScope(c.env.DB, userId);
  const olderThanDays = parseInt(c.req.query("olderThan") || "0") || undefined;
  const interactionType = c.req.query("type");

  try {
    const deleted = await clearInteractionHistory(c.env.DB, userId, dataScope, {
      olderThanDays,
      interactionType,
    });

    return c.json({
      success: true,
      deleted,
      message: `${deleted} interactions cleared`,
    });
  } catch (error) {
    console.error("Error clearing interactions:", error);
    return c.json({ error: "Failed to clear interactions" }, 500);
  }
});

// ============================================================================
// Memory Summary & Full Clear
// ============================================================================

/**
 * GET /api/scout/memory/summary
 * Get complete memory summary
 */
coachMemoryRoutes.get("/summary", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dataScope = await getDataScope(c.env.DB, userId);

  try {
    const summary = await getMemorySummary(c.env.DB, userId, dataScope);

    return c.json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error("Error fetching memory summary:", error);
    return c.json({ error: "Failed to fetch summary" }, 500);
  }
});

/**
 * POST /api/scout/memory/clear
 * Clear all memory (full reset)
 */
coachMemoryRoutes.post("/clear", async (c) => {
  const userId = c.req.header("x-user-id");
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dataScope = await getDataScope(c.env.DB, userId);

  try {
    const result = await clearAllMemory(c.env.DB, userId, dataScope);

    return c.json({
      success: true,
      cleared: result,
      message: "All Coach G memory cleared",
    });
  } catch (error) {
    console.error("Error clearing memory:", error);
    return c.json({ error: "Failed to clear memory" }, 500);
  }
});

export { coachMemoryRoutes };

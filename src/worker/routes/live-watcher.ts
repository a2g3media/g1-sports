/**
 * Live Game Watcher API Routes
 * 
 * Endpoints for managing the live game watching service
 */

import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import {
  pollWatchedGames,
  getWatcherStatus,
  getWatchedGamesList,
  pollSingleGame,
  clearGameSnapshots,
  type DataScope,
} from "../services/liveGameWatcher";

type AppBindings = { Bindings: Env };

const liveWatcherRouter = new Hono<AppBindings>();

// =====================================================
// WATCHER STATUS & DISCOVERY
// =====================================================

/**
 * GET /api/live-watcher/status
 * Get current watcher status
 */
liveWatcherRouter.get("/status", authMiddleware, async (c) => {
  const db = c.env.DB;
  const scope = (c.req.query("scope") || "PROD") as DataScope;
  
  try {
    const status = await getWatcherStatus(db, scope);
    return c.json(status);
  } catch (error) {
    console.error("Error getting watcher status:", error);
    return c.json({ error: "Failed to get watcher status" }, 500);
  }
});

/**
 * GET /api/live-watcher/games
 * Get list of games being watched
 */
liveWatcherRouter.get("/games", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const db = c.env.DB;
  const scope = (c.req.query("scope") || "PROD") as DataScope;
  const userFilter = c.req.query("user_only") === "true";
  
  try {
    const games = await getWatchedGamesList(
      db, 
      scope, 
      userFilter ? user.id : undefined
    );
    
    return c.json({ 
      games,
      count: games.length,
      activeCount: games.filter((g: { isActive: boolean }) => g.isActive).length,
    });
  } catch (error) {
    console.error("Error getting watched games:", error);
    return c.json({ error: "Failed to get watched games" }, 500);
  }
});

// =====================================================
// POLLING CONTROLS
// =====================================================

/**
 * POST /api/live-watcher/poll
 * Manually trigger a poll of all watched games
 */
liveWatcherRouter.post("/poll", async (c) => {
  // This endpoint should be protected by API key in production (or by cron trigger)
  // For now, allow all requests since this will be called by scheduled workers
  
  const db = c.env.DB;
  const scope = (c.req.query("scope") || "PROD") as DataScope;
  
  try {
    const result = await pollWatchedGames(db, scope);
    return c.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error polling watched games:", error);
    return c.json({ error: "Failed to poll watched games" }, 500);
  }
});

/**
 * POST /api/live-watcher/poll/:gameId
 * Manually trigger a poll for a specific game
 */
liveWatcherRouter.post("/poll/:gameId", authMiddleware, async (c) => {
  const db = c.env.DB;
  const gameId = c.req.param("gameId");
  const scope = (c.req.query("scope") || "PROD") as DataScope;
  
  try {
    const diff = await pollSingleGame(db, gameId, scope);
    
    if (!diff) {
      return c.json({ error: "Game not found" }, 404);
    }
    
    return c.json({
      success: true,
      gameId,
      hasChanges: diff.hasChanges,
      statusChanged: diff.statusChanged,
      scoreChanged: diff.scoreChanged,
      currentSnapshot: diff.currentSnapshot,
      previousSnapshot: diff.previousSnapshot,
    });
  } catch (error) {
    console.error("Error polling game:", error);
    return c.json({ error: "Failed to poll game" }, 500);
  }
});

// =====================================================
// SNAPSHOT MANAGEMENT
// =====================================================

/**
 * DELETE /api/live-watcher/snapshots/:gameId
 * Clear snapshots for a game (testing/debugging)
 */
liveWatcherRouter.delete("/snapshots/:gameId", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const db = c.env.DB;
  const gameId = c.req.param("gameId");
  const scope = (c.req.query("scope") || "PROD") as DataScope;
  
  try {
    await clearGameSnapshots(db, gameId, scope);
    return c.json({ success: true, message: "Snapshots cleared" });
  } catch (error) {
    console.error("Error clearing snapshots:", error);
    return c.json({ error: "Failed to clear snapshots" }, 500);
  }
});

// =====================================================
// WATCHER INDICATOR (FOR UI)
// =====================================================

/**
 * GET /api/live-watcher/indicator
 * Get data for "Scout is Watching" UI indicator
 */
liveWatcherRouter.get("/indicator", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const db = c.env.DB;
  const scope = (c.req.query("scope") || "PROD") as DataScope;
  
  try {
    // Get user's watched games
    const games = await getWatchedGamesList(db, scope, user.id);
    const liveGames = games.filter((g: { status: string }) => 
      g.status.toLowerCase().includes('progress') || 
      g.status.toLowerCase().includes('half')
    );
    
    // Get watcher status
    const status = await getWatcherStatus(db, scope);
    
    return c.json({
      isWatching: liveGames.length > 0,
      liveGameCount: liveGames.length,
      totalWatchedGames: games.length,
      lastPollAt: status.lastPollAt,
      nextPollAt: status.nextPollAt,
      games: liveGames.map((g: { gameId: string; homeTeam: string; awayTeam: string; status: string; lastPolled: string | null }) => ({
        gameId: g.gameId,
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
        status: g.status,
        lastPolled: g.lastPolled,
      })),
    });
  } catch (error) {
    console.error("Error getting watcher indicator:", error);
    return c.json({ error: "Failed to get watcher indicator" }, 500);
  }
});

// =====================================================
// WATCH / UNWATCH GAME
// =====================================================

/**
 * POST /api/live-watcher/games/:gameId/watch
 * Add a game to user's watch list
 */
liveWatcherRouter.post("/games/:gameId/watch", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const db = c.env.DB;
  const gameId = c.req.param("gameId");
  const scope = (c.req.query("scope") || "PROD") as DataScope;
  
  try {
    // Check if already watching
    const existing = await db.prepare(`
      SELECT 1 FROM game_watchlist 
      WHERE user_id = ? AND game_id = ? AND data_scope = ?
    `).bind(user.id, gameId, scope).first();
    
    if (existing) {
      return c.json({ success: true, message: "Already watching", watching: true });
    }
    
    // Get game info from events table
    const game = await db.prepare(`
      SELECT sport_key, home_team, away_team, start_at 
      FROM events WHERE id = ?
    `).bind(gameId).first() as { sport_key: string; home_team: string; away_team: string; start_at: string } | null;
    
    if (!game) {
      return c.json({ error: "Game not found" }, 404);
    }
    
    // Add to watchlist with game details
    await db.prepare(`
      INSERT INTO game_watchlist (
        user_id, game_id, data_scope, sport_key, home_team, away_team, game_start_time,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(user.id, gameId, scope, game.sport_key, game.home_team, game.away_team, game.start_at).run();
    
    return c.json({ success: true, watching: true });
  } catch (error) {
    console.error("Error adding game to watchlist:", error);
    return c.json({ error: "Failed to add game to watchlist" }, 500);
  }
});

/**
 * DELETE /api/live-watcher/games/:gameId/watch
 * Remove a game from user's watch list
 */
liveWatcherRouter.delete("/games/:gameId/watch", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const db = c.env.DB;
  const gameId = c.req.param("gameId");
  const scope = (c.req.query("scope") || "PROD") as DataScope;
  
  try {
    await db.prepare(`
      DELETE FROM game_watchlist 
      WHERE user_id = ? AND game_id = ? AND data_scope = ?
    `).bind(user.id, gameId, scope).run();
    
    return c.json({ success: true, watching: false });
  } catch (error) {
    console.error("Error removing game from watchlist:", error);
    return c.json({ error: "Failed to remove game from watchlist" }, 500);
  }
});

/**
 * GET /api/live-watcher/games/:gameId/watch
 * Check if user is watching a game
 */
liveWatcherRouter.get("/games/:gameId/watch", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const db = c.env.DB;
  const gameId = c.req.param("gameId");
  const scope = (c.req.query("scope") || "PROD") as DataScope;
  
  try {
    const result = await db.prepare(`
      SELECT created_at FROM game_watchlist 
      WHERE user_id = ? AND game_id = ? AND data_scope = ?
    `).bind(user.id, gameId, scope).first() as { created_at: string } | null;
    
    return c.json({ 
      watching: result !== null,
      watchingSince: result?.created_at || null,
    });
  } catch (error) {
    console.error("Error checking watch status:", error);
    return c.json({ error: "Failed to check watch status" }, 500);
  }
});

// =====================================================
// AUTO-WATCH SETTINGS
// =====================================================

/**
 * PUT /api/live-watcher/settings/auto-watch
 * Enable/disable auto-watch for followed teams
 */
liveWatcherRouter.put("/settings/auto-watch", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const db = c.env.DB;
  const scope = (c.req.query("scope") || "PROD") as DataScope;
  
  try {
    const body = await c.req.json() as { enabled: boolean };
    const enabled = body.enabled ? 1 : 0;
    
    // Upsert setting
    await db.prepare(`
      INSERT INTO user_settings (user_id, setting_key, setting_value, data_scope, created_at, updated_at)
      VALUES (?, 'auto_watch_followed_teams', ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT (user_id, setting_key, data_scope) 
      DO UPDATE SET setting_value = ?, updated_at = datetime('now')
    `).bind(user.id, String(enabled), scope, String(enabled)).run();
    
    return c.json({ success: true, enabled: body.enabled });
  } catch (error) {
    console.error("Error updating auto-watch setting:", error);
    return c.json({ error: "Failed to update setting" }, 500);
  }
});

/**
 * GET /api/live-watcher/settings/auto-watch
 * Get auto-watch setting for followed teams
 */
liveWatcherRouter.get("/settings/auto-watch", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const db = c.env.DB;
  const scope = (c.req.query("scope") || "PROD") as DataScope;
  
  try {
    const result = await db.prepare(`
      SELECT setting_value FROM user_settings 
      WHERE user_id = ? AND setting_key = 'auto_watch_followed_teams' AND data_scope = ?
    `).bind(user.id, scope).first() as { setting_value: string } | null;
    
    return c.json({ 
      enabled: result?.setting_value === '1',
    });
  } catch (error) {
    console.error("Error getting auto-watch setting:", error);
    return c.json({ error: "Failed to get setting" }, 500);
  }
});

export { liveWatcherRouter };

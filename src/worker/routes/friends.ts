/**
 * Friends API - Social features for following users and sharing picks
 */

import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";

// Demo mode helper
const DEMO_USER_ID = "demo_user_12345";

function getUserId(c: { req: { header: (name: string) => string | undefined }; get: (key: string) => unknown }): string | null {
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    return DEMO_USER_ID;
  }
  const user = c.get("user") as { id?: string } | undefined;
  return user?.id || null;
}

// Middleware that allows demo mode OR real auth
async function demoOrAuthMiddleware(c: any, next: () => Promise<void>) {
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    return next();
  }
  return authMiddleware(c, next);
}

type Env = {
  DB: D1Database;
};

const friendsRouter = new Hono<{ Bindings: Env }>();

// =====================================================
// FOLLOW/UNFOLLOW ENDPOINTS
// =====================================================

// Get users the current user is following
friendsRouter.get("/following", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }

  try {
    const result = await c.env.DB.prepare(`
      SELECT uf.following_user_id, uf.created_at as followed_at
      FROM user_follows uf
      WHERE uf.follower_user_id = ?
      ORDER BY uf.created_at DESC
    `).bind(userId).all();

    return c.json({ 
      ok: true, 
      following: result.results || [] 
    });
  } catch (error) {
    console.error("[Friends] Error fetching following:", error);
    return c.json({ ok: false, error: "Failed to fetch following" }, 500);
  }
});

// Get users following the current user
friendsRouter.get("/followers", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }

  try {
    const result = await c.env.DB.prepare(`
      SELECT uf.follower_user_id, uf.created_at as followed_at
      FROM user_follows uf
      WHERE uf.following_user_id = ?
      ORDER BY uf.created_at DESC
    `).bind(userId).all();

    return c.json({ 
      ok: true, 
      followers: result.results || [] 
    });
  } catch (error) {
    console.error("[Friends] Error fetching followers:", error);
    return c.json({ ok: false, error: "Failed to fetch followers" }, 500);
  }
});

// Follow a user
friendsRouter.post("/follow/:userId", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }

  const { userId: targetUserId } = c.req.param();
  
  if (userId === targetUserId) {
    return c.json({ ok: false, error: "Cannot follow yourself" }, 400);
  }

  try {
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO user_follows (follower_user_id, following_user_id, created_at)
      VALUES (?, ?, datetime('now'))
    `).bind(userId, targetUserId).run();

    return c.json({ ok: true, message: "Followed successfully" });
  } catch (error) {
    console.error("[Friends] Error following user:", error);
    return c.json({ ok: false, error: "Failed to follow user" }, 500);
  }
});

// Unfollow a user
friendsRouter.delete("/follow/:userId", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }

  const { userId: targetUserId } = c.req.param();

  try {
    await c.env.DB.prepare(`
      DELETE FROM user_follows 
      WHERE follower_user_id = ? AND following_user_id = ?
    `).bind(userId, targetUserId).run();

    return c.json({ ok: true, message: "Unfollowed successfully" });
  } catch (error) {
    console.error("[Friends] Error unfollowing user:", error);
    return c.json({ ok: false, error: "Failed to unfollow user" }, 500);
  }
});

// Check if following a specific user
friendsRouter.get("/follow/:userId", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }

  const { userId: targetUserId } = c.req.param();

  try {
    const result = await c.env.DB.prepare(`
      SELECT 1 FROM user_follows 
      WHERE follower_user_id = ? AND following_user_id = ?
    `).bind(userId, targetUserId).first();

    return c.json({ 
      ok: true, 
      isFollowing: !!result 
    });
  } catch (error) {
    console.error("[Friends] Error checking follow status:", error);
    return c.json({ ok: false, error: "Failed to check follow status" }, 500);
  }
});

// =====================================================
// SHARED PICKS ENDPOINTS
// =====================================================

// Share a pick
friendsRouter.post("/picks/share", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    const { gameId, sportKey, teams, pickType, pickSide, lineValue, note, visibility } = body;

    if (!gameId || !sportKey || !pickType || !pickSide) {
      return c.json({ ok: false, error: "Missing required fields" }, 400);
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO shared_picks (user_id, game_id, sport_key, teams, pick_type, pick_side, line_value, note, visibility, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      RETURNING id
    `).bind(
      userId,
      gameId,
      sportKey,
      JSON.stringify(teams || {}),
      pickType,
      pickSide,
      lineValue || null,
      note || null,
      visibility || 'friends'
    ).first();

    return c.json({ ok: true, pickId: result?.id });
  } catch (error) {
    console.error("[Friends] Error sharing pick:", error);
    return c.json({ ok: false, error: "Failed to share pick" }, 500);
  }
});

// Get shared picks feed (from followed users)
friendsRouter.get("/picks/feed", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }

  const limit = parseInt(c.req.query("limit") || "20");
  const offset = parseInt(c.req.query("offset") || "0");

  try {
    // Get picks from users the current user follows
    const result = await c.env.DB.prepare(`
      SELECT 
        sp.id,
        sp.user_id,
        sp.game_id,
        sp.sport_key,
        sp.teams,
        sp.pick_type,
        sp.pick_side,
        sp.line_value,
        sp.note,
        sp.visibility,
        sp.created_at
      FROM shared_picks sp
      INNER JOIN user_follows uf ON sp.user_id = uf.following_user_id
      WHERE uf.follower_user_id = ?
        AND (sp.visibility = 'public' OR sp.visibility = 'friends')
      ORDER BY sp.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(userId, limit, offset).all();

    // Parse teams JSON
    const picks = (result.results || []).map((pick: Record<string, unknown>) => ({
      ...pick,
      teams: typeof pick.teams === 'string' ? JSON.parse(pick.teams) : pick.teams
    }));

    return c.json({ ok: true, picks });
  } catch (error) {
    console.error("[Friends] Error fetching feed:", error);
    return c.json({ ok: false, error: "Failed to fetch feed" }, 500);
  }
});

// Get user's own shared picks
friendsRouter.get("/picks/mine", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }

  const limit = parseInt(c.req.query("limit") || "20");
  const offset = parseInt(c.req.query("offset") || "0");

  try {
    const result = await c.env.DB.prepare(`
      SELECT *
      FROM shared_picks
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(userId, limit, offset).all();

    const picks = (result.results || []).map((pick: Record<string, unknown>) => ({
      ...pick,
      teams: typeof pick.teams === 'string' ? JSON.parse(pick.teams) : pick.teams
    }));

    return c.json({ ok: true, picks });
  } catch (error) {
    console.error("[Friends] Error fetching my picks:", error);
    return c.json({ ok: false, error: "Failed to fetch picks" }, 500);
  }
});

// Delete a shared pick
friendsRouter.delete("/picks/:pickId", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }

  const { pickId } = c.req.param();

  try {
    await c.env.DB.prepare(`
      DELETE FROM shared_picks 
      WHERE id = ? AND user_id = ?
    `).bind(pickId, userId).run();

    return c.json({ ok: true, message: "Pick deleted" });
  } catch (error) {
    console.error("[Friends] Error deleting pick:", error);
    return c.json({ ok: false, error: "Failed to delete pick" }, 500);
  }
});

// =====================================================
// DISCOVERY ENDPOINTS
// =====================================================

// Search/discover users (for finding friends)
friendsRouter.get("/discover", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }

  // Return demo users for now since we don't have a real user table exposed
  const demoUsers = [
    { id: "user_1", name: "Mike's Picks", stats: { totalPicks: 47, winRate: 58 } },
    { id: "user_2", name: "Vegas Sharp", stats: { totalPicks: 124, winRate: 62 } },
    { id: "user_3", name: "The Underdog", stats: { totalPicks: 89, winRate: 54 } },
    { id: "user_4", name: "Parlay Pete", stats: { totalPicks: 35, winRate: 49 } },
    { id: "user_5", name: "Chalk Lover", stats: { totalPicks: 156, winRate: 56 } },
  ];

  return c.json({ ok: true, users: demoUsers });
});

// Get friend stats (following/followers count)
friendsRouter.get("/stats", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }

  try {
    const [followingCount, followersCount, picksCount] = await Promise.all([
      c.env.DB.prepare(`
        SELECT COUNT(*) as count FROM user_follows WHERE follower_user_id = ?
      `).bind(userId).first<{ count: number }>(),
      c.env.DB.prepare(`
        SELECT COUNT(*) as count FROM user_follows WHERE following_user_id = ?
      `).bind(userId).first<{ count: number }>(),
      c.env.DB.prepare(`
        SELECT COUNT(*) as count FROM shared_picks WHERE user_id = ?
      `).bind(userId).first<{ count: number }>()
    ]);

    return c.json({ 
      ok: true, 
      stats: {
        following: followingCount?.count || 0,
        followers: followersCount?.count || 0,
        sharedPicks: picksCount?.count || 0
      }
    });
  } catch (error) {
    console.error("[Friends] Error fetching stats:", error);
    return c.json({ ok: false, error: "Failed to fetch stats" }, 500);
  }
});

export default friendsRouter;

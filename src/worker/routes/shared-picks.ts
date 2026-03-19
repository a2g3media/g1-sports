import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";

type Env = {
  DB: D1Database;
  MOCHA_USERS_SERVICE_API_URL: string;
  MOCHA_USERS_SERVICE_API_KEY: string;
};

type Variables = {
  userId: string;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// All routes require auth
app.use("/*", authMiddleware);

// Get feed of shared picks from friends
app.get("/feed", async (c) => {
  const userId = c.get("userId");
  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");
  
  // Get picks from users I follow (friends)
  const picks = await c.env.DB.prepare(`
    SELECT 
      sp.*,
      u.display_name,
      u.avatar_url
    FROM shared_picks sp
    INNER JOIN user_follows uf ON uf.following_user_id = sp.user_id AND uf.follower_user_id = ?
    LEFT JOIN users u ON u.id = CAST(sp.user_id AS INTEGER)
    WHERE sp.visibility IN ('friends', 'public')
    ORDER BY sp.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(userId, limit, offset).all();
  
  return c.json({ ok: true, picks: picks.results || [] });
});

// Get my shared picks
app.get("/mine", async (c) => {
  const userId = c.get("userId");
  const limit = parseInt(c.req.query("limit") || "50");
  
  const picks = await c.env.DB.prepare(`
    SELECT * FROM shared_picks
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(userId, limit).all();
  
  return c.json({ ok: true, picks: picks.results || [] });
});

// Share a pick
app.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    gameId: string;
    sportKey: string;
    homeTeam: string;
    awayTeam: string;
    pickType: string;
    pickSide: string;
    lineValue?: number;
    note?: string;
    visibility?: string;
  }>();
  
  const { gameId, sportKey, homeTeam, awayTeam, pickType, pickSide, lineValue, note, visibility } = body;
  
  if (!gameId || !sportKey || !homeTeam || !awayTeam || !pickType || !pickSide) {
    return c.json({ ok: false, error: "Missing required fields" }, 400);
  }
  
  const result = await c.env.DB.prepare(`
    INSERT INTO shared_picks (user_id, game_id, sport_key, home_team, away_team, pick_type, pick_side, line_value, note, visibility)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId,
    gameId,
    sportKey,
    homeTeam,
    awayTeam,
    pickType,
    pickSide,
    lineValue || null,
    note || null,
    visibility || 'friends'
  ).run();
  
  return c.json({ ok: true, id: result.meta.last_row_id });
});

// Delete a shared pick
app.delete("/:pickId", async (c) => {
  const userId = c.get("userId");
  const pickId = c.req.param("pickId");
  
  // Only allow deleting own picks
  await c.env.DB.prepare(`
    DELETE FROM shared_picks
    WHERE id = ? AND user_id = ?
  `).bind(pickId, userId).run();
  
  return c.json({ ok: true });
});

// Get a specific user's public/friend picks
app.get("/user/:targetUserId", async (c) => {
  const userId = c.get("userId");
  const targetUserId = c.req.param("targetUserId");
  const limit = parseInt(c.req.query("limit") || "20");
  
  // Check if we follow this user
  const isFollowing = await c.env.DB.prepare(`
    SELECT id FROM user_follows
    WHERE follower_user_id = ? AND following_user_id = ?
  `).bind(userId, targetUserId).first();
  
  // If following, show friend + public picks. Otherwise just public.
  const visibilityFilter = isFollowing 
    ? "visibility IN ('friends', 'public')" 
    : "visibility = 'public'";
  
  const picks = await c.env.DB.prepare(`
    SELECT sp.*, u.display_name, u.avatar_url
    FROM shared_picks sp
    LEFT JOIN users u ON u.id = CAST(sp.user_id AS INTEGER)
    WHERE sp.user_id = ? AND ${visibilityFilter}
    ORDER BY sp.created_at DESC
    LIMIT ?
  `).bind(targetUserId, limit).all();
  
  return c.json({ ok: true, picks: picks.results || [], isFollowing: !!isFollowing });
});

export default app;

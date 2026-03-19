/**
 * Share Scout Take API Routes
 */
import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";

type Env = {
  DB: D1Database;
  MOCHA_USERS_SERVICE_API_URL: string;
  MOCHA_USERS_SERVICE_API_KEY: string;
};
import { 
  createShare, 
  getShare, 
  incrementViewCount, 
  trackShareEvent,
  getUserShareStats,
  getUserRecentShares
} from "../services/shareService";

const shares = new Hono<{ Bindings: Env }>();

/**
 * Create a new shareable take
 * POST /api/shares
 */
shares.post("/", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const userId = user.id;
  const body = await c.req.json<{
    gameContext?: string;
    scoutTake: string;
    confidence?: string;
    persona?: string;
    sportKey?: string;
    teams?: string;
  }>();

  if (!body.scoutTake || body.scoutTake.trim().length === 0) {
    return c.json({ error: "Coach G take is required" }, 400);
  }

  // Prevent sharing excessively long content
  if (body.scoutTake.length > 2000) {
    return c.json({ error: "Coach G take is too long to share" }, 400);
  }

  const result = await createShare(c.env.DB, {
    userId,
    gameContext: body.gameContext,
    scoutTake: body.scoutTake,
    confidence: body.confidence,
    persona: body.persona,
    sportKey: body.sportKey,
    teams: body.teams
  });

  if (!result.success) {
    return c.json({ error: "Failed to create share" }, 500);
  }

  return c.json({ 
    shareId: result.shareId,
    shareUrl: `/share/${result.shareId}`
  });
});

/**
 * Get user's share stats
 * GET /api/shares/stats/me
 * NOTE: Must be defined BEFORE /:shareId to avoid route conflict
 */
shares.get("/stats/me", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const userId = user.id;
  
  const stats = await getUserShareStats(c.env.DB, userId);
  const recentShares = await getUserRecentShares(c.env.DB, userId, 5);

  return c.json({
    stats,
    recentShares: recentShares.map(s => ({
      shareId: s.share_id,
      gameContext: s.game_context,
      scoutTake: s.scout_take.substring(0, 100) + (s.scout_take.length > 100 ? '...' : ''),
      viewCount: s.view_count,
      createdAt: s.created_at
    }))
  });
});

/**
 * Get a shared take by ID (public endpoint)
 * GET /api/shares/:shareId
 */
shares.get("/:shareId", async (c) => {
  const shareId = c.req.param("shareId");
  
  const share = await getShare(c.env.DB, shareId);
  
  if (!share) {
    return c.json({ error: "Share not found" }, 404);
  }

  // Increment view count (don't wait)
  incrementViewCount(c.env.DB, shareId);

  // Track link click
  const userAgent = c.req.header("user-agent");
  const referrer = c.req.header("referer");
  trackShareEvent(c.env.DB, {
    shareId,
    eventType: 'share_link_clicked',
    userAgent,
    referrerUrl: referrer
  });

  return c.json({
    shareId: share.share_id,
    gameContext: share.game_context,
    scoutTake: share.scout_take,
    confidence: share.confidence,
    persona: share.persona,
    sportKey: share.sport_key,
    teams: share.teams,
    viewCount: share.view_count,
    createdAt: share.created_at
  });
});

/**
 * Track share conversion (signup from share link)
 * POST /api/shares/:shareId/conversion
 */
shares.post("/:shareId/conversion", async (c) => {
  const shareId = c.req.param("shareId");
  const user = c.get("user");
  const userId = user?.id;

  await trackShareEvent(c.env.DB, {
    shareId,
    eventType: 'share_conversion_signup',
    convertedUserId: userId
  });

  return c.json({ success: true });
});

export default shares;

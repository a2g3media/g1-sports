import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";

type Variables = {
  userId: string;
};

const upgradeTrackingRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// Middleware to get userId
upgradeTrackingRouter.use("*", authMiddleware);

// Track an upgrade trigger event
upgradeTrackingRouter.post("/trigger", async (c) => {
  const db = c.env.DB;
  const userId = c.get("userId");
  const body = await c.req.json();
  
  const { 
    trigger_source,    // e.g., 'scores_page', 'command_center', 'scout_cap', 'feature_gate', 'alert_center'
    trigger_context,   // e.g., 'elite_filters_locked', 'ai_limit_reached', 'live_commentary_locked'
    trigger_feature,   // e.g., 'advanced_filters', 'priority_ai', 'custom_alerts'
    page_path,         // current page URL path
    from_tier,         // current tier
    to_tier,           // target tier shown in prompt
  } = body;
  
  if (!trigger_source) {
    return c.json({ error: "trigger_source is required" }, 400);
  }
  
  await db.prepare(`
    INSERT INTO upgrade_events (user_id, from_tier, to_tier, trigger_source, trigger_context, trigger_feature, page_path)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId,
    from_tier || null,
    to_tier || null,
    trigger_source,
    trigger_context || null,
    trigger_feature || null,
    page_path || null
  ).run();
  
  return c.json({ success: true });
});

// Mark an upgrade event as converted
upgradeTrackingRouter.post("/convert", async (c) => {
  const db = c.env.DB;
  const userId = c.get("userId");
  const body = await c.req.json();
  const { to_tier } = body;
  
  // Find the most recent unconverted upgrade event for this user
  const recentEvent = await db.prepare(`
    SELECT id FROM upgrade_events 
    WHERE user_id = ? AND converted = 0
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(userId).first<{ id: number }>();
  
  if (recentEvent) {
    await db.prepare(`
      UPDATE upgrade_events 
      SET converted = 1, conversion_at = CURRENT_TIMESTAMP, to_tier = COALESCE(?, to_tier), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(to_tier, recentEvent.id).run();
  }
  
  return c.json({ success: true, eventId: recentEvent?.id });
});

// Get user's upgrade trigger history (for debugging)
upgradeTrackingRouter.get("/history", async (c) => {
  const db = c.env.DB;
  const userId = c.get("userId");
  
  const { results } = await db.prepare(`
    SELECT * FROM upgrade_events
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).bind(userId).all();
  
  return c.json({ events: results });
});

export { upgradeTrackingRouter };

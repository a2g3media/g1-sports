import { Hono } from "hono";
import type { Context } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import type { AlertCounts } from "@/shared/types";
import { 
  generateAlertsFromThresholdEvents, 
  generateDemoAlerts,
  cleanupOldAlerts,
  getAlertGenerationStats
} from "../services/alertGenerator";
import { sanitizeCoachGText } from "../services/coachgCompliance";

type AppBindings = { Bindings: Env };
type AppContext = Context<AppBindings>;

const alertsRouter = new Hono<AppBindings>();

// Demo user ID for unauthenticated demo mode
const DEMO_USER_ID = "demo-user-001";

// Helper to get user ID (supports demo mode)
function getUserId(c: AppContext): string | null {
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    return DEMO_USER_ID;
  }
  const user = c.get("user");
  return user?.id || null;
}

// Middleware that allows demo mode OR real auth
async function demoOrAuthMiddleware(c: AppContext, next: () => Promise<void>) {
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    // Allow demo mode requests without real auth
    await next();
    return;
  }
  // Otherwise require real authentication
  await authMiddleware(c, next);
}

// =====================================================
// WATCHLIST ITEMS (Comprehensive Follow System)
// =====================================================

/**
 * GET /api/alerts/watchlist
 * Get all followed items (comprehensive watchlist)
 */
alertsRouter.get("/watchlist", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const itemType = c.req.query("type"); // GAME, TEAM, LEAGUE, POOL, SPORT
  const sportType = c.req.query("sport");

  let query = `
    SELECT wi.*, w.name as watchlist_name
    FROM watchlist_items wi
    LEFT JOIN watchlists w ON wi.watchlist_id = w.id
    WHERE wi.user_id = ?
  `;
  const params: (string | number)[] = [userId];

  if (itemType) {
    query += ` AND wi.item_type = ?`;
    params.push(itemType);
  }
  if (sportType) {
    query += ` AND wi.sport_type = ?`;
    params.push(sportType);
  }

  query += ` ORDER BY wi.created_at DESC`;

  const { results } = await db.prepare(query).bind(...params).all();

  return c.json({ items: results });
});

/**
 * POST /api/alerts/watchlist/follow
 * Follow an item (game, team, league, pool, sport)
 */
alertsRouter.post("/watchlist/follow", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const body = await c.req.json();
  const { item_type, item_id, sport_type, display_name, metadata } = body;

  if (!item_type || !item_id) {
    return c.json({ error: "item_type and item_id are required" }, 400);
  }

  // Get or create default watchlist
  let watchlist = await db.prepare(`
    SELECT id FROM watchlists WHERE user_id = ? AND is_default = 1
  `).bind(userId).first<{ id: number }>();

  if (!watchlist) {
    const result = await db.prepare(`
      INSERT INTO watchlists (user_id, name, is_default)
      VALUES (?, 'My Watchlist', 1)
    `).bind(userId).run();
    watchlist = { id: Number(result.meta.last_row_id) };
  }

  // Check if already following
  const existing = await db.prepare(`
    SELECT id FROM watchlist_items 
    WHERE user_id = ? AND item_type = ? AND item_id = ?
  `).bind(userId, item_type, item_id).first();

  if (existing) {
    return c.json({ error: "Already following this item" }, 400);
  }

  // Insert follow
  const result = await db.prepare(`
    INSERT INTO watchlist_items (watchlist_id, user_id, item_type, item_id, sport_type, display_name, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    watchlist.id,
    userId,
    item_type,
    item_id,
    sport_type || null,
    display_name || null,
    metadata ? JSON.stringify(metadata) : null
  ).run();

  return c.json({ 
    success: true,
    id: result.meta.last_row_id,
    message: "Added to watchlist",
  });
});

/**
 * DELETE /api/alerts/watchlist/unfollow
 * Unfollow an item
 */
alertsRouter.delete("/watchlist/unfollow", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const item_type = c.req.query("item_type");
  const item_id = c.req.query("item_id");

  if (!item_type || !item_id) {
    return c.json({ error: "item_type and item_id are required" }, 400);
  }

  await db.prepare(`
    DELETE FROM watchlist_items WHERE user_id = ? AND item_type = ? AND item_id = ?
  `).bind(userId, item_type, item_id).run();

  return c.json({ success: true, message: "Removed from watchlist" });
});

/**
 * GET /api/alerts/watchlist/check
 * Check if user is following an item
 */
alertsRouter.get("/watchlist/check", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const item_type = c.req.query("item_type");
  const item_id = c.req.query("item_id");

  if (!item_type || !item_id) {
    return c.json({ following: false });
  }

  const existing = await db.prepare(`
    SELECT id FROM watchlist_items 
    WHERE user_id = ? AND item_type = ? AND item_id = ?
  `).bind(userId, item_type, item_id).first();

  return c.json({ following: Boolean(existing) });
});

// =====================================================
// ALERT EVENTS (User-facing alerts)
// =====================================================

/**
 * GET /api/alerts/events
 * Get user's alert events (Alert Center)
 */
alertsRouter.get("/events", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";
  const filter = c.req.query("filter"); // ALL, CRITICAL, IMPACT, POOLS, GAMES, INJURIES, ODDS
  const unreadOnly = c.req.query("unread_only") === "true";
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const offset = parseInt(c.req.query("offset") || "0");

  let query = `
    SELECT ae.*, te.event_category, te.event_type
    FROM alert_events ae
    LEFT JOIN threshold_events te ON ae.threshold_event_id = te.id
    WHERE ae.user_id = ? AND ae.data_scope = ? AND ae.dismissed_at IS NULL
  `;
  const params: (string | number)[] = [user.id, scope];

  // Apply filters
  if (filter === "CRITICAL") {
    query += ` AND ae.severity = 'CRITICAL'`;
  } else if (filter === "IMPACT") {
    query += ` AND ae.severity = 'IMPACT'`;
  } else if (filter === "POOLS") {
    query += ` AND ae.item_type = 'POOL'`;
  } else if (filter === "GAMES") {
    query += ` AND ae.item_type = 'GAME'`;
  } else if (filter === "INJURIES") {
    query += ` AND te.event_category = 'INJURY'`;
  } else if (filter === "ODDS") {
    query += ` AND te.event_category = 'ODDS'`;
  }

  if (unreadOnly) {
    query += ` AND ae.read_at IS NULL`;
  }

  query += ` ORDER BY 
    CASE ae.severity 
      WHEN 'CRITICAL' THEN 1 
      WHEN 'IMPACT' THEN 2 
      ELSE 3 
    END,
    ae.created_at DESC
  LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const { results } = await db.prepare(query).bind(...params).all();

  // Format time_ago and flags for each alert
  const now = Date.now();
  const alerts = results.map((alert: Record<string, unknown>) => {
    const createdAt = new Date(alert.created_at as string).getTime();
    const diffMs = now - createdAt;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let time_ago = "just now";
    if (diffDays > 0) {
      time_ago = `${diffDays}d ago`;
    } else if (diffHours > 0) {
      time_ago = `${diffHours}h ago`;
    } else if (diffMins > 0) {
      time_ago = `${diffMins}m ago`;
    }

    const title = typeof alert.title === "string"
      ? sanitizeCoachGText(alert.title)
      : typeof alert.headline === "string"
        ? sanitizeCoachGText(alert.headline)
        : "";
    const message = typeof alert.message === "string"
      ? sanitizeCoachGText(alert.message)
      : typeof alert.body === "string"
        ? sanitizeCoachGText(alert.body)
        : "";

    return {
      ...alert,
      title,
      headline: title || alert.headline,
      message,
      body: message || alert.body,
      time_ago,
      is_read: Boolean(alert.read_at),
      is_dismissed: Boolean(alert.dismissed_at),
    };
  });

  return c.json({ alerts });
});

/**
 * GET /api/alerts/counts
 * Get unread alert counts for badge display
 */
alertsRouter.get("/counts", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";

  const result = await db.prepare(`
    SELECT 
      COUNT(*) as total_unread,
      SUM(CASE WHEN severity = 'CRITICAL' THEN 1 ELSE 0 END) as critical_unread,
      SUM(CASE WHEN severity = 'IMPACT' THEN 1 ELSE 0 END) as impact_unread,
      SUM(CASE WHEN severity = 'INFO' THEN 1 ELSE 0 END) as info_unread
    FROM alert_events
    WHERE user_id = ? AND data_scope = ? AND read_at IS NULL AND dismissed_at IS NULL
  `).bind(user.id, scope).first<AlertCounts>();

  return c.json({
    total_unread: result?.total_unread || 0,
    critical_unread: result?.critical_unread || 0,
    impact_unread: result?.impact_unread || 0,
    info_unread: result?.info_unread || 0,
  });
});

/**
 * POST /api/alerts/events/:id/read
 * Mark an alert as read
 */
alertsRouter.post("/events/:id/read", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const alertId = c.req.param("id");

  await db.prepare(`
    UPDATE alert_events 
    SET read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(alertId, user.id).run();

  return c.json({ success: true });
});

/**
 * POST /api/alerts/events/:id/dismiss
 * Dismiss an alert
 */
alertsRouter.post("/events/:id/dismiss", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const alertId = c.req.param("id");

  await db.prepare(`
    UPDATE alert_events 
    SET dismissed_at = CURRENT_TIMESTAMP, read_at = COALESCE(read_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(alertId, user.id).run();

  return c.json({ success: true });
});

/**
 * POST /api/alerts/events/mark-all-read
 * Mark all alerts as read
 */
alertsRouter.post("/events/mark-all-read", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";

  await db.prepare(`
    UPDATE alert_events 
    SET read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND data_scope = ? AND read_at IS NULL
  `).bind(user.id, scope).run();

  return c.json({ success: true });
});

/**
 * POST /api/alerts/events/clear-read
 * Dismiss all read alerts
 */
alertsRouter.post("/events/clear-read", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";

  await db.prepare(`
    UPDATE alert_events 
    SET dismissed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND data_scope = ? AND read_at IS NOT NULL AND dismissed_at IS NULL
  `).bind(user.id, scope).run();

  return c.json({ success: true });
});

// =====================================================
// ALERT PREFERENCES
// =====================================================

/**
 * GET /api/alerts/preferences
 * Get user's alert preferences
 */
alertsRouter.get("/preferences", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;

  let prefs = await db.prepare(`
    SELECT * FROM alert_preferences WHERE user_id = ?
  `).bind(user.id).first();

  // Return defaults if no preferences set
  if (!prefs) {
    prefs = {
      user_id: user.id,
      is_enabled: 1,
      sensitivity: "CALM",
      severity_minimum: "IMPACT",
      channel_in_app: 1,
      channel_push: 0,
      channel_email: 0,
      channel_sms: 0,
      quiet_hours_enabled: 1,
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
      per_item_overrides_json: null,
    };
  }

  return c.json({
    ...prefs,
    is_enabled: Boolean(prefs.is_enabled),
    channel_in_app: Boolean(prefs.channel_in_app),
    channel_push: Boolean(prefs.channel_push),
    channel_email: Boolean(prefs.channel_email),
    channel_sms: Boolean(prefs.channel_sms),
    quiet_hours_enabled: Boolean(prefs.quiet_hours_enabled),
    per_item_overrides: prefs.per_item_overrides_json 
      ? JSON.parse(prefs.per_item_overrides_json as string) 
      : null,
  });
});

/**
 * PATCH /api/alerts/preferences
 * Update user's alert preferences
 */
alertsRouter.patch("/preferences", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const body = await c.req.json();

  // Check if preferences exist
  const existing = await db.prepare(`
    SELECT id FROM alert_preferences WHERE user_id = ?
  `).bind(user.id).first();

  if (existing) {
    // Build update query
    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (body.is_enabled !== undefined) {
      updates.push("is_enabled = ?");
      values.push(body.is_enabled ? 1 : 0);
    }
    if (body.sensitivity !== undefined) {
      updates.push("sensitivity = ?");
      values.push(body.sensitivity);
    }
    if (body.severity_minimum !== undefined) {
      updates.push("severity_minimum = ?");
      values.push(body.severity_minimum);
    }
    if (body.channel_in_app !== undefined) {
      updates.push("channel_in_app = ?");
      values.push(body.channel_in_app ? 1 : 0);
    }
    if (body.channel_push !== undefined) {
      updates.push("channel_push = ?");
      values.push(body.channel_push ? 1 : 0);
    }
    if (body.channel_email !== undefined) {
      updates.push("channel_email = ?");
      values.push(body.channel_email ? 1 : 0);
    }
    if (body.channel_sms !== undefined) {
      updates.push("channel_sms = ?");
      values.push(body.channel_sms ? 1 : 0);
    }
    if (body.quiet_hours_enabled !== undefined) {
      updates.push("quiet_hours_enabled = ?");
      values.push(body.quiet_hours_enabled ? 1 : 0);
    }
    if (body.quiet_hours_start !== undefined) {
      updates.push("quiet_hours_start = ?");
      values.push(body.quiet_hours_start);
    }
    if (body.quiet_hours_end !== undefined) {
      updates.push("quiet_hours_end = ?");
      values.push(body.quiet_hours_end);
    }
    if (body.per_item_overrides !== undefined) {
      updates.push("per_item_overrides_json = ?");
      values.push(body.per_item_overrides ? JSON.stringify(body.per_item_overrides) : "");
    }

    if (updates.length > 0) {
      updates.push("updated_at = CURRENT_TIMESTAMP");
      values.push(user.id);
      await db.prepare(`
        UPDATE alert_preferences SET ${updates.join(", ")} WHERE user_id = ?
      `).bind(...values).run();
    }
  } else {
    // Insert new preferences
    await db.prepare(`
      INSERT INTO alert_preferences (
        user_id, is_enabled, sensitivity, severity_minimum,
        channel_in_app, channel_push, channel_email, channel_sms,
        quiet_hours_enabled, quiet_hours_start, quiet_hours_end,
        per_item_overrides_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      user.id,
      body.is_enabled !== false ? 1 : 0,
      body.sensitivity || "CALM",
      body.severity_minimum || "IMPACT",
      body.channel_in_app !== false ? 1 : 0,
      body.channel_push ? 1 : 0,
      body.channel_email ? 1 : 0,
      body.channel_sms ? 1 : 0,
      body.quiet_hours_enabled !== false ? 1 : 0,
      body.quiet_hours_start || "22:00",
      body.quiet_hours_end || "07:00",
      body.per_item_overrides ? JSON.stringify(body.per_item_overrides) : null
    ).run();
  }

  return c.json({ success: true });
});

// =====================================================
// ALERT GENERATION (From Threshold Events)
// =====================================================

/**
 * POST /api/alerts/generate
 * Generate alerts from recent threshold events for the current user
 * Uses the comprehensive alert generation service
 */
alertsRouter.post("/generate", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";
  const lookbackMinutes = parseInt(c.req.query("lookback") || "60");

  const result = await generateAlertsFromThresholdEvents(db, scope, {
    lookbackMinutes,
    specificUserId: user.id,
  });

  return c.json({ 
    success: true, 
    alerts_created: result.alerts_created,
    events_processed: result.events_processed,
    dedupe_skipped: result.dedupe_skipped,
    preference_skipped: result.preference_skipped,
  });
});

/**
 * POST /api/alerts/generate-demo
 * Generate demo alerts with sample threshold events for testing
 */
alertsRouter.post("/generate-demo", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;

  // First, ensure user has at least one watchlist item for demo to work
  const watchlistCount = await db.prepare(`
    SELECT COUNT(*) as count FROM watchlist_items WHERE user_id = ?
  `).bind(user.id).first<{ count: number }>();

  // If no watchlist items, add default sports to follow
  if (!watchlistCount || watchlistCount.count === 0) {
    // Get or create default watchlist
    let watchlist = await db.prepare(`
      SELECT id FROM watchlists WHERE user_id = ? AND is_default = 1
    `).bind(user.id).first<{ id: number }>();

    if (!watchlist) {
      const result = await db.prepare(`
        INSERT INTO watchlists (user_id, name, is_default)
        VALUES (?, 'My Watchlist', 1)
      `).bind(user.id).run();
      watchlist = { id: Number(result.meta.last_row_id) };
    }

    // Add NFL and NBA as default follows for demo
    await db.prepare(`
      INSERT OR IGNORE INTO watchlist_items (watchlist_id, user_id, item_type, item_id, sport_type, display_name)
      VALUES (?, ?, 'SPORT', 'nfl', 'nfl', 'NFL')
    `).bind(watchlist.id, user.id).run();

    await db.prepare(`
      INSERT OR IGNORE INTO watchlist_items (watchlist_id, user_id, item_type, item_id, sport_type, display_name)
      VALUES (?, ?, 'SPORT', 'nba', 'nba', 'NBA')
    `).bind(watchlist.id, user.id).run();
  }

  const result = await generateDemoAlerts(db, user.id, "DEMO");

  return c.json({ 
    success: true, 
    alerts_created: result.alerts_created,
    threshold_events_created: result.threshold_events_created,
    message: "Demo alerts generated. View them in the Alert Center.",
  });
});

/**
 * POST /api/alerts/generate-batch
 * Generate alerts for all users (admin/cron endpoint)
 * This would typically be called by a scheduled worker
 */
alertsRouter.post("/generate-batch", async (c) => {
  // In production, this should be protected by an API key or internal auth
  const apiKey = c.req.header("X-Internal-API-Key");
  const envKey = (c.env as { INTERNAL_API_KEY?: string }).INTERNAL_API_KEY;
  if (apiKey !== envKey && envKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";
  const lookbackMinutes = parseInt(c.req.query("lookback") || "30");

  const result = await generateAlertsFromThresholdEvents(db, scope, {
    lookbackMinutes,
    maxEventsPerRun: 1000,
  });

  return c.json({ 
    success: true, 
    alerts_created: result.alerts_created,
    events_processed: result.events_processed,
    users_notified: result.users_notified.size,
    dedupe_skipped: result.dedupe_skipped,
    preference_skipped: result.preference_skipped,
  });
});

/**
 * POST /api/alerts/cleanup
 * Clean up old dismissed alerts (admin endpoint)
 */
alertsRouter.post("/cleanup", async (c) => {
  const apiKey = c.req.header("X-Internal-API-Key");
  const envKey = (c.env as { INTERNAL_API_KEY?: string }).INTERNAL_API_KEY;
  if (apiKey !== envKey && envKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = c.env.DB;
  const daysToKeep = parseInt(c.req.query("days") || "7");

  const result = await cleanupOldAlerts(db, daysToKeep);

  return c.json({ 
    success: true, 
    alerts_deleted: result.deleted,
  });
});

/**
 * GET /api/alerts/stats
 * Get alert generation statistics (for monitoring)
 */
alertsRouter.get("/stats", authMiddleware, async (c) => {
  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";

  const stats = await getAlertGenerationStats(db, scope);

  return c.json(stats);
});

export { alertsRouter };

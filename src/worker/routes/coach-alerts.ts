import { Hono } from "hono";
import type { Context } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import type { AlertCategory, AlertSeverity, ScoutAlertPreferences } from "@/shared/types/alerts";
import { sanitizeCoachGText } from "../services/coachgCompliance";

type AppBindings = { Bindings: Env };
type AppContext = Context<AppBindings>;

const coachAlertsRouter = new Hono<AppBindings>();

// Demo user ID for unauthenticated demo mode
const DEMO_USER_ID = "demo-user-001";

// Helper to get user ID (supports demo mode)
function getUserId(c: AppContext): string | null {
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) return DEMO_USER_ID;
  const user = c.get("user");
  return user?.id || null;
}

// Middleware that allows demo mode OR real auth
async function demoOrAuthMiddleware(c: AppContext, next: () => Promise<void>) {
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    await next();
    return;
  }
  await authMiddleware(c, next);
}

// =====================================================
// SCOUT ALERT PREFERENCES
// =====================================================

/**
 * GET /api/scout-alerts/preferences
 * Get user's Scout alert preferences
 */
coachAlertsRouter.get("/preferences", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;

  const prefs = await db.prepare(`
    SELECT * FROM scout_alert_preferences WHERE user_id = ?
  `).bind(userId).first();

  // Return defaults if no preferences set
  if (!prefs) {
    return c.json({
      userId,
      categoryLineMovement: true,
      categoryInjury: true,
      categoryWeather: true,
      categoryGameState: true,
      categorySchedule: true,
      lineMovementPoints: 0.5,
      weatherImpactMinimum: 3,
    });
  }

  return c.json({
    userId: prefs.user_id,
    categoryLineMovement: Boolean(prefs.category_line_movement),
    categoryInjury: Boolean(prefs.category_injury),
    categoryWeather: Boolean(prefs.category_weather),
    categoryGameState: Boolean(prefs.category_game_state),
    categorySchedule: Boolean(prefs.category_schedule),
    lineMovementPoints: prefs.line_movement_points,
    weatherImpactMinimum: prefs.weather_impact_minimum,
    createdAt: prefs.created_at,
    updatedAt: prefs.updated_at,
  });
});

/**
 * PATCH /api/scout-alerts/preferences
 * Update user's Scout alert preferences
 */
coachAlertsRouter.patch("/preferences", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const body = await c.req.json() as Partial<ScoutAlertPreferences>;

  const existing = await db.prepare(`
    SELECT id FROM scout_alert_preferences WHERE user_id = ?
  `).bind(userId).first();

  if (existing) {
    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (body.categoryLineMovement !== undefined) {
      updates.push("category_line_movement = ?");
      values.push(body.categoryLineMovement ? 1 : 0);
    }
    if (body.categoryInjury !== undefined) {
      updates.push("category_injury = ?");
      values.push(body.categoryInjury ? 1 : 0);
    }
    if (body.categoryWeather !== undefined) {
      updates.push("category_weather = ?");
      values.push(body.categoryWeather ? 1 : 0);
    }
    if (body.categoryGameState !== undefined) {
      updates.push("category_game_state = ?");
      values.push(body.categoryGameState ? 1 : 0);
    }
    if (body.categorySchedule !== undefined) {
      updates.push("category_schedule = ?");
      values.push(body.categorySchedule ? 1 : 0);
    }
    if (body.lineMovementPoints !== undefined) {
      updates.push("line_movement_points = ?");
      values.push(body.lineMovementPoints);
    }
    if (body.weatherImpactMinimum !== undefined) {
      updates.push("weather_impact_minimum = ?");
      values.push(body.weatherImpactMinimum);
    }

    if (updates.length > 0) {
      updates.push("updated_at = CURRENT_TIMESTAMP");
      values.push(userId);
      await db.prepare(`
        UPDATE scout_alert_preferences SET ${updates.join(", ")} WHERE user_id = ?
      `).bind(...values).run();
    }
  } else {
    await db.prepare(`
      INSERT INTO scout_alert_preferences (
        user_id, category_line_movement, category_injury, category_weather,
        category_game_state, category_schedule, line_movement_points, weather_impact_minimum
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      body.categoryLineMovement !== false ? 1 : 0,
      body.categoryInjury !== false ? 1 : 0,
      body.categoryWeather !== false ? 1 : 0,
      body.categoryGameState !== false ? 1 : 0,
      body.categorySchedule !== false ? 1 : 0,
      body.lineMovementPoints ?? 0.5,
      body.weatherImpactMinimum ?? 3
    ).run();
  }

  return c.json({ success: true });
});

// =====================================================
// SCOUT ALERTS (Read/Manage)
// =====================================================

interface ScoutAlertRow {
  id: number;
  data_scope: string;
  user_id: string;
  category: string;
  severity: string;
  headline: string;
  body: string | null;
  game_id: string | null;
  team_key: string | null;
  player_key: string | null;
  source_type: string | null;
  source_data_json: string | null;
  deep_link: string | null;
  dedupe_key: string;
  expires_at: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  action_taken: string | null;
  created_at: string;
  updated_at: string;
}

function normalizeCoachGHeadline(headline: string): string {
  const base = sanitizeCoachGText(String(headline || ""));
  if (base.toLowerCase().startsWith("coach g")) return base;
  return sanitizeCoachGText(`Coach G Insight: ${base}`);
}

function normalizeCoachGBody(body: string | null): string | null {
  if (!body) return null;
  const clean = sanitizeCoachGText(String(body));
  if (clean.toLowerCase().includes("informational only")) return clean;
  return sanitizeCoachGText(`${clean} Informational only for the G1 community.`);
}

/**
 * GET /api/scout-alerts
 * Get user's Scout alerts
 */
coachAlertsRouter.get("/", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";
  const category = c.req.query("category") as AlertCategory | undefined;
  const severity = c.req.query("severity") as AlertSeverity | undefined;
  const unreadOnly = c.req.query("unread_only") === "true";
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const offset = parseInt(c.req.query("offset") || "0");

  let query = `
    SELECT * FROM scout_alerts
    WHERE user_id = ? AND data_scope = ? AND dismissed_at IS NULL
    AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
  `;
  const params: (string | number)[] = [userId, scope];

  if (category) {
    query += ` AND category = ?`;
    params.push(category);
  }
  if (severity) {
    query += ` AND severity = ?`;
    params.push(severity);
  }
  if (unreadOnly) {
    query += ` AND read_at IS NULL`;
  }

  query += ` ORDER BY 
    CASE severity 
      WHEN 'CRITICAL' THEN 1 
      WHEN 'IMPACT' THEN 2 
      WHEN 'NOTICE' THEN 3
      ELSE 4 
    END,
    created_at DESC
  LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const { results } = await db.prepare(query).bind(...params).all();

  const alerts = (results as unknown as ScoutAlertRow[]).map(alert => ({
    id: alert.id,
    dataScope: alert.data_scope,
    userId: alert.user_id,
    category: alert.category,
    severity: alert.severity,
    headline: normalizeCoachGHeadline(alert.headline),
    body: normalizeCoachGBody(alert.body),
    gameId: alert.game_id,
    teamKey: alert.team_key,
    playerKey: alert.player_key,
    sourceType: alert.source_type,
    sourceData: alert.source_data_json ? JSON.parse(alert.source_data_json) : null,
    deepLink: alert.deep_link,
    dedupeKey: alert.dedupe_key,
    expiresAt: alert.expires_at,
    readAt: alert.read_at,
    dismissedAt: alert.dismissed_at,
    actionTaken: alert.action_taken,
    createdAt: alert.created_at,
    updatedAt: alert.updated_at,
    isRead: Boolean(alert.read_at),
    isDismissed: Boolean(alert.dismissed_at),
  }));

  return c.json({ alerts });
});

/**
 * GET /api/scout-alerts/counts
 * Get Scout alert counts by category
 */
coachAlertsRouter.get("/counts", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";

  const result = await db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) as total_unread,
      SUM(CASE WHEN category = 'LINE_MOVEMENT' AND read_at IS NULL THEN 1 ELSE 0 END) as line_movement_unread,
      SUM(CASE WHEN category = 'INJURY' AND read_at IS NULL THEN 1 ELSE 0 END) as injury_unread,
      SUM(CASE WHEN category = 'WEATHER' AND read_at IS NULL THEN 1 ELSE 0 END) as weather_unread,
      SUM(CASE WHEN category = 'GAME_STATE' AND read_at IS NULL THEN 1 ELSE 0 END) as game_state_unread,
      SUM(CASE WHEN category = 'SCHEDULE' AND read_at IS NULL THEN 1 ELSE 0 END) as schedule_unread,
      SUM(CASE WHEN severity = 'CRITICAL' AND read_at IS NULL THEN 1 ELSE 0 END) as critical_unread,
      SUM(CASE WHEN severity = 'IMPACT' AND read_at IS NULL THEN 1 ELSE 0 END) as impact_unread,
      SUM(CASE WHEN saved_at IS NOT NULL THEN 1 ELSE 0 END) as saved_count,
      SUM(CASE WHEN DATE(created_at) = DATE('now') THEN 1 ELSE 0 END) as today_count
    FROM scout_alerts
    WHERE user_id = ? AND data_scope = ? AND dismissed_at IS NULL
    AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
  `).bind(userId, scope).first();

  return c.json({
    total: result?.total || 0,
    totalUnread: result?.total_unread || 0,
    lineMovementUnread: result?.line_movement_unread || 0,
    injuryUnread: result?.injury_unread || 0,
    weatherUnread: result?.weather_unread || 0,
    gameStateUnread: result?.game_state_unread || 0,
    scheduleUnread: result?.schedule_unread || 0,
    criticalUnread: result?.critical_unread || 0,
    impactUnread: result?.impact_unread || 0,
    savedCount: result?.saved_count || 0,
    todayCount: result?.today_count || 0,
  });
});

/**
 * POST /api/scout-alerts/:id/read
 * Mark a Scout alert as read
 */
coachAlertsRouter.post("/:id/read", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const alertId = c.req.param("id");

  await db.prepare(`
    UPDATE scout_alerts 
    SET read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(alertId, userId).run();

  return c.json({ success: true });
});

/**
 * POST /api/scout-alerts/:id/dismiss
 * Dismiss a Scout alert
 */
coachAlertsRouter.post("/:id/dismiss", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const alertId = c.req.param("id");

  await db.prepare(`
    UPDATE scout_alerts 
    SET dismissed_at = CURRENT_TIMESTAMP, read_at = COALESCE(read_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(alertId, userId).run();

  return c.json({ success: true });
});

/**
 * POST /api/scout-alerts/:id/save
 * Save/bookmark a Scout alert
 */
coachAlertsRouter.post("/:id/save", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const alertId = c.req.param("id");

  await db.prepare(`
    UPDATE scout_alerts 
    SET saved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(alertId, userId).run();

  return c.json({ success: true });
});

/**
 * POST /api/scout-alerts/:id/unsave
 * Unsave/unbookmark a Scout alert
 */
coachAlertsRouter.post("/:id/unsave", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const alertId = c.req.param("id");

  await db.prepare(`
    UPDATE scout_alerts 
    SET saved_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(alertId, userId).run();

  return c.json({ success: true });
});

/**
 * POST /api/scout-alerts/mark-all-read
 * Mark all Scout alerts as read
 */
coachAlertsRouter.post("/mark-all-read", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";
  const category = c.req.query("category") as AlertCategory | undefined;

  let query = `
    UPDATE scout_alerts 
    SET read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND data_scope = ? AND read_at IS NULL
  `;
  const params: string[] = [userId, scope];

  if (category) {
    query += ` AND category = ?`;
    params.push(category);
  }

  await db.prepare(query).bind(...params).run();

  return c.json({ success: true });
});

/**
 * POST /api/scout-alerts/clear-dismissed
 * Delete all dismissed alerts (cleanup)
 */
coachAlertsRouter.post("/clear-dismissed", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";

  await db.prepare(`
    DELETE FROM scout_alerts 
    WHERE user_id = ? AND data_scope = ? AND dismissed_at IS NOT NULL
  `).bind(userId, scope).run();

  return c.json({ success: true });
});

// =====================================================
// DEMO ALERT GENERATION
// =====================================================

/**
 * POST /api/scout-alerts/generate-demo
 * Generate demo Scout alerts for testing
 */
coachAlertsRouter.post("/generate-demo", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = "DEMO";

  // Sample demo alerts
  const demoAlerts = [
    {
      category: "LINE_MOVEMENT",
      severity: "IMPACT",
      headline: "Coach G Insight: Chiefs -3.5 to -2.5 (1 point move)",
      body: "What's up G1. Significant line movement detected from -3.5 to -2.5 in the last 30 minutes. Something bettors will notice: books adjusted quickly to market pressure. Informational only.",
      gameId: "demo-kc-buf-001",
      sourceType: "ODDS_API",
      dedupeKey: `LINE_MOVEMENT:demo-kc-buf-001:SPREAD:${Date.now()}`,
    },
    {
      category: "INJURY",
      severity: "CRITICAL",
      headline: "Coach G Alert: Patrick Mahomes (QB) - Questionable",
      body: "Interesting matchup here. Star player status changed to Questionable with an ankle injury. Monitor usage redistribution before game time. Informational only.",
      teamKey: "KC",
      playerKey: "mahomes-patrick",
      sourceType: "INJURY_FEED",
      dedupeKey: `INJURY:mahomes-patrick:${Date.now()}`,
    },
    {
      category: "WEATHER",
      severity: "NOTICE",
      headline: "Coach G Insight: High winds expected (18mph) - Bills @ Dolphins",
      body: "What's up G1. Weather conditions may impact passing volume: 72F, wind 18mph NW, precipitation 10%. Something bettors will notice: downfield efficiency can shift. Informational only.",
      gameId: "demo-buf-mia-001",
      sourceType: "WEATHER_API",
      dedupeKey: `WEATHER:demo-buf-mia-001:${Date.now()}`,
    },
    {
      category: "GAME_STATE",
      severity: "INFO",
      headline: "Coach G Insight: Eagles vs Cowboys - Kickoff in 15 minutes",
      body: "What's up G1. Game is about to start and final injury reports are in. Watch opening pace and rotation signals early. Informational only.",
      gameId: "demo-phi-dal-001",
      sourceType: "LIVE_SCORES",
      dedupeKey: `GAME_STATE:demo-phi-dal-001:PREGAME:${Date.now()}`,
    },
    {
      category: "SCHEDULE",
      severity: "IMPACT",
      headline: "Coach G Insight: Pick deadline in 1 hour - NFL Week 14",
      body: "Reminder for the G1 community: pick deadline is 1:00 PM ET. Informational only.",
      sourceType: "SCHEDULE_API",
      dedupeKey: `SCHEDULE:NFL:WEEK14:LOCK:${Date.now()}`,
    },
    {
      category: "LINE_MOVEMENT",
      severity: "CRITICAL",
      headline: "Coach G Alert: Total moved 3.5 points (47.5 to 44)",
      body: "Interesting matchup here. Major total movement happened in a short window. Something bettors will notice: market expectations shifted toward lower scoring. Informational only.",
      gameId: "demo-sf-sea-001",
      sourceType: "ODDS_API",
      dedupeKey: `LINE_MOVEMENT:demo-sf-sea-001:TOTAL:${Date.now()}`,
    },
    {
      category: "INJURY",
      severity: "NOTICE",
      headline: "Coach G Insight: Tyreek Hill (WR) - Full Practice",
      body: "What's up G1. Player upgraded from Limited to Full Practice and is trending toward availability Sunday. Informational only.",
      teamKey: "MIA",
      playerKey: "hill-tyreek",
      sourceType: "INJURY_FEED",
      dedupeKey: `INJURY:hill-tyreek:${Date.now()}`,
    },
  ];

  let created = 0;
  for (const alert of demoAlerts) {
    await db.prepare(`
      INSERT INTO scout_alerts (
        data_scope, user_id, category, severity, headline, body,
        game_id, team_key, player_key, source_type, dedupe_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      scope,
      userId,
      alert.category,
      alert.severity,
      alert.headline,
      alert.body || null,
      alert.gameId || null,
      alert.teamKey || null,
      alert.playerKey || null,
      alert.sourceType || null,
      alert.dedupeKey
    ).run();
    created++;
  }

  return c.json({
    success: true,
    alertsCreated: created,
    message: "Demo Coach G alerts generated. View them in the Alert Center.",
  });
});

export { coachAlertsRouter };

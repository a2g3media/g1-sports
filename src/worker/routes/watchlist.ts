import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import type { LineAlert, WatchlistEntryWithOdds } from "@/shared/types";

type AppBindings = { Bindings: Env };

const watchlistRouter = new Hono<AppBindings>();

// Demo mode constants
const DEMO_USER_ID = "demo-user-001";

// Helper to get user ID (supports demo mode)
function getUserId(c: any): string | null {
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    return DEMO_USER_ID;
  }
  const user = c.get("user");
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

/**
 * GET /api/watchlist
 * Get user's watchlist with current odds and movement alerts
 */
watchlistRouter.get("/", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";
  const includeCompleted = c.req.query("include_completed") === "true";

  // Get watchlist entries
  let query = `
    SELECT * FROM game_watchlist 
    WHERE user_id = ? AND data_scope = ?
  `;
  
  if (!includeCompleted) {
    query += ` AND game_start_time > datetime('now', '-4 hours')`;
  }
  
  query += ` ORDER BY game_start_time ASC`;

  const { results: watchlist } = await db.prepare(query).bind(userId, scope).all();

  if (!watchlist.length) {
    return c.json({ entries: [] });
  }

  // Get current odds for all watched games
  const gameIds = watchlist.map((w: Record<string, unknown>) => w.game_id);
  const placeholders = gameIds.map(() => "?").join(",");
  
  const { results: currentOdds } = await db.prepare(`
    SELECT 
      game_id,
      market_key,
      outcome_key,
      line_value,
      price_american
    FROM odds_quotes 
    WHERE game_id IN (${placeholders}) AND data_scope = ?
    AND market_key IN ('SPREAD', 'TOTAL', 'MONEYLINE')
  `).bind(...gameIds, scope).all();

  // Build odds lookup by game
  const oddsMap = new Map<string, { spread?: Record<string, unknown>; total?: Record<string, unknown>; ml?: Record<string, unknown> }>();
  for (const quote of currentOdds as any[]) {
    if (!oddsMap.has(quote.game_id)) {
      oddsMap.set(quote.game_id, {});
    }
    const gameOdds = oddsMap.get(quote.game_id)!;
    
    if (quote.market_key === "SPREAD" && quote.outcome_key === "HOME") {
      gameOdds.spread = quote.line_value;
    } else if (quote.market_key === "TOTAL" && quote.outcome_key === "OVER") {
      gameOdds.total = quote.line_value;
    } else if (quote.market_key === "MONEYLINE" && quote.outcome_key === "HOME") {
      gameOdds.ml = quote.price_american;
    }
  }

  // Build entries with movement data
  const entries: WatchlistEntryWithOdds[] = (watchlist as Record<string, unknown>[]).map((entry) => {
    const gameId = entry.game_id as string;
    const odds = oddsMap.get(gameId) || {};
    const alerts: LineAlert[] = [];
    
    const initialSpread = entry.initial_spread as number | null;
    const initialTotal = entry.initial_total as number | null;
    const initialHomeMl = entry.initial_home_ml as number | null;
    const spreadThreshold = (entry.spread_alert_threshold as number) || 0.5;
    const totalThreshold = (entry.total_alert_threshold as number) || 1;
    const mlThreshold = (entry.ml_alert_threshold as number) || 15;
    
    // Calculate movements
    const currentSpread = odds.spread as number | undefined;
    const currentTotal = odds.total as number | undefined;
    const currentMl = odds.ml as number | undefined;
    
    const spreadMovement = currentSpread != null && initialSpread != null
      ? Number((currentSpread - initialSpread).toFixed(1))
      : null;
    
    const totalMovement = currentTotal != null && initialTotal != null
      ? Number((currentTotal - initialTotal).toFixed(1))
      : null;
    
    const mlMovement = currentMl != null && initialHomeMl != null
      ? currentMl - initialHomeMl
      : null;

    // Generate alerts based on thresholds
    if (entry.watch_spread && spreadMovement != null && Math.abs(spreadMovement) >= spreadThreshold) {
      const significance = Math.abs(spreadMovement) >= 2 ? "MAJOR" : Math.abs(spreadMovement) >= 1 ? "NOTABLE" : "MINOR";
      alerts.push({
        market: "SPREAD",
        direction: spreadMovement > 0 ? "UP" : "DOWN",
        old_value: initialSpread as number,
        new_value: currentSpread as number,
        change: spreadMovement,
        timestamp: new Date().toISOString(),
        significance,
      });
    }

    if (entry.watch_total && totalMovement != null && Math.abs(totalMovement) >= totalThreshold) {
      const significance = Math.abs(totalMovement) >= 2 ? "MAJOR" : Math.abs(totalMovement) >= 1 ? "NOTABLE" : "MINOR";
      alerts.push({
        market: "TOTAL",
        direction: totalMovement > 0 ? "UP" : "DOWN",
        old_value: initialTotal as number,
        new_value: currentTotal as number,
        change: totalMovement,
        timestamp: new Date().toISOString(),
        significance,
      });
    }

    if (entry.watch_moneyline && mlMovement != null && Math.abs(mlMovement) >= mlThreshold) {
      const significance = Math.abs(mlMovement) >= 30 ? "MAJOR" : Math.abs(mlMovement) >= 15 ? "NOTABLE" : "MINOR";
      alerts.push({
        market: "MONEYLINE",
        direction: mlMovement > 0 ? "UP" : "DOWN",
        old_value: initialHomeMl as number,
        new_value: currentMl as number,
        change: mlMovement,
        timestamp: new Date().toISOString(),
        significance,
      });
    }

    return {
      id: entry.id as number,
      user_id: entry.user_id as string,
      data_scope: entry.data_scope as string,
      game_id: gameId,
      sport_key: entry.sport_key as string,
      home_team: entry.home_team as string,
      away_team: entry.away_team as string,
      game_start_time: entry.game_start_time as string,
      watch_spread: Boolean(entry.watch_spread),
      watch_total: Boolean(entry.watch_total),
      watch_moneyline: Boolean(entry.watch_moneyline),
      spread_alert_threshold: spreadThreshold,
      total_alert_threshold: totalThreshold,
      ml_alert_threshold: mlThreshold,
      initial_spread: initialSpread,
      initial_total: initialTotal,
      initial_home_ml: initialHomeMl,
      has_unread_alert: alerts.length > 0 || Boolean(entry.has_unread_alert),
      last_alert_at: entry.last_alert_at as string | null,
      current_spread: currentSpread ?? null,
      current_total: currentTotal ?? null,
      current_home_ml: currentMl ?? null,
      spread_movement: spreadMovement,
      total_movement: totalMovement,
      ml_movement: mlMovement,
      alerts,
    };
  });

  // Count unread alerts
  const alertCount = entries.filter(e => e.alerts.length > 0).length;

  return c.json({ 
    entries,
    alert_count: alertCount,
    total_count: entries.length,
  });
});

/**
 * POST /api/watchlist
 * Add game to watchlist
 */
watchlistRouter.post("/", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";
  const body = await c.req.json();

  // Check if already watching
  const existing = await db.prepare(`
    SELECT id FROM game_watchlist 
    WHERE user_id = ? AND game_id = ? AND data_scope = ?
  `).bind(userId, body.game_id, scope).first();

  if (existing) {
    return c.json({ error: "Game already in watchlist" }, 400);
  }

  // Get current odds to set as initial values
  let initialSpread = body.initial_spread ?? null;
  let initialTotal = body.initial_total ?? null;
  let initialHomeMl = body.initial_home_ml ?? null;

  if (initialSpread === null || initialTotal === null || initialHomeMl === null) {
    const { results: currentOdds } = await db.prepare(`
      SELECT market_key, outcome_key, line_value, price_american
      FROM odds_quotes 
      WHERE game_id = ? AND data_scope = ?
      AND market_key IN ('SPREAD', 'TOTAL', 'MONEYLINE')
    `).bind(body.game_id, scope).all();

    for (const quote of currentOdds as any[]) {
      if (quote.market_key === "SPREAD" && quote.outcome_key === "HOME" && initialSpread === null) {
        initialSpread = quote.line_value;
      } else if (quote.market_key === "TOTAL" && quote.outcome_key === "OVER" && initialTotal === null) {
        initialTotal = quote.line_value;
      } else if (quote.market_key === "MONEYLINE" && quote.outcome_key === "HOME" && initialHomeMl === null) {
        initialHomeMl = quote.price_american;
      }
    }
  }

  // Insert watchlist entry
  const result = await db.prepare(`
    INSERT INTO game_watchlist (
      user_id, data_scope, game_id, sport_key, home_team, away_team, game_start_time,
      watch_spread, watch_total, watch_moneyline,
      initial_spread, initial_total, initial_home_ml
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId,
    scope,
    body.game_id,
    body.sport_key,
    body.home_team,
    body.away_team,
    body.game_start_time,
    body.watch_spread !== false ? 1 : 0,
    body.watch_total !== false ? 1 : 0,
    body.watch_moneyline !== false ? 1 : 0,
    initialSpread,
    initialTotal,
    initialHomeMl
  ).run();

  return c.json({ 
    success: true,
    id: result.meta.last_row_id,
    initial_spread: initialSpread,
    initial_total: initialTotal,
    initial_home_ml: initialHomeMl,
  });
});

/**
 * DELETE /api/watchlist/:id
 * Remove game from watchlist
 */
watchlistRouter.delete("/:id", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const id = c.req.param("id");

  await db.prepare(`
    DELETE FROM game_watchlist WHERE id = ? AND user_id = ?
  `).bind(id, userId).run();

  return c.json({ success: true });
});

/**
 * DELETE /api/watchlist/game/:gameId
 * Remove game from watchlist by game_id
 */
watchlistRouter.delete("/game/:gameId", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const gameId = c.req.param("gameId");
  const scope = c.req.query("scope") || "PROD";

  await db.prepare(`
    DELETE FROM game_watchlist WHERE game_id = ? AND user_id = ? AND data_scope = ?
  `).bind(gameId, userId, scope).run();

  return c.json({ success: true });
});

/**
 * PATCH /api/watchlist/:id
 * Update watchlist settings
 */
watchlistRouter.patch("/:id", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const id = c.req.param("id");
  const body = await c.req.json();

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (body.watch_spread !== undefined) {
    updates.push("watch_spread = ?");
    values.push(body.watch_spread ? 1 : 0);
  }
  if (body.watch_total !== undefined) {
    updates.push("watch_total = ?");
    values.push(body.watch_total ? 1 : 0);
  }
  if (body.watch_moneyline !== undefined) {
    updates.push("watch_moneyline = ?");
    values.push(body.watch_moneyline ? 1 : 0);
  }
  if (body.spread_alert_threshold !== undefined) {
    updates.push("spread_alert_threshold = ?");
    values.push(body.spread_alert_threshold);
  }
  if (body.total_alert_threshold !== undefined) {
    updates.push("total_alert_threshold = ?");
    values.push(body.total_alert_threshold);
  }
  if (body.ml_alert_threshold !== undefined) {
    updates.push("ml_alert_threshold = ?");
    values.push(body.ml_alert_threshold);
  }
  if (body.has_unread_alert !== undefined) {
    updates.push("has_unread_alert = ?");
    values.push(body.has_unread_alert ? 1 : 0);
  }

  if (updates.length === 0) {
    return c.json({ success: true });
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id, userId);

  await db.prepare(`
    UPDATE game_watchlist SET ${updates.join(", ")} WHERE id = ? AND user_id = ?
  `).bind(...values).run();

  return c.json({ success: true });
});

/**
 * POST /api/watchlist/mark-read
 * Mark all alerts as read
 */
watchlistRouter.post("/mark-read", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";

  await db.prepare(`
    UPDATE game_watchlist SET has_unread_alert = 0, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND data_scope = ?
  `).bind(userId, scope).run();

  return c.json({ success: true });
});

/**
 * GET /api/watchlist/check/:gameId
 * Check if a game is in the user's watchlist
 */
watchlistRouter.get("/check/:gameId", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const gameId = c.req.param("gameId");
  const scope = c.req.query("scope") || "PROD";

  const entry = await db.prepare(`
    SELECT id FROM game_watchlist 
    WHERE user_id = ? AND game_id = ? AND data_scope = ?
  `).bind(userId, gameId, scope).first();

  return c.json({ watching: Boolean(entry) });
});

/**
 * GET /api/watchlist/line-history/:gameId
 * Get line movement history for a specific game
 */
watchlistRouter.get("/line-history/:gameId", demoOrAuthMiddleware, async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const gameId = c.req.param("gameId");
  const scope = c.req.query("scope") || "PROD";
  const market = c.req.query("market") || "SPREAD";

  // Get opening line
  const opening = await db.prepare(`
    SELECT opening_line_value, opening_price_american, opened_at
    FROM odds_opening
    WHERE game_id = ? AND data_scope = ? AND market_key = ? AND outcome_key = 'HOME'
  `).bind(gameId, scope, market).first();

  // Get line history
  const { results: history } = await db.prepare(`
    SELECT 
      line_value,
      price_american,
      captured_at
    FROM odds_snapshots
    WHERE game_id = ? AND data_scope = ? AND market_key = ? 
    AND (outcome_key = 'HOME' OR outcome_key = 'OVER')
    ORDER BY captured_at ASC
  `).bind(gameId, scope, market).all();

  // Get current line
  const current = await db.prepare(`
    SELECT line_value, price_american, updated_at
    FROM odds_quotes
    WHERE game_id = ? AND data_scope = ? AND market_key = ? 
    AND (outcome_key = 'HOME' OR outcome_key = 'OVER')
  `).bind(gameId, scope, market).first();

  return c.json({
    opening: opening ? {
      line: opening.opening_line_value,
      price: opening.opening_price_american,
      timestamp: opening.opened_at,
    } : null,
    history: (history as any[]).map(h => ({
      line: h.line_value,
      price: h.price_american,
      timestamp: h.captured_at,
    })),
    current: current ? {
      line: (current as any).line_value,
      price: (current as any).price_american,
      timestamp: (current as any).updated_at,
    } : null,
  });
});

export { watchlistRouter };

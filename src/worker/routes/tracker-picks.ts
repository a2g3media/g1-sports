/**
 * Tracker Picks API Routes
 * 
 * Endpoints for personal picks tracking - create, list, update, grade picks.
 */

import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import { 
  CreateTrackerPickSchema, 
  GradeTrackerPickSchema,
  TrackerPicksQuerySchema,
  type TrackerPick,
  type TrackerStats,
} from "../../shared/types";

const trackerPicksRouter = new Hono<{ Bindings: Env }>();

// Helper: Convert American odds to decimal
function americanToDecimal(american: number): number {
  if (american > 0) {
    return 1 + (american / 100);
  } else {
    return 1 + (100 / Math.abs(american));
  }
}

// Helper: Calculate profit based on result and odds
function calculateProfit(
  stakeUnits: number,
  oddsDecimal: number,
  result: "WIN" | "LOSS" | "PUSH" | "VOID"
): number {
  switch (result) {
    case "WIN":
      return stakeUnits * (oddsDecimal - 1);
    case "LOSS":
      return -stakeUnits;
    case "PUSH":
    case "VOID":
      return 0;
  }
}

// ============ Pick CRUD Endpoints ============

/**
 * GET /api/tracker/picks
 * List user's picks with optional filters
 */
trackerPicksRouter.get("/picks", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";

  // Parse query params
  const query = TrackerPicksQuerySchema.safeParse({
    sport_key: c.req.query("sport_key"),
    pick_type: c.req.query("pick_type"),
    result: c.req.query("result"),
    start_date: c.req.query("start_date"),
    end_date: c.req.query("end_date"),
    limit: c.req.query("limit") ? parseInt(c.req.query("limit")!) : 50,
    offset: c.req.query("offset") ? parseInt(c.req.query("offset")!) : 0,
  });

  if (!query.success) {
    return c.json({ error: "Invalid query parameters", details: query.error.issues }, 400);
  }

  const { sport_key, pick_type, result, start_date, end_date, limit, offset } = query.data;

  // Build query
  let sql = `
    SELECT * FROM tracker_picks 
    WHERE user_id = ? AND data_scope = ?
  `;
  const params: (string | number)[] = [user.id, scope];

  if (sport_key) {
    sql += ` AND sport_key = ?`;
    params.push(sport_key);
  }
  if (pick_type) {
    sql += ` AND pick_type = ?`;
    params.push(pick_type);
  }
  if (result) {
    sql += ` AND result = ?`;
    params.push(result);
  }
  if (start_date) {
    sql += ` AND game_start_time >= ?`;
    params.push(start_date);
  }
  if (end_date) {
    sql += ` AND game_start_time <= ?`;
    params.push(end_date);
  }

  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const { results } = await db.prepare(sql).bind(...params).all();

  // Get total count for pagination
  let countSql = `
    SELECT COUNT(*) as total FROM tracker_picks 
    WHERE user_id = ? AND data_scope = ?
  `;
  const countParams: (string | number)[] = [user.id, scope];

  if (sport_key) {
    countSql += ` AND sport_key = ?`;
    countParams.push(sport_key);
  }
  if (pick_type) {
    countSql += ` AND pick_type = ?`;
    countParams.push(pick_type);
  }
  if (result) {
    countSql += ` AND result = ?`;
    countParams.push(result);
  }
  if (start_date) {
    countSql += ` AND game_start_time >= ?`;
    countParams.push(start_date);
  }
  if (end_date) {
    countSql += ` AND game_start_time <= ?`;
    countParams.push(end_date);
  }

  const countResult = await db.prepare(countSql).bind(...countParams).first<{ total: number }>();

  return c.json({
    picks: results,
    total: countResult?.total || 0,
    limit,
    offset,
  });
});

/**
 * GET /api/tracker/picks/:id
 * Get a single pick by ID
 */
trackerPicksRouter.get("/picks/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const pickId = c.req.param("id");
  const db = c.env.DB;

  const pick = await db.prepare(`
    SELECT * FROM tracker_picks WHERE id = ? AND user_id = ?
  `).bind(pickId, user.id).first();

  if (!pick) {
    return c.json({ error: "Pick not found" }, 404);
  }

  return c.json(pick);
});

/**
 * POST /api/tracker/picks
 * Create a new tracked pick
 */
trackerPicksRouter.post("/picks", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const body = await c.req.json();
  const scope = body.data_scope || "PROD";

  // Validate input
  const parsed = CreateTrackerPickSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid pick data", details: parsed.error.issues }, 400);
  }

  const data = parsed.data;

  // Calculate decimal odds
  const oddsDecimal = americanToDecimal(data.odds_american);

  // Insert pick
  const result = await db.prepare(`
    INSERT INTO tracker_picks (
      user_id, data_scope, game_id, sport_key, home_team, away_team,
      game_start_time, pick_type, pick_side, line_value, odds_american,
      odds_decimal, stake_units, stake_amount_cents, notes, result
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
  `).bind(
    user.id,
    scope,
    data.game_id,
    data.sport_key,
    data.home_team,
    data.away_team,
    data.game_start_time,
    data.pick_type,
    data.pick_side,
    data.line_value ?? null,
    data.odds_american,
    oddsDecimal,
    data.stake_units,
    data.stake_amount_cents ?? null,
    data.notes ?? null
  ).run();

  const pickId = result.meta.last_row_id;

  // Fetch the created pick
  const pick = await db.prepare(`
    SELECT * FROM tracker_picks WHERE id = ?
  `).bind(pickId).first();

  return c.json({ 
    success: true, 
    pick,
    message: "Pick tracked successfully" 
  }, 201);
});

/**
 * PATCH /api/tracker/picks/:id
 * Update a pick (before it's graded)
 */
trackerPicksRouter.patch("/picks/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const pickId = c.req.param("id");
  const db = c.env.DB;
  const body = await c.req.json();

  // Get existing pick
  const existing = await db.prepare(`
    SELECT * FROM tracker_picks WHERE id = ? AND user_id = ?
  `).bind(pickId, user.id).first<TrackerPick>();

  if (!existing) {
    return c.json({ error: "Pick not found" }, 404);
  }

  if (existing.is_graded) {
    return c.json({ error: "Cannot modify a graded pick" }, 400);
  }

  // Build update query
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (body.stake_units !== undefined) {
    updates.push("stake_units = ?");
    values.push(body.stake_units);
  }
  if (body.stake_amount_cents !== undefined) {
    updates.push("stake_amount_cents = ?");
    values.push(body.stake_amount_cents);
  }
  if (body.notes !== undefined) {
    updates.push("notes = ?");
    values.push(body.notes);
  }
  if (body.odds_american !== undefined) {
    updates.push("odds_american = ?");
    values.push(body.odds_american);
    updates.push("odds_decimal = ?");
    values.push(americanToDecimal(body.odds_american));
  }
  if (body.line_value !== undefined) {
    updates.push("line_value = ?");
    values.push(body.line_value);
  }

  if (updates.length === 0) {
    return c.json({ error: "No updates provided" }, 400);
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(pickId, user.id);

  await db.prepare(`
    UPDATE tracker_picks SET ${updates.join(", ")} WHERE id = ? AND user_id = ?
  `).bind(...values).run();

  // Fetch updated pick
  const pick = await db.prepare(`
    SELECT * FROM tracker_picks WHERE id = ?
  `).bind(pickId).first();

  return c.json({ success: true, pick });
});

/**
 * DELETE /api/tracker/picks/:id
 * Delete a pick
 */
trackerPicksRouter.delete("/picks/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const pickId = c.req.param("id");
  const db = c.env.DB;

  const existing = await db.prepare(`
    SELECT id FROM tracker_picks WHERE id = ? AND user_id = ?
  `).bind(pickId, user.id).first();

  if (!existing) {
    return c.json({ error: "Pick not found" }, 404);
  }

  await db.prepare(`
    DELETE FROM tracker_picks WHERE id = ? AND user_id = ?
  `).bind(pickId, user.id).run();

  return c.json({ success: true, message: "Pick deleted" });
});

// ============ Grading Endpoints ============

/**
 * POST /api/tracker/picks/:id/grade
 * Grade a pick with result
 */
trackerPicksRouter.post("/picks/:id/grade", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const pickId = c.req.param("id");
  const db = c.env.DB;
  const body = await c.req.json();

  // Validate input
  const parsed = GradeTrackerPickSchema.safeParse({ pick_id: parseInt(pickId), ...body });
  if (!parsed.success) {
    return c.json({ error: "Invalid grade data", details: parsed.error.issues }, 400);
  }

  const { result } = parsed.data;

  // Get existing pick
  const existing = await db.prepare(`
    SELECT * FROM tracker_picks WHERE id = ? AND user_id = ?
  `).bind(pickId, user.id).first<TrackerPick>();

  if (!existing) {
    return c.json({ error: "Pick not found" }, 404);
  }

  if (existing.is_graded) {
    return c.json({ error: "Pick already graded" }, 400);
  }

  // Calculate profit
  const profitUnits = calculateProfit(
    existing.stake_units,
    existing.odds_decimal,
    result
  );

  const profitCents = existing.stake_amount_cents
    ? Math.round(calculateProfit(existing.stake_amount_cents / 100, existing.odds_decimal, result) * 100)
    : null;

  const now = new Date().toISOString();

  // Update pick
  await db.prepare(`
    UPDATE tracker_picks 
    SET result = ?, result_profit_units = ?, result_profit_cents = ?, 
        is_graded = 1, graded_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(result, profitUnits, profitCents, now, pickId, user.id).run();

  // Fetch updated pick
  const pick = await db.prepare(`
    SELECT * FROM tracker_picks WHERE id = ?
  `).bind(pickId).first();

  return c.json({ success: true, pick });
});

/**
 * POST /api/tracker/picks/:id/ungrade
 * Remove grading from a pick (revert to PENDING)
 */
trackerPicksRouter.post("/picks/:id/ungrade", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const pickId = c.req.param("id");
  const db = c.env.DB;

  const existing = await db.prepare(`
    SELECT id, is_graded FROM tracker_picks WHERE id = ? AND user_id = ?
  `).bind(pickId, user.id).first<{ id: number; is_graded: number }>();

  if (!existing) {
    return c.json({ error: "Pick not found" }, 404);
  }

  if (!existing.is_graded) {
    return c.json({ error: "Pick is not graded" }, 400);
  }

  await db.prepare(`
    UPDATE tracker_picks 
    SET result = 'PENDING', result_profit_units = NULL, result_profit_cents = NULL,
        is_graded = 0, graded_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(pickId, user.id).run();

  const pick = await db.prepare(`
    SELECT * FROM tracker_picks WHERE id = ?
  `).bind(pickId).first();

  return c.json({ success: true, pick });
});

// ============ Stats Endpoints ============

/**
 * GET /api/tracker/stats
 * Get user's overall stats
 */
trackerPicksRouter.get("/stats", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";
  const sport_key = c.req.query("sport_key");
  const pick_type = c.req.query("pick_type");
  const start_date = c.req.query("start_date");
  const end_date = c.req.query("end_date");
  const days = c.req.query("days");

  // Build where clause
  let whereClause = `WHERE user_id = ? AND data_scope = ?`;
  const params: (string | number)[] = [user.id, scope];

  if (sport_key) {
    whereClause += ` AND sport_key = ?`;
    params.push(sport_key);
  }
  if (pick_type) {
    whereClause += ` AND pick_type = ?`;
    params.push(pick_type);
  }
  if (days) {
    whereClause += ` AND game_start_time >= DATE('now', '-' || ? || ' days')`;
    params.push(parseInt(days));
  } else if (start_date) {
    whereClause += ` AND game_start_time >= ?`;
    params.push(start_date);
  }
  if (end_date) {
    whereClause += ` AND game_start_time <= ?`;
    params.push(end_date);
  }

  // Get aggregate stats
  const statsResult = await db.prepare(`
    SELECT 
      COUNT(*) as total_picks,
      SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
      SUM(CASE WHEN result = 'PUSH' THEN 1 ELSE 0 END) as pushes,
      SUM(CASE WHEN result = 'PENDING' THEN 1 ELSE 0 END) as pending,
      SUM(stake_units) as units_wagered,
      SUM(CASE WHEN is_graded = 1 THEN result_profit_units ELSE 0 END) as units_profit
    FROM tracker_picks ${whereClause}
  `).bind(...params).first<{
    total_picks: number;
    wins: number;
    losses: number;
    pushes: number;
    pending: number;
    units_wagered: number;
    units_profit: number;
  }>();

  const stats = statsResult || {
    total_picks: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    pending: 0,
    units_wagered: 0,
    units_profit: 0,
  };

  // Calculate derived stats
  const decidedPicks = stats.wins + stats.losses;
  const winRate = decidedPicks > 0 ? (stats.wins / decidedPicks) * 100 : 0;
  const roi = stats.units_wagered > 0 
    ? (stats.units_profit / stats.units_wagered) * 100 
    : 0;

  // Get streak data (ordered by created_at)
  const { results: recentPicks } = await db.prepare(`
    SELECT result FROM tracker_picks 
    ${whereClause} AND is_graded = 1
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(...params).all();

  let currentStreak = 0;
  let bestStreak = 0;
  let worstStreak = 0;
  let tempWinStreak = 0;
  let tempLossStreak = 0;

  // Calculate current streak from most recent
  if (recentPicks.length > 0) {
    const firstResult = recentPicks[0].result;
    for (const pick of recentPicks) {
      if (pick.result === firstResult && (firstResult === "WIN" || firstResult === "LOSS")) {
        currentStreak++;
      } else {
        break;
      }
    }
    if (firstResult === "LOSS") currentStreak = -currentStreak;
  }

  // Calculate best/worst streaks
  for (const pick of recentPicks) {
    if (pick.result === "WIN") {
      tempWinStreak++;
      tempLossStreak = 0;
      bestStreak = Math.max(bestStreak, tempWinStreak);
    } else if (pick.result === "LOSS") {
      tempLossStreak++;
      tempWinStreak = 0;
      worstStreak = Math.max(worstStreak, tempLossStreak);
    }
  }

  const response: TrackerStats = {
    total_picks: stats.total_picks,
    wins: stats.wins,
    losses: stats.losses,
    pushes: stats.pushes,
    pending: stats.pending,
    win_rate: Math.round(winRate * 10) / 10,
    roi: Math.round(roi * 10) / 10,
    units_wagered: stats.units_wagered || 0,
    units_profit: Math.round((stats.units_profit || 0) * 100) / 100,
    current_streak: currentStreak,
    best_streak: bestStreak,
    worst_streak: -worstStreak,
  };

  return c.json(response);
});

/**
 * GET /api/tracker/stats/by-sport
 * Get stats broken down by sport
 */
trackerPicksRouter.get("/stats/by-sport", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";

  const { results } = await db.prepare(`
    SELECT 
      sport_key,
      COUNT(*) as total_picks,
      SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
      SUM(CASE WHEN result = 'PUSH' THEN 1 ELSE 0 END) as pushes,
      SUM(stake_units) as units_wagered,
      SUM(CASE WHEN is_graded = 1 THEN result_profit_units ELSE 0 END) as units_profit
    FROM tracker_picks 
    WHERE user_id = ? AND data_scope = ?
    GROUP BY sport_key
    ORDER BY total_picks DESC
  `).bind(user.id, scope).all();

  const sportStats = (results as Record<string, unknown>[]).map((row) => {
    const wins = Number(row.wins) || 0;
    const losses = Number(row.losses) || 0;
    const decidedPicks = wins + losses;
    const unitsWagered = Number(row.units_wagered) || 0;
    const unitsProfit = Number(row.units_profit) || 0;
    return {
      sport_key: row.sport_key,
      total_picks: row.total_picks,
      wins,
      losses,
      pushes: row.pushes,
      win_rate: decidedPicks > 0 ? Math.round((wins / decidedPicks) * 1000) / 10 : 0,
      units_wagered: unitsWagered,
      units_profit: Math.round(unitsProfit * 100) / 100,
      roi: unitsWagered > 0 
        ? Math.round((unitsProfit / unitsWagered) * 1000) / 10 
        : 0,
    };
  });

  return c.json({ sports: sportStats });
});

/**
 * GET /api/tracker/stats/by-type
 * Get stats broken down by pick type (spread, total, moneyline)
 */
trackerPicksRouter.get("/stats/by-type", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";

  const { results } = await db.prepare(`
    SELECT 
      pick_type,
      COUNT(*) as total_picks,
      SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
      SUM(CASE WHEN result = 'PUSH' THEN 1 ELSE 0 END) as pushes,
      SUM(stake_units) as units_wagered,
      SUM(CASE WHEN is_graded = 1 THEN result_profit_units ELSE 0 END) as units_profit
    FROM tracker_picks 
    WHERE user_id = ? AND data_scope = ?
    GROUP BY pick_type
    ORDER BY total_picks DESC
  `).bind(user.id, scope).all();

  const typeStats = (results as Record<string, unknown>[]).map((row) => {
    const wins = Number(row.wins) || 0;
    const losses = Number(row.losses) || 0;
    const decidedPicks = wins + losses;
    const unitsWagered = Number(row.units_wagered) || 0;
    const unitsProfit = Number(row.units_profit) || 0;
    return {
      pick_type: row.pick_type,
      total_picks: row.total_picks,
      wins,
      losses,
      pushes: row.pushes,
      win_rate: decidedPicks > 0 ? Math.round((wins / decidedPicks) * 1000) / 10 : 0,
      units_wagered: unitsWagered,
      units_profit: Math.round(unitsProfit * 100) / 100,
      roi: unitsWagered > 0 
        ? Math.round((unitsProfit / unitsWagered) * 1000) / 10 
        : 0,
    };
  });

  return c.json({ types: typeStats });
});

/**
 * GET /api/tracker/stats/daily
 * Get daily profit/loss for charting
 */
trackerPicksRouter.get("/stats/daily", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";
  const days = parseInt(c.req.query("days") || "30");

  const { results } = await db.prepare(`
    SELECT 
      DATE(game_start_time) as date,
      COUNT(*) as picks,
      SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
      SUM(CASE WHEN is_graded = 1 THEN result_profit_units ELSE 0 END) as profit
    FROM tracker_picks 
    WHERE user_id = ? AND data_scope = ? AND is_graded = 1
    AND game_start_time >= DATE('now', '-' || ? || ' days')
    GROUP BY DATE(game_start_time)
    ORDER BY date ASC
  `).bind(user.id, scope, days).all();

  // Calculate cumulative profit
  let cumulative = 0;
  const dailyData = (results as Record<string, unknown>[]).map((row) => {
    const profit = Number(row.profit) || 0;
    cumulative += profit;
    return {
      date: row.date,
      picks: row.picks,
      wins: row.wins,
      losses: row.losses,
      profit: Math.round(profit * 100) / 100,
      cumulative: Math.round(cumulative * 100) / 100,
    };
  });

  return c.json({ daily: dailyData });
});

/**
 * GET /api/tracker/stats/by-day
 * Get stats broken down by day of week
 */
trackerPicksRouter.get("/stats/by-day", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";
  const sport_key = c.req.query("sport_key");
  const pick_type = c.req.query("pick_type");
  const days = c.req.query("days");

  let whereClause = `WHERE user_id = ? AND data_scope = ? AND is_graded = 1`;
  const params: (string | number)[] = [user.id, scope];

  if (sport_key) {
    whereClause += ` AND sport_key = ?`;
    params.push(sport_key);
  }
  if (pick_type) {
    whereClause += ` AND pick_type = ?`;
    params.push(pick_type);
  }
  if (days) {
    whereClause += ` AND game_start_time >= DATE('now', '-' || ? || ' days')`;
    params.push(parseInt(days));
  }

  const { results } = await db.prepare(`
    SELECT 
      CAST(strftime('%w', game_start_time) AS INTEGER) as day_num,
      COUNT(*) as total_picks,
      SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
      SUM(stake_units) as units_wagered,
      SUM(CASE WHEN is_graded = 1 THEN result_profit_units ELSE 0 END) as units_profit
    FROM tracker_picks 
    ${whereClause}
    GROUP BY day_num
    ORDER BY day_num
  `).bind(...params).all();

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayStats = (results as Record<string, unknown>[]).map((row) => {
    const wins = Number(row.wins) || 0;
    const losses = Number(row.losses) || 0;
    const decidedPicks = wins + losses;
    const dayNum = Number(row.day_num) || 0;
    return {
      day: dayNames[dayNum],
      day_num: dayNum,
      total: row.total_picks,
      wins,
      losses,
      win_rate: decidedPicks > 0 ? Math.round((wins / decidedPicks) * 1000) / 10 : 0,
      profit: Math.round((Number(row.units_profit) || 0) * 100) / 100,
    };
  });

  return c.json({ days: dayStats });
});

/**
 * GET /api/tracker/stats/by-odds
 * Get stats broken down by odds range
 */
trackerPicksRouter.get("/stats/by-odds", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";
  const sport_key = c.req.query("sport_key");
  const pick_type = c.req.query("pick_type");
  const days = c.req.query("days");

  let whereClause = `WHERE user_id = ? AND data_scope = ? AND is_graded = 1`;
  const params: (string | number)[] = [user.id, scope];

  if (sport_key) {
    whereClause += ` AND sport_key = ?`;
    params.push(sport_key);
  }
  if (pick_type) {
    whereClause += ` AND pick_type = ?`;
    params.push(pick_type);
  }
  if (days) {
    whereClause += ` AND game_start_time >= DATE('now', '-' || ? || ' days')`;
    params.push(parseInt(days));
  }

  const { results } = await db.prepare(`
    SELECT 
      CASE 
        WHEN odds_american <= -200 THEN 'Heavy Fav'
        WHEN odds_american <= -150 THEN 'Favorite'
        WHEN odds_american <= -110 THEN 'Small Fav'
        WHEN odds_american <= 110 THEN 'Pickem'
        WHEN odds_american <= 150 THEN 'Small Dog'
        WHEN odds_american <= 200 THEN 'Underdog'
        ELSE 'Big Dog'
      END as odds_range,
      CASE 
        WHEN odds_american <= -200 THEN 1
        WHEN odds_american <= -150 THEN 2
        WHEN odds_american <= -110 THEN 3
        WHEN odds_american <= 110 THEN 4
        WHEN odds_american <= 150 THEN 5
        WHEN odds_american <= 200 THEN 6
        ELSE 7
      END as sort_order,
      AVG(odds_american) as avg_odds,
      COUNT(*) as total_picks,
      SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
      SUM(stake_units) as units_wagered,
      SUM(CASE WHEN is_graded = 1 THEN result_profit_units ELSE 0 END) as units_profit
    FROM tracker_picks 
    ${whereClause}
    GROUP BY odds_range, sort_order
    ORDER BY sort_order
  `).bind(...params).all();

  // Helper to calculate implied probability from American odds
  const getImpliedProb = (odds: number): number => {
    if (odds < 0) {
      return Math.abs(odds) / (Math.abs(odds) + 100) * 100;
    }
    return 100 / (odds + 100) * 100;
  };

  const oddsStats = (results as Record<string, unknown>[]).map((row) => {
    const wins = Number(row.wins) || 0;
    const losses = Number(row.losses) || 0;
    const decidedPicks = wins + losses;
    const winRate = decidedPicks > 0 ? (wins / decidedPicks) * 100 : 0;
    const expectedWinRate = getImpliedProb(Number(row.avg_odds) || 0);
    return {
      range: row.odds_range,
      total: row.total_picks,
      wins,
      losses,
      win_rate: Math.round(winRate * 10) / 10,
      expected_win_rate: Math.round(expectedWinRate * 10) / 10,
      edge: Math.round((winRate - expectedWinRate) * 10) / 10,
      profit: Math.round((Number(row.units_profit) || 0) * 100) / 100,
    };
  });

  return c.json({ odds: oddsStats });
});

/**
 * GET /api/tracker/stats/weekly
 * Get weekly stats for trend charting
 */
trackerPicksRouter.get("/stats/weekly", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";
  const weeks = parseInt(c.req.query("weeks") || "12");
  const sport_key = c.req.query("sport_key");
  const pick_type = c.req.query("pick_type");
  const days = c.req.query("days");

  // If days is specified, use that instead of weeks
  let whereClause: string;
  const params: (string | number)[] = [user.id, scope];
  
  if (days) {
    whereClause = `WHERE user_id = ? AND data_scope = ? AND is_graded = 1 AND game_start_time >= DATE('now', '-' || ? || ' days')`;
    params.push(parseInt(days));
  } else {
    whereClause = `WHERE user_id = ? AND data_scope = ? AND is_graded = 1 AND game_start_time >= DATE('now', '-' || ? || ' weeks')`;
    params.push(weeks);
  }

  if (sport_key) {
    whereClause += ` AND sport_key = ?`;
    params.push(sport_key);
  }
  if (pick_type) {
    whereClause += ` AND pick_type = ?`;
    params.push(pick_type);
  }

  const { results } = await db.prepare(`
    SELECT 
      strftime('%Y-W%W', game_start_time) as week,
      MIN(DATE(game_start_time)) as week_start,
      COUNT(*) as picks,
      SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
      SUM(stake_units) as units_wagered,
      SUM(CASE WHEN is_graded = 1 THEN result_profit_units ELSE 0 END) as profit
    FROM tracker_picks 
    ${whereClause}
    GROUP BY week
    ORDER BY week ASC
  `).bind(...params).all();

  // Calculate cumulative profit
  let cumulative = 0;
  let weekNum = 1;
  const weeklyData = (results as Record<string, unknown>[]).map((row) => {
    const profit = Number(row.profit) || 0;
    const wins = Number(row.wins) || 0;
    const losses = Number(row.losses) || 0;
    const unitsWagered = Number(row.units_wagered) || 0;
    cumulative += profit;
    const decidedWeekPicks = wins + losses;
    return {
      week: `Wk ${weekNum++}`,
      week_id: row.week,
      week_start: row.week_start,
      picks: row.picks,
      wins,
      losses,
      profit: Math.round(profit * 100) / 100,
      cumulative: Math.round(cumulative * 100) / 100,
      roi: unitsWagered > 0 
        ? Math.round((profit / unitsWagered) * 1000) / 10 
        : 0,
      win_rate: decidedWeekPicks > 0 ? Math.round((wins / decidedWeekPicks) * 1000) / 10 : 0,
    };
  });

  return c.json({ weeks: weeklyData });
});

/**
 * GET /api/tracker/stats/monthly
 * Get monthly stats for trend charting
 */
trackerPicksRouter.get("/stats/monthly", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";
  const months = parseInt(c.req.query("months") || "6");
  const sport_key = c.req.query("sport_key");
  const pick_type = c.req.query("pick_type");
  const days = c.req.query("days");

  // If days is specified, use that instead of months
  let whereClause: string;
  const params: (string | number)[] = [user.id, scope];
  
  if (days) {
    whereClause = `WHERE user_id = ? AND data_scope = ? AND is_graded = 1 AND game_start_time >= DATE('now', '-' || ? || ' days')`;
    params.push(parseInt(days));
  } else {
    whereClause = `WHERE user_id = ? AND data_scope = ? AND is_graded = 1 AND game_start_time >= DATE('now', '-' || ? || ' months')`;
    params.push(months);
  }

  if (sport_key) {
    whereClause += ` AND sport_key = ?`;
    params.push(sport_key);
  }
  if (pick_type) {
    whereClause += ` AND pick_type = ?`;
    params.push(pick_type);
  }

  const { results } = await db.prepare(`
    SELECT 
      strftime('%Y-%m', game_start_time) as month_id,
      strftime('%b', game_start_time) as month,
      COUNT(*) as picks,
      SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
      SUM(stake_units) as units_wagered,
      SUM(CASE WHEN is_graded = 1 THEN result_profit_units ELSE 0 END) as profit
    FROM tracker_picks 
    ${whereClause}
    GROUP BY month_id
    ORDER BY month_id ASC
  `).bind(...params).all();

  // Calculate cumulative profit
  let cumulative = 0;
  const monthlyData = (results as Record<string, unknown>[]).map((row) => {
    const profit = Number(row.profit) || 0;
    const wins = Number(row.wins) || 0;
    const losses = Number(row.losses) || 0;
    cumulative += profit;
    const decidedCount = wins + losses;
    return {
      month: row.month,
      month_id: row.month_id,
      picks: row.picks,
      wins,
      losses,
      profit: Math.round(profit * 100) / 100,
      cumulative: Math.round(cumulative * 100) / 100,
      win_rate: decidedCount > 0 ? Math.round((wins / decidedCount) * 1000) / 10 : 0,
    };
  });

  return c.json({ months: monthlyData });
});

/**
 * GET /api/tracker/stats/by-side
 * Get stats by pick side (home/away)
 */
trackerPicksRouter.get("/stats/by-side", authMiddleware, async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const db = c.env.DB;
  const scope = c.req.query("scope") || "PROD";
  const sport_key = c.req.query("sport_key");
  const pick_type = c.req.query("pick_type");
  const days = c.req.query("days");

  let whereClause = `WHERE user_id = ? AND data_scope = ? AND is_graded = 1`;
  const params: (string | number)[] = [user.id, scope];

  if (sport_key) {
    whereClause += ` AND sport_key = ?`;
    params.push(sport_key);
  }
  if (pick_type) {
    whereClause += ` AND pick_type = ?`;
    params.push(pick_type);
  }
  if (days) {
    whereClause += ` AND game_start_time >= DATE('now', '-' || ? || ' days')`;
    params.push(parseInt(days));
  }

  const { results } = await db.prepare(`
    SELECT 
      CASE 
        WHEN pick_side IN ('HOME', 'OVER') THEN 'home_over'
        ELSE 'away_under'
      END as side_group,
      pick_side,
      COUNT(*) as total_picks,
      SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses,
      SUM(CASE WHEN result = 'PUSH' THEN 1 ELSE 0 END) as pushes,
      SUM(stake_units) as units_wagered,
      SUM(CASE WHEN is_graded = 1 THEN result_profit_units ELSE 0 END) as units_profit
    FROM tracker_picks 
    ${whereClause}
    GROUP BY pick_side
    ORDER BY total_picks DESC
  `).bind(...params).all();

  // Aggregate into home/away categories
  const home = { wins: 0, losses: 0, pushes: 0, total: 0 };
  const away = { wins: 0, losses: 0, pushes: 0, total: 0 };

  (results as Record<string, unknown>[]).forEach((row) => {
    const target = (row.pick_side === 'HOME' || row.pick_side === 'OVER') ? home : away;
    target.wins += Number(row.wins) || 0;
    target.losses += Number(row.losses) || 0;
    target.pushes += Number(row.pushes) || 0;
    target.total += Number(row.total_picks) || 0;
  });

  const calcWinRate = (w: number, l: number) => {
    const total = w + l;
    return total > 0 ? Math.round((w / total) * 1000) / 10 : 0;
  };

  return c.json({
    home: { ...home, win_rate: calcWinRate(home.wins, home.losses) },
    away: { ...away, win_rate: calcWinRate(away.wins, away.losses) },
    details: (results as Record<string, unknown>[]).map((row) => {
      const wins = Number(row.wins) || 0;
      const losses = Number(row.losses) || 0;
      return {
        side: row.pick_side,
        total: row.total_picks,
        wins,
        losses,
        win_rate: calcWinRate(wins, losses),
      };
    }),
  });
});

export { trackerPicksRouter };

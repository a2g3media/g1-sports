/**
 * Live Watcher Status API
 * 
 * Provides real-time status about which games Scout is actively watching
 * for the current user.
 */

import { Hono } from "hono";

const app = new Hono<{
  Bindings: {
    DB: D1Database;
    MOCHA_USERS_SERVICE_API_URL: string;
    MOCHA_USERS_SERVICE_API_KEY: string;
  };
  Variables: {
    userId: string;
  };
}>();

// =====================================================
// TYPES
// =====================================================

interface WatchedGame {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  status: string;
  homeScore?: number;
  awayScore?: number;
  period?: string;
  isLive: boolean;
}

interface WatchingStatus {
  isWatching: boolean;
  totalGames: number;
  liveGames: number;
  upcomingGames: number;
  games: WatchedGame[];
}

// =====================================================
// HELPERS
// =====================================================

function isLiveStatus(status: string): boolean {
  const liveStatuses = ["IN_PROGRESS", "HALFTIME", "OVERTIME"];
  return liveStatuses.includes(status);
}

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /api/live-watcher/status
 * 
 * Get current Scout watching status for the user
 */
app.get("/status", async (c) => {
  const userId = c.get("userId");
  const scope = c.req.query("scope") || "PROD";

  try {
    // Get user's watched games from game_watchlist
    const watchlistResult = await c.env.DB.prepare(`
      SELECT 
        gw.game_id,
        gw.home_team,
        gw.away_team,
        gw.sport,
        gw.league,
        gw.game_status,
        gw.home_score,
        gw.away_score,
        gw.period
      FROM game_watchlist gw
      WHERE gw.user_id = ?
      AND gw.data_scope = ?
      ORDER BY 
        CASE gw.game_status
          WHEN 'IN_PROGRESS' THEN 1
          WHEN 'HALFTIME' THEN 2
          WHEN 'OVERTIME' THEN 3
          WHEN 'PREGAME' THEN 4
          WHEN 'SCHEDULED' THEN 5
          ELSE 6
        END,
        gw.created_at DESC
      LIMIT 50
    `).bind(userId, scope).all();

    const watchedGames: WatchedGame[] = (watchlistResult.results || []).map((row: any) => ({
      gameId: row.game_id,
      homeTeam: row.home_team,
      awayTeam: row.away_team,
      sport: row.sport,
      league: row.league,
      status: row.game_status,
      homeScore: row.home_score,
      awayScore: row.away_score,
      period: row.period,
      isLive: isLiveStatus(row.game_status),
    }));

    const liveGames = watchedGames.filter((g) => g.isLive);
    const upcomingGames = watchedGames.filter((g) => !g.isLive);

    const status: WatchingStatus = {
      isWatching: watchedGames.length > 0,
      totalGames: watchedGames.length,
      liveGames: liveGames.length,
      upcomingGames: upcomingGames.length,
      games: watchedGames,
    };

    return c.json(status);
  } catch (error) {
    console.error("Failed to fetch Scout watching status:", error);
    return c.json(
      { error: "Failed to fetch watching status" },
      500
    );
  }
});

/**
 * GET /api/live-watcher/games
 * 
 * Get detailed list of watched games
 */
app.get("/games", async (c) => {
  const userId = c.get("userId");
  const scope = c.req.query("scope") || "PROD";
  const filter = c.req.query("filter"); // "live" | "upcoming" | "all"

  try {
    let query = `
      SELECT 
        gw.game_id,
        gw.home_team,
        gw.away_team,
        gw.sport,
        gw.league,
        gw.game_status,
        gw.home_score,
        gw.away_score,
        gw.period,
        gw.created_at
      FROM game_watchlist gw
      WHERE gw.user_id = ?
      AND gw.data_scope = ?
    `;

    if (filter === "live") {
      query += ` AND gw.game_status IN ('IN_PROGRESS', 'HALFTIME', 'OVERTIME')`;
    } else if (filter === "upcoming") {
      query += ` AND gw.game_status IN ('SCHEDULED', 'PREGAME')`;
    }

    query += `
      ORDER BY 
        CASE gw.game_status
          WHEN 'IN_PROGRESS' THEN 1
          WHEN 'HALFTIME' THEN 2
          WHEN 'OVERTIME' THEN 3
          WHEN 'PREGAME' THEN 4
          WHEN 'SCHEDULED' THEN 5
          ELSE 6
        END,
        gw.created_at DESC
      LIMIT 100
    `;

    const result = await c.env.DB.prepare(query).bind(userId, scope).all();

    const games: WatchedGame[] = (result.results || []).map((row: any) => ({
      gameId: row.game_id,
      homeTeam: row.home_team,
      awayTeam: row.away_team,
      sport: row.sport,
      league: row.league,
      status: row.game_status,
      homeScore: row.home_score,
      awayScore: row.away_score,
      period: row.period,
      isLive: isLiveStatus(row.game_status),
    }));

    return c.json({ games });
  } catch (error) {
    console.error("Failed to fetch watched games:", error);
    return c.json(
      { error: "Failed to fetch watched games" },
      500
    );
  }
});

export default app;

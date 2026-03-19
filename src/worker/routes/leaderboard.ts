/**
 * Leaderboard API Routes
 * 
 * Provides endpoints for leaderboard data and privacy settings.
 * Does NOT modify any scoring or pick logic.
 */

import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import {
  getGlobalLeaderboard,
  getLeagueLeaderboard,
  getWeeklyTopPerformers,
  isUserLeaderboardVisible,
  setUserLeaderboardVisibility,
} from "../services/leaderboardService";

type Env = {
  DB: D1Database;
  MOCHA_USERS_SERVICE_API_URL: string;
  MOCHA_USERS_SERVICE_API_KEY: string;
};

const app = new Hono<{ Bindings: Env }>();

// Demo leaderboard data for unauthenticated users
const DEMO_LEADERBOARD = {
  entries: [
    { rank: 1, userId: "demo-1", displayName: "ChampionPicker", avatarUrl: null, stats: { totalPicks: 245, correctPicks: 178, winPercentage: 72.7, currentStreak: 8, bestStreak: 15, roi: 18.4, unitsWon: 42.5 } },
    { rank: 2, userId: "demo-2", displayName: "SharpShooter", avatarUrl: null, stats: { totalPicks: 312, correctPicks: 219, winPercentage: 70.2, currentStreak: 5, bestStreak: 12, roi: 15.2, unitsWon: 38.1 } },
    { rank: 3, userId: "demo-3", displayName: "OddsKing", avatarUrl: null, stats: { totalPicks: 189, correctPicks: 130, winPercentage: 68.8, currentStreak: 3, bestStreak: 11, roi: 12.6, unitsWon: 28.4 } },
    { rank: 4, userId: "demo-4", displayName: "ValueHunter", avatarUrl: null, stats: { totalPicks: 278, correctPicks: 189, winPercentage: 68.0, currentStreak: 0, bestStreak: 9, roi: 11.1, unitsWon: 25.2 } },
    { rank: 5, userId: "demo-5", displayName: "StatsMaster", avatarUrl: null, stats: { totalPicks: 201, correctPicks: 135, winPercentage: 67.2, currentStreak: 4, bestStreak: 10, roi: 9.8, unitsWon: 21.8 } },
    { rank: 6, userId: "demo-6", displayName: "ClutchPlayer", avatarUrl: null, stats: { totalPicks: 156, correctPicks: 103, winPercentage: 66.0, currentStreak: 2, bestStreak: 8, roi: 8.4, unitsWon: 18.2 } },
    { rank: 7, userId: "demo-7", displayName: "TrendWatcher", avatarUrl: null, stats: { totalPicks: 234, correctPicks: 152, winPercentage: 65.0, currentStreak: 1, bestStreak: 7, roi: 7.2, unitsWon: 15.4 } },
    { rank: 8, userId: "demo-8", displayName: "UnderdogPro", avatarUrl: null, stats: { totalPicks: 167, correctPicks: 107, winPercentage: 64.1, currentStreak: 0, bestStreak: 6, roi: 5.9, unitsWon: 12.1 } },
    { rank: 9, userId: "demo-9", displayName: "LineMover", avatarUrl: null, stats: { totalPicks: 198, correctPicks: 125, winPercentage: 63.1, currentStreak: 3, bestStreak: 8, roi: 4.8, unitsWon: 9.8 } },
    { rank: 10, userId: "demo-10", displayName: "FadeKing", avatarUrl: null, stats: { totalPicks: 145, correctPicks: 90, winPercentage: 62.1, currentStreak: 0, bestStreak: 5, roi: 3.5, unitsWon: 7.2 } },
  ],
  currentUserEntry: { rank: 42, userId: "demo-user", displayName: "You", avatarUrl: null, stats: { totalPicks: 24, correctPicks: 14, winPercentage: 58.3, currentStreak: 2, bestStreak: 4, roi: 2.1, unitsWon: 3.8 }, isCurrentUser: true },
  totalParticipants: 1247,
  lastUpdated: new Date().toISOString(),
  period: "all_time" as const,
};

/**
 * GET /api/leaderboard
 * Get global leaderboard (returns demo data in demo mode)
 */
app.get("/", async (c) => {
  const db = c.env.DB;
  const period = c.req.query("period") as 'all_time' | 'weekly' | 'monthly' || 'all_time';
  const sportKey = c.req.query("sport");
  const limit = parseInt(c.req.query("limit") || "50");

  // Check for authorization header - if none, return demo data
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    return c.json({ ...DEMO_LEADERBOARD, period });
  }

  // Try to verify the user
  try {
    const apiUrl = c.env.MOCHA_USERS_SERVICE_API_URL;
    const apiKey = c.env.MOCHA_USERS_SERVICE_API_KEY;
    
    const response = await fetch(`${apiUrl}/verify`, {
      headers: {
        Authorization: authHeader,
        "X-API-Key": apiKey,
      },
    });

    if (!response.ok) {
      return c.json({ ...DEMO_LEADERBOARD, period });
    }

    const user = await response.json() as { id: string };
    
    const leaderboard = await getGlobalLeaderboard(db, String(user.id), {
      period,
      sportKey,
      limit: Math.min(limit, 100),
    });

    return c.json(leaderboard);
  } catch (error) {
    console.error("Error fetching global leaderboard:", error);
    // Fall back to demo data on error
    return c.json({ ...DEMO_LEADERBOARD, period });
  }
});

/**
 * GET /api/leaderboard/weekly-top
 * Get weekly top performers (for badges/highlights)
 */
app.get("/weekly-top", async (c) => {
  const db = c.env.DB;
  const limit = parseInt(c.req.query("limit") || "3");

  try {
    const topPerformers = await getWeeklyTopPerformers(db, Math.min(limit, 10));
    return c.json({ topPerformers });
  } catch (error) {
    console.error("Error fetching weekly top performers:", error);
    // Return demo top performers on error
    return c.json({ topPerformers: DEMO_LEADERBOARD.entries.slice(0, limit) });
  }
});

/**
 * GET /api/leaderboard/league/:leagueId
 * Get league-specific leaderboard
 */
app.get("/league/:leagueId", authMiddleware, async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const leagueId = parseInt(c.req.param("leagueId"));
  
  if (isNaN(leagueId)) {
    return c.json({ error: "Invalid league ID" }, 400);
  }

  const period = c.req.query("period") as 'all_time' | 'weekly' | 'monthly' || 'all_time';
  const limit = parseInt(c.req.query("limit") || "50");

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Verify user is member of league
    const membership = await db
      .prepare(
        `SELECT id FROM league_members WHERE league_id = ? AND user_id = ?`
      )
      .bind(leagueId, user.id)
      .first();

    if (!membership) {
      return c.json({ error: "Not a member of this league" }, 403);
    }

    const leaderboard = await getLeagueLeaderboard(
      db,
      leagueId,
      String(user.id),
      { period, limit: Math.min(limit, 100) }
    );

    return c.json(leaderboard);
  } catch (error) {
    console.error("Error fetching league leaderboard:", error);
    return c.json({ error: "Failed to fetch leaderboard" }, 500);
  }
});

/**
 * GET /api/leaderboard/privacy
 * Get user's leaderboard visibility setting
 */
app.get("/privacy", authMiddleware, async (c) => {
  const db = c.env.DB;
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const isVisible = await isUserLeaderboardVisible(db, String(user.id));
    return c.json({ visible: isVisible });
  } catch (error) {
    console.error("Error fetching privacy setting:", error);
    return c.json({ error: "Failed to fetch privacy setting" }, 500);
  }
});

/**
 * PUT /api/leaderboard/privacy
 * Update user's leaderboard visibility setting
 */
app.put("/privacy", authMiddleware, async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const body = await c.req.json<{ visible: boolean }>();
  
  if (typeof body.visible !== "boolean") {
    return c.json({ error: "visible must be a boolean" }, 400);
  }

  try {
    await setUserLeaderboardVisibility(db, String(user.id), body.visible);
    return c.json({ success: true, visible: body.visible });
  } catch (error) {
    console.error("Error updating privacy setting:", error);
    return c.json({ error: "Failed to update privacy setting" }, 500);
  }
});

export default app;

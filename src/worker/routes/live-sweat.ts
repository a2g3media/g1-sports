import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";

type Env = {
  DB: D1Database;
  [key: string]: unknown;
};

type MochaUser = {
  id: string;
  email: string;
  display_name: string | null;
};

type Variables = {
  user: MochaUser;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Demo mode middleware for live sweat
const DEMO_USER_ID = "demo_user_123";

const liveSweatDemoOrAuthMiddleware = async (
  c: { req: { header: (name: string) => string | undefined }; set: (key: string, value: MochaUser) => void },
  next: () => Promise<void>,
  authMiddlewareFn: typeof authMiddleware
) => {
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";
  if (isDemoMode) {
    c.set("user", {
      id: DEMO_USER_ID,
      email: "demo@example.com",
      display_name: "Demo User",
      is_new_user: false,
      google_sub: "demo_google_sub",
      google_user_data: { email: "demo@example.com", email_verified: true, sub: "demo_google_sub" },
      last_signed_in_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as MochaUser);
    return next();
  }
  return authMiddlewareFn(c as any, next);
};

// GET /api/live-sweat/:leagueId - Get live sweat data for a survivor pool
app.get("/:leagueId", async (c, next) => {
  return liveSweatDemoOrAuthMiddleware(c, next, authMiddleware);
}, async (c) => {
  const leagueId = parseInt(c.req.param("leagueId"), 10);
  const period = c.req.query("period") || "current";
  const user = c.get("user");
  const db = c.env.DB;
  const isDemoMode = c.req.header("X-Demo-Mode") === "true";

  try {
    // Get league info
    const league = await db
      .prepare("SELECT * FROM leagues WHERE id = ?")
      .bind(leagueId)
      .first();

    if (!league) {
      return c.json({ error: "League not found" }, 404);
    }

    // Check if user is a member
    if (!isDemoMode) {
      const membership = await db
        .prepare("SELECT * FROM league_members WHERE league_id = ? AND user_id = ?")
        .bind(leagueId, user.id)
        .first();

      if (!membership) {
        return c.json({ error: "Not a member of this pool" }, 403);
      }
    }

    // Get current period's picks for this league
    const periodId = period === "current" ? await getCurrentPeriod(db, String(league.sport_key)) : period;

    // Get all picks for this period with user info
    const picksQuery = await db
      .prepare(`
        SELECT 
          p.id,
          p.user_id,
          p.event_id,
          p.pick_value,
          p.period_id,
          COALESCE(u.display_name, 'Anonymous') as display_name,
          u.avatar_url
        FROM picks p
        LEFT JOIN users u ON u.id = p.user_id
        WHERE p.league_id = ? AND p.period_id = ?
      `)
      .bind(leagueId, periodId)
      .all();

    const picks = picksQuery.results || [];

    if (picks.length === 0) {
      return c.json({ games: [], period: periodId });
    }

    // Get unique event IDs from picks
    const eventIds = [...new Set(picks.map((p: any) => p.event_id))];

    // Get events for these picks
    const eventsPlaceholders = eventIds.map(() => "?").join(",");
    const eventsQuery = await db
      .prepare(`
        SELECT * FROM events WHERE id IN (${eventsPlaceholders})
      `)
      .bind(...eventIds)
      .all();

    const events = eventsQuery.results || [];

    // Build the live sweat games using event data
    const liveSweatGames = buildLiveSweatGames(events, picks);

    // Filter to only games where at least one pool member has a pick
    const gamesWithPicks = liveSweatGames.filter(
      g => g.awayPickers.length > 0 || g.homePickers.length > 0
    );

    return c.json({
      games: gamesWithPicks,
      period: periodId,
      totalPicks: picks.length,
      totalMembers: [...new Set(picks.map((p: any) => p.user_id))].length,
    });
  } catch (error) {
    console.error("Live sweat error:", error);
    return c.json({ error: "Failed to fetch live sweat data" }, 500);
  }
});

// Helper: Get current period based on sport
async function getCurrentPeriod(_db: D1Database, sportKey: string): Promise<string> {
  const now = new Date();
  
  // For NFL, calculate the current week
  if (sportKey.includes("nfl") || sportKey.includes("ncaaf")) {
    // NFL season typically starts early September
    const seasonStart = new Date(now.getFullYear(), 8, 1); // Sept 1
    if (now < seasonStart) {
      return "week_1";
    }
    const weekNum = Math.min(18, Math.max(1, Math.ceil((now.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000))));
    return `week_${weekNum}`;
  }
  
  // Default to date-based period
  return now.toISOString().split("T")[0];
}

// Helper: Build live sweat game objects
function buildLiveSweatGames(events: any[], picks: any[]): any[] {
  const games: any[] = [];
  
  for (const event of events) {
    // Use event data for scores
    const status = event.status || "SCHEDULED";
    const homeScore = event.home_score ?? 0;
    const awayScore = event.away_score ?? 0;
    const period = event.status || "";
    const clock = "";
    
    // Map status
    const gameStatus = status === "IN_PROGRESS" ? "IN_PROGRESS" :
                       status === "FINAL" || status === "COMPLETED" ? "FINAL" :
                       "SCHEDULED";
    
    // Get picks for this event
    const eventPicks = picks.filter((p: any) => p.event_id === event.id);
    
    // Determine which team each pick is for
    const awayTeamName = event.away_team || "";
    const homeTeamName = event.home_team || "";
    
    const isTied = homeScore === awayScore;
    
    const awayPickers = eventPicks
      .filter((p: any) => {
        const pickValue = String(p.pick_value).toLowerCase();
        return pickValue.includes(awayTeamName.toLowerCase()) ||
               pickValue === "away" ||
               awayTeamName.toLowerCase().includes(pickValue);
      })
      .map((p: any) => ({
        userId: String(p.user_id),
        displayName: p.display_name || "Anonymous",
        avatarUrl: p.avatar_url,
        status: getPlayerStatus(gameStatus, homeScore < awayScore, isTied),
      }));
    
    const homePickers = eventPicks
      .filter((p: any) => {
        const pickValue = String(p.pick_value).toLowerCase();
        return pickValue.includes(homeTeamName.toLowerCase()) ||
               pickValue === "home" ||
               homeTeamName.toLowerCase().includes(pickValue);
      })
      .map((p: any) => ({
        userId: String(p.user_id),
        displayName: p.display_name || "Anonymous",
        avatarUrl: p.avatar_url,
        status: getPlayerStatus(gameStatus, homeScore > awayScore, isTied),
      }));
    
    // Only include games with at least one pick
    if (awayPickers.length > 0 || homePickers.length > 0) {
      games.push({
        gameId: `event_${event.id}`,
        sport: event.sport_key || "",
        status: gameStatus,
        period: mapPeriodLabel(period, gameStatus),
        clock,
        awayTeam: {
          name: awayTeamName,
          abbr: getTeamAbbr(awayTeamName),
          score: awayScore,
        },
        homeTeam: {
          name: homeTeamName,
          abbr: getTeamAbbr(homeTeamName),
          score: homeScore,
        },
        awayPickers,
        homePickers,
      });
    }
  }
  
  return games;
}

// Helper: Get player status based on game state
function getPlayerStatus(gameStatus: string, isTeamWinning: boolean, isTied: boolean): string {
  if (gameStatus === "FINAL") {
    // Ties in NFL go to OT, so a true final tie is rare but show as safe
    return isTied ? "SAFE" : (isTeamWinning ? "SAFE" : "ELIMINATED");
  }
  if (gameStatus === "IN_PROGRESS") {
    if (isTied) return "TIED";
    return isTeamWinning ? "WINNING" : "AT_RISK";
  }
  return "SAFE";
}

// Helper: Map period to display label
function mapPeriodLabel(period: string, status: string): string {
  if (status === "FINAL") return "Final";
  if (!period) return "";
  
  // NFL/NCAA Football
  if (period === "1" || period === "Q1") return "1st Quarter";
  if (period === "2" || period === "Q2") return "2nd Quarter";
  if (period === "3" || period === "Q3") return "3rd Quarter";
  if (period === "4" || period === "Q4") return "4th Quarter";
  if (period === "OT") return "Overtime";
  
  // NBA
  if (period === "Half") return "Halftime";
  
  return period;
}

// Helper: Get team abbreviation from name
function getTeamAbbr(teamName: string): string {
  const abbrs: Record<string, string> = {
    // NFL
    "Buffalo Bills": "BUF",
    "Miami Dolphins": "MIA",
    "New England Patriots": "NE",
    "New York Jets": "NYJ",
    "Baltimore Ravens": "BAL",
    "Cincinnati Bengals": "CIN",
    "Cleveland Browns": "CLE",
    "Pittsburgh Steelers": "PIT",
    "Houston Texans": "HOU",
    "Indianapolis Colts": "IND",
    "Jacksonville Jaguars": "JAX",
    "Tennessee Titans": "TEN",
    "Denver Broncos": "DEN",
    "Kansas City Chiefs": "KC",
    "Las Vegas Raiders": "LV",
    "Los Angeles Chargers": "LAC",
    "Dallas Cowboys": "DAL",
    "New York Giants": "NYG",
    "Philadelphia Eagles": "PHI",
    "Washington Commanders": "WSH",
    "Chicago Bears": "CHI",
    "Detroit Lions": "DET",
    "Green Bay Packers": "GB",
    "Minnesota Vikings": "MIN",
    "Atlanta Falcons": "ATL",
    "Carolina Panthers": "CAR",
    "New Orleans Saints": "NO",
    "Tampa Bay Buccaneers": "TB",
    "Arizona Cardinals": "ARI",
    "Los Angeles Rams": "LAR",
    "San Francisco 49ers": "SF",
    "Seattle Seahawks": "SEA",
  };
  
  return abbrs[teamName] || teamName.substring(0, 3).toUpperCase();
}

export default app;

/**
 * Sports API Routes
 * 
 * Dedicated endpoints for live sports data with server-side caching.
 * Provides a cleaner API for frontend polling with optimal cache headers.
 */

import { Hono } from "hono";
import {
  fetchLiveGamesWithFallback,
  type SportKey,
} from "../services/providers";
import {
  getCached,
  setCached,
  cacheKey,
  CACHE_TTL,
  cacheHeaders,
  generateEtag,
} from "../services/responseCache";
import type { Game } from "../../shared/types";

const sportsRouter = new Hono<{ Bindings: Env }>();

const SUPPORTED_SPORTS: SportKey[] = ["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab", "soccer", "mma", "golf", "nascar"];

// Cache TTLs for live endpoint
const LIVE_CACHE_TTL = 20 * 1000; // 20 seconds server cache
const LIVE_HTTP_TTL = 15 * 1000;  // 15 seconds client cache

// Type for cached live games response
interface LiveGamesCache {
  games: Game[];
  bySport: Record<string, Game[]>;
  count: number;
  provider: string;
  fetchedAt: number;
}

/**
 * GET /api/sports/live
 * 
 * Fetch all live games with server-side caching.
 * Optimized for frequent polling from the frontend.
 * 
 * Query params:
 * - league: Filter by single sport (nfl, nba, mlb, nhl, ncaaf, ncaab, soccer)
 * - sports: Comma-separated list of sports (alternative to league)
 * 
 * Response includes:
 * - games: Array of live games
 * - bySport: Games grouped by sport
 * - count: Total number of live games
 * - cached: Whether response came from cache
 * - cacheAge: Age of cached data in seconds (if cached)
 * - nextRefresh: Suggested polling interval in seconds
 */
sportsRouter.get("/live", async (c) => {
  const leagueParam = c.req.query("league") as SportKey | undefined;
  const sportsParam = c.req.query("sports");
  
  // Determine which sports to fetch
  let sports: SportKey[] | undefined;
  
  if (leagueParam) {
    if (!SUPPORTED_SPORTS.includes(leagueParam)) {
      return c.json({ 
        error: `Invalid league. Supported: ${SUPPORTED_SPORTS.join(", ")}`,
        games: [],
        count: 0,
      }, 400);
    }
    sports = [leagueParam];
  } else if (sportsParam) {
    sports = sportsParam.split(",").filter(s => 
      SUPPORTED_SPORTS.includes(s as SportKey)
    ) as SportKey[];
    
    if (sports.length === 0) {
      return c.json({ 
        error: "No valid sports specified",
        games: [],
        count: 0,
      }, 400);
    }
  }
  
  // Generate cache key
  const key = cacheKey("sports", "live", sports?.join(",") || "all");
  
  // Check server-side cache
  const cached = getCached<LiveGamesCache>(key);
  if (cached) {
    const cacheAge = Math.floor((Date.now() - cached.fetchedAt) / 1000);
    const etag = generateEtag(cached.games);
    
    // Check If-None-Match for 304 response
    const ifNoneMatch = c.req.header("If-None-Match");
    if (ifNoneMatch && ifNoneMatch.replace(/"/g, '') === etag) {
      return new Response(null, {
        status: 304,
        headers: cacheHeaders(LIVE_HTTP_TTL, { etag, isPublic: false }),
      });
    }
    
    return c.json({
      games: cached.games,
      bySport: cached.bySport,
      count: cached.count,
      provider: cached.provider,
      cached: true,
      cacheAge,
      nextRefresh: 20,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        ...cacheHeaders(LIVE_HTTP_TTL, { etag, isPublic: false, staleWhileRevalidate: 10 }),
      },
    });
  }
  
  // Fetch fresh data
  const result = await fetchLiveGamesWithFallback({ sports });
  
  // Group by sport
  const bySport: Record<string, Game[]> = {};
  for (const game of result.data) {
    if (!bySport[game.sport]) bySport[game.sport] = [];
    bySport[game.sport].push(game);
  }
  
  // Store in server cache
  const cacheData: LiveGamesCache = {
    games: result.data,
    bySport,
    count: result.data.length,
    provider: result.provider,
    fetchedAt: Date.now(),
  };
  setCached(key, cacheData, LIVE_CACHE_TTL);
  
  const etag = generateEtag(result.data);
  
  return c.json({
    games: result.data,
    bySport,
    count: result.data.length,
    provider: result.provider,
    cached: false,
    cacheAge: 0,
    nextRefresh: 20,
    timestamp: new Date().toISOString(),
  }, {
    headers: {
      ...cacheHeaders(LIVE_HTTP_TTL, { etag, isPublic: false, staleWhileRevalidate: 10 }),
    },
  });
});

/**
 * GET /api/sports/summary
 * 
 * Quick summary of live game counts per sport.
 * Useful for showing badges/indicators without fetching full game data.
 */
sportsRouter.get("/summary", async (c) => {
  const key = cacheKey("sports", "summary");
  
  // Check cache (shorter TTL for summary)
  const cached = getCached<{ counts: Record<string, number>; total: number; fetchedAt: number }>(key);
  if (cached) {
    return c.json({
      counts: cached.counts,
      total: cached.total,
      cached: true,
      timestamp: new Date().toISOString(),
    }, {
      headers: cacheHeaders(LIVE_HTTP_TTL, { isPublic: false }),
    });
  }
  
  // Fetch live games
  const result = await fetchLiveGamesWithFallback({});
  
  // Count by sport
  const counts: Record<string, number> = {};
  for (const game of result.data) {
    counts[game.sport] = (counts[game.sport] || 0) + 1;
  }
  
  // Cache summary
  setCached(key, { counts, total: result.data.length, fetchedAt: Date.now() }, LIVE_CACHE_TTL);
  
  return c.json({
    counts,
    total: result.data.length,
    cached: false,
    timestamp: new Date().toISOString(),
  }, {
    headers: cacheHeaders(LIVE_HTTP_TTL, { isPublic: false }),
  });
});

/**
 * GET /api/sports/leagues
 * 
 * List of supported sports/leagues.
 */
sportsRouter.get("/leagues", async (c) => {
  const leagues = SUPPORTED_SPORTS.map(sport => ({
    key: sport,
    name: getSportDisplayName(sport),
    icon: getSportIcon(sport),
  }));
  
  return c.json({
    leagues,
    count: leagues.length,
  }, {
    headers: cacheHeaders(CACHE_TTL.SPORT_LIST, { isPublic: true }),
  });
});

// Helper functions
function getSportDisplayName(sport: SportKey): string {
  const names: Record<SportKey, string> = {
    nfl: "NFL",
    nba: "NBA",
    mlb: "MLB",
    nhl: "NHL",
    ncaaf: "College Football",
    ncaab: "College Basketball",
    soccer: "Soccer",
    mma: "MMA/UFC",
    golf: "Golf/PGA",
  };
  return names[sport] || sport.toUpperCase();
}

function getSportIcon(sport: SportKey): string {
  const icons: Record<SportKey, string> = {
    nfl: "🏈",
    nba: "🏀",
    mlb: "⚾",
    nhl: "🏒",
    ncaaf: "🏈",
    ncaab: "🏀",
    soccer: "⚽",
    mma: "🥊",
    golf: "⛳",
  };
  return icons[sport] || "🏆";
}

export { sportsRouter };

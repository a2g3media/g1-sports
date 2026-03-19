/**
 * Games Service - Provider-Agnostic Data Layer
 * 
 * Handles fetching, caching, and normalizing game data from various providers.
 * Currently supports DEMO mode with simulated data.
 * 
 * Cache TTLs by game status:
 * - SCHEDULED: 5 minutes (games don't change until they start)
 * - IN_PROGRESS: 15 seconds (live updates needed)
 * - FINAL/POSTPONED/CANCELED: 1 hour (results are final)
 */

import type { Game } from "../../shared/types";

// Cache entry with TTL tracking
interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  ttlMs: number;
}

// In-memory cache (per worker instance)
const gamesCache = new Map<string, CacheEntry<Game[]>>();
const singleGameCache = new Map<string, CacheEntry<Game>>();

// TTL constants (in milliseconds)
const CACHE_TTL = {
  SCHEDULED: 5 * 60 * 1000,      // 5 minutes
  IN_PROGRESS: 15 * 1000,         // 15 seconds
  FINAL: 60 * 60 * 1000,          // 1 hour
  POSTPONED: 60 * 60 * 1000,      // 1 hour
  CANCELED: 60 * 60 * 1000,       // 1 hour
  MIXED: 15 * 1000,               // 15 seconds (when list contains live games)
  DEFAULT: 60 * 1000,             // 1 minute
} as const;

// Supported sports
export const SUPPORTED_SPORTS = ["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab", "soccer"] as const;
export type SportKey = typeof SUPPORTED_SPORTS[number];

// Provider configuration
export interface ProviderConfig {
  name: string;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
}

// Demo mode teams data
const DEMO_TEAMS: Record<SportKey, { name: string; abbr: string }[]> = {
  nfl: [
    { name: "Kansas City Chiefs", abbr: "KC" },
    { name: "Buffalo Bills", abbr: "BUF" },
    { name: "San Francisco 49ers", abbr: "SF" },
    { name: "Philadelphia Eagles", abbr: "PHI" },
    { name: "Dallas Cowboys", abbr: "DAL" },
    { name: "Miami Dolphins", abbr: "MIA" },
    { name: "Baltimore Ravens", abbr: "BAL" },
    { name: "Cincinnati Bengals", abbr: "CIN" },
    { name: "Detroit Lions", abbr: "DET" },
    { name: "Green Bay Packers", abbr: "GB" },
    { name: "Seattle Seahawks", abbr: "SEA" },
    { name: "New York Jets", abbr: "NYJ" },
    { name: "Cleveland Browns", abbr: "CLE" },
    { name: "Pittsburgh Steelers", abbr: "PIT" },
    { name: "Minnesota Vikings", abbr: "MIN" },
    { name: "Los Angeles Rams", abbr: "LAR" },
  ],
  nba: [
    { name: "Boston Celtics", abbr: "BOS" },
    { name: "Milwaukee Bucks", abbr: "MIL" },
    { name: "Denver Nuggets", abbr: "DEN" },
    { name: "Phoenix Suns", abbr: "PHX" },
    { name: "Los Angeles Lakers", abbr: "LAL" },
    { name: "Golden State Warriors", abbr: "GSW" },
    { name: "Philadelphia 76ers", abbr: "PHI" },
    { name: "Miami Heat", abbr: "MIA" },
    { name: "New York Knicks", abbr: "NYK" },
    { name: "Brooklyn Nets", abbr: "BKN" },
    { name: "Cleveland Cavaliers", abbr: "CLE" },
    { name: "Memphis Grizzlies", abbr: "MEM" },
  ],
  mlb: [
    { name: "New York Yankees", abbr: "NYY" },
    { name: "Los Angeles Dodgers", abbr: "LAD" },
    { name: "Atlanta Braves", abbr: "ATL" },
    { name: "Houston Astros", abbr: "HOU" },
    { name: "Philadelphia Phillies", abbr: "PHI" },
    { name: "San Diego Padres", abbr: "SD" },
    { name: "Texas Rangers", abbr: "TEX" },
    { name: "Arizona Diamondbacks", abbr: "ARI" },
  ],
  nhl: [
    { name: "Vegas Golden Knights", abbr: "VGK" },
    { name: "Florida Panthers", abbr: "FLA" },
    { name: "Edmonton Oilers", abbr: "EDM" },
    { name: "Dallas Stars", abbr: "DAL" },
    { name: "Colorado Avalanche", abbr: "COL" },
    { name: "Boston Bruins", abbr: "BOS" },
    { name: "Carolina Hurricanes", abbr: "CAR" },
    { name: "New York Rangers", abbr: "NYR" },
  ],
  ncaaf: [
    { name: "Georgia Bulldogs", abbr: "UGA" },
    { name: "Michigan Wolverines", abbr: "MICH" },
    { name: "Ohio State Buckeyes", abbr: "OSU" },
    { name: "Texas Longhorns", abbr: "TEX" },
    { name: "Alabama Crimson Tide", abbr: "BAMA" },
    { name: "Oregon Ducks", abbr: "ORE" },
  ],
  ncaab: [
    { name: "Duke Blue Devils", abbr: "DUKE" },
    { name: "North Carolina Tar Heels", abbr: "UNC" },
    { name: "Kansas Jayhawks", abbr: "KU" },
    { name: "Kentucky Wildcats", abbr: "UK" },
    { name: "Gonzaga Bulldogs", abbr: "GONZ" },
    { name: "UConn Huskies", abbr: "CONN" },
  ],
  soccer: [
    { name: "Manchester City", abbr: "MCI" },
    { name: "Arsenal", abbr: "ARS" },
    { name: "Liverpool", abbr: "LIV" },
    { name: "Chelsea", abbr: "CHE" },
    { name: "Real Madrid", abbr: "RMA" },
    { name: "Barcelona", abbr: "BAR" },
  ],
};

// Period labels by sport
function getPeriodLabel(sport: SportKey, period: number): string {
  switch (sport) {
    case "nfl":
    case "ncaaf":
      return period <= 4 ? `Q${period}` : "OT";
    case "nba":
    case "ncaab":
      return period <= 4 ? `Q${period}` : `OT${period - 4}`;
    case "nhl":
      return period <= 3 ? `P${period}` : `OT${period - 3}`;
    case "mlb":
      return period <= 9 ? `${period}` : `${period}`;
    case "soccer":
      return period === 1 ? "1H" : period === 2 ? "2H" : `ET${period - 2}`;
    default:
      return `P${period}`;
  }
}

// Generate clock time based on sport
function generateClock(sport: SportKey, period: number): string {
  switch (sport) {
    case "nfl":
    case "ncaaf":
      return `${Math.floor(Math.random() * 15)}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`;
    case "nba":
    case "ncaab":
      return `${Math.floor(Math.random() * 12)}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`;
    case "nhl":
      return `${Math.floor(Math.random() * 20)}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`;
    case "mlb":
      const outs = Math.floor(Math.random() * 3);
      const base = Math.floor(Math.random() * 2) === 0 ? "Top" : "Bot";
      return `${base} ${period}, ${outs} out`;
    case "soccer":
      const minute = period === 1 ? Math.floor(Math.random() * 45) + 1 : Math.floor(Math.random() * 45) + 45;
      return `${minute}'`;
    default:
      return "";
  }
}

// Generate realistic score based on sport and period
function generateScore(sport: SportKey, period: number, isHome: boolean): number {
  const baseMultiplier = isHome ? 1.05 : 1; // Slight home advantage
  
  switch (sport) {
    case "nfl":
    case "ncaaf":
      // ~7 points per quarter
      return Math.floor(Math.random() * 14 * period * baseMultiplier);
    case "nba":
    case "ncaab":
      // ~28 points per quarter
      return Math.floor(Math.random() * 35 * period * baseMultiplier);
    case "nhl":
      // ~1 goal per period
      return Math.floor(Math.random() * 2 * period * baseMultiplier);
    case "mlb":
      // ~1 run per inning
      return Math.floor(Math.random() * 2 * period * baseMultiplier);
    case "soccer":
      // ~0.7 goals per half
      return Math.floor(Math.random() * 2 * period * baseMultiplier);
    default:
      return Math.floor(Math.random() * 10 * period);
  }
}

// Generate demo games for a sport
function generateDemoGames(sport: SportKey, count: number = 8): Game[] {
  const teams = DEMO_TEAMS[sport];
  const games: Game[] = [];
  const now = Date.now();
  
  // Shuffle teams
  const shuffled = [...teams].sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < Math.min(count, Math.floor(shuffled.length / 2)); i++) {
    const awayTeam = shuffled[i * 2];
    const homeTeam = shuffled[i * 2 + 1];
    
    // Distribute game statuses
    let status: Game["status"];
    let period: number | undefined;
    let clock: string | undefined;
    let awayScore: number | undefined;
    let homeScore: number | undefined;
    let startTime: string;
    
    const rand = Math.random();
    if (rand < 0.2) {
      // 20% scheduled
      status = "SCHEDULED";
      const futureHours = 1 + Math.floor(Math.random() * 48);
      startTime = new Date(now + futureHours * 60 * 60 * 1000).toISOString();
    } else if (rand < 0.5) {
      // 30% in progress
      status = "IN_PROGRESS";
      const maxPeriod = sport === "mlb" ? 9 : sport === "soccer" ? 2 : sport === "nhl" ? 3 : 4;
      period = 1 + Math.floor(Math.random() * maxPeriod);
      clock = generateClock(sport, period);
      awayScore = generateScore(sport, period, false);
      homeScore = generateScore(sport, period, true);
      startTime = new Date(now - Math.random() * 2 * 60 * 60 * 1000).toISOString();
    } else {
      // 50% final
      status = "FINAL";
      const maxPeriod = sport === "mlb" ? 9 : sport === "soccer" ? 2 : sport === "nhl" ? 3 : 4;
      period = maxPeriod + (Math.random() < 0.1 ? 1 : 0); // 10% overtime
      awayScore = generateScore(sport, maxPeriod + 1, false);
      homeScore = generateScore(sport, maxPeriod + 1, true);
      // Ensure no ties for sports that don't allow them
      if (awayScore === homeScore && sport !== "soccer") {
        homeScore += sport === "nfl" || sport === "ncaaf" ? 3 : 1;
      }
      startTime = new Date(now - Math.random() * 24 * 60 * 60 * 1000).toISOString();
    }
    
    games.push({
      game_id: `demo_${sport}_${i + 1}`,
      external_id: `${sport}-game-${i + 1}`,
      sport,
      league: sport.toUpperCase(),
      status,
      period,
      period_label: period ? getPeriodLabel(sport, period) : undefined,
      clock,
      away_team_code: awayTeam.abbr,
      away_team_name: awayTeam.name,
      away_score: awayScore,
      home_team_code: homeTeam.abbr,
      home_team_name: homeTeam.name,
      home_score: homeScore,
      start_time: startTime,
      venue: `${homeTeam.name.split(" ").pop()} Stadium`,
      last_updated_at: new Date().toISOString(),
    });
  }
  
  return games;
}

// Check if cache entry is valid
function isCacheValid<T>(entry: CacheEntry<T> | undefined): boolean {
  if (!entry) return false;
  return Date.now() - entry.cachedAt < entry.ttlMs;
}

// Determine TTL based on games in response
function determineTTL(games: Game[]): number {
  const hasLive = games.some(g => g.status === "IN_PROGRESS");
  if (hasLive) return CACHE_TTL.MIXED;
  
  const allFinal = games.every(g => 
    g.status === "FINAL" || g.status === "POSTPONED" || g.status === "CANCELED"
  );
  if (allFinal) return CACHE_TTL.FINAL;
  
  return CACHE_TTL.SCHEDULED;
}

// =====================================================
// PUBLIC API
// =====================================================

/**
 * Fetch games for a sport with caching
 */
export async function fetchGames(
  sport: SportKey,
  options: {
    status?: Game["status"];
    forceRefresh?: boolean;
  } = {}
): Promise<{ games: Game[]; fromCache: boolean; cachedAt?: number }> {
  const cacheKey = `${sport}-${options.status || "all"}`;
  
  // Check cache unless force refresh
  if (!options.forceRefresh) {
    const cached = gamesCache.get(cacheKey);
    if (isCacheValid(cached)) {
      let games = cached!.data;
      
      // Filter by status if requested
      if (options.status) {
        games = games.filter(g => g.status === options.status);
      }
      
      return { games, fromCache: true, cachedAt: cached!.cachedAt };
    }
  }
  
  // Generate fresh demo data
  const games = generateDemoGames(sport);
  const ttl = determineTTL(games);
  
  // Cache the results
  gamesCache.set(cacheKey, {
    data: games,
    cachedAt: Date.now(),
    ttlMs: ttl,
  });
  
  // Filter by status if requested
  let result = games;
  if (options.status) {
    result = games.filter(g => g.status === options.status);
  }
  
  return { games: result, fromCache: false };
}

/**
 * Fetch live games across all sports
 */
export async function fetchLiveGames(
  options: { sports?: SportKey[]; forceRefresh?: boolean } = {}
): Promise<{ games: Game[]; fromCache: boolean }> {
  const sports = options.sports || SUPPORTED_SPORTS.slice();
  const allGames: Game[] = [];
  let anyFromCache = false;
  
  for (const sport of sports) {
    const result = await fetchGames(sport, { 
      status: "IN_PROGRESS",
      forceRefresh: options.forceRefresh,
    });
    allGames.push(...result.games);
    if (result.fromCache) anyFromCache = true;
  }
  
  // Sort by sport then start time
  allGames.sort((a, b) => {
    if (a.sport !== b.sport) return a.sport.localeCompare(b.sport);
    return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
  });
  
  return { games: allGames, fromCache: anyFromCache };
}

/**
 * Fetch scheduled games (upcoming)
 */
export async function fetchScheduledGames(
  options: { sports?: SportKey[]; hours?: number; forceRefresh?: boolean } = {}
): Promise<{ games: Game[]; fromCache: boolean }> {
  const sports = options.sports || SUPPORTED_SPORTS.slice();
  const hours = options.hours || 48;
  const cutoff = Date.now() + hours * 60 * 60 * 1000;
  const allGames: Game[] = [];
  let anyFromCache = false;
  
  for (const sport of sports) {
    const result = await fetchGames(sport, {
      status: "SCHEDULED",
      forceRefresh: options.forceRefresh,
    });
    allGames.push(...result.games.filter(g => 
      new Date(g.start_time).getTime() <= cutoff
    ));
    if (result.fromCache) anyFromCache = true;
  }
  
  // Sort by start time
  allGames.sort((a, b) => 
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
  
  return { games: allGames, fromCache: anyFromCache };
}

/**
 * Fetch a single game by ID
 * Supports both dash-separated (demo-nfl-kc-buf) and underscore-separated (demo_nfl_1) formats
 */
export async function fetchGame(
  gameId: string,
  options: { forceRefresh?: boolean } = {}
): Promise<{ game: Game | null; fromCache: boolean }> {
  // Check single game cache
  if (!options.forceRefresh) {
    const cached = singleGameCache.get(gameId);
    if (isCacheValid(cached)) {
      return { game: cached!.data, fromCache: true };
    }
  }
  
  // Parse sport from game ID - handle both formats:
  // - Dash format: demo-{sport}-{team1}-{team2}
  // - Underscore format: demo_{sport}_{index}
  let sport: SportKey | null = null;
  
  // Try underscore format first (demo_nfl_1)
  const underscoreParts = gameId.split("_");
  if (underscoreParts[0] === "demo" && underscoreParts.length >= 3) {
    const potentialSport = underscoreParts[1] as SportKey;
    if (SUPPORTED_SPORTS.includes(potentialSport)) {
      sport = potentialSport;
    }
  }
  
  // Try dash format (demo-nfl-kc-buf)
  if (!sport) {
    const dashParts = gameId.split("-");
    if (dashParts[0] === "demo" && dashParts.length >= 3) {
      const potentialSport = dashParts[1] as SportKey;
      if (SUPPORTED_SPORTS.includes(potentialSport)) {
        sport = potentialSport;
      }
    }
  }
  
  if (sport) {
    const result = await fetchGames(sport, { forceRefresh: options.forceRefresh });
    const game = result.games.find(g => g.game_id === gameId);
    if (game) {
      const ttl = CACHE_TTL[game.status] || CACHE_TTL.DEFAULT;
      singleGameCache.set(gameId, {
        data: game,
        cachedAt: Date.now(),
        ttlMs: ttl,
      });
      return { game, fromCache: false };
    }
    
    // Generate deterministic game based on ID if not found
    const teams = DEMO_TEAMS[sport];
    if (teams && teams.length >= 2) {
      const gameIndex = parseInt(underscoreParts[2] || "1", 10) || 1;
      const awayIdx = ((gameIndex - 1) * 2) % teams.length;
      const homeIdx = ((gameIndex - 1) * 2 + 1) % teams.length;
      const awayTeam = teams[awayIdx];
      const homeTeam = teams[homeIdx];
      
      const generatedGame: Game = {
        game_id: gameId,
        external_id: `${sport}-game-${gameIndex}`,
        sport,
        league: sport.toUpperCase(),
        status: "IN_PROGRESS",
        period: 2,
        period_label: getPeriodLabel(sport, 2),
        clock: "8:45",
        away_team_code: awayTeam.abbr,
        away_team_name: awayTeam.name,
        away_score: Math.floor(Math.random() * 20) + 10,
        home_team_code: homeTeam.abbr,
        home_team_name: homeTeam.name,
        home_score: Math.floor(Math.random() * 20) + 10,
        start_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        venue: `${homeTeam.name.split(" ").pop()} Stadium`,
        last_updated_at: new Date().toISOString(),
      };
      
      singleGameCache.set(gameId, {
        data: generatedGame,
        cachedAt: Date.now(),
        ttlMs: CACHE_TTL.IN_PROGRESS,
      });
      return { game: generatedGame, fromCache: false };
    }
  }
  
  return { game: null, fromCache: false };
}

/**
 * Simulate a score update (for demo control center)
 */
export function simulateScoreUpdate(
  game: Game,
  options: { team: "home" | "away"; points: number }
): Game {
  const updated = { ...game };
  
  if (options.team === "home") {
    updated.home_score = (updated.home_score || 0) + options.points;
  } else {
    updated.away_score = (updated.away_score || 0) + options.points;
  }
  
  updated.last_updated_at = new Date().toISOString();
  
  // Update cache
  singleGameCache.set(game.game_id, {
    data: updated,
    cachedAt: Date.now(),
    ttlMs: CACHE_TTL.IN_PROGRESS,
  });
  
  return updated;
}

/**
 * Simulate a game state change (for demo control center)
 */
export function simulateGameStateChange(
  game: Game,
  newStatus: Game["status"],
  options: { period?: number; clock?: string } = {}
): Game {
  const updated = { ...game, status: newStatus };
  
  if (newStatus === "IN_PROGRESS") {
    updated.period = options.period || 1;
    updated.period_label = getPeriodLabel(game.sport as SportKey, updated.period);
    updated.clock = options.clock || generateClock(game.sport as SportKey, updated.period);
    updated.away_score = updated.away_score || 0;
    updated.home_score = updated.home_score || 0;
  } else if (newStatus === "FINAL") {
    updated.clock = undefined;
  }
  
  updated.last_updated_at = new Date().toISOString();
  
  // Update cache
  const ttl = CACHE_TTL[newStatus] || CACHE_TTL.DEFAULT;
  singleGameCache.set(game.game_id, {
    data: updated,
    cachedAt: Date.now(),
    ttlMs: ttl,
  });
  
  return updated;
}

/**
 * Clear all caches (for testing/admin)
 */
export function clearGamesCache(): void {
  gamesCache.clear();
  singleGameCache.clear();
}

/**
 * Get cache stats (for monitoring)
 */
export function getCacheStats(): {
  listCacheSize: number;
  singleCacheSize: number;
  entries: { key: string; age: number; ttl: number; valid: boolean }[];
} {
  const entries: { key: string; age: number; ttl: number; valid: boolean }[] = [];
  
  gamesCache.forEach((entry, key) => {
    entries.push({
      key,
      age: Date.now() - entry.cachedAt,
      ttl: entry.ttlMs,
      valid: isCacheValid(entry),
    });
  });
  
  return {
    listCacheSize: gamesCache.size,
    singleCacheSize: singleGameCache.size,
    entries,
  };
}

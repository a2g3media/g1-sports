/**
 * SportsRadar Game Provider
 * 
 * Fetches live game data from SportsRadar APIs.
 * Replaces legacy provider feeds as the primary game data source.
 * 
 * API Products:
 * - NBA v8: Daily schedules, game details, box scores
 * - NFL v7: Same structure
 * - MLB v7: Same structure  
 * - NHL v7: Same structure
 * - NCAAB v8: Same structure
 */

import { Redis } from "@upstash/redis";
import type { Game } from "../../../shared/types";
import type {
  SportsDataProvider,
  SportKey,
  ProviderResponse,
  GameDetail,
} from "./types";
import { formatDateInTimeZoneYMD } from "../dateUtils";

let redisClient: Redis | null | undefined;
function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = String(process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  if (!url || !token) {
    redisClient = null;
    return redisClient;
  }
  redisClient = new Redis({ url, token });
  return redisClient;
}

// ============================================
// API CONFIGURATION
// ============================================

// SportsRadar API base URLs by sport
const SPORT_API_CONFIG: Record<string, { base: string; version: string; pathKey: string }> = {
  'nba': { base: 'https://api.sportradar.com/nba/production', version: 'v8', pathKey: 'nba' },
  'nfl': { base: 'https://api.sportradar.com/nfl/production', version: 'v7', pathKey: 'nfl' },
  'mlb': { base: 'https://api.sportradar.com/mlb/production', version: 'v7', pathKey: 'mlb' },
  'nhl': { base: 'https://api.sportradar.com/nhl/production', version: 'v7', pathKey: 'nhl' },
  'ncaab': { base: 'https://api.sportradar.com/ncaamb/production', version: 'v8', pathKey: 'ncaamb' },
  'ncaaf': { base: 'https://api.sportradar.com/ncaafb/production', version: 'v7', pathKey: 'ncaafb' },
};

// ============================================
// CACHE CONFIGURATION
// ============================================

const CACHE_TTL_MS = 60 * 1000; // 60 seconds for live game data
const ERROR_CACHE_TTL_MS = 30 * 1000; // 30 seconds for errors
const TIMEOUT_MS = 15000; // 15 second timeout

// In-memory cache (per-request lifecycle in Cloudflare Workers)
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const gameCache = new Map<string, CacheEntry<Game[]>>();
const errorCache = new Map<string, CacheEntry<string>>();

// ============================================
// API KEY STORAGE
// ============================================

let apiKey: string | null = null;

/**
 * Initialize the SportsRadar provider with an API key
 */
export function initSportsRadarGameProvider(key: string): void {
  apiKey = key;
  console.log("[SR Game Provider] Initialized with API key");
}

export function getSportsRadarGameProviderApiKey(): string | null {
  return apiKey;
}

// ============================================
// STATUS MAPPING
// ============================================

function mapStatus(srStatus: string | undefined): Game["status"] {
  if (!srStatus) return "SCHEDULED";
  
  const status = srStatus.toLowerCase();
  
  // Live statuses
  if (status === "inprogress" || status === "in_progress" || status === "live" || status === "halftime") {
    return "IN_PROGRESS";
  }
  
  // Final statuses
  if (status === "closed" || status === "complete" || status === "final") {
    return "FINAL";
  }
  
  // Delayed/postponed
  if (status === "postponed" || status === "delayed" || status === "suspended") {
    return "POSTPONED";
  }
  
  // Cancelled
  if (status === "cancelled" || status === "canceled") {
    return "CANCELED";
  }
  
  // Default to scheduled
  return "SCHEDULED";
}

// ============================================
// TIMEZONE HELPERS
// ============================================

function parseYmdAsNoonDate(input: string): Date | null {
  const match = String(input || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day, 12, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// ============================================
// PERIOD MAPPING
// ============================================

function mapPeriod(sport: SportKey, srGame: any): { period?: number; periodLabel?: string; clock?: string; isOvertime?: boolean } {
  const result: { period?: number; periodLabel?: string; clock?: string; isOvertime?: boolean } = {};
  
  // Extract clock time
  result.clock = srGame.clock || srGame.game_clock || undefined;
  
  // NBA / NCAAB - quarters (OT starts at quarter 5+)
  if (sport === 'nba' || sport === 'ncaab') {
    const quarter = srGame.quarter || srGame.period;
    if (quarter) {
      result.period = quarter;
      result.periodLabel = quarter <= 4 ? `Q${quarter}` : `OT${quarter - 4}`;
      result.isOvertime = quarter > 4;
    }
  }
  
  // NFL / NCAAF - quarters (OT starts at quarter 5+)
  if (sport === 'nfl' || sport === 'ncaaf') {
    const quarter = srGame.quarter || srGame.period;
    if (quarter) {
      result.period = quarter;
      result.periodLabel = quarter <= 4 ? `Q${quarter}` : `OT${quarter - 4}`;
      result.isOvertime = quarter > 4;
    }
  }
  
  // NHL - periods (OT starts at period 4+, or shootout)
  if (sport === 'nhl') {
    const period = srGame.period;
    if (period) {
      result.period = period;
      result.periodLabel = period <= 3 ? `P${period}` : `OT${period - 3}`;
      result.isOvertime = period > 3;
    }
    // Check for shootout indicator
    if (srGame.shootout || srGame.ended_in_shootout) {
      result.isOvertime = true;
    }
  }
  
  // MLB - extra innings (10+)
  if (sport === 'mlb') {
    const inning = srGame.inning || srGame.current_inning;
    const inningHalf = srGame.inning_half;
    if (inning) {
      result.period = inning;
      const half = inningHalf === 'T' || inningHalf === 'top' ? 'Top' : 'Bot';
      result.periodLabel = `${half} ${inning}`;
      result.isOvertime = inning > 9; // Extra innings
    }
  }
  
  // Soccer - check for extra time (ET) or penalty shootout (PSO)
  if (sport === 'soccer') {
    if (srGame.period === 'extra_time' || srGame.status?.includes('extra') || srGame.extra_time) {
      result.isOvertime = true;
    }
    if (srGame.period === 'penalty_shootout' || srGame.penalty_shootout || srGame.penalties) {
      result.isOvertime = true;
    }
  }
  
  return result;
}

// ============================================
// TEAM NAME EXTRACTION
// ============================================

function extractTeamCode(team: any): string {
  return team?.abbr || team?.abbreviation || team?.alias || team?.market?.substring(0, 3)?.toUpperCase() || 'UNK';
}

function extractTeamName(team: any): string {
  if (team?.name && team?.market) {
    // Check if market is already part of the name to avoid duplicates
    // e.g., market="Phoenix", name="Phoenix Suns" should return "Phoenix Suns" not "Phoenix Phoenix Suns"
    const name = team.name as string;
    const market = team.market as string;
    if (name.toLowerCase().startsWith(market.toLowerCase())) {
      return name;
    }
    return `${market} ${name}`;
  }
  return team?.name || team?.market || team?.alias || 'Unknown';
}

// ============================================
// FETCH WITH RETRY
// ============================================

async function fetchWithRetry(url: string, maxRetries: number = 2): Promise<Response> {
  let lastError: Error | null = null;
  const redis = getRedisClient();
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const cacheKey = `g1:test:${url}`;
      if (redis) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return new Response(JSON.stringify(cached), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        try {
          const data = await response.clone().json();
          if (redis) {
            await redis.set(cacheKey, data, { ex: 30 });
          }
        } catch {
          // Cache is best-effort for JSON SportsRadar responses.
        }
      }
      
      // Rate limiting - exponential backoff
      if (response.status === 429 && attempt < maxRetries) {
        const waitMs = 3000 * Math.pow(2, attempt);
        console.log(`[SR Game Provider] Rate limited, waiting ${waitMs/1000}s`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      
      // Don't retry 4xx errors
      if (response.status >= 400 && response.status < 500) {
        return response;
      }
      
      // Retry 5xx errors
      if (response.status >= 500 && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      
      return response;
      
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

// ============================================
// LIVE SCORE FETCHING
// ============================================

/**
 * Fetch live scores for a single game from the summary endpoint
 */
export async function fetchLiveScores(
  sport: SportKey, 
  gameId: string
): Promise<{ homeScore?: number; awayScore?: number; status?: string; period?: number; periodLabel?: string; clock?: string } | null> {
  const config = SPORT_API_CONFIG[sport];
  if (!config || !apiKey) return null;
  
  const url = `${config.base}/${config.version}/en/games/${gameId}/summary.json?api_key=${apiKey}`;
  
  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) return null;
    
    const rawData = await response.json() as any;
    // Unwrap game object if present (MLB and some other sports wrap data)
    const data = rawData.game || rawData;
    const home = data.home || data.home_team;
    const away = data.away || data.away_team;
    
    // Debug log to diagnose live score issues
    const status = data.status?.toLowerCase() || '';
    if (status.includes('progress') || status === 'live' || status === 'halftime') {
      console.log(`[SR Game Provider] LIVE GAME ${gameId} - status: ${data.status}, home_points: ${data.home_points}, away_points: ${data.away_points}, home?.points: ${home?.points}, scoring: ${JSON.stringify(data.scoring)?.substring(0, 200)}`);
    }
    
    const periodInfo = mapPeriod(sport, data);
    
    // Extract scores - summary endpoint has them in various locations
    // For LIVE games, scores may be under .scoring or need to be summed from periods
    // For FINAL games, scores are usually at top level
    // MLB uses .runs, other sports use .points
    const scoring = data.scoring;
    const homeScore = 
      data.home_points ?? 
      data.home_runs ?? 
      home?.points ?? 
      home?.runs ?? 
      home?.score ?? 
      scoring?.home_points ?? 
      scoring?.home?.points ??
      scoring?.home?.runs ??
      undefined;
    const awayScore = 
      data.away_points ?? 
      data.away_runs ?? 
      away?.points ?? 
      away?.runs ?? 
      away?.score ?? 
      scoring?.away_points ?? 
      scoring?.away?.points ??
      scoring?.away?.runs ??
      undefined;
    
    // Get actual status from summary endpoint
    const actualStatus = mapStatus(data.status);
    
    return {
      homeScore,
      awayScore,
      status: actualStatus,
      period: periodInfo.period,
      periodLabel: periodInfo.periodLabel,
      clock: periodInfo.clock
    };
  } catch (err) {
    console.log(`[SR Game Provider] Failed to fetch live scores for ${gameId}: ${err}`);
    return null;
  }
}

// ============================================
// GAME FETCHING
// ============================================

async function fetchGamesFromSportsRadar(sport: SportKey, date: Date): Promise<{ games: Game[]; error?: string }> {
  const config = SPORT_API_CONFIG[sport];
  
  if (!config) {
    console.log(`[SR Game Provider] Sport ${sport} not supported`);
    return { games: [], error: `Sport ${sport} not supported by SportsRadar` };
  }
  
  if (!apiKey) {
    return { games: [], error: 'SportsRadar API key not configured' };
  }
  
  // Check error cache first
  const errorKey = `${sport}_${formatDateInTimeZoneYMD(date, "America/New_York")}`;
  const cachedError = errorCache.get(errorKey);
  if (cachedError && Date.now() - cachedError.timestamp < ERROR_CACHE_TTL_MS) {
    return { games: [], error: cachedError.data };
  }
  
  // Format date components
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  // Build candidate URLs. Some SportsRadar accounts expose trial vs production
  // and/or sport feeds on different versions.
  const baseCandidates = Array.from(
    new Set([
      config.base,
      config.base.replace('/production', '/trial'),
    ])
  );
  const versionCandidates = Array.from(
    new Set([
      config.version,
      config.version === 'v8' ? 'v7' : 'v8',
    ])
  );
  const urlCandidates: string[] = [];
  for (const base of baseCandidates) {
    for (const version of versionCandidates) {
      urlCandidates.push(
        `${base}/${version}/en/games/${year}/${month}/${day}/schedule.json?api_key=${apiKey}`
      );
    }
  }

  console.log(`[SR Game Provider] Fetching ${sport} games for ${year}-${month}-${day} (${urlCandidates.length} endpoint candidates)`);
  
  try {
    let response: Response | null = null;
    const attemptedStatuses: string[] = [];
    for (const url of urlCandidates) {
      const candidate = await fetchWithRetry(url);
      attemptedStatuses.push(`${candidate.status}:${url.includes('/trial/') ? 'trial' : 'production'}:${url.includes('/v8/') ? 'v8' : 'v7'}`);
      if (candidate.ok) {
        response = candidate;
        break;
      }
    }

    if (!response) {
      const errorMsg = `HTTP ${attemptedStatuses.join(', ')}`;
      console.log(`[SR Game Provider] ${sport} fetch failed across candidates: ${errorMsg}`);
      errorCache.set(errorKey, { data: errorMsg, timestamp: Date.now() });
      return { games: [], error: errorMsg };
    }
    
    const data = await response.json() as any;
    const games: Game[] = [];
    
    // Extract games from response - structure varies by sport
    const rawGames = data.games || data.schedule?.games || [];
    
    for (const srGame of rawGames) {
      try {
        const home = srGame.home || srGame.home_team;
        const away = srGame.away || srGame.away_team;
        
        if (!home || !away) continue;
        
        const periodInfo = mapPeriod(sport, srGame);
        
        // Extract scores with multiple fallback paths
        // MLB uses .runs, other sports use .points
        const awayScore = srGame.away_points 
          ?? srGame.away_runs
          ?? srGame.away?.points 
          ?? srGame.away?.runs
          ?? away.points 
          ?? away.runs
          ?? away.score 
          ?? away.scoring?.points 
          ?? srGame.scoring?.away 
          ?? undefined;
        
        const homeScore = srGame.home_points 
          ?? srGame.home_runs
          ?? srGame.home?.points 
          ?? srGame.home?.runs
          ?? home.points 
          ?? home.runs
          ?? home.score 
          ?? home.scoring?.points 
          ?? srGame.scoring?.home 
          ?? undefined;
        
        const game: Game = {
          game_id: `sr_${sport}_${srGame.id}`,
          external_id: srGame.id,
          sport,
          league: sport.toUpperCase(),
          status: mapStatus(srGame.status),
          period: periodInfo.period,
          period_label: periodInfo.periodLabel,
          clock: periodInfo.clock,
          is_overtime: periodInfo.isOvertime,
          away_team_code: extractTeamCode(away),
          away_team_name: extractTeamName(away),
          away_score: awayScore,
          home_team_code: extractTeamCode(home),
          home_team_name: extractTeamName(home),
          home_score: homeScore,
          start_time: srGame.scheduled || srGame.start_time || new Date().toISOString(),
          venue: srGame.venue?.name,
          broadcast: srGame.broadcast?.network || srGame.broadcasts?.[0]?.network,
          last_updated_at: new Date().toISOString(),
        };
        
        games.push(game);
      } catch (err) {
        console.log(`[SR Game Provider] Error parsing game: ${err}`);
      }
    }
    
    console.log(`[SR Game Provider] Got ${games.length} ${sport} games`);
    
    // Fetch scores for games that may have started (daily schedule doesn't include real scores/status)
    // IMPORTANT: Schedule API returns "SCHEDULED" for ALL games, even finished ones
    // We need to fetch individual game summaries to get actual status and scores
    const now = Date.now();
    const gamesNeedingScores = games.filter(g => {
      // Always fetch for IN_PROGRESS or FINAL games (if schedule API ever returns these)
      if (g.status === 'IN_PROGRESS' || g.status === 'FINAL') return true;
      
      // For SCHEDULED games, check if start time has passed
      if (g.start_time) {
        const startTime = new Date(g.start_time).getTime();
        // If game started more than 5 minutes ago, it's likely live or finished
        if (now > startTime + 5 * 60 * 1000) return true;
      }
      
      return false;
    });
    
    if (gamesNeedingScores.length > 0) {
      console.log(`[SR Game Provider] Fetching scores for ${gamesNeedingScores.length} games (live + final)`);
      
      const scorePromises = gamesNeedingScores.map(async (game) => {
        const scores = await fetchLiveScores(sport, game.external_id || game.game_id.replace(`sr_${sport}_`, ''));
        return { gameId: game.game_id, scores };
      });
      
      const scoreResults = await Promise.all(scorePromises);
      
      // Update games with scores and actual status
      for (const result of scoreResults) {
        if (result.scores) {
          const game = games.find(g => g.game_id === result.gameId);
          if (game) {
            game.home_score = result.scores.homeScore;
            game.away_score = result.scores.awayScore;
            // Update status from summary (schedule API always returns SCHEDULED)
            if (result.scores.status) {
              game.status = result.scores.status as Game["status"];
            }
            game.period = result.scores.period ?? game.period;
            game.period_label = result.scores.periodLabel ?? game.period_label;
            game.clock = result.scores.clock ?? game.clock;
          }
        }
      }
    }
    
    return { games };
    
  } catch (err) {
    const errorMsg = `Fetch error: ${err}`;
    console.log(`[SR Game Provider] ${sport} exception: ${errorMsg}`);
    errorCache.set(errorKey, { data: errorMsg, timestamp: Date.now() });
    return { games: [], error: errorMsg };
  }
}

// ============================================
// PROVIDER IMPLEMENTATION
// ============================================

export const sportsRadarGameProvider: SportsDataProvider = {
  name: "SportsRadar",
  
  supportedSports: ['nba', 'nfl', 'mlb', 'nhl', 'ncaab', 'ncaaf'] as SportKey[],
  
  isAvailable(): boolean {
    return !!apiKey;
  },
  
  async fetchGames(
    sport: SportKey,
    options?: { date?: string; status?: Game["status"] }
  ): Promise<ProviderResponse<Game[]>> {
    // Use provided date or today in US Eastern timezone
    // (Workers run in UTC, but sports schedules are typically in ET)
    let targetDate: Date;
    if (options?.date) {
      targetDate = parseYmdAsNoonDate(options.date) || new Date(options.date);
    } else {
      const todayEt = formatDateInTimeZoneYMD(new Date(), "America/New_York");
      targetDate = parseYmdAsNoonDate(todayEt) || new Date();
    }
    
    // Check cache
    const cacheKey = `${sport}_${formatDateInTimeZoneYMD(targetDate, "America/New_York")}`;
    const cached = gameCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      let games = cached.data;
      
      // Filter by status if specified
      if (options?.status) {
        games = games.filter(g => g.status === options.status);
      }
      
      return {
        data: games,
        fromCache: true,
        cachedAt: cached.timestamp,
        provider: "SportsRadar"
      };
    }
    
    // Fetch from API
    const result = await fetchGamesFromSportsRadar(sport, targetDate);
    
    // Cache successful results
    if (!result.error && result.games.length > 0) {
      gameCache.set(cacheKey, { data: result.games, timestamp: Date.now() });
    }
    
    let games = result.games;
    
    // Filter by status if specified
    if (options?.status) {
      games = games.filter(g => g.status === options.status);
    }
    
    return {
      data: games,
      fromCache: false,
      provider: "SportsRadar",
      error: result.error
    };
  },
  
  async fetchGame(gameId: string): Promise<ProviderResponse<GameDetail | null>> {
    // Parse game ID: sr_{sport}_{id}
    const parts = gameId.split('_');
    if (parts.length < 3 || parts[0] !== 'sr') {
      return {
        data: null,
        fromCache: false,
        provider: "SportsRadar",
        error: "Invalid SportsRadar game ID format"
      };
    }
    
    const sport = parts[1] as SportKey;
    const srId = parts.slice(2).join('_'); // Rejoin in case ID has underscores
    const config = SPORT_API_CONFIG[sport];
    
    if (!config || !apiKey) {
      return {
        data: null,
        fromCache: false,
        provider: "SportsRadar",
        error: "Sport not supported or API key not configured"
      };
    }
    
    // Fetch game detail
    // URL: /{version}/en/games/{game_id}/summary.json
    const url = `${config.base}/${config.version}/en/games/${srId}/summary.json?api_key=${apiKey}`;
    
    console.log(`[SR Game Provider] Fetching game detail: ${gameId}`);
    
    try {
      const response = await fetchWithRetry(url);
      
      if (!response.ok) {
        return {
          data: null,
          fromCache: false,
          provider: "SportsRadar",
          error: `HTTP ${response.status}`
        };
      }
      
      const data = await response.json() as any;
      const srGame = data.game || data;
      const home = srGame.home || srGame.home_team;
      const away = srGame.away || srGame.away_team;
      
      if (!home || !away) {
        return {
          data: null,
          fromCache: false,
          provider: "SportsRadar",
          error: "Invalid game data"
        };
      }
      
      const periodInfo = mapPeriod(sport, srGame);
      
      // Extract scores with multiple fallback paths
      // MLB uses .runs, other sports use .points
      const awayScore = srGame.away_points 
        ?? srGame.away_runs
        ?? srGame.away?.points 
        ?? srGame.away?.runs
        ?? away.points 
        ?? away.runs
        ?? away.score 
        ?? away.scoring?.points 
        ?? srGame.scoring?.away 
        ?? undefined;
      
      const homeScore = srGame.home_points 
        ?? srGame.home_runs
        ?? srGame.home?.points 
        ?? srGame.home?.runs
        ?? home.points 
        ?? home.runs
        ?? home.score 
        ?? home.scoring?.points 
        ?? srGame.scoring?.home 
        ?? undefined;
      
      const game: Game = {
        game_id: gameId,
        external_id: srId,
        sport,
        league: sport.toUpperCase(),
        status: mapStatus(srGame.status),
        period: periodInfo.period,
        period_label: periodInfo.periodLabel,
        clock: periodInfo.clock,
        away_team_code: extractTeamCode(away),
        away_team_name: extractTeamName(away),
        away_score: awayScore,
        home_team_code: extractTeamCode(home),
        home_team_name: extractTeamName(home),
        home_score: homeScore,
        start_time: srGame.scheduled || new Date().toISOString(),
        venue: srGame.venue?.name,
        broadcast: srGame.broadcast?.network,
        last_updated_at: new Date().toISOString(),
      };
      
      // Build game detail with additional data
      const gameDetail: GameDetail = {
        game,
        stats: [],
        playByPlay: [],
        injuries: [],
        weather: null,
        odds: [],
      };
      
      return {
        data: gameDetail,
        fromCache: false,
        provider: "SportsRadar"
      };
      
    } catch (err) {
      return {
        data: null,
        fromCache: false,
        provider: "SportsRadar",
        error: `Fetch error: ${err}`
      };
    }
  }
};

/**
 * Clear all caches (for debugging/admin)
 */
export function clearSportsRadarGameCache(): void {
  gameCache.clear();
  errorCache.clear();
  console.log("[SR Game Provider] Caches cleared");
}

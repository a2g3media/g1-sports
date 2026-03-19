import { Hono } from "hono";
import { getRealDate } from "../services/dateUtils";
import { fetchGamesWithFallback } from "../services/providers";

interface Env {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Env }>();

type SportKey = 'NFL' | 'NBA' | 'MLB' | 'NHL' | 'NCAAF' | 'NCAAB' | 'SOCCER';
type DateRange = 'live' | 'today' | 'tomorrow' | 'week' | 'recent';

// Support for explicit date queries (YYYY-MM-DD format)
function parseExplicitDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  // Match YYYY-MM-DD format
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1; // 0-indexed
  const day = parseInt(match[3], 10);
  const date = new Date(year, month, day);
  // Validate the date is real (handles invalid dates like 2024-02-30)
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }
  return date;
}

// ============================================
// LIVE API CACHE (60 seconds)
// ============================================
interface CacheEntry {
  games: ScoreboardGame[];
  timestamp: number;
  dateRange: string | null;
}

const liveApiCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

function getCacheKey(sport: SportKey | 'ALL', startDate?: string): string {
  const dateKey = startDate ? `_${startDate.slice(0, 10)}` : '';
  return `live_api_${sport}${dateKey}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getCachedGames(sport: SportKey | 'ALL', startDate?: string): CacheEntry | null {
  const key = getCacheKey(sport, startDate);
  const entry = liveApiCache.get(key);
  if (!entry) return null;
  
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    liveApiCache.delete(key);
    return null;
  }
  
  return entry;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setCachedGames(sport: SportKey | 'ALL', games: ScoreboardGame[], dateRange: string | null, startDate?: string): void {
  const key = getCacheKey(sport, startDate);
  liveApiCache.set(key, { games, timestamp: Date.now(), dateRange });
}

// Sports that use week numbers (football - NFL season typically Sep-Feb)
const WEEK_BASED_SPORTS: SportKey[] = ['NFL', 'NCAAF'];
// Sports that use rolling date ranges (kept for reference)
// const DATE_BASED_SPORTS: SportKey[] = ['NBA', 'NCAAB', 'NHL', 'MLB', 'SOCCER'];

interface ScoreboardGame {
  id: string;
  gameId?: string;
  sport: SportKey;
  homeTeam: string;
  awayTeam: string;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: 'live' | 'scheduled' | 'final';
  period: string | null;
  clock: string | null;
  startTime: string | null;
  venue: string | null;
  channel: string | null;
  spread: number | null;
  overUnder: number | null;
  moneylineHome: number | null;
  moneylineAway: number | null;
  homeOdds: number | null;
  awayOdds: number | null;
  publicBetHome: number | null;
  publicBetAway: number | null;
  coachSignal: 'edge' | 'watch' | 'noise' | null;
  odds?: {
    spread?: number | null;
    spreadHome?: number | null;
    total?: number | null;
    overUnder?: number | null;
    mlHome?: number | null;
    mlAway?: number | null;
    moneylineHome?: number | null;
    moneylineAway?: number | null;
    openSpread?: number | null;
    openTotal?: number | null;
  };
}

interface DebugInfo {
  queryRange: { startDate: string; endDate: string };
  statusFilter: string[];
  fallbackAttempted: boolean;
  fallbackFrom?: string;
  fallbackTo?: string;
  dbGameCount: number;
  sport: string;
  range: string;
  message?: string;
  invalidGamesDiscarded?: number;
}

/**
 * Validate a game record - returns false if game should be discarded
 * Logs invalid records for debugging
 */
function isValidGame(game: { homeTeam: string; awayTeam: string; id?: string; gameId?: string }): boolean {
  // Check for same team playing itself
  const homeKey = game.homeTeam?.toUpperCase()?.trim();
  const awayKey = game.awayTeam?.toUpperCase()?.trim();
  
  if (!homeKey || !awayKey) {
    console.warn(`[scoreboard] INVALID GAME DISCARDED: Missing team - id=${game.id || game.gameId}, home="${game.homeTeam}", away="${game.awayTeam}"`);
    return false;
  }
  
  if (homeKey === awayKey) {
    console.warn(`[scoreboard] INVALID GAME DISCARDED: Same team matchup - id=${game.id || game.gameId}, home="${game.homeTeam}", away="${game.awayTeam}"`);
    return false;
  }
  
  return true;
}

// Demo games removed - app now uses real provider data only

/**
 * Calculate date range from an explicit date (single day)
 * 
 * Since game times are stored in UTC but users select dates in US Eastern time,
 * we need to extend the range. A game at 11pm ET on Feb 21 is stored as 4am UTC on Feb 22.
 * We interpret the selected date as Eastern time (UTC-5/UTC-4) and query accordingly.
 */
function calculateExplicitDateRange(
  date: Date,
  statusFilterOption?: 'all' | 'live' | 'scheduled' | 'final'
): { startDate: string; endDate: string; statusFilter: string[] } {
  // Interpret date as US Eastern time
  // Start of day in ET = 5am UTC (EST) or 4am UTC (EDT)
  // We use 5am UTC to be conservative (covers both EST and EDT)
  const startDate = new Date(date);
  startDate.setUTCHours(5, 0, 0, 0); // 12am ET = 5am UTC (EST)
  
  // End of day in ET = 5am UTC the next day
  const endDate = new Date(date);
  endDate.setDate(endDate.getDate() + 1); // Move to next day
  endDate.setUTCHours(5, 59, 59, 999); // ~1am ET next day = 6am UTC
  
  let statusFilter: string[] = [];
  if (statusFilterOption === 'live') {
    statusFilter = ['InProgress', 'IN_PROGRESS', 'LIVE'];
  } else if (statusFilterOption === 'final') {
    statusFilter = ['FINAL', 'FINISHED', 'COMPLETED'];
  } else if (statusFilterOption === 'scheduled') {
    statusFilter = ['SCHEDULED', 'NOT_STARTED'];
  }
  // 'all' = no filter
  
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    statusFilter,
  };
}

/**
 * Calculate date range based on sport type and requested range.
 * - NFL/CFB: Week uses actual week concept (but we still use 7-day range since we don't have week data)
 * - Other sports: Week means rolling 7-day window
 */
function calculateDateRange(
  _sport: SportKey | 'ALL',
  range: DateRange
): { startDate: string; endDate: string; statusFilter: string[] } {
  // Use corrected date for sandbox environment
  const now = getRealDate();
  let startDate: string;
  let endDate: string;
  let statusFilter: string[] = [];

  switch (range) {
    case 'live':
      statusFilter = ['InProgress', 'IN_PROGRESS', 'LIVE'];
      // Look for live games within a wide window
      startDate = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
      endDate = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
      break;

    case 'today': {
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);
      startDate = todayStart.toISOString();
      endDate = todayEnd.toISOString();
      break;
    }

    case 'tomorrow': {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStart = new Date(tomorrow);
      tomorrowStart.setHours(0, 0, 0, 0);
      const tomorrowEnd = new Date(tomorrow);
      tomorrowEnd.setHours(23, 59, 59, 999);
      startDate = tomorrowStart.toISOString();
      endDate = tomorrowEnd.toISOString();
      break;
    }

    case 'recent': {
      // Recent: games from past 3 days through today
      const recentStart = new Date(now);
      recentStart.setDate(recentStart.getDate() - 3);
      recentStart.setHours(0, 0, 0, 0);
      const recentEnd = new Date(now);
      recentEnd.setHours(23, 59, 59, 999);
      startDate = recentStart.toISOString();
      endDate = recentEnd.toISOString();
      break;
    }

    case 'week':
    default: {
      // For ALL sports with "week" filter, use 7-day rolling window
      // This is more practical than trying to determine NFL weeks
      const weekStart = new Date(now);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() + 6); // Today + 6 more days = 7 day window
      weekEnd.setHours(23, 59, 59, 999);
      startDate = weekStart.toISOString();
      endDate = weekEnd.toISOString();
      break;
    }
  }

  return { startDate, endDate, statusFilter };
}

// Get games from database - SDIO tables removed, returns empty to trigger live API fallback
async function getDbGames(
  _db: D1Database,
  sport: SportKey | 'ALL',
  range: DateRange,
  debugInfo: DebugInfo
): Promise<ScoreboardGame[]> {
  const { startDate, endDate, statusFilter } = calculateDateRange(sport, range);
  
  // Store debug info
  debugInfo.queryRange = { startDate, endDate };
  debugInfo.statusFilter = statusFilter;
  debugInfo.dbGameCount = 0;
  
  // SDIO tables removed - return empty to trigger live API fallback
  // TODO: Implement SportsRadar database caching
  return [];
}

/**
 * Get games from database for an explicit date range - SDIO tables removed
 */
async function getDbGamesForDateRange(
  _db: D1Database,
  _sport: SportKey | 'ALL',
  _dateRange: { startDate: string; endDate: string; statusFilter: string[] },
  debugInfo: DebugInfo
): Promise<ScoreboardGame[]> {
  debugInfo.dbGameCount = 0;
  // SDIO tables removed - return empty to trigger live API fallback
  return [];
}

/**
 * Smart fallback: Try alternate ranges when the requested range returns 0 games.
 * Fallback order:
 * - Week → Today → Tomorrow
 * - Today → Tomorrow → Week
 * - Tomorrow → Today → Week
 * - Live → Today → Week
 */
function getFallbackRanges(originalRange: DateRange): DateRange[] {
  const fallbacks: Record<DateRange, DateRange[]> = {
    week: ['today', 'tomorrow', 'recent'],
    today: ['tomorrow', 'week', 'recent'],
    tomorrow: ['today', 'week', 'recent'],
    live: ['today', 'tomorrow', 'week'],
    recent: ['today', 'tomorrow', 'week'],
  };
  return fallbacks[originalRange] || ['today', 'week'];
}

/**
 * Get the most recent games from the database - SDIO tables removed
 */
async function getRecentDbGames(
  _db: D1Database,
  _sport: SportKey | 'ALL',
): Promise<{ games: ScoreboardGame[]; dateRange: string | null }> {
  // SDIO tables removed - return empty to trigger live API fallback
  return { games: [], dateRange: null };
}

/**
 * Fetch games directly from live API when database is empty
 */
async function fetchFromLiveApi(
  sport: SportKey | 'ALL',
  requestedStartDate?: string,
  requestedEndDate?: string
): Promise<{ games: ScoreboardGame[]; dateRange: string | null; fromCache: boolean }> {
  const cached = getCachedGames(sport, requestedStartDate);
  if (cached) {
    return { games: cached.games, dateRange: cached.dateRange, fromCache: true };
  }

  const toProviderSport = (input: SportKey): string => {
    const map: Record<SportKey, string> = {
      NFL: 'nfl',
      NBA: 'nba',
      MLB: 'mlb',
      NHL: 'nhl',
      NCAAF: 'ncaaf',
      NCAAB: 'ncaab',
      SOCCER: 'soccer',
    };
    return map[input];
  };
  const toScoreboardStatus = (status: string): 'live' | 'scheduled' | 'final' => {
    const upper = String(status || '').toUpperCase();
    if (upper.includes('LIVE') || upper.includes('IN_PROGRESS') || upper.includes('INPROGRESS')) return 'live';
    if (upper.includes('FINAL') || upper.includes('FINISHED') || upper.includes('COMPLETE')) return 'final';
    return 'scheduled';
  };
  const toScoreboardGame = (raw: any): ScoreboardGame => ({
    id: String(raw.game_id || ''),
    gameId: String(raw.game_id || ''),
    sport: normalizeSportKey(String(raw.sport || '').toUpperCase()) as SportKey,
    homeTeam: String(raw.home_team_abbr || raw.home_team_code || raw.home_team_name || 'HOME'),
    awayTeam: String(raw.away_team_abbr || raw.away_team_code || raw.away_team_name || 'AWAY'),
    homeTeamName: raw.home_team_name || null,
    awayTeamName: raw.away_team_name || null,
    homeScore: raw.home_score ?? null,
    awayScore: raw.away_score ?? null,
    status: toScoreboardStatus(raw.status),
    period: raw.period_label ?? raw.period ?? null,
    clock: raw.clock ?? null,
    startTime: raw.start_time || null,
    venue: raw.venue ?? null,
    channel: raw.broadcast ?? null,
    spread: raw.spread ?? null,
    overUnder: raw.overUnder ?? raw.total ?? null,
    moneylineHome: raw.moneylineHome ?? null,
    moneylineAway: raw.moneylineAway ?? null,
    homeOdds: raw.moneylineHome ?? null,
    awayOdds: raw.moneylineAway ?? null,
    publicBetHome: null,
    publicBetAway: null,
    coachSignal: null,
  });

  const sportsToFetch: SportKey[] = sport === 'ALL'
    ? ['NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'SOCCER']
    : [sport];
  const start = requestedStartDate ? new Date(requestedStartDate).getTime() : null;
  const end = requestedEndDate ? new Date(requestedEndDate).getTime() : null;
  const allGames: ScoreboardGame[] = [];

  for (const s of sportsToFetch) {
    const providerSport = toProviderSport(s);
    const res = await fetchGamesWithFallback(providerSport, { date: getRealDate().dateString });
    const mapped = (res.data || []).map(toScoreboardGame);
    for (const game of mapped) {
      if (start === null || end === null || !game.startTime) {
        allGames.push(game);
        continue;
      }
      const ts = new Date(game.startTime).getTime();
      if (Number.isFinite(ts) && ts >= start && ts <= end) {
        allGames.push(game);
      }
    }
  }

  setCachedGames(sport, allGames, requestedStartDate && requestedEndDate ? `${requestedStartDate}..${requestedEndDate}` : null, requestedStartDate);
  return {
    games: allGames,
    dateRange: requestedStartDate && requestedEndDate ? `${requestedStartDate}..${requestedEndDate}` : null,
    fromCache: false,
  };
}

const normalizeStatus = (status: string): 'live' | 'scheduled' | 'final' => {
  const upper = (status || '').toUpperCase();
  if (upper.includes('PROGRESS') || upper === 'LIVE' || upper === 'INPROGRESS') {
    return 'live';
  }
  if (upper === 'FINAL' || upper === 'FINISHED' || upper === 'COMPLETED' || upper.includes('FINAL')) {
    return 'final';
  }
  return 'scheduled';
};

const cleanClock = (clock: string | null): string | null => {
  if (!clock) return null;
  if (clock === 'null:null' || clock === 'null') return null;
  return clock;
};

const generatePublicBet = (): number => {
  return Math.floor(Math.random() * 30) + 40;
};

const generateCoachSignal = (): 'edge' | 'watch' | 'noise' | null => {
  const rand = Math.random();
  if (rand < 0.15) return 'edge';
  if (rand < 0.45) return 'watch';
  if (rand < 0.6) return 'noise';
  return null;
};

const normalizeSportKey = (input: string): string => {
  const upper = input.toUpperCase();
  const aliases: Record<string, string> = {
    'CBB': 'NCAAB',
    'CFB': 'NCAAF',
    'COLLEGE BASKETBALL': 'NCAAB',
    'COLLEGE FOOTBALL': 'NCAAF',
    'FOOTBALL': 'NFL',
    'BASKETBALL': 'NBA',
    'HOCKEY': 'NHL',
    'BASEBALL': 'MLB',
  };
  return aliases[upper] || upper;
};

/**
 * Check if a sport is currently in-season (rough approximation)
 */
function isInSeason(sportKey: SportKey): { inSeason: boolean; message?: string } {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  
  // Rough season approximations:
  // NFL: Sep-Feb (months 8-1)
  // NCAAF: Aug-Jan (months 7-0)
  // NBA: Oct-Jun (months 9-5)
  // NCAAB: Nov-Apr (months 10-3)
  // NHL: Oct-Jun (months 9-5)
  // MLB: Mar-Oct (months 2-9)
  // Soccer: Year-round (various leagues)
  
  const seasons: Record<SportKey, { start: number; end: number; name: string }> = {
    NFL: { start: 8, end: 1, name: 'NFL season runs September through February' },
    NCAAF: { start: 7, end: 0, name: 'College football season runs August through January' },
    NBA: { start: 9, end: 5, name: 'NBA season runs October through June' },
    NCAAB: { start: 10, end: 3, name: 'College basketball season runs November through April' },
    NHL: { start: 9, end: 5, name: 'NHL season runs October through June' },
    MLB: { start: 2, end: 9, name: 'MLB season runs March through October' },
    SOCCER: { start: 0, end: 11, name: 'Soccer leagues run year-round' },
  };
  
  const season = seasons[sportKey];
  if (!season) return { inSeason: true };
  
  // Handle seasons that wrap around the year (e.g., NFL Sep-Feb)
  if (season.start > season.end) {
    // Season spans year boundary
    if (month >= season.start || month <= season.end) {
      return { inSeason: true };
    }
    return { inSeason: false, message: season.name };
  } else {
    // Normal season within same year
    if (month >= season.start && month <= season.end) {
      return { inSeason: true };
    }
    return { inSeason: false, message: season.name };
  }
}

// GET /api/sports-data/scoreboard
app.get('/', async (c) => {
  const rawSport = c.req.query('sport') || 'ALL';
  const sportParam = normalizeSportKey(rawSport);
  const range = (c.req.query('range') || 'recent').toLowerCase() as DateRange;
  const showDebug = c.req.query('debug') === 'true';
  
  // New: Support explicit date parameter (YYYY-MM-DD format)
  const explicitDateStr = c.req.query('date');
  const explicitDate = parseExplicitDate(explicitDateStr);
  const statusParam = (c.req.query('status') || 'all').toLowerCase() as 'all' | 'live' | 'scheduled' | 'final';
  
  const validSports = ['NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'SOCCER', 'ALL'];
  const sport = validSports.includes(sportParam) ? sportParam as SportKey | 'ALL' : 'ALL';
  
  const validRanges = ['live', 'today', 'tomorrow', 'week', 'recent'];
  const validRange = validRanges.includes(range) ? range : 'recent';

  // Initialize debug info
  const debugInfo: DebugInfo = {
    queryRange: { startDate: '', endDate: '' },
    statusFilter: [],
    fallbackAttempted: false,
    dbGameCount: 0,
    sport: sport,
    range: validRange,
  };

  let games: ScoreboardGame[] = [];
  let usingDemoData = false;
  let fallbackMessage: string | null = null;
  let actualRange = validRange;
  
  try {
    // If explicit date provided, use that instead of range-based lookup
    if (explicitDate) {
      const dateRange = calculateExplicitDateRange(explicitDate, statusParam);
      debugInfo.queryRange = dateRange;
      debugInfo.statusFilter = dateRange.statusFilter;
      
      // Fetch games for the explicit date
      games = await getDbGamesForDateRange(c.env.DB, sport, dateRange, debugInfo);
      
      // If no games in DB, try live API
      if (games.length === 0) {
        const liveResult = await fetchFromLiveApi(
          sport === 'ALL' ? 'ALL' : sport as SportKey,
          dateRange.startDate,
          dateRange.endDate
        );
        if (liveResult.games.length > 0) {
          // Filter by status if specified
          games = liveResult.games.filter(g => {
            if (statusParam === 'all') return true;
            return g.status === statusParam;
          });
          debugInfo.fallbackAttempted = true;
          debugInfo.fallbackTo = 'live-api';
        }
      }
    } else {
      // First attempt with requested range (legacy behavior)
      games = await getDbGames(c.env.DB, sport, validRange as DateRange, debugInfo);
    }
    
    // If using explicit date, skip fallback logic - user wants that specific date
    if (explicitDate) {
      // No fallback for explicit dates - show what we have (or empty)
    } else if (games.length === 0) {
      const fallbackRanges = getFallbackRanges(validRange as DateRange);
      
      for (const fallbackRange of fallbackRanges) {
        const fallbackDebugInfo: DebugInfo = {
          queryRange: { startDate: '', endDate: '' },
          statusFilter: [],
          fallbackAttempted: true,
          dbGameCount: 0,
          sport: sport,
          range: fallbackRange,
        };
        
        const fallbackGames = await getDbGames(c.env.DB, sport, fallbackRange, fallbackDebugInfo);
        
        if (fallbackGames.length > 0) {
          games = fallbackGames;
          debugInfo.fallbackAttempted = true;
          debugInfo.fallbackFrom = validRange;
          debugInfo.fallbackTo = fallbackRange;
          actualRange = fallbackRange;
          
          // Generate user-friendly fallback message
          const sportLabel = sport === 'ALL' ? '' : sport + ' ';
          const rangeLabels: Record<string, string> = {
            live: 'live',
            today: 'today',
            tomorrow: 'tomorrow',
            week: 'this week',
            recent: 'recently',
          };
          fallbackMessage = `No ${sportLabel}games ${rangeLabels[validRange] || validRange} — showing ${rangeLabels[fallbackRange] || fallbackRange}`;
          break;
        }
      }
    }
    
    // Last resort: get most recent games from DB regardless of date
    // This handles the sandbox date vs real-world data mismatch
    if (games.length === 0) {
      const recentResult = await getRecentDbGames(c.env.DB, sport);
      if (recentResult.games.length > 0) {
        games = recentResult.games;
        debugInfo.fallbackAttempted = true;
        debugInfo.fallbackFrom = validRange;
        debugInfo.fallbackTo = 'db-recent';
        actualRange = 'recent';
        
        const sportLabel = sport === 'ALL' ? '' : sport + ' ';
        fallbackMessage = recentResult.dateRange 
          ? `Showing ${sportLabel}games from ${recentResult.dateRange}`
          : `Showing recent ${sportLabel}games from database`;
      }
    }
  } catch (error) {
    console.error('[scoreboard] Error fetching DB games:', error);
  }

  // LIVE API FALLBACK: If DB is empty, fetch directly from provider chain
  let usingLiveApi = false;
  let liveApiFromCache = false;
  if (games.length === 0) {
    try {
      // Pass the date range so live API respects today/tomorrow filter
      const liveResult = await fetchFromLiveApi(
        sport === 'ALL' ? 'ALL' : sport as SportKey,
        debugInfo.queryRange.startDate,
        debugInfo.queryRange.endDate
      );
      if (liveResult.games.length > 0) {
        games = liveResult.games;
        usingLiveApi = true;
        liveApiFromCache = liveResult.fromCache;
        debugInfo.fallbackAttempted = true;
        debugInfo.fallbackFrom = validRange;
        debugInfo.fallbackTo = 'live-api';
        actualRange = validRange; // Keep the actual requested range now that we filter correctly
        
        const cacheNote = liveResult.fromCache ? ' (cached)' : '';
        const rangeLabel = validRange === 'today' ? 'today' : validRange === 'tomorrow' ? 'tomorrow' : 'recent';
        fallbackMessage = `Showing ${rangeLabel} games from live API${cacheNote}`;
      }
    } catch (error) {
      console.error('[scoreboard] Live API fallback error:', error);
    }
  }

  // Check if sport is in off-season (for informative messaging)
  let offSeasonMessage: string | null = null;
  if (games.length === 0 && sport !== 'ALL') {
    const seasonCheck = isInSeason(sport as SportKey);
    if (!seasonCheck.inSeason) {
      offSeasonMessage = seasonCheck.message || `${sport} is currently in the off-season`;
    }
  }

  // Demo mode removed - now using live provider fallback only
  // If games are still empty after DB + live API fallback, show empty state

  // Normalize all games
  games = games.map(game => {
    const gameId = game.gameId || game.id;
    return {
      ...game,
      gameId,
      publicBetAway: game.publicBetHome ? 100 - game.publicBetHome : null,
      odds: game.odds || {
        spread: game.spread,
        spreadHome: game.spread,
        total: game.overUnder,
        overUnder: game.overUnder,
        mlHome: game.moneylineHome,
        mlAway: game.moneylineAway,
        moneylineHome: game.moneylineHome,
        moneylineAway: game.moneylineAway,
      },
    };
  });

  // Sort: Live first, then by start time
  games.sort((a, b) => {
    if (a.status === 'live' && b.status !== 'live') return -1;
    if (a.status !== 'live' && b.status === 'live') return 1;
    if (a.startTime && b.startTime) {
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    }
    return 0;
  });

  // Get last refresh time from DB
  let lastRefresh: string | null = null;
  try {
    const refreshLog = await c.env.DB.prepare(`
      SELECT completed_at FROM sdio_refresh_logs 
      WHERE status = 'completed' 
      ORDER BY completed_at DESC 
      LIMIT 1
    `).first<{ completed_at: string }>();
    lastRefresh = refreshLog?.completed_at || null;
  } catch {
    // Ignore refresh log errors
  }

  // Get total game count in DB for debugging
  let totalDbGames = 0;
  try {
    const countResult = await c.env.DB.prepare(
      sport === 'ALL' 
        ? 'SELECT COUNT(*) as count FROM sdio_games'
        : 'SELECT COUNT(*) as count FROM sdio_games WHERE sport = ?'
    ).bind(...(sport === 'ALL' ? [] : [sport])).first<{ count: number }>();
    totalDbGames = countResult?.count || 0;
  } catch {
    // Ignore
  }

  // Build message for empty state
  let message: string | null = null;
  if (games.length === 0) {
    if (offSeasonMessage) {
      message = offSeasonMessage;
    } else {
      const sportLabel = sport === 'ALL' ? '' : sport + ' ';
      message = `No ${sportLabel}games available. Try a different sport or time window.`;
      
      // Add hint if database is empty
      if (totalDbGames === 0) {
        message += ' (Database has no games — a data refresh may be needed)';
      }
    }
  }

  // Build detailed data source info for admin badge
  const dataSource = usingLiveApi ? 'live-api' : usingDemoData ? 'demo' : 'database';
  const dataSourceLabel = usingLiveApi
    ? `SportsRadar/provider (live${liveApiFromCache ? ', cached' : ''})`
    : usingDemoData 
      ? 'Demo Mode' 
      : 'Database';

  const response: Record<string, unknown> = {
    ok: true,
    success: true,
    sport,
    range: explicitDate ? 'date' : actualRange, // Return the actual range used (may differ if fallback occurred)
    requestedRange: explicitDate ? 'date' : validRange, // Original requested range
    date: explicitDateStr || null, // Explicit date if provided (YYYY-MM-DD)
    statusFilter: explicitDate ? statusParam : null,
    count: games.length,
    isDemo: usingDemoData,
    demoModeEnabled: usingDemoData,
    isLiveApi: usingLiveApi,
    liveApiCached: liveApiFromCache,
    games,
    fallbackMessage,
    offSeasonMessage: games.length === 0 ? offSeasonMessage : null,
    message,
    meta: {
      lastRefresh,
      timestamp: new Date().toISOString(),
      totalDbGames,
      dataSource,
      dataSourceLabel,
      itemsReturned: games.length,
      queryDateRange: debugInfo.queryRange,
    },
    timestamp: new Date().toISOString(),
  };

  // Include debug info if requested (admin-only in practice)
  if (showDebug) {
    response.debug = {
      ...debugInfo,
      sportType: sport !== 'ALL' && WEEK_BASED_SPORTS.includes(sport as SportKey) ? 'week-based' : 'date-based',
      isInSeason: sport !== 'ALL' ? isInSeason(sport as SportKey) : null,
    };
  }

  return c.json(response);
});

export default app;

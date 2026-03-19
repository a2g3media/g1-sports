/**
 * Active Slate Service
 * Finds dates with real games by scanning the provider game API
 * NO DEMO/DUMMY DATA - production pipeline only
 */

import { SportKey, SPORT_SCAN_WINDOWS } from './types';

// ============================================
// TYPES
// ============================================

export interface ActiveSlateResult {
  dateUsed: string | null;
  gamesCount: number;
  sampleGames: Array<{
    gameId: string;
    homeTeam: string;
    awayTeam: string;
    startTime: string;
    status: string;
  }>;
  scanInfo: {
    datesScanned: number;
    scanRange: string;
    durationMs: number;
  };
  error?: {
    type: 'AUTH_FAILURE' | 'RATE_LIMIT' | 'SERVER_ERROR' | 'NO_GAMES_IN_SCAN_WINDOW' | 'NETWORK_ERROR';
    message: string;
    httpStatus?: number;
  };
}

export interface FetchGamesForDateResult {
  count: number;
  games: any[];
  httpStatus: number;
  error?: string;
  errorType?: 'AUTH_FAILURE' | 'RATE_LIMIT' | 'SERVER_ERROR' | 'NETWORK_ERROR';
  durationMs: number;
}

// ============================================
// SPORT PATH MAPPING
// ============================================

const SPORT_TO_API_PATH: Record<string, string> = {
  NFL: 'nfl',
  NBA: 'nba',
  MLB: 'mlb',
  NHL: 'nhl',
  NCAAF: 'cfb',
  NCAAB: 'cbb',
  SOCCER: 'soccer',
  MMA: 'mma',
  GOLF: 'golf',
  TENNIS: 'tennis'
};

// ============================================
// DATE FORMATTING
// ============================================

/**
 * Format date for provider game API (YYYY-MMM-DD format)
 */
export function formatSDIODate(date: Date): string {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${date.getUTCFullYear()}-${months[date.getUTCMonth()]}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Convert SDIO date (YYYY-MMM-DD) to ISO date (YYYY-MM-DD)
 */
export function sdioDateToISO(sdioDate: string): string {
  const months: Record<string, string> = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
  };
  return sdioDate.replace(/-([A-Z]{3})-/, (_, m) => `-${months[m] || '01'}-`);
}

/**
 * Get today's date in Pacific Time (for user-facing alignment)
 */
export function getTodayPT(): Date {
  const now = new Date();
  // PT is UTC-8 (or UTC-7 during DST)
  // For simplicity, use UTC and adjust
  return new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
}

// ============================================
// FETCH GAMES FOR DATE
// ============================================

/**
 * Fetch games for a single date from provider game API
 * Throws categorized errors instead of returning empty arrays
 */
export async function fetchGamesForDate(
  sport: SportKey,
  sdioDate: string,
  apiKey: string,
  baseUrl: string = 'https://api.sportsdata.io/v3'
): Promise<FetchGamesForDateResult> {
  const sportPath = SPORT_TO_API_PATH[sport];
  if (!sportPath) {
    return {
      count: 0,
      games: [],
      httpStatus: 0,
      error: `Invalid sport: ${sport}`,
      errorType: 'NETWORK_ERROR',
      durationMs: 0
    };
  }

  const url = `${baseUrl}/${sportPath}/scores/json/GamesByDate/${sdioDate}?key=${apiKey}`;
  const startTime = Date.now();

  try {
    const response = await fetch(url);
    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      let errorType: FetchGamesForDateResult['errorType'];
      let errorMessage: string;

      if (response.status === 401) {
        errorType = 'AUTH_FAILURE';
        errorMessage = `${sport} not included in API subscription or invalid key`;
      } else if (response.status === 403) {
        errorType = 'AUTH_FAILURE';
        errorMessage = `Access forbidden for ${sport}`;
      } else if (response.status === 429) {
        errorType = 'RATE_LIMIT';
        errorMessage = 'Rate limit exceeded - too many requests';
      } else if (response.status >= 500) {
        errorType = 'SERVER_ERROR';
        errorMessage = `Provider server error: ${response.status}`;
      } else {
        errorType = 'NETWORK_ERROR';
        errorMessage = `HTTP ${response.status}: ${errorText.slice(0, 200)}`;
      }

      return {
        count: 0,
        games: [],
        httpStatus: response.status,
        error: errorMessage,
        errorType,
        durationMs
      };
    }

    const data = await response.json() as any[];
    return {
      count: data.length,
      games: data,
      httpStatus: response.status,
      durationMs
    };
  } catch (err: any) {
    return {
      count: 0,
      games: [],
      httpStatus: 0,
      error: `Network error: ${err.message}`,
      errorType: 'NETWORK_ERROR',
      durationMs: Date.now() - startTime
    };
  }
}

// ============================================
// FIND ACTIVE SLATE DATE
// ============================================

/**
 * Find a date with games for the given sport by scanning dates
 * Scan order: TODAY (PT) → TODAY+1..+14 → TODAY-1..-7
 * 
 * @returns ActiveSlateResult with dateUsed (or null if no games found)
 */
export async function findActiveSlateDate(
  sport: SportKey,
  apiKey: string,
  options?: {
    baseUrl?: string;
    maxFutureDays?: number;
    maxPastDays?: number;
  }
): Promise<ActiveSlateResult> {
  const baseUrl = options?.baseUrl || 'https://api.sportsdata.io/v3';
  
  // Use sport-specific scan windows for full season coverage
  const sportWindow = SPORT_SCAN_WINDOWS[sport] || { forwardDays: 14, backDays: 7 };
  const maxFutureDays = options?.maxFutureDays ?? sportWindow.forwardDays;
  const maxPastDays = options?.maxPastDays ?? sportWindow.backDays;

  const startTime = Date.now();
  const now = new Date();
  
  // Build scan order: TODAY, then future (+1 to +14), then past (-1 to -7)
  const offsets: number[] = [0];
  for (let i = 1; i <= maxFutureDays; i++) offsets.push(i);
  for (let i = 1; i <= maxPastDays; i++) offsets.push(-i);

  const datesScanned: string[] = [];
  
  for (const offset of offsets) {
    const testDate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const sdioDate = formatSDIODate(testDate);
    datesScanned.push(sdioDate);

    console.log(`[ActiveSlate] ${sport}: Checking ${sdioDate} (offset: ${offset >= 0 ? '+' : ''}${offset})...`);

    const result = await fetchGamesForDate(sport, sdioDate, apiKey, baseUrl);

    // CRITICAL: Stop immediately on auth errors - don't continue scanning
    if (result.errorType === 'AUTH_FAILURE') {
      console.error(`[ActiveSlate] ${sport}: AUTH FAILURE - ${result.error}`);
      return {
        dateUsed: null,
        gamesCount: 0,
        sampleGames: [],
        scanInfo: {
          datesScanned: datesScanned.length,
          scanRange: `${datesScanned[0]} to ${datesScanned[datesScanned.length - 1]}`,
          durationMs: Date.now() - startTime
        },
        error: {
          type: 'AUTH_FAILURE',
          message: result.error || 'Authentication failed',
          httpStatus: result.httpStatus
        }
      };
    }

    // Stop on rate limit - wait and retry logic should be handled upstream
    if (result.errorType === 'RATE_LIMIT') {
      console.warn(`[ActiveSlate] ${sport}: Rate limited on ${sdioDate}`);
      return {
        dateUsed: null,
        gamesCount: 0,
        sampleGames: [],
        scanInfo: {
          datesScanned: datesScanned.length,
          scanRange: `${datesScanned[0]} to ${datesScanned[datesScanned.length - 1]}`,
          durationMs: Date.now() - startTime
        },
        error: {
          type: 'RATE_LIMIT',
          message: result.error || 'Rate limit exceeded',
          httpStatus: result.httpStatus
        }
      };
    }

    // Found games!
    if (result.count > 0) {
      console.log(`[ActiveSlate] ${sport}: Found ${result.count} games on ${sdioDate}`);
      
      const sampleGames = result.games.slice(0, 3).map((g: any) => ({
        gameId: String(g.GlobalGameID || g.GameID || g.GameId),
        homeTeam: g.HomeTeam || g.HomeTeamName || 'TBD',
        awayTeam: g.AwayTeam || g.AwayTeamName || 'TBD',
        startTime: g.DateTime || g.Day || '',
        status: g.Status || 'Scheduled'
      }));

      return {
        dateUsed: sdioDate,
        gamesCount: result.count,
        sampleGames,
        scanInfo: {
          datesScanned: datesScanned.length,
          scanRange: `${datesScanned[0]} to ${sdioDate}`,
          durationMs: Date.now() - startTime
        }
      };
    }

    // Continue scanning for other error types or zero games
    if (result.error && result.errorType !== 'NETWORK_ERROR') {
      console.warn(`[ActiveSlate] ${sport}: ${sdioDate} - ${result.error}`);
    }
  }

  // No games found in entire scan range
  console.log(`[ActiveSlate] ${sport}: No games found in scan window (${datesScanned.length} dates checked)`);
  
  return {
    dateUsed: null,
    gamesCount: 0,
    sampleGames: [],
    scanInfo: {
      datesScanned: datesScanned.length,
      scanRange: `${datesScanned[0]} to ${datesScanned[datesScanned.length - 1]}`,
      durationMs: Date.now() - startTime
    },
    error: {
      type: 'NO_GAMES_IN_SCAN_WINDOW',
      message: `No ${sport} games found from ${datesScanned[0]} to ${datesScanned[datesScanned.length - 1]}`
    }
  };
}

// ============================================
// FETCH ODDS FOR DATE
// ============================================

export async function fetchOddsForDate(
  sport: SportKey,
  isoDate: string,
  apiKey: string,
  baseUrl: string = 'https://api.sportsdata.io/v3'
): Promise<{ odds: any[]; error?: string; errorType?: string }> {
  const sportPath = SPORT_TO_API_PATH[sport];
  if (!sportPath) {
    return { odds: [], error: `Invalid sport: ${sport}` };
  }

  const url = `${baseUrl}/${sportPath}/odds/json/GameOddsByDate/${isoDate}?key=${apiKey}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      let errorType = 'UNKNOWN';
      if (response.status === 401 || response.status === 403) errorType = 'AUTH_FAILURE';
      else if (response.status === 429) errorType = 'RATE_LIMIT';
      else if (response.status >= 500) errorType = 'SERVER_ERROR';

      return {
        odds: [],
        error: `HTTP ${response.status}: ${errorText.slice(0, 100)}`,
        errorType
      };
    }

    const data = await response.json() as any[];
    return { odds: data };
  } catch (err: any) {
    return {
      odds: [],
      error: `Network error: ${err.message}`,
      errorType: 'NETWORK_ERROR'
    };
  }
}

/**
 * Odds API Provider
 * 
 * Provides odds availability checking for SportsRadar integration.
 * Actual odds data is fetched via sportsRadarOddsService.ts
 * 
 * Legacy fallback: This file maintains The Odds API format for compatibility
 * but primary odds fetching uses SportsRadar Odds Comparison API.
 */

import type { GameOdds, SportKey } from "./types";

// Legacy URL - kept for reference, actual odds use SportsRadar
const BASE_URL = "https://api.the-odds-api.com/v4";

// Map our sport keys to The Odds API sport keys
const SPORT_KEY_MAP: Record<SportKey, string> = {
  nfl: "americanfootball_nfl",
  nba: "basketball_nba",
  mlb: "baseball_mlb",
  nhl: "icehockey_nhl",
  ncaaf: "americanfootball_ncaaf",
  ncaab: "basketball_ncaab",
  soccer: "soccer_usa_mls", // Default to MLS, could expand
  mma: "mma_mixed_martial_arts",
  golf: "golf_pga_championship",
};

// Cache for odds data (5 minute TTL)
const oddsCache = new Map<string, { data: OddsResponse[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface Bookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: Market[];
}

interface Market {
  key: string;
  outcomes: Outcome[];
}

interface Outcome {
  name: string;
  price: number;
  point?: number;
}

interface OddsResponse {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
}

/**
 * Check if odds API key is configured (SportsRadar)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EnvWithOdds = { SPORTSRADAR_API_KEY?: string } & Record<string, any>;

export function isOddsApiAvailable(env: EnvWithOdds): boolean {
  return !!env.SPORTSRADAR_API_KEY;
}

/**
 * Fetch odds for a sport
 */
export async function fetchOddsForSport(
  sport: SportKey,
  env: EnvWithOdds
): Promise<{ odds: Map<string, GameOdds[]>; error?: string }> {
  if (!env.SPORTSRADAR_API_KEY) {
    return { odds: new Map(), error: "SPORTSRADAR_API_KEY not configured" };
  }

  const sportKey = SPORT_KEY_MAP[sport];
  if (!sportKey) {
    return { odds: new Map(), error: `Unsupported sport: ${sport}` };
  }

  // Check cache
  const cacheKey = `odds_${sportKey}`;
  const cached = oddsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { odds: parseOddsResponse(cached.data) };
  }

  try {
    const url = new URL(`${BASE_URL}/sports/${sportKey}/odds`);
    url.searchParams.set("apiKey", env.SPORTSRADAR_API_KEY || "");
    url.searchParams.set("regions", "us");
    url.searchParams.set("markets", "h2h,spreads,totals");
    url.searchParams.set("oddsFormat", "american");

    const response = await fetch(url.toString());
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Odds API error (${response.status}):`, errorText);
      return { odds: new Map(), error: `API error: ${response.status}` };
    }

    const data: OddsResponse[] = await response.json();
    
    // Log quota usage
    const remaining = response.headers.get("x-requests-remaining");
    const used = response.headers.get("x-requests-used");
    console.log(`Odds API quota - remaining: ${remaining}, used: ${used}`);

    // Cache the response
    oddsCache.set(cacheKey, { data, timestamp: Date.now() });

    return { odds: parseOddsResponse(data) };
  } catch (error) {
    console.error("Odds API fetch error:", error);
    return { odds: new Map(), error: String(error) };
  }
}

/**
 * Fetch odds for a specific game by team names
 */
export async function fetchOddsForGame(
  sport: SportKey,
  homeTeam: string,
  awayTeam: string,
  env: EnvWithOdds
): Promise<GameOdds[]> {
  const result = await fetchOddsForSport(sport, env);
  
  if (result.error || result.odds.size === 0) {
    return [];
  }

  // Try to find odds by team name matching
  for (const [key, odds] of result.odds) {
    const keyLower = key.toLowerCase();
    const homeLower = homeTeam.toLowerCase();
    const awayLower = awayTeam.toLowerCase();
    
    // Check if key contains both team names (in any order)
    if (
      (keyLower.includes(homeLower.split(" ").pop() || "") || 
       homeLower.includes(keyLower.split("_")[0])) &&
      (keyLower.includes(awayLower.split(" ").pop() || "") ||
       awayLower.includes(keyLower.split("_")[1] || ""))
    ) {
      return odds;
    }
  }

  return [];
}

/**
 * Parse odds response into a map keyed by normalized team names
 */
function parseOddsResponse(data: OddsResponse[]): Map<string, GameOdds[]> {
  const oddsMap = new Map<string, GameOdds[]>();

  for (const game of data) {
    const gameKey = normalizeTeamKey(game.away_team, game.home_team);
    const gameOdds: GameOdds[] = [];

    for (const bookmaker of game.bookmakers) {
      const odds = parseBookmakerOdds(bookmaker, game.home_team, game.away_team);
      if (odds) {
        gameOdds.push(odds);
      }
    }

    // Sort by bookmaker name and take top 5
    gameOdds.sort((a, b) => {
      // Prioritize well-known books
      const priority = ["DraftKings", "FanDuel", "BetMGM", "Caesars", "ESPN BET"];
      const aIdx = priority.findIndex(p => a.bookmaker.includes(p));
      const bIdx = priority.findIndex(p => b.bookmaker.includes(p));
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.bookmaker.localeCompare(b.bookmaker);
    });

    oddsMap.set(gameKey, gameOdds.slice(0, 5));
  }

  return oddsMap;
}

/**
 * Parse a single bookmaker's odds
 */
function parseBookmakerOdds(
  bookmaker: Bookmaker,
  homeTeam: string,
  awayTeam: string
): GameOdds | null {
  const h2h = bookmaker.markets.find(m => m.key === "h2h");
  const spreads = bookmaker.markets.find(m => m.key === "spreads");
  const totals = bookmaker.markets.find(m => m.key === "totals");

  if (!h2h) return null;

  const homeH2h = h2h.outcomes.find(o => o.name === homeTeam);
  const awayH2h = h2h.outcomes.find(o => o.name === awayTeam);
  
  const homeSpread = spreads?.outcomes.find(o => o.name === homeTeam);
  const total = totals?.outcomes.find(o => o.name === "Over");

  return {
    bookmaker: bookmaker.title,
    spread: homeSpread?.point !== undefined 
      ? `${homeSpread.point > 0 ? "+" : ""}${homeSpread.point}` 
      : "N/A",
    total: total?.point !== undefined ? `O/U ${total.point}` : "N/A",
    moneylineAway: awayH2h ? formatOdds(awayH2h.price) : "N/A",
    moneylineHome: homeH2h ? formatOdds(homeH2h.price) : "N/A",
    updated: bookmaker.last_update,
  };
}

/**
 * Format odds number to display string
 */
function formatOdds(price: number): string {
  if (price >= 0) {
    return `+${price}`;
  }
  return String(price);
}

/**
 * Create a normalized key from team names for matching
 */
function normalizeTeamKey(awayTeam: string, homeTeam: string): string {
  const normalize = (name: string) => 
    name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${normalize(awayTeam)}_${normalize(homeTeam)}`;
}

/**
 * Get available sports (legacy - uses SportsRadar key check)
 */
export async function getAvailableSports(
  env: EnvWithOdds
): Promise<string[]> {
  if (!env.SPORTSRADAR_API_KEY) {
    return [];
  }

  try {
    const url = new URL(`${BASE_URL}/sports`);
    url.searchParams.set("apiKey", env.SPORTSRADAR_API_KEY || "");

    const response = await fetch(url.toString());
    if (!response.ok) return [];

    const data: Array<{ key: string; active: boolean }> = await response.json();
    return data.filter(s => s.active).map(s => s.key);
  } catch {
    return [];
  }
}

/**
 * Clear the odds cache (useful for testing)
 */
export function clearOddsCache(): void {
  oddsCache.clear();
}

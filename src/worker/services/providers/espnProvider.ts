// @ts-nocheck
/**
 * ESPN Sports Data Provider
 * 
 * Uses ESPN's unofficial public API for real-time scores and schedules.
 * This API is free and doesn't require authentication.
 * 
 * Endpoints:
 * - Scoreboard: http://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard
 */

import type { Game } from "../../../shared/types";
import type {
  SportsDataProvider,
  SportKey,
  ProviderResponse,
  GameDetail,
  GameStats,
  Injury,
  Weather,
  GameOdds,
} from "./types";

// ESPN sport/league mappings
const ESPN_MAPPINGS: Record<SportKey, { sport: string; league: string }> = {
  nfl: { sport: "football", league: "nfl" },
  nba: { sport: "basketball", league: "nba" },
  mlb: { sport: "baseball", league: "mlb" },
  nhl: { sport: "hockey", league: "nhl" },
  ncaaf: { sport: "football", league: "college-football" },
  ncaab: { sport: "basketball", league: "mens-college-basketball" },
  soccer: { sport: "soccer", league: "eng.1" }, // Premier League
  mma: { sport: "mma", league: "ufc" },
  golf: { sport: "golf", league: "pga" },
  nascar: { sport: "racing", league: "nascar" },
};

const ESPN_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports";

function toEasternDateString(dateInput: string): string | null {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Map ESPN status to our status
 */
function mapStatus(espnStatus: string): Game["status"] {
  const statusMap: Record<string, Game["status"]> = {
    STATUS_SCHEDULED: "SCHEDULED",
    STATUS_IN_PROGRESS: "IN_PROGRESS",
    STATUS_HALFTIME: "IN_PROGRESS",
    STATUS_END_PERIOD: "IN_PROGRESS",
    STATUS_FINAL: "FINAL",
    STATUS_FINAL_OT: "FINAL",
    STATUS_POSTPONED: "POSTPONED",
    STATUS_CANCELED: "CANCELED",
    STATUS_SUSPENDED: "POSTPONED",
    STATUS_DELAYED: "IN_PROGRESS",
  };
  return statusMap[espnStatus] || "SCHEDULED";
}

/**
 * Extract period label from ESPN data
 */
function extractPeriodLabel(competition: any, sport: SportKey): string | undefined {
  const status = competition.status;
  if (!status || status.type?.state === "pre") return undefined;
  
  const period = status.period;
  if (!period) return undefined;
  const shortDetail = String(status?.type?.shortDetail || status?.type?.detail || "").trim();
  
  switch (sport) {
    case "nfl":
    case "ncaaf":
      return period <= 4 ? `Q${period}` : "OT";
    case "nba":
      return period <= 4 ? `Q${period}` : `OT${period - 4}`;
    case "ncaab":
      return period <= 2 ? `${period}H` : `OT${period - 2}`;
    case "nhl":
      return period <= 3 ? `P${period}` : `OT${period - 3}`;
    case "mlb":
      // ESPN often provides inning side in shortDetail (e.g. "Top 3rd", "Mid 2nd").
      // Preserve that first so Home cards can display baseball-native context.
      if (shortDetail) {
        const sideMatch = shortDetail.match(/\b(top|bottom|bot|middle|mid|end)\b(?:\s+of(?:\s+the)?|\s+the)?\s*(\d{1,2})(?:st|nd|rd|th)?/i);
        if (sideMatch) {
          const sideRaw = sideMatch[1].toLowerCase();
          const side =
            sideRaw === "bottom" ? "Bot"
            : sideRaw === "middle" ? "Mid"
            : sideRaw.charAt(0).toUpperCase() + sideRaw.slice(1);
          return `${side} ${sideMatch[2]}`;
        }
        if (/\b(top|bot|bottom|mid|middle|end)\b/i.test(shortDetail)) {
          return shortDetail;
        }
      }
      return `${period}`;
    case "soccer":
      return period === 1 ? "1H" : period === 2 ? "2H" : `ET${period - 2}`;
    default:
      return `P${period}`;
  }
}

function parseNumeric(value: unknown): number | undefined {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function readNascarDriverName(competitor: any): string {
  return String(
    competitor?.athlete?.displayName
    || competitor?.athlete?.fullName
    || competitor?.athlete?.shortName
    || competitor?.team?.displayName
    || competitor?.displayName
    || competitor?.name
    || ""
  ).trim();
}

function readExplicitNascarPosition(competitor: any): number | undefined {
  const position =
    parseNumeric(competitor?.order)
    ?? parseNumeric(competitor?.position)
    ?? parseNumeric(competitor?.rank)
    ?? parseNumeric(competitor?.place)
    ?? parseNumeric(competitor?.running_order);
  if (!Number.isFinite(position)) return undefined;
  return Math.max(1, Math.trunc(Number(position)));
}

function extractNascarRaceResults(competition: any): Array<{
  position: number;
  driver_name: string;
  driver_code?: string;
  points?: number;
  status?: string;
}> {
  const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
  const rows = competitors
    .map((c: any) => {
      const driverName = readNascarDriverName(c);
      if (!driverName) return null;
      const position = readExplicitNascarPosition(c);
      if (!position) return null;
      return {
        position,
        driver_name: driverName,
        driver_code: String(c?.athlete?.shortName || c?.athlete?.abbreviation || c?.team?.abbreviation || "").trim() || undefined,
        points: parseNumeric(c?.score),
        status: String(c?.status?.type?.shortDetail || c?.status?.type?.detail || "").trim() || undefined,
      };
    })
    .filter((row): row is { position: number; driver_name: string; driver_code?: string; points?: number; status?: string } => Boolean(row))
    .sort((a, b) => a.position - b.position);
  return rows;
}

function extractMlbProbablePitcher(competitor: any): { name?: string; record?: string } {
  const probable = Array.isArray(competitor?.probables)
    ? competitor.probables[0]
    : (competitor?.probable || competitor?.probablePitcher || null);
  if (!probable || typeof probable !== "object") return {};

  const name = String(
    probable?.athlete?.displayName
    || probable?.athlete?.fullName
    || probable?.player?.displayName
    || probable?.player?.fullName
    || probable?.displayName
    || probable?.fullName
    || probable?.name
    || ""
  ).trim();

  const stats = Array.isArray(probable?.statistics) ? probable.statistics : [];
  const recordFromStats = stats
    .map((entry: any) => String(entry?.displayValue || entry?.summary || entry?.value || "").trim())
    .find((value: string) => /\d+\s*-\s*\d+/.test(value));
  const recordRaw = String(
    probable?.record?.summary
    || probable?.record?.displayValue
    || probable?.record
    || probable?.summary
    || recordFromStats
    || ""
  ).trim();
  const recordMatch = recordRaw.match(/\d+\s*-\s*\d+/);
  const record = recordMatch ? recordMatch[0].replace(/\s+/g, "") : "";

  return {
    name: name || undefined,
    record: record || undefined,
  };
}

/**
 * Parse ESPN event to our Game format
 */
function parseESPNGame(event: any, sport: SportKey): Game {
  const competition = event.competitions?.[0] || {};
  const competitors = competition.competitors || [];
  
  // ESPN lists home team first sometimes, away first other times
  // The "homeAway" field tells us which is which
  const homeTeam = competitors.find((c: any) => c.homeAway === "home") || competitors[1];
  const awayTeam = competitors.find((c: any) => c.homeAway === "away") || competitors[0];
  
  const status = mapStatus(competition.status?.type?.name || "STATUS_SCHEDULED");
  const period = competition.status?.period;
  const clock = competition.status?.displayClock;
  const nascarResults = sport === "nascar" ? extractNascarRaceResults(competition) : [];
  const winnerNameFromResults = sport === "nascar" ? nascarResults.find((row) => row.position === 1)?.driver_name : undefined;
  const winnerNameFromCompetition = sport === "nascar"
    ? String(
        competition?.winner?.displayName
        || competition?.winner?.name
        || event?.winner?.displayName
        || event?.winner?.name
        || ""
      ).trim()
    : "";
  const winnerName = winnerNameFromCompetition || winnerNameFromResults || undefined;
  if (sport === "nascar" && status === "FINAL" && !winnerName) {
    console.warn("[ESPNProvider][nascar] Final event missing explicit winner fields", {
      eventId: event?.id,
      raceResultsCount: nascarResults.length,
    });
  }
  if (sport === "nascar" && status === "FINAL" && nascarResults.length > 0 && !nascarResults.some((row) => row.position === 1)) {
    console.warn("[ESPNProvider][nascar] Final event race_results missing P1", {
      eventId: event?.id,
      raceResultsCount: nascarResults.length,
    });
  }
  const fallbackHome = competitors[1] || competitors[0];
  const fallbackAway = competitors[0] || competitors[1];
  const resolvedHome = homeTeam || fallbackHome;
  const resolvedAway = awayTeam || fallbackAway;
  const awayProbablePitcher = sport === "mlb" ? extractMlbProbablePitcher(resolvedAway) : {};
  const homeProbablePitcher = sport === "mlb" ? extractMlbProbablePitcher(resolvedHome) : {};
  const probablePitchers = sport === "mlb" && (awayProbablePitcher.name || homeProbablePitcher.name)
    ? {
        away: awayProbablePitcher.name
          ? { name: awayProbablePitcher.name, record: awayProbablePitcher.record }
          : undefined,
        home: homeProbablePitcher.name
          ? { name: homeProbablePitcher.name, record: homeProbablePitcher.record }
          : undefined,
      }
    : undefined;
  
  return {
    game_id: `espn_${sport}_${event.id}`,
    external_id: event.id,
    sport,
    league: sport.toUpperCase(),
    status,
    period: status === "IN_PROGRESS" ? period : undefined,
    period_label: extractPeriodLabel(competition, sport),
    clock: status === "IN_PROGRESS" ? clock : undefined,
    away_team_code: resolvedAway?.team?.abbreviation || resolvedAway?.athlete?.shortName || "TBD",
    away_team_name: resolvedAway?.team?.displayName || resolvedAway?.athlete?.displayName || "TBD",
    away_score: status !== "SCHEDULED" ? parseInt(resolvedAway?.score || "0", 10) : undefined,
    home_team_code: resolvedHome?.team?.abbreviation || resolvedHome?.athlete?.shortName || "TBD",
    home_team_name: resolvedHome?.team?.displayName || resolvedHome?.athlete?.displayName || "TBD",
    home_score: status !== "SCHEDULED" ? parseInt(resolvedHome?.score || "0", 10) : undefined,
    start_time: event.date,
    venue: competition.venue?.fullName,
    broadcast: competition.broadcasts?.[0]?.names?.[0],
    last_updated_at: new Date().toISOString(),
    winner_name: winnerName,
    race_results: nascarResults.length > 0 ? nascarResults : undefined,
    probable_away_pitcher_name: awayProbablePitcher.name,
    probable_away_pitcher_record: awayProbablePitcher.record,
    probable_home_pitcher_name: homeProbablePitcher.name,
    probable_home_pitcher_record: homeProbablePitcher.record,
    probable_pitchers: probablePitchers,
  };
}

/**
 * Extract stats from ESPN competition data
 */
function extractStats(competition: any, sport: SportKey): GameStats[] {
  const stats: GameStats[] = [];
  const competitors = competition.competitors || [];
  
  const homeTeam = competitors.find((c: any) => c.homeAway === "home");
  const awayTeam = competitors.find((c: any) => c.homeAway === "away");
  
  if (!homeTeam?.statistics || !awayTeam?.statistics) return stats;
  
  // Map stat names by sport
  const statMappings: Record<SportKey, { name: string; label: string; category: string }[]> = {
    nfl: [
      { name: "totalYards", label: "Total Yards", category: "YDS" },
      { name: "turnovers", label: "Turnovers", category: "TO" },
      { name: "totalPenaltiesYards", label: "Penalties", category: "PEN" },
    ],
    nba: [
      { name: "fieldGoalPct", label: "Field Goal %", category: "FG%" },
      { name: "threePointFieldGoalPct", label: "3-Point %", category: "3PT%" },
      { name: "rebounds", label: "Rebounds", category: "REB" },
    ],
    mlb: [
      { name: "hits", label: "Hits", category: "H" },
      { name: "errors", label: "Errors", category: "E" },
      { name: "strikeouts", label: "Strikeouts", category: "K" },
    ],
    nhl: [
      { name: "shotsOnGoal", label: "Shots on Goal", category: "SOG" },
      { name: "powerPlayGoals", label: "Power Play", category: "PP" },
      { name: "faceoffWinPercentage", label: "Faceoff %", category: "FO%" },
    ],
    mma: [
      { name: "strikes", label: "Strikes", category: "STR" },
      { name: "takedowns", label: "Takedowns", category: "TD" },
    ],
    golf: [
      { name: "score", label: "Score", category: "SCR" },
      { name: "putts", label: "Putts", category: "PUT" },
    ],
    ncaaf: [
      { name: "totalYards", label: "Total Yards", category: "YDS" },
      { name: "turnovers", label: "Turnovers", category: "TO" },
      { name: "totalPenaltiesYards", label: "Penalties", category: "PEN" },
    ],
    ncaab: [
      { name: "fieldGoalPct", label: "Field Goal %", category: "FG%" },
      { name: "threePointFieldGoalPct", label: "3-Point %", category: "3PT%" },
      { name: "rebounds", label: "Rebounds", category: "REB" },
    ],
    soccer: [
      { name: "possessionPct", label: "Possession", category: "POSS" },
      { name: "shotsOnTarget", label: "Shots on Target", category: "SOT" },
      { name: "fouls", label: "Fouls", category: "FLS" },
    ],
  };
  
  const mappings = statMappings[sport] || [];
  
  for (const mapping of mappings) {
    const awayStat = awayTeam.statistics?.find((s: any) => s.name === mapping.name);
    const homeStat = homeTeam.statistics?.find((s: any) => s.name === mapping.name);
    
    if (awayStat || homeStat) {
      stats.push({
        category: mapping.category,
        label: mapping.label,
        awayValue: awayStat?.displayValue || awayStat?.value || "0",
        homeValue: homeStat?.displayValue || homeStat?.value || "0",
      });
    }
  }
  
  return stats;
}

/**
 * Extract injuries from ESPN roster data (if available)
 */
function extractInjuries(_competition: any): Injury[] {
  // ESPN doesn't include injury data in scoreboard API
  // Would need separate API call to team roster
  return [];
}

/**
 * Extract weather from ESPN venue data
 */
function extractWeather(competition: any): Weather | null {
  const weather = competition.weather;
  if (!weather) return null;
  
  return {
    condition: weather.displayValue || weather.description || "Unknown",
    temperature: weather.temperature || 70,
    wind: weather.wind?.displayValue || "0 mph",
    humidity: weather.humidity || 50,
  };
}

/**
 * Generate placeholder odds (ESPN doesn't provide odds)
 */
function generatePlaceholderOdds(_game: Game): GameOdds[] {
  // ESPN doesn't provide betting odds - would need The Odds API for real odds
  return [];
}

/**
 * ESPN Sports Data Provider
 */
export class ESPNProvider implements SportsDataProvider {
  readonly name = "ESPN";
  readonly supportedSports: SportKey[] = ["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab", "soccer", "mma", "golf", "nascar"];
  
  private cache = new Map<string, { data: any; timestamp: number }>();
  private cacheTTL = 30000; // 30 seconds for live data
  
  isAvailable(): boolean {
    return true; // ESPN API is always available (no auth required)
  }
  
  async fetchGames(
    sport: SportKey,
    options?: { date?: string; status?: Game["status"] }
  ): Promise<ProviderResponse<Game[]>> {
    const mapping = ESPN_MAPPINGS[sport];
    if (!mapping) {
      return {
        data: [],
        fromCache: false,
        provider: this.name,
        error: `Sport ${sport} not supported`,
      };
    }
    
    const cacheKey = `games_${sport}_${options?.date || "today"}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      let games = cached.data as Game[];
      if (options?.status) {
        games = games.filter(g => g.status === options.status);
      }
      return {
        data: games,
        fromCache: true,
        cachedAt: cached.timestamp,
        provider: this.name,
      };
    }
    
    try {
      const url = `${ESPN_BASE_URL}/${mapping.sport}/${mapping.league}/scoreboard`;
      const params = new URLSearchParams();
      
      if (options?.date) {
        params.set("dates", options.date.replace(/-/g, ""));
      }
      
      const response = await fetch(`${url}?${params}`, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "G1Sports/1.0",
        },
      });
      
      if (!response.ok) {
        throw new Error(`ESPN API error: ${response.status}`);
      }
      
      const data = await response.json() as any;
      const events = data.events || [];
      
      let games = events.map((event: any) => parseESPNGame(event, sport));

      // Hard guard: when a date is requested, only keep events on that ET calendar day.
      if (options?.date) {
        games = games.filter((g: Game) => {
          const eventDate = toEasternDateString(g.start_time);
          return eventDate === options.date;
        });
      }
      
      // Cache the results
      this.cache.set(cacheKey, { data: games, timestamp: Date.now() });
      
      // Filter by status if requested
      if (options?.status) {
        games = games.filter((g: Game) => g.status === options.status);
      }
      
      return {
        data: games,
        fromCache: false,
        provider: this.name,
      };
    } catch (error) {
      console.error(`ESPN fetchGames error for ${sport}:`, error);
      return {
        data: [],
        fromCache: false,
        provider: this.name,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
  
  async fetchGame(gameId: string): Promise<ProviderResponse<GameDetail | null>> {
    // Parse sport and ESPN ID from our game ID format: espn_{sport}_{espnId}
    const parts = gameId.split("_");
    if (parts[0] !== "espn" || parts.length < 3) {
      return {
        data: null,
        fromCache: false,
        provider: this.name,
        error: "Invalid ESPN game ID format",
      };
    }
    
    const sport = parts[1] as SportKey;
    const espnId = parts.slice(2).join("_");
    const mapping = ESPN_MAPPINGS[sport];
    
    if (!mapping) {
      return {
        data: null,
        fromCache: false,
        provider: this.name,
        error: `Sport ${sport} not supported`,
      };
    }
    
    const cacheKey = `game_${gameId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return {
        data: cached.data as GameDetail,
        fromCache: true,
        cachedAt: cached.timestamp,
        provider: this.name,
      };
    }
    
    try {
      // Fetch scoreboard and find the specific game
      const url = `${ESPN_BASE_URL}/${mapping.sport}/${mapping.league}/scoreboard`;
      const response = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "G1Sports/1.0",
        },
      });
      
      if (!response.ok) {
        throw new Error(`ESPN API error: ${response.status}`);
      }
      
      const data = await response.json() as any;
      const event = (data.events || []).find((e: any) => e.id === espnId);
      
      if (!event) {
        return {
          data: null,
          fromCache: false,
          provider: this.name,
          error: "Game not found",
        };
      }
      
      const game = parseESPNGame(event, sport);
      const competition = event.competitions?.[0] || {};
      
      const gameDetail: GameDetail = {
        game,
        stats: extractStats(competition, sport),
        playByPlay: [], // Would need separate API call
        injuries: extractInjuries(competition),
        weather: extractWeather(competition),
        odds: generatePlaceholderOdds(game),
      };
      
      // Cache the result
      this.cache.set(cacheKey, { data: gameDetail, timestamp: Date.now() });
      
      return {
        data: gameDetail,
        fromCache: false,
        provider: this.name,
      };
    } catch (error) {
      console.error(`ESPN fetchGame error for ${gameId}:`, error);
      return {
        data: null,
        fromCache: false,
        provider: this.name,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// Singleton instance
export const espnProvider = new ESPNProvider();

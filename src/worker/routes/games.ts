// @ts-nocheck
/**
 * Games API Routes
 * 
 * Provider-agnostic endpoints for game data.
 * Supports ESPN live data with automatic fallback to demo data.
 */

import { Hono } from "hono";
import { Redis } from "@upstash/redis";
import { authMiddleware } from "@getmocha/users-service/backend";
import {
  fetchGamesWithFallback,
  fetchLiveGamesWithFallback,
  fetchScheduledGamesWithFallback,
  fetchGameWithFallback,
  getProviderConfigs,
  updateProviderConfig,
  getActiveProviderName,
  isOddsApiAvailable,
  fetchOddsForSport,
  type SportKey,
} from "../services/providers";

import {
  processGameStateChange,
  type GameLifecycleInput,
  type ThresholdEvent,
} from "../services/thresholdEngine";
import {
  getTTLForGamesList,
  cacheHeaders,
  liveGameHeaders,
  scheduledGameHeaders,
  finalGameHeaders,
  type GameStatus,
} from "../services/responseCache";
import { getCachedData, setCachedData } from "../services/apiCacheService";
import type { Game } from "../../shared/types";
import { fetchSportsRadarOdds, fetchSportsRadarOddsForGame, captureAllOddsSnapshots, fetchGamePlayerProps, fetchAllSportsbooksForGame, getLineMovement, storeOpeningLines, captureOddsSnapshot, type SportsRadarOdds } from "../services/sportsRadarOddsService";
import {
  fetchStandingsCached,
  fetchTeamProfileCached,
  fetchPropsCached,
  getSportsRadarProvider,
  fetchDailySchedule,
  SOCCER_COMPETITIONS,
} from "../services/sports-data/sportsRadarProvider";
import type { SportKey as DataSportKey } from "../services/sports-data/types";

const gamesRouter = new Hono<{ Bindings: Env }>();
let redisClient: Redis | null | undefined;
function getRedisClient(env: Partial<Env> = {}): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = String(env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const token = String(env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  if (!url || !token) {
    redisClient = null;
    return redisClient;
  }
  redisClient = new Redis({ url, token });
  return redisClient;
}
const ODDS_DEBUG_LOGS = false;
const scoreboardListCache = new Map<string, { expiresAt: number; payload: Record<string, unknown> }>();
const SCOREBOARD_LIST_CACHE_TTL_MS = 20000;
const liveResponseCache = new Map<string, { expiresAt: number; staleExpiresAt: number; payload: Record<string, unknown> }>();
const LIVE_CACHE_TTL_MS = 12000;
const LIVE_STALE_WINDOW_MS = 120000;

function getLiveCacheKey(sports: SportKey[] | undefined): string {
  if (!sports || sports.length === 0) return 'all';
  return [...sports].sort().join(',');
}

function getLivePersistentCacheKeys(cacheKey: string): { primary: string; backup: string } {
  return {
    primary: `games_live_v1:${cacheKey}`,
    backup: `games_live_v1_backup:${cacheKey}`,
  };
}

function getGamesPersistentCacheKeys(cacheKey: string): { primary: string; backup: string } {
  return {
    primary: `games_list_v2:${cacheKey}`,
    backup: `games_list_v2_backup:${cacheKey}`,
  };
}

function hasGamesRows(payload: unknown): boolean {
  const rows = Array.isArray((payload as any)?.games) ? (payload as any).games : [];
  return rows.length > 0;
}
const nascarLiveSnapshotTelemetry = {
  requests: 0,
  failures: 0,
  timeouts: 0,
  successes: 0,
  lastLatencyMs: 0,
  avgLatencyMs: 0,
};

const SUPPORTED_SPORTS: SportKey[] = ["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab", "soccer", "mma", "golf", "nascar"];
const DATA_SPORT_KEY_MAP: Record<string, DataSportKey> = {
  nfl: "NFL",
  nba: "NBA",
  mlb: "MLB",
  nhl: "NHL",
  ncaaf: "NCAAF",
  ncaab: "NCAAB",
  soccer: "SOCCER",
  mma: "MMA",
  golf: "GOLF",
  nascar: "NASCAR",
};

function parseThresholdNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

function getTodayEasternDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getEasternDateString(value: string | Date | null | undefined): string {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function normalizeSoccerScheduleStatus(rawStatus: unknown): Game["status"] {
  const status = String(rawStatus || "").trim().toUpperCase();
  if (
    status === "LIVE" ||
    status === "IN_PROGRESS" ||
    status === "INPROGRESS" ||
    status === "1ST_HALF" ||
    status === "2ND_HALF" ||
    status === "HALFTIME"
  ) {
    return "IN_PROGRESS";
  }
  if (
    status === "FINAL" ||
    status === "CLOSED" ||
    status === "ENDED" ||
    status === "COMPLETE" ||
    status === "AFTER_PENALTIES"
  ) {
    return "FINAL";
  }
  if (status === "POSTPONED" || status === "DELAYED" || status === "SUSPENDED") {
    return "POSTPONED";
  }
  if (status === "CANCELED" || status === "ABANDONED") {
    return "CANCELED";
  }
  return "SCHEDULED";
}

function toTeamCode(name: string, fallback = "SOC"): string {
  const normalized = String(name || "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .trim();
  if (!normalized) return fallback;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const code = `${words[0][0] || ""}${words[1][0] || ""}${words[2]?.[0] || ""}`.toUpperCase();
    return code.slice(0, 3);
  }
  return normalized.slice(0, 3).toUpperCase();
}

function normalizeSoccerLeagueLabel(rawLeague: unknown): string {
  const upper = String(rawLeague || "").trim().toUpperCase();
  if (!upper) return "SOCCER";
  if (upper === "PREMIER LEAGUE") return "EPL";
  if (upper === "MAJOR LEAGUE SOCCER") return "MLS";
  if (upper === "UEFA CHAMPIONS LEAGUE") return "UCL";
  if (upper === "UEFA EUROPA LEAGUE") return "UEL";
  if (upper === "UEFA CONFERENCE LEAGUE") return "UECL";
  if (upper === "LALIGA" || upper === "LA LIGA") return "LA_LIGA";
  if (upper === "SERIE A") return "SERIE_A";
  if (upper === "BUNDESLIGA") return "BUNDESLIGA";
  if (upper === "LIGUE 1") return "LIGUE_1";
  if (upper === "LIGA MX") return "LIGA_MX";
  return upper;
}

const SOCCER_LEAGUE_TEAM_HINTS: Record<"EPL" | "LA_LIGA" | "MLS" | "UCL", { codes: Set<string>; names: string[] }> = {
  EPL: {
    codes: new Set(["ARS", "AVL", "BHA", "BOU", "BRE", "BUR", "CHE", "CRY", "EVE", "FUL", "IPS", "LEE", "LEI", "LIV", "MCI", "MUN", "NEW", "NFO", "SOU", "TOT", "WHU", "WOL"]),
    names: ["ARSENAL", "ASTON VILLA", "BRIGHTON", "BOURNEMOUTH", "BRENTFORD", "BURNLEY", "CHELSEA", "CRYSTAL PALACE", "EVERTON", "FULHAM", "IPSWICH", "LEEDS", "LEICESTER", "LIVERPOOL", "MANCHESTER CITY", "MANCHESTER UNITED", "NEWCASTLE", "NOTTINGHAM", "SOUTHAMPTON", "TOTTENHAM", "WEST HAM", "WOLVERHAMPTON"],
  },
  LA_LIGA: {
    codes: new Set(["ALA", "ALV", "ATH", "ATM", "BAR", "BET", "CEL", "ESP", "GET", "GIR", "LEG", "LEV", "MLL", "OSA", "RAY", "RMA", "RSO", "SEV", "VAL", "VIL"]),
    names: ["ALAVES", "ATHLETIC", "ATLETICO", "BARCELONA", "BETIS", "CELTA", "ESPANYOL", "GETAFE", "GIRONA", "LEGANES", "LEVANTE", "MALLORCA", "OSASUNA", "RAYO", "REAL MADRID", "REAL SOCIEDAD", "SEVILLA", "VALENCIA", "VILLARREAL"],
  },
  MLS: {
    codes: new Set(["ATL", "ATX", "AUS", "CHI", "CIN", "CLB", "CLT", "COL", "DAL", "DC", "DCU", "HOU", "LAF", "LAG", "MIA", "MIN", "MTL", "NAS", "NE", "NER", "NYC", "NYRB", "ORL", "PHI", "POR", "RSL", "SEA", "SJE", "SKC", "STL", "TOR", "VAN"]),
    names: ["ATLANTA UNITED", "AUSTIN", "CHICAGO FIRE", "CINCINNATI", "COLUMBUS CREW", "CHARLOTTE", "COLORADO RAPIDS", "FC DALLAS", "D.C. UNITED", "HOUSTON DYNAMO", "LAFC", "LOS ANGELES FC", "LA GALAXY", "INTER MIAMI", "MINNESOTA UNITED", "MONTREAL", "NASHVILLE", "NEW ENGLAND", "NEW YORK CITY", "NEW YORK RED BULLS", "ORLANDO CITY", "PHILADELPHIA UNION", "PORTLAND TIMBERS", "REAL SALT LAKE", "SEATTLE SOUNDERS", "SAN JOSE", "SPORTING KANSAS CITY", "ST. LOUIS CITY", "TORONTO FC", "VANCOUVER WHITECAPS"],
  },
  UCL: {
    codes: new Set(["RMA", "BAR", "BAY", "PSG", "JUV", "INT", "ACM", "DOR", "BEN", "POR", "ATM", "AJA", "LIV", "MCI", "MUN", "ARS"]),
    names: ["CHAMPIONS LEAGUE", "REAL MADRID", "BARCELONA", "BAYERN", "PARIS SAINT-GERMAIN", "JUVENTUS", "INTER", "MILAN", "DORTMUND", "BENFICA", "PORTO", "ATLETICO", "AJAX"],
  },
};

function inferSoccerLeagueFromTeams(game: Partial<Game>): string | null {
  const knownLeague = normalizeSoccerLeagueLabel(game.league || "");
  if (knownLeague !== "SOCCER") return knownLeague;

  const homeCode = String(game.home_team_code || "").toUpperCase().trim();
  const awayCode = String(game.away_team_code || "").toUpperCase().trim();
  const homeName = String(game.home_team_name || "").toUpperCase();
  const awayName = String(game.away_team_name || "").toUpperCase();
  if ((!homeCode && !homeName) || (!awayCode && !awayName)) return null;

  const candidateLeagues = Object.entries(SOCCER_LEAGUE_TEAM_HINTS).filter(([league, hints]) => {
    const homeCodeHit = homeCode && hints.codes.has(homeCode);
    const awayCodeHit = awayCode && hints.codes.has(awayCode);
    const homeNameHit = hints.names.some((token) => homeName.includes(token));
    const awayNameHit = hints.names.some((token) => awayName.includes(token));
    const homeHit = Boolean(homeCodeHit || homeNameHit);
    const awayHit = Boolean(awayCodeHit || awayNameHit);
    return homeHit && awayHit;
  });

  if (candidateLeagues.length === 1) {
    return candidateLeagues[0][0];
  }
  return null;
}

async function fetchSoccerGamesFromSportsRadarDailySchedule(
  dateYmd: string,
  status?: Game["status"],
  env?: Partial<Env>
): Promise<{ games: Game[]; error?: string }> {
  const scheduleApiKey = String(env?.SPORTSRADAR_PLAYER_PROPS_API_KEY || env?.SPORTSRADAR_API_KEY || "").trim();
  const coreApiKey = String(env?.SPORTSRADAR_API_KEY || env?.SPORTSRADAR_PLAYER_PROPS_API_KEY || "").trim();
  if (!scheduleApiKey && !coreApiKey) {
    return { games: [], error: "SportsRadar API key missing for soccer schedule" };
  }
  const parsedDate = new Date(`${dateYmd}T12:00:00.000Z`);
  const targetDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const schedule = scheduleApiKey
    ? await fetchDailySchedule(scheduleApiKey, "SOCCER", targetDate)
    : { events: [], errors: ["SportsRadar daily schedule key unavailable"] };
  const seen = new Set<string>();
  const games: Game[] = [];
  const pushGame = (input: {
    eventId: string;
    league?: string | null;
    status: unknown;
    homeAbbr?: string | null;
    awayAbbr?: string | null;
    homeName: string;
    awayName: string;
    start: Date | string | null | undefined;
    homeScore?: number | null;
    awayScore?: number | null;
  }) => {
    const rawEventId = String(input.eventId || "").trim();
    if (!rawEventId || seen.has(rawEventId)) return;
    const normalizedStatus = normalizeSoccerScheduleStatus(input.status);
    if (status && normalizedStatus !== status) return;
    const startDate = input.start instanceof Date ? input.start : new Date(String(input.start || ""));
    const startIso = Number.isNaN(startDate.getTime()) ? new Date().toISOString() : startDate.toISOString();
    const eventId = rawEventId.startsWith("sr:sport_event:") ? rawEventId : `sr:sport_event:${rawEventId}`;
    games.push({
      game_id: eventId,
      external_id: rawEventId.replace(/^sr:sport_event:/, ""),
      sport: "soccer",
      league: normalizeSoccerLeagueLabel(input.league || "SOCCER"),
      start_time: startIso,
      status: normalizedStatus,
      home_team_code: String(input.homeAbbr || "").trim().toUpperCase() || toTeamCode(input.homeName, "HOM"),
      home_team_name: input.homeName,
      away_team_code: String(input.awayAbbr || "").trim().toUpperCase() || toTeamCode(input.awayName, "AWY"),
      away_team_name: input.awayName,
      home_score: typeof input.homeScore === "number" ? input.homeScore : undefined,
      away_score: typeof input.awayScore === "number" ? input.awayScore : undefined,
      last_updated_at: new Date().toISOString(),
      source_provider: "sportsradar",
    } as Game);
    seen.add(rawEventId);
  };

  if (Array.isArray(schedule.events) && schedule.events.length > 0) {
    for (const event of schedule.events) {
      pushGame({
        eventId: String(event?.eventId || ""),
        league: "SOCCER",
        status: event?.status,
        homeName: String(event?.homeTeam || "Home"),
        awayName: String(event?.awayTeam || "Away"),
        start: event?.startTime,
      });
    }
    if (games.length > 0) return { games };
  }

  // Fallback when odds-comparison daily schedule is unavailable for this key:
  // pull daily fixtures across major SportsRadar soccer competitions.
  if (!coreApiKey) {
    return {
      games: [],
      error: schedule.errors[0] || "SportsRadar soccer schedule returned no events",
    };
  }

  const provider = getSportsRadarProvider(coreApiKey, null);
  const competitionKeys = [
    "premier-league",
    "la-liga",
    "serie-a",
    "bundesliga",
    "ligue-1",
    "eredivisie",
    "primeira-liga",
    "mls",
    "liga-mx",
    "brasileirao",
    "argentina-primera",
    "champions-league",
    "europa-league",
    "conference-league",
  ].filter((key) => Boolean((SOCCER_COMPETITIONS as Record<string, unknown>)[key]));
  const targetDateYmd = dateYmd;
  const competitionResults = await Promise.allSettled(
    competitionKeys.map((key) => provider.fetchSoccerSchedule(key, coreApiKey))
  );
  for (let i = 0; i < competitionResults.length; i += 1) {
    const result = competitionResults[i];
    if (result.status !== "fulfilled") continue;
    const payload = result.value;
    const leagueName = String(payload?.competition?.name || competitionKeys[i] || "SOCCER");
    const matches = Array.isArray(payload?.matches) ? payload.matches : [];
    for (const match of matches) {
      const matchDateYmd = getEasternDateString(match?.startTime instanceof Date ? match.startTime : match?.startTime || "");
      if (matchDateYmd !== targetDateYmd) continue;
      pushGame({
        eventId: String(match?.eventId || ""),
        league: leagueName,
        status: match?.status,
        homeAbbr: String(match?.homeTeamAbbreviation || ""),
        awayAbbr: String(match?.awayTeamAbbreviation || ""),
        homeName: String(match?.homeTeamName || "Home"),
        awayName: String(match?.awayTeamName || "Away"),
        start: match?.startTime,
        homeScore: match?.homeScore ?? null,
        awayScore: match?.awayScore ?? null,
      });
    }
  }

  if (games.length > 0) {
    return { games };
  }
  return {
    games: [],
    error: schedule.errors[0] || "SportsRadar soccer schedule returned no events",
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallbackValue), timeoutMs);
  });
  const result = await Promise.race([promise, timeoutPromise]);
  if (timer) clearTimeout(timer);
  return result;
}

function getScoreboardListCacheKey(sport: SportKey | undefined, status: Game["status"] | undefined, date: string, includeOdds: boolean): string {
  return `${sport || "all"}|${status || "all"}|${date}|${includeOdds ? "1" : "0"}`;
}

function normalizeNascarNameToken(value: string): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function parseNascarRaceResults(game: any): Array<{ position: number; driverName: string }> {
  const rows = Array.isArray(game?.race_results) ? game.race_results : [];
  return rows
    .map((row: any, idx: number) => {
      const driverName = String(
        row?.driver_name
        || row?.name
        || row?.displayName
        || row?.athlete?.displayName
        || row?.team?.displayName
        || ""
      ).trim();
      const positionRaw = Number(row?.position ?? row?.order ?? row?.rank ?? row?.place);
      const position = Number.isFinite(positionRaw) ? Math.max(1, Math.trunc(positionRaw)) : idx + 1;
      if (!driverName) return null;
      return { position, driverName };
    })
    .filter((row): row is { position: number; driverName: string } => Boolean(row))
    .sort((a, b) => a.position - b.position);
}

function hasVerifiedNascarRaceResults(rows: Array<{ position: number; driverName: string }>): boolean {
  if (!Array.isArray(rows) || rows.length < 3) return false;
  const first = rows.find((row) => row.position === 1);
  if (!first || !first.driverName) return false;
  const uniquePositions = new Set(rows.map((row) => row.position).filter((n) => Number.isFinite(n)));
  return uniquePositions.size >= 3;
}

function extractNascarWinnerName(game: any): string | null {
  const direct = String(
    game?.winner_name
    || game?.winner
    || game?.winnerName
    || game?.result?.winner_name
    || game?.result?.winner
    || ""
  ).trim();
  if (direct) return direct;
  const raceRows = parseNascarRaceResults(game);
  const first = raceRows.find((row) => row.position === 1)?.driverName || "";
  return first || null;
}

function toSportsRadarEventId(gameId: string): string | null {
  if (gameId.startsWith("sr:sport_event:")) return gameId;
  if (!gameId.startsWith("sr_")) return null;
  const parts = gameId.split("_");
  if (parts.length < 3) return null;
  return `sr:sport_event:${parts.slice(2).join("-")}`;
}

function toSportsRadarMatchId(gameId: string): string | null {
  if (gameId.startsWith("sr:match:")) return gameId;
  if (!gameId.startsWith("sr_")) return null;
  const parts = gameId.split("_");
  if (parts.length < 3) return null;
  return `sr:match:${parts.slice(2).join("_")}`;
}

function buildLineHistoryIdCandidates(gameId: string): string[] {
  const raw = String(gameId || "").trim();
  if (!raw) return [];
  const candidates = new Set<string>([raw]);
  const srEventId = toSportsRadarEventId(raw);
  if (srEventId) candidates.add(srEventId);
  const srMatchId = toSportsRadarMatchId(raw);
  if (srMatchId) candidates.add(srMatchId);
  if (raw.startsWith("sr_")) {
    const parts = raw.split("_");
    const sport = parts[1] || "";
    const tailUnderscore = parts.slice(2).join("_");
    if (tailUnderscore) {
      const tailHyphen = tailUnderscore.replace(/_/g, "-");
      candidates.add(tailUnderscore);
      candidates.add(tailHyphen);
      if (sport) {
        candidates.add(`sr_${sport}_${tailUnderscore}`);
        candidates.add(`sr_${sport}_${tailHyphen}`);
      }
      candidates.add(`sr:sport_event:${tailHyphen}`);
      candidates.add(`sr:sport_event:${tailUnderscore}`);
      candidates.add(`sr:match:${tailUnderscore}`);
      candidates.add(`sr:match:${tailHyphen}`);
    }
  }
  if (raw.startsWith("sr:sport_event:")) {
    const tail = raw.replace("sr:sport_event:", "");
    candidates.add(tail);
    candidates.add(tail.replace(/_/g, "-"));
    candidates.add(tail.replace(/-/g, "_"));
    const maybeSportHint = ["nba", "nfl", "mlb", "nhl", "ncaab", "ncaaf", "soccer", "mma", "golf", "nascar"];
    for (const sport of maybeSportHint) {
      candidates.add(`sr_${sport}_${tail.replace(/-/g, "_")}`);
      candidates.add(`sr_${sport}_${tail.replace(/_/g, "-")}`);
    }
  }
  if (raw.startsWith("sr:match:")) {
    const tail = raw.replace("sr:match:", "");
    candidates.add(tail);
    candidates.add(tail.replace(/_/g, "-"));
    candidates.add(tail.replace(/-/g, "_"));
  }
  const parts = raw.split("_").filter(Boolean);
  if (parts.length > 0) {
    candidates.add(parts[parts.length - 1]);
  }
  return Array.from(candidates).slice(0, 16);
}

function normalizePropGameId(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function buildPropIsolationIdCandidates(gameId: string): Set<string> {
  const raw = String(gameId || "").trim();
  const out = new Set<string>();
  if (!raw) return out;

  const add = (value: string | null | undefined) => {
    const normalized = normalizePropGameId(String(value || ""));
    if (normalized) out.add(normalized);
  };

  add(raw);
  add(toSportsRadarEventId(raw));
  add(toSportsRadarMatchId(raw));

  if (raw.startsWith("sr_")) {
    const parts = raw.split("_");
    const tailUnderscore = parts.slice(2).join("_");
    if (tailUnderscore) {
      const tailHyphen = tailUnderscore.replace(/_/g, "-");
      add(tailUnderscore);
      add(tailHyphen);
      add(`sr:sport_event:${tailHyphen}`);
      add(`sr:sport_event:${tailUnderscore}`);
      add(`sr:match:${tailUnderscore}`);
      add(`sr:match:${tailHyphen}`);
    }
  }

  if (raw.startsWith("sr:sport_event:")) {
    const tail = raw.replace("sr:sport_event:", "");
    add(tail);
    add(tail.replace(/-/g, "_"));
    add(tail.replace(/_/g, "-"));
  }

  if (raw.startsWith("sr:match:")) {
    const tail = raw.replace("sr:match:", "");
    add(tail);
    add(tail.replace(/-/g, "_"));
    add(tail.replace(/_/g, "-"));
  }

  return out;
}

function extractPropGameIds(prop: Record<string, unknown>): string[] {
  const idFields = [
    prop.providerGameId,
    prop.provider_game_id,
    prop.providerEventId,
    prop.provider_event_id,
    prop.sportEventId,
    prop.sport_event_id,
    prop.eventId,
    prop.event_id,
    prop.gameId,
    prop.game_id,
  ];
  return idFields
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function isPropMappedToGame(prop: Record<string, unknown>, candidateIds: Set<string>): boolean {
  const propIds = extractPropGameIds(prop);
  if (propIds.length === 0) return false;

  for (const id of propIds) {
    const propCandidates = buildPropIsolationIdCandidates(id);
    for (const candidate of propCandidates) {
      if (candidateIds.has(candidate)) return true;
    }
  }
  return false;
}

function getSportsRadarPropsKey(env: Env): string | null {
  const keyChain = [
    env.SPORTSRADAR_ODDS_KEY,
    env.SPORTSRADAR_PLAYER_PROPS_KEY,
    env.SPORTSRADAR_PROPS_KEY,
    env.SPORTSRADAR_API_KEY,
  ];
  return keyChain.find((key): key is string => Boolean(key && key.trim().length > 0)) ?? null;
}

async function fetchCompetitionPropsForGame(
  env: Env,
  gameId: string,
  sport: string
): Promise<any[]> {
  const propsKey = getSportsRadarPropsKey(env);
  const dataSport = DATA_SPORT_KEY_MAP[sport.toLowerCase()];
  if (!propsKey || !env.DB || !dataSport) return [];

  try {
    const provider = getSportsRadarProvider(null, propsKey);
    const result = await fetchPropsCached(env.DB, provider, dataSport, propsKey);
    if (!Array.isArray(result.props) || result.props.length === 0) return [];

    const candidateIds = buildPropIsolationIdCandidates(gameId);
    const matchedById = result.props.filter((prop) =>
      isPropMappedToGame(prop as unknown as Record<string, unknown>, candidateIds)
    );
    if (matchedById.length === 0) return [];

    return matchedById.map((prop, idx) => ({
      playerId: prop.playerId || `sr_prop_${idx}`,
      playerName: prop.playerName,
      team: prop.team || "",
      type: prop.propType,
      line: prop.lineValue,
      overOdds: prop.oddsAmerican ?? -110,
      underOdds: prop.oddsAmerican ?? -110,
      sportsbook: prop.sportsbook || "SportsRadar",
      isPlaceholder: false,
      providerGameId: prop.providerGameId || prop.provider_game_id || prop.sportEventId || prop.sport_event_id || prop.eventId || prop.event_id,
      providerEventId: prop.providerEventId || prop.provider_event_id || prop.sportEventId || prop.sport_event_id || prop.eventId || prop.event_id,
    }));
  } catch (err) {
    console.log("[Games API] Competition props fallback fetch failed:", err);
    return [];
  }
}

// ============ Placeholder Props Generator ============

/**
 * Generate placeholder props for scheduled games
 * Real props typically become available closer to game time (a few hours before)
 */
function normalizeTeamLabel(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pickRosterPlayerNames(roster: unknown, fallbackLabel: string): string[] {
  if (!Array.isArray(roster)) return [`${fallbackLabel} Star`, `${fallbackLabel} Guard`];
  const names = roster
    .map((p) => {
      if (!p || typeof p !== "object") return null;
      const record = p as Record<string, unknown>;
      const fullName = typeof record.full_name === "string" ? record.full_name : "";
      const altName = typeof record.name === "string" ? record.name : "";
      return (fullName || altName).trim() || null;
    })
    .filter((name): name is string => Boolean(name));

  if (names.length === 0) return [`${fallbackLabel} Star`, `${fallbackLabel} Guard`];
  return names.slice(0, 2);
}

async function getPlaceholderPlayerSeed(
  env: Env,
  sport: string,
  homeTeam: string,
  awayTeam: string
): Promise<{ homePlayers: string[]; awayPlayers: string[] }> {
  const apiKey = env.SPORTSRADAR_API_KEY;
  const dataSport = DATA_SPORT_KEY_MAP[sport];
  if (!apiKey || !env.DB || !dataSport) {
    return {
      homePlayers: [`${homeTeam.split(" ").pop() || homeTeam} Star`, `${homeTeam.split(" ").pop() || homeTeam} Guard`],
      awayPlayers: [`${awayTeam.split(" ").pop() || awayTeam} Star`, `${awayTeam.split(" ").pop() || awayTeam} Forward`],
    };
  }

  try {
    const standings = await fetchStandingsCached(env.DB, dataSport, apiKey);
    const teams = Array.isArray(standings.teams) ? standings.teams : [];
    const homeNorm = normalizeTeamLabel(homeTeam);
    const awayNorm = normalizeTeamLabel(awayTeam);
    const findTeam = (targetNorm: string) =>
      teams.find((team) => {
        const market = typeof team?.market === "string" ? team.market : "";
        const name = typeof team?.name === "string" ? team.name : "";
        const alias = typeof team?.alias === "string" ? team.alias : "";
        const fullNorm = normalizeTeamLabel(`${market} ${name}`.trim());
        const aliasNorm = normalizeTeamLabel(alias);
        return fullNorm.includes(targetNorm) || targetNorm.includes(fullNorm) || aliasNorm === targetNorm;
      });

    const homeMatch = findTeam(homeNorm);
    const awayMatch = findTeam(awayNorm);

    const [homeProfile, awayProfile] = await Promise.all([
      homeMatch?.id ? fetchTeamProfileCached(env.DB, dataSport, String(homeMatch.id), apiKey) : null,
      awayMatch?.id ? fetchTeamProfileCached(env.DB, dataSport, String(awayMatch.id), apiKey) : null,
    ]);

    return {
      homePlayers: pickRosterPlayerNames(homeProfile?.roster, homeTeam.split(" ").pop() || homeTeam),
      awayPlayers: pickRosterPlayerNames(awayProfile?.roster, awayTeam.split(" ").pop() || awayTeam),
    };
  } catch {
    return {
      homePlayers: [`${homeTeam.split(" ").pop() || homeTeam} Star`, `${homeTeam.split(" ").pop() || homeTeam} Guard`],
      awayPlayers: [`${awayTeam.split(" ").pop() || awayTeam} Star`, `${awayTeam.split(" ").pop() || awayTeam} Forward`],
    };
  }
}

async function generatePlaceholderProps(sport: string, homeTeam: string, awayTeam: string, env: Env) {
  // Fix duplicate city bug ("Phoenix Phoenix Suns" -> "Phoenix Suns")
  const cleanTeam = (name: string) => {
    const words = name.split(' ');
    if (words.length >= 2 && words[0].toLowerCase() === words[1].toLowerCase()) {
      return words.slice(1).join(' ');
    }
    return name;
  };
  
  const cleanHome = cleanTeam(homeTeam);
  const cleanAway = cleanTeam(awayTeam);
  
  const PROP_TEMPLATES: Record<string, Array<{ type: string; line: number }>> = {
    nba: [
      { type: 'Points', line: 24.5 },
      { type: 'Rebounds', line: 8.5 },
      { type: 'Assists', line: 6.5 },
      { type: 'Three Pointers Made', line: 2.5 },
      { type: 'Points + Rebounds + Assists', line: 38.5 },
    ],
    nhl: [
      { type: 'Points', line: 0.5 },
      { type: 'Shots on Goal', line: 2.5 },
      { type: 'Saves', line: 26.5 },
      { type: 'Goals', line: 0.5 },
    ],
    mlb: [
      { type: 'Strikeouts', line: 5.5 },
      { type: 'Hits', line: 1.5 },
      { type: 'RBIs', line: 0.5 },
      { type: 'Total Bases', line: 1.5 },
    ],
    ncaab: [
      { type: 'Points', line: 18.5 },
      { type: 'Rebounds', line: 6.5 },
      { type: 'Assists', line: 4.5 },
    ],
  };

  const templates = PROP_TEMPLATES[sport] || PROP_TEMPLATES['nba'];
  if (!templates || templates.length === 0) return [];

  // Generate props with real roster names when available.
  const seed = await getPlaceholderPlayerSeed(env, sport, cleanHome, cleanAway);
  const players = [
    seed.homePlayers[0],
    seed.homePlayers[1] || seed.homePlayers[0],
    seed.awayPlayers[0],
    seed.awayPlayers[1] || seed.awayPlayers[0],
  ];

  const props: any[] = [];
  players.forEach((player, idx) => {
    const template = templates[idx % templates.length];
    props.push({
      playerId: `placeholder_${idx}`,
      playerName: player,
      team: idx < 2 ? cleanHome : cleanAway,
      type: template.type,
      line: template.line,
      overOdds: -110,
      underOdds: -110,
      sportsbook: 'Preview',
      isPlaceholder: true,
    });
  });

  return props;
}

// ============ Odds Enrichment Helper ============

/**
 * Fetch odds from SportsRadar Odds Comparison API and merge into games
 */
const ODDS_SPORTS = ['nba', 'nfl', 'mlb', 'nhl', 'ncaab', 'ncaaf', 'soccer', 'mma', 'golf', 'nascar'] as const;

type MergedOdds = {
  spread?: number;
  total?: number;
  moneylineHome?: number;
  moneylineAway?: number;
  sourceGameId?: string;
};

function getMatchedOddsForGame(game: Game, combinedOddsMap: Map<string, MergedOdds>): MergedOdds | null {
  const sport = game.sport?.toLowerCase() || '';
  const homeName = game.home_team_name?.split(' ').pop()?.toLowerCase() || '';
  const awayName = game.away_team_name?.split(' ').pop()?.toLowerCase() || '';
  const gameIdParts = game.game_id?.split('_') || [];
  const srEventId = gameIdParts.length >= 3
    ? `sr:sport_event:${gameIdParts.slice(2).join('-')}`
    : null;

  const keys = [
    srEventId,
    `${sport}|${awayName}|${homeName}`,
    `${sport}|${game.away_team_name?.toLowerCase()}|${game.home_team_name?.toLowerCase()}`,
    game.game_id,
  ].filter(Boolean) as string[];

  for (const key of keys) {
    const odds = combinedOddsMap.get(key);
    if (odds) return odds;
  }
  return null;
}

function toSnapshotOdds(game: Game, odds: MergedOdds): SportsRadarOdds {
  const spreadHome = odds.spread ?? null;
  return {
    gameId: game.game_id,
    sportEventId: toSportsRadarEventId(game.game_id) || game.game_id,
    homeTeam: game.home_team_name || "",
    awayTeam: game.away_team_name || "",
    spread: spreadHome,
    spreadHome,
    spreadAway: spreadHome !== null ? -spreadHome : null,
    total: odds.total ?? null,
    moneylineHome: odds.moneylineHome ?? null,
    moneylineAway: odds.moneylineAway ?? null,
    spread1HHome: null,
    spread1HAway: null,
    total1H: null,
    moneyline1HHome: null,
    moneyline1HAway: null,
  };
}

async function persistAliasSnapshotsForGames(
  games: Game[],
  combinedOddsMap: Map<string, MergedOdds>,
  env: Env
): Promise<void> {
  if (!env.DB || games.length === 0 || combinedOddsMap.size === 0) return;

  const cloneHistoryFromSource = async (sourceGameId: string, aliasGameId: string) => {
    if (!env.DB || !sourceGameId || !aliasGameId || sourceGameId === aliasGameId) return;

    try {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO odds_opening
        (data_scope, game_id, bookmaker_key, market_key, outcome_key, opening_line_value, opening_price_american, opening_price_decimal, opened_at, created_at, updated_at)
        SELECT
          'PROD',
          ?,
          COALESCE(o.bookmaker_key, 'consensus'),
          o.market_key,
          o.outcome_key,
          o.opening_line_value,
          o.opening_price_american,
          o.opening_price_decimal,
          o.opened_at,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        FROM odds_opening o
        WHERE o.game_id = ? AND o.data_scope = 'PROD'
      `).bind(aliasGameId, sourceGameId).run();

      await env.DB.prepare(`
        INSERT INTO odds_snapshots
        (data_scope, game_id, bookmaker_key, market_key, outcome_key, line_value, price_american, price_decimal, captured_at, created_at, updated_at)
        SELECT
          'PROD',
          ?,
          COALESCE(s.bookmaker_key, 'consensus'),
          s.market_key,
          s.outcome_key,
          s.line_value,
          s.price_american,
          s.price_decimal,
          s.captured_at,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        FROM odds_snapshots s
        WHERE s.game_id = ?
          AND s.data_scope = 'PROD'
          AND NOT EXISTS (
            SELECT 1
            FROM odds_snapshots t
            WHERE t.game_id = ?
              AND t.data_scope = 'PROD'
              AND t.market_key = s.market_key
              AND t.outcome_key = s.outcome_key
              AND t.captured_at = s.captured_at
          )
        ORDER BY s.captured_at DESC
        LIMIT 200
      `).bind(aliasGameId, sourceGameId, aliasGameId).run();
    } catch (err) {
      console.log(`[Games API] Alias history clone failed ${sourceGameId} -> ${aliasGameId}:`, err);
    }
  };

  await Promise.allSettled(
    games.map(async (game) => {
      if (!game?.game_id) return;
      const matched = getMatchedOddsForGame(game, combinedOddsMap);
      if (!matched) return;
      if (matched.sourceGameId && matched.sourceGameId !== game.game_id) {
        await cloneHistoryFromSource(matched.sourceGameId, game.game_id);
      }
      const snapshotOdds = toSnapshotOdds(game, matched);
      await storeOpeningLines(env.DB, game.game_id, snapshotOdds);
      await captureOddsSnapshot(env.DB, game.game_id, game.sport || "", snapshotOdds);
    })
  );
}

async function fetchCombinedOddsForGames(
  games: Game[],
  env: Env,
  captureSnapshots: boolean
): Promise<Map<string, MergedOdds>> {
  const combinedOddsMap = new Map<string, MergedOdds>();
  if (games.length === 0) return combinedOddsMap;

  const apiKey = env.SPORTSRADAR_API_KEY;
  if (!apiKey) return combinedOddsMap;

  const sportGames = new Map<string, Game[]>();
  for (const game of games) {
    const sport = game.sport?.toLowerCase() || '';
    if (!sportGames.has(sport)) sportGames.set(sport, []);
    sportGames.get(sport)!.push(game);
  }

  const sportsToFetch = ODDS_SPORTS.filter((sport) => sportGames.has(sport));
  if (sportsToFetch.length === 0) return combinedOddsMap;

  const oddsApiKey = env.SPORTSRADAR_ODDS_KEY || apiKey;
  const settled = await Promise.allSettled(
    sportsToFetch.map(async (sportKey) => {
      const oddsMap = await fetchSportsRadarOdds(sportKey, apiKey, env.DB, undefined, oddsApiKey);
      if (captureSnapshots && oddsMap.size > 0 && env.DB) {
        await captureAllOddsSnapshots(env.DB, oddsMap, sportKey);
      }
      return { sportKey, oddsMap };
    })
  );

  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    const { sportKey, oddsMap } = result.value;
    for (const [key, odds] of oddsMap) {
      combinedOddsMap.set(key, {
        spread: odds.spread ?? odds.spreadHome ?? undefined,
        total: odds.total ?? undefined,
        moneylineHome: odds.moneylineHome ?? undefined,
        moneylineAway: odds.moneylineAway ?? undefined,
        sourceGameId: odds.gameId || undefined,
      });
    }
    if (captureSnapshots && oddsMap.size > 0) {
      console.log(`[Games API] Snapshot capture queued for ${sportKey}: ${oddsMap.size} odds rows`);
    }
  }

  return combinedOddsMap;
}

async function captureLineMovementSnapshotsForGames(games: Game[], env: Env): Promise<void> {
  if (!env.DB || games.length === 0) return;
  try {
    const combinedOddsMap = await fetchCombinedOddsForGames(games, env, true);
    await persistAliasSnapshotsForGames(games, combinedOddsMap, env);
  } catch (err) {
    console.log("[Games API] Background snapshot capture failed:", err);
  }
}

async function enrichGamesWithOdds(games: Game[], env: Env): Promise<Game[]> {
  if (games.length === 0) return games;
  
  try {
    // Use SportsRadar API key
    const apiKey = env.SPORTSRADAR_API_KEY;
    if (!apiKey) {
      console.log("[Games API] No SPORTSRADAR_API_KEY, skipping odds enrichment");
      return games;
    }
    
    // Fetch per-sport odds in parallel so one sport cannot starve others.
    const combinedOddsMap = await fetchCombinedOddsForGames(games, env, true);
    
    console.log(`[Games API] SportsRadar odds: ${combinedOddsMap.size} games with odds data`);
    
    if (ODDS_DEBUG_LOGS) {
      // Optional local debugging for odds mapping.
      let debugCount = 0;
      for (const [key, odds] of combinedOddsMap) {
        if (debugCount < 3) {
          console.log(`[Games API] Sample odds - key: ${key}, spread: ${odds.spread}, total: ${odds.total}, mlHome: ${odds.moneylineHome}`);
          debugCount++;
        }
      }
    }
    
    // Merge odds into games
    return games.map(game => {
      const sport = game.sport?.toLowerCase() || '';
      const homeName = game.home_team_name?.split(' ').pop()?.toLowerCase() || '';
      const awayName = game.away_team_name?.split(' ').pop()?.toLowerCase() || '';
      
      const odds = getMatchedOddsForGame(game, combinedOddsMap);
      if (odds) {
        if (ODDS_DEBUG_LOGS) {
          console.log(`[Games API] Matched odds for ${game.home_team_name} (${sport}|${awayName}|${homeName}) spread=${odds.spread}, ml=${odds.moneylineHome}`);
        }
        return {
          ...game,
          spread: odds.spread,
          overUnder: odds.total,
          moneylineHome: odds.moneylineHome,
          moneylineAway: odds.moneylineAway,
        };
      }
      
      if (ODDS_DEBUG_LOGS && sport === 'nba' && game.home_team_name) {
        console.log(`[Games API] No odds match for ${game.away_team_name} @ ${game.home_team_name} (${sport}|${awayName}|${homeName})`);
      }
      
      return game;
    });
  } catch (err) {
    console.log("[Games API] Odds enrichment failed:", err);
    return games;
  }
}

function withClientGameId<T extends Record<string, unknown>>(game: T): T & { id: string } {
  const existingId = typeof game.id === "string" ? game.id : undefined;
  const providerGameId = typeof game.game_id === "string" ? game.game_id : undefined;
  const externalId = typeof game.external_id === "string" ? game.external_id : undefined;
  return {
    ...game,
    id: existingId ?? providerGameId ?? externalId ?? "",
  };
}

function normalizeNameToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teamsRoughlyMatch(a: string, b: string): boolean {
  const left = normalizeNameToken(a);
  const right = normalizeNameToken(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  const leftLast = left.split(" ").pop() || "";
  const rightLast = right.split(" ").pop() || "";
  if (leftLast && rightLast && leftLast === rightLast) return true;
  const leftFirst = left.split(" ")[0] || "";
  const rightFirst = right.split(" ")[0] || "";
  return Boolean(leftFirst && rightFirst && leftFirst === rightFirst);
}

async function resolveOddsEventIdForGame(
  env: Env,
  gameId: string
): Promise<string | null> {
  if (gameId.startsWith("sr:sport_event:")) return gameId;
  if (gameId.startsWith("sr:match:")) return gameId.replace("sr:match:", "sr:sport_event:");
  const gameDetail = await fetchGameWithFallback(gameId);
  const game = gameDetail.data?.game;
  if (!game) return null;
  const sport = String(game.sport || "").toLowerCase() as SportKey;
  const apiKey = env.SPORTSRADAR_API_KEY;
  if (!apiKey) return null;

  const normalizeToken = (name: string) => name.split(" ").pop()?.toLowerCase() || "";
  const awayName = String(game.away_team_name || "");
  const homeName = String(game.home_team_name || "");
  if (!awayName || !homeName) return null;

  const oddsApiKey = env.SPORTSRADAR_ODDS_KEY || apiKey;
  const oddsMap = await fetchSportsRadarOdds(sport, apiKey, env.DB, undefined, oddsApiKey);
  const keys = [
    `${sport}|${normalizeToken(awayName)}|${normalizeToken(homeName)}`,
    `${sport}|${awayName.toLowerCase()}|${homeName.toLowerCase()}`,
  ];
  for (const key of keys) {
    const odds = oddsMap.get(key);
    if (odds?.gameId?.startsWith("sr:sport_event:")) {
      return odds.gameId;
    }
  }
  // Fuzzy fallback for leagues where naming conventions differ (city vs mascot).
  const seen = new Set<string>();
  for (const odds of oddsMap.values()) {
    if (!odds?.gameId || seen.has(odds.gameId)) continue;
    seen.add(odds.gameId);
    if (
      teamsRoughlyMatch(String(odds.awayTeam || ""), awayName) &&
      teamsRoughlyMatch(String(odds.homeTeam || ""), homeName) &&
      odds.gameId.startsWith("sr:sport_event:")
    ) {
      return odds.gameId;
    }
  }
  return null;
}

// ============ Public Game Endpoints ============

/**
 * GET /api/games
 * Fetch games with optional filters
 * 
 * Query params:
 * - sport: Filter by sport (nfl, nba, mlb, nhl, ncaaf, ncaab, soccer)
 * - status: Filter by status (SCHEDULED, IN_PROGRESS, FINAL, POSTPONED, CANCELED)
 * - date: Date in YYYY-MM-DD format
 * - refresh: Force cache refresh (true/false)
 */
gamesRouter.get("/", async (c) => {
  const rawSport = c.req.query("sport");
  const normalizedSport = rawSport?.trim().toLowerCase();
  // Treat "all" as no filter for frontend compatibility.
  const sport = normalizedSport && normalizedSport !== "all"
    ? (normalizedSport as SportKey)
    : undefined;
  const rawStatus = c.req.query("status");
  // Map "LIVE" to "IN_PROGRESS" for frontend compatibility
  const status = rawStatus === "LIVE" ? "IN_PROGRESS" : rawStatus as Game["status"] | undefined;
  const date = c.req.query("date") || getTodayEasternDateString();
  const includeOdds = !["0", "false", "no"].includes(String(c.req.query("includeOdds") || "").toLowerCase());
  const forceFresh = ["1", "true", "yes"].includes(String(c.req.query("fresh") || "").toLowerCase());
  const includeDebug = ["1", "true", "yes"].includes(String(c.req.query("debug") || "").toLowerCase());
  const listTimeoutMs = includeOdds ? 12000 : (sport === "soccer" ? 12000 : 4500);
  const cacheKey = getScoreboardListCacheKey(sport, status, date, includeOdds);
  const persistentKeys = getGamesPersistentCacheKeys(cacheKey);
  const isTodayFastScoreboardRequest =
    !includeOdds &&
    !status &&
    date === getTodayEasternDateString() &&
    sport !== "soccer";
  
  console.log("[Games API] GET / called", { sport, status, date });
  
  // Validate sport if provided
  if (sport && !SUPPORTED_SPORTS.includes(sport)) {
    return c.json({ 
      error: `Invalid sport. Supported: ${SUPPORTED_SPORTS.join(", ")}` 
    }, 400);
  }

  if (!includeOdds && !forceFresh) {
    const cached = scoreboardListCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return c.json(cached.payload);
    }
  }

  // For today's scoreboard views, prefer live fast-path over persistent DB cache
  // so finished games don't linger in stale in-progress state.
  if (!includeOdds && !forceFresh && !isTodayFastScoreboardRequest) {
    try {
      const persistent = await getCachedData<Record<string, unknown>>(c.env.DB, persistentKeys.primary);
      if (persistent && hasGamesRows(persistent)) {
        scoreboardListCache.set(cacheKey, { expiresAt: Date.now() + SCOREBOARD_LIST_CACHE_TTL_MS, payload: persistent });
        return c.json({ ...persistent, cached: true, persistent_cached: true });
      }
    } catch {
      // Non-fatal.
    }

    try {
      const backup = await getCachedData<Record<string, unknown>>(c.env.DB, persistentKeys.backup);
      if (backup && hasGamesRows(backup)) {
        scoreboardListCache.set(cacheKey, { expiresAt: Date.now() + SCOREBOARD_LIST_CACHE_TTL_MS, payload: backup });
        return c.json({
          ...backup,
          cached: true,
          source_stale: true,
          persistent_cached: true,
          fallback_reason: 'Served last known games slate while provider refresh catches up',
        });
      }
    } catch {
      // Non-fatal.
    }
  }

  // Fast scoreboard path: use cached live/scheduled feeds for today's slate.
  // This avoids slow provider fan-out for /games list views that do not need odds.
  if (isTodayFastScoreboardRequest) {
    const scopedSports = sport ? [sport] : undefined;
    const [liveResult, scheduledResult] = await Promise.all([
      withTimeout(
        fetchLiveGamesWithFallback({ sports: scopedSports }),
        3000,
        { data: [], fromCache: false, provider: "none", error: "live_timeout" } as any
      ),
      withTimeout(
        fetchScheduledGamesWithFallback({ sports: scopedSports, hours: 36 }),
        3500,
        { data: [], fromCache: false, provider: "none", error: "scheduled_timeout" } as any
      ),
    ]);

    const byId = new Map<string, Game>();
    for (const game of [...(liveResult.data || []), ...(scheduledResult.data || [])]) {
      const gameId = String((game as any)?.game_id || "").trim();
      if (!gameId) continue;
      const startDate = getEasternDateString((game as any)?.start_time);
      const isLive = String((game as any)?.status || "").toUpperCase() === "IN_PROGRESS";
      if (!isLive && startDate && startDate !== date) continue;
      byId.set(gameId, game);
    }

    const fastGames = Array.from(byId.values());

    // Guardrail: if fast feeds return only live games (scheduled feed timeout/empty),
    // run a bounded provider fallback for single-sport views so hubs don't show partial slates.
    if (sport && scheduledResult.data.length === 0 && fastGames.length > 0) {
      const fallbackFull = await withTimeout(
        fetchGamesWithFallback(sport, { status, date }),
        6500,
        { data: [], fromCache: false, provider: "none", error: `${sport}_fallback_timeout` } as any
      );
      if (Array.isArray(fallbackFull.data) && fallbackFull.data.length > 0) {
        for (const game of fallbackFull.data) {
          const gameId = String((game as any)?.game_id || "").trim();
          if (!gameId) continue;
          const startDate = getEasternDateString((game as any)?.start_time);
          const isLive = String((game as any)?.status || "").toUpperCase() === "IN_PROGRESS";
          if (!isLive && startDate && startDate !== date) continue;
          if (!byId.has(gameId)) byId.set(gameId, game);
        }
      }
    }

    const healedFastGames = Array.from(byId.values());
    if (healedFastGames.length > 0) {
      healedFastGames.sort((a, b) => {
        if (a.sport !== b.sport) return a.sport.localeCompare(b.sport);
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      });

      if (c.env.DB) {
        c.executionCtx.waitUntil(captureLineMovementSnapshotsForGames(healedFastGames, c.env));
      }

      const statuses = healedFastGames.map(g => g.status as GameStatus);
      const ttl = getTTLForGamesList(statuses);
      const headers = cacheHeaders(ttl, { isPublic: true, staleWhileRevalidate: 30 });

      const payload = {
        games: healedFastGames.map(withClientGameId),
        fromCache: Boolean(liveResult.fromCache && scheduledResult.fromCache),
        provider: liveResult.provider || scheduledResult.provider || "fast_feed",
        timestamp: new Date().toISOString(),
      };
      scoreboardListCache.set(cacheKey, { expiresAt: Date.now() + SCOREBOARD_LIST_CACHE_TTL_MS, payload });
      c.executionCtx.waitUntil((async () => {
        try {
          await setCachedData(c.env.DB, persistentKeys.primary, 'sportsradar', 'games/list', payload, 60);
          if (hasGamesRows(payload)) {
            await setCachedData(c.env.DB, persistentKeys.backup, 'sportsradar', 'games/list', payload, 60 * 60);
          }
        } catch {
          // Non-fatal persistent cache write failure.
        }
      })());
      return c.json(payload, { headers });
    }
  }
  
  // If no sport specified, get all sports IN PARALLEL for faster response
  if (!sport) {
    // Fetch all sports concurrently instead of sequentially
    const results = await Promise.all(
      SUPPORTED_SPORTS.map((s) =>
        withTimeout(
          fetchGamesWithFallback(s, { status, date }),
          listTimeoutMs,
          { data: [], fromCache: false, provider: "none", error: `${s}_timeout` } as any
        )
      )
    );
    
    let allGames: Game[] = [];
    let primaryProvider = "none";
    let anyFromCache = true;
    let hasError = false;
    const sportDiagnostics: Array<{
      sport: string;
      rawCount: number;
      postFilterCount: number;
      provider: string;
      error: string | null;
      reasonWhenZero: string | null;
    }> = [];
    
    for (let i = 0; i < results.length; i += 1) {
      const sportKey = SUPPORTED_SPORTS[i];
      const result = results[i];
      const rawRows = Array.isArray(result.data) ? result.data : [];
      let mergedRows = rawRows;
      let recoverySource: string | null = null;
      if (!includeOdds && mergedRows.length === 0 && c.env.DB) {
        const sportCacheKey = getScoreboardListCacheKey(sportKey, status, date, false);
        const sportPersistentKeys = getGamesPersistentCacheKeys(sportCacheKey);
        try {
          const primary = await getCachedData<Record<string, unknown>>(c.env.DB, sportPersistentKeys.primary);
          const rows = Array.isArray((primary as any)?.games) ? ((primary as any).games as Game[]) : [];
          if (rows.length > 0) {
            mergedRows = rows;
            recoverySource = "persistent_primary";
          }
        } catch {
          // Non-fatal.
        }
        if (mergedRows.length === 0) {
          try {
            const backup = await getCachedData<Record<string, unknown>>(c.env.DB, sportPersistentKeys.backup);
            const rows = Array.isArray((backup as any)?.games) ? ((backup as any).games as Game[]) : [];
            if (rows.length > 0) {
              mergedRows = rows;
              recoverySource = "persistent_backup";
            }
          } catch {
            // Non-fatal.
          }
        }
      }
      allGames.push(...mergedRows);
      if (!result.fromCache) anyFromCache = false;
      if (mergedRows.length > 0) primaryProvider = result.provider;
      if (result.error) hasError = true;
      const rawCount = rawRows.length;
      const postFilterCount = mergedRows.length;
      sportDiagnostics.push({
        sport: String(sportKey || "").toUpperCase(),
        rawCount,
        postFilterCount,
        provider: recoverySource ? `cache:${recoverySource}` : String(result.provider || "none"),
        error: result.error ? String(result.error) : null,
        reasonWhenZero: postFilterCount > 0
          ? null
          : (result.error ? `provider_error:${String(result.error)}` : "provider_empty_response"),
      });
    }
    
    // Optional fast-path for clients that only need scoreboard data.
    if (includeOdds) {
      allGames = await withTimeout(
        enrichGamesWithOdds(allGames, c.env),
        9000,
        allGames
      );
    } else if (allGames.length > 0 && c.env.DB) {
      c.executionCtx.waitUntil(captureLineMovementSnapshotsForGames(allGames, c.env));
    }
    
    // Sort by sport then start time
    allGames.sort((a, b) => {
      if (a.sport !== b.sport) return a.sport.localeCompare(b.sport);
      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    });
    
    // Log response summary
    console.log("[Games API] Response:", { totalGames: allGames.length, provider: primaryProvider });
    
    const payload = { 
      games: allGames.map(withClientGameId),
      fromCache: anyFromCache,
      provider: primaryProvider,
      error: hasError && allGames.length === 0 ? "Live data unavailable" : undefined,
      timestamp: new Date().toISOString(),
      ...(includeDebug ? {
        debug: {
          selectedDate: date,
          perSport: sportDiagnostics,
          finalMergedTotal: allGames.length,
        },
      } : {}),
    };
    if (includeDebug) {
      console.log("[Games API][debug][all-sports]", {
        selectedDate: date,
        perSport: sportDiagnostics,
        finalMergedTotal: allGames.length,
      });
    }
    if (!includeOdds) {
      scoreboardListCache.set(cacheKey, { expiresAt: Date.now() + SCOREBOARD_LIST_CACHE_TTL_MS, payload });
      c.executionCtx.waitUntil((async () => {
        try {
          await setCachedData(c.env.DB, persistentKeys.primary, 'sportsradar', 'games/list', payload, 60);
          if (hasGamesRows(payload)) {
            await setCachedData(c.env.DB, persistentKeys.backup, 'sportsradar', 'games/list', payload, 60 * 60);
          }
        } catch {
          // Non-fatal persistent cache write failure.
        }
      })());
    }
    return c.json(payload);
  }

  if (sport === "soccer") {
    const soccerCacheKey = "g1:soccer:games";
    const soccerHeaders = cacheHeaders(30, { isPublic: true, staleWhileRevalidate: 30 });
    const redis = getRedisClient(c.env);
    try {
      if (redis) {
        const cachedPayload = await redis.get<Record<string, unknown>>(soccerCacheKey);
        if (cachedPayload && typeof cachedPayload === "object") {
          if (!includeOdds && c.env.DB) {
            const cachedGames = Array.isArray((cachedPayload as { games?: unknown[] }).games)
              ? ((cachedPayload as { games?: Game[] }).games || [])
              : [];
            if (cachedGames.length > 0) {
              c.executionCtx.waitUntil(captureLineMovementSnapshotsForGames(cachedGames, c.env));
            }
          }
          return c.json(cachedPayload, { headers: soccerHeaders });
        }
      }
    } catch (err) {
      console.log("[Games API] Soccer cache read failed:", err);
    }

    const [sportsRadarScheduleResult, fallbackResult] = await Promise.all([
      withTimeout(
        fetchSoccerGamesFromSportsRadarDailySchedule(date, status, c.env),
        listTimeoutMs,
        { games: [], error: "soccer_sportsradar_timeout" }
      ),
      withTimeout(
        fetchGamesWithFallback(sport, { status, date }),
        listTimeoutMs,
        { data: [], fromCache: false, provider: "none", error: `${sport}_timeout` } as any
      ),
    ]);
    const normalizeNaturalKey = (game: Partial<Game>): string => {
      const day = getEasternDateString(game.start_time || "") || date;
      const norm = (value: unknown) =>
        String(value || "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
      const home = norm(game.home_team_name || game.home_team_code);
      const away = norm(game.away_team_name || game.away_team_code);
      return `${day}:${home}:${away}`;
    };
    const mergedById = new Map<string, Game>();
    const naturalKeys = new Set<string>();
    for (const game of fallbackResult.data || []) {
      const gameId = String(game?.game_id || "").trim();
      if (!gameId) continue;
      mergedById.set(gameId, game as Game);
      naturalKeys.add(normalizeNaturalKey(game as Game));
    }
    for (const game of sportsRadarScheduleResult.games || []) {
      const gameId = String(game?.game_id || "").trim();
      if (!gameId) continue;
      if (mergedById.has(gameId)) continue;
      const naturalKey = normalizeNaturalKey(game);
      if (naturalKeys.has(naturalKey)) continue;
      mergedById.set(gameId, game);
      naturalKeys.add(naturalKey);
    }
    const soccerGames = Array.from(mergedById.values()).map((game) => ({
      ...game,
      league: normalizeSoccerLeagueLabel(inferSoccerLeagueFromTeams(game) || game.league || "SOCCER"),
    }));
    const soccerProvider = sportsRadarScheduleResult.games.length > 0
      ? (fallbackResult.data.length > 0 ? "SportsRadar+fallback" : "SportsRadar")
      : fallbackResult.provider;

    const soccerEnrichedGames = includeOdds
      ? await withTimeout(
          enrichGamesWithOdds(soccerGames, c.env),
          9000,
          soccerGames
        )
      : soccerGames;
    if (!includeOdds && soccerGames.length > 0 && c.env.DB) {
      c.executionCtx.waitUntil(captureLineMovementSnapshotsForGames(soccerGames, c.env));
    }

    const soccerPayload = {
      games: soccerEnrichedGames.map(withClientGameId),
      fromCache: sportsRadarScheduleResult.games.length === 0 && fallbackResult.fromCache,
      cachedAt: fallbackResult.cachedAt ? new Date(fallbackResult.cachedAt).toISOString() : undefined,
      provider: soccerProvider,
      timestamp: new Date().toISOString(),
      ...(sportsRadarScheduleResult.error ? { sportsRadarError: sportsRadarScheduleResult.error } : {}),
      ...(fallbackResult.error ? { fallbackError: fallbackResult.error } : {}),
    };

    try {
      if (redis) {
        await redis.set(soccerCacheKey, soccerPayload, { ex: 30 });
      }
    } catch (err) {
      console.log("[Games API] Soccer cache write failed:", err);
    }

    if (!includeOdds) {
      scoreboardListCache.set(cacheKey, { expiresAt: Date.now() + SCOREBOARD_LIST_CACHE_TTL_MS, payload: soccerPayload });
      c.executionCtx.waitUntil((async () => {
        try {
          await setCachedData(c.env.DB, persistentKeys.primary, 'sportsradar', 'games/list', soccerPayload, 60);
          if (hasGamesRows(soccerPayload)) {
            await setCachedData(c.env.DB, persistentKeys.backup, 'sportsradar', 'games/list', soccerPayload, 60 * 60);
          }
        } catch {
          // Non-fatal persistent cache write failure.
        }
      })());
    }
    return c.json(soccerPayload, { headers: soccerHeaders });
  }
  
  const result = await withTimeout(
    fetchGamesWithFallback(sport, { status, date }),
    listTimeoutMs,
    { data: [], fromCache: false, provider: "none", error: `${sport}_timeout` } as any
  );
  
  // Optional fast-path for clients that only need scoreboard data.
  const enrichedGames = includeOdds
    ? await withTimeout(
        enrichGamesWithOdds(result.data, c.env),
        9000,
        result.data
      )
    : result.data;
  if (!includeOdds && result.data.length > 0 && c.env.DB) {
    c.executionCtx.waitUntil(captureLineMovementSnapshotsForGames(result.data, c.env));
  }
  
  // Determine cache headers based on game statuses
  const statuses = enrichedGames.map(g => g.status as GameStatus);
  const ttl = getTTLForGamesList(statuses);
  const headers = cacheHeaders(ttl, { isPublic: true, staleWhileRevalidate: 30 });
  
  const payload = {
    games: enrichedGames.map(withClientGameId),
    fromCache: result.fromCache,
    cachedAt: result.cachedAt ? new Date(result.cachedAt).toISOString() : undefined,
    provider: result.provider,
    timestamp: new Date().toISOString(),
  };
  if (!includeOdds) {
    scoreboardListCache.set(cacheKey, { expiresAt: Date.now() + SCOREBOARD_LIST_CACHE_TTL_MS, payload });
      c.executionCtx.waitUntil((async () => {
        try {
          await setCachedData(c.env.DB, persistentKeys.primary, 'sportsradar', 'games/list', payload, 60);
          if (hasGamesRows(payload)) {
            await setCachedData(c.env.DB, persistentKeys.backup, 'sportsradar', 'games/list', payload, 60 * 60);
          }
        } catch {
          // Non-fatal persistent cache write failure.
        }
      })());
  }
  return c.json(payload, { headers });
});

/**
 * GET /api/games/live
 * Fetch all live games across sports
 * 
 * Query params:
 * - sports: Comma-separated list of sports to include
 */
gamesRouter.get("/live", async (c) => {
  const sportsParam = c.req.query("sports");
  const singleSportParam = c.req.query("sport");
  const forceFresh = ["1", "true", "yes"].includes(String(c.req.query("fresh") || "").toLowerCase());

  let sports: SportKey[] | undefined;
  if (sportsParam || singleSportParam) {
    const raw = sportsParam
      ? sportsParam.split(",")
      : [singleSportParam as string];
    const normalized = raw.map((s) => String(s || "").trim().toLowerCase());
    sports = normalized.filter((s) => SUPPORTED_SPORTS.includes(s as SportKey)) as SportKey[];

    if (sports.length === 0) {
      return c.json({ error: "No valid sports specified" }, 400);
    }
  }

  const liveCacheKey = getLiveCacheKey(sports);
  const persistentKeys = getLivePersistentCacheKeys(liveCacheKey);

  if (!forceFresh) {
    const memoryHit = liveResponseCache.get(liveCacheKey);
    if (memoryHit && memoryHit.expiresAt > Date.now()) {
      return c.json(memoryHit.payload, { headers: liveGameHeaders() });
    }

    try {
      const primary = await getCachedData<Record<string, unknown>>(c.env.DB, persistentKeys.primary);
      if (primary && hasGamesRows(primary)) {
        liveResponseCache.set(liveCacheKey, {
          expiresAt: Date.now() + LIVE_CACHE_TTL_MS,
          staleExpiresAt: Date.now() + LIVE_STALE_WINDOW_MS,
          payload: primary,
        });
        return c.json({ ...primary, cached: true, persistent_cached: true }, { headers: liveGameHeaders() });
      }
    } catch {
      // Non-fatal cache read failure.
    }

    try {
      const backup = await getCachedData<Record<string, unknown>>(c.env.DB, persistentKeys.backup);
      if (backup && hasGamesRows(backup)) {
        liveResponseCache.set(liveCacheKey, {
          expiresAt: Date.now() + LIVE_CACHE_TTL_MS,
          staleExpiresAt: Date.now() + LIVE_STALE_WINDOW_MS,
          payload: backup,
        });
        return c.json({
          ...backup,
          cached: true,
          persistent_cached: true,
          source_stale: true,
          fallback_reason: "Serving last known live slate while provider refresh catches up",
        }, { headers: liveGameHeaders() });
      }
    } catch {
      // Non-fatal cache read failure.
    }
  }

  const result = await withTimeout(
    fetchLiveGamesWithFallback({ sports }),
    900,
    {
      data: [],
      fromCache: false,
      provider: "timeout_fallback",
      error: "Provider request timed out",
    }
  );

  // Group by sport for easier consumption
  const bySport: Record<string, Game[]> = {};
  for (const game of result.data) {
    if (!bySport[game.sport]) bySport[game.sport] = [];
    bySport[game.sport].push(game);
  }

  const payload = {
    games: result.data.map(withClientGameId),
    bySport,
    count: result.data.length,
    fromCache: result.fromCache,
    provider: result.provider,
    error: result.error,
    timestamp: new Date().toISOString(),
  };

  const hasRows = hasGamesRows(payload);
  if (hasRows || !result.error) {
    liveResponseCache.set(liveCacheKey, {
      expiresAt: Date.now() + LIVE_CACHE_TTL_MS,
      staleExpiresAt: Date.now() + LIVE_STALE_WINDOW_MS,
      payload,
    });
  }

  if (hasRows) {
    c.executionCtx.waitUntil((async () => {
      try {
        await setCachedData(c.env.DB, persistentKeys.primary, 'sportsradar', 'games/live', payload, 30);
        await setCachedData(c.env.DB, persistentKeys.backup, 'sportsradar', 'games/live', payload, 10 * 60);
      } catch {
        // Non-fatal persistent cache write failure.
      }
    })());
  }

  if (!hasRows && !forceFresh) {
    const staleHit = liveResponseCache.get(liveCacheKey);
    if (staleHit && staleHit.staleExpiresAt > Date.now()) {
      return c.json({
        ...staleHit.payload,
        source_stale: true,
        fallback_reason: result.error || 'Live feed returned empty response',
      }, { headers: liveGameHeaders() });
    }
  }

  return c.json(payload, { headers: liveGameHeaders() });
});

/**
 * GET /api/games/scheduled
 * Fetch upcoming scheduled games
 * 
 * Query params:
 * - sports: Comma-separated list of sports
 * - hours: Number of hours ahead to look (default 48)
 */
gamesRouter.get("/scheduled", async (c) => {
  const sportsParam = c.req.query("sports");
  const singleSportParam = c.req.query("sport");
  const hoursParam = c.req.query("hours");
  
  let sports: SportKey[] | undefined;
  if (sportsParam || singleSportParam) {
    const raw = sportsParam
      ? sportsParam.split(",")
      : [singleSportParam as string];
    const normalized = raw.map((s) => String(s || "").trim().toLowerCase());
    sports = normalized.filter((s) => SUPPORTED_SPORTS.includes(s as SportKey)) as SportKey[];
  }
  
  const hours = hoursParam ? parseInt(hoursParam, 10) : 48;
  if (isNaN(hours) || hours < 1 || hours > 168) {
    return c.json({ error: "Hours must be between 1 and 168" }, 400);
  }
  
  const result = await withTimeout(
    fetchScheduledGamesWithFallback({ sports, hours }),
    7000,
    {
      data: [],
      fromCache: false,
      provider: "timeout_fallback",
      error: "Provider request timed out",
    }
  );
  
  return c.json({
    games: result.data.map(withClientGameId),
    count: result.data.length,
    fromCache: result.fromCache,
    provider: result.provider,
    timestamp: new Date().toISOString(),
  }, { headers: scheduledGameHeaders() });
});

// ============ Static Routes (MUST come before /:gameId) ============

/**
 * GET /api/games/odds-status
 * Check if The Odds API is configured and available
 */
gamesRouter.get("/odds-status", async (c) => {
  const configured = isOddsApiAvailable(c.env);
  
  return c.json({
    configured,
    available: configured,
    provider: configured ? "sportsradar" : null,
    message: configured 
      ? "Odds API is configured and ready" 
      : "SPORTSRADAR_API_KEY not set - using demo odds",
    availableSports: SUPPORTED_SPORTS,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/games/providers
 * Get current provider configuration
 */
gamesRouter.get("/providers", authMiddleware, async (c) => {
  const configs = getProviderConfigs();
  const activeProvider = getActiveProviderName();
  
  return c.json({
    providers: configs,
    activeProvider,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/games/cache-stats
 * Get cache statistics
 */
gamesRouter.get("/cache-stats", authMiddleware, async (c) => {
  return c.json({
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/games/admin/cache
 * Get cache statistics (admin)
 */
gamesRouter.get("/admin/cache", authMiddleware, async (c) => {
  return c.json({
    providers: getProviderConfigs(),
    activeProvider: getActiveProviderName(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/games/admin/sports
 * Get list of supported sports
 */
gamesRouter.get("/admin/sports", authMiddleware, async (c) => {
  return c.json({
    sports: SUPPORTED_SPORTS,
    count: SUPPORTED_SPORTS.length,
  });
});

/**
 * GET /api/games/nascar/standings
 * Derive NASCAR standings snapshot from current provider game feed.
 */
gamesRouter.get("/nascar/standings", async (c) => {
  const result = await withTimeout(
    fetchGamesWithFallback("nascar", { date: getTodayEasternDateString() }),
    12000,
    { data: [], fromCache: false, provider: "none", error: "nascar_timeout" } as any
  );

  type DriverAggregate = {
    driver_name: string;
    starts: number;
    wins: number;
    best_finish: number | null;
    last_result: string | null;
    last_start_time_ms: number;
  };

  const table = new Map<string, DriverAggregate>();

  const upsert = (driverNameRaw: string, update: (row: DriverAggregate) => void) => {
    const driverName = String(driverNameRaw || "").trim();
    if (!driverName) return;
    const key = driverName.toLowerCase();
    const existing = table.get(key) || {
      driver_name: driverName,
      starts: 0,
      wins: 0,
      best_finish: null,
      last_result: null,
      last_start_time_ms: 0,
    };
    update(existing);
    table.set(key, existing);
  };

  for (const game of result.data) {
    const homeName = String((game as any).home_team_name || (game as any).home_team_code || "").trim();
    const awayName = String((game as any).away_team_name || (game as any).away_team_code || "").trim();
    const status = String((game as any).status || "").toUpperCase();
    const startMs = new Date(String((game as any).start_time || "")).getTime();
    const raceRows = parseNascarRaceResults(game);
    if (raceRows.length > 0) {
      for (const rr of raceRows) {
        upsert(rr.driverName, (row) => {
          row.starts += 1;
          row.best_finish = row.best_finish == null ? rr.position : Math.min(row.best_finish, rr.position);
          if (Number.isFinite(startMs) && startMs > row.last_start_time_ms) {
            row.last_start_time_ms = startMs;
          }
          if (status === "FINAL") {
            if (rr.position === 1) {
              row.wins += 1;
              row.last_result = "W";
            } else {
              row.last_result = `P${rr.position}`;
            }
          }
        });
      }
      continue;
    }

    // Fallback behavior if provider race_results are unavailable.
    if (homeName) {
      upsert(homeName, (row) => {
        row.starts += 1;
        if (Number.isFinite(startMs) && startMs > row.last_start_time_ms) row.last_start_time_ms = startMs;
      });
    }
    if (awayName) {
      upsert(awayName, (row) => {
        row.starts += 1;
        if (Number.isFinite(startMs) && startMs > row.last_start_time_ms) row.last_start_time_ms = startMs;
      });
    }
    if (status === "FINAL") {
      const winner = extractNascarWinnerName(game);
      if (winner) {
        const loser = normalizeNascarNameToken(winner) === normalizeNascarNameToken(homeName) ? awayName : homeName;
        upsert(winner, (row) => {
          row.wins += 1;
          row.best_finish = row.best_finish == null ? 1 : Math.min(row.best_finish, 1);
          row.last_result = "W";
        });
        if (loser) {
          upsert(loser, (row) => {
            row.best_finish = row.best_finish == null ? 2 : Math.min(row.best_finish, 2);
            row.last_result = "P2";
          });
        }
      }
    }
  }

  const standings = Array.from(table.values())
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.starts !== a.starts) return b.starts - a.starts;
      return a.driver_name.localeCompare(b.driver_name);
    })
    .map((row, idx) => ({
      rank: idx + 1,
      driver_name: row.driver_name,
      starts: row.starts,
      wins: row.wins,
      best_finish: row.best_finish,
      last_result: row.last_result,
      top5: null as number | null,
      top10: null as number | null,
      points: null as number | null,
      avg_finish: null as number | null,
      laps_led: null as number | null,
    }));

  const coverage = {
    starts: true,
    wins: true,
    best_finish: true,
    last_result: true,
    top5: false,
    top10: false,
    points: false,
    avg_finish: false,
    laps_led: false,
  };

  return c.json({
    sport: "nascar",
    season_year: new Date().getFullYear(),
    source: result.provider,
    generated_at: new Date().toISOString(),
    from_cache: result.fromCache,
    standings,
    coverage,
    fallback_reason:
      standings.length === 0
        ? (result.error || "No NASCAR standings rows derived from provider feed")
        : null,
  });
});

/**
 * GET /api/games/nascar/validation
 * Snapshot coverage of NASCAR winner/order fields from current provider payload.
 */
gamesRouter.get("/nascar/validation", async (c) => {
  const requestedDate = String(c.req.query("date") || getTodayEasternDateString()).trim();
  const result = await withTimeout(
    fetchGamesWithFallback("nascar", { date: requestedDate }),
    12000,
    { data: [], fromCache: false, provider: "none", error: "nascar_timeout" } as any
  );

  const rows = (result.data || []).map((game: any) => {
    const status = String(game?.status || "").toUpperCase();
    const raceResults = parseNascarRaceResults(game);
    const hasVerifiedResults = hasVerifiedNascarRaceResults(raceResults);
    const winnerName = extractNascarWinnerName(game);
    return {
      game_id: String(game?.game_id || game?.id || ""),
      status,
      start_time: String(game?.start_time || ""),
      has_winner: Boolean(winnerName),
      has_race_results: raceResults.length > 0,
      has_verified_race_results: hasVerifiedResults,
      race_results_count: raceResults.length,
      winner_name: winnerName,
    };
  });

  const completed = rows.filter((row) => row.status === "FINAL");
  const missingWinner = completed.filter((row) => !row.has_winner);
  const missingOrder = completed.filter((row) => !row.has_verified_race_results);

  return c.json({
    sport: "nascar",
    date: requestedDate,
    source: result.provider,
    from_cache: result.fromCache,
    generated_at: new Date().toISOString(),
    totals: {
      games: rows.length,
      completed: completed.length,
      completed_with_winner: completed.length - missingWinner.length,
      completed_with_verified_order: completed.length - missingOrder.length,
    },
    missing: {
      winner_count: missingWinner.length,
      winner_game_ids: missingWinner.map((row) => row.game_id).slice(0, 25),
      order_count: missingOrder.length,
      order_game_ids: missingOrder.map((row) => row.game_id).slice(0, 25),
    },
    sample: rows.slice(0, 25),
    fallback_reason: rows.length === 0 ? (result.error || "No NASCAR games returned for validation") : null,
  });
});

/**
 * GET /api/games/nascar/live-snapshot
 * Lightweight NASCAR live payload for fast UI polling.
 */
gamesRouter.get("/nascar/live-snapshot", async (c) => {
  const startedAt = Date.now();
  nascarLiveSnapshotTelemetry.requests += 1;
  const requestedDate = String(c.req.query("date") || getTodayEasternDateString()).trim();
  const requestedGameId = String(c.req.query("gameId") || "").trim();
  const result = await withTimeout(
    fetchGamesWithFallback("nascar", { date: requestedDate }),
    8000,
    { data: [], fromCache: false, provider: "none", error: "nascar_timeout" } as any
  );

  const rows = (result.data || []).map((game: any) => {
    const rawRows = Array.isArray(game?.race_results) ? game.race_results : [];
    const race_results = rawRows
      .map((row: any) => {
        const positionRaw = Number(row?.position ?? row?.order ?? row?.rank ?? row?.place);
        const driver_name = String(
          row?.driver_name
          || row?.name
          || row?.displayName
          || row?.athlete?.displayName
          || row?.team?.displayName
          || ""
        ).trim();
        if (!Number.isFinite(positionRaw) || !driver_name) return null;
        const pointsRaw = Number(row?.points ?? row?.pts ?? row?.score);
        return {
          position: Math.max(1, Math.trunc(positionRaw)),
          driver_name,
          points: Number.isFinite(pointsRaw) ? pointsRaw : null,
          status: String(row?.status || "").trim() || undefined,
        };
      })
      .filter((row): row is { position: number; driver_name: string; points: number | null; status?: string } => Boolean(row))
      .sort((a, b) => a.position - b.position)
      .slice(0, 15);

    const winner_name = String(
      game?.winner_name
      || game?.winner
      || game?.winnerName
      || game?.result?.winner_name
      || game?.result?.winner
      || race_results.find((row) => row.position === 1)?.driver_name
      || ""
    ).trim() || null;

    return {
      game_id: String(game?.game_id || game?.id || ""),
      external_id: String(game?.external_id || ""),
      status: String(game?.status || "").toUpperCase(),
      start_time: String(game?.start_time || ""),
      venue: String(game?.venue || "").trim(),
      away_team_name: String(game?.away_team_name || game?.away_team_code || "").trim(),
      home_team_name: String(game?.home_team_name || game?.home_team_code || "").trim(),
      winner_name,
      race_results,
    };
  });

  const live = rows.find((row) => row.status === "IN_PROGRESS" || row.status === "LIVE") || null;
  const target = requestedGameId
    ? rows.find((row) =>
        [
          row.game_id,
          row.external_id,
        ].filter(Boolean).some((candidate) => candidate === requestedGameId)
      ) || null
    : null;

  const latencyMs = Date.now() - startedAt;
  nascarLiveSnapshotTelemetry.lastLatencyMs = latencyMs;
  nascarLiveSnapshotTelemetry.avgLatencyMs = nascarLiveSnapshotTelemetry.avgLatencyMs === 0
    ? latencyMs
    : Math.round((nascarLiveSnapshotTelemetry.avgLatencyMs * 0.8) + (latencyMs * 0.2));
  if (result.error === "nascar_timeout") {
    nascarLiveSnapshotTelemetry.timeouts += 1;
    nascarLiveSnapshotTelemetry.failures += 1;
    console.warn("[NASCAR][live-snapshot] timeout", {
      date: requestedDate,
      gameId: requestedGameId || null,
      latencyMs,
      telemetry: nascarLiveSnapshotTelemetry,
    });
  } else if (result.error) {
    nascarLiveSnapshotTelemetry.failures += 1;
    console.warn("[NASCAR][live-snapshot] provider fallback", {
      date: requestedDate,
      gameId: requestedGameId || null,
      error: result.error,
      latencyMs,
    });
  } else {
    nascarLiveSnapshotTelemetry.successes += 1;
    if (latencyMs > 2500) {
      console.warn("[NASCAR][live-snapshot] slow response", {
        date: requestedDate,
        gameId: requestedGameId || null,
        latencyMs,
      });
    }
  }

  const responsePayload = {
    sport: "nascar",
    date: requestedDate,
    source: result.provider,
    from_cache: result.fromCache,
    generated_at: new Date().toISOString(),
    live,
    target,
    fallback_reason: rows.length === 0 ? (result.error || "No NASCAR games returned for live snapshot") : null,
  };
  const hasLiveRace = Boolean(live);
  const headers = hasLiveRace
    ? liveGameHeaders()
    : cacheHeaders(15 * 1000, { isPublic: false, staleWhileRevalidate: 15 });

  return c.json(responsePayload, { headers });
});

/**
 * GET /api/games/nascar/live-snapshot/telemetry
 * Admin-friendly counters for NASCAR live snapshot route health.
 */
gamesRouter.get("/nascar/live-snapshot/telemetry", async (c) => {
  const envBag = c.env as unknown as Record<string, unknown>;
  const thresholds = {
    warn_timeout_rate_pct: parseThresholdNumber(envBag.NASCAR_SNAPSHOT_WARN_TIMEOUT_RATE_PCT, 1),
    critical_timeout_rate_pct: parseThresholdNumber(envBag.NASCAR_SNAPSHOT_CRITICAL_TIMEOUT_RATE_PCT, 5),
    warn_avg_latency_ms: parseThresholdNumber(envBag.NASCAR_SNAPSHOT_WARN_AVG_LATENCY_MS, 1200),
    critical_avg_latency_ms: parseThresholdNumber(envBag.NASCAR_SNAPSHOT_CRITICAL_AVG_LATENCY_MS, 2000),
    warn_success_rate_pct: parseThresholdNumber(envBag.NASCAR_SNAPSHOT_WARN_SUCCESS_RATE_PCT, 97),
    critical_success_rate_pct: parseThresholdNumber(envBag.NASCAR_SNAPSHOT_CRITICAL_SUCCESS_RATE_PCT, 90),
  };
  return c.json({
    route: "/api/games/nascar/live-snapshot",
    requests: nascarLiveSnapshotTelemetry.requests,
    successes: nascarLiveSnapshotTelemetry.successes,
    failures: nascarLiveSnapshotTelemetry.failures,
    timeouts: nascarLiveSnapshotTelemetry.timeouts,
    last_latency_ms: nascarLiveSnapshotTelemetry.lastLatencyMs,
    avg_latency_ms: nascarLiveSnapshotTelemetry.avgLatencyMs,
    thresholds,
    generated_at: new Date().toISOString(),
  }, {
    headers: cacheHeaders(10 * 1000, { isPublic: false, staleWhileRevalidate: 10 }),
  });
});

// ============ Dynamic Game Routes ============

/**
 * GET /api/games/:gameId
 * Fetch a single game by ID with detailed stats, play-by-play, injuries, weather, and odds
 */
gamesRouter.get("/:gameId", async (c) => {
  const gameId = c.req.param("gameId");
  const liteMode = ["1", "true", "yes"].includes(String(c.req.query("lite") || "").toLowerCase());
  const normalizedGameId = gameId.startsWith("soccer_sr:sport_event:")
    ? gameId.replace(/^soccer_/, "")
    : gameId;
  
  let result = await fetchGameWithFallback(normalizedGameId);

  // Legacy watchboard rows can store sr:sport_event IDs while canonical rows
  // in sdio_games use provider_game_id formats (e.g., sr_nba_*). Try alias
  // candidates before considering provider-specific fallbacks.
  if (!result.data && (normalizedGameId.startsWith("sr:sport_event:") || normalizedGameId.startsWith("sr:match:"))) {
    const aliasCandidates = buildLineHistoryIdCandidates(normalizedGameId);
    for (const candidate of aliasCandidates) {
      const normalizedCandidate = String(candidate || "").trim();
      if (!normalizedCandidate || normalizedCandidate === normalizedGameId) continue;
      result = await fetchGameWithFallback(normalizedCandidate);
      if (result.data) break;
    }
  }
  
  const shouldTrySoccerDetailFallback = gameId.startsWith("soccer_") || normalizedGameId.startsWith("sr:match:");
  if (!result.data && shouldTrySoccerDetailFallback && c.env.SPORTSRADAR_API_KEY) {
    try {
      const soccerProvider = getSportsRadarProvider(c.env.SPORTSRADAR_API_KEY, null);
      const detail = await soccerProvider.fetchSoccerMatchDetail(normalizedGameId, c.env.SPORTSRADAR_API_KEY);
      const matchData = detail.match;
      const home = matchData?.homeTeam;
      const away = matchData?.awayTeam;
      if (matchData && home && away) {
        const statusRaw = String(matchData?.status || "scheduled").toLowerCase();
        const game = {
          game_id: normalizedGameId,
          external_id: String(matchData?.eventId || normalizedGameId),
          sport: "soccer",
          league: "SOCCER",
          status:
            statusRaw.includes("live") || statusRaw.includes("inprogress")
              ? "IN_PROGRESS"
              : statusRaw.includes("closed") || statusRaw.includes("ended")
                ? "FINAL"
                : "SCHEDULED",
          away_team_code: String(away?.abbreviation || away?.name || "AWAY"),
          away_team_name: String(away?.name || "Away"),
          away_score: null,
          home_team_code: String(home?.abbreviation || home?.name || "HOME"),
          home_team_name: String(home?.name || "Home"),
          home_score: null,
          start_time: String(matchData?.startTime || new Date().toISOString()),
          venue: undefined,
          broadcast: undefined,
          last_updated_at: new Date().toISOString(),
        };
        result = {
          data: {
            game,
            stats: [],
            playByPlay: [],
            injuries: [],
            weather: null,
            odds: [],
          },
          fromCache: false,
          provider: "SportsRadar",
        };
      }
    } catch {
      // Leave default not-found handling below.
    }
  }
  
  if (!result.data) {
    return c.json({ error: result.error || "Game not found" }, 404);
  }

  let { game, stats, playByPlay, injuries, weather, odds } = result.data;
  let props: any[] = [];
  let propsProvider = "none";
  let propsSource: "event" | "competition" | "placeholder" | "none" = "none";
  let propsFallbackReason: string | null = null;
  
  // Try to fetch live odds only for in-progress games.
  // Use SportsRadar event endpoint first to avoid legacy provider mismatch.
  if (!liteMode && isOddsApiAvailable(c.env) && game.status === "IN_PROGRESS") {
    const keysToTry = Array.from(
      new Set([
        c.env.SPORTSRADAR_ODDS_KEY,
        c.env.SPORTSRADAR_PLAYER_PROPS_KEY,
        c.env.SPORTSRADAR_PROPS_KEY,
        c.env.SPORTSRADAR_API_KEY,
      ].filter((key): key is string => Boolean(key && key.trim())))
    );
    const srEventId = toSportsRadarEventId(gameId) || toSportsRadarEventId(normalizedGameId)
      || (String(game.game_id || "").startsWith("sr:sport_event:") ? String(game.game_id) : null);
    if (srEventId) {
      for (const keyCandidate of keysToTry) {
        try {
          const srOdds = await fetchSportsRadarOddsForGame(srEventId, keyCandidate);
          if (!srOdds) continue;
          odds = [{
            bookmaker: srOdds.bookmaker || "SportsRadar",
            spread: srOdds.spread !== null ? `${srOdds.spread > 0 ? "+" : ""}${srOdds.spread}` : "N/A",
            total: srOdds.total !== null ? String(srOdds.total) : "N/A",
            moneylineAway: srOdds.moneylineAway !== null ? `${srOdds.moneylineAway > 0 ? "+" : ""}${srOdds.moneylineAway}` : "N/A",
            moneylineHome: srOdds.moneylineHome !== null ? `${srOdds.moneylineHome > 0 ? "+" : ""}${srOdds.moneylineHome}` : "N/A",
            updated: new Date().toISOString(),
          }];
          break;
        } catch (err) {
          console.warn("[Games API] live event odds fetch failed for key candidate", err);
        }
      }
    }

    if (!Array.isArray(odds) || odds.length === 0) {
      const normalize = (value: string) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const homeNorm = normalize(String(game.home_team_name || ""));
      const awayNorm = normalize(String(game.away_team_name || ""));
      for (const keyCandidate of keysToTry) {
        try {
          const sportOdds = await fetchSportsRadarOdds(String(game.sport || ""), c.env.SPORTSRADAR_API_KEY || "", c.env.DB, undefined, keyCandidate);
          let matched: any = null;
          for (const candidate of sportOdds.values()) {
            const candidateHome = normalize(String(candidate?.homeTeam || ""));
            const candidateAway = normalize(String(candidate?.awayTeam || ""));
            if (
              (candidateHome.includes(homeNorm) || homeNorm.includes(candidateHome)) &&
              (candidateAway.includes(awayNorm) || awayNorm.includes(candidateAway))
            ) {
              matched = candidate;
              break;
            }
          }
          if (!matched) continue;
          odds = [{
            bookmaker: matched.bookmaker || "SportsRadar",
            spread: matched.spread !== null ? `${matched.spread > 0 ? "+" : ""}${matched.spread}` : "N/A",
            total: matched.total !== null ? String(matched.total) : "N/A",
            moneylineAway: matched.moneylineAway !== null ? `${matched.moneylineAway > 0 ? "+" : ""}${matched.moneylineAway}` : "N/A",
            moneylineHome: matched.moneylineHome !== null ? `${matched.moneylineHome > 0 ? "+" : ""}${matched.moneylineHome}` : "N/A",
            updated: new Date().toISOString(),
          }];
          break;
        } catch (err) {
          console.warn("[Games API] live sport-map odds fetch failed for key candidate", err);
        }
      }
    }
  }
  
  // Fetch player props from SportsRadar Player Props API - try all available keys
  try {
    if (!liteMode && game.status !== "FINAL") {
      const keysToTry = [
        { name: 'SPORTSRADAR_ODDS_KEY', key: c.env.SPORTSRADAR_ODDS_KEY },
        { name: 'SPORTSRADAR_PLAYER_PROPS_KEY', key: c.env.SPORTSRADAR_PLAYER_PROPS_KEY },
        { name: 'SPORTSRADAR_PROPS_KEY', key: c.env.SPORTSRADAR_PROPS_KEY },
        { name: 'SPORTSRADAR_API_KEY', key: c.env.SPORTSRADAR_API_KEY },
      ].filter(k => k.key);
      if (keysToTry.length === 0) {
        propsFallbackReason = "No SportsRadar props key configured";
      }
      
      const gameIdCandidates = buildPropIsolationIdCandidates(gameId);
      for (const { name, key } of keysToTry) {
        console.log(`[Props API] Trying ${name}...`);
        const srProps = await fetchGamePlayerProps(
          gameId,
          game.sport,
          game.home_team_name || game.home_team_code || '',
          game.away_team_name || game.away_team_code || '',
          key,
          game.status
        );
        const strictProps = srProps.filter((row) =>
          isPropMappedToGame(row as unknown as Record<string, unknown>, gameIdCandidates)
        );
        if (strictProps.length > 0) {
          console.log(`[Props API] SUCCESS with ${name}: ${strictProps.length}/${srProps.length} props matched game IDs`);
          props = strictProps;
          propsProvider = name;
          propsSource = "event";
          propsFallbackReason = null;
          break;
        } else {
          console.log(`[Props API] ${name} returned ${srProps.length} rows, 0 matched this game ID`);
          propsFallbackReason = `SportsRadar connected, but no player props matched this game_id/event_id (${name})`;
        }
      }
    }
  } catch (err) {
    console.log("[Games API] Props fetch failed:", err);
    propsFallbackReason = "SportsRadar props fetch failed";
  }

  // Fallback to competition-level props cache when event-level props are empty.
  // This now applies to both scheduled and live/in-progress games.
  if (!liteMode && props.length === 0 && game.status !== "FINAL") {
    const competitionProps = await fetchCompetitionPropsForGame(
      c.env,
      gameId,
      String(game.sport || "")
    );
    if (competitionProps.length > 0) {
      props = competitionProps;
      propsProvider = "SPORTSRADAR_COMPETITION_PROPS";
      propsSource = "competition";
      propsFallbackReason = null;
    } else if (!propsFallbackReason) {
      propsFallbackReason = "No game-matched rows in SportsRadar competition props feed";
    } else {
      propsFallbackReason = `${propsFallbackReason}; competition feed also returned no game-matched rows`;
    }
  }
  
  // Real-data-only mode: do not inject placeholder props for scheduled games.
  if (!liteMode && props.length === 0 && game.status === "SCHEDULED" && !propsFallbackReason) {
    propsFallbackReason = "No player props posted yet for this game";
  }
  if (props.length === 0 && !propsFallbackReason) {
    propsFallbackReason = "No player props available for this game_id/event_id";
  }
  
  // Use status-appropriate cache headers
  const statusHeaders = game.status === "IN_PROGRESS" 
    ? liveGameHeaders() 
    : game.status === "FINAL" 
      ? finalGameHeaders() 
      : scheduledGameHeaders();
  
  return c.json({
    game,
    stats,
    playByPlay,
    injuries,
    weather,
    odds,
    props,
    oddsProvider: isOddsApiAvailable(c.env) ? "sportsradar" : "none",
    propsProvider,
    propsSource,
    propsFallbackReason,
    fromCache: result.fromCache,
    provider: result.provider,
    timestamp: new Date().toISOString(),
  }, { headers: statusHeaders });
});

// ============ Odds Endpoints ============

/**
 * GET /api/games/:gameId/odds
 * Fetch all sportsbook odds for a specific game
 * Returns odds from SportsRadar Odds Comparison API
 */
gamesRouter.get("/:gameId/odds", async (c) => {
  const gameId = c.req.param("gameId");
  const includeFullBooks = c.req.query("full") === "1";
  const startedAt = Date.now();
  const withinBudget = () => Date.now() - startedAt < 3500;
  const toNum = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  };
  const buildFallbackIds = (seedIds: string[]): string[] => {
    const idSet = new Set<string>();
    for (const seed of seedIds.map((v) => String(v || "").trim()).filter(Boolean)) {
      idSet.add(seed);
      for (const candidate of buildLineHistoryIdCandidates(seed)) idSet.add(candidate);
      const srEvent = toSportsRadarEventId(seed);
      const srMatch = toSportsRadarMatchId(seed);
      if (srEvent) idSet.add(srEvent);
      if (srMatch) idSet.add(srMatch);
    }
    return Array.from(idSet).filter(Boolean).slice(0, 8);
  };
  const loadDbOddsFallback = async (seedIds: string[]) => {
    const candidateIds = buildFallbackIds(seedIds);
    const normalizedSeeds = Array.from(
      new Set(
        seedIds
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    );
    if (!c.env.DB || candidateIds.length === 0) {
      return {
        consensus: null as any,
        sportsbooks: [] as any[],
        opening: {
          openSpread: null as number | null,
          openTotal: null as number | null,
          openMoneylineHome: null as number | null,
          openMoneylineAway: null as number | null,
        },
      };
    }

    const placeholders = candidateIds.map(() => "?").join(",");
    type SnapshotRow = {
      market_key: string;
      outcome_key: string;
      line_value: number | null;
      price_american: number | null;
      captured_at: string;
    };
    type OpeningRow = {
      market_key: string;
      outcome_key: string;
      opening_line_value: number | null;
      opening_price_american: number | null;
      opened_at: string;
    };

    const latestByPair = new Map<string, SnapshotRow>();
    try {
      const snapshotRows = await c.env.DB.prepare(`
        SELECT market_key, outcome_key, line_value, price_american, captured_at
        FROM odds_snapshots
        WHERE data_scope = 'PROD'
          AND game_id IN (${placeholders})
        ORDER BY datetime(captured_at) DESC
        LIMIT 200
      `).bind(...candidateIds).all<SnapshotRow>();
      for (const row of snapshotRows.results || []) {
        const pair = `${String(row.market_key || "").toUpperCase()}:${String(row.outcome_key || "").toUpperCase()}`;
        if (!latestByPair.has(pair)) latestByPair.set(pair, row);
      }
      if (latestByPair.size === 0) {
        const likeNeedles = Array.from(new Set(
          normalizedSeeds.flatMap((seed) => {
            const trimmed = String(seed || "").trim();
            if (!trimmed) return [];
            const parts = trimmed.split("_").filter(Boolean);
            const tail = parts.length >= 3 ? parts.slice(2).join("_") : trimmed;
            const hyphenTail = tail.replace(/_/g, "-");
            const underscoreTail = tail.replace(/-/g, "_");
            return [hyphenTail, underscoreTail]
              .map((v) => v.trim())
              .filter((v) => v.length >= 12);
          })
        )).slice(0, 4);
        if (likeNeedles.length > 0) {
          const likeClause = likeNeedles.map(() => `game_id LIKE ?`).join(" OR ");
          const likeRows = await c.env.DB.prepare(`
            SELECT market_key, outcome_key, line_value, price_american, captured_at
            FROM odds_snapshots
            WHERE data_scope = 'PROD'
              AND (${likeClause})
            ORDER BY datetime(captured_at) DESC
            LIMIT 200
          `).bind(...likeNeedles.map((needle) => `%${needle}%`)).all<SnapshotRow>();
          for (const row of likeRows.results || []) {
            const pair = `${String(row.market_key || "").toUpperCase()}:${String(row.outcome_key || "").toUpperCase()}`;
            if (!latestByPair.has(pair)) latestByPair.set(pair, row);
          }
        }
      }
    } catch {
      // Non-fatal; keep empty fallback.
    }

    const spreadHome = latestByPair.get("SPREAD:HOME")?.line_value ?? null;
    const spreadAway = latestByPair.get("SPREAD:AWAY")?.line_value ?? (spreadHome !== null ? -spreadHome : null);
    const total = latestByPair.get("TOTAL:OVER")?.line_value ?? latestByPair.get("TOTAL:UNDER")?.line_value ?? null;
    const moneylineHome = latestByPair.get("MONEYLINE:HOME")?.price_american ?? null;
    const moneylineAway = latestByPair.get("MONEYLINE:AWAY")?.price_american ?? null;
    const hasDbConsensus =
      spreadHome !== null ||
      spreadAway !== null ||
      total !== null ||
      moneylineHome !== null ||
      moneylineAway !== null;

    const earliestOpeningByPair = new Map<string, OpeningRow>();
    try {
      const openingRows = await c.env.DB.prepare(`
        SELECT market_key, outcome_key, opening_line_value, opening_price_american, opened_at
        FROM odds_opening
        WHERE data_scope = 'PROD'
          AND game_id IN (${placeholders})
        ORDER BY datetime(opened_at) ASC
        LIMIT 200
      `).bind(...candidateIds).all<OpeningRow>();
      for (const row of openingRows.results || []) {
        const pair = `${String(row.market_key || "").toUpperCase()}:${String(row.outcome_key || "").toUpperCase()}`;
        if (!earliestOpeningByPair.has(pair)) earliestOpeningByPair.set(pair, row);
      }
      if (earliestOpeningByPair.size === 0) {
        const likeNeedles = Array.from(new Set(
          normalizedSeeds.flatMap((seed) => {
            const trimmed = String(seed || "").trim();
            if (!trimmed) return [];
            const parts = trimmed.split("_").filter(Boolean);
            const tail = parts.length >= 3 ? parts.slice(2).join("_") : trimmed;
            const hyphenTail = tail.replace(/_/g, "-");
            const underscoreTail = tail.replace(/-/g, "_");
            return [hyphenTail, underscoreTail]
              .map((v) => v.trim())
              .filter((v) => v.length >= 12);
          })
        )).slice(0, 4);
        if (likeNeedles.length > 0) {
          const likeClause = likeNeedles.map(() => `game_id LIKE ?`).join(" OR ");
          const likeOpenRows = await c.env.DB.prepare(`
            SELECT market_key, outcome_key, opening_line_value, opening_price_american, opened_at
            FROM odds_opening
            WHERE data_scope = 'PROD'
              AND (${likeClause})
            ORDER BY datetime(opened_at) ASC
            LIMIT 200
          `).bind(...likeNeedles.map((needle) => `%${needle}%`)).all<OpeningRow>();
          for (const row of likeOpenRows.results || []) {
            const pair = `${String(row.market_key || "").toUpperCase()}:${String(row.outcome_key || "").toUpperCase()}`;
            if (!earliestOpeningByPair.has(pair)) earliestOpeningByPair.set(pair, row);
          }
        }
      }
    } catch {
      // Non-fatal; keep null openings.
    }

    const openSpread = earliestOpeningByPair.get("SPREAD:HOME")?.opening_line_value ?? null;
    const openTotal = earliestOpeningByPair.get("TOTAL:OVER")?.opening_line_value ?? earliestOpeningByPair.get("TOTAL:UNDER")?.opening_line_value ?? null;
    const openMoneylineHome = earliestOpeningByPair.get("MONEYLINE:HOME")?.opening_price_american ?? null;
    const openMoneylineAway = earliestOpeningByPair.get("MONEYLINE:AWAY")?.opening_price_american ?? null;

    const consensus = hasDbConsensus
      ? {
        sportsbook: "Consensus",
        spreadHome,
        spreadAway,
        total,
        moneylineHome,
        moneylineAway,
        spread1HHome: null,
        spread1HAway: null,
        total1H: null,
        moneyline1HHome: null,
        moneyline1HAway: null,
      }
      : null;

    return {
      consensus,
      sportsbooks: hasDbConsensus
        ? [{
          sportsbook: "D1 Snapshot Consensus",
          spreadHome,
          spreadAway,
          total,
          moneylineHome,
          moneylineAway,
          updatedAt: new Date().toISOString(),
        }]
        : [],
      opening: { openSpread, openTotal, openMoneylineHome, openMoneylineAway },
    };
  };
  const loadMovementFallback = async (seedIds: string[]) => {
    const candidateIds = buildFallbackIds(seedIds);
    for (const candidateId of candidateIds.slice(0, 3)) {
      const [spread, total, mlHome, mlAway] = await Promise.all([
        withTimeout(getLineMovement(c.env.DB, candidateId, "SPREAD", "HOME"), 700, null as any),
        withTimeout(getLineMovement(c.env.DB, candidateId, "TOTAL", "OVER"), 700, null as any),
        withTimeout(getLineMovement(c.env.DB, candidateId, "MONEYLINE", "HOME"), 700, null as any),
        withTimeout(getLineMovement(c.env.DB, candidateId, "MONEYLINE", "AWAY"), 700, null as any),
      ]);
      const spreadCurrent = toNum(spread?.currentLine);
      const spreadOpening = toNum(spread?.openingLine);
      const totalCurrent = toNum(total?.currentLine);
      const totalOpening = toNum(total?.openingLine);
      const mlHomeCurrent = toNum(mlHome?.currentPrice);
      const mlHomeOpening = toNum(mlHome?.openingPrice);
      const mlAwayCurrent = toNum(mlAway?.currentPrice);
      const mlAwayOpening = toNum(mlAway?.openingPrice);
      const hasAny =
        spreadCurrent !== null ||
        spreadOpening !== null ||
        totalCurrent !== null ||
        totalOpening !== null ||
        mlHomeCurrent !== null ||
        mlHomeOpening !== null ||
        mlAwayCurrent !== null ||
        mlAwayOpening !== null;
      if (!hasAny) continue;
      const consensus = {
        sportsbook: "Consensus",
        spreadHome: spreadCurrent ?? spreadOpening,
        spreadAway: spreadCurrent !== null ? -spreadCurrent : (spreadOpening !== null ? -spreadOpening : null),
        total: totalCurrent ?? totalOpening,
        moneylineHome: mlHomeCurrent ?? mlHomeOpening,
        moneylineAway: mlAwayCurrent ?? mlAwayOpening,
        spread1HHome: null,
        spread1HAway: null,
        total1H: null,
        moneyline1HHome: null,
        moneyline1HAway: null,
      };
      return {
        consensus,
        sportsbooks: [{
          sportsbook: "LineHistory Fallback",
          spreadHome: consensus.spreadHome,
          spreadAway: consensus.spreadAway,
          total: consensus.total,
          moneylineHome: consensus.moneylineHome,
          moneylineAway: consensus.moneylineAway,
          updatedAt: new Date().toISOString(),
        }],
        opening: {
          openSpread: spreadOpening,
          openTotal: totalOpening,
          openMoneylineHome: mlHomeOpening,
          openMoneylineAway: mlAwayOpening,
        },
      };
    }
    return null;
  };
  
  // Parse game ID to extract sport (format: sr_nba_xxx or sr:sport_event:xxx)
  let sport = '';
  if (gameId.startsWith('sr_')) {
    // Format: sr_nba_xxx
    const parts = gameId.split('_');
    sport = parts[1]?.toLowerCase() || '';
  } else if (gameId.startsWith('sr:')) {
    // Format: sr:sport_event:xxx - need to look up sport
    sport = 'unknown';
  }
  
  // First, get the game details
  let result = await withTimeout(
    fetchGameWithFallback(gameId),
    2500,
    { data: null } as any
  );
  
  if (!result.data?.game) {
    // Retry via sport slate as a recovery path when per-game lookup misses.
    if (sport && SUPPORTED_SPORTS.includes(sport as SportKey)) {
      try {
        const [liveSlateResult, scheduledSlateResult] = await Promise.all([
          withTimeout(
            fetchLiveGamesWithFallback({ sports: [sport as SportKey] }),
            1200,
            { data: [] } as any
          ),
          withTimeout(
            fetchScheduledGamesWithFallback({ sports: [sport as SportKey], hours: 120 }),
            1800,
            { data: [] } as any
          ),
        ]);
        const combinedSlate = [
          ...(liveSlateResult.data || []),
          ...(scheduledSlateResult.data || []),
        ];
        const recoveredGame = combinedSlate.find((g: any) =>
          String(g?.game_id || "") === gameId || String(g?.id || "") === gameId
        );
        if (recoveredGame) {
          result = {
            data: {
              game: recoveredGame,
              stats: [],
              playByPlay: [],
              injuries: [],
              weather: null,
              odds: [],
            },
          } as any;
        }
      } catch {
        // Continue to direct odds fallback.
      }
    }
  }
  if (!result.data?.game && c.env.DB) {
    try {
      const eventRow = await withTimeout(
        c.env.DB.prepare(`
          SELECT *
          FROM events
          WHERE id = ? OR external_id = ?
          LIMIT 1
        `).bind(gameId, gameId).first<Record<string, unknown>>(),
        1200,
        null
      );
      if (eventRow) {
        const row = eventRow as Record<string, unknown>;
        const recoveredGameId = String(row.id || gameId).trim() || gameId;
        const recoveredExternalId = String(row.external_id || row.provider_game_id || recoveredGameId).trim() || recoveredGameId;
        result = {
          data: {
            game: {
              game_id: recoveredGameId,
              external_id: recoveredExternalId,
              sport: String(row.sport || sport || "").toLowerCase(),
              home_team_name: String(row.home_team || row.home_team_name || "").trim(),
              away_team_name: String(row.away_team || row.away_team_name || "").trim(),
              start_time: String(row.start_time || row.commence_time || row.scheduled || "").trim() || null,
              status: String(row.status || row.game_status || "SCHEDULED").trim(),
            },
            stats: [],
            playByPlay: [],
            injuries: [],
            weather: null,
            odds: [],
          },
        } as any;
      }
    } catch {
      // Continue with direct odds fallback paths.
    }
  }
  
  if (!result.data?.game) {
    const dbFallbackNoGame = await loadDbOddsFallback([gameId]);
    if (dbFallbackNoGame.consensus) {
      return c.json({
        gameId,
        sport: sport || null,
        homeTeam: null,
        awayTeam: null,
        startTime: null,
        consensus: dbFallbackNoGame.consensus,
        first_half: null,
        sportsbooks: dbFallbackNoGame.sportsbooks,
        isLiveOdds: false,
        ...dbFallbackNoGame.opening,
        lastUpdated: new Date().toISOString(),
        source: "db_snapshot_fallback_no_game",
      }, {
        headers: cacheHeaders(120, { isPublic: true })
      });
    }
    const apiKey = c.env.SPORTSRADAR_API_KEY;
    const oddsKey = c.env.SPORTSRADAR_ODDS_KEY || apiKey;
    const oddsKeyCandidates = Array.from(new Set([oddsKey, apiKey].filter(Boolean))) as string[];
    const srIdCandidates = Array.from(
      new Set(
        [
          toSportsRadarEventId(String(gameId || "")),
          toSportsRadarMatchId(String(gameId || "")),
        ].filter(Boolean) as string[]
      )
    );
    if (oddsKeyCandidates.length > 0 && srIdCandidates.length > 0) {
      try {
        let directOdds: any = null;
        for (const srEventId of srIdCandidates.slice(0, 2)) {
          for (const keyCandidate of oddsKeyCandidates.slice(0, 2)) {
            directOdds = await withTimeout(
              fetchSportsRadarOddsForGame(srEventId, keyCandidate),
              900,
              null
            );
            if (directOdds) break;
          }
          if (directOdds) break;
        }
        if (directOdds) {
          const spreadHome = Number.isFinite(Number(directOdds.spreadHome ?? directOdds.spread))
            ? Number(directOdds.spreadHome ?? directOdds.spread)
            : null;
          const spreadAway = spreadHome !== null ? -spreadHome : null;
          const total = Number.isFinite(Number(directOdds.total)) ? Number(directOdds.total) : null;
          const moneylineHome = Number.isFinite(Number(directOdds.moneylineHome)) ? Number(directOdds.moneylineHome) : null;
          const moneylineAway = Number.isFinite(Number(directOdds.moneylineAway)) ? Number(directOdds.moneylineAway) : null;
          return c.json({
            gameId,
            sport: sport || null,
            homeTeam: null,
            awayTeam: null,
            startTime: null,
            consensus: {
              sportsbook: "Consensus",
              spreadHome,
              spreadAway,
              total,
              moneylineHome,
              moneylineAway,
              spread1HHome: null,
              spread1HAway: null,
              total1H: null,
              moneyline1HHome: null,
              moneyline1HAway: null,
            },
            first_half: null,
            sportsbooks: [
              {
                sportsbook: "SportsRadar Consensus",
                spreadHome,
                spreadAway,
                total,
                moneylineHome,
                moneylineAway,
                updatedAt: new Date().toISOString(),
              },
            ],
            isLiveOdds: false,
            openSpread: null,
            openTotal: null,
            openMoneylineHome: null,
            openMoneylineAway: null,
            lastUpdated: new Date().toISOString(),
            source: "sportsradar_direct_fallback",
          }, {
            headers: cacheHeaders(90, { isPublic: true })
          });
        }
      } catch {
        // Continue with not-found response below.
      }
    }
    // Synthesize a minimal game shell so we can still run DB/snapshot fallbacks.
    const fallbackSport = sport || "";
    const fallbackExternalId = (() => {
      const raw = String(gameId || "").trim();
      if (!raw.startsWith("sr_")) return raw;
      const parts = raw.split("_");
      return parts.slice(2).join("_");
    })();
    result = {
      data: {
        game: {
          game_id: gameId,
          external_id: fallbackExternalId || gameId,
          sport: fallbackSport,
          status: "SCHEDULED",
          home_team_name: "",
          away_team_name: "",
          start_time: null,
        },
        stats: [],
        playByPlay: [],
        injuries: [],
        weather: null,
        odds: [],
      },
    } as any;
  }
  
  const game = result.data.game;
  sport = (game.sport || sport).toLowerCase();
  const status = String(game.status || "").toUpperCase();
  const isLiveOdds = status === 'IN_PROGRESS' || status === 'LIVE';
  const fallbackSeedIds = [
    gameId,
    String(game.game_id || ""),
    String(game.external_id || ""),
    toSportsRadarEventId(String(game.game_id || "")) || "",
    toSportsRadarEventId(String(game.external_id || "")) || "",
  ];
  const dbFallback = await loadDbOddsFallback(fallbackSeedIds);
  const movementFallback = !dbFallback.consensus
    ? await loadMovementFallback(fallbackSeedIds)
    : null;
  const gameDate = (() => {
    const raw = String(game.start_time || "");
    if (!raw) return undefined;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed.toISOString().slice(0, 10);
  })();
  
  const sportsbooks: Array<{
    sportsbook: string;
    spreadHome: number | null;
    spreadAway: number | null;
    total: number | null;
    moneylineHome: number | null;
    moneylineAway: number | null;
    spread1HHome?: number | null;
    spread1HAway?: number | null;
    total1H?: number | null;
    moneyline1HHome?: number | null;
    moneyline1HAway?: number | null;
    updatedAt?: string;
  }> = [];
  
  // Fetch SportsRadar odds for this sport (uses caching)
  const apiKey = c.env.SPORTSRADAR_API_KEY;
  const oddsKey = c.env.SPORTSRADAR_ODDS_KEY || apiKey;
  const oddsKeyCandidates = Array.from(new Set([oddsKey, apiKey].filter(Boolean))) as string[];
  
  if (apiKey && sport) {
    try {
      const srIdCandidates = Array.from(
        new Set(
          [
            toSportsRadarEventId(String(game.game_id || "")),
            toSportsRadarEventId(String(game.external_id || "")),
            toSportsRadarMatchId(String(game.game_id || "")),
            toSportsRadarMatchId(String(game.external_id || "")),
            String(game.external_id || "").includes("-") ? `sr:sport_event:${String(game.external_id || "").trim()}` : null,
            String(game.external_id || "").includes("-") ? `sr:match:${String(game.external_id || "").trim()}` : null,
          ].filter(Boolean) as string[]
        )
      );

      // Fast path first: direct event odds is usually much cheaper than full book scans.
      let fastDirectOdds: any = null;
      if (withinBudget() && srIdCandidates.length > 0) {
        const fastSrIds = srIdCandidates.slice(0, 2);
        const fastKeys = (!includeFullBooks && !isLiveOdds)
          ? oddsKeyCandidates.slice(0, 2)
          : oddsKeyCandidates;
        const fastTimeoutMs = (!includeFullBooks && !isLiveOdds) ? 700 : 1500;
        for (const srEventId of fastSrIds) {
          for (const keyCandidate of fastKeys) {
            fastDirectOdds = await withTimeout(
              fetchSportsRadarOddsForGame(srEventId, keyCandidate),
              fastTimeoutMs,
              null
            );
            if (fastDirectOdds) break;
          }
          if (fastDirectOdds) break;
          if (!withinBudget()) break;
        }
      }
      if (fastDirectOdds) {
        sportsbooks.push({
          sportsbook: "SportsRadar Consensus",
          spreadHome: fastDirectOdds.spreadHome ?? fastDirectOdds.spread ?? null,
          spreadAway: fastDirectOdds.spreadAway ?? (fastDirectOdds.spread ? -fastDirectOdds.spread : null),
          total: fastDirectOdds.total ?? null,
          moneylineHome: fastDirectOdds.moneylineHome ?? null,
          moneylineAway: fastDirectOdds.moneylineAway ?? null,
          spread1HHome: fastDirectOdds.spread1HHome ?? null,
          spread1HAway: fastDirectOdds.spread1HAway ?? null,
          total1H: fastDirectOdds.total1H ?? null,
          moneyline1HHome: fastDirectOdds.moneyline1HHome ?? null,
          moneyline1HAway: fastDirectOdds.moneyline1HAway ?? null,
          updatedAt: new Date().toISOString(),
        });
        if (!includeFullBooks) {
          const consensus = {
            sportsbook: "Consensus",
            spreadHome: fastDirectOdds.spreadHome ?? fastDirectOdds.spread ?? null,
            spreadAway: fastDirectOdds.spreadAway ?? (fastDirectOdds.spread ? -fastDirectOdds.spread : null),
            total: fastDirectOdds.total ?? null,
            moneylineHome: fastDirectOdds.moneylineHome ?? null,
            moneylineAway: fastDirectOdds.moneylineAway ?? null,
            spread1HHome: fastDirectOdds.spread1HHome ?? null,
            spread1HAway: fastDirectOdds.spread1HAway ?? null,
            total1H: fastDirectOdds.total1H ?? null,
            moneyline1HHome: fastDirectOdds.moneyline1HHome ?? null,
            moneyline1HAway: fastDirectOdds.moneyline1HAway ?? null,
          };
          return c.json({
            gameId,
            sport: game.sport,
            homeTeam: game.home_team_name,
            awayTeam: game.away_team_name,
            startTime: game.start_time,
            consensus,
            first_half: {
              spread: {
                home_line: consensus.spread1HHome ?? null,
                away_line: consensus.spread1HAway ?? null,
              },
              total: {
                line: consensus.total1H ?? null,
              },
              moneyline: {
                home_price: consensus.moneyline1HHome ?? null,
                away_price: consensus.moneyline1HAway ?? null,
              },
            },
            sportsbooks,
            isLiveOdds,
            ...dbFallback.opening,
            lastUpdated: new Date().toISOString(),
            source: "sportsradar_fast",
          }, {
            headers: cacheHeaders(isLiveOdds ? 30 : 120, { isPublic: true })
          });
        }
      }
      if (!includeFullBooks && !isLiveOdds && sportsbooks.length === 0 && withinBudget()) {
        try {
          const keyCandidate = oddsKeyCandidates[0];
          if (keyCandidate) {
            const dateCandidates = Array.from(new Set([
              gameDate,
              gameDate
                ? new Date(new Date(`${gameDate}T00:00:00.000Z`).getTime() - 86400000).toISOString().slice(0, 10)
                : undefined,
              gameDate
                ? new Date(new Date(`${gameDate}T00:00:00.000Z`).getTime() + 86400000).toISOString().slice(0, 10)
                : undefined,
            ]));
            for (const dateCandidate of dateCandidates) {
              if (!withinBudget()) break;
              const cachedMap = await withTimeout(
                fetchSportsRadarOdds(sport, apiKey, c.env.DB, dateCandidate, keyCandidate),
                500,
                new Map<string, any>()
              );
              if (cachedMap.size === 0) continue;
              const homeTeamName = String(game.home_team_name || "");
              const awayTeamName = String(game.away_team_name || "");
              const candidateIds = new Set<string>(
                [
                  String(game.game_id || "").trim(),
                  String(game.external_id || "").trim(),
                  toSportsRadarEventId(String(game.game_id || "")) || "",
                  toSportsRadarEventId(String(game.external_id || "")) || "",
                  toSportsRadarMatchId(String(game.game_id || "")) || "",
                  toSportsRadarMatchId(String(game.external_id || "")) || "",
                ].filter(Boolean)
              );
              let cachedOdds: any = null;
              for (const [key, odds] of cachedMap) {
                if (candidateIds.has(String(key || "")) || candidateIds.has(String(odds?.gameId || ""))) {
                  cachedOdds = odds;
                  break;
                }
              }
              if (!cachedOdds) {
                for (const odds of cachedMap.values()) {
                  if (
                    teamsRoughlyMatch(String(odds?.homeTeam || ""), homeTeamName)
                    && teamsRoughlyMatch(String(odds?.awayTeam || ""), awayTeamName)
                  ) {
                    cachedOdds = odds;
                    break;
                  }
                }
              }
              if (cachedOdds) {
                sportsbooks.push({
                  sportsbook: "SportsRadar Cached Consensus",
                  spreadHome: cachedOdds.spreadHome ?? cachedOdds.spread ?? null,
                  spreadAway: cachedOdds.spreadAway ?? (cachedOdds.spread ? -cachedOdds.spread : null),
                  total: cachedOdds.total ?? null,
                  moneylineHome: cachedOdds.moneylineHome ?? null,
                  moneylineAway: cachedOdds.moneylineAway ?? null,
                  updatedAt: new Date().toISOString(),
                });
                break;
              }
            }
          }
        } catch {
          // Non-fatal; keep fast scheduled fallback.
        }
      }
      if (!includeFullBooks && !isLiveOdds && sportsbooks.length === 0) {
        const fallbackPack = dbFallback.consensus ? dbFallback : movementFallback;
        if (fallbackPack?.consensus) {
          return c.json({
            gameId,
            sport: game.sport,
            homeTeam: game.home_team_name,
            awayTeam: game.away_team_name,
            startTime: game.start_time,
            consensus: fallbackPack.consensus,
            first_half: null,
            sportsbooks: fallbackPack.sportsbooks,
            isLiveOdds,
            ...fallbackPack.opening,
            lastUpdated: new Date().toISOString(),
            source: dbFallback.consensus ? "db_snapshot_fallback" : "line_history_fallback",
          }, {
            headers: cacheHeaders(120, { isPublic: true })
          });
        }
        // Self-heal missing pregame odds: backfill snapshots asynchronously so
        // subsequent requests have DB history even when provider calls miss now.
        if (apiKey && sport) {
          const backfillSport = sport;
          const backfillDate = gameDate;
          const backfillHome = String(game.home_team_name || "");
          const backfillAway = String(game.away_team_name || "");
          const backfillGameIds = Array.from(new Set([
            gameId,
            String(game.game_id || ""),
            String(game.external_id || ""),
          ].filter(Boolean)));
          c.executionCtx.waitUntil((async () => {
            try {
              for (const keyCandidate of oddsKeyCandidates.slice(0, 1)) {
                const map = await fetchSportsRadarOdds(backfillSport, apiKey, c.env.DB, backfillDate, keyCandidate);
                if (!map || map.size === 0) continue;
                let matched: SportsRadarOdds | null = null;
                for (const odds of map.values()) {
                  if (
                    teamsRoughlyMatch(String(odds?.homeTeam || ""), backfillHome)
                    && teamsRoughlyMatch(String(odds?.awayTeam || ""), backfillAway)
                  ) {
                    matched = odds;
                    break;
                  }
                }
                if (!matched) continue;
                for (const id of backfillGameIds) {
                  const snapshotOdds: SportsRadarOdds = {
                    ...matched,
                    gameId: id,
                  };
                  await storeOpeningLines(c.env.DB, id, snapshotOdds);
                  await captureOddsSnapshot(c.env.DB, id, backfillSport, snapshotOdds);
                }
                break;
              }
            } catch {
              // Non-fatal asynchronous backfill.
            }
          })());
        }
        return c.json({
          gameId,
          sport: game.sport,
          homeTeam: game.home_team_name,
          awayTeam: game.away_team_name,
          startTime: game.start_time,
          consensus: null,
          first_half: null,
          sportsbooks: [],
          isLiveOdds,
          ...(movementFallback?.opening || dbFallback.opening),
          lastUpdated: new Date().toISOString(),
          source: "sportsradar_scheduled_fast_skip_scan",
        }, {
          headers: cacheHeaders(120, { isPublic: true })
        });
      }

      // Fetch full sportsbook grid only when explicitly requested.
      let allBooks: any[] = [];
      if (includeFullBooks) {
        for (const keyCandidate of oddsKeyCandidates) {
          if (!withinBudget()) break;
          allBooks = await withTimeout(
            fetchAllSportsbooksForGame(
              sport,
              apiKey,
              c.env.DB,
              game.home_team_name || '',
              game.away_team_name || '',
              keyCandidate
            ),
            3500,
            []
          );
          if (allBooks.length > 0) break;
        }
      }
      
      if (allBooks.length > 0) {
        sportsbooks.length = 0;
        sportsbooks.push(...allBooks);
      } else {
        // Fallback to consensus if no individual books returned
        let oddsMap = new Map<string, any>();
        const dateCandidates = Array.from(new Set([gameDate, undefined]));
        for (const keyCandidate of oddsKeyCandidates) {
          if (!withinBudget()) break;
          for (const dateCandidate of dateCandidates) {
            const candidateMap = await withTimeout(
              fetchSportsRadarOdds(sport, apiKey, c.env.DB, dateCandidate, keyCandidate),
              3500,
              new Map<string, any>()
            );
            if (candidateMap.size > 0) {
              oddsMap = candidateMap;
              break;
            }
          }
          if (oddsMap.size > 0) {
            break;
          }
        }

        const homeTeamName = String(game.home_team_name || "");
        const awayTeamName = String(game.away_team_name || "");
        const candidateIds = new Set<string>(
          [
            String(game.game_id || "").trim(),
            String(game.external_id || "").trim(),
            toSportsRadarEventId(String(game.game_id || "")) || "",
            toSportsRadarEventId(String(game.external_id || "")) || "",
            toSportsRadarMatchId(String(game.game_id || "")) || "",
            toSportsRadarMatchId(String(game.external_id || "")) || "",
          ].filter(Boolean)
        );

        let gameOdds: any = null;
        // Pass 1: direct ID/key matching.
        for (const [key, odds] of oddsMap) {
          if (candidateIds.has(String(key || "")) || candidateIds.has(String(odds?.gameId || ""))) {
            gameOdds = odds;
            break;
          }
        }
        // Pass 2: fuzzy team-name matching (handles college naming variations).
        if (!gameOdds) {
          for (const odds of oddsMap.values()) {
            if (
              teamsRoughlyMatch(String(odds?.homeTeam || ""), homeTeamName)
              && teamsRoughlyMatch(String(odds?.awayTeam || ""), awayTeamName)
            ) {
              gameOdds = odds;
              break;
            }
          }
        }
        // Pass 3: direct event odds endpoint by SportsRadar event ID.
        if (!gameOdds) {
          if (srIdCandidates.length > 0) {
            try {
              let directOdds: any = null;
              for (const srEventId of srIdCandidates) {
                for (const keyCandidate of oddsKeyCandidates) {
                  directOdds = await withTimeout(
                    fetchSportsRadarOddsForGame(srEventId, keyCandidate),
                    1500,
                    null
                  );
                  if (directOdds) break;
                }
                if (directOdds) break;
                if (!withinBudget()) break;
              }
              if (directOdds) gameOdds = directOdds;
            } catch {
              // Non-fatal fallback path.
            }
          }
        }
        
        if (gameOdds) {
          sportsbooks.push({
            sportsbook: "SportsRadar Consensus",
            spreadHome: gameOdds.spreadHome ?? gameOdds.spread ?? null,
            spreadAway: gameOdds.spreadAway ?? (gameOdds.spread ? -gameOdds.spread : null),
            total: gameOdds.total ?? null,
            moneylineHome: gameOdds.moneylineHome ?? null,
            moneylineAway: gameOdds.moneylineAway ?? null,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.log("[Games API] SportsRadar odds fetch failed:", err);
    }
  }
  
  // Track if odds are live in-game odds (precomputed above)
  
  // Calculate consensus (average of all sportsbooks)
  let consensus = undefined;
  if (sportsbooks.length > 0) {
    const avg = (arr: (number | null)[]) => {
      const nums = arr.filter((n): n is number => n !== null);
      return nums.length > 0 ? (nums.reduce((a, b) => a + b, 0) / nums.length) : null;
    };
    const snapHalf = (value: number | null) => (value === null ? null : Math.round(value * 2) / 2);
    const snapInt = (value: number | null) => (value === null ? null : Math.round(value));
    
    consensus = {
      sportsbook: "Consensus",
      spreadHome: snapHalf(avg(sportsbooks.map(s => s.spreadHome))),
      spreadAway: snapHalf(avg(sportsbooks.map(s => s.spreadAway))),
      total: snapHalf(avg(sportsbooks.map(s => s.total))),
      moneylineHome: snapInt(avg(sportsbooks.map(s => s.moneylineHome))),
      moneylineAway: snapInt(avg(sportsbooks.map(s => s.moneylineAway))),
      spread1HHome: snapHalf(avg(sportsbooks.map(s => s.spread1HHome ?? null))),
      spread1HAway: snapHalf(avg(sportsbooks.map(s => s.spread1HAway ?? null))),
      total1H: snapHalf(avg(sportsbooks.map(s => s.total1H ?? null))),
      moneyline1HHome: snapInt(avg(sportsbooks.map(s => s.moneyline1HHome ?? null))),
      moneyline1HAway: snapInt(avg(sportsbooks.map(s => s.moneyline1HAway ?? null))),
    };
  }
  if (!consensus && dbFallback.consensus) {
    consensus = dbFallback.consensus;
    if (sportsbooks.length === 0) sportsbooks.push(...dbFallback.sportsbooks);
  }
  if (!consensus && movementFallback?.consensus) {
    consensus = movementFallback.consensus;
    if (sportsbooks.length === 0) sportsbooks.push(...movementFallback.sportsbooks);
  }
  
  // Sort sportsbooks by priority
  const priority = ["DraftKings", "FanDuel", "BetMGM", "Caesars", "ESPN BET", "PointsBet", "Bet365", "SportsRadar"];
  sportsbooks.sort((a, b) => {
    const aIdx = priority.findIndex(p => a.sportsbook.includes(p));
    const bIdx = priority.findIndex(p => b.sportsbook.includes(p));
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.sportsbook.localeCompare(b.sportsbook);
  });
  
  // Try to get opening odds from line_history table
  let openingOdds: {
    openSpread?: number | null;
    openTotal?: number | null;
    openMoneylineHome?: number | null;
    openMoneylineAway?: number | null;
  } = { ...(movementFallback?.opening || dbFallback.opening) };
  
  try {
    // Try line_history with the game ID
    const openingLines = await c.env.DB.prepare(`
      SELECT market_type, value, MIN(timestamp) as first_seen
      FROM line_history 
      WHERE game_id = ?
      GROUP BY market_type
      ORDER BY market_type
    `).bind(gameId).all<{
      market_type: string;
      value: number;
      first_seen: string;
    }>();
    
    if (openingLines.results?.length) {
      for (const row of openingLines.results) {
        if (row.market_type === 'spread') openingOdds.openSpread = row.value;
        if (row.market_type === 'total') openingOdds.openTotal = row.value;
        if (row.market_type === 'moneyline') openingOdds.openMoneylineHome = row.value;
      }
    }
  } catch (err) {
    console.log("[Games API] Opening odds query failed:", err);
  }
  
  return c.json({
    gameId,
    sport: game.sport,
    homeTeam: game.home_team_name,
    awayTeam: game.away_team_name,
    startTime: game.start_time,
    consensus,
    first_half: consensus ? {
      spread: {
        home_line: consensus.spread1HHome ?? null,
        away_line: consensus.spread1HAway ?? null,
      },
      total: {
        line: consensus.total1H ?? null,
      },
      moneyline: {
        home_price: consensus.moneyline1HHome ?? null,
        away_price: consensus.moneyline1HAway ?? null,
      },
    } : null,
    sportsbooks,
    isLiveOdds,
    ...openingOdds,
    lastUpdated: new Date().toISOString(),
    source: "sportsradar",
  }, { 
    headers: cacheHeaders(isLiveOdds ? 30 : 120, { isPublic: true }) // 30s cache for live odds, 2min for pregame
  });
});

// ============ Play-by-Play Endpoints ============

/**
 * ESPN Play-by-Play Fallback
 * Fetches play-by-play from ESPN's public API when SportsRadar fails
 */
async function fetchEspnPlayByPlay(
  sport: SportKey,
  gameId: string,
  env: Env
): Promise<{
  plays: PlayByPlayEvent[];
  lastPlay: PlayByPlayEvent | null;
  isLive: boolean;
  homeTeam: string | null;
  awayTeam: string | null;
  gameStatus: string | null;
} | null> {
  // ESPN sport/league mapping
  const espnSportMap: Record<string, { sport: string; league: string }> = {
    nfl: { sport: 'football', league: 'nfl' },
    nba: { sport: 'basketball', league: 'nba' },
    mlb: { sport: 'baseball', league: 'mlb' },
    nhl: { sport: 'hockey', league: 'nhl' },
    ncaaf: { sport: 'football', league: 'college-football' },
    ncaab: { sport: 'basketball', league: 'mens-college-basketball' },
    soccer: { sport: 'soccer', league: 'usa.1' },
  };

  const espnConfig = espnSportMap[sport];
  if (!espnConfig) return null;

  try {
    let homeTeam = '';
    let awayTeam = '';
    
    // Try to get game info from events table
    const gameRecord = await env.DB.prepare(`
      SELECT home_team, away_team FROM events 
      WHERE external_id LIKE ? OR id = ? LIMIT 1
    `).bind(`%${gameId}%`, gameId).first<{ home_team: string; away_team: string }>();
    
    if (gameRecord) {
      homeTeam = gameRecord.home_team || '';
      awayTeam = gameRecord.away_team || '';
    }

    let espnEventId: string | null = null;

    // Search ESPN scoreboard to find matching game
    if (homeTeam && awayTeam) {
      const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/${espnConfig.sport}/${espnConfig.league}/scoreboard`;
      console.log(`[ESPN Fallback] Searching scoreboard: ${scoreboardUrl}`);
      
      const sbResponse = await fetch(scoreboardUrl);
      if (sbResponse.ok) {
        const sbData = await sbResponse.json() as any;
        const events = sbData.events || [];
        
        // Try to match by team names
        const homeTeamLower = homeTeam.toLowerCase();
        const awayTeamLower = awayTeam.toLowerCase();
        
        for (const event of events) {
          const competitors = event.competitions?.[0]?.competitors || [];
          const eventHome = competitors.find((c: any) => c.homeAway === 'home');
          const eventAway = competitors.find((c: any) => c.homeAway === 'away');
          
          const eventHomeAbbr = (eventHome?.team?.abbreviation || '').toLowerCase();
          const eventAwayAbbr = (eventAway?.team?.abbreviation || '').toLowerCase();
          const eventHomeName = (eventHome?.team?.displayName || '').toLowerCase();
          const eventAwayName = (eventAway?.team?.displayName || '').toLowerCase();
          
          // Match by abbreviation or name
          const homeMatch = homeTeamLower.includes(eventHomeAbbr) || eventHomeName.includes(homeTeamLower) || 
                           homeTeamLower.includes(eventHomeName.split(' ').pop() || '');
          const awayMatch = awayTeamLower.includes(eventAwayAbbr) || eventAwayName.includes(awayTeamLower) ||
                           awayTeamLower.includes(eventAwayName.split(' ').pop() || '');
          
          if (homeMatch && awayMatch) {
            espnEventId = event.id;
            console.log(`[ESPN Fallback] Matched game: ${espnEventId}`);
            break;
          }
        }
      }
    }

    if (!espnEventId) {
      console.log(`[ESPN Fallback] Could not find ESPN event ID for ${sport}/${gameId}`);
      return null;
    }

    // Fetch the game summary which includes play-by-play
    const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/${espnConfig.sport}/${espnConfig.league}/summary?event=${espnEventId}`;
    console.log(`[ESPN Fallback] Fetching: ${summaryUrl}`);
    
    const response = await fetch(summaryUrl);
    if (!response.ok) {
      console.log(`[ESPN Fallback] Summary API error: ${response.status}`);
      return null;
    }

    const data = await response.json() as any;
    const plays: PlayByPlayEvent[] = [];
    
    // Extract teams from ESPN response if we don't have them yet
    const competitors = data.boxscore?.teams || data.header?.competitions?.[0]?.competitors || [];
    const homeTeamData = competitors.find((c: any) => c.homeAway === 'home' || c.team?.homeAway === 'home');
    const awayTeamData = competitors.find((c: any) => c.homeAway === 'away' || c.team?.homeAway === 'away');
    if (!homeTeam) homeTeam = homeTeamData?.team?.abbreviation || homeTeamData?.team?.displayName || '';
    if (!awayTeam) awayTeam = awayTeamData?.team?.abbreviation || awayTeamData?.team?.displayName || '';

    // Parse plays from ESPN format
    const espnPlays = data.plays || [];
    
    for (const play of espnPlays) {
      const desc = play.text || play.shortText || '';
      const descLower = desc.toLowerCase();
      
      // Classify play
      const points = play.scoringPlay ? (play.scoreValue || 0) : 0;
      const isScoring = play.scoringPlay || false;
      const is3PT = descLower.includes('three') || descLower.includes('3-pt') || descLower.includes('3pt') || points === 3;
      const isDunk = descLower.includes('dunk') || descLower.includes('slam');
      const isBlock = descLower.includes('block');
      const isSteal = descLower.includes('steal');
      const isMajor = is3PT || isDunk || isBlock || isSteal || points >= 3;
      
      // Extract period/clock
      let period = '';
      let clock = '';
      if (sport === 'mlb') {
        const periodDisplay = String(
          play.period?.displayValue ||
          play.period?.type ||
          play.period?.shortDisplayName ||
          ''
        ).trim();
        if (periodDisplay) {
          period = periodDisplay;
        } else if (play.period?.number) {
          period = `${play.period.number}th Inning`;
        }
      } else if (play.period?.number) {
        period = sport === 'nhl' ? `P${play.period.number}` : `Q${play.period.number}`;
      }
      if (play.clock?.displayValue) {
        clock = play.clock.displayValue;
      }
      
      // Extract team
      const team = play.team?.abbreviation || play.team?.displayName || null;
      
      // Extract scores
      const awayScore = play.awayScore ?? null;
      const homeScore = play.homeScore ?? null;
      
      plays.push({
        playId: parseInt(play.id) || plays.length,
        period,
        clock,
        team,
        description: desc,
        awayScore,
        homeScore,
        type: play.type?.text || play.type?.abbreviation || null,
        timestamp: play.wallclock || null,
        playerId: play.participants?.[0]?.athlete?.id ? parseInt(play.participants[0].athlete.id) : null,
        playerName: play.participants?.[0]?.athlete?.displayName || null,
        assistPlayerId: play.participants?.[1]?.athlete?.id ? parseInt(play.participants[1].athlete.id) : null,
        assistPlayerName: play.participants?.[1]?.athlete?.displayName || null,
        isScoring,
        isMajor,
        points,
      });
    }
    
    // Sort by most recent first
    plays.sort((a, b) => b.playId - a.playId);
    
    // Determine game status
    const status = data.header?.competitions?.[0]?.status?.type?.name || 
                   data.gameInfo?.status?.type?.name || '';
    const isLive = status === 'STATUS_IN_PROGRESS' || status.includes('IN_PROGRESS');
    
    const lastPlay = plays.length > 0 ? plays[0] : null;
    
    return {
      plays,
      lastPlay,
      isLive,
      homeTeam,
      awayTeam,
      gameStatus: status,
    };
    
  } catch (err) {
    console.error(`[ESPN Fallback] Error:`, err);
    return null;
  }
}

/**
 * Play-by-play event from legacy provider API
 */
interface PlayByPlayEvent {
  playId: number;
  period: string;
  clock: string;
  team: string | null;
  description: string;
  awayScore: number | null;
  homeScore: number | null;
  type: string | null;
  timestamp: string | null;
  // Enhanced player data for visual feed
  playerId: number | null;
  playerName: string | null;
  assistPlayerId: number | null;
  assistPlayerName: string | null;
  // Play classification for animations
  isScoring: boolean;
  isMajor: boolean; // 3PT, dunk, block, steal, lead change
  points: number;
}

// SportsRadar API configuration for play-by-play
const SR_PBP_CONFIG: Record<string, { base: string; version: string; apiPath: string }> = {
  'nba': { base: 'https://api.sportradar.com/nba/production', version: 'v8', apiPath: 'nba' },
  'nfl': { base: 'https://api.sportradar.com/nfl/production', version: 'v7', apiPath: 'nfl' },
  'mlb': { base: 'https://api.sportradar.com/mlb/production', version: 'v7', apiPath: 'mlb' },
  'nhl': { base: 'https://api.sportradar.com/nhl/production', version: 'v7', apiPath: 'nhl' },
  'ncaab': { base: 'https://api.sportradar.com/ncaamb/production', version: 'v8', apiPath: 'ncaamb' },
  'ncaaf': { base: 'https://api.sportradar.com/ncaafb/production', version: 'v7', apiPath: 'ncaafb' },
};

// Helper to fetch play-by-play from SportsRadar
async function fetchSportsRadarPlayByPlay(
  apiKey: string,
  sport: string,
  gameId: string
): Promise<{ data: any | null; error: string | null }> {
  const config = SR_PBP_CONFIG[sport.toLowerCase()];
  if (!config) {
    return { data: null, error: `Unsupported sport: ${sport}` };
  }
  
  // SportsRadar play-by-play endpoint: /games/{gameId}/pbp.json
  const url = `${config.base}/${config.version}/en/games/${gameId}/pbp.json?api_key=${apiKey}`;
  
  console.log(`[Play-by-Play] Fetching SportsRadar: ${sport}/${gameId}`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { data: null, error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: String(err) };
  }
}

// Helper to classify if a play is "major" (highlight-worthy)
function classifyPlay(play: any, desc: string, sport: string): { isScoring: boolean; isMajor: boolean; points: number } {
  const descLower = desc.toLowerCase();
  const eventType = (play.event_type || play.type || '').toLowerCase();
  
  let points = 0;
  let isScoring = false;
  let isMajor = false;
  
  if (sport === 'nba' || sport === 'ncaab') {
    // Basketball scoring
    if (eventType.includes('threepointmade') || descLower.includes('3pt') || descLower.includes('three')) {
      points = 3;
      isScoring = true;
      isMajor = true;
    } else if (eventType.includes('twopointmade') || eventType.includes('fieldgoalmade') || descLower.includes('makes')) {
      points = 2;
      isScoring = true;
    } else if (eventType.includes('freethrowmade') || descLower.includes('free throw')) {
      points = 1;
      isScoring = true;
    }
    
    // Major plays
    const isDunk = descLower.includes('dunk') || descLower.includes('slam');
    const isBlock = descLower.includes('block') || eventType.includes('block');
    const isSteal = descLower.includes('steal') || eventType.includes('steal');
    const isAlleyOop = descLower.includes('alley') || descLower.includes('oop');
    const isBuzzer = descLower.includes('buzzer');
    
    isMajor = isMajor || isDunk || isBlock || isSteal || isAlleyOop || isBuzzer;
    
  } else if (sport === 'nhl') {
    // Hockey scoring
    if (eventType.includes('goal') || descLower.includes('scores') || descLower.includes('goal')) {
      points = 1;
      isScoring = true;
      isMajor = true;
    }
    const isPenalty = eventType.includes('penalty') || descLower.includes('penalty');
    const isSave = eventType.includes('save') && descLower.includes('big');
    isMajor = isMajor || isPenalty || isSave;
    
  } else if (sport === 'mlb') {
    // Baseball scoring
    const runs = play.runs_scored || play.runs || 0;
    if (runs > 0) {
      points = runs;
      isScoring = true;
    }
    const isHomeRun = descLower.includes('home run') || descLower.includes('homer');
    const isStrikeout = descLower.includes('strikes out') || descLower.includes('strikeout');
    isMajor = isHomeRun || runs >= 2 || (isStrikeout && play.outs === 3);
    
  } else if (sport === 'nfl' || sport === 'ncaaf') {
    // Football scoring
    if (eventType.includes('touchdown') || descLower.includes('touchdown')) {
      points = 6;
      isScoring = true;
      isMajor = true;
    } else if (eventType.includes('fieldgoal') || descLower.includes('field goal')) {
      points = 3;
      isScoring = true;
    } else if (eventType.includes('extrapoint') || descLower.includes('extra point')) {
      points = 1;
      isScoring = true;
    } else if (eventType.includes('safety') || descLower.includes('safety')) {
      points = 2;
      isScoring = true;
      isMajor = true;
    }
    
    const isInterception = descLower.includes('intercept') || eventType.includes('interception');
    const isFumble = descLower.includes('fumble') || eventType.includes('fumble');
    const isSack = descLower.includes('sack') || eventType.includes('sack');
    isMajor = isMajor || isInterception || isFumble || isSack;
  }
  
  return { isScoring, isMajor, points };
}

// Parse SportsRadar play-by-play data into standardized format
function parseSportsRadarPBP(data: any, sport: string): PlayByPlayEvent[] {
  const plays: PlayByPlayEvent[] = [];
  const game = data.game || data;
  
  // Different sports have different structures
  let prevAwayScore = 0;
  let prevHomeScore = 0;
  
  // NBA/NCAAB: periods[] -> events[]
  // NHL: periods[] -> events[]
  // MLB: innings[] -> halfs[] -> events[]
  // NFL/NCAAF: quarters[] -> events[]
  
  const periods = game.periods || game.quarters || game.innings || [];

  const toOrdinal = (value: number): string => {
    const mod100 = value % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
    const mod10 = value % 10;
    if (mod10 === 1) return `${value}st`;
    if (mod10 === 2) return `${value}nd`;
    if (mod10 === 3) return `${value}rd`;
    return `${value}th`;
  };

  const toMlbHalfLabel = (raw: unknown): string => {
    const value = String(raw ?? '').trim().toLowerCase();
    if (!value) return '';
    if (value.includes('top') || value === 't' || value === '1' || value.includes('away')) return 'Top';
    if (value.includes('bot') || value.includes('bottom') || value === 'b' || value === '2' || value.includes('home')) return 'Bot';
    return '';
  };
  
  for (const period of periods) {
    const periodNum = period.number || period.sequence || periods.indexOf(period) + 1;
    const periodLabel = sport === 'mlb' ? `${periodNum}` : 
                        sport === 'nhl' ? `P${periodNum}` : 
                        `Q${periodNum}`;
    
    // Get events from period (may be nested in halfs for MLB)
    let events: any[] = [];
    
    if (sport === 'mlb' && period.halfs) {
      // MLB: halfs contain events
      for (const half of period.halfs) {
        const halfLabel = toMlbHalfLabel(
          half.half ?? half.type ?? half.name ?? half.alias ?? half.number ?? half.sequence
        );
        const halfOuts = half.outs ?? half.current_outs ?? half.out_count ?? null;
        const halfEvents = (half.events || half.at_bats || []).map((ev: any) => ({
          ...ev,
          __mlbHalfLabel: halfLabel,
          __mlbHalfOuts: halfOuts,
          __mlbPeriodNum: periodNum,
        }));
        events = events.concat(halfEvents);
      }
    } else {
      events = period.events || period.plays || [];
    }
    
    for (const event of events) {
      const desc = event.description || event.play_description || event.event_description || '';
      const classification = classifyPlay(event, desc, sport);
      
      // Track scores
      const currAway = event.away_points ?? event.away_score ?? prevAwayScore;
      const currHome = event.home_points ?? event.home_score ?? prevHomeScore;
      
      // Detect lead changes
      const wasLeading = prevHomeScore > prevAwayScore ? 'home' : prevAwayScore > prevHomeScore ? 'away' : 'tie';
      const nowLeading = currHome > currAway ? 'home' : currAway > currHome ? 'away' : 'tie';
      const isLeadChange = wasLeading !== 'tie' && nowLeading !== 'tie' && wasLeading !== nowLeading;
      
      // Format clock
      let clock = '';
      if (event.clock) {
        clock = event.clock;
      } else if (event.game_clock) {
        clock = event.game_clock;
      } else if (event.time_remaining !== undefined) {
        const mins = Math.floor(event.time_remaining / 60);
        const secs = event.time_remaining % 60;
        clock = `${mins}:${String(secs).padStart(2, '0')}`;
      }

      let resolvedPeriod = periodLabel;
      if (sport === 'mlb') {
        const half = event.__mlbHalfLabel
          || toMlbHalfLabel(event.half ?? event.half_inning ?? event.inning_half ?? event.inning_half_type ?? event.offense ?? event.at_bat_team);
        const inningNumRaw = event.__mlbPeriodNum ?? event.inning ?? event.period ?? periodNum;
        const inningNum = Number(inningNumRaw);
        if (half && Number.isFinite(inningNum) && inningNum > 0) {
          resolvedPeriod = `${half} ${toOrdinal(inningNum)}`;
        } else if (Number.isFinite(inningNum) && inningNum > 0) {
          resolvedPeriod = `${toOrdinal(inningNum)} Inning`;
        }

        if (!clock) {
          const outsRaw = event.outs ?? event.current_outs ?? event.out_count ?? event.__mlbHalfOuts;
          const outsNum = Number(outsRaw);
          if (Number.isFinite(outsNum) && outsNum >= 0) {
            clock = `${outsNum} Out${outsNum === 1 ? '' : 's'}`;
          }
        }
      }
      
      // Get player info - SportsRadar uses different field names
      const player = event.player || event.statistics?.[0]?.player || null;
      const assist = event.assist || event.statistics?.[1]?.player || null;
      
      plays.push({
        playId: event.id || event.event_id || event.sequence || plays.length,
        period: resolvedPeriod,
        clock,
        team: event.team?.alias || event.team?.name || event.attribution?.team?.alias || null,
        description: desc,
        awayScore: currAway,
        homeScore: currHome,
        type: event.event_type || event.type || null,
        timestamp: event.updated || event.wall_clock || null,
        playerId: player?.id || null,
        playerName: player?.full_name || player?.name || null,
        assistPlayerId: assist?.id || null,
        assistPlayerName: assist?.full_name || assist?.name || null,
        isScoring: classification.isScoring,
        isMajor: classification.isMajor || isLeadChange,
        points: classification.points,
      });
      
      prevAwayScore = currAway;
      prevHomeScore = currHome;
    }
  }
  
  return plays;
}

function isLowDetailMlbPbp(plays: PlayByPlayEvent[]): boolean {
  if (!Array.isArray(plays) || plays.length === 0) return true;
  const sample = plays.slice(0, Math.min(12, plays.length));
  const meaningful = sample.filter((p) => {
    const desc = String(p.description || '').trim();
    const type = String(p.type || '').trim();
    const team = String(p.team || '').trim();
    const period = String(p.period || '').toLowerCase();
    const hasHalf = period.includes('top') || period.includes('bot') || period.includes('bottom');
    return Boolean(desc || type || team || hasHalf);
  });
  return meaningful.length === 0;
}

/**
 * GET /api/games/:gameId/playbyplay
 * Fetch play-by-play data for a specific game from SportsRadar
 */
gamesRouter.get("/:gameId/playbyplay", async (c) => {
  const gameId = c.req.param("gameId");
  
  // Parse game ID format: sr_nba_12345678
  const parts = gameId.split('_');
  let sport: SportKey = 'nba';
  let numericId = '';
  let isSportsRadar = false;
  
  if (parts.length >= 3 && parts[0] === 'sr') {
    sport = parts[1] as SportKey;
    numericId = parts.slice(2).join('_'); // Handle IDs with underscores
    isSportsRadar = true;
  } else if (parts.length === 2) {
    sport = parts[0] as SportKey;
    numericId = parts[1];
  } else {
    numericId = parts[parts.length - 1];
  }
  
  const srApiKey = c.env.SPORTSRADAR_API_KEY;
  
  // Try SportsRadar first for sr_ IDs
  if (srApiKey && isSportsRadar) {
    const { data, error } = await fetchSportsRadarPlayByPlay(srApiKey, sport, numericId);
    
    if (data) {
      const plays = parseSportsRadarPBP(data, sport);
      
      // Sort by most recent first
      plays.sort((a, b) => b.playId - a.playId);

      // Some MLB SportsRadar feeds return sparse inning-only events (no text/team/type),
      // which prevents rendering Top/Bot context. Fall back to ESPN if available.
      if (sport === 'mlb' && isLowDetailMlbPbp(plays)) {
        const espnResult = await fetchEspnPlayByPlay(sport, numericId, c.env);
        if (espnResult) {
          return c.json({
            ...espnResult,
            source: 'espn',
            timestamp: new Date().toISOString(),
          }, {
            headers: cacheHeaders(espnResult.isLive ? 15 : 60, { isPublic: true })
          });
        }
      }
      
      const lastPlay = plays.length > 0 ? plays[0] : null;
      const game = data.game || data;
      const status = game.status?.toLowerCase() || '';
      const isLive = status === 'inprogress' || status === 'live' || status === 'halftime';
      
      return c.json({
        plays,
        lastPlay,
        gameStatus: game.status || null,
        isLive,
        homeTeam: game.home?.alias || game.home?.name || null,
        awayTeam: game.away?.alias || game.away?.name || null,
        source: 'sportsradar',
        timestamp: new Date().toISOString(),
      }, { 
        headers: cacheHeaders(isLive ? 15 : 60, { isPublic: true })
      });
    }
    
    if (error) {
      console.log(`[Play-by-Play] SportsRadar error: ${error}, trying ESPN fallback...`);
    }
  }
  
  // Try ESPN as fallback
  const espnResult = await fetchEspnPlayByPlay(sport, numericId, c.env);
  if (espnResult) {
    return c.json({
      ...espnResult,
      source: 'espn',
      timestamp: new Date().toISOString(),
    }, { 
      headers: cacheHeaders(espnResult.isLive ? 15 : 60, { isPublic: true })
    });
  }
  
  return c.json({ 
    plays: [], 
    error: "No play-by-play data available",
    lastPlay: null,
    source: null,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/games/:gameId/line-history
 * Fetch historical line movement for a specific game
 * Returns spread, total, and moneyline changes over time
 */
gamesRouter.get("/:gameId/line-history", async (c) => {
  const gameId = c.req.param("gameId");
  const routeStartedAt = Date.now();
  const phaseMs: Record<string, number> = {};
  const markPhase = (phase: string, startedAt: number) => {
    phaseMs[phase] = Date.now() - startedAt;
  };
  let detailGame: Record<string, unknown> | null = null;
  const pickNumber = (...values: unknown[]): number | null => {
    for (const value of values) {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return null;
  };
  const candidates = buildLineHistoryIdCandidates(gameId);
  const addCandidate = (value: unknown) => {
    const v = String(value || "").trim();
    if (!v || candidates.includes(v)) return;
    candidates.unshift(v);
  };
  // Align candidate IDs with whichever provider ID resolved this game detail.
  // This prevents summary/line-history mismatches when a route is called with
  // sr_* but snapshots were stored under provider_game_id (or vice-versa).
  const detailLookupStartedAt = Date.now();
  try {
    const detailResult = await withTimeout(
      fetchGameWithFallback(gameId),
      1500,
      { data: null } as any
    );
    detailGame = (detailResult.data?.game as Record<string, unknown> | null) || null;
    if (detailGame) {
      addCandidate(detailGame.game_id);
      addCandidate(detailGame.external_id);
      addCandidate(toSportsRadarEventId(String(detailGame.game_id || "")));
      addCandidate(toSportsRadarEventId(String(detailGame.external_id || "")));
    }
  } catch {
    // non-fatal: keep existing candidates
  }
  markPhase("detail_lookup", detailLookupStartedAt);
  const gameStatus = String(detailGame?.status || "").toUpperCase();
  const isLiveGame = gameStatus === "IN_PROGRESS" || gameStatus === "LIVE" || gameStatus === "HALFTIME";
  // Keep this lookup bounded; full odds-map scans can be expensive and should
  // never block line-history rendering.
  const resolveOddsEventStartedAt = Date.now();
  const resolvedOddsEventId = isLiveGame
    ? await withTimeout(
      resolveOddsEventIdForGame(c.env, gameId).catch(() => null),
      1500,
      null
    )
    : null;
  markPhase("resolve_odds_event_id", resolveOddsEventStartedAt);
  if (resolvedOddsEventId && !candidates.includes(resolvedOddsEventId)) {
    candidates.unshift(resolvedOddsEventId);
  }
  const c0 = candidates[0] || gameId;
  const c1 = candidates[1] || c0;
  const c2 = candidates[2] || c0;
  const c3 = candidates[3] || c0;
  
  const lineHistory: Array<{
    timestamp: string;
    spread: number | null;
    total: number | null;
    moneylineHome: number | null;
    moneylineAway: number | null;
    source: string;
  }> = [];
  
  try {
    // Build history from modern odds tables.
    const historyBuildStartedAt = Date.now();
    if (lineHistory.length === 0) {
      let bestHistory: Array<{
        timestamp: string;
        spread: number | null;
        total: number | null;
        moneylineHome: number | null;
        moneylineAway: number | null;
        source: string;
      }> = [];
      let bestLatestTs = 0;

      // Historical games often need multiple ID formats (sr_nba_*, sr:sport_event:*, raw uuid).
      // Checking only the first candidate misses valid odds rows in many environments.
      const historyCandidates = isLiveGame ? candidates.slice(0, 3) : candidates.slice(0, 5);
      for (const candidateId of historyCandidates) {
        const [spreadHome, totalOver, moneylineHome, moneylineAway] = await Promise.all([
          withTimeout(getLineMovement(c.env.DB, candidateId, "SPREAD", "HOME"), isLiveGame ? 1800 : 900, null),
          withTimeout(getLineMovement(c.env.DB, candidateId, "TOTAL", "OVER"), isLiveGame ? 1800 : 900, null),
          withTimeout(getLineMovement(c.env.DB, candidateId, "MONEYLINE", "HOME"), isLiveGame ? 1800 : 900, null),
          withTimeout(getLineMovement(c.env.DB, candidateId, "MONEYLINE", "AWAY"), isLiveGame ? 1800 : 900, null),
        ]);

        const byTimestamp = new Map<string, {
          spread: number | null;
          total: number | null;
          moneylineHome: number | null;
          moneylineAway: number | null;
        }>();

        const ensureEntry = (timestamp: string) => {
          if (!byTimestamp.has(timestamp)) {
            byTimestamp.set(timestamp, {
              spread: null,
              total: null,
              moneylineHome: null,
              moneylineAway: null,
            });
          }
          return byTimestamp.get(timestamp)!;
        };

        // Seed with opening anchors so movement is visible even if snapshots are flat/current-only.
        if (spreadHome?.openingLine !== null && spreadHome?.openingLine !== undefined) {
          const ts = spreadHome.openingTimestamp || new Date(Date.now() - 60_000).toISOString();
          const entry = ensureEntry(ts);
          entry.spread = spreadHome.openingLine;
        }
        if (totalOver?.openingLine !== null && totalOver?.openingLine !== undefined) {
          const ts = totalOver.openingTimestamp || new Date(Date.now() - 60_000).toISOString();
          const entry = ensureEntry(ts);
          entry.total = totalOver.openingLine;
        }
        if (moneylineHome?.openingPrice !== null && moneylineHome?.openingPrice !== undefined) {
          const ts = moneylineHome.openingTimestamp || new Date(Date.now() - 60_000).toISOString();
          const entry = ensureEntry(ts);
          entry.moneylineHome = moneylineHome.openingPrice;
        }
        if (moneylineAway?.openingPrice !== null && moneylineAway?.openingPrice !== undefined) {
          const ts = moneylineAway.openingTimestamp || new Date(Date.now() - 60_000).toISOString();
          const entry = ensureEntry(ts);
          entry.moneylineAway = moneylineAway.openingPrice;
        }

        for (const point of spreadHome?.snapshots || []) {
          const entry = ensureEntry(point.timestamp);
          entry.spread = point.line ?? null;
        }
        for (const point of totalOver?.snapshots || []) {
          const entry = ensureEntry(point.timestamp);
          entry.total = point.line ?? null;
        }
        for (const point of moneylineHome?.snapshots || []) {
          const entry = ensureEntry(point.timestamp);
          entry.moneylineHome = point.price ?? null;
        }
        for (const point of moneylineAway?.snapshots || []) {
          const entry = ensureEntry(point.timestamp);
          entry.moneylineAway = point.price ?? null;
        }

        // If we only have opening/current values but no snapshots, still emit one point.
        if (byTimestamp.size === 0) {
          const hasAnyCurrent =
            spreadHome?.currentLine != null ||
            totalOver?.currentLine != null ||
            moneylineHome?.currentPrice != null ||
            moneylineAway?.currentPrice != null;
          if (hasAnyCurrent) {
            byTimestamp.set(new Date().toISOString(), {
              spread: spreadHome?.currentLine ?? null,
              total: totalOver?.currentLine ?? null,
              moneylineHome: moneylineHome?.currentPrice ?? null,
              moneylineAway: moneylineAway?.currentPrice ?? null,
            });
          }
        }

        let candidateHistory: typeof bestHistory = [];
        if (byTimestamp.size > 0) {
          candidateHistory = Array.from(byTimestamp.entries()).map(([timestamp, values]) => ({
            timestamp,
            spread: values.spread,
            total: values.total,
            moneylineHome: values.moneylineHome,
            moneylineAway: values.moneylineAway,
            source: "SportsRadarSnapshots",
          }));
        }

        // Final fallback: read snapshots table directly and map key fields.
        if (candidateHistory.length === 0) {
          const snapshotRows = await c.env.DB.prepare(`
            SELECT market_key, outcome_key, line_value, price_american, captured_at
            FROM odds_snapshots
            WHERE game_id = ?
            ORDER BY captured_at DESC
            LIMIT 300
          `).bind(candidateId).all<{
            market_key: string;
            outcome_key: string;
            line_value: number | null;
            price_american: number | null;
            captured_at: string;
          }>();

          if (snapshotRows.results.length > 0) {
            const rowsByTs = new Map<string, {
              spread: number | null;
              total: number | null;
              moneylineHome: number | null;
              moneylineAway: number | null;
            }>();
            const getEntry = (timestamp: string) => {
              if (!rowsByTs.has(timestamp)) {
                rowsByTs.set(timestamp, {
                  spread: null,
                  total: null,
                  moneylineHome: null,
                  moneylineAway: null,
                });
              }
              return rowsByTs.get(timestamp)!;
            };

            for (const row of snapshotRows.results) {
              const ts = String(row.captured_at);
              const market = String(row.market_key || "").toUpperCase();
              const outcome = String(row.outcome_key || "").toUpperCase();
              const entry = getEntry(ts);
              if (market === "SPREAD" && outcome === "HOME") entry.spread = row.line_value ?? null;
              if (market === "TOTAL" && outcome === "OVER") entry.total = row.line_value ?? null;
              if (market === "MONEYLINE" && outcome === "HOME") entry.moneylineHome = row.price_american ?? null;
              if (market === "MONEYLINE" && outcome === "AWAY") entry.moneylineAway = row.price_american ?? null;
            }

            candidateHistory = Array.from(rowsByTs.entries()).map(([timestamp, values]) => ({
              timestamp,
              spread: values.spread,
              total: values.total,
              moneylineHome: values.moneylineHome,
              moneylineAway: values.moneylineAway,
              source: "SportsRadarSnapshots",
            }));
          }
        }

        if (candidateHistory.length > 0) {
          candidateHistory.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          const latestTs = new Date(candidateHistory[candidateHistory.length - 1]?.timestamp || 0).getTime();
          const bestHasOnlySinglePoint = bestHistory.length <= 1;
          const candidateHasMultiplePoints = candidateHistory.length >= 2;
          if (
            bestHistory.length === 0 ||
            (bestHasOnlySinglePoint && candidateHasMultiplePoints) ||
            latestTs > bestLatestTs ||
            (latestTs === bestLatestTs && candidateHistory.length > bestHistory.length)
          ) {
            bestHistory = candidateHistory;
            bestLatestTs = latestTs;
          }
        }
      }

      if (bestHistory.length > 0) {
        lineHistory.push(...bestHistory);
      }
    }
    markPhase("history_build", historyBuildStartedAt);

    // Fast fallback: fetch direct event odds only (bounded), avoiding full odds-map scans.
    if (lineHistory.length === 0 && detailGame) {
      try {
        const oddsKey =
          c.env.SPORTSRADAR_ODDS_KEY ||
          c.env.SPORTSRADAR_PLAYER_PROPS_KEY ||
          c.env.SPORTSRADAR_PROPS_KEY ||
          c.env.SPORTSRADAR_API_KEY ||
          "";
        const srIdCandidates = Array.from(
          new Set(
            [
              toSportsRadarEventId(String(detailGame.game_id || "")),
              toSportsRadarEventId(String(detailGame.external_id || "")),
              toSportsRadarMatchId(String(detailGame.game_id || "")),
              toSportsRadarMatchId(String(detailGame.external_id || "")),
              String(detailGame.external_id || "").includes("-") ? `sr:sport_event:${String(detailGame.external_id || "").trim()}` : null,
              String(detailGame.external_id || "").includes("-") ? `sr:match:${String(detailGame.external_id || "").trim()}` : null,
            ].filter(Boolean) as string[]
          )
        );

        let directOdds: any = null;
        for (const srEventId of srIdCandidates.slice(0, 1)) {
          directOdds = await withTimeout(
            fetchSportsRadarOddsForGame(srEventId, oddsKey),
            1200,
            null
          );
          if (directOdds) break;
        }

        if (directOdds) {
          lineHistory.push({
            timestamp: new Date().toISOString(),
            spread: pickNumber(directOdds.spreadHome, directOdds.spread),
            total: pickNumber(directOdds.total),
            moneylineHome: pickNumber(directOdds.moneylineHome),
            moneylineAway: pickNumber(directOdds.moneylineAway),
            source: "SportsRadarCurrent",
          });
        }
      } catch (err) {
        console.log("[Line History] Current odds fallback failed:", err);
      }
    }

    // Last-resort fallback: use current game-detail odds fields directly.
    if (lineHistory.length === 0 && detailGame) {
      const spread = pickNumber(
        detailGame.spread,
        detailGame.spread_home,
        detailGame.spreadHome
      );
      const total = pickNumber(
        detailGame.total,
        detailGame.over_under,
        detailGame.overUnder
      );
      const moneylineHome = pickNumber(
        detailGame.moneyline_home,
        detailGame.moneylineHome,
        detailGame.ml_home,
        detailGame.mlHome
      );
      const moneylineAway = pickNumber(
        detailGame.moneyline_away,
        detailGame.moneylineAway,
        detailGame.ml_away,
        detailGame.mlAway
      );
      const hasAny = spread !== null || total !== null || moneylineHome !== null || moneylineAway !== null;
      if (hasAny) {
        lineHistory.push({
          timestamp: new Date().toISOString(),
          spread,
          total,
          moneylineHome,
          moneylineAway,
          source: "GameCurrentOdds",
        });
      }
    }

    // Reconcile with current odds even when history exists:
    // if current values differ from latest history point, append a fresh "now" point.
    const currentReconcileStartedAt = Date.now();
    if (detailGame) {
      let currentSpread = pickNumber(
        detailGame.spread,
        detailGame.spread_home,
        detailGame.spreadHome
      );
      let currentTotal = pickNumber(
        detailGame.total,
        detailGame.over_under,
        detailGame.overUnder
      );
      let currentMoneylineHome = pickNumber(
        detailGame.moneyline_home,
        detailGame.moneylineHome,
        detailGame.ml_home,
        detailGame.mlHome
      );
      let currentMoneylineAway = pickNumber(
        detailGame.moneyline_away,
        detailGame.moneylineAway,
        detailGame.ml_away,
        detailGame.mlAway
      );

      // Some game-detail payloads omit live odds fields. Pull direct current odds by event id.
      // Restrict this expensive fallback to live/in-progress contexts.
      if (
        isLiveGame &&
        currentSpread === null &&
        currentTotal === null &&
        currentMoneylineHome === null &&
        currentMoneylineAway === null
      ) {
        try {
          const apiKey = c.env.SPORTSRADAR_API_KEY || "";
          const oddsKeyCandidates = Array.from(
            new Set(
              [
                c.env.SPORTSRADAR_ODDS_KEY,
                c.env.SPORTSRADAR_PLAYER_PROPS_KEY,
                c.env.SPORTSRADAR_PROPS_KEY,
                c.env.SPORTSRADAR_API_KEY,
              ].filter((value): value is string => Boolean(value && String(value).trim()))
            )
          ).slice(0, 2);
          const srIdCandidates = Array.from(
            new Set(
              [
                toSportsRadarEventId(String(detailGame.game_id || "")),
                toSportsRadarEventId(String(detailGame.external_id || "")),
                toSportsRadarMatchId(String(detailGame.game_id || "")),
                toSportsRadarMatchId(String(detailGame.external_id || "")),
                String(detailGame.external_id || "").includes("-") ? `sr:sport_event:${String(detailGame.external_id || "").trim()}` : null,
                String(detailGame.external_id || "").includes("-") ? `sr:match:${String(detailGame.external_id || "").trim()}` : null,
              ].filter(Boolean) as string[]
            )
          );

          let directOdds: any = null;
          for (const srEventId of srIdCandidates.slice(0, 2)) {
            for (const keyCandidate of oddsKeyCandidates) {
              directOdds = await withTimeout(
                fetchSportsRadarOddsForGame(srEventId, keyCandidate || apiKey),
                1200,
                null
              );
              if (directOdds) break;
            }
            if (directOdds) break;
          }

          if (directOdds) {
            currentSpread = pickNumber(directOdds.spreadHome, directOdds.spread);
            currentTotal = pickNumber(directOdds.total);
            currentMoneylineHome = pickNumber(directOdds.moneylineHome);
            currentMoneylineAway = pickNumber(directOdds.moneylineAway);
          }
        } catch {
          // Non-fatal: keep existing reconciliation values.
        }
      }
      // Final current-odds fallback: use /odds consensus if available.
      if (
        isLiveGame &&
        currentSpread === null &&
        currentTotal === null &&
        currentMoneylineHome === null &&
        currentMoneylineAway === null
      ) {
        try {
          const baseUrl = new URL(c.req.url).origin;
          const oddsResponse = await withTimeout(
            fetch(`${baseUrl}/api/games/${encodeURIComponent(gameId)}/odds`, {
              headers: { Accept: "application/json" },
            }),
            3000,
            null
          );
          if (oddsResponse?.ok) {
            const oddsPayload = await oddsResponse.json() as any;
            const consensus = oddsPayload?.consensus || null;
            if (consensus) {
              currentSpread = pickNumber(consensus.spreadHome);
              currentTotal = pickNumber(consensus.total);
              currentMoneylineHome = pickNumber(consensus.moneylineHome);
              currentMoneylineAway = pickNumber(consensus.moneylineAway);
            }
          }
        } catch {
          // Non-fatal: leave current values as null.
        }
      }
      // Prefer sportsbook consensus for sparse histories so "current" matches books tab.
      if (isLiveGame && lineHistory.length <= 1) {
      try {
        const sport = String(detailGame.sport || "").toLowerCase();
        const homeTeam = String(
          detailGame.home_team_name ||
          detailGame.homeTeam ||
          ""
        );
        const awayTeam = String(
          detailGame.away_team_name ||
          detailGame.awayTeam ||
          ""
        );
        const apiKey = String(c.env.SPORTSRADAR_API_KEY || "").trim();
        if (apiKey && sport && homeTeam && awayTeam) {
          const oddsKeyCandidates = Array.from(
            new Set(
              [
                c.env.SPORTSRADAR_ODDS_KEY,
                c.env.SPORTSRADAR_PLAYER_PROPS_KEY,
                c.env.SPORTSRADAR_PROPS_KEY,
                c.env.SPORTSRADAR_API_KEY,
              ].filter((value): value is string => Boolean(value && String(value).trim()))
            )
          ).slice(0, 3);

          let books: Array<{
            spreadHome: number | null;
            total: number | null;
            moneylineHome: number | null;
            moneylineAway: number | null;
          }> = [];

          for (const oddsKey of oddsKeyCandidates) {
            const candidateBooks = await withTimeout(
              fetchAllSportsbooksForGame(
                sport as SportKey,
                apiKey,
                c.env.DB,
                homeTeam,
                awayTeam,
                oddsKey
              ),
              6000,
              []
            );
            if (candidateBooks.length > 0) {
              books = candidateBooks;
              break;
            }
          }

          if (books.length > 0) {
            const avg = (values: Array<number | null | undefined>): number | null => {
              const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
              if (nums.length === 0) return null;
              return nums.reduce((sum, value) => sum + value, 0) / nums.length;
            };
            const snapHalf = (value: number | null) => (value === null ? null : Math.round(value * 2) / 2);
            const snapInt = (value: number | null) => (value === null ? null : Math.round(value));
            const consensusSpread = snapHalf(avg(books.map((book) => book.spreadHome)));
            const consensusTotal = snapHalf(avg(books.map((book) => book.total)));
            const consensusMlHome = snapInt(avg(books.map((book) => book.moneylineHome)));
            const consensusMlAway = snapInt(avg(books.map((book) => book.moneylineAway)));
            if (consensusSpread !== null) currentSpread = consensusSpread;
            if (consensusTotal !== null) currentTotal = consensusTotal;
            if (consensusMlHome !== null) currentMoneylineHome = consensusMlHome;
            if (consensusMlAway !== null) currentMoneylineAway = consensusMlAway;
          } else {
            // Mirror /odds fallback behavior when individual books are unavailable.
            const candidateIds = new Set<string>(
              [
                String(detailGame.game_id || "").trim(),
                String(detailGame.external_id || "").trim(),
                toSportsRadarEventId(String(detailGame.game_id || "")) || "",
                toSportsRadarEventId(String(detailGame.external_id || "")) || "",
                toSportsRadarMatchId(String(detailGame.game_id || "")) || "",
                toSportsRadarMatchId(String(detailGame.external_id || "")) || "",
              ].filter(Boolean)
            );

            let fallbackOdds: any = null;
            for (const oddsKey of oddsKeyCandidates) {
              const oddsMap = await withTimeout(
                fetchSportsRadarOdds(sport as SportKey, apiKey, c.env.DB, undefined, oddsKey),
                6000,
                new Map<string, any>()
              );

              for (const [key, odds] of oddsMap) {
                if (candidateIds.has(String(key || "")) || candidateIds.has(String(odds?.gameId || ""))) {
                  fallbackOdds = odds;
                  break;
                }
              }

              if (!fallbackOdds) {
                for (const odds of oddsMap.values()) {
                  if (
                    teamsRoughlyMatch(String(odds?.homeTeam || ""), homeTeam) &&
                    teamsRoughlyMatch(String(odds?.awayTeam || ""), awayTeam)
                  ) {
                    fallbackOdds = odds;
                    break;
                  }
                }
              }

              if (fallbackOdds) break;
            }

            if (fallbackOdds) {
              const consensusSpread = pickNumber(fallbackOdds.spreadHome, fallbackOdds.spread);
              const consensusTotal = pickNumber(fallbackOdds.total);
              const consensusMlHome = pickNumber(fallbackOdds.moneylineHome);
              const consensusMlAway = pickNumber(fallbackOdds.moneylineAway);
              if (consensusSpread !== null) currentSpread = consensusSpread;
              if (consensusTotal !== null) currentTotal = consensusTotal;
              if (consensusMlHome !== null) currentMoneylineHome = consensusMlHome;
              if (consensusMlAway !== null) currentMoneylineAway = consensusMlAway;
            }
          }
        }
      } catch {
        // Non-fatal: keep best-effort current values.
      }
      }
      const hasCurrent =
        currentSpread !== null ||
        currentTotal !== null ||
        currentMoneylineHome !== null ||
        currentMoneylineAway !== null;
      if (hasCurrent) {
        const last = lineHistory[lineHistory.length - 1] || null;
        const sameNullable = (a: number | null, b: number | null) => a === b;
        const differsFromLast =
          !last ||
          !sameNullable(last.spread, currentSpread) ||
          !sameNullable(last.total, currentTotal) ||
          !sameNullable(last.moneylineHome, currentMoneylineHome) ||
          !sameNullable(last.moneylineAway, currentMoneylineAway);
        if (differsFromLast) {
          lineHistory.push({
            timestamp: new Date().toISOString(),
            spread: currentSpread,
            total: currentTotal,
            moneylineHome: currentMoneylineHome,
            moneylineAway: currentMoneylineAway,
            source: "GameCurrentOddsReconciled",
          });
        }
      }
    }
    markPhase("current_reconcile", currentReconcileStartedAt);

    // Final parity step: align with /odds consensus when available.
    // Trigger for sparse or flat histories where movement can appear stuck at 0.
    const firstHistoryPoint = lineHistory[0] || null;
    const lastHistoryPoint = lineHistory[lineHistory.length - 1] || null;
    const spreadLooksFlat =
      firstHistoryPoint?.spread !== null &&
      firstHistoryPoint?.spread !== undefined &&
      lastHistoryPoint?.spread !== null &&
      lastHistoryPoint?.spread !== undefined &&
      firstHistoryPoint.spread === lastHistoryPoint.spread;
    const totalLooksFlat =
      firstHistoryPoint?.total !== null &&
      firstHistoryPoint?.total !== undefined &&
      lastHistoryPoint?.total !== null &&
      lastHistoryPoint?.total !== undefined &&
      firstHistoryPoint.total === lastHistoryPoint.total;
    const needsOddsParity =
      isLiveGame && (lineHistory.length <= 1 || spreadLooksFlat || totalLooksFlat);

    const oddsParityStartedAt = Date.now();
    if (needsOddsParity) {
    if (lineHistory.length <= 1 && candidates.length > 0) {
    try {
      let spreadRecovery: any = null;
      let totalRecovery: any = null;
      let mlHomeRecovery: any = null;
      let mlAwayRecovery: any = null;
      let bestScore = -1;

      for (const recoveryId of candidates.slice(0, 6)) {
        const [s, t, mh, ma] = await Promise.all([
          withTimeout(getLineMovement(c.env.DB, recoveryId, "SPREAD", "HOME"), 5000, null),
          withTimeout(getLineMovement(c.env.DB, recoveryId, "TOTAL", "OVER"), 5000, null),
          withTimeout(getLineMovement(c.env.DB, recoveryId, "MONEYLINE", "HOME"), 5000, null),
          withTimeout(getLineMovement(c.env.DB, recoveryId, "MONEYLINE", "AWAY"), 5000, null),
        ]);
        const score =
          Math.max(s?.snapshots?.length || 0, 0) +
          Math.max(t?.snapshots?.length || 0, 0) +
          Math.max(mh?.snapshots?.length || 0, 0) +
          Math.max(ma?.snapshots?.length || 0, 0);
        if (score > bestScore) {
          bestScore = score;
          spreadRecovery = s;
          totalRecovery = t;
          mlHomeRecovery = mh;
          mlAwayRecovery = ma;
        }
        if (score >= 8) break;
      }

      const anyRecovery =
        spreadRecovery?.openingLine != null ||
        spreadRecovery?.currentLine != null ||
        totalRecovery?.openingLine != null ||
        totalRecovery?.currentLine != null ||
        mlHomeRecovery?.openingPrice != null ||
        mlHomeRecovery?.currentPrice != null ||
        mlAwayRecovery?.openingPrice != null ||
        mlAwayRecovery?.currentPrice != null;

      if (anyRecovery) {
        const openingPoint = {
          timestamp:
            spreadRecovery?.openingTimestamp ||
            totalRecovery?.openingTimestamp ||
            mlHomeRecovery?.openingTimestamp ||
            mlAwayRecovery?.openingTimestamp ||
            new Date(Date.now() - 120_000).toISOString(),
          spread: spreadRecovery?.openingLine ?? null,
          total: totalRecovery?.openingLine ?? null,
          moneylineHome: mlHomeRecovery?.openingPrice ?? null,
          moneylineAway: mlAwayRecovery?.openingPrice ?? null,
          source: "SportsRadarRecovery",
        };
        const currentPoint = {
          timestamp: new Date().toISOString(),
          spread: spreadRecovery?.currentLine ?? openingPoint.spread,
          total: totalRecovery?.currentLine ?? openingPoint.total,
          moneylineHome: mlHomeRecovery?.currentPrice ?? openingPoint.moneylineHome,
          moneylineAway: mlAwayRecovery?.currentPrice ?? openingPoint.moneylineAway,
          source: "SportsRadarRecovery",
        };
        lineHistory.length = 0;
        lineHistory.push(openingPoint, currentPoint);
      }
    } catch {
      // Non-fatal recovery attempt.
    }
    markPhase("odds_parity", oddsParityStartedAt);
    }
    try {
      const baseUrl = new URL(c.req.url).origin;
      const oddsResponse = await withTimeout(
        fetch(`${baseUrl}/api/games/${encodeURIComponent(gameId)}/odds`, {
          headers: { Accept: "application/json" },
        }),
        3000,
        null
      );
      if (oddsResponse?.ok) {
        const oddsPayload = await oddsResponse.json() as any;
        const consensus = oddsPayload?.consensus || null;
        const openSpread = pickNumber(oddsPayload?.openSpread);
        const openTotal = pickNumber(oddsPayload?.openTotal);
        const openMoneylineHome = pickNumber(oddsPayload?.openMoneylineHome);
        const openMoneylineAway = pickNumber(oddsPayload?.openMoneylineAway);
        if (consensus) {
          const consensusSpread = pickNumber(consensus.spreadHome);
          const consensusTotal = pickNumber(consensus.total);
          const consensusMlHome = pickNumber(consensus.moneylineHome);
          const consensusMlAway = pickNumber(consensus.moneylineAway);

          const shouldInjectOpening =
            lineHistory.length === 0 ||
            (spreadLooksFlat && openSpread !== null && consensusSpread !== null && openSpread !== consensusSpread) ||
            (totalLooksFlat && openTotal !== null && consensusTotal !== null && openTotal !== consensusTotal);
          if (shouldInjectOpening) {
            const first = lineHistory[0] || null;
            const sameNullable = (a: number | null, b: number | null) => a === b;
            const openingSpread = openSpread !== null ? openSpread : (first?.spread ?? null);
            const openingTotal = openTotal !== null ? openTotal : (first?.total ?? null);
            const openingMlHome = openMoneylineHome !== null ? openMoneylineHome : (first?.moneylineHome ?? null);
            const openingMlAway = openMoneylineAway !== null ? openMoneylineAway : (first?.moneylineAway ?? null);
            const differsFromFirst =
              !first ||
              !sameNullable(first.spread, openingSpread) ||
              !sameNullable(first.total, openingTotal) ||
              !sameNullable(first.moneylineHome, openingMlHome) ||
              !sameNullable(first.moneylineAway, openingMlAway);
            if (differsFromFirst) {
              lineHistory.push({
                timestamp: new Date(Date.now() - 120_000).toISOString(),
                spread: openingSpread,
                total: openingTotal,
                moneylineHome: openingMlHome,
                moneylineAway: openingMlAway,
                source: "OddsEndpointOpening",
              });
            }
          }
          const hasConsensusCurrent =
            consensusSpread !== null ||
            consensusTotal !== null ||
            consensusMlHome !== null ||
            consensusMlAway !== null;
          if (hasConsensusCurrent) {
            const last = lineHistory[lineHistory.length - 1] || null;
            const sameNullable = (a: number | null, b: number | null) => a === b;
            const differsFromLast =
              !last ||
              !sameNullable(last.spread, consensusSpread) ||
              !sameNullable(last.total, consensusTotal) ||
              !sameNullable(last.moneylineHome, consensusMlHome) ||
              !sameNullable(last.moneylineAway, consensusMlAway);
            if (differsFromLast) {
              lineHistory.push({
                timestamp: new Date().toISOString(),
                spread: consensusSpread,
                total: consensusTotal,
                moneylineHome: consensusMlHome,
                moneylineAway: consensusMlAway,
                source: "OddsEndpointConsensus",
              });
            }
          }
        }
      }
    } catch {
      // Non-fatal.
    }
    }

    // Sort by timestamp
    lineHistory.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const sameNullable = (a: number | null, b: number | null) => a === b;
    const isSamePoint = (
      a: { spread: number | null; total: number | null; moneylineHome: number | null; moneylineAway: number | null },
      b: { spread: number | null; total: number | null; moneylineHome: number | null; moneylineAway: number | null }
    ) =>
      sameNullable(a.spread, b.spread) &&
      sameNullable(a.total, b.total) &&
      sameNullable(a.moneylineHome, b.moneylineHome) &&
      sameNullable(a.moneylineAway, b.moneylineAway);

    const swingHistory: typeof lineHistory = [];
    for (const point of lineHistory) {
      const last = swingHistory[swingHistory.length - 1];
      if (!last || !isSamePoint(last, point)) {
        swingHistory.push(point);
      }
    }
    
    // Calculate opening/current by metric, using first/last non-null values.
    const firstBy = <T extends number | null>(getter: (p: typeof swingHistory[number]) => T): T => {
      for (const point of swingHistory) {
        const value = getter(point);
        if (value !== null && value !== undefined) return value;
      }
      return null as T;
    };
    const lastBy = <T extends number | null>(getter: (p: typeof swingHistory[number]) => T): T => {
      for (let i = swingHistory.length - 1; i >= 0; i--) {
        const value = getter(swingHistory[i]);
        if (value !== null && value !== undefined) return value;
      }
      return null as T;
    };
    const openingTimestamp = swingHistory.length > 0 ? swingHistory[0].timestamp : null;
    const currentTimestamp = swingHistory.length > 0 ? swingHistory[swingHistory.length - 1].timestamp : null;

    const opening = swingHistory.length > 0 ? {
      timestamp: openingTimestamp,
      spread: firstBy((p) => p.spread),
      total: firstBy((p) => p.total),
      moneylineHome: firstBy((p) => p.moneylineHome),
      moneylineAway: firstBy((p) => p.moneylineAway),
      source: swingHistory[0].source,
    } : null;
    const current = swingHistory.length > 0 ? {
      timestamp: currentTimestamp,
      spread: lastBy((p) => p.spread),
      total: lastBy((p) => p.total),
      moneylineHome: lastBy((p) => p.moneylineHome),
      moneylineAway: lastBy((p) => p.moneylineAway),
      source: swingHistory[swingHistory.length - 1].source,
    } : null;
    
    // Calculate movements
    const movements = {
      spread: opening && current && opening.spread !== null && current.spread !== null
        ? current.spread - opening.spread
        : null,
      total: opening && current && opening.total !== null && current.total !== null
        ? current.total - opening.total
        : null,
    };
    
    const totalMs = Date.now() - routeStartedAt;
    if (totalMs >= 1200) {
      console.log("[Line History] slow request", {
        gameId,
        totalMs,
        phaseMs,
        candidateCount: candidates.length,
        historyCount: swingHistory.length,
        rawHistoryCount: lineHistory.length,
        isLiveGame,
      });
    }

    return c.json({
      gameId,
      historyCount: swingHistory.length,
      rawHistoryCount: lineHistory.length,
      opening,
      current,
      movements,
      history: swingHistory,
      degraded: swingHistory.length === 0,
      fallback_type: swingHistory.length === 0 ? "no_coverage" : null,
      fallback_reason: swingHistory.length === 0 ? "No line history rows found for this game ID mapping" : null,
      lastUpdated: new Date().toISOString(),
    }, {
      headers: cacheHeaders(60, { isPublic: true }) // 1 minute cache
    });
    
  } catch (err) {
    console.error("[Line History] Error fetching:", err);
    return c.json({
      gameId,
      historyCount: 0,
      opening: null,
      current: null,
      movements: { spread: null, total: null },
      history: [],
      degraded: true,
      fallback_type: "provider_error",
      fallback_reason: "Line history query failed",
      error: "Failed to fetch line history",
    }, 200);
  }
});

/**
 * GET /api/games/odds/:sport
 * Fetch odds for all games in a sport from The Odds API
 */
gamesRouter.get("/odds/:sport", async (c) => {
  const sport = c.req.param("sport") as SportKey;
  const forceFresh = c.req.query("fresh") === "1" || c.req.query("fresh") === "true";
  
  if (!SUPPORTED_SPORTS.includes(sport)) {
    return c.json({ 
      error: `Invalid sport. Supported: ${SUPPORTED_SPORTS.join(", ")}` 
    }, 400);
  }
  
  if (!isOddsApiAvailable(c.env)) {
    return c.json({ 
      error: "Odds API not configured",
      hint: "Set SPORTSRADAR_API_KEY in app secrets",
    }, 503);
  }
  
  const mainApiKey = c.env.SPORTSRADAR_API_KEY || "";
  const keyChain = Array.from(
    new Set(
      [
        c.env.SPORTSRADAR_ODDS_KEY,
        c.env.SPORTSRADAR_PLAYER_PROPS_KEY,
        c.env.SPORTSRADAR_PROPS_KEY,
        c.env.SPORTSRADAR_API_KEY,
      ].filter((value): value is string => Boolean(value && value.trim()))
    )
  );
  const oddsObject: Record<string, unknown> = {};
  const oddsDb = forceFresh ? undefined : c.env.DB;
  let usedKey: string | null = null;
  for (const keyCandidate of keyChain) {
    try {
      const oddsMap = await fetchSportsRadarOdds(sport, mainApiKey, oddsDb, undefined, keyCandidate);
      for (const [key, value] of oddsMap) oddsObject[key] = value;
      usedKey = keyCandidate;
      if (Object.keys(oddsObject).length > 0) break;
    } catch (err) {
      console.warn(`[Games API] /odds/${sport} failed with key candidate`, err);
    }
  }
  if (Object.keys(oddsObject).length === 0) {
    const fallbackEventIds = new Set<string>();
    try {
      const [liveResult, scheduledResult] = await Promise.all([
        fetchLiveGamesWithFallback({ sports: [sport] }),
        fetchScheduledGamesWithFallback({ sports: [sport], hours: 24 }),
      ]);
      for (const row of [...liveResult.data, ...scheduledResult.data]) {
        const rawId = String((row as any)?.game_id || (row as any)?.id || "");
        const srEventId = toSportsRadarEventId(rawId) || (rawId.startsWith("sr:sport_event:") ? rawId : null);
        if (srEventId) fallbackEventIds.add(srEventId);
      }
    } catch (err) {
      console.warn(`[Games API] sport fallback event id lookup failed for /odds/${sport}`, err);
    }
    for (const eventId of Array.from(fallbackEventIds).slice(0, 180)) {
      for (const keyCandidate of keyChain) {
        try {
          const resolved = await fetchSportsRadarOddsForGame(eventId, keyCandidate);
          if (!resolved) continue;
          oddsObject[eventId] = resolved;
          break;
        } catch {
          // Continue probing.
        }
      }
    }
  }

  if (Object.keys(oddsObject).length === 0) {
    return c.json({
      sport,
      odds: {},
      gamesWithOdds: 0,
      provider: "sportsradar",
      degraded: true,
      fallback_reason: keyChain.length === 0
        ? "No SportsRadar keys configured"
        : "SportsRadar odds returned no markets",
      timestamp: new Date().toISOString(),
    }, 200);
  }
  
  return c.json({
    sport,
    odds: oddsObject,
    gamesWithOdds: Object.keys(oddsObject).length,
    provider: "sportsradar",
    keyUsed: usedKey ? "configured" : null,
    timestamp: new Date().toISOString(),
  }, { 
    headers: cacheHeaders(300, { isPublic: true }) // 5 minute cache
  });
});

/**
 * GET /api/games/odds-status
 * Check if The Odds API is configured and available
 */
gamesRouter.get("/odds-status", async (c) => {
  const configured = isOddsApiAvailable(c.env);
  
  return c.json({
    configured,
    available: configured,
    provider: configured ? "sportsradar" : null,
    message: configured 
      ? "Odds API is configured and ready" 
      : "SPORTSRADAR_API_KEY not set - using demo odds",
    availableSports: SUPPORTED_SPORTS,
    supportedSports: SUPPORTED_SPORTS,
    // Note: The Odds API returns quota info in response headers
    // For now, we show a placeholder since we'd need to track usage
    quotaUsed: configured ? 0 : undefined,
    remainingQuota: configured ? 500 : undefined, // Default tier
    timestamp: new Date().toISOString(),
  });
});

// ============ Demo Simulation Endpoints ============

// In-memory cache for simulated games
const simulatedGames = new Map<string, Game>();

/**
 * POST /api/games/:gameId/simulate/score
 * Simulate a score change (demo mode only)
 * Triggers threshold engine events for significant changes
 */
gamesRouter.post("/:gameId/simulate/score", authMiddleware, async (c) => {
  const gameId = c.req.param("gameId");
  const body = await c.req.json();
  const { team, points, triggerThresholds = true } = body;
  
  if (!team || !["home", "away"].includes(team)) {
    return c.json({ error: "Invalid team. Use 'home' or 'away'" }, 400);
  }
  
  if (typeof points !== "number" || points < 0) {
    return c.json({ error: "Points must be a positive number" }, 400);
  }
  
  // Get current game state
  let previousGame = simulatedGames.get(gameId);
  if (!previousGame) {
    const result = await fetchGameWithFallback(gameId);
    if (!result.data?.game) {
      return c.json({ error: "Game not found" }, 404);
    }
    previousGame = result.data.game;
  }
  
  if (previousGame.status !== "IN_PROGRESS") {
    return c.json({ error: "Can only update scores for live games" }, 400);
  }
  
  // Create updated game
  const updated: Game = {
    ...previousGame,
    last_updated_at: new Date().toISOString(),
  };
  
  if (team === "home") {
    updated.home_score = (updated.home_score || 0) + points;
  } else {
    updated.away_score = (updated.away_score || 0) + points;
  }
  
  // Store in simulation cache
  simulatedGames.set(gameId, updated);
  
  // Trigger threshold engine
  let thresholdEvents: ThresholdEvent[] = [];
  if (triggerThresholds) {
    try {
      const input: GameLifecycleInput = {
        dataScope: "DEMO",
        game: updated,
        previousGame,
      };
      thresholdEvents = await processGameStateChange(c.env.DB, input);
    } catch (err) {
      console.error("Threshold engine error:", err);
    }
  }
  
  return c.json({
    game: updated,
    message: `Added ${points} points to ${team} team`,
    thresholdEvents,
  });
});

/**
 * POST /api/games/:gameId/simulate/state
 * Simulate a game state change (demo mode only)
 */
gamesRouter.post("/:gameId/simulate/state", authMiddleware, async (c) => {
  const gameId = c.req.param("gameId");
  const body = await c.req.json();
  const { status, period, clock, triggerThresholds = true } = body;
  
  const validStatuses = ["SCHEDULED", "IN_PROGRESS", "FINAL", "POSTPONED", "CANCELED"];
  if (!status || !validStatuses.includes(status)) {
    return c.json({ error: `Invalid status. Use: ${validStatuses.join(", ")}` }, 400);
  }
  
  // Get current game state
  let previousGame = simulatedGames.get(gameId);
  if (!previousGame) {
    const result = await fetchGameWithFallback(gameId);
    if (!result.data?.game) {
      return c.json({ error: "Game not found" }, 404);
    }
    previousGame = result.data.game;
  }
  
  // Create updated game
  const updated: Game = {
    ...previousGame,
    status,
    last_updated_at: new Date().toISOString(),
  };
  
  if (status === "IN_PROGRESS") {
    updated.period = period || 1;
    updated.clock = clock || "12:00";
    updated.away_score = updated.away_score || 0;
    updated.home_score = updated.home_score || 0;
  } else if (status === "FINAL") {
    updated.clock = undefined;
  }
  
  // Store in simulation cache
  simulatedGames.set(gameId, updated);
  
  // Trigger threshold engine
  let thresholdEvents: ThresholdEvent[] = [];
  if (triggerThresholds) {
    try {
      const input: GameLifecycleInput = {
        dataScope: "DEMO",
        game: updated,
        previousGame,
      };
      thresholdEvents = await processGameStateChange(c.env.DB, input);
    } catch (err) {
      console.error("Threshold engine error:", err);
    }
  }
  
  return c.json({
    game: updated,
    message: `Game status changed to ${status}`,
    thresholdEvents,
  });
});

// ============ Provider Configuration Endpoints ============

/**
 * GET /api/games/providers
 * Get current provider configuration
 */
gamesRouter.get("/providers", authMiddleware, async (c) => {
  const configs = getProviderConfigs();
  const activeProvider = getActiveProviderName();
  
  return c.json({
    providers: configs,
    activeProvider,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/games/providers
 * Update provider configuration
 */
gamesRouter.post("/providers", authMiddleware, async (c) => {
  const body = await c.req.json();
  const { providerId, enabled, priority, apiKey, baseUrl } = body;
  
  if (!providerId) {
    return c.json({ error: "Provider ID required" }, 400);
  }
  
  const updated = updateProviderConfig(providerId, {
    enabled,
    priority,
    apiKey,
    baseUrl,
  });
  
  if (!updated) {
    return c.json({ error: "Provider not found" }, 404);
  }
  
  return c.json({
    success: true,
    provider: updated,
    message: `Provider ${providerId} configuration updated`,
  });
});

// ============ Cache/Admin Endpoints ============

/**
 * GET /api/games/cache-stats
 * Get cache statistics
 */
gamesRouter.get("/cache-stats", authMiddleware, async (c) => {
  return c.json({
    simulatedGamesCount: simulatedGames.size,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/games/clear-cache
 * Clear simulation cache
 */
gamesRouter.post("/clear-cache", authMiddleware, async (c) => {
  simulatedGames.clear();
  return c.json({
    success: true,
    message: "Simulation cache cleared",
  });
});

/**
 * GET /api/games/admin/cache
 * Get cache statistics (admin)
 */
gamesRouter.get("/admin/cache", authMiddleware, async (c) => {
  return c.json({
    simulatedGamesCount: simulatedGames.size,
    providers: getProviderConfigs(),
    activeProvider: getActiveProviderName(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/games/admin/cache/clear
 * Clear all caches (admin)
 */
gamesRouter.post("/admin/cache/clear", authMiddleware, async (c) => {
  simulatedGames.clear();
  return c.json({
    success: true,
    message: "All caches cleared",
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/games/admin/sports
 * Get list of supported sports
 */
gamesRouter.get("/admin/sports", authMiddleware, async (c) => {
  return c.json({
    sports: SUPPORTED_SPORTS,
    count: SUPPORTED_SPORTS.length,
  });
});

export { gamesRouter };

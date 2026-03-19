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
  fetchOddsForGame,
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
import type { Game } from "../../shared/types";
import { fetchSportsRadarOdds, fetchSportsRadarOddsForGame, captureAllOddsSnapshots, fetchGamePlayerProps, fetchAllSportsbooksForGame, getLineMovement } from "../services/sportsRadarOddsService";
import {
  fetchStandingsCached,
  fetchTeamProfileCached,
  fetchPropsCached,
  getSportsRadarProvider,
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallbackValue), timeoutMs);
  });
  const result = await Promise.race([promise, timeoutPromise]);
  if (timer) clearTimeout(timer);
  return result;
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
  if (raw.startsWith("sr:sport_event:")) {
    const tail = raw.replace("sr:sport_event:", "");
    const maybeSportHint = ["nba", "nfl", "mlb", "nhl", "ncaab", "ncaaf", "soccer", "mma", "golf", "nascar"];
    for (const sport of maybeSportHint) {
      candidates.add(`sr_${sport}_${tail.replace(/-/g, "_")}`);
    }
  }
  const parts = raw.split("_").filter(Boolean);
  if (parts.length > 0) {
    candidates.add(parts[parts.length - 1]);
  }
  return Array.from(candidates).slice(0, 6);
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

    const candidateIds = new Set([gameId, toSportsRadarEventId(gameId)].filter(Boolean) as string[]);
    const matched = result.props.filter((prop) => candidateIds.has(String(prop.providerGameId)));
    if (matched.length === 0) return [];

    return matched.map((prop, idx) => ({
      playerId: prop.playerId || `sr_prop_${idx}`,
      playerName: prop.playerName,
      team: prop.team || "",
      type: prop.propType,
      line: prop.lineValue,
      overOdds: prop.oddsAmerican ?? -110,
      underOdds: prop.oddsAmerican ?? -110,
      sportsbook: prop.sportsbook || "SportsRadar",
      isPlaceholder: false,
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
async function enrichGamesWithOdds(games: Game[], env: Env): Promise<Game[]> {
  if (games.length === 0) return games;
  
  try {
    // Use SportsRadar API key
    const apiKey = env.SPORTSRADAR_API_KEY;
    if (!apiKey) {
      console.log("[Games API] No SPORTSRADAR_API_KEY, skipping odds enrichment");
      return games;
    }
    
    // Group games by sport to minimize API calls
    const sportGames = new Map<string, Game[]>();
    for (const game of games) {
      const sport = game.sport?.toLowerCase() || '';
      if (!sportGames.has(sport)) sportGames.set(sport, []);
      sportGames.get(sport)!.push(game);
    }
    
    // Supported sports for SportsRadar odds - all sports with competition IDs
    const ODDS_SPORTS = ['nba', 'nfl', 'mlb', 'nhl', 'ncaab', 'ncaaf', 'soccer', 'mma', 'golf', 'nascar'];
    
    // Fetch odds SEQUENTIALLY with caching (service handles rate limiting)
    const combinedOddsMap = new Map<string, { spread?: number; total?: number; moneylineHome?: number; moneylineAway?: number }>();
    
    for (const sportKey of ODDS_SPORTS) {
      if (!sportGames.has(sportKey)) continue;
      
      try {
        // Pass database for persistent D1 caching (reduces rate limiting)
        // Use dedicated SPORTSRADAR_ODDS_KEY if set, otherwise fall back to main API key
        const oddsApiKey = env.SPORTSRADAR_ODDS_KEY || apiKey;
        const oddsMap = await fetchSportsRadarOdds(sportKey, apiKey, env.DB, undefined, oddsApiKey);
        
        // Capture snapshots for line movement tracking (async, don't block)
        if (oddsMap.size > 0 && env.DB) {
          captureAllOddsSnapshots(env.DB, oddsMap, sportKey).catch(err => {
            console.log(`[Games API] Snapshot capture failed for ${sportKey}:`, err);
          });
        }
        
        for (const [key, odds] of oddsMap) {
          combinedOddsMap.set(key, {
            spread: odds.spread ?? odds.spreadHome ?? undefined,
            total: odds.total ?? undefined,
            moneylineHome: odds.moneylineHome ?? undefined,
            moneylineAway: odds.moneylineAway ?? undefined,
          });
        }
      } catch (err) {
        console.log(`[SportsRadar Odds] Error for ${sportKey}:`, err);
      }
    }
    
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
      
      // Extract SportsRadar event ID from game_id (e.g., sr_nba_653e460f-1e7e-... -> sr:sport_event:653e460f-1e7e-...)
      const gameIdParts = game.game_id?.split('_') || [];
      const srEventId = gameIdParts.length >= 3 
        ? `sr:sport_event:${gameIdParts.slice(2).join('-')}`
        : null;
      
      // Try several key patterns to match
      const keys = [
        srEventId, // SportsRadar sport event ID
        `${sport}|${awayName}|${homeName}`,
        `${sport}|${game.away_team_name?.toLowerCase()}|${game.home_team_name?.toLowerCase()}`,
        game.game_id, // Our game ID format
      ].filter(Boolean) as string[];
      
      for (const key of keys) {
        const odds = combinedOddsMap.get(key);
        if (odds) {
          if (ODDS_DEBUG_LOGS) {
            console.log(`[Games API] Matched odds for ${game.home_team_name} - key: ${key}, spread: ${odds.spread}, ml: ${odds.moneylineHome}`);
          }
          return {
            ...game,
            spread: odds.spread,
            overUnder: odds.total,
            moneylineHome: odds.moneylineHome,
            moneylineAway: odds.moneylineAway,
          };
        }
      }
      
      if (ODDS_DEBUG_LOGS && sport === 'nba' && game.home_team_name) {
        console.log(`[Games API] No odds match for ${game.away_team_name} @ ${game.home_team_name}, tried keys:`, keys.slice(0, 2));
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
  
  console.log("[Games API] GET / called", { sport, status, date });
  
  // Validate sport if provided
  if (sport && !SUPPORTED_SPORTS.includes(sport)) {
    return c.json({ 
      error: `Invalid sport. Supported: ${SUPPORTED_SPORTS.join(", ")}` 
    }, 400);
  }
  
  // If no sport specified, get all sports IN PARALLEL for faster response
  if (!sport) {
    // Fetch all sports concurrently instead of sequentially
    const results = await Promise.all(
      SUPPORTED_SPORTS.map((s) =>
        withTimeout(
          fetchGamesWithFallback(s, { status, date }),
          12000,
          { data: [], fromCache: false, provider: "none", error: `${s}_timeout` } as any
        )
      )
    );
    
    let allGames: Game[] = [];
    let primaryProvider = "none";
    let anyFromCache = true;
    let hasError = false;
    
    for (const result of results) {
      allGames.push(...result.data);
      if (!result.fromCache) anyFromCache = false;
      if (result.data.length > 0) primaryProvider = result.provider;
      if (result.error) hasError = true;
    }
    
    // Optional fast-path for clients that only need scoreboard data.
    if (includeOdds) {
      allGames = await enrichGamesWithOdds(allGames, c.env);
    }
    
    // Sort by sport then start time
    allGames.sort((a, b) => {
      if (a.sport !== b.sport) return a.sport.localeCompare(b.sport);
      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    });
    
    // Log response summary
    const sportsCounts = SUPPORTED_SPORTS.map(s => `${s}:${allGames.filter(g => g.sport === s).length}`).join(", ");
    console.log("[Games API] Response:", { totalGames: allGames.length, provider: primaryProvider, sportsCounts });
    
    return c.json({ 
      games: allGames.map(withClientGameId),
      fromCache: anyFromCache,
      provider: primaryProvider,
      error: hasError && allGames.length === 0 ? "Live data unavailable" : undefined,
      timestamp: new Date().toISOString(),
    });
  }

  if (sport === "soccer") {
    const soccerCacheKey = "g1:soccer:games";
    const soccerHeaders = cacheHeaders(30, { isPublic: true, staleWhileRevalidate: 30 });
    const redis = getRedisClient(c.env);
    try {
      if (redis) {
        const cachedPayload = await redis.get<Record<string, unknown>>(soccerCacheKey);
        if (cachedPayload && typeof cachedPayload === "object") {
          return c.json(cachedPayload, { headers: soccerHeaders });
        }
      }
    } catch (err) {
      console.log("[Games API] Soccer cache read failed:", err);
    }

    const soccerResult = await withTimeout(
      fetchGamesWithFallback(sport, { status, date }),
      12000,
      { data: [], fromCache: false, provider: "none", error: `${sport}_timeout` } as any
    );

    const soccerEnrichedGames = includeOdds
      ? await enrichGamesWithOdds(soccerResult.data, c.env)
      : soccerResult.data;

    const soccerPayload = {
      games: soccerEnrichedGames.map(withClientGameId),
      fromCache: soccerResult.fromCache,
      cachedAt: soccerResult.cachedAt ? new Date(soccerResult.cachedAt).toISOString() : undefined,
      provider: soccerResult.provider,
      timestamp: new Date().toISOString(),
    };

    try {
      if (redis) {
        await redis.set(soccerCacheKey, soccerPayload, { ex: 30 });
      }
    } catch (err) {
      console.log("[Games API] Soccer cache write failed:", err);
    }

    return c.json(soccerPayload, { headers: soccerHeaders });
  }
  
  const result = await withTimeout(
    fetchGamesWithFallback(sport, { status, date }),
    12000,
    { data: [], fromCache: false, provider: "none", error: `${sport}_timeout` } as any
  );
  
  // Optional fast-path for clients that only need scoreboard data.
  const enrichedGames = includeOdds
    ? await enrichGamesWithOdds(result.data, c.env)
    : result.data;
  
  // Determine cache headers based on game statuses
  const statuses = enrichedGames.map(g => g.status as GameStatus);
  const ttl = getTTLForGamesList(statuses);
  const headers = cacheHeaders(ttl, { isPublic: true, staleWhileRevalidate: 30 });
  
  return c.json({
    games: enrichedGames.map(withClientGameId),
    fromCache: result.fromCache,
    cachedAt: result.cachedAt ? new Date(result.cachedAt).toISOString() : undefined,
    provider: result.provider,
    timestamp: new Date().toISOString(),
  }, { headers });
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
  
  let sports: SportKey[] | undefined;
  if (sportsParam) {
    sports = sportsParam.split(",").filter(s => 
      SUPPORTED_SPORTS.includes(s as SportKey)
    ) as SportKey[];
    
    if (sports.length === 0) {
      return c.json({ error: "No valid sports specified" }, 400);
    }
  }
  
  const result = await fetchLiveGamesWithFallback({ sports });
  
  // Group by sport for easier consumption
  const bySport: Record<string, Game[]> = {};
  for (const game of result.data) {
    if (!bySport[game.sport]) bySport[game.sport] = [];
    bySport[game.sport].push(game);
  }
  
  return c.json({
    games: result.data.map(withClientGameId),
    bySport,
    count: result.data.length,
    fromCache: result.fromCache,
    provider: result.provider,
    timestamp: new Date().toISOString(),
  }, { headers: liveGameHeaders() });
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
  const hoursParam = c.req.query("hours");
  
  let sports: SportKey[] | undefined;
  if (sportsParam) {
    sports = sportsParam.split(",").filter(s => 
      SUPPORTED_SPORTS.includes(s as SportKey)
    ) as SportKey[];
  }
  
  const hours = hoursParam ? parseInt(hoursParam, 10) : 48;
  if (isNaN(hours) || hours < 1 || hours > 168) {
    return c.json({ error: "Hours must be between 1 and 168" }, 400);
  }
  
  const result = await fetchScheduledGamesWithFallback({ sports, hours });
  
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
  
  if (!result.data && normalizedGameId.startsWith("sr:sport_event:") && c.env.SPORTSRADAR_API_KEY) {
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
  // Scheduled games can be slow/noisy here and are handled by /api/games/:gameId/odds.
  if (!liteMode && isOddsApiAvailable(c.env) && game.status === "IN_PROGRESS") {
    const liveOdds = await fetchOddsForGame(
      game.sport as SportKey,
      game.home_team_name,
      game.away_team_name,
      c.env
    );
    if (liveOdds.length > 0) {
      odds = liveOdds;
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
        if (srProps.length > 0) {
          console.log(`[Props API] SUCCESS with ${name}: ${srProps.length} props found`);
          props = srProps;
          propsProvider = name;
          propsSource = "event";
          propsFallbackReason = null;
          break;
        } else {
          console.log(`[Props API] ${name} returned 0 props, trying next key...`);
          propsFallbackReason = `SportsRadar connected, but no player props are posted yet for this event (${name})`;
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
  const result = await fetchGameWithFallback(gameId);
  
  if (!result.data?.game) {
    return c.json({ error: "Game not found" }, 404);
  }
  
  const game = result.data.game;
  sport = (game.sport || sport).toLowerCase();
  
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
      // Fetch ALL sportsbooks for this game (not just consensus)
      let allBooks: any[] = [];
      for (const keyCandidate of oddsKeyCandidates) {
        allBooks = await fetchAllSportsbooksForGame(
          sport,
          apiKey,
          c.env.DB,
          game.home_team_name || '',
          game.away_team_name || '',
          keyCandidate
        );
        if (allBooks.length > 0) break;
      }
      
      if (allBooks.length > 0) {
        sportsbooks.push(...allBooks);
      } else {
        // Fallback to consensus if no individual books returned
        let oddsMap = new Map<string, any>();
        for (const keyCandidate of oddsKeyCandidates) {
          const candidateMap = await fetchSportsRadarOdds(sport, apiKey, c.env.DB, undefined, keyCandidate);
          if (candidateMap.size > 0) {
            oddsMap = candidateMap;
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
          if (srIdCandidates.length > 0) {
            try {
              let directOdds: any = null;
              for (const srEventId of srIdCandidates) {
                for (const keyCandidate of oddsKeyCandidates) {
                  directOdds = await fetchSportsRadarOddsForGame(srEventId, keyCandidate);
                  if (directOdds) break;
                }
                if (directOdds) break;
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
  
  // Track if odds are live in-game odds
  const isLiveOdds = game.status === 'IN_PROGRESS';
  
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
  } = {};
  
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
  const candidates = buildLineHistoryIdCandidates(gameId);
  const addCandidate = (value: unknown) => {
    const v = String(value || "").trim();
    if (!v || candidates.includes(v)) return;
    candidates.unshift(v);
  };
  // Align candidate IDs with whichever provider ID resolved this game detail.
  // This prevents summary/line-history mismatches when a route is called with
  // sr_* but snapshots were stored under provider_game_id (or vice-versa).
  try {
    const detailResult = await fetchGameWithFallback(gameId);
    const detailGame = detailResult.data?.game;
    if (detailGame) {
      addCandidate(detailGame.game_id);
      addCandidate(detailGame.external_id);
      addCandidate(toSportsRadarEventId(String(detailGame.game_id || "")));
      addCandidate(toSportsRadarEventId(String(detailGame.external_id || "")));
    }
  } catch {
    // non-fatal: keep existing candidates
  }
  const resolvedOddsEventId = await resolveOddsEventIdForGame(c.env, gameId).catch(() => null);
  if (resolvedOddsEventId && !candidates.includes(resolvedOddsEventId)) {
    candidates.unshift(resolvedOddsEventId);
  }
  const c0 = candidates[0] || gameId;
  const c1 = candidates[1] || c0;
  const c2 = candidates[2] || c0;
  const c3 = candidates[3] || c0;
  const tail = candidates[candidates.length - 1] || gameId;
  
  const lineHistory: Array<{
    timestamp: string;
    spread: number | null;
    total: number | null;
    moneylineHome: number | null;
    moneylineAway: number | null;
    source: string;
  }> = [];
  
  try {
    // Query line_history table
    const lhResults = await c.env.DB.prepare(`
      SELECT * FROM line_history
      WHERE game_id IN (?, ?, ?, ?)
        OR game_id LIKE ?
      ORDER BY timestamp ASC
      LIMIT 100
    `).bind(c0, c1, c2, c3, `%${tail}%`).all();
    
    if (lhResults.results?.length) {
      // Group by timestamp
      const grouped = new Map<string, { spread?: number; total?: number; moneyline?: number }>();
      for (const row of lhResults.results) {
        const ts = String(row.timestamp);
        if (!grouped.has(ts)) grouped.set(ts, {});
        const entry = grouped.get(ts)!;
        
        if (row.market_type === 'spread') entry.spread = row.value as number;
        else if (row.market_type === 'total') entry.total = row.value as number;
        else if (row.market_type === 'moneyline') entry.moneyline = row.value as number;
      }
      
      for (const [ts, values] of grouped) {
        lineHistory.push({
          timestamp: ts,
          spread: values.spread ?? null,
          total: values.total ?? null,
          moneylineHome: values.moneyline ?? null,
          moneylineAway: null,
          source: "SportsRadar",
        });
      }
    }
    
    if (lineHistory.length === 0) {
      // Fallback to newer odds_opening + odds_snapshots tables.
      for (const candidateId of candidates) {
        const [spreadHome, totalOver, moneylineHome, moneylineAway] = await Promise.all([
          getLineMovement(c.env.DB, candidateId, "SPREAD", "HOME"),
          getLineMovement(c.env.DB, candidateId, "TOTAL", "OVER"),
          getLineMovement(c.env.DB, candidateId, "MONEYLINE", "HOME"),
          getLineMovement(c.env.DB, candidateId, "MONEYLINE", "AWAY"),
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

        if (byTimestamp.size > 0) {
          for (const [timestamp, values] of byTimestamp) {
            lineHistory.push({
              timestamp,
              spread: values.spread,
              total: values.total,
              moneylineHome: values.moneylineHome,
              moneylineAway: values.moneylineAway,
              source: "SportsRadarSnapshots",
            });
          }
          break;
        }

        // Final fallback: read snapshots table directly and map key fields.
        const snapshotRows = await c.env.DB.prepare(`
          SELECT market_key, outcome_key, line_value, price_american, captured_at
          FROM odds_snapshots
          WHERE game_id = ?
          ORDER BY captured_at ASC
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

          for (const [timestamp, values] of rowsByTs) {
            lineHistory.push({
              timestamp,
              spread: values.spread,
              total: values.total,
              moneylineHome: values.moneylineHome,
              moneylineAway: values.moneylineAway,
              source: "SportsRadarSnapshots",
            });
          }
          break;
        }
      }
    }

    // Final fallback: synthesize a single current point from latest odds map
    // so the UI can render a non-empty line card while snapshots backfill.
    if (lineHistory.length === 0) {
      try {
        const gameDetail = await withTimeout(
          fetchGameWithFallback(gameId),
          8000,
          { data: null, error: "timeout" } as any
        );
        const game = gameDetail.data?.game;
        const sportKey = String(game?.sport || "").toLowerCase() as SportKey;
        const apiKey = c.env.SPORTSRADAR_API_KEY;
        if (game && apiKey && SUPPORTED_SPORTS.includes(sportKey)) {
          const oddsApiKey = c.env.SPORTSRADAR_ODDS_KEY || apiKey;
          const oddsMap = await withTimeout(
            fetchSportsRadarOdds(sportKey, apiKey, c.env.DB, undefined, oddsApiKey),
            12000,
            new Map<string, any>()
          );

          const away = String(game.away_team_name || "");
          const home = String(game.home_team_name || "");
          const awayNorm = normalizeNameToken(away);
          const homeNorm = normalizeNameToken(home);
          const lookupKeys = [
            String(game.game_id || ""),
            String(game.external_id || ""),
            `${sportKey}|${awayNorm.split(" ").pop() || awayNorm}|${homeNorm.split(" ").pop() || homeNorm}`,
            `${sportKey}|${awayNorm}|${homeNorm}`,
          ].filter(Boolean);

          let matched: any = null;
          for (const key of lookupKeys) {
            matched = oddsMap.get(key);
            if (matched) break;
          }
          if (!matched) {
            const seen = new Set<string>();
            for (const odds of oddsMap.values()) {
              if (!odds?.gameId || seen.has(odds.gameId)) continue;
              seen.add(odds.gameId);
              if (
                teamsRoughlyMatch(String(odds.awayTeam || ""), away) &&
                teamsRoughlyMatch(String(odds.homeTeam || ""), home)
              ) {
                matched = odds;
                break;
              }
            }
          }

          if (matched) {
            lineHistory.push({
              timestamp: new Date().toISOString(),
              spread: matched.spread ?? matched.spreadHome ?? null,
              total: matched.total ?? null,
              moneylineHome: matched.moneylineHome ?? null,
              moneylineAway: matched.moneylineAway ?? null,
              source: "SportsRadarCurrent",
            });
          }
        }
      } catch (err) {
        console.log("[Line History] Current odds fallback failed:", err);
      }
    }

    // Sort by timestamp
    lineHistory.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    // Calculate opening and current lines
    const opening = lineHistory.length > 0 ? lineHistory[0] : null;
    const current = lineHistory.length > 0 ? lineHistory[lineHistory.length - 1] : null;
    
    // Calculate movements
    const movements = {
      spread: opening && current && opening.spread !== null && current.spread !== null
        ? current.spread - opening.spread
        : null,
      total: opening && current && opening.total !== null && current.total !== null
        ? current.total - opening.total
        : null,
    };
    
    return c.json({
      gameId,
      historyCount: lineHistory.length,
      opening,
      current,
      movements,
      history: lineHistory,
      degraded: lineHistory.length === 0,
      fallback_type: lineHistory.length === 0 ? "no_coverage" : null,
      fallback_reason: lineHistory.length === 0 ? "No line history rows found for this game ID mapping" : null,
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
  
  const result = await fetchOddsForSport(sport, c.env);
  
  if (result.error) {
    return c.json({ 
      error: result.error,
      odds: {},
    }, 200);
  }
  
  // Convert Map to object for JSON serialization
  const oddsObject: Record<string, unknown> = {};
  for (const [key, value] of result.odds) {
    oddsObject[key] = value;
  }
  
  return c.json({
    sport,
    odds: oddsObject,
    gamesWithOdds: result.odds.size,
    provider: "sportsradar",
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

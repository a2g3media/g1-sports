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

type MlbPitcherState = {
  name: string | null;
  handedness: string | null;
  era: string | null;
  last5: string | null;
};

type MlbLiveState = {
  inningNumber: number | null;
  inningHalf: "top" | "bottom" | null;
  outs: number | null;
  balls: number | null;
  strikes: number | null;
  runnersOnBase: {
    first: boolean;
    second: boolean;
    third: boolean;
  } | null;
  currentBatter: {
    name: string | null;
    handedness: string | null;
  } | null;
  currentPitcher: {
    name: string | null;
    handedness: string | null;
  } | null;
  lastPlay: {
    type: string | null;
    player: string | null;
    text: string | null;
    timestamp: string | null;
  } | null;
};

type MlbPregameState = {
  probableHomePitcher: MlbPitcherState | null;
  probableAwayPitcher: MlbPitcherState | null;
};

type MlbDerivedInningState = {
  inningNumber: number | null;
  inningHalf: "top" | "bottom" | null;
  periodLabel: string | null;
};

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
  if (
    status === "inprogress" ||
    status === "in_progress" ||
    status === "live" ||
    status === "halftime" ||
    status === "1st_half" ||
    status === "2nd_half"
  ) {
    return "IN_PROGRESS";
  }
  
  // Final statuses
  if (
    status === "closed" ||
    status === "complete" ||
    status === "final" ||
    status === "ended" ||
    status === "finished" ||
    status === "after_penalties"
  ) {
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
  
  // NBA - quarters (OT starts at quarter 5+)
  if (sport === 'nba') {
    const quarter = srGame.quarter || srGame.period;
    if (quarter) {
      result.period = quarter;
      result.periodLabel = quarter <= 4 ? `Q${quarter}` : `OT${quarter - 4}`;
      result.isOvertime = quarter > 4;
    }
  }

  // NCAAB - halves (OT starts at period 3+)
  if (sport === 'ncaab') {
    const period = srGame.period || srGame.quarter;
    if (period) {
      result.period = period;
      result.periodLabel = period <= 2 ? `${period}H` : `OT${period - 2}`;
      result.isOvertime = period > 2;
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

function extractPitcherRecord(source: any): string | undefined {
  const direct = String(
    source?.record?.summary
    || source?.record?.display
    || source?.record
    || source?.summary
    || source?.pitching_record
    || source?.pitcher_record
    || ""
  ).trim();
  const directMatch = direct.match(/\d+\s*-\s*\d+/);
  if (directMatch) return directMatch[0].replace(/\s+/g, "");

  const wins = Number(
    source?.wins
    ?? source?.win
    ?? source?.w
    ?? source?.statistics?.wins
    ?? source?.stats?.wins
  );
  const losses = Number(
    source?.losses
    ?? source?.loss
    ?? source?.l
    ?? source?.statistics?.losses
    ?? source?.stats?.losses
  );
  if (Number.isFinite(wins) && Number.isFinite(losses)) {
    return `${Math.max(0, Math.trunc(wins))}-${Math.max(0, Math.trunc(losses))}`;
  }

  return undefined;
}

function asNullableString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeHandedness(value: unknown): string | null {
  const raw = asNullableString(value);
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper === "L" || upper.startsWith("LEFT")) return "LHP";
  if (upper === "R" || upper.startsWith("RIGHT")) return "RHP";
  if (upper === "S" || upper.startsWith("SWITCH")) return "S";
  return raw;
}

function extractMlbPitcherSummary(source: any): MlbPitcherState | null {
  if (!source || typeof source !== "object") return null;
  const name = asNullableString(
    source?.full_name
    || `${source?.first_name || ""} ${source?.last_name || ""}`.trim()
    || source?.name
    || source?.display_name
  );
  const handedness = normalizeHandedness(
    source?.throws
    || source?.throw_hand
    || source?.handedness
    || source?.pitching_hand
    || source?.throwing_hand
  );
  const eraRaw = asNullableNumber(
    source?.era
    ?? source?.statistics?.era
    ?? source?.stats?.era
    ?? source?.season?.era
    ?? source?.season_stats?.era
  );
  const era = eraRaw !== null ? eraRaw.toFixed(2) : null;
  const last5 = asNullableString(
    source?.last5
    || source?.last_five
    || source?.last_five_starts
    || source?.recent_form
    || source?.form
  );
  const hasAny = Boolean(name || handedness || era || last5);
  if (!hasAny) return null;
  return { name, handedness, era, last5 };
}

function extractMlbProbablePitcher(team: any, srGame?: any): { name?: string; record?: string } {
  const candidates: any[] = [
    team?.probable_pitcher,
    team?.probablePitcher,
    team?.starting_pitcher,
    team?.starter,
    team?.probable,
  ];
  if (srGame && typeof srGame === "object") {
    candidates.push(
      srGame?.probable_pitcher,
      srGame?.probablePitcher,
      srGame?.starting_pitcher
    );
  }

  const probable = candidates.find((row) => row && typeof row === "object");
  if (!probable) return {};

  const name = String(
    probable?.full_name
    || `${probable?.first_name || ""} ${probable?.last_name || ""}`.trim()
    || probable?.name
    || probable?.display_name
    || ""
  ).trim();
  const record = extractPitcherRecord(probable);

  return {
    name: name || undefined,
    record: record || undefined,
  };
}

function extractMlbProbablePitcherNode(team: any, side: "home" | "away", srGame?: any): any {
  const teamNodeCandidates = [
    team?.probable_pitcher,
    team?.probablePitcher,
    team?.starting_pitcher,
    team?.starter,
    team?.probable,
  ];
  const sideNodeCandidates = srGame
    ? [
        srGame?.probable_pitchers?.[side],
        srGame?.probablePitchers?.[side],
        side === "home" ? srGame?.probable_home_pitcher : srGame?.probable_away_pitcher,
        side === "home" ? srGame?.probableHomePitcher : srGame?.probableAwayPitcher,
        side === "home" ? srGame?.starting_pitcher_home : srGame?.starting_pitcher_away,
      ]
    : [];
  return [...teamNodeCandidates, ...sideNodeCandidates].find((node) => node && typeof node === "object") || null;
}

function extractMlbPregameState(srGame: any, homeTeam: any, awayTeam: any): MlbPregameState | undefined {
  const homeNode = extractMlbProbablePitcherNode(homeTeam, "home", srGame);
  const awayNode = extractMlbProbablePitcherNode(awayTeam, "away", srGame);
  const probableHomePitcher = extractMlbPitcherSummary(homeNode);
  const probableAwayPitcher = extractMlbPitcherSummary(awayNode);
  return {
    probableHomePitcher,
    probableAwayPitcher,
  };
}

function readBaseRunnerPresence(situation: any, baseKey: "first" | "second" | "third"): boolean {
  const keyMap: Record<"first" | "second" | "third", string[]> = {
    first: ["on_first", "first", "first_base", "runner_on_first", "is_first_base_occupied"],
    second: ["on_second", "second", "second_base", "runner_on_second", "is_second_base_occupied"],
    third: ["on_third", "third", "third_base", "runner_on_third", "is_third_base_occupied"],
  };
  for (const key of keyMap[baseKey]) {
    const value = situation?.[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value > 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["1", "true", "yes", "occupied"].includes(normalized)) return true;
      if (["0", "false", "no", "empty"].includes(normalized)) return false;
    }
    if (value && typeof value === "object") return true;
  }
  return false;
}

function extractMlbLiveState(srGame: any): MlbLiveState | undefined {
  if (!srGame || typeof srGame !== "object") return undefined;
  const situation = srGame?.situation || srGame?.game_situation || srGame?.live || {};
  const inningNumber = asNullableNumber(
    situation?.inning
    ?? situation?.inning_number
    ?? srGame?.inning
    ?? srGame?.current_inning
    ?? srGame?.period
  );
  const inningHalfRaw = asNullableString(
    situation?.inning_half
    || situation?.half
    || situation?.half_inning
    || srGame?.inning_half
    || srGame?.half_inning
  );
  const inningHalf = (() => {
    const normalized = String(inningHalfRaw || "").toLowerCase();
    if (!normalized) return null;
    if (normalized.startsWith("top") || normalized === "t" || normalized === "1" || normalized === "away") return "top";
    if (normalized.startsWith("bot") || normalized.startsWith("bottom") || normalized === "b" || normalized === "2" || normalized === "home") return "bottom";
    return null;
  })();
  const outs = asNullableNumber(situation?.outs ?? situation?.out_count ?? srGame?.outs);
  const balls = asNullableNumber(
    situation?.balls
    ?? situation?.count?.balls
    ?? situation?.at_bat?.balls
  );
  const strikes = asNullableNumber(
    situation?.strikes
    ?? situation?.count?.strikes
    ?? situation?.at_bat?.strikes
  );
  const runnersOnBase = situation
    ? {
        first: readBaseRunnerPresence(situation, "first"),
        second: readBaseRunnerPresence(situation, "second"),
        third: readBaseRunnerPresence(situation, "third"),
      }
    : null;
  const batterNode = situation?.batter || situation?.current_batter || situation?.at_bat?.batter || null;
  const pitcherNode = situation?.pitcher || situation?.current_pitcher || situation?.defense?.pitcher || null;
  const currentBatter = batterNode
    ? {
        name: asNullableString(batterNode?.full_name || batterNode?.name || batterNode?.display_name),
        handedness: normalizeHandedness(
          batterNode?.bats
          || batterNode?.bat_hand
          || batterNode?.handedness
        ),
      }
    : null;
  const currentPitcher = pitcherNode
    ? {
        name: asNullableString(pitcherNode?.full_name || pitcherNode?.name || pitcherNode?.display_name),
        handedness: normalizeHandedness(
          pitcherNode?.throws
          || pitcherNode?.throw_hand
          || pitcherNode?.handedness
          || pitcherNode?.pitching_hand
        ),
      }
    : null;
  const lastPlayNode =
    situation?.last_play
    || srGame?.last_play
    || srGame?.lastPlay
    || srGame?.scoring?.last_play
    || null;
  const lastPlay = lastPlayNode
    ? {
        type: asNullableString(lastPlayNode?.event_type || lastPlayNode?.type),
        player: asNullableString(
          lastPlayNode?.player?.full_name
          || lastPlayNode?.player?.name
          || lastPlayNode?.hitter?.full_name
          || lastPlayNode?.hitter?.name
        ),
        text: asNullableString(lastPlayNode?.description || lastPlayNode?.text || lastPlayNode?.title),
        timestamp: asNullableString(lastPlayNode?.updated || lastPlayNode?.timestamp || lastPlayNode?.wall_clock),
      }
    : null;
  return {
    inningNumber,
    inningHalf,
    outs,
    balls,
    strikes,
    runnersOnBase,
    currentBatter,
    currentPitcher,
    lastPlay,
  };
}

async function fetchMlbInningStateFromPbp(
  config: { base: string; version: string },
  gameId: string
): Promise<MlbDerivedInningState | null> {
  if (!apiKey) return null;
  const url = `${config.base}/${config.version}/en/games/${gameId}/pbp.json?api_key=${apiKey}`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const raw = await response.json() as any;
    const game = raw?.game || raw || {};
    const innings = Array.isArray(game?.innings) ? game.innings : [];
    if (!innings.length) return null;

    for (let i = innings.length - 1; i >= 0; i -= 1) {
      const inning = innings[i];
      const inningNumber = asNullableNumber(inning?.number ?? inning?.sequence);
      const halves = Array.isArray(inning?.halfs) ? inning.halfs : [];

      for (let j = halves.length - 1; j >= 0; j -= 1) {
        const halfNode = halves[j];
        const hasEvents = Array.isArray(halfNode?.events) && halfNode.events.length > 0;
        if (!hasEvents) continue;
        const halfRaw = asNullableString(halfNode?.half);
        const halfNorm = String(halfRaw || "").toUpperCase();
        const inningHalf = halfNorm === "T" ? "top" : halfNorm === "B" ? "bottom" : null;
        const periodLabel = inningNumber && inningHalf
          ? `${inningHalf === "top" ? "Top" : "Bot"} ${inningNumber}`
          : inningNumber
            ? `Inning ${inningNumber}`
            : null;
        return {
          inningNumber,
          inningHalf,
          periodLabel,
        };
      }

      if (inningNumber) {
        return {
          inningNumber,
          inningHalf: null,
          periodLabel: `Inning ${inningNumber}`,
        };
      }
    }
  } catch {
    // Best-effort MLB inning fallback.
  }
  return null;
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
): Promise<{
  homeScore?: number;
  awayScore?: number;
  status?: string;
  period?: number;
  periodLabel?: string;
  clock?: string;
  mlbLiveState?: MlbLiveState;
  mlbPregameState?: MlbPregameState;
} | null> {
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
    const homeTeam = data.home || data.home_team;
    const awayTeam = data.away || data.away_team;
    const mlbLiveState = sport === "mlb" ? extractMlbLiveState(data) : undefined;
    const mlbPregameState = sport === "mlb" ? extractMlbPregameState(data, homeTeam, awayTeam) : undefined;
    const needsMlbInningFallback = (
      sport === "mlb" &&
      (periodInfo.period == null || !periodInfo.periodLabel) &&
      (!mlbLiveState || (mlbLiveState.inningNumber == null && mlbLiveState.inningHalf == null))
    );
    const derivedMlbInning = needsMlbInningFallback
      ? await fetchMlbInningStateFromPbp(config, gameId)
      : null;
    
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
    
    const normalizedPeriod = actualStatus === "IN_PROGRESS"
      ? (periodInfo.period ?? derivedMlbInning?.inningNumber ?? undefined)
      : undefined;
    const normalizedPeriodLabel = actualStatus === "FINAL"
      ? "Final"
      : (actualStatus === "IN_PROGRESS"
        ? (periodInfo.periodLabel ?? derivedMlbInning?.periodLabel ?? undefined)
        : undefined);
    const normalizedClock = actualStatus === "IN_PROGRESS" ? periodInfo.clock : "";

    return {
      homeScore,
      awayScore,
      status: actualStatus,
      period: normalizedPeriod,
      periodLabel: normalizedPeriodLabel,
      clock: normalizedClock,
      mlbLiveState:
        sport === "mlb"
          ? {
              inningNumber: mlbLiveState?.inningNumber ?? derivedMlbInning?.inningNumber ?? null,
              inningHalf: mlbLiveState?.inningHalf ?? derivedMlbInning?.inningHalf ?? null,
              outs: mlbLiveState?.outs ?? null,
              balls: mlbLiveState?.balls ?? null,
              strikes: mlbLiveState?.strikes ?? null,
              runnersOnBase: mlbLiveState?.runnersOnBase ?? null,
              currentBatter: mlbLiveState?.currentBatter ?? null,
              currentPitcher: mlbLiveState?.currentPitcher ?? null,
              lastPlay: mlbLiveState?.lastPlay ?? null,
            }
          : mlbLiveState,
      mlbPregameState,
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
        const awayProbablePitcher = sport === "mlb" ? extractMlbProbablePitcher(away, srGame) : {};
        const homeProbablePitcher = sport === "mlb" ? extractMlbProbablePitcher(home, srGame) : {};
        const mlbPregameState = sport === "mlb" ? extractMlbPregameState(srGame, home, away) : undefined;
        const mlbLiveState = sport === "mlb" ? extractMlbLiveState(srGame) : undefined;
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
          probable_away_pitcher_name: awayProbablePitcher.name,
          probable_away_pitcher_record: awayProbablePitcher.record,
          probable_home_pitcher_name: homeProbablePitcher.name,
          probable_home_pitcher_record: homeProbablePitcher.record,
          probable_pitchers: probablePitchers,
          mlbLiveState,
          mlbPregameState,
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
            const resolvedStatus = String(game.status || "").toUpperCase() as Game["status"];
            if (resolvedStatus === "IN_PROGRESS") {
              game.period = result.scores.period ?? game.period;
              game.period_label = result.scores.periodLabel ?? game.period_label;
              game.clock = result.scores.clock ?? game.clock;
            } else if (resolvedStatus === "FINAL") {
              game.period = undefined;
              game.period_label = "Final";
              game.clock = "";
            } else {
              game.period = undefined;
              game.period_label = undefined;
              game.clock = "";
            }
            game.mlbLiveState = result.scores.mlbLiveState ?? game.mlbLiveState;
            game.mlbPregameState = result.scores.mlbPregameState ?? game.mlbPregameState;
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
      const awayProbablePitcher = sport === "mlb" ? extractMlbProbablePitcher(away, srGame) : {};
      const homeProbablePitcher = sport === "mlb" ? extractMlbProbablePitcher(home, srGame) : {};
      const mlbPregameState = sport === "mlb" ? extractMlbPregameState(srGame, home, away) : undefined;
      const mlbLiveState = sport === "mlb" ? extractMlbLiveState(srGame) : undefined;
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
        probable_away_pitcher_name: awayProbablePitcher.name,
        probable_away_pitcher_record: awayProbablePitcher.record,
        probable_home_pitcher_name: homeProbablePitcher.name,
        probable_home_pitcher_record: homeProbablePitcher.record,
        probable_pitchers: probablePitchers,
        mlbLiveState,
        mlbPregameState,
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

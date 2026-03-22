/**
 * Odds API Routes
 * 
 * Provider-agnostic endpoints for odds data.
 * Supports caching with smart TTLs based on market status (pregame vs live).
 */

import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import {
  generateOpeningLines,
  buildGameOddsSummary,
  calculateConsensus,
  getCachedOdds,
  setCachedOdds,
  clearOddsCache,
  simulateSpreadMove,
  simulateTotalMove,
  simulateFavoriteFlip,
  processOddsMovements,
  fetchSnapshotsForGame,
  BOOKMAKER_KEYS,
  type DataScope,
} from "../services/odds";
import { fetchGamesWithFallback, fetchGameWithFallback, type SportKey } from "../services/providers";
import { oddsHeaders, cacheHeaders, CACHE_TTL } from "../services/responseCache";
import { fetchSportsRadarOdds, fetchSportsRadarOddsForGame, getLineMovement } from "../services/sportsRadarOddsService";
import type { OddsQuote } from "../../shared/types";

const oddsRouter = new Hono<{ Bindings: Env }>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const demoOddsStore = new Map<string, any[]>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const demoOpeningStore = new Map<string, any[]>();

const ODDS_SUPPORTED_SPORTS = new Set<SportKey>([
  "nfl",
  "nba",
  "mlb",
  "nhl",
  "ncaaf",
  "ncaab",
  "soccer",
  "mma",
  "golf",
  "nascar",
]);

function toSportKey(value: string | undefined): SportKey | null {
  if (!value) return null;
  const sport = value.toLowerCase() as SportKey;
  return ODDS_SUPPORTED_SPORTS.has(sport) ? sport : null;
}

function getTodayEasternDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeTeamName(value: string | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teamsRoughlyMatch(leftRaw: string | undefined, rightRaw: string | undefined): boolean {
  const left = normalizeTeamName(leftRaw);
  const right = normalizeTeamName(rightRaw);
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
  const tail = parts.slice(2).join("_");
  return `sr:match:${tail}`;
}

function toSportsRadarUnderscoreId(gameId: string): string | null {
  if (!gameId.startsWith("sr:sport_event:")) return null;
  const srId = gameId.replace("sr:sport_event:", "");
  if (!srId) return null;
  return `sr_${srId.replace(/:/g, "_").replace(/-/g, "_")}`;
}

function buildGameIdCandidates(gameId: string): string[] {
  const raw = String(gameId || "").trim();
  if (!raw) return [];
  const candidates = new Set<string>([raw]);
  // Accept URL-safe prefixed soccer IDs used by some frontend links.
  if (raw.startsWith("soccer_sr:sport_event:")) {
    candidates.add(raw.replace(/^soccer_/, ""));
  }
  const srEvent = toSportsRadarEventId(raw);
  if (srEvent) candidates.add(srEvent);
  const srMatch = toSportsRadarMatchId(raw);
  if (srMatch) candidates.add(srMatch);
  const srUnderscore = toSportsRadarUnderscoreId(raw);
  if (srUnderscore) candidates.add(srUnderscore);
  const parts = raw.split("_").filter(Boolean);
  if (parts.length >= 3 && parts[0] === "sr") {
    candidates.add(`sr:sport_event:${parts.slice(2).join("-")}`);
  }
  return Array.from(candidates);
}

function classifyFallbackType(reason: string | null | undefined): "no_coverage" | "provider_error" | "auth_config" | null {
  const normalized = String(reason || "").toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("api key") || normalized.includes("missing") || normalized.includes("unauthorized") || normalized.includes("forbidden")) {
    return "auth_config";
  }
  if (normalized.includes("no") || normalized.includes("not found") || normalized.includes("empty")) {
    return "no_coverage";
  }
  return "provider_error";
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

function buildOddsLookupKeys(game: any): string[] {
  const sport = String(game?.sport || "").toLowerCase();
  const homeName = normalizeTeamName(game?.home_team_name);
  const awayName = normalizeTeamName(game?.away_team_name);
  const eventId = toSportsRadarEventId(String(game?.game_id || ""));
  const matchId = toSportsRadarMatchId(String(game?.game_id || ""));
  return [
    eventId || "",
    matchId || "",
    `${sport}|${awayName.split(" ").pop() || awayName}|${homeName.split(" ").pop() || homeName}`,
    `${sport}|${awayName}|${homeName}`,
    String(game?.game_id || ""),
    String(game?.external_id || ""),
  ].filter(Boolean);
}

function decimalToAmerican(decimal: number): number {
  if (!decimal || decimal <= 1) return 100;
  if (decimal >= 2) {
    return Math.round((decimal - 1) * 100);
  }
  return Math.round(-100 / (decimal - 1));
}

type TicketHandleSplit = {
  game_id: string;
  market: "SPREAD" | "TOTAL" | "MONEYLINE";
  side: "HOME" | "AWAY" | "OVER" | "UNDER";
  tickets_pct: number | null;
  handle_pct: number | null;
  sportsbook?: string | null;
  updated_at?: string | null;
};

type SplitSourceResult = {
  source: "external_feed" | "none";
  splits: TicketHandleSplit[];
  fallbackReason: string | null;
};

type PropProjection = {
  game_id: string;
  provider_game_id: string | null;
  sport: string;
  player_name: string;
  team: string | null;
  prop_type: string;
  line_value: number;
  open_line_value: number | null;
  movement: number;
  books_count: number;
  projected_value: number;
  edge_vs_line: number;
  confidence: "low" | "medium" | "high";
  source: "internal_projection_v1";
  updated_at: string;
};

function toFiniteOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function inferMarket(value: string | null | undefined): TicketHandleSplit["market"] | null {
  const v = String(value || "").toUpperCase();
  if (v.includes("SPREAD")) return "SPREAD";
  if (v.includes("TOTAL")) return "TOTAL";
  if (v.includes("MONEYLINE") || v === "ML") return "MONEYLINE";
  return null;
}

function inferSide(value: string | null | undefined): TicketHandleSplit["side"] | null {
  const v = String(value || "").toUpperCase();
  if (v.includes("HOME")) return "HOME";
  if (v.includes("AWAY")) return "AWAY";
  if (v.includes("OVER")) return "OVER";
  if (v.includes("UNDER")) return "UNDER";
  return null;
}

function normalizeSplitRow(row: any, requestedGameId: string): TicketHandleSplit | null {
  const market = inferMarket(row.market || row.market_key || row.bet_type);
  const side = inferSide(row.side || row.outcome || row.outcome_key || row.selection);
  if (!market || !side) return null;

  const ticketsPct = toFiniteOrNull(row.tickets_pct ?? row.ticket_pct ?? row.bets_pct ?? row.bet_pct);
  const handlePct = toFiniteOrNull(row.handle_pct ?? row.money_pct ?? row.stake_pct);
  if (ticketsPct === null && handlePct === null) return null;

  return {
    game_id: String(row.game_id || row.gameId || requestedGameId),
    market,
    side,
    tickets_pct: ticketsPct,
    handle_pct: handlePct,
    sportsbook: row.sportsbook || row.book || row.bookmaker || null,
    updated_at: row.updated_at || row.updatedAt || new Date().toISOString(),
  };
}

async function fetchTicketHandleSplitsForGame(c: any, gameId: string): Promise<SplitSourceResult> {
  const feedUrl = c.env.TICKET_HANDLE_FEED_URL as string | undefined;
  if (!feedUrl) {
    return { source: "none", splits: [], fallbackReason: "TICKET_HANDLE_FEED_URL not configured" };
  }

  try {
    const url = new URL(feedUrl);
    url.searchParams.set("game_id", gameId);
    const headers: HeadersInit = { "Accept": "application/json" };
    if (c.env.TICKET_HANDLE_FEED_API_KEY) {
      headers["Authorization"] = `Bearer ${c.env.TICKET_HANDLE_FEED_API_KEY}`;
    }
    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      return { source: "none", splits: [], fallbackReason: `Ticket/handle feed HTTP ${response.status}` };
    }
    const payload = await response.json() as any;
    const rawRows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.splits)
        ? payload.splits
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
    const splits = rawRows
      .map((row: any) => normalizeSplitRow(row, gameId))
      .filter((row: TicketHandleSplit | null): row is TicketHandleSplit => Boolean(row))
      .filter((row: TicketHandleSplit) => row.game_id === gameId);
    if (splits.length === 0) {
      return { source: "none", splits: [], fallbackReason: "No ticket/handle rows for game" };
    }
    return { source: "external_feed", splits, fallbackReason: null };
  } catch (err) {
    return { source: "none", splits: [], fallbackReason: `Ticket/handle fetch failed: ${String(err)}` };
  }
}

function computeProjection(line: number, openLine: number | null, movement: number, booksCount: number): {
  projected: number;
  edge: number;
  confidence: "low" | "medium" | "high";
} {
  const openAnchor = openLine ?? line;
  const drift = line - openAnchor;
  const projected = line + drift * 0.35 + movement * 0.25;
  const edge = projected - line;
  const confidence: "low" | "medium" | "high" =
    booksCount >= 4 && Math.abs(drift) >= 1 ? "high" :
    booksCount >= 2 ? "medium" :
    "low";
  return {
    projected: Math.round(projected * 100) / 100,
    edge: Math.round(edge * 100) / 100,
    confidence,
  };
}

function toOddsQuotesFromSportsRadar(
  gameId: string,
  odds: {
    spread?: number | null;
    total?: number | null;
    moneylineHome?: number | null;
    moneylineAway?: number | null;
    spread1HHome?: number | null;
    spread1HAway?: number | null;
    total1H?: number | null;
    moneyline1HHome?: number | null;
    moneyline1HAway?: number | null;
  },
  scope: DataScope
): OddsQuote[] {
  const quotes: OddsQuote[] = [];

  if (odds.spread !== undefined && odds.spread !== null) {
    const spread = Number(odds.spread);
    quotes.push({
      data_scope: scope,
      game_id: gameId,
      bookmaker_key: "sportsradar",
      market_key: "SPREAD",
      outcome_key: "HOME",
      line_value: spread,
      price_american: -110,
      price_decimal: 1.91,
      implied_probability: 0.524,
      is_live: false,
      source_provider: "sportsradar",
    });
    quotes.push({
      data_scope: scope,
      game_id: gameId,
      bookmaker_key: "sportsradar",
      market_key: "SPREAD",
      outcome_key: "AWAY",
      line_value: -spread,
      price_american: -110,
      price_decimal: 1.91,
      implied_probability: 0.524,
      is_live: false,
      source_provider: "sportsradar",
    });
  }

  if (odds.total !== undefined && odds.total !== null) {
    const total = Number(odds.total);
    quotes.push({
      data_scope: scope,
      game_id: gameId,
      bookmaker_key: "sportsradar",
      market_key: "TOTAL",
      outcome_key: "OVER",
      line_value: total,
      price_american: -110,
      price_decimal: 1.91,
      implied_probability: 0.524,
      is_live: false,
      source_provider: "sportsradar",
    });
    quotes.push({
      data_scope: scope,
      game_id: gameId,
      bookmaker_key: "sportsradar",
      market_key: "TOTAL",
      outcome_key: "UNDER",
      line_value: total,
      price_american: -110,
      price_decimal: 1.91,
      implied_probability: 0.524,
      is_live: false,
      source_provider: "sportsradar",
    });
  }

  if (odds.moneylineHome !== undefined && odds.moneylineHome !== null) {
    const homeMl = Number(odds.moneylineHome);
    quotes.push({
      data_scope: scope,
      game_id: gameId,
      bookmaker_key: "sportsradar",
      market_key: "MONEYLINE",
      outcome_key: "HOME",
      line_value: null,
      price_american: homeMl,
      price_decimal: homeMl ? (homeMl > 0 ? (homeMl / 100) + 1 : (100 / Math.abs(homeMl)) + 1) : null,
      implied_probability: homeMl ? (homeMl > 0 ? 100 / (homeMl + 100) : Math.abs(homeMl) / (Math.abs(homeMl) + 100)) : null,
      is_live: false,
      source_provider: "sportsradar",
    });
  }

  if (odds.moneylineAway !== undefined && odds.moneylineAway !== null) {
    const awayMl = Number(odds.moneylineAway);
    quotes.push({
      data_scope: scope,
      game_id: gameId,
      bookmaker_key: "sportsradar",
      market_key: "MONEYLINE",
      outcome_key: "AWAY",
      line_value: null,
      price_american: awayMl,
      price_decimal: awayMl ? (awayMl > 0 ? (awayMl / 100) + 1 : (100 / Math.abs(awayMl)) + 1) : null,
      implied_probability: awayMl ? (awayMl > 0 ? 100 / (awayMl + 100) : Math.abs(awayMl) / (Math.abs(awayMl) + 100)) : null,
      is_live: false,
      source_provider: "sportsradar",
    });
  }

  if (odds.spread1HHome !== undefined && odds.spread1HHome !== null) {
    const spread1HHome = Number(odds.spread1HHome);
    const spread1HAway = odds.spread1HAway !== undefined && odds.spread1HAway !== null
      ? Number(odds.spread1HAway)
      : -spread1HHome;
    quotes.push({
      data_scope: scope,
      game_id: gameId,
      bookmaker_key: "sportsradar",
      market_key: "SPREAD_1H",
      outcome_key: "HOME",
      line_value: spread1HHome,
      price_american: -110,
      price_decimal: 1.91,
      implied_probability: 0.524,
      is_live: false,
      source_provider: "sportsradar",
    });
    quotes.push({
      data_scope: scope,
      game_id: gameId,
      bookmaker_key: "sportsradar",
      market_key: "SPREAD_1H",
      outcome_key: "AWAY",
      line_value: spread1HAway,
      price_american: -110,
      price_decimal: 1.91,
      implied_probability: 0.524,
      is_live: false,
      source_provider: "sportsradar",
    });
  }

  if (odds.total1H !== undefined && odds.total1H !== null) {
    const total1H = Number(odds.total1H);
    quotes.push({
      data_scope: scope,
      game_id: gameId,
      bookmaker_key: "sportsradar",
      market_key: "TOTAL_1H",
      outcome_key: "OVER",
      line_value: total1H,
      price_american: -110,
      price_decimal: 1.91,
      implied_probability: 0.524,
      is_live: false,
      source_provider: "sportsradar",
    });
    quotes.push({
      data_scope: scope,
      game_id: gameId,
      bookmaker_key: "sportsradar",
      market_key: "TOTAL_1H",
      outcome_key: "UNDER",
      line_value: total1H,
      price_american: -110,
      price_decimal: 1.91,
      implied_probability: 0.524,
      is_live: false,
      source_provider: "sportsradar",
    });
  }

  if (odds.moneyline1HHome !== undefined && odds.moneyline1HHome !== null) {
    const ml1HHome = Number(odds.moneyline1HHome);
    quotes.push({
      data_scope: scope,
      game_id: gameId,
      bookmaker_key: "sportsradar",
      market_key: "ML_1H",
      outcome_key: "HOME",
      line_value: null,
      price_american: ml1HHome,
      price_decimal: ml1HHome > 0 ? (ml1HHome / 100) + 1 : (100 / Math.abs(ml1HHome)) + 1,
      implied_probability: ml1HHome > 0 ? 100 / (ml1HHome + 100) : Math.abs(ml1HHome) / (Math.abs(ml1HHome) + 100),
      is_live: false,
      source_provider: "sportsradar",
    });
  }

  if (odds.moneyline1HAway !== undefined && odds.moneyline1HAway !== null) {
    const ml1HAway = Number(odds.moneyline1HAway);
    quotes.push({
      data_scope: scope,
      game_id: gameId,
      bookmaker_key: "sportsradar",
      market_key: "ML_1H",
      outcome_key: "AWAY",
      line_value: null,
      price_american: ml1HAway,
      price_decimal: ml1HAway > 0 ? (ml1HAway / 100) + 1 : (100 / Math.abs(ml1HAway)) + 1,
      implied_probability: ml1HAway > 0 ? 100 / (ml1HAway + 100) : Math.abs(ml1HAway) / (Math.abs(ml1HAway) + 100),
      is_live: false,
      source_provider: "sportsradar",
    });
  }

  return quotes;
}

function extractFirstHalfSummary(quotes: OddsQuote[]) {
  const consensus = calculateConsensus(quotes);
  const pick = (market: string, outcome: string) =>
    consensus.find((q) => q.market_key === market && q.outcome_key === outcome);

  const spreadHome = pick("SPREAD_1H", "HOME");
  const spreadAway = pick("SPREAD_1H", "AWAY");
  const totalOver = pick("TOTAL_1H", "OVER");
  const totalUnder = pick("TOTAL_1H", "UNDER");
  const mlHome = pick("ML_1H", "HOME");
  const mlAway = pick("ML_1H", "AWAY");

  return {
    spread: spreadHome ? {
      home_line: spreadHome.line_value,
      home_price: spreadHome.price_american,
      away_line: spreadAway?.line_value ?? null,
      away_price: spreadAway?.price_american ?? null,
    } : null,
    total: totalOver ? {
      line: totalOver.line_value,
      over_price: totalOver.price_american,
      under_price: totalUnder?.price_american ?? null,
    } : null,
    moneyline: mlHome ? {
      home_price: mlHome.price_american,
      away_price: mlAway?.price_american ?? null,
    } : null,
  };
}

async function fetchRealOddsForGame(
  c: any,
  gameId: string,
  scope: DataScope,
  forceRefresh: boolean
): Promise<{
  game: any | null;
  resolvedGameId: string | null;
  quotes: OddsQuote[];
  source: "sportsradar" | "none";
  fallbackReason: string | null;
  fallbackType: "no_coverage" | "provider_error" | "auth_config" | null;
}> {
  const candidates = buildGameIdCandidates(gameId);
  let game: any | null = null;
  let resolvedGameId: string | null = null;
  let detailError: string | null = null;
  for (const candidate of candidates) {
    const detailResult = await fetchGameWithFallback(candidate);
    if (detailResult.data?.game) {
      game = detailResult.data.game;
      resolvedGameId = String(detailResult.data.game.game_id || candidate);
      detailError = detailResult.error || null;
      break;
    }
    if (detailResult.error) detailError = detailResult.error;
  }
  if (!game) {
    return {
      game: null,
      resolvedGameId: null,
      quotes: [],
      source: "none",
      fallbackReason: detailError || "Game not found",
      fallbackType: classifyFallbackType(detailError || "Game not found"),
    };
  }

  const sport = toSportKey(game.sport);
  const mainKey = c.env.SPORTSRADAR_API_KEY;
  const oddsKey = c.env.SPORTSRADAR_ODDS_KEY || c.env.SPORTSRADAR_API_KEY;

  if (!sport || !mainKey) {
    return {
      game,
      resolvedGameId,
      quotes: [],
      source: "none",
      fallbackReason: !mainKey ? "SPORTSRADAR_API_KEY missing" : "Unsupported sport for SportsRadar odds",
      fallbackType: classifyFallbackType(!mainKey ? "SPORTSRADAR_API_KEY missing" : "Unsupported sport for SportsRadar odds"),
    };
  }

  const canonicalGameId = String(game.game_id || resolvedGameId || gameId);
  const resolutionCandidates = new Set<string>([
    canonicalGameId,
    String(resolvedGameId || ""),
    String(gameId || ""),
    String(game?.external_id || ""),
    ...candidates,
  ].filter(Boolean));
  for (const id of Array.from(resolutionCandidates)) {
    const srEvent = toSportsRadarEventId(id);
    if (srEvent) resolutionCandidates.add(srEvent);
    const srUnderscore = toSportsRadarUnderscoreId(id);
    if (srUnderscore) resolutionCandidates.add(srUnderscore);
  }

  if (!forceRefresh) {
    for (const candidateId of resolutionCandidates) {
      const cacheHit = getCachedOdds(candidateId, scope);
      if (cacheHit && cacheHit.length > 0 && cacheHit.some((q) => q.source_provider === "sportsradar")) {
        return {
          game,
          resolvedGameId: candidateId,
          quotes: cacheHit,
          source: "sportsradar",
          fallbackReason: null,
          fallbackType: null,
        };
      }
    }
  }

  try {
    const oddsMapMemo = ((c as any).__sportsRadarOddsMapMemo ||= new Map<string, Promise<Map<string, any>>>());
    const oddsKeyCandidates = Array.from(new Set([oddsKey, mainKey].filter(Boolean))) as string[];
    const oddsMaps: Array<Map<string, any>> = [];
    for (const keyCandidate of oddsKeyCandidates) {
      const memoKey = `${sport}|${String(keyCandidate || "")}`;
      if (!oddsMapMemo.has(memoKey)) {
        oddsMapMemo.set(
          memoKey,
          withTimeout(
            fetchSportsRadarOdds(sport, mainKey, c.env.DB, undefined, keyCandidate),
            20000,
            new Map<string, any>()
          )
        );
      }
      const mapResult = await oddsMapMemo.get(memoKey);
      if (mapResult) oddsMaps.push(mapResult);
    }
    const oddsMap = oddsMaps.find((m) => m.size > 0) || new Map<string, any>();
    const keys = Array.from(new Set([
      ...buildOddsLookupKeys(game),
      ...Array.from(resolutionCandidates),
    ]));
    let matched = null as any;
    for (const key of keys) {
      matched = oddsMap.get(key);
      if (matched) break;
    }

    if (!matched) {
      // Fuzzy fallback for naming mismatch (e.g. city-only vs mascot names).
      const seen = new Set<string>();
      for (const odds of oddsMap.values()) {
        if (!odds?.gameId || seen.has(odds.gameId)) continue;
        seen.add(odds.gameId);
        const awayOk = teamsRoughlyMatch(odds.awayTeam, game.away_team_name);
        const homeOk = teamsRoughlyMatch(odds.homeTeam, game.home_team_name);
        if (awayOk && homeOk) {
          matched = odds;
          break;
        }
      }
    }

    if (matched) {
      const resolvedOddsGameId = String(matched.gameId || canonicalGameId);
      const quotes = toOddsQuotesFromSportsRadar(resolvedOddsGameId, matched, scope);
      setCachedOdds(resolvedOddsGameId, scope, quotes, game.status === "IN_PROGRESS");
      return {
        game,
        resolvedGameId: resolvedOddsGameId,
        quotes,
        source: "sportsradar",
        fallbackReason: null,
        fallbackType: null,
      };
    }

    const srEventCandidates = Array.from(
      new Set(
        Array.from(resolutionCandidates)
          .flatMap((id) => {
            const eventId = toSportsRadarEventId(id) || (id.startsWith("sr:sport_event:") ? id : null);
            const matchId = toSportsRadarMatchId(id) || (id.startsWith("sr:match:") ? id : null);
            return [eventId, matchId];
          })
          .filter((id): id is string => Boolean(id))
      )
    );
    for (const srEventId of srEventCandidates) {
      for (const keyCandidate of oddsKeyCandidates) {
        const directOdds = await fetchSportsRadarOddsForGame(srEventId, keyCandidate);
        if (directOdds) {
          const quotes = toOddsQuotesFromSportsRadar(srEventId, directOdds, scope);
          setCachedOdds(srEventId, scope, quotes, game.status === "IN_PROGRESS");
          return {
            game,
            resolvedGameId: srEventId,
            quotes,
            source: "sportsradar",
            fallbackReason: null,
            fallbackType: null,
          };
        }
      }
    }
  } catch (err) {
    console.log("[Odds API] SportsRadar odds fetch failed, using fallback:", err);
    return {
      game,
      resolvedGameId: canonicalGameId,
      quotes: [],
      source: "none",
      fallbackReason: `SportsRadar odds fetch failed: ${String(err)}`,
      fallbackType: "provider_error",
    };
  }

  return {
    game,
    resolvedGameId: canonicalGameId,
    quotes: [],
    source: "none",
    fallbackReason: "No SportsRadar odds match for game",
    fallbackType: "no_coverage",
  };
}

// ============ Public Odds Endpoints ============

/**
 * GET /api/odds/games/:gameId
 * Fetch odds for a specific game
 * 
 * Query params:
 * - books: Comma-separated list of bookmakers (default: all)
 * - markets: Comma-separated list of markets (default: SPREAD,TOTAL,MONEYLINE)
 * - scope: Data scope (DEMO or PROD, default: DEMO)
 * - refresh: Force cache refresh (true/false)
 */
oddsRouter.get("/games/:gameId", async (c) => {
  const gameId = c.req.param("gameId");
  const booksParam = c.req.query("books");
  const marketsParam = c.req.query("markets");
  const scope = (c.req.query("scope") || "PROD") as DataScope;
  const forceRefresh = c.req.query("refresh") === "true";
  const includeSplits = c.req.query("include_splits") === "true";

  const books = booksParam 
    ? booksParam.split(",").filter(b => BOOKMAKER_KEYS.includes(b as any))
    : ["sportsradar", "consensus"];
  
  const markets = marketsParam
    ? marketsParam.split(",")
    : ["SPREAD", "TOTAL", "MONEYLINE"];

  const resolved = await fetchRealOddsForGame(c, gameId, scope, forceRefresh);
  if (!resolved.game) {
    return c.json({
      error: "Game not found",
      fallback_reason: resolved.fallbackReason,
      fallback_type: resolved.fallbackType,
      source: resolved.source,
      game_id: gameId,
      sport: null,
      quotes: [],
      consensus: [],
      summary: null,
      first_half: null,
      opening: [],
      fromCache: false,
      timestamp: new Date().toISOString(),
      degraded: true,
    }, 200);
  }

  let quotes = resolved.quotes;
  if (books.length > 0) {
    quotes = quotes.filter((q) => books.includes(q.bookmaker_key as any) || q.bookmaker_key === "consensus");
  }
  // Filter by requested markets
  const filtered = quotes.filter(q => markets.includes(q.market_key));
  const consensus = calculateConsensus(filtered);
  const opening = demoOpeningStore.get(`${scope}:${gameId}`) || generateOpeningLines(filtered);
  const responseGameId = resolved.resolvedGameId || gameId;
  const summary = buildGameOddsSummary(responseGameId, filtered, opening);
  const firstHalf = extractFirstHalfSummary(filtered);
  const splitsResult = includeSplits
    ? await fetchTicketHandleSplitsForGame(c, responseGameId)
    : { source: "none" as const, splits: [] as TicketHandleSplit[], fallbackReason: null };
  
  return c.json({
    game_id: responseGameId,
    requested_game_id: gameId,
    sport: resolved.game.sport,
    quotes: filtered,
    consensus,
    summary,
    first_half: firstHalf,
    opening,
    source: resolved.source,
    fallback_reason: resolved.fallbackReason,
    fallback_type: resolved.fallbackType,
    ticket_handle: includeSplits ? {
      source: splitsResult.source,
      rows: splitsResult.splits,
      fallback_reason: splitsResult.fallbackReason,
    } : undefined,
    fromCache: false,
    degraded: Boolean(resolved.fallbackReason || filtered.length === 0),
    timestamp: new Date().toISOString(),
  }, { headers: oddsHeaders(resolved.game.status === "IN_PROGRESS") });
});

/**
 * GET /api/odds/summary/:gameId
 * Get odds summary (current vs opening) for a game - optimized for UI display
 */
oddsRouter.get("/summary/:gameId", async (c) => {
  const gameId = c.req.param("gameId");
  const scope = (c.req.query("scope") || "PROD") as DataScope;
  const forceRefresh = c.req.query("refresh") === "true";
  const includeSplits = c.req.query("include_splits") === "true";

  const resolved = await fetchRealOddsForGame(c, gameId, scope, forceRefresh);
  if (!resolved.game) {
    return c.json({
      error: "Game not found",
      source: resolved.source,
      fallback_reason: resolved.fallbackReason,
      fallback_type: resolved.fallbackType,
      game_id: gameId,
      data_scope: scope,
      spread: null,
      total: null,
      moneyline: null,
      opening_spread: null,
      opening_total: null,
      opening_home_ml: null,
      opening_away_ml: null,
      spread_moved: null,
      total_moved: null,
      favorite_flipped: null,
      books_count: 0,
      game: null,
      degraded: true,
      timestamp: new Date().toISOString(),
    }, 200);
  }

  const responseGameId = resolved.resolvedGameId || gameId;
  const opening = demoOpeningStore.get(`${scope}:${responseGameId}`) || generateOpeningLines(resolved.quotes);
  const summary = buildGameOddsSummary(responseGameId, resolved.quotes, opening);
  const firstHalf = extractFirstHalfSummary(resolved.quotes);
  const splitsResult = includeSplits
    ? await fetchTicketHandleSplitsForGame(c, responseGameId)
    : { source: "none" as const, splits: [] as TicketHandleSplit[], fallbackReason: null };
  
  return c.json({
    ...summary,
    first_half: firstHalf,
    requested_game_id: gameId,
    game: {
      game_id: responseGameId,
      sport: resolved.game.sport,
      status: resolved.game.status,
      home_team: resolved.game.home_team_code,
      away_team: resolved.game.away_team_code,
      start_time: resolved.game.start_time,
    },
    source: resolved.source,
    fallback_reason: resolved.fallbackReason,
    fallback_type: resolved.fallbackType,
    ticket_handle: includeSplits ? {
      source: splitsResult.source,
      rows: splitsResult.splits,
      fallback_reason: splitsResult.fallbackReason,
    } : undefined,
    degraded: Boolean(resolved.fallbackReason || resolved.quotes.length === 0),
    timestamp: new Date().toISOString(),
  }, { headers: oddsHeaders(resolved.game.status === "IN_PROGRESS") });
});

/**
 * GET /api/odds/slate
 * Fetch odds summaries for multiple games (slate view)
 * 
 * Query params:
 * - game_ids: Comma-separated list of game IDs
 * - sport: Filter by sport
 * - scope: Data scope (DEMO or PROD)
 */
oddsRouter.get("/slate", async (c) => {
  const gameIdsParam = c.req.query("game_ids");
  const sport = c.req.query("sport");
  const date = c.req.query("date") || getTodayEasternDateString();
  const scope = (c.req.query("scope") || "PROD") as DataScope;
  
  if (!gameIdsParam && !sport) {
    return c.json({ error: "Provide game_ids or sport parameter" }, 400);
  }
  
  let gameIds: string[] = [];
  let sportGames: any[] = [];
  let requestedSportKey: SportKey | null = null;
  let sportFetchError: string | null = null;
  
  if (gameIdsParam) {
    gameIds = gameIdsParam.split(",");
  } else if (sport) {
    requestedSportKey = toSportKey(sport);
    if (requestedSportKey) {
      const result = await withTimeout(
        fetchGamesWithFallback(requestedSportKey, { date }),
        12000,
        { data: [], fromCache: false, provider: "none", error: "games_fetch_timeout" } as any
      );
      sportGames = result.data.slice(0, 20);
      gameIds = sportGames.map((g) => g.game_id);
      sportFetchError = result.error ? String(result.error) : null;
    }
  }
  
  const summaries = [];
  let fastPathError: string | null = null;

  // Fast path: when slate is sport-scoped, resolve once against a single odds map
  // instead of re-fetching game detail per row.
  if (!gameIdsParam && requestedSportKey && sportGames.length > 0) {
    const apiKey = c.env.SPORTSRADAR_API_KEY;
    const oddsKey = c.env.SPORTSRADAR_ODDS_KEY || apiKey;
    if (apiKey) {
      try {
        const oddsKeyCandidates = Array.from(new Set([oddsKey, apiKey].filter(Boolean))) as string[];
        let oddsMap = new Map<string, any>();
        for (const keyCandidate of oddsKeyCandidates) {
          const candidateMap = await withTimeout(
            fetchSportsRadarOdds(requestedSportKey, apiKey, c.env.DB, date, keyCandidate),
            20000,
            new Map<string, any>()
          );
          if (candidateMap.size > 0) {
            oddsMap = candidateMap;
            break;
          }
        }
        for (const game of sportGames) {
          const lookupKeys = buildOddsLookupKeys(game);
          let matched = null as any;
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
                teamsRoughlyMatch(odds.awayTeam, game.away_team_name) &&
                teamsRoughlyMatch(odds.homeTeam, game.home_team_name)
              ) {
                matched = odds;
                break;
              }
            }
          }
          if (!matched) continue;

          const responseGameId = String(matched.gameId || game.game_id || "");
          if (!responseGameId) continue;
          const quotes = toOddsQuotesFromSportsRadar(responseGameId, matched, scope);
          const opening = demoOpeningStore.get(`${scope}:${responseGameId}`) || generateOpeningLines(quotes);
          const summary = buildGameOddsSummary(responseGameId, quotes, opening);
          const firstHalf = extractFirstHalfSummary(quotes);

          summaries.push({
            ...summary,
            first_half: firstHalf,
            source: "sportsradar",
            fallback_reason: null,
            fallback_type: null,
            game: {
              game_id: responseGameId,
              sport: game.sport,
              status: game.status,
              home_team_code: game.home_team_code,
              home_team_name: game.home_team_name,
              away_team_code: game.away_team_code,
              away_team_name: game.away_team_name,
              home_score: game.home_score,
              away_score: game.away_score,
              start_time: game.start_time,
            },
            degraded: false,
          });
        }
      } catch (err) {
        console.log("[Odds API] Sport-scoped slate fast-path failed, falling back:", err);
        fastPathError = String(err);
      }
    }
  }

  // For sport-scoped requests, return immediately (with degraded metadata if empty)
  // instead of running slow per-game re-resolution loops.
  if (!gameIdsParam && requestedSportKey) {
    const hasLive = summaries.some(s => s.game?.status === "IN_PROGRESS");
    return c.json({
      summaries,
      count: summaries.length,
      degraded: summaries.length === 0,
      fallback_type: summaries.length === 0 ? "provider_error" : null,
      fallback_reason: summaries.length === 0
        ? (fastPathError || sportFetchError || "No sport-scoped odds summaries available yet")
        : null,
      timestamp: new Date().toISOString(),
    }, { headers: oddsHeaders(hasLive) });
  }
  
  for (const gameId of gameIds.slice(0, 20)) { // Limit to 20 games
    const resolved = await fetchRealOddsForGame(c, gameId, scope, false);
    if (!resolved.game) continue;
    const responseGameId = resolved.resolvedGameId || gameId;
    const opening = demoOpeningStore.get(`${scope}:${responseGameId}`) || generateOpeningLines(resolved.quotes);
    const summary = buildGameOddsSummary(responseGameId, resolved.quotes, opening);
    const firstHalf = extractFirstHalfSummary(resolved.quotes);
    
    summaries.push({
      ...summary,
      first_half: firstHalf,
      source: resolved.source,
      fallback_reason: resolved.fallbackReason,
      fallback_type: resolved.fallbackType,
      degraded: Boolean(resolved.fallbackReason || resolved.quotes.length === 0),
      game: {
        game_id: responseGameId,
        sport: resolved.game.sport,
        status: resolved.game.status,
        home_team_code: resolved.game.home_team_code,
        home_team_name: resolved.game.home_team_name,
        away_team_code: resolved.game.away_team_code,
        away_team_name: resolved.game.away_team_name,
        home_score: resolved.game.home_score,
        away_score: resolved.game.away_score,
        start_time: resolved.game.start_time,
      },
    });
  }
  
  // Use short TTL if any games are live
  const hasLive = summaries.some(s => s.game?.status === "IN_PROGRESS");
  return c.json({
    summaries,
    count: summaries.length,
    timestamp: new Date().toISOString(),
  }, { headers: oddsHeaders(hasLive) });
});

/**
 * GET /api/odds/splits/:gameId
 * Fetch ticket/handle split rows for a game from external feed
 */
oddsRouter.get("/splits/:gameId", async (c) => {
  const gameId = c.req.param("gameId");
  const result = await fetchTicketHandleSplitsForGame(c, gameId);
  return c.json({
    game_id: gameId,
    source: result.source,
    rows: result.splits,
    fallback_reason: result.fallbackReason,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/odds/props/projections
 * Build internal player-prop projections from real props tables.
 *
 * Query params:
 * - sport: optional sport key (nba, nfl, ...)
 * - game_id: optional provider game id (e.g. sr_nba_...)
 * - limit: optional row limit (default 100, max 300)
 */
oddsRouter.get("/props/projections", authMiddleware, async (c) => {
  const db = c.env.DB;
  const sport = String(c.req.query("sport") || "").toUpperCase();
  const gameId = c.req.query("game_id");
  const limitRaw = Number(c.req.query("limit") || 100);
  const limit = Math.max(1, Math.min(300, Number.isFinite(limitRaw) ? limitRaw : 100));

  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (sport) {
    clauses.push(`UPPER(COALESCE(g.sport, 'UNKNOWN')) = ?`);
    params.push(sport);
  }
  if (gameId) {
    clauses.push(`COALESCE(g.provider_game_id, '') = ?`);
    params.push(gameId);
  }
  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const rowsResult = await db.prepare(`
    SELECT
      COALESCE(g.provider_game_id, printf('sdio_%d', p.game_id)) AS provider_game_id,
      COALESCE(g.sport, 'UNKNOWN') AS sport,
      p.game_id AS db_game_id,
      p.player_name,
      p.team,
      p.prop_type,
      p.line_value,
      p.open_line_value,
      COUNT(*) AS books_count,
      CURRENT_TIMESTAMP AS updated_at
    FROM sdio_props_current p
    LEFT JOIN sdio_games g ON g.id = p.game_id
    ${whereSql}
    GROUP BY p.game_id, p.player_name, p.team, p.prop_type, p.line_value, p.open_line_value, g.provider_game_id, g.sport
    ORDER BY ABS(COALESCE(p.line_value, 0) - COALESCE(p.open_line_value, p.line_value, 0)) DESC
    LIMIT ?
  `).bind(...params, limit).all();

  const rows = (rowsResult.results || []) as any[];
  if (rows.length === 0) {
    return c.json({
      source: "none",
      projections: [],
      fallback_reason: "No real props rows available for projection",
      timestamp: new Date().toISOString(),
    });
  }

  const projections: PropProjection[] = rows
    .map((row) => {
      const line = toFiniteOrNull(row.line_value);
      if (line === null) return null;
      const openLine = toFiniteOrNull(row.open_line_value);
      const movement = line - (openLine ?? line);
      const booksCount = Number(row.books_count || 1);
      const model = computeProjection(line, openLine, movement, booksCount);
      return {
        game_id: String(row.db_game_id),
        provider_game_id: row.provider_game_id ? String(row.provider_game_id) : null,
        sport: String(row.sport || "UNKNOWN"),
        player_name: String(row.player_name || ""),
        team: row.team ? String(row.team) : null,
        prop_type: String(row.prop_type || "OTHER"),
        line_value: line,
        open_line_value: openLine,
        movement: Math.round(movement * 100) / 100,
        books_count: booksCount,
        projected_value: model.projected,
        edge_vs_line: model.edge,
        confidence: model.confidence,
        source: "internal_projection_v1",
        updated_at: String(row.updated_at || new Date().toISOString()),
      } as PropProjection;
    })
    .filter((row): row is PropProjection => Boolean(row));

  return c.json({
    source: "internal_projection_v1",
    projections,
    count: projections.length,
    fallback_reason: null,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/odds/bookmakers
 * List available bookmakers
 */
oddsRouter.get("/bookmakers", async (c) => {
  const db = c.env.DB;
  try {
    // Try to get from database first
    const { results } = await db.prepare(`
      SELECT * FROM bookmakers WHERE is_active = 1 ORDER BY priority ASC
    `).all();
    if (results.length > 0) {
      return c.json({ bookmakers: results });
    }
  } catch (error) {
    console.warn("[odds] bookmakers lookup failed, using fallback list", error);
  }
  
  // Fallback to hardcoded list
  const bookmakers = [
    { key: "draftkings", name: "DraftKings", region: "us", priority: 1 },
    { key: "fanduel", name: "FanDuel", region: "us", priority: 2 },
    { key: "betmgm", name: "BetMGM", region: "us", priority: 3 },
    { key: "caesars", name: "Caesars", region: "us", priority: 4 },
    { key: "pointsbet", name: "PointsBet", region: "us", priority: 5 },
    { key: "espnbet", name: "ESPN BET", region: "us", priority: 6 },
    { key: "bet365", name: "bet365", region: "global", priority: 7 },
    { key: "consensus", name: "Consensus", region: "all", priority: 0 },
  ];
  
  return c.json({ bookmakers }, { 
    headers: cacheHeaders(CACHE_TTL.TEAM_LIST, { isPublic: true }) 
  });
});

/**
 * GET /api/odds/markets
 * List available market types
 */
oddsRouter.get("/markets", async (c) => {
  const db = c.env.DB;
  try {
    const { results } = await db.prepare(`
      SELECT * FROM odds_markets WHERE is_enabled = 1 ORDER BY sort_order ASC
    `).all();
    if (results.length > 0) {
      return c.json({ markets: results });
    }
  } catch (error) {
    console.warn("[odds] markets lookup failed, using fallback list", error);
  }
  
  // Fallback
  const markets = [
    { market_key: "SPREAD", display_name: "Spread", category: "MAIN", sort_order: 1 },
    { market_key: "TOTAL", display_name: "Total", category: "MAIN", sort_order: 2 },
    { market_key: "MONEYLINE", display_name: "Moneyline", category: "MAIN", sort_order: 3 },
    { market_key: "SPREAD_1H", display_name: "1H Spread", category: "HALF", sort_order: 10 },
    { market_key: "TOTAL_1H", display_name: "1H Total", category: "HALF", sort_order: 11 },
    { market_key: "ML_1H", display_name: "1H ML", category: "HALF", sort_order: 12 },
  ];
  
  return c.json({ markets }, { 
    headers: cacheHeaders(CACHE_TTL.TEAM_LIST, { isPublic: true }) 
  });
});

// ============ Demo Simulation Endpoints ============

/**
 * POST /api/odds/simulate/spread-move
 * Simulate a spread movement
 * 
 * Body:
 * - game_id: string
 * - delta: number (positive = home spreads out, negative = shrinks)
 */
oddsRouter.post("/simulate/spread-move", authMiddleware, async (c) => {
  const body = await c.req.json();
  const { game_id, delta } = body;
  const scope: DataScope = "DEMO";
  const db = c.env.DB;
  
  if (!game_id || typeof delta !== "number") {
    return c.json({ error: "game_id and delta (number) required" }, 400);
  }
  
  // Get game for sport context
  const { game } = await fetchGame(game_id);
  if (!game) {
    return c.json({ error: "Game not found" }, 404);
  }
  
  const quotes = demoOddsStore.get(`${scope}:${game_id}`);
  if (!quotes) {
    return c.json({ error: "No odds found for this game. Fetch odds first." }, 404);
  }
  
  // Keep previous quotes for threshold comparison
  const previousQuotes = [...quotes];
  
  const updated = simulateSpreadMove(quotes, game_id, delta);
  demoOddsStore.set(`${scope}:${game_id}`, updated);
  
  // Clear cache to force refresh
  clearOddsCache();
  
  // Process movements through threshold engine
  const { events: thresholdEvents } = await processOddsMovements(
    db,
    game_id,
    game.sport,
    updated,
    previousQuotes,
    { dataScope: scope, isLive: game.status === "IN_PROGRESS" }
  );
  
  const opening = demoOpeningStore.get(`${scope}:${game_id}`);
  const summary = buildGameOddsSummary(game_id, updated, opening);
  
  return c.json({
    success: true,
    message: `Spread moved by ${delta > 0 ? "+" : ""}${delta}`,
    summary,
    thresholdEvents: thresholdEvents.map(e => ({
      headline: e.headline,
      severity: e.severity,
      type: e.event_type,
    })),
  });
});

/**
 * POST /api/odds/simulate/total-move
 * Simulate a total movement
 * 
 * Body:
 * - game_id: string
 * - delta: number (positive = total goes up, negative = goes down)
 */
oddsRouter.post("/simulate/total-move", authMiddleware, async (c) => {
  const body = await c.req.json();
  const { game_id, delta } = body;
  const scope: DataScope = "DEMO";
  const db = c.env.DB;
  
  if (!game_id || typeof delta !== "number") {
    return c.json({ error: "game_id and delta (number) required" }, 400);
  }
  
  const { game } = await fetchGame(game_id);
  if (!game) {
    return c.json({ error: "Game not found" }, 404);
  }
  
  const quotes = demoOddsStore.get(`${scope}:${game_id}`);
  if (!quotes) {
    return c.json({ error: "No odds found for this game. Fetch odds first." }, 404);
  }
  
  const previousQuotes = [...quotes];
  
  const updated = simulateTotalMove(quotes, game_id, delta);
  demoOddsStore.set(`${scope}:${game_id}`, updated);
  
  clearOddsCache();
  
  // Process movements through threshold engine
  const { events: thresholdEvents } = await processOddsMovements(
    db,
    game_id,
    game.sport,
    updated,
    previousQuotes,
    { dataScope: scope, isLive: game.status === "IN_PROGRESS" }
  );
  
  const opening = demoOpeningStore.get(`${scope}:${game_id}`);
  const summary = buildGameOddsSummary(game_id, updated, opening);
  
  return c.json({
    success: true,
    message: `Total moved by ${delta > 0 ? "+" : ""}${delta}`,
    summary,
    thresholdEvents: thresholdEvents.map(e => ({
      headline: e.headline,
      severity: e.severity,
      type: e.event_type,
    })),
  });
});

/**
 * POST /api/odds/simulate/favorite-flip
 * Simulate a favorite flip (underdog becomes favorite)
 * 
 * Body:
 * - game_id: string
 */
oddsRouter.post("/simulate/favorite-flip", authMiddleware, async (c) => {
  const body = await c.req.json();
  const { game_id } = body;
  const scope: DataScope = "DEMO";
  const db = c.env.DB;
  
  if (!game_id) {
    return c.json({ error: "game_id required" }, 400);
  }
  
  const { game } = await fetchGame(game_id);
  if (!game) {
    return c.json({ error: "Game not found" }, 404);
  }
  
  const quotes = demoOddsStore.get(`${scope}:${game_id}`);
  if (!quotes) {
    return c.json({ error: "No odds found for this game. Fetch odds first." }, 404);
  }
  
  const previousQuotes = [...quotes];
  
  const updated = simulateFavoriteFlip(quotes, game_id);
  demoOddsStore.set(`${scope}:${game_id}`, updated);
  
  clearOddsCache();
  
  // Process movements through threshold engine
  const { events: thresholdEvents } = await processOddsMovements(
    db,
    game_id,
    game.sport,
    updated,
    previousQuotes,
    { dataScope: scope, isLive: game.status === "IN_PROGRESS" }
  );
  
  const opening = demoOpeningStore.get(`${scope}:${game_id}`);
  const summary = buildGameOddsSummary(game_id, updated, opening);
  
  return c.json({
    success: true,
    message: "Favorite flipped!",
    summary,
    thresholdEvents: thresholdEvents.map(e => ({
      headline: e.headline,
      severity: e.severity,
      type: e.event_type,
    })),
  });
});

// ============ Snapshot History Endpoints ============

/**
 * GET /api/odds/book-history/:gameId
 * Fetch per-book line history for comparison charts
 * 
 * Query params:
 * - market: Market type (SPREAD, TOTAL, MONEYLINE)
 * - outcome: Outcome key (HOME, AWAY, OVER, UNDER)
 * - books: Comma-separated list of books to include
 * - scope: Data scope (DEMO or PROD)
 */
oddsRouter.get("/book-history/:gameId", async (c) => {
  const gameId = c.req.param("gameId");
  const market = c.req.query("market") || "SPREAD";
  const outcome = c.req.query("outcome") || (market === "TOTAL" ? "OVER" : "HOME");
  const booksParam = c.req.query("books");
  
  const allBooks = ["draftkings", "fanduel", "betmgm", "caesars", "pointsbet", "espnbet"];
  const requestedBooks = booksParam ? booksParam.split(",") : allBooks;
  
  // Generate demo history per book
  const bookHistory = generatePerBookDemoHistory(gameId, market, outcome, requestedBooks);
  
  return c.json(bookHistory);
});

/**
 * Generate simulated line history for multiple books
 */
function generatePerBookDemoHistory(
  gameId: string,
  market: string,
  outcome: string,
  books: string[]
): {
  game_id: string;
  market_key: string;
  outcome_key: string;
  books: {
    bookmaker_key: string;
    name: string;
    snapshots: { timestamp: string; line_value: number | null; price_american: number | null }[];
    current_line: number | null;
    current_price: number | null;
    opening_line: number | null;
    movement: number | null;
  }[];
  timestamps: string[];
} {
  const now = Date.now();
  const hoursBack = 48;
  const intervalHours = 2;
  
  // Seeded random based on game ID
  const hash = gameId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const random = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };
  
  // Book-specific variance from consensus
  const bookVariance: Record<string, { lineOffset: number; priceOffset: number; volatility: number }> = {
    draftkings: { lineOffset: 0, priceOffset: 0, volatility: 1.0 },
    fanduel: { lineOffset: 0, priceOffset: 5, volatility: 0.9 },
    betmgm: { lineOffset: 0.5, priceOffset: -5, volatility: 1.1 },
    caesars: { lineOffset: 0, priceOffset: 10, volatility: 0.8 },
    pointsbet: { lineOffset: -0.5, priceOffset: 0, volatility: 1.3 },
    espnbet: { lineOffset: 0, priceOffset: -10, volatility: 0.95 },
    consensus: { lineOffset: 0, priceOffset: 0, volatility: 1.0 },
  };
  
  const bookNames: Record<string, string> = {
    draftkings: "DraftKings",
    fanduel: "FanDuel",
    betmgm: "BetMGM",
    caesars: "Caesars",
    pointsbet: "PointsBet",
    espnbet: "ESPN BET",
    consensus: "Consensus",
  };
  
  // Base starting values
  const isHomeUnderdog = hash % 2 === 0;
  const sideMultiplier = outcome === "AWAY" || outcome === "UNDER" ? -1 : 1;
  
  let baseSpread = isHomeUnderdog ? 3.5 + (hash % 6) : -(3.5 + (hash % 6));
  if (outcome === "AWAY") baseSpread = -baseSpread;
  
  const baseTotal = 44.5 + ((hash % 20) - 10);
  const baseML = baseSpread > 0 ? 130 + (hash % 40) : -(140 + (hash % 40));
  
  // Generate timestamps
  const timestamps: string[] = [];
  for (let i = hoursBack; i >= 0; i -= intervalHours) {
    timestamps.push(new Date(now - i * 60 * 60 * 1000).toISOString());
  }
  
  // Generate history for each book
  const bookResults = [];
  
  for (const bookKey of books) {
    const variance = bookVariance[bookKey] || bookVariance.consensus;
    const snapshots: { timestamp: string; line_value: number | null; price_american: number | null }[] = [];
    
    // Track line evolution for this book
    let currentLine = market === "SPREAD" ? baseSpread + variance.lineOffset * sideMultiplier
                    : market === "TOTAL" ? baseTotal
                    : null;
    let currentPrice = market === "MONEYLINE" ? baseML + variance.priceOffset
                     : -110 + variance.priceOffset;
    
    const openingLine = currentLine;
    const openingPrice = currentPrice;
    
    for (let i = 0; i < timestamps.length; i++) {
      const seed = hash + i * 100 + bookKey.charCodeAt(0);
      
      // Apply some movement (varying by book volatility)
      if (i > 0) {
        const moveChance = 0.4 * variance.volatility;
        
        if (random(seed) < moveChance) {
          if (market === "SPREAD") {
            const delta = (random(seed + 1) - 0.5) * 1.5 * variance.volatility;
            currentLine = currentLine !== null 
              ? Math.round((currentLine + delta) * 2) / 2 
              : null;
          } else if (market === "TOTAL") {
            const delta = (random(seed + 1) - 0.5) * 2 * variance.volatility;
            currentLine = currentLine !== null 
              ? Math.round((currentLine + delta) * 2) / 2 
              : null;
          } else if (market === "MONEYLINE") {
            const delta = Math.round((random(seed + 1) - 0.5) * 30 * variance.volatility);
            currentPrice = currentPrice + delta;
          }
        }
        
        // Occasional price shift
        if (random(seed + 50) < 0.3 && market !== "MONEYLINE") {
          const priceDelta = Math.round((random(seed + 51) - 0.5) * 20);
          currentPrice = currentPrice + priceDelta;
        }
      }
      
      snapshots.push({
        timestamp: timestamps[i],
        line_value: currentLine,
        price_american: Math.round(currentPrice),
      });
    }
    
    // Calculate movement from open to current
    const lastSnap = snapshots[snapshots.length - 1];
    const movement = market === "MONEYLINE"
      ? (lastSnap.price_american ?? 0) - (openingPrice ?? 0)
      : (lastSnap.line_value ?? 0) - (openingLine ?? 0);
    
    bookResults.push({
      bookmaker_key: bookKey,
      name: bookNames[bookKey] || bookKey,
      snapshots,
      current_line: lastSnap.line_value,
      current_price: lastSnap.price_american,
      opening_line: market === "MONEYLINE" ? null : openingLine,
      movement: Math.round(movement * 10) / 10,
    });
  }
  
  return {
    game_id: gameId,
    market_key: market,
    outcome_key: outcome,
    books: bookResults,
    timestamps,
  };
}

/**
 * GET /api/odds/snapshots/:gameId
 * Fetch historical snapshots for line movement charts
 * 
 * Query params:
 * - market: Filter by market (SPREAD, TOTAL, MONEYLINE)
 * - book: Filter by bookmaker
 * - scope: Data scope (DEMO or PROD)
 */
oddsRouter.get("/snapshots/:gameId", async (c) => {
  const gameId = c.req.param("gameId");
  const market = c.req.query("market") as 'SPREAD' | 'TOTAL' | 'MONEYLINE' | undefined;
  const bookmaker = c.req.query("book");
  const scope = (c.req.query("scope") || "DEMO") as DataScope;
  const db = c.env.DB;
  
  try {
    // Try to get real line movement data first (for PROD scope)
    if (scope === "PROD" && market) {
      const outcomes: ('HOME' | 'AWAY' | 'OVER' | 'UNDER')[] =
        market === 'TOTAL' ? ['OVER', 'UNDER'] : ['HOME', 'AWAY'];

      const series = [];
      for (const outcome of outcomes) {
        const movement = await getLineMovement(db, gameId, market, outcome);
        if (movement && movement.snapshots.length > 0) {
          series.push({
            market_key: market,
            outcome_key: outcome,
            points: movement.snapshots,
            opening_line: movement.openingLine,
            current_line: movement.currentLine,
            movement: movement.movement,
            direction: movement.direction,
          });
        }
      }

      if (series.length > 0) {
        return c.json({
          game_id: gameId,
          series,
          total_snapshots: series.reduce((sum, s) => sum + s.points.length, 0),
          source: 'sportsradar',
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Fallback: Try database snapshots
    let snapshots = await fetchSnapshotsForGame(db, gameId, {
      scope,
      market: market || undefined,
      bookmaker: bookmaker || undefined,
      limit: 100,
    });

    // If no snapshots exist (demo mode), generate simulated history
    if (snapshots.length === 0) {
      snapshots = generateDemoSnapshotHistory(gameId, scope, market);
    }

    // Group by market and outcome for chart-friendly structure
    const grouped: Record<string, {
      market_key: string;
      outcome_key: string;
      points: { timestamp: string; line: number | null; price: number | null }[];
    }> = {};

    for (const snap of snapshots) {
      const key = `${snap.market_key}:${snap.outcome_key}`;
      if (!grouped[key]) {
        grouped[key] = {
          market_key: snap.market_key,
          outcome_key: snap.outcome_key,
          points: [],
        };
      }
      grouped[key].points.push({
        timestamp: snap.captured_at,
        line: snap.line_value,
        price: snap.price_american,
      });
    }

    return c.json({
      game_id: gameId,
      series: Object.values(grouped),
      total_snapshots: snapshots.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("[odds] snapshots lookup failed, using generated history", error);
    const snapshots = generateDemoSnapshotHistory(gameId, scope, market);
    const grouped: Record<string, {
      market_key: string;
      outcome_key: string;
      points: { timestamp: string; line: number | null; price: number | null }[];
    }> = {};
    for (const snap of snapshots) {
      const key = `${snap.market_key}:${snap.outcome_key}`;
      if (!grouped[key]) {
        grouped[key] = {
          market_key: snap.market_key,
          outcome_key: snap.outcome_key,
          points: [],
        };
      }
      grouped[key].points.push({
        timestamp: snap.captured_at,
        line: snap.line_value,
        price: snap.price_american,
      });
    }
    return c.json({
      game_id: gameId,
      series: Object.values(grouped),
      total_snapshots: snapshots.length,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Generate simulated snapshot history for demo mode
 */
function generateDemoSnapshotHistory(
  gameId: string,
  scope: DataScope,
  marketFilter?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapshots: any[] = [];
  const now = Date.now();
  const hoursBack = 48; // 48 hours of history
  
  // Seeded random based on game ID
  const hash = gameId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const random = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };
  
  // Starting values
  const isHomeUnderdog = hash % 2 === 0;
  let spreadLine = isHomeUnderdog ? 3.5 + (hash % 6) : -(3.5 + (hash % 6));
  let totalLine = 44.5 + ((hash % 20) - 10);
  let homeML = spreadLine > 0 ? 130 + (hash % 40) : -(140 + (hash % 40));
  let awayML = spreadLine > 0 ? -(160 + (hash % 40)) : 120 + (hash % 40);
  
  const markets = marketFilter ? [marketFilter] : ["SPREAD", "TOTAL", "MONEYLINE"];
  
  for (let i = hoursBack; i >= 0; i -= 2) {
    const timestamp = new Date(now - i * 60 * 60 * 1000).toISOString();
    const seed = hash + i;
    
    // Add some movement each interval
    if (i < hoursBack) {
      const spreadMove = (random(seed) - 0.5) * 1.5;
      const totalMove = (random(seed + 1) - 0.5) * 2;
      const mlMove = Math.round((random(seed + 2) - 0.5) * 20);
      
      // Only move sometimes
      if (random(seed + 10) > 0.6) {
        spreadLine = Math.round((spreadLine + spreadMove) * 2) / 2;
      }
      if (random(seed + 11) > 0.6) {
        totalLine = Math.round((totalLine + totalMove) * 2) / 2;
      }
      if (random(seed + 12) > 0.5) {
        homeML += mlMove;
        awayML -= mlMove;
      }
    }
    
    if (markets.includes("SPREAD")) {
      snapshots.push({
        game_id: gameId,
        data_scope: scope,
        bookmaker_key: "consensus",
        market_key: "SPREAD",
        outcome_key: "HOME",
        line_value: spreadLine,
        price_american: -110,
        captured_at: timestamp,
      });
      snapshots.push({
        game_id: gameId,
        data_scope: scope,
        bookmaker_key: "consensus",
        market_key: "SPREAD",
        outcome_key: "AWAY",
        line_value: -spreadLine,
        price_american: -110,
        captured_at: timestamp,
      });
    }
    
    if (markets.includes("TOTAL")) {
      snapshots.push({
        game_id: gameId,
        data_scope: scope,
        bookmaker_key: "consensus",
        market_key: "TOTAL",
        outcome_key: "OVER",
        line_value: totalLine,
        price_american: -110,
        captured_at: timestamp,
      });
      snapshots.push({
        game_id: gameId,
        data_scope: scope,
        bookmaker_key: "consensus",
        market_key: "TOTAL",
        outcome_key: "UNDER",
        line_value: totalLine,
        price_american: -110,
        captured_at: timestamp,
      });
    }
    
    if (markets.includes("MONEYLINE")) {
      snapshots.push({
        game_id: gameId,
        data_scope: scope,
        bookmaker_key: "consensus",
        market_key: "MONEYLINE",
        outcome_key: "HOME",
        line_value: null,
        price_american: homeML,
        captured_at: timestamp,
      });
      snapshots.push({
        game_id: gameId,
        data_scope: scope,
        bookmaker_key: "consensus",
        market_key: "MONEYLINE",
        outcome_key: "AWAY",
        line_value: null,
        price_american: awayML,
        captured_at: timestamp,
      });
    }
  }
  
  return snapshots;
}

// ============ Cache Management ============

/**
 * GET /api/odds/cache-stats
 * Get odds cache statistics
 */
oddsRouter.get("/cache-stats", authMiddleware, async (c) => {
  return c.json({
    oddsStoreSize: demoOddsStore.size,
    openingStoreSize: demoOpeningStore.size,
    gameIds: Array.from(demoOddsStore.keys()).slice(0, 20),
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/odds/clear-cache
 * Clear all odds caches
 */
oddsRouter.post("/clear-cache", authMiddleware, async (c) => {
  demoOddsStore.clear();
  demoOpeningStore.clear();
  clearOddsCache();
  
  return c.json({
    success: true,
    message: "Odds cache cleared",
  });
});

export { oddsRouter };

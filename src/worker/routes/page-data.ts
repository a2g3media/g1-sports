import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import { getCachedData, makeCacheKey, setCachedData } from "../services/apiCacheService";
import { pageDataGamesCacheKey, pageDataGenericKey } from "../services/pageData/cacheKeys";
import { getFreshnessPolicy } from "../services/pageData/freshnessPolicy";
import { runPageDataWarmCycle } from "../services/pageData/precompute";
import {
  getRolloutMetricsSnapshot,
  incCounter,
  recordRouteRenderEvent,
} from "../services/pageData/rolloutMetrics";

type Env = {
  DB: D1Database;
};

const pageDataRouter = new Hono<{ Bindings: Env }>();

type PageDataGamesPayload = {
  route: "games";
  generatedAt: string;
  freshness: {
    class: "medium";
    cacheTtlMs: number;
    staleWindowMs: number;
    source: "l1" | "l2" | "cold";
    stale: boolean;
  };
  degraded: boolean;
  meta: {
    date: string;
    sport: string;
    tab: string;
    partialReason: string | null;
  };
  games: any[];
  oddsSummaryByGame: Record<string, any>;
};

type PageDataSportHubPayload = {
  route: "sport-hub";
  generatedAt: string;
  freshness: {
    class: "medium";
    cacheTtlMs: number;
    staleWindowMs: number;
    source: "l1" | "l2" | "cold";
    stale: boolean;
  };
  degraded: boolean;
  meta: {
    sport: string;
    date: string;
    partialReason: string | null;
  };
  games: any[];
};

type PageDataGameDetailPayload = {
  route: "game-detail";
  generatedAt: string;
  freshness: {
    class: "live" | "finalizing";
    cacheTtlMs: number;
    staleWindowMs: number;
    source: "l1" | "l2" | "cold";
    stale: boolean;
  };
  degraded: boolean;
  meta: {
    gameId: string;
    sport: string | null;
    partialReason: string | null;
  };
  game: any | null;
  oddsSummary: any | null;
};

type PageDataOddsPayload = {
  route: "odds";
  generatedAt: string;
  freshness: {
    class: "medium";
    cacheTtlMs: number;
    staleWindowMs: number;
    source: "l1" | "l2" | "cold";
    stale: boolean;
  };
  degraded: boolean;
  meta: {
    date: string;
    sport: string;
    partialReason: string | null;
  };
  games: any[];
  oddsSummaryByGame: Record<string, any>;
};

type PageDataTeamProfilePayload = {
  route: "team-profile";
  generatedAt: string;
  freshness: {
    class: "medium";
    cacheTtlMs: number;
    staleWindowMs: number;
    source: "l1" | "l2" | "cold";
    stale: boolean;
  };
  degraded: boolean;
  meta: {
    sport: string;
    teamId: string;
    partialReason: string | null;
  };
  data: {
    profileJson: any;
    scheduleJson: any;
    statsJson: any;
    standingsJson: any;
    gamesJson: any;
    injuriesJson: any;
    splitsJson: any;
  };
};

type PageDataPlayerProfilePayload = {
  route: "player-profile";
  generatedAt: string;
  freshness: {
    class: "medium";
    cacheTtlMs: number;
    staleWindowMs: number;
    source: "l1" | "l2" | "cold";
    stale: boolean;
  };
  degraded: boolean;
  meta: {
    sport: string;
    playerName: string;
    partialReason: string | null;
  };
  data: {
    profile: any | null;
    canonicalTeamRouteId: string | null;
  };
};

type PageDataLeagueOverviewPayload = {
  route: "league-overview";
  generatedAt: string;
  freshness: {
    class: "medium";
    cacheTtlMs: number;
    staleWindowMs: number;
    source: "l1" | "l2" | "cold";
    stale: boolean;
  };
  degraded: boolean;
  meta: {
    leagueId: string;
    partialReason: string | null;
  };
  data: {
    league: any | null;
    standings: any[];
    availablePeriods: string[];
    currentPeriod: string;
    gamesWithPicks: any[];
    survivorMembers: any[];
    activeTab: "live" | "spreadsheet" | "standings" | "survivor";
  };
};

type PageDataLeagueGameDayPayload = {
  route: "league-gameday";
  generatedAt: string;
  freshness: {
    class: "medium";
    cacheTtlMs: number;
    staleWindowMs: number;
    source: "l1" | "l2" | "cold";
    stale: boolean;
  };
  degraded: boolean;
  meta: {
    leagueId: string;
    partialReason: string | null;
  };
  data: {
    league: any | null;
    currentPeriod: string;
    events: any[];
    picks: any[];
    standings: any[];
  };
};

type PageDataLeaguePicksPayload = {
  route: "league-picks";
  generatedAt: string;
  freshness: {
    class: "medium";
    cacheTtlMs: number;
    staleWindowMs: number;
    source: "l1" | "l2" | "cold";
    stale: boolean;
  };
  degraded: boolean;
  meta: {
    leagueId: string;
    partialReason: string | null;
  };
  data: {
    league: any | null;
    availablePeriods: string[];
    currentPeriod: string;
    events: any[];
    picks: any[];
    paymentEligibility: any | null;
  };
};

type L1Entry<T> = {
  expiresAt: number;
  staleExpiresAt: number;
  payload: T;
};

const pageDataGamesL1 = new Map<string, L1Entry<PageDataGamesPayload>>();
const pageDataSportHubL1 = new Map<string, L1Entry<PageDataSportHubPayload>>();
const pageDataGameDetailL1 = new Map<string, L1Entry<PageDataGameDetailPayload>>();
const pageDataOddsL1 = new Map<string, L1Entry<PageDataOddsPayload>>();
const pageDataTeamProfileL1 = new Map<string, L1Entry<PageDataTeamProfilePayload>>();
const pageDataPlayerProfileL1 = new Map<string, L1Entry<PageDataPlayerProfilePayload>>();
const pageDataLeagueOverviewL1 = new Map<string, L1Entry<PageDataLeagueOverviewPayload>>();
const pageDataLeagueGameDayL1 = new Map<string, L1Entry<PageDataLeagueGameDayPayload>>();
const pageDataLeaguePicksL1 = new Map<string, L1Entry<PageDataLeaguePicksPayload>>();

const now = () => Date.now();

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    promise
      .then((value) => resolve(value))
      .catch(() => resolve(fallback))
      .finally(() => clearTimeout(timer));
  });
}

function readL1Fresh(cacheKey: string): PageDataGamesPayload | null {
  const hit = pageDataGamesL1.get(cacheKey);
  if (!hit) return null;
  if (hit.expiresAt > now()) return hit.payload;
  return null;
}

function readL1Stale(cacheKey: string): PageDataGamesPayload | null {
  const hit = pageDataGamesL1.get(cacheKey);
  if (!hit) return null;
  if (hit.staleExpiresAt > now()) return hit.payload;
  pageDataGamesL1.delete(cacheKey);
  return null;
}

function writeL1(cacheKey: string, payload: PageDataGamesPayload, ttlMs: number, staleWindowMs: number): void {
  pageDataGamesL1.set(cacheKey, {
    expiresAt: now() + ttlMs,
    staleExpiresAt: now() + ttlMs + staleWindowMs,
    payload,
  });
}

function readL1FreshGeneric<T>(cacheStore: Map<string, L1Entry<T>>, cacheKey: string): T | null {
  const hit = cacheStore.get(cacheKey);
  if (!hit) return null;
  if (hit.expiresAt > now()) return hit.payload;
  return null;
}

function readL1StaleGeneric<T>(cacheStore: Map<string, L1Entry<T>>, cacheKey: string): T | null {
  const hit = cacheStore.get(cacheKey);
  if (!hit) return null;
  if (hit.staleExpiresAt > now()) return hit.payload;
  cacheStore.delete(cacheKey);
  return null;
}

function writeL1Generic<T>(
  cacheStore: Map<string, L1Entry<T>>,
  cacheKey: string,
  payload: T,
  ttlMs: number,
  staleWindowMs: number
): void {
  cacheStore.set(cacheKey, {
    expiresAt: now() + ttlMs,
    staleExpiresAt: now() + ttlMs + staleWindowMs,
    payload,
  });
}

function normalizeSport(sportRaw: string): string {
  const s = String(sportRaw || "").trim().toUpperCase();
  return s || "ALL";
}

function normalizeTokenForCache(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

function extractGamesArray(body: any): any[] {
  if (Array.isArray(body?.games)) return body.games;
  if (Array.isArray(body?.data?.games)) return body.data.games;
  if (Array.isArray(body)) return body;
  return [];
}

function normalizeGameId(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function mergeGamesById(rows: any[]): any[] {
  const byId = new Map<string, any>();
  for (const row of rows) {
    const id = normalizeGameId(row?.game_id || row?.id);
    if (!id) continue;
    byId.set(id, row);
  }
  return Array.from(byId.values());
}

function filterGamesBySport(rows: any[], sport: string): any[] {
  const target = String(sport || "").trim().toUpperCase();
  if (!target || target === "ALL") return rows;
  return rows.filter((row) => String(row?.sport || "").trim().toUpperCase() === target);
}

function getGamesListPersistentKeys(date: string, sport: string): { primary: string; backup: string } {
  const normalizedSport = String(sport || "").trim().toLowerCase();
  const sportKey = !normalizedSport || normalizedSport === "all" ? "all" : normalizedSport;
  const scoreboardKey = `${sportKey}|all|${date}|0`;
  return {
    primary: `games_list_v2:${scoreboardKey}`,
    backup: `games_list_v2_backup:${scoreboardKey}`,
  };
}

function chunkArray<T>(rows: T[], size: number): T[][]
{
  if (size <= 0) return [rows];
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function uniqueGameIds(rows: any[], limit = 90): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of rows) {
    const id = String(row?.game_id || row?.id || "").trim().toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

function getOddsSlatePersistentKeys(scope: string, date: string, gameIdsParam: string): { primary: string; backup: string } {
  const key = `${scope}|${""}|${date}|${gameIdsParam}`;
  return {
    primary: `odds_slate_v2:${key}`,
    backup: `odds_slate_v2_backup:${key}`,
  };
}

function getOddsSummaryPersistentKeys(scope: string, gameId: string): { primary: string; backup: string } {
  const key = `${scope}:${gameId}:0`;
  return {
    primary: `odds_summary_v2:${key}`,
    backup: `odds_summary_v2_backup:${key}`,
  };
}

function extractSlateSummaries(body: any): any[] {
  if (Array.isArray(body?.summaries)) return body.summaries;
  if (Array.isArray(body?.data?.summaries)) return body.data.summaries;
  return [];
}

function mapOddsSummary(oddsSummaryByGame: Record<string, any>, summary: any): void {
  const gameId = String(summary?.game?.game_id || summary?.requested_game_id || summary?.game_id || "").trim().toLowerCase();
  if (!gameId) return;
  oddsSummaryByGame[gameId] = summary;
}

function buildSyntheticSummaryFromGame(game: any): any | null {
  const gameId = String(game?.game_id || game?.id || "").trim();
  if (!gameId) return null;
  const toFinite = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const spread = toFinite(game?.spread ?? game?.spread_home ?? game?.spreadHome);
  const total = toFinite(game?.overUnder ?? game?.total ?? game?.over_under);
  const mlHome = toFinite(game?.moneylineHome ?? game?.moneyline_home ?? game?.ml_home);
  const mlAway = toFinite(game?.moneylineAway ?? game?.moneyline_away ?? game?.ml_away);
  if (spread === null && total === null && mlHome === null && mlAway === null) return null;
  return {
    requested_game_id: gameId,
    game: {
      game_id: gameId,
      sport: game?.sport,
      status: game?.status,
      home_team_code: game?.home_team_code,
      away_team_code: game?.away_team_code,
      start_time: game?.start_time,
    },
    spread: spread === null ? null : { line: spread },
    total: total === null ? null : { line: total },
    moneyline: mlHome === null && mlAway === null ? null : { home_price: mlHome, away_price: mlAway },
    source: "games_snapshot_fallback",
    fallback_type: "cache_backfill",
    fallback_reason: "Used game snapshot odds fields while slate cache refresh catches up",
    degraded: false,
    timestamp: new Date().toISOString(),
  };
}

async function readOddsSummariesFromCache(db: D1Database, params: {
  date: string;
  gameIds: string[];
}): Promise<{ oddsSummaryByGame: Record<string, any>; source: string }> {
  const scope = "PROD";
  const oddsSummaryByGame: Record<string, any> = {};
  let slatePrimaryHits = 0;
  let slateBackupHits = 0;
  let summaryPrimaryHits = 0;
  let summaryBackupHits = 0;

  const chunks = chunkArray(params.gameIds, 30);
  for (const ids of chunks) {
    const gameIdsParam = ids.join(",");
    const keys = getOddsSlatePersistentKeys(scope, params.date, gameIdsParam);
    try {
      const primary = await getCachedData<any>(db, keys.primary);
      const summaries = extractSlateSummaries(primary);
      if (summaries.length > 0) {
        slatePrimaryHits += summaries.length;
        for (const s of summaries) mapOddsSummary(oddsSummaryByGame, s);
      }
    } catch {
      // Non-fatal.
    }
    if (Object.keys(oddsSummaryByGame).length >= params.gameIds.length) break;
    try {
      const backup = await getCachedData<any>(db, keys.backup);
      const summaries = extractSlateSummaries(backup);
      if (summaries.length > 0) {
        slateBackupHits += summaries.length;
        for (const s of summaries) mapOddsSummary(oddsSummaryByGame, s);
      }
    } catch {
      // Non-fatal.
    }
    if (Object.keys(oddsSummaryByGame).length >= params.gameIds.length) break;
  }

  // Fallback: reuse most recent cached dated slates for this date regardless of exact game_ids ordering.
  if (Object.keys(oddsSummaryByGame).length === 0 && params.gameIds.length > 0) {
    const wanted = new Set(params.gameIds.map((id) => String(id || "").trim().toLowerCase()).filter(Boolean));
    try {
      const prefix = `odds_slate_v2:${scope}||${params.date}|%`;
      const fallbackPrefix = `odds_slate_v2_backup:${scope}||${params.date}|%`;
      const sql = `
        SELECT cache_key, data_json
        FROM api_cache
        WHERE cache_key LIKE ? OR cache_key LIKE ?
        ORDER BY cached_at DESC
        LIMIT 8
      `;
      const { results } = await db.prepare(sql).bind(prefix, fallbackPrefix).all();
      for (const row of (results || []) as any[]) {
        const payload = (() => {
          try {
            return JSON.parse(String(row?.data_json || "{}"));
          } catch {
            return null;
          }
        })();
        const summaries = extractSlateSummaries(payload);
        for (const s of summaries) {
          const id = String(s?.game?.game_id || s?.requested_game_id || s?.game_id || "").trim().toLowerCase();
          if (!id || !wanted.has(id)) continue;
          mapOddsSummary(oddsSummaryByGame, s);
        }
        if (Object.keys(oddsSummaryByGame).length >= wanted.size) break;
      }
    } catch {
      // Non-fatal.
    }
  }

  const missingIds = params.gameIds.filter((id) => !oddsSummaryByGame[id]);
  for (const id of missingIds) {
    const keys = getOddsSummaryPersistentKeys(scope, id);
    try {
      const primary = await getCachedData<any>(db, keys.primary);
      if (primary && typeof primary === "object") {
        summaryPrimaryHits += 1;
        mapOddsSummary(oddsSummaryByGame, primary);
      }
    } catch {
      // Non-fatal.
    }
    if (oddsSummaryByGame[id]) continue;
    try {
      const backup = await getCachedData<any>(db, keys.backup);
      if (backup && typeof backup === "object") {
        summaryBackupHits += 1;
        mapOddsSummary(oddsSummaryByGame, backup);
      }
    } catch {
      // Non-fatal.
    }
  }

  const source = `cache_only(slate_primary=${slatePrimaryHits},slate_backup=${slateBackupHits},summary_primary=${summaryPrimaryHits},summary_backup=${summaryBackupHits})`;
  return { oddsSummaryByGame, source };
}

async function readGamesFromPersistentCache(db: D1Database, date: string, sport: string): Promise<{
  games: any[];
  source: "games_list_v2_primary" | "games_list_v2_backup" | null;
}> {
  const keys = getGamesListPersistentKeys(date, sport);
  try {
    const primary = await getCachedData<Record<string, unknown>>(db, keys.primary);
    const games = extractGamesArray(primary);
    if (games.length > 0) return { games, source: "games_list_v2_primary" };
  } catch {
    // Non-fatal.
  }
  try {
    const backup = await getCachedData<Record<string, unknown>>(db, keys.backup);
    const games = extractGamesArray(backup);
    if (games.length > 0) return { games, source: "games_list_v2_backup" };
  } catch {
    // Non-fatal.
  }
  return { games: [], source: null };
}

async function readGamesFromDateScopedPersistentCache(db: D1Database, date: string, sport: string): Promise<{
  games: any[];
  source: string | null;
}> {
  const sportKey = String(sport || "").trim().toLowerCase();
  const scopedPattern = !sportKey || sportKey === "all"
    ? null
    : `games_list_v2:${sportKey}|%|${date}|0`;
  const scopedBackupPattern = !sportKey || sportKey === "all"
    ? null
    : `games_list_v2_backup:${sportKey}|%|${date}|0`;
  const anyPattern = `games_list_v2:%|%|${date}|0`;
  const anyBackupPattern = `games_list_v2_backup:%|%|${date}|0`;

  const patterns = [scopedPattern, scopedBackupPattern, anyPattern, anyBackupPattern].filter(Boolean) as string[];
  if (patterns.length === 0) return { games: [], source: null };

  const where = patterns.map(() => "cache_key LIKE ?").join(" OR ");
  const sql = `
    SELECT cache_key, data_json
    FROM api_cache
    WHERE ${where}
    ORDER BY cached_at DESC
    LIMIT 12
  `;
  try {
    const { results } = await db.prepare(sql).bind(...patterns).all();
    const merged: any[] = [];
    for (const row of (results || []) as any[]) {
      const payload = (() => {
        try {
          return JSON.parse(String(row?.data_json || "{}"));
        } catch {
          return null;
        }
      })();
      const games = filterGamesBySport(extractGamesArray(payload), sport);
      if (games.length > 0) merged.push(...games);
    }
    const deduped = mergeGamesById(merged);
    if (deduped.length > 0) return { games: deduped, source: "games_list_v2_date_scoped" };
  } catch {
    // Non-fatal.
  }
  return { games: [], source: null };
}

async function readSportHubGamesFromSnapshots(db: D1Database, date: string, sport: string): Promise<{
  games: any[];
  source: string | null;
}> {
  const direct = await readGamesFromPersistentCache(db, date, sport);
  if (direct.games.length > 0) return { games: direct.games, source: direct.source };

  const exactFromGamesPage = await readPageDataGamesSnapshot(db, date, sport);
  if (exactFromGamesPage.games.length > 0) {
    return { games: filterGamesBySport(mergeGamesById(exactFromGamesPage.games), sport), source: exactFromGamesPage.source };
  }

  const allFromGamesPage = await readPageDataGamesSnapshot(db, date, "ALL");
  if (allFromGamesPage.games.length > 0) {
    return {
      games: filterGamesBySport(mergeGamesById(allFromGamesPage.games), sport),
      source: allFromGamesPage.source ? `${allFromGamesPage.source}:filtered` : null,
    };
  }

  const dateScoped = await readGamesFromDateScopedPersistentCache(db, date, sport);
  if (dateScoped.games.length > 0) return dateScoped;

  return { games: [], source: null };
}

function shiftDateYmd(date: string, dayDelta: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + dayDelta);
  return parsed.toISOString().slice(0, 10);
}

function findGameById(rows: any[], gameId: string, sport: string | null): any | null {
  const id = normalizeGameId(gameId);
  if (!id) return null;
  const targetSport = String(sport || "").trim().toUpperCase();
  for (const row of rows) {
    const rowId = normalizeGameId(row?.game_id || row?.id);
    if (!rowId || rowId !== id) continue;
    if (targetSport && String(row?.sport || "").trim().toUpperCase() !== targetSport) continue;
    return row;
  }
  return null;
}

async function readGameFromSnapshots(db: D1Database, params: {
  gameId: string;
  sport: string | null;
  dateHint: string;
}): Promise<{ game: any | null; source: string | null }> {
  const gameId = normalizeGameId(params.gameId);
  if (!gameId) return { game: null, source: null };
  const dateCandidates = [params.dateHint, shiftDateYmd(params.dateHint, -1), shiftDateYmd(params.dateHint, 1)];

  for (const date of dateCandidates) {
    const exact = await readPageDataGamesSnapshot(db, date, params.sport || "ALL");
    const exactGame = findGameById(exact.games, gameId, params.sport);
    if (exactGame) return { game: exactGame, source: exact.source || "page_data_games_exact" };

    const all = await readPageDataGamesSnapshot(db, date, "ALL");
    const allGame = findGameById(all.games, gameId, params.sport);
    if (allGame) return { game: allGame, source: all.source || "page_data_games_all" };

    const persistent = await readGamesFromDateScopedPersistentCache(db, date, params.sport || "ALL");
    const persistentGame = findGameById(persistent.games, gameId, params.sport);
    if (persistentGame) return { game: persistentGame, source: persistent.source || "games_list_date_scoped" };
  }
  return { game: null, source: null };
}

async function readOddsSummaryForGameFromSnapshots(db: D1Database, params: {
  gameId: string;
  dateHint: string;
}): Promise<{ oddsSummary: any | null; source: string | null }> {
  const raw = String(params.gameId || "").trim();
  const lower = normalizeGameId(params.gameId);
  const ids = Array.from(new Set([raw, lower].filter(Boolean)));
  const scope = "PROD";

  for (const id of ids) {
    const keys = getOddsSummaryPersistentKeys(scope, id);
    try {
      const primary = await getCachedData<any>(db, keys.primary);
      if (primary && typeof primary === "object") return { oddsSummary: primary, source: "odds_summary_v2_primary" };
    } catch {
      // Non-fatal.
    }
    try {
      const backup = await getCachedData<any>(db, keys.backup);
      if (backup && typeof backup === "object") return { oddsSummary: backup, source: "odds_summary_v2_backup" };
    } catch {
      // Non-fatal.
    }
  }

  const dateCandidates = [params.dateHint, shiftDateYmd(params.dateHint, -1), shiftDateYmd(params.dateHint, 1)];
  for (const date of dateCandidates) {
    try {
      const prefix = `odds_slate_v2:${scope}||${date}|%`;
      const backupPrefix = `odds_slate_v2_backup:${scope}||${date}|%`;
      const sql = `
        SELECT data_json
        FROM api_cache
        WHERE cache_key LIKE ? OR cache_key LIKE ?
        ORDER BY cached_at DESC
        LIMIT 10
      `;
      const { results } = await db.prepare(sql).bind(prefix, backupPrefix).all();
      for (const row of (results || []) as any[]) {
        const payload = (() => {
          try {
            return JSON.parse(String(row?.data_json || "{}"));
          } catch {
            return null;
          }
        })();
        const summaries = extractSlateSummaries(payload);
        for (const s of summaries) {
          const sid = normalizeGameId(s?.game?.game_id || s?.requested_game_id || s?.game_id);
          if (!sid || sid !== lower) continue;
          return { oddsSummary: s, source: "odds_slate_v2_date_scoped" };
        }
      }
    } catch {
      // Non-fatal.
    }
  }
  return { oddsSummary: null, source: null };
}

function getDateFromQuery(dateRaw: string | undefined): string {
  const d = String(dateRaw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return today;
}

async function readJsonWithBudget(
  url: string,
  timeoutMs: number,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; body: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...(init || {}), signal: controller.signal });
    if (!response.ok) {
      return { ok: false, status: response.status, body: null };
    }
    const body = await response.json();
    return { ok: true, status: response.status, body };
  } catch {
    return { ok: false, status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

function buildForwardHeaders(c: any): Headers {
  const headers = new Headers();
  const cookie = String(c.req.header("cookie") || "").trim();
  const authorization = String(c.req.header("authorization") || "").trim();
  const demoMode = String(c.req.header("x-demo-mode") || "").trim();
  if (cookie) headers.set("cookie", cookie);
  if (authorization) headers.set("authorization", authorization);
  if (demoMode) headers.set("x-demo-mode", demoMode);
  return headers;
}

function patchFreshness<T extends { freshness: { source: "l1" | "l2" | "cold"; stale: boolean } }>(
  payload: T,
  source: "l1" | "l2" | "cold",
  stale: boolean
): T {
  return {
    ...payload,
    freshness: {
      ...payload.freshness,
      source,
      stale,
    },
  };
}

function hasUsableGamesPageDataPayload(payload: PageDataGamesPayload | null | undefined): boolean {
  if (!payload) return false;
  const games = Array.isArray(payload.games) ? payload.games : [];
  const oddsCount = Object.keys(payload.oddsSummaryByGame || {}).length;
  if (games.length === 0) return false;
  // Avoid serving legacy degraded snapshots that have no odds despite full game slate.
  return oddsCount > 0;
}

function hasUsableOddsPageDataPayload(payload: PageDataOddsPayload | null | undefined): boolean {
  if (!payload) return false;
  const games = Array.isArray(payload.games) ? payload.games.length : 0;
  const odds = Object.keys(payload.oddsSummaryByGame || {}).length;
  return games > 0 || odds > 0;
}

function hasUsableSportHubPageDataPayload(payload: PageDataSportHubPayload | null | undefined): boolean {
  if (!payload) return false;
  return Array.isArray(payload.games) && payload.games.length > 0;
}

function hasUsableGameDetailPageDataPayload(payload: PageDataGameDetailPayload | null | undefined): boolean {
  if (!payload) return false;
  return Boolean(payload.game || payload.oddsSummary);
}

function hasUsableTeamProfilePayload(payload: PageDataTeamProfilePayload | null | undefined): boolean {
  if (!payload) return false;
  const team = payload?.data?.profileJson?.team;
  const teamId = String(team?.id || "").trim();
  const teamName = String(team?.name || "").trim();
  if (!teamId && !teamName) return false;
  const standingsTeams = Array.isArray(payload?.data?.standingsJson?.teams) ? payload.data.standingsJson.teams : [];
  const splits = payload?.data?.splitsJson?.splits;
  const record = payload?.data?.profileJson?.team?.record;
  const hasRecordNumbers = Number.isFinite(Number(record?.wins)) || Number.isFinite(Number(record?.losses));
  // Reject shallow poisoned snapshots that only contain team identity + schedule.
  return standingsTeams.length > 0 || Boolean(splits) || hasRecordNumbers;
}

function hasUsablePlayerProfilePayload(payload: PageDataPlayerProfilePayload | null | undefined): boolean {
  if (!payload) return false;
  return Boolean(payload?.data?.profile?.player);
}

function hasUsableLeagueOverviewPayload(payload: PageDataLeagueOverviewPayload | null | undefined): boolean {
  if (!payload) return false;
  return Boolean(payload?.data?.league || (Array.isArray(payload?.data?.standings) && payload.data.standings.length > 0));
}

function hasUsableLeagueGameDayPayload(payload: PageDataLeagueGameDayPayload | null | undefined): boolean {
  if (!payload) return false;
  return Boolean(payload?.data?.league || (Array.isArray(payload?.data?.events) && payload.data.events.length > 0));
}

function hasUsableLeaguePicksPayload(payload: PageDataLeaguePicksPayload | null | undefined): boolean {
  if (!payload) return false;
  return Boolean(payload?.data?.league || (Array.isArray(payload?.data?.events) && payload.data.events.length > 0));
}

async function readPageDataGamesSnapshot(db: D1Database, date: string, sport: string): Promise<{
  games: any[];
  oddsSummaryByGame: Record<string, any>;
  source: string | null;
}> {
  const tabs = ["scores", "odds"];
  for (const tab of tabs) {
    const pageKey = pageDataGamesCacheKey({ date, sport, tab, includeLiveSlice: true, v: "v1" });
    const primary = `page_data_games_v1:${pageKey}`;
    const backup = `page_data_games_v1_backup:${pageKey}`;
    try {
      const payload = await getCachedData<PageDataGamesPayload>(db, primary);
      if (payload && (Array.isArray(payload.games) || payload.oddsSummaryByGame)) {
        const games = Array.isArray(payload.games) ? payload.games : [];
        const oddsSummaryByGame = payload.oddsSummaryByGame || {};
        if (games.length > 0 || Object.keys(oddsSummaryByGame).length > 0) {
          return { games, oddsSummaryByGame, source: `page_data_games_primary:${tab}` };
        }
      }
    } catch {
      // Non-fatal.
    }
    try {
      const payload = await getCachedData<PageDataGamesPayload>(db, backup);
      if (payload && (Array.isArray(payload.games) || payload.oddsSummaryByGame)) {
        const games = Array.isArray(payload.games) ? payload.games : [];
        const oddsSummaryByGame = payload.oddsSummaryByGame || {};
        if (games.length > 0 || Object.keys(oddsSummaryByGame).length > 0) {
          return { games, oddsSummaryByGame, source: `page_data_games_backup:${tab}` };
        }
      }
    } catch {
      // Non-fatal.
    }
  }
  return { games: [], oddsSummaryByGame: {}, source: null };
}

pageDataRouter.get("/games", async (c) => {
  const started = now();
  incCounter("pageDataRequests");

  const forceFresh = ["1", "true", "yes"].includes(String(c.req.query("fresh") || "").toLowerCase());
  const policy = getFreshnessPolicy("medium");
  const date = getDateFromQuery(c.req.query("date"));
  const sport = normalizeSport(c.req.query("sport") || "ALL");
  const tab = String(c.req.query("tab") || "scores").trim().toLowerCase() || "scores";
  const cacheKey = pageDataGamesCacheKey({ date, sport, tab, includeLiveSlice: true, v: "v1" });
  const d1PrimaryKey = `page_data_games_v1:${cacheKey}`;
  const d1BackupKey = `page_data_games_v1_backup:${cacheKey}`;

  const l1Fresh = readL1Fresh(cacheKey);
  if (!forceFresh && l1Fresh && hasUsableGamesPageDataPayload(l1Fresh)) {
    incCounter("pageDataL1Hits");
    console.log("[PageData][games]", {
      cache: "l1",
      stale: false,
      forceFresh,
      sport,
      date,
      ms: now() - started,
      games: l1Fresh.games.length,
    });
    return c.json(patchFreshness(l1Fresh, "l1", false));
  }

  const l1Stale = readL1Stale(cacheKey);

  if (!forceFresh) {
    try {
      const d1Primary = await getCachedData<PageDataGamesPayload>(c.env.DB, d1PrimaryKey);
      if (hasUsableGamesPageDataPayload(d1Primary)) {
        incCounter("pageDataL2Hits");
        writeL1(cacheKey, d1Primary, policy.cacheTtlMs, policy.staleWindowMs);
        console.log("[PageData][games]", {
          cache: "l2_primary",
          stale: false,
          forceFresh,
          sport,
          date,
          ms: now() - started,
          games: d1Primary.games.length,
        });
        return c.json(patchFreshness(d1Primary, "l2", false));
      }
    } catch {
      // Non-fatal; continue to backup/fallback.
    }

    try {
      const d1Backup = await getCachedData<PageDataGamesPayload>(c.env.DB, d1BackupKey);
      if (hasUsableGamesPageDataPayload(d1Backup)) {
        incCounter("pageDataL2Hits");
        writeL1(cacheKey, d1Backup, policy.cacheTtlMs, policy.staleWindowMs);
        console.log("[PageData][games]", {
          cache: "l2_backup",
          stale: true,
          forceFresh,
          sport,
          date,
          ms: now() - started,
          games: d1Backup.games.length,
        });
        return c.json(patchFreshness(d1Backup, "l2", true));
      }
    } catch {
      // Non-fatal.
    }
  }

  incCounter("pageDataColdPath");

  // Strict cold-path budget: never block route load on slow odds assembly.
  const budgetMs = 2200;
  const gamesBudgetMs = 1400;

  const origin = new URL(c.req.url).origin;
  const gamesUrl = new URL("/api/games", origin);
  gamesUrl.searchParams.set("date", date);
  gamesUrl.searchParams.set("includeOdds", "0");
  if (sport !== "ALL") gamesUrl.searchParams.set("sport", sport);

  const gamesPromise = readJsonWithBudget(gamesUrl.toString(), gamesBudgetMs);

  const [gamesRes] = await withTimeout(
    Promise.all([gamesPromise]),
    budgetMs,
    [{ ok: false, status: 0, body: null }] as const
  );

  const gamesFromHttp = extractGamesArray(gamesRes.body);
  const cacheFallback = gamesFromHttp.length > 0
    ? { games: [], source: null as "games_list_v2_primary" | "games_list_v2_backup" | null }
    : await readGamesFromPersistentCache(c.env.DB, date, sport);
  const games = gamesFromHttp.length > 0 ? gamesFromHttp : cacheFallback.games;
  const gamesSource = gamesFromHttp.length > 0 ? "internal_http" : (cacheFallback.source || "none");
  const gameIds = uniqueGameIds(games, 90);

  // Cache-first odds hydration: no fresh deep compute in user navigation path.
  const oddsCache = await readOddsSummariesFromCache(c.env.DB, { date, gameIds });
  const oddsSummaryByGame: Record<string, any> = { ...oddsCache.oddsSummaryByGame };
  for (const game of games) {
    const id = String(game?.game_id || game?.id || "").trim().toLowerCase();
    if (!id || oddsSummaryByGame[id]) continue;
    const synthetic = buildSyntheticSummaryFromGame(game);
    if (synthetic) oddsSummaryByGame[id] = synthetic;
  }

  let degraded = false;
  let partialReason: string | null = null;

  if (games.length === 0 && l1Stale && hasUsableGamesPageDataPayload(l1Stale)) {
    console.log("[PageData][games]", {
      cache: "l1_stale_rescue",
      stale: true,
      forceFresh,
      sport,
      date,
      ms: now() - started,
      games: l1Stale.games.length,
    });
    return c.json(patchFreshness(l1Stale, "l1", true));
  }

  if (games.length === 0) {
    degraded = true;
    partialReason = "games_budget_timeout_or_empty";
  } else if (Object.keys(oddsSummaryByGame).length === 0) {
    degraded = true;
    partialReason = "odds_budget_timeout_or_empty";
  }

  const payload: PageDataGamesPayload = {
    route: "games",
    generatedAt: new Date().toISOString(),
    freshness: {
      class: "medium",
      cacheTtlMs: policy.cacheTtlMs,
      staleWindowMs: policy.staleWindowMs,
      source: "cold",
      stale: false,
    },
    degraded,
    meta: {
      date,
      sport,
      tab,
      partialReason,
    },
    games,
    oddsSummaryByGame,
  };

  if (games.length > 0) {
    writeL1(cacheKey, payload, policy.cacheTtlMs, policy.staleWindowMs);
    c.executionCtx.waitUntil((async () => {
      try {
        await setCachedData(c.env.DB, d1PrimaryKey, "page-data", "games", payload, Math.floor(policy.cacheTtlMs / 1000));
        await setCachedData(c.env.DB, d1BackupKey, "page-data", "games", payload, Math.floor((policy.cacheTtlMs + policy.staleWindowMs) / 1000));
      } catch {
        // Non-fatal cache persistence failure.
      }
    })());
  } else {
    incCounter("pageDataErrors");
  }

  console.log("[PageData][games]", {
    cache: "cold",
    stale: false,
    forceFresh,
    sport,
    date,
    ms: now() - started,
    games: games.length,
    gamesSource,
    gamesStatus: gamesRes.status,
    odds: Object.keys(oddsSummaryByGame).length,
    oddsSource: oddsCache.source,
    degraded,
    partialReason,
  });

  return c.json(payload);
});

pageDataRouter.get("/sport-hub", async (c) => {
  const started = now();
  incCounter("pageDataRequests");

  const forceFresh = ["1", "true", "yes"].includes(String(c.req.query("fresh") || "").toLowerCase());
  const policy = getFreshnessPolicy("medium");
  const date = getDateFromQuery(c.req.query("date"));
  const sport = normalizeSport(c.req.query("sport") || "");
  if (!sport || sport === "ALL") {
    return c.json({ ok: false, error: "sport is required" }, 400);
  }

  const cacheKey = pageDataGenericKey("sport_hub", { v: "v1", sport, date });
  const d1PrimaryKey = `page_data_sport_hub_v1:${cacheKey}`;
  const d1BackupKey = `page_data_sport_hub_v1_backup:${cacheKey}`;

  const l1Fresh = readL1FreshGeneric(pageDataSportHubL1, cacheKey);
  if (!forceFresh && hasUsableSportHubPageDataPayload(l1Fresh)) {
    incCounter("pageDataL1Hits");
    return c.json(patchFreshness(l1Fresh, "l1", false));
  }
  const l1Stale = readL1StaleGeneric(pageDataSportHubL1, cacheKey);

  if (!forceFresh) {
    try {
      const d1Primary = await getCachedData<PageDataSportHubPayload>(c.env.DB, d1PrimaryKey);
      if (hasUsableSportHubPageDataPayload(d1Primary)) {
        incCounter("pageDataL2Hits");
        writeL1Generic(pageDataSportHubL1, cacheKey, d1Primary, policy.cacheTtlMs, policy.staleWindowMs);
        return c.json(patchFreshness(d1Primary, "l2", false));
      }
    } catch {
      // non-fatal
    }
    try {
      const d1Backup = await getCachedData<PageDataSportHubPayload>(c.env.DB, d1BackupKey);
      if (hasUsableSportHubPageDataPayload(d1Backup)) {
        incCounter("pageDataL2Hits");
        writeL1Generic(pageDataSportHubL1, cacheKey, d1Backup, policy.cacheTtlMs, policy.staleWindowMs);
        return c.json(patchFreshness(d1Backup, "l2", true));
      }
    } catch {
      // non-fatal
    }
  }

  incCounter("pageDataColdPath");
  const snapshot = await readSportHubGamesFromSnapshots(c.env.DB, date, sport);
  const games = snapshot.games;

  if (games.length === 0 && hasUsableSportHubPageDataPayload(l1Stale)) {
    return c.json(patchFreshness(l1Stale, "l1", true));
  }

  const degraded = games.length === 0;
  const partialReason = degraded ? "no_cached_snapshot_available" : null;
  const payload: PageDataSportHubPayload = {
    route: "sport-hub",
    generatedAt: new Date().toISOString(),
    freshness: {
      class: "medium",
      cacheTtlMs: policy.cacheTtlMs,
      staleWindowMs: policy.staleWindowMs,
      source: "cold",
      stale: false,
    },
    degraded,
    meta: { sport, date, partialReason },
    games,
  };

  if (games.length > 0) {
    writeL1Generic(pageDataSportHubL1, cacheKey, payload, policy.cacheTtlMs, policy.staleWindowMs);
    c.executionCtx.waitUntil((async () => {
      try {
        await setCachedData(c.env.DB, d1PrimaryKey, "page-data", "sport-hub", payload, Math.floor(policy.cacheTtlMs / 1000));
        await setCachedData(c.env.DB, d1BackupKey, "page-data", "sport-hub", payload, Math.floor((policy.cacheTtlMs + policy.staleWindowMs) / 1000));
      } catch {
        // non-fatal
      }
    })());
  } else {
    incCounter("pageDataErrors");
  }

  console.log("[PageData][sport-hub]", {
    cache: "cold",
    forceFresh,
    sport,
    date,
    ms: now() - started,
    games: games.length,
    gamesSource: snapshot.source,
    degraded,
    partialReason,
  });

  return c.json(payload);
});

pageDataRouter.get("/game-detail", async (c) => {
  const started = now();
  incCounter("pageDataRequests");

  const forceFresh = ["1", "true", "yes"].includes(String(c.req.query("fresh") || "").toLowerCase());
  const gameId = String(c.req.query("gameId") || "").trim();
  const sport = String(c.req.query("sport") || "").trim().toUpperCase() || null;
  const dateHint = getDateFromQuery(c.req.query("date"));
  if (!gameId) return c.json({ ok: false, error: "gameId is required" }, 400);

  const liveLike = ["LIVE", "IN_PROGRESS"].includes(String(c.req.query("status") || "").trim().toUpperCase());
  const freshnessClass = liveLike ? "live" : "finalizing";
  const policy = getFreshnessPolicy(freshnessClass);
  const cacheKey = pageDataGenericKey("game_detail", { v: "v1", gameId: gameId.toLowerCase(), sport: sport || "" });
  const d1PrimaryKey = `page_data_game_detail_v1:${cacheKey}`;
  const d1BackupKey = `page_data_game_detail_v1_backup:${cacheKey}`;

  const l1Fresh = readL1FreshGeneric(pageDataGameDetailL1, cacheKey);
  if (!forceFresh && hasUsableGameDetailPageDataPayload(l1Fresh)) {
    incCounter("pageDataL1Hits");
    return c.json(patchFreshness(l1Fresh, "l1", false));
  }
  const l1Stale = readL1StaleGeneric(pageDataGameDetailL1, cacheKey);

  if (!forceFresh) {
    try {
      const d1Primary = await getCachedData<PageDataGameDetailPayload>(c.env.DB, d1PrimaryKey);
      if (hasUsableGameDetailPageDataPayload(d1Primary)) {
        incCounter("pageDataL2Hits");
        writeL1Generic(pageDataGameDetailL1, cacheKey, d1Primary, policy.cacheTtlMs, policy.staleWindowMs);
        return c.json(patchFreshness(d1Primary, "l2", false));
      }
    } catch {
      // non-fatal
    }
    try {
      const d1Backup = await getCachedData<PageDataGameDetailPayload>(c.env.DB, d1BackupKey);
      if (hasUsableGameDetailPageDataPayload(d1Backup)) {
        incCounter("pageDataL2Hits");
        writeL1Generic(pageDataGameDetailL1, cacheKey, d1Backup, policy.cacheTtlMs, policy.staleWindowMs);
        return c.json(patchFreshness(d1Backup, "l2", true));
      }
    } catch {
      // non-fatal
    }
  }

  incCounter("pageDataColdPath");
  const gameSnapshot = await readGameFromSnapshots(c.env.DB, { gameId, sport, dateHint });
  const oddsSnapshot = await readOddsSummaryForGameFromSnapshots(c.env.DB, { gameId, dateHint });
  let game = gameSnapshot.game;
  const oddsSummary = oddsSnapshot.oddsSummary;
  if (!game && oddsSummary?.game) {
    game = oddsSummary.game;
  }

  if (!game && hasUsableGameDetailPageDataPayload(l1Stale)) {
    return c.json(patchFreshness(l1Stale, "l1", true));
  }

  const degraded = !game && !oddsSummary;
  const partialReason = degraded
    ? "no_cached_snapshot_available"
    : !game
      ? "game_snapshot_missing"
      : !oddsSummary
        ? "odds_snapshot_missing"
        : null;

  const payload: PageDataGameDetailPayload = {
    route: "game-detail",
    generatedAt: new Date().toISOString(),
    freshness: {
      class: freshnessClass,
      cacheTtlMs: policy.cacheTtlMs,
      staleWindowMs: policy.staleWindowMs,
      source: "cold",
      stale: false,
    },
    degraded,
    meta: { gameId, sport, partialReason },
    game,
    oddsSummary,
  };

  if (game || oddsSummary) {
    writeL1Generic(pageDataGameDetailL1, cacheKey, payload, policy.cacheTtlMs, policy.staleWindowMs);
    c.executionCtx.waitUntil((async () => {
      try {
        await setCachedData(c.env.DB, d1PrimaryKey, "page-data", "game-detail", payload, Math.floor(policy.cacheTtlMs / 1000));
        await setCachedData(c.env.DB, d1BackupKey, "page-data", "game-detail", payload, Math.floor((policy.cacheTtlMs + policy.staleWindowMs) / 1000));
      } catch {
        // non-fatal
      }
    })());
  } else {
    incCounter("pageDataErrors");
  }

  console.log("[PageData][game-detail]", {
    cache: "cold",
    forceFresh,
    gameId,
    sport,
    ms: now() - started,
    hasGame: Boolean(game),
    hasOdds: Boolean(oddsSummary),
    gameSource: gameSnapshot.source,
    oddsSource: oddsSnapshot.source,
    degraded,
    partialReason,
  });

  return c.json(payload);
});

pageDataRouter.get("/odds", async (c) => {
  const started = now();
  incCounter("pageDataRequests");

  const forceFresh = ["1", "true", "yes"].includes(String(c.req.query("fresh") || "").toLowerCase());
  const policy = getFreshnessPolicy("medium");
  const date = getDateFromQuery(c.req.query("date"));
  const sport = normalizeSport(c.req.query("sport") || "ALL");
  const cacheKey = pageDataGenericKey("odds", { v: "v1", date, sport });
  const d1PrimaryKey = `page_data_odds_v1:${cacheKey}`;
  const d1BackupKey = `page_data_odds_v1_backup:${cacheKey}`;

  const l1Fresh = readL1FreshGeneric(pageDataOddsL1, cacheKey);
  if (!forceFresh && l1Fresh && hasUsableOddsPageDataPayload(l1Fresh)) {
    incCounter("pageDataL1Hits");
    return c.json(patchFreshness(l1Fresh, "l1", false));
  }
  const l1Stale = readL1StaleGeneric(pageDataOddsL1, cacheKey);

  if (!forceFresh) {
    try {
      const d1Primary = await getCachedData<PageDataOddsPayload>(c.env.DB, d1PrimaryKey);
      if (hasUsableOddsPageDataPayload(d1Primary)) {
        incCounter("pageDataL2Hits");
        writeL1Generic(pageDataOddsL1, cacheKey, d1Primary, policy.cacheTtlMs, policy.staleWindowMs);
        return c.json(patchFreshness(d1Primary, "l2", false));
      }
    } catch {
      // non-fatal
    }
    try {
      const d1Backup = await getCachedData<PageDataOddsPayload>(c.env.DB, d1BackupKey);
      if (hasUsableOddsPageDataPayload(d1Backup)) {
        incCounter("pageDataL2Hits");
        writeL1Generic(pageDataOddsL1, cacheKey, d1Backup, policy.cacheTtlMs, policy.staleWindowMs);
        return c.json(patchFreshness(d1Backup, "l2", true));
      }
    } catch {
      // non-fatal
    }
  }

  incCounter("pageDataColdPath");
  const budgetMs = 2200;
  const origin = new URL(c.req.url).origin;

  const gamesUrl = new URL("/api/games", origin);
  gamesUrl.searchParams.set("date", date);
  gamesUrl.searchParams.set("includeOdds", "0");
  if (sport !== "ALL") gamesUrl.searchParams.set("sport", sport);

  const gamesRes = await readJsonWithBudget(gamesUrl.toString(), 1300);
  const gamesFromHttp = extractGamesArray(gamesRes.body);
  const cacheFallback = gamesFromHttp.length > 0
    ? { games: [], source: null as "games_list_v2_primary" | "games_list_v2_backup" | null }
    : await readGamesFromPersistentCache(c.env.DB, date, sport);
  let games = gamesFromHttp.length > 0 ? gamesFromHttp : cacheFallback.games;
  let gamesSource = gamesFromHttp.length > 0 ? "internal_http" : (cacheFallback.source || "none");
  const gameIds = uniqueGameIds(games, 90);

  const oddsCache = await readOddsSummariesFromCache(c.env.DB, { date, gameIds });
  const oddsSummaryByGame: Record<string, any> = { ...oddsCache.oddsSummaryByGame };

  // If either slice is still empty, try page-data games snapshots as a last cached source.
  if (games.length === 0 || Object.keys(oddsSummaryByGame).length === 0) {
    const fromGamesSnapshot = await readPageDataGamesSnapshot(c.env.DB, date, sport);
    if (games.length === 0 && fromGamesSnapshot.games.length > 0) {
      games = fromGamesSnapshot.games;
      gamesSource = fromGamesSnapshot.source || gamesSource;
    }
    if (Object.keys(oddsSummaryByGame).length === 0 && Object.keys(fromGamesSnapshot.oddsSummaryByGame).length > 0) {
      Object.assign(oddsSummaryByGame, fromGamesSnapshot.oddsSummaryByGame);
    }
  }

  // Partial-allowed fallback: synthesize sparse odds rows from game snapshot fields.
  for (const game of games) {
    const id = String(game?.game_id || game?.id || "").trim().toLowerCase();
    if (!id || oddsSummaryByGame[id]) continue;
    const synthetic = buildSyntheticSummaryFromGame(game);
    if (synthetic) oddsSummaryByGame[id] = synthetic;
  }

  if (games.length === 0 && l1Stale && hasUsableOddsPageDataPayload(l1Stale)) {
    return c.json(patchFreshness(l1Stale, "l1", true));
  }

  const oddsCount = Object.keys(oddsSummaryByGame).length;
  const degraded = games.length === 0 && oddsCount === 0;
  const partialReason =
    degraded
      ? "no_cached_snapshot_available"
      : games.length === 0
        ? "games_snapshot_missing"
        : oddsCount === 0
          ? "odds_snapshot_missing"
          : null;
  const payload: PageDataOddsPayload = {
    route: "odds",
    generatedAt: new Date().toISOString(),
    freshness: {
      class: "medium",
      cacheTtlMs: policy.cacheTtlMs,
      staleWindowMs: policy.staleWindowMs,
      source: "cold",
      stale: false,
    },
    degraded,
    meta: { date, sport, partialReason },
    games,
    oddsSummaryByGame,
  };

  if (games.length > 0 || oddsCount > 0) {
    writeL1Generic(pageDataOddsL1, cacheKey, payload, policy.cacheTtlMs, policy.staleWindowMs);
    c.executionCtx.waitUntil((async () => {
      try {
        await setCachedData(c.env.DB, d1PrimaryKey, "page-data", "odds", payload, Math.floor(policy.cacheTtlMs / 1000));
        await setCachedData(c.env.DB, d1BackupKey, "page-data", "odds", payload, Math.floor((policy.cacheTtlMs + policy.staleWindowMs) / 1000));
      } catch {
        // non-fatal
      }
    })());
  } else {
    incCounter("pageDataErrors");
  }

  console.log("[PageData][odds]", {
    cache: "cold",
    forceFresh,
    date,
    sport,
    ms: now() - started,
    games: games.length,
    gamesSource,
    gamesStatus: gamesRes.status,
    odds: oddsCount,
    oddsSource: oddsCache.source,
    degraded,
    partialReason,
  });

  return c.json(payload);
});

pageDataRouter.get("/team-profile", async (c) => {
  const started = now();
  incCounter("pageDataRequests");
  const forceFresh = ["1", "true", "yes"].includes(String(c.req.query("fresh") || "").toLowerCase());
  const sport = normalizeSport(c.req.query("sport") || "");
  const teamId = String(c.req.query("teamId") || "").trim();
  if (!sport || sport === "ALL" || !teamId) return c.json({ ok: false, error: "sport and teamId are required" }, 400);
  const policy = getFreshnessPolicy("medium");
  const cacheKey = pageDataGenericKey("team_profile", { v: "v1", sport, teamId: teamId.toLowerCase() });
  const d1PrimaryKey = `page_data_team_profile_v1:${cacheKey}`;
  const d1BackupKey = `page_data_team_profile_v1_backup:${cacheKey}`;

  const l1Fresh = readL1FreshGeneric(pageDataTeamProfileL1, cacheKey);
  if (!forceFresh && hasUsableTeamProfilePayload(l1Fresh)) {
    incCounter("pageDataL1Hits");
    return c.json(patchFreshness(l1Fresh, "l1", false));
  }
  const l1Stale = readL1StaleGeneric(pageDataTeamProfileL1, cacheKey);

  if (!forceFresh) {
    try {
      const d1Primary = await getCachedData<PageDataTeamProfilePayload>(c.env.DB, d1PrimaryKey);
      if (hasUsableTeamProfilePayload(d1Primary)) {
        incCounter("pageDataL2Hits");
        writeL1Generic(pageDataTeamProfileL1, cacheKey, d1Primary, policy.cacheTtlMs, policy.staleWindowMs);
        return c.json(patchFreshness(d1Primary, "l2", false));
      }
    } catch {}
    try {
      const d1Backup = await getCachedData<PageDataTeamProfilePayload>(c.env.DB, d1BackupKey);
      if (hasUsableTeamProfilePayload(d1Backup)) {
        incCounter("pageDataL2Hits");
        writeL1Generic(pageDataTeamProfileL1, cacheKey, d1Backup, policy.cacheTtlMs, policy.staleWindowMs);
        return c.json(patchFreshness(d1Backup, "l2", true));
      }
    } catch {}
  }

  incCounter("pageDataColdPath");
  const origin = new URL(c.req.url).origin;
  const headers = buildForwardHeaders(c);
  const endpoints = {
    profile: `${origin}/api/teams/${encodeURIComponent(sport)}/${encodeURIComponent(teamId)}`,
    schedule: `${origin}/api/teams/${encodeURIComponent(sport)}/${encodeURIComponent(teamId)}/schedule`,
    stats: `${origin}/api/teams/${encodeURIComponent(sport)}/${encodeURIComponent(teamId)}/stats`,
    standings: `${origin}/api/teams/${encodeURIComponent(sport)}/standings`,
    games: `${origin}/api/games?sport=${encodeURIComponent(sport)}&includeOdds=0`,
    injuries: `${origin}/api/teams/${encodeURIComponent(sport)}/${encodeURIComponent(teamId)}/injuries`,
    splits: `${origin}/api/teams/${encodeURIComponent(sport)}/${encodeURIComponent(teamId)}/splits`,
  };
  let [profileRes, scheduleRes, statsRes, standingsRes, gamesRes, injuriesRes, splitsRes] = await Promise.all([
    readJsonWithBudget(endpoints.profile, 1800, { headers }),
    readJsonWithBudget(endpoints.schedule, 1600, { headers }),
    readJsonWithBudget(endpoints.stats, 1500, { headers }),
    readJsonWithBudget(endpoints.standings, 1500, { headers }),
    readJsonWithBudget(endpoints.games, 1300, { headers }),
    readJsonWithBudget(endpoints.injuries, 1300, { headers }),
    readJsonWithBudget(endpoints.splits, 1300, { headers }),
  ]);

  if (!profileRes.ok && hasUsableTeamProfilePayload(l1Stale)) {
    return c.json(patchFreshness(l1Stale, "l1", true));
  }

  // Team metadata card relies heavily on standings/split records; do one bounded retry if sparse.
  const standingsTeams = Array.isArray(standingsRes.body?.teams) ? standingsRes.body.teams : [];
  if (sport === "NBA" && standingsTeams.length === 0) {
    try {
      const retry = await readJsonWithBudget(endpoints.standings, 2600, { headers });
      const retryTeams = Array.isArray(retry.body?.teams) ? retry.body.teams : [];
      if (retry.ok && retryTeams.length > 0) {
        standingsRes = retry;
      }
    } catch {
      // non-fatal
    }
  }
  if (sport === "NBA" && !splitsRes.body?.splits) {
    try {
      const retry = await readJsonWithBudget(endpoints.splits, 2200, { headers });
      if (retry.ok && retry.body?.splits) {
        splitsRes = retry;
      }
    } catch {
      // non-fatal
    }
  }

  const payload: PageDataTeamProfilePayload = {
    route: "team-profile",
    generatedAt: new Date().toISOString(),
    freshness: {
      class: "medium",
      cacheTtlMs: policy.cacheTtlMs,
      staleWindowMs: policy.staleWindowMs,
      source: "cold",
      stale: false,
    },
    degraded: !profileRes.ok,
    meta: {
      sport,
      teamId,
      partialReason: !profileRes.ok ? "team_profile_missing" : null,
    },
    data: {
      profileJson: profileRes.body || {},
      scheduleJson: scheduleRes.body || { allGames: [], pastGames: [], upcomingGames: [] },
      statsJson: statsRes.body || { stats: {}, rankings: {} },
      standingsJson: standingsRes.body || { teams: [] },
      gamesJson: gamesRes.body || { games: [] },
      injuriesJson: injuriesRes.body || { injuries: [] },
      splitsJson: splitsRes.body || { splits: null },
    },
  };

  if (hasUsableTeamProfilePayload(payload)) {
    writeL1Generic(pageDataTeamProfileL1, cacheKey, payload, policy.cacheTtlMs, policy.staleWindowMs);
    c.executionCtx.waitUntil((async () => {
      try {
        await setCachedData(c.env.DB, d1PrimaryKey, "page-data", "team-profile", payload, Math.floor(policy.cacheTtlMs / 1000));
        await setCachedData(c.env.DB, d1BackupKey, "page-data", "team-profile", payload, Math.floor((policy.cacheTtlMs + policy.staleWindowMs) / 1000));
      } catch {}
    })());
  } else {
    incCounter("pageDataErrors");
  }

  console.log("[PageData][team-profile]", { sport, teamId, ms: now() - started, degraded: payload.degraded });
  return c.json(payload);
});

pageDataRouter.get("/player-profile", async (c) => {
  const started = now();
  incCounter("pageDataRequests");
  const forceFresh = ["1", "true", "yes"].includes(String(c.req.query("fresh") || "").toLowerCase());
  const sport = normalizeSport(c.req.query("sport") || "");
  const playerName = String(c.req.query("playerName") || c.req.query("player") || "").trim();
  if (!sport || sport === "ALL" || !playerName) return c.json({ ok: false, error: "sport and playerName are required" }, 400);
  const policy = getFreshnessPolicy("medium");
  const cacheKey = pageDataGenericKey("player_profile", { v: "v1", sport, playerName: playerName.toLowerCase() });
  const d1PrimaryKey = `page_data_player_profile_v1:${cacheKey}`;
  const d1BackupKey = `page_data_player_profile_v1_backup:${cacheKey}`;

  const l1Fresh = readL1FreshGeneric(pageDataPlayerProfileL1, cacheKey);
  if (!forceFresh && hasUsablePlayerProfilePayload(l1Fresh)) {
    incCounter("pageDataL1Hits");
    return c.json(patchFreshness(l1Fresh, "l1", false));
  }
  const l1Stale = readL1StaleGeneric(pageDataPlayerProfileL1, cacheKey);

  if (!forceFresh) {
    try {
      const d1Primary = await getCachedData<PageDataPlayerProfilePayload>(c.env.DB, d1PrimaryKey);
      if (hasUsablePlayerProfilePayload(d1Primary)) {
        incCounter("pageDataL2Hits");
        writeL1Generic(pageDataPlayerProfileL1, cacheKey, d1Primary, policy.cacheTtlMs, policy.staleWindowMs);
        return c.json(patchFreshness(d1Primary, "l2", false));
      }
    } catch {}
    try {
      const d1Backup = await getCachedData<PageDataPlayerProfilePayload>(c.env.DB, d1BackupKey);
      if (hasUsablePlayerProfilePayload(d1Backup)) {
        incCounter("pageDataL2Hits");
        writeL1Generic(pageDataPlayerProfileL1, cacheKey, d1Backup, policy.cacheTtlMs, policy.staleWindowMs);
        return c.json(patchFreshness(d1Backup, "l2", true));
      }
    } catch {}
  }

  incCounter("pageDataColdPath");
  const origin = new URL(c.req.url).origin;
  const headers = buildForwardHeaders(c);
  let profileRes: { ok: boolean; status: number; body: any } = { ok: false, status: 0, body: null };
  if (!forceFresh) {
    try {
      const profileCacheKey = makeCacheKey(
        "player-profile",
        `${sport}/${normalizeTokenForCache(playerName)}`
      );
      const cachedProfile = await getCachedData<any>(c.env.DB, profileCacheKey);
      if (cachedProfile && cachedProfile.player) {
        profileRes = { ok: true, status: 200, body: cachedProfile };
      }
    } catch {
      // Non-fatal.
    }
  }
  if (!profileRes.ok) {
    const freshPart = forceFresh ? "&fresh=1" : "";
    const profileUrl = `${origin}/api/player/${encodeURIComponent(sport)}/${encodeURIComponent(playerName)}?pageData=1${freshPart}`;
    profileRes = await readJsonWithBudget(profileUrl, forceFresh ? 9500 : 6500, { headers });
  }

  let canonicalTeamRouteId: string | null = null;
  const teamCode = String(profileRes.body?.player?.teamAbbr || "").trim().toUpperCase();
  const directTeamId = String(profileRes.body?.player?.teamId || "").trim();
  if (directTeamId) {
    canonicalTeamRouteId = directTeamId;
  } else if (teamCode) {
    try {
      const standingsRes = await readJsonWithBudget(`${origin}/api/teams/${encodeURIComponent(sport)}/standings`, 1300, { headers });
      const teams = Array.isArray(standingsRes.body?.teams) ? standingsRes.body.teams : [];
      const aliasMap: Record<string, string[]> = { GSW: ["GS"], NYK: ["NY"], SAS: ["SA"], NOP: ["NO"], PHX: ["PHO"] };
      const candidates = new Set<string>([teamCode, ...(aliasMap[teamCode] || [])]);
      const match = teams.find((row: any) => candidates.has(String(row?.alias || "").trim().toUpperCase()));
      canonicalTeamRouteId = String(match?.id || "").trim() || null;
    } catch {}
  }

  if (!profileRes.ok && hasUsablePlayerProfilePayload(l1Stale)) {
    return c.json(patchFreshness(l1Stale, "l1", true));
  }

  const payload: PageDataPlayerProfilePayload = {
    route: "player-profile",
    generatedAt: new Date().toISOString(),
    freshness: {
      class: "medium",
      cacheTtlMs: policy.cacheTtlMs,
      staleWindowMs: policy.staleWindowMs,
      source: "cold",
      stale: false,
    },
    degraded: !profileRes.ok,
    meta: {
      sport,
      playerName,
      partialReason: !profileRes.ok ? "player_profile_missing" : null,
    },
    data: {
      profile: profileRes.body || null,
      canonicalTeamRouteId,
    },
  };

  if (hasUsablePlayerProfilePayload(payload)) {
    writeL1Generic(pageDataPlayerProfileL1, cacheKey, payload, policy.cacheTtlMs, policy.staleWindowMs);
    c.executionCtx.waitUntil((async () => {
      try {
        await setCachedData(c.env.DB, d1PrimaryKey, "page-data", "player-profile", payload, Math.floor(policy.cacheTtlMs / 1000));
        await setCachedData(c.env.DB, d1BackupKey, "page-data", "player-profile", payload, Math.floor((policy.cacheTtlMs + policy.staleWindowMs) / 1000));
      } catch {}
    })());
  } else {
    incCounter("pageDataErrors");
  }

  console.log("[PageData][player-profile]", { sport, playerName, ms: now() - started, degraded: payload.degraded });
  return c.json(payload);
});

pageDataRouter.get("/league-overview", async (c) => {
  const started = now();
  incCounter("pageDataRequests");
  const forceFresh = ["1", "true", "yes"].includes(String(c.req.query("fresh") || "").toLowerCase());
  const leagueId = String(c.req.query("leagueId") || "").trim();
  if (!leagueId) return c.json({ ok: false, error: "leagueId is required" }, 400);
  const policy = getFreshnessPolicy("medium");
  const cacheKey = pageDataGenericKey("league_overview", { v: "v1", leagueId });
  const d1PrimaryKey = `page_data_league_overview_v1:${cacheKey}`;
  const d1BackupKey = `page_data_league_overview_v1_backup:${cacheKey}`;

  const l1Fresh = readL1FreshGeneric(pageDataLeagueOverviewL1, cacheKey);
  if (!forceFresh && hasUsableLeagueOverviewPayload(l1Fresh)) {
    incCounter("pageDataL1Hits");
    return c.json(patchFreshness(l1Fresh, "l1", false));
  }
  const l1Stale = readL1StaleGeneric(pageDataLeagueOverviewL1, cacheKey);
  if (!forceFresh) {
    try {
      const d1Primary = await getCachedData<PageDataLeagueOverviewPayload>(c.env.DB, d1PrimaryKey);
      if (hasUsableLeagueOverviewPayload(d1Primary)) {
        incCounter("pageDataL2Hits");
        writeL1Generic(pageDataLeagueOverviewL1, cacheKey, d1Primary, policy.cacheTtlMs, policy.staleWindowMs);
        return c.json(patchFreshness(d1Primary, "l2", false));
      }
    } catch {}
    try {
      const d1Backup = await getCachedData<PageDataLeagueOverviewPayload>(c.env.DB, d1BackupKey);
      if (hasUsableLeagueOverviewPayload(d1Backup)) {
        incCounter("pageDataL2Hits");
        writeL1Generic(pageDataLeagueOverviewL1, cacheKey, d1Backup, policy.cacheTtlMs, policy.staleWindowMs);
        return c.json(patchFreshness(d1Backup, "l2", true));
      }
    } catch {}
  }

  incCounter("pageDataColdPath");
  const origin = new URL(c.req.url).origin;
  const headers = buildForwardHeaders(c);
  const [leagueRes, standingsRes, periodsRes] = await Promise.all([
    readJsonWithBudget(`${origin}/api/leagues/${encodeURIComponent(leagueId)}`, 1500, { headers }),
    readJsonWithBudget(`${origin}/api/leagues/${encodeURIComponent(leagueId)}/standings`, 1500, { headers }),
    readJsonWithBudget(`${origin}/api/leagues/${encodeURIComponent(leagueId)}/periods`, 1500, { headers }),
  ]);
  const periodsData = periodsRes.body || {};
  const period = String(periodsData?.currentPeriod || periodsData?.periods?.[0] || "").trim();
  const [eventsRes, allPicksRes] = await Promise.all([
    period ? readJsonWithBudget(`${origin}/api/leagues/${encodeURIComponent(leagueId)}/events?period=${encodeURIComponent(period)}`, 1600, { headers }) : Promise.resolve({ ok: false, status: 0, body: [] }),
    period ? readJsonWithBudget(`${origin}/api/leagues/${encodeURIComponent(leagueId)}/all-picks?period=${encodeURIComponent(period)}`, 1600, { headers }) : Promise.resolve({ ok: false, status: 0, body: [] }),
  ]);

  const standingsRows = Array.isArray(standingsRes.body?.standings) ? standingsRes.body.standings : [];
  const standings = standingsRows.map((s: any, idx: number) => ({
    userId: s.user_id,
    userName: s.display_name || s.email,
    avatar: s.avatar_url,
    rank: s.rank || idx + 1,
    previousRank: s.previous_rank || s.rank || idx + 1,
    totalPoints: s.total_points || 0,
    weeklyPoints: 0,
    winPercentage: s.win_percentage || 0,
    streak: s.current_streak > 0 ? { count: s.current_streak, type: s.streak_type } : null,
    isCurrentUser: s.user_id === standingsRes.body?.league?.currentUserId,
  }));
  const events = (Array.isArray(eventsRes.body) ? eventsRes.body : []).map((e: any) => ({
    id: e.id,
    external_id: e.external_id,
    sport_key: e.sport_key,
    period_id: e.period_id,
    start_at: e.start_at,
    home_team: e.home_team,
    away_team: e.away_team,
    home_score: e.home_score,
    away_score: e.away_score,
    status: e.status,
    final_result: e.winner || e.final_result,
  }));
  const allPicksRows = Array.isArray(allPicksRes.body) ? allPicksRes.body : [];
  const gamesWithPicks = events.map((event: any) => {
    const isLocked = new Date(event.start_at) <= new Date() || event.status !== "scheduled";
    const picks = allPicksRows.map((member: any) => {
      const memberPicks = Array.isArray(member?.picks) ? member.picks : [];
      const memberPick = memberPicks.find((p: any) => p.event_id === event.id);
      let isCorrect: boolean | null = null;
      if (event.status === "final" && event.final_result && memberPick?.pick_value) {
        isCorrect = memberPick.pick_value === event.final_result;
      }
      return {
        userId: member.userId,
        userName: member.userName,
        avatar: member.avatar,
        pickValue: isLocked ? (memberPick?.pick_value || null) : null,
        isCorrect,
        confidenceRank: memberPick?.confidence_rank,
        isCurrentUser: member.isCurrentUser,
      };
    });
    return { event, picks };
  });
  const survivorMembers = standings.map((member: any) => ({
    userId: member.userId,
    userName: member.userName,
    avatar: member.avatar,
    isAlive: true,
    currentPick: undefined,
    picksHistory: [],
    isCurrentUser: member.isCurrentUser,
  }));
  const activeTab = leagueRes.body?.format_key === "survivor" ? "survivor" : "live";

  if (!leagueRes.ok && hasUsableLeagueOverviewPayload(l1Stale)) {
    return c.json(patchFreshness(l1Stale, "l1", true));
  }
  const payload: PageDataLeagueOverviewPayload = {
    route: "league-overview",
    generatedAt: new Date().toISOString(),
    freshness: {
      class: "medium",
      cacheTtlMs: policy.cacheTtlMs,
      staleWindowMs: policy.staleWindowMs,
      source: "cold",
      stale: false,
    },
    degraded: !leagueRes.ok,
    meta: { leagueId, partialReason: !leagueRes.ok ? "league_missing" : null },
    data: {
      league: leagueRes.body || null,
      standings,
      availablePeriods: Array.isArray(periodsData?.periods) ? periodsData.periods : [],
      currentPeriod: period,
      gamesWithPicks,
      survivorMembers,
      activeTab,
    },
  };

  if (hasUsableLeagueOverviewPayload(payload)) {
    writeL1Generic(pageDataLeagueOverviewL1, cacheKey, payload, policy.cacheTtlMs, policy.staleWindowMs);
    c.executionCtx.waitUntil((async () => {
      try {
        await setCachedData(c.env.DB, d1PrimaryKey, "page-data", "league-overview", payload, Math.floor(policy.cacheTtlMs / 1000));
        await setCachedData(c.env.DB, d1BackupKey, "page-data", "league-overview", payload, Math.floor((policy.cacheTtlMs + policy.staleWindowMs) / 1000));
      } catch {}
    })());
  } else {
    incCounter("pageDataErrors");
  }
  console.log("[PageData][league-overview]", { leagueId, ms: now() - started, degraded: payload.degraded });
  return c.json(payload);
});

pageDataRouter.get("/league-gameday", async (c) => {
  const started = now();
  incCounter("pageDataRequests");
  const forceFresh = ["1", "true", "yes"].includes(String(c.req.query("fresh") || "").toLowerCase());
  const leagueId = String(c.req.query("leagueId") || "").trim();
  if (!leagueId) return c.json({ ok: false, error: "leagueId is required" }, 400);
  const policy = getFreshnessPolicy("medium");
  const cacheKey = pageDataGenericKey("league_gameday", { v: "v1", leagueId });
  const d1PrimaryKey = `page_data_league_gameday_v1:${cacheKey}`;
  const d1BackupKey = `page_data_league_gameday_v1_backup:${cacheKey}`;

  const l1Fresh = readL1FreshGeneric(pageDataLeagueGameDayL1, cacheKey);
  if (!forceFresh && hasUsableLeagueGameDayPayload(l1Fresh)) {
    incCounter("pageDataL1Hits");
    return c.json(patchFreshness(l1Fresh, "l1", false));
  }
  const l1Stale = readL1StaleGeneric(pageDataLeagueGameDayL1, cacheKey);
  if (!forceFresh) {
    try {
      const d1Primary = await getCachedData<PageDataLeagueGameDayPayload>(c.env.DB, d1PrimaryKey);
      if (hasUsableLeagueGameDayPayload(d1Primary)) {
        incCounter("pageDataL2Hits");
        writeL1Generic(pageDataLeagueGameDayL1, cacheKey, d1Primary, policy.cacheTtlMs, policy.staleWindowMs);
        return c.json(patchFreshness(d1Primary, "l2", false));
      }
    } catch {}
    try {
      const d1Backup = await getCachedData<PageDataLeagueGameDayPayload>(c.env.DB, d1BackupKey);
      if (hasUsableLeagueGameDayPayload(d1Backup)) {
        incCounter("pageDataL2Hits");
        writeL1Generic(pageDataLeagueGameDayL1, cacheKey, d1Backup, policy.cacheTtlMs, policy.staleWindowMs);
        return c.json(patchFreshness(d1Backup, "l2", true));
      }
    } catch {}
  }

  incCounter("pageDataColdPath");
  const origin = new URL(c.req.url).origin;
  const headers = buildForwardHeaders(c);
  const [leagueRes, periodsRes, standingsRes] = await Promise.all([
    readJsonWithBudget(`${origin}/api/leagues/${encodeURIComponent(leagueId)}`, 1500, { headers }),
    readJsonWithBudget(`${origin}/api/leagues/${encodeURIComponent(leagueId)}/periods`, 1500, { headers }),
    readJsonWithBudget(`${origin}/api/leagues/${encodeURIComponent(leagueId)}/standings`, 1500, { headers }),
  ]);
  const period = String(periodsRes.body?.currentPeriod || periodsRes.body?.periods?.[0] || "Week 1");
  const [eventsRes, picksRes] = await Promise.all([
    readJsonWithBudget(`${origin}/api/leagues/${encodeURIComponent(leagueId)}/events?period=${encodeURIComponent(period)}`, 1600, { headers }),
    readJsonWithBudget(`${origin}/api/leagues/${encodeURIComponent(leagueId)}/picks?period=${encodeURIComponent(period)}`, 1600, { headers }),
  ]);
  const picksBody = picksRes.body;
  const picks = Array.isArray(picksBody) ? picksBody : (Array.isArray(picksBody?.picks) ? picksBody.picks : []);
  const standings = Array.isArray(standingsRes.body?.standings) ? standingsRes.body.standings.slice(0, 20) : [];

  if (!leagueRes.ok && hasUsableLeagueGameDayPayload(l1Stale)) {
    return c.json(patchFreshness(l1Stale, "l1", true));
  }
  const payload: PageDataLeagueGameDayPayload = {
    route: "league-gameday",
    generatedAt: new Date().toISOString(),
    freshness: {
      class: "medium",
      cacheTtlMs: policy.cacheTtlMs,
      staleWindowMs: policy.staleWindowMs,
      source: "cold",
      stale: false,
    },
    degraded: !leagueRes.ok,
    meta: { leagueId, partialReason: !leagueRes.ok ? "league_missing" : null },
    data: {
      league: leagueRes.body || null,
      currentPeriod: period,
      events: Array.isArray(eventsRes.body) ? eventsRes.body : [],
      picks,
      standings,
    },
  };
  if (hasUsableLeagueGameDayPayload(payload)) {
    writeL1Generic(pageDataLeagueGameDayL1, cacheKey, payload, policy.cacheTtlMs, policy.staleWindowMs);
    c.executionCtx.waitUntil((async () => {
      try {
        await setCachedData(c.env.DB, d1PrimaryKey, "page-data", "league-gameday", payload, Math.floor(policy.cacheTtlMs / 1000));
        await setCachedData(c.env.DB, d1BackupKey, "page-data", "league-gameday", payload, Math.floor((policy.cacheTtlMs + policy.staleWindowMs) / 1000));
      } catch {}
    })());
  } else {
    incCounter("pageDataErrors");
  }
  console.log("[PageData][league-gameday]", { leagueId, ms: now() - started, degraded: payload.degraded });
  return c.json(payload);
});

pageDataRouter.get("/league-picks", async (c) => {
  const started = now();
  incCounter("pageDataRequests");
  const forceFresh = ["1", "true", "yes"].includes(String(c.req.query("fresh") || "").toLowerCase());
  const leagueId = String(c.req.query("leagueId") || "").trim();
  if (!leagueId) return c.json({ ok: false, error: "leagueId is required" }, 400);
  const policy = getFreshnessPolicy("medium");
  const cacheKey = pageDataGenericKey("league_picks", { v: "v1", leagueId });
  const d1PrimaryKey = `page_data_league_picks_v1:${cacheKey}`;
  const d1BackupKey = `page_data_league_picks_v1_backup:${cacheKey}`;

  const l1Fresh = readL1FreshGeneric(pageDataLeaguePicksL1, cacheKey);
  if (!forceFresh && hasUsableLeaguePicksPayload(l1Fresh)) {
    incCounter("pageDataL1Hits");
    return c.json(patchFreshness(l1Fresh, "l1", false));
  }
  const l1Stale = readL1StaleGeneric(pageDataLeaguePicksL1, cacheKey);
  if (!forceFresh) {
    try {
      const d1Primary = await getCachedData<PageDataLeaguePicksPayload>(c.env.DB, d1PrimaryKey);
      if (hasUsableLeaguePicksPayload(d1Primary)) {
        incCounter("pageDataL2Hits");
        writeL1Generic(pageDataLeaguePicksL1, cacheKey, d1Primary, policy.cacheTtlMs, policy.staleWindowMs);
        return c.json(patchFreshness(d1Primary, "l2", false));
      }
    } catch {}
    try {
      const d1Backup = await getCachedData<PageDataLeaguePicksPayload>(c.env.DB, d1BackupKey);
      if (hasUsableLeaguePicksPayload(d1Backup)) {
        incCounter("pageDataL2Hits");
        writeL1Generic(pageDataLeaguePicksL1, cacheKey, d1Backup, policy.cacheTtlMs, policy.staleWindowMs);
        return c.json(patchFreshness(d1Backup, "l2", true));
      }
    } catch {}
  }

  incCounter("pageDataColdPath");
  const origin = new URL(c.req.url).origin;
  const headers = buildForwardHeaders(c);
  const [leagueRes, periodsRes, paymentRes] = await Promise.all([
    readJsonWithBudget(`${origin}/api/leagues/${encodeURIComponent(leagueId)}`, 1500, { headers }),
    readJsonWithBudget(`${origin}/api/leagues/${encodeURIComponent(leagueId)}/periods`, 1500, { headers }),
    readJsonWithBudget(`${origin}/api/leagues/${encodeURIComponent(leagueId)}/payments/eligibility`, 1500, { headers }),
  ]);
  const period = String(periodsRes.body?.currentPeriod || periodsRes.body?.periods?.[0] || "");
  const [eventsRes, picksRes] = await Promise.all([
    period ? readJsonWithBudget(`${origin}/api/leagues/${encodeURIComponent(leagueId)}/events?period=${encodeURIComponent(period)}`, 1600, { headers }) : Promise.resolve({ ok: false, status: 0, body: [] }),
    period ? readJsonWithBudget(`${origin}/api/leagues/${encodeURIComponent(leagueId)}/picks?period=${encodeURIComponent(period)}`, 1600, { headers }) : Promise.resolve({ ok: false, status: 0, body: [] }),
  ]);
  const picksBody = picksRes.body;
  const picks = Array.isArray(picksBody) ? picksBody : (Array.isArray(picksBody?.picks) ? picksBody.picks : []);

  if (!leagueRes.ok && hasUsableLeaguePicksPayload(l1Stale)) {
    return c.json(patchFreshness(l1Stale, "l1", true));
  }
  const payload: PageDataLeaguePicksPayload = {
    route: "league-picks",
    generatedAt: new Date().toISOString(),
    freshness: {
      class: "medium",
      cacheTtlMs: policy.cacheTtlMs,
      staleWindowMs: policy.staleWindowMs,
      source: "cold",
      stale: false,
    },
    degraded: !leagueRes.ok,
    meta: { leagueId, partialReason: !leagueRes.ok ? "league_missing" : null },
    data: {
      league: leagueRes.body || null,
      availablePeriods: Array.isArray(periodsRes.body?.periods) ? periodsRes.body.periods : [],
      currentPeriod: period,
      events: Array.isArray(eventsRes.body) ? eventsRes.body : [],
      picks,
      paymentEligibility: paymentRes.body || null,
    },
  };
  if (hasUsableLeaguePicksPayload(payload)) {
    writeL1Generic(pageDataLeaguePicksL1, cacheKey, payload, policy.cacheTtlMs, policy.staleWindowMs);
    c.executionCtx.waitUntil((async () => {
      try {
        await setCachedData(c.env.DB, d1PrimaryKey, "page-data", "league-picks", payload, Math.floor(policy.cacheTtlMs / 1000));
        await setCachedData(c.env.DB, d1BackupKey, "page-data", "league-picks", payload, Math.floor((policy.cacheTtlMs + policy.staleWindowMs) / 1000));
      } catch {}
    })());
  } else {
    incCounter("pageDataErrors");
  }
  console.log("[PageData][league-picks]", { leagueId, ms: now() - started, degraded: payload.degraded });
  return c.json(payload);
});

pageDataRouter.post("/warm", authMiddleware, async (c) => {
  const forceFresh = ["1", "true", "yes"].includes(String(c.req.query("fresh") || "").toLowerCase());
  const date = getDateFromQuery(c.req.query("date"));
  const origin = new URL(c.req.url).origin;

  const summary = await runPageDataWarmCycle({
    forceFresh,
    date,
    fetchFn: async (pathWithQuery) => {
      try {
        const response = await fetch(`${origin}${pathWithQuery}`, { method: "GET" });
        const body = await response.json().catch(() => null);
        return { ok: response.ok, status: response.status, body };
      } catch {
        return { ok: false, status: 0, body: null };
      }
    },
  });

  return c.json({ ok: true, summary });
});

pageDataRouter.post("/telemetry", async (c) => {
  const body = await c.req.json().catch(() => null as any);
  const route = String(body?.route || "").trim();
  const loadMs = Number(body?.loadMs);
  const apiCalls = Number(body?.apiCalls);
  const oddsAvailableAtFirstRender = Boolean(body?.oddsAvailableAtFirstRender);

  if (!route || !Number.isFinite(loadMs) || !Number.isFinite(apiCalls)) {
    return c.json({ ok: false, error: "invalid payload" }, 400);
  }

  recordRouteRenderEvent({
    route,
    loadMs,
    apiCalls,
    oddsAvailableAtFirstRender,
  });
  return c.json({ ok: true });
});

pageDataRouter.get("/metrics", authMiddleware, async (c) => {
  return c.json(getRolloutMetricsSnapshot());
});

export { pageDataRouter };


// @ts-nocheck
/* COVERAGE LOCK: do not redesign/refactor; only completeness rule updates. */
import { Hono } from "hono";
import { authMiddleware } from "@getmocha/users-service/backend";
import { getCachedData, makeCacheKey, setCachedData } from "../services/apiCacheService";
import { pageDataGamesCacheKey, pageDataGenericKey } from "../services/pageData/cacheKeys";
import {
  ACTIVE_SPORT_CACHE_KEY,
  PLAYER_PAGE_DATA_D1_BACKUP_TTL_SEC_MIN,
  PLAYER_PAGE_DATA_D1_PRIMARY_TTL_SEC_MIN,
  normalizePlayerNameForWarm,
} from "../services/pageData/cacheConfig";
import { getFreshnessPolicy } from "../services/pageData/freshnessPolicy";
import {
  runPageDataWarmCycle,
  warmPlayersForSport,
  warmTeamRoster,
  type WarmFetchFn,
} from "../services/pageData/precompute";
import { fetchStandingsCached } from "../services/sports-data/sportsRadarProvider";
import type { SportKey } from "../services/sports-data/types";
import {
  getRolloutMetricsSnapshot,
  incCounter,
  recordRouteRenderEvent,
} from "../services/pageData/rolloutMetrics";
import { buildPlayerDocument } from "../services/playerDocuments/buildPlayerDocument";
import { enqueuePlayerDocumentBuild } from "../services/playerDocuments/ingestion";
import {
  buildPlayerDocumentL1CacheKey,
  getStoredPlayerDocumentJson,
  getStoredPlayerDocumentRecord,
  upsertPlayerDocumentV1,
  type StoredPlayerDocumentV1,
} from "../services/playerDocuments/playerDocumentStore";
import { resolveCanonicalPlayerIdentity } from "../services/playerIdentity/canonicalPlayerResolver";
import {
  evaluatePlayerProfileCoreReadiness,
  isPlayerProfileDocumentCompleteForRender,
  isPlayerProfileDisplayNameFallback,
} from "../../shared/playerProfileCompleteness";
import { getEspnAthleteIdForPlayerName } from "../../shared/espnAthleteIdLookup";

type Env = {
  DB: D1Database;
  SPORTSRADAR_API_KEY?: string;
  MOCHA_USERS_SERVICE_API_KEY?: string;
  PAGE_DATA_WARM_BYPASS_KEY?: string;
};

const pageDataRouter = new Hono<{ Bindings: Env }>();
const ENFORCE_SNAPSHOT_READ_ONLY_REQUEST_PATH = false;
const espnCorePositionCache = new Map<string, { value: string; expiresAt: number }>();

async function fetchEspnCorePositionForAthlete(sport: string, espnId: string): Promise<string> {
  const sportUpper = String(sport || "").toUpperCase();
  const pid = String(espnId || "").trim();
  if (!pid || !/^\d{4,}$/.test(pid)) return "";
  const cacheKey = `${sportUpper}:${pid}`;
  const nowTs = Date.now();
  const cached = espnCorePositionCache.get(cacheKey);
  if (cached && cached.expiresAt > nowTs) return cached.value;
  const leaguePath =
    sportUpper === "MLB" ? "baseball/leagues/mlb" :
    sportUpper === "NBA" ? "basketball/leagues/nba" :
    sportUpper === "NCAAB" ? "basketball/leagues/mens-college-basketball" :
    sportUpper === "NFL" ? "football/leagues/nfl" :
    sportUpper === "NHL" ? "hockey/leagues/nhl" :
    sportUpper === "SOCCER" ? "soccer/leagues/eng.1" :
    "";
  if (!leaguePath) return "";
  try {
    const url = `https://sports.core.api.espn.com/v2/sports/${leaguePath}/athletes/${encodeURIComponent(pid)}`;
    const res = await withTimeout(fetch(url, { headers: { Accept: "application/json" } }), 1100, null as Response | null);
    if (!res || !res.ok) return "";
    const athlete = await res.json() as any;
    const position = String(athlete?.position?.abbreviation || athlete?.position?.displayName || athlete?.position || "").trim().toUpperCase();
    espnCorePositionCache.set(cacheKey, { value: position, expiresAt: nowTs + 15 * 60_000 });
    return position;
  } catch {
    return "";
  }
}

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
    playerId?: string | null;
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
let lastPlayerDocumentQueueDrainAtMs = 0;
const PAGE_DATA_ROUTE_HOT_TTL_MS = 1200;
const PAGE_DATA_UPSTREAM_HOT_TTL_MS = 900;
const pageDataRouteHotCache = new Map<string, {
  expiresAt: number;
  status: number;
  headers: Array<[string, string]>;
  body: string;
}>();
const pageDataRouteInflight = new Map<string, Promise<{
  status: number;
  headers: Array<[string, string]>;
  body: string;
}>>();
const upstreamJsonHotCache = new Map<string, { expiresAt: number; payload: { ok: boolean; status: number; body: any } }>();
const upstreamJsonInflight = new Map<string, Promise<{ ok: boolean; status: number; body: any }>>();

const now = () => Date.now();

function normalizePageDataRouteCacheKey(url: URL): string {
  const sorted = Array.from(url.searchParams.entries())
    .sort(([ak, av], [bk, bv]) => {
      if (ak === bk) return av.localeCompare(bv);
      return ak.localeCompare(bk);
    })
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return `${url.pathname}?${sorted}`;
}

function isPageDataRouteCacheEligible(pathname: string): boolean {
  return pathname.endsWith("/games")
    || pathname.endsWith("/game-detail")
    || pathname.endsWith("/odds")
    || pathname.endsWith("/player-profile");
}

pageDataRouter.use("*", async (c, next) => {
  const startedAt = now();
  const url = new URL(c.req.url);
  const fresh = ["1", "true", "yes"].includes(String(url.searchParams.get("fresh") || "").toLowerCase());
  const eligible = c.req.method === "GET" && !fresh && isPageDataRouteCacheEligible(url.pathname);
  if (!eligible) {
    await next();
    return;
  }
  const routeKey = `GET:${normalizePageDataRouteCacheKey(url)}`;
  const hot = pageDataRouteHotCache.get(routeKey);
  if (hot && hot.expiresAt > now()) {
    const headers = new Headers(hot.headers);
    headers.set("x-page-data-route-cache", "hot");
    headers.set("x-page-data-assembly-ms", String(Math.max(0, now() - startedAt)));
    headers.set("x-page-data-response-bytes", String(new TextEncoder().encode(hot.body).length));
    headers.set("x-page-data-upstream-ms", "0");
    console.log(
      JSON.stringify({
        event: "page_data_perf",
        path: url.pathname,
        cache: "hot",
        totalMs: Math.max(0, now() - startedAt),
        upstreamMs: 0,
        responseBytes: new TextEncoder().encode(hot.body).length,
        status: hot.status,
      })
    );
    return new Response(hot.body, { status: hot.status, headers });
  }
  const inflight = pageDataRouteInflight.get(routeKey);
  if (inflight) {
    const shared = await inflight;
    const headers = new Headers(shared.headers);
    headers.set("x-page-data-route-cache", "inflight");
    headers.set("x-page-data-assembly-ms", String(Math.max(0, now() - startedAt)));
    headers.set("x-page-data-response-bytes", String(new TextEncoder().encode(shared.body).length));
    headers.set("x-page-data-upstream-ms", "0");
    console.log(
      JSON.stringify({
        event: "page_data_perf",
        path: url.pathname,
        cache: "inflight",
        totalMs: Math.max(0, now() - startedAt),
        upstreamMs: 0,
        responseBytes: new TextEncoder().encode(shared.body).length,
        status: shared.status,
      })
    );
    return new Response(shared.body, { status: shared.status, headers });
  }

  const pending = (async () => {
    await next();
    const clone = c.res.clone();
    const body = await clone.text();
    const snapshot = {
      status: c.res.status,
      headers: Array.from(c.res.headers.entries()),
      body,
    };
    if (c.res.ok) {
      pageDataRouteHotCache.set(routeKey, {
        ...snapshot,
        expiresAt: now() + PAGE_DATA_ROUTE_HOT_TTL_MS,
      });
    }
    return snapshot;
  })();
  pageDataRouteInflight.set(routeKey, pending);
  try {
    const snapshot = await pending;
    const totalMs = Math.max(0, now() - startedAt);
    const upstreamMsRaw = Number(c.get("pageDataUpstreamMs") || 0);
    const upstreamMs = Number.isFinite(upstreamMsRaw) ? Math.max(0, Math.round(upstreamMsRaw)) : 0;
    c.res.headers.set("x-page-data-route-cache", "miss");
    c.res.headers.set("x-page-data-assembly-ms", String(totalMs));
    c.res.headers.set("x-page-data-upstream-ms", String(upstreamMs));
    c.res.headers.set("x-page-data-response-bytes", String(new TextEncoder().encode(snapshot.body).length));
    console.log(
      JSON.stringify({
        event: "page_data_perf",
        path: url.pathname,
        cache: "miss",
        totalMs,
        upstreamMs,
        responseBytes: new TextEncoder().encode(snapshot.body).length,
        status: snapshot.status,
      })
    );
  } finally {
    pageDataRouteInflight.delete(routeKey);
  }
});

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

function normalizeSportForIdentity(sportRaw: string): string {
  const s = normalizeSport(sportRaw);
  if (s === "CBB") return "NCAAB";
  if (s === "CFB") return "NCAAF";
  return s;
}

function normalizeTokenForCache(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

function normalizeCompactTokenForCache(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeEntityToken(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isValidEspnAthleteId(value: unknown): boolean {
  return /^\d{3,}$/.test(String(value || "").trim());
}

type BulkBuildPlayerInput = { playerId: string; playerName: string };
type BulkBuildJobSnapshot = {
  jobId: string;
  sport: string;
  teamId: string | null;
  total: number;
  completed: number;
  ready: number;
  failed: number;
  retriesTriggered: number;
  failedPlayers: Array<{ playerId: string; reason: string }>;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "done";
};

const bulkBuildJobs = new Map<string, BulkBuildJobSnapshot>();

function findLatestBulkJobSnapshot(
  sport: string,
  teamId: string | null
): BulkBuildJobSnapshot | null {
  const s = String(sport || "").trim().toUpperCase();
  const t = teamId ? String(teamId).trim() : "";
  let latest: BulkBuildJobSnapshot | null = null;
  for (const snapshot of bulkBuildJobs.values()) {
    if (String(snapshot.sport || "").trim().toUpperCase() !== s) continue;
    if (t && String(snapshot.teamId || "").trim() !== t) continue;
    if (!latest) {
      latest = snapshot;
      continue;
    }
    const currTime = Date.parse(String(snapshot.startedAt || ""));
    const prevTime = Date.parse(String(latest.startedAt || ""));
    if (Number.isFinite(currTime) && Number.isFinite(prevTime) && currTime > prevTime) {
      latest = snapshot;
    }
  }
  return latest;
}

function isProfileFullyReadyForClick(profile: Record<string, unknown> | null | undefined): boolean {
  return evaluatePlayerProfileCoreReadiness(profile).ready;
}

function hasAnyRecentPropLine(profile: Record<string, unknown> | null | undefined): boolean {
  const rows = Array.isArray((profile as any)?.recentPerformance)
    ? ((profile as any).recentPerformance as Array<any>)
    : [];
  for (const row of rows) {
    const lines = row?.propLines;
    if (!lines || typeof lines !== "object") continue;
    for (const value of Object.values(lines as Record<string, unknown>)) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) return true;
    }
  }
  return false;
}

async function readStoredPlayerReadyProfile(
  db: D1Database,
  sport: string,
  playerId: string
): Promise<Record<string, unknown> | null> {
  const raw = await getStoredPlayerDocumentJson(db, sport, playerId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredPlayerDocumentV1;
    const profile = (parsed?.data?.profile || null) as Record<string, unknown> | null;
    if (!isProfileFullyReadyForClick(profile)) return null;
    return profile;
  } catch {
    return null;
  }
}

async function buildPlayerUntilReady(params: {
  db: D1Database;
  env: Env;
  origin: string;
  sport: string;
  playerId: string;
  playerNameHint: string;
  maxAttempts: number;
}): Promise<{ ready: boolean; attempts: number; reason: string | null }> {
  const attemptDirectHydration = async (): Promise<boolean> => {
    const livePath = `/api/player/${encodeURIComponent(String(params.sport || "").toLowerCase())}/${encodeURIComponent(params.playerId)}?fresh=1`;
    const liveRes = await readJsonWithBudget(`${params.origin}${livePath}`, 9000);
    const liveProfile = liveRes.ok && liveRes.body && typeof liveRes.body === "object"
      ? (liveRes.body as Record<string, unknown>)
      : null;
    if (liveProfile && typeof (liveProfile as any).player === "object" && (liveProfile as any).player) {
      const playerObj = { ...((liveProfile as any).player as Record<string, unknown>) };
      const displayName = String(playerObj.displayName || playerObj.name || "").trim();
      if (!displayName || isPlayerProfileDisplayNameFallback(displayName)) {
        playerObj.displayName = params.playerNameHint;
        playerObj.name = params.playerNameHint;
      }
      playerObj.id = String(playerObj.id || playerObj.espnId || params.playerId).trim();
      playerObj.espnId = String(playerObj.espnId || playerObj.id || params.playerId).trim();
      playerObj.headshotPlayerId = String(playerObj.id || params.playerId).trim();
      if (playerObj.__documentPending === true) {
        delete playerObj.__documentPending;
      }
      (liveProfile as any).player = playerObj;
    }
    if (!liveProfile || !isProfileFullyReadyForClick(liveProfile)) return false;
    const displayName = String((liveProfile as any)?.player?.displayName || (liveProfile as any)?.player?.name || params.playerNameHint || params.playerId).trim() || params.playerId;
    await upsertPlayerDocumentV1(
      params.db,
      {
        schemaVersion: 1,
        meta: {
          sport: params.sport,
          playerName: displayName,
          playerId: params.playerId,
          partialReason: null,
        },
        data: {
          profile: liveProfile,
          canonicalTeamRouteId: null,
        },
      },
      new Date().toISOString()
    );
    return true;
  };
  const attempts = Math.max(1, params.maxAttempts);
  for (let i = 0; i < attempts; i += 1) {
    const built = await buildPlayerDocument({
      db: params.db,
      env: params.env as any,
      sport: params.sport,
      playerId: params.playerId,
      playerNameHint: params.playerNameHint,
      origin: params.origin,
    });
    if (!built.ok) {
      if (i >= attempts - 1) {
        return {
          ready: false,
          attempts: i + 1,
          reason: "reason" in built ? built.reason : "build_failed",
        };
      }
      continue;
    }
    const ready = await readStoredPlayerReadyProfile(params.db, params.sport, params.playerId);
    if (ready) return { ready: true, attempts: i + 1, reason: null };
    try {
      const hydrated = await attemptDirectHydration();
      if (hydrated) {
        const readyAfterHydration = await readStoredPlayerReadyProfile(params.db, params.sport, params.playerId);
        if (readyAfterHydration) return { ready: true, attempts: i + 1, reason: null };
      }
    } catch {
      // Continue retry loop.
    }
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  return { ready: false, attempts, reason: "not_ready_after_retries" };
}

async function runBulkRosterBuild(params: {
  db: D1Database;
  env: Env;
  origin: string;
  sport: string;
  teamId?: string | null;
  players: BulkBuildPlayerInput[];
  concurrency?: number;
  maxAttempts?: number;
}): Promise<BulkBuildJobSnapshot> {
  const canonicalInputs = await Promise.all(
    (Array.isArray(params.players) ? params.players : []).map(async (p) => {
      const playerId = String(p?.playerId || "").trim();
      const playerName = String(p?.playerName || "").trim();
      if (!isValidEspnAthleteId(playerId)) return null;
      const canonical = await resolveCanonicalPlayerIdentity({
        db: params.db,
        sport: params.sport,
        playerId,
        playerName: playerName || playerId,
        source: "runBulkRosterBuild",
      });
      if (!canonical.ok) return null;
      return {
        playerId: canonical.identity.espnPlayerId,
        playerName: canonical.identity.displayName || playerName || canonical.identity.espnPlayerId,
      };
    })
  );
  const uniquePlayers = Array.from(
    new Map(
      canonicalInputs
        .filter((p): p is BulkBuildPlayerInput => Boolean(p))
        .map((p) => [p.playerId, p] as const)
    ).values()
  );
  const jobId = `${params.sport}:${String(params.teamId || "none")}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const snapshot: BulkBuildJobSnapshot = {
    jobId,
    sport: params.sport,
    teamId: params.teamId ? String(params.teamId) : null,
    total: uniquePlayers.length,
    completed: 0,
    ready: 0,
    failed: 0,
    retriesTriggered: 0,
    failedPlayers: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
  };
  bulkBuildJobs.set(jobId, snapshot);

  const concurrency = Math.max(5, Math.min(8, Number(params.concurrency || 6)));
  const maxAttempts = Math.max(1, Math.min(6, Number(params.maxAttempts || 4)));
  for (let i = 0; i < uniquePlayers.length; i += concurrency) {
    const chunk = uniquePlayers.slice(i, i + concurrency);
    let pending = [...chunk];
    for (let attempt = 1; attempt <= maxAttempts && pending.length > 0; attempt += 1) {
      const results = await Promise.all(
        pending.map(async (row) => {
          const result = await buildPlayerUntilReady({
            db: params.db,
            env: params.env,
            origin: params.origin,
            sport: params.sport,
            playerId: row.playerId,
            playerNameHint: row.playerName || row.playerId,
            maxAttempts: 1,
          });
          return { row, result };
        })
      );
      const nextPending: BulkBuildPlayerInput[] = [];
      for (const item of results) {
        if (item.result.ready) {
          snapshot.completed += 1;
          snapshot.ready += 1;
        } else {
          nextPending.push(item.row);
        }
      }
      if (attempt > 1) {
        snapshot.retriesTriggered += pending.length;
      }
      pending = nextPending;
      bulkBuildJobs.set(jobId, { ...snapshot });
      if (pending.length > 0 && attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 900 * attempt));
      }
    }
    if (pending.length > 0) {
      for (const row of pending) {
        const settle = await buildPlayerUntilReady({
          db: params.db,
          env: params.env,
          origin: params.origin,
          sport: params.sport,
          playerId: row.playerId,
          playerNameHint: row.playerName || row.playerId,
          maxAttempts: 2,
        });
        snapshot.retriesTriggered += Math.max(0, settle.attempts);
        snapshot.completed += 1;
        if (settle.ready) {
          snapshot.ready += 1;
        } else {
          snapshot.failed += 1;
          snapshot.failedPlayers.push({
            playerId: row.playerId,
            reason: settle.reason || "not_ready_after_retries",
          });
        }
        bulkBuildJobs.set(jobId, { ...snapshot });
      }
    }
    bulkBuildJobs.set(jobId, { ...snapshot });
  }
  snapshot.status = "done";
  snapshot.finishedAt = new Date().toISOString();
  bulkBuildJobs.set(jobId, snapshot);
  return snapshot;
}

function isLoopbackHost(hostname: string): boolean {
  const h = String(hostname || "").trim().toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function isLocalDevRequest(urlValue: string): boolean {
  try {
    const u = new URL(urlValue);
    return isLoopbackHost(u.hostname);
  } catch {
    return false;
  }
}

function maybeSchedulePlayerDocumentQueueDrain(
  c: any,
  origin: string,
  limit = 40,
  minIntervalMs = 15_000
): void {
  if (!c?.env?.DB || !c?.executionCtx?.waitUntil) return;
  const nowMs = Date.now();
  if (nowMs - lastPlayerDocumentQueueDrainAtMs < minIntervalMs) return;
  lastPlayerDocumentQueueDrainAtMs = nowMs;
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const { processPlayerDocumentQueue } = await import("../services/playerDocuments/ingestion");
        await processPlayerDocumentQueue({
          db: c.env.DB,
          env: c.env as any,
          origin,
          limit,
        });
      } catch {
        // Non-fatal background queue drain.
      }
    })()
  );
}

function tokenizePlayerName(value: unknown): string[] {
  const suffixes = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
  return normalizeEntityToken(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !suffixes.has(token));
}

function isPlayerIdentityMatch(
  requestedName: string,
  candidateName: unknown,
  expectedPlayerId?: string | null,
  candidatePlayerId?: unknown
): boolean {
  const expectedId = normalizeCompactTokenForCache(String(expectedPlayerId || ""));
  const actualId = normalizeCompactTokenForCache(String(candidatePlayerId || ""));
  if (expectedId) return expectedId === actualId;
  const requestedTokens = tokenizePlayerName(requestedName);
  const actualTokens = tokenizePlayerName(candidateName);
  if (requestedTokens.length === 0 || actualTokens.length === 0) return false;
  if (requestedTokens.join(" ") === actualTokens.join(" ")) return true;
  if (requestedTokens.slice().sort().join(" ") === actualTokens.slice().sort().join(" ")) return true;
  const overlap = requestedTokens.filter((token) => actualTokens.includes(token)).length;
  return overlap >= Math.min(2, requestedTokens.length, actualTokens.length);
}

function buildPlayerProfileCacheKeyCandidates(
  sport: string,
  playerNames: string[],
  expectedPlayerId?: string | null
): string[] {
  const out = new Set<string>();
  const normalizedId = normalizeCompactTokenForCache(String(expectedPlayerId || ""));
  if (normalizedId) {
    out.add(pageDataGenericKey("player_profile", { v: "v1", sport, playerId: normalizedId }));
  }
  for (const candidate of playerNames) {
    const normalized = String(candidate || "").trim().toLowerCase();
    const normalizedSlug = normalizeTokenForCache(candidate);
    if (!normalized) continue;
    out.add(pageDataGenericKey("player_profile", { v: "v1", sport, playerName: normalized }));
    if (normalizedSlug && normalizedSlug !== normalized) {
      out.add(pageDataGenericKey("player_profile", { v: "v1", sport, playerName: normalizedSlug }));
    }
  }
  return Array.from(out);
}

function candidateSportsForPlayerLookup(requestedSport: string): string[] {
  const sport = normalizeSport(requestedSport);
  // Strict sport lock: never hydrate with a different league's history.
  return sport ? [sport] : [];
}

function buildTeamIdCandidates(teamIdRaw: string): string[] {
  const raw = String(teamIdRaw || "").trim();
  if (!raw) return [];
  const upper = raw.toUpperCase();
  const aliasMap: Record<string, string[]> = {
    GSW: ["GS"], GS: ["GSW"], NYK: ["NY"], NY: ["NYK"], SAS: ["SA"], SA: ["SAS"],
    NOP: ["NO"], NO: ["NOP"], PHX: ["PHO"], PHO: ["PHX"], CHA: ["CHO"], CHO: ["CHA"],
    BKN: ["BRK"], BRK: ["BKN"], PHL: ["PHI"], PHI: ["PHL"],
  };
  return Array.from(new Set([raw, upper, ...((aliasMap[upper] || []).map((x) => x.trim()).filter(Boolean))]));
}

const NBA_ALIAS_TO_LEGACY_TEAM_ID: Record<string, string> = {
  ATL: "1",
  BOS: "2",
  BKN: "17",
  CHA: "30",
  CHI: "4",
  CLE: "5",
  DAL: "6",
  DEN: "7",
  DET: "8",
  GS: "9",
  GSW: "9",
  HOU: "10",
  IND: "11",
  LAC: "12",
  LAL: "13",
  MEM: "29",
  MIA: "14",
  MIL: "15",
  MIN: "16",
  NOP: "3",
  NO: "3",
  NYK: "18",
  NY: "18",
  OKC: "25",
  ORL: "19",
  PHI: "20",
  PHL: "20",
  PHX: "21",
  PHO: "21",
  POR: "22",
  SAC: "23",
  SAS: "24",
  SA: "24",
  TOR: "28",
  UTA: "26",
  UTAH: "26",
  WAS: "27",
};

function buildNbaTeamIdCandidates(teamIdRaw: string): string[] {
  const base = buildTeamIdCandidates(teamIdRaw);
  const upper = String(teamIdRaw || "").trim().toUpperCase();
  const out = new Set<string>(base);
  if (upper && NBA_ALIAS_TO_LEGACY_TEAM_ID[upper]) {
    out.add(NBA_ALIAS_TO_LEGACY_TEAM_ID[upper]);
  }
  if (/^\d+$/.test(upper)) {
    const reverseAliases = Object.entries(NBA_ALIAS_TO_LEGACY_TEAM_ID)
      .filter(([, id]) => id === upper)
      .map(([alias]) => alias);
    for (const alias of reverseAliases) out.add(alias);
  }
  return Array.from(out);
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

function extractGameIdTerminalToken(value: unknown): string | null {
  const normalized = normalizeGameId(value);
  if (!normalized) return null;
  const token = normalized.split(/[_:]/g).filter(Boolean).pop() || "";
  if (!token) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(token)) return token;
  if (/^\d{6,}$/.test(token)) return token;
  return null;
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

function normalizeOddsTeamToken(value: unknown): string {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const parts = cleaned.split(" ").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : "";
}

function buildSyntheticSummaryFromLiveOddsMap(game: any, sport: string, oddsMap: Record<string, any>): any | null {
  if (!oddsMap || typeof oddsMap !== "object") return null;
  const gameId = String(game?.game_id || game?.id || "").trim();
  if (!gameId) return null;
  const sportLower = String(sport || game?.sport || "").trim().toLowerCase();
  if (!sportLower) return null;
  const homeCode = normalizeOddsTeamToken(game?.home_team_code);
  const awayCode = normalizeOddsTeamToken(game?.away_team_code);
  const homeName = normalizeOddsTeamToken(game?.home_team_name);
  const awayName = normalizeOddsTeamToken(game?.away_team_name);
  const lookupKeys = [
    `${sportLower}|${awayCode}|${homeCode}`,
    `${sportLower}|${awayName}|${homeName}`,
    `${sportLower}|${awayCode || awayName}|${homeCode || homeName}`,
  ];
  const liveOdds = lookupKeys
    .map((key) => oddsMap[key])
    .find((candidate) => candidate && typeof candidate === "object");
  if (!liveOdds) return null;
  const toFinite = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const spreadHome = toFinite(liveOdds.spreadHome ?? liveOdds.spread ?? null);
  const spreadAway = toFinite(liveOdds.spreadAway ?? (spreadHome !== null ? -spreadHome : null));
  const total = toFinite(liveOdds.total);
  const mlHome = toFinite(liveOdds.moneylineHome);
  const mlAway = toFinite(liveOdds.moneylineAway);
  const spread1HHome = toFinite(liveOdds.spread1HHome);
  const spread1HAway = toFinite(liveOdds.spread1HAway);
  const total1H = toFinite(liveOdds.total1H);
  const ml1HHome = toFinite(liveOdds.moneyline1HHome);
  const ml1HAway = toFinite(liveOdds.moneyline1HAway);
  if (
    spreadHome === null &&
    spreadAway === null &&
    total === null &&
    mlHome === null &&
    mlAway === null &&
    spread1HHome === null &&
    spread1HAway === null &&
    total1H === null &&
    ml1HHome === null &&
    ml1HAway === null
  ) {
    return null;
  }
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
    spread: spreadHome === null ? null : { home_line: spreadHome, away_line: spreadAway },
    total: total === null ? null : { line: total },
    moneyline: mlHome === null && mlAway === null ? null : { home_price: mlHome, away_price: mlAway },
    first_half:
      spread1HHome === null &&
      spread1HAway === null &&
      total1H === null &&
      ml1HHome === null &&
      ml1HAway === null
        ? null
        : {
            spread: spread1HHome === null ? null : { home_line: spread1HHome, away_line: spread1HAway },
            total: total1H === null ? null : { line: total1H },
            moneyline: ml1HHome === null && ml1HAway === null ? null : { home_price: ml1HHome, away_price: ml1HAway },
          },
    source: "sportsradar_odds_live_recovery",
    fallback_type: "live_odds_matchup",
    fallback_reason: "Recovered odds from SportsRadar sport odds map when cached summaries were sparse",
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

function buildDateCandidates(dateHint: string, spanDays = 7): string[] {
  const maxSpan = Math.max(0, Math.min(14, Math.trunc(spanDays)));
  const seen = new Set<string>();
  const ordered: string[] = [];
  const push = (value: string) => {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    ordered.push(normalized);
  };
  push(dateHint);
  for (let step = 1; step <= maxSpan; step += 1) {
    push(shiftDateYmd(dateHint, -step));
    push(shiftDateYmd(dateHint, step));
  }
  return ordered;
}

function findGameById(rows: any[], gameId: string, sport: string | null): any | null {
  const id = normalizeGameId(gameId);
  if (!id) return null;
  const idToken = extractGameIdTerminalToken(id);
  const targetSport = String(sport || "").trim().toUpperCase();
  for (const row of rows) {
    const rowId = normalizeGameId(row?.game_id || row?.id);
    if (!rowId) continue;
    const exactMatch = rowId === id;
    const tokenMatch = !exactMatch
      && Boolean(idToken)
      && extractGameIdTerminalToken(rowId) === idToken;
    if (!exactMatch && !tokenMatch) continue;
    if (targetSport && String(row?.sport || "").trim().toUpperCase() !== targetSport) continue;
    return row;
  }
  return null;
}

function readProbablePitcherName(game: any, side: "away" | "home"): string {
  return String(
    game?.[side === "away" ? "probable_away_pitcher_name" : "probable_home_pitcher_name"]
    || game?.probable_pitchers?.[side]?.name
    || ""
  ).trim();
}

function readProbablePitcherRecord(game: any, side: "away" | "home"): string {
  return String(
    game?.[side === "away" ? "probable_away_pitcher_record" : "probable_home_pitcher_record"]
    || game?.probable_pitchers?.[side]?.record
    || ""
  ).trim();
}

function hasMlbProbablePitchers(game: any): boolean {
  return Boolean(readProbablePitcherName(game, "away") || readProbablePitcherName(game, "home"));
}

function mergeMlbProbablePitchers(base: any, incoming: any): any {
  if (!base || !incoming) return base;
  const awayName = readProbablePitcherName(base, "away") || readProbablePitcherName(incoming, "away");
  const homeName = readProbablePitcherName(base, "home") || readProbablePitcherName(incoming, "home");
  const awayRecord = readProbablePitcherRecord(base, "away") || readProbablePitcherRecord(incoming, "away");
  const homeRecord = readProbablePitcherRecord(base, "home") || readProbablePitcherRecord(incoming, "home");
  return {
    ...base,
    probable_away_pitcher_name: awayName || undefined,
    probable_away_pitcher_record: awayRecord || undefined,
    probable_home_pitcher_name: homeName || undefined,
    probable_home_pitcher_record: homeRecord || undefined,
    probable_pitchers: (awayName || homeName)
      ? {
          away: awayName ? { name: awayName, record: awayRecord || undefined } : undefined,
          home: homeName ? { name: homeName, record: homeRecord || undefined } : undefined,
        }
      : undefined,
  };
}

function enrichGamesWithMlbProbables(baseGames: any[], mlbGames: any[]): any[] {
  if (!Array.isArray(baseGames) || baseGames.length === 0) return baseGames;
  if (!Array.isArray(mlbGames) || mlbGames.length === 0) return baseGames;
  const byId = new Map<string, any>();
  for (const row of mlbGames) {
    if (!row || typeof row !== "object") continue;
    const id = normalizeGameId(row?.game_id || row?.id);
    if (!id) continue;
    if (!hasMlbProbablePitchers(row)) continue;
    byId.set(id, row);
  }
  if (byId.size === 0) return baseGames;
  return baseGames.map((row) => {
    if (String(row?.sport || "").trim().toUpperCase() !== "MLB") return row;
    if (hasMlbProbablePitchers(row)) return row;
    const id = normalizeGameId(row?.game_id || row?.id);
    if (!id) return row;
    const incoming = byId.get(id);
    if (!incoming) return row;
    return mergeMlbProbablePitchers(row, incoming);
  });
}

async function readGameFromSnapshots(db: D1Database, params: {
  gameId: string;
  sport: string | null;
  dateHint: string;
}): Promise<{ game: any | null; source: string | null }> {
  const gameId = normalizeGameId(params.gameId);
  if (!gameId) return { game: null, source: null };
  const dateCandidates = buildDateCandidates(params.dateHint, 7);
  const targetSport = String(params.sport || "").trim().toUpperCase();
  const shouldEnrichMlbPitchers = targetSport === "MLB";

  for (const date of dateCandidates) {
    const exact = await readPageDataGamesSnapshot(db, date, params.sport || "ALL");
    const exactGame = findGameById(exact.games, gameId, params.sport);

    const all = await readPageDataGamesSnapshot(db, date, "ALL");
    const allGame = findGameById(all.games, gameId, params.sport);

    const persistent = await readGamesFromDateScopedPersistentCache(db, date, params.sport || "ALL");
    const persistentGame = findGameById(persistent.games, gameId, params.sport);
    const candidates = [
      { game: exactGame, source: exact.source || "page_data_games_exact" },
      { game: allGame, source: all.source || "page_data_games_all" },
      { game: persistentGame, source: persistent.source || "games_list_date_scoped" },
    ];
    const selected = candidates.find((entry) => Boolean(entry.game));
    if (!selected || !selected.game) continue;

    if (!shouldEnrichMlbPitchers || hasMlbProbablePitchers(selected.game)) {
      return { game: selected.game, source: selected.source };
    }

    const enrichment = candidates.find((entry) => entry.game && hasMlbProbablePitchers(entry.game));
    if (enrichment?.game) {
      return {
        game: mergeMlbProbablePitchers(selected.game, enrichment.game),
        source: `${selected.source};pitcher_enriched:${enrichment.source}`,
      };
    }
    return { game: selected.game, source: selected.source };
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

  const dateCandidates = buildDateCandidates(params.dateHint, 7);
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
  const method = String(init?.method || "GET").toUpperCase();
  const cacheable = method === "GET";
  const cacheKey = `${method}:${url}`;
  if (cacheable) {
    const hot = upstreamJsonHotCache.get(cacheKey);
    if (hot && hot.expiresAt > now()) {
      return hot.payload;
    }
    const existing = upstreamJsonInflight.get(cacheKey);
    if (existing) {
      return existing;
    }
  }
  const requestPromise = (async (): Promise<{ ok: boolean; status: number; body: any }> => {
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
  })();
  if (cacheable) {
    upstreamJsonInflight.set(cacheKey, requestPromise);
  }
  try {
    const payload = await requestPromise;
    if (cacheable && payload.ok) {
      upstreamJsonHotCache.set(cacheKey, {
        expiresAt: now() + PAGE_DATA_UPSTREAM_HOT_TTL_MS,
        payload,
      });
    }
    return payload;
  } finally {
    if (cacheable) upstreamJsonInflight.delete(cacheKey);
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

function createPageDataWarmFetchFn(c: any, reason: string): WarmFetchFn {
  const origin = new URL(c.req.url).origin;
  const headers = buildForwardHeaders(c);
  const internalWarmKey = String(c.env.PAGE_DATA_WARM_BYPASS_KEY || c.env.MOCHA_USERS_SERVICE_API_KEY || "").trim();
  headers.set("x-page-data-warm", "1");
  if (reason) headers.set("x-page-data-warm-reason", reason);
  if (internalWarmKey) headers.set("x-page-data-admin-key", internalWarmKey);
  return async (pathWithQuery: string) => {
    try {
      const response = await fetch(`${origin}${pathWithQuery}`, { method: "GET", headers });
      const body = await response.json().catch(() => null);
      return { ok: response.ok, status: response.status, body };
    } catch {
      return { ok: false, status: 0, body: null };
    }
  };
}

function extractVisiblePlayerNamesBySportFromGames(games: any[]): Map<string, string[]> {
  const bySport = new Map<string, Set<string>>();
  for (const g of games) {
    const s = String(g?.sport || "").trim().toUpperCase();
    if (!s || s === "ALL") continue;
    if (!bySport.has(s)) bySport.set(s, new Set());
    const set = bySport.get(s)!;

    const fromRow = (row: any) => {
      const name = normalizePlayerNameForWarm(
        row?.player_name ?? row?.playerName ?? row?.full_name ?? row?.display_name ?? row?.name ?? ""
      );
      if (name) set.add(name);
    };

    for (const k of ["home_pitcher", "away_pitcher", "starting_pitcher_home", "starting_pitcher_away"] as const) {
      const v = g?.[k];
      if (typeof v === "string") {
        const name = normalizePlayerNameForWarm(v);
        if (name) set.add(name);
      } else if (v && typeof v === "object") fromRow(v);
    }

    const rowArrays = [
      ...(Array.isArray(g?.props) ? g.props : []),
      ...(Array.isArray(g?.player_props) ? g.player_props : []),
      ...(Array.isArray(g?.featured_props) ? g.featured_props : []),
      ...(Array.isArray(g?.starting_lineups?.home) ? g.starting_lineups.home : []),
      ...(Array.isArray(g?.starting_lineups?.away) ? g.starting_lineups.away : []),
    ];
    for (const row of rowArrays) fromRow(row);
  }
  return new Map(Array.from(bySport.entries()).map(([k, v]) => [k, Array.from(v)]));
}

function scheduleVisiblePlayersWarmFromGames(c: any, games: any[]): void {
  if (!Array.isArray(games) || games.length === 0) return;
  const grouped = extractVisiblePlayerNamesBySportFromGames(games);
  if (grouped.size === 0) return;
  c.executionCtx.waitUntil((async () => {
    try {
      const fetchFn = createPageDataWarmFetchFn(c, "games-odds-visible-players");
      for (const [sp, names] of grouped) {
        if (!names.length) continue;
        await warmPlayersForSport({
          fetchFn,
          sport: sp,
          playerNames: names,
          maxPlayers: 900,
          concurrency: 12,
        });
      }
    } catch {
      // non-fatal
    }
  })());
}

function playerProfilePageDataL1Key(sport: string, playerId: string): string {
  return buildPlayerDocumentL1CacheKey(normalizeSport(sport), normalizeCompactTokenForCache(playerId));
}

/** Hot player documents: keep L1 longer than generic medium policy so repeat opens stay sub-ms. */
const PLAYER_PROFILE_L1_TTL_MS = 10 * 60_000;
const PLAYER_PROFILE_L1_STALE_MS = 90 * 60_000;

/** Priority prebuild: both teams' rosters for visible games (non-blocking). */
function schedulePlayerDocumentPrebuildFromGamesList(c: any, games: any[]): void {
  if (!Array.isArray(games) || games.length === 0) return;
  const db = c.env.DB as D1Database;
  const fetchFn = createPageDataWarmFetchFn(c, "games-roster-doc-prebuild");
  c.executionCtx.waitUntil((async () => {
    try {
      const { extractRosterPlayersForEnqueue } = await import("../services/playerDocuments/prebuildEnqueue");
      const seenTeam = new Set<string>();
      const maxGames = 40;
      for (const g of games.slice(0, maxGames)) {
        const sport = String(g?.sport || "").trim().toUpperCase();
        if (!sport || sport === "ALL") continue;
        const home = String(
          g?.home_team_id || g?.homeTeamId || g?.home_id || g?.home_team_code || g?.homeTeam || ""
        ).trim();
        const away = String(
          g?.away_team_id || g?.awayTeamId || g?.away_id || g?.away_team_code || g?.awayTeam || ""
        ).trim();
        for (const teamId of [home, away]) {
          if (!teamId) continue;
          const tk = `${sport}:${teamId}`;
          if (seenTeam.has(tk)) continue;
          seenTeam.add(tk);
          try {
            const res = await fetchFn(
              `/api/teams/${encodeURIComponent(sport)}/${encodeURIComponent(teamId)}`
            );
            if (!res.ok || res.body == null) continue;
            const tuples = extractRosterPlayersForEnqueue(res.body);
            for (const t of tuples) {
              await enqueuePlayerDocumentBuild(db, sport, t.playerId, t.name);
            }
          } catch {
            // non-fatal
          }
        }
      }
    } catch {
      // non-fatal
    }
  })());
}

function getHomeAwayTeamIdsForWarm(game: any): { home?: string; away?: string } {
  if (!game || typeof game !== "object") return {};
  const home = String(game.home_team_id || game.home_team_code || game.home_alias || "").trim();
  const away = String(game.away_team_id || game.away_team_code || game.away_alias || "").trim();
  const out: { home?: string; away?: string } = {};
  if (home) out.home = home;
  if (away) out.away = away;
  return out;
}

function resolveGameDetailWarmSport(metaSport: string | null, game: any | null): string {
  const a = String(metaSport || "").trim().toUpperCase();
  if (a && a !== "ALL") return a;
  return String(game?.sport || "").trim().toUpperCase();
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
  if (games.length === 0) return false;
  const oddsCount = Object.keys(payload.oddsSummaryByGame || {}).length;
  // Accept game-bearing snapshots even if odds map is sparse to avoid cold-path blocking.
  return oddsCount > 0 || !payload.degraded;
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
  const sport = normalizeSport(String(payload?.meta?.sport || ""));
  const alias = String(team?.alias || "").trim().toUpperCase();
  if (sport === "NBA" && alias && !NBA_ALIAS_TO_LEGACY_TEAM_ID[alias]) {
    return false;
  }
  const schedule = payload?.data?.scheduleJson || {};
  const scheduleRows = [
    ...(Array.isArray(schedule?.allGames) ? schedule.allGames : []),
    ...(Array.isArray(schedule?.pastGames) ? schedule.pastGames : []),
    ...(Array.isArray(schedule?.upcomingGames) ? schedule.upcomingGames : []),
  ];
  const rosterRows = Array.isArray(payload?.data?.profileJson?.roster) ? payload.data.profileJson.roster : [];
  const injuriesRows = Array.isArray(payload?.data?.injuriesJson?.injuries) ? payload.data.injuriesJson.injuries : [];
  const statsNode = payload?.data?.statsJson?.stats;
  const hasStats = Boolean(statsNode && typeof statsNode === "object" && Object.keys(statsNode).length > 0);
  // Prevent caching identity-only shells that poison team pages.
  return scheduleRows.length > 0 || rosterRows.length > 0 || injuriesRows.length > 0 || hasStats;
}

function hasUsablePlayerProfilePayload(payload: PageDataPlayerProfilePayload | null | undefined): boolean {
  if (!payload) return false;
  if (payload.degraded) return false;
  const profile = payload?.data?.profile;
  if (!profile?.player) return false;
  const displayName = String(profile?.player?.displayName || profile?.player?.name || "").trim();
  const hasIdentity =
    Boolean(String(profile?.player?.id || "").trim())
    || (Boolean(displayName) && !isPlayerProfileDisplayNameFallback(displayName));
  const hasGameLog = Array.isArray(profile?.gameLog) && profile.gameLog.length > 0;
  const hasSeason = Boolean(profile?.seasonAverages && typeof profile.seasonAverages === "object" && Object.keys(profile.seasonAverages).length > 0);
  const hasProps = Array.isArray(profile?.currentProps) && profile.currentProps.length > 0;
  const hasRequiredShapes =
    Array.isArray(profile?.gameLog)
    && Array.isArray(profile?.currentProps)
    && Array.isArray(profile?.recentPerformance)
    && Boolean(profile?.seasonAverages && typeof profile.seasonAverages === "object")
    && Object.prototype.hasOwnProperty.call(profile, "matchup");
  // Strict acceptance: at least one of stats, game logs, or props must exist.
  const hasMeaningfulContent = hasGameLog || hasSeason || hasProps;
  return hasIdentity && hasRequiredShapes && hasMeaningfulContent;
}

function hasUsablePlayerProfilePayloadForSport(
  payload: PageDataPlayerProfilePayload | null | undefined,
  requestedSport: string
): boolean {
  if (!hasUsablePlayerProfilePayload(payload)) return false;
  const requested = normalizeSport(requestedSport);
  const payloadSport = normalizeSport(
    String(payload?.meta?.sport || payload?.data?.profile?.player?.sport || "")
  );
  return Boolean(requested && payloadSport && requested === payloadSport);
}

/** Marks incomplete identity/stat shells so clients do not treat them as finished pages; strips `player-{id}` labels. */
function ensurePlayerProfilePageDataRenderContract(
  payload: PageDataPlayerProfilePayload
): PageDataPlayerProfilePayload {
  const prof = payload?.data?.profile as Record<string, unknown> | undefined;
  if (!prof || !payload.data) return payload;
  const profile = { ...prof } as Record<string, unknown>;
  let profileMutated = false;
  const playerNode = (profile as any).player && typeof (profile as any).player === "object"
    ? { ...((profile as any).player as Record<string, unknown>) }
    : null;
  const profileSport = String(playerNode?.sport || payload?.meta?.sport || "").toUpperCase();
  if (playerNode && profileSport === "MLB") {
    const positionRaw = String(playerNode.position || "").trim().toUpperCase();
    const season = ((profile as any).seasonAverages && typeof (profile as any).seasonAverages === "object")
      ? { ...((profile as any).seasonAverages as Record<string, unknown>) }
      : {};
    const recentRows = Array.isArray((profile as any).recentPerformance) ? (profile as any).recentPerformance : [];
    const currentProps = Array.isArray((profile as any).currentProps) ? (profile as any).currentProps : [];
    const hasPitcherSeasonSignal = ["IP", "ERA", "WHIP", "ER", "earnedRuns", "outsRecorded", "inningsPitched"].some((k) => season[k] !== undefined && season[k] !== null);
    const hasPitcherRecentSignal = recentRows.some((row: any) => {
      const stats = row?.stats && typeof row.stats === "object" ? row.stats : {};
      return ["ER", "OUT", "HA", "BB", "IP"].some((k) => stats[k] !== undefined && stats[k] !== null);
    });
    const hasPitcherPropSignal = currentProps.some((p: any) => {
      const t = String(p?.prop_type || "").toUpperCase();
      return t.includes("PITCHER_STRIKEOUT") || t.includes("OUTS_RECORDED") || t.includes("EARNED_RUN") || t.includes("HITS_ALLOWED") || t.includes("WALKS_ALLOWED");
    });
    const pitcherPositionToken = new Set(["P", "SP", "RP", "CP", "RHP", "LHP"]).has(positionRaw);
    const isPitcher = pitcherPositionToken || hasPitcherSeasonSignal || hasPitcherRecentSignal || hasPitcherPropSignal;
    if (isPitcher) {
      playerNode.roleBucket = "mlb_pitcher";
      playerNode.position = positionRaw || "P";
      (profile as any).currentProps = currentProps.filter((p: any) => {
        const t = String(p?.prop_type || "").toUpperCase();
        return t.includes("PITCHER_STRIKEOUT") || t.includes("OUTS_RECORDED") || t.includes("EARNED_RUN") || t.includes("HITS_ALLOWED") || t.includes("WALKS_ALLOWED") || t.includes("INNINGS_PITCHED");
      });
      (profile as any).recentPerformance = recentRows.map((row: any) => {
        const stats = row?.stats && typeof row.stats === "object" ? row.stats : {};
        const propLines = row?.propLines && typeof row.propLines === "object" ? row.propLines : {};
        return {
          ...row,
          stats: {
            K: stats.K ?? null,
            ER: stats.ER ?? null,
            OUT: stats.OUT ?? null,
            HA: stats.HA ?? null,
            BB: stats.BB ?? null,
            IP: stats.IP ?? null,
          },
          propLines: {
            strikeouts: propLines.strikeouts ?? null,
            earnedRuns: propLines.earnedRuns ?? null,
            outsRecorded: propLines.outsRecorded ?? null,
            hitsAllowed: propLines.hitsAllowed ?? null,
            walksAllowed: propLines.walksAllowed ?? null,
          },
        };
      });
      profileMutated = true;
    } else {
      playerNode.roleBucket = "mlb_hitter";
      profileMutated = true;
    }
    (profile as any).player = playerNode;
  }
  const gameLog = Array.isArray((profile as any).gameLog) ? (profile as any).gameLog : [];
  if (gameLog.length > 0) {
    const existingHealth = ((profile as any).health && typeof (profile as any).health === "object")
      ? { ...((profile as any).health as Record<string, unknown>) }
      : { status: "unknown" };
    const existingTrend = (existingHealth as any).minutesTrend;
    const needsTrendBackfill =
      !existingTrend
      || !Array.isArray(existingTrend.last5)
      || existingTrend.last5.length === 0;
    if (needsTrendBackfill) {
      const minuteValues = gameLog
        .map((g: any) => {
          const raw = g?.minutes ?? g?.stats?.MIN ?? g?.stats?.Min ?? "";
          const parsed = Number.parseFloat(String(raw || "").replace(/[^\d.]/g, ""));
          return Number.isFinite(parsed) ? parsed : null;
        })
        .filter((v: number | null): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
      if (minuteValues.length > 0) {
        const last5 = minuteValues.slice(0, 5);
        const last5Avg = Number((last5.reduce((sum, v) => sum + v, 0) / last5.length).toFixed(1));
        const seasonAvg = Number((minuteValues.reduce((sum, v) => sum + v, 0) / minuteValues.length).toFixed(1));
        const delta = last5Avg - seasonAvg;
        (profile as any).health = {
          ...existingHealth,
          minutesTrend: {
            last5Avg,
            seasonAvg,
            trend: delta > 1 ? "up" : delta < -1 ? "down" : "stable",
            last5,
          },
        };
        profileMutated = true;
      }
    }
  }
  if (isPlayerProfileDocumentCompleteForRender(profile)) {
    if (!profileMutated) return payload;
    return {
      ...payload,
      data: {
        ...payload.data,
        profile,
      },
    };
  }
  const rawPlayer = profile.player;
  if (!rawPlayer || typeof rawPlayer !== "object") return payload;
  const player = { ...(rawPlayer as Record<string, unknown>) };
  const playerId = String(player.id || player.espnId || "").trim();
  const metaName = String(payload.meta.playerName || "").trim();
  const safeMetaName = isPlayerProfileDisplayNameFallback(metaName) ? "" : metaName;
  if (playerId) {
    player.id = playerId;
    if (!String(player.espnId || "").trim()) {
      player.espnId = playerId;
    }
    player.headshotPlayerId = playerId;
  }
  const hasRenderableContent =
    Object.keys((profile as any).seasonAverages || {}).length > 0
    || (Array.isArray((profile as any).gameLog) && (profile as any).gameLog.length > 0)
    || (Array.isArray((profile as any).currentProps) && (profile as any).currentProps.length > 0)
    || (Array.isArray((profile as any).recentPerformance) && (profile as any).recentPerformance.length > 0);
  if (!hasRenderableContent) {
    player.__documentPending = true;
  } else {
    delete player.__documentPending;
  }
  if (isPlayerProfileDisplayNameFallback(player.displayName)) {
    player.displayName = safeMetaName;
  }
  if (isPlayerProfileDisplayNameFallback(player.name)) {
    player.name = safeMetaName;
  }
  return {
    ...payload,
    meta: {
      ...payload.meta,
      playerName: safeMetaName,
      partialReason: payload.meta.partialReason || "profile_incomplete",
    },
    data: {
      ...payload.data,
      profile: {
        ...profile,
        player,
      },
    },
  };
}

function buildPlayerProfileDegradedShell(
  sport: string,
  playerId: string,
  playerName: string,
  partialReason: string,
  freshness: PageDataPlayerProfilePayload["freshness"],
): PageDataPlayerProfilePayload {
  const safeName = String(playerName || "").trim();
  const fallbackName = safeName && !isPlayerProfileDisplayNameFallback(safeName)
    ? safeName
    : `Athlete ${playerId}`;
  return ensurePlayerProfilePageDataRenderContract({
    route: "player-profile",
    generatedAt: new Date().toISOString(),
    freshness,
    degraded: true,
    meta: {
      sport,
      playerName: fallbackName,
      playerId,
      partialReason,
    },
    data: {
      canonicalTeamRouteId: null,
      profile: {
        player: {
          id: playerId,
          espnId: playerId,
          displayName: fallbackName,
          name: fallbackName,
          sport,
          __documentPending: true,
        },
        seasonAverages: {},
        gameLog: [],
        currentProps: [],
        recentPerformance: [],
        matchup: null,
      },
    },
  });
}

function isNumericPlayerToken(value: unknown): boolean {
  const compact = normalizeCompactTokenForCache(String(value || ""));
  return /^\d{4,}$/.test(compact);
}

function pickPreferredPlayerDisplayName(
  livePlayer: any,
  requestedCandidates: Array<string | null | undefined>
): string {
  const liveDisplay = String(livePlayer?.displayName || livePlayer?.name || "").trim();
  if (!isNumericPlayerToken(liveDisplay)) {
    return liveDisplay;
  }
  for (const candidate of requestedCandidates) {
    const name = String(candidate || "").trim();
    if (!name) continue;
    if (name.toLowerCase().startsWith("player-")) continue;
    if (isNumericPlayerToken(name)) continue;
    return name;
  }
  return liveDisplay;
}

async function readArchivedLastGoodPlayerProfile(
  db: D1Database,
  cacheKeys: string[],
  sport: string,
  requestedName: string,
  expectedPlayerId?: string | null
): Promise<PageDataPlayerProfilePayload | null> {
  const uniqueKeys = Array.from(new Set(cacheKeys.filter(Boolean)));
  for (const key of uniqueKeys) {
    try {
      const row = await db
        .prepare(`
          SELECT data_json
          FROM api_cache
          WHERE cache_key = ?
          ORDER BY updated_at DESC
          LIMIT 1
        `)
        .bind(key)
        .first<{ data_json: string }>();
      if (!row?.data_json) continue;
      const parsed = JSON.parse(String(row.data_json || "{}")) as PageDataPlayerProfilePayload;
      if (
        hasUsablePlayerProfilePayloadForSport(parsed, sport)
        && isPlayerIdentityMatch(
          requestedName,
          parsed?.data?.profile?.player?.displayName || parsed?.data?.profile?.player?.name || "",
          expectedPlayerId,
          parsed?.data?.profile?.player?.espnId || parsed?.data?.profile?.player?.id
        )
      ) {
        return parsed;
      }
    } catch {
      // Non-fatal; continue scanning candidates.
    }
  }
  return null;
}

async function readRecentPlayerProfileArchiveByIdentity(
  db: D1Database,
  sport: string,
  requestedName: string,
  expectedPlayerId?: string | null
): Promise<PageDataPlayerProfilePayload | null> {
  try {
    const rows = await db
      .prepare(`
        SELECT data_json
        FROM api_cache
        WHERE (
          cache_key LIKE 'page_data_player_profile_v1:%'
          OR cache_key LIKE 'page_data_player_profile_v1_backup:%'
        )
        ORDER BY updated_at DESC
        LIMIT 220
      `)
      .all<{ data_json: string }>();
    const results = Array.isArray(rows?.results) ? rows.results : [];
    for (const row of results) {
      if (!row?.data_json) continue;
      try {
        const parsed = JSON.parse(String(row.data_json || "{}")) as PageDataPlayerProfilePayload;
        const parsedSport = normalizeSport(String(parsed?.meta?.sport || ""));
        if (parsedSport !== sport) continue;
        if (!hasUsablePlayerProfilePayload(parsed)) continue;
        const parsedName = parsed?.data?.profile?.player?.displayName || parsed?.data?.profile?.player?.name || "";
        const parsedId = parsed?.data?.profile?.player?.espnId || parsed?.data?.profile?.player?.id;
        if (!isPlayerIdentityMatch(requestedName, parsedName, expectedPlayerId, parsedId)) continue;
        return parsed;
      } catch {
        // Skip malformed cached rows.
      }
    }
  } catch {
    // Non-fatal fallback scan.
  }
  return null;
}

async function readRecentPlayerProfileArchiveByPlayerId(
  db: D1Database,
  sport: string,
  requestedName: string,
  expectedPlayerId?: string | null
): Promise<PageDataPlayerProfilePayload | null> {
  const expectedId = normalizeCompactTokenForCache(String(expectedPlayerId || ""));
  if (!expectedId) return null;
  try {
    const idPatterns = [
      `%\"espnId\":\"${expectedId}\"%`,
      `%\"id\":\"${expectedId}\"%`,
      `%\"playerId\":\"${expectedId}\"%`,
    ];
    const rows = await db
      .prepare(`
        SELECT data_json
        FROM api_cache
        WHERE (
          cache_key LIKE 'page_data_player_profile_v1:%'
          OR cache_key LIKE 'page_data_player_profile_v1_backup:%'
        )
        AND (
          data_json LIKE ?
          OR data_json LIKE ?
          OR data_json LIKE ?
        )
        ORDER BY updated_at DESC
        LIMIT 320
      `)
      .bind(...idPatterns)
      .all<{ data_json: string }>();
    const results = Array.isArray(rows?.results) ? rows.results : [];
    for (const row of results) {
      if (!row?.data_json) continue;
      try {
        const parsed = JSON.parse(String(row.data_json || "{}")) as PageDataPlayerProfilePayload;
        if (!hasUsablePlayerProfilePayloadForSport(parsed, sport)) continue;
        const parsedName = parsed?.data?.profile?.player?.displayName || parsed?.data?.profile?.player?.name || "";
        const parsedId = parsed?.data?.profile?.player?.espnId || parsed?.data?.profile?.player?.id;
        if (!isPlayerIdentityMatch(requestedName, parsedName, expectedId, parsedId)) continue;
        return parsed;
      } catch {
        // Non-fatal; continue scanning.
      }
    }
  } catch {
    // Non-fatal.
  }
  return null;
}

async function readLegacyPlayerProfileCacheByIdentity(
  db: D1Database,
  sport: string,
  requestedName: string,
  expectedPlayerId?: string | null
): Promise<any | null> {
  const nameCandidates = Array.from(new Set([requestedName, normalizePlayerNameForWarm(requestedName)].filter(Boolean)));
  for (const candidate of nameCandidates) {
    const compact = normalizeCompactTokenForCache(candidate);
    if (!compact) continue;
    const key = `player-profile:${String(sport || "").toUpperCase()}/${compact}`;
    try {
      const payload = await getCachedData<any>(db, key);
      if (!payload?.player) continue;
      const identityMatches = isPlayerIdentityMatch(
        requestedName,
        payload?.player?.displayName || payload?.player?.name || "",
        expectedPlayerId,
        payload?.player?.espnId || payload?.player?.id
      );
      if (!identityMatches) continue;
      return payload;
    } catch {
      // Non-fatal fallback.
    }
  }
  return null;
}

type PlayerPropsRecovery = {
  resolvedName: string;
  resolvedPlayerId: string;
  resolvedTeamAbbr: string;
  currentProps: any[];
};

async function recoverPlayerPropsSnapshot(params: {
  c: any;
  sport: string;
  requestedName: string;
  expectedPlayerId?: string | null;
  playerNameCandidates: string[];
}): Promise<PlayerPropsRecovery | null> {
  const sport = normalizeSport(params.sport);
  if (!sport || sport === "ALL") return null;
  let rows: any[] = [];
  try {
    const compactPatterns = Array.from(
      new Set(
        [params.requestedName, ...(Array.isArray(params.playerNameCandidates) ? params.playerNameCandidates : [])]
          .map((n) => normalizeEntityToken(n))
          .filter(Boolean)
      )
    );
    const sqlPatterns = Array.from(
      new Set(
        compactPatterns.flatMap((token) => {
          const parts = token.split(/\s+/).filter(Boolean);
          const values = [`%${token}%`];
          if (parts.length > 1) values.push(`%${parts[parts.length - 1]}%`);
          if (parts.length > 0) values.push(`%${parts[0]}%`);
          return values;
        })
      )
    ).slice(0, 8);
    if (sqlPatterns.length > 0) {
      const where = sqlPatterns.map(() => "LOWER(player_name) LIKE ?").join(" OR ");
      const dbRows = await withTimeout(
        params.c.env.DB
          .prepare(`
            SELECT *
            FROM sportsradar_props_cache
            WHERE (${where})
              AND fetched_at > datetime('now', '-36 hour')
            ORDER BY fetched_at DESC
            LIMIT 800
          `)
          .bind(...sqlPatterns)
          .all<any>(),
        1_200,
        { results: [] } as any
      );
      rows = Array.isArray(dbRows?.results) ? dbRows.results : [];
    }
  } catch {
    // Non-fatal; fall back to API feed below.
  }
  if (rows.length === 0) {
    const origin = new URL(params.c.req.url).origin;
    const headers = buildForwardHeaders(params.c);
    const propsUrl = `${origin}/api/sports-data/props/today?sport=${encodeURIComponent(sport)}&limit=3000&offset=0&fresh=1`;
    const propsRes = await readJsonWithBudget(propsUrl, 1_500, { headers });
    if (!propsRes.ok) return null;
    rows = Array.isArray(propsRes.body?.props) ? propsRes.body.props : [];
    if (rows.length === 0) return null;
  }

  const requestedTokens = Array.from(
    new Set(
      [params.requestedName, ...(Array.isArray(params.playerNameCandidates) ? params.playerNameCandidates : [])]
        .map((n) => normalizeEntityToken(n))
        .filter(Boolean)
    )
  );
  if (requestedTokens.length === 0) return null;
  const expectedId = normalizeCompactTokenForCache(String(params.expectedPlayerId || ""));

  const matched = rows.filter((row: any) => {
    const rowSport = normalizeSportForIdentity(
      String(row?.sport || row?.league || row?.sport_key || row?.sportKey || "")
    );
    // Require explicit row sport to avoid cross-sport contamination from ambiguous rows.
    if (!rowSport) return false;
    if (rowSport !== sport) return false;
    const rowName = String(row?.player_name || row?.playerName || row?.name || "").trim();
    const rowToken = normalizeEntityToken(rowName);
    if (!rowToken) return false;
    const rowId = normalizeCompactTokenForCache(String(row?.player_id || row?.playerId || row?.espn_id || row?.espnId || ""));
    if (expectedId && rowId && rowId !== expectedId) return false;
    return requestedTokens.some((target) =>
      rowToken === target || rowToken.includes(target) || target.includes(rowToken)
    );
  });
  if (matched.length === 0) return null;

  // Identity quarantine: if multiple player IDs appear for the same name query,
  // keep only the dominant canonical ID bucket and discard mixed rows.
  const idCounts = new Map<string, number>();
  for (const row of matched) {
    const rowId = normalizeCompactTokenForCache(String(row?.player_id || row?.playerId || row?.espn_id || row?.espnId || ""));
    if (!rowId) continue;
    idCounts.set(rowId, (idCounts.get(rowId) || 0) + 1);
  }
  let dominantId = "";
  if (expectedId) {
    dominantId = expectedId;
  } else if (idCounts.size > 0) {
    dominantId = Array.from(idCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  }
  const identityMatched = dominantId
    ? matched.filter((row: any) => {
      const rowId = normalizeCompactTokenForCache(String(row?.player_id || row?.playerId || row?.espn_id || row?.espnId || ""));
      return rowId === dominantId;
    })
    : matched;
  if (identityMatched.length === 0) return null;

  const canonicalName = String(
    identityMatched.find((row: any) => String(row?.player_name || "").trim())?.player_name
    || params.requestedName
  ).trim();
  const canonicalId = normalizeCompactTokenForCache(
    String(
      identityMatched.find((row: any) => String(row?.player_id || row?.playerId || row?.espn_id || row?.espnId || "").trim())
        ?.player_id
      || identityMatched.find((row: any) => String(row?.playerId || "").trim())?.playerId
      || identityMatched.find((row: any) => String(row?.espn_id || row?.espnId || "").trim())?.espn_id
      || dominantId
      || expectedId
      || canonicalName
    )
  );
  const teamAbbr = String(
    identityMatched.find((row: any) => String(row?.team || row?.team_abbr || row?.teamAbbr || "").trim())
      ?.team
    || identityMatched.find((row: any) => String(row?.team_abbr || "").trim())?.team_abbr
    || identityMatched.find((row: any) => String(row?.teamAbbr || "").trim())?.teamAbbr
    || ""
  ).trim().toUpperCase();

  const currentProps = identityMatched
    .map((row: any) => ({
      prop_type: String(row?.prop_type || row?.market || row?.market_name || "").toUpperCase().replace(/\s+/g, "_"),
      line_value: Number(row?.line_value ?? row?.line ?? 0),
      sportsbook: String(row?.sportsbook || row?.book || "SportsRadar"),
      odds_american: Number(row?.over_odds ?? row?.odds_american ?? -110),
      team: String(row?.team || row?.team_abbr || row?.teamAbbr || teamAbbr || "").trim().toUpperCase(),
      source: "props-recovery",
    }))
    .filter((p) => p.prop_type && Number.isFinite(p.line_value) && p.line_value > 0);

  if (currentProps.length === 0) return null;
  return {
    resolvedName: canonicalName || params.requestedName,
    resolvedPlayerId: canonicalId || normalizeCompactTokenForCache(params.requestedName) || "unknown-player",
    resolvedTeamAbbr: teamAbbr,
    currentProps,
  };
}

async function resolvePlayerIdFromRecentGamesSnapshots(
  db: D1Database,
  sport: string,
  requestedName: string
): Promise<string | null> {
  const name = String(requestedName || "").trim();
  if (!name) return null;
  const today = new Date().toISOString().slice(0, 10);
  const dateCandidates = [today, shiftDateYmd(today, -1), shiftDateYmd(today, 1)];
  const sportCandidates = Array.from(new Set([normalizeSport(sport), "ALL"].filter(Boolean)));
  const pickId = (row: any): string => normalizeCompactTokenForCache(
    String(row?.espnId || row?.espn_id || row?.playerId || row?.player_id || row?.id || "")
  );
  const pickName = (row: any): string =>
    String(row?.player_name || row?.playerName || row?.display_name || row?.displayName || row?.name || "").trim();

  for (const date of dateCandidates) {
    for (const sp of sportCandidates) {
      const { games } = await readPageDataGamesSnapshot(db, date, sp);
      for (const game of Array.isArray(games) ? games : []) {
        const groups = [
          ...(Array.isArray(game?.props) ? game.props : []),
          ...(Array.isArray(game?.player_props) ? game.player_props : []),
          ...(Array.isArray(game?.featured_props) ? game.featured_props : []),
          ...(Array.isArray(game?.starting_lineups?.home) ? game.starting_lineups.home : []),
          ...(Array.isArray(game?.starting_lineups?.away) ? game.starting_lineups.away : []),
        ];
        for (const row of groups) {
          const rowName = pickName(row);
          const rowId = pickId(row);
          if (!rowName || !rowId) continue;
          if (isPlayerIdentityMatch(name, rowName)) return rowId;
        }
      }
    }
  }
  return null;
}

async function resolvePlayerIdFromPropsRows(
  db: D1Database,
  sport: string,
  requestedName: string
): Promise<string | null> {
  const raw = String(requestedName || "").trim();
  if (!raw) return null;
  const candidates = Array.from(new Set([
    raw,
    normalizePlayerNameForWarm(raw),
    toDisplayFirstLast(raw),
    toDisplayLastFirst(raw),
  ].map((n) => String(n || "").trim().toLowerCase()).filter(Boolean))).slice(0, 6);
  if (candidates.length === 0) return null;
  const placeholders = candidates.map(() => "?").join(", ");
  try {
    const currentSql = `
      SELECT p.player_id AS player_id
      FROM sdio_props_current p
      JOIN sdio_games g ON g.id = p.game_id
      WHERE UPPER(COALESCE(g.sport, '')) = ?
        AND LOWER(COALESCE(p.player_name, '')) IN (${placeholders})
        AND COALESCE(p.player_id, '') <> ''
      ORDER BY datetime(COALESCE(p.last_updated, p.updated_at, p.created_at)) DESC
      LIMIT 5
    `;
    const currentRows = await db.prepare(currentSql).bind(sport.toUpperCase(), ...candidates).all<{ player_id: string | null }>();
    for (const row of currentRows.results || []) {
      const id = normalizeCompactTokenForCache(String(row?.player_id || ""));
      if (id) return id;
    }
  } catch {
    // Non-fatal; fallback to history table.
  }
  try {
    const historySql = `
      SELECT h.player_id AS player_id
      FROM sdio_props_history h
      JOIN sdio_games g ON g.id = h.game_id
      WHERE UPPER(COALESCE(g.sport, '')) = ?
        AND LOWER(COALESCE(h.player_name, '')) IN (${placeholders})
        AND COALESCE(h.player_id, '') <> ''
      ORDER BY datetime(COALESCE(h.recorded_at, h.updated_at, h.created_at)) DESC
      LIMIT 8
    `;
    const historyRows = await db.prepare(historySql).bind(sport.toUpperCase(), ...candidates).all<{ player_id: string | null }>();
    for (const row of historyRows.results || []) {
      const id = normalizeCompactTokenForCache(String(row?.player_id || ""));
      if (id) return id;
    }
  } catch {
    // Non-fatal.
  }
  return null;
}

async function resolvePlayerIdFromProviderFast(
  c: any,
  sport: string,
  requestedName: string,
  expectedPlayerId?: string | null
): Promise<string | null> {
  const name = String(requestedName || "").trim();
  if (!name) return null;
  const origin = new URL(c.req.url).origin;
  const headers = buildForwardHeaders(c);
  const url = `${origin}/api/player/${encodeURIComponent(sport)}/${encodeURIComponent(name)}?pageData=1&fast=1`;
  const res = await readJsonWithBudget(url, 2_600, { headers });
  if (!res.ok || !res.body?.player) return null;
  const providerPlayer = res.body.player || {};
  const resolvedName = String(providerPlayer?.displayName || providerPlayer?.name || name).trim();
  const resolvedId = normalizeCompactTokenForCache(String(providerPlayer?.espnId || providerPlayer?.id || ""));
  const resolvedSport = normalizeSport(String(providerPlayer?.sport || sport || ""));
  if (!resolvedId) return null;
  if (resolvedSport && resolvedSport !== normalizeSport(sport)) return null;
  if (!isPlayerIdentityMatch(name, resolvedName || name, expectedPlayerId, resolvedId)) return null;
  return resolvedId;
}

async function resolvePlayerIdFromEspnSearchFast(
  requestedName: string,
  sport: string
): Promise<string | null> {
  const meta = await resolvePlayerMetaFromEspnSearchFast(requestedName, sport);
  return meta?.espnId || null;
}

async function resolvePlayerMetaFromEspnSearchFast(
  requestedName: string,
  sport: string
): Promise<{
  espnId: string;
  displayName: string;
  teamName: string;
  teamAbbr: string;
  headshotUrl: string;
} | null> {
  const name = String(requestedName || "").trim();
  if (!name) return null;
  const url = `https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(name)}&limit=10&type=player`;
  const res = await readJsonWithBudget(url, 2_600);
  if (!res.ok || !res.body) return null;
  const items = Array.isArray((res.body as any)?.items) ? (res.body as any).items : [];
  const normalizedRequested = normalizeTokenForCache(name);
  const sportNorm = normalizeSport(sport);
  for (const item of items) {
    if (String(item?.type || "").toLowerCase() !== "player") continue;
    const displayName = String(item?.displayName || "").trim();
    const itemId = normalizeCompactTokenForCache(String(item?.id || ""));
    const teamLeague =
      normalizeSport(String(item?.leagueRelationships?.[0]?.core?.abbreviation || ""))
      || normalizeSport(String(item?.leagueRelationships?.[0]?.abbreviation || ""))
      || normalizeSport(String(item?.teamRelationships?.[0]?.core?.league?.abbreviation || ""))
      || normalizeSport(String(item?.teamRelationships?.[0]?.league?.abbreviation || ""))
      || normalizeSport(String(item?.league?.abbreviation || ""));
    if (!itemId) continue;
    if (teamLeague && sportNorm && teamLeague !== sportNorm) continue;
    const normalizedItemName = normalizeTokenForCache(displayName);
    if (
      normalizedItemName === normalizedRequested
      || normalizedItemName.includes(normalizedRequested)
      || normalizedRequested.includes(normalizedItemName)
    ) {
      const teamCore = item?.teamRelationships?.[0]?.core || item?.teamRelationships?.[0] || item?.team || {};
      return {
        espnId: itemId,
        displayName: String(displayName || name || "").trim() || name,
        teamName: String(item?.team?.displayName || teamCore?.displayName || teamCore?.name || "").trim(),
        teamAbbr: String(item?.team?.abbreviation || teamCore?.abbreviation || "").trim().toUpperCase(),
        headshotUrl: String(item?.headshot?.href || "").trim(),
      };
    }
  }
  return null;
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
  const isWarmRequest = String(c.req.header("x-page-data-warm") || "").trim() === "1";

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
    schedulePlayerDocumentPrebuildFromGamesList(c, l1Fresh.games);
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
        schedulePlayerDocumentPrebuildFromGamesList(c, d1Primary.games);
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
        schedulePlayerDocumentPrebuildFromGamesList(c, d1Backup.games);
        return c.json(patchFreshness(d1Backup, "l2", true));
      }
    } catch {
      // Non-fatal.
    }
  }

  if (ENFORCE_SNAPSHOT_READ_ONLY_REQUEST_PATH) {
    if (l1Stale && hasUsableGamesPageDataPayload(l1Stale)) {
      incCounter("pageDataL1Hits");
      schedulePlayerDocumentPrebuildFromGamesList(c, l1Stale.games);
      return c.json(patchFreshness(l1Stale, "l1", true));
    }
    incCounter("pageDataColdPath");
    incCounter("pageDataErrors");
    const unavailablePayload: PageDataGamesPayload = {
      route: "games",
      generatedAt: new Date().toISOString(),
      freshness: {
        class: "medium",
        cacheTtlMs: policy.cacheTtlMs,
        staleWindowMs: policy.staleWindowMs,
        source: "cold",
        stale: false,
      },
      degraded: true,
      meta: {
        date,
        sport,
        tab,
        partialReason: "snapshot_missing",
      },
      games: [],
      oddsSummaryByGame: {},
    };
    return c.json(unavailablePayload);
  }

  incCounter("pageDataColdPath");

  // Strict cold-path budget: never block route load on slow odds assembly.
  const budgetMs = 2200;
  const gamesBudgetMs = 1400;
  let upstreamFetchMs = 0;

  const origin = new URL(c.req.url).origin;
  const gamesUrl = new URL("/api/games", origin);
  gamesUrl.searchParams.set("date", date);
  gamesUrl.searchParams.set("includeOdds", "0");
  gamesUrl.searchParams.set("debug", "1");
  if (sport !== "ALL") gamesUrl.searchParams.set("sport", sport);

  const gamesPromise = readJsonWithBudget(gamesUrl.toString(), gamesBudgetMs);

  const gamesCallStarted = now();
  const [gamesRes] = await withTimeout(
    Promise.all([gamesPromise]),
    budgetMs,
    [{ ok: false, status: 0, body: null }] as const
  );
  upstreamFetchMs += Math.max(0, now() - gamesCallStarted);

  const gamesFromHttp = extractGamesArray(gamesRes.body);
  let fallbackGames: any[] = [];
  let fallbackSource: string | null = null;
  if (gamesFromHttp.length === 0) {
    const exact = await readGamesFromPersistentCache(c.env.DB, date, sport);
    if (exact.games.length > 0) {
      fallbackGames = exact.games;
      fallbackSource = exact.source;
    } else {
      const dateScoped = await readGamesFromDateScopedPersistentCache(c.env.DB, date, sport);
      if (dateScoped.games.length > 0) {
        fallbackGames = dateScoped.games;
        fallbackSource = dateScoped.source;
      } else if (sport !== "ALL") {
        const allSport = await readGamesFromPersistentCache(c.env.DB, date, "ALL");
        if (allSport.games.length > 0) {
          fallbackGames = filterGamesBySport(allSport.games, sport);
          fallbackSource = `${allSport.source || "games_list_v2_all"}_filtered`;
        } else {
          const allSportScoped = await readGamesFromDateScopedPersistentCache(c.env.DB, date, "ALL");
          if (allSportScoped.games.length > 0) {
            fallbackGames = filterGamesBySport(allSportScoped.games, sport);
            fallbackSource = `${allSportScoped.source || "games_list_v2_all_scoped"}_filtered`;
          }
        }
      }
    }
  }
  let games = gamesFromHttp.length > 0 ? gamesFromHttp : fallbackGames;
  let gamesSource = gamesFromHttp.length > 0 ? "internal_http" : (fallbackSource || "none");
  const gamesApiDebug = (gamesRes.body && typeof gamesRes.body === "object")
    ? (gamesRes.body as { debug?: { selectedDate?: string; perSport?: Array<{ sport?: string; rawCount?: number; postFilterCount?: number; reasonWhenZero?: string | null }>; finalMergedTotal?: number } }).debug
    : undefined;
  // All-sports boards should remain representative when some leagues are date-bucketed
  // one day forward by upstream schedule feeds.
  if (sport === "ALL") {
    const carryForwardCandidates = ["NBA", "NHL"];
    const missingSports = carryForwardCandidates.filter(
      (sportKey) => !games.some((g) => String(g?.sport || "").trim().toUpperCase() === sportKey)
    );
    if (missingSports.length > 0) {
      try {
        const nextDateObj = new Date(`${date}T12:00:00`);
        nextDateObj.setDate(nextDateObj.getDate() + 1);
        const nextDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/New_York",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(nextDateObj);
        const nextDateGamesUrl = new URL("/api/games", origin);
        nextDateGamesUrl.searchParams.set("date", nextDate);
        nextDateGamesUrl.searchParams.set("includeOdds", "0");
        nextDateGamesUrl.searchParams.set("sport", "ALL");
        nextDateGamesUrl.searchParams.set("debug", "1");
        const nextDateStarted = now();
        const nextDateRes = await readJsonWithBudget(nextDateGamesUrl.toString(), 2200);
        upstreamFetchMs += Math.max(0, now() - nextDateStarted);
        const nextDateGames = extractGamesArray(nextDateRes.body);
        const carryForwardRows = nextDateGames.filter((g) =>
          missingSports.includes(String(g?.sport || "").trim().toUpperCase())
        );
        if (carryForwardRows.length > 0) {
          games = mergeGamesById([...games, ...carryForwardRows]);
          const carryBySport = carryForwardRows.reduce((acc: Record<string, number>, row: any) => {
            const key = String(row?.sport || "").trim().toUpperCase();
            if (!key) return acc;
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {});
          gamesSource = `${gamesSource};next_date_carry:${nextDate}:${JSON.stringify(carryBySport)}`;
        }
      } catch {
        // Non-fatal fallback path.
      }
    }

    const mlbRows = games.filter((g) => String(g?.sport || "").trim().toUpperCase() === "MLB");
    const mlbNeedsProbableEnrichment = mlbRows.length > 0 && mlbRows.some((g) => !hasMlbProbablePitchers(g));
    if (mlbNeedsProbableEnrichment) {
      try {
        const mlbGamesUrl = new URL("/api/games", origin);
        mlbGamesUrl.searchParams.set("date", date);
        mlbGamesUrl.searchParams.set("includeOdds", "0");
        mlbGamesUrl.searchParams.set("sport", "MLB");
        const mlbStarted = now();
        const mlbRes = await readJsonWithBudget(mlbGamesUrl.toString(), 1200);
        upstreamFetchMs += Math.max(0, now() - mlbStarted);
        const mlbGames = extractGamesArray(mlbRes.body).filter((g) => String(g?.sport || "").trim().toUpperCase() === "MLB");
        if (mlbGames.length > 0) {
          games = enrichGamesWithMlbProbables(games, mlbGames);
          gamesSource = `${gamesSource};mlb_probables_enriched`;
        }
      } catch {
        // Non-fatal fallback path.
      }
    }
  }
  const gameIds = uniqueGameIds(games, 90);

  // Cache-first odds hydration: no fresh deep compute in user navigation path.
  const oddsCache = await readOddsSummariesFromCache(c.env.DB, { date, gameIds });
  const oddsSummaryByGame: Record<string, any> = { ...oddsCache.oddsSummaryByGame };
  let oddsSource = oddsCache.source;
  for (const game of games) {
    const id = String(game?.game_id || game?.id || "").trim().toLowerCase();
    if (!id || oddsSummaryByGame[id]) continue;
    const synthetic = buildSyntheticSummaryFromGame(game);
    if (synthetic) oddsSummaryByGame[id] = synthetic;
  }
  const oddsCoverage = gameIds.length > 0
    ? Object.keys(oddsSummaryByGame).length / gameIds.length
    : 1;
  if (isWarmRequest && games.length > 0 && oddsCoverage < 0.15 && c.env.SPORTSRADAR_API_KEY) {
    const sportsToRecover = (sport === "ALL"
      ? Array.from(new Set(games.map((g) => String(g?.sport || "").trim().toUpperCase()).filter(Boolean)))
      : [sport]
    ).slice(0, 6);
    let recovered = 0;
    for (const sportKey of sportsToRecover) {
      const oddsUrl = new URL(`/api/games/odds/${encodeURIComponent(String(sportKey || "").toLowerCase())}`, origin);
      const liveOddsStarted = now();
      const liveOddsRes = await readJsonWithBudget(oddsUrl.toString(), 9000);
      upstreamFetchMs += Math.max(0, now() - liveOddsStarted);
      const liveOddsMap = (liveOddsRes.body?.odds && typeof liveOddsRes.body.odds === "object")
        ? (liveOddsRes.body.odds as Record<string, any>)
        : null;
      if (!liveOddsMap) continue;
      for (const game of games) {
        if (String(game?.sport || "").trim().toUpperCase() !== String(sportKey || "").trim().toUpperCase()) continue;
        const id = String(game?.game_id || game?.id || "").trim().toLowerCase();
        if (!id || oddsSummaryByGame[id]) continue;
        const synthetic = buildSyntheticSummaryFromLiveOddsMap(game, sportKey, liveOddsMap);
        if (!synthetic) continue;
        oddsSummaryByGame[id] = synthetic;
        recovered += 1;
      }
    }
    if (recovered > 0) {
      oddsSource = `${oddsSource};sport_odds_live_recovery=${recovered}`;
    }
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
    schedulePlayerDocumentPrebuildFromGamesList(c, l1Stale.games);
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
    scheduleVisiblePlayersWarmFromGames(c, games);
    schedulePlayerDocumentPrebuildFromGamesList(c, games);
  } else {
    incCounter("pageDataErrors");
  }
  c.set("pageDataUpstreamMs", upstreamFetchMs);

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
    oddsSource,
    degraded,
    partialReason,
    selectedDate: date,
    perSportRawCounts: Array.isArray(gamesApiDebug?.perSport)
      ? gamesApiDebug?.perSport.map((row) => ({ sport: String(row?.sport || ""), rawCount: Number(row?.rawCount || 0) }))
      : null,
    perSportPostFilterCounts: Array.isArray(gamesApiDebug?.perSport)
      ? gamesApiDebug?.perSport.map((row) => ({ sport: String(row?.sport || ""), postFilterCount: Number(row?.postFilterCount || 0) }))
      : null,
    perSportZeroReasons: Array.isArray(gamesApiDebug?.perSport)
      ? gamesApiDebug?.perSport
          .filter((row) => Number(row?.postFilterCount || 0) === 0)
          .map((row) => ({ sport: String(row?.sport || ""), reason: row?.reasonWhenZero || "unknown" }))
      : null,
    mergedTotalFromGamesApi: Number(gamesApiDebug?.finalMergedTotal || 0),
    finalMergedTotal: games.length,
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

  if (ENFORCE_SNAPSHOT_READ_ONLY_REQUEST_PATH) {
    if (hasUsableSportHubPageDataPayload(l1Stale)) {
      incCounter("pageDataL1Hits");
      return c.json(patchFreshness(l1Stale!, "l1", true));
    }
    incCounter("pageDataColdPath");
    incCounter("pageDataErrors");
    const unavailablePayload: PageDataSportHubPayload = {
      route: "sport-hub",
      generatedAt: new Date().toISOString(),
      freshness: {
        class: "medium",
        cacheTtlMs: policy.cacheTtlMs,
        staleWindowMs: policy.staleWindowMs,
        source: "cold",
        stale: false,
      },
      degraded: true,
      meta: { sport, date, partialReason: "snapshot_missing" },
      games: [],
    };
    return c.json(unavailablePayload);
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
  if (sport && sport !== "ALL") {
    c.executionCtx.waitUntil(
      setCachedData(c.env.DB, ACTIVE_SPORT_CACHE_KEY, "page-data-warm", "active-sport", { sport }, 20 * 60).catch(() => {})
    );
  }

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

  if (ENFORCE_SNAPSHOT_READ_ONLY_REQUEST_PATH) {
    if (hasUsableGameDetailPageDataPayload(l1Stale)) {
      incCounter("pageDataL1Hits");
      return c.json(patchFreshness(l1Stale!, "l1", true));
    }
    incCounter("pageDataColdPath");
    incCounter("pageDataErrors");
    const unavailablePayload: PageDataGameDetailPayload = {
      route: "game-detail",
      generatedAt: new Date().toISOString(),
      freshness: {
        class: freshnessClass,
        cacheTtlMs: policy.cacheTtlMs,
        staleWindowMs: policy.staleWindowMs,
        source: "cold",
        stale: false,
      },
      degraded: true,
      meta: { gameId, sport, partialReason: "snapshot_missing" },
      game: null,
      oddsSummary: null,
    };
    return c.json(unavailablePayload);
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
  c.set("pageDataUpstreamMs", 0);

  const warmSport = resolveGameDetailWarmSport(sport, game);
  if (warmSport && game) {
    const { home, away } = getHomeAwayTeamIdsForWarm(game);
    const teamIds = Array.from(new Set([home, away].filter(Boolean) as string[]));
    if (teamIds.length > 0) {
      c.executionCtx.waitUntil((async () => {
        const fetchFn = createPageDataWarmFetchFn(c, "game-detail-roster");
        await Promise.allSettled(
          teamIds.map((tid) =>
            warmTeamRoster({
              fetchFn,
              sport: warmSport,
              teamId: tid,
              maxPlayers: 900,
              concurrency: 12,
            })
          )
        );
      })());
    }
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

pageDataRouter.get("/game-detail-box-score", async (c) => {
  const gameId = String(c.req.query("gameId") || "").trim();
  const sport = String(c.req.query("sport") || "").trim().toUpperCase() || null;
  const dateHint = getDateFromQuery(c.req.query("date"));
  if (!gameId) return c.json({ ok: false, error: "gameId is required" }, 400);

  const snapshot = await readGameFromSnapshots(c.env.DB, { gameId, sport, dateHint });
  const game = snapshot.game;
  const homeTeamCode = String(game?.home_team_code || game?.homeTeam || "HOME").trim();
  const awayTeamCode = String(game?.away_team_code || game?.awayTeam || "AWAY").trim();
  const homeScore = Number(game?.home_score ?? game?.homeScore ?? 0) || 0;
  const awayScore = Number(game?.away_score ?? game?.awayScore ?? 0) || 0;

  return c.json({
    status: String(game?.status || "SCHEDULED").toUpperCase(),
    homeTeam: {
      team: homeTeamCode,
      points: homeScore,
      fgPct: 0,
      fg3Pct: 0,
      ftPct: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
    },
    awayTeam: {
      team: awayTeamCode,
      points: awayScore,
      fgPct: 0,
      fg3Pct: 0,
      ftPct: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
    },
    homePlayers: [],
    awayPlayers: [],
    quarterScores: [],
    source: snapshot.source || null,
    degraded: !game,
    lastUpdated: new Date().toISOString(),
  });
});

pageDataRouter.get("/game-detail-injuries", async (c) => {
  const gameId = String(c.req.query("gameId") || "").trim();
  const sport = String(c.req.query("sport") || "").trim().toUpperCase() || null;
  const dateHint = getDateFromQuery(c.req.query("date"));
  if (!gameId) return c.json({ ok: false, error: "gameId is required" }, 400);

  const snapshot = await readGameFromSnapshots(c.env.DB, { gameId, sport, dateHint });
  const game = snapshot.game;
  const homeTeam = String(game?.home_team_name || game?.homeTeamFull || game?.home_team_code || game?.homeTeam || "Home").trim();
  const awayTeam = String(game?.away_team_name || game?.awayTeamFull || game?.away_team_code || game?.awayTeam || "Away").trim();

  return c.json({
    homeTeam,
    awayTeam,
    injuries: {
      home: [],
      away: [],
    },
    source: snapshot.source || null,
    degraded: !game,
    lastUpdated: new Date().toISOString(),
  });
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

  if (ENFORCE_SNAPSHOT_READ_ONLY_REQUEST_PATH) {
    if (l1Stale && hasUsableOddsPageDataPayload(l1Stale)) {
      incCounter("pageDataL1Hits");
      return c.json(patchFreshness(l1Stale, "l1", true));
    }
    incCounter("pageDataColdPath");
    incCounter("pageDataErrors");
    const unavailablePayload: PageDataOddsPayload = {
      route: "odds",
      generatedAt: new Date().toISOString(),
      freshness: {
        class: "medium",
        cacheTtlMs: policy.cacheTtlMs,
        staleWindowMs: policy.staleWindowMs,
        source: "cold",
        stale: false,
      },
      degraded: true,
      meta: { date, sport, partialReason: "snapshot_missing" },
      games: [],
      oddsSummaryByGame: {},
    };
    return c.json(unavailablePayload);
  }

  incCounter("pageDataColdPath");
  const budgetMs = 2200;
  const origin = new URL(c.req.url).origin;
  let upstreamFetchMs = 0;

  const gamesUrl = new URL("/api/games", origin);
  gamesUrl.searchParams.set("date", date);
  gamesUrl.searchParams.set("includeOdds", "0");
  if (sport !== "ALL") gamesUrl.searchParams.set("sport", sport);

  const gamesStarted = now();
  const gamesRes = await readJsonWithBudget(gamesUrl.toString(), 1300);
  upstreamFetchMs += Math.max(0, now() - gamesStarted);
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
    if (games.length > 0) {
      scheduleVisiblePlayersWarmFromGames(c, games);
    }
  } else {
    incCounter("pageDataErrors");
  }
  c.set("pageDataUpstreamMs", upstreamFetchMs);

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
  const isWarmRequest = String(c.req.header("x-page-data-warm") || "").trim() === "1";
  const requestHardDeadlineMs = started + (isWarmRequest ? 9_000 : 2_800);
  const withinRequestBudget = () => now() < requestHardDeadlineMs;
  incCounter("pageDataRequests");
  const forceFresh = ["1", "true", "yes"].includes(String(c.req.query("fresh") || "").toLowerCase());
  const sport = normalizeSport(c.req.query("sport") || "");
  const teamId = String(c.req.query("teamId") || "").trim();
  if (!sport || sport === "ALL" || !teamId) return c.json({ ok: false, error: "sport and teamId are required" }, 400);
  const teamIdCandidates = sport === "NBA"
    ? buildNbaTeamIdCandidates(teamId)
    : buildTeamIdCandidates(teamId);
  const cacheKeyCandidates = Array.from(
    new Set(teamIdCandidates.map((candidate) => pageDataGenericKey("team_profile", { v: "v4", sport, teamId: candidate.toLowerCase() })))
  );
  const primaryCacheKey = cacheKeyCandidates[0];
  c.executionCtx.waitUntil(
    setCachedData(c.env.DB, ACTIVE_SPORT_CACHE_KEY, "page-data-warm", "active-sport", { sport }, 20 * 60).catch(() => {})
  );
  const policy = getFreshnessPolicy("medium");
  const d1PrimaryKeys = cacheKeyCandidates.map((key) => `page_data_team_profile_v4:${key}`);
  const d1BackupKeys = cacheKeyCandidates.map((key) => `page_data_team_profile_v4_backup:${key}`);

  const l1Fresh = cacheKeyCandidates
    .map((key) => readL1FreshGeneric(pageDataTeamProfileL1, key))
    .find((payload) => hasUsableTeamProfilePayload(payload));
  if (!forceFresh && hasUsableTeamProfilePayload(l1Fresh)) {
    incCounter("pageDataL1Hits");
    return c.json(patchFreshness(l1Fresh, "l1", false));
  }
  const l1Stale = cacheKeyCandidates
    .map((key) => readL1StaleGeneric(pageDataTeamProfileL1, key))
    .find((payload) => hasUsableTeamProfilePayload(payload));

  if (!forceFresh) {
    for (const [idx, d1PrimaryKey] of d1PrimaryKeys.entries()) {
      try {
        const d1Primary = await getCachedData<PageDataTeamProfilePayload>(c.env.DB, d1PrimaryKey);
        if (hasUsableTeamProfilePayload(d1Primary)) {
          incCounter("pageDataL2Hits");
          writeL1Generic(pageDataTeamProfileL1, cacheKeyCandidates[idx] || primaryCacheKey, d1Primary, policy.cacheTtlMs, policy.staleWindowMs);
          return c.json(patchFreshness(d1Primary, "l2", false));
        }
      } catch {}
    }
    for (const [idx, d1BackupKey] of d1BackupKeys.entries()) {
      try {
        const d1Backup = await getCachedData<PageDataTeamProfilePayload>(c.env.DB, d1BackupKey);
        if (hasUsableTeamProfilePayload(d1Backup)) {
          incCounter("pageDataL2Hits");
          writeL1Generic(pageDataTeamProfileL1, cacheKeyCandidates[idx] || primaryCacheKey, d1Backup, policy.cacheTtlMs, policy.staleWindowMs);
          return c.json(patchFreshness(d1Backup, "l2", true));
        }
      } catch {}
    }
  }

  let resolvedTeamId = (() => {
    if (sport !== "NBA") return teamId;
    const preferredNumeric = teamIdCandidates.find((candidate) => /^\d+$/.test(String(candidate || "").trim()));
    if (preferredNumeric) return preferredNumeric;
    const preferredAlias = teamIdCandidates.find((candidate) => {
      const upper = String(candidate || "").trim().toUpperCase();
      return Boolean(upper && NBA_ALIAS_TO_LEGACY_TEAM_ID[upper]);
    });
    return preferredAlias || teamId;
  })();
  if (!forceFresh) {
    for (const candidate of teamIdCandidates) {
      if (candidate === teamId) continue;
      const aliasKey = pageDataGenericKey("team_profile", { v: "v4", sport, teamId: candidate.toLowerCase() });
      const aliasPrimary = `page_data_team_profile_v4:${aliasKey}`;
      const aliasPayload = await getCachedData<PageDataTeamProfilePayload>(c.env.DB, aliasPrimary).catch(() => null);
      if (hasUsableTeamProfilePayload(aliasPayload)) {
        incCounter("pageDataL2Hits");
        writeL1Generic(pageDataTeamProfileL1, primaryCacheKey, aliasPayload!, policy.cacheTtlMs, policy.staleWindowMs);
        return c.json(patchFreshness(aliasPayload!, "l2", false));
      }
      resolvedTeamId = candidate;
      break;
    }
  }

  if (ENFORCE_SNAPSHOT_READ_ONLY_REQUEST_PATH) {
    if (hasUsableTeamProfilePayload(l1Stale)) {
      incCounter("pageDataL1Hits");
      return c.json(patchFreshness(l1Stale!, "l1", true));
    }
    incCounter("pageDataColdPath");
    incCounter("pageDataErrors");
    const unavailablePayload: PageDataTeamProfilePayload = {
      route: "team-profile",
      generatedAt: new Date().toISOString(),
      freshness: {
        class: "medium",
        cacheTtlMs: policy.cacheTtlMs,
        staleWindowMs: policy.staleWindowMs,
        source: "cold",
        stale: false,
      },
      degraded: true,
      meta: {
        sport,
        teamId: resolvedTeamId || teamId,
        partialReason: "snapshot_missing",
      },
      data: {
        profileJson: {},
        scheduleJson: { allGames: [], pastGames: [], upcomingGames: [] },
        statsJson: { stats: {}, rankings: {} },
        standingsJson: { teams: [] },
        gamesJson: { games: [] },
        injuriesJson: { injuries: [] },
        splitsJson: { splits: null },
      },
    };
    return c.json(unavailablePayload);
  }

  incCounter("pageDataColdPath");
  const origin = new URL(c.req.url).origin;
  const headers = buildForwardHeaders(c);
  const endpoints = {
    profile: `${origin}/api/teams/${encodeURIComponent(sport)}/${encodeURIComponent(resolvedTeamId)}`,
    schedule: `${origin}/api/teams/${encodeURIComponent(sport)}/${encodeURIComponent(resolvedTeamId)}/schedule`,
    stats: `${origin}/api/teams/${encodeURIComponent(sport)}/${encodeURIComponent(resolvedTeamId)}/stats`,
    standings: `${origin}/api/teams/${encodeURIComponent(sport)}/standings`,
    games: `${origin}/api/games?sport=${encodeURIComponent(sport)}&includeOdds=0`,
    injuries: `${origin}/api/teams/${encodeURIComponent(sport)}/${encodeURIComponent(resolvedTeamId)}/injuries`,
    splits: `${origin}/api/teams/${encodeURIComponent(sport)}/${encodeURIComponent(resolvedTeamId)}/splits`,
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

  // If internal standings endpoint was sparse/unavailable, use provider cache directly.
  const standingsTeamsAfterRetry = Array.isArray(standingsRes.body?.teams) ? standingsRes.body.teams : [];
  if (isWarmRequest && withinRequestBudget() && standingsTeamsAfterRetry.length === 0 && c.env.SPORTSRADAR_API_KEY) {
    try {
      const supported = ["NBA", "NFL", "MLB", "NHL", "NCAAB", "NCAAF"];
      if (supported.includes(sport)) {
        const fallbackStandings = await fetchStandingsCached(
          c.env.DB,
          sport as SportKey,
          c.env.SPORTSRADAR_API_KEY,
        );
        const fallbackTeams = Array.isArray(fallbackStandings?.teams) ? fallbackStandings.teams : [];
        if (fallbackTeams.length > 0) {
          standingsRes = {
            ok: true,
            status: 200,
            body: {
              teams: fallbackTeams,
              conferences: fallbackStandings?.conferences || [],
              divisions: fallbackStandings?.divisions || [],
            },
          };
        }
      }
    } catch {
      // non-fatal
    }
  }

  // Last-chance synthesis: build minimal profile from standings row so team header never blanks.
  if (!profileRes.ok || !profileRes.body?.team) {
    const teams = Array.isArray(standingsRes.body?.teams) ? standingsRes.body.teams : [];
    if (teams.length > 0) {
      const raw = String(teamId || "").trim();
      const alias = raw.toUpperCase();
      const aliasMap: Record<string, string[]> = {
        GSW: ["GS"], GS: ["GSW"], NYK: ["NY"], NY: ["NYK"], SAS: ["SA"], SA: ["SAS"],
        NOP: ["NO"], NO: ["NOP"], PHX: ["PHO"], PHO: ["PHX"], CHA: ["CHO"], CHO: ["CHA"],
        BKN: ["BRK"], BRK: ["BKN"],
      };
      const candidates = new Set<string>([alias, ...(aliasMap[alias] || [])]);
      const row = teams.find((t: any) => {
        const rowId = String(t?.id || "").trim();
        const rowAlias = String(t?.alias || "").trim().toUpperCase();
        return rowId === raw || candidates.has(rowAlias);
      });
      if (row) {
        profileRes = {
          ok: true,
          status: 200,
          body: {
            team: {
              id: String(row?.id || raw),
              name: String(row?.name || raw),
              market: String(row?.market || ""),
              alias: String(row?.alias || alias),
              conference: String(row?.conferenceName || ""),
              division: String(row?.divisionName || ""),
              record: {
                wins: Number(row?.wins ?? 0),
                losses: Number(row?.losses ?? 0),
                ties: Number.isFinite(Number(row?.ties)) ? Number(row?.ties) : undefined,
                win_pct: Number.isFinite(Number(row?.winPct)) ? Number(row?.winPct) : undefined,
                conference: {
                  wins: Number.isFinite(Number(row?.confWins)) ? Number(row?.confWins) : undefined,
                  losses: Number.isFinite(Number(row?.confLosses)) ? Number(row?.confLosses) : undefined,
                },
                home: {
                  wins: Number.isFinite(Number(row?.homeWins)) ? Number(row?.homeWins) : undefined,
                  losses: Number.isFinite(Number(row?.homeLosses)) ? Number(row?.homeLosses) : undefined,
                },
                away: {
                  wins: Number.isFinite(Number(row?.awayWins)) ? Number(row?.awayWins) : undefined,
                  losses: Number.isFinite(Number(row?.awayLosses)) ? Number(row?.awayLosses) : undefined,
                },
              },
            },
            roster: [],
            venue: null,
          },
        };
      }
    }
  }

  if (!profileRes.ok || !profileRes.body?.team) {
    const gamesRows = extractGamesArray(gamesRes.body);
    if (gamesRows.length > 0) {
      const candidates = new Set(buildTeamIdCandidates(teamId).map((v) => v.toUpperCase()));
      const row = gamesRows.find((g: any) => {
        const ids = [
          String(g?.home_team_id || g?.homeTeamId || g?.home_id || "").trim().toUpperCase(),
          String(g?.away_team_id || g?.awayTeamId || g?.away_id || "").trim().toUpperCase(),
          String(g?.home_team_code || g?.homeTeam || g?.home_alias || "").trim().toUpperCase(),
          String(g?.away_team_code || g?.awayTeam || g?.away_alias || "").trim().toUpperCase(),
        ].filter(Boolean);
        return ids.some((id) => candidates.has(id));
      });
      if (row) {
        const homeIds = new Set([
          String(row?.home_team_id || row?.homeTeamId || row?.home_id || "").trim().toUpperCase(),
          String(row?.home_team_code || row?.homeTeam || row?.home_alias || "").trim().toUpperCase(),
        ].filter(Boolean));
        const isHome = Array.from(homeIds).some((id) => candidates.has(id));
        const routeId = isHome
          ? String(row?.home_team_id || row?.homeTeamId || row?.home_team_code || teamId).trim()
          : String(row?.away_team_id || row?.awayTeamId || row?.away_team_code || teamId).trim();
        const alias = isHome
          ? String(row?.home_team_code || row?.homeTeam || row?.home_alias || teamId).trim().toUpperCase()
          : String(row?.away_team_code || row?.awayTeam || row?.away_alias || teamId).trim().toUpperCase();
        const fullName = isHome
          ? String(row?.home_team_name || row?.homeTeamFull || alias).trim()
          : String(row?.away_team_name || row?.awayTeamFull || alias).trim();
        profileRes = {
          ok: true,
          status: 200,
          body: {
            team: {
              id: routeId || teamId,
              name: fullName || alias || teamId,
              alias: alias || String(teamId).toUpperCase(),
              market: "",
            },
            roster: [],
            venue: null,
          },
        };
      }
    }
  }

  if (!profileRes.body?.team) {
    profileRes = {
      ok: true,
      status: 200,
      body: {
        team: {
          id: teamId,
          name: String(teamId || "Team").trim(),
          alias: String(teamId || "").trim().toUpperCase(),
          market: "",
        },
        roster: [],
        venue: null,
      },
    };
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
    writeL1Generic(pageDataTeamProfileL1, primaryCacheKey, payload, policy.cacheTtlMs, policy.staleWindowMs);
    c.executionCtx.waitUntil((async () => {
      try {
        await setCachedData(c.env.DB, d1PrimaryKeys[0], "page-data", "team-profile", payload, Math.floor(policy.cacheTtlMs / 1000));
        await setCachedData(c.env.DB, d1BackupKeys[0], "page-data", "team-profile", payload, Math.floor((policy.cacheTtlMs + policy.staleWindowMs) / 1000));
      } catch {}
    })());
    c.executionCtx.waitUntil(
      warmTeamRoster({
        fetchFn: createPageDataWarmFetchFn(c, "team-profile-view"),
        sport,
        teamId,
        maxPlayers: 900,
        concurrency: 12,
      }).catch(() => ({
        sport,
        teamId,
        rosterFetchedOk: false,
        attempted: 0,
        warmed: 0,
        failures: 0,
      }))
    );
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const { extractRosterPlayersForEnqueue } = await import("../services/playerDocuments/prebuildEnqueue");
          const rosterPlayers = extractRosterPlayersForEnqueue(profileRes.body).map((row) => ({
            playerId: row.playerId,
            playerName: row.name,
          }));
          if (rosterPlayers.length > 0) {
            await runBulkRosterBuild({
              db: c.env.DB,
              env: c.env,
              origin,
              sport,
              teamId: teamId,
              players: rosterPlayers,
              concurrency: 6,
              maxAttempts: 4,
            });
          }
        } catch {
          // non-fatal
        }
      })()
    );
  } else {
    incCounter("pageDataErrors");
  }

  console.log("[PageData][team-profile]", { sport, teamId, ms: now() - started, degraded: payload.degraded });
  return c.json(payload);
});

pageDataRouter.get("/player-profile", async (c) => {
  const started = now();
  incCounter("pageDataRequests");
  incCounter("pageDataPlayerProfileRequests");
  const sport = normalizeSport(c.req.query("sport") || "");
  const forceFresh = ["1", "true", "yes"].includes(String(c.req.query("fresh") || "").toLowerCase());
  const rawPlayerName = String(c.req.query("playerName") || c.req.query("player") || "").trim();
  const requestedPlayerIdRaw = String(c.req.query("playerId") || c.req.query("espnId") || "").trim();
  let upstreamFetchMs = 0;
  let effectivePlayerIdRaw = requestedPlayerIdRaw;
  const requestedPlayerId = normalizeCompactTokenForCache(requestedPlayerIdRaw);
  const playerName = rawPlayerName || (requestedPlayerId ? `player-${requestedPlayerId}` : "");

  if (!sport || sport === "ALL" || (!playerName && !requestedPlayerIdRaw)) {
    console.log("[PageData][player-profile][phase0]", {
      outcome: "bad_request",
      ms: now() - started,
      sport: sport || null,
      requestedPlayerName: playerName || null,
      expectedPlayerId: requestedPlayerId || null,
    });
    return c.json({ ok: false, error: "sport and playerId or playerName are required" }, 400);
  }
  if (!isValidEspnAthleteId(requestedPlayerIdRaw)) {
    console.log("[PageData][player-profile][phase0]", {
      outcome: "bad_request",
      ms: now() - started,
      sport: sport || null,
      reason: "playerId_required",
    });
    return c.json({ ok: false, error: "playerId (numeric ESPN athlete id) query parameter is required" }, 400);
  }
  const origin = new URL(c.req.url).origin;
  if (rawPlayerName && isValidEspnAthleteId(effectivePlayerIdRaw)) {
    try {
      const headshotPath =
        `/api/player/${encodeURIComponent(String(sport || "").toLowerCase())}/${encodeURIComponent(rawPlayerName)}/headshot`;
      const headshotStarted = now();
      const headshotRes = await readJsonWithBudget(`${origin}${headshotPath}`, 1800);
      upstreamFetchMs += Math.max(0, now() - headshotStarted);
      const mappedFromName = String(headshotRes.body?.espnId || "").trim();
      if (isValidEspnAthleteId(mappedFromName) && mappedFromName !== effectivePlayerIdRaw) {
        effectivePlayerIdRaw = mappedFromName;
      }
    } catch {
      // Non-fatal fallback.
    }
  }
  if (!requestedPlayerIdRaw && rawPlayerName && !rawPlayerName.toLowerCase().startsWith("player-")) {
    const mappedId = String(
      getEspnAthleteIdForPlayerName(rawPlayerName, String(sport || "").toLowerCase()) || ""
    ).trim();
    if (isValidEspnAthleteId(mappedId)) {
      effectivePlayerIdRaw = mappedId;
    }
  }
  const canonical = await resolveCanonicalPlayerIdentity({
    db: c.env.DB,
    sport,
    playerId: effectivePlayerIdRaw,
    playerName: rawPlayerName || playerName || effectivePlayerIdRaw,
    source: "pageData.playerProfileGet",
  });
  if (!canonical.ok) {
    return c.json({ ok: false, error: "invalid_canonical_player_identity" }, 400);
  }
  effectivePlayerIdRaw = canonical.identity.espnPlayerId;

  incCounter("pageDataPlayerProfileUserReads");
  const policyDoc = getFreshnessPolicy("medium");
  const l1Key = playerProfilePageDataL1Key(sport, effectivePlayerIdRaw);
  const tL1Start = now();
  const l1Fresh = forceFresh ? null : readL1FreshGeneric(pageDataPlayerProfileL1, l1Key);
  if (l1Fresh?.data?.profile) {
    const metaPid = normalizeCompactTokenForCache(String(l1Fresh.meta.playerId || ""));
    const queryPid = normalizeCompactTokenForCache(effectivePlayerIdRaw);
    if (
      metaPid === queryPid
      && normalizeSport(String(l1Fresh.meta.sport || "")) === normalizeSport(sport)
    ) {
      incCounter("pageDataPlayerProfileDocumentHit");
      incCounter("pageDataL1Hits");
      const ms = now() - started;
      const msL1 = now() - tL1Start;
      console.log(
        JSON.stringify({
          event: "player_profile_get_timing",
          outcome: "l1_hit",
          msTotal: ms,
          msL1Read: msL1,
          msD1Read: 0,
          sport,
          playerId: queryPid,
        })
      );
      recordRouteRenderEvent({
        route: "player-profile",
        loadMs: ms,
        apiCalls: 0,
        oddsAvailableAtFirstRender: false,
      });
      const l1Out = ensurePlayerProfilePageDataRenderContract(l1Fresh);
      const l1Profile = (l1Out?.data?.profile || null) as Record<string, unknown> | null;
      if (hasUsablePlayerProfilePayloadForSport(l1Out, sport) && isProfileFullyReadyForClick(l1Profile)) {
        return c.json(l1Out);
      }
      // L1 can hold stale/incomplete snapshots. Fall through to D1 ready read.
    }
  }

  const tBeforeD1 = now();
  let rawDoc = await getStoredPlayerDocumentJson(c.env.DB, sport, effectivePlayerIdRaw);
  const msD1Read = now() - tBeforeD1;
  if (rawDoc) {
    try {
      const stored = JSON.parse(rawDoc) as StoredPlayerDocumentV1;
      const docPayload: PageDataPlayerProfilePayload = {
        route: "player-profile",
        generatedAt: new Date().toISOString(),
        freshness: {
          class: "medium",
          cacheTtlMs: policyDoc.cacheTtlMs,
          staleWindowMs: policyDoc.staleWindowMs,
          source: "l2",
          stale: false,
        },
        degraded: false,
        meta: stored.meta as PageDataPlayerProfilePayload["meta"],
        data: stored.data as PageDataPlayerProfilePayload["data"],
      };
      const metaPid = normalizeCompactTokenForCache(String(docPayload.meta.playerId || ""));
      const queryPid = normalizeCompactTokenForCache(effectivePlayerIdRaw);
      if (
        metaPid === queryPid
        && normalizeSport(String(docPayload.meta.sport || "")) === normalizeSport(sport)
        && docPayload.data?.profile
      ) {
        const docProfileBeforeRefresh = (docPayload.data?.profile || null) as Record<string, unknown> | null;
        if (
          isLocalDevRequest(c.req.url)
          && sport === "NHL"
          && !hasAnyRecentPropLine(docProfileBeforeRefresh)
        ) {
          const fallbackName = String(
            (docProfileBeforeRefresh as any)?.player?.displayName
            || (docProfileBeforeRefresh as any)?.player?.name
            || rawPlayerName
            || playerName
            || effectivePlayerIdRaw
          ).trim();
          await withTimeout(
            buildPlayerUntilReady({
              db: c.env.DB,
              env: c.env,
              origin,
              sport,
              playerId: effectivePlayerIdRaw,
              playerNameHint: fallbackName,
              maxAttempts: 2,
            }),
            12000,
            { ready: false, attempts: 0, reason: "local_nhl_refresh_timeout" }
          );
          rawDoc = await getStoredPlayerDocumentJson(c.env.DB, sport, effectivePlayerIdRaw);
          if (rawDoc) {
            const refreshed = JSON.parse(rawDoc) as StoredPlayerDocumentV1;
            docPayload.meta = refreshed.meta as PageDataPlayerProfilePayload["meta"];
            docPayload.data = refreshed.data as PageDataPlayerProfilePayload["data"];
          }
        }
        incCounter("pageDataPlayerProfileDocumentHit");
        incCounter("pageDataL2Hits");
        if (sport === "MLB" && docPayload.data?.profile?.player) {
          const profilePlayer = docPayload.data.profile.player as Record<string, unknown>;
          const rawPosition = String(profilePlayer.position || "").trim().toUpperCase();
          if (!rawPosition || rawPosition === "H") {
            const corePos = await fetchEspnCorePositionForAthlete(sport, effectivePlayerIdRaw);
            if (corePos) {
              profilePlayer.position = corePos;
            }
          }
        }
        const docOut = ensurePlayerProfilePageDataRenderContract(docPayload);
        const docProfile = (docOut?.data?.profile || null) as Record<string, unknown> | null;
        const readiness = evaluatePlayerProfileCoreReadiness(docProfile);
        const isRenderCompleteNow = isPlayerProfileDocumentCompleteForRender(docProfile);
        if (!isRenderCompleteNow) {
          console.warn("[PageData][player-profile][guardrail] render_contract_failed", {
            sport,
            playerId: queryPid,
            reasons: readiness.reasons,
            missingSections: readiness.missingSections,
          });
          c.set("pageDataUpstreamMs", upstreamFetchMs);
          return c.json(
            buildPlayerProfileDegradedShell(
              sport,
              queryPid || effectivePlayerIdRaw,
              rawPlayerName || playerName || queryPid || effectivePlayerIdRaw,
              "profile_not_ready_render_contract",
              {
                class: "medium",
                cacheTtlMs: policyDoc.cacheTtlMs,
                staleWindowMs: policyDoc.staleWindowMs,
                source: "l2",
                stale: true,
              }
            )
          );
        }
        if (!hasUsablePlayerProfilePayloadForSport(docOut, sport) || !readiness.ready) {
          console.warn("[PageData][player-profile][guardrail] readiness_failed", {
            sport,
            playerId: queryPid,
            reasons: readiness.reasons,
            missingSections: readiness.missingSections,
          });
          c.set("pageDataUpstreamMs", upstreamFetchMs);
          return c.json(
            buildPlayerProfileDegradedShell(
              sport,
              queryPid || effectivePlayerIdRaw,
              rawPlayerName || playerName || queryPid || effectivePlayerIdRaw,
              "profile_not_ready_readiness",
              {
                class: "medium",
                cacheTtlMs: policyDoc.cacheTtlMs,
                staleWindowMs: policyDoc.staleWindowMs,
                source: "l2",
                stale: true,
              }
            )
          );
        }
        writeL1Generic(
          pageDataPlayerProfileL1,
          l1Key,
          docOut,
          PLAYER_PROFILE_L1_TTL_MS,
          PLAYER_PROFILE_L1_STALE_MS
        );
        const ms = now() - started;
        console.log("[PageData][player-profile][phase0]", {
          outcome: "player_document",
          ms,
          sport,
          playerId: queryPid,
        });
        console.log(
          JSON.stringify({
            event: "player_profile_get_timing",
            outcome: "d1_hit",
            msTotal: ms,
            msL1Read: tBeforeD1 - tL1Start,
            msD1Read,
            sport,
            playerId: queryPid,
          })
        );
        recordRouteRenderEvent({
          route: "player-profile",
          loadMs: ms,
          apiCalls: 0,
          oddsAvailableAtFirstRender: false,
        });
        c.set("pageDataUpstreamMs", upstreamFetchMs);
        return c.json(docOut);
      }
    } catch {
      // miss
    }
  }
  incCounter("pageDataPlayerProfileDocumentMiss");
  incCounter("pageDataPlayerProfileSnapshotMiss");
  const msMiss = now() - started;
  console.warn("[PageData][player-profile] PLAYER_DOCUMENT_MISS_FALLBACK", {
    sport,
    playerName,
    playerId: effectivePlayerIdRaw,
    ms: msMiss,
  });
  console.log(
    JSON.stringify({
      event: "player_profile_get_timing",
      outcome: "fallback_shell",
      msTotal: msMiss,
      msL1Read: tBeforeD1 - tL1Start,
      msD1Read,
      sport,
      playerId: effectivePlayerIdRaw,
    })
  );
  if (isLocalDevRequest(c.req.url)) {
    const settled = await withTimeout(
      buildPlayerUntilReady({
        db: c.env.DB,
        env: c.env,
        origin,
        sport,
        playerId: effectivePlayerIdRaw,
        playerNameHint: rawPlayerName || playerName || effectivePlayerIdRaw,
        maxAttempts: 2,
      }),
      7000,
      { ready: false, attempts: 0, reason: "local_build_timeout" }
    );
    if (settled.ready) {
      const rebuiltRawDoc = await getStoredPlayerDocumentJson(c.env.DB, sport, effectivePlayerIdRaw);
      if (rebuiltRawDoc) {
        try {
          const rebuiltStored = JSON.parse(rebuiltRawDoc) as StoredPlayerDocumentV1;
          const rebuiltPayload: PageDataPlayerProfilePayload = {
            route: "player-profile",
            generatedAt: new Date().toISOString(),
            freshness: {
              class: "medium",
              cacheTtlMs: policyDoc.cacheTtlMs,
              staleWindowMs: policyDoc.staleWindowMs,
              source: "cold",
              stale: false,
            },
            degraded: false,
            meta: rebuiltStored.meta as PageDataPlayerProfilePayload["meta"],
            data: rebuiltStored.data as PageDataPlayerProfilePayload["data"],
          };
          const rebuiltOut = ensurePlayerProfilePageDataRenderContract(rebuiltPayload);
          const rebuiltProfile = (rebuiltOut?.data?.profile || null) as Record<string, unknown> | null;
          if (hasUsablePlayerProfilePayloadForSport(rebuiltOut, sport) && isProfileFullyReadyForClick(rebuiltProfile)) {
            writeL1Generic(
              pageDataPlayerProfileL1,
              l1Key,
              rebuiltOut,
              PLAYER_PROFILE_L1_TTL_MS,
              PLAYER_PROFILE_L1_STALE_MS
            );
            c.set("pageDataUpstreamMs", upstreamFetchMs);
            return c.json(rebuiltOut);
          }
        } catch {
          // fall through to standard 503 response
        }
      }
    }
  }
  c.set("pageDataUpstreamMs", upstreamFetchMs);
  return c.json(
    buildPlayerProfileDegradedShell(
      sport,
      effectivePlayerIdRaw,
      rawPlayerName || playerName || effectivePlayerIdRaw,
      "document_missing",
      {
        class: "medium",
        cacheTtlMs: policyDoc.cacheTtlMs,
        staleWindowMs: policyDoc.staleWindowMs,
        source: "cold",
        stale: false,
      }
    )
  );
});

pageDataRouter.post("/player-profile/build-bulk", async (c) => {
  incCounter("pageDataRequests");
  incCounter("pageDataPlayerProfileRequests");
  incCounter("pageDataPlayerBuildRequests");
  const body = await c.req.json().catch(() => null as any);
  const sport = normalizeSport(String(body?.sport || "").trim());
  const teamId = String(body?.teamId || "").trim() || null;
  const playersRaw = Array.isArray(body?.players) ? body.players : [];
  const players: BulkBuildPlayerInput[] = playersRaw.map((row: any) => ({
    playerId: String(row?.playerId || row?.id || row?.espnId || "").trim(),
    playerName: String(row?.playerName || row?.name || "").trim(),
  }));
  if (!sport || sport === "ALL") {
    return c.json({ ok: false, error: "sport is required" }, 400);
  }
  if (players.length === 0) {
    return c.json({ ok: false, error: "players[] is required" }, 400);
  }
  const origin = new URL(c.req.url).origin;
  const summary = await runBulkRosterBuild({
    db: c.env.DB,
    env: c.env,
    origin,
    sport,
    teamId,
    players,
    concurrency: Number(body?.concurrency || 6),
    maxAttempts: Number(body?.maxAttempts || 4),
  });
  return c.json({ ok: true, accepted: false, summary });
});

pageDataRouter.get("/player-profile/build-bulk-status", async (c) => {
  const jobId = String(c.req.query("jobId") || "").trim();
  if (!jobId) return c.json({ ok: false, error: "jobId is required" }, 400);
  const snapshot = bulkBuildJobs.get(jobId);
  if (!snapshot) return c.json({ ok: false, error: "job_not_found" }, 404);
  return c.json({ ok: true, job: snapshot });
});

pageDataRouter.post("/player-profile/coverage", async (c) => {
  incCounter("pageDataRequests");
  incCounter("pageDataPlayerProfileRequests");
  const body = await c.req.json().catch(() => null as any);
  const sport = normalizeSport(String(body?.sport || "").trim());
  const teamId = String(body?.teamId || "").trim() || null;
  const rawPlayers = Array.isArray(body?.players) ? body.players : [];
  if (!sport || sport === "ALL") {
    return c.json({ ok: false, error: "sport is required" }, 400);
  }
  if (!rawPlayers.length) {
    return c.json({ ok: false, error: "players[] is required" }, 400);
  }

  const latestJob = findLatestBulkJobSnapshot(sport, teamId);
  const failureByPlayer = new Map<string, string>();
  if (latestJob) {
    for (const row of latestJob.failedPlayers) {
      const pid = String(row?.playerId || "").trim();
      const reason = String(row?.reason || "").trim() || "failed";
      if (pid && !failureByPlayer.has(pid)) failureByPlayer.set(pid, reason);
    }
  }

  const players = await Promise.all(
    rawPlayers.map(async (row: any) => {
      const incomingId = String(row?.playerId || row?.id || row?.espnId || "").trim();
      const incomingName = String(row?.playerName || row?.name || "").trim();
      if (!isValidEspnAthleteId(incomingId)) {
        return {
          playerId: incomingId,
          playerName: incomingName,
          status: "invalid_player_id",
          ready: false,
          reason: "invalid_player_id",
        };
      }
      const canonical = await resolveCanonicalPlayerIdentity({
        db: c.env.DB,
        sport,
        playerId: incomingId,
        playerName: incomingName || incomingId,
        source: "pageData.playerProfileCoverage",
      });
      if (!canonical.ok) {
        return {
          playerId: incomingId,
          playerName: incomingName,
          status: "canonical_resolution_failed",
          ready: false,
          reason: "reason" in canonical ? canonical.reason : "canonical_resolution_failed",
        };
      }
      const playerId = canonical.identity.espnPlayerId;
      const record = await getStoredPlayerDocumentRecord(c.env.DB, sport, playerId);
      if (!record) {
        return {
          playerId,
          playerName: canonical.identity.displayName,
          status: "missing_document",
          ready: false,
          reason: failureByPlayer.get(playerId) || "document_missing",
        };
      }
      try {
        const parsed = JSON.parse(record.documentJson) as StoredPlayerDocumentV1;
        const profile = (parsed?.data?.profile || null) as Record<string, unknown> | null;
        const readiness = evaluatePlayerProfileCoreReadiness(profile);
        const renderComplete = isPlayerProfileDocumentCompleteForRender(profile);
        return {
          playerId,
          playerName: canonical.identity.displayName,
          status: readiness.ready ? "ready" : "incomplete",
          ready: readiness.ready,
          renderComplete,
          reason:
            parsed?.meta?.partialReason
            || failureByPlayer.get(playerId)
            || (readiness.ready ? null : readiness.reasons.join(",")),
          sectionStates: {
            identity: readiness.identityValid ? "ready" : "missing",
            gameLog: readiness.hasGameLog ? "ready" : "missing",
            seasonAverages: readiness.hasSeasonAverages ? "ready" : "missing",
            markets: readiness.hasMarketEvidence ? "ready" : "missing",
          },
          builtAt: record.builtAt,
          updatedAt: record.updatedAt,
        };
      } catch {
        return {
          playerId,
          playerName: canonical.identity.displayName,
          status: "invalid_document_json",
          ready: false,
          reason: "invalid_document_json",
        };
      }
    })
  );

  const ready = players.filter((row) => row.ready).length;
  return c.json({
    ok: true,
    sport,
    teamId,
    total: players.length,
    ready,
    incomplete: players.length - ready,
    latestJob: latestJob || null,
    players,
  });
});

pageDataRouter.get("/player-profile/coverage", async (c) => {
  const sport = normalizeSport(String(c.req.query("sport") || "").trim());
  const teamId = String(c.req.query("teamId") || "").trim() || null;
  const playerIds = String(c.req.query("playerIds") || c.req.query("playerId") || "")
    .split(",")
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  if (!sport || sport === "ALL") {
    return c.json({ ok: false, error: "sport is required" }, 400);
  }
  if (playerIds.length === 0) {
    return c.json({ ok: false, error: "playerIds query is required" }, 400);
  }
  const body = {
    sport,
    teamId,
    players: playerIds.map((playerId) => ({ playerId })),
  };
  const req = new Request("http://local/player-profile/coverage", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return pageDataRouter.fetch(req, c.env, c.executionCtx);
});

pageDataRouter.get("/player-profile/build", async (c) => {
  incCounter("pageDataRequests");
  incCounter("pageDataPlayerProfileRequests");
  incCounter("pageDataPlayerBuildRequests");
  const providedKey = String(c.req.header("x-page-data-admin-key") || "").trim();
  const expectedKey = String(c.env.PAGE_DATA_WARM_BYPASS_KEY || c.env.MOCHA_USERS_SERVICE_API_KEY || "").trim();
  const explicitLocalBypass = ["1", "true", "yes"].includes(String(c.req.query("localBypass") || "").toLowerCase());
  const localDevBypass = isLocalDevRequest(c.req.url) && (explicitLocalBypass || !expectedKey);
  if (!expectedKey && !localDevBypass) {
    return c.json({ ok: false, error: "Builder key is not configured" }, 503);
  }
  if (!localDevBypass && (!providedKey || providedKey !== expectedKey)) {
    return c.json({ ok: false, error: "Unauthorized builder access" }, 401);
  }
  const sport = normalizeSport(c.req.query("sport") || "");
  const playerNameHint = String(c.req.query("playerName") || c.req.query("player") || "").trim();
  const playerIdRaw = String(c.req.query("playerId") || c.req.query("espnId") || "").trim();
  if (!sport || sport === "ALL" || !isValidEspnAthleteId(playerIdRaw)) {
    return c.json({ ok: false, error: "sport and numeric playerId are required" }, 400);
  }
  const origin = new URL(c.req.url).origin;
  const canonical = await resolveCanonicalPlayerIdentity({
    db: c.env.DB,
    sport,
    playerId: playerIdRaw,
    playerName: playerNameHint || playerIdRaw,
    source: "pageData.playerProfileBuild",
  });
  if (!canonical.ok) {
    return c.json(
      {
        ok: false,
        built: false,
        reason: "reason" in canonical ? canonical.reason : "canonical_resolution_failed",
        sport,
        playerId: playerIdRaw,
      },
      422
    );
  }
  const canonicalId = canonical.identity.espnPlayerId;
  const canonicalName = canonical.identity.displayName || playerNameHint || canonicalId;
  const result = await buildPlayerDocument({
    db: c.env.DB,
    env: c.env as any,
    sport,
    playerId: canonicalId,
    playerNameHint: canonicalName || null,
    origin,
  });
  if (result.ok) {
    return c.json({ ok: true, built: true, sport, playerId: canonicalId });
  }
  return c.json(
    {
      ok: false,
      built: false,
      reason: "reason" in result ? result.reason : "build_failed",
      sport,
      playerId: canonicalId,
    },
    422
  );
});

pageDataRouter.get("/player-profile/build-queue", async (c) => {
  incCounter("pageDataRequests");
  incCounter("pageDataPlayerProfileRequests");
  incCounter("pageDataPlayerBuildRequests");
  if (isLocalDevRequest(c.req.url)) {
    return c.json({ ok: false, error: "queue_disabled_in_local_dev" }, 409);
  }
  const providedKey = String(c.req.header("x-page-data-admin-key") || "").trim();
  const expectedKey = String(c.env.PAGE_DATA_WARM_BYPASS_KEY || c.env.MOCHA_USERS_SERVICE_API_KEY || "").trim();
  const explicitLocalBypass = ["1", "true", "yes"].includes(String(c.req.query("localBypass") || "").toLowerCase());
  const localDevBypass = isLocalDevRequest(c.req.url) && (explicitLocalBypass || !expectedKey);
  if (!expectedKey && !localDevBypass) {
    return c.json({ ok: false, error: "Builder key is not configured" }, 503);
  }
  if (!localDevBypass && (!providedKey || providedKey !== expectedKey)) {
    return c.json({ ok: false, error: "Unauthorized builder access" }, 401);
  }

  const limitRaw = Number.parseInt(String(c.req.query("limit") || "120"), 10);
  const loopsRaw = Number.parseInt(String(c.req.query("loops") || "1"), 10);
  const runAsync = ["1", "true", "yes"].includes(String(c.req.query("async") || "").toLowerCase());
  const replayDeadLetter = ["1", "true", "yes"].includes(String(c.req.query("replayDeadLetter") || "").toLowerCase());
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(300, limitRaw)) : 120;
  const loops = Number.isFinite(loopsRaw) ? Math.max(1, Math.min(20, loopsRaw)) : 1;
  const origin = new URL(c.req.url).origin;

  const runDrain = async () => {
    const { processPlayerDocumentQueue, replayDeadLetterPlayerDocumentJobs } = await import("../services/playerDocuments/ingestion");
    let replayed = 0;
    if (replayDeadLetter) {
      replayed = (await replayDeadLetterPlayerDocumentJobs(c.env.DB, limit)).replayed;
    }
    let processed = 0;
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < loops; i += 1) {
      const res = await processPlayerDocumentQueue({
        db: c.env.DB,
        env: c.env as any,
        origin,
        limit,
      });
      processed += Number(res.processed || 0);
      ok += Number(res.ok || 0);
      failed += Number(res.failed || 0);
      if (!res.processed) break;
    }
    return { processed, ok, failed, replayed };
  };

  if (runAsync && c.executionCtx?.waitUntil) {
    c.executionCtx.waitUntil(runDrain());
    return c.json({ ok: true, scheduled: true, limit, loops, replayDeadLetter });
  }

  const res = await runDrain();
  return c.json({
    ok: true,
    processed: res.processed,
    builtOk: res.ok,
    builtFailed: res.failed,
    replayedDeadLetter: res.replayed,
    limit,
    loops,
  });
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

  if (ENFORCE_SNAPSHOT_READ_ONLY_REQUEST_PATH) {
    if (hasUsableLeagueOverviewPayload(l1Stale)) {
      incCounter("pageDataL1Hits");
      return c.json(patchFreshness(l1Stale!, "l1", true));
    }
    incCounter("pageDataColdPath");
    incCounter("pageDataErrors");
    const unavailablePayload: PageDataLeagueOverviewPayload = {
      route: "league-overview",
      generatedAt: new Date().toISOString(),
      freshness: {
        class: "medium",
        cacheTtlMs: policy.cacheTtlMs,
        staleWindowMs: policy.staleWindowMs,
        source: "cold",
        stale: false,
      },
      degraded: true,
      meta: { leagueId, partialReason: "snapshot_missing" },
      data: {
        league: null,
        standings: [],
        availablePeriods: [],
        currentPeriod: "",
        gamesWithPicks: [],
        survivorMembers: [],
        activeTab: "live",
      },
    };
    return c.json(unavailablePayload);
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

  if (ENFORCE_SNAPSHOT_READ_ONLY_REQUEST_PATH) {
    if (hasUsableLeagueGameDayPayload(l1Stale)) {
      incCounter("pageDataL1Hits");
      return c.json(patchFreshness(l1Stale!, "l1", true));
    }
    incCounter("pageDataColdPath");
    incCounter("pageDataErrors");
    const unavailablePayload: PageDataLeagueGameDayPayload = {
      route: "league-gameday",
      generatedAt: new Date().toISOString(),
      freshness: {
        class: "medium",
        cacheTtlMs: policy.cacheTtlMs,
        staleWindowMs: policy.staleWindowMs,
        source: "cold",
        stale: false,
      },
      degraded: true,
      meta: { leagueId, partialReason: "snapshot_missing" },
      data: {
        league: null,
        currentPeriod: "",
        events: [],
        picks: [],
        standings: [],
      },
    };
    return c.json(unavailablePayload);
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

  if (ENFORCE_SNAPSHOT_READ_ONLY_REQUEST_PATH) {
    if (hasUsableLeaguePicksPayload(l1Stale)) {
      incCounter("pageDataL1Hits");
      return c.json(patchFreshness(l1Stale!, "l1", true));
    }
    incCounter("pageDataColdPath");
    incCounter("pageDataErrors");
    const unavailablePayload: PageDataLeaguePicksPayload = {
      route: "league-picks",
      generatedAt: new Date().toISOString(),
      freshness: {
        class: "medium",
        cacheTtlMs: policy.cacheTtlMs,
        staleWindowMs: policy.staleWindowMs,
        source: "cold",
        stale: false,
      },
      degraded: true,
      meta: { leagueId, partialReason: "snapshot_missing" },
      data: {
        league: null,
        availablePeriods: [],
        currentPeriod: "",
        events: [],
        picks: [],
        paymentEligibility: null,
      },
    };
    return c.json(unavailablePayload);
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

pageDataRouter.post("/warm", async (c) => {
  // Temporary launch bypass: allow internal token auth for urgent warm runs.
  // If header token is absent/invalid, route falls back to normal user auth.
  const providedWarmKey = String(c.req.header("x-page-data-admin-key") || "").trim();
  const expectedWarmKey = String(c.env.PAGE_DATA_WARM_BYPASS_KEY || c.env.MOCHA_USERS_SERVICE_API_KEY || "").trim();
  const bypassAuthorized = Boolean(expectedWarmKey) && Boolean(providedWarmKey) && providedWarmKey === expectedWarmKey;

  if (!bypassAuthorized) {
    const authResult = await authMiddleware(c, async () => {});
    if (authResult) return authResult;
  }

  const forceFresh = ["1", "true", "yes"].includes(String(c.req.query("fresh") || "").toLowerCase());
  const date = getDateFromQuery(c.req.query("date"));
  const laneRaw = String(c.req.query("lane") || "").trim().toLowerCase();
  const lane = laneRaw === "live" || laneRaw === "core" || laneRaw === "depth" || laneRaw === "full" ? laneRaw : "full";
  const activeSport = String(c.req.query("activeSport") || "").trim() || undefined;
  const origin = new URL(c.req.url).origin;

  const summary = await runPageDataWarmCycle({
    forceFresh,
    date,
    lane,
    activeSport,
    db: c.env.DB,
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

pageDataRouter.post("/warm-hint", async (c) => {
  const body = await c.req.json().catch(() => null as any);
  const eventType = String(body?.eventType || "").trim().toLowerCase();
  const priority = String(body?.priority || body?.warmPriority || "").trim().toLowerCase();
  const sport = normalizeSport(String(body?.sport || "").trim());
  const teamId = String(body?.teamId || "").trim();
  const gameId = String(body?.gameId || "").trim();
  const date = getDateFromQuery(String(body?.date || "").trim() || undefined);
  const fullSportWarm = ["1", "true", "yes"].includes(String(body?.fullSportWarm || "").trim().toLowerCase());
  const internalWarmRequest = String(c.req.header("x-page-data-warm") || "").trim() === "1";
  let playerNames = Array.isArray(body?.playerNames) ? body.playerNames : [];
  const uiVisibleAll = Boolean(body?.uiVisibleAll ?? body?.propsPageVisible);
  const highPriority =
    uiVisibleAll ||
    eventType === "intent" ||
    priority === "intent" ||
    priority === "high" ||
    body?.navigationIntent === true;
  const rawMaxFromBody = Number(body?.maxPlayers);
  const maxPlayers = uiVisibleAll
    ? Math.max(
        1,
        Math.min(
          12_000,
          Number.isFinite(rawMaxFromBody) && rawMaxFromBody > 0
            ? rawMaxFromBody
            : Math.max(8000, Array.isArray(body?.playerNames) ? body.playerNames.length : 0)
        )
      )
    : Math.max(1, Math.min(420, Number(body?.maxPlayers || (highPriority ? 260 : 160))));
  const warmConcurrency = uiVisibleAll ? 14 : highPriority ? 9 : 6;
  const rosterMaxPlayers = Math.max(maxPlayers, highPriority ? (uiVisibleAll ? 900 : 240) : 180);

  if (!eventType) {
    return c.json({ ok: false, error: "eventType is required" }, 400);
  }

  // UI-visible props feed: warm listed players first so scheduled sweeps never starve click-path coverage.
  c.executionCtx.waitUntil((async () => {
    try {
      const fetchFn = createPageDataWarmFetchFn(c, uiVisibleAll ? "warm-hint-ui-visible" : "warm-hint");
      if (
        uiVisibleAll
        && sport
        && sport !== "ALL"
        && Array.isArray(playerNames)
        && playerNames.length > 0
      ) {
        await warmPlayersForSport({
          fetchFn,
          sport,
          playerNames,
          maxPlayers,
          concurrency: warmConcurrency,
          forceFresh: true,
        });
        return;
      }
      if (fullSportWarm && internalWarmRequest && sport && sport !== "ALL") {
        const fullWarmCooldownKey = makeCacheKey("page-data-warm", `full-sport-hint-v2:${sport}`);
        const recentlyTriggered = await getCachedData<{ at?: string }>(c.env.DB, fullWarmCooldownKey).catch(() => null);
        if (!recentlyTriggered) {
          await setCachedData(
            c.env.DB,
            fullWarmCooldownKey,
            "page-data-warm",
            `full-sport-hint:${sport}`,
            { at: new Date().toISOString() },
            20 * 60
          ).catch(() => {});
          const standingsRes = await fetchFn(`/api/teams/${encodeURIComponent(sport)}/standings`);
          const teams = Array.isArray(standingsRes.body?.teams) ? standingsRes.body.teams : [];
          const teamTargets = Array.from(
            new Set(
              teams
                .map((row: any) => String(row?.id || row?.alias || "").trim())
                .filter(Boolean)
            )
          );
          const chunkSize = 2;
          for (let i = 0; i < teamTargets.length; i += chunkSize) {
            const chunk = teamTargets.slice(i, i + chunkSize);
            await Promise.allSettled(
              chunk.map((targetTeamId) =>
                warmTeamRoster({
                  fetchFn,
                  sport,
                  teamId: targetTeamId,
                  maxPlayers: Math.max(rosterMaxPlayers, 320),
                  concurrency: Math.max(warmConcurrency, 7),
                  forceFresh: false,
                })
              )
            );
          }
        }
      }
      if (
        (eventType === "players" || eventType === "intent")
        && sport
        && playerNames.length === 0
      ) {
        const origin = new URL(c.req.url).origin;
        const headers = buildForwardHeaders(c);
        headers.set("x-page-data-warm", "1");
        const propsRes = await readJsonWithBudget(
          `${origin}/api/sports-data/props/today?sport=${encodeURIComponent(sport)}&limit=3000&offset=0`,
          7_000,
          { headers }
        );
        const rows = Array.isArray(propsRes.body?.props) ? propsRes.body.props : [];
        const dedup = new Set<string>();
        for (const row of rows) {
          const name = normalizePlayerNameForWarm(
            String(row?.player_name || row?.playerName || row?.name || "").trim()
          );
          if (!name) continue;
          dedup.add(name);
          if (!uiVisibleAll && dedup.size >= maxPlayers) break;
          if (uiVisibleAll && dedup.size >= 12_000) break;
        }
        playerNames = Array.from(dedup);
      }
      if (sport && sport !== "ALL") {
        await setCachedData(c.env.DB, ACTIVE_SPORT_CACHE_KEY, "page-data-warm", "active-sport", { sport }, 20 * 60);
      }
      if ((eventType === "team" || eventType === "game" || eventType === "intent") && sport && teamId) {
        await warmTeamRoster({
          fetchFn,
          sport,
          teamId,
          maxPlayers: rosterMaxPlayers,
          concurrency: warmConcurrency,
          forceFresh: highPriority,
        });
      }
      if (eventType === "game" && sport && gameId) {
        const origin = new URL(c.req.url).origin;
        const headers = buildForwardHeaders(c);
        headers.set("x-page-data-warm", "1");
        const gameRes = await readJsonWithBudget(
          `${origin}/api/page-data/game-detail?gameId=${encodeURIComponent(gameId)}&sport=${encodeURIComponent(sport)}`,
          9000,
          { headers }
        );
        if (gameRes.ok && gameRes.body?.game) {
          const g = gameRes.body.game;
          const { home, away } = getHomeAwayTeamIdsForWarm(g);
          await Promise.allSettled(
            [home, away]
              .filter((value): value is string => Boolean(value))
              .map((targetTeamId) =>
                warmTeamRoster({
                  fetchFn,
                  sport,
                  teamId: targetTeamId,
                  maxPlayers: rosterMaxPlayers,
                  concurrency: warmConcurrency,
                  forceFresh: highPriority,
                })
              )
          );
        }
      }
      if (
        (eventType === "props" || eventType === "players" || eventType === "team" || eventType === "intent")
        && sport
        && playerNames.length > 0
      ) {
        await warmPlayersForSport({
          fetchFn,
          sport,
          playerNames,
          maxPlayers,
          concurrency: warmConcurrency,
          forceFresh: highPriority,
        });
      }
      if (
        (eventType === "props" || eventType === "players")
        && sport
        && sport !== "ALL"
      ) {
        const origin = new URL(c.req.url).origin;
        const headers = buildForwardHeaders(c);
        headers.set("x-page-data-warm", "1");
        const tabs: Array<"scores" | "live"> = ["scores", "live"];
        const teamTargets = new Set<string>();
        for (const tab of tabs) {
          const gamesRes = await readJsonWithBudget(
            `${origin}/api/page-data/games?date=${encodeURIComponent(date)}&sport=${encodeURIComponent(sport)}&tab=${tab}`,
            9000,
            { headers }
          );
          const games = Array.isArray(gamesRes.body?.games) ? gamesRes.body.games : [];
          for (const row of games) {
            const { home, away } = getHomeAwayTeamIdsForWarm(row);
            if (home) teamTargets.add(home);
            if (away) teamTargets.add(away);
            const gid = normalizeGameId(row?.game_id || row?.id);
            if (!gid) continue;
            const detailRes = await readJsonWithBudget(
              `${origin}/api/page-data/game-detail?gameId=${encodeURIComponent(gid)}&sport=${encodeURIComponent(sport)}`,
              7000,
              { headers }
            );
            if (detailRes.ok && detailRes.body?.game) {
              const d = getHomeAwayTeamIdsForWarm(detailRes.body.game);
              if (d.home) teamTargets.add(d.home);
              if (d.away) teamTargets.add(d.away);
            }
          }
        }
        const targetTeamIds = Array.from(teamTargets);
        const teamChunkSize = 1;
        for (let i = 0; i < targetTeamIds.length; i += teamChunkSize) {
          const chunk = targetTeamIds.slice(i, i + teamChunkSize);
          await Promise.allSettled(
            chunk.map((targetTeamId) =>
              warmTeamRoster({
                fetchFn,
                sport,
                teamId: targetTeamId,
                maxPlayers: rosterMaxPlayers,
                concurrency: warmConcurrency,
                forceFresh: highPriority,
              })
            )
          );
        }
      }
    } catch {
      // non-fatal
    }
  })());

  return c.json({ ok: true, accepted: true });
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


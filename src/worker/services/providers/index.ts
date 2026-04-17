/**
 * Sports Data Provider Manager
 * 
 * Manages multiple data providers with fallback support.
 * SportsRadar is PRIMARY, ESPN is fallback.
 */

import type { Game } from "../../../shared/types";
import type {
  SportsDataProvider,
  SportKey,
  ProviderResponse,
  GameDetail,
  ProviderConfig,
} from "./types";
import { espnProvider } from "./espnProvider";
import { getSportsRadarGameProviderApiKey, sportsRadarGameProvider, initSportsRadarGameProvider } from "./sportsRadarGameProvider";
import { getSportsRadarProvider } from "../sports-data/sportsRadarProvider";

export * from "./types";
export { espnProvider } from "./espnProvider";
export { sportsRadarGameProvider, initSportsRadarGameProvider } from "./sportsRadarGameProvider";
export { 
  isOddsApiAvailable, 
  fetchOddsForSport, 
  fetchOddsForGame,
  getAvailableSports as getAvailableOddsSports,
  clearOddsCache,
} from "./oddsApiProvider";

export type ProviderErrorCategory =
  | "auth"
  | "rate_limit"
  | "timeout"
  | "upstream_5xx"
  | "no_data"
  | "legacy_id"
  | "unsupported"
  | "network"
  | "unknown";

type ProviderAttempt = {
  at: string;
  operation: "games" | "game";
  provider: string;
  sport?: SportKey;
  gameId?: string;
  success: boolean;
  fromCache: boolean;
  returnedCount?: number;
  fallbackUsed: boolean;
  fallbackFrom?: string;
  error?: string;
  errorCategory?: ProviderErrorCategory;
};

type ProviderStats = {
  provider: string;
  successes: number;
  failures: number;
  fallbackUsed: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorCategory: ProviderErrorCategory | null;
  lastError: string | null;
};

type ProviderTelemetry = {
  totals: {
    requests: number;
    successes: number;
    failures: number;
    fallbackEvents: number;
  };
  providerStats: Record<string, ProviderStats>;
  recentAttempts: ProviderAttempt[];
  lastUpdatedAt: string | null;
};

export type PartnerAlert = {
  id: string;
  severity: "info" | "warning" | "critical";
  category:
    | "fallback_rate"
    | "failure_rate"
    | "auth"
    | "provider_down"
    | "stale_success";
  provider: string | "provider_chain";
  message: string;
  nextAction: string;
  triggeredAt: string;
  metric?: string;
  value?: number;
  threshold?: number;
};

// Provider registry - SportsRadar PRIMARY, ESPN fallback
const providers = new Map<string, SportsDataProvider>();
providers.set("sportsRadar", sportsRadarGameProvider);
providers.set("espn", espnProvider);

// Provider configuration
let providerConfigs: ProviderConfig[] = [
  { id: "sportsRadar", name: "SportsRadar", enabled: true, priority: 1 }, // PRIMARY
  { id: "espn", name: "ESPN", enabled: true, priority: 2 }, // Fallback
];

const providerTelemetry: ProviderTelemetry = {
  totals: {
    requests: 0,
    successes: 0,
    failures: 0,
    fallbackEvents: 0,
  },
  providerStats: {},
  recentAttempts: [],
  lastUpdatedAt: null,
};

function getOrInitProviderStats(provider: string): ProviderStats {
  if (!providerTelemetry.providerStats[provider]) {
    providerTelemetry.providerStats[provider] = {
      provider,
      successes: 0,
      failures: 0,
      fallbackUsed: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastErrorCategory: null,
      lastError: null,
    };
  }
  return providerTelemetry.providerStats[provider];
}

export function categorizeProviderError(error?: string): ProviderErrorCategory {
  const normalized = (error || "").toLowerCase();
  if (!normalized) return "unknown";
  if (
    normalized.includes("401") ||
    normalized.includes("403") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden") ||
    normalized.includes("invalid key") ||
    normalized.includes("api key")
  ) return "auth";
  if (
    normalized.includes("429") ||
    normalized.includes("rate limit") ||
    normalized.includes("too many requests")
  ) return "rate_limit";
  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("aborted") ||
    normalized.includes("aborterror")
  ) return "timeout";
  if (
    normalized.includes("http 5") ||
    normalized.includes("server error") ||
    normalized.includes("bad gateway") ||
    normalized.includes("service unavailable")
  ) return "upstream_5xx";
  if (
    normalized.includes("not found") ||
    normalized.includes("no data") ||
    normalized.includes("live data unavailable")
  ) return "no_data";
  if (
    normalized.includes("legacy") ||
    normalized.includes("no longer supported")
  ) return "legacy_id";
  if (normalized.includes("unsupported")) return "unsupported";
  if (
    normalized.includes("network") ||
    normalized.includes("fetch failed") ||
    normalized.includes("econn") ||
    normalized.includes("enotfound")
  ) return "network";
  return "unknown";
}

function recordProviderAttempt(attempt: ProviderAttempt): void {
  const nowIso = new Date().toISOString();
  providerTelemetry.totals.requests += 1;
  providerTelemetry.lastUpdatedAt = nowIso;
  if (attempt.success) {
    providerTelemetry.totals.successes += 1;
  } else {
    providerTelemetry.totals.failures += 1;
  }
  if (attempt.fallbackUsed) {
    providerTelemetry.totals.fallbackEvents += 1;
  }

  const stats = getOrInitProviderStats(attempt.provider);
  if (attempt.success) {
    stats.successes += 1;
    stats.lastSuccessAt = nowIso;
  } else {
    stats.failures += 1;
    stats.lastFailureAt = nowIso;
    stats.lastErrorCategory = attempt.errorCategory || "unknown";
    stats.lastError = attempt.error || null;
  }
  if (attempt.fallbackUsed) {
    stats.fallbackUsed += 1;
  }

  providerTelemetry.recentAttempts.unshift(attempt);
  if (providerTelemetry.recentAttempts.length > 150) {
    providerTelemetry.recentAttempts.length = 150;
  }
}

export function getProviderTelemetry(): ProviderTelemetry {
  return JSON.parse(JSON.stringify(providerTelemetry)) as ProviderTelemetry;
}

export function resetProviderTelemetry(): void {
  providerTelemetry.totals = {
    requests: 0,
    successes: 0,
    failures: 0,
    fallbackEvents: 0,
  };
  providerTelemetry.providerStats = {};
  providerTelemetry.recentAttempts = [];
  providerTelemetry.lastUpdatedAt = null;
}

function minutesSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return (Date.now() - ms) / 60000;
}

export function getPartnerAlerts(options?: { minSampleSize?: number }): PartnerAlert[] {
  const telemetry = getProviderTelemetry();
  const minSample = options?.minSampleSize ?? 8;
  const nowIso = new Date().toISOString();
  const alerts: PartnerAlert[] = [];

  const requests = telemetry.totals.requests;
  const failures = telemetry.totals.failures;
  const successes = telemetry.totals.successes;
  const fallbackEvents = telemetry.totals.fallbackEvents;

  if (requests >= minSample) {
    const fallbackRate = fallbackEvents / requests;
    if (fallbackRate >= 0.35) {
      alerts.push({
        id: "fallback-rate-high",
        severity: "warning",
        category: "fallback_rate",
        provider: "provider_chain",
        message: "Fallback usage is elevated across partner requests.",
        nextAction: "Inspect primary provider health and review recent fallback reasons.",
        triggeredAt: nowIso,
        metric: "fallback_rate",
        value: Number(fallbackRate.toFixed(3)),
        threshold: 0.35,
      });
    }

    const failureRate = failures / requests;
    if (failureRate >= 0.45 && failures > successes) {
      alerts.push({
        id: "failure-rate-high",
        severity: "warning",
        category: "failure_rate",
        provider: "provider_chain",
        message: "Provider-chain failure rate is above SLA threshold.",
        nextAction: "Check upstream partner status and retry critical refresh endpoints.",
        triggeredAt: nowIso,
        metric: "failure_rate",
        value: Number(failureRate.toFixed(3)),
        threshold: 0.45,
      });
    }
  }

  const authErrors = telemetry.recentAttempts.filter((attempt) => attempt.errorCategory === "auth").length;
  if (authErrors >= 2) {
    alerts.push({
      id: "auth-errors-detected",
      severity: "critical",
      category: "auth",
      provider: "provider_chain",
      message: "Multiple partner auth failures detected recently.",
      nextAction: "Rotate or validate partner API credentials and re-check health endpoints.",
      triggeredAt: nowIso,
      metric: "auth_error_count",
      value: authErrors,
      threshold: 2,
    });
  }

  for (const config of getProviderConfigs().filter((provider) => provider.enabled)) {
    const stat = telemetry.providerStats[config.name];
    if (!stat) continue;

    if (stat.failures >= 3 && stat.successes === 0) {
      alerts.push({
        id: `provider-down-${config.id}`,
        severity: "critical",
        category: "provider_down",
        provider: config.name,
        message: `${config.name} has repeated failures without any successful responses.`,
        nextAction: `Investigate ${config.name} connectivity, quotas, and auth configuration.`,
        triggeredAt: nowIso,
        metric: "provider_failures",
        value: stat.failures,
        threshold: 3,
      });
    }

    const minsSinceSuccess = minutesSince(stat.lastSuccessAt);
    if (minsSinceSuccess !== null && minsSinceSuccess > 45 && stat.failures > 0) {
      alerts.push({
        id: `stale-success-${config.id}`,
        severity: "warning",
        category: "stale_success",
        provider: config.name,
        message: `${config.name} has not had a successful response for over 45 minutes.`,
        nextAction: `Trigger a targeted refresh and verify ${config.name} endpoint health.`,
        triggeredAt: nowIso,
        metric: "minutes_since_success",
        value: Number(minsSinceSuccess.toFixed(1)),
        threshold: 45,
      });
    }
  }

  return alerts;
}

function isExpectedFallbackError(error?: string): boolean {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return (
    normalized.includes("http 404") ||
    normalized.includes("not found") ||
    normalized.includes("no data")
  );
}

/**
 * Initialize providers that require API keys
 */
export function initProviders(env: { SPORTSRADAR_API_KEY?: string; DB?: any }): void {
  if (env.SPORTSRADAR_API_KEY) {
    initSportsRadarGameProvider(env.SPORTSRADAR_API_KEY);
    console.log("[Providers] SportsRadar initialized with API key (PRIMARY)");
  } else {
    console.warn("[Providers] SPORTSRADAR_API_KEY not set - SportsRadar will not be available");
  }
}

/**
 * Get all provider configurations
 */
export function getProviderConfigs(): ProviderConfig[] {
  return [...providerConfigs];
}

/**
 * Update a provider configuration
 */
export function updateProviderConfig(
  id: string,
  updates: Partial<Omit<ProviderConfig, "id">>
): ProviderConfig | null {
  const index = providerConfigs.findIndex(p => p.id === id);
  if (index === -1) return null;
  
  providerConfigs[index] = { ...providerConfigs[index], ...updates };
  return providerConfigs[index];
}

/**
 * Get enabled providers sorted by priority
 */
function getEnabledProviders(): SportsDataProvider[] {
  return providerConfigs
    .filter(c => c.enabled)
    .sort((a, b) => a.priority - b.priority)
    .map(c => providers.get(c.id))
    .filter((p): p is SportsDataProvider => p !== undefined && p.isAvailable());
}

/**
 * Get the active provider name
 */
export function getActiveProviderName(): string {
  const enabledProviders = getEnabledProviders();
  return enabledProviders[0]?.name || "None";
}

/**
 * Fetch games with automatic fallback
 */
export async function fetchGamesWithFallback(
  sport: SportKey,
  options?: { date?: string; status?: Game["status"] }
): Promise<ProviderResponse<Game[]>> {
  const enabledProviders = getEnabledProviders();
  const attemptedProviders: string[] = [];
  
  console.log(`[SCORES API] Fetching ${sport} games`, { 
    date: options?.date, 
    status: options?.status,
    enabledProviders: enabledProviders.map(p => p.name)
  });
  
  for (const provider of enabledProviders) {
    if (!provider.supportedSports.includes(sport)) continue;
    attemptedProviders.push(provider.name);
    
    const result = await provider.fetchGames(sport, options);
    
    console.log(`[SCORES API] ${provider.name} response for ${sport}:`, {
      count: result.data.length,
      fromCache: result.fromCache,
      error: result.error
    });
    
    const hasRows = Array.isArray(result.data) && result.data.length > 0;
    const hasHardError = Boolean(result.error);
    const shouldAllowEmptyFallback = !hasRows && !hasHardError;
    if (hasRows) {
      recordProviderAttempt({
        at: new Date().toISOString(),
        operation: "games",
        provider: provider.name,
        sport,
        success: true,
        fromCache: !!result.fromCache,
        returnedCount: result.data.length,
        fallbackUsed: attemptedProviders.length > 1,
        fallbackFrom: attemptedProviders.length > 1 ? attemptedProviders[0] : undefined,
      });
      return result;
    }

    if (shouldAllowEmptyFallback) {
      recordProviderAttempt({
        at: new Date().toISOString(),
        operation: "games",
        provider: provider.name,
        sport,
        success: false,
        fromCache: !!result.fromCache,
        returnedCount: result.data.length,
        fallbackUsed: false,
        error: "empty_result_trying_fallback",
        errorCategory: "no_data",
      });
      console.log(
        `[SCORES API] ${provider.name} returned empty slate for ${sport}; trying fallback provider`
      );
      continue;
    }

    recordProviderAttempt({
      at: new Date().toISOString(),
      operation: "games",
      provider: provider.name,
      sport,
      success: false,
      fromCache: !!result.fromCache,
      returnedCount: result.data.length,
      fallbackUsed: false,
      error: result.error,
      errorCategory: categorizeProviderError(result.error),
    });
    
    if (isExpectedFallbackError(result.error)) {
      console.log(
        `[SCORES API] ${provider.name} unavailable for ${sport}; trying fallback provider`
      );
    } else {
      console.warn(`[SCORES API] Provider ${provider.name} failed for ${sport}:`, result.error);
    }
  }
  
  console.log(`[SCORES API] No live data available for ${sport}`);
  return {
    data: [],
    fromCache: false,
    provider: "none",
    error: "Live data unavailable",
  };
}

/**
 * Fetch a single game with automatic fallback
 */
export async function fetchGameWithFallback(
  gameId: string
): Promise<ProviderResponse<GameDetail | null>> {
  const normalizedGameId = String(gameId || "").startsWith("soccer_sr:sport_event:")
    ? String(gameId).replace(/^soccer_/, "")
    : gameId;
  console.log(`[SCORES API] Fetching game detail:`, { gameId, normalizedGameId });
  
  const prefix = normalizedGameId.split("_")[0];
  
  // Handle SportsRadar soccer games (sr:match: or sr:sport_event: prefix)
  if (normalizedGameId.startsWith("sr:match:") || normalizedGameId.startsWith("sr:sport_event:")) {
    console.log(`[SCORES API] SportsRadar soccer game requested:`, { normalizedGameId });
    // Try to resolve from current provider slate so routes depending on fetchGameWithFallback
    // can still return non-404 responses for soccer event IDs.
    const [live, scheduled] = await Promise.all([
      fetchLiveGamesWithFallback({ sports: ["soccer"] }),
      fetchScheduledGamesWithFallback({ sports: ["soccer"], hours: 72 }),
    ]);
    const allSoccer = [...live.data, ...scheduled.data];
    const target = normalizedGameId.replace(/^soccer_/, "");
    const match = allSoccer.find((g) => {
      const gid = String(g.game_id || "");
      const ext = String(g.external_id || "");
      return gid === target || ext === target || `sr:sport_event:${ext}` === target;
    });
    if (match) {
      const response: ProviderResponse<GameDetail | null> = {
        data: {
          game: match,
          stats: [],
          playByPlay: [],
          injuries: [],
          weather: null,
          odds: [],
        },
        fromCache: live.fromCache && scheduled.fromCache,
        provider: "sportsRadar",
      };
      recordProviderAttempt({
        at: new Date().toISOString(),
        operation: "game",
        provider: "SportsRadar",
        gameId: normalizedGameId,
        success: true,
        fromCache: response.fromCache,
        returnedCount: 1,
        fallbackUsed: false,
      });
      return response;
    }
    // Deep-link fallback: resolve soccer event IDs directly from Soccer API.
    if (normalizedGameId.startsWith("sr:sport_event:")) {
      const apiKey = getSportsRadarGameProviderApiKey();
      if (apiKey) {
        const eventId = normalizedGameId.replace("sr:sport_event:", "");
        const provider = getSportsRadarProvider(null, null);
        let soccer = await provider.fetchSoccerMatchDetail(normalizedGameId, apiKey).catch(() => null);
        if (!soccer?.match) {
          soccer = await provider.fetchSoccerMatchDetail(eventId, apiKey).catch(() => null);
        }
        const matchData = soccer?.match;
        const home = matchData?.homeTeam;
        const away = matchData?.awayTeam;
        if (matchData && home && away) {
          const statusRaw = String(matchData?.status || "scheduled").toLowerCase();
          const game: Game = {
            game_id: normalizedGameId,
            external_id: eventId,
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
            home_team_code: String(home?.abbreviation || home?.name || "HOME"),
            home_team_name: String(home?.name || "Home"),
            start_time: String(matchData?.startTime || new Date().toISOString()),
            away_score: null,
            home_score: null,
            last_updated_at: new Date().toISOString(),
          };
          const response: ProviderResponse<GameDetail | null> = {
            data: {
              game,
              stats: [],
              playByPlay: [],
              injuries: [],
              weather: null,
              odds: [],
            },
            fromCache: false,
            provider: "sportsRadar",
          };
          recordProviderAttempt({
            at: new Date().toISOString(),
            operation: "game",
            provider: "SportsRadar",
            gameId: normalizedGameId,
            success: true,
            fromCache: false,
            returnedCount: 1,
            fallbackUsed: false,
          });
          return response;
        }
      }
    }
    const response: ProviderResponse<GameDetail | null> = {
      data: null,
      fromCache: false,
      provider: "sportsRadar",
      error: "Soccer game not found in provider slate",
    };
    recordProviderAttempt({
      at: new Date().toISOString(),
      operation: "game",
      provider: "SportsRadar",
      gameId: normalizedGameId,
      success: false,
      fromCache: false,
      fallbackUsed: false,
      error: response.error,
      errorCategory: categorizeProviderError(response.error),
    });
    return response;
  }
  
  // Handle SportsRadar games (sr_ prefix) - PRIMARY
  if (prefix === "sr") {
    console.log(`[SCORES API] SportsRadar game requested:`, { gameId: normalizedGameId });
    const result = await sportsRadarGameProvider.fetchGame(normalizedGameId);
    console.log(`[SCORES API] SportsRadar response for game:`, { 
      gameId: normalizedGameId, 
      found: !!result.data, 
      error: result.error 
    });
    if (result.data) {
      recordProviderAttempt({
        at: new Date().toISOString(),
        operation: "game",
        provider: "SportsRadar",
        gameId: normalizedGameId,
        success: true,
        fromCache: !!result.fromCache,
        returnedCount: 1,
        fallbackUsed: false,
      });
      return result;
    }
    recordProviderAttempt({
      at: new Date().toISOString(),
      operation: "game",
      provider: "SportsRadar",
      gameId: normalizedGameId,
      success: false,
      fromCache: !!result.fromCache,
      fallbackUsed: false,
      error: result.error || "Game not found",
      errorCategory: categorizeProviderError(result.error || "Game not found"),
    });
  }
  
  // Legacy SDIO games no longer supported - return not found
  if (prefix === "sdio") {
    console.log(`[SCORES API] Legacy SDIO game requested (no longer supported):`, { gameId: normalizedGameId });
    const response: ProviderResponse<GameDetail | null> = {
      data: null,
      fromCache: false,
      provider: "none",
      error: "Legacy game ID no longer supported",
    };
    recordProviderAttempt({
      at: new Date().toISOString(),
      operation: "game",
      provider: "none",
      gameId,
      success: false,
      fromCache: false,
      fallbackUsed: false,
      error: response.error,
      errorCategory: categorizeProviderError(response.error),
    });
    return response;
  }
  
  // Try ESPN for espn_ prefix
  if (prefix === "espn") {
    const result = await espnProvider.fetchGame(gameId);
    console.log(`[SCORES API] ESPN response for game:`, { 
      gameId, 
      found: !!result.data, 
      error: result.error 
    });
    if (result.data || !result.error) {
      recordProviderAttempt({
        at: new Date().toISOString(),
        operation: "game",
        provider: "ESPN",
        gameId,
        success: true,
        fromCache: !!result.fromCache,
        returnedCount: result.data ? 1 : 0,
        fallbackUsed: false,
      });
      return result;
    }
    recordProviderAttempt({
      at: new Date().toISOString(),
      operation: "game",
      provider: "ESPN",
      gameId,
      success: false,
      fromCache: !!result.fromCache,
      fallbackUsed: false,
      error: result.error || "Game not found",
      errorCategory: categorizeProviderError(result.error || "Game not found"),
    });
  }
  
  // Try all enabled providers
  const enabledProviders = getEnabledProviders();
  const attemptedProviders: string[] = [];
  
  for (const provider of enabledProviders) {
    attemptedProviders.push(provider.name);
    const result = await provider.fetchGame(gameId);
    
    console.log(`[SCORES API] ${provider.name} response for game:`, { 
      gameId, 
      found: !!result.data 
    });
    
    if (result.data) {
      recordProviderAttempt({
        at: new Date().toISOString(),
        operation: "game",
        provider: provider.name,
        gameId,
        success: true,
        fromCache: !!result.fromCache,
        returnedCount: 1,
        fallbackUsed: attemptedProviders.length > 1,
        fallbackFrom: attemptedProviders.length > 1 ? attemptedProviders[0] : undefined,
      });
      return result;
    }
    
    if (result.error) {
      recordProviderAttempt({
        at: new Date().toISOString(),
        operation: "game",
        provider: provider.name,
        gameId,
        success: false,
        fromCache: !!result.fromCache,
        fallbackUsed: false,
        error: result.error,
        errorCategory: categorizeProviderError(result.error),
      });
      if (isExpectedFallbackError(result.error)) {
        console.log(
          `[SCORES API] ${provider.name} unavailable for game ${gameId}; trying fallback provider`
        );
      } else {
        console.warn(`[SCORES API] Provider ${provider.name} failed for game ${gameId}:`, result.error);
      }
    }
  }
  
  return {
    data: null,
    fromCache: false,
    provider: "none",
    error: "Live data unavailable",
  };
}

/**
 * Fetch live games across all sports
 */
export async function fetchLiveGamesWithFallback(
  options?: { sports?: SportKey[] }
): Promise<ProviderResponse<Game[]>> {
  const sports: SportKey[] = options?.sports || ["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab", "soccer"];
  const allGames: Game[] = [];
  let provider = "mixed";
  let anyError = false;
  
  for (const sport of sports) {
    const result = await fetchGamesWithFallback(sport, { status: "IN_PROGRESS" });
    allGames.push(...result.data);
    if (result.error) anyError = true;
    if (result.data.length > 0) provider = result.provider;
  }
  
  allGames.sort((a, b) => {
    if (a.sport !== b.sport) return a.sport.localeCompare(b.sport);
    return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
  });
  
  return {
    data: allGames,
    fromCache: false,
    provider,
    error: anyError ? "Some providers failed" : undefined,
  };
}

/**
 * Fetch scheduled games
 */
export async function fetchScheduledGamesWithFallback(
  options?: { sports?: SportKey[]; hours?: number }
): Promise<ProviderResponse<Game[]>> {
  const sports: SportKey[] = options?.sports || ["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab", "soccer"];
  const hours = options?.hours || 48;
  const cutoff = Date.now() + hours * 60 * 60 * 1000;
  const allGames: Game[] = [];
  let provider = "mixed";
  
  for (const sport of sports) {
    const result = await fetchGamesWithFallback(sport, { status: "SCHEDULED" });
    const filtered = result.data.filter(g => 
      new Date(g.start_time).getTime() <= cutoff
    );
    allGames.push(...filtered);
    if (result.data.length > 0) provider = result.provider;
  }
  
  allGames.sort((a, b) => 
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
  
  return {
    data: allGames,
    fromCache: false,
    provider,
  };
}

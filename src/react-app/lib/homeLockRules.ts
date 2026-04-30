/**
 * HOMEPAGE LOCKED
 * Do not change behavior/order/render rules without explicit approval.
 * Homepage stability rules:
 * - exactly 3 Games Today cards
 * - soccer + White Sox logo stability
 * - static sport icon row behavior
 * - watchboards render immediately and stay synced on Home
 * - no flicker / no late visual swapping
 */

export const HOMEPAGE_MAX_GAMES = 3;
export const HOMEPAGE_GAME_FILL_ORDER = "live/today -> upcoming -> recent finals" as const;
export const HOMEPAGE_TARGETED_LOGO_PRIORITY = "soccer-and-white-sox-mapped-first" as const;
export const HOMEPAGE_ICON_ROW_STATIC = true;
export const HOMEPAGE_NO_RUNTIME_ICON_SWAP = true;

export const HOMEPAGE_STATIC_ICON_SOURCES = Object.freeze({
  nba: "/assets/sports/nba-ball-ai.svg?v=20260422",
  nfl: "/assets/sports/nfl-ball-ai.svg?v=20260422",
  mlb: "/assets/sports/mlb-ball-ai.svg?v=20260422",
  nhl: "/assets/sports/nhl-puck-ai.svg?v=20260422",
  ncaaf: "/assets/sports/ncaaf-ball-ai.svg?v=20260422",
  ncaab: "/assets/sports/ncaab-ball-ai.svg?v=20260422",
  soccer: "/assets/sports/soccer-ball-ai.svg?v=20260422",
  golf: "/assets/sports/golf-ball-ai.svg?v=20260422",
  mma: "/assets/sports/mma-gloves-ai.svg?v=20260422",
});

export type HomeCardCandidate = {
  id?: string | number | null;
  gameId?: string | number | null;
  game_id?: string | number | null;
  eventId?: string | number | null;
  event_id?: string | number | null;
  sport?: string | null;
  league?: string | null;
  status?: string | null;
  startTime?: string | null;
  start_time?: string | null;
  homeTeam?: { abbreviation?: string | null; name?: string | null } | null;
  awayTeam?: { abbreviation?: string | null; name?: string | null } | null;
};

function normalizeStatus(value: string | null | undefined): string {
  return String(value || "").trim().toUpperCase();
}

function normalizeText(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function toStartMs(game: HomeCardCandidate): number {
  const raw = String(game.startTime || game.start_time || "").trim();
  if (!raw) return Number.NaN;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : Number.NaN;
}

export function getHomeStableGameId(game: HomeCardCandidate, sportKey = ""): string {
  const eventId = String(game.eventId || game.event_id || "").trim();
  const gameId = String(game.gameId || game.game_id || game.id || "").trim();
  if (eventId && gameId) return `${eventId}:${gameId}`;
  if (gameId) return `game:${gameId}`;
  if (eventId) return `event:${eventId}`;
  const home = String(game.homeTeam?.abbreviation || game.homeTeam?.name || "").trim();
  const away = String(game.awayTeam?.abbreviation || game.awayTeam?.name || "").trim();
  const start = String(game.startTime || game.start_time || "").trim();
  const league = String(game.league || "").trim();
  const status = String(game.status || "").trim();
  return `${sportKey}:${league}:${home}-${away}-${start}-${status}`;
}

function isLiveLike(game: HomeCardCandidate): boolean {
  const status = normalizeStatus(game.status);
  return status === "LIVE" || status === "IN_PROGRESS" || status === "ACTIVE" || status === "HALFTIME";
}

function isFinalLike(game: HomeCardCandidate): boolean {
  const status = normalizeStatus(game.status);
  return status === "FINAL" || status === "COMPLETED" || status === "CLOSED";
}

function isUpcomingLike(game: HomeCardCandidate, nowMs: number): boolean {
  if (isLiveLike(game) || isFinalLike(game)) return false;
  const status = normalizeStatus(game.status);
  const scheduled = status === "SCHEDULED" || status === "NOT_STARTED" || status === "PRE_GAME" || status === "PREGAME";
  if (!scheduled) return false;
  const startMs = toStartMs(game);
  return Number.isFinite(startMs) ? startMs > nowMs : true;
}

export function buildHomeCards<T extends HomeCardCandidate>(games: T[], selectedSport: string): T[] {
  const nowMs = Date.now();
  const liveToday = games
    .filter((game) => isLiveLike(game))
    .sort((a, b) => (toStartMs(b) || Number.NEGATIVE_INFINITY) - (toStartMs(a) || Number.NEGATIVE_INFINITY));
  const upcoming = games
    .filter((game) => isUpcomingLike(game, nowMs))
    .sort((a, b) => (toStartMs(a) || Number.POSITIVE_INFINITY) - (toStartMs(b) || Number.POSITIVE_INFINITY));
  const recentFinals = games
    .filter((game) => isFinalLike(game))
    .sort((a, b) => (toStartMs(b) || Number.NEGATIVE_INFINITY) - (toStartMs(a) || Number.NEGATIVE_INFINITY));
  const remaining = games
    .slice()
    .sort((a, b) => (toStartMs(a) || Number.POSITIVE_INFINITY) - (toStartMs(b) || Number.POSITIVE_INFINITY));

  const pool = [...liveToday, ...upcoming, ...recentFinals, ...remaining];
  const next: T[] = [];
  const seen = new Set<string>();
  for (const game of pool) {
    const key = getHomeStableGameId(game, selectedSport);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(game);
    if (next.length >= HOMEPAGE_MAX_GAMES) break;
  }
  return next.slice(0, HOMEPAGE_MAX_GAMES);
}

export function isWhiteSoxAlias(teamAbbr: string | null | undefined, teamName: string | null | undefined): boolean {
  const abbr = String(teamAbbr || "").trim().toUpperCase();
  const name = normalizeText(teamName);
  return abbr === "CWS" || abbr === "CHW" || name.includes("white sox");
}

export function resolveHomeTeamLogo(input: {
  abbr: string;
  teamName?: string;
  sport?: string;
  mappedLogo?: string | null;
  inlineLogo?: string | null;
}) {
  const sport = String(input.sport || "").toUpperCase();
  const isSoccer = sport === "SOCCER";
  const isWhiteSox = isWhiteSoxAlias(input.abbr, input.teamName);
  const mappedLogo = String(input.mappedLogo || "").trim() || null;
  const inlineLogo = String(input.inlineLogo || "").trim() || null;
  const mappedIsSyntheticFallback = Boolean(mappedLogo && mappedLogo.startsWith("data:image/"));
  const targetedPriority = isSoccer || isWhiteSox;
  let logoSrc = targetedPriority ? (mappedLogo || inlineLogo) : (inlineLogo || mappedLogo);
  if (isSoccer && mappedIsSyntheticFallback && inlineLogo) {
    logoSrc = inlineLogo;
  }
  if (!logoSrc) {
    logoSrc = mappedLogo;
  }
  return {
    logoSrc: logoSrc || null,
    isSoccer,
    isWhiteSox,
    targetedPriority,
    suppressImgErrorFallback: targetedPriority,
  };
}

export function shouldDiscardStaleHomeWatchboardPayload(input: {
  fetchStartedAt: number;
  lastMutationAt: number;
  mutationVersionAtFetchStart: number;
  mutationVersionNow: number;
}): boolean {
  if (input.mutationVersionAtFetchStart !== input.mutationVersionNow) return true;
  return input.fetchStartedAt < input.lastMutationAt;
}

export type HomePayloadSummary = {
  gamesCount: number;
  resolvedGamesCount: number;
  watchboardCount: number;
  watchboardItemCount: number;
  hydratedWatchboardItemCount: number;
  placeholderWatchboardItemCount: number;
};

export type HomePayloadDiscardDecision = {
  discard: boolean;
  reason:
    | "stale_before_optimistic_mutation"
    | "stale_before_latest_accepted"
    | "weaker_payload"
    | "accept";
};

type HomeGameLike = {
  id?: string | number | null;
  gameId?: string | number | null;
  game_id?: string | number | null;
  homeTeam?: { abbreviation?: string | null; name?: string | null } | null;
  awayTeam?: { abbreviation?: string | null; name?: string | null } | null;
  home_team_code?: string | null;
  away_team_code?: string | null;
  status?: string | null;
};

type HomeBoardLike = {
  id?: number | string | null;
  gameIds?: Array<string | number | null> | null;
  games?: Array<HomeGameLike> | null;
};

function normalizeCode(value: string | null | undefined): string {
  return String(value || "").trim().toUpperCase();
}

function isPlaceholderCode(value: string | null | undefined): boolean {
  const normalized = normalizeCode(value);
  return !normalized || normalized === "TBD" || normalized === "UNKNOWN" || normalized === "UNK";
}

function isHydratedHomeGame(game: HomeGameLike): boolean {
  const homeCode = normalizeCode(game.homeTeam?.abbreviation || game.home_team_code);
  const awayCode = normalizeCode(game.awayTeam?.abbreviation || game.away_team_code);
  return !isPlaceholderCode(homeCode) && !isPlaceholderCode(awayCode);
}

export function summarizeHomePayload(input: {
  games?: HomeGameLike[] | null;
  watchboards?: HomeBoardLike[] | null;
}): HomePayloadSummary {
  const games = Array.isArray(input.games) ? input.games : [];
  const watchboards = Array.isArray(input.watchboards) ? input.watchboards : [];
  let watchboardItemCount = 0;
  let hydratedWatchboardItemCount = 0;
  let placeholderWatchboardItemCount = 0;

  for (const board of watchboards) {
    const boardGames = Array.isArray(board?.games) ? board.games : [];
    const ids = Array.isArray(board?.gameIds) ? board.gameIds : [];
    watchboardItemCount += Math.max(ids.length, boardGames.length);
    for (const game of boardGames) {
      if (isHydratedHomeGame(game)) hydratedWatchboardItemCount += 1;
      else placeholderWatchboardItemCount += 1;
    }
  }

  return {
    gamesCount: games.length,
    resolvedGamesCount: games.filter((game) => isHydratedHomeGame(game)).length,
    watchboardCount: watchboards.length,
    watchboardItemCount,
    hydratedWatchboardItemCount,
    placeholderWatchboardItemCount,
  };
}

function hasStableSignal(summary: HomePayloadSummary): boolean {
  return summary.resolvedGamesCount > 0
    || summary.hydratedWatchboardItemCount > 0
    || summary.watchboardItemCount > 0
    || summary.gamesCount >= HOMEPAGE_MAX_GAMES;
}

function isWeakerThanCurrent(
  incoming: HomePayloadSummary,
  current: HomePayloadSummary
): boolean {
  if (!hasStableSignal(current)) return false;
  if (incoming.gamesCount === 0 && current.gamesCount > 0) return true;
  if (incoming.resolvedGamesCount < current.resolvedGamesCount) return true;
  if (current.gamesCount >= HOMEPAGE_MAX_GAMES && incoming.gamesCount < HOMEPAGE_MAX_GAMES) return true;
  if (incoming.watchboardItemCount < current.watchboardItemCount) return true;
  if (incoming.hydratedWatchboardItemCount < current.hydratedWatchboardItemCount) return true;
  const incomingPlaceholderHeavy = incoming.hydratedWatchboardItemCount === 0 && incoming.placeholderWatchboardItemCount > 0;
  const currentHydrated = current.hydratedWatchboardItemCount > 0;
  if (incomingPlaceholderHeavy && currentHydrated) return true;
  return false;
}

export function shouldDiscardStaleHomePayload(input: {
  requestStartedAt: number;
  latestAcceptedAt: number;
  latestOptimisticMutationAt: number;
  incomingSummary: HomePayloadSummary;
  currentVisibleSummary: HomePayloadSummary;
}): HomePayloadDiscardDecision {
  if (input.requestStartedAt < input.latestOptimisticMutationAt) {
    return { discard: true, reason: "stale_before_optimistic_mutation" };
  }
  if (input.requestStartedAt < input.latestAcceptedAt) {
    return { discard: true, reason: "stale_before_latest_accepted" };
  }
  if (isWeakerThanCurrent(input.incomingSummary, input.currentVisibleSummary)) {
    return { discard: true, reason: "weaker_payload" };
  }
  return { discard: false, reason: "accept" };
}

export function reconcileAcceptedHomeWatchboardPayload<T extends HomeBoardLike>(
  incomingBoards: T[],
  currentVisibleBoards: T[]
): T[] {
  if (!Array.isArray(incomingBoards) || incomingBoards.length === 0) return [];
  const currentByBoardId = new Map<string, T>();
  for (const board of currentVisibleBoards || []) {
    currentByBoardId.set(String(board?.id ?? ""), board);
  }

  return incomingBoards.map((incoming) => {
    const boardKey = String(incoming?.id ?? "");
    const current = currentByBoardId.get(boardKey);
    if (!current) return incoming;
    const incomingGames = Array.isArray(incoming.games) ? incoming.games : [];
    const currentGames = Array.isArray(current.games) ? current.games : [];
    const currentGameById = new Map<string, HomeGameLike>();
    for (const game of currentGames) {
      const key = String(game.game_id || game.gameId || game.id || "").trim();
      if (!key) continue;
      currentGameById.set(key, game);
    }
    const mergedGames = incomingGames.map((incomingGame) => {
      const key = String(incomingGame.game_id || incomingGame.gameId || incomingGame.id || "").trim();
      const currentGame = key ? currentGameById.get(key) : undefined;
      if (!currentGame) return incomingGame;
      const incomingHydrated = isHydratedHomeGame(incomingGame);
      const currentHydrated = isHydratedHomeGame(currentGame);
      return incomingHydrated || !currentHydrated ? incomingGame : { ...incomingGame, ...currentGame };
    });
    const incomingIds = Array.isArray(incoming.gameIds) ? incoming.gameIds : [];
    const currentIds = Array.isArray(current.gameIds) ? current.gameIds : [];
    const mergedIds = incomingIds.length > 0 ? incomingIds : currentIds;
    const mergedGameById = new Map<string, HomeGameLike>();
    for (const game of mergedGames) {
      const key = String(game.game_id || game.gameId || game.id || "").trim();
      if (!key) continue;
      mergedGameById.set(key, game);
    }
    for (const rawId of mergedIds) {
      const id = String(rawId || "").trim();
      if (!id || mergedGameById.has(id)) continue;
      const currentGame = currentGameById.get(id);
      if (!currentGame) continue;
      if (!isHydratedHomeGame(currentGame)) continue;
      mergedGames.push(currentGame);
      mergedGameById.set(id, currentGame);
    }
    return {
      ...incoming,
      gameIds: mergedIds,
      games: mergedGames,
    };
  });
}

export function isHomeLockDevRuntime(): boolean {
  const meta = import.meta as ImportMeta & { env?: { DEV?: boolean } };
  return Boolean(meta?.env?.DEV);
}

export function homeLockDevLog(message: string, payload?: Record<string, unknown>): void {
  if (!isHomeLockDevRuntime()) return;
  if (payload) {
    console.info(`[HOME LOCK] ${message}`, payload);
    return;
  }
  console.info(`[HOME LOCK] ${message}`);
}

export function homeDataLockDevLog(message: string, payload?: Record<string, unknown>): void {
  if (!isHomeLockDevRuntime()) return;
  if (payload) {
    console.info(`[HOME DATA LOCK] ${message}`, payload);
    return;
  }
  console.info(`[HOME DATA LOCK] ${message}`);
}

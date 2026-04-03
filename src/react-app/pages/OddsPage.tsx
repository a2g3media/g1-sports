/**
 * OddsPage - Dedicated Sports Betting Intelligence Terminal
 * Premium market analytics page with AI insights, sharp money signals,
 * value detection, and market movement tracking.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { OddsIntelligenceDashboard } from '@/react-app/components/OddsIntelligenceDashboard';
import { AddToWatchboardModal } from '@/react-app/components/AddToWatchboardModal';
import { useWatchboards } from '@/react-app/hooks/useWatchboards';
import { useDemoAuth } from '@/react-app/contexts/DemoAuthContext';
import { Loader2, TrendingUp, RefreshCw } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';
import { fetchJsonCached, getFetchCacheStats, invalidateJsonCache } from '@/react-app/lib/fetchCache';
import { incrementPerfCounter, logPerfSnapshot, startPerfTimer } from '@/react-app/lib/perfTelemetry';
import { OddsTelemetryDebugPanel } from '@/react-app/components/debug/OddsTelemetryDebugPanel';

interface Game {
  id: string;
  gameId?: string;
  hasRealOdds?: boolean;
  sport: string;
  league?: string | null;
  homeTeam: string | { abbr: string; name?: string };
  awayTeam: string | { abbr: string; name?: string };
  homeScore?: number | null;
  awayScore?: number | null;
  status: 'live' | 'scheduled' | 'final' | 'LIVE' | 'SCHEDULED' | 'FINAL';
  period?: string;
  clock?: string;
  startTime?: string;
  channel?: string | null;
  spread?: number;
  overUnder?: number;
  moneylineHome?: number;
  moneylineAway?: number;
  odds?: {
    spread?: number;
    total?: number;
    mlHome?: number;
    mlAway?: number;
    spread1H?: number;
    total1H?: number;
    ml1HHome?: number;
    ml1HAway?: number;
  };
}

interface TicketHandleSplitRow {
  game_id: string;
  market: 'SPREAD' | 'TOTAL' | 'MONEYLINE';
  side: 'HOME' | 'AWAY' | 'OVER' | 'UNDER';
  tickets_pct: number | null;
  handle_pct: number | null;
  sportsbook?: string | null;
  updated_at?: string | null;
}

interface ProjectionCoverage {
  source: string;
  count: number;
  fallbackReason: string | null;
}

interface ProjectionRow {
  game_id?: string;
  provider_game_id?: string | null;
  sport?: string;
  player_name?: string;
  prop_type?: string;
  line_value?: number;
  projected_value?: number;
  edge_vs_line?: number;
  confidence?: "low" | "medium" | "high";
}

function toDateParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDate(date: Date, deltaDays: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + deltaDays);
  return next;
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeTeamToken(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function ymdPart(value: unknown): string {
  const raw = String(value || '');
  if (!raw) return '';
  const iso = raw.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

function normalizeOddsGameId(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function buildOddsLookupCandidates(value: unknown): string[] {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const out = new Set<string>();
  const add = (v: string) => {
    const n = normalizeOddsGameId(v);
    if (n) out.add(n);
  };

  add(raw);
  if (raw.startsWith('sr_')) {
    const parts = raw.split('_');
    const tail = parts.slice(2).join('_');
    if (tail) {
      add(`sr:sport_event:${tail}`);
      add(`sr:sport_event:${tail.replace(/_/g, '-')}`);
      add(`sr:match:${tail}`);
      add(tail);
      add(tail.replace(/_/g, '-'));
    }
  }
  if (raw.startsWith('sr:sport_event:')) {
    const tail = raw.replace('sr:sport_event:', '');
    add(tail);
    add(`sr_${tail.replace(/-/g, '_')}`);
    add(tail.replace(/-/g, '_'));
  }
  if (raw.startsWith('sr:match:')) {
    const tail = raw.replace('sr:match:', '');
    add(tail);
    add(`sr_${tail.replace(/-/g, '_')}`);
  }
  return Array.from(out);
}

function buildOddsMatchKey(home: unknown, away: unknown, startTime: unknown): string {
  const h = normalizeTeamToken(home);
  const a = normalizeTeamToken(away);
  const d = ymdPart(startTime);
  if (!h || !a || !d) return '';
  return `${h}|${a}|${d}`;
}

function hasNativeOdds(game: any): boolean {
  return (
    toFiniteNumber(game?.spread_home ?? game?.spreadHome ?? game?.spread) !== undefined ||
    toFiniteNumber(game?.total ?? game?.overUnder ?? game?.over_under) !== undefined ||
    toFiniteNumber(game?.moneyline_home ?? game?.moneylineHome) !== undefined ||
    toFiniteNumber(game?.moneyline_away ?? game?.moneylineAway) !== undefined
  );
}

function hasAnyRenderableOddsFromSummary(summary: any): boolean {
  return oddsSummaryStrength(summary) > 0;
}

function countGamesWithNativeOdds(games: any[]): number {
  if (!Array.isArray(games) || games.length === 0) return 0;
  return games.reduce((acc, game) => acc + (hasNativeOdds(game) ? 1 : 0), 0);
}

function oddsSummaryStrength(summary: any): number {
  if (!summary || typeof summary !== 'object') return 0;
  let score = 0;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? 1 : 0);
  score += n(summary?.spread?.home_line);
  score += n(summary?.total?.line);
  score += n(summary?.moneyline?.home_price) + n(summary?.moneyline?.away_price);
  score += n(summary?.first_half?.spread?.home_line) + n(summary?.first_half?.spread?.away_line);
  score += n(summary?.first_half?.total?.line);
  score += n(summary?.first_half?.moneyline?.home_price) + n(summary?.first_half?.moneyline?.away_price);
  score += n(summary?.opening_spread) + n(summary?.opening_total);
  return score;
}

function mergeOddsSummaryRecord(
  prev: Record<string, any>,
  incoming: Record<string, any>
): Record<string, any> {
  const merged = { ...prev };
  for (const [key, nextSummary] of Object.entries(incoming)) {
    const nextStrength = oddsSummaryStrength(nextSummary);
    if (nextStrength <= 0) continue;
    const prevSummary = merged[key];
    const prevStrength = oddsSummaryStrength(prevSummary);
    if (!prevSummary || nextStrength >= prevStrength) {
      merged[key] = nextSummary;
    }
  }
  return merged;
}

function mergeGamesById(games: any[]): any[] {
  const byId = new Map<string, any>();
  for (const game of games) {
    const key = String(game?.game_id || game?.id || "");
    if (!key) continue;
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, game);
      continue;
    }
    const existingHasOdds = hasNativeOdds(existing);
    const nextHasOdds = hasNativeOdds(game);
    byId.set(key, nextHasOdds && !existingHasOdds ? { ...existing, ...game } : { ...game, ...existing });
  }
  return Array.from(byId.values());
}

type OddsRouteSlateCacheEntry = {
  games: any[];
  updatedAt: number;
};

const oddsRouteSlateCache = new Map<string, OddsRouteSlateCacheEntry>();
const ODDS_ROUTE_SLATE_CACHE_TTL_MS = 5 * 60 * 1000;

function getOddsRouteSlateCacheKey(dateParam: string): string {
  return `ALL|${dateParam}`;
}

function readOddsRouteSlateCache(key: string, maxAgeMs = ODDS_ROUTE_SLATE_CACHE_TTL_MS): any[] | null {
  const hit = oddsRouteSlateCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.updatedAt > maxAgeMs) {
    oddsRouteSlateCache.delete(key);
    return null;
  }
  return hit.games;
}

function writeOddsRouteSlateCache(key: string, games: any[]): void {
  if (!Array.isArray(games) || games.length === 0) return;
  oddsRouteSlateCache.set(key, { games, updatedAt: Date.now() });
}

// Sport filter chips
const SPORT_FILTERS = [
  { key: 'ALL', label: 'All Sports', emoji: '🎯' },
  { key: 'NBA', label: 'NBA', emoji: '🏀' },
  { key: 'NHL', label: 'NHL', emoji: '🏒' },
  { key: 'MLB', label: 'MLB', emoji: '⚾' },
  { key: 'NCAAB', label: 'NCAAB', emoji: '🏀' },
  { key: 'SOCCER', label: 'Soccer', emoji: '⚽' },
];

export function OddsPage() {
  // Safely access hooks with defensive destructuring
  const watchboardsResult = useWatchboards();
  const boards = watchboardsResult?.boards || [];
  const { user, isDemoMode } = useDemoAuth();
  
  // Direct fetch for games - same pattern as GamesPage
  const [rawGames, setRawGames] = useState<any[]>([]);
  const [rawProps, setRawProps] = useState<any[]>([]);
  const [oddsSummaryByGame, setOddsSummaryByGame] = useState<Record<string, {
    spread?: { home_line?: number | null };
    total?: { line?: number | null };
    moneyline?: { home_price?: number | null; away_price?: number | null };
    first_half?: {
      spread?: { home_line?: number | null; away_line?: number | null };
      total?: { line?: number | null };
      moneyline?: { home_price?: number | null; away_price?: number | null };
    };
    opening_spread?: number | null;
    opening_total?: number | null;
  }>>({});
  const [splitFeedByGame, setSplitFeedByGame] = useState<Record<string, TicketHandleSplitRow[]>>({});
  const [projectionFeed, setProjectionFeed] = useState<ProjectionRow[]>([]);
  const [projectionCoverage, setProjectionCoverage] = useState<ProjectionCoverage>({
    source: 'none',
    count: 0,
    fallbackReason: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [refreshCycleCount, setRefreshCycleCount] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const hasFetchedRef = useRef(false);
  const mountedRef = useRef(true);
  const activeFetchRequestRef = useRef(0);
  const visibleGamesRef = useRef<any[]>([]);
  const autoRecoveryAttemptedRef = useRef<string>('');
  
  useEffect(() => {
    // React strict mode runs effect cleanup/re-run in development.
    // Reset the mounted flag on each setup so async finally blocks can update state.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    visibleGamesRef.current = rawGames;
  }, [rawGames]);

  useEffect(() => {
    // Fast boot: hydrate last known-good odds summaries for the selected date.
    try {
      const dateKey = toDateParam(selectedDate);
      const cached = sessionStorage.getItem(`odds:lastSummary:${dateKey}`);
      if (!cached) return;
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === 'object') {
        setOddsSummaryByGame((prev) => mergeOddsSummaryRecord(prev, parsed));
      }
    } catch {
      // ignore cache hydration failures
    }
  }, [selectedDate]);

  useEffect(() => {
    // Fast boot: hydrate last known slate immediately before network refresh.
    try {
      const cached = sessionStorage.getItem('odds:lastGames');
      if (!cached) return;
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setRawGames((prev) => (prev.length > 0 ? prev : parsed));
        setLoading(false);
      }
    } catch {
      // ignore cache hydration failures
    }
  }, []);
  
  // Fetch all games directly from API
  const fetchGames = useCallback(async () => {
    const requestId = ++activeFetchRequestRef.current;
    const stopPerf = startPerfTimer('odds.fetch');
    const isCurrentRequest = () => mountedRef.current && requestId === activeFetchRequestRef.current;

    const fetchWithTimeout = async (input: string, init?: RequestInit, timeoutMs = 12000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(input, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    };

    const selectedDateParam = toDateParam(selectedDate);
    const routeCacheKey = getOddsRouteSlateCacheKey(selectedDateParam);

    const sleep = async (ms: number) => {
      if (ms <= 0) return;
      await new Promise((resolve) => setTimeout(resolve, ms));
    };

    const fetchGamesData = async (): Promise<any[] | null> => {
      const readGames = async (endpoint: string, timeoutMs = 9000): Promise<any[] | null> => {
        try {
          const data = await fetchJsonCached<any>(endpoint, {
            cacheKey: `odds:games:${endpoint}`,
            ttlMs: 5000,
            timeoutMs,
          });
          return Array.isArray(data?.games) ? data.games : null;
        } catch {
          return null;
        }
      };

      const readGamesWithRetry = async (
        endpoint: string,
        timeoutMs = 9000,
        attempts = 3,
        retryDelaysMs: number[] = [1200, 2600],
        retryOnEmpty = false
      ): Promise<any[] | null> => {
        let lastResult: any[] | null = null;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          const result = await readGames(endpoint, timeoutMs);
          if (Array.isArray(result) && result.length > 0) return result;
          if (Array.isArray(result)) {
            if (!retryOnEmpty) return result;
            lastResult = result;
          }
          if (attempt < attempts - 1) {
            await sleep(retryDelaysMs[attempt] ?? retryDelaysMs[retryDelaysMs.length - 1] ?? 0);
          }
        }
        return lastResult;
      };

      // First paint uses the fast no-odds bundle, but auto-escalates if slate looks incomplete.
      const todayParam = toDateParam(new Date());
      const isTodayRequest = selectedDateParam === todayParam;
      const primary = await readGamesWithRetry(
        `/api/games?date=${encodeURIComponent(selectedDateParam)}&includeOdds=0`,
        isTodayRequest ? 6500 : 4500,
        isTodayRequest ? 2 : 1,
        [1200],
        false
      );
      const scopedSports = ['NBA', 'NHL', 'MLB', 'NCAAB', 'SOCCER', 'MMA', 'GOLF'] as const;

      if (Array.isArray(primary) && primary.length > 0) {
        const distinctSports = new Set(primary.map((g: any) => String(g?.sport || '').toUpperCase()).filter(Boolean));
        const nativeOddsCount = countGamesWithNativeOdds(primary);
        const weakOddsCoverage = nativeOddsCount < Math.max(2, Math.floor(primary.length * 0.2));
        const looksSparse = primary.length < 8 || distinctSports.size < 2;
        if (!looksSparse && !weakOddsCoverage) return primary;
        incrementPerfCounter('odds.guardrail.coverageFallback');

        // Guardrail: sparse slate OR weak odds coverage -> enrich with per-sport includeOdds=1.
        const enrichedResponses = await Promise.allSettled(
          scopedSports.map((sport) =>
            readGamesWithRetry(
              `/api/games?date=${encodeURIComponent(selectedDateParam)}&sport=${sport}&includeOdds=1`,
              6000,
              1,
              [0],
              false
            )
          )
        );
        const enrichedMerged = mergeGamesById([
          ...primary,
          ...enrichedResponses
            .filter((r): r is PromiseFulfilledResult<any[] | null> => r.status === 'fulfilled')
            .flatMap((r) => (Array.isArray(r.value) ? r.value : [])),
        ]);
        if (enrichedMerged.length > primary.length) return enrichedMerged;
        if (countGamesWithNativeOdds(enrichedMerged) > nativeOddsCount) return enrichedMerged;
        return primary;
      }

      // Fallback: per-sport fanout when the bundled payload misses.
      const scopedResponses = await Promise.allSettled(
        scopedSports.map((sport) =>
          readGamesWithRetry(
            `/api/games?date=${encodeURIComponent(selectedDateParam)}&sport=${sport}&includeOdds=1`,
            6000,
            1,
            [0],
            false
          )
        )
      );
      const scopedMerged = mergeGamesById(
        scopedResponses
          .filter((r): r is PromiseFulfilledResult<any[] | null> => r.status === "fulfilled")
          .flatMap((r) => (Array.isArray(r.value) ? r.value : []))
      );
      if (scopedMerged.length > 0) return scopedMerged;

      const fallback = await readGamesWithRetry(
        `/api/games?date=${encodeURIComponent(selectedDateParam)}&includeOdds=1`,
        7000,
        1,
        [0],
        false
      );
      if (Array.isArray(fallback)) return fallback;
      return readGamesWithRetry('/api/games?includeOdds=1', 9000, 2, [1200], true);
    };

    try {
      setError(null);
      setStaleNotice(null);

      if (visibleGamesRef.current.length === 0) {
        const routeCachedGames = readOddsRouteSlateCache(routeCacheKey, ODDS_ROUTE_SLATE_CACHE_TTL_MS);
        if (routeCachedGames && routeCachedGames.length > 0) {
          setRawGames(routeCachedGames);
          setLoading(false);
          hasFetchedRef.current = true;
        }
      }

      const [gamesDataResult, propsResResult] = await Promise.allSettled([
        fetchGamesData(),
        fetchWithTimeout('/api/sports-data/props/today', { credentials: 'include' }),
      ]);

      const gamesArray = gamesDataResult.status === "fulfilled" ? gamesDataResult.value : null;
      const propsRes = propsResResult.status === "fulfilled" ? propsResResult.value : null;

      if (gamesArray && Array.isArray(gamesArray) && gamesArray.length > 0) {
        if (!isCurrentRequest()) return;
        console.log('[OddsPage] Fetched games:', gamesArray.length);
        setRawGames(gamesArray);
        writeOddsRouteSlateCache(routeCacheKey, gamesArray);
        try {
          sessionStorage.setItem('odds:lastGames', JSON.stringify(gamesArray));
        } catch {
          // ignore cache write failures
        }
        hasFetchedRef.current = true;

        // Pull real odds summaries across sports.
        // Keep this available for demo/guest mode; only projections remain auth-gated.
        // Enrichment is non-blocking so page never gets stuck on slow downstream feeds.
        void (async () => {
          try {
            const sports: string[] = Array.from(new Set(
              gamesArray
                .map((g: any) => String(g?.sport || '').toUpperCase().trim())
                .filter((s: string) => s.length > 0)
            ));
            const byId: Record<string, {
              spread?: { home_line?: number | null };
              total?: { line?: number | null };
              moneyline?: { home_price?: number | null; away_price?: number | null };
              first_half?: {
                spread?: { home_line?: number | null };
                total?: { line?: number | null };
                moneyline?: { home_price?: number | null; away_price?: number | null };
              };
              opening_spread?: number | null;
              opening_total?: number | null;
            }> = {};

            const addSummary = (s: any) => {
              const summaryGame = s?.game || {};
              const gameId = String(summaryGame?.game_id || s?.game_id || '').trim();
              const requestedGameId = String(s?.requested_game_id || '').trim();
              if (!gameId && !requestedGameId) return;
              const nextStrength = oddsSummaryStrength(s);
              if (nextStrength <= 0) return;

              const idCandidates = new Set<string>();
              for (const candidate of buildOddsLookupCandidates(gameId)) idCandidates.add(candidate);
              for (const candidate of buildOddsLookupCandidates(requestedGameId)) idCandidates.add(candidate);

              for (const candidate of idCandidates) {
                const prevById = byId[candidate];
                if (!prevById || nextStrength >= oddsSummaryStrength(prevById)) {
                  byId[candidate] = s;
                }
              }

              const matchKey = buildOddsMatchKey(
                summaryGame?.home_team_code || summaryGame?.home_team_name,
                summaryGame?.away_team_code || summaryGame?.away_team_name,
                summaryGame?.start_time
              );
              if (matchKey) {
                const prevByMatch = byId[matchKey];
                if (!prevByMatch || nextStrength >= oddsSummaryStrength(prevByMatch)) {
                  byId[matchKey] = s;
                }
              }
            };

            // Primary path: batch by visible game ids first.
            const requestedIds = gamesArray
              .map((g: any) => String(g?.game_id || g?.id || '').trim())
              .filter((id: string) => id.length > 0)
              .slice(0, 90);
            const chunks: string[][] = [];
            for (let i = 0; i < requestedIds.length; i += 30) {
              chunks.push(requestedIds.slice(i, i + 30));
            }

            const chunkResponses = await Promise.allSettled(
              chunks.map(async (chunkIds, idx) => {
                const qs = new URLSearchParams({
                  game_ids: chunkIds.join(','),
                  scope: 'PROD',
                  date: selectedDateParam,
                });
                const payload = await fetchJsonCached<any>(`/api/odds/slate?${qs.toString()}`, {
                  cacheKey: `odds:slate:chunk:${selectedDateParam}:${idx}:${chunkIds.join('|')}`,
                  ttlMs: 6000,
                  timeoutMs: 9000,
                  init: { credentials: 'include' },
                });
                return Array.isArray(payload?.summaries) ? payload.summaries : [];
              })
            );
            for (const response of chunkResponses) {
              if (response.status !== 'fulfilled') continue;
              for (const s of response.value) addSummary(s);
            }

            const hasSummaryForGame = (game: any): boolean => {
              const gameId = String(game?.game_id || game?.id || '').trim();
              for (const candidate of buildOddsLookupCandidates(gameId)) {
                if (byId[candidate]) return true;
              }
              const matchKey = buildOddsMatchKey(
                game?.home_team_code || game?.home_team_name || game?.homeTeamCode || game?.homeTeam,
                game?.away_team_code || game?.away_team_name || game?.awayTeamCode || game?.awayTeam,
                game?.start_time || game?.startTime
              );
              return matchKey ? Boolean(byId[matchKey]) : false;
            };

            // Fallback: sport fanout only when coverage across requested ids is weak.
            const coveredRequested = gamesArray.filter((g: any) => hasSummaryForGame(g)).length;
            const needsSportFallback = sports.length > 0 && coveredRequested < Math.min(requestedIds.length, 10) / 2;
            if (needsSportFallback) {
              incrementPerfCounter('odds.guardrail.sportFallback');
              const responses = await Promise.allSettled(
                sports.map(async (sport) => {
                  const qs = new URLSearchParams({ sport, scope: 'PROD', date: selectedDateParam });
                  const payload = await fetchJsonCached<any>(`/api/odds/slate?${qs.toString()}`, {
                    cacheKey: `odds:slate:${sport}:${selectedDateParam}`,
                    ttlMs: 6000,
                    timeoutMs: 8000,
                    init: { credentials: 'include' },
                  });
                  return Array.isArray(payload?.summaries) ? payload.summaries : [];
                })
              );
              for (const response of responses) {
                if (response.status !== 'fulfilled') continue;
                for (const s of response.value) addSummary(s);
              }
            }

            // Targeted per-game fallback: fetch only unresolved games so one sport with good
            // coverage cannot mask another sport that is still blank.
            const unresolvedIds = gamesArray
              .filter((g: any) => !hasSummaryForGame(g))
              .map((g: any) => String(g?.game_id || g?.id || '').trim())
              .filter((id: string) => id.length > 0)
              .slice(0, 36);

            if (unresolvedIds.length > 0) {
              incrementPerfCounter('odds.guardrail.perGameFallback');
              const perGameResponses = await Promise.allSettled(
                unresolvedIds.map(async (id) => {
                  const payload = await fetchJsonCached<any>(`/api/odds/summary/${encodeURIComponent(id)}?scope=PROD`, {
                    cacheKey: `odds:summary:${id}:${selectedDateParam}`,
                    ttlMs: 8000,
                    timeoutMs: 9000,
                    init: { credentials: 'include' },
                  });
                  return payload;
                })
              );
              for (const response of perGameResponses) {
                if (response.status !== 'fulfilled') continue;
                addSummary(response.value);
              }
            }

            const hasFirstHalfOdds = (s: any): boolean =>
              s?.first_half?.spread?.home_line != null ||
              s?.first_half?.spread?.away_line != null ||
              s?.first_half?.total?.line != null ||
              s?.first_half?.moneyline?.home_price != null ||
              s?.first_half?.moneyline?.away_price != null;

            const needsFirstHalfRefresh = requestedIds
              .filter((id) => {
                const existing: any = byId[id];
                if (!existing) return true;
                if (hasFirstHalfOdds(existing)) return false;
                const source = String(existing?.source || '').toLowerCase();
                const fallbackType = String(existing?.fallback_type || '').toLowerCase();
                return source === 'none' || fallbackType === 'no_coverage' || Boolean(existing?.fallback_reason);
              })
              .slice(0, 12);

            if (needsFirstHalfRefresh.length > 0) {
              const refreshResponses = await Promise.allSettled(
                needsFirstHalfRefresh.map(async (id) => {
                  const payload = await fetchJsonCached<any>(`/api/odds/summary/${encodeURIComponent(id)}?scope=PROD&refresh=true`, {
                    cacheKey: `odds:summary:force:${requestId}:${id}`,
                    ttlMs: 1000,
                    timeoutMs: 9500,
                    init: { credentials: 'include' },
                  });
                  return payload;
                })
              );
              for (const response of refreshResponses) {
                if (response.status !== 'fulfilled') continue;
                addSummary(response.value);
              }
            }

            if (!isCurrentRequest()) return;
            if (Object.keys(byId).length > 0) {
              setOddsSummaryByGame((prev) => {
                const merged = mergeOddsSummaryRecord(prev, byId);
                try {
                  const trimmedEntries = Object.entries(merged)
                    .filter(([, summary]) => hasAnyRenderableOddsFromSummary(summary))
                    .slice(0, 600);
                  sessionStorage.setItem(
                    `odds:lastSummary:${selectedDateParam}`,
                    JSON.stringify(Object.fromEntries(trimmedEntries))
                  );
                } catch {
                  // ignore cache write failures
                }
                return merged;
              });
            }

            // Pull optional ticket/handle split rows for games with real odds summaries.
            try {
              const gameIdsWithOdds = Object.keys(byId).slice(0, 24);
              if (gameIdsWithOdds.length > 0) {
                const splitResponses = await Promise.all(
                  gameIdsWithOdds.map(async (id) => {
                    const payload = await fetchJsonCached<any>(`/api/odds/splits/${encodeURIComponent(id)}`, {
                      cacheKey: `odds:splits:${id}`,
                      ttlMs: 8000,
                      timeoutMs: 6000,
                      init: { credentials: 'include' },
                    });
                    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
                    return [id, rows as TicketHandleSplitRow[]] as [string, TicketHandleSplitRow[]];
                  })
                );
                const splitMap: Record<string, TicketHandleSplitRow[]> = {};
                for (const [id, rows] of splitResponses) {
                  splitMap[id] = rows;
                }
                if (!isCurrentRequest()) return;
                if (Object.keys(splitMap).length > 0) {
                  setSplitFeedByGame((prev) => ({ ...prev, ...splitMap }));
                }
              }
            } catch {
              // Preserve previous split feed on transient failures.
            }

            // Pull projection coverage for props intelligence (auth required).
            if (isDemoMode || !user?.id) {
              if (!isCurrentRequest()) return;
              setProjectionCoverage({ source: 'none', count: 0, fallbackReason: 'Sign in required' });
            } else {
              try {
                const payload = await fetchJsonCached<any>('/api/odds/props/projections?limit=200', {
                  cacheKey: `odds:projections:${selectedDateParam}`,
                  ttlMs: 10000,
                  timeoutMs: 8000,
                  init: { credentials: 'include' },
                });
                if (!isCurrentRequest()) return;
                const nextProjections = Array.isArray(payload?.projections) ? payload.projections : [];
                if (nextProjections.length > 0) {
                  setProjectionFeed(nextProjections);
                }
                setProjectionCoverage({
                  source: String(payload?.source || 'none'),
                  count: Number(payload?.count || 0),
                  fallbackReason: payload?.fallback_reason ? String(payload.fallback_reason) : null,
                });
              } catch {
                if (!isCurrentRequest()) return;
                setProjectionCoverage((prev) => ({ ...prev, fallbackReason: 'Projection fetch failed' }));
              }
            }
          } catch {
            if (!isCurrentRequest()) return;
            incrementPerfCounter('odds.staleProtected');
            setStaleNotice('Odds enrichment is delayed; showing last known valid data.');
          }
        })();
      } else {
        let usedFallback = false;

        const routeCachedGames = readOddsRouteSlateCache(routeCacheKey, ODDS_ROUTE_SLATE_CACHE_TTL_MS);
        if (routeCachedGames && routeCachedGames.length > 0) {
          setRawGames(routeCachedGames);
          usedFallback = true;
        }

        if (!usedFallback) {
          try {
            const cached = sessionStorage.getItem('odds:lastGames');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setRawGames(parsed);
                usedFallback = true;
              }
            }
          } catch {
            // ignore cache read failures
          }
        }

        if (!usedFallback) {
          if (visibleGamesRef.current.length === 0) {
            setError('Failed to load games');
            setRawGames([]);
          } else {
            incrementPerfCounter('odds.staleProtected');
            setStaleNotice('Refresh failed. Keeping previous games and odds visible.');
          }
        } else {
          setStaleNotice('Refreshing market feeds - showing last known valid slate.');
        }
      }

      if (propsRes?.ok) {
        const propsData = await propsRes.json();
        if (isCurrentRequest()) {
          const nextProps = Array.isArray(propsData?.props) ? propsData.props : [];
          setRawProps(nextProps);
        }
      }
    } catch (err) {
      if (!isCurrentRequest()) return;
      console.error('[OddsPage] Fetch error:', err);
      if (visibleGamesRef.current.length === 0) {
        const routeCachedGames = readOddsRouteSlateCache(routeCacheKey, ODDS_ROUTE_SLATE_CACHE_TTL_MS);
        if (routeCachedGames && routeCachedGames.length > 0) {
          setRawGames(routeCachedGames);
          setStaleNotice('Network issue during refresh. Showing last known valid data.');
          hasFetchedRef.current = true;
        } else {
          setError('Network error loading games');
        }
      } else {
        incrementPerfCounter('odds.staleProtected');
        setStaleNotice('Network issue during refresh. Showing last known valid data.');
      }
    } finally {
      if (!isCurrentRequest()) return;
      stopPerf();
      console.debug('[OddsPage][fetch-cache]', getFetchCacheStats());
      logPerfSnapshot('OddsPage');
      setLoading(false);
      setRefreshCycleCount((v) => v + 1);
    }
  }, [isDemoMode, user?.id, selectedDate]);
  
  // Initial fetch
  useEffect(() => {
    fetchGames();
  }, [fetchGames]);
  
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSport, setSelectedSport] = useState('ALL');
  const [showMoreSections, setShowMoreSections] = useState<Record<string, number>>({});
  
  // Watchboard modal state
  const [watchboardModalOpen, setWatchboardModalOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);

  // Transform raw games to Game format
  const games = useMemo<Game[]>(() => {
    if (!rawGames || !Array.isArray(rawGames)) return [];
    
    try {
      return rawGames
        .filter(g => g && typeof g === 'object' && (g.game_id || g.id))
        .map((g) => {
          const sportKey = (g.sport || 'NBA').toUpperCase();
          const homeAbbr = g.home_team_code || 'TBD';
          const awayAbbr = g.away_team_code || 'TBD';
          const gameKey = g.game_id || g.id || '';
          const matchKey = buildOddsMatchKey(
            g.home_team_code || g.home_team_name || g.homeTeamCode || g.homeTeam,
            g.away_team_code || g.away_team_name || g.awayTeamCode || g.awayTeam,
            g.start_time || g.startTime
          );
          const idSummary = buildOddsLookupCandidates(gameKey)
            .map((candidate) => oddsSummaryByGame[candidate])
            .find(Boolean);
          const summary = idSummary || (matchKey ? oddsSummaryByGame[matchKey] : undefined);
          const nativeSpread = toFiniteNumber(g?.spread_home ?? g?.spreadHome ?? g?.spread);
          const nativeTotal = toFiniteNumber(g?.total ?? g?.overUnder ?? g?.over_under);
          const nativeMlHome = toFiniteNumber(g?.moneyline_home ?? g?.moneylineHome);
          const nativeMlAway = toFiniteNumber(g?.moneyline_away ?? g?.moneylineAway);
          const nativeSpread1H = toFiniteNumber(g?.spread_1h_home ?? g?.spread1HHome);
          const nativeTotal1H = toFiniteNumber(g?.total_1h ?? g?.total1H);
          const nativeMl1HHome = toFiniteNumber(g?.moneyline_1h_home ?? g?.moneyline1HHome);
          const nativeMl1HAway = toFiniteNumber(g?.moneyline_1h_away ?? g?.moneyline1HAway);
          const hasRealOdds = Boolean(
            summary?.spread?.home_line != null ||
            summary?.total?.line != null ||
            summary?.moneyline?.home_price != null ||
            summary?.moneyline?.away_price != null ||
            summary?.first_half?.spread?.home_line != null ||
            summary?.first_half?.spread?.away_line != null ||
            summary?.first_half?.total?.line != null ||
            summary?.first_half?.moneyline?.home_price != null ||
            summary?.first_half?.moneyline?.away_price != null ||
            nativeSpread !== undefined ||
            nativeTotal !== undefined ||
            nativeMlHome !== undefined ||
            nativeMlAway !== undefined ||
            nativeSpread1H !== undefined ||
            nativeTotal1H !== undefined ||
            nativeMl1HHome !== undefined ||
            nativeMl1HAway !== undefined
          );
          
          // Normalize status
          const rawStatus = g.status || 'SCHEDULED';
          const statusLower = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : 'scheduled';
          const normalizedStatus = statusLower === 'in_progress' ? 'live' : statusLower;
          
          return {
            id: g.game_id || g.id || `gen_${sportKey}_${homeAbbr}_${awayAbbr}`,
            gameId: g.game_id || g.id || '',
            hasRealOdds,
            sport: sportKey,
            league: null,
            homeTeam: homeAbbr,
            awayTeam: awayAbbr,
            homeScore: g.home_score ?? null,
            awayScore: g.away_score ?? null,
            status: normalizedStatus as 'live' | 'scheduled' | 'final',
            period: g.period || undefined,
            clock: g.clock || undefined,
            startTime: g.start_time || undefined,
            channel: g.channel || null,
            spread: summary?.spread?.home_line ?? nativeSpread,
            overUnder: summary?.total?.line ?? nativeTotal,
            moneylineHome: summary?.moneyline?.home_price ?? nativeMlHome,
            moneylineAway: summary?.moneyline?.away_price ?? nativeMlAway,
            odds: {
              spread: summary?.spread?.home_line ?? nativeSpread,
              spreadOpen: summary?.opening_spread ?? undefined,
              total: summary?.total?.line ?? nativeTotal,
              totalOpen: summary?.opening_total ?? undefined,
              mlHome: summary?.moneyline?.home_price ?? nativeMlHome,
              mlAway: summary?.moneyline?.away_price ?? nativeMlAway,
              spread1H: summary?.first_half?.spread?.home_line ?? nativeSpread1H,
              total1H: summary?.first_half?.total?.line ?? nativeTotal1H,
              ml1HHome: summary?.first_half?.moneyline?.home_price ?? nativeMl1HHome,
              ml1HAway: summary?.first_half?.moneyline?.away_price ?? nativeMl1HAway,
            },
          };
        });
    } catch (err) {
      console.error('[OddsPage] Error transforming games:', err);
      return [];
    }
  }, [rawGames, oddsSummaryByGame]);

  // Manual refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setLoading(rawGames.length === 0);
    invalidateJsonCache('odds:games:');
    invalidateJsonCache('odds:slate:');
    invalidateJsonCache('odds:splits:');
    invalidateJsonCache('odds:projections:');
    await fetchGames();
    setRefreshing(false);
  }, [fetchGames, rawGames.length]);

  const hasAnyRealOdds = useMemo(
    () => games.some((g) => Boolean(g.hasRealOdds)),
    [games]
  );

  useEffect(() => {
    if (loading || refreshing) return;
    if (games.length === 0 || hasAnyRealOdds) return;
    const dateKey = toDateParam(selectedDate);
    if (autoRecoveryAttemptedRef.current === dateKey) return;
    autoRecoveryAttemptedRef.current = dateKey;

    const timer = window.setTimeout(() => {
      // One-shot self-heal retry for blank-odds slates.
      incrementPerfCounter('odds.guardrail.autoRecovery');
      void handleRefresh();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [games.length, hasAnyRealOdds, loading, refreshing, selectedDate, handleRefresh]);

  // Filter games by sport (fallback to schedule view when real odds are unavailable)
  const filteredGames = useMemo(() => {
    let result = hasAnyRealOdds ? games.filter((g) => g.hasRealOdds) : games;
    
    // Apply sport filter
    if (selectedSport !== 'ALL') {
      result = result.filter(g => (g.sport || '').toUpperCase() === selectedSport);
    }
    
    return result;
  }, [games, selectedSport, hasAnyRealOdds]);

  // Check if game is in watchboard - with defensive checks
  const isGameInWatchboard = useCallback((gameId: string) => {
    try {
      if (!boards || !Array.isArray(boards) || boards.length === 0) return false;
      return boards.some((wb: any) => {
        if (!wb || !wb.games || !Array.isArray(wb.games)) return false;
        return wb.games.some((g: any) => g && (g.gameId === gameId || g.id === gameId));
      });
    } catch {
      return false;
    }
  }, [boards]);

  // Handle watchboard click
  const handleWatchboardClick = useCallback((game: Game) => {
    setSelectedGame(game);
    setWatchboardModalOpen(true);
  }, []);

  // Get game summary for modal
  const getGameSummary = (game: Game) => {
    const homeAbbr = typeof game.homeTeam === 'string' ? game.homeTeam : game.homeTeam.abbr;
    const awayAbbr = typeof game.awayTeam === 'string' ? game.awayTeam : game.awayTeam.abbr;
    return `${awayAbbr} @ ${homeAbbr}`;
  };

  // Count live games (case-insensitive)
  const liveCount = useMemo(() => 
    filteredGames.filter(g => {
      const status = (g.status || '').toString().toLowerCase();
      return status === 'live' || status === 'in_progress';
    }).length
  , [filteredGames]);
  const splitFeedGamesCount = useMemo(
    () => Object.values(splitFeedByGame).filter((rows) => Array.isArray(rows) && rows.length > 0).length,
    [splitFeedByGame]
  );
  const realOddsGamesCount = useMemo(
    () => games.filter((g) => g.hasRealOdds).length,
    [games]
  );
  const hasCoverageGap = useMemo(
    () => games.length > 0 && realOddsGamesCount === 0,
    [games.length, realOddsGamesCount]
  );
  const selectedDateLabel = useMemo(
    () =>
      selectedDate.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
    [selectedDate]
  );
  const showDebugTelemetry = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const debug = new URLSearchParams(window.location.search).get('debug');
    return debug === 'true' || debug === 'telemetry';
  }, []);
  const debugCoverageThresholdPct = useMemo(() => {
    if (typeof window === 'undefined') return 35;
    const raw = Number(new URLSearchParams(window.location.search).get('cov'));
    if (!Number.isFinite(raw)) return 35;
    return Math.max(5, Math.min(95, Math.round(raw)));
  }, []);

  if (loading && rawGames.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        <p className="text-slate-400 text-sm">Loading market intelligence...</p>
      </div>
    );
  }

  if (error && rawGames.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <TrendingUp className="w-8 h-8 text-red-400" />
        </div>
        <p className="text-slate-200 text-lg font-bold">Failed to Load</p>
        <p className="text-slate-500 text-sm">{error}</p>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-300 text-sm font-medium hover:bg-cyan-500/30 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
            </div>
            <span className="truncate">Odds Intelligence</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {hasAnyRealOdds ? `${filteredGames.length} games with verified lines` : `${filteredGames.length} games on the board`} • {liveCount > 0 && (
              <span className="text-red-400">{liveCount} live</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center rounded-lg border border-slate-700/60 bg-slate-900/60 p-1">
            <button
              onClick={() => setSelectedDate((prev) => shiftDate(prev, -1))}
              className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white"
            >
              Prev
            </button>
            <button
              onClick={() => setSelectedDate(new Date())}
              className="px-2.5 py-1.5 text-xs text-cyan-200 hover:text-cyan-100"
            >
              {selectedDateLabel}
            </button>
            <button
              onClick={() => setSelectedDate((prev) => shiftDate(prev, 1))}
              className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white"
            >
              Next
            </button>
          </div>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={cn(
              "p-3 rounded-lg border transition-all min-h-[44px] min-w-[44px] flex items-center justify-center active:scale-95",
              refreshing
                ? "bg-slate-800/50 border-slate-700/50 text-slate-500"
                : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"
            )}
          >
            <RefreshCw className={cn("w-5 h-5", refreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Real Data Coverage */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2.5 py-1 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300">
          Verified lines: <span className="text-cyan-300 font-semibold">{realOddsGamesCount}</span>
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300">
          Market depth: <span className="text-emerald-300 font-semibold">{splitFeedGamesCount}</span>
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300">
          Projection insights: <span className="text-amber-300 font-semibold">{projectionCoverage.count}</span>
        </span>
        {projectionCoverage.source === 'none' && projectionCoverage.fallbackReason && (
          <span className="text-[11px] text-slate-500">
            Projection model is warming up for this slate.
          </span>
        )}
      </div>

      {hasCoverageGap && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="text-[11px] text-amber-300">
            This slate is live, but books have not posted enough lines yet. We will keep updating automatically.
          </p>
        </div>
      )}

      {staleNotice && (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2">
          <p className="text-[11px] text-cyan-200">{staleNotice}</p>
        </div>
      )}
      {showDebugTelemetry && (
        <OddsTelemetryDebugPanel
          pageKey="odds"
          gamesCount={games.length}
          oddsCoverageCount={realOddsGamesCount}
          staleNotice={staleNotice}
          isHydrating={loading || refreshing}
          cycleToken={refreshCycleCount}
          lowCoverageThresholdPct={debugCoverageThresholdPct}
        />
      )}

      {/* Sport Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
        {SPORT_FILTERS.map(sport => {
          const isActive = selectedSport === sport.key;
          const count = sport.key === 'ALL' 
            ? filteredGames.length 
            : filteredGames.filter(g => g.sport === sport.key).length;
          
          if (count === 0 && sport.key !== 'ALL') return null;
          
          return (
            <button
              key={sport.key}
              onClick={() => setSelectedSport(sport.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                "min-h-[44px] active:scale-95", // Mobile touch target
                isActive
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : "bg-slate-800/40 text-slate-400 border border-slate-700/40 hover:border-slate-600/60 hover:text-slate-300"
              )}
            >
              <span>{sport.emoji}</span>
              <span>{sport.label}</span>
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded-full",
                isActive ? "bg-cyan-500/30 text-cyan-200" : "bg-slate-700/50 text-slate-500"
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Dashboard */}
      {filteredGames.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-4 py-16 rounded-2xl border border-slate-800/70 bg-slate-900/30">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/70 border border-slate-700/60 flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-slate-400" />
          </div>
          <div className="space-y-1">
            <p className="text-slate-200 font-semibold">No odds match this view</p>
            <p className="text-slate-500 text-sm">
              Try another sport filter or refresh to pull the latest market feed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedSport !== 'ALL' && (
              <button
                onClick={() => setSelectedSport('ALL')}
                className="px-4 py-2 rounded-lg bg-slate-800/70 text-slate-300 text-sm font-medium hover:bg-slate-700/70 transition-colors"
              >
                View All Sports
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                refreshing
                  ? "bg-cyan-500/10 text-cyan-500 cursor-not-allowed"
                  : "bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30"
              )}
            >
              {refreshing ? "Refreshing..." : "Refresh Feed"}
            </button>
          </div>
        </div>
      ) : (
        <OddsIntelligenceDashboard
          games={filteredGames}
          propsFeed={rawProps}
          projectionFeed={projectionFeed}
          splitFeedByGame={splitFeedByGame}
          isGameInWatchboard={isGameInWatchboard}
          onWatchboardClick={handleWatchboardClick}
          selectedSport={selectedSport}
          showMoreSections={showMoreSections}
          setShowMoreSections={setShowMoreSections}
        />
      )}

      {/* Watchboard Modal */}
      {selectedGame && (
        <AddToWatchboardModal
          isOpen={watchboardModalOpen}
          onClose={() => {
            setWatchboardModalOpen(false);
            setSelectedGame(null);
          }}
          gameId={selectedGame.id}
          gameSummary={getGameSummary(selectedGame)}
          onSuccess={() => {
            setWatchboardModalOpen(false);
            setSelectedGame(null);
          }}
        />
      )}
    </div>
  );
}

export default OddsPage;

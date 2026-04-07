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
import { useFeatureFlags } from '@/react-app/hooks/useFeatureFlags';

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
  const { flags } = useFeatureFlags();
  
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
  const [splitFeedByGame] = useState<Record<string, TicketHandleSplitRow[]>>({});
  const [projectionFeed] = useState<ProjectionRow[]>([]);
  const [projectionCoverage] = useState<ProjectionCoverage>({
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
    const startedAt = performance.now();
    const stopPerf = startPerfTimer('odds.fetch');
    const isCurrentRequest = () => mountedRef.current && requestId === activeFetchRequestRef.current;

    const selectedDateParam = toDateParam(selectedDate);
    const routeCacheKey = getOddsRouteSlateCacheKey(selectedDateParam);
    const isInitialRenderRequest = visibleGamesRef.current.length === 0;

    try {
      setError(null);
      setStaleNotice(null);
      console.info("PAGE_DATA_START", { route: "odds", date: selectedDateParam, sport: "ALL" });

      if (visibleGamesRef.current.length === 0) {
        const routeCachedGames = readOddsRouteSlateCache(routeCacheKey, ODDS_ROUTE_SLATE_CACHE_TTL_MS);
        if (routeCachedGames && routeCachedGames.length > 0) {
          setRawGames(routeCachedGames);
          setLoading(false);
          hasFetchedRef.current = true;
        }
      }

      {
        const selectedDateParam = toDateParam(selectedDate);
        const qs = new URLSearchParams({ date: selectedDateParam, sport: "ALL" });
        const payload = await fetchJsonCached<any>(`/api/page-data/odds?${qs.toString()}`, {
          cacheKey: `page-data:odds:${selectedDateParam}:all`,
          ttlMs: 3_000,
          timeoutMs: isInitialRenderRequest ? 2_000 : 2_700,
          init: { credentials: 'include' },
        });
        const pageGames = Array.isArray(payload?.games) ? payload.games : [];
        const pageOdds = payload?.oddsSummaryByGame && typeof payload.oddsSummaryByGame === 'object'
          ? payload.oddsSummaryByGame
          : {};
        if (!isCurrentRequest()) return;
        if (pageGames.length > 0) {
          setRawGames(pageGames);
          writeOddsRouteSlateCache(routeCacheKey, pageGames);
          try {
            sessionStorage.setItem('odds:lastGames', JSON.stringify(pageGames));
          } catch {
            // ignore cache write failures
          }
          hasFetchedRef.current = true;
        }
        if (Object.keys(pageOdds).length > 0) {
          setOddsSummaryByGame((prev) => mergeOddsSummaryRecord(prev, pageOdds));
          try {
            sessionStorage.setItem(`odds:lastSummary:${selectedDateParam}`, JSON.stringify(pageOdds));
          } catch {
            // ignore cache write failures
          }
        }
        if (pageGames.length === 0 && visibleGamesRef.current.length === 0) {
          console.warn("PAGE_DATA_FALLBACK_USED", { route: "odds", reason: "empty_payload_no_existing_data", date: selectedDateParam });
        }
        console.info("PAGE_DATA_SUCCESS", {
          route: "odds",
          date: selectedDateParam,
          games: pageGames.length,
          oddsSummary: Object.keys(pageOdds).length,
          degraded: Boolean(payload?.degraded),
        });
        if (flags.PAGE_DATA_OBSERVABILITY_ENABLED) {
          const loadMs = Math.max(0, Math.round(performance.now() - startedAt));
          void fetch('/api/page-data/telemetry', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              route: 'odds',
              loadMs,
              apiCalls: 1,
              oddsAvailableAtFirstRender: Object.keys(pageOdds).length > 0,
            }),
          }).catch(() => {});
        }
        // Optional props intelligence feed remains independent of route assembly.
        void fetch('/api/sports-data/props/today', { credentials: 'include' })
          .then((propsRes) => (propsRes?.ok ? propsRes.json() : null))
          .then((propsData) => {
            if (!isCurrentRequest() || !propsData) return;
            const nextProps = Array.isArray((propsData as any)?.props) ? (propsData as any).props : [];
            setRawProps(nextProps);
          })
          .catch(() => {
            // non-fatal
          });
        return;
      }

    } catch (err) {
      if (!isCurrentRequest()) return;
      console.error('[OddsPage] Fetch error:', err);
      const msg = String((err as any)?.message || "");
      if (msg.toLowerCase().includes("timeout") || String((err as any)?.name || "") === "AbortError") {
        console.warn("PAGE_DATA_TIMEOUT", { route: "odds", date: selectedDateParam });
      }
      if (visibleGamesRef.current.length === 0) {
        const routeCachedGames = readOddsRouteSlateCache(routeCacheKey, ODDS_ROUTE_SLATE_CACHE_TTL_MS);
        if (Array.isArray(routeCachedGames) && routeCachedGames.length > 0) {
          setRawGames(routeCachedGames as any[]);
          setStaleNotice('Network issue during refresh. Showing last known valid data.');
          hasFetchedRef.current = true;
          console.warn("PAGE_DATA_FALLBACK_USED", { route: "odds", reason: "route_cache_used_after_error", date: selectedDateParam });
        } else {
          setError('Network error loading games');
          console.warn("PAGE_DATA_FALLBACK_USED", { route: "odds", reason: "request_failed_no_existing_data", date: selectedDateParam });
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
  }, [
    flags.PAGE_DATA_OBSERVABILITY_ENABLED,
    isDemoMode,
    user?.id,
    selectedDate,
  ]);
  
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

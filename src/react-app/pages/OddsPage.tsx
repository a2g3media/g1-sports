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
      spread?: { home_line?: number | null };
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
  const hasFetchedRef = useRef(false);
  const mountedRef = useRef(true);
  
  useEffect(() => {
    // React strict mode runs effect cleanup/re-run in development.
    // Reset the mounted flag on each setup so async finally blocks can update state.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  
  // Fetch all games directly from API
  const fetchGames = useCallback(async () => {
    const fetchWithTimeout = async (input: string, init?: RequestInit, timeoutMs = 12000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(input, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    };

    const getTodayDateParam = () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const fetchGamesData = async (): Promise<any[] | null> => {
      const endpoints = [
        '/api/games',
        `/api/games?date=${encodeURIComponent(getTodayDateParam())}`,
      ];

      for (const endpoint of endpoints) {
        try {
          const res = await fetchWithTimeout(endpoint, undefined, 12000);
          if (!res.ok) continue;
          const data = await res.json();
          if (Array.isArray(data?.games)) return data.games;
        } catch {
          // try next endpoint
        }
      }

      return null;
    };

    try {
      setError(null);
      const [gamesDataResult, propsResResult] = await Promise.allSettled([
        fetchGamesData(),
        fetchWithTimeout('/api/sports-data/props/today', { credentials: 'include' }),
      ]);

      const gamesArray = gamesDataResult.status === "fulfilled" ? gamesDataResult.value : null;
      const propsRes = propsResResult.status === "fulfilled" ? propsResResult.value : null;

      if (gamesArray && Array.isArray(gamesArray)) {
        console.log('[OddsPage] Fetched games:', gamesArray.length);
        setRawGames(gamesArray);
        try {
          sessionStorage.setItem('odds:lastGames', JSON.stringify(gamesArray));
        } catch {
          // ignore cache write failures
        }
        hasFetchedRef.current = true;

        // Pull real odds summaries across sports (auth required endpoint).
        if (isDemoMode || !user?.id) {
          setOddsSummaryByGame({});
          setSplitFeedByGame({});
          setProjectionFeed([]);
          setProjectionCoverage({ source: 'none', count: 0, fallbackReason: 'Sign in required' });
          return;
        }
        // Enrichment is non-blocking so page never gets stuck on slow downstream feeds.
        void (async () => {
          try {
            const sports: string[] = Array.from(new Set(
              gamesArray
                .map((g: any) => String(g?.sport || '').toLowerCase().trim())
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

            if (sports.length > 0) {
              const responses = await Promise.allSettled(
                sports.map(async (sport) => {
                  const qs = new URLSearchParams({ sport, scope: 'PROD' });
                  const res = await fetchWithTimeout(`/api/odds/slate?${qs.toString()}`, { credentials: 'include' }, 8000);
                  if (!res.ok) return [];
                  const payload = await res.json();
                  return Array.isArray(payload?.summaries) ? payload.summaries : [];
                })
              );

              for (const response of responses) {
                if (response.status !== "fulfilled") continue;
                for (const s of response.value) {
                  const gameId = String(s?.game?.game_id || s?.game_id || '');
                  if (!gameId) continue;
                  byId[gameId] = s;
                }
              }
            }

            if (!mountedRef.current) return;
            setOddsSummaryByGame(byId);

            // Pull optional ticket/handle split rows for games with real odds summaries.
            try {
              const gameIdsWithOdds = Object.keys(byId).slice(0, 24);
              if (gameIdsWithOdds.length > 0) {
                const splitResponses = await Promise.all(
                  gameIdsWithOdds.map(async (id) => {
                    const res = await fetchWithTimeout(`/api/odds/splits/${encodeURIComponent(id)}`, { credentials: 'include' }, 6000);
                    if (!res.ok) return [id, [] as TicketHandleSplitRow[]] as [string, TicketHandleSplitRow[]];
                    const payload = await res.json();
                    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
                    return [id, rows as TicketHandleSplitRow[]] as [string, TicketHandleSplitRow[]];
                  })
                );
                const splitMap: Record<string, TicketHandleSplitRow[]> = {};
                for (const [id, rows] of splitResponses) {
                  splitMap[id] = rows;
                }
                if (!mountedRef.current) return;
                setSplitFeedByGame(splitMap);
              } else {
                if (!mountedRef.current) return;
                setSplitFeedByGame({});
              }
            } catch {
              if (!mountedRef.current) return;
              setSplitFeedByGame({});
            }

            // Pull projection coverage for props intelligence
            try {
              const projRes = await fetchWithTimeout('/api/odds/props/projections?limit=200', { credentials: 'include' }, 8000);
              if (projRes.ok) {
                const payload = await projRes.json();
                if (!mountedRef.current) return;
                setProjectionFeed(Array.isArray(payload?.projections) ? payload.projections : []);
                setProjectionCoverage({
                  source: String(payload?.source || 'none'),
                  count: Number(payload?.count || 0),
                  fallbackReason: payload?.fallback_reason ? String(payload.fallback_reason) : null,
                });
              } else {
                if (!mountedRef.current) return;
                setProjectionFeed([]);
                setProjectionCoverage({ source: 'none', count: 0, fallbackReason: `HTTP ${projRes.status}` });
              }
            } catch {
              if (!mountedRef.current) return;
              setProjectionFeed([]);
              setProjectionCoverage({ source: 'none', count: 0, fallbackReason: 'Projection fetch failed' });
            }
          } catch {
            if (!mountedRef.current) return;
            setOddsSummaryByGame({});
            setSplitFeedByGame({});
            setProjectionFeed([]);
            setProjectionCoverage({ source: 'none', count: 0, fallbackReason: 'Odds slate unavailable' });
          }
        })();
      } else {
        let usedFallback = false;
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

        if (!usedFallback) {
          setError('Failed to load games');
          setRawGames([]);
        }
      }

      if (propsRes?.ok) {
        const propsData = await propsRes.json();
        setRawProps(Array.isArray(propsData?.props) ? propsData.props : []);
      } else {
        setRawProps([]);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('[OddsPage] Fetch error:', err);
      setError('Network error loading games');
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
    }
  }, [isDemoMode, user?.id]);
  
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
          const summary = oddsSummaryByGame[gameKey];
          const hasRealOdds = Boolean(
            summary && (
              summary?.spread?.home_line != null ||
              summary?.total?.line != null ||
              summary?.moneyline?.home_price != null ||
              summary?.moneyline?.away_price != null
            )
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
            spread: summary?.spread?.home_line ?? undefined,
            overUnder: summary?.total?.line ?? undefined,
            moneylineHome: summary?.moneyline?.home_price ?? undefined,
            moneylineAway: summary?.moneyline?.away_price ?? undefined,
            odds: {
              spread: summary?.spread?.home_line ?? undefined,
              spreadOpen: summary?.opening_spread ?? undefined,
              total: summary?.total?.line ?? undefined,
              totalOpen: summary?.opening_total ?? undefined,
              mlHome: summary?.moneyline?.home_price ?? undefined,
              mlAway: summary?.moneyline?.away_price ?? undefined,
              spread1H: summary?.first_half?.spread?.home_line ?? undefined,
              total1H: summary?.first_half?.total?.line ?? undefined,
              ml1HHome: summary?.first_half?.moneyline?.home_price ?? undefined,
              ml1HAway: summary?.first_half?.moneyline?.away_price ?? undefined,
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
    setLoading(true);
    await fetchGames();
    setRefreshing(false);
  }, [fetchGames]);

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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        <p className="text-slate-400 text-sm">Loading market intelligence...</p>
      </div>
    );
  }

  if (error) {
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
            {hasAnyRealOdds ? `${filteredGames.length} real-odds games` : `${filteredGames.length} scheduled/live games (real odds pending)`} • {liveCount > 0 && (
              <span className="text-red-400">{liveCount} live</span>
            )}
          </p>
        </div>
        
        {/* Refresh button */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className={cn(
            "p-3 rounded-lg border transition-all min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0 active:scale-95",
            refreshing
              ? "bg-slate-800/50 border-slate-700/50 text-slate-500"
              : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"
          )}
        >
          <RefreshCw className={cn("w-5 h-5", refreshing && "animate-spin")} />
        </button>
      </div>

      {/* Real Data Coverage */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2.5 py-1 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300">
          Real odds games: <span className="text-cyan-300 font-semibold">{realOddsGamesCount}</span>
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300">
          Split-feed games: <span className="text-emerald-300 font-semibold">{splitFeedGamesCount}</span>
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300">
          Projections: <span className="text-amber-300 font-semibold">{projectionCoverage.count}</span>
        </span>
        {projectionCoverage.source === 'none' && projectionCoverage.fallbackReason && (
          <span className="text-[11px] text-slate-500">
            projections pending: {projectionCoverage.fallbackReason}
          </span>
        )}
      </div>

      {hasCoverageGap && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="text-[11px] text-amber-300">
            Market feeds are connected but books have not posted verified lines for this slate yet. We will keep retrying automatically.
          </p>
        </div>
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

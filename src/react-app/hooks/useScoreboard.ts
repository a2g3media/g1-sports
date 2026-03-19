/**
 * useScoreboard Hook - Unified scoreboard data fetching with smart fallback
 * Handles automatic sport switching when selected sport has no games
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AliveGame } from '@/react-app/components/AliveGameCard';

// Available sports
export const AVAILABLE_SPORTS = [
  { key: 'NFL', label: 'NFL', emoji: '🏈', available: true },
  { key: 'NBA', label: 'NBA', emoji: '🏀', available: true },
  { key: 'MLB', label: 'MLB', emoji: '⚾', available: true },
  { key: 'NHL', label: 'NHL', emoji: '🏒', available: true },
  { key: 'SOCCER', label: 'Soccer', emoji: '⚽', available: true },
  { key: 'NCAAF', label: 'CFB', emoji: '🏈', available: true },
  { key: 'NCAAB', label: 'CBB', emoji: '🏀', available: true },
] as const;

export type SportKey = typeof AVAILABLE_SPORTS[number]['key'];
export type DateRange = 'live' | 'today' | 'tomorrow' | 'week' | 'recent';

interface ScoreboardMeta {
  lastRefresh: string | null;
  timestamp: string;
  totalDbGames?: number;
  dataSource?: 'live-api' | 'demo' | 'database';
  dataSourceLabel?: string;
  itemsReturned?: number;
  queryDateRange?: { startDate: string; endDate: string };
}

interface ScoreboardResponse {
  ok: boolean;
  sport: string;
  range: string;
  requestedRange?: string;
  count: number;
  games: AliveGame[];
  meta: ScoreboardMeta;
  error?: string;
  fallbackMessage?: string | null;
  offSeasonMessage?: string | null;
  message?: string | null;
  isDemo?: boolean;
  isLiveApi?: boolean;
  liveApiCached?: boolean;
}

interface UseScoreboardOptions {
  sport: SportKey;
  range: DateRange;
  autoRefresh?: boolean;
  autoRefreshInterval?: number;
  enableFallback?: boolean;
  onSportFallback?: (fromSport: SportKey, toSport: SportKey) => void;
}

interface UseScoreboardResult {
  games: AliveGame[];
  liveGames: AliveGame[];
  scheduledGames: AliveGame[];
  finalGames: AliveGame[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastFetchAt: Date | null;
  lastRefresh: string | null;
  fallbackMessage: string | null;
  offSeasonMessage: string | null;
  activeSport: SportKey;
  isDemo: boolean;
  isLiveApi: boolean;
  dataSourceLabel: string | null;
  meta: ScoreboardMeta | null;
  refresh: () => Promise<void>;
  clearFallbackMessage: () => void;
}

// Helper to find a sport with games
export function pickFallbackSport(
  currentSport: SportKey,
  sportDataCounts: Record<string, number>,
  availableSports: SportKey[]
): SportKey | null {
  const otherSports = availableSports.filter(s => s !== currentSport);
  for (const sport of otherSports) {
    if ((sportDataCounts[sport] || 0) > 0) {
      return sport;
    }
  }
  return null;
}

// Format relative time
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins === 1) return '1m ago';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return '1h ago';
  if (diffHours < 24) return `${diffHours}h ago`;
  
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function useScoreboard(options: UseScoreboardOptions): UseScoreboardResult {
  const {
    sport,
    range,
    autoRefresh = false,
    autoRefreshInterval = 30000,
    enableFallback = true,
    onSportFallback,
  } = options;

  const [games, setGames] = useState<AliveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<Date | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const [offSeasonMessage, setOffSeasonMessage] = useState<string | null>(null);
  const [activeSport, setActiveSport] = useState<SportKey>(sport);
  const [isDemo, setIsDemo] = useState(false);
  const [isLiveApi, setIsLiveApi] = useState(false);
  const [dataSourceLabel, setDataSourceLabel] = useState<string | null>(null);
  const [meta, setMeta] = useState<ScoreboardMeta | null>(null);
  
  // Track all sports' game counts for fallback
  const sportCountsRef = useRef<Record<string, number>>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  // Memoize to prevent infinite re-render loop (array reference stability)
  const availableSports = useMemo(() => 
    AVAILABLE_SPORTS.filter(s => s.available).map(s => s.key) as SportKey[],
  []);

  // Fetch games for a specific sport
  const fetchSportGames = useCallback(async (
    sportToFetch: SportKey,
    _isRefresh: boolean = false
  ): Promise<{ 
    games: AliveGame[]; 
    meta: ScoreboardMeta; 
    fallbackMessage?: string | null; 
    offSeasonMessage?: string | null; 
    isDemo?: boolean;
    isLiveApi?: boolean;
  } | null> => {
    try {
      const res = await fetch(
        `/api/sports-data/scoreboard?sport=${sportToFetch}&range=${range}`,
        { signal: abortControllerRef.current?.signal }
      );
      
      if (!res.ok) return null;
      
      const data: ScoreboardResponse = await res.json();
      if (!data.ok) return null;
      
      // Track count for fallback logic
      sportCountsRef.current[sportToFetch] = data.games?.length || 0;
      
      return { 
        games: data.games || [], 
        meta: data.meta,
        fallbackMessage: data.fallbackMessage,
        offSeasonMessage: data.offSeasonMessage,
        isDemo: data.isDemo,
        isLiveApi: data.isLiveApi,
      };
    } catch (err) {
      if ((err as Error).name === 'AbortError') return null;
      console.error(`Failed to fetch ${sportToFetch} games:`, err);
      return null;
    }
  }, [range]);

  // Main fetch function
  const fetchGames = useCallback(async (isRefresh: boolean = false) => {
    // Cancel any pending requests
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    
    // Track request ID to prevent stale updates
    const currentRequestId = ++requestIdRef.current;
    
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    setFallbackMessage(null);
    setOffSeasonMessage(null);
    
    try {
      // Fetch primary sport
      const result = await fetchSportGames(sport, isRefresh);
      
      // Check if a newer request superseded this one
      if (requestIdRef.current !== currentRequestId) {
        return; // Stale request, don't update state
      }
      
      if (result === null) {
        setError('Unable to load games');
        setGames([]);
        return;
      }
      
      // Set fallback/off-season messages from backend
      if (result.fallbackMessage) {
        setFallbackMessage(result.fallbackMessage);
      }
      if (result.offSeasonMessage) {
        setOffSeasonMessage(result.offSeasonMessage);
      }
      setIsDemo(result.isDemo || false);
      setIsLiveApi(result.isLiveApi || false);
      setDataSourceLabel(result.meta?.dataSourceLabel || null);
      setMeta(result.meta || null);
      
      // Check if we need client-side fallback (backend already attempts its own fallback)
      if (result.games.length === 0 && enableFallback) {
        // Try to find a sport with games
        // First, quickly check other sports
        const checksToMake = availableSports.filter(s => s !== sport);
        
        for (const checkSport of checksToMake) {
          const checkResult = await fetchSportGames(checkSport, false);
          if (checkResult && checkResult.games.length > 0) {
            // Found a sport with games
            const sportConfig = AVAILABLE_SPORTS.find(s => s.key === sport);
            const fallbackConfig = AVAILABLE_SPORTS.find(s => s.key === checkSport);
            
            setFallbackMessage(
              `No ${sportConfig?.label || sport} games for ${range === 'live' ? 'live' : range}. Showing ${fallbackConfig?.label || checkSport}.`
            );
            setGames(checkResult.games);
            setActiveSport(checkSport);
            setLastRefresh(checkResult.meta?.lastRefresh || null);
            setLastFetchAt(new Date());
            // Update data source info from fallback sport
            setDataSourceLabel(checkResult.meta?.dataSourceLabel || null);
            setMeta(checkResult.meta || null);
            setIsLiveApi(checkResult.isLiveApi || false);
            onSportFallback?.(sport, checkSport);
            return;
          }
        }
        
        // No fallback found - all sports empty
        setGames([]);
        setActiveSport(sport);
        setLastFetchAt(new Date());
      } else {
        setGames(result.games);
        setActiveSport(sport);
        setLastRefresh(result.meta?.lastRefresh || null);
        setLastFetchAt(new Date());
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Failed to fetch games:', err);
        setError('Unable to load games');
        setGames([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sport, range, enableFallback, availableSports, fetchSportGames, onSportFallback]);

  // Initial fetch and sport/range changes
  useEffect(() => {
    fetchGames(false);
    
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetchGames]);

  // Auto-refresh for live view with exponential backoff
  const autoRefreshErrorRef = useRef(0);
  
  useEffect(() => {
    if (!autoRefresh || range !== 'live') return;
    
    let timeoutId: ReturnType<typeof setTimeout>;
    let mounted = true;
    const MAX_BACKOFF = 240000; // 4 minutes max
    
    const refreshWithBackoff = async () => {
      if (!mounted) return;
      
      try {
        await fetchGames(true);
        autoRefreshErrorRef.current = 0;
      } catch {
        autoRefreshErrorRef.current = Math.min(autoRefreshErrorRef.current + 1, 4);
      }
      
      if (mounted) {
        const backoff = Math.pow(2, autoRefreshErrorRef.current);
        const nextInterval = Math.min(autoRefreshInterval * backoff, MAX_BACKOFF);
        timeoutId = setTimeout(refreshWithBackoff, nextInterval);
      }
    };
    
    // Start polling after initial interval
    timeoutId = setTimeout(refreshWithBackoff, autoRefreshInterval);
    
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [autoRefresh, autoRefreshInterval, range, fetchGames]);

  // Separate games by status
  const liveGames = games.filter(g => g.status === 'live');
  const scheduledGames = games.filter(g => g.status === 'scheduled');
  const finalGames = games.filter(g => g.status === 'final');

  const refresh = useCallback(async () => {
    await fetchGames(true);
  }, [fetchGames]);

  const clearFallbackMessage = useCallback(() => {
    setFallbackMessage(null);
  }, []);

  return {
    games,
    liveGames,
    scheduledGames,
    finalGames,
    loading,
    refreshing,
    error,
    lastFetchAt,
    lastRefresh,
    fallbackMessage,
    offSeasonMessage,
    activeSport,
    isDemo,
    isLiveApi,
    dataSourceLabel,
    meta,
    refresh,
    clearFallbackMessage,
  };
}

import { useState, useEffect, useCallback, useRef } from "react";
import type { GameOddsSummary } from "@/shared/types";

interface UseOddsSummaryResult {
  summary: GameOddsSummary | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch odds summary for a single game
 */
export function useOddsSummary(
  gameId: string | null,
  options: { scope?: string; autoRefresh?: boolean; refreshInterval?: number } = {}
): UseOddsSummaryResult {
  const { scope = "PROD", autoRefresh = false, refreshInterval = 60000 } = options;
  const [summary, setSummary] = useState<GameOddsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!gameId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/odds/summary/${gameId}?scope=${scope}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch odds");
      const data = await res.json();
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch odds");
    } finally {
      setIsLoading(false);
    }
  }, [gameId, scope]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Polling with exponential backoff
  const errorCountRef = useRef(0);
  
  useEffect(() => {
    if (!autoRefresh || !gameId) return;
    
    let timeoutId: ReturnType<typeof setTimeout>;
    let mounted = true;
    const MAX_BACKOFF = 240000; // 4 minutes max
    
    const pollWithBackoff = async () => {
      if (!mounted) return;
      
      try {
        await fetchSummary();
        errorCountRef.current = 0;
      } catch {
        errorCountRef.current = Math.min(errorCountRef.current + 1, 4);
      }
      
      if (mounted) {
        const backoff = Math.pow(2, errorCountRef.current);
        const nextInterval = Math.min(refreshInterval * backoff, MAX_BACKOFF);
        timeoutId = setTimeout(pollWithBackoff, nextInterval);
      }
    };
    
    timeoutId = setTimeout(pollWithBackoff, refreshInterval);
    
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [autoRefresh, refreshInterval, fetchSummary, gameId]);

  return { summary, isLoading, error, refetch: fetchSummary };
}

interface SlateGame {
  id: string;
  home_team: string;
  away_team: string;
  start_at: string;
  status: string;
}

interface UseSlateOddsResult {
  summaries: (GameOddsSummary & { game?: SlateGame })[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch odds summaries for multiple games (slate view)
 */
export function useSlateOdds(
  gameIds: string[],
  options: { scope?: string } = {}
): UseSlateOddsResult {
  const { scope = "PROD" } = options;
  const [summaries, setSummaries] = useState<(GameOddsSummary & { game?: SlateGame })[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSlate = useCallback(async () => {
    if (gameIds.length === 0) {
      setSummaries([]);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/odds/slate?game_ids=${gameIds.join(",")}&scope=${scope}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch slate odds");
      const data = await res.json();
      setSummaries(data.summaries || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch slate odds");
    } finally {
      setIsLoading(false);
    }
  }, [gameIds.join(","), scope]);

  useEffect(() => {
    fetchSlate();
  }, [fetchSlate]);

  return { summaries, isLoading, error, refetch: fetchSlate };
}

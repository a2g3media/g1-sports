/**
 * useTeamLookup Hook
 * 
 * Fetches and caches team info (full names + records) for all leagues.
 * Used by game cards to display full team names instead of abbreviations.
 */

import { useState, useEffect, useCallback } from 'react';

export interface TeamLookupEntry {
  fullName: string;
  record: string;
}

export type TeamLookup = Record<string, TeamLookupEntry>;
export type AllLeagueLookups = Record<string, TeamLookup>;

interface UseTeamLookupResult {
  lookups: AllLeagueLookups;
  loading: boolean;
  error: string | null;
  getTeamInfo: (abbr: string, league: string) => TeamLookupEntry | null;
  refresh: () => Promise<void>;
}

// Global cache to avoid re-fetching
let globalLookups: AllLeagueLookups = {};
let lastFetchTime = 0;
let lastFailedFetchTime = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const FAILURE_RETRY_MS = 2 * 60 * 1000; // avoid noisy repeated failures

function asTeamEntry(team: any): { abbr: string; fullName: string } | null {
  const abbr = String(team?.abbr || team?.code || "").trim().toUpperCase();
  const market = String(team?.market || "").trim();
  const name = String(team?.name || "").trim();
  const fullName = String(team?.fullName || "").trim() || [market, name].filter(Boolean).join(" ").trim();
  if (!abbr || !fullName) return null;
  return { abbr, fullName };
}

export function useTeamLookup(): UseTeamLookupResult {
  const [lookups, setLookups] = useState<AllLeagueLookups>(globalLookups);
  const [loading, setLoading] = useState(Object.keys(globalLookups).length === 0);
  const [error, setError] = useState<string | null>(null);

  const fetchLookups = useCallback(async (force = false) => {
    // Use cache if fresh
    if (!force && Date.now() - lastFetchTime < CACHE_TTL && Object.keys(globalLookups).length > 0) {
      setLookups(globalLookups);
      setLoading(false);
      return;
    }
    // Back off after a recent failure so we don't spam failing calls/logs.
    if (!force && Object.keys(globalLookups).length === 0 && Date.now() - lastFailedFetchTime < FAILURE_RETRY_MS) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build lightweight lookup from the games feed to avoid dependency
      // on a dedicated lookup endpoint that may not be available in all envs.
      const res = await fetch("/api/games");
      if (!res.ok) {
        lastFailedFetchTime = Date.now();
        setError(null);
        return;
      }

      const data = await res.json();
      const games = Array.isArray(data?.games) ? data.games : [];
      const nextLookups: AllLeagueLookups = {};

      for (const game of games) {
        const league = String(game?.sport || "").trim().toUpperCase();
        if (!league) continue;
        if (!nextLookups[league]) nextLookups[league] = {};

        const home = typeof game?.homeTeam === "object" ? game.homeTeam : null;
        const away = typeof game?.awayTeam === "object" ? game.awayTeam : null;
        const candidates = [
          asTeamEntry(home),
          asTeamEntry(away),
          asTeamEntry({ abbr: game?.homeTeam, fullName: game?.homeTeam }),
          asTeamEntry({ abbr: game?.awayTeam, fullName: game?.awayTeam }),
        ].filter(Boolean) as { abbr: string; fullName: string }[];

        for (const team of candidates) {
          nextLookups[league][team.abbr] = { fullName: team.fullName, record: "—" };
        }
      }

      globalLookups = nextLookups;
      lastFetchTime = Date.now();
      setLookups(nextLookups);
      setError(null);
    } catch (err) {
      lastFailedFetchTime = Date.now();
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

  const getTeamInfo = useCallback((abbr: string, league: string): TeamLookupEntry | null => {
    const upperAbbr = abbr.toUpperCase();
    const upperLeague = league.toUpperCase();
    
    // Normalize league names
    const normalizedLeague = 
      upperLeague === 'CBB' ? 'NCAAB' :
      upperLeague === 'CFB' ? 'NCAAF' :
      upperLeague;
    
    return lookups[normalizedLeague]?.[upperAbbr] || null;
  }, [lookups]);

  const refresh = useCallback(async () => {
    await fetchLookups(true);
  }, [fetchLookups]);

  return {
    lookups,
    loading,
    error,
    getTeamInfo,
    refresh,
  };
}

/**
 * Helper to resolve team display name
 * Falls back to original if not found
 */
export function resolveTeamName(
  abbr: string,
  league: string,
  lookups: AllLeagueLookups
): string {
  const upperAbbr = abbr.toUpperCase();
  const normalizedLeague = 
    league.toUpperCase() === 'CBB' ? 'NCAAB' :
    league.toUpperCase() === 'CFB' ? 'NCAAF' :
    league.toUpperCase();
  
  return lookups[normalizedLeague]?.[upperAbbr]?.fullName || abbr;
}

/**
 * Helper to get team record
 */
export function getTeamRecord(
  abbr: string,
  league: string,
  lookups: AllLeagueLookups
): string {
  const upperAbbr = abbr.toUpperCase();
  const normalizedLeague = 
    league.toUpperCase() === 'CBB' ? 'NCAAB' :
    league.toUpperCase() === 'CFB' ? 'NCAAF' :
    league.toUpperCase();
  
  return lookups[normalizedLeague]?.[upperAbbr]?.record || '—';
}

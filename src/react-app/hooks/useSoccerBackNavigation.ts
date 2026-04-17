/**
 * useSoccerBackNavigation - Smart back navigation for Soccer pages
 * 
 * Handles two cases:
 * 1. Browser history exists - use navigate(-1)
 * 2. Direct entry/refresh - fall back to logical parent route
 */

import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { normalizeSoccerDetailId } from "@/react-app/lib/gameRoutes";

// Track if user has navigated within the app (not just direct entry)
let hasAppNavigation = false;

// Listen for navigation events to track in-app navigation
if (typeof window !== "undefined") {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(...args) {
    hasAppNavigation = true;
    return originalPushState.apply(this, args);
  };
  
  history.replaceState = function(...args) {
    // replaceState doesn't count as "navigation" for back purposes
    return originalReplaceState.apply(this, args);
  };
  
  window.addEventListener("popstate", () => {
    hasAppNavigation = true;
  });
}

export type SoccerPageType = "league" | "team" | "match" | "player";

interface BackNavigationOptions {
  pageType: SoccerPageType;
  /** Team ID for player page fallback */
  teamId?: string;
  /** League ID for team/match page fallback */
  leagueId?: string;
}

interface BackNavigationResult {
  /** Call this to navigate back */
  goBack: () => void;
  /** The fallback URL that would be used if no history */
  fallbackUrl: string;
  /** Whether we have valid in-app history to go back to */
  hasHistory: boolean;
}

/**
 * Get the logical parent fallback URL for a soccer page
 */
function getFallbackUrl(
  pageType: SoccerPageType,
  options: {
    teamId?: string;
    leagueId?: string;
    fromTeamId?: string | null;
    fromLeagueId?: string | null;
  }
): string {
  const { teamId, leagueId, fromTeamId, fromLeagueId } = options;
  
  switch (pageType) {
    case "player":
      // Player → Team (if known) → Soccer Hub
      if (teamId) return `/sports/soccer/team/${teamId}`;
      return "/sports/soccer";
      
    case "match":
      // Match → League (if known) → Team (from param) → Soccer Hub
      if (fromLeagueId) return `/sports/soccer/league/${fromLeagueId}`;
      if (leagueId) return `/sports/soccer/league/${leagueId}`;
      if (fromTeamId) return `/sports/soccer/team/${fromTeamId}`;
      return "/sports/soccer";
      
    case "team":
      // Team → League (if known) → Soccer Hub
      if (leagueId) return `/sports/soccer/league/${leagueId}`;
      return "/sports/soccer";
      
    case "league":
      // League → Soccer Hub
      return "/sports/soccer";
      
    default:
      return "/sports/soccer";
  }
}

export function useSoccerBackNavigation(
  options: BackNavigationOptions
): BackNavigationResult {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const entryPathRef = useRef<string | null>(null);
  
  // Track the entry path on mount
  useEffect(() => {
    if (entryPathRef.current === null) {
      entryPathRef.current = location.pathname;
    }
  }, [location.pathname]);
  
  // Extract context params from URL
  const fromTeamId = searchParams.get("fromTeamId");
  const fromLeagueId = searchParams.get("fromLeagueId");
  
  // Calculate fallback URL
  const fallbackUrl = getFallbackUrl(options.pageType, {
    teamId: options.teamId,
    leagueId: options.leagueId,
    fromTeamId,
    fromLeagueId,
  });
  
  // Check if we have valid history
  // history.length > 2 suggests the user has navigated (not just direct entry)
  // But we also track in-app navigation explicitly
  const hasHistory = hasAppNavigation && window.history.length > 2;
  
  const goBack = useCallback(() => {
    if (hasHistory) {
      // Use browser back
      navigate(-1);
    } else {
      // Fall back to logical parent
      navigate(fallbackUrl);
    }
  }, [navigate, hasHistory, fallbackUrl]);
  
  return {
    goBack,
    fallbackUrl,
    hasHistory,
  };
}

/**
 * Helper to build navigation URLs with context params
 */
export function buildSoccerMatchUrl(
  matchId: string,
  context?: { fromTeamId?: string; fromLeagueId?: string; from?: string }
): string {
  const normalizedMatchId = normalizeSoccerDetailId(matchId);
  let url = `/sports/soccer/match/${encodeURIComponent(normalizedMatchId)}`;
  const params = new URLSearchParams();
  
  if (context?.fromTeamId) params.set("fromTeamId", context.fromTeamId);
  if (context?.fromLeagueId) params.set("fromLeagueId", context.fromLeagueId);
  if (context?.from) params.set("from", context.from);
  
  const paramString = params.toString();
  if (paramString) url += `?${paramString}`;
  
  return url;
}

export function buildSoccerTeamUrl(
  teamId: string,
  context?: { fromLeagueId?: string }
): string {
  let url = `/sports/soccer/team/${teamId}`;
  const params = new URLSearchParams();
  
  if (context?.fromLeagueId) params.set("fromLeagueId", context.fromLeagueId);
  
  const paramString = params.toString();
  if (paramString) url += `?${paramString}`;
  
  return url;
}

export function buildSoccerPlayerUrl(
  playerId: string,
  context?: { fromTeamId?: string }
): string {
  let url = `/sports/soccer/player/${playerId}`;
  const params = new URLSearchParams();
  
  if (context?.fromTeamId) params.set("fromTeamId", context.fromTeamId);
  
  const paramString = params.toString();
  if (paramString) url += `?${paramString}`;
  
  return url;
}

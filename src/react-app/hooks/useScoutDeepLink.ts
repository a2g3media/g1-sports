/**
 * Scout Deep Link Handler
 * 
 * Handles deep links from Scout push notifications to open the game page
 * with Scout drawer pre-expanded and relevant context loaded.
 * 
 * URL format: /scores/game/:gameId?scout=open&context=:type&alertId=:id
 * 
 * Respects user closing - doesn't force reopen on normal navigation.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";

export interface ScoutDeepLinkState {
  shouldOpenScout: boolean;
  contextType: string | null;
  alertId: string | null;
  gameId: string | null;
  wasHandled: boolean;
}

interface UseScoutDeepLinkResult {
  deepLinkState: ScoutDeepLinkState;
  markHandled: () => void;
  clearDeepLink: () => void;
}

/**
 * Hook to detect and handle Scout deep links from push notifications
 */
export function useScoutDeepLink(gameId?: string): UseScoutDeepLinkResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const [deepLinkState, setDeepLinkState] = useState<ScoutDeepLinkState>({
    shouldOpenScout: false,
    contextType: null,
    alertId: null,
    gameId: null,
    wasHandled: false,
  });
  
  // Track if user manually closed Scout (don't reopen)
  const userClosedRef = useRef(false);
  
  // Parse deep link params on mount and param changes
  useEffect(() => {
    const scoutParam = searchParams.get("scout");
    const contextParam = searchParams.get("context");
    const alertIdParam = searchParams.get("alertId");
    
    // Check if this is a Scout deep link
    if (scoutParam === "open" && !userClosedRef.current) {
      setDeepLinkState({
        shouldOpenScout: true,
        contextType: contextParam,
        alertId: alertIdParam,
        gameId: gameId || null,
        wasHandled: false,
      });
    }
  }, [searchParams, gameId]);
  
  /**
   * Mark the deep link as handled (Scout drawer opened)
   * Clears URL params to prevent re-triggering on refresh
   */
  const markHandled = useCallback(() => {
    setDeepLinkState(prev => ({ ...prev, wasHandled: true, shouldOpenScout: false }));
    
    // Clean up URL params
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("scout");
    newParams.delete("context");
    newParams.delete("alertId");
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);
  
  /**
   * Clear deep link state (user manually closed Scout)
   */
  const clearDeepLink = useCallback(() => {
    userClosedRef.current = true;
    setDeepLinkState({
      shouldOpenScout: false,
      contextType: null,
      alertId: null,
      gameId: null,
      wasHandled: true,
    });
    
    // Clean up URL params
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("scout");
    newParams.delete("context");
    newParams.delete("alertId");
    setSearchParams(newParams, { replace: true });
    
    // Reset user closed flag after navigation
    setTimeout(() => {
      userClosedRef.current = false;
    }, 1000);
  }, [searchParams, setSearchParams]);
  
  return {
    deepLinkState,
    markHandled,
    clearDeepLink,
  };
}

/**
 * Get initial Scout prompt based on context type
 */
export function getScoutContextPrompt(contextType: string | null): string {
  const prompts: Record<string, string> = {
    game_summary: "Give me a quick summary of this game.",
    live_action: "What just happened in the game?",
    period_summary: "Summarize this period.",
    injury_report: "What's the latest on injuries?",
    odds_analysis: "Why did the line move?",
    performance_analysis: "Tell me about this performance.",
    weather_impact: "How is weather affecting the game?",
    game_overview: "What should I know about this game?",
    bundle: "Catch me up on what I missed.",
  };
  
  return prompts[contextType || "game_overview"] || prompts.game_overview;
}

/**
 * Check if current URL contains Scout deep link params
 */
export function hasScoutDeepLink(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get("scout") === "open";
}

/**
 * Build a Scout deep link URL
 * Uses split view for push notifications, regular view with params for other cases
 */
export function buildScoutDeepLink(
  gameId: string,
  contextType: string,
  alertId?: string,
  useSplitView: boolean = true
): string {
  // Split view provides immersive game + Scout experience
  if (useSplitView) {
    const params = new URLSearchParams({ context: contextType });
    if (alertId) params.set("alertId", alertId);
    return `/scores/game/${gameId}/live?${params.toString()}`;
  }
  
  // Fallback to regular game page with Scout overlay
  const params = new URLSearchParams({
    scout: "open",
    context: contextType,
  });
  
  if (alertId) {
    params.set("alertId", alertId);
  }
  
  return `/scores/game/${gameId}?${params.toString()}`;
}

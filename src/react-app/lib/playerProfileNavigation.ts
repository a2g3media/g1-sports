import type { NavigateFunction } from "react-router-dom";
import { buildPlayerRoute, normalizeSportKeyForRoute } from "@/react-app/lib/navigationRoutes";
import { resolvePlayerIdForNavigation } from "@/react-app/lib/resolvePlayerIdForNavigation";

/**
 * Navigate to player profile. Uses numeric id from payload when present; otherwise curated name→id for the sport.
 */
export function navigateToPlayerProfile(
  navigate: NavigateFunction,
  sportKey: string,
  playerId: unknown,
  navOpts?: { replace?: boolean; displayName?: string; source?: string }
): boolean {
  const sport = normalizeSportKeyForRoute(String(sportKey || ""));
  const rawSourceId = String(playerId ?? "").trim();
  const mappedFromName = resolvePlayerIdForNavigation(undefined, navOpts?.displayName, sport);
  const id = /^\d{4,}$/.test(rawSourceId)
    ? (mappedFromName && mappedFromName !== rawSourceId ? mappedFromName : rawSourceId)
    : resolvePlayerIdForNavigation(rawSourceId, navOpts?.displayName, sport);
  if (!id) {
    console.warn("PLAYER_CLICK_TRACE", {
      source: navOpts?.source || "unknown",
      sportKey: sport,
      clickedDisplayName: navOpts?.displayName || null,
      clickedRawPlayerId: rawSourceId || null,
      finalNavigationTarget: null,
      route: null,
      reason: "missing_or_non_numeric_source_id",
    });
    console.error("NAVIGATE_PLAYER_PROFILE_MISSING_ID", { sportKey: sport });
    return false;
  }
  const routeBase = buildPlayerRoute(sportKey, id);
  const hintedName = String(navOpts?.displayName || "").trim();
  const route =
    hintedName
      ? `${routeBase}?playerName=${encodeURIComponent(hintedName)}`
      : routeBase;
  console.info("PLAYER_CLICK_TRACE", {
    source: navOpts?.source || "unknown",
    sportKey: sport,
    clickedDisplayName: navOpts?.displayName || null,
    clickedRawPlayerId: rawSourceId,
    finalNavigationTarget: id,
    route,
  });
  navigate(route, {
    replace: navOpts?.replace,
    state: navOpts?.displayName
      ? { playerNameHint: String(navOpts.displayName || "").trim() }
      : undefined,
  });
  return true;
}

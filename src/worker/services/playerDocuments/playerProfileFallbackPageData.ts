import { isPlayerProfileDisplayNameFallback } from "../../../shared/playerProfileCompleteness";
import { getFreshnessPolicy } from "../pageData/freshnessPolicy";

function headshotPathForSport(sportUpper: string): string {
  const s = String(sportUpper || "").toUpperCase();
  if (s === "NBA" || s === "NCAAB") return "nba";
  if (s === "NFL" || s === "NCAAF") return "nfl";
  if (s === "MLB") return "mlb";
  if (s === "NHL") return "nhl";
  return "nba";
}

export function buildEspnHeadshotUrlForProfile(espnId: string, sportUpper: string): string {
  const path = headshotPathForSport(sportUpper);
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/${path}/players/full/${espnId}.png&w=350&h=254`;
}

/**
 * Read-only GET miss: full UI shell (identity + empty stat sections). Never degraded — user never sees an error state.
 */
export function buildPlayerProfileDocumentPendingEnvelope(params: {
  sport: string;
  playerName: string;
  playerId: string;
}): {
  route: "player-profile";
  generatedAt: string;
  freshness: {
    class: "medium";
    cacheTtlMs: number;
    staleWindowMs: number;
    source: "cold";
    stale: boolean;
  };
  degraded: boolean;
  meta: {
    sport: string;
    playerName: string;
    playerId: string | null;
    partialReason: string | null;
  };
  data: {
    profile: Record<string, unknown>;
    canonicalTeamRouteId: string | null;
  };
} {
  const policy = getFreshnessPolicy("medium");
  const sport = String(params.sport || "").trim().toUpperCase();
  const playerId = String(params.playerId || "").trim();
  const rawHint = String(params.playerName || "").trim();
  const safeLabel =
    rawHint && !isPlayerProfileDisplayNameFallback(rawHint) ? rawHint : "";
  const headshotUrl = buildEspnHeadshotUrlForProfile(playerId, sport);

  const profile = {
    player: {
      espnId: playerId,
      id: playerId,
      displayName: safeLabel,
      name: safeLabel,
      position: "",
      jersey: "",
      teamName: "",
      teamAbbr: "",
      teamColor: "#22d3ee",
      headshotUrl,
      sport,
      __documentPending: true,
    },
    gameLog: [],
    seasonAverages: {},
    currentProps: [],
    recentPerformance: [],
    propHitRates: {},
    matchup: null,
    vsOpponent: null,
    health: undefined,
    liveProps: [],
    lastUpdated: new Date().toISOString(),
  };

  return {
    route: "player-profile",
    generatedAt: new Date().toISOString(),
    freshness: {
      class: "medium",
      cacheTtlMs: policy.cacheTtlMs,
      staleWindowMs: policy.staleWindowMs,
      source: "cold",
      stale: false,
    },
    degraded: false,
    meta: {
      sport,
      playerName: safeLabel,
      playerId,
      partialReason: "document_pending",
    },
    data: {
      profile,
      canonicalTeamRouteId: null,
    },
  };
}

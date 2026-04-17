/* COVERAGE LOCK: do not redesign/refactor; only completeness rule updates. */
/**
 * Single contract for when a player profile may render as a "full" page (hero + stats + log).
 * Used by worker page-data and PlayerProfilePage — keep in sync.
 */

export function isPlayerProfileDisplayNameFallback(name: unknown): boolean {
  const s = String(name ?? "").trim();
  if (!s) return true;
  if (/^player-\d+$/i.test(s)) return true;
  if (/^player\s+\d+$/i.test(s)) return true;
  if (/^\d{4,}$/.test(s)) return true;
  return false;
}

export type PlayerProfileCoreReadiness = {
  ready: boolean;
  reasons: string[];
  missingSections: string[];
  identityValid: boolean;
  hasGameLog: boolean;
  hasSeasonAverages: boolean;
  hasMarketEvidence: boolean;
};

export function evaluatePlayerProfileCoreReadiness(
  profile: Record<string, unknown> | null | undefined
): PlayerProfileCoreReadiness {
  const reasons: string[] = [];
  const missingSections: string[] = [];
  if (!profile || typeof profile !== "object") {
    return {
      ready: false,
      reasons: ["profile_missing"],
      missingSections: ["identity", "game_log", "season_averages", "markets"],
      identityValid: false,
      hasGameLog: false,
      hasSeasonAverages: false,
      hasMarketEvidence: false,
    };
  }

  const player = profile.player as Record<string, unknown> | undefined;
  const id = String(player?.id || player?.espnId || "").trim();
  const displayName = String(player?.displayName || player?.name || "").trim();
  const identityValid = /^\d{3,}$/.test(id) && !isPlayerProfileDisplayNameFallback(displayName) && player?.__documentPending !== true;
  if (!identityValid) {
    reasons.push("identity_invalid");
    missingSections.push("identity");
  }

  const hasGameLog = Array.isArray(profile.gameLog) && profile.gameLog.length > 0;
  if (!hasGameLog) {
    reasons.push("game_log_missing");
    missingSections.push("game_log");
  }

  const seasonAverages = profile.seasonAverages as Record<string, unknown> | undefined;
  const hasSeasonAverages = Boolean(seasonAverages && typeof seasonAverages === "object" && Object.keys(seasonAverages).length > 0);
  if (!hasSeasonAverages) {
    reasons.push("season_averages_missing");
    missingSections.push("season_averages");
  }

  const sport = String(player?.sport || "").trim().toUpperCase();
  const hasCurrentProps = Array.isArray(profile.currentProps) && profile.currentProps.length > 0;
  const hasRecentMarkets =
    Array.isArray(profile.recentPerformance)
    && profile.recentPerformance.some((row: any) => {
      const lines = row?.propLines;
      if (!lines || typeof lines !== "object") return false;
      if (sport === "MLB") {
        const hits = Number(lines.hits ?? lines.hit);
        const runs = Number(lines.runs ?? lines.run);
        const rbis = Number(lines.rbis ?? lines.rbi ?? lines.RBI);
        const homeRuns = Number(lines.homeRuns ?? lines.home_runs ?? lines.hr ?? lines.HR);
        const strikeouts = Number(lines.strikeouts ?? lines.so ?? lines.K);
        const keyedMatch = (
          Number.isFinite(hits)
          || Number.isFinite(runs)
          || Number.isFinite(rbis)
          || Number.isFinite(homeRuns)
          || Number.isFinite(strikeouts)
        );
        if (keyedMatch) return true;
        return Object.values(lines).some((v) => Number.isFinite(Number(v)));
      }
      if (sport === "NHL") {
        const goals = Number(lines.goals ?? lines.G);
        const assists = Number(lines.assists ?? lines.A);
        const points = Number(lines.points ?? lines.PTS);
        const shots = Number(lines.shots ?? lines.SOG ?? lines.shotsOnGoal);
        const saves = Number(lines.saves ?? lines.SV);
        const keyedMatch =
          Number.isFinite(goals)
          || Number.isFinite(assists)
          || Number.isFinite(points)
          || Number.isFinite(shots)
          || Number.isFinite(saves);
        if (keyedMatch) return true;
        return Object.values(lines).some((v) => Number.isFinite(Number(v)));
      }
      const points = Number(lines.points);
      const rebounds = Number(lines.rebounds);
      const assists = Number(lines.assists);
      return Number.isFinite(points) || Number.isFinite(rebounds) || Number.isFinite(assists);
    });
  const hasMarketEvidence = hasCurrentProps || hasRecentMarkets;
  if (!hasMarketEvidence) {
    reasons.push("markets_missing");
    missingSections.push("markets");
  }

  return {
    ready: identityValid && hasGameLog && hasSeasonAverages && hasMarketEvidence,
    reasons,
    missingSections,
    identityValid,
    hasGameLog,
    hasSeasonAverages,
    hasMarketEvidence,
  };
}

/** Profile object shape: `data.profile` from page-data or `PlayerProfileData` on the client. */
export function isPlayerProfileDocumentCompleteForRender(
  profile: Record<string, unknown> | null | undefined
): boolean {
  if (!profile?.player || typeof profile.player !== "object") return false;
  const p = profile.player as Record<string, unknown>;
  if (p.__documentPending === true) return false;
  const dn = String(p.displayName || p.name || "").trim();
  if (isPlayerProfileDisplayNameFallback(dn)) return false;

  const sa = profile.seasonAverages as Record<string, unknown> | undefined;
  const hasSeasonAverages = Boolean(sa && typeof sa === "object" && Object.keys(sa).length > 0);

  const gl = profile.gameLog as unknown[] | undefined;
  const hasGameLog = Array.isArray(gl) && gl.length > 0;

  const currentProps = profile.currentProps as unknown[] | undefined;
  const hasCurrentProps = Array.isArray(currentProps) && currentProps.length > 0;

  const recentPerformance = profile.recentPerformance as unknown[] | undefined;
  const hasRecentPerformance = Array.isArray(recentPerformance) && recentPerformance.length > 0;

  if (!hasSeasonAverages && !hasGameLog && !hasCurrentProps && !hasRecentPerformance) return false;

  return true;
}

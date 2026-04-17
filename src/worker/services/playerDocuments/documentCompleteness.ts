/** Background-only: drives re-enqueue / enrichment. Never shown as scary UI. */
export type DocumentCompletenessMeta = {
  hasIdentity: boolean;
  hasSeasonStats: boolean;
  hasRecentGames: boolean;
  hasProps: boolean;
  completenessScore: number;
  lastEnrichedAt: string | null;
};

export function computeDocumentCompleteness(profile: Record<string, unknown>): DocumentCompletenessMeta {
  const player = profile?.player as Record<string, unknown> | undefined;
  const hasIdentity = Boolean(
    String(player?.espnId || player?.id || "").trim() || String(player?.displayName || "").trim()
  );
  const sa = profile?.seasonAverages as Record<string, number> | undefined;
  const hasSeasonStats = Boolean(sa && typeof sa === "object" && Object.keys(sa).length > 0);
  const gl = profile?.gameLog as unknown[] | undefined;
  const hasRecentGames = Array.isArray(gl) && gl.length > 0;
  const cp = profile?.currentProps as unknown[] | undefined;
  const hasProps = Array.isArray(cp) && cp.length > 0;
  let completenessScore = 0;
  if (hasIdentity) completenessScore += 0.25;
  if (hasSeasonStats) completenessScore += 0.25;
  if (hasRecentGames) completenessScore += 0.25;
  if (hasProps) completenessScore += 0.25;
  const lastEnrichedAt = new Date().toISOString();
  return {
    hasIdentity,
    hasSeasonStats,
    hasRecentGames,
    hasProps,
    completenessScore,
    lastEnrichedAt,
  };
}

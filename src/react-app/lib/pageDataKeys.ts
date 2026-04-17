export function buildPageDataGamesUrl(params: {
  date: string;
  sport?: string;
  tab?: "scores" | "odds" | "props";
  fresh?: boolean;
}): string {
  const qs = new URLSearchParams({
    date: String(params.date || "").trim(),
    sport: String(params.sport || "ALL").trim().toUpperCase() || "ALL",
    tab: String(params.tab || "scores").trim().toLowerCase(),
  });
  if (params.fresh) qs.set("fresh", "1");
  return `/api/page-data/games?${qs.toString()}`;
}

export function buildPageDataGamesCacheKey(params: {
  date: string;
  sport?: string;
  tab?: "scores" | "odds" | "props";
  fresh?: boolean;
}): string {
  const sport = String(params.sport || "ALL").trim().toUpperCase() || "ALL";
  const tab = String(params.tab || "scores").trim().toLowerCase() || "scores";
  const freshness = params.fresh ? "fresh" : "cached";
  return `page-data:games:v2:${sport}:${String(params.date || "").trim()}:${tab}:${freshness}`;
}

export function buildPlayerProfileSnapshotCacheKey(params: {
  sport: string;
  playerId: string;
  playerNameHint?: string | null;
}): string {
  const sport = String(params.sport || "").trim().toUpperCase();
  const playerId = String(params.playerId || "").trim();
  const hintToken = String(params.playerNameHint || "").trim().toLowerCase() || "-";
  return `player-pd:v2:${sport}:${playerId}:${hintToken}`;
}

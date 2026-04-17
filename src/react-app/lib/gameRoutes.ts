import { normalizeSoccerRouteId } from "@/shared/canonicalSoccerId";

function inferSportFromGameId(gameId: string): string | null {
  if (!gameId) return null;
  const id = gameId.toLowerCase();
  if (id.startsWith("sr_")) {
    const parts = id.split("_");
    return parts.length > 1 ? parts[1] : null;
  }
  if (id.startsWith("espn_")) {
    const parts = id.split("_");
    return parts.length > 1 ? parts[1] : null;
  }
  if (id.startsWith("sr:match:") || id.startsWith("sr:sport_event:")) {
    return "soccer";
  }
  return null;
}

export function normalizeSoccerDetailId(rawId: string): string {
  const normalized = normalizeSoccerRouteId(rawId);
  return normalized || String(rawId || "").trim();
}

export function toGameDetailPath(sportKey: string | null | undefined, gameId: string | null | undefined): string {
  let normalizedId = String(gameId || "").trim();
  if (normalizedId.startsWith("soccer_sr:sport_event:")) {
    normalizedId = normalizedId.replace(/^soccer_/, "");
  }
  if (!normalizedId) return "/games";

  const normalizedSport = String(sportKey || "").trim().toLowerCase() || inferSportFromGameId(normalizedId) || "nba";
  if (normalizedSport === "golf") {
    return "/sports/golf";
  }
  if (normalizedSport === "soccer") {
    normalizedId = normalizeSoccerDetailId(normalizedId);
    return `/sports/soccer/match/${encodeURIComponent(normalizedId)}`;
  }
  return `/games/${normalizedSport}/${encodeURIComponent(normalizedId)}`;
}

export function toOddsGamePath(sportKey: string | null | undefined, gameId: string | null | undefined): string {
  let normalizedId = String(gameId || "").trim();
  if (normalizedId.startsWith("soccer_sr:sport_event:")) {
    normalizedId = normalizedId.replace(/^soccer_/, "");
  }
  if (!normalizedId) return "/odds";

  const normalizedSport = String(sportKey || "").trim().toLowerCase() || inferSportFromGameId(normalizedId) || "nba";
  if (normalizedSport === "golf") {
    return "/sports/golf";
  }
  return `/sports/${normalizedSport}/odds/${encodeURIComponent(normalizedId)}`;
}

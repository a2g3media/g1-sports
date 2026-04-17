export function normalizeSportKeyForRoute(sportKey: string): string {
  const raw = String(sportKey || "").trim().toLowerCase();
  if (raw === "cbb") return "ncaab";
  if (raw === "cfb") return "ncaaf";
  return raw || "nba";
}

function canonicalizeTeamRouteId(sportKey: string, teamId: string): string {
  const sport = normalizeSportKeyForRoute(sportKey);
  const raw = String(teamId || "").trim();
  if (!raw) return raw;
  if (sport !== "nba") return raw;
  const upper = raw.toUpperCase();
  const nbaAliasCanonical: Record<string, string> = {
    GSW: "GS",
    PHO: "PHX",
    NO: "NOP",
    SA: "SAS",
    NY: "NYK",
    CHO: "CHA",
    BRK: "BKN",
    PHL: "PHI",
  };
  return nbaAliasCanonical[upper] || raw;
}

/** ESPN athlete id suitable for routes and page-data (`playerId` query / path segment). */
export function canonicalPlayerIdQueryParam(id: unknown): string | undefined {
  const s = String(id ?? "").trim();
  return /^\d{4,}$/.test(s) ? s : undefined;
}

export function buildTeamRoute(sportKey: string, teamId: string): string {
  const sport = normalizeSportKeyForRoute(sportKey);
  const id = encodeURIComponent(canonicalizeTeamRouteId(sport, String(teamId || "").trim()));
  return `/sports/${sport}/team/${id}`;
}

/** Player profile URL: `/props/player/:sport/:playerId` (numeric ESPN athlete id only). */
export function buildPlayerRoute(sportKey: string, playerId: unknown): string {
  const id = canonicalPlayerIdQueryParam(playerId);
  if (!id) {
    throw new Error("buildPlayerRoute requires a numeric ESPN player id");
  }
  const sport = normalizeSportKeyForRoute(sportKey);
  return `/props/player/${sport}/${encodeURIComponent(id)}`;
}

export function logTeamNavigation(teamId: string, sportKey?: string): void {
  console.info("NAVIGATE_TEAM", { teamId: String(teamId || "").trim(), sportKey: normalizeSportKeyForRoute(String(sportKey || "")) });
}

export function logPlayerNavigation(playerId: string, sportKey?: string): void {
  console.info("NAVIGATE_PLAYER", { playerId: String(playerId || "").trim(), sportKey: normalizeSportKeyForRoute(String(sportKey || "")) });
}

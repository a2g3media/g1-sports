export function normalizeSportKeyForRoute(sportKey: string): string {
  const raw = String(sportKey || "").trim().toLowerCase();
  if (raw === "cbb") return "ncaab";
  if (raw === "cfb") return "ncaaf";
  return raw || "nba";
}

export function buildTeamRoute(sportKey: string, teamId: string): string {
  const sport = normalizeSportKeyForRoute(sportKey);
  const id = encodeURIComponent(String(teamId || "").trim());
  return `/sports/${sport}/team/${id}`;
}

export function buildPlayerRoute(sportKey: string, playerId: string): string {
  const sport = normalizeSportKeyForRoute(sportKey);
  const id = encodeURIComponent(String(playerId || "").trim());
  return `/sports/${sport}/player/${id}`;
}

export function logTeamNavigation(teamId: string, sportKey?: string): void {
  console.info("NAVIGATE_TEAM", { teamId: String(teamId || "").trim(), sportKey: normalizeSportKeyForRoute(String(sportKey || "")) });
}

export function logPlayerNavigation(playerId: string, sportKey?: string): void {
  console.info("NAVIGATE_PLAYER", { playerId: String(playerId || "").trim(), sportKey: normalizeSportKeyForRoute(String(sportKey || "")) });
}

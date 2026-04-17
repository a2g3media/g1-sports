import { enqueuePlayerDocumentBuild } from "./ingestion";

const PROFILE_SPORTS = new Set(["NBA", "NFL", "MLB", "NHL", "NCAAB", "GOLF"]);

function rosterRowPlayerId(row: any): string {
  const raw = row?.id ?? row?.playerId ?? row?.athleteId ?? row?.espnId ?? row?.athlete?.id;
  const s = String(raw ?? "").trim();
  return /^\d{3,}$/.test(s) ? s : "";
}

function rosterRowName(row: any): string {
  return String(
    row?.displayName
      || row?.name
      || row?.full_name
      || `${row?.firstName || ""} ${row?.lastName || ""}`
      || ""
  ).trim();
}

/**
 * Extract ESPN athlete ids from /api/teams/:sport/:id roster-shaped JSON.
 */
export function extractRosterPlayersForEnqueue(body: any): Array<{ playerId: string; name: string }> {
  const pools = [
    ...(Array.isArray(body?.roster) ? body.roster : []),
    ...(Array.isArray(body?.team?.roster) ? body.team.roster : []),
    ...(Array.isArray(body?.players) ? body.players : []),
    ...(Array.isArray(body?.team?.players) ? body.team.players : []),
  ];
  const out: Array<{ playerId: string; name: string }> = [];
  const seen = new Set<string>();
  for (const row of pools) {
    const playerId = rosterRowPlayerId(row);
    if (!playerId || seen.has(playerId)) continue;
    seen.add(playerId);
    const name = rosterRowName(row) || playerId;
    out.push({ playerId, name });
  }
  return out;
}

export async function enqueuePlayerDocumentsFromPropsRows(db: D1Database, rows: any[]): Promise<number> {
  let n = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    const sport = String(r?.sport || "").trim().toUpperCase();
    const id = String(r?.player_id || r?.playerId || "").trim();
    const name = String(r?.player_name || r?.playerName || "").trim();
    if (!sport || sport === "ALL" || !PROFILE_SPORTS.has(sport) || !/^\d{3,}$/.test(id)) continue;
    const k = `${sport}:${id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    await enqueuePlayerDocumentBuild(db, sport, id, name);
    n += 1;
  }
  return n;
}

export async function enqueuePlayerDocumentsFromTeamProfileJson(
  db: D1Database,
  sportUpper: string,
  profileJson: any
): Promise<number> {
  const sport = String(sportUpper || "").trim().toUpperCase();
  if (!sport || sport === "ALL" || !PROFILE_SPORTS.has(sport)) return 0;
  const tuples = extractRosterPlayersForEnqueue(profileJson);
  let n = 0;
  for (const t of tuples) {
    await enqueuePlayerDocumentBuild(db, sport, t.playerId, t.name);
    n += 1;
  }
  return n;
}

/** Map ESPN search league abbrev / slug to profile sport key. */
export function mapEspnSearchLeagueToProfileSport(leagueAbbrev: string): string | null {
  const raw = String(leagueAbbrev || "").trim();
  const u = raw.toUpperCase();
  const lower = raw.toLowerCase();
  if (u === "NBA" || lower.includes("basketball/nba")) return "NBA";
  if (u === "NFL" || lower.includes("football/nfl")) return "NFL";
  if (u === "MLB" || lower.includes("baseball/mlb")) return "MLB";
  if (u === "NHL" || lower.includes("hockey/nhl")) return "NHL";
  if (u === "NCAAB" || lower.includes("mens-college-basketball") || lower.includes("college-basketball"))
    return "NCAAB";
  if (u === "NCAAF" || lower.includes("college-football")) return null;
  if (PROFILE_SPORTS.has(u)) return u;
  return null;
}

export async function enqueuePlayerDocumentsFromSearchResults(
  db: D1Database,
  results: Array<{ espnId: string; displayName: string; sport: string }>,
  limit: number
): Promise<number> {
  let n = 0;
  const slice = results.slice(0, Math.max(0, limit));
  for (const r of slice) {
    const id = String(r?.espnId || "").trim();
    const name = String(r?.displayName || "").trim();
    const mapped = mapEspnSearchLeagueToProfileSport(r?.sport || "");
    if (!mapped || !/^\d{3,}$/.test(id)) continue;
    await enqueuePlayerDocumentBuild(db, mapped, id, name);
    n += 1;
  }
  return n;
}

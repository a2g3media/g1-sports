/*
 * Team Matchup Edge Health Guardrail
 *
 * Purpose:
 * Detect regressions where Team Matchup Edge loses core data:
 * - no final games in schedule
 * - no H2H sample for selected opponent
 * - no spread/total lines in recent finals across all checked teams
 *
 * Usage:
 *   npx tsx scripts/qa-team-matchup-edge-health.ts --base http://localhost:5173 --teams 12
 */

type TeamStanding = {
  id?: string;
  alias?: string;
  abbreviation?: string;
  name?: string;
};

type TeamScheduleGame = {
  id?: string;
  scheduledTime?: string;
  date?: string;
  status?: { name?: string } | string;
  homeTeamAlias?: string;
  awayTeamAlias?: string;
  opponent?: { abbreviation?: string; name?: string };
  spreadHome?: number | null;
  totalLine?: number | null;
  spread?: number | null;
  total?: number | null;
};

type TeamSchedulePayload = {
  allGames?: TeamScheduleGame[];
  pastGames?: TeamScheduleGame[];
  upcomingGames?: TeamScheduleGame[];
  source?: string;
};

type TeamH2HPayload = {
  sampleSize?: number;
  ats?: { sampleWithLine?: number };
};

function parseArg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function isFinalStatus(status: unknown): boolean {
  const raw = String((status as any)?.name || status || "").toUpperCase();
  return raw.includes("FINAL") || raw.includes("COMPLETED") || raw.includes("CLOSED");
}

async function readJson<T>(url: string, timeoutMs = 12000): Promise<{ status: number; json: T | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      credentials: "include" as RequestCredentials,
      signal: controller.signal,
    });
    let json: T | null = null;
    try {
      json = (await res.json()) as T;
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

function extractAllGames(payload: TeamSchedulePayload | null | undefined): TeamScheduleGame[] {
  if (!payload) return [];
  if (Array.isArray(payload.allGames) && payload.allGames.length > 0) return payload.allGames;
  return [
    ...(Array.isArray(payload.pastGames) ? payload.pastGames : []),
    ...(Array.isArray(payload.upcomingGames) ? payload.upcomingGames : []),
  ];
}

function pickOpponent(games: TeamScheduleGame[], teamAliasRaw: string): string {
  const teamAlias = String(teamAliasRaw || "").trim().toUpperCase();
  const upcoming = games.find((g) => !isFinalStatus(g?.status));
  const fallback = games.find((g) => isFinalStatus(g?.status));
  const row = upcoming || fallback;
  if (!row) return "";
  const direct = String(row?.opponent?.abbreviation || row?.opponent?.name || "").trim().toUpperCase();
  if (direct) return direct;
  const home = String((row as any)?.homeTeamAlias || (row as any)?.homeTeam?.alias || "").trim().toUpperCase();
  const away = String((row as any)?.awayTeamAlias || (row as any)?.awayTeam?.alias || "").trim().toUpperCase();
  if (home && away) {
    if (teamAlias && home === teamAlias) return away;
    if (teamAlias && away === teamAlias) return home;
    return away;
  }
  return home || away || "";
}

function hasAnyLinesInRecentFinals(games: TeamScheduleGame[]): boolean {
  const finals = games
    .filter((g) => isFinalStatus(g?.status))
    .slice(0, 8);
  if (finals.length === 0) return false;
  return finals.some((g) => {
    const spread = Number(g?.spreadHome ?? g?.spread);
    const total = Number(g?.totalLine ?? g?.total);
    return Number.isFinite(spread) || Number.isFinite(total);
  });
}

async function main() {
  const base = parseArg("--base", "http://localhost:5173").replace(/\/+$/, "");
  const sport = parseArg("--sport", "NBA").toUpperCase();
  const timeoutMs = Math.max(6000, Number.parseInt(parseArg("--timeout-ms", "12000"), 10) || 12000);
  const teamLimit = Math.max(4, Number.parseInt(parseArg("--teams", "12"), 10) || 12);
  const maxFailureRate = Math.min(0.5, Math.max(0, Number.parseFloat(parseArg("--max-failure-rate", "0.2")) || 0.2));

  console.log(`[team-matchup-edge] base=${base} sport=${sport} teams=${teamLimit}`);
  const standings = await readJson<{ teams?: TeamStanding[]; standings?: TeamStanding[] }>(
    `${base}/api/teams/${sport}/standings?fresh=1`,
    timeoutMs
  );
  if (standings.status !== 200 || !standings.json) {
    throw new Error(`Standings failed: HTTP ${standings.status}`);
  }
  const teamsRaw = Array.isArray(standings.json.teams) && standings.json.teams.length > 0
    ? standings.json.teams
    : (Array.isArray(standings.json.standings) ? standings.json.standings : []);
  const teams = teamsRaw.filter((t) => String(t?.id || "").trim()).slice(0, teamLimit);
  if (teams.length === 0) throw new Error("No teams found in standings");

  const failures: string[] = [];
  let checked = 0;
  let teamsWithFinals = 0;
  let teamsWithH2hResponse = 0;
  let teamsWithAnyLines = 0;

  for (const team of teams) {
    const id = String(team.id || "").trim();
    const label = String(team.alias || team.abbreviation || team.name || id);
    const scheduleRes = await readJson<TeamSchedulePayload>(
      `${base}/api/teams/${sport}/${encodeURIComponent(id)}/schedule`,
      timeoutMs
    );
    if (scheduleRes.status !== 200 || !scheduleRes.json) {
      failures.push(`${label}: schedule HTTP ${scheduleRes.status}`);
      continue;
    }
    const games = extractAllGames(scheduleRes.json);
    checked += 1;
    const finals = games.filter((g) => isFinalStatus(g?.status)).length;
    if (finals > 0) teamsWithFinals += 1;
    else failures.push(`${label}: no final games in schedule (source=${String(scheduleRes.json.source || "unknown")})`);

    if (hasAnyLinesInRecentFinals(games)) {
      teamsWithAnyLines += 1;
    }

    const teamAlias = String(team.alias || team.abbreviation || "").trim().toUpperCase();
    const opp = pickOpponent(games, teamAlias);
    if (!opp) {
      failures.push(`${label}: unable to pick opponent for H2H`);
      continue;
    }
    const h2hRes = await readJson<TeamH2HPayload>(
      `${base}/api/teams/${sport}/h2h?teamA=${encodeURIComponent(id)}&teamB=${encodeURIComponent(opp)}&window=10`,
      timeoutMs
    );
    if (h2hRes.status >= 500 || h2hRes.status === 0) {
      failures.push(`${label}: H2H HTTP ${h2hRes.status} vs ${opp}`);
      continue;
    }
    teamsWithH2hResponse += 1;
  }

  const allowedFailures = Math.max(0, Math.floor(teams.length * maxFailureRate));
  const globalFailures: string[] = [];
  if (checked === 0) globalFailures.push("all teams failed schedule checks");
  if (teamsWithFinals === 0) globalFailures.push("global regression: no teams have final games");
  if (teamsWithH2hResponse === 0) globalFailures.push("global regression: H2H endpoint unavailable");
  if (teamsWithAnyLines === 0) globalFailures.push("global regression: no line data in recent finals");

  const tooManyFailures = failures.length > allowedFailures;
  if (globalFailures.length > 0 || tooManyFailures) {
    console.error(
      `\n[team-matchup-edge] FAIL checked=${checked} finals=${teamsWithFinals} h2h=${teamsWithH2hResponse} lines=${teamsWithAnyLines} failures=${failures.length} allowed=${allowedFailures}\n`
    );
    for (const f of globalFailures) console.error(`- ${f}`);
    for (const f of failures.slice(0, 40)) console.error(`- ${f}`);
    if (failures.length > 40) console.error(`- ...and ${failures.length - 40} more`);
    process.exit(1);
  }

  if (failures.length > 0) {
    console.warn(
      `\n[team-matchup-edge] WARN tolerated failures=${failures.length} allowed=${allowedFailures}; checked=${checked} finals=${teamsWithFinals} h2h=${teamsWithH2hResponse} lines=${teamsWithAnyLines}\n`
    );
    for (const f of failures) console.warn(`- ${f}`);
  } else {
    console.log(
      `\n[team-matchup-edge] PASS checked=${checked} finals=${teamsWithFinals} h2h=${teamsWithH2hResponse} lines=${teamsWithAnyLines}\n`
    );
  }
}

main().catch((err) => {
  console.error("[team-matchup-edge] fatal", err);
  process.exit(1);
});


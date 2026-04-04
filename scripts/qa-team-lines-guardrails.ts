/*
 * Team Lines Guardrails QA
 *
 * Purpose:
 * Catch regressions where team schedule final games lose spread/total lines.
 *
 * Usage:
 *   npx tsx scripts/qa-team-lines-guardrails.ts --base http://localhost:5173
 *   npx tsx scripts/qa-team-lines-guardrails.ts --base https://<workers-dev-url>
 */

type TeamStanding = {
  id?: string;
  name?: string;
  abbreviation?: string;
};

type ScheduleGame = {
  status?: string | { name?: string };
  spreadHome?: number | null;
  totalLine?: number | null;
};

type TeamSchedulePayload = {
  allGames?: ScheduleGame[];
};

function parseArg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function isFinalish(status: unknown): boolean {
  const text = String((status as any)?.name || status || "").toUpperCase();
  return text.includes("FINAL") || text.includes("CLOSED") || text.includes("COMPLETED");
}

function hasLine(game: ScheduleGame): boolean {
  const spread = game?.spreadHome;
  const total = game?.totalLine;
  return (typeof spread === "number" && Number.isFinite(spread)) || (typeof total === "number" && Number.isFinite(total));
}

async function readJson<T>(url: string, timeoutMs = 30000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { credentials: "include" as RequestCredentials, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const base = parseArg("--base", "http://localhost:5173").replace(/\/+$/, "");
  const sport = parseArg("--sport", "NBA").toUpperCase();
  const teamLimit = Math.max(2, Number.parseInt(parseArg("--teams", "8"), 10) || 8);

  const standingsUrl = `${base}/api/teams/${sport}/standings`;
  const standingsJson = await readJson<{ standings?: TeamStanding[]; teams?: TeamStanding[] }>(standingsUrl);
  const standingsTeams = Array.isArray(standingsJson?.standings) ? standingsJson.standings : [];
  const rootTeams = Array.isArray(standingsJson?.teams) ? standingsJson.teams : [];
  const teams = (standingsTeams.length > 0 ? standingsTeams : rootTeams)
    .filter((t) => String(t?.id || "").trim().length > 0)
    .slice(0, teamLimit);

  if (teams.length === 0) {
    throw new Error("No teams found in standings");
  }

  let checked = 0;
  const failures: string[] = [];

  for (const team of teams) {
    const teamId = String(team.id || "").trim();
    const teamName = String(team.abbreviation || team.name || teamId);
    const scheduleUrl = `${base}/api/teams/${sport}/${encodeURIComponent(teamId)}/schedule?fresh=1`;
    let payload: TeamSchedulePayload;
    try {
      payload = await readJson<TeamSchedulePayload>(scheduleUrl);
    } catch (err) {
      failures.push(`${teamName}: schedule fetch failed (${String(err)})`);
      continue;
    }
    checked += 1;

    const finals = (Array.isArray(payload?.allGames) ? payload.allGames : []).filter((g) => isFinalish(g?.status)).slice(0, 8);
    if (finals.length === 0) {
      continue;
    }
    const withLine = finals.filter((g) => hasLine(g)).length;
    const ratio = withLine / finals.length;
    if (withLine === 0 || ratio < 0.4) {
      failures.push(`${teamName}: finals with lines ${withLine}/${finals.length}`);
    }
  }

  if (failures.length > 0) {
    console.error(`\n[team-lines-guardrails] FAIL (${failures.length} failures / ${checked} teams checked)\n`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`\n[team-lines-guardrails] PASS (${checked} teams checked)\n`);
}

main().catch((err) => {
  console.error("[team-lines-guardrails] fatal", err);
  process.exit(1);
});


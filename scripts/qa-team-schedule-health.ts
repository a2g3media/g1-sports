/*
 * Team Schedule Health Guardrail
 *
 * Purpose:
 * Ensure team schedule API is healthy across teams (no 500s / non-empty payloads).
 *
 * Usage:
 *   npx tsx scripts/qa-team-schedule-health.ts --base http://localhost:5173 --teams 30
 *   npx tsx scripts/qa-team-schedule-health.ts --base https://<workers-dev-url> --teams 30
 */

type TeamStanding = {
  id?: string;
  name?: string;
  abbreviation?: string;
  alias?: string;
};

type TeamSchedulePayload = {
  totalGames?: number;
  allGames?: unknown[];
  source?: string;
  error?: string;
};

function parseArg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

async function readJson<T>(url: string, timeoutMs = 45000): Promise<{ status: number; json: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { credentials: "include" as RequestCredentials, signal: controller.signal });
    const json = (await res.json()) as T;
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const base = parseArg("--base", "http://localhost:5173").replace(/\/+$/, "");
  const sport = parseArg("--sport", "NBA").toUpperCase();
  const teamLimit = Math.max(2, Number.parseInt(parseArg("--teams", "30"), 10) || 30);
  const timeoutMs = Math.max(10000, Number.parseInt(parseArg("--timeout-ms", "45000"), 10) || 45000);

  const standings = await readJson<{ teams?: TeamStanding[]; standings?: TeamStanding[] }>(
    `${base}/api/teams/${sport}/standings?fresh=1`
  );
  if (standings.status !== 200) {
    throw new Error(`Standings failed: HTTP ${standings.status}`);
  }

  const teams = (
    Array.isArray(standings.json?.teams) && standings.json.teams.length > 0
      ? standings.json.teams
      : (Array.isArray(standings.json?.standings) ? standings.json.standings : [])
  )
    .filter((t) => String(t?.id || "").trim().length > 0)
    .slice(0, teamLimit);

  if (teams.length === 0) throw new Error("No teams found in standings");

  const failures: string[] = [];
  let checked = 0;
  const concurrency = Math.max(2, Number.parseInt(parseArg("--concurrency", "8"), 10) || 8);
  const queue = [...teams];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const team = queue.shift();
      if (!team) return;
      const teamId = String(team.id || "").trim();
      const label = String(team.alias || team.abbreviation || team.name || teamId);
      try {
        let status = 0;
        let json: TeamSchedulePayload = {};
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const response = await readJson<TeamSchedulePayload>(
              `${base}/api/teams/${sport}/${encodeURIComponent(teamId)}/schedule?fresh=1`,
              timeoutMs
            );
            status = response.status;
            json = response.json;
            if (status === 200) break;
            // Retry transient server-side misses once or twice.
            await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          } catch (err) {
            lastError = err;
            await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          }
        }
        if (status === 0 && lastError) throw lastError;
        if (status !== 200) {
          failures.push(`${label}: HTTP ${status} ${String((json as any)?.error || "")}`.trim());
          continue;
        }
        const total = Number(json?.totalGames || (Array.isArray(json?.allGames) ? json.allGames.length : 0));
        if (!Number.isFinite(total) || total <= 0) {
          failures.push(`${label}: empty schedule payload (source=${String(json?.source || "unknown")})`);
          continue;
        }
        checked += 1;
      } catch (err) {
        failures.push(`${label}: request failed (${String(err)})`);
      }
    }
  });
  await Promise.all(workers);

  if (failures.length > 0) {
    console.error(`\n[team-schedule-health] FAIL (${failures.length} failures / ${checked} teams healthy)\n`);
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
  }

  console.log(`\n[team-schedule-health] PASS (${checked} teams healthy)\n`);
}

main().catch((err) => {
  console.error("[team-schedule-health] fatal", err);
  process.exit(1);
});

